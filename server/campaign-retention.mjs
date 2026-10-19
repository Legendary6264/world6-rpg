import {commitWorld} from './world-coordinator.mjs'
import {fail,id,integer,now,text,validId,world as validateWorld} from './validation.mjs'
import {requireCampaignEditor,requireLobbyPermission} from './permissions.mjs'
import {roundGeneration,controlsStamp} from './rounds.mjs'
import {roundBranch,setRoundBranch,hydrateRoundHistory} from './round-branch.mjs'
import {archiveHash} from './campaign-archive-format.mjs'
import {lineageAnchors,setLineageAnchors,retireCommands,rejectRetiredCommand,retentionBytes,MAX_ANCHORS,MAX_RETENTION_BYTES} from './campaign-retention-state.mjs'
const VERSION='r04-retention-v1'
const sum=rows=>rows.reduce((n,r)=>n+Number(r.payload_bytes),0)
const open=l=>{if(l.status==='closed')fail(409,'Лобби закрыто.')}
const stamp=s=>archiveHash(s)
function selection(v){
 if(!v||Array.isArray(v)||Object.keys(v).length!==6||typeof v.removeInactive!=='boolean')fail(400,'Проверь параметры очистки.')
 const ids=(value,max)=>{if(!Array.isArray(value)||value.length>max||new Set(value).size!==value.length)fail(400,'Некорректный выбор снимков.');value.forEach(validId);return [...value].sort()}
 return {keepActiveRounds:integer(v.keepActiveRounds,1,1000),keepChanges:integer(v.keepChanges,0,1000),keepArchivedCollections:integer(v.keepArchivedCollections,0,20),checkpointIds:ids(v.checkpointIds,20),recoveryIds:ids(v.recoveryIds,100),removeInactive:v.removeInactive}
}
async function capture(tx,lobby){
 const generation=await roundGeneration(tx,lobby.id),branch=await roundBranch(tx,lobby.id,generation);await hydrateRoundHistory(tx,lobby.id)
 const rounds=await tx.all('SELECT r.id,r.collection_id,r.command_key,r.payload_bytes,h.applied_revision,h.applied_at FROM round_receipts r JOIN round_history_data h ON h.receipt_id=r.id WHERE r.lobby_id=? ORDER BY h.applied_revision,r.id',[lobby.id])
 if(branch.some(id=>!rounds.some(r=>r.id===id)))fail(409,'Ветка содержит неизвестные раунды. Очистка недоступна.')
 const changes=await tx.all('SELECT id,command_key,payload_bytes,receipt_json FROM round_change_receipts WHERE lobby_id=? ORDER BY id',[lobby.id]),points=await tx.all('SELECT id,name,command_key,payload_bytes,branch_json,replay_json FROM campaign_checkpoints WHERE lobby_id=? ORDER BY id',[lobby.id]),recoveries=await tx.all('SELECT id,command_key,payload_bytes,receipt_json FROM campaign_archive_receipts WHERE lobby_id=? ORDER BY id',[lobby.id])
 const pending=[];for(const table of ['round_previews','round_change_previews','campaign_archive_previews'])pending.push(...(await tx.all('SELECT id,payload_bytes FROM '+table+' WHERE lobby_id=? ORDER BY id',[lobby.id])).map(r=>({...r,table})))
 return {generation,branch,anchors:await lineageAnchors(tx,lobby.id,generation),rounds,changes,points,recoveries,pending,replay:await tx.get('SELECT receipt_id,generation,world_hash FROM round_replay_contexts WHERE lobby_id=?',[lobby.id])??null,worldHash:archiveHash(lobby.world_json)}
}
function derive(s,v,world){
 for(const [selected,available] of [[v.checkpointIds,s.points],[v.recoveryIds,s.recoveries]])if(selected.some(id=>!available.some(r=>r.id===id)))fail(409,'Выбранная копия уже отсутствует. Обнови список.')
 const roots=new Map(),protect=(id,reason)=>roots.set(id,[...(roots.get(id)??[]),reason])
 for(const point of s.points.filter(p=>!v.checkpointIds.includes(p.id))){JSON.parse(point.branch_json).forEach(id=>protect(id,'Точка «'+point.name+'»'));if(point.replay_json)protect(JSON.parse(point.replay_json).receiptId,'Переигровка точки «'+point.name+'»')}
 if(s.replay?.generation===s.generation)protect(s.replay.receipt_id,'Текущая переигровка с прежними бросками')
 const prefix=s.branch.slice(0,Math.max(0,s.branch.length-v.keepActiveRounds)),firstBlock=prefix.findIndex(id=>roots.has(id)),compacted=firstBlock<0?prefix:prefix.slice(0,firstBlock),blocked=prefix.slice(compacted.length).map(id=>({id,reasons:roots.get(id)??['После защищённого раунда: сокращается только непрерывная ранняя часть']}))
 const inactive=v.removeInactive?s.rounds.filter(r=>!s.branch.includes(r.id)&&!roots.has(r.id)).map(r=>r.id):[]
 const deletedRounds=s.rounds.filter(r=>compacted.includes(r.id)||inactive.includes(r.id)),orderedChanges=s.changes.toSorted((a,b)=>JSON.parse(a.receipt_json).revision-JSON.parse(b.receipt_json).revision),deletedChanges=orderedChanges.slice(0,Math.max(0,orderedChanges.length-v.keepChanges)),deletedPoints=s.points.filter(p=>v.checkpointIds.includes(p.id)),deletedRecoveries=s.recoveries.filter(r=>v.recoveryIds.includes(r.id))
 const anchors=[...new Set([...s.anchors,...s.rounds.filter(r=>compacted.includes(r.id)).map(r=>r.collection_id)])]
 if(anchors.length>MAX_ANCHORS)fail(409,'Сокращённая история достигла предела 20000 сборов. Данные не удалены.')
 const archive=world.campaign.declarations?.archive??[],removedCollections=archive.slice(0,Math.max(0,archive.length-v.keepArchivedCollections)).map(c=>({id:c.id,scene:c.sceneName}))
 const protectedInactive=v.removeInactive?s.rounds.filter(r=>!s.branch.includes(r.id)&&roots.has(r.id)).map(r=>({id:r.id,reasons:roots.get(r.id)})):[]
 const summary={rounds:deletedRounds.map(r=>({id:r.id,revision:r.applied_revision})),compactedRounds:compacted.length,retainedActiveRounds:s.branch.length-compacted.length,anchorCount:anchors.length,changes:deletedChanges.length,checkpoints:deletedPoints.map(p=>({id:p.id,name:p.name})),recoveries:deletedRecoveries.map(r=>({id:r.id,reason:JSON.parse(r.receipt_json).reason})),removedCollections,discardedCalculations:s.pending.length,blocked:[...blocked,...protectedInactive],freed:{history:sum(deletedRounds)+sum(deletedChanges),checkpoints:sum(deletedPoints),recoveries:sum(deletedRecoveries),calculations:sum(s.pending)}}
 return {summary,anchors,compacted,deletedRounds,deletedChanges,deletedPoints,deletedRecoveries}
}
export function campaignRetentionRoutes(app,{db,auth,updated,lockedMembership,record}){
 app.get('/api/lobbies/:id/storage',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{const {lobby,member}=await lockedMembership(tx,req);requireLobbyPermission(member,'viewSecrets');const s=await capture(tx,lobby),world=JSON.parse(lobby.world_json)
   return {revision:lobby.revision,generation:s.generation,storageStamp:stamp(s),activeRounds:s.branch.length,compactedCollections:s.anchors.length,archivedCollections:world.campaign.declarations?.archive.length??0,
    meters:[{name:'История раундов и изменений',bytes:sum(s.rounds)+sum(s.changes),limitBytes:64*1024*1024,count:s.rounds.length+s.changes.length,limitCount:1000},{name:'Именованные точки',bytes:sum(s.points),limitBytes:32*1024*1024,count:s.points.length,limitCount:20},{name:'Защитные копии',bytes:sum(s.recoveries),limitBytes:64*1024*1024,count:s.recoveries.length,limitCount:100},{name:'Ожидающие игровые расчёты',bytes:sum(s.pending.filter(p=>p.table!=='campaign_archive_previews')),limitBytes:32*1024*1024},{name:'Ожидающие восстановления',bytes:sum(s.pending.filter(p=>p.table==='campaign_archive_previews')),limitBytes:96*1024*1024},{name:'Реестр выполненных команд',bytes:await retentionBytes(tx,lobby.id),limitBytes:MAX_RETENTION_BYTES}],
    checkpoints:s.points.map(p=>({id:p.id,name:p.name,dependencies:JSON.parse(p.branch_json).length+(p.replay_json?1:0)})),recoveries:s.recoveries.map(r=>{const v=JSON.parse(r.receipt_json);return {id:r.id,at:v.appliedAt,reason:v.reason}})}
  });res.json(result)
 })
 app.post('/api/lobbies/:id/storage/calculate',auth.middleware,async(req,res)=>{
  const b=req.body;if(!b||Array.isArray(b)||Object.keys(b).length!==3||typeof b.storageStamp!=='string')fail(400,'Проверь запрос очистки.');const v=selection(b.selection),revision=integer(b.revision)
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireCampaignEditor(member);open(lobby);const s=await capture(tx,lobby)
   if(lobby.revision!==revision||b.storageStamp!==stamp(s))fail(409,'Мир, расчёты или история изменились. Обнови объём хранения.')
   const p=derive(s,v,JSON.parse(lobby.world_json)),previewId=id(),selectionJson=JSON.stringify(v),summaryJson=JSON.stringify(p.summary),bytes=Buffer.byteLength(selectionJson+summaryJson)
   await tx.run('DELETE FROM campaign_cleanup_previews WHERE lobby_id=? AND (author_id=? OR base_revision<>?)',[lobby.id,req.user.id,lobby.revision]);const size=await tx.get('SELECT COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_cleanup_previews WHERE lobby_id=?',[lobby.id])
   if(Number(size.bytes)+bytes>8*1024*1024)fail(409,'Ожидающие предпросмотры очистки достигли 8 МиБ.')
   await tx.run('INSERT INTO campaign_cleanup_previews(id,lobby_id,author_id,generation,base_revision,controls_stamp,storage_stamp,executor_version,selection_json,summary_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[previewId,lobby.id,req.user.id,s.generation,lobby.revision,await controlsStamp(tx,lobby.id),stamp(s),VERSION,selectionJson,summaryJson,bytes])
   return {id:previewId,revision:lobby.revision,generation:s.generation,summary:p.summary}
  });res.json(result)
 })
 app.post('/api/lobbies/:id/storage/apply',auth.middleware,async(req,res)=>{
  const b=req.body;if(!b||Array.isArray(b)||Object.keys(b).length!==4||typeof b.previewId!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(b.previewId)||typeof b.commandKey!=='string'||!/^[a-zA-Z0-9_-]{8,160}$/.test(b.commandKey))fail(400,'Проверь команду очистки.');const generation=integer(b.generation,1),reason=text(b.reason,1000),hash=archiveHash([b.previewId,generation,reason])
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireCampaignEditor(member)
   const old=await tx.get('SELECT * FROM campaign_cleanup_receipts WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey]);if(old){if(old.author_id!==req.user.id||old.request_hash!==hash||old.generation!==await roundGeneration(tx,lobby.id))fail(409,'Ключ относится к другому запросу или продолжению.');return {receipt:JSON.parse(old.receipt_json),duplicate:true}}
   await rejectRetiredCommand(tx,lobby.id,b.commandKey);for(const table of ['round_receipts','round_change_receipts','campaign_checkpoints','campaign_archive_receipts'])if(await tx.get('SELECT id FROM '+table+' WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey]))fail(409,'Ключ уже связан с другой командой.')
   open(lobby);const p=await tx.get('SELECT * FROM campaign_cleanup_previews WHERE lobby_id=? AND id=? AND author_id=?',[lobby.id,b.previewId,req.user.id]),s=await capture(tx,lobby)
   if(!p||p.generation!==generation||generation!==s.generation||p.base_revision!==lobby.revision||p.executor_version!==VERSION||p.controls_stamp!==await controlsStamp(tx,lobby.id)||p.storage_stamp!==stamp(s))fail(409,'Предпросмотр очистки устарел. Проверь зависимости заново.')
   const v=selection(JSON.parse(p.selection_json)),world=JSON.parse(lobby.world_json),plan=derive(s,v,world)
   if(!plan.deletedRounds.length&&!plan.deletedChanges.length&&!plan.deletedPoints.length&&!plan.deletedRecoveries.length&&!plan.summary.removedCollections.length&&!s.pending.length)fail(409,'Выбранные данные защищены или освобождать нечего.')
   await retireCommands(tx,lobby.id,[...plan.deletedRounds.map(r=>({...r,kind:'round'})),...plan.deletedChanges.map(r=>({...r,kind:'change'})),...plan.deletedPoints.map(r=>({...r,kind:'checkpoint'})),...plan.deletedRecoveries.map(r=>({...r,kind:'archive'}))])
   for(const table of ['round_previews','round_change_previews','campaign_archive_previews'])await tx.run('DELETE FROM '+table+' WHERE lobby_id=?',[lobby.id])
   const remove=async(table,rows)=>{for(const r of rows)await tx.run('DELETE FROM '+table+' WHERE lobby_id=? AND id=?',[lobby.id,r.id])}
   await remove('campaign_checkpoints',plan.deletedPoints);await remove('round_change_receipts',plan.deletedChanges);await remove('campaign_archive_receipts',plan.deletedRecoveries);await remove('round_receipts',plan.deletedRounds)
   for(const [kind,rows] of [['round',plan.deletedRounds],['change',plan.deletedChanges],['checkpoint',plan.deletedPoints]])for(const r of rows)await tx.run('DELETE FROM campaign_archive_origins WHERE lobby_id=? AND kind=? AND record_id=?',[lobby.id,kind,r.id])
   await setRoundBranch(tx,lobby.id,generation,s.branch.filter(id=>!plan.compacted.includes(id)));await setLineageAnchors(tx,lobby.id,generation,plan.anchors)
   let json=lobby.world_json
   if(plan.summary.removedCollections.length){
    const d=world.campaign.declarations
    for(const scene of world.campaign.scenes?.scenes??[]){const old=d.archive.find(c=>c.sceneId===scene.id)??(d.active?.sceneId===scene.id?d.active:null);if(scene.roundDurationSeconds===undefined&&old)scene.roundDurationSeconds=old.durationSeconds}
    d.archive=v.keepArchivedCollections===0?[]:d.archive.slice(-v.keepArchivedCollections);world.campaign.revision++;json=JSON.stringify(validateWorld(world))
    // Trimming only declaration archives keeps an otherwise unchanged replay usable.
    if(s.replay?.generation===generation&&s.replay.world_hash===archiveHash(lobby.world_json))await tx.run('UPDATE round_replay_contexts SET world_hash=? WHERE lobby_id=?',[archiveHash(json),lobby.id])
   }
   const summary={roundIds:plan.summary.rounds.map(r=>r.id),compactedRounds:plan.summary.compactedRounds,retainedActiveRounds:plan.summary.retainedActiveRounds,anchorCount:plan.summary.anchorCount,changes:plan.summary.changes,checkpointIds:plan.summary.checkpoints.map(p=>p.id),recoveryIds:plan.summary.recoveries.map(r=>r.id),removedCollectionIds:plan.summary.removedCollections.map(c=>c.id),discardedCalculations:plan.summary.discardedCalculations,protectedRounds:plan.summary.blocked.length,freed:plan.summary.freed}
   const receipt={id:id(),revision:lobby.revision+1,generation,appliedAt:now(),reason,summary},receiptJson=JSON.stringify(receipt),bytes=Buffer.byteLength(receiptJson)
   if(await retentionBytes(tx,lobby.id)+bytes>MAX_RETENTION_BYTES)fail(409,'Реестр выполненных команд достиг предела 16 МиБ.')
   await tx.run('INSERT INTO campaign_cleanup_receipts(id,lobby_id,author_id,command_key,request_hash,generation,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?)',[receipt.id,lobby.id,req.user.id,b.commandKey,hash,generation,receiptJson,bytes])
   await commitWorld(tx,lobby,json,{at:receipt.appliedAt});await tx.run('DELETE FROM campaign_cleanup_previews WHERE lobby_id=?',[lobby.id]);await record(tx,req,'cleanup-campaign-history');return {receipt,duplicate:false}
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
}
