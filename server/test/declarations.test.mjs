import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody, gate } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { emptyItem, emptyAbility } from '../generated/rpgSchema.mjs'
import { emptyScenes, createScene, sceneObject, placeSceneToken } from '../generated/scenes.mjs'
import { parseLobbyBackup } from '../generated/lobbyBackup.mjs'

async function setup(t, dialect) {
  const f = await fixture(t, dialect), { api } = f, gm = await f.register('owner'), player = await f.register('orders-player'), other = await f.register('orders-other'), helper = await f.register('orders-helper')
  const { id } = await api('/lobbies', gm.token, 'POST', lobbyBody, 201), root = '/lobbies/' + id, heroes = []
  for (const u of [player, other, helper]) await api(root + '/join', u.token, 'POST')
  for (const u of [player, other]) {
    const a = { ...createDefaultCharacter(), id: crypto.randomUUID(), name: u === player ? 'Первый' : 'Второй' }
    a.rpg.inventory.push({ ...emptyItem(), id: 'own-item', templateId: '', name: 'Мой предмет', quantity: 2, durability: 100, equipped: false })
    a.rpg.abilities.push({ ...emptyAbility(), id: 'own-ability', templateId: '', name: 'Моя способность', approved: true }, { ...emptyAbility(), id: 'unapproved-ability', templateId: '', name: 'Неутверждённая', approved: false })
    await api('/characters/' + a.id, u.token, 'PUT', { character: a, revision: -1 })
    heroes.push((await api(root + '/characters', u.token, 'POST', { characterId: a.id }, 201)).id)
  }
  const npc = { ...createDefaultCharacter(), id: 'secret-plan-npc', name: 'СКРЫТЫЙ NPC' }, world = await api(root + '/world', gm.token)
  for (const a of world.characters) a.rpg.abilities.forEach(b => b.approved = b.id === 'own-ability')
  let scenes = createScene(emptyScenes(), 'orders-scene', 'ТАЙНАЯ СЦЕНА', 'side')
  scenes.scenes[0].objects.push({ ...sceneObject('door', 'known-door', { x: 2, y: 2, z: 0 }), name: 'Дверь' }, { ...sceneObject('crate', 'secret-object', { x: 15, y: 15, z: 0 }), name: 'СЕКРЕТНЫЙ ЯЩИК' })
  for (const [index, actorId] of [...heroes, npc.id].entries()) scenes = placeSceneToken(scenes, 'orders-scene', { actorId, x: 3 + index, y: 4, z: index === 2 ? 8 : 0, diameter: 1, support: { kind: index === 2 ? 'air' : 'ground' } })
  await api(root + '/world', gm.token, 'PUT', { world: { ...world, characters: [...world.characters, npc], campaign: { ...world.campaign, scenes } }, revision: world.revision })
  const revision = async () => (await api(root, gm.token)).revision, route = i => root + '/characters/' + heroes[i]
  for (const heroId of heroes) {
    await api(root + '/characters/' + heroId + '/review', gm.token, 'POST', { decision: 'approve', note: '', revision: await revision() })
    await api(root + '/characters/' + heroId + '/disclosure', gm.token, 'PUT', { revision: await revision(), draft: { activeSceneId: 'orders-scene', scenes: [{ sceneId: 'orders-scene', title: 'Двор', description: '',
      areas: [{ id: 'area', x: 0, y: 0, z: -5, width: 10, depth: 10, height: 25, visible: true }], objects: [{ objectId: 'known-door', visible: true }], contacts: [{ actorId: npc.id, kind: 'silhouette', label: '', signs: '', showHeight: false, point: { x: 2, y: 2, z: 11 }, radius: 3 }] }] } })
  }
  await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'ASSISTANT' })
  const grant = async p => api(root + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { permissions: p, revision: await revision() })
  const start = async (allowReplace = true, status = 201, token = gm.token, participants = heroes) => api(root + '/declarations', token, 'POST', { sceneId: 'orders-scene', participantIds: participants, durationSeconds: 5, allowReplace, revision: await revision() }, status)
  const view = (i = 0, token = i ? other.token : player.token) => api(route(i) + '/declarations', token)
  const body = (v, actions) => ({ collectionId: v.collection.id, epoch: v.collection.epoch, baseVersion: v.entry?.revision ?? 0, controlStamp: v.controlStamp, actions })
  const send = async (actions, i = 0, token = i ? other.token : player.token, status = 200, old) => api(route(i) + '/declarations', token, 'PUT', body(old ?? await view(i, token), actions), status)
  const phase = async operation => { const v = await api(root + '/declarations', gm.token); return api(root + '/declarations', gm.token, 'PATCH', { collectionId: v.declarations.active.id, epoch: v.declarations.active.epoch, operation }) }
  return { ...f, get server() { return f.server }, gm, player, other, helper, root, heroes, npc, route, revision, grant, start, view, body, send, phase }
}
const wait = (note = '') => [{ kind: 'wait', seconds: 1, note }]
for (const dialect of ['sqlite', 'postgres']) {
  test('Заявления: приватность, конкуренция и сохранение · ' + dialect, async t => {
    const f = await setup(t, dialect), { api, gm, player, other, helper } = f
    await t.test('Требуются права раундов и секретов; глобальная роль и неполный набор их не заменяют', async () => {
      for (const permissions of [[], ['rounds'], ['viewSecrets']]) { await f.grant(permissions); await f.start(true, 403, helper.token); await api(f.root + '/declarations', helper.token, 'GET', undefined, 403) }
      await f.grant(['rounds', 'viewSecrets']); await f.start(true, 201, helper.token)
      await f.grant([]); await api(f.root + '/declarations', helper.token, 'GET', undefined, 403)
      await api(f.route(0) + '/declarations', other.token, 'GET', undefined, 403)
      await api(f.route(0) + '/declarations', '', 'GET', undefined, 401)
    })
    await t.test('Два игрока заявляют одновременно: чужая запись не делает мою версию устаревшей; двойная моя отправка отклоняется', async () => {
      const a = await f.view(), b = await f.view(1)
      const result = await Promise.all([f.send(wait('ЧАСТНЫЙ ПЛАН ПЕРВОГО'), 0, player.token, 200, a), f.send(wait('ЧАСТНЫЙ ПЛАН ВТОРОГО'), 1, other.token, 200, b)])
      assert.deepEqual(result.map(r => r.entryVersion), [1, 1])
      await f.send(wait('Повтор старой версии'), 0, player.token, 409, a)
      const view = await f.view(); assert.equal(view.readiness.every(r => r.ready), true)
      assert(!JSON.stringify(view).includes('ЧАСТНЫЙ ПЛАН ВТОРОГО')); assert.equal(view.entry.actions[0].note, 'ЧАСТНЫЙ ПЛАН ПЕРВОГО')
      assert(!JSON.stringify(await f.view(1)).includes('ЧАСТНЫЙ ПЛАН ПЕРВОГО'))
      assert.equal((await api(f.root + '/declarations', gm.token)).declarations.active.entries.length, 2)
    })
    await t.test('План не меняет игровые часы, ресурсы, тело, позиции и содержимое чата; лишние поля не подменяют мир', async () => {
      const before = await api(f.root + '/world', gm.token), v = await f.view()
      const contact = v.options.targets.find(t => t.kind === 'contact')
      const actions = [{ kind: 'move', route: [{ x: 6, y: 7, z: 2 }], support: 'air', note: '', world: { seconds: 1e6 } },
        { kind: 'speak', text: 'СЕКРЕТНАЯ РЕПЛИКА', volume: 'whisper', target: { kind: 'none' }, note: '' },
        { kind: 'ability', abilityId: 'own-ability', stage: 'prepare', target: { kind: 'contact', id: contact.id }, note: '' },
        { kind: 'item', itemId: 'own-item', quantity: 2, target: { kind: 'self' }, note: '' }, { kind: 'interact', operation: 'open', target: { kind: 'object', id: 'known-door' }, note: '' }, ...wait()]
      await f.send(actions)
      const after = await api(f.root + '/world', gm.token)
      assert.deepEqual(after.characters, before.characters); assert.equal(after.campaign.seconds, before.campaign.seconds)
      assert.deepEqual(after.campaign.scenes, before.campaign.scenes); assert.deepEqual(after.campaign.perceptions, before.campaign.perceptions)
      assert.deepEqual((await api(f.root + '/messages', other.token)).items, [])
      const json = JSON.stringify(await f.view()); for (const secret of [f.npc.id, f.npc.name, 'СЕКРЕТНЫЙ ЯЩИК', 'ТАЙНАЯ СЦЕНА', 'resolved', 'world']) assert(!json.includes(secret), secret)
    })
    await t.test('Доступные цели и собственные предметы проверяются заново; неутверждённая способность и нечисловой ввод отклоняются', async () => {
      for (const actions of [ [{ kind: 'interact', operation: 'take', target: { kind: 'object', id: 'secret-object' }, note: '' }],
        [{ kind: 'ability', abilityId: 'own-ability', stage: 'release', target: { kind: 'contact', id: f.npc.id }, note: '' }],
        [{ kind: 'item', itemId: 'own-item', quantity: 3, target: { kind: 'self' }, note: '' }],
        [{ kind: 'ability', abilityId: 'unapproved-ability', stage: 'prepare', target: { kind: 'none' }, note: '' }] ]) await f.send(actions, 0, player.token, 409)
      await f.send([{ kind: 'move', route: [{ x: 1e5, y: 1, z: 0 }], support: 'ground', note: '' }], 0, player.token, 400)
      await f.send([{ kind: 'wait', seconds: '1', note: '' }], 0, player.token, 400)
      await f.send([], 0, player.token, 400)
    })
    await t.test('Приблизительный звук не сохраняет ID скрытого говорящего и не раскрывает неизвестную высоту', async () => {
      const d = await api(f.route(0) + '/disclosure', gm.token); d.draft.scenes[0].contacts[0].kind = 'sound'
      await api(f.route(0) + '/disclosure', gm.token, 'PUT', { draft: d.draft, revision: d.revision })
      const v = await f.view(), contact = (await api(f.route(0) + '/perception', player.token)).map.contacts.find(t => t.kind === 'sound')
      assert.equal(contact.z, undefined); assert(!v.options.targets.some(t => t.id === contact.id))
      await f.send([{ kind: 'ability', abilityId: 'own-ability', stage: 'release', target: { kind: 'contact', id: contact.id }, note: '' }], 0, player.token, 409)
      await f.send([{ kind: 'ability', abilityId: 'own-ability', stage: 'release', target: { kind: 'point', point: { x: 2, y: 2, z: 0 } }, note: '' }])
      const own = await f.view(); assert.deepEqual(own.entry.actions[0].target, { kind: 'point', point: { x: 2, y: 2, z: 0 } })
      const master = await api(f.root + '/declarations', gm.token), entry = master.declarations.active.entries.find(e => e.actorId === f.heroes[0])
      assert.deepEqual(entry.resolved, []); assert(!JSON.stringify(own.entry).includes(f.npc.id))
    })
    await t.test('Закрытие не штрафует отсутствующего; старый запрос отклоняется также после повторного открытия', async () => {
      const old = await f.view(), before = await api(f.root + '/world', gm.token)
      await f.phase('close'); await f.send(wait(), 0, player.token, 409, old)
      await f.phase('reopen'); await f.send(wait(), 0, player.token, 409, old)
      const after = await api(f.root + '/world', gm.token); assert.deepEqual(after.characters, before.characters); assert.equal(after.campaign.seconds, before.campaign.seconds)
    })
    await t.test('Правки по возврату: политика мастера, замечание и история старого плана сохраняются', async () => {
      await f.phase('close'); await f.phase('archive'); await f.start(false)
      await f.send(wait('Исходный план')); await f.send(wait('Нельзя менять'), 0, player.token, 409)
      let v = await f.view()
      await api(f.route(0) + '/declarations/return', gm.token, 'POST', { collectionId: v.collection.id, epoch: v.collection.epoch, baseVersion: v.entry.revision, note: 'Уточни ожидание.' })
      v = await f.view(); assert.equal(v.entry.status, 'returned'); assert.equal(v.entry.note, 'Уточни ожидание.')
      await f.send(wait('Исправленный план'))
      const history = (await api(f.root + '/declarations', gm.token)).declarations.active.history
      assert.equal(history.filter(e => e.kind === 'submit').length, 2); assert.equal(history.find(e => e.kind === 'submit').entry.actions[0].note, 'Исходный план')
    })
    await t.test('Управляет один участник; старый черновик не принимается после передачи и возврата управления', async () => {
      const old = await f.view()
      await api(f.route(0) + '/control', player.token, 'POST', { delegated: true, revision: await f.revision() })
      await f.send(wait(), 0, player.token, 403, old)
      const chiefView = await f.view(0, gm.token); await f.send(wait(), 0, gm.token, 409, chiefView) // immutable policy until GM returns it
      await api(f.route(0) + '/control', player.token, 'POST', { delegated: false, revision: await f.revision() })
      await f.send(wait(), 0, player.token, 409, old)
      assert.notEqual((await f.view()).controlStamp, old.controlStamp)
    })
  })
  test('Заявления: отзыв доступа, транзакции и копии · ' + dialect, async t => {
    const f = await setup(t, dialect), { api, gm, player, other, helper } = f
    await f.start(true)
    await t.test('Ожидание и подготовка на себя доступны без раскрытой карты и не выдают скрытую сцену', async () => {
      const before = await api(f.route(0) + '/disclosure', gm.token)
      const world = await api(f.root + '/world', gm.token)
      world.campaign.perceptions.heroes = world.campaign.perceptions.heroes.filter(h => h.actorId !== f.heroes[0])
      await api(f.root + '/world', gm.token, 'PUT', { world, revision: world.revision })
      const v = await f.view(); assert.equal(v.options.frame, null); assert.deepEqual(v.options.targets, [])
      assert(!JSON.stringify(v).includes('orders-scene')); assert(!JSON.stringify(v).includes('ТАЙНАЯ СЦЕНА'))
      await f.send([...wait('Ожидание вслепую'), { kind: 'ability', abilityId: 'own-ability', stage: 'prepare', target: { kind: 'self' }, note: '' }])
      await api(f.route(0) + '/disclosure', gm.token, 'PUT', { draft: before.draft, revision: await f.revision() })
    })
    await t.test('Отзыв разрешения до выполнения запроса проверяется заново под блокировкой', async () => {
      await f.grant(['rounds', 'viewSecrets', 'controlDelegated'])
      await api(f.route(0) + '/control', player.token, 'POST', { delegated: true, revision: await f.revision() })
      await api(f.route(0) + '/control-assignee', gm.token, 'POST', { userId: helper.user.id, revision: await f.revision() })
      const v = await f.view(0, helper.token), g = gate(), db = f.server.db, original = db.transaction
      db.transaction = async work => { db.transaction = original; g.reached(); await g.wait; return original(work) }
      const pending = f.send(wait('Запрос после отзыва'), 0, helper.token, 403, v)
      await g.waiting
      try { await f.grant(['rounds', 'viewSecrets']) } finally { g.release(); db.transaction = original }
      await pending
      assert.equal((await f.view()).entry.actions[0].note, 'Ожидание вслепую')
      await api(f.route(0) + '/control', player.token, 'POST', { delegated: false, revision: await f.revision() })
      await f.send(wait('Исправленный план'))
    })
    await t.test('Ошибка записи аудита откатывает заявление и его историю', async () => {
      const v = await f.view(1), before = await api(f.root + '/world', gm.token), original = f.server.db.transaction, logger = console.error
      console.error = () => {}
      f.server.db.transaction = work => original.call(f.server.db, tx => work({ ...tx, run: (sql, args) => { if (sql.startsWith('INSERT INTO audit')) throw Error('audit unavailable'); return tx.run(sql, args) } }))
      try { await f.send(wait(), 1, other.token, 500, v) } finally { f.server.db.transaction = original; console.error = logger }
      assert.deepEqual((await api(f.root + '/world', gm.token)).campaign.declarations, before.campaign.declarations)
    })
    await t.test('Копия и перезапуск сохраняют историю; старый клиент не может удалить заявления из полной записи', async () => {
      const backup = await api(f.root + '/backup', gm.token), parsed = parseLobbyBackup(JSON.stringify(backup))
      assert(parsed.world.campaign.declarations); const before = await api(f.root + '/declarations', gm.token)
      const old = await f.view()
      await api(f.root + '/restore', gm.token, 'POST', { world: backup.world, bindings: backup.bindings, revision: await f.revision() })
      const restored = await api(f.root + '/declarations', gm.token)
      assert.notEqual(restored.declarations.active.id, before.declarations.active.id)
      assert.deepEqual(restored.declarations.active.entries, before.declarations.active.entries)
      assert.deepEqual(restored.declarations.active.history, before.declarations.active.history)
      await f.send(wait('Запрос до восстановления'), 0, player.token, 409, old)
      await f.restart(); assert.deepEqual((await api(f.root + '/declarations', gm.token)).declarations, restored.declarations)
      const world = await api(f.root + '/world', gm.token); delete world.campaign.declarations
      await api(f.root + '/world', gm.token, 'PUT', { world, revision: world.revision }, 409)
    })
    await t.test('Удаление сцены останавливает сбор, сохраняет планы и не создаёт исполнения', async () => {
      const scenes = await api(f.root + '/scenes', gm.token)
      await api(f.root + '/scenes', gm.token, 'PUT', { scenes: { version: 1, activeSceneId: null, scenes: [] }, revision: scenes.revision })
      const v = await f.view(); assert.equal(v.collection.phase, 'cancelled'); assert.equal(v.options.frame, null); assert.equal(v.canSubmit, false)
      assert.equal(v.entry.actions[0].note, 'Исправленный план')
    })
  })
}
