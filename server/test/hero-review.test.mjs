import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, lobbyBody } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { createScene, emptyScenes, placeSceneToken } from '../generated/scenes.mjs'
import { defaultCreationConditions } from '../generated/heroReview.mjs'

async function setup(t, dialect) {
  const f = await fixture(t, dialect), { api } = f
  const gm = await f.register('owner'), player = await f.register('review-player'), helper = await f.register('review-helper'), observer = await f.register('review-observer')
  const { id } = await api('/lobbies', gm.token, 'POST', lobbyBody, 201), root = '/lobbies/' + id
  for (const u of [player, helper, observer]) await api(root + '/join', u.token, 'POST')
  await api(root + '/members/' + helper.user.id, gm.token, 'PATCH', { role: 'ASSISTANT' })
  const revision = async () => (await api(root, gm.token)).revision
  const grant = async permissions => api(root + '/members/' + helper.user.id + '/permissions', gm.token, 'PATCH', { permissions, revision: await revision() })
  await grant(['approveHeroes'])
  const source = { ...createDefaultCharacter(), id: crypto.randomUUID(), name: 'Исходный герой' }
  source.profile.rank = 'mortal'
  await api('/characters/' + source.id, player.token, 'PUT', { character: source, revision: -1 })
  const attach = async () => api(root + '/characters', player.token, 'POST', { characterId: source.id, sourceRevision: 0, revision: await revision() }, 201)
  const { id: characterId } = await attach(), route = root + '/characters/' + characterId
  const submission = (token = player.token) => api(route + '/submission', token)
  const review = async (decision, note = '', token = helper.token, status = 200) => api(route + '/review', token, 'POST', { decision, note, revision: await revision() }, status)
  const resubmit = async (sourceRevision = 0, status = 200, token = player.token) => api(route + '/resubmit', token, 'POST', { characterId: source.id, sourceRevision, revision: await revision() }, status)
  return { ...f, get server() { return f.server }, gm, player, helper, observer, root, source, characterId, route, revision, grant, submission, review, resubmit, attach }
}

