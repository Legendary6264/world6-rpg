import {legacySessionContext} from './game-sessions.mjs'
import {createHash} from 'node:crypto'
import {fail,integer,now,text} from './validation.mjs'
import {requireChief} from './permissions.mjs'
import {campaignSession,collectionExecuted} from './round-branch.mjs'
import {roundGeneration} from './rounds.mjs'
import {rejectRetiredCommand} from './campaign-retention-state.mjs'
import {createCampaignCheckpoint} from './campaign-checkpoint.mjs'

const finalMessageId=id=>'game-finish:'+id
const finalBody=(name,summary)=>'Итог игры «'+name+'»\n\n'+summary
const publicResult=p=>p?{id:p.id,title:p.name,summary:p.body.slice(finalBody(p.name,'').length),finishedAt:p.created_at,sourceRevision:p.source_revision}:null
async function latestResult(tx,lobbyId){
 return publicResult(await tx.get("SELECT p.id,p.name,p.created_at,p.source_revision,m.body FROM campaign_checkpoints p JOIN messages m ON m.id='game-finish:'||p.id AND m.lobby_id=p.lobby_id AND m.author_id=p.author_id WHERE p.lobby_id=? ORDER BY p.created_at DESC,p.id DESC LIMIT 1",[lobbyId]))
}
async function progress(tx,lobby){
 const state=JSON.parse(lobby.world_json),c=state.campaign.declarations?.active,generation=await roundGeneration(tx,lobby.id)
 const executed=!!c&&await collectionExecuted(tx,lobby.id,generation,c.id),pause=await campaignSession(tx,lobby.id)
 const members=await tx.all('SELECT m.user_id,u.disabled FROM members m JOIN users u ON u.id=m.user_id WHERE m.lobby_id=?',[lobby.id])
 const bindings=await tx.all('SELECT b.character_id,b.owner_id,b.approved,n.character_id AS npc FROM character_bindings b LEFT JOIN lobby_npcs n ON n.lobby_id=b.lobby_id AND n.character_id=b.character_id WHERE b.lobby_id=?',[lobby.id])
 const friends=members.filter(m=>m.user_id!==lobby.owner_id&&!m.disabled)
 const heroes=bindings.filter(b=>b.approved&&!b.npc&&friends.some(m=>m.user_id===b.owner_id))
 const scenes=state.campaign.scenes?.scenes??[],prepared=heroes.filter(b=>{
  const perception=state.campaign.perceptions?.heroes.find(h=>h.actorId===b.character_id)
  return scenes.some(s=>s.tokens.some(t=>t.actorId===b.character_id)&&perception?.activeSceneId===s.id&&perception.scenes.some(p=>p.sceneId===s.id&&p.areas.some(a=>a.visible)))
 })
 const ready=[{id:'friends',label:'В лобби вошёл хотя бы один другой участник',done:friends.length>0,section:'setup'},
  {id:'heroes',label:'Мастер принял героя другого участника',done:heroes.length>0,section:'heroes'},
  {id:'scene',label:'Герой размещён на открытой ему сцене',done:prepared.length>0,section:'game'}]
 const pendingWork=(state.campaign.roundWork?.entries.length??0)+state.characters.reduce((n,a)=>n+a.rpg.casts.filter(c=>['preparing','ready','maintaining'].includes(c.status)).length,0)
 const finishBlockers=[...(c&&!executed?['Текущий сбор ещё не исполнен. Примени раунд или явно сохрани сбор в истории без исполнения.']:[])]
 const people=bindings.filter(b=>b.approved&&!b.npc).map(b=>b.character_id)
 return {revision:lobby.revision,status:lobby.status,paused:pause.paused,seconds:state.campaign.seconds,
  phase:lobby.status==='closed'?'finished':pause.paused?'paused':c?executed?'applied':c.phase==='open'?'planning':'resolving':lobby.status==='playing'?'ready':'preparing',
  ready,pendingWork,finishBlockers,canStart:lobby.status==='open'&&!pause.paused&&ready.every(r=>r.done),
  round:c?{phase:executed?'applied':c.phase,received:c.entries.filter(e=>e.status==='submitted'&&people.includes(e.actorId)).length,total:c.participantIds.filter(id=>people.includes(id)).length}:null}
}
export function gameSessionRoutes(app,{db,auth,updated,publicUpdated,lockedMembership,record}){
 app.get('/api/lobbies/:id/play/session',auth.middleware,async(req,res)=>{
  const value=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req),p=await progress(tx,lobby),chief=member.role==='GM'&&lobby.owner_id===req.user.id,c=await legacySessionContext(tx,lobby,req.user.id),{ready:_ready,...session}=c.session
   return {session,chief,myReady:c.participants.find(p=>p.mine)?.ready??false,participants:c.participants.map(({actorIds:_actorIds,...p})=>p),blockers:c.blockers,canStart:false,...(chief&&c.scene?{sceneName:c.scene.name}:{}),durationSeconds:c.scene?.roundDurationSeconds??5,roundPhase:c.world.campaign.declarations?.active?.phase??null,revision:p.revision,status:p.status,paused:p.paused,seconds:p.seconds,phase:p.phase,round:p.round,
    ...(chief?{ready:p.ready,pendingWork:p.pendingWork,finishBlockers:p.finishBlockers,canStart:p.canStart}:{}),result:lobby.status==='closed'?(await latestResult(tx,lobby.id)??(JSON.parse(lobby.world_json).campaign.gameSession?.status==='finished'?{id:'legacy:'+lobby.id,title:{success:'Победа',failure:'Неудача',stopped:'Игра остановлена'}[session.outcome],summary:session.summary,finishedAt:session.finishedAt,sourceRevision:lobby.revision}:null)):null}
  });res.json(value)
 })
 app.post('/api/lobbies/:id/play/session/start',auth.middleware,async(req,res)=>{
  if(!req.body||Object.keys(req.body).length!==1)fail(400,'Проверь команду начала игры.')
  const revision=integer(req.body.revision)
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireChief(lobby,member,req.user)
   if(lobby.status==='playing')return {revision:lobby.revision,duplicate:true}
   if(lobby.status==='closed')fail(409,'Лобби закрыто. Сначала открой его в настройках, если нужна новая игра.')
   if(lobby.revision!==revision)fail(409,'Кампания изменилась. Обнови подготовку игры.')
   const p=await progress(tx,lobby)
   if(!p.canStart)fail(409,p.paused?'Кампания на паузе. Сначала продолжи её.':'Заверши подготовку: '+p.ready.filter(r=>!r.done).map(r=>r.label).join('; ')+'.')
   await tx.run("UPDATE lobbies SET status='playing',revision=revision+1,updated_at=? WHERE id=?",[now(),lobby.id])
   await tx.run('DELETE FROM round_previews WHERE lobby_id=?',[lobby.id]);await tx.run('DELETE FROM round_change_previews WHERE lobby_id=?',[lobby.id])
   await record(tx,req,'start-game');return {revision:revision+1,duplicate:false}
  });if(!result.duplicate){updated(req.params.id);publicUpdated()}res.json(result)
 })
 app.post('/api/lobbies/:id/play/session/finish',auth.middleware,async(req,res)=>{
  const b=req.body
  if(!b||Array.isArray(b)||Object.keys(b).length!==5||typeof b.keepPending!=='boolean'||typeof b.commandKey!=='string'||!/^[a-zA-Z0-9_-]{8,160}$/.test(b.commandKey))fail(400,'Проверь команду завершения игры.')
  const revision=integer(b.revision),name=text(b.title,80),summary=text(b.summary,4000),hash=createHash('sha256').update(JSON.stringify(['finish-game',revision,name,summary,b.keepPending])).digest('hex')
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireChief(lobby,member,req.user)
   await rejectRetiredCommand(tx,lobby.id,b.commandKey)
   const previous=await tx.get('SELECT * FROM campaign_checkpoints WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey])
   if(previous){
    const message=await tx.get('SELECT body FROM messages WHERE id=? AND lobby_id=?',[finalMessageId(previous.id),lobby.id])
    if(previous.author_id!==req.user.id||previous.request_hash!==hash||!message)fail(409,'Ключ уже связан с другой командой.')
    return {result:publicResult({...previous,body:message.body}),duplicate:true}
   }
   if(lobby.status==='closed')fail(409,'Игра уже закрыта. Обнови её итог.')
   if(lobby.revision!==revision)fail(409,'Кампания изменилась. Проверь итог и текущий раунд перед завершением.')
   for(const table of ['round_receipts','round_change_receipts','campaign_archive_receipts','campaign_trade_commands'])if(await tx.get('SELECT command_key FROM '+table+' WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey]))fail(409,'Ключ уже связан с другой командой.')
   const p=await progress(tx,lobby)
   if(p.finishBlockers.length)fail(409,p.finishBlockers.join(' '))
   if(p.pendingWork&&!b.keepPending)fail(409,'Есть незавершённые действия или заряды. Подтверди их сохранение в финальном снимке или разреши их судьбу в раунде.')
   const point=await createCampaignCheckpoint(tx,lobby,{name,commandKey:b.commandKey,requestHash:hash,authorId:req.user.id}),body=finalBody(name,summary)
   await tx.run('INSERT INTO messages(id,lobby_id,author_id,body,created_at) VALUES(?,?,?,?,?)',[finalMessageId(point.id),lobby.id,req.user.id,body,point.created_at])
   await tx.run("UPDATE lobbies SET status='closed',revision=revision+1,updated_at=? WHERE id=?",[point.created_at,lobby.id])
   await tx.run('DELETE FROM round_previews WHERE lobby_id=?',[lobby.id]);await tx.run('DELETE FROM round_change_previews WHERE lobby_id=?',[lobby.id])
   await record(tx,req,'finish-game');return {result:publicResult({...point,body}),duplicate:false}
  });if(!result.duplicate){updated(req.params.id);publicUpdated()}res.json(result)
 })
}
