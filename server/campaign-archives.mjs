import {setReplayContext,replayContext} from './edited-round-replay.mjs'
import {lineageAnchors,setLineageAnchors,setCheckpointAnchors,rejectRetiredCommand,retireCommands} from './campaign-retention-state.mjs'
import express from 'express'
import {fail,id,integer,now,text,world as validateWorld} from './validation.mjs'
import {requireCampaignEditor,requireLobbyPermission} from './permissions.mjs'
import {hydrateRoundHistory,roundBranch,setRoundBranch,campaignSession} from './round-branch.mjs'
import {roundGeneration,invalidateRoundGeneration,controlsStamp} from './rounds.mjs'
import {ROUND_EXECUTOR_VERSION} from './generated/roundExecution.mjs'
import {packArchive,unpackArchive,archiveHash,ARCHIVE_FILE_LIMIT} from './campaign-archive-format.mjs'
const VERSION='r04-full-archive-v2:'+ROUND_EXECUTOR_VERSION
const view=m=>requireLobbyPermission(m,'viewSecrets')
const open=l=>{if(l.status==='closed')fail(409,'Лобби закрыто.')}
const receiptView=r=>JSON.parse(r.receipt_json)

export async function captureArchive(tx,lobby){
 const generation=await roundGeneration(tx,lobby.id),branch=await roundBranch(tx,lobby.id,generation);await hydrateRoundHistory(tx,lobby.id)
 const normal=await tx.all('SELECT r.*,h.applied_revision,h.applied_at,h.input_json,h.execution_seed,h.executor_version FROM round_receipts r JOIN round_history_data h ON h.receipt_id=r.id WHERE r.lobby_id=? ORDER BY h.applied_revision',[lobby.id])
 const changes=await tx.all('SELECT * FROM round_change_receipts WHERE lobby_id=? ORDER BY id',[lobby.id]),points=await tx.all('SELECT * FROM campaign_checkpoints WHERE lobby_id=? ORDER BY created_at,id',[lobby.id])
 const authors=await tx.all('SELECT DISTINCT u.id,u.display_name FROM users u WHERE u.id IN (SELECT author_id FROM round_receipts WHERE lobby_id=? UNION SELECT author_id FROM round_change_receipts WHERE lobby_id=? UNION SELECT author_id FROM campaign_checkpoints WHERE lobby_id=?)',[lobby.id,lobby.id,lobby.id])
 const pointAnchors=await tx.all('SELECT checkpoint_id,collections_json FROM checkpoint_lineage_anchors WHERE lobby_id=?',[lobby.id])
 const origins=await tx.all('SELECT kind,record_id,author_label FROM campaign_archive_origins WHERE lobby_id=?',[lobby.id])
 const label=(kind,r)=>origins.find(o=>o.kind===kind&&o.record_id===r.id)?.author_label??authors.find(a=>a.id===r.author_id)?.display_name??'Бывший участник'
 const rounds=normal.map(r=>({id:r.id,authorLabel:label('round',r),collectionId:r.collection_id,generation:r.generation,revision:r.applied_revision,at:r.applied_at,before:JSON.parse(r.before_json),receipt:receiptView(r),input:r.input_json?JSON.parse(r.input_json):null,seed:r.execution_seed??null,executorVersion:r.executor_version??null}))
 const compatible=rid=>rounds.some(r=>r.id===rid&&r.input!==null&&r.seed!==null&&r.executorVersion!==null)
 const context=await replayContext(tx,lobby),session=await campaignSession(tx,lobby.id)
 return {format:'world6-complete-backup',version:2,anchors:await lineageAnchors(tx,lobby.id,generation),exportedAt:now(),source:{lobbyId:lobby.id,revision:lobby.revision,generation},world:JSON.parse(lobby.world_json),rounds,
  changes:changes.map(r=>({id:r.id,authorLabel:label('change',r),before:JSON.parse(r.before_json),receipt:receiptView(r)})),
  checkpoints:points.map(p=>{const rid=p.replay_json?JSON.parse(p.replay_json).receiptId:null;return {id:p.id,name:p.name,authorLabel:label('checkpoint',p),at:p.created_at,revision:p.source_revision,world:JSON.parse(p.world_json),anchors:JSON.parse(pointAnchors.find(x=>x.checkpoint_id===p.id)?.collections_json??'[]'),branch:JSON.parse(p.branch_json),replayId:compatible(rid)?rid:null,replayExact:!p.replay_json||JSON.parse(p.replay_json).exact!==false}}),
  branch,replayId:context&&compatible(context.receipt_id)?context.receipt_id:null,replayExact:!context||context.world_hash===archiveHash(lobby.world_json),session:{paused:session.paused,reason:session.reason}}
}
const stamp=a=>archiveHash({...a,exportedAt:''})
function roster(lobby,archive,bindings){
 const current=JSON.parse(lobby.world_json),ids=current.characters.map(c=>c.id)
 if(ids.length!==archive.world.characters.length||archive.world.characters.some(c=>!ids.includes(c.id)||!bindings.some(b=>b.character_id===c.id)))fail(409,'Состав героев должен совпадать. Полная копия сохраняет текущих владельцев и не удаляет новые листы.')
 if(lobby.energy!=='any'&&archive.world.characters.some(c=>c.profile.energy!==lobby.energy))fail(409,'Копия не соответствует текущему типу энергии лобби.')
}
function worldChanges(current,target){
 const labels={body:'тело',resources:'ресурсы',rpg:'предметы, заряды и эффекты',journal:'заметки и знания',profile:'профиль',attributes:'характеристики',statistics:'расчётные параметры',name:'имя',knownEffects:'известные эффекты'}
 const characters=target.characters.map(c=>{const old=current.characters.find(x=>x.id===c.id);return {id:c.id,name:c.name,fields:[...new Set([...Object.keys(c),...Object.keys(old??{})])].filter(k=>k!=='id'&&JSON.stringify(old?.[k])!==JSON.stringify(c[k])).map(k=>labels[k]??k)}})
 const resources=target.characters.flatMap(c=>{const old=current.characters.find(x=>x.id===c.id);return ['mana','shadow','stamina'].flatMap(k=>JSON.stringify(old?.resources[k])!==JSON.stringify(c.resources[k])?[{actorId:c.id,name:c.name,label:{mana:'Мана',shadow:'Тень',stamina:'Выносливость'}[k],from:old?.resources[k]??null,to:c.resources[k]}]:[])})
 const sections={scenes:'сцены и позиции',perceptions:'раскрытые сведения',declarations:'заявления',roundWork:'переносимая работа',logs:'журнал мира',abilities:'шаблоны способностей',items:'шаблоны предметов',anatomies:'анатомии',seconds:'игровое время'}
 return {characters,resources,sections:[...new Set([...Object.keys(current.campaign),...Object.keys(target.campaign)])].filter(k=>k!=='revision'&&JSON.stringify(current.campaign[k])!==JSON.stringify(target.campaign[k])).map(k=>sections[k]??k)}
}
const filename='grani-bytiya-complete.w6.gz'
function download(data){return {filename,data:data.toString('base64'),bytes:data.length,sha256:archiveHash(data)}}
async function previousCommand(tx,lobby,user,body,hash){
 const row=await tx.get('SELECT * FROM campaign_archive_receipts WHERE lobby_id=? AND command_key=?',[lobby.id,body.commandKey]);if(!row)return null
 if(row.author_id!==user.id||row.request_hash!==hash||row.result_generation!==await roundGeneration(tx,lobby.id))fail(409,'Команда относится к другой копии или продолжению кампании.')
 return {receipt:receiptView(row),duplicate:true}
}
export function campaignArchiveRoutes(app,{db,auth,updated,lockedMembership,record}){
 app.get('/api/lobbies/:id/archive',auth.middleware,async(req,res)=>{
  const value=await db.transaction(async tx=>{const {lobby,member}=await lockedMembership(tx,req);view(member);return captureArchive(tx,lobby)})
  res.json(download(await packArchive(value)))
 })
 app.get('/api/lobbies/:id/archive/recoveries',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{const {lobby,member}=await lockedMembership(tx,req);view(member);const rows=await tx.all('SELECT id,receipt_json FROM campaign_archive_receipts WHERE lobby_id=?',[lobby.id]);return rows.map(r=>({id:r.id,revision:receiptView(r).revision,at:receiptView(r).appliedAt,reason:receiptView(r).reason})).sort((a,b)=>b.revision-a.revision)})
  res.json(result)
 })
 app.get('/api/lobbies/:id/archive/recoveries/:receiptId',auth.middleware,async(req,res)=>{
  const data=await db.transaction(async tx=>{const {lobby,member}=await lockedMembership(tx,req);view(member);const r=await tx.get('SELECT before_base64 FROM campaign_archive_receipts WHERE lobby_id=? AND id=?',[lobby.id,req.params.receiptId]);if(!r)fail(404,'Защитная копия не найдена.');return Buffer.from(r.before_base64,'base64')});res.json(download(data))
 })
 app.post('/api/lobbies/:id/archive/calculate',auth.middleware,async(req,res,next)=>{await db.transaction(async tx=>{const {lobby,member}=await lockedMembership(tx,req);requireCampaignEditor(member);open(lobby)});next()},express.raw({type:'application/gzip',limit:ARCHIVE_FILE_LIMIT,inflate:false}),async(req,res)=>{
  const revision=integer(Number(req.query.revision))
  const source=await db.transaction(async tx=>{const {lobby,member}=await lockedMembership(tx,req);requireCampaignEditor(member);open(lobby);if(lobby.revision!==revision)fail(409,'Кампания изменилась. Обнови лобби перед загрузкой копии.');return {archive:await captureArchive(tx,lobby),controls:await controlsStamp(tx,lobby.id)}})
  const archive=await unpackArchive(req.body),normalized=await packArchive(archive),before=await packArchive(source.archive),sourceStamp=stamp(source.archive)
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireCampaignEditor(member);open(lobby)
   if(lobby.revision!==revision||source.controls!==await controlsStamp(tx,lobby.id)||sourceStamp!==stamp(await captureArchive(tx,lobby)))fail(409,'Мир, управление или точки изменились во время загрузки.')
   roster(lobby,archive,await tx.all('SELECT character_id FROM character_bindings WHERE lobby_id=?',[lobby.id]))
   const previewId=id(),generation=await roundGeneration(tx,lobby.id),summary={fromSeconds:source.archive.world.campaign.seconds,toSeconds:archive.world.campaign.seconds,...worldChanges(source.archive.world,archive.world),rounds:archive.rounds.length,changes:archive.changes.length,activeRounds:archive.branch.length,compactedCollections:archive.anchors.length,checkpoints:archive.checkpoints.map(p=>p.name),paused:archive.session.paused,fromPaused:source.archive.session.paused,oldRounds:source.archive.rounds.length,oldCheckpoints:source.archive.checkpoints.length,source:archive.source,sha256:archiveHash(normalized)}
   const archive64=normalized.toString('base64'),before64=before.toString('base64'),bytes=Buffer.byteLength(archive64+before64+JSON.stringify(summary))
   await tx.run('DELETE FROM campaign_archive_previews WHERE lobby_id=? AND (author_id=? OR base_revision<>?)',[lobby.id,req.user.id,lobby.revision])
   const size=await tx.get('SELECT COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_archive_previews WHERE lobby_id=?',[lobby.id])
   if(Number(size.bytes)+bytes>96*1024*1024)fail(409,'Достигнут предел ожидающих восстановлений: 96 МиБ.')
   await tx.run('INSERT INTO campaign_archive_previews(id,lobby_id,author_id,generation,base_revision,controls_stamp,source_stamp,executor_version,archive_base64,before_base64,summary_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[previewId,lobby.id,req.user.id,generation,lobby.revision,source.controls,sourceStamp,VERSION,archive64,before64,JSON.stringify(summary),bytes])
   return {id:previewId,revision:lobby.revision,generation,summary}
  });res.json(result)
 })
 app.post('/api/lobbies/:id/archive/apply',auth.middleware,async(req,res)=>{
  const body=req.body;if(!body||Array.isArray(body)||Object.keys(body).length!==4||typeof body.previewId!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(body.previewId)||typeof body.commandKey!=='string'||!/^[a-zA-Z0-9_-]{8,160}$/.test(body.commandKey))fail(400,'Проверь команду восстановления полной копии.')
  integer(body.generation,1);const reason=text(body.reason,1000),hash=archiveHash([body.previewId,body.generation,reason])
  const load=async tx=>{const {lobby,member}=await lockedMembership(tx,req);requireCampaignEditor(member);await rejectRetiredCommand(tx,lobby.id,body.commandKey);const previous=await previousCommand(tx,lobby,req.user,body,hash);if(previous)return {previous};open(lobby)
   const p=await tx.get('SELECT * FROM campaign_archive_previews WHERE id=? AND lobby_id=? AND author_id=?',[body.previewId,lobby.id,req.user.id])
   if(!p||p.generation!==body.generation||p.generation!==await roundGeneration(tx,lobby.id)||p.base_revision!==lobby.revision||p.executor_version!==VERSION||p.controls_stamp!==await controlsStamp(tx,lobby.id))fail(409,'Предпросмотр устарел. Загрузить и проверить копию нужно заново.')
   return {lobby,p}
  }
  const first=await db.transaction(load);if(first.previous){res.json(first.previous);return}
  const archive=await unpackArchive(Buffer.from(first.p.archive_base64,'base64'))
  const result=await db.transaction(async tx=>{
   const context=await load(tx);if(context.previous)return context.previous;const {lobby,p}=context
   if(p.source_stamp!==stamp(await captureArchive(tx,lobby)))fail(409,'История или контрольные точки изменились. Повтори предпросмотр.')
   roster(lobby,archive,await tx.all('SELECT character_id FROM character_bindings WHERE lobby_id=?',[lobby.id]))
   for(const table of ['round_receipts','round_change_receipts','campaign_checkpoints'])if(await tx.get('SELECT id FROM '+table+' WHERE lobby_id=? AND command_key=?',[lobby.id,body.commandKey]))fail(409,'Ключ уже связан с другой командой.')
   const size=await tx.get('SELECT COUNT(*) AS n,COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_archive_receipts WHERE lobby_id=?',[lobby.id]),bytes=Buffer.byteLength(p.before_base64)
   if(Number(size.n)>=100||Number(size.bytes)+bytes>64*1024*1024)fail(409,'Защитные копии достигли предела: 100 восстановлений или 64 МиБ. Существующие данные сохранены.')
   const restored=await installArchive(tx,lobby,archive,req.user.id),receipt={id:id(),previewId:p.id,revision:restored.revision,generation:restored.generation,appliedAt:now(),reason,summary:JSON.parse(p.summary_json)}
   await tx.run('INSERT INTO campaign_archive_receipts(id,lobby_id,author_id,command_key,request_hash,result_generation,before_base64,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?)',[receipt.id,lobby.id,req.user.id,body.commandKey,hash,receipt.generation,p.before_base64,JSON.stringify(receipt),bytes])
   await tx.run('DELETE FROM campaign_archive_previews WHERE lobby_id=?',[lobby.id]);await record(tx,req,'restore-complete-archive');return {receipt,duplicate:false}
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
}
async function installArchive(tx,lobby,a,authorId){
 const mapping=new Map([...a.rounds,...a.changes,...a.checkpoints].map(r=>[r.id,id()])),mapped=old=>mapping.get(old),groups=[...new Set(a.rounds.map(r=>r.generation))].sort((x,y)=>x-y),sourceGeneration=await roundGeneration(tx,lobby.id),generation=integer(sourceGeneration+groups.length+1,1),revisions=[lobby.revision,a.source.revision,...a.rounds.map(r=>r.revision),...a.changes.map(r=>r.receipt.revision)],revision=integer(Math.max(...revisions)+1)
 const retired=[];for(const [table,kind] of [['round_receipts','round'],['round_change_receipts','change'],['campaign_checkpoints','checkpoint']])retired.push(...(await tx.all('SELECT command_key FROM '+table+' WHERE lobby_id=?',[lobby.id])).map(r=>({...r,kind})))
 await retireCommands(tx,lobby.id,retired)
 await invalidateRoundGeneration(tx,lobby.id);await tx.run('UPDATE round_generations SET generation=? WHERE lobby_id=?',[generation,lobby.id])
 for(const table of ['campaign_checkpoints','round_change_receipts','round_history_data','round_receipts','campaign_archive_origins'])await tx.run('DELETE FROM '+table+' WHERE lobby_id=?',[lobby.id])
 const origin=(kind,r)=>tx.run('INSERT INTO campaign_archive_origins(lobby_id,kind,record_id,source_lobby_id,source_id,author_label) VALUES(?,?,?,?,?,?)',[lobby.id,kind,mapped(r.id),a.source.lobbyId,r.id,r.authorLabel])
 for(const r of a.rounds){
  const gen=sourceGeneration+1+groups.indexOf(r.generation),receipt={...r.receipt,id:mapped(r.id),previewId:id(),generation:gen},before=JSON.stringify(r.before),json=JSON.stringify(receipt),input=r.input===null?null:JSON.stringify(r.input),bytes=Buffer.byteLength(before+json+(input??'')+(r.seed??''))
  await tx.run('INSERT INTO round_receipts(id,lobby_id,author_id,command_key,request_hash,generation,collection_id,preview_id,before_json,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[receipt.id,lobby.id,authorId,id(),archiveHash(json),gen,r.collectionId,receipt.previewId,before,json,bytes])
  await tx.run('INSERT INTO round_history_data(receipt_id,lobby_id,generation,applied_revision,applied_at,input_json,execution_seed,executor_version) VALUES(?,?,?,?,?,?,?,?)',[receipt.id,lobby.id,gen,r.revision,r.at,input,r.seed,r.executorVersion]);await origin('round',r)
 }
 for(const r of a.changes){const summary=structuredClone(r.receipt.summary);for(const key of ['receiptId','checkpointId'])if(summary[key])summary[key]=mapped(summary[key])??summary[key];if(summary.removedRounds)summary.removedRounds=summary.removedRounds.map(x=>({...x,id:mapped(x.id)??x.id}));if(summary.restoredRoundIds)summary.restoredRoundIds=summary.restoredRoundIds.map(x=>mapped(x)??x);if(summary.affectedChanges)summary.affectedChanges=summary.affectedChanges.map(x=>({...x,id:mapped(x.id)??x.id}))
  const receipt={...r.receipt,id:mapped(r.id),generation,summary},before=JSON.stringify(r.before),json=JSON.stringify(receipt)
  await tx.run('INSERT INTO round_change_receipts(id,lobby_id,author_id,command_key,request_hash,result_generation,before_json,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?)',[receipt.id,lobby.id,authorId,id(),archiveHash(json),generation,before,json,Buffer.byteLength(before+json)]);await origin('change',r)
 }
 for(const p of a.checkpoints){const json=JSON.stringify(p.world),branch=JSON.stringify(p.branch.map(mapped)),replay=p.replayId?JSON.stringify({receiptId:mapped(p.replayId),exact:p.replayExact!==false}):null
  await tx.run('INSERT INTO campaign_checkpoints(id,lobby_id,author_id,command_key,request_hash,name,created_at,source_generation,source_revision,world_json,branch_json,replay_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[mapped(p.id),lobby.id,authorId,id(),archiveHash(json),p.name,p.at,generation,p.revision,json,branch,replay,Buffer.byteLength(json+branch+(replay??'')+p.name+JSON.stringify(p.anchors))]);await setCheckpointAnchors(tx,lobby.id,mapped(p.id),p.anchors);await origin('checkpoint',p)
 }
 const storedHistory=await tx.get('SELECT COALESCE(SUM(payload_bytes),0) AS bytes FROM (SELECT payload_bytes FROM round_receipts WHERE lobby_id=? UNION ALL SELECT payload_bytes FROM round_change_receipts WHERE lobby_id=?) AS history',[lobby.id,lobby.id]),storedPoints=await tx.get('SELECT COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_checkpoints WHERE lobby_id=?',[lobby.id])
 if(Number(storedHistory.bytes)>64*1024*1024||Number(storedPoints.bytes)>32*1024*1024)fail(413,'Импортированная история или точки превышают предел хранения.')
 const candidate=structuredClone(a.world),c=candidate.campaign.declarations?.active,executed=c&&(a.anchors.includes(c.id)||a.branch.some(rid=>a.rounds.find(r=>r.id===rid)?.collectionId===c.id))
 if(c&&!executed){c.id=id();c.epoch=integer(c.epoch+1)}
 candidate.campaign.revision=integer(Math.max(candidate.campaign.revision,JSON.parse(lobby.world_json).campaign.revision)+1);const worldJson=JSON.stringify(validateWorld(candidate))
 await setRoundBranch(tx,lobby.id,generation,a.branch.map(mapped));await setLineageAnchors(tx,lobby.id,generation,a.anchors)
 if(a.replayId)await setReplayContext(tx,lobby.id,generation,mapped(a.replayId),worldJson,a.replayExact!==false)
 await tx.run('INSERT INTO campaign_sessions(lobby_id,paused,changed_at,author_id,reason) VALUES(?,?,?,?,?) ON CONFLICT(lobby_id) DO UPDATE SET paused=excluded.paused,changed_at=excluded.changed_at,author_id=excluded.author_id,reason=excluded.reason',[lobby.id,a.session.paused?1:0,now(),authorId,a.session.reason])
 await tx.run('UPDATE lobbies SET world_json=?,revision=?,updated_at=? WHERE id=?',[worldJson,revision,now(),lobby.id]);return {revision,generation}
}
