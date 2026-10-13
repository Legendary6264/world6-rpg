import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { createScene, emptyScenes } from '../generated/scenes.mjs'
const amount = n => ({ numerator: String(n), denominator: '1' })
const entry = (actorId, id, actionIndex = 0) => ({ id, actorId, sceneId: 'work-scene',
  origin: { collectionId: 'old-collection', epoch: 2, entryRevision: 1, actionIndex },
  action: { kind: 'interact', target: { kind: 'object', id: 'SECRET-TARGET' }, operation: 'inspect', note: 'PRIVATE-NOTE' },
  amount: { unit: 'personal-ms', total: amount(8000), remaining: amount(3000) } })
for (const dialect of ['sqlite', 'postgres']) test('Переносимая работа: сервер, копии и приватность · ' + dialect, async t => {
  const f = await fixture(t, dialect), { api } = f, gm = await f.register('owner'), player = await f.register('work-player'), other = await f.register('work-other'), helper = await f.register('work-helper')
  const { id } = await api('/lobbies', gm.token, 'POST', lobbyBody, 201), root = '/lobbies/' + id
  const ids = []
  for (const [index, user] of [player, other].entries()) {
    await api(root + '/join', user.token, 'POST')
    const character = { ...createDefaultCharacter(), id: 'source-' + index, name: 'Герой ' + index }
    await api('/characters/' + character.id, user.token, 'PUT', { character, revision: -1 })
    ids.push((await api(root + '/characters', user.token, 'POST', { characterId: character.id }, 201)).id)
  }
  await api(root + '/join', helper.token, 'POST')
  await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'ASSISTANT' })
  const world = () => api(root + '/world', gm.token), revision = async () => (await world()).revision
  const current = await world()
  current.campaign.scenes = createScene(emptyScenes(), 'work-scene', 'SECRET-SCENE', 'top')
  current.campaign.roundWork = { version: 1, entries: [entry(ids[0], 'first-work'), entry(ids[1], 'second-work')] }
  await api(root + '/world', gm.token, 'PUT', { revision: current.revision, world: current })
  await t.test('Мастер получает точные сохранённые данные; игрок видит только свою безопасную проекцию', async () => {
    assert.deepEqual((await world()).campaign.roundWork, current.campaign.roundWork)
    for (const [index, user] of [player, other].entries()) {
      const value = await api(root + '/world', user.token)
      assert.equal(value.campaign.roundWork.length, 1)
      assert.equal(value.campaign.roundWork[0].actorId, ids[index])
      assert.deepEqual(value.campaign.roundWork[0].amount.remaining, amount(3000))
      const text = JSON.stringify(value)
      for (const secret of ['SECRET-TARGET', 'SECRET-SCENE', 'PRIVATE-NOTE', 'old-collection', ids[1 - index]]) assert(!text.includes(secret), secret)
    }
    await api(root + '/world', '', 'GET', undefined, 401)
  })
  await t.test('Разрешение рассмотрения героя и вид игрока не раскрывают чужую работу', async () => {
    for (const permissions of [[], ['approveHeroes'], ['rounds']]) {
      await api(root + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { permissions, revision: await revision() })
      assert.deepEqual((await api(root + '/world', helper.token)).campaign.roundWork, [])
    }
    assert.deepEqual((await api(root + '/world?view=player', gm.token)).campaign.roundWork, [])
  })
  await t.test('Передача и возврат управления меняют доступ к работе, а прежний владелец сохраняет чтение', async () => {
    await api(root + '/characters/' + ids[0] + '/control', player.token, 'POST', { delegated: true, revision: await revision() })
    assert.equal((await api(root + '/world?view=player', gm.token)).campaign.roundWork[0].actorId, ids[0])
    assert.equal((await api(root + '/world', player.token)).campaign.roundWork[0].actorId, ids[0])
    await api(root + '/characters/' + ids[0] + '/control', player.token, 'POST', { delegated: false, revision: await revision() })
    assert.deepEqual((await api(root + '/world?view=player', gm.token)).campaign.roundWork, [])
  })
  await t.test('Неверная дробь, неизвестные поля и оборванные связи отвергаются без частичной записи', async () => {
    const before = await world()
    for (const change of [w => w.campaign.roundWork.entries[0].actorId = 'missing', w => w.campaign.roundWork.entries[0].sceneId = 'missing',
      w => w.campaign.roundWork.entries[0].amount.remaining = { numerator: '2', denominator: '4' },
      w => w.campaign.roundWork.entries[0].action.target.hidden = 'secret', w => w.campaign.roundWork.version = 2]) {
      const value = structuredClone(before); change(value)
      await api(root + '/world', gm.token, 'PUT', { revision: before.revision, world: value }, 400)
      assert.deepEqual(await world(), before)
    }
  })
  await t.test('Старый клиент не стирает работу; удаление нужной сцены или участника отклоняется', async () => {
    const before = await world(), old = structuredClone(before); delete old.campaign.roundWork
    await api(root + '/world', gm.token, 'PUT', { revision: before.revision, world: old }, 409)
    await api(root + '/scenes', gm.token, 'PUT', { revision: before.revision, scenes: emptyScenes() }, 409)
    await api(root + '/members/' + player.user.id, gm.token, 'DELETE', undefined, 409)
    assert.deepEqual(await world(), before)
    const removed = structuredClone(before); removed.characters = removed.characters.filter(c => c.id !== ids[0])
    await api(root + '/world', gm.token, 'PUT', { revision: before.revision, world: removed }, 400)
  })
  await t.test('Копия и перезапуск сохраняют работу; чтение/прогноз не изменяют часы', async () => {
    const before = await world(), exported = await api(root + '/backup', gm.token)
    assert.deepEqual(exported.world.campaign.roundWork, before.campaign.roundWork)
    await f.restart()
    assert.deepEqual(await world(), before)
  })
  await t.test('Восстановление копии сохраняет работу; старый формат без неё остаётся допустимым', async () => {
    const before = await world(), exported = await api(root + '/backup', gm.token)
    await api(root + '/restore', gm.token, 'POST', { revision: before.revision, world: exported.world, bindings: exported.bindings })
    assert.deepEqual((await world()).campaign.roundWork, before.campaign.roundWork)
    const old = structuredClone(exported.world); delete old.campaign.roundWork
    await api(root + '/restore', gm.token, 'POST', { revision: await revision(), world: old, bindings: exported.bindings })
    assert(!Object.hasOwn((await world()).campaign, 'roundWork'))
  })
})
