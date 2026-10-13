import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'CHARGE-PRIVATE-NOTE'}
for(const dialect of ['sqlite','postgres'])test('Удержание заряда: API, платёж и прерывание · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('charge-owner'),player=await f.register('charge-player')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id;await api(root+'/join',player.token,'POST')
 const character={...createDefaultCharacter(),id:'charge-source',name:'Маг'};await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
 const heroId=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id,route=root+'/characters/'+heroId,world=()=>api(root+'/world',gm.token),hero=w=>w.characters.find(c=>c.id===heroId)
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world(),owner=hero(initial);owner.rpg.formulas=[];owner.statistics.energyRegeneration='0';owner.resources.mana={maximum:'50',current:'50'}
 owner.rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'template',name:'Заряд',approved:true,mechanism:'effect',rangeM:10,cost:{mana:10,shadow:0,stamina:0},chargePolicy:{maxHoldSeconds:100,holdCost:{mana:2,shadow:0,stamina:0},requireConditions:true,refundPreparingPercent:50,refundReadyPercent:25}}]
 initial.campaign.scenes=createScene(emptyScenes(),'charge-scene','Scene','top');initial.campaign.scenes.scenes[0].tokens=[{actorId:heroId,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}}]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 const start=async()=>api(root+'/declarations',gm.token,'POST',{sceneId:'charge-scene',participantIds:[heroId],durationSeconds:5,allowReplace:true,revision:(await world()).revision},201),phase=async operation=>{const c=(await world()).campaign.declarations.active;return api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation})}
 const view=()=>api(route+'/declarations',player.token),send=async()=>{const v=await view();return api(route+'/declarations',player.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry?.revision??0,controlStamp:v.controlStamp,actions:[{kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''}]})}
 const rule=key=>({key,kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields})
 const decision=(castId,mode='keep',patch={})=>({actorId:heroId,castId,mode,confirmed:true,reason:mode==='interrupt'?'PRIVATE-REASON':'',conditionsConfirmed:true,canSpeak:true,...patch})
 const body=async mode=>{const w=await world(),c=w.campaign.declarations.active,work=w.campaign.roundWork?.entries[0],cast=hero(w).rpg.casts[0];return {revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:c.entries.map(e=>({actorId:heroId,entryRevision:e.revision,budgetMs:5000,costs:[{index:0,personalMs:8000}]})),continuations:work&&mode!=='interrupt'?[{actorId:heroId,mode:'continue',budgetMs:3000}]:[],missingDecisions:!c.entries.length&&!work||mode==='interrupt'?[{actorId:heroId,reason:'Мастер выбрал остановку'}]:[],interactionsConfirmed:false,rules:work&&mode!=='interrupt'?[rule(work.id)]:c.entries.length?[rule('new:'+heroId+':0')]:[],...(cast?{charges:[decision(cast.id,mode)]}:{})}}}
 const calc=async mode=>api(root+'/rounds/calculate',gm.token,'POST',await body(mode)),command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=(b,status=200)=>api(root+'/rounds/apply',gm.token,'POST',b,status)
 let interruptCommand,castId
 await t.test('Начальный платёж и перенос сохраняются без расхода готового удержания',async()=>{
  await start();await send();await phase('close');const before=await world(),p=await calc('keep');assert.deepEqual(await world(),before);await apply(command(p));const after=await world();castId=hero(after).rpg.casts[0].id
  assert.equal(hero(after).resources.mana.current,'40');assert.equal(hero(after).rpg.casts[0].status,'preparing');assert.deepEqual(hero(after).rpg.casts[0].roundPreparation.paidCost,{mana:10,shadow:0,stamina:0})
 })
 await f.restart()
 await t.test('Снимок переживает перезапуск; неподтверждённое/чужое решение не меняет мир',async()=>{
  await phase('archive');await start();await phase('close');const before=await world(),b=await body('keep');delete b.input.charges;await api(root+'/rounds/calculate',gm.token,'POST',b,400)
  b.input.charges=[decision(castId,'keep',{castId:'foreign'})];await api(root+'/rounds/calculate',gm.token,'POST',b,400);await api(root+'/rounds/calculate',player.token,'POST',await body('keep'),403);assert.deepEqual(await world(),before)
  assert.deepEqual(hero((await api(root+'/backup',gm.token)).world).rpg.casts,hero(before).rpg.casts)
  const stale=structuredClone(before);delete hero(stale).rpg.casts[0].roundPreparation.paidCost;await api(root+'/world',gm.token,'PUT',{world:stale,revision:before.revision},409)
  await apply(command(await calc('keep')));assert.equal(hero(await world()).rpg.casts[0].status,'ready');assert.equal(hero(await world()).resources.mana.current,'40')
 })
 await t.test('Секундный расход и приватность: игрок видит своё удержание, без решения мастера',async()=>{
  await phase('archive');await start();await phase('close');await apply(command(await calc('keep')));const w=await world();assert.equal(hero(w).resources.mana.current,'30')
  const personal=await api(root+'/world',player.token);assert.equal(personal.characters[0].charges[0].holding.remainingSeconds,95);assert.deepEqual(personal.characters[0].charges[0].holding.holdCost,{mana:2,shadow:0,stamina:0});assert(!JSON.stringify(personal).includes('CHARGE-PRIVATE-NOTE'))
  hero(w).rpg.casts[0].ability.condition='Condition';await api(root+'/world',gm.token,'PUT',{world:w,revision:w.revision});await phase('archive');await start();await phase('close');const updated=await body('keep');updated.input.charges[0].conditionsConfirmed=false;await api(root+'/rounds/calculate',gm.token,'POST',updated,400)
 })
 await t.test('Прерывание/повтор/копия атомарны и не возвращают расход удержания дважды',async()=>{
  const before=await world(),p=await calc('interrupt');assert.equal(p.summary.charges[0].refunded.mana,2.5);assert.deepEqual(await world(),before);interruptCommand=command(p)
  await apply(interruptCommand);assert.equal(hero(await world()).resources.mana.current,'32.5');assert.equal((await apply(interruptCommand)).duplicate,true);assert.equal(hero(await world()).resources.mana.current,'32.5')
  const receipt=await f.server.db.get('SELECT before_json FROM round_receipts WHERE lobby_id=? AND id=?',[id,(await apply(interruptCommand)).receipt.id]);assert.equal(hero(JSON.parse(receipt.before_json)).rpg.casts[0].status,'ready')
  await f.restart();assert.equal((await apply(interruptCommand)).duplicate,true)
  const saved=await world(),backup=await api(root+'/backup',gm.token);await api(root+'/restore',gm.token,'POST',{world:backup.world,bindings:backup.bindings,revision:saved.revision});assert.deepEqual(hero(await world()).rpg.casts,hero(saved).rpg.casts);await apply(interruptCommand,409)
  assert(!JSON.stringify(await api(root+'/world',player.token)).includes('PRIVATE-REASON'))
 })
})
