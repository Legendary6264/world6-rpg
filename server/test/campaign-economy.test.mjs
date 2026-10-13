import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {emptyItem} from '../generated/rpgSchema.mjs'
import {instantiateItem} from '../generated/rpgEngine.mjs'
import {newMerchant} from '../generated/campaignTrade.mjs'
import {newEconomyRule,emptyEconomy} from '../generated/campaignEconomy.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
for(const dialect of ['sqlite','postgres'])test('Период производства и расходов · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('period-owner'),helper=await f.register('period-helper'),player=await f.register('period-player'),outside=await f.register('period-outside')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 for(const u of [helper,player])await api(root+'/join',u.token,'POST');await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const world=()=>api(root+'/world',gm.token),revision=async()=>(await world()).revision,key=()=> 'economy:'+crypto.randomUUID(),view=()=>api(root+'/trade?view=master',gm.token)
 const grant=async permissions=>api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:await revision(),permissions})
 const actorId=(await api(root+'/npcs',gm.token,'POST',{revision:await revision(),character:{...createDefaultCharacter(),id:'npc',name:'PRIVATE-PRODUCER'},commandKey:'npc:'+crypto.randomUUID()})).id
 const template={...emptyItem(),id:'product',name:'Product',maximumDurability:10,artifactCharge:4,energyReserve:6,modelLength:1,modelWidth:.5,modelDepth:.5,massKg:.2},currency={id:'coin',name:'Монета',symbol:'м.'}
 const initial=await world();initial.campaign.items=[template];initial.campaign.scenes=createScene(emptyScenes(),'scene','Scene','top');initial.characters.find(a=>a.id===actorId).rpg.inventory=[{...instantiateItem({...template,id:'ore-template',name:'Ore'},'ore'),quantity:20,durability:7}];await api(root+'/world',gm.token,'PUT',{revision:initial.revision,world:initial})
 const tradeSetting=async change=>api(root+'/trade/settings',gm.token,'POST',{revision:await revision(),change,reason:'Ручная база',commandKey:'trade:'+crypto.randomUUID()})
 await tradeSetting({kind:'currency',mode:'create',entry:currency});await tradeSetting({kind:'merchant',mode:'create',entry:{...newMerchant('shop'),name:'Shop'}});await tradeSetting({kind:'wallet',actorId,balances:[{currencyId:'coin',amount:100}]})
 const line=(id,resource,resourceId,amount,target='actor',targetId=actorId)=>({id,resource,resourceId,amount,target,targetId}),rule={...newEconomyRule('rule'),name:'PRIVATE-RULE-NAME',secret:'PRIVATE-RULE-NOTE',enabled:true,inputs:[line('ore-in','item','ore',2),line('coin-in','money','coin',4)],outputs:[line('product','item','product',3,'merchant','shop'),line('coin-out','money','coin',9)]}
 const settings=async(rules=[rule],token=gm.token,status=200,b=null)=>api(root+'/economy/settings',token,'POST',b??{revision:await revision(),periodName:'Период мастера',rules,reason:'Настройки производства',commandKey:key()},status)
 const input=async patch=>({fromPeriod:(await view()).economy.completedPeriods+1,count:2,ruleIds:['rule'],reason:'Условия подтверждены мастером',conditionsConfirmed:true,...patch})
 const calculate=async(patch={},token=gm.token,status=200,b=null)=>api(root+'/economy/calculate',token,'POST',b??{revision:await revision(),input:await input(patch)},status)
 const apply=(p,token=gm.token,status=200,b=null)=>api(root+'/economy/apply',token,'POST',b??{previewId:p.id,generation:p.generation,commandKey:key()},status)
 let firstCommand,settingsCommand
 await t.test('Старые кампании и свежие полномочия; игроку и постороннему запись запрещена',async()=>{
  assert.deepEqual((await view()).economy,emptyEconomy());await settings([rule],outside.token,403);await settings([rule],player.token,403)
  for(const permissions of [['economy'],['viewSecrets']]){await grant(permissions);await settings([rule],helper.token,403);await calculate({},helper.token,403)}
  await grant(['economy','viewSecrets']);settingsCommand={revision:await revision(),periodName:'Период мастера',rules:[rule],reason:'Начальная настройка',commandKey:key()};const before=await world();await settings([rule],helper.token,200,settingsCommand)
  const after=await world();assert.deepEqual(after.characters,before.characters);assert.equal(after.campaign.seconds,before.campaign.seconds);assert.deepEqual(after.campaign.trade,before.campaign.trade)
  for(const route of ['/trade','/world?view=player']){const json=JSON.stringify(await api(root+route,player.token));for(const privateText of ['PRIVATE-RULE','economy','completedPeriods','lastRun'])assert(!json.includes(privateText),privateText)}
 })
 await t.test('Расчёт не меняет мир; применение согласованно учитывает весь период и новые экземпляры',async()=>{
  const before=await world(),p=await calculate({},helper.token);assert.deepEqual(await world(),before);assert.equal(p.summary.money[0].after,110);assert.equal(p.summary.consumed[0].quantity,4);assert.equal(p.summary.produced[0].quantity,6)
  firstCommand={previewId:p.id,generation:p.generation,commandKey:key()};await apply(p,helper.token,200,firstCommand);const after=await world(),a=after.characters.find(a=>a.id===actorId),old=before.characters.find(a=>a.id===actorId),stock=after.campaign.trade.merchants[0].stock[0]
  assert.equal(after.campaign.economy.completedPeriods,2);assert.equal(after.campaign.economy.lastRun.summary.toPeriod,2);assert.equal(a.rpg.inventory[0].quantity,16);assert.equal(stock.item.artifactCharge,4);assert.equal(stock.item.modelWidth,.5);assert.equal(stock.item.quantity,6);assert.equal(stock.visible,false);assert.deepEqual(stock.prices,[])
  assert.deepEqual(a.body,old.body);assert.deepEqual(a.resources,old.resources);assert.equal(after.campaign.seconds,before.campaign.seconds);await apply(p,gm.token,409)
 })
 await t.test('Повтор после перезапуска не расходует сырьё второй раз; автор, запрос и права проверяются',async()=>{
  await f.restart();const before=await world();assert.equal((await api(root+'/economy/apply',helper.token,'POST',firstCommand)).duplicate,true);assert.deepEqual(await world(),before)
  await api(root+'/economy/apply',gm.token,'POST',firstCommand,409);await api(root+'/economy/apply',helper.token,'POST',{...firstCommand,previewId:'other'},409)
  assert.equal((await settings([rule],helper.token,200,settingsCommand)).duplicate,true)
  await grant(['economy']);await api(root+'/economy/apply',helper.token,'POST',firstCommand,403);await grant(['economy','viewSecrets'])
 })
 await t.test('Настройки не сбрасывают счётчик; закрытый ввод не принимает подмену мира, истории и условий',async()=>{
  const before=await world(),b={revision:before.revision,periodName:'Период мастера',rules:[rule],reason:'Обновить',commandKey:key()}
  await settings([rule],gm.token,400,{...b,completedPeriods:0});await settings([rule],gm.token,400,{...b,lastRun:null});await settings([{...rule,automaticProfit:1}],gm.token,400)
  for(const patch of [{fromPeriod:1},{conditionsConfirmed:false},{count:.5},{count:366},{ruleIds:['rule','rule']},{ruleIds:['missing']}])await calculate(patch,gm.token,400)
  await calculate({},gm.token,400,{revision:before.revision,input:await input({}),world:before});assert.deepEqual(await world(),before)
  await settings([{...rule,description:'Изменение описания'}]);const e=(await view()).economy;assert.equal(e.completedPeriods,2);assert.deepEqual(e.lastRun,before.campaign.economy.lastRun)
 })
 await t.test('Общий дефицит сырья, снаряжение и чужие ссылки останавливают весь пакет',async()=>{
  const second={...rule,id:'second',name:'Second',inputs:[line('too-much','item','ore',7)],outputs:[]};await settings([rule,second]);const before=await world();await calculate({ruleIds:['rule','second']},gm.token,400);assert.deepEqual(await world(),before)
  await settings([{...rule,inputs:[line('foreign','item','foreign-item',1)]}],gm.token,409);await settings([{...rule,outputs:[line('unknown','item','foreign-template',1,'merchant','shop')]}],gm.token,409);await settings([{...rule,outputs:[line('bad-owner','money','coin',1,'actor','foreign-actor')]}],gm.token,400)
  const equipped=await world();equipped.characters.find(a=>a.id===actorId).rpg.inventory[0].slot='left';equipped.characters.find(a=>a.id===actorId).rpg.inventory[0].quantity=1;equipped.characters.find(a=>a.id===actorId).rpg.inventory[0].equipped=true;await api(root+'/world',gm.token,'PUT',{revision:equipped.revision,world:equipped});await calculate({count:1},gm.token,400)
  const clear=await world();clear.characters.find(a=>a.id===actorId).rpg.inventory[0].equipped=false;clear.characters.find(a=>a.id===actorId).rpg.inventory[0].quantity=16;await api(root+'/world',gm.token,'PUT',{revision:clear.revision,world:clear});await settings([rule])
 })
 await t.test('Предпросмотр привязан к автору, сроку, версии, управлению и виду операции',async()=>{
  let p=await calculate();await apply(p,helper.token,409);await api(root+'/trade/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:'trade:'+crypto.randomUUID()},409);await api(root+'/economy/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:'trade:'+crypto.randomUUID()},400)
  await f.server.db.run('UPDATE campaign_trade_previews SET expires_at=? WHERE id=?',['2000-01-01T00:00:00.000Z',p.id]);await apply(p,gm.token,409)
  p=await calculate();await f.server.db.run('UPDATE campaign_trade_previews SET controls_stamp=? WHERE id=?',['changed',p.id]);await apply(p,gm.token,409)
  p=await calculate();await settings([rule]);await apply(p,gm.token,409)
 })
 await t.test('Отказ аудита и общая квота не меняют счётчик, сырьё, средства и подтверждения',async()=>{
  const p=await calculate(),b={previewId:p.id,generation:p.generation,commandKey:key()},before=await world(),db=f.server.db,original=db.transaction
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('economy-period'))throw Error('TEST-PERIOD-AUDIT');return tx.run(sql,args)}}))
  try{await apply(p,gm.token,500,b)}finally{db.transaction=original}assert.deepEqual(await world(),before);assert.equal(await db.get('SELECT command_key FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[id,b.commandKey]),undefined)
  const row=await db.get('SELECT payload_bytes FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[id,firstCommand.commandKey]);await db.run('UPDATE campaign_trade_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[4*1024*1024,id,firstCommand.commandKey])
  try{await apply(p,gm.token,409,b)}finally{await db.run('UPDATE campaign_trade_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[row.payload_bytes,id,firstCommand.commandKey])}assert.deepEqual(await world(),before)
 })
 await t.test('Текущий сбор защищён; реальный раунд сохраняет правила, счётчик и последний учёт',async()=>{
  const saved=(await view()).economy;await api(root+'/declarations',gm.token,'POST',{revision:await revision(),sceneId:'scene',participantIds:[actorId],durationSeconds:5,allowReplace:true},201);await calculate({},gm.token,409)
  const d=await api(root+'/characters/'+actorId+'/declarations',gm.token);await api(root+'/characters/'+actorId+'/declarations',gm.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:0,controlStamp:d.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]});await api(root+'/declarations',gm.token,'PATCH',{collectionId:d.collection.id,epoch:d.collection.epoch,operation:'close'})
  const w=await world(),c=w.campaign.declarations.active,p=await api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:[{actorId,entryRevision:1,budgetMs:5000,costs:[]}],continuations:[],missingDecisions:[],interactionsConfirmed:false}});await api(root+'/rounds/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()});assert.deepEqual((await view()).economy,saved)
  const old=await world();delete old.campaign.economy;await api(root+'/world',gm.token,'PUT',{revision:old.revision,world:old},409)
 })
 await t.test('Одна команда при конкурирующих запросах учитывается один раз; разные команды не применяют один предпросмотр дважды',async()=>{
  const p=await calculate({count:1}),b={previewId:p.id,generation:p.generation,commandKey:key()},results=await Promise.all([apply(p,gm.token,200,b),apply(p,gm.token,200,b)]);assert.equal(results.filter(r=>r.duplicate).length,1);assert.equal((await view()).economy.completedPeriods,3)
  const next=await calculate({count:1}),r=await Promise.all([f.request(root+'/economy/apply',gm.token,'POST',{previewId:next.id,generation:next.generation,commandKey:key()}),f.request(root+'/economy/apply',gm.token,'POST',{previewId:next.id,generation:next.generation,commandKey:key()})]);assert.deepEqual(r.map(r=>r.status).sort(),[200,409]);assert.equal((await view()).economy.completedPeriods,4)
 })
 await t.test('Точка и обе копии восстанавливают имущество и учёт; исторический повтор ничего не создаёт заново',async()=>{
  await f.restart()
  const point=(await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:await revision(),name:'До следующего учёта',commandKey:crypto.randomUUID()})).checkpoint,copy=await api(root+'/backup',gm.token),before=await world(),p=await calculate({count:1}),b={previewId:p.id,generation:p.generation,commandKey:key()};await apply(p,gm.token,200,b)
  const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:await revision(),checkpointId:point.id,reason:'Вернуть учёт'});await api(root+'/rounds/change/apply',gm.token,'POST',{previewId:rollback.id,generation:rollback.generation,commandKey:crypto.randomUUID()});assert.deepEqual((await world()).campaign.economy,before.campaign.economy);assert.deepEqual((await world()).campaign.trade,before.campaign.trade)
  const restored=await world();assert.equal((await apply(p,gm.token,200,b)).duplicate,true);assert.deepEqual(await world(),restored)
  await api(root+'/restore',gm.token,'POST',{revision:await revision(),world:copy.world,bindings:copy.bindings});assert.deepEqual((await view()).economy,before.campaign.economy)
  const full=await api(root+'/archive',gm.token);await settings([{...rule,secret:'NEW-SECRET'}]);const response=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+await revision(),{method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:Buffer.from(full.data,'base64')}),restore=await response.json();assert.equal(response.status,200,JSON.stringify(restore));await api(root+'/archive/apply',gm.token,'POST',{previewId:restore.id,generation:restore.generation,commandKey:crypto.randomUUID(),reason:'Вернуть учёт и правила'});assert.deepEqual((await view()).economy,before.campaign.economy)
 })
 if(dialect==='postgres')await t.test('Повтор миграций сохраняет подтверждения; существующие таблицы остаются приватными',async()=>{
  await f.restart();assert(await f.server.db.get('SELECT command_key FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[id,firstCommand.commandKey]));for(const table of ['campaign_trade_commands','campaign_trade_previews']){const row=await f.server.db.get('SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relname=?',['world6',table]);assert(row.relrowsecurity)}
 })
})
