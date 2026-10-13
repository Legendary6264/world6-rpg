import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
import {emptyAbility,emptyItem} from '../generated/rpgSchema.mjs'
const fields={region:'torso',distanceM:999,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'PRIVATE-RULE-NOTE'}
for(const dialect of ['sqlite','postgres'])test('R03: расход, перенос, выпуск и артефакты · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('rules-owner'),player=await f.register('rules-player')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 await api(root+'/join',player.token,'POST')
 const character={...createDefaultCharacter(),id:'rules-source',name:'Герой'}
 await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
 const actorId=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id,world=()=>api(root+'/world',gm.token)
 await api(root+'/characters/'+actorId+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const first=await world(),hero=first.characters.find(c=>c.id===actorId);hero.rpg.formulas=[];hero.resources.mana={maximum:'50',current:'50'};hero.statistics.energyRegeneration='0'
 hero.rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'template',approved:true,name:'Свой заряд',mechanism:'effect',preparation:999,rangeM:10,duration:30,cost:{mana:7,shadow:0,stamina:0},modifiers:[{parameter:'movement',flat:3,percent:0}]}]
 hero.rpg.inventory=[{...emptyItem(),id:'artifact',templateId:'item-template',name:'Артефакт',quantity:1,durability:100,equipped:false,slot:'right',artifactLevel:1,artifactCharge:10,energyReserve:10,activationCost:3,activationDuration:30,activationModifiers:[{parameter:'movement',flat:2,percent:0}]}]
 first.characters.push({...createDefaultCharacter(),id:'PRIVATE-NPC',name:'PRIVATE-NPC-NAME'})
 first.campaign.scenes=createScene(emptyScenes(),'rules-scene','PRIVATE-SCENE','top')
 first.campaign.scenes.scenes[0].tokens=[{actorId,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}},{actorId:'PRIVATE-NPC',x:8,y:2,z:0,diameter:1,support:{kind:'ground'}}]
 const action=(stage,target={kind:'self'})=>({kind:'ability',abilityId:'spell',stage,target,note:'PRIVATE-ACTION-NOTE'})
 const item=operation=>({kind:'item',itemId:'artifact',quantity:1,target:{kind:'self'},operation,note:''})
 const collection=actions=>({id:crypto.randomUUID(),sceneId:'rules-scene',sceneName:'PRIVATE-SCENE',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:[actorId],entries:actions.length?[{actorId,actorName:'Герой',revision:1,status:'submitted',actions,resolved:actions.flatMap((a,index)=>a.target.kind==='contact'?[{index,actorId:'PRIVATE-NPC'}]:[]),submittedBy:player.user.id,submittedAt:new Date().toISOString(),note:''}]:[],history:[]})
 first.campaign.declarations={version:1,active:collection([action('prepare',{kind:'contact',id:'PRIVATE-CONTACT'})]),archive:[]}
 await api(root+'/world',gm.token,'PUT',{world:first,revision:first.revision})
 const owned=w=>w.characters.find(c=>c.id===actorId)
 const decision=(key,charge='')=>({key,kind:'ability',confirmed:true,binding:'unbound',charge,input:fields})
 const body=async(costs=[8000],rules,budgetMs=5000)=>{const w=await world(),c=w.campaign.declarations.active;return {revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:c.entries.map(e=>({actorId,entryRevision:e.revision,budgetMs,costs:costs.map((personalMs,index)=>({index,personalMs}))})),continuations:c.entries.length?[]:[{actorId,mode:'continue',budgetMs}],missingDecisions:[],interactionsConfirmed:false,rules:rules??[decision('new:'+actorId+':0')]}}}
 const calc=async(costs,rules,budget)=>api(root+'/rounds/calculate',gm.token,'POST',await body(costs,rules,budget))
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=(b,status=200)=>api(root+'/rounds/apply',gm.token,'POST',b,status)
 const install=async(actions,modify)=>{const w=await world();w.campaign.declarations.active=collection(actions);modify?.(w);await api(root+'/world',gm.token,'PUT',{world:w,revision:w.revision})}
 let preview,savedCommand,castId
 await t.test('Параметры и расчёт доступны мастеру; предпросмотр не списывает ресурс',async()=>{
  const before=await world(),bad=await body();bad.input.rules[0].confirmed=false
  await api(root+'/rounds/calculate',gm.token,'POST',bad,400);assert.deepEqual(await world(),before)
  await api(root+'/rounds/calculate',player.token,'POST',await body(),403)
  preview=await calc();assert.equal(preview.summary.rules[0].kind,'prepare');assert.equal(preview.summary.carried[0].remaining.numerator,'3000');assert.deepEqual(await world(),before)
 })
 await t.test('Начальный расход, перенос и исходный снимок атомарны; повтор не списывает снова',async()=>{
  savedCommand=command(preview);const response=await apply(savedCommand),after=await world(),a=owned(after);castId=a.rpg.casts[0].id
  assert.equal(a.resources.mana.current,'43');assert.equal(a.rpg.casts[0].status,'preparing');assert.equal(after.campaign.roundWork.entries[0].ability.castId,castId)
  const snapshot=JSON.parse((await f.server.db.get('SELECT before_json FROM round_receipts WHERE id=?',[response.receipt.id])).before_json);assert.equal(owned(snapshot).resources.mana.current,'50');assert.equal(owned(snapshot).rpg.casts.length,0)
  assert.equal((await apply(savedCommand)).duplicate,true);assert.deepEqual(await world(),after)
  const stale=structuredClone(after);delete owned(stale).rpg.casts[0].roundPreparation;await api(root+'/world',gm.token,'PUT',{world:stale,revision:after.revision},409);assert.deepEqual(await world(),after)
 })
 await f.restart()
 await t.test('Перезапуск и копия сохраняют расход/привязку; игрок не получает чужую цель и параметры',async()=>{
  assert.equal((await apply(savedCommand)).duplicate,true)
  const exported=await api(root+'/backup',gm.token),before=await world();assert.deepEqual(owned(exported.world).rpg.casts,owned(before).rpg.casts)
  await api(root+'/restore',gm.token,'POST',{world:exported.world,bindings:exported.bindings,revision:before.revision});await apply(savedCommand,409)
  const personal=await api(root+'/world',player.token),own=personal.characters.find(c=>c.id===actorId)
  assert.equal(own.charges[0].status,'preparing')
  for(const secret of ['PRIVATE-NPC','PRIVATE-CONTACT','PRIVATE-SCENE','PRIVATE-RULE-NOTE','PRIVATE-ACTION-NOTE','roundPreparation','targetActorId'])assert(!JSON.stringify(personal).includes(secret),secret)
 })
 await t.test('Продолжение без повторного расхода готовит непривязанный заряд после удаления прежней цели',async()=>{
  await install([],w=>{w.characters=w.characters.filter(c=>c.id!=='PRIVATE-NPC');w.campaign.scenes.scenes[0].tokens=w.campaign.scenes.scenes[0].tokens.filter(t=>t.actorId!=='PRIVATE-NPC')})
  const work=(await world()).campaign.roundWork.entries[0],p=await calc([], [decision(work.id)],3000);await apply(command(p))
  const after=await world();assert.equal(owned(after).resources.mana.current,'43');assert.equal(owned(after).rpg.casts[0].status,'ready');assert.equal(owned(after).rpg.casts[0].targetId,'');assert.equal(after.campaign.roundWork.entries.length,0)
  const master=await api(root+'/declarations',gm.token);assert.equal(master.actors.find(a=>a.id===actorId).casts[0].status,'ready')
 })
 await t.test('Отдельный выпуск создаёт эффект один раз и сохраняет ресурс; второй выпуск отклоняется',async()=>{
  await install([action('release')]);const p=await calc([1000],[decision('new:'+actorId+':0','cast:'+castId)]),b=command(p);await apply(b)
  let after=await world();assert.equal(owned(after).resources.mana.current,'43');assert.equal(owned(after).rpg.effects.length,1);assert.equal(owned(after).rpg.casts[0].status,'ended')
  await apply(b);assert.deepEqual(await world(),after)
  await install([action('release')]);after=await world();await api(root+'/rounds/calculate',gm.token,'POST',await body([1000],[decision('new:'+actorId+':0','cast:'+castId)]),400);assert.deepEqual(await world(),after)
 })
 await t.test('Снаряжение и активация проверяют порядок, расход собственной энергии и повтор команды',async()=>{
  await install([item('equip'),item('activate'),item('unequip')])
  const rules=['equip','activate','unequip'].map((operation,index)=>({key:'new:'+actorId+':'+index,kind:'item',confirmed:true,operation})),p=await calc([1000,1000,1000],rules),b=command(p)
  await apply(b);const after=await world(),i=owned(after).rpg.inventory[0];assert.equal(i.equipped,false);assert.equal(i.artifactCharge,7);assert.equal(i.quantity,1)
  await apply(b);assert.deepEqual(await world(),after)
 })
})
