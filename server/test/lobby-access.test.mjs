import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { createScene, emptyScenes } from '../generated/scenes.mjs'
import { lobbyPermissions } from '../generated/lobbyAccess.mjs'

for (const dialect of ['sqlite', 'postgres']) test('Разрешения и добровольная передача героя · ' + dialect, async t => {
  const f = await fixture(t, dialect), { api, request, register, restart } = f
  const gm = await register('owner'), player = await register('access-player'), helper = await register('access-helper'), observer = await register('access-observer')
  const lobby = await api('/lobbies', gm.token, 'POST', lobbyBody, 201), root = '/lobbies/' + lobby.id
  for (const u of [player, helper, observer]) await api(root + '/join', u.token, 'POST')
  const hero = { ...createDefaultCharacter(), id: crypto.randomUUID(), name: 'Герой владельца' }
  await api('/characters/' + hero.id, player.token, 'PUT', { character: hero, revision: -1 })
  const attached = await api(root + '/characters', player.token, 'POST', { characterId: hero.id }, 201)
  const characterId = attached.id, route = root + '/characters/' + characterId
  await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'ASSISTANT' })
  const revision = async () => (await api(root, gm.token)).revision
  const grant = async permissions => api(root + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { permissions, revision: await revision() })
  const projection = async token => (await api(root + '/world?view=player', token)).characters.find(c => c.id === characterId)
  const control = async (delegated, token = player.token, rev) => api(route + '/control', token, 'POST', { delegated, revision: rev ?? await revision() })
  const assign = async (userId, status = 200) => api(route + '/control-assignee', gm.token, 'POST', { userId, revision: await revision() }, status)
  const original = await api(root + '/world', gm.token)
  const originalCharacter = structuredClone(original.characters[0])

  await t.test('Роль помощника не выдаёт разрешений и не открывает секреты', async () => {
    assert.deepEqual((await api(root, helper.token)).myPermissions, [])
    const view = await api(root + '/world', helper.token)
    assert.equal(view.campaign.items, undefined); assert.equal(view.characters[0].rpg, undefined)
    assert.equal((await request(root + '/backup', helper.token)).status, 403)
    assert.equal((await request(root + '/scenes', helper.token)).status, 403)
    assert.equal((await request(root + '/world', helper.token, 'PUT', { world: original, revision: await revision() })).status, 403)
    assert.equal((await request(route, helper.token, 'PATCH', { approved: true })).status, 403)
    assert.equal((await request(root + '/members/' + helper.user.id + '/permissions', helper.token, 'PATCH', { permissions: lobbyPermissions, revision: await revision() })).status, 403)
    for (const permissions of [['unknown'], ['scenes', 'scenes'], 'scenes'])
      assert.equal((await request(root + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { permissions, revision: await revision() })).status, 400)
    assert.equal((await request(root + '/members/' + player.user.id + '/permissions', gm.token, 'PATCH', { permissions: ['scenes'], revision: await revision() })).status, 409)
  })
  await t.test('Отдельная операция сцен не раскрывает листы и не меняет время или владельцев', async () => {
    await grant(['scenes'])
    const editor = await api(root + '/scenes', helper.token)
    assert.deepEqual(Object.keys(editor).sort(), ['actors', 'revision', 'scenes'])
    assert.deepEqual(editor.actors[0], JSON.parse(JSON.stringify({ id: characterId, name: hero.name, profile: { portrait: hero.profile.portrait } })))
    const scenes = createScene(emptyScenes(), 'assistant-scene', 'Сцена помощника', 'top')
    await api(root + '/scenes', helper.token, 'PUT', { scenes, revision: editor.revision, world: { characters: [] }, seconds: 999, bindings: [] })
    const result = await api(root + '/world', gm.token)
    assert.deepEqual(result.characters[0], originalCharacter)
    assert.equal(result.campaign.seconds, original.campaign.seconds)
    assert.equal(result.bindings[0].owner_id, player.user.id)
    assert.deepEqual(result.campaign.scenes, scenes)
    assert.equal((await request(root + '/scenes', helper.token, 'PUT', { scenes, revision: editor.revision })).status, 409)
    assert.equal((await request(root + '/backup', helper.token)).status, 403)
    const other = await api('/lobbies', observer.token, 'POST', lobbyBody, 201)
    await api('/lobbies/' + other.id + '/join', helper.token, 'POST')
    assert.equal((await request('/lobbies/' + other.id + '/scenes', helper.token)).status, 403)
    assert.equal((await request('/lobbies/' + other.id + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { permissions: ['scenes'], revision: 0 })).status, 403, 'Роль OWNER сайта не заменяет лоббийное разрешение')
    await grant(['approveHeroes'])
    assert.equal((await request(root + '/scenes', helper.token)).status, 403)
    await api(route, helper.token, 'PATCH', { approved: true })
    assert.equal((await projection(player.token)).approved, true)
    assert.equal((await request(root + '/restore', helper.token, 'POST', { world: result, bindings: [{ characterId, ownerId: player.user.id, approved: true }], revision: await revision() })).status, 403)
  })
  await t.test('Секреты можно читать отдельно; полный редактор требует всех разрешений', async () => {
    await grant(['viewSecrets'])
    assert.ok((await api(root + '/world', helper.token)).characters[0].rpg)
    assert.ok((await api(root + '/backup', helper.token)).world.campaign.items)
    const full = await api(root + '/world', helper.token)
    assert.equal((await request(root + '/world', helper.token, 'PUT', { world: full, revision: full.revision })).status, 403)
    await grant([...lobbyPermissions])
    const writable = await api(root + '/world', helper.token)
    await api(root + '/world', helper.token, 'PUT', { world: writable, revision: writable.revision })
    await grant(['controlDelegated'])
  })
  await t.test('Ошибка записи истории откатывает передачу целиком', async () => {
    const db = f.server.db, transaction = db.transaction, logger = console.error, before = await revision()
    db.transaction = fn => transaction(tx => fn({ ...tx, run: async (sql, args) => {
      if (sql.startsWith('INSERT INTO audit')) throw Error('Injected control audit failure')
      return tx.run(sql, args)
    } }))
    console.error = () => {}
    try {
      await api(route + '/control', player.token, 'POST', { delegated: true, revision: before }, 500)
      assert.equal(await revision(), before)
      assert.equal((await projection(player.token)).control.delegated, false)
      assert.deepEqual(await api(route + '/control-history', player.token), [])
    } finally { db.transaction = transaction; console.error = logger }
  })
  await t.test('Передача требует согласия владельца, не меняет героя и не влияет на облачную копию', async () => {
    await assign(helper.user.id, 409)
    assert.equal((await request(route + '/control', gm.token, 'POST', { delegated: true, revision: await revision() })).status, 403)
    assert.equal((await request(route + '/control', player.token, 'POST', { delegated: 'true', revision: await revision() })).status, 400)
    assert.equal((await projection(player.token)).control.delegated, false)
    await control(true)
    const result = await api(root + '/world', gm.token)
    assert.deepEqual(result.characters[0], originalCharacter)
    assert.equal(result.bindings[0].owner_id, player.user.id)
    assert.equal(result.bindings[0].control.controllerId, gm.user.id)
    assert.equal((await api('/characters/' + hero.id, player.token)).character.id, hero.id)
    assert.equal((await request(route + '/control', player.token, 'POST', { delegated: true, revision: result.revision })).status, 409)
    assert.equal((await request(root + '/members/' + player.user.id, player.token, 'DELETE')).status, 409, 'Добровольная пауза не должна удалить переданного героя')
    assert.equal((await request(route + '/control-assignee', helper.token, 'POST', { userId: helper.user.id, revision: result.revision })).status, 403)
    await assign(observer.user.id, 403)
    await assign(helper.user.id)
    assert.equal((await projection(helper.token)).control.controllerId, helper.user.id)
    assert.ok((await projection(helper.token)).resources)
    assert.equal((await projection(observer.token)).resources, undefined)
    assert.ok((await projection(player.token)).resources, 'Владелец продолжает видеть своё состояние')
    const events = await api(route + '/control-history', player.token)
    assert.equal(events.find(e => e.action === 'delegate').actorId, player.user.id)
    assert.equal(events.find(e => e.action === 'assign').actorId, gm.user.id)
    await api(route + '/control-history', helper.token)
    assert.equal((await request(route + '/control-history', observer.token)).status, 403)
  })
  await t.test('Отзыв разрешения, понижение и удаление помощника возвращают управление главному ГМ', async () => {
    const before = await revision()
    await grant([])
    assert.equal((await projection(helper.token)).control.controllerId, gm.user.id)
    assert.equal((await projection(helper.token)).resources, undefined)
    assert.equal((await request(route + '/control-history', helper.token)).status, 403)
    assert.equal((await request(route + '/control', player.token, 'POST', { delegated: false, revision: before })).status, 409)
    await grant(['controlDelegated']); await assign(helper.user.id)
    await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'PLAYER' })
    assert.equal((await projection(player.token)).control.controllerId, gm.user.id)
    await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'ASSISTANT' })
    assert.deepEqual((await api(root, helper.token)).myPermissions, [])
    await grant(['controlDelegated']); await assign(helper.user.id)
    await api(root + '/members/' + helper.user.id, gm.token, 'DELETE')
    assert.equal((await projection(player.token)).control.controllerId, gm.user.id)
    assert.equal((await request(root + '/world', helper.token)).status, 403)
    await api(root + '/join', helper.token, 'POST')
    await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'ASSISTANT' })
    await grant(['controlDelegated']); await assign(helper.user.id)
  })
  await t.test('Восстановление сохраняет действующее согласие только при прежнем владельце', async () => {
    // Persisted rights/consent survive a process restart and re-running migrations.
    await restart()
    assert.equal((await projection(player.token)).control.controllerId, helper.user.id)
    assert.deepEqual((await api(root, helper.token)).myPermissions, ['controlDelegated'])
    await api('/admin/users/' + helper.user.id, gm.token, 'PATCH', { disabled: true })
    assert.equal((await projection(player.token)).control.controllerId, gm.user.id, 'Заблокированный помощник не является действующим управляющим')
    assert.equal((await request(route + '/control-history', helper.token)).status, 403)
    await api('/admin/users/' + helper.user.id, gm.token, 'PATCH', { disabled: false })
    assert.equal((await projection(player.token)).control.controllerId, helper.user.id)
    const backup = await api(root + '/backup', gm.token)
    assert.equal(backup.bindings[0].delegated, undefined); assert.equal(backup.bindings[0].control, undefined)
    await api(root + '/restore', gm.token, 'POST', { world: backup.world, bindings: backup.bindings, revision: await revision() })
    assert.equal((await projection(player.token)).control.controllerId, helper.user.id)
    await control(false)
    await api(root + '/restore', gm.token, 'POST', { world: backup.world, bindings: backup.bindings, revision: await revision() })
    assert.equal((await projection(player.token)).control.delegated, false, 'Старая копия не восстанавливает старое согласие')
    await control(true)
    const newBindings = [{ ...backup.bindings[0], ownerId: observer.user.id }]
    await api(root + '/restore', gm.token, 'POST', { world: backup.world, bindings: newBindings, revision: await revision() })
    assert.equal((await projection(observer.token)).control.delegated, false)
    await api(root + '/restore', gm.token, 'POST', { world: backup.world, bindings: backup.bindings, revision: await revision() })
    await control(true)
  })
  await t.test('Смена главного ГМ и одновременное возвращение сохраняют одного управляющего', async () => {
    await api(root + '/transfer', gm.token, 'POST', { userId: observer.user.id })
    assert.equal((await projection(player.token)).control.controllerId, observer.user.id)
    assert.deepEqual((await api(root, gm.token)).myPermissions, [...lobbyPermissions])
    const rev = (await api(root, observer.token)).revision
    const results = await Promise.all([
      request(route + '/control', player.token, 'POST', { delegated: false, revision: rev }),
      request(route + '/control-assignee', observer.token, 'POST', { userId: helper.user.id, revision: rev }),
    ])
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409])
    if ((await projection(player.token)).control.delegated) {
      const fresh = (await api(root, player.token)).revision
      await api(route + '/control', player.token, 'POST', { delegated: false, revision: fresh })
    }
    assert.equal((await projection(player.token)).control.controllerId, player.user.id)
    const events = await api(route + '/control-history', player.token)
    assert.ok(events.some(e => e.action === 'transfer-chief' && e.controllerId === observer.user.id))
    assert.equal(events.find(e => e.action === 'return').actorId, player.user.id)
    await api(root, observer.token, 'PATCH', { status: 'closed' })
    await api(route + '/control', player.token, 'POST', { delegated: true, revision: (await api(root, player.token)).revision }, 409)
  })
})
