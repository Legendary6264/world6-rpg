import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { createScene, emptyScenes, sceneObject, placeSceneToken } from '../generated/scenes.mjs'
import { emptyAbility } from '../generated/rpgSchema.mjs'
import { parseLobbyBackup } from '../generated/lobbyBackup.mjs'
import {isKnowledgeAck,knowledgeEntryId} from '../generated/knowledgeCommands.mjs'
import {invalidateRoundGeneration} from '../rounds.mjs'
import {physicsMaterialPreset} from '../generated/physicsMaterials.mjs'

async function setup(t, dialect) {
  const f = await fixture(t, dialect), { api } = f
  const gm = await f.register('owner'), player = await f.register('perception-player'), other = await f.register('perception-other'), helper = await f.register('perception-helper')
  const { id } = await api('/lobbies', gm.token, 'POST', lobbyBody, 201), root = '/lobbies/' + id
  for (const u of [player, other, helper]) await api(root + '/join', u.token, 'POST')
  const heroes = []
  for (const u of [player, other]) {
    const hero = { ...createDefaultCharacter(), id: crypto.randomUUID(), name: u === player ? 'Первый герой' : 'Второй герой' }
    await api('/characters/' + hero.id, u.token, 'PUT', { character: hero, revision: -1 })
    heroes.push((await api(root + '/characters', u.token, 'POST', { characterId: hero.id }, 201)).id)
  }
  const npc = { ...createDefaultCharacter(), id: 'secret-npc-id', name: 'ТАЙНЫЙ НОСИТЕЛЬ КАНОНА' }
  npc.profile.portrait = 'portrait-mage'; npc.profile.biography = 'СЕКРЕТНЫЙ ЛИСТ'
  const world = await api(root + '/world', gm.token)
  const scenes = createScene(emptyScenes(), 'map-scene', 'ВНУТРЕННЕЕ ИМЯ СЦЕНЫ', 'top'), scene = scenes.scenes[0]
  scene.description = 'ЗАКРЫТОЕ ОПИСАНИЕ'; scene.background = 'data:image/png;base64,U0VDUkVU'
  scene.objects.push({ ...sceneObject('door', 'visible-door', { x: 4, y: 4, z: 0 }), name: 'Дверь' }, { ...sceneObject('crate', 'secret-box', { x: 14, y: 14, z: 0 }), name: 'СКРЫТАЯ КАЗНА' })
  let placed = placeSceneToken(scenes, scene.id, { actorId: heroes[0], x: 1, y: 1, z: 0, diameter: 1, support: { kind: 'ground' } })
  placed = placeSceneToken(placed, scene.id, { actorId: npc.id, x: 8, y: 7, z: 3, diameter: 2, support: { kind: 'air' } })
  await api(root + '/world', gm.token, 'PUT', { world: { ...world, characters: [...world.characters, npc], campaign: { ...world.campaign, scenes: placed } }, revision: world.revision })
  await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'ASSISTANT' })
  const revision = async () => (await api(root, gm.token)).revision
  const route = heroId => root + '/characters/' + heroId
  const see = (token = player.token, heroId = heroes[0]) => api(route(heroId) + '/perception', token)
  const grant = async permissions => api(root + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { permissions, revision: await revision() })
  const draft = () => ({ activeSceneId: scene.id, scenes: [{ sceneId: scene.id, title: 'Двор', description: 'Известная местность',
    areas: [{ id: 'area', x: 0, y: 0, z: -5, width: 12, depth: 12, height: 25, visible: true }], objects: [{ objectId: 'visible-door', visible: true }],
    contacts: [{ actorId: npc.id, kind: 'silhouette', label: '', signs: 'Потрёпанный плащ', showHeight: false, point: { x: 3, y: 3, z: 0 }, radius: 2 }] }] })
  const disclose = async (d = draft(), heroId = heroes[0], status = 200, token = gm.token) => api(route(heroId) + '/disclosure', token, 'PUT', { draft: d, revision: await revision() }, status)
  return { ...f, get server() { return f.server }, gm, player, other, helper, root, heroes, npc, scene, revision, route, see, grant, draft, disclose }
}

