import {legacySessionContext} from './game-sessions.mjs'
import {commitWorld} from './world-coordinator.mjs'
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
async function progress(tx,lobby,context){
 const state=JSON.parse(lobby.world_json),c=state.campaign.declarations?.active,generation=await roundGeneration(tx,lobby.id)
 const executed=!!c&&await collectionExecuted(tx,lobby.id,generation,c.id),pause=await campaignSession(tx,lobby.id)
 const bindings=await tx.all('SELECT b.character_id,b.owner_id,b.approved,n.character_id AS npc FROM character_bindings b LEFT JOIN lobby_npcs n ON n.lobby_id=b.lobby_id AND n.character_id=b.character_id WHERE b.lobby_id=?',[lobby.id])
 const party=(context??await legacySessionContext(tx,lobby,lobby.owner_id)).participants,hasPlayers=party.length>0
 // Both launch APIs must honor the same party and controller checks. A single
 // prepared hero must not close enrollment while the other players are waiting.
 const ready=[{id:'friends',label:'В лобби вошёл хотя бы один игрок',done:hasPlayers,section:'setup'},
  {id:'heroes',label:'У каждого игрока есть принятый герой под своим управлением',done:hasPlayers&&party.every(p=>p.heroCount>0),section:'heroes'},
  {id:'scene',label:'Герои всех игроков размещены на открытой им игровой сцене',done:hasPlayers&&party.every(p=>p.placed),section:'game'},
  {id:'players',label:'Все игроки подтвердили готовность'+(party.some(p=>!p.ready)?': ожидаем '+party.filter(p=>!p.ready).map(p=>p.name).join(', '):''),done:hasPlayers&&party.every(p=>p.ready),section:'game'}]
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
   const {lobby,member}=await lockedMembership(tx,req),c=await legacySessionContext(tx,lobby,req.user.id),p=await progress(tx,lobby,c),chief=member.role==='GM'&&lobby.owner_id===req.user.id,{ready:_ready,...session}=c.session
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
   if(lobby.status==='closed'||JSON.parse(lobby.world_json).campaign.gameSession?.status==='finished')fail(409,'Игра уже завершена. Обнови итог; для новой игры явно продолжи сессию.')
   if(lobby.revision!==revision)fail(409,'Кампания изменилась. Проверь итог и текущий раунд перед завершением.')
   for(const table of ['round_receipts','round_change_receipts','campaign_archive_receipts','campaign_trade_commands'])if(await tx.get('SELECT command_key FROM '+table+' WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey]))fail(409,'Ключ уже связан с другой командой.')
   const context=await legacySessionContext(tx,lobby,req.user.id),p=await progress(tx,lobby,context)
   if(p.finishBlockers.length)fail(409,p.finishBlockers.join(' '))
   if(p.pendingWork&&!b.keepPending)fail(409,'Есть незавершённые действия или заряды. Подтверди их сохранение в финальном снимке или разреши их судьбу в раунде.')
   const body=finalBody(name,summary),at=now()
   context.world.campaign.gameSession={...context.session,status:'finished',startedAt:context.session.startedAt??lobby.created_at,finishedAt:at,outcome:'stopped',summary:body}
   // The portable world and the final checkpoint must retain the same ending,
   // even when the chat database is not part of an exported campaign archive.
   const point=await createCampaignCheckpoint(tx,{...lobby,world_json:JSON.stringify(context.world)},{name,commandKey:b.commandKey,requestHash:hash,authorId:req.user.id,at})
   await commitWorld(tx,lobby,context.world,{at})
   await tx.run('INSERT INTO messages(id,lobby_id,author_id,body,created_at) VALUES(?,?,?,?,?)',[finalMessageId(point.id),lobby.id,req.user.id,body,point.created_at])
   await tx.run("UPDATE lobbies SET status='closed' WHERE id=?",[lobby.id])
   await tx.run('DELETE FROM round_previews WHERE lobby_id=?',[lobby.id]);await tx.run('DELETE FROM round_change_previews WHERE lobby_id=?',[lobby.id])
   await record(tx,req,'finish-game');return {result:publicResult({...point,body}),duplicate:false}
  });if(!result.duplicate){updated(req.params.id);publicUpdated()}res.json(result)
 })
}
