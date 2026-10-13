import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { createScene, emptyScenes, placeSceneToken } from '../generated/scenes.mjs'

for (const dialect of ['sqlite', 'postgres']) test('Сцены: сохранение, права, копии и совместимость · ' + dialect, async t => {
  const { api, request, register } = await fixture(t, dialect)
  const master = await register('owner'), player = await register('scene-player')
  const lobby = await api('/lobbies', master.token, 'POST', lobbyBody, 201)
  await api('/lobbies/' + lobby.id + '/join', player.token, 'POST')
  const hero = { ...createDefaultCharacter(), id: crypto.randomUUID(), name: 'Исследователь' }
  await api('/characters/' + hero.id, player.token, 'PUT', { character: hero, revision: -1 })
  await api('/lobbies/' + lobby.id + '/characters', player.token, 'POST', { characterId: hero.id }, 201)
  const initial = await api('/lobbies/' + lobby.id + '/world', master.token)
  let scenes = createScene(emptyScenes(), 'secret-scene', 'Закрытая сцена мастера', 'top')
  scenes.scenes[0].description = 'Секретная заметка, отсутствующая в выдаче игрока'
  scenes = placeSceneToken(scenes, 'secret-scene', { actorId: initial.characters[0].id,
    x: 4.125, y: 7.75, z: 12.5, diameter: .8, support: { kind: 'air' } })
  const world = { characters: initial.characters, campaign: { ...initial.campaign, scenes } }

  await t.test('Редактор сохраняет сцены, не изменяя лист и время', async () => {
    await api('/lobbies/' + lobby.id + '/world', master.token, 'PUT', { world, revision: initial.revision })
    const saved = await api('/lobbies/' + lobby.id + '/world', master.token)
    assert.deepEqual(saved.campaign.scenes, scenes)
    assert.deepEqual(saved.characters, initial.characters)
    assert.equal(saved.campaign.seconds, initial.campaign.seconds)
  })
  await t.test('Игрок и проекция мастера для игрока не получают сцен и секретов', async () => {
    const view = await api('/lobbies/' + lobby.id + '/world', player.token)
    assert.equal(view.campaign.scenes, undefined)
    assert(!JSON.stringify(view).includes('Секретная заметка'))
    const preview = await api('/lobbies/' + lobby.id + '/world?view=player', master.token)
    assert.equal(preview.campaign.scenes, undefined)
    await api('/lobbies/' + lobby.id + '/world', player.token, 'PUT', { world, revision: initial.revision + 1 }, 403)
  })
  await t.test('Неверный формат и неизвестный герой отклоняются без частичной записи', async () => {
    const revision = initial.revision + 1
    for (const change of [
      s => { s.version = 2 },
      s => { s.scenes[0].view = ['top'] },
      s => { s.scenes[0].palette = ['forest'] },
      s => { s.scenes[0].tokens[0].actorId = 'absent-hero' },
      s => { s.scenes[0].tokens[0].x = -1 },
      s => { s.scenes[0].tokens.push({ ...s.scenes[0].tokens[0] }) },
    ]) {
      const bad = structuredClone(world); change(bad.campaign.scenes)
      await api('/lobbies/' + lobby.id + '/world', master.token, 'PUT', { world: bad, revision }, 400)
      assert.equal((await api('/lobbies/' + lobby.id + '/world', master.token)).revision, revision)
    }
  })
  await t.test('Старый клиент не стирает уже сохранённые сцены публикацией', async () => {
    const { scenes: _scenes, ...legacyCampaign } = world.campaign
    const result = await request('/lobbies/' + lobby.id + '/world', master.token, 'PUT',
      { world: { ...world, campaign: legacyCampaign }, revision: initial.revision + 1 })
    assert.equal(result.status, 409)
    assert.match(result.data.message, /сцены/)
    assert.deepEqual((await api('/lobbies/' + lobby.id + '/world', master.token)).campaign.scenes, scenes)
  })
  await t.test('Копия и восстановление сохраняют сцену и владельца героя', async () => {
    const backup = await api('/lobbies/' + lobby.id + '/backup', master.token)
    assert.deepEqual(backup.world.campaign.scenes, scenes)
    const target = await api('/lobbies', master.token, 'POST', { ...lobbyBody, title: 'Восстановление сцены' }, 201)
    await api('/lobbies/' + target.id + '/join', player.token, 'POST')
    await api('/lobbies/' + target.id + '/restore', master.token, 'POST',
      { world: backup.world, bindings: backup.bindings, revision: 0 })
    const restored = await api('/lobbies/' + target.id + '/world', master.token)
    assert.deepEqual(restored.campaign.scenes, scenes)
    assert.equal(restored.bindings[0].owner_id, player.user.id)
  })
  await t.test('Удаление участника очищает размещение его удалённого героя', async () => {
    await api('/lobbies/' + lobby.id + '/members/' + player.user.id, master.token, 'DELETE')
    const after = await api('/lobbies/' + lobby.id + '/world', master.token)
    assert.equal(after.characters.length, 0)
    assert.equal(after.campaign.scenes.scenes[0].tokens.length, 0)
    assert.equal(after.campaign.scenes.scenes[0].name, scenes.scenes[0].name)
  })
})
