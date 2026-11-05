import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
import {physicsMaterialPreset} from '../generated/physicsMaterials.mjs'

for(const dialect of ['sqlite','postgres'])test('Физические профили: хранение, старые клиенты и приватность · '+dialect,async t=>{
  const {api,register,restart}=await fixture(t,dialect),gm=await register('owner'),player=await register('physics-player'),helper=await register('physics-helper')
  const lobby=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+lobby.id
  await api(root+'/join',player.token,'POST');await api(root+'/join',helper.token,'POST')
  const scenes=createScene(emptyScenes(),'physical-scene','Физический полигон','top'),scene=scenes.scenes[0]
  scene.physics={version:1,gravityMs2:9.81,ambientTemperatureK:293.15,backgroundNoiseDb:35}
  scene.objects=[{...sceneObject('crate','physical-object',{x:5,y:5,z:0}),width:1,depth:1,height:1,physics:{version:1,material:{...physicsMaterialPreset('water-pure'),note:'PRIVATE-PHYSICS-MATERIAL'},massKg:2,temperatureK:298.15,wetnessFraction:.25,noiseLevelDbAt1m:50}}]
  const revision=async()=>(await api(root,gm.token)).revision
  await api(root+'/scenes',gm.token,'PUT',{scenes,revision:await revision()})
  const stored=async()=>(await api(root+'/scenes',gm.token)).scenes.scenes[0]

  await t.test('Физика сохраняется в SQLite/PostgreSQL и после перезапуска API',async()=>{
    assert.deepEqual(await stored(),scene);await restart();assert.deepEqual(await stored(),scene)
    const full=await api(root+'/world',gm.token);assert.deepEqual(full.campaign.scenes.scenes[0],scene)
  })
  await t.test('Обычный игрок не получает физические профили и не может их изменить',async()=>{
    const view=await api(root+'/world?view=player',player.token);assert.equal(view.campaign.scenes,undefined);assert(!JSON.stringify(view).includes('PRIVATE-PHYSICS-MATERIAL'))
    await api(root+'/scenes',player.token,'GET',undefined,403);await api(root+'/scenes',player.token,'PUT',{scenes,revision:await revision()},403)
  })
  await t.test('Делегированный редактор сцен сохраняет профили без изменения времени',async()=>{
    await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
    await api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{permissions:['scenes'],revision:await revision()})
    const full=await api(root+'/world',gm.token),snapshot=await api(root+'/scenes',helper.token);snapshot.scenes.scenes[0].objects[0].x=7
    await api(root+'/scenes',helper.token,'PUT',{scenes:snapshot.scenes,revision:snapshot.revision})
    const after=await api(root+'/world',gm.token);assert.equal(after.campaign.seconds,full.campaign.seconds);assert.deepEqual(after.characters,full.characters);assert.equal((await stored()).objects[0].physics.massKg,2)
  })
  await t.test('Прежний клиент сцен не стирает поля, которых он не знает',async()=>{
    const snapshot=await api(root+'/scenes',gm.token);delete snapshot.scenes.scenes[0].physics;delete snapshot.scenes.scenes[0].objects[0].physics;snapshot.scenes.scenes[0].objects[0].x=8
    await api(root+'/scenes',gm.token,'PUT',{scenes:snapshot.scenes,revision:snapshot.revision});const result=await stored()
    assert.equal(result.objects[0].x,8);assert.deepEqual(result.physics,scene.physics);assert.deepEqual(result.objects[0].physics,scene.objects[0].physics)
  })
  await t.test('Прежний полный редактор сохраняет новые поля внутри прежних профилей',async()=>{
    const snapshot=await api(root+'/world',gm.token),previous=snapshot.campaign.scenes.scenes[0]
    delete previous.physics.backgroundNoiseDb;delete previous.objects[0].physics.noiseLevelDbAt1m
    await api(root+'/world',gm.token,'PUT',{world:snapshot,revision:snapshot.revision});const result=await stored()
    assert.deepEqual(result.physics,scene.physics);assert.deepEqual(result.objects[0].physics,scene.objects[0].physics)
  })
  await t.test('Неизвестная версия, отрицательная масса и лишние свойства отвергаются атомарно',async()=>{
    const before=await api(root+'/scenes',gm.token)
    for(const patch of [{version:2},{massKg:-1},{temperatureK:-1},{wetnessFraction:2},{noiseLevelDbAt1m:161},{hiddenFormula:'secret'}]){
      const copy=structuredClone(before.scenes);Object.assign(copy.scenes[0].objects[0].physics,patch)
      await api(root+'/scenes',gm.token,'PUT',{scenes:copy,revision:before.revision},400)
    }
    assert.deepEqual(await api(root+'/scenes',gm.token),before)
  })
  await t.test('Явное снятие и восстановление резервной копии возвращают точные профили',async()=>{
    const backup=await api(root+'/backup',gm.token),snapshot=await api(root+'/scenes',gm.token);snapshot.scenes.scenes[0].physics=null;snapshot.scenes.scenes[0].objects[0].physics=null
    await api(root+'/scenes',gm.token,'PUT',{scenes:snapshot.scenes,revision:snapshot.revision});assert.equal((await stored()).objects[0].physics,null)
    await api(root+'/restore',gm.token,'POST',{world:backup.world,bindings:[],revision:await revision()})
    assert.deepEqual((await stored()).physics,scene.physics);assert.deepEqual((await stored()).objects[0].physics,scene.objects[0].physics)
  })
})
