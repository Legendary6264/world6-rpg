import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { createScene, emptyScenes, sceneObject } from '../generated/scenes.mjs'
import { physicsMaterialPreset } from '../generated/physicsMaterials.mjs'
const move = (x,y,z=0,support='ground') => ({kind:'move',route:[{x,y,z}],support,note:'PRIVATE-ROUTE'})
for (const dialect of ['sqlite','postgres']) test('Движение XYZ, сохранение и личная видимость · '+dialect,async t=>{
  const f=await fixture(t,dialect),{api}=f,gm=await f.register('owner'),player=await f.register('moving-player')
  const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
  await api(root+'/join',player.token,'POST')
  const character={...createDefaultCharacter(),id:'moving-source',name:'Герой'}
  await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
  const actorId=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id
  const world=()=>api(root+'/world',gm.token)
  await api(root+'/characters/'+actorId+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
  const npc={...createDefaultCharacter(),id:'PRIVATE-NPC',name:'PRIVATE-NPC-NAME'},first=await world()
  first.characters.push(npc);first.campaign.scenes=createScene(emptyScenes(),'moving-scene','PRIVATE-SCENE',dialect==='sqlite'?'top':'side')
  const scene=first.campaign.scenes.scenes[0]
  scene.tokens=[{actorId,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}},{actorId:npc.id,x:25,y:18,z:0,diameter:1,support:{kind:'ground'}}]
  const collection=actions=>({id:crypto.randomUUID(),sceneId:scene.id,sceneName:'PRIVATE-SCENE',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,
    participantIds:[actorId],entries:actions.length?[{actorId,actorName:'Герой',revision:1,status:'submitted',actions,resolved:[],submittedBy:player.user.id,submittedAt:new Date().toISOString(),note:''}]:[],history:[]})
  first.campaign.declarations={version:1,active:collection([move(10,2)]),archive:[]}
  await api(root+'/world',gm.token,'PUT',{world:first,revision:first.revision})
  await api(root+'/characters/'+actorId+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Поле',description:'',
    areas:[{id:'own-area',x:0,y:0,z:-5,width:20,depth:20,height:25,visible:true}],objects:[],contacts:[]}]}})
  const bodies=[{actorId,heightM:1.8},{actorId:npc.id,heightM:2}]
  const body=async(cost=10000,budget=5000)=>{const w=await world(),c=w.campaign.declarations.active;return {revision:w.revision,collectionId:c.id,epoch:c.epoch,
    input:{timings:c.entries.map(e=>({actorId,entryRevision:e.revision,budgetMs:budget,costs:[{index:0,personalMs:cost}]})),continuations:c.entries.length?[]:[{actorId,mode:'continue',budgetMs:budget}],
      missingDecisions:[],interactionsConfirmed:false,movement:{confirmed:true,bodies}}}}
  const calc=async(cost=10000,budget=5000)=>api(root+'/rounds/calculate',gm.token,'POST',await body(cost,budget))
  const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
  const apply=(b,status=200)=>api(root+'/rounds/apply',gm.token,'POST',b,status)
  const install=async(actions,modify)=>{const w=await world();w.campaign.declarations.active=collection(actions);modify?.(w);await api(root+'/world',gm.token,'PUT',{world:w,revision:w.revision})}
  const hero=w=>w.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===actorId)
  let preview,savedCommand
  await t.test('Размеры доступны только мастеру; неподтверждённый расчёт не пишет мир',async()=>{
    const before=await world(),params=await body();params.input.movement.confirmed=false
    await api(root+'/rounds/calculate',gm.token,'POST',params,400);assert.deepEqual(await world(),before)
    const master=await api(root+'/declarations',gm.token);assert.equal(master.movementBodies.length,2);assert.equal(master.movementBodies[0].diameter,1)
    await api(root+'/declarations',player.token,'GET',undefined,403)
    await api(root+'/rounds/calculate',player.token,'POST',await body(),403)
    preview=await calc();assert.deepEqual(preview.summary.movements[0].to,{x:6,y:2,z:0});assert.equal(preview.summary.movements[0].completed,false)
    assert.deepEqual(await world(),before)
  })
  await t.test('Частичное движение и снимок применяются атомарно; повтор не переносит второй раз',async()=>{
    savedCommand=command(preview);const response=await apply(savedCommand),after=await world()
    assert.equal(hero(after).x,6);assert.equal(after.campaign.seconds,5)
    assert.deepEqual(after.campaign.roundWork.entries[0].movement,{start:{x:2,y:2,z:0},diameter:1})
    assert.equal(after.campaign.roundWork.entries[0].amount.remaining.numerator,'5000')
    const snapshot=JSON.parse((await f.server.db.get('SELECT before_json FROM round_receipts WHERE id=?',[response.receipt.id])).before_json)
    assert.equal(hero(snapshot).x,2);assert.equal(snapshot.campaign.seconds,0)
    assert.equal((await apply(savedCommand)).duplicate,true);assert.deepEqual(await world(),after)
  })
  await t.test('Игрок получает собственную актуальную позицию без скрытого NPC и служебной геометрии',async()=>{
    const view=await api(root+'/characters/'+actorId+'/perception',player.token),self=view.map.contacts.find(c=>c.kind==='self')
    assert.equal(self.x,6);assert.equal(self.z,0);assert.equal(self.flying,false)
    const text=JSON.stringify(await api(root+'/world',player.token))+JSON.stringify(view)
    for(const secret of ['PRIVATE-NPC','PRIVATE-NPC-NAME','PRIVATE-SCENE','PRIVATE-ROUTE','movement','heightM']) assert(!text.includes(secret),secret)
  })
  await f.restart()
  await t.test('Перезапуск, копия и восстановление сохраняют исходную позицию; старое поколение блокируется',async()=>{
    assert.equal((await apply(savedCommand)).duplicate,true)
    const exported=await api(root+'/backup',gm.token),before=await world()
    assert.deepEqual(exported.world.campaign.roundWork,before.campaign.roundWork)
    await api(root+'/restore',gm.token,'POST',{world:exported.world,bindings:exported.bindings,revision:before.revision})
    assert.deepEqual((await world()).campaign.roundWork,before.campaign.roundWork);await apply(savedCommand,409)
    await install([]);const next=await calc(10000,2500);assert.deepEqual(next.summary.movements[0].from,{x:6,y:2,z:0});assert.deepEqual(next.summary.movements[0].to,{x:8,y:2,z:0})
    await apply(command(next));assert.equal(hero(await world()).x,8)
    await install([]);const end=await calc(10000,5000);await apply(command(end))
    assert.equal(hero(await world()).x,10);assert.equal((await world()).campaign.roundWork.entries.length,0)
  })
  await t.test('Высота и воздух видны владельцу; вид сцены и её координаты сохраняются',async()=>{
    await install([move(10,2,5,'air')]);const before=await world()
    await api(root+'/rounds/calculate',gm.token,'POST',await body(5000),400);assert.deepEqual(await world(),before)
    bodies[0].flightReason='PRIVATE-FLIGHT: подтверждённая левитация, условия и расходы проверены'
    const preview=await calc(5000);assert.deepEqual(preview.summary.movementApprovals,[{actorId,reason:bodies[0].flightReason}]);await apply(command(preview))
    const after=await world();assert.equal(hero(after).z,5);assert.equal(hero(after).support.kind,'air');assert.equal(after.campaign.scenes.scenes[0].view,dialect==='sqlite'?'top':'side')
    const self=(await api(root+'/characters/'+actorId+'/perception',player.token)).map.contacts.find(c=>c.kind==='self')
    assert.equal(self.z,5);assert.equal(self.flying,true)
    assert(!JSON.stringify(await api(root+'/world',player.token)).includes('PRIVATE-FLIGHT'))
  })
  await t.test('Столкновение со скрытым препятствием или неподвижным NPC не даёт частичной записи',async()=>{
    await install([move(18,2)],w=>{Object.assign(hero(w),{x:2,y:2,z:0,support:{kind:'ground'}});Object.assign(w.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===npc.id),{x:10,y:2,z:0})})
    let before=await world();await api(root+'/rounds/calculate',gm.token,'POST',await body(5000),400);assert.deepEqual(await world(),before)
    await install([move(18,2)],w=>{w.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===npc.id).y=18;w.campaign.scenes.scenes[0].objects.push({...sceneObject('wall','PRIVATE-WALL',{x:8,y:2,z:0}),height:3})})
    before=await world();await api(root+'/rounds/calculate',gm.token,'POST',await body(5000),400);assert.deepEqual(await world(),before)
  })
  await t.test('Игрок заявляет прыжок и подъём; позиции сохраняются, а подъём точно переигрывается',async()=>{
    const before=await world(), current=before.campaign.declarations.active, declarations=root+'/declarations'
    await api(declarations,gm.token,'PATCH',{collectionId:current.id,epoch:current.epoch,operation:'archive'})
    const edited=await world(), room=edited.campaign.scenes.scenes[0], anchorId='PRIVATE-CLIMBABLE'
    Object.assign(hero(edited),{x:2.45,y:2,z:0,diameter:.6,support:{kind:'ground'}})
    const actor=edited.characters.find(a=>a.id===actorId)
    actor.statistics.movement='1.5';actor.rpg.formulas=actor.rpg.formulas.filter(formula=>formula.parameter!=='movement')
    room.physics={version:1,gravityMs2:10,ambientTemperatureK:293.15,eventSounds:true}
    room.objects=[{...sceneObject('platform',anchorId,{x:4,y:3,z:0}),width:2,depth:4,height:1.2,canSupport:true,blocksMovement:true,
      physics:{version:1,material:physicsMaterialPreset('steel'),massKg:40,temperatureK:293.15,wetnessFraction:0,climbable:true}}]
    await api(root+'/world',gm.token,'PUT',{world:edited,revision:edited.revision})
    const legacy=await world();delete legacy.campaign.scenes.scenes[0].objects[0].physics.climbable
    await api(root+'/world',gm.token,'PUT',{world:legacy,revision:legacy.revision})
    assert.equal((await world()).campaign.scenes.scenes[0].objects[0].physics.climbable,true)
    delete bodies[0].flightReason
    async function declare(action){
      await api(declarations,gm.token,'POST',{sceneId:scene.id,participantIds:[actorId],durationSeconds:5,allowReplace:true,revision:(await world()).revision},201)
      const path=root+'/characters/'+actorId+'/declarations', d=await api(path,player.token)
      const request={collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:0,controlStamp:d.controlStamp}
      await api(path,player.token,'PUT',{...request,actions:[{...action,route:[action.route[0],{x:3,y:3,z:1}]}]},400)
      await api(path,player.token,'PUT',{...request,actions:[action]})
      assert.deepEqual((await api(path,player.token)).entry.actions,[action])
      await api(declarations,gm.token,'PATCH',{collectionId:d.collection.id,epoch:d.collection.epoch,operation:'close'})
    }
    await declare(move(2.45,3.2,0,'jump'))
    const starting=await world(), jump=await calc(600)
    assert.deepEqual(await world(),starting);assert(Math.abs(jump.summary.movements[0].terrain.apexZ-.45)<1e-10)
    assert.equal(jump.summary.falls.landings[0].cause,'jump')
    assert(jump.summary.sounds.some(sound=>sound.kind==='landing'))
    await apply(command(jump))
    const jumped=await world();assert.equal(hero(jumped).y,3.2)
    const c=jumped.campaign.declarations.active
    await api(declarations,gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'archive'})
    await declare(move(3.15,3.2,1.2,'climb'))
    const atFoot=await world(), climb=await calc(3000), applied=await apply(command(climb))
    const saved=await world(), getSelf=async()=>(await api(root+'/characters/'+actorId+'/perception',player.token)).map.contacts.find(x=>x.kind==='self')
    assert.deepEqual(hero(saved).support,{kind:'object',objectId:anchorId})
    assert.equal((await getSelf()).z,1.2)
    assert(!JSON.stringify(await api(root+'/world',player.token)).includes(anchorId))
    const receipt=applied.receipt.id, rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:saved.revision,receiptId:receipt,reason:'Проверка маршрута подъёма'})
    await api(root+'/rounds/change/apply',gm.token,'POST',command(rollback))
    const restored=await world();assert.deepEqual(hero(restored),hero(atFoot))
    const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:restored.revision,receiptId:receipt})
    assert.deepEqual(replay.summary.movements,climb.summary.movements)
    await apply(command(replay));assert.deepEqual(hero(await world()),hero(saved))
  })
  await t.test('Нырок, ожидание и всплытие сохраняют опору, воздух и приватность',async()=>{
    const declarations=root+'/declarations', path=root+'/characters/'+actorId+'/declarations'
    async function archive(){
      const c=(await world()).campaign.declarations.active
      await api(declarations,gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'archive'})
    }
    async function declare(action){
      await api(declarations,gm.token,'POST',{sceneId:scene.id,participantIds:[actorId],durationSeconds:5,allowReplace:true,revision:(await world()).revision},201)
      const d=await api(path,player.token)
      await api(path,player.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:0,controlStamp:d.controlStamp,actions:[action]})
      await api(declarations,gm.token,'PATCH',{collectionId:d.collection.id,epoch:d.collection.epoch,operation:'close'})
    }
    await archive()
    const edited=await world(), room=edited.campaign.scenes.scenes[0], waterId='PRIVATE-BASIN'
    room.physics={version:1,gravityMs2:10,ambientTemperatureK:293.15,aquatics:{version:1,swimSpeedMs:1.25,breathSeconds:6}}
    room.objects=[{...sceneObject('water',waterId,{x:5,y:2,z:0}),width:4,depth:2,height:3,blocksMovement:false,canSupport:false,
      water:{version:1,base:'pure',saltKg:0,sedimentKg:0}}]
    Object.assign(hero(edited),{x:2,y:2,z:0,support:{kind:'ground'}})
    await api(root+'/world',gm.token,'PUT',{world:edited,revision:edited.revision})
    const perception=()=>api(root+'/characters/'+actorId+'/perception',player.token)
    const self=view=>view.map.contacts.find(c=>c.kind==='self')
    const diver=w=>w.characters.find(a=>a.id===actorId)
    await declare(move(4,2,0,'swim'))
    const before=await world(), dive=await calc(2500)
    assert.deepEqual(await world(),before);assert.equal(dive.summary.movements[0].terrain.kind,'swim')
    assert(Math.abs(dive.summary.breathing[0].underwaterSeconds-3.75)<1e-5)
    await apply(command(dive))
    const legacy=await world(), spent=diver(legacy).body.breathUsedSeconds
    delete legacy.campaign.scenes.scenes[0].physics.aquatics
    delete diver(legacy).body.breathUsedSeconds
    await api(root+'/world',gm.token,'PUT',{world:legacy,revision:legacy.revision})
    assert.equal(diver(await world()).body.breathUsedSeconds,spent)
    const view=await perception()
    assert.equal(view.map.aquatics,true);assert.equal(self(view).support,'water');assert.equal(self(view).submerged,true)
    assert(Math.abs(self(view).breathRemainingSeconds-2.25)<1e-5)
    assert.doesNotMatch(JSON.stringify(view),/PRIVATE-BASIN|swimSpeedMs|breathUsedSeconds|heightM/)
    await archive()
    await declare({kind:'wait',seconds:5,note:''})
    const waiting=await body()
    waiting.input.timings[0].costs=[];delete waiting.input.movement
    const held=await api(root+'/rounds/calculate',gm.token,'POST',waiting), saved=await apply(command(held))
    const oxygen=diver(await world()).body.exposure.oxygen
    assert(oxygen>1);assert.equal(held.summary.breathing[0].breathUsedSeconds,6)
    await f.restart()
    assert.equal(self(await perception()).breathRemainingSeconds,0)
    const receiptId=saved.receipt.id
    const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId,reason:'Проверка расхода воздуха'})
    await api(root+'/rounds/change/apply',gm.token,'POST',command(rollback))
    const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId})
    assert.deepEqual(replay.summary.breathing,held.summary.breathing)
    await apply(command(replay));assert.equal(diver(await world()).body.exposure.oxygen,oxygen)
    await archive()
    await declare(move(4,2,2,'swim'))
    await apply(command(await calc(2000)))
    const emerged=self(await perception())
    assert.equal(emerged.z,2);assert.equal(emerged.support,'water');assert.equal(emerged.submerged,undefined)
    assert.equal(diver(await world()).body.breathUsedSeconds,null)
  })
})
