import {createHash} from 'node:crypto'
import {fail,integer,now,id,text,choice,world as validateWorld} from './validation.mjs'
import {requireChief} from './permissions.mjs'
import {emptyGameSession,isGameObjectives} from './generated/gameSession.mjs'
import {emptyDeclarations} from './generated/actionDeclarations.mjs'
import {controlledBindings} from './lobby-access.mjs'
import {requireCampaignRunning,campaignSession} from './round-branch.mjs'
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const sessionFor=(state,lobby)=>state.campaign.gameSession??{...emptyGameSession(),...(state.campaign.declarations?.active?{status:'playing',startedAt:lobby.created_at}:{})}
async function commitWorld(tx,lobby,state){
 state=validateWorld(state);const result=await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',[JSON.stringify(state),now(),lobby.id,lobby.revision]);if(Number(result.changes)!==1)fail(409,'Кампания изменилась. Загрузи актуальное состояние.')
}
async function context(tx,lobby,userId){
 const world=JSON.parse(lobby.world_json),session=sessionFor(world,lobby),scene=world.campaign.scenes?.scenes.find(s=>s.id===world.campaign.scenes.activeSceneId)
 const members=await tx.all('SELECT m.user_id,m.role,u.display_name,u.disabled FROM members m JOIN users u ON u.id=m.user_id WHERE m.lobby_id=? ORDER BY m.joined_at,m.user_id',[lobby.id])
 const bindings=await controlledBindings(tx,lobby,await tx.all('SELECT * FROM character_bindings WHERE lobby_id=?',[lobby.id]))
 const participants=members.filter(m=>m.role==='PLAYER'&&!m.disabled).map(m=>{
  const actorIds=bindings.filter(b=>!b.npc&&b.approved&&b.owner_id===m.user_id&&b.control.controllerId===m.user_id).map(b=>b.character_id).sort()
  const ready=session.ready.find(r=>r.userId===m.user_id),placed=!!actorIds.length&&!!scene&&actorIds.every(actorId=>scene.tokens.some(t=>t.actorId===actorId)&&world.campaign.perceptions?.heroes.some(h=>h.actorId===actorId&&h.activeSceneId===scene.id&&h.scenes.some(s=>s.sceneId===scene.id&&s.areas.some(a=>a.visible))))
  return {userId:m.user_id,name:m.display_name,actorIds,heroCount:actorIds.length,placed,ready:placed&&!!ready&&JSON.stringify([...ready.actorIds].sort())===JSON.stringify(actorIds),mine:m.user_id===userId}
 })
 const paused=(await campaignSession(tx,lobby.id)).paused
 const blockers=[...(!participants.length?['Пригласи хотя бы одного игрока.']:[]),...(!scene?['Подготовь игровую сцену.']:[]),...(paused?['Сними паузу кампании перед запуском.']:[]),...participants.flatMap(p=>!p.heroCount?[p.name+': нужен принятый герой под своим управлением.']:!p.placed?[p.name+': размести героя на сцене и открой ему обстановку.']:!p.ready?[p.name+': ожидаем готовность.']:[])]
 return {world,session,scene,participants,blockers}
}
export function gameSessionRoutes(app,{db,auth,updated,publicUpdated,lockedMembership,record,store,oldCommand}){
 app.get('/api/lobbies/:id/play/session',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req),c=await context(tx,lobby,req.user.id),{ready:_ready,...session}=c.session,chief=member.role==='GM'&&lobby.owner_id===req.user.id
   return {revision:lobby.revision,session,chief,myReady:c.participants.find(p=>p.mine)?.ready??false,participants:c.participants.map(({actorIds:_actorIds,...p})=>p),blockers:c.blockers,...(chief&&c.scene?{sceneName:c.scene.name}:{}),durationSeconds:c.scene?.roundDurationSeconds??5,roundPhase:c.world.campaign.declarations?.active?.phase??null,canStart:chief&&lobby.status!=='closed'&&c.session.status==='setup'&&!c.blockers.length}
  });res.json(result)
 })
 app.put('/api/lobbies/:id/play/session/ready',auth.middleware,async(req,res)=>{
  if(!exact(req.body,['ready'])||typeof req.body.ready!=='boolean')fail(400,'Укажи готовность игрока.')
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);if(member.role!=='PLAYER')fail(403,'Готовность отмечает сам игрок.')
   const c=await context(tx,lobby,req.user.id),participant=c.participants.find(p=>p.mine)
   if(lobby.status==='closed'||c.session.status!=='setup')fail(409,'Готовность меняется до начала игры.')
   if(req.body.ready&&(!participant?.heroCount||!participant.placed))fail(409,'Сначала выбери принятого героя и дождись подготовки сцены мастером.')
   const current=c.session.ready.find(r=>r.userId===req.user.id),next=req.body.ready?participant.actorIds:[]
   if(JSON.stringify(current?.actorIds??[])===JSON.stringify(next))return {revision:lobby.revision,duplicate:true}
   c.session.ready=c.session.ready.filter(r=>r.userId!==req.user.id);if(next.length)c.session.ready.push({userId:req.user.id,actorIds:next})
   c.world.campaign.gameSession=c.session;await commitWorld(tx,lobby,c.world);await record(tx,req,'game-session-ready')
   return {revision:lobby.revision+1,duplicate:false}
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
 app.post('/api/lobbies/:id/play/session',auth.middleware,async(req,res)=>{
  const b=req.body,fields={start:[],resume:[],goals:['objectives'],objective:['objectiveId','done'],finish:['outcome','summary']}
  if(!b||!Object.hasOwn(fields,b.operation)||!exact(b,['operation','revision','commandKey',...fields[b.operation]])||typeof b.commandKey!=='string'||!/^session:[a-zA-Z0-9_-]{8,140}$/.test(b.commandKey))fail(400,'Проверь команду игровой сессии.')
  const revision=integer(b.revision),requestHash=createHash('sha256').update(JSON.stringify(b)).digest('hex')
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireChief(lobby,member,req.user)
   const previous=await oldCommand(tx,lobby,req.user,b.commandKey,requestHash);if(previous)return previous
   if(lobby.revision!==revision)fail(409,'Кампания изменилась. Загрузи состояние сессии и повтори решение.')
   const c=await context(tx,lobby,req.user.id),s=c.session,at=now()
   if(b.operation==='start'){
    if(s.status!=='setup'||lobby.status==='closed')fail(409,'Эта сессия уже начата или лобби закрыто.')
    await requireCampaignRunning(tx,lobby.id);if(c.blockers.length)fail(409,c.blockers.join(' '))
    s.status='playing';s.startedAt=at
    const declarations=c.world.campaign.declarations??emptyDeclarations()
    if(!declarations.active){
     const actorIds=c.participants.flatMap(p=>p.actorIds),durationSeconds=c.scene.roundDurationSeconds??5;c.scene.roundDurationSeconds=durationSeconds
     declarations.active={id:id(),sceneId:c.scene.id,sceneName:c.scene.name,durationSeconds,allowReplace:true,phase:'open',epoch:1,participantIds:actorIds,entries:[],history:[{id:id(),kind:'open',actorId:'',authorId:req.user.id,at}]};c.world.campaign.declarations=declarations
    }
   }else if(b.operation==='resume'){
    if(s.status!=='finished')fail(409,'Продолжать можно завершённую сессию.')
    s.status='playing';s.finishedAt=null;s.outcome=null;s.summary=''
    await tx.run('INSERT INTO campaign_sessions(lobby_id,paused,changed_at,author_id,reason) VALUES(?,0,?,?,?) ON CONFLICT(lobby_id) DO UPDATE SET paused=0,changed_at=excluded.changed_at,author_id=excluded.author_id,reason=excluded.reason',[lobby.id,at,req.user.id,'Продолжение завершённой сессии'])
   }else if(b.operation==='goals'){
    if(s.status==='finished'||!isGameObjectives(b.objectives))fail(400,'Добавь до 12 общих целей с разными идентификаторами.')
    s.objectives=structuredClone(b.objectives).map(o=>({...o,title:o.title.trim()}))
   }else if(b.operation==='objective'){
    if(s.status!=='playing'||typeof b.done!=='boolean'||!s.objectives.some(o=>o.id===b.objectiveId))fail(409,'Проверь цель и состояние игры.')
    s.objectives=s.objectives.map(o=>o.id===b.objectiveId?{...o,done:b.done}:o)
   }else{
    if(s.status!=='playing')fail(409,'Завершить можно только начатую игру.')
    const outcome=choice(b.outcome,['success','failure','stopped']),summary=text(b.summary,2000)
    if(outcome==='success'&&s.objectives.some(o=>!o.done))fail(409,'Сначала отметь выполненные цели или скорректируй общую задачу приключения.')
    s.status='finished';s.outcome=outcome;s.summary=summary;s.finishedAt=at
    await tx.run('INSERT INTO campaign_sessions(lobby_id,paused,changed_at,author_id,reason) VALUES(?,1,?,?,?) ON CONFLICT(lobby_id) DO UPDATE SET paused=1,changed_at=excluded.changed_at,author_id=excluded.author_id,reason=excluded.reason',[lobby.id,at,req.user.id,'Игра завершена. '+summary.slice(0,900)])
   }
   c.world.campaign.gameSession=s
   const stored=await store(tx,lobby,req.user,b.commandKey,requestHash,c.world,{operation:'game-session-'+b.operation,revision:revision+1,appliedAt:at},req)
   if(['start','resume','finish'].includes(b.operation))await tx.run('UPDATE lobbies SET status=? WHERE id=?',[b.operation==='finish'?'closed':'playing',lobby.id])
   return stored
  });if(!result.duplicate){updated(req.params.id);publicUpdated()}res.json(result)
 })
}
