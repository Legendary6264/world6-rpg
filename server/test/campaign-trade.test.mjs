import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {emptyItem} from '../generated/rpgSchema.mjs'
import {instantiateItem} from '../generated/rpgEngine.mjs'
import {newMerchant} from '../generated/campaignTrade.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
for(const dialect of ['sqlite','postgres'])test('Имущество и атомарная торговля · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('trade-owner'),player=await f.register('trade-player'),helper=await f.register('trade-helper'),outside=await f.register('trade-outside')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 for(const u of [player,helper])await api(root+'/join',u.token,'POST')
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const world=()=>api(root+'/world',gm.token),revision=async()=>(await world()).revision,key=()=> 'trade:'+crypto.randomUUID(),grant=async permissions=>api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:await revision(),permissions})
 const personal={...createDefaultCharacter(),id:'personal-hero',name:'Player hero'};await api('/characters/'+personal.id,player.token,'PUT',{revision:-1,character:personal})
 const actorId=(await api(root+'/characters',player.token,'POST',{characterId:personal.id},201)).id;await api(root+'/characters/'+actorId,gm.token,'PATCH',{approved:true})
 const npcId=(await api(root+'/npcs',gm.token,'POST',{revision:await revision(),character:{...createDefaultCharacter(),id:'NPC',name:'PRIVATE-NPC-NAME'},commandKey:'npc:'+crypto.randomUUID()})).id
 const currency={id:'coin',name:'Учебная монета',symbol:'м.'},template={...emptyItem(),id:'template',name:'Artifact bottle',maximumDurability:10,artifactCharge:3,energyReserve:5,massKg:.5},stock={...instantiateItem(template,'stock'),quantity:10,durability:6},merchant={...newMerchant('merchant'),name:'Лавка',secret:'PRIVATE-MERCHANT-NOTE',npcId,balances:[{currencyId:'coin',amount:100}],stock:[{item:stock,visible:false,prices:[{currencyId:'coin',unitPrice:7}]}]}
 const view=()=>api(root+'/trade?view=master',gm.token),publicView=(token=player.token)=>api(root+'/trade',token)
 const settings=async(change,token=gm.token,status=200,b=null)=>{const w=await world();if(change.kind!=='wallet')change={...change,mode:change.mode??(w.campaign.trade?.[change.kind==='currency'?'currencies':'merchants'].some(x=>x.id===change.entry.id)?'edit':'create')};return api(root+'/trade/settings',token,'POST',b??{revision:w.revision,change,reason:'Ручное основание мастера',commandKey:key()},status)}
 const input=(patch={})=>({direction:'buy',actorId,merchantId:merchant.id,itemId:stock.id,quantity:2,currencyId:'coin',unitPrice:7,...patch})
 const calculate=async(patch={},token=gm.token,status=200,b=null)=>api(root+'/trade/calculate',token,'POST',b??{revision:await revision(),input:input(patch),reason:'Встреча разрешена мастером'},status)
 const apply=(p,token=gm.token,status=200,b=null)=>api(root+'/trade/apply',token,'POST',b??{previewId:p.id,generation:p.generation,commandKey:key()},status)
 let firstCommand,buyReceipt,boughtId,point
 await t.test('Старый мир и личное имущество; чужое лобби и неполные права отклоняются',async()=>{
  const p=await publicView();assert.deepEqual(p.currencies,[]);assert.equal(p.possessions.length,1);assert.equal(p.possessions[0].actorId,actorId)
  await api(root+'/trade',outside.token,'GET',undefined,403);await api(root+'/trade?view=master',player.token,'GET',undefined,403)
  for(const permissions of [['economy'],['viewSecrets']]){await grant(permissions);await api(root+'/trade?view=master',helper.token,'GET',undefined,403);await settings({kind:'currency',entry:currency},helper.token,403);await calculate({},helper.token,403)}
  await grant(['economy','viewSecrets']);assert((await api(root+'/trade?view=master',helper.token)).options.actors.some(a=>a.id===actorId))
 })
 await t.test('Ручная настройка не меняет тело, ресурсы, часы или личный инвентарь NPC',async()=>{
  const before=await world();await settings({kind:'currency',entry:currency},helper.token);await settings({kind:'merchant',entry:merchant},helper.token);await settings({kind:'wallet',actorId,balances:[{currencyId:'coin',amount:100}]},helper.token)
  const after=await world();assert.deepEqual(after.characters,before.characters);assert.equal(after.campaign.seconds,before.campaign.seconds)
  const p=await publicView();assert.equal(p.possessions[0].balances[0].amount,100);assert.deepEqual(p.merchants,[]);assert(!JSON.stringify(p).includes(npcId));assert(!JSON.stringify(await api(root+'/world',player.token)).includes('PRIVATE-MERCHANT-NOTE'))
  await settings({kind:'merchant',entry:{...merchant,visible:true,stock:[{...merchant.stock[0],visible:true},{item:{...stock,id:'HIDDEN-ITEM',name:'HIDDEN-NAME'},visible:false,prices:[]}]}})
  const exposed=await publicView(),json=JSON.stringify(exposed);assert.equal(exposed.merchants[0].stock.length,1)
  for(const privateText of ['PRIVATE','HIDDEN',npcId,'artifactCharge','templateId','npcId','secret','merchantMoney'])assert(!json.includes(privateText),privateText)
  assert.equal((await publicView(helper.token)).possessions.length,0)
 })
 await t.test('Расчёт чистый; применение одновременно передаёт экземпляр и деньги',async()=>{
  const before=await world(),p=await calculate({},helper.token);assert.deepEqual(await world(),before);assert.equal(p.summary.actorMoneyBefore,100);assert.equal(p.summary.actorMoneyAfter,86);assert.equal(p.summary.merchantMoneyAfter,114);assert.equal(p.summary.reason,'Встреча разрешена мастером')
  firstCommand={previewId:p.id,generation:p.generation,commandKey:key()};buyReceipt=(await apply(p,helper.token,200,firstCommand)).receipt;boughtId=buyReceipt.summary.destinationItemId
  const w=await world(),a=w.characters.find(a=>a.id===actorId),m=w.campaign.trade.merchants[0];assert.equal(m.stock.find(s=>s.item.id==='stock').item.quantity,8);assert.equal(a.rpg.inventory[0].quantity,2);assert.equal(a.rpg.inventory[0].durability,6);assert.equal(a.rpg.inventory[0].artifactCharge,3);assert.equal(a.rpg.inventory[0].equipped,false)
  assert.deepEqual(a.body,before.characters.find(a=>a.id===actorId).body);assert.deepEqual(a.resources,before.characters.find(a=>a.id===actorId).resources);assert.equal(w.campaign.seconds,before.campaign.seconds)
  await apply(p,gm.token,409);assert.equal((await publicView()).possessions[0].inventory[0].id,boughtId)
 })
 await t.test('Перезапуск и потерянный ответ возвращают прежнее подтверждение; автор и права проверяются заново',async()=>{
  await f.restart();const before=await world();assert.equal((await api(root+'/trade/apply',helper.token,'POST',firstCommand)).duplicate,true);assert.deepEqual(await world(),before)
  await api(root+'/trade/apply',gm.token,'POST',firstCommand,409);await api(root+'/trade/apply',helper.token,'POST',{...firstCommand,previewId:'different'},409)
  await grant(['economy']);await api(root+'/trade/apply',helper.token,'POST',firstCommand,403);await grant(['economy','viewSecrets'])
  const p=await calculate(),b={previewId:p.id,generation:p.generation,commandKey:key()},responses=await Promise.all([api(root+'/trade/apply',gm.token,'POST',b),api(root+'/trade/apply',gm.token,'POST',b)])
  assert.equal(responses.filter(r=>r.duplicate).length,1);assert.equal((await world()).campaign.trade.wallets.find(w=>w.actorId===actorId).balances[0].amount,72)
 })
 await t.test('Продажа части стопки сохраняет состояние и не публикует товар автоматически',async()=>{
  const p=await calculate({direction:'sell',itemId:boughtId,quantity:1,unitPrice:5}),r=await apply(p),w=await world(),s=w.campaign.trade.merchants[0].stock.find(s=>s.item.id===r.receipt.summary.destinationItemId)
  assert.equal(w.characters.find(a=>a.id===actorId).rpg.inventory.find(i=>i.id===boughtId).quantity,1);assert.equal(s.item.durability,6);assert.equal(s.item.artifactCharge,3);assert.equal(s.visible,false);assert.deepEqual(s.prices,[]);assert.equal(r.receipt.summary.actorMoneyAfter,77)
 })
 await t.test('Поддельные поля, дроби, чужие ссылки, цена и нехватка средств не меняют мир',async()=>{
  const before=await world();for(const patch of [{unitPrice:8},{quantity:0},{quantity:.5},{quantity:100},{actorId:'foreign'},{merchantId:'foreign'},{currencyId:'foreign'},{unitPrice:1e12}])await calculate(patch,gm.token,patch.actorId?409:400)
  await calculate({},gm.token,400,{revision:before.revision,input:input(),reason:'x',world:before});await settings({kind:'merchant',entry:{...merchant,npcId:'foreign'}},gm.token,409)
  await settings({kind:'wallet',actorId,balances:[{currencyId:'foreign',amount:5}]},gm.token,400);await settings({kind:'currency',entry:{...currency,rate:1}},gm.token,400)
  await settings({kind:'merchant',mode:'edit',entry:{...merchant,id:'missing-old-merchant'}},gm.token,409);await settings({kind:'currency',mode:'create',entry:currency},gm.token,409);assert.deepEqual(await world(),before);const p=await calculate();await settings({kind:'wallet',actorId,balances:[{currencyId:'coin',amount:1}]});await apply(p,gm.token,409);await calculate({},gm.token,400)
  await settings({kind:'wallet',actorId,balances:[{currencyId:'coin',amount:77}]})
 })
 await t.test('Отказ аудита и квота атомарно откатывают деньги, экземпляры и подтверждения',async()=>{
  const p=await calculate(),b={previewId:p.id,generation:p.generation,commandKey:key()},before=await world(),db=f.server.db,original=db.transaction
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('trade-buy'))throw Error('TEST-TRADE-AUDIT');return tx.run(sql,args)}}))
  try{await apply(p,gm.token,500,b)}finally{db.transaction=original}
  assert.deepEqual(await world(),before);assert.equal(await db.get('SELECT command_key FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[id,b.commandKey]),undefined)
  const row=await db.get('SELECT payload_bytes FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[id,firstCommand.commandKey]);await db.run('UPDATE campaign_trade_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[4*1024*1024,id,firstCommand.commandKey])
  try{await apply(p,gm.token,409,b)}finally{await db.run('UPDATE campaign_trade_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[row.payload_bytes,id,firstCommand.commandKey])}
  assert.deepEqual(await world(),before);await apply(p,gm.token,200,b)
 })
 await t.test('Предпросмотр привязан к автору, сроку, версии и управлению; две разные команды не покупают дважды',async()=>{
  const p=await calculate();await apply(p,helper.token,409);await f.server.db.run('UPDATE campaign_trade_previews SET expires_at=? WHERE id=?',['2000-01-01T00:00:00.000Z',p.id]);await apply(p,gm.token,409)
  const next=await calculate();await f.server.db.run('UPDATE campaign_trade_previews SET controls_stamp=? WHERE id=?',['outdated',next.id]);await apply(next,gm.token,409)
  const current=await calculate(),responses=await Promise.all([f.request(root+'/trade/apply',gm.token,'POST',{previewId:current.id,generation:current.generation,commandKey:key()}),f.request(root+'/trade/apply',gm.token,'POST',{previewId:current.id,generation:current.generation,commandKey:key()})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409])
 })
 await t.test('Незавершённый сбор и переносимая работа защищают предметы; старый редактор не стирает кошельки',async()=>{
  const w=await world(),old=structuredClone(w);delete old.campaign.trade;await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:old},409)
  w.campaign.scenes=createScene(emptyScenes(),'scene','Scene','top');await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w})
  await api(root+'/declarations',gm.token,'POST',{revision:await revision(),sceneId:'scene',participantIds:[actorId],durationSeconds:5,allowReplace:true},201);await calculate({},gm.token,409)
  const pending=await world();pending.campaign.declarations.active.phase='cancelled';await api(root+'/world',gm.token,'PUT',{revision:pending.revision,world:pending})
  const work=await world();work.campaign.roundWork={version:1,entries:[{id:'work',actorId,sceneId:'scene',origin:{collectionId:'source',epoch:1,entryRevision:1,actionIndex:0},action:{kind:'wait',seconds:1,note:''},amount:{unit:'world-ms',total:{numerator:'1000',denominator:'1'},remaining:{numerator:'500',denominator:'1'}}}]}
  await api(root+'/world',gm.token,'PUT',{revision:work.revision,world:work});await calculate({},gm.token,409)
  const clear=await world();clear.campaign.roundWork.entries=[];await api(root+'/world',gm.token,'PUT',{revision:clear.revision,world:clear})
  point=(await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:await revision(),name:'Имущество до сделки',commandKey:crypto.randomUUID()})).checkpoint
 })
 await t.test('Игровая и полная копии, именованная точка и исторический повтор сохраняют согласованное имущество',async()=>{
  const copy=await api(root+'/backup',gm.token),saved=(await world()).campaign.trade,p=await calculate(),b={previewId:p.id,generation:p.generation,commandKey:key()};await apply(p,gm.token,200,b)
  const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:await revision(),checkpointId:point.id,reason:'Вернуть имущество до покупки'});await api(root+'/rounds/change/apply',gm.token,'POST',{previewId:rollback.id,generation:rollback.generation,commandKey:crypto.randomUUID()});assert.deepEqual((await world()).campaign.trade,saved)
  const before=await world();assert.equal((await apply(p,gm.token,200,b)).duplicate,true);assert.deepEqual(await world(),before)
  await api(root+'/restore',gm.token,'POST',{revision:await revision(),world:copy.world,bindings:copy.bindings});assert.deepEqual((await world()).campaign.trade,saved)
  const full=await api(root+'/archive',gm.token);await settings({kind:'wallet',actorId,balances:[{currencyId:'coin',amount:1000}]})
  const response=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+await revision(),{method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:Buffer.from(full.data,'base64')}),restore=await response.json();assert.equal(response.status,200,JSON.stringify(restore));await api(root+'/archive/apply',gm.token,'POST',{previewId:restore.id,generation:restore.generation,commandKey:crypto.randomUUID(),reason:'Вернуть имущество'});assert.deepEqual((await world()).campaign.trade,saved)
 })
 if(dialect==='postgres')await t.test('Обе новые таблицы приватны, RLS включён; повтор миграции не стирает подтверждения',async()=>{
  await f.restart();for(const table of ['campaign_trade_commands','campaign_trade_previews']){const row=await f.server.db.get('SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relname=?',['world6',table]);assert(row.relrowsecurity)}
  await f.server.db.run('CREATE ROLE trade_guest NOLOGIN');await f.server.db.run('GRANT USAGE ON SCHEMA world6 TO trade_guest');for(const table of ['campaign_trade_commands','campaign_trade_previews'])await assert.rejects(f.server.db.transaction(async tx=>{await tx.run('SET LOCAL ROLE trade_guest');await tx.get('SELECT * FROM world6.'+table)}),e=>e.code==='42501')
  assert(await f.server.db.get('SELECT command_key FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[id,firstCommand.commandKey]));assert((await view()).trade.merchants.length)
 })
})