for (const dialect of ['sqlite', 'postgres']) {
  test('Воздух комнат: два игрока, открытие двери, сохранение и переигровка · '+dialect,async t=>{
    const f=await setup(t,dialect),{api,gm,player,other,root}=f
    const [first,second]=f.heroes,route=f.route(second),world=()=>api(root+'/world',gm.token)
    for(const hero of f.heroes)await api(f.route(hero)+'/review',gm.token,'POST',{revision:await f.revision(),decision:'approve',note:''})
    const initial=await world(),scenes=initial.campaign.scenes,scene=scenes.scenes[0]
    Object.assign(scene,{width:12,depth:8,minZ:0,maxZ:3})
    const clean={oxygenFraction:.2095,smokeKg:0,steamKg:0,fogKg:0}
    scene.physics={version:1,gravityMs2:9.81,ambientTemperatureK:293.15,vision:{ambientLux:3,detectionLux:1},
      atmosphere:{...clean,outsideTemperatureK:293.15,doorVentilation:true},
      airRooms:[
        {id:'forge-private',name:'Кузня',min:{x:0,y:0,z:0},max:{x:6,y:8,z:3},ambientTemperatureK:300,
          air:{...clean,smokeKg:.06,steamKg:3.8,fogKg:.3,oxygenFraction:.17}},
        {id:'hall-private',name:'Коридор',min:{x:6,y:0,z:0},max:{x:12,y:8,z:3},ambientTemperatureK:293.15,air:{...clean}},
      ]}
    const door=scene.objects[0]
    Object.assign(door,{x:6,y:4,width:.2,depth:7.5,height:2.8,open:false})
    Object.assign(scene.objects[1],{x:11,y:7})
    Object.assign(scene.tokens[0],{x:2,y:4})
    Object.assign(scene.tokens[1],{x:10,y:4,z:0,support:{kind:'ground'}})
    scene.tokens.push({...scene.tokens[0],actorId:second,x:6.55})
    await api(root+'/scenes',gm.token,'PUT',{scenes,revision:initial.revision})
    const legacy=await world(),oldScene=legacy.campaign.scenes.scenes[0]
    delete oldScene.physics.airRooms;delete oldScene.physics.atmosphere.fogKg
    await api(root+'/world',gm.token,'PUT',{world:legacy,revision:legacy.revision})
    assert.deepEqual((await world()).campaign.scenes.scenes[0].physics,scene.physics)
    for(const actorId of [first,second]){
      const draft=f.draft(),known=draft.scenes[0]
      Object.assign(known.areas[0],{z:0,depth:8,height:3})
      Object.assign(known.contacts[0],{kind:'identified',showHeight:true})
      await f.disclose(draft,actorId)
    }
    const maps=async()=>[(await f.see(player.token,first)).map,(await f.see(other.token,second)).map]
    const [dirty,clear]=await maps(),npc=clear.contacts.find(c=>c.kind==='identified')
    assert(npc && dirty.smoke && dirty.fog);assert.equal(clear.smoke,undefined);assert.equal(clear.fog,undefined)
    assert.deepEqual(dirty.contacts.map(c=>c.kind),['self'])
    assert.doesNotMatch(JSON.stringify([dirty,clear]),/airRooms|forge-private|hall-private|Кузня|Коридор|steamKg|smokeKg|oxygenFraction|secret-npc-id/)

    await api(root+'/declarations',gm.token,'POST',{sceneId:scene.id,participantIds:[first,second],durationSeconds:60,allowReplace:true,revision:await f.revision()},201)
    const current=await api(route+'/declarations',other.token),{id,epoch}=current.collection
    const waiting=await api(f.route(first)+'/declarations',player.token)
    await api(f.route(first)+'/declarations',player.token,'PUT',{collectionId:id,epoch,baseVersion:0,controlStamp:waiting.controlStamp,
      actions:[{kind:'wait',seconds:1,note:''}]})
    assert(current.options.targets.some(target=>target.id===npc.id))
    await api(route+'/declarations',other.token,'PUT',{collectionId:id,epoch,baseVersion:0,controlStamp:current.controlStamp,
      actions:[{kind:'interact',operation:'open',target:{kind:'object',id:door.id},note:''}]})
    await api(root+'/declarations',gm.token,'PATCH',{collectionId:id,epoch,operation:'close'})
    const closed=await world()
    const preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:closed.revision,collectionId:id,epoch:closed.campaign.declarations.active.epoch,input:{
      timings:[{actorId:first,entryRevision:1,budgetMs:60000,costs:[]},
        {actorId:second,entryRevision:1,budgetMs:60000,costs:[{index:0,personalMs:300}]}],
      continuations:[],missingDecisions:[],interactionsConfirmed:true,rules:[],
    }})
    assert.deepEqual(await world(),closed)
    assert.deepEqual(await maps(),[dirty,clear])
    const [forge,hall]=preview.summary.thermal.rooms
    assert(hall.smokeKg>.02 && hall.steamKg>1 && hall.toK>hall.fromK && hall.oxygenFraction<.2095)
    assert(Math.abs(forge.smokeKg+hall.smokeKg-.06)<1e-12)
    assert(Math.abs(forge.steamKg+forge.fogKg+hall.steamKg+hall.fogKg-4.1)<1e-10)
    const command=entry=>({previewId:entry.id,generation:entry.generation,commandKey:crypto.randomUUID()})
    const apply=body=>api(root+'/rounds/apply',gm.token,'POST',body)
    const original=command(preview),{receipt}=await apply(original),after=await world()
    assert(after.campaign.scenes.scenes[0].objects[0].open)
    const fogged=await maps()
    assert(fogged[1].smoke && !fogged[1].contacts.some(c=>c.id===npc.id))
    await f.restart()
    assert.deepEqual(await maps(),fogged);assert.equal((await apply(original)).duplicate,true)

    const history=await api(root+'/rounds/history',gm.token)
    const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:history.revision,receiptId:receipt.id,reason:'Проверить обмен воздуха'})
    await api(root+'/rounds/change/apply',gm.token,'POST',command(rollback))
    assert.deepEqual((await world()).campaign.scenes,closed.campaign.scenes)
    assert.deepEqual(await maps(),[dirty,clear])
    const rolledBack=await api(root+'/rounds/history',gm.token)
    const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:rolledBack.revision,receiptId:receipt.id})
    await apply(command(replay))
    assert.deepEqual((await world()).campaign.scenes,after.campaign.scenes)
    assert.deepEqual(await maps(),fogged)
  })

  test('Туман в раунде скрывает НПС и рассеивается после открытия двери · ' + dialect, async t => {
    const f = await setup(t, dialect), {api, gm, player, root} = f
    const actorId = f.heroes[0], route = f.route(actorId), world = () => api(root + '/world', gm.token)
    await api(route + '/review', gm.token, 'POST', {revision:await f.revision(),decision:'approve',note:''})
    const initial = await world(), scene = initial.campaign.scenes.scenes[0]
    Object.assign(scene,{width:12,depth:8,minZ:0,maxZ:3})
    scene.physics = {version:1,gravityMs2:9.81,ambientTemperatureK:293.15,vision:{ambientLux:3,detectionLux:1},
      atmosphere:{oxygenFraction:.2095,smokeKg:0,steamKg:9,fogKg:0,outsideTemperatureK:293.15,doorVentilation:true}}
    const gate = scene.objects[0]
    Object.assign(gate,{x:1.5,y:4,width:.2,depth:7.5,height:2.8,blocksSight:false,open:false})
    Object.assign(scene.objects[1],{x:11,y:7})
    Object.assign(scene.tokens[0],{x:2,y:4})
    Object.assign(scene.tokens[1],{x:8,y:4,z:0,support:{kind:'ground'}})
    await api(root + '/world', gm.token, 'PUT', {world:initial,revision:initial.revision})
    const draft = f.draft(), revealed = draft.scenes[0]
    Object.assign(revealed.areas[0],{z:0,depth:8,height:3})
    Object.assign(revealed.contacts[0],{kind:'identified',showHeight:true})
    await f.disclose(draft)
    const initialMap = (await f.see()).map, npc = initialMap.contacts.find(c=>c.kind==='identified')
    assert(npc);assert.equal(initialMap.fog,undefined)

    const start = async () => {
      await api(root + '/declarations', gm.token, 'POST', {sceneId:scene.id,participantIds:[actorId],durationSeconds:60,allowReplace:true,revision:await f.revision()}, 201)
      return api(route + '/declarations', player.token)
    }
    const phase = ({id,epoch},operation) => api(root + '/declarations', gm.token, 'PATCH', {collectionId:id,epoch,operation})
    const send = (current,action,status=200) => api(route + '/declarations', player.token, 'PUT',
      {collectionId:current.collection.id,epoch:current.collection.epoch,baseVersion:0,controlStamp:current.controlStamp,actions:[action]},status)
    const run = async (current, action, costs) => {
      await send(current,action)
      await phase(current.collection,'close')
      const closed = await world(), {id,epoch} = closed.campaign.declarations.active
      const preview = await api(root + '/rounds/calculate', gm.token, 'POST', {revision:closed.revision,collectionId:id,epoch,
        input:{timings:[{actorId,entryRevision:1,budgetMs:60000,costs}],continuations:[],missingDecisions:[],interactionsConfirmed:true,rules:[]}})
      assert.deepEqual(await world(),closed)
      await api(root + '/rounds/apply', gm.token, 'POST', {previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()})
      return {thermal:preview.summary.thermal,collection:closed.campaign.declarations.active}
    }
    const condensed = await run(await start(),{kind:'wait',seconds:1,note:''},[])
    assert(condensed.thermal.fogKg>1)
    assert(Math.abs(condensed.thermal.steamKg+condensed.thermal.fogKg-9)<1e-10)
    const hidden = (await f.see()).map
    assert.deepEqual(hidden.fog,{});assert.deepEqual(hidden.contacts.map(c=>c.kind),['self'])
    assert.doesNotMatch(JSON.stringify(hidden),/steamKg|fogKg|relativeHumidityPct|ambientTemperatureK|secret-npc-id/)
    await f.restart()
    assert.deepEqual((await f.see()).map,hidden)
    await phase(condensed.collection,'archive')
    const foggy = await start()
    assert(!foggy.options.targets.some(target=>target.id===npc.id))
    await send(foggy,{kind:'speak',target:{kind:'contact',id:npc.id},volume:'normal',text:'Приветствую.',note:''},409)
    const cleared = await run(foggy,{kind:'interact',operation:'open',target:{kind:'object',id:gate.id},note:''},[{index:0,personalMs:300}])
    assert.equal(cleared.thermal.fogKg,0);assert(cleared.thermal.steamKg<3)
    const recovered = (await f.see()).map
    assert.equal(recovered.fog,undefined);assert(recovered.contacts.some(c=>c.id===npc.id))
  })

  test('Свет и видимость: дверь, фонарь и доступность цели после применения раунда · ' + dialect, async t => {
    const f = await setup(t, dialect), { api, gm, player, root } = f
    const actorId = f.heroes[0], route = f.route(actorId), world = () => api(root + '/world', gm.token)
    await api(route + '/review', gm.token, 'POST', {revision:await f.revision(),decision:'approve',note:''})
    const initial = await world(), scene = initial.campaign.scenes.scenes[0]
    scene.physics = {version:1,gravityMs2:9.81,ambientTemperatureK:293.15,vision:{ambientLux:.02,detectionLux:1}}
    const gate = scene.objects[0]
    Object.assign(gate,{x:5,y:5,width:.2,depth:2,height:2,blocksSight:true,open:false})
    const torch = {...sceneObject('lamp','torch',{x:2,y:5.7,z:0}),height:1.5,active:true,
      physics:{version:1,material:physicsMaterialPreset('steel'),massKg:1,temperatureK:293.15,wetnessFraction:0,lightIntensityCd:160}}
    scene.objects.push(torch)
    Object.assign(scene.tokens[0],{x:2,y:5})
    Object.assign(scene.tokens[1],{x:8,y:5,z:0,support:{kind:'ground'}})
    await api(root + '/world', gm.token, 'PUT', {world:initial,revision:initial.revision})
    const draft = f.draft(), revealed = draft.scenes[0]
    revealed.objects.push({objectId:torch.id,visible:true})
    Object.assign(revealed.contacts[0],{kind:'identified',showHeight:true})
    await f.disclose(draft)
    const contactId = (await world()).campaign.perceptions.heroes.find(h => h.actorId === actorId).scenes[0].contacts[0].id
    const view = () => api(route + '/declarations', player.token)
    const start = async () => {
      await api(root + '/declarations', gm.token, 'POST', {sceneId:scene.id,participantIds:[actorId],durationSeconds:3,allowReplace:true,revision:await f.revision()}, 201)
      return view()
    }
    const phase = ({id,epoch},operation) => api(root + '/declarations', gm.token, 'PATCH', {collectionId:id,epoch,operation})
    const send = (current,action,status=200) => api(route + '/declarations', player.token, 'PUT',
      {collectionId:current.collection.id,epoch:current.collection.epoch,baseVersion:0,controlStamp:current.controlStamp,actions:[action]},status)
    const run = async (current, operation, objectId) => {
      await send(current,{kind:'interact',operation,target:{kind:'object',id:objectId},note:''})
      await phase(current.collection,'close')
      const closed = (await world()).campaign.declarations.active
      const preview = await api(root + '/rounds/calculate', gm.token, 'POST', {revision:await f.revision(),collectionId:closed.id,epoch:closed.epoch,
        input:{timings:[{actorId,entryRevision:1,budgetMs:3000,costs:[{index:0,personalMs:300}]}],
          continuations:[],missingDecisions:[],interactionsConfirmed:true,rules:[]}})
      await api(root + '/rounds/apply', gm.token, 'POST', {previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()})
      return (await world()).campaign.declarations.active
    }
    const speaks = {kind:'speak',target:{kind:'contact',id:contactId},volume:'normal',text:'Приветствую.',note:''}
    const before = await start()
    assert(!before.options.targets.some(target => target.id === contactId))
    assert.deepEqual((await f.see()).map.contacts.map(c => c.kind),['self'])
    await send(before,speaks,409)
    const opened = await run(before,'open',gate.id)
    const clear = (await f.see()).map
    assert(clear.contacts.some(c => c.id === contactId && c.label === f.npc.name))
    assert.equal(clear.objects.find(o => o.id === torch.id).light,'bright')
    assert.doesNotMatch(JSON.stringify(clear),/lightIntensityCd|detectionLux|secret-npc-id|secret-box/)

    await phase(opened,'archive')
    const lit = await start()
    assert(lit.options.targets.some(target => target.id === contactId))
    await run(lit,'extinguish',torch.id)
    const dark = (await f.see()).map
    assert.deepEqual(dark.contacts.map(c => c.kind),['self'])
    assert.equal(dark.objects.some(o => o.id === torch.id),false)
    await f.restart()
    assert.deepEqual((await f.see()).map,dark)
    assert.equal((await f.see(f.other.token,f.heroes[1])).map,null)
  })

  test('Индивидуальная сцена и защита скрытых данных · ' + dialect, async t => {
    const f = await setup(t, dialect), { api, gm, player, other, helper } = f
    await t.test('Без раскрытия нет карты, имён чужих героев и NPC; чужой герой недоступен по прямому URL', async () => {
      assert.equal((await f.see()).map, null)
      const projection = await api(f.root + '/world?view=player', player.token)
      assert.deepEqual(projection.characters.map(c => c.id), [f.heroes[0]])
      assert.equal(JSON.stringify(projection).includes(f.npc.name), false)
      await api(f.route(f.heroes[0]) + '/perception', other.token, 'GET', undefined, 403)
      for (const permissions of [['scenes'], ['viewSecrets'], ['approveHeroes']]) {
        await f.grant(permissions)
        await api(f.route(f.heroes[0]) + '/perception', helper.token, 'GET', undefined, 403)
        await f.disclose(f.draft(), f.heroes[0], 403, helper.token)
      }
      assert(!JSON.stringify(await api(f.root + '/world?view=player', helper.token)).includes(f.npc.name))
      await api(f.route(f.npc.id) + '/submission', helper.token, 'GET', undefined, 403)
      await api(f.route(f.npc.id) + '/review', helper.token, 'POST', { decision: 'return', note: 'Подмена', revision: await f.revision() }, 403)
      await f.grant(['scenes', 'viewSecrets'])
      await f.disclose(f.draft(), f.heroes[0], 200, helper.token)
    })
    await t.test('Визуальные эффекты раскрываются отдельно и не передают скрытые имена или ID применения', async () => {
      const world=await api(f.root+'/world',gm.token),npc=world.characters.find(a=>a.id===f.npc.id)
      npc.rpg.casts=[{id:'private-spell-cast',ability:{...emptyAbility(),id:'private-ability',templateId:'private-template',approved:true,name:'PRIVATE SPELL',schoolId:'fire',visualEffect:{familyId:'fire'}},targetId:npc.id,status:'preparing',readyAt:10,endsAt:null,input:{region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}}]
      await api(f.root+'/world',gm.token,'PUT',{world,revision:world.revision})
      await f.disclose();assert.equal((await f.see()).map.visuals,undefined)
      const d=f.draft();Object.assign(d.scenes[0].contacts[0],{kind:'identified',showHeight:true,showVisuals:true})
      await f.disclose(d)
      const effects=(await f.see()).map.visuals;assert.equal(effects.length,1);assert.equal(effects[0].spec.familyId,'fire')
      for(const secret of [npc.id,'PRIVATE SPELL','private-spell-cast','private-ability','private-template'])assert(!JSON.stringify(effects).includes(secret))
      // Restore the prior observation so existing privacy scenarios stay independent.
      npc.rpg.casts=[];const fresh=await api(f.root+'/world',gm.token);fresh.characters.find(a=>a.id===npc.id).rpg.casts=[]
      await api(f.root+'/world',gm.token,'PUT',{world:fresh,revision:fresh.revision});await f.disclose()
    })
    await t.test('Силуэт не раскрывает личность, портрет, высоту, полёт, фон, полный лист или скрытые объекты', async () => {
      const view = await f.see(), json = JSON.stringify(view), map = view.map
      for (const secret of [f.npc.id, f.npc.name, f.npc.profile.biography, f.npc.profile.portrait, 'СКРЫТАЯ КАЗНА', 'ЗАКРЫТОЕ ОПИСАНИЕ', 'ВНУТРЕННЕЕ ИМЯ СЦЕНЫ', 'U0VDUkVU']) assert(!json.includes(secret), secret)
      const contact = map.contacts.find(c => c.kind === 'silhouette')
      assert.ok(contact.id); assert.equal(contact.label, 'Неизвестный силуэт')
      for (const key of ['actorId', 'portrait', 'z', 'flying', 'rpg', 'resources']) assert.equal(contact[key], undefined)
      assert.equal(map.objects[0].blocksMovement, undefined); assert.equal(map.objects[0].canSupport, undefined)
      assert.equal(map.frame.background, undefined); assert.equal(view.hero.resources.health, undefined)
      assert.deepEqual((await f.see(other.token, f.heroes[1])).map, null)
      const preview = await f.see(gm.token)
      assert.deepEqual(preview.map, map); assert.deepEqual(preview.knowledge, view.knowledge)
    })
    await t.test('Явное узнавание и высота раскрываются только выбранному герою; звук использует заданную приблизительную точку', async () => {
      const d = f.draft(); d.scenes[0].contacts[0].kind = 'identified'; d.scenes[0].contacts[0].showHeight = true
      await f.disclose(d)
      let c = (await f.see()).map.contacts.find(c => c.kind !== 'self')
      assert.equal(c.label, f.npc.name); assert.equal(c.portrait, f.npc.profile.portrait); assert.equal(c.z, 3); assert.equal(c.flying, true)
      await f.disclose(f.draft(), f.heroes[1])
      const otherContact = (await f.see(other.token, f.heroes[1])).map.contacts.find(c => c.kind !== 'self')
      assert.notEqual(c.id, otherContact.id); assert.equal(otherContact.label, 'Неизвестный силуэт')
      d.scenes[0].contacts[0].kind = 'sound'; d.scenes[0].contacts[0].showHeight = false
      await f.disclose(d)
      c = (await f.see()).map.contacts.find(c => c.kind === 'sound')
      assert.equal(c.x, 3); assert.equal(c.y, 3); assert.equal(c.radius, 2); assert.equal(c.z, undefined); assert.equal(c.portrait, undefined)
      assert.equal(c.label, 'Источник звука')
    })
    await t.test('Контакт вне видимой области исчезает; известный объект хранит последнее состояние без новых скрытых изменений', async () => {
      const d = f.draft(); d.scenes[0].areas[0].width = 6; d.scenes[0].objects[0].visible = false
      await f.disclose(d)
      let view = await f.see(); assert.equal(view.map.contacts.some(c => c.kind !== 'self'), false)
      assert.equal(view.map.objects[0].name, 'Дверь'); assert.equal(view.map.objects[0].visible, false)
      const world = await api(f.root + '/world', gm.token)
      world.campaign.scenes.scenes[0].objects[0].name = 'СКРЫТАЯ ПЕРЕМЕНА'; world.campaign.scenes.scenes[0].objects[0].open = true
      await api(f.root + '/world', gm.token, 'PUT', { world, revision: world.revision })
      view = await f.see(); assert.equal(view.map.objects[0].name, 'Дверь'); assert.equal(view.map.objects[0].open, false)
      d.scenes[0].objects[0].visible = true; await f.disclose(d)
      assert.equal((await f.see()).map.objects[0].name, 'СКРЫТАЯ ПЕРЕМЕНА')
    })
  })

  test('Знания, сохранения и атомарность видимости · ' + dialect, async t => {
    const f = await setup(t, dialect), { api, gm, player, other, helper } = f
    await f.disclose()
    await t.test('Мастер раскрывает факт адресно; собственная заметка не подделывает достоверность и не переписывает факт', async () => {
      const before = await api(f.root + '/world', gm.token)
      await api(f.route(f.heroes[0]) + '/knowledge', gm.token, 'POST', { revision: await f.revision(), disclosure: true, title: 'Секрет ворот', text: 'Известен только первому герою.', category: 'places', certainty: 'confirmed' }, 201)
      assert.equal((await f.see()).knowledge.journal[0].certainty, 'confirmed')
      assert.deepEqual((await f.see(other.token, f.heroes[1])).knowledge.journal, [])
      await api(f.route(f.heroes[0]) + '/knowledge', player.token, 'POST', { revision: await f.revision(), title: 'Догадка', text: 'Возможно, рядом стража.', certainty: 'confirmed', source: 'Сведения мастера', origin: 'automatic' }, 201)
      const journal = (await f.see()).knowledge.journal
      assert.equal(journal[1].certainty, 'hypothesis'); assert.equal(journal[1].source, 'Личная заметка'); assert.equal(journal[1].origin, 'manual')
      await api(f.route(f.heroes[0]) + '/knowledge/' + journal[0].id, player.token, 'PATCH', { revision: await f.revision(), annotation: 'Мой комментарий.', text: 'Подмена факта', certainty: 'hypothesis' })
      const fact = (await f.see()).knowledge.journal[0]
      assert.equal(fact.text, journal[0].text); assert.equal(fact.certainty, 'confirmed'); assert.equal(fact.annotation, 'Мой комментарий.')
      const after = await api(f.root + '/world', gm.token)
      assert.deepEqual(after.campaign, before.campaign)
      assert.deepEqual(after.characters[1], before.characters[1]); assert.deepEqual(after.characters[2], before.characters[2])
    })
    await t.test('Передача меняет право записи; владелец сохраняет чтение, отзыв полномочий закрывает помощника', async () => {
      await f.grant(['controlDelegated'])
      await api(f.route(f.heroes[0]) + '/control', player.token, 'POST', { delegated: true, revision: await f.revision() })
      await api(f.route(f.heroes[0]) + '/control-assignee', gm.token, 'POST', { userId: helper.user.id, revision: await f.revision() })
      assert.equal((await f.see()).canWriteNotes, false); assert.equal((await f.see(helper.token)).canWriteNotes, true)
      await api(f.route(f.heroes[0]) + '/knowledge', player.token, 'POST', { revision: await f.revision(), title: 'Запрещено', text: 'Текст' }, 403)
      await api(f.route(f.heroes[0]) + '/knowledge', helper.token, 'POST', { revision: await f.revision(), title: 'Запись управляющего', text: 'Текст' }, 201)
      await f.grant([])
      await api(f.route(f.heroes[0]) + '/perception', helper.token, 'GET', undefined, 403)
      await api(f.route(f.heroes[0]) + '/control', player.token, 'POST', { delegated: false, revision: await f.revision() })
    })
    await t.test('Конфликт, неверные границы и сбой аудита не меняют видимость, знания или версии', async () => {
      const before = await f.see(), world = await api(f.root + '/world', gm.token)
      await api(f.route(f.heroes[0]) + '/disclosure', gm.token, 'PUT', { draft: f.draft(), revision: before.revision - 1 }, 409)
      const bad = f.draft(); bad.scenes[0].areas[0].width = 100
      await f.disclose(bad, f.heroes[0], 400)
      await f.disclose({ ...f.draft(), activeSceneId: 'missing' }, f.heroes[0], 400)
      const db = f.server.db, transaction = db.transaction, logger = console.error
      db.transaction = fn => transaction(tx => fn({ ...tx, run: async (sql, args) => { if (sql.startsWith('INSERT INTO audit')) throw Error('Injected perception audit failure'); return tx.run(sql, args) } }))
      console.error = () => {}
      try {
        await f.disclose(f.draft(), f.heroes[0], 500)
        await api(f.route(f.heroes[0]) + '/knowledge', player.token, 'POST', { revision: before.revision, title: 'Отменённая запись', text: 'Текст' }, 500)
      } finally { db.transaction = transaction; console.error = logger }
      assert.deepEqual(await f.see(), before); assert.deepEqual(await api(f.root + '/world', gm.token), world)
    })
    await t.test('Белые списки не пропускают дополнительные секретные поля; копия/восстановление и перезапуск сохраняют индивидуальную память', async () => {
      const world = await api(f.root + '/world', gm.token), knowledge = world.campaign.perceptions.heroes[0]
      knowledge.scenes[0].frame.secret = 'СЕКРЕТ ФОРМАТА'; knowledge.scenes[0].objects[0].snapshot.secret = 'СЕКРЕТ ОБЪЕКТА'
      world.characters[0].journal[0].secret = 'СЕКРЕТ ЗАПИСИ'
      const at = new Date().toISOString()
      world.characters[0].knownEffects.push({ id: 'СЕКРЕТНЫЙ-ID-ДИАГНОЗА', title: 'Странное ощущение', description: 'Точного диагноза нет.', perception: 'sensed', kind: 'unclear', source: '', gameTime: '', duration: '', status: 'active', createdAt: at, updatedAt: at })
      await api(f.root + '/world', gm.token, 'PUT', { world, revision: world.revision })
      assert.equal(JSON.stringify(await f.see()).includes('СЕКРЕТ'), false)
      assert.equal((await f.see()).knowledge.knownEffects[0].perception, 'sensed')
      const backup = await api(f.root + '/backup', gm.token)
      assert.equal(parseLobbyBackup(JSON.stringify(backup)).world.campaign.perceptions.heroes.length, 1)
      const before = await f.see()
      await api(f.root + '/restore', gm.token, 'POST', { world: backup.world, bindings: backup.bindings, revision: await f.revision() })
      await f.restart()
      const after = await f.see()
      assert.deepEqual(after.map, before.map); assert.deepEqual(after.knowledge, before.knowledge)
      const { perceptions: _perceptions, ...legacy } = backup.world.campaign
      await api(f.root + '/world', gm.token, 'PUT', { world: { ...backup.world, campaign: legacy }, revision: after.revision }, 409)
      assert.deepEqual((await f.see(other.token, f.heroes[1])).map, null)
    })
    await t.test('Удаление сцены убирает её раскрытие, удаление участника очищает адресата и контакты', async () => {
      const world = await api(f.root + '/world', gm.token)
      await api(f.root + '/scenes', gm.token, 'PUT', { scenes: emptyScenes(), revision: world.revision })
      assert.equal((await f.see()).map, null)
      await api(f.root + '/members/' + player.user.id, gm.token, 'DELETE')
      const next = await api(f.root + '/world', gm.token)
      assert.deepEqual(next.campaign.perceptions.heroes, [])
    })
  })
}

