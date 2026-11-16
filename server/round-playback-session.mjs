import {createHash} from 'node:crypto'
import {fail,integer,now} from './validation.mjs'
import {hasLobbyPermission} from './generated/lobbyAccess.mjs'
import {roundBranch} from './round-branch.mjs'
import {roundGeneration} from './rounds.mjs'
import {personalRoundId,personalRoundResults} from './round-feedback.mjs'
import {roundPresentationContext} from './round-presentation.mjs'

const canLead=member=>['rounds','scenes','viewSecrets'].every(p=>hasLobbyPermission(member.role,member.permissions,p))
async function context(tx,lobby){
 const generation=await roundGeneration(tx,lobby.id),branch=await roundBranch(tx,lobby.id,generation),row=await tx.get('SELECT state_json FROM round_playback_sessions WHERE lobby_id=?',[lobby.id])
 const stored=row?JSON.parse(row.state_json):null
 let session=stored?.session??null
 if(session&&(stored.generation!==generation||stored.headId!==branch.at(-1)||!branch.slice(-20).includes(session.receiptId)))session=null
 if(session){
  const author=await tx.get('SELECT m.role,u.disabled,p.permissions_json FROM members m JOIN users u ON u.id=m.user_id LEFT JOIN lobby_permissions p ON p.lobby_id=m.lobby_id AND p.user_id=m.user_id WHERE m.lobby_id=? AND m.user_id=?',[lobby.id,stored.authorId])
  if(!author||author.disabled||!canLead({...author,permissions:JSON.parse(author.permissions_json??'[]')}))session=null
 }
 return {generation,branch,stored,session,version:stored?.version??0}
}
export async function tableRoundPlayback(tx,lobby,member,actorId,reports){
 const c=await context(tx,lobby),serverNow=Date.now()
 let report=null
 if(c.session){const id=personalRoundId(lobby.id,actorId,c.session.receiptId);report=reports.find(r=>r.id===id)??(await personalRoundResults(tx,lobby,actorId,'20')).reports.find(r=>r.id===id)??null}
 const session=c.session?{id:c.session.id,durationMs:c.session.durationMs,positionMs:c.session.positionMs,speed:c.session.speed,playing:c.session.playing,changedAt:c.session.changedAt}:null
 return {generation:c.generation,version:c.version,canControl:canLead(member),serverNow,session,report}
}
export function roundPlaybackRoutes(app,{db,auth,updated,lockedMembership,record}){
 app.post('/api/lobbies/:id/round-playback',auth.middleware,async(req,res)=>{
  const b=req.body,fields={start:['characterId','reportId'],change:['positionMs','speed','playing'],stop:[]}
  if(!b||typeof b!=='object'||Array.isArray(b)||!Object.hasOwn(fields,b.operation)||Object.keys(b).some(k=>!['operation','generation','version','commandKey',...fields[b.operation]].includes(k))||typeof b.commandKey!=='string'||!/^table:[a-zA-Z0-9_-]{8,140}$/.test(b.commandKey))fail(400,'Проверь команду общего просмотра.')
  const generation=integer(b.generation,1),version=integer(b.version),hash=createHash('sha256').update(JSON.stringify(b)).digest('hex')
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req)
   if(!canLead(member))fail(403,'Общим просмотром управляет мастер с разрешениями на раунды, сцены и секретные сведения.')
   const c=await context(tx,lobby)
   if(generation!==c.generation)fail(409,'Кампания восстановлена. Обнови общий просмотр.')
   if(c.stored?.commandKey===b.commandKey){if(c.stored.authorId!==req.user.id||c.stored.requestHash!==hash)fail(409,'Ключ относится к другой команде просмотра.');return {...c.stored.ack,duplicate:true}}
   if(version!==c.version)fail(409,'Другой ведущий уже изменил просмотр. Обнови состояние перед повтором.')
   let session=c.session
   const at=now()
   if(b.operation==='start'){
    if(typeof b.characterId!=='string'||typeof b.reportId!=='string')fail(400,'Выбери героя и сохранённый раунд.')
    const binding=await tx.get('SELECT character_id FROM character_bindings WHERE lobby_id=? AND character_id=?',[lobby.id,b.characterId])
    if(!binding)fail(404,'Герой не найден.')
    const {recording,receiptId,durationMs}=await roundPresentationContext(tx,lobby,b.characterId,b.reportId)
    if(recording.coverage!=='scene')fail(409,'Для общего просмотра нужна сохранённая сцена этого раунда.')
    session={id:'screen:'+createHash('sha256').update(lobby.id+':'+b.commandKey).digest('hex').slice(0,24),receiptId,durationMs,positionMs:0,speed:1,playing:true,changedAt:at}
   }else if(b.operation==='change'){
    if(!session)fail(409,'Общий просмотр уже завершён. Выбери раунд заново.')
    if(typeof b.positionMs!=='number'||!Number.isFinite(b.positionMs)||b.positionMs<0||b.positionMs>session.durationMs||![.5,1,2,4].includes(b.speed)||typeof b.playing!=='boolean')fail(400,'Проверь время, скорость и паузу просмотра.')
    session={...session,positionMs:b.positionMs,speed:b.speed,playing:b.playing&&b.positionMs<session.durationMs,changedAt:at}
   }else session=null
   const ack={commandKey:b.commandKey,generation,version:version+1,operation:b.operation}
   const stored={generation,version:version+1,headId:c.branch.at(-1)??'',authorId:req.user.id,commandKey:b.commandKey,requestHash:hash,ack,session}
   await tx.run('INSERT INTO round_playback_sessions(lobby_id,state_json) VALUES(?,?) ON CONFLICT(lobby_id) DO UPDATE SET state_json=excluded.state_json',[lobby.id,JSON.stringify(stored)])
   await record(tx,req,'round-playback-'+b.operation)
   return {...ack,duplicate:false}
  })
  if(!result.duplicate)updated(req.params.id)
  res.json(result)
 })
}
