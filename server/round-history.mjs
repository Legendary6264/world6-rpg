import {editedReplayRoutes,setReplayContext,replayContext} from './edited-round-replay.mjs'
import {lineageAnchors,setLineageAnchors,checkpointAnchors,setCheckpointAnchors,rejectRetiredCommand} from './campaign-retention-state.mjs'
import {createHash} from 'node:crypto'
import {fail,id,integer,now,text,validId,world as validateWorld} from './validation.mjs'
import {requireLobbyPermission} from './permissions.mjs'
import {hasLobbyPermission} from './generated/lobbyAccess.mjs'
import {cancelPendingActions} from './generated/roundCancellation.mjs'
import {ROUND_EXECUTOR_VERSION,compatibleRoundExecutor} from './generated/roundExecution.mjs'
import {roundGeneration,invalidateRoundGeneration,controlsStamp,checkHistorySpace,checkPreviewSpace,createRoundCalculation} from './rounds.mjs'
import {activeRoundRows,roundBranch,setRoundBranch,collectionExecuted,campaignSession} from './round-branch.mjs'
const VERSION='r04-branch-checkpoints-v3:'+ROUND_EXECUTOR_VERSION
const master=m=>{requireLobbyPermission(m,'rounds');requireLobbyPermission(m,'viewSecrets')}
const fingerprint=s=>createHash('sha256').update(typeof s==='string'?s:JSON.stringify(s)).digest('hex')
const open=l=>{if(l.status==='closed')fail(409,'Лобби закрыто.')}
function roster(current,target,bindings){
 if(current.characters.length!==target.characters.length||target.characters.some(c=>!current.characters.some(a=>a.id===c.id)||!bindings.some(b=>b.character_id===c.id)))fail(409,'Состав листов или привязки героев изменились. Этот откат не заменяет владельцев и не удаляет новых героев.')
}
function rollbackSummary(current,target,receipt,reason,revision){
 const labels={body:'тело',resources:'ресурсы',rpg:'инвентарь, заряды и эффекты',knowledge:'заметки и знания',journal:'заметки и знания',knownEffects:'известные эффекты',profile:'профиль',attributes:'характеристики',statistics:'расчётные параметры',name:'имя'}
 const characters=target.characters.flatMap(c=>{const a=current.characters.find(a=>a.id===c.id),fields=[...new Set([...Object.keys(c),...Object.keys(a)])].filter(k=>k!=='id'&&JSON.stringify(c[k])!==JSON.stringify(a[k])).map(k=>labels[k]??k);return fields.length?[{actorId:c.id,name:c.name,fields}]:[]})
 const sections={scenes:'сцены и позиции',perceptions:'раскрытые сведения',declarations:'заявления и их история',roundWork:'переносимая очередь',logs:'журнал мира',abilities:'шаблоны способностей',items:'шаблоны предметов',anatomies:'анатомии',seconds:'игровое время'}
 return {operation:'rollback',reason,receiptId:receipt.id,fromSeconds:current.campaign.seconds,toSeconds:target.campaign.seconds,characters,sections:[...new Set([...Object.keys(current.campaign),...Object.keys(target.campaign)])].filter(k=>k!=='revision'&&JSON.stringify(current.campaign[k])!==JSON.stringify(target.campaign[k])).map(k=>sections[k]??k),includesLaterChanges:revision>receipt.applied_revision,canReplay:!!receipt.input_json&&!!receipt.execution_seed&&compatibleRoundExecutor(receipt.executor_version)}
}
async function branchContainsCollection(tx,lobbyId,ids,collectionId){
 if(!ids.length)return false
 return !!await tx.get('SELECT id FROM round_receipts WHERE lobby_id=? AND collection_id=? AND id IN ('+ids.map(()=>'?').join(',')+')',[lobbyId,collectionId,...ids])
}
const checkpointView=p=>({id:p.id,name:p.name,created_at:p.created_at,author_id:p.author_id,source_revision:p.source_revision})
export function roundHistoryRoutes(app,{db,auth,updated,lockedMembership,record}){
 editedReplayRoutes(app,{db,auth,lockedMembership})
 app.post('/api/lobbies/:id/rounds/checkpoints',auth.middleware,async(req,res)=>{
  const b=req.body;if(!b||Array.isArray(b)||Object.keys(b).length!==3||typeof b.commandKey!=='string'||!/^[a-zA-Z0-9_-]{8,160}$/.test(b.commandKey))fail(400,'Проверь команду контрольной точки.')
  const name=text(b.name,80),revision=integer(b.revision),hash=fingerprint([revision,name])
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   await rejectRetiredCommand(tx,lobby.id,b.commandKey)
   const previous=await tx.get('SELECT * FROM campaign_checkpoints WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey])
   if(previous){if(previous.author_id!==req.user.id||previous.request_hash!==hash)fail(409,'Ключ уже связан с другой командой.');return {checkpoint:checkpointView(previous),duplicate:true}}
   open(lobby);if(lobby.revision!==revision)fail(409,'Кампания изменилась. Обнови историю перед сохранением.')
   for(const table of ['round_receipts','round_change_receipts','campaign_archive_receipts'])if(await tx.get('SELECT id FROM '+table+' WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey]))fail(409,'Ключ уже связан с другой командой.')
   const generation=await roundGeneration(tx,lobby.id),branchJson=JSON.stringify(await roundBranch(tx,lobby.id,generation)),ctx=await replayContext(tx,lobby),anchors=await lineageAnchors(tx,lobby.id,generation)
   const replayData=ctx?await tx.get('SELECT input_json,execution_seed,executor_version FROM round_history_data WHERE receipt_id=? AND lobby_id=?',[ctx.receipt_id,lobby.id]):null
   const replayJson=ctx&&replayData?.input_json&&replayData.execution_seed&&compatibleRoundExecutor(replayData.executor_version)?JSON.stringify({receiptId:ctx.receipt_id,exact:ctx.world_hash===fingerprint(lobby.world_json)}):null,bytes=Buffer.byteLength(lobby.world_json+branchJson+(replayJson??'')+name+JSON.stringify(anchors))
   const size=await tx.get('SELECT COUNT(*) AS n,COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_checkpoints WHERE lobby_id=?',[lobby.id])
   if(Number(size.n)>=20||Number(size.bytes)+bytes>32*1024*1024)fail(409,'Достигнут предел контрольных точек: 20 точек или 32 МиБ. Существующие снимки сохранены.')
   const p={id:id(),name,created_at:now(),author_id:req.user.id,source_revision:revision}
   await tx.run('INSERT INTO campaign_checkpoints(id,lobby_id,author_id,command_key,request_hash,name,created_at,source_generation,source_revision,world_json,branch_json,replay_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[p.id,lobby.id,req.user.id,b.commandKey,hash,name,p.created_at,generation,revision,lobby.world_json,branchJson,replayJson,bytes])
   await setCheckpointAnchors(tx,lobby.id,p.id,anchors)
   await record(tx,req,'save-checkpoint');return {checkpoint:p,duplicate:false}
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
 app.post('/api/lobbies/:id/rounds/pause',auth.middleware,async(req,res)=>{
  const b=req.body;if(!b||Array.isArray(b)||Object.keys(b).length!==4||typeof b.paused!=='boolean'||typeof b.commandKey!=='string'||!/^[a-zA-Z0-9_-]{8,160}$/.test(b.commandKey))fail(400,'Проверь команду паузы.')
  const reason=text(b.reason,1000),revision=integer(b.revision),hash=fingerprint([revision,b.paused,reason])
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member);const generation=await roundGeneration(tx,lobby.id)
   await rejectRetiredCommand(tx,lobby.id,b.commandKey)
   const previous=await tx.get('SELECT * FROM round_change_receipts WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey])
   if(previous){if(previous.author_id!==req.user.id||previous.request_hash!==hash||previous.result_generation!==generation)fail(409,'Команда относится к другому запросу или продолжению.');return {receipt:JSON.parse(previous.receipt_json),duplicate:true}}
   open(lobby);if(lobby.revision!==revision)fail(409,'Кампания изменилась. Обнови историю перед паузой.')
   for(const table of ['round_receipts','campaign_checkpoints','campaign_archive_receipts'])if(await tx.get('SELECT id FROM '+table+' WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey]))fail(409,'Ключ уже связан с другой командой.')
   const at=now(),receipt={id:id(),revision:revision+1,generation,appliedAt:at,summary:{operation:'pause',paused:b.paused,reason}},json=JSON.stringify(receipt),bytes=Buffer.byteLength(lobby.world_json+json)
   await checkHistorySpace(tx,lobby.id,bytes)
   await tx.run('INSERT INTO round_change_receipts(id,lobby_id,author_id,command_key,request_hash,result_generation,before_json,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?)',[receipt.id,lobby.id,req.user.id,b.commandKey,hash,generation,lobby.world_json,json,bytes])
   await tx.run('INSERT INTO campaign_sessions(lobby_id,paused,changed_at,author_id,reason) VALUES(?,?,?,?,?) ON CONFLICT(lobby_id) DO UPDATE SET paused=excluded.paused,changed_at=excluded.changed_at,author_id=excluded.author_id,reason=excluded.reason',[lobby.id,b.paused?1:0,at,req.user.id,reason])
   await tx.run('UPDATE lobbies SET revision=revision+1,updated_at=? WHERE id=?',[at,lobby.id]);await record(tx,req,b.paused?'pause-campaign':'resume-campaign')
   await tx.run('DELETE FROM round_previews WHERE lobby_id=?',[lobby.id]);await tx.run('DELETE FROM round_change_previews WHERE lobby_id=?',[lobby.id]);return {receipt,duplicate:false}
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
 app.get('/api/lobbies/:id/rounds/history',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   const generation=await roundGeneration(tx,lobby.id),rounds=await activeRoundRows(tx,lobby.id,generation),last=rounds.at(-1),context=await tx.get('SELECT * FROM round_replay_contexts WHERE lobby_id=?',[lobby.id])
   const rows=rounds.toReversed().map(({id,author_id,collection_id,applied_revision,applied_at,imported_author})=>({id,author_id,collection_id,applied_revision,applied_at,imported_author}))
   const checkpoints=await tx.all('SELECT id,name,created_at,author_id,source_revision FROM campaign_checkpoints WHERE lobby_id=? ORDER BY created_at DESC,id DESC',[lobby.id])
   const state=JSON.parse(lobby.world_json),binding=await tx.all('SELECT character_id FROM character_bindings WHERE lobby_id=?',[lobby.id])
   const c=state.campaign.declarations?.active,executed=!!(c&&await collectionExecuted(tx,lobby.id,generation,c.id))
   const replay=context&&context.generation===generation&&context.world_hash===fingerprint(lobby.world_json)?await tx.get('SELECT receipt_id,input_json,execution_seed,executor_version FROM round_history_data WHERE receipt_id=? AND lobby_id=?',[context.receipt_id,lobby.id]):null
   return {revision:lobby.revision,generation,session:await campaignSession(tx,lobby.id),compactedCollections:(await lineageAnchors(tx,lobby.id,generation)).length,checkpoints,actors:state.characters.map(a=>({id:a.id,name:a.name})),closed:lobby.status==='closed',canRollback:hasLobbyPermission(member.role,member.permissions,'rollback'),latestId:last?.id??null,rounds:rows,replay:replay?.input_json&&replay.execution_seed&&compatibleRoundExecutor(replay.executor_version)?{receiptId:replay.receipt_id,parameters:JSON.parse(replay.input_json)}:null,
    work:(state.campaign.roundWork?.entries??[]).map(e=>({id:e.id,actorId:e.actorId,name:state.characters.find(c=>c.id===e.actorId)?.name??'Герой',kind:e.action.kind})),declarations:!executed?(c?.entries??[]).filter(e=>e.status==='submitted'&&binding.some(b=>b.character_id===e.actorId)).map(e=>({actorId:e.actorId,name:e.actorName,count:e.actions.length})):[]}
  });res.json(result)
 })
 for(const operation of ['cancel','rollback']){
  app.post('/api/lobbies/:id/rounds/'+operation+'/calculate',auth.middleware,async(req,res)=>{
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))fail(400,'Передай параметры изменения истории.')
   const result=await db.transaction(async tx=>{
    const {lobby,member}=await lockedMembership(tx,req);master(member);if(operation==='rollback')requireLobbyPermission(member,'rollback');open(lobby)
    if(lobby.revision!==integer(req.body.revision))fail(409,'Кампания изменилась. Обнови историю.')
    const reason=text(req.body.reason,1000),generation=await roundGeneration(tx,lobby.id),previewId=id(),state=JSON.parse(lobby.world_json);let candidate,summary,targetId=null
    if(operation==='cancel'){
     const c=state.campaign.declarations?.active,executed=!!(c&&await collectionExecuted(tx,lobby.id,generation,c.id))
     try{const result=cancelPendingActions(state,{workIds:req.body.workIds,actorIds:req.body.actorIds,reason},previewId,req.user.id,now(),executed);candidate=validateWorld(result.world);summary=result.summary}catch(e){fail(400,e.message)}
    }else{
     const rounds=await activeRoundRows(tx,lobby.id,generation),bindings=await tx.all('SELECT character_id FROM character_bindings WHERE lobby_id=?',[lobby.id]);let branch,sourceRevision,anchors=await lineageAnchors(tx,lobby.id,generation)
     if(req.body.checkpointId!==undefined){
      if(req.body.receiptId!==undefined)fail(400,'Выбери раунд или контрольную точку.')
      const checkpoint=await tx.get('SELECT * FROM campaign_checkpoints WHERE id=? AND lobby_id=?',[validId(req.body.checkpointId),lobby.id])
      if(!checkpoint)fail(404,'Контрольная точка не найдена.')
      candidate=validateWorld(JSON.parse(checkpoint.world_json));branch=JSON.parse(checkpoint.branch_json);sourceRevision=checkpoint.source_revision
      summary=rollbackSummary(state,candidate,{id:checkpoint.id,applied_revision:sourceRevision},reason,lobby.revision)
      anchors=await checkpointAnchors(tx,lobby.id,checkpoint.id);summary.checkpointId=checkpoint.id;summary.checkpointName=checkpoint.name;summary.canReplay=!!checkpoint.replay_json
     }else{
      targetId=validId(req.body.receiptId);const target=rounds.find(r=>r.id===targetId),index=rounds.findIndex(r=>r.id===targetId)
      if(!target)fail(409,'Раунд не входит в действующую ветку истории.')
      const receipt=await tx.get('SELECT before_json FROM round_receipts WHERE id=? AND lobby_id=?',[targetId,lobby.id]);candidate=validateWorld(JSON.parse(receipt.before_json));branch=rounds.slice(0,index).map(r=>r.id);sourceRevision=target.applied_revision
      summary=rollbackSummary(state,candidate,target,reason,lobby.revision)
     }
     roster(state,candidate,bindings)
     if(lobby.energy!=='any'&&candidate.characters.some(c=>c.profile.energy!==lobby.energy))fail(409,'Снимок не соответствует текущему типу энергии лобби.')
     summary.removedRounds=rounds.filter(r=>!branch.includes(r.id)).map(({id,applied_revision,applied_at})=>({id,revision:applied_revision,appliedAt:applied_at}))
     summary.restoredRoundIds=branch.filter(id=>!rounds.some(r=>r.id===id))
     const changes=await tx.all('SELECT id,receipt_json FROM round_change_receipts WHERE lobby_id=? ORDER BY id',[lobby.id])
     summary.affectedChanges=changes.map(r=>({id:r.id,...JSON.parse(r.receipt_json)})).filter(r=>r.revision>sourceRevision&&r.summary.operation!=='pause').map(r=>({id:r.id,revision:r.revision,operation:r.summary.operation,reason:r.summary.reason})).sort((a,b)=>a.revision-b.revision)
     if(candidate.campaign.declarations?.active&&!anchors.includes(candidate.campaign.declarations.active.id)&&!await branchContainsCollection(tx,lobby.id,branch,candidate.campaign.declarations.active.id)){candidate.campaign.declarations.active.id=id();candidate.campaign.declarations.active.epoch++;if(candidate.campaign.declarations.active.epoch>1e9)fail(409,'Исчерпана версия сбора.')}
     candidate.campaign.revision=state.campaign.revision+1;candidate=validateWorld(candidate)
    }
    const worldJson=JSON.stringify(candidate),summaryJson=JSON.stringify(summary),bytes=Buffer.byteLength(worldJson+summaryJson)
    await checkPreviewSpace(tx,lobby,req.user.id,bytes)
    await tx.run('INSERT INTO round_change_previews(id,lobby_id,author_id,generation,base_revision,controls_stamp,operation,executor_version,world_json,summary_json,target_receipt_id,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[previewId,lobby.id,req.user.id,generation,lobby.revision,await controlsStamp(tx,lobby.id),operation,VERSION,worldJson,summaryJson,targetId,bytes])
    return {id:previewId,revision:lobby.revision,generation,summary}
   });res.json(result)
  })
 }
 app.post('/api/lobbies/:id/rounds/change/apply',auth.middleware,async(req,res)=>{
  const body=req.body
  if(!body||Object.keys(body).length!==3||typeof body.previewId!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(body.previewId)||typeof body.commandKey!=='string'||!/^[a-zA-Z0-9_-]{8,160}$/.test(body.commandKey))fail(400,'Проверь команду изменения истории.')
  const generation=integer(body.generation),hash=fingerprint([body.previewId,generation])
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   await rejectRetiredCommand(tx,lobby.id,body.commandKey)
   const previous=await tx.get('SELECT * FROM round_change_receipts WHERE lobby_id=? AND command_key=?',[lobby.id,body.commandKey])
   if(previous){const receipt=JSON.parse(previous.receipt_json);if(receipt.summary.operation==='rollback')requireLobbyPermission(member,'rollback');if(previous.author_id!==req.user.id||previous.request_hash!==hash||previous.result_generation!==await roundGeneration(tx,lobby.id))fail(409,'Команда относится к другому запросу или продолжению кампании.');return {receipt,duplicate:true}}
   if(await tx.get('SELECT id FROM campaign_archive_receipts WHERE lobby_id=? AND command_key=?',[lobby.id,body.commandKey]))fail(409,'Ключ уже связан с восстановлением полной копии.')
   if(await tx.get('SELECT id FROM campaign_checkpoints WHERE lobby_id=? AND command_key=?',[lobby.id,body.commandKey]))fail(409,'Этот ключ уже связан с контрольной точкой.')
   if(await tx.get('SELECT id FROM round_receipts WHERE lobby_id=? AND command_key=?',[lobby.id,body.commandKey]))fail(409,'Этот ключ уже связан с применением раунда.')
   if(generation!==await roundGeneration(tx,lobby.id))fail(409,'Команда относится к прежнему продолжению кампании.');open(lobby)
   const p=await tx.get('SELECT * FROM round_change_previews WHERE id=? AND lobby_id=? AND author_id=?',[body.previewId,lobby.id,req.user.id])
   if(!p||p.generation!==generation||p.executor_version!==VERSION)fail(409,'Предпросмотр недоступен. Подготовь его заново.')
   if(p.operation==='rollback')requireLobbyPermission(member,'rollback')
   if(p.base_revision!==lobby.revision||p.controls_stamp!==await controlsStamp(tx,lobby.id))fail(409,'Мир или управление изменились. Подготовь предпросмотр заново.')
   const candidate=validateWorld(JSON.parse(p.world_json));if(lobby.energy!=='any'&&candidate.characters.some(c=>c.profile.energy!==lobby.energy))fail(409,'Снимок не соответствует текущему типу энергии лобби.');roster(JSON.parse(lobby.world_json),candidate,await tx.all('SELECT character_id FROM character_bindings WHERE lobby_id=?',[lobby.id]))
   const summary=JSON.parse(p.summary_json);let branch,replayReceipt=null,replayExact=true,anchors=await lineageAnchors(tx,lobby.id,generation)
   if(p.operation==='rollback'){
    if(summary.checkpointId){const checkpoint=await tx.get('SELECT * FROM campaign_checkpoints WHERE id=? AND lobby_id=?',[summary.checkpointId,lobby.id]);if(!checkpoint)fail(409,'Контрольная точка недоступна.');branch=JSON.parse(checkpoint.branch_json);anchors=await checkpointAnchors(tx,lobby.id,checkpoint.id);replayReceipt=checkpoint.replay_json?JSON.parse(checkpoint.replay_json).receiptId:null;replayExact=!checkpoint.replay_json||JSON.parse(checkpoint.replay_json).exact!==false}
    else {const ids=await roundBranch(tx,lobby.id,generation),index=ids.indexOf(p.target_receipt_id);if(index<0)fail(409,'Раунд больше не входит в текущую ветку.');branch=ids.slice(0,index);replayReceipt=p.target_receipt_id}
   }
   const resultGeneration=p.operation==='rollback'?generation+1:generation,receipt={id:id(),previewId:p.id,revision:lobby.revision+1,generation:resultGeneration,sourceGeneration:generation,appliedAt:now(),summary:JSON.parse(p.summary_json)},receiptJson=JSON.stringify(receipt),bytes=Buffer.byteLength(lobby.world_json+receiptJson)
   await checkHistorySpace(tx,lobby.id,bytes)
   await tx.run('INSERT INTO round_change_receipts(id,lobby_id,author_id,command_key,request_hash,result_generation,before_json,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?)',[receipt.id,lobby.id,req.user.id,body.commandKey,hash,resultGeneration,lobby.world_json,receiptJson,bytes])
   if(p.operation==='rollback'){await invalidateRoundGeneration(tx,lobby.id);await setRoundBranch(tx,lobby.id,resultGeneration,branch);await setLineageAnchors(tx,lobby.id,resultGeneration,anchors)}
   else await tx.run('DELETE FROM round_replay_contexts WHERE lobby_id=?',[lobby.id])
   if(p.operation==='rollback'&&replayReceipt)await setReplayContext(tx,lobby.id,resultGeneration,replayReceipt,p.world_json,replayExact)
   await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=?',[p.world_json,receipt.appliedAt,lobby.id]);await record(tx,req,p.operation==='rollback'?'rollback-round':'cancel-pending-actions')
   await tx.run('DELETE FROM round_previews WHERE lobby_id=?',[lobby.id]);await tx.run('DELETE FROM round_change_previews WHERE lobby_id=?',[lobby.id])
   return {receipt,duplicate:false}
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
 app.post('/api/lobbies/:id/rounds/replay/calculate',auth.middleware,async(req,res)=>{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))fail(400,'Передай параметры переигровки.')
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member);open(lobby)
   if(lobby.revision!==integer(req.body.revision))fail(409,'Кампания изменилась. Обнови историю.')
   const context=await tx.get('SELECT * FROM round_replay_contexts WHERE lobby_id=?',[lobby.id]),generation=await roundGeneration(tx,lobby.id)
   if(!context||context.generation!==generation||context.receipt_id!==validId(req.body.receiptId)||context.world_hash!==fingerprint(lobby.world_json))fail(409,'Состояние после отката изменилось. Для новых условий используй обычный расчёт с новыми бросками.')
   const data=await tx.get('SELECT * FROM round_history_data WHERE receipt_id=? AND lobby_id=?',[context.receipt_id,lobby.id])
   if(!data?.input_json||!data.execution_seed||!compatibleRoundExecutor(data.executor_version))fail(409,'Для этого раунда нет совместимых данных переигровки.')
   return createRoundCalculation(tx,lobby,req.user.id,JSON.parse(data.input_json),data.execution_seed)
  });res.json(result)
 })
}