for(const dialect of ['sqlite','postgres'])test('Knowledge commands: заметки, адресные факты и надёжный повтор · '+dialect,async t=>{
 const f=await setup(t,dialect),{api,gm,player,other,helper}=f,path=f.route(f.heroes[0])+'/knowledge'
 const world=()=>api(f.root+'/world',gm.token)
 const command=async title=>({revision:await f.revision(),title,text:'Запись для одного героя.',commandKey:'knowledge:'+crypto.randomUUID()})
 let original,receipt
 await t.test('Старый запрос совместим; неподходящий ключ не меняет мир',async()=>{
  const revision=await f.revision(),result=await api(path,player.token,'POST',{revision,title:'Старая заметка',text:'Работает без ключа.',certainty:'confirmed',origin:'automatic',source:'Сведения мастера'},201)
  assert.deepEqual(result,{revision:revision+1})
  const entry=(await f.see()).knowledge.journal.at(-1);assert.equal(entry.origin,'manual');assert.equal(entry.certainty,'hypothesis')
  const before=await world()
  for(const key of ['other:invalid','knowledge:x','knowledge:'+'x'.repeat(141),null])await api(path,player.token,'POST',{revision:before.revision,title:'Не записывать',text:'Текст',commandKey:key},400)
  assert.deepEqual(await world(),before)
 })
 await t.test('Параллельный повтор создаёт одну заметку, одну ревизию и одно подтверждение',async()=>{
  const before=await world();original=await command('Путь к воротам')
  const results=await Promise.all([f.request(path,player.token,'POST',original),f.request(path,player.token,'POST',original)])
  assert.deepEqual(results.map(r=>r.status).sort(),[200,201])
  assert(results.every(r=>isKnowledgeAck(r.data,original,f.heroes[0])))
  assert.equal(results.filter(r=>r.data.duplicate).length,1);receipt=results[0].data.receipt
  const after=await world(),entries=after.characters.find(a=>a.id===f.heroes[0]).journal.filter(e=>e.id===knowledgeEntryId(original.commandKey))
  assert.equal(entries.length,1);assert.equal(after.revision,before.revision+1);assert.deepEqual(after.campaign,before.campaign)
  const previous=before.characters.find(a=>a.id===f.heroes[0]),{journal:_oldJournal,...oldActor}=previous,{journal:_newJournal,...newActor}=after.characters.find(a=>a.id===f.heroes[0])
  assert.deepEqual(newActor,oldActor)
 })
 await t.test('Ключ связан с текстом, версией, героем и полномочиями автора',async()=>{
  const before=await world()
  for(const patch of [{title:'Другой текст'},{revision:original.revision+1},{category:'places'}])await api(path,player.token,'POST',{...original,...patch},409)
  await api(path,other.token,'POST',original,403)
  await api(f.route(f.heroes[1])+'/knowledge',player.token,'POST',original,403)
  await api(path,gm.token,'POST',{...original,disclosure:true},409)
  assert.deepEqual(await world(),before)
 })
 await t.test('После других записей и перезапуска возвращается прежний результат без дубликата',async()=>{
  await api(path,gm.token,'POST',{revision:await f.revision(),disclosure:true,title:'Поздний факт',text:'Отдельная запись.'},201)
  const before=await world();await f.restart()
  const repeated=await api(path,player.token,'POST',original,200)
  assert(isKnowledgeAck(repeated,original,f.heroes[0]));assert.equal(repeated.duplicate,true);assert.deepEqual(repeated.receipt,receipt)
  assert.deepEqual(await world(),before)
 })
 await t.test('Факт мастера раскрывается адресно один раз и не подделывается игроком',async()=>{
  const body={...await command('Пароль смотрителя'),disclosure:true,category:'places',certainty:'confirmed'}
  const first=await api(path,gm.token,'POST',body,201),again=await api(path,gm.token,'POST',body,200)
  assert(isKnowledgeAck(first,body,f.heroes[0]));assert(isKnowledgeAck(again,body,f.heroes[0]))
  const entry=(await f.see()).knowledge.journal.find(e=>e.id===knowledgeEntryId(body.commandKey))
  assert.equal(entry.origin,'automatic');assert.equal(entry.certainty,'confirmed');assert.equal(entry.source,'Сведения мастера')
  assert(!(await f.see(other.token,f.heroes[1])).knowledge.journal.some(e=>e.title===body.title))
  await api(path,player.token,'POST',body,403)
 })
 await t.test('Сбой аудита откатывает и заметку, и подтверждение; точный повтор затем успешен',async()=>{
  const body=await command('Атомарная запись'),before=await world(),db=f.server.db,transaction=db.transaction,logger=console.error
  db.transaction=fn=>transaction(tx=>fn({...tx,run:async(sql,args)=>{if(sql.startsWith('INSERT INTO audit'))throw Error('Injected knowledge command audit failure');return tx.run(sql,args)}}))
  console.error=()=>{}
  try{await api(path,player.token,'POST',body,500)}finally{db.transaction=transaction;console.error=logger}
  assert.deepEqual(await world(),before);assert.equal(await db.get('SELECT command_key FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[f.root.split('/').at(-1),body.commandKey]),undefined)
  assert(isKnowledgeAck(await api(path,player.token,'POST',body,201),body,f.heroes[0]))
  assert.equal((await api(path,player.token,'POST',body,200)).duplicate,true)
 })
 await t.test('Отзыв управления проверяется до чтения старого подтверждения',async()=>{
  await f.grant(['controlDelegated'])
  await api(f.route(f.heroes[0])+'/control',player.token,'POST',{delegated:true,revision:await f.revision()})
  await api(f.route(f.heroes[0])+'/control-assignee',gm.token,'POST',{userId:helper.user.id,revision:await f.revision()})
  await api(path,player.token,'POST',original,403)
  await api(path,helper.token,'POST',original,409)
  await api(f.route(f.heroes[0])+'/control',player.token,'POST',{delegated:false,revision:await f.revision()})
 })
 await t.test('Прежняя ветка не подтверждает команду в новом продолжении',async()=>{
  const body=await command('До новой ветки');await api(path,player.token,'POST',body,201)
  const before=await world();await f.server.db.transaction(tx=>invalidateRoundGeneration(tx,f.root.split('/').at(-1)))
  await api(path,player.token,'POST',body,409);assert.deepEqual(await world(),before)
 })
 await t.test('После завершения можно подтвердить старую запись, но нельзя создать новую',async()=>{
  const body=await command('Перед финалом');await api(path,player.token,'POST',body,201)
  await api(f.root+'/play/session/finish',gm.token,'POST',{revision:await f.revision(),title:'Записи сохранены',summary:'Проверка завершена.',keepPending:false,commandKey:crypto.randomUUID()})
  const before=await world(),again=await api(path,player.token,'POST',body,200)
  assert(isKnowledgeAck(again,body,f.heroes[0]));assert.equal(again.duplicate,true)
  await api(path,player.token,'POST',await command('Новая запись после финала'),409);assert.deepEqual(await world(),before)
 })
})
