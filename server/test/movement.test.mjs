import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { createScene, emptyScenes, sceneObject } from '../generated/scenes.mjs'
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
})
