import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { emptyScenes, sceneObject } from '../generated/scenes.mjs'
import { addLobbyTavern } from '../generated/lobbySceneTemplates.mjs'
import { rotateTabletopObject } from '../generated/tabletopCommands.mjs'

for (const dialect of ['sqlite', 'postgres']) test('Редактор → сохранение → четыре игрока → раунд → закрытие и перезапуск · ' + dialect, async t => {
  const f = await fixture(t, dialect), { api } = f, gm = await f.register('integration-gm')
  const { id } = await api('/lobbies', gm.token, 'POST', lobbyBody, 201), root = '/lobbies/' + id
  const players = [], heroes = [], revision = async () => (await api(root, gm.token)).revision
  for (let i = 0; i < 4; i++) {
    const player = await f.register('integration-player-' + i); players.push(player)
    await api(root + '/join', player.token, 'POST')
    const character = { ...createDefaultCharacter(), id: crypto.randomUUID(), name: 'Герой ' + (i + 1) }
    await api('/characters/' + character.id, player.token, 'PUT', { character, revision: -1 })
    const hero = (await api(root + '/characters', player.token, 'POST', { characterId: character.id }, 201)).id; heroes.push(hero)
    await api(root + '/characters/' + hero + '/review', gm.token, 'POST', { revision: await revision(), decision: 'approve', note: '' })
  }
  const initial = await api(root + '/world', gm.token)
  const draft = addLobbyTavern(emptyScenes(), 'party-tavern'), scene = draft.scenes[0]
  const table = scene.objects.find(o => o.asset === 'table'), door = scene.objects.find(o => o.kind === 'door')
  const secret = { ...sceneObject('crate', 'private-chest', { x: 25, y: 22, z: 0 }), name: 'SECRET-EDITOR-CHEST' }
  scene.objects.push(secret)
  const changed = rotateTabletopObject(draft, table.id)
  await api(root + '/scenes', players[0].token, 'PUT', { revision: initial.revision, scenes: changed }, 403)
  await api(root + '/scenes', gm.token, 'PUT', { revision: initial.revision, scenes: changed })
  const saved = await api(root + '/world', gm.token)
  assert.deepEqual(saved.characters, initial.characters); assert.equal(saved.campaign.seconds, initial.campaign.seconds)
  assert.deepEqual(saved.campaign.scenes, changed)
  await api(root + '/scenes', gm.token, 'PUT', { revision: initial.revision, scenes: draft }, 409)
  await f.restart()
  assert.deepEqual((await api(root + '/scenes', gm.token)).scenes, changed)
  const setup = { sceneId: scene.id, actorIds: heroes, objectIds: scene.objects.filter(o => o.id !== secret.id).map(o => o.id), contactIds: heroes,
    title: 'Таверна друзей', description: 'Мастер открыл общий зал.', anchor: { x: 4, y: 12, z: 0 }, revealTerrain: true }
  await api(root + '/play/setup', gm.token, 'POST', { revision: await revision(), setup })
  await api(root, gm.token, 'PATCH', { status: 'playing' })
  for (let i = 0; i < 4; i++) {
    const view = await api(root + '/characters/' + heroes[i] + '/perception', players[i].token)
    assert.equal(view.map.frame.id, scene.id); assert.equal(view.map.contacts.length, 4)
    assert(!JSON.stringify(view).includes(secret.id)); assert(!JSON.stringify(view).includes(secret.name))
    assert.equal(view.map.objects.find(o => o.id === table.id).facing, changed.scenes[0].objects.find(o => o.id === table.id).facing)
  }
  await api(root + '/declarations', gm.token, 'POST', { revision: await revision(), sceneId: scene.id, participantIds: heroes, durationSeconds: 5, allowReplace: true }, 201)
  const timings = []
  for (let i = 0; i < 4; i++) {
    const path = root + '/characters/' + heroes[i] + '/declarations', d = await api(path, players[i].token), c = d.collection
    const actions = i === 0 ? [{ kind: 'interact', target: { kind: 'object', id: door.id }, operation: door.open ? 'close' : 'open', note: '' }] : [{ kind: 'wait', seconds: 1, note: 'PRIVATE-PLAN-' + i }]
    await api(path, players[i].token, 'PUT', { collectionId: c.id, epoch: c.epoch, baseVersion: 0, controlStamp: d.controlStamp, actions })
    timings.push({ actorId: heroes[i], entryRevision: 1, budgetMs: 5000, costs: i === 0 ? [{ index: 0, personalMs: 1000 }] : [] })
  }
  assert(!JSON.stringify(await api(root + '/world', players[0].token)).includes('PRIVATE-PLAN-1'))
  let world = await api(root + '/world', gm.token), c = world.campaign.declarations.active
  await api(root + '/declarations', gm.token, 'PATCH', { collectionId: c.id, epoch: c.epoch, operation: 'close' })
  world = await api(root + '/world', gm.token); c = world.campaign.declarations.active
  const preview = await api(root + '/rounds/calculate', gm.token, 'POST', { revision: world.revision, collectionId: c.id, epoch: c.epoch,
    input: { timings, continuations: [], missingDecisions: [], interactionsConfirmed: true } })
  assert.deepEqual(await api(root + '/world', gm.token), world, 'Предпросмотр не меняет сцену или игровые часы')
  const command = { previewId: preview.id, generation: preview.generation, commandKey: crypto.randomUUID() }
  await api(root + '/rounds/apply', gm.token, 'POST', command)
  const played = await api(root + '/world', gm.token)
  assert.equal(played.campaign.seconds, 5)
  assert.equal(played.campaign.scenes.scenes[0].objects.find(o => o.id === door.id).open, !door.open)
  for (let i = 0; i < heroes.length; i++) {
    const before = initial.characters.find(a => a.id === heroes[i]), after = played.characters.find(a => a.id === heroes[i])
    assert.deepEqual(after.attributes, before.attributes); assert.deepEqual(after.resources, before.resources)
    assert.deepEqual(after.body, before.body); assert(after.rpg.logs.some(log => log.seconds === 5))
  }
  assert.equal((await api(root + '/rounds/apply', gm.token, 'POST', command)).duplicate, true)
  assert.deepEqual(await api(root + '/world', gm.token), played)
  await api(root + '/declarations', gm.token, 'PATCH', { collectionId: c.id, epoch: c.epoch, operation: 'archive' })
  const finalWorld = await api(root + '/world', gm.token)
  const checkpointCommand = { revision: finalWorld.revision, name: 'Финал совместной пробы', commandKey: crypto.randomUUID() }
  const checkpoint = await api(root + '/rounds/checkpoints', gm.token, 'POST', checkpointCommand)
  await api(root, gm.token, 'PATCH', { status: 'closed' })
  await f.restart()
  assert.equal((await api(root, gm.token)).status, 'closed')
  assert.deepEqual(await api(root + '/world', gm.token), finalWorld)
  assert((await api(root + '/rounds/history', gm.token)).checkpoints.some(p => p.id === checkpoint.checkpoint.id))
  assert.equal((await api(root + '/rounds/checkpoints', gm.token, 'POST', checkpointCommand)).duplicate, true)
  await api(root + '/declarations', gm.token, 'POST', { revision: await revision(), sceneId: scene.id, participantIds: heroes, durationSeconds: 5, allowReplace: true }, 409)
  for (let i = 0; i < 4; i++) assert.equal((await api(root + '/characters/' + heroes[i] + '/perception', players[i].token)).map.frame.id, scene.id)
})
