import {createHash} from 'node:crypto'
import {fail,id,integer,now,text,world as validateWorld} from './validation.mjs'
import {requireLobbyPermission} from './permissions.mjs'
import {blockedActors} from './campaign-trade.mjs'
import {roundGeneration,controlsStamp} from './rounds.mjs'
import {emptyEconomy,copyEconomy,isEconomyRules,economyReferencesValid,isPeriodInput,calculateEconomy} from './generated/campaignEconomy.mjs'
const VERSION='r05-period-v1',master=m=>{requireLobbyPermission(m,'economy');requireLobbyPermission(m,'viewSecrets')}
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const commandKey=v=>typeof v==='string'&&/^economy:[a-zA-Z0-9_-]{8,140}$/.test(v)
function references(state,rules){
 if(!economyReferencesValid({...emptyEconomy(),rules},state.characters.map(a=>a.id),state.campaign.trade))fail(400,'Правило относится к недоступному участнику, торговцу или валюте.')
 for(const r of rules.filter(r=>r.enabled))for(const [side,lines] of [['input',r.inputs],['output',r.outputs]])for(const l of lines){
  if(l.resource!=='item')continue
  const exists=side==='output'?state.campaign.items.some(t=>t.id===l.resourceId):l.target==='actor'?state.characters.find(a=>a.id===l.targetId)?.rpg.inventory.some(i=>i.id===l.resourceId):state.campaign.trade?.merchants.find(m=>m.id===l.targetId)?.stock.some(s=>s.item.id===l.resourceId)
  if(!exists)fail(409,'Сырьё или шаблон продукции недоступны. Замени ссылку в правиле либо явно отключи это правило.')
 }
}
async function available(tx,lobby,state,ruleIds){
 const rules=state.campaign.economy?.rules.filter(r=>ruleIds.includes(r.id))??[],actorIds=[...new Set(rules.flatMap(r=>[...r.inputs,...r.outputs]).filter(l=>l.target==='actor').map(l=>l.targetId))]
 const bindings=await tx.all('SELECT character_id,approved FROM character_bindings WHERE lobby_id=?',[lobby.id]),blocked=await blockedActors(tx,lobby,state)
 if(actorIds.some(id=>!bindings.some(b=>b.character_id===id&&b.approved)))fail(409,'Сначала утверди всех затронутых героев или NPC.')
 if(actorIds.some(id=>blocked.has(id)))fail(409,'У затронутого участника текущий сбор или переносимая работа. Разреши их перед учётом.')
}
export function campaignEconomyRoutes(app,{db,auth,updated,lockedMembership,store,oldCommand}){
 app.post('/api/lobbies/:id/economy/settings',auth.middleware,async(req,res)=>{
  const b=req.body;if(!exact(b,['revision','periodName','rules','reason','commandKey'])||!commandKey(b.commandKey)||!isEconomyRules(b.rules))fail(400,'Проверь закрытый формат правил учёта.')
  const revision=integer(b.revision),periodName=text(b.periodName,120),reason=text(b.reason,2000),requestHash=hash(['period-settings',b])
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member);const previous=await oldCommand(tx,lobby,req.user,b.commandKey,requestHash);if(previous)return previous
   if(lobby.status==='closed'||lobby.revision!==revision)fail(409,'Лобби закрыто или правила изменились. Сверь текущую версию.')
   const state=JSON.parse(lobby.world_json);references(state,b.rules)
   state.campaign.economy={...copyEconomy(state.campaign.economy??emptyEconomy()),periodName,rules:structuredClone(b.rules)}
   return store(tx,lobby,req.user,b.commandKey,requestHash,state,{operation:'economy-settings',revision:revision+1,reason,appliedAt:now()},req)
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
 app.post('/api/lobbies/:id/economy/calculate',auth.middleware,async(req,res)=>{
  const b=req.body;if(!exact(b,['revision','input'])||!isPeriodInput(b.input))fail(400,'Проверь следующий период, правила и подтверждение условий.');const revision=integer(b.revision)
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member);if(lobby.status==='closed'||lobby.revision!==revision)fail(409,'Лобби закрыто или кампания изменилась.')
   const state=JSON.parse(lobby.world_json);await available(tx,lobby,state,b.input.ruleIds)
   const previewId=id(),rules=state.campaign.economy?.rules??[],destinationIds=b.input.ruleIds.flatMap(rid=>rules.find(r=>r.id===rid)?.outputs.filter(l=>l.resource==='item')??[]).map(()=>id())
   let calculation;try{calculation=calculateEconomy(state,b.input,previewId,destinationIds);validateWorld(calculation.world)}catch(e){fail(e.status??400,e.message)}
   const generation=await roundGeneration(tx,lobby.id),inputJson=JSON.stringify(b.input),summaryJson=JSON.stringify(calculation.summary),destinationsJson=JSON.stringify(destinationIds),bytes=Buffer.byteLength(inputJson+summaryJson+destinationsJson+b.input.reason),expiresAt=new Date(Date.now()+15*60*1000).toISOString()
   await tx.run('DELETE FROM campaign_trade_previews WHERE lobby_id=? AND (author_id=? OR expires_at<? OR base_revision<>?)',[lobby.id,req.user.id,now(),revision])
   const size=await tx.get('SELECT COUNT(*) AS n,COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_trade_previews WHERE lobby_id=?',[lobby.id]);if(Number(size.n)>=50||Number(size.bytes)+bytes>2*1024*1024)fail(409,'Предел предпросмотров учёта. Дождись истечения прежних расчётов.')
   await tx.run('INSERT INTO campaign_trade_previews(id,lobby_id,author_id,base_revision,generation,controls_stamp,world_hash,executor_version,input_json,destination_id,reason,summary_json,expires_at,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[previewId,lobby.id,req.user.id,revision,generation,await controlsStamp(tx,lobby.id),hash(lobby.world_json),VERSION,inputJson,destinationsJson,b.input.reason,summaryJson,expiresAt,bytes])
   return {id:previewId,revision,generation,expiresAt,summary:calculation.summary}
  });res.json(result)
 })
 app.post('/api/lobbies/:id/economy/apply',auth.middleware,async(req,res)=>{
  const b=req.body;if(!exact(b,['previewId','generation','commandKey'])||typeof b.previewId!=='string'||!commandKey(b.commandKey))fail(400,'Проверь команду учёта периода.');const generation=integer(b.generation,1),requestHash=hash(['period-apply',b])
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member);const previous=await oldCommand(tx,lobby,req.user,b.commandKey,requestHash);if(previous)return previous
   const p=await tx.get('SELECT * FROM campaign_trade_previews WHERE lobby_id=? AND id=? AND author_id=?',[lobby.id,b.previewId,req.user.id])
   if(!p||p.executor_version!==VERSION||lobby.status==='closed'||p.expires_at<=now()||p.base_revision!==lobby.revision||p.generation!==generation||generation!==await roundGeneration(tx,lobby.id)||p.controls_stamp!==await controlsStamp(tx,lobby.id)||p.world_hash!==hash(lobby.world_json))fail(409,'Предпросмотр периода устарел или недоступен. Пересчитай текущий мир.')
   const state=JSON.parse(lobby.world_json),input=JSON.parse(p.input_json);await available(tx,lobby,state,input.ruleIds)
   let calculation;try{calculation=calculateEconomy(state,input,p.id,JSON.parse(p.destination_id))}catch(e){fail(409,e.message)}
   if(hash(calculation.summary)!==hash(JSON.parse(p.summary_json)))fail(409,'Последствия учёта изменились. Повтори расчёт.')
   const receipt={operation:'economy-period',previewId:p.id,revision:lobby.revision+1,appliedAt:now(),summary:calculation.summary},stored=await store(tx,lobby,req.user,b.commandKey,requestHash,calculation.world,receipt,req)
   await tx.run('DELETE FROM campaign_trade_previews WHERE lobby_id=?',[lobby.id]);return stored
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
}