for (const dialect of ['sqlite', 'postgres']) {
  test('Условия и рассмотрение героя · ' + dialect, async t => {
    const f = await setup(t, dialect), { api, gm, player, helper, observer, root, route } = f
    await t.test('Ограниченные проверяющие видят заявку, а остальные не видят лист и замечания', async () => {
      const copy = await f.submission(helper.token)
      assert.equal(copy.sheet.name, f.source.name); assert.equal(copy.currentSheet, undefined)
      assert.equal(copy.sourceId, undefined)
      assert.equal(copy.sheet.id, f.characterId); assert.equal(copy.canResubmit, false)
      await api(route + '/submission', observer.token, 'GET', undefined, 403)
      await f.review('return', 'Уточни происхождение.')
      for (const u of [player, helper]) {
        const view = await api(root + '/world?view=player', u.token)
        assert.equal(view.characters[0].review.note, 'Уточни происхождение.')
      }
      assert.equal((await api(root + '/world?view=player', observer.token)).characters[0].review.note, undefined)
      await f.grant(['viewSecrets'])
      assert.equal((await api(root + '/world', helper.token)).bindings[0].review.note, undefined)
      await f.grant(['controlDelegated'])
      await api(route + '/control', player.token, 'POST', { delegated: true, revision: await f.revision() })
      await api(route + '/control-assignee', gm.token, 'POST', { userId: helper.user.id, revision: await f.revision() })
      const view = (await api(root + '/world?view=player', helper.token)).characters[0]
      assert.ok(view.resources); assert.equal(view.review.note, undefined)
      await api(route + '/submission', helper.token, 'GET', undefined, 403)
      await f.resubmit(0, 409)
      await api(route + '/control', player.token, 'POST', { delegated: false, revision: await f.revision() })
      await f.grant(['approveHeroes'])
    })
    await t.test('Мастер задаёт условия с проверкой версии; изменение условий не сбрасывает героев', async () => {
      assert.deepEqual((await api(root, player.token)).creationConditions, defaultCreationConditions())
      const conditions = { ...defaultCreationConditions(), instructions: 'Начни без редкого имущества.', requireStartingRank: true, rankStep: 1, allowedRaceIds: [f.source.creation.raceId] }
      const rev = await f.revision()
      await api(root + '/creation-conditions', helper.token, 'PATCH', { revision: rev, conditions }, 403)
      await api(root + '/creation-conditions', gm.token, 'PATCH', { revision: rev, conditions: { ...conditions, rankStep: 4 } }, 400)
      await api(root + '/creation-conditions', gm.token, 'PATCH', { revision: rev, conditions: { ...conditions, allowedRaceIds: ['invented'] } }, 400)
      await api(root + '/creation-conditions', gm.token, 'PATCH', { revision: rev, conditions })
      await api(root + '/creation-conditions', gm.token, 'PATCH', { revision: rev, conditions }, 409)
      const before = await api(root + '/world', gm.token)
      await f.review('approve')
      const restricted = { ...conditions, rankStep: 2 }
      await api(root + '/creation-conditions', gm.token, 'PATCH', { revision: await f.revision(), conditions: restricted })
      const after = await api(root + '/world', gm.token)
      assert.deepEqual(after.characters, before.characters); assert.deepEqual(after.campaign, before.campaign)
      assert.equal(after.bindings[0].approved, 1)
      await api(root + '/characters', player.token, 'POST', { characterId: f.source.id, sourceRevision: 0, revision: after.revision }, 409)
      assert.equal((await api(root + '/world', gm.token)).characters.length, 1)
    })
  })

  test('Исправление сохраняет лоббийную копию и не переносит облачный прогресс автоматически · ' + dialect, async t => {
    const f = await setup(t, dialect), { api, gm, player, helper, root, route } = f
    await t.test('Возврат требует замечания, устаревшие решения и чужие исходники отвергаются', async () => {
      await f.review('return', '', helper.token, 400)
      const rev = await f.revision()
      await f.review('return', 'Исправь историю.')
      await api(route + '/review', helper.token, 'POST', { decision: 'approve', revision: rev }, 409)
      await f.resubmit(0, 403, helper.token)
      await api(route + '/resubmit', player.token, 'POST', { characterId: crypto.randomUUID(), sourceRevision: 0, revision: await f.revision() }, 404)
      assert.equal((await f.submission()).review.status, 'returned')
    })
    await t.test('Явная отправка заменяет только непринятого героя и сохраняет сцену, часы, другие листы и исходник', async () => {
      const corrected = { ...f.source, name: 'Исправленный герой', profile: { ...f.source.profile, biography: 'Уточнённая история.' } }
      await api('/characters/' + f.source.id, player.token, 'PUT', { character: corrected, revision: 0 })
      assert.equal((await f.submission()).sheet.name, f.source.name)
      const world = await api(root + '/world', gm.token)
      const npc = { ...createDefaultCharacter(), id: crypto.randomUUID(), name: 'Закрытый NPC' }
      world.characters.push(npc); world.campaign.seconds = 60
      world.campaign.scenes = placeSceneToken(createScene(emptyScenes(), 'scene', 'Сцена', 'side'), 'scene', { actorId: f.characterId, x: 3, y: 2, z: 5, diameter: 1, support: { kind: 'air' } })
      await api(root + '/world', gm.token, 'PUT', { world, revision: world.revision })
      await api(root, gm.token, 'PATCH', { status: 'playing' })
      const before = await api(root + '/world', gm.token), cloudBefore = await api('/characters/' + f.source.id, player.token)
      await f.resubmit(0, 409)
      await f.resubmit(1)
      const result = await api(root + '/world', gm.token), submission = await f.submission()
      assert.equal(result.characters[0].id, f.characterId); assert.equal(result.characters[0].name, corrected.name)
      assert.deepEqual(result.characters[1], before.characters[1]); assert.deepEqual(result.campaign, before.campaign)
      assert.equal(result.bindings.find(b => b.character_id === f.characterId).owner_id, player.user.id)
      assert.equal(submission.review.status, 'pending'); assert.equal(submission.review.note, 'Исправь историю.')
      assert.equal(submission.changedSinceSubmission, false)
      assert.deepEqual(await api('/characters/' + f.source.id, player.token), cloudBefore)
      const rev = await f.revision()
      await api(route + '/resubmit', player.token, 'POST', { characterId: f.source.id, sourceRevision: 1, revision: rev - 1 }, 409)
      const race = await Promise.all([
        f.request(route + '/review', helper.token, 'POST', { decision: 'approve', revision: rev }),
        f.request(route + '/resubmit', player.token, 'POST', { characterId: f.source.id, sourceRevision: 1, revision: rev }),
      ])
      assert.deepEqual(race.map(r => r.status).sort(), [200, 409])
      if (!(await f.submission()).review.locked) await f.review('approve')
      assert.equal((await f.submission()).review.locked, true)
    })
    await t.test('Принятие навсегда закрывает замену исходником, в том числе после возврата и восстановления', async () => {
      const backup = await api(root + '/backup', gm.token)
      assert.equal(backup.bindings.find(b => b.characterId === f.characterId).acceptedOnce, true)
      await f.review('return', 'Уточнение по игре.', gm.token)
      await f.resubmit(1, 409)
      backup.bindings.find(b => b.characterId === f.characterId).approved = false
      backup.bindings.find(b => b.characterId === f.characterId).acceptedOnce = false
      await api(root + '/restore', gm.token, 'POST', { world: backup.world, bindings: backup.bindings, revision: await f.revision() })
      await f.restart()
      assert.equal((await f.submission()).review.locked, true)
      await f.resubmit(1, 409)
    })
  })

  test('Снимок, восстановление и атомарность рассмотрения · ' + dialect, async t => {
    const f = await setup(t, dialect), { api, gm, player, helper, root, route } = f
    await t.test('Секретные правки мастера не попадают в исходную заявку; помощник не принимает изменённый лист вслепую', async () => {
      const world = await api(root + '/world', gm.token)
      world.characters[0].profile.biography = 'ТАЙНОЕ ДОПОЛНЕНИЕ МАСТЕРА'
      await api(root + '/world', gm.token, 'PUT', { world, revision: world.revision })
      const submission = await f.submission(helper.token)
      assert.equal(submission.changedSinceSubmission, true); assert.equal(submission.currentSheet, undefined)
      assert.equal(JSON.stringify(submission).includes('ТАЙНОЕ'), false)
      await f.review('approve', '', helper.token, 409)
      await f.review('return', 'Исправление допустимо.')
      await f.resubmit()
      await f.grant([])
      await f.review('approve', '', helper.token, 403)
      await f.grant(['approveHeroes'])
    })
    await t.test('Сбой журнала откатывает решение, снимок и ревизию целиком', async () => {
      const db = f.server.db, transaction = db.transaction, logger = console.error
      const before = await f.submission(), world = await api(root + '/world', gm.token)
      db.transaction = fn => transaction(tx => fn({ ...tx, run: async (sql, args) => {
        if (sql.startsWith('INSERT INTO audit')) throw Error('Injected review audit failure')
        return tx.run(sql, args)
      } }))
      console.error = () => {}
      try {
        await f.review('approve', '', helper.token, 500)
        assert.deepEqual(await f.submission(), before)
        await f.resubmit(0, 500)
        assert.deepEqual(await f.submission(), before)
        assert.deepEqual(await api(root + '/world', gm.token), world)
      } finally { db.transaction = transaction; console.error = logger }
    })
    await t.test('Переназначение владельца при восстановлении не раскрывает прежний частный снимок', async () => {
      await f.review('return', 'Частное замечание.')
      const backup = await api(root + '/backup', gm.token)
      backup.bindings[0].ownerId = helper.user.id
      await api(root + '/restore', gm.token, 'POST', { world: backup.world, bindings: backup.bindings, revision: await f.revision() })
      const next = await f.submission(helper.token)
      assert.equal(next.sheet, null); assert.equal(next.sourceId, undefined); assert.equal(next.review.note, '')
      await api(route + '/submission', player.token, 'GET', undefined, 403)
      await f.review('approve', '', helper.token, 409)
    })
    await t.test('Старые герои без известной истории мигрируют с защитой прогресса; повторный запуск идемпотентен', async () => {
      await f.server.db.run('DELETE FROM character_submissions WHERE lobby_id=?', [root.split('/').at(-1)])
      await f.restart()
      const migrated = await f.submission(helper.token)
      assert.equal(migrated.sheet, null); assert.equal(migrated.review.locked, true)
      assert.equal(migrated.canResubmit, false)
      await f.restart(); assert.deepEqual(await f.submission(helper.token), migrated)
      await f.review('approve', '', gm.token)
    })
  })
}
