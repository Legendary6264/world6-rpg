import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {emptyItem,emptyConsumableEffect} from '../generated/rpgSchema.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
import {plannedObject,plannedItem} from '../generated/plannedInteractions.mjs'

const fields={region:'torso',distanceM:999,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
for(const dialect of ['sqlite','postgres'])test('Предметы союзнику и план взаимодействий · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('context-owner'),players=[await f.register('context-one'),await f.register('context-two')]
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id,world=()=>api(root+'/world',gm.token),heroes=[]
 for(const [index,player] of players.entries()){
  await api(root+'/join',player.token,'POST')
  const character={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Участник '+index};character.rpg.formulas=[];character.statistics.energyRegeneration='0';character.resources.mana={maximum:'30',current:'20'}
  character.rpg.inventory=index?[{...emptyItem(),id:'foreign',templateId:'',name:'PRIVATE-FOREIGN-ITEM',quantity:1,durability:100,equipped:false}]:[
   {...emptyItem(),id:'potion',templateId:'',name:'Настой',description:'PRIVATE-DESCRIPTION',quantity:2,durability:100,category:'consumable',equipped:false,slot:'none',consumable:{...emptyConsumableEffect(),targets:'creature',rangeM:20,restore:{mana:4,shadow:0,stamina:0},cureLabels:['PRIVATE-EFFECT']}},
   {...emptyItem(),id:'artifact',templateId:'',name:'Кольцо',quantity:1,durability:100,equipped:false,slot:'right',artifactLevel:1,artifactCharge:5,energyReserve:5,activationCost:2,activationModifiers:[{parameter:'movement',flat:1,percent:0}]}
  ]
  await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
  const hero=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id;heroes.push(hero)
  await api(root+'/characters/'+hero+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 const initial=await world();initial.campaign.scenes=createScene(emptyScenes(),'context-scene','PRIVATE-SCENE','top')
 const scene=initial.campaign.scenes.scenes[0];scene.tokens=heroes.map((actorId,index)=>({actorId,x:2+index,y:2,z:0,diameter:1,support:{kind:'ground'}}))
 scene.objects.push({...sceneObject('door','known-door',{x:4,y:4,z:0}),name:'Дверь',locked:true})
 await api(root+'/world',gm.token,'PUT',{revision:initial.revision,world:initial})
 for(const [index,hero] of heroes.entries())await api(root+'/characters/'+hero+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Площадка',description:'',areas:[{id:'area',x:0,y:0,z:-1,width:10,depth:10,height:10,visible:true}],objects:[{objectId:'known-door',visible:true}],contacts:[{actorId:heroes[1-index],kind:'identified',label:'Союзник',signs:'',showHeight:true,point:{x:3-index,y:2,z:0},radius:1}]}]}})
 await api(root+'/declarations',gm.token,'POST',{revision:(await world()).revision,sceneId:scene.id,participantIds:heroes,durationSeconds:5,allowReplace:true},201)
 const route=index=>root+'/characters/'+heroes[index],view=index=>api(route(index)+'/declarations',players[index].token)
 let options,actions,projection
 await t.test('Сводки собственных предметов приватны и ничего не меняют в мире',async()=>{
  const before=await world(),own=await view(0),other=await view(1);options=own.options
  assert.equal(options.items.find(i=>i.id==='potion').use.consumable.targets,'creature');assert.equal(options.items.find(i=>i.id==='artifact').use.artifact.charge,5)
  assert(!JSON.stringify(own).includes('PRIVATE-FOREIGN-ITEM'));assert(!JSON.stringify(other).includes('Кольцо'))
  for(const secret of ['PRIVATE-EFFECT','PRIVATE-DESCRIPTION','PRIVATE-SCENE','activationModifiers','templateId'])assert(!JSON.stringify(own).includes(secret),secret)
  assert.deepEqual(await world(),before)
 })
 await t.test('План союзнику, артефакту и двери сохраняется без преждевременного исполнения',async()=>{
  const target={kind:'contact',id:options.targets.find(t=>t.kind==='contact').id},item=(itemId,operation,target={kind:'self'})=>({kind:'item',itemId,operation,target,quantity:1,note:''})
  actions=[item('potion','consume',target),item('artifact','equip'),item('artifact','activate'),...['unlock','open','close','lock'].map(operation=>({kind:'interact',operation,target:{kind:'object',id:'known-door'},note:''}))]
  const perceived=await api(route(0)+'/perception',players[0].token);projection=plannedObject(perceived.map.objects.find(o=>o.id==='known-door'),actions)
  assert.equal(projection.changes,4);assert.deepEqual(projection.issues,[])
  const before=await world()
  const own=await view(0)
  await api(route(0)+'/declarations',players[0].token,'PUT',{collectionId:own.collection.id,epoch:own.collection.epoch,baseVersion:0,controlStamp:own.controlStamp,commandKey:'declaration:'+crypto.randomUUID(),actions:[actions[0],actions[0],actions[0]]},409)
  assert.equal((await view(0)).entry,null);assert.deepEqual((await world()).characters,before.characters)
  for(const [index,player] of players.entries()){
   const v=await view(index);await api(route(index)+'/declarations',player.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:0,controlStamp:v.controlStamp,commandKey:'declaration:'+crypto.randomUUID(),actions:index?[{kind:'wait',seconds:5,note:''}]:actions})
  }
  const after=await world();assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.campaign.scenes,before.campaign.scenes);assert.equal(after.campaign.seconds,before.campaign.seconds)
  const sent=await view(0);assert.deepEqual(sent.entry.actions[0].target,target);assert.equal(sent.options.items.find(i=>i.id==='potion').quantity,2)
 })
 await f.restart()
 await t.test('После расчёта и применения прогноз совпадает с исполнителем; повтор не расходует предметы дважды',async()=>{
  const d=await api(root+'/declarations',gm.token);await api(root+'/declarations',gm.token,'PATCH',{collectionId:d.declarations.active.id,epoch:d.declarations.active.epoch,operation:'close'})
  const w=await world(),c=w.campaign.declarations.active,rules=actions.flatMap((a,index)=>a.kind==='item'?[{key:'new:'+heroes[0]+':'+index,kind:'item',operation:a.operation,confirmed:true,...(a.operation==='consume'?{input:fields}:{})}]:[])
  const input={timings:heroes.map((actorId,index)=>({actorId,entryRevision:1,budgetMs:5000,costs:index?[]:actions.map((_,index)=>({index,personalMs:500}))})),continuations:[],missingDecisions:[],interactionsConfirmed:true,rules}
  const p=await api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input}),command={previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}
  assert.deepEqual((await world()).characters,w.characters)
  await api(root+'/rounds/apply',gm.token,'POST',command);assert.equal((await api(root+'/rounds/apply',gm.token,'POST',command)).duplicate,true)
  const after=await world(),owner=after.characters.find(a=>a.id===heroes[0]),ally=after.characters.find(a=>a.id===heroes[1])
  assert.equal(owner.rpg.inventory.find(i=>i.id==='potion').quantity,1);assert.equal(ally.resources.mana.current,'24')
  assert.equal(owner.rpg.inventory.find(i=>i.id==='artifact').artifactCharge,plannedItem(options.items.find(i=>i.id==='artifact'),actions).use.artifact.charge)
  const door=after.campaign.scenes.scenes[0].objects[0];assert.equal(door.open,projection.object.open);assert.equal(door.locked,projection.object.locked)
  assert.equal(after.campaign.seconds,w.campaign.seconds+5)
 })
})
