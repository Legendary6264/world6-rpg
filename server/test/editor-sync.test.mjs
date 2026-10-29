import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { createScene, emptyScenes } from '../generated/scenes.mjs'
import { createTabletopObject } from '../generated/tabletopCatalog.mjs'
import { mergeSceneDraft } from '../generated/sceneDraftMerge.mjs'

for (const dialect of ['sqlite', 'postgres']) test('Сверка редактора после настоящего раунда: ограниченный помощник, гонка, часы и перезапуск · ' + dialect, async t => {
  const f = await fixture(t, dialect), { api } = f, gm = await f.register('sync-master'), helper = await f.register('sync-helper'), player = await f.register('sync-player')
  const { id } = await api('/lobbies', gm.token, 'POST', lobbyBody, 201), root = '/lobbies/' + id
  const revision = async () => (await api(root, gm.token)).revision
  await api(root + '/join', helper.token, 'POST'); await api(root + '/join', player.token, 'POST')
  await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'ASSISTANT' })
  await api(root + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { revision: await revision(), permissions: ['scenes'] })
  const character = { ...createDefaultCharacter(), id: crypto.randomUUID(), name: 'Путник' }
  await api('/characters/' + character.id, player.token, 'PUT', { character, revision: -1 })
  const hero = (await api(root + '/characters', player.token, 'POST', { characterId: character.id }, 201)).id
  await api(root + '/characters/' + hero + '/review', gm.token, 'POST', { revision: await revision(), decision: 'approve', note: '' })
  const state = createScene(emptyScenes(), 'sync-hall', 'Зал', 'top'), scene = state.scenes[0]
  scene.objects = [createTabletopObject('table', 'table', { x: 6, y: 6, z: 0 }), createTabletopObject('timber-door', 'door', { x: 10, y: 4, z: 0 })]
  await api(root + '/scenes', gm.token, 'PUT', { revision: await revision(), scenes: state })
  await api(root + '/play/setup', gm.token, 'POST', { revision: await revision(), setup: { sceneId: scene.id, actorIds: [hero], objectIds: ['table', 'door'], contactIds: [], title: 'Общий зал', description: '', anchor: { x: 2, y: 2, z: 0 }, revealTerrain: true } })
  const baseline = await api(root + '/scenes', helper.token), local = structuredClone(baseline.scenes)
  local.scenes[0].name = 'Мой новый зал'; local.scenes[0].objects[0].x = 12
  local.scenes[0].objects.push(createTabletopObject('candle', 'local-candle', { x: 14, y: 10, z: 0 }))
  const filtered = await api(root + '/world', helper.token)
  assert.deepEqual(filtered.characters, []); assert.equal(filtered.campaign.scenes, undefined)
  await api(root + '/world', helper.token, 'PUT', { revision: baseline.revision, world: await api(root + '/world', gm.token) }, 403)
  await api(root + '/scenes', player.token, 'GET', undefined, 403)
  await api(root + '/declarations', gm.token, 'POST', { revision: await revision(), sceneId: scene.id, participantIds: [hero], durationSeconds: 5, allowReplace: true }, 201)
  const d = await api(root + '/characters/' + hero + '/declarations', player.token)
  await api(root + '/characters/' + hero + '/declarations', player.token, 'PUT', { collectionId: d.collection.id, epoch: d.collection.epoch, baseVersion: 0, controlStamp: d.controlStamp,
    actions: [{ kind: 'move', route: [{ x: 3, y: 2, z: 0 }], support: 'ground', note: '' }, { kind: 'interact', target: { kind: 'object', id: 'door' }, operation: 'open', note: '' }] })
  await api(root + '/declarations', gm.token, 'PATCH', { collectionId: d.collection.id, epoch: d.collection.epoch, operation: 'close' })
  const closed = await api(root + '/world', gm.token), c = closed.campaign.declarations.active
  const preview = await api(root + '/rounds/calculate', gm.token, 'POST', { revision: closed.revision, collectionId: c.id, epoch: c.epoch,
    input: { timings: [{ actorId: hero, entryRevision: 1, budgetMs: 5000, costs: [{ index: 0, personalMs: 1000 }, { index: 1, personalMs: 1000 }] }], continuations: [], missingDecisions: [], interactionsConfirmed: true, movement: { confirmed: true, bodies: closed.campaign.scenes.scenes[0].tokens.map(t => ({ actorId: t.actorId, heightM: 2 })) } } })
  await api(root + '/rounds/apply', gm.token, 'POST', { previewId: preview.id, generation: preview.generation, commandKey: crypto.randomUUID() })
  const played = await api(root + '/world', gm.token), remote = await api(root + '/scenes', helper.token)
  assert.equal(played.campaign.seconds, 5); assert.equal(remote.scenes.scenes[0].tokens[0].x, 3)
  assert(remote.scenes.scenes[0].objects.find(o => o.id === 'door').open)
  let result = mergeSceneDraft(baseline.scenes, local, remote.scenes, remote.actors.map(a => a.id))
  assert.equal(result.unresolved, 0); assert.equal(result.issue, ''); assert.deepEqual(await api(root + '/world', gm.token), played)
  // A third authoritative update between the review GET and the PUT is still
  // rejected atomically. Reconciliation never grants broader permissions.
  const third = structuredClone(remote.scenes); third.scenes[0].description = 'Ещё одно подтверждённое изменение'
  await api(root + '/scenes', gm.token, 'PUT', { revision: remote.revision, scenes: third })
  const before = await api(root + '/world', gm.token)
  await api(root + '/scenes', helper.token, 'PUT', { revision: remote.revision, scenes: result.state }, 409)
  assert.deepEqual(await api(root + '/world', gm.token), before)
  const fresh = await api(root + '/scenes', helper.token)
  result = mergeSceneDraft(baseline.scenes, local, fresh.scenes, fresh.actors.map(a => a.id))
  assert.equal(result.unresolved, 0); assert.equal(result.issue, '')
  await api(root + '/scenes', helper.token, 'PUT', { revision: fresh.revision, scenes: result.state })
  const after = await api(root + '/world', gm.token)
  assert.deepEqual(after.characters, played.characters); assert.equal(after.campaign.seconds, 5)
  const merged = after.campaign.scenes.scenes[0]
  assert.equal(merged.name, 'Мой новый зал'); assert.equal(merged.description, third.scenes[0].description)
  assert.equal(merged.objects.find(o => o.id === 'table').x, 12); assert(merged.objects.some(o => o.id === 'local-candle'))
  assert(merged.objects.find(o => o.id === 'door').open); assert.equal(merged.tokens[0].x, 3)
  await f.restart(); assert.deepEqual(await api(root + '/world', gm.token), after)
  await api(root + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { revision: await revision(), permissions: [] })
  await api(root + '/scenes', helper.token, 'PUT', { revision: await revision(), scenes: result.state }, 403)
})
