import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { createScene, emptyScenes, sceneObject } from '../generated/scenes.mjs'
const wait = seconds => ({ kind: 'wait', seconds, note: '' })
const door = operation => ({ kind: 'interact', target: { kind: 'object', id: 'private-door' }, operation, note: 'PRIVATE-NOTE' })
for (const dialect of ['sqlite', 'postgres']) test('Исполнение и повтор команды раунда · ' + dialect, async t => {
  const f = await fixture(t, dialect), { api } = f, gm = await f.register('owner'), player = await f.register('round-player'), helper = await f.register('round-helper')
  const { id } = await api('/lobbies', gm.token, 'POST', lobbyBody, 201), root = '/lobbies/' + id
  for (const user of [player, helper]) await api(root + '/join', user.token, 'POST')
  await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'ASSISTANT' })
  const character = { ...createDefaultCharacter(), id: 'round-hero', name: 'Герой раунда' }
  await api('/characters/' + character.id, player.token, 'PUT', { character, revision: -1 })
  const heroId = (await api(root + '/characters', player.token, 'POST', { characterId: character.id }, 201)).id
  const world = () => api(root + '/world', gm.token)
  await api(root + '/characters/' + heroId + '/review', gm.token, 'POST', { revision: (await world()).revision, decision: 'approve', note: '' })
  const initial = await world(); initial.campaign.scenes = createScene(emptyScenes(), 'round-scene', 'PRIVATE-SCENE', 'side')
  initial.campaign.scenes.scenes[0].objects.push(sceneObject('door', 'private-door', { x: 2, y: 3, z: 4 }))
  const collection = actions => ({ id: crypto.randomUUID(), sceneId: 'round-scene', sceneName: 'PRIVATE-SCENE', durationSeconds: 5, allowReplace: true,
    phase: 'closed', epoch: 2, participantIds: [heroId], entries: actions.length ? [{ actorId: heroId, actorName: 'Герой раунда', revision: 1, status: 'submitted',
      actions, resolved: actions.flatMap((a, index) => a.kind === 'interact' ? [{ index, objectId: 'private-door' }] : []), submittedBy: player.user.id,
      submittedAt: new Date().toISOString(), note: '' }] : [], history: [] })
  initial.campaign.declarations = { version: 1, active: collection([door('open'), wait(1)]), archive: [] }
  await api(root + '/world', gm.token, 'PUT', { revision: initial.revision, world: initial })
  const calculation = async (cost = 1000, token = gm.token) => { const w = await world(), c = w.campaign.declarations.active
    return api(root + '/rounds/calculate', token, 'POST', { revision: w.revision, collectionId: c.id, epoch: c.epoch, input: {
      timings: c.entries.filter(e => e.status === 'submitted').map(e => ({ actorId: e.actorId, entryRevision: e.revision, budgetMs: 5000,
        costs: e.actions.flatMap((a, index) => a.kind === 'wait' ? [] : [{ index, personalMs: cost }]) })), continuations: [], missingDecisions: [], interactionsConfirmed: true } }) }
  const command = p => ({ previewId: p.id, generation: p.generation, commandKey: crypto.randomUUID() })
  const apply = (body, status = 200, token = gm.token) => api(root + '/rounds/apply', token, 'POST', body, status)
  const install = async actions => { const w = await world(); w.campaign.declarations.active = collection(actions)
    await api(root + '/world', gm.token, 'PUT', { revision: w.revision, world: w }) }
  const grant = async permissions => api(root + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { revision: (await world()).revision, permissions })
  await t.test('Оба секретных разрешения обязательны; игроку расчёт не раскрывается', async () => {
    const w = await world(), body = { revision: w.revision, collectionId: w.campaign.declarations.active.id, epoch: 2, input: {} }
    for (const token of [player.token, helper.token]) await api(root + '/rounds/calculate', token, 'POST', body, 403)
    await grant(['rounds']); await api(root + '/rounds/calculate', helper.token, 'POST', body, 403)
  })
  let preview
  await t.test('Расчёт сохраняет только серверный предпросмотр, не меняя часы, мир и аудит', async () => {
    const before = await world(), audit = await f.server.db.get('SELECT COUNT(*) AS n FROM audit WHERE target_id=?', [id])
    preview = await calculation(); assert.equal(preview.summary.events.length, 2); assert.equal(preview.revision, before.revision)
    assert.deepEqual(await world(), before); assert.deepEqual(await f.server.db.get('SELECT COUNT(*) AS n FROM audit WHERE target_id=?', [id]), audit)
    assert.equal((await f.server.db.get('SELECT COUNT(*) AS n FROM round_receipts WHERE lobby_id=?', [id])).n, 0)
    await apply(command(preview), 403, player.token)
    const projection = JSON.stringify(await api(root + '/world', player.token))
    for (const secret of ['private-door', 'PRIVATE-SCENE', 'PRIVATE-NOTE', preview.id]) assert(!projection.includes(secret), secret)
  })
  await t.test('Клиент не подменяет результат; чужое лобби и чужой расчёт отвергаются', async () => {
    await apply({ ...command(preview), world: initial }, 400)
    await grant(['rounds', 'viewSecrets'])
    await apply(command(preview), 409, helper.token) // author-scoped preview
    const other = (await api('/lobbies', gm.token, 'POST', { ...lobbyBody, title: 'Другое лобби' }, 201)).id
    await api('/lobbies/' + other + '/rounds/apply', gm.token, 'POST', command(preview), 409)
  })
  await t.test('Устаревшая версия не применяется и не создаёт квитанцию', async () => {
    const p = await calculation(), w = await world()
    await api(root + '/world', gm.token, 'PUT', { revision: w.revision, world: w }); const before = await world()
    await apply(command(p), 409); assert.deepEqual(await world(), before)
  })
  await t.test('Обновление исполнителя и пустой запрос не приводят к частичной записи', async () => {
    const p = await calculation(), before = await world()
    await f.server.db.run('UPDATE round_previews SET executor_version=? WHERE id=?', ['old-executor', p.id])
    await apply(command(p), 409)
    await api(root + '/rounds/apply', gm.token, 'POST', undefined, 400)
    await api(root + '/rounds/calculate', gm.token, 'POST', undefined, 400)
    assert.deepEqual(await world(), before)
  })
  await t.test('Ошибка записи аудита откатывает мир, исходную копию и квитанцию вместе', async () => {
    preview = await calculation(); const before = await world(), body = command(preview), db = f.server.db, original = db.transaction
    db.transaction = fn => original(tx => fn({ ...tx, run: (sql, args) => {
      if (sql.startsWith('INSERT INTO audit') && args.includes('apply-round')) throw Error('TEST-AUDIT-FAILURE')
      return tx.run(sql, args)
    } }))
    try { await apply(body, 500) } finally { db.transaction = original }
    assert.deepEqual(await world(), before); assert.equal((await db.get('SELECT COUNT(*) AS n FROM round_receipts WHERE lobby_id=?', [id])).n, 0)
    assert(await db.get('SELECT id FROM round_previews WHERE id=?', [preview.id]))
  })
  await f.restart()
  let applied, successfulCommand
  await t.test('Применение после перезапуска сохраняет исходный мир и атомарно меняет время и дверь', async () => {
    const before = await world(); successfulCommand = command(preview)
    let notifications = 0; const original = f.server.io.to.bind(f.server.io)
    f.server.io.to = room => { const target = original(room); return { emit: (...args) => { if (args[0] === 'lobbyChanged') notifications++; return target.emit(...args) } } }
    applied = await apply(successfulCommand)
    assert.equal(applied.duplicate, false); assert.equal(notifications, 1)
    const after = await world(); assert.equal(after.revision, before.revision + 1); assert.equal(after.campaign.seconds, before.campaign.seconds + 5)
    assert.equal(after.campaign.scenes.scenes[0].objects[0].open, true)
    const saved = await f.server.db.get('SELECT * FROM round_receipts WHERE id=?', [applied.receipt.id])
    assert.equal(JSON.parse(saved.before_json).campaign.seconds, before.campaign.seconds)
    assert.deepEqual(JSON.parse(saved.before_json).campaign, before.campaign)
    await apply(successfulCommand); assert.equal(notifications, 1)
  })
  await f.restart()
  await t.test('Потерянный ответ и повтор после перезапуска возвращают прежнее подтверждение без новых последствий', async () => {
    const before = await world(), result = await apply(successfulCommand)
    assert.equal(result.duplicate, true); assert.deepEqual(result.receipt, applied.receipt); assert.deepEqual(await world(), before)
    assert.equal((await f.server.db.get("SELECT COUNT(*) AS n FROM audit WHERE target_id=? AND action='apply-round'", [id])).n, 1)
    await apply({ ...successfulCommand, previewId: 'different' }, 409)
    await apply(command(preview), 409)
  })
  await t.test('Квитанция сообщает историческую версию; исполненный сбор нельзя повторно открыть', async () => {
    const w = await world(); await api(root + '/world', gm.token, 'PUT', { revision: w.revision, world: w })
    const before = await world(), response = await apply(successfulCommand)
    assert(response.receipt.revision < before.revision); assert.deepEqual(await world(), before)
    await api(root + '/declarations', gm.token, 'PATCH', { collectionId: preview.collectionId, epoch: preview.epoch, operation: 'reopen' }, 409)
    assert.equal((await api(root + '/declarations', gm.token)).executed, true)
    const c = before.campaign.declarations.active
    await api(root + '/rounds/calculate', gm.token, 'POST', { revision: before.revision, collectionId: c.id, epoch: c.epoch, input: {} }, 409)
  })
  await t.test('Перенос очереди проходит через API и следующую кампанию без повторной оплаты работы', async () => {
    await install([door('close'), wait(1)]); const p = await calculation(8000)
    await apply(command(p)); const first = await world(), work = first.campaign.roundWork.entries
    assert.equal(work.length, 2); assert.equal(work[0].amount.remaining.numerator, '3000'); assert.equal(first.campaign.scenes.scenes[0].objects[0].open, true)
    await install([]); const w = await world(), c = w.campaign.declarations.active
    const next = await api(root + '/rounds/calculate', gm.token, 'POST', { revision: w.revision, collectionId: c.id, epoch: c.epoch, input: {
      timings: [], continuations: [{ actorId: heroId, mode: 'continue', budgetMs: 6000 }], missingDecisions: [], interactionsConfirmed: true } })
    assert.deepEqual(next.summary.events[0].atMs, { numerator: '2500', denominator: '1' }); await apply(command(next))
    const after = await world(); assert.equal(after.campaign.roundWork.entries.length, 0); assert.equal(after.campaign.scenes.scenes[0].objects[0].open, false)
    assert.equal(after.campaign.seconds, 15)
  })
  await t.test('Два мастера применяют один сбор ровно один раз', async () => {
    await install([wait(1)]); const one = await calculation(), two = await calculation(1000, helper.token), before = await world()
    const responses = await Promise.all([f.request(root + '/rounds/apply', gm.token, 'POST', command(one)), f.request(root + '/rounds/apply', helper.token, 'POST', command(two))])
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]); assert.equal((await world()).campaign.seconds, before.campaign.seconds + 5)
  })
  await t.test('Отзыв разрешений блокирует даже чтение подтверждения повтором', async () => {
    await install([wait(1)]); const p = await calculation(1000, helper.token), body = command(p); await apply(body, 200, helper.token)
    await grant(['rounds']); await apply(body, 403, helper.token); await grant(['rounds', 'viewSecrets']); assert.equal((await apply(body, 200, helper.token)).duplicate, true)
  })
  await t.test('Восстановление создаёт новое поколение и аннулирует прежние команды, сохраняя их историю', async () => {
    const copy = await api(root + '/backup', gm.token), before = await world()
    await api(root + '/restore', gm.token, 'POST', { revision: before.revision, world: copy.world, bindings: copy.bindings })
    await apply(successfulCommand, 409); assert.equal((await f.server.db.get('SELECT COUNT(*) AS n FROM round_previews WHERE lobby_id=?', [id])).n, 0)
    assert(await f.server.db.get('SELECT id FROM round_receipts WHERE id=?', [applied.receipt.id]))
    assert.equal((await api(root + '/declarations', gm.token)).executed, false)
  })
  await f.restart()
  await t.test('Квота истории останавливает запись без удаления копий; PostgreSQL-таблицы закрыты для PUBLIC', async () => {
    await install([wait(1)]); const p = await calculation(), before = await world(), existing = await f.server.db.get('SELECT id FROM round_receipts WHERE lobby_id=?', [id])
    await f.server.db.run('UPDATE round_receipts SET payload_bytes=? WHERE id=?', [64 * 1024 * 1024, existing.id])
    await apply(command(p), 409); assert.deepEqual(await world(), before); assert(await f.server.db.get('SELECT id FROM round_receipts WHERE id=?', [existing.id]))
    if (dialect === 'postgres') {
      const rows = await f.server.db.all("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('round_generations','round_previews','round_receipts')")
      assert.equal(rows.length, 3); assert(rows.every(r => r.relrowsecurity))
    }
  })
})
