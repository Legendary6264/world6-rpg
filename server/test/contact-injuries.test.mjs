import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createDetailedAnatomy} from '../generated/anatomyModel.mjs'
import {emptyAbility,emptyItem} from '../generated/rpgSchema.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
import {physicsMaterialPreset} from '../generated/physicsMaterials.mjs'
import {defaultContactHazards,emptyContactProtection} from '../generated/contactProfiles.mjs'
import {FUSION_J_KG,waterReagents} from '../generated/waterPhysics.mjs'
import {unpackArchive} from '../campaign-archive-format.mjs'

for(const dialect of ['sqlite','postgres'])test('Контактные повреждения: цепь, экипировка, ожоги и переигровка · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('contact-gm')
 const mage=await f.register('contact-mage'),scout=await f.register('contact-scout')
 const {id}=await api('/lobbies',gm.token,'POST',{...lobbyBody,title:'Опасная переправа',visibility:'private'},201)
 const root='/lobbies/'+id,session=root+'/play/session',declarations=root+'/declarations'
 const world=()=>api(root+'/world',gm.token),route=id=>root+'/characters/'+id
 const {inviteCode}=await api(root,gm.token)
 async function join(user,id,name){
  await api('/lobbies/join',user.token,'POST',{code:inviteCode})
  await api('/characters/'+id,user.token,'PUT',{character:{...createDefaultCharacter(),id,name},revision:-1})
  const hero=await api(root+'/characters',user.token,'POST',{characterId:id},201)
  await api(route(hero.id)+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
  return hero.id
 }
 const mageId=await join(mage,'contact-mage-source','Маг'),scoutId=await join(scout,'contact-scout-source','Следопыт')
 const initial=await world(),hero=(state,id)=>state.characters.find(actor=>actor.id===id)
 const caster=hero(initial,mageId),target=hero(initial,scoutId)
 caster.rpg.formulas=[];caster.statistics.energyRegeneration='0';caster.resources.mana={maximum:'50',current:'50'}
 caster.rpg.abilities=[{...emptyAbility(),id:'contact-release',templateId:'contact-template',approved:true,name:'Стихийный выпуск',
  spatial:{shape:'point',includeCaster:false},mechanism:'effect',rangeM:15,cost:{mana:1,shadow:0,stamina:0}}]
 for(const region of ['leftFoot','rightFoot','rightHand'])Object.assign(target.body.parts[region],{current:20,maximum:20})
 target.body.anatomy=createDetailedAnatomy('humanoid',Object.keys(target.body.parts))
 target.body.anatomy.automatic=false
 const boot=(id,region,equipped,transmission)=>({...emptyItem(),id,templateId:id,name:id,slot:'body',covers:[region],quantity:1,durability:100,equipped,
  contactProtection:{...emptyContactProtection,wetOhm:1e6,heatTransmission:transmission,acidTransmission:transmission}})
 target.rpg.inventory=[boot('right-boot','rightFoot',true,0),boot('left-boot','leftFoot',false,1)]
 initial.campaign.scenes=createScene(emptyScenes(),'contact-crossing','Переправа','top')
 const room=state=>state.campaign.scenes.scenes[0],scene=room(initial),point=(x,y,z=0)=>({x,y,z})
 Object.assign(scene,{width:12,depth:8,minZ:-2,maxZ:4})
 scene.physics={version:1,gravityMs2:9.81,ambientTemperatureK:273.15,contactHazards:{...defaultContactHazards,electricJPerHp:1,heatKelvinSecondsPerHp:20},
  atmosphere:{oxygenFraction:.2095,smokeKg:0,steamKg:0,outsideTemperatureK:273.15,doorVentilation:false}}
 const body=material=>({version:1,material:physicsMaterialPreset(material),massKg:2,temperatureK:273.15,wetnessFraction:0})
 const water={...sceneObject('water','private-pool',point(4,3)),name:'PRIVATE-POOL',width:2,depth:2,height:.01,
  water:{version:1,base:'pure',saltKg:0,sedimentKg:0,enthalpyJKg:FUSION_J_KG}}
 const rail={...sceneObject('rock','private-rail',point(4.7,3.55,.7)),name:'PRIVATE-RAIL',width:.2,depth:.2,height:.6,physics:body('copper')}
 const platform={...sceneObject('platform','private-platform',point(8,3,-1)),name:'PRIVATE-PLATFORM',width:2,depth:1,height:1,physics:body('wood')}
 scene.objects=[water,rail,platform]
 scene.tokens=[[mageId,point(2,1.5)],[scoutId,point(4,3)]].map(([actorId,p])=>({actorId,...p,diameter:.6,support:{kind:'ground'}}))
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 for(const [id,user] of [[mageId,mage],[scoutId,scout]]){
  await api(route(id)+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{activeSceneId:scene.id,scenes:[
   {sceneId:scene.id,title:'Переправа',description:'',objects:[],contacts:[],areas:[{id:'floor',x:0,y:0,z:-2,width:12,depth:8,height:6,visible:true}]},
  ]}})
  await api(session+'/ready',user.token,'PUT',{ready:true})
 }
 await api(session+'/start',gm.token,'POST',{revision:(await world()).revision})
 await api(declarations,gm.token,'POST',{revision:(await world()).revision,sceneId:scene.id,
  participantIds:[mageId,scoutId],durationSeconds:12,allowReplace:true},201)
 const railPoint=point(4.7,3.55,1),waterPoint=point(3.5,3,.005),heatPoint=point(8,3,-.5)
 const shock={kind:'discharge',returnContact:waterPoint,voltageV:140,limitA:.5,durationMs:500,thresholdA:.01,
  grips:[{actorId:scoutId,objectId:rail.id,handRegion:'rightHand',footRegion:'leftFoot'}]}
 const action=(stage,target)=>({kind:'ability',abilityId:'contact-release',stage,target,note:''})
 const pair=p=>[action('prepare',{kind:'none'}),action('release',{kind:'point',point:p})]
 const wait=seconds=>({kind:'wait',seconds,note:''})
 const plans=[
  [mageId,mage,[...pair(railPoint),...pair(waterPoint),...pair(railPoint),wait(1.25),...pair(railPoint),...pair(waterPoint),...pair(waterPoint),...pair(heatPoint)]],
  [scoutId,scout,[wait(3.25),{kind:'item',itemId:'left-boot',quantity:1,operation:'equip',target:{kind:'self'},note:''},
   wait(4.75),{kind:'move',route:[point(8,3)],support:'ground',note:''}]],
 ]
 for(const [id,user,actions] of plans){
  const path=route(id)+'/declarations',v=await api(path,user.token)
  await api(path,user.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:0,controlStamp:v.controlStamp,actions})
 }
 const {id:collectionId,epoch}=(await world()).campaign.declarations.active
 await api(declarations,gm.token,'PATCH',{collectionId,epoch,operation:'close'})
 const before=await world(),key=i=>'new:'+mageId+':'+i
 const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',
  gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
 const effects=[
  [0,shock],[2,{kind:'add-substance',substance:'salt',massKg:.04}],[4,shock],[7,shock],
  [9,{kind:'add-substance',substance:'acid',massKg:.8*waterReagents.acid.molarMassKg}],
  [11,{kind:'add-substance',substance:'alkali',massKg:.8*waterReagents.alkali.molarMassKg}],[13,{kind:'heat',energyKJ:272}],
 ]
 const rule=(i,charge='')=>({key:key(i),kind:'ability',confirmed:true,binding:'unbound',charge,input:fields})
 const input={timings:plans.map(([actorId,,actions])=>({actorId,entryRevision:1,budgetMs:12000,
  costs:actions.flatMap(({kind},index)=>kind==='wait'?[]:[{index,personalMs:kind==='move'?2000:500}]),
 })),continuations:[],missingDecisions:[],interactionsConfirmed:true,rules:[
  ...effects.flatMap(([i,physics])=>[rule(i),{...rule(i+1,'prepare:'+key(i)),spatialConfirmed:true,physics}]),
  {key:'new:'+scoutId+':1',kind:'item',operation:'equip',confirmed:true},
 ],movement:{confirmed:true,bodies:scene.tokens.map(({actorId})=>({actorId,heightM:1.8}))}}
 const preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:before.revision,collectionId,
  epoch:before.campaign.declarations.active.epoch,input})
 assert.deepEqual(await world(),before)
 const [pure,bare,insulated]=preview.summary.rules.flatMap(r=>r.physics?.kind==='discharge'?[r.physics.circuit]:[])
 assert(pure.bodyPath[0].energyJ<1e-5)
 assert(bare.bodyPath[0].energyJ>6);assert.equal(bare.bodyPath[0].insulationOhm,0)
 assert(insulated.bodyPath[0].energyJ<1e-4);assert.equal(insulated.bodyPath[0].insulationOhm,1e6)
 const contact=(region,kind)=>preview.summary.contacts.find(r=>r.actorId===scoutId&&r.region===region&&r.kind===kind)
 assert(contact('rightHand','electric').damage>=3)
 assert.equal(contact('leftFoot','acid').damage,1);assert.equal(contact('rightFoot','acid').damage,0)
 assert(contact('rightFoot','heat').shieldedHp>0);assert.equal(contact('rightFoot','heat').damage,0)
 assert(contact('leftFoot','heat').damage>=1)
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 const apply=body=>api(root+'/rounds/apply',gm.token,'POST',body)
 const request=command(preview),{receipt}=await apply(request),saved=await world(),scoutAfter=hero(saved,scoutId)
 assert.equal(scoutAfter.body.parts.rightFoot.current,20)
 const damage=preview.summary.contacts.filter(r=>r.actorId===scoutId&&r.region==='leftFoot').reduce((n,r)=>n+r.damage,0)
 assert.equal(scoutAfter.body.parts.leftFoot.current,20-damage)
 assert.equal(scoutAfter.body.anatomy.structures.find(s=>s.region==='leftFoot'&&s.kind==='skin').current,100-damage)
 assert.equal(room(saved).objects[0].water.reagentMol,0)
 const personal=()=>api(route(scoutId)+'/perception',scout.token),view=await personal()
 assert.match(JSON.stringify(view.hero.sensations),/жжение.*покалывание/u)
 assert.doesNotMatch(JSON.stringify(view),/PRIVATE-|bodyResistanceOhm|contactDoses|reagentMol/)
 await f.restart()
 assert.equal((await apply(request)).duplicate,true);assert.deepEqual(await world(),saved)
 const archive=await api(root+'/archive',gm.token)
 assert.deepEqual(hero((await unpackArchive(Buffer.from(archive.data,'base64'))).world,scoutId),scoutAfter)
 const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:saved.revision,receiptId:receipt.id,reason:'Проверка контактных последствий'})
 await api(root+'/rounds/change/apply',gm.token,'POST',command(rollback))
 assert.equal(hero(await world(),scoutId).body.parts.leftFoot.current,20)
 const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:receipt.id})
 assert.deepEqual(replay.summary.contacts,preview.summary.contacts)
 await apply(command(replay))
 const replayed=await world()
 assert.deepEqual(hero(replayed,scoutId),scoutAfter)
 const collection=replayed.campaign.declarations.active
 await api(declarations,gm.token,'PATCH',{collectionId:collection.id,epoch:collection.epoch,operation:'archive'})
 const older=await world(),olderScout=hero(older,scoutId)
 delete olderScout.body.contactDoses;delete olderScout.rpg.inventory[0].contactProtection
 delete room(older).physics.contactHazards
 await api(root+'/world',gm.token,'PUT',{world:older,revision:older.revision})
 const preserved=await world()
 assert.deepEqual(hero(preserved,scoutId),scoutAfter);assert.deepEqual(room(preserved).physics.contactHazards,scene.physics.contactHazards)
 await api(session+'/finish',gm.token,'POST',{revision:preserved.revision,title:'Переправа закончена',summary:'Состояния героев записаны.',
  keepPending:false,commandKey:crypto.randomUUID()})
 for(const user of [mage,scout])assert.equal((await api(session,user.token)).phase,'finished')
})
