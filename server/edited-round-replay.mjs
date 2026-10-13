import {actionSummary} from './generated/actionDeclarations.mjs'
import {createHash} from 'node:crypto'
import {fail,integer,validId} from './validation.mjs'
import {requireLobbyPermission} from './permissions.mjs'
import {roundGeneration,createRoundCalculation} from './rounds.mjs'
import {compatibleRoundExecutor} from './generated/roundExecution.mjs'
import {isRoundReplay,releaseSignature} from './generated/roundReplay.mjs'

const hash=s=>createHash('sha256').update(s).digest('hex')
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v)
// Preserve the exact replay hash separately from the identity of its edited collection.
export async function setReplayContext(tx,lobbyId,generation,receiptId,worldJson,exact=true){
 await tx.run('INSERT INTO round_replay_contexts(lobby_id,generation,receipt_id,world_hash) VALUES(?,?,?,?)',[lobbyId,generation,receiptId,exact?hash(worldJson):'edited'])
 const collectionId=JSON.parse(worldJson).campaign.declarations?.active?.id
 if(collectionId)await tx.run('INSERT INTO round_replay_collections(lobby_id,collection_id) VALUES(?,?)',[lobbyId,collectionId])
}
export async function replayContext(tx,lobby){
 const context=await tx.get('SELECT * FROM round_replay_contexts WHERE lobby_id=?',[lobby.id]),generation=await roundGeneration(tx,lobby.id),c=JSON.parse(lobby.world_json).campaign.declarations?.active
 if(!context||context.generation!==generation||!c)return null
 let bound=await tx.get('SELECT collection_id FROM round_replay_collections WHERE lobby_id=?',[lobby.id])
 // Old installations can bind only an unchanged snapshot, never guess after an edit.
 if(!bound&&context.world_hash===hash(lobby.world_json)){
  await tx.run('INSERT INTO round_replay_collections(lobby_id,collection_id) VALUES(?,?)',[lobby.id,c.id]);bound={collection_id:c.id}
 }
 return bound?.collection_id===c.id?context:null
}
function releases(world,input){
 const c=world.campaign.declarations?.active;if(!c)return []
 const continued=(input.continuations??[]).filter(v=>record(v)&&v.mode==='continue').map(v=>v.actorId)
 const rows=(world.campaign.roundWork?.entries??[]).filter(w=>continued.includes(w.actorId)).map(w=>({key:w.id,actorId:w.actorId,action:w.action,targetActorId:w.targetActorId,sceneId:w.sceneId}))
 for(const e of c.entries.filter(e=>e.status==='submitted'))for(const [index,action] of e.actions.entries())rows.push({key:'new:'+e.actorId+':'+index,actorId:e.actorId,action,sceneId:c.sceneId,targetActorId:e.resolved.find(r=>r.index===index)?.actorId})
 return rows.filter(r=>r.action.kind==='ability'&&r.action.stage==='release').map(r=>{
  const target=r.action.target,targetId=target.kind==='self'?r.actorId:target.kind==='contact'?r.targetActorId:null
  return {...r,abilityId:r.action.abilityId,targetId,signature:releaseSignature(r.actorId,r.sceneId,r.action.abilityId,targetId??target)}
 })
}
async function source(tx,lobby){
 const ctx=await replayContext(tx,lobby);if(!ctx)return null
 const r=await tx.get('SELECT r.before_json,r.receipt_json,h.* FROM round_receipts r JOIN round_history_data h ON h.receipt_id=r.id WHERE r.lobby_id=? AND r.id=?',[lobby.id,ctx.receipt_id])
 if(!r?.input_json||!r.execution_seed||!compatibleRoundExecutor(r.executor_version))return null
 const before=JSON.parse(r.before_json),outcomes=JSON.parse(r.receipt_json).summary.rules??[],input=JSON.parse(r.input_json)
 const actions=releases(before,input).flatMap(row=>{
  const outcome=outcomes.find(o=>o.key===row.key&&o.kind==='release');if(!outcome)return []
  let groups=outcome.rollGroups
  if(groups===undefined){
   const targets=outcome.targets?.map(t=>t.actorId)??(row.targetId?[row.targetId]:[]),rolls=outcome.rolls??[]
   groups=rolls.length===0?[]:rolls.length===targets.length*2?targets.map((targetId,i)=>({targetId,values:rolls.slice(i*2,i*2+2)})):null
  }
  const actor=before.characters.find(a=>a.id===row.actorId),cast=actor?.rpg.casts.find(c=>c.id===outcome.castId),ability=cast?.ability??actor?.rpg.abilities.find(a=>a.id===row.abilityId)
  if(groups!==null&&!isRoundReplay({sourceReceiptId:ctx.receipt_id,selections:[{key:row.key,mode:'preserve',sourceKey:row.key,groups}]}))groups=null
  const targetName=row.targetId?before.characters.find(a=>a.id===row.targetId)?.name??'существо':'point' in row.action.target?'('+Object.values(row.action.target.point).join('; ')+')':actionSummary(row.action)
  const position=row.key.startsWith('new:')?'действие '+(Number(row.key.slice(row.key.lastIndexOf(':')+1))+1):'прежняя очередь'
  return [{...row,groups,label:(actor?.name??'Герой')+' · '+(ability?.name??'Способность')+' → '+targetName+' · '+position}]
 })
 return {ctx,actions}
}
export function editedReplayRoutes(app,{db,auth,lockedMembership}){
 const master=member=>{requireLobbyPermission(member,'rounds');requireLobbyPermission(member,'viewSecrets')}
 app.get('/api/lobbies/:id/rounds/replay/options',auth.middleware,async(req,res)=>{
  const value=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   if(lobby.status==='closed')return null
   const s=await source(tx,lobby);if(!s)return null
   return {revision:lobby.revision,generation:s.ctx.generation,receiptId:s.ctx.receipt_id,actions:s.actions.map(({key,actorId,abilityId,label,signature,groups})=>({key,actorId,abilityId,label,signature,canPreserve:groups!==null}))}
  });res.json(value)
 })
 app.post('/api/lobbies/:id/rounds/replay/edited/calculate',auth.middleware,async(req,res)=>{
  const b=req.body
  if(!record(b)||Object.keys(b).length!==6||!record(b.input)||b.input.replay!==undefined||!Array.isArray(b.choices)||b.choices.length>200)fail(400,'Передай текущие решения и явный выбор бросков.')
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   if(lobby.status==='closed')fail(409,'Лобби закрыто.')
   if(lobby.revision!==integer(b.revision))fail(409,'Кампания изменилась. Сверь сопоставление заново.')
   const c=JSON.parse(lobby.world_json).campaign.declarations?.active
   if(!c||c.id!==validId(b.collectionId)||c.epoch!==integer(b.epoch))fail(409,'Сбор изменился. Сверь заявления заново.')
   const s=await source(tx,lobby)
   if(!s||s.ctx.receipt_id!==validId(b.receiptId))fail(409,'Источник переигровки больше не доступен для этого сбора.')
   if(!Array.isArray(b.input.continuations)||!b.input.continuations.every(v=>record(v)&&typeof v.actorId==='string'&&['continue','hold'].includes(v.mode)))fail(400,'Проверь продолжение прежней работы.')
   const rows=releases(JSON.parse(lobby.world_json),b.input),used=new Set()
   const selections=b.choices.map(choice=>{
    if(!record(choice)||Object.keys(choice).some(k=>!['key','mode','sourceKey'].includes(k)))fail(400,'Неизвестные поля выбора бросков.')
    const row=rows.find(r=>r.key===choice.key);if(!row)fail(400,'Выбор относится к отсутствующему выпуску.')
    if(choice.mode==='new'&&choice.sourceKey===undefined)return {key:row.key,mode:'new'}
    const old=s.actions.find(r=>r.key===choice.sourceKey)
    if(choice.mode!=='preserve'||!old||old.groups===null||old.actorId!==row.actorId||old.abilityId!==row.abilityId||old.sceneId!==row.sceneId||used.has(old.key))fail(400,'Прежний выпуск должен принадлежать тому же герою и способности; один источник нельзя использовать дважды.')
    used.add(old.key);return {key:row.key,mode:'preserve',sourceKey:old.key,groups:old.groups}
   })
   const replay={sourceReceiptId:s.ctx.receipt_id,selections}
   if(!isRoundReplay(replay)||selections.length!==rows.length)fail(400,'Выбери прежние либо новые броски для каждого выпуска.')
   return createRoundCalculation(tx,lobby,req.user.id,{...b.input,replay})
  });res.json(result)
 })
}
