import {copyEconomy,emptyEconomy} from './generated/campaignEconomy.mjs'
import {createHash} from 'node:crypto'
import {fail,id,integer,now,text,world as validateWorld} from './validation.mjs'
import {requireLobbyPermission} from './permissions.mjs'
import {controlledBindings} from './lobby-access.mjs'
import {collectionExecuted} from './round-branch.mjs'
import {roundGeneration,controlsStamp} from './rounds.mjs'
import {emptyTrade,copyTrade,isCurrency,isMerchant,isBalances,publicTrade,copyInventoryItem,isTradeInput,calculateTrade} from './generated/campaignTrade.mjs'
const VERSION='r05-trade-v1',master=m=>{requireLobbyPermission(m,'economy');requireLobbyPermission(m,'viewSecrets')}
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k))
const commandKey=v=>typeof v==='string'&&/^trade:[a-zA-Z0-9_-]{8,140}$/.test(v)
export async function blockedActors(tx,lobby,state){
 const c=state.campaign.declarations?.active,pending=c&&c.phase!=='cancelled'&&!await collectionExecuted(tx,lobby.id,await roundGeneration(tx,lobby.id),c.id)
 return new Set([...(pending?c.participantIds:[]),...(state.campaign.roundWork?.entries??[]).map(w=>w.actorId)])
}
async function availableActor(tx,lobby,state,actorId){
 const binding=await tx.get('SELECT approved FROM character_bindings WHERE lobby_id=? AND character_id=?',[lobby.id,actorId])
 if(!binding?.approved)fail(409,'Сначала утверди героя или NPC.')
 if((await blockedActors(tx,lobby,state)).has(actorId))fail(409,'У участника есть текущий сбор или переносимая работа. Заверши, исполни или явно отмени их перед сделкой.')
}
export function campaignTradeRoutes(app,{db,auth,updated,lockedMembership,record}){
 const oldCommand=async(tx,lobby,user,key,requestHash)=>{const old=await tx.get('SELECT * FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[lobby.id,key]);if(!old)return null;if(old.author_id!==user.id||old.request_hash!==requestHash)fail(409,'Ключ уже связан с другой командой имущества.');return {receipt:JSON.parse(old.receipt_json),duplicate:true}}
 const store=async(tx,lobby,user,key,requestHash,state,receipt,req)=>{
  state=validateWorld(state);const json=JSON.stringify(receipt),bytes=Buffer.byteLength(json+requestHash+key),size=await tx.get('SELECT COUNT(*) AS n,COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_trade_commands WHERE lobby_id=?',[lobby.id])
  if(Number(size.n)>=10000||Number(size.bytes)+bytes>4*1024*1024)fail(409,'Достигнут предел подтверждений имущества. Прежние команды не удалены.')
  await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=?',[JSON.stringify(state),receipt.appliedAt,lobby.id]);await record(tx,req,receipt.operation)
  await tx.run('INSERT INTO campaign_trade_commands(lobby_id,command_key,author_id,request_hash,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?)',[lobby.id,key,user.id,requestHash,json,bytes]);return {receipt,duplicate:false}
 }
 app.get('/api/lobbies/:id/trade',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req),state=JSON.parse(lobby.world_json),trade=state.campaign.trade??emptyTrade()
   if(req.query.view==='master'){
    master(member);const npcs=await tx.all('SELECT character_id FROM lobby_npcs WHERE lobby_id=?',[lobby.id]),bindings=await tx.all('SELECT character_id,approved FROM character_bindings WHERE lobby_id=?',[lobby.id]),blocked=await blockedActors(tx,lobby,state)
    return {revision:lobby.revision,closed:lobby.status==='closed',trade:copyTrade(trade),economy:copyEconomy(state.campaign.economy??emptyEconomy()),options:{actors:state.characters.map(a=>({id:a.id,name:a.name,approved:!!bindings.find(b=>b.character_id===a.id)?.approved,blocked:blocked.has(a.id),inventory:a.rpg.inventory.map(copyInventoryItem)})),templates:state.campaign.items,npcs:state.characters.filter(a=>npcs.some(n=>n.character_id===a.id)).map(a=>({id:a.id,name:a.name})),cities:state.campaign.atlas?.cities.map(c=>({id:c.id,name:c.name}))??[],organizations:state.campaign.atlas?.organizations.map(o=>({id:o.id,name:o.name}))??[]}}
   }
   const bindings=await controlledBindings(tx,lobby,await tx.all('SELECT * FROM character_bindings WHERE lobby_id=?',[lobby.id])),owned=bindings.filter(b=>b.owner_id===req.user.id||b.control?.controllerId===req.user.id).map(b=>b.character_id)
   return {revision:lobby.revision,...publicTrade(trade,state.campaign.atlas),possessions:state.characters.filter(a=>owned.includes(a.id)).map(a=>({actorId:a.id,name:a.name,balances:(trade.wallets.find(w=>w.actorId===a.id)?.balances??[]).map(b=>({...b})),inventory:a.rpg.inventory.map(copyInventoryItem)}))}
  });res.json(result)
 })
 app.post('/api/lobbies/:id/trade/settings',auth.middleware,async(req,res)=>{
  const b=req.body,c=b?.change
  if(!exact(b,['revision','change','reason','commandKey'])||!commandKey(b.commandKey)||!object(c)||!(exact(c,['kind','mode','entry'])&&['create','edit'].includes(c.mode)&&c.kind==='currency'&&isCurrency(c.entry)||exact(c,['kind','mode','entry'])&&['create','edit'].includes(c.mode)&&c.kind==='merchant'&&isMerchant(c.entry)||exact(c,['kind','actorId','balances'])&&c.kind==='wallet'&&typeof c.actorId==='string'&&isBalances(c.balances)))fail(400,'Проверь валюту, имущество торговца или кошелёк.')
  const revision=integer(b.revision),reason=text(b.reason,2000),requestHash=hash(['settings',b])
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member);const previous=await oldCommand(tx,lobby,req.user,b.commandKey,requestHash);if(previous)return previous
   if(lobby.status==='closed'||lobby.revision!==revision)fail(409,'Лобби закрыто или кампания изменилась. Сверь имущество перед записью.')
   const state=JSON.parse(lobby.world_json),trade=copyTrade(state.campaign.trade??emptyTrade())
   if(c.kind==='currency'){if(trade.currencies.some(x=>x.id===c.entry.id)!==(c.mode==='edit'))fail(409,'Исходная валюта изменилась или её идентификатор уже занят.');const entry={...c.entry,name:c.entry.name.trim(),symbol:c.entry.symbol.trim()};trade.currencies=trade.currencies.some(x=>x.id===entry.id)?trade.currencies.map(x=>x.id===entry.id?entry:x):[...trade.currencies,entry]}
   if(c.kind==='merchant'){
    if(trade.merchants.some(m=>m.id===c.entry.id)!==(c.mode==='edit'))fail(409,'Исходный торговец больше недоступен или идентификатор уже занят.');
    if(c.entry.npcId&&!await tx.get('SELECT character_id FROM lobby_npcs WHERE lobby_id=? AND character_id=?',[lobby.id,c.entry.npcId]))fail(409,'Выбери NPC этого лобби.')
    const entry=copyTrade({...emptyTrade(),merchants:[c.entry]}).merchants[0];entry.name=entry.name.trim();trade.merchants=trade.merchants.some(x=>x.id===entry.id)?trade.merchants.map(x=>x.id===entry.id?entry:x):[...trade.merchants,entry]
   }
   if(c.kind==='wallet'){
    if(!state.characters.some(a=>a.id===c.actorId))fail(409,'Кошелёк относится к недоступному герою.')
    trade.wallets=trade.wallets.some(w=>w.actorId===c.actorId)?trade.wallets.map(w=>w.actorId===c.actorId?{actorId:c.actorId,balances:c.balances}:w):[...trade.wallets,{actorId:c.actorId,balances:c.balances}]
   }
   state.campaign.trade=trade
   return store(tx,lobby,req.user,b.commandKey,requestHash,state,{operation:'trade-settings-'+c.kind,revision:revision+1,reason,appliedAt:now()},req)
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
 app.post('/api/lobbies/:id/trade/calculate',auth.middleware,async(req,res)=>{
  const b=req.body;if(!exact(b,['revision','input','reason'])||!isTradeInput(b.input))fail(400,'Передай точные параметры сделки.');const revision=integer(b.revision),reason=text(b.reason,2000)
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member);if(lobby.status==='closed'||lobby.revision!==revision)fail(409,'Кампания изменилась или лобби закрыто.')
   const state=JSON.parse(lobby.world_json);await availableActor(tx,lobby,state,b.input.actorId)
   const previewId=id(),destinationId=id();let calculation;try{calculation=calculateTrade(state,b.input,destinationId);validateWorld(calculation.world)}catch(e){fail(e.status??400,e.message)}
   const summary={...calculation.summary,reason},inputJson=JSON.stringify(b.input),summaryJson=JSON.stringify(summary),bytes=Buffer.byteLength(inputJson+summaryJson+reason),expiresAt=new Date(Date.now()+15*60*1000).toISOString()
   await tx.run('DELETE FROM campaign_trade_previews WHERE lobby_id=? AND (author_id=? OR expires_at<? OR base_revision<>?)',[lobby.id,req.user.id,now(),lobby.revision])
   const size=await tx.get('SELECT COUNT(*) AS n,COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_trade_previews WHERE lobby_id=?',[lobby.id]);if(Number(size.n)>=50||Number(size.bytes)+bytes>2*1024*1024)fail(409,'Предел предпросмотров сделки. Дождись истечения прежних расчётов.')
   const generation=await roundGeneration(tx,lobby.id)
   await tx.run('INSERT INTO campaign_trade_previews(id,lobby_id,author_id,base_revision,generation,controls_stamp,world_hash,executor_version,input_json,destination_id,reason,summary_json,expires_at,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[previewId,lobby.id,req.user.id,revision,generation,await controlsStamp(tx,lobby.id),hash(lobby.world_json),VERSION,inputJson,destinationId,reason,summaryJson,expiresAt,bytes])
   return {id:previewId,revision,generation,expiresAt,summary}
  });res.json(result)
 })
 app.post('/api/lobbies/:id/trade/apply',auth.middleware,async(req,res)=>{
  const b=req.body;if(!exact(b,['previewId','generation','commandKey'])||typeof b.previewId!=='string'||!commandKey(b.commandKey))fail(400,'Проверь команду сделки.');const generation=integer(b.generation,1),requestHash=hash(['apply',b])
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member);const previous=await oldCommand(tx,lobby,req.user,b.commandKey,requestHash);if(previous)return previous
   const p=await tx.get('SELECT * FROM campaign_trade_previews WHERE lobby_id=? AND id=? AND author_id=?',[lobby.id,b.previewId,req.user.id])
   if(!p||lobby.status==='closed'||p.expires_at<=now()||p.executor_version!==VERSION||p.base_revision!==lobby.revision||p.generation!==generation||generation!==await roundGeneration(tx,lobby.id)||p.controls_stamp!==await controlsStamp(tx,lobby.id)||p.world_hash!==hash(lobby.world_json))fail(409,'Предпросмотр сделки устарел или недоступен. Рассчитай заново.')
   const state=JSON.parse(lobby.world_json),input=JSON.parse(p.input_json);await availableActor(tx,lobby,state,input.actorId);let calculation;try{calculation=calculateTrade(state,input,p.destination_id)}catch(e){fail(409,e.message)}
   if(hash({...calculation.summary,reason:p.reason})!==hash(JSON.parse(p.summary_json)))fail(409,'Последствия сделки изменились. Рассчитай заново.')
   const receipt={operation:'trade-'+input.direction,previewId:p.id,revision:lobby.revision+1,appliedAt:now(),summary:JSON.parse(p.summary_json)},stored=await store(tx,lobby,req.user,b.commandKey,requestHash,calculation.world,receipt,req)
   await tx.run('DELETE FROM campaign_trade_previews WHERE lobby_id=?',[lobby.id]);return stored
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
 return {store,oldCommand}
}
