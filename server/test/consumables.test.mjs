import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
import {emptyItem,emptyConsumableEffect} from '../generated/rpgSchema.mjs'
const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'DOSE-PRIVATE-NOTE'}
for(const dialect of ['sqlite','postgres'])test('R03 расходники: заявление, перенос и атомарное применение · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('dose-owner'),player=await f.register('dose-player')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 await api(root+'/join',player.token,'POST')
 const character={...createDefaultCharacter(),id:'dose-source',name:'Лекарь'}
 await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
 const heroId=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id,route=root+'/characters/'+heroId
 const world=()=>api(root+'/world',gm.token),hero=w=>w.characters.find(c=>c.id===heroId),npc=w=>w.characters.find(c=>c.id==='DOSE-SECRET-ACTOR')
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world(),owner=hero(initial);owner.rpg.formulas=[];owner.statistics.energyRegeneration='0';owner.resources.mana={maximum:'50',current:'40'}
 owner.rpg.inventory=[{...emptyItem(),id:'dose',templateId:'dose-template',name:'Доза',category:'consumable',quantity:2,durability:100,equipped:false,
  consumable:{...emptyConsumableEffect(),targets:'creature',rangeM:10,restore:{mana:7,shadow:0,stamina:0},healAmount:10,condition:'Подготовленная доза'}}]
 const target={...createDefaultCharacter(),id:'DOSE-SECRET-ACTOR',name:'DOSE-SECRET-NAME'};target.rpg.formulas=[];target.statistics.energyRegeneration='0';target.resources.mana={maximum:'50',current:'40'};Object.assign(target.body.parts.torso,{maximum:100,current:50})
 initial.characters.push(target);initial.campaign.scenes=createScene(emptyScenes(),'dose-scene','Сцена','top')
 initial.campaign.scenes.scenes[0].tokens=[{actorId:heroId,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}},{actorId:target.id,x:8,y:2,z:0,diameter:1,support:{kind:'ground'}}]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 await api(route+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{activeSceneId:'dose-scene',scenes:[{sceneId:'dose-scene',title:'Двор',description:'',areas:[{id:'area',x:0,y:0,z:-5,width:20,depth:20,height:25,visible:true}],objects:[],contacts:[{actorId:target.id,kind:'silhouette',label:'Раненый',signs:'',showHeight:false,point:{x:8,y:2,z:0},radius:1}]}]}})
 const start=async()=>api(root+'/declarations',gm.token,'POST',{sceneId:'dose-scene',participantIds:[heroId],durationSeconds:5,allowReplace:true,revision:(await world()).revision},201)
 const phase=async operation=>{const c=(await world()).campaign.declarations.active;return api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation})}
 const view=()=>api(route+'/declarations',player.token)
 const send=async(action,status=200)=>{const v=await view();return api(route+'/declarations',player.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry?.revision??0,controlStamp:v.controlStamp,actions:[action]},status)}
 const decision=key=>({key,kind:'item',confirmed:true,operation:'consume',input:fields})
 const body=async(cost=8000)=>{const w=await world(),c=w.campaign.declarations.active,work=w.campaign.roundWork?.entries[0];return {revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:c.entries.map(e=>({actorId:heroId,entryRevision:e.revision,budgetMs:5000,costs:[{index:0,personalMs:cost}]})),continuations:work?[{actorId:heroId,mode:'continue',budgetMs:3000}]:[],missingDecisions:[],interactionsConfirmed:false,rules:[decision(work?.id??'new:'+heroId+':0')]}}}
 const calculate=async cost=>api(root+'/rounds/calculate',gm.token,'POST',await body(cost)),command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=b=>api(root+'/rounds/apply',gm.token,'POST',b)
 let contact,firstCommand
 await t.test('Игрок заявляет только свой предмет и раскрытый контакт; внутренний ID не принимается',async()=>{
  await start();assert.deepEqual((await api(root+'/declarations',gm.token)).actors.find(a=>a.id===heroId).items[0].consumable,owner.rpg.inventory[0].consumable);const v=await view();contact=v.options.targets.find(t=>t.kind==='contact').id
  const action={kind:'item',itemId:'dose',quantity:1,operation:'consume',target:{kind:'contact',id:contact},note:''}
  await send({...action,itemId:'foreign-dose'},409);await send({...action,target:{kind:'contact',id:target.id}},409);await send({...action,quantity:3},409)
  await send(action);const saved=(await world()).campaign.declarations.active.entries[0];assert.equal(saved.resolved[0].actorId,target.id);assert.equal(saved.actions[0].operation,'consume')
  assert(!JSON.stringify(await view()).includes(target.id));await phase('close')
 })
 await t.test('Частичная работа не списывает дозу; расчёт закрыт от игрока и повтор не меняет мир',async()=>{
  const before=await world();await api(root+'/rounds/calculate',player.token,'POST',await body(),403)
  const p=await calculate();assert.deepEqual(await world(),before);assert.equal(p.summary.carried[0].remaining.numerator,'3000')
  firstCommand=command(p);await apply(firstCommand);const after=await world();assert.equal(hero(after).rpg.inventory[0].quantity,2);assert.equal(npc(after).resources.mana.current,'40');assert.equal(after.campaign.roundWork.entries[0].targetActorId,target.id)
  await apply(firstCommand);assert.deepEqual(await world(),after)
 })
 await f.restart()
 await t.test('Перезапуск и копия сохраняют дозу/эффект/цель; чужие сведения не попадают игроку',async()=>{
  assert.equal((await apply(firstCommand)).duplicate,true)
  const before=await world(),backup=await api(root+'/backup',gm.token);assert.deepEqual(hero(backup.world).rpg.inventory,hero(before).rpg.inventory);assert.deepEqual(backup.world.campaign.roundWork,before.campaign.roundWork)
  const personal=JSON.stringify(await api(root+'/world',player.token));for(const secret of [target.id,target.name,'targetActorId','DOSE-PRIVATE-NOTE'])assert(!personal.includes(secret),secret)
 })
 await t.test('Продолжение лечит и восстанавливает только выбранную цель, списывает один раз и пишет снимок',async()=>{
  await phase('archive');await start();await phase('close');const before=await world(),p=await calculate(),b=command(p);assert.deepEqual(await world(),before)
  const result=await apply(b),after=await world();assert.equal(hero(after).rpg.inventory[0].quantity,1);assert.equal(hero(after).resources.mana.current,'40');assert.equal(npc(after).resources.mana.current,'47');assert.equal(npc(after).body.parts.torso.current,60);assert.equal(after.campaign.roundWork.entries.length,0)
  const stored=JSON.parse((await f.server.db.get('SELECT before_json FROM round_receipts WHERE id=?',[result.receipt.id])).before_json);assert.equal(hero(stored).rpg.inventory[0].quantity,2);assert.equal(npc(stored).body.parts.torso.current,50)
  await apply(b);assert.deepEqual(await world(),after);const backup=await api(root+'/backup',gm.token);assert.deepEqual(hero(backup.world).rpg.inventory[0].consumable,hero(after).rpg.inventory[0].consumable)
  await phase('archive');await start();await send({kind:'item',itemId:'dose',quantity:1,operation:'consume',target:{kind:'contact',id:contact},note:''});await phase('close')
  const last=command(await calculate(1000));await apply(last);const finished=await world();assert.equal(hero(finished).rpg.inventory.length,0);assert.equal(npc(finished).resources.mana.current,'50');assert.equal(npc(finished).body.parts.torso.current,70);await apply(last);assert.deepEqual(await world(),finished)
 })
})
