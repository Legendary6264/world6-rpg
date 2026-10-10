import { isDeepStrictEqual } from 'node:util'
import { fail, integer, text, now, character, worldSize } from './validation.mjs'
import { requireChief, requireLobbyPermission } from './permissions.mjs'
import { hasLobbyPermission } from './generated/lobbyAccess.mjs'
import { defaultCreationConditions, isCreationConditions, creationConditionErrors, validStartingStep } from './generated/heroReview.mjs'
import { MAX_CAMPAIGN_BYTES } from './generated/campaignLimits.mjs'

export async function creationConditions(db, lobbyId) {
  const row = await db.get('SELECT conditions_json FROM lobby_creation_conditions WHERE lobby_id=?', [lobbyId])
  return row ? JSON.parse(row.conditions_json) : defaultCreationConditions()
}
export const reviewSummary = (binding, row) => ({ status: binding.approved ? 'approved' : row?.status === 'returned' ? 'returned' : 'pending',
  locked: !!binding.approved || !!row?.accepted_once, note: row?.note ?? '', submittedAt: row?.submitted_at ?? undefined, reviewedAt: row?.reviewed_at ?? undefined })
export async function submissionBindings(db, lobbyId, bindings, userId, canReview) {
  const rows = await db.all('SELECT character_id,status,note,accepted_once,submitted_at,reviewed_at FROM character_submissions WHERE lobby_id=?', [lobbyId])
  return bindings.map(b => {
    const review = reviewSummary(b, rows.find(r => r.character_id === b.character_id))
    return { ...b, review: b.owner_id === userId || canReview ? review : { status: review.status, locked: review.locked } }
  })
}
export async function reviewableCharacters(db, lobby) {
  const rows = await db.all('SELECT b.character_id FROM character_bindings b LEFT JOIN character_submissions s ON s.lobby_id=b.lobby_id AND s.character_id=b.character_id WHERE b.lobby_id=? AND (b.owner_id<>? OR s.source_character_id IS NOT NULL)', [lobby.id, lobby.owner_id])
  return rows.map(r => r.character_id)
}
function requireReviewable(member, lobby, binding, row) {
  if (binding.owner_id === lobby.owner_id && !row?.source_character_id && !hasLobbyPermission(member.role, member.permissions, 'viewSecrets')) fail(403, 'Проверка этого героя требует доступа к текущему листу мастера.')
}
export function sourceActor(data, actorId) {
  const actor = character(data); actor.id = actorId
  actor.rpg.casts = []; actor.rpg.effects = actor.rpg.effects.filter(e => !e.ownerId && !e.castId); actor.rpg.logs = []
  actor.rpg.abilities = actor.rpg.abilities.map(a => ({ ...a, approved: false })); return actor
}
export async function checkSubmissionBudget(tx, lobbyId, actor) {
  const rows = await tx.all('SELECT character_id,submitted_json FROM character_submissions WHERE lobby_id=? AND submitted_json IS NOT NULL', [lobbyId])
  const bytes = rows.filter(r => r.character_id !== actor.id).reduce((n, r) => n + Buffer.byteLength(r.submitted_json), 0) + Buffer.byteLength(JSON.stringify(actor))
  if (bytes > MAX_CAMPAIGN_BYTES) fail(413, 'Снимки заявок лобби превышают 8 МиБ. Уменьши объём листов перед отправкой.')
}
export async function newSubmission(tx, lobbyId, actor, sourceId) {
  await checkSubmissionBudget(tx, lobbyId, actor)
  await tx.run('INSERT INTO character_submissions(lobby_id,character_id,source_character_id,submitted_json,submitted_at) VALUES(?,?,?,?,?)', [lobbyId, actor.id, sourceId, JSON.stringify(actor), now()])
}
function editableSubmission(lobby, state, binding, row, delegated) {
  if (binding.approved || row?.accepted_once || delegated || lobby.status === 'closed') return false
  const actor = state.characters.find(c => c.id === binding.character_id)
  return !!actor && !actor.rpg.casts.length && !actor.rpg.effects.some(e => e.ownerId || e.castId) && !actor.rpg.logs.length &&
    !state.characters.some(c => c.id !== actor.id && (c.rpg.casts.some(k => k.targetId === actor.id && ['preparing','ready','maintaining'].includes(k.status)) || c.rpg.effects.some(e => e.ownerId === actor.id)))
}
export async function reviewHero(tx, req, lobby, member, decision, note, revision) {
  requireLobbyPermission(member, 'approveHeroes')
  if (revision !== undefined && lobby.revision !== revision) fail(409, 'Лист или условия изменились. Обнови заявку перед решением.')
  const binding = await tx.get('SELECT * FROM character_bindings WHERE lobby_id=? AND character_id=?', [lobby.id, req.params.characterId])
  if (!binding) fail(404, 'Герой не найден.')
  const row = await tx.get('SELECT * FROM character_submissions WHERE lobby_id=? AND character_id=?', [lobby.id, binding.character_id])
  requireReviewable(member, lobby, binding, row)
  const state = JSON.parse(lobby.world_json), actor = state.characters.find(c => c.id === binding.character_id)
  if (!actor) fail(404, 'Лист героя не найден.')
  if (decision === 'approve') {
    const errors = creationConditionErrors(actor, await creationConditions(tx, lobby.id), lobby)
    if (errors.length) fail(409, errors.join(' '))
    if ((!row?.submitted_json || !isDeepStrictEqual(JSON.parse(row.submitted_json), actor)) && !hasLobbyPermission(member.role, member.permissions, 'viewSecrets'))
      fail(409, 'Текущий лист отличается от снимка заявки или снимок отсутствует. Нужна повторная отправка владельцем либо проверка мастером с доступом к текущему листу.')
  }
  const at = now(), approved = decision === 'approve'
  await tx.run(`INSERT INTO character_submissions(lobby_id,character_id,status,note,accepted_once,reviewed_at,reviewed_by) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(lobby_id,character_id) DO UPDATE SET status=excluded.status,note=excluded.note,accepted_once=excluded.accepted_once,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by`,
    [lobby.id, binding.character_id, approved ? 'approved' : 'returned', note, approved || binding.approved || row?.accepted_once ? 1 : 0, at, req.user.id])
  await tx.run('UPDATE character_bindings SET approved=? WHERE lobby_id=? AND character_id=?', [approved ? 1 : 0, lobby.id, binding.character_id])
  await tx.run('UPDATE lobbies SET revision=revision+1,updated_at=? WHERE id=?', [at, lobby.id])
}

export async function restoredSubmissions(tx, lobbyId, previous, bindings) {
  for (const b of bindings) {
    const old = previous.find(r => r.character_id === b.characterId), sameOwner = old?.owner_id === b.ownerId
    const status = b.approved ? 'approved' : sameOwner && old.status === 'returned' ? 'returned' : 'pending'
    await tx.run(`INSERT INTO character_submissions(lobby_id,character_id,source_character_id,submitted_json,status,note,accepted_once,submitted_at,reviewed_at,reviewed_by) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [lobbyId, b.characterId, sameOwner ? old.source_character_id : null, sameOwner ? old.submitted_json : null, status,
        sameOwner && old.status === status ? old.note : '', b.approved || old?.accepted_once || b.acceptedOnce === true || !old && b.acceptedOnce !== false ? 1 : 0,
        sameOwner ? old.submitted_at : null, sameOwner && old.status === status ? old.reviewed_at : null, sameOwner && old.status === status ? old.reviewed_by : null])
  }
}

export function heroReviewRoutes(app, { db, auth, updated, lockedMembership, record }) {
  app.patch('/api/lobbies/:id/creation-conditions', auth.middleware, async (req, res) => {
    const revision = integer(req.body.revision), conditions = req.body.conditions
    if (!isCreationConditions(conditions)) fail(400, 'Проверь условия создания героев.')
    const candidate = { version: 1, instructions: conditions.instructions.trim(), requireStartingRank: conditions.requireStartingRank, rankStep: conditions.rankStep, allowedRaceIds: [...conditions.allowedRaceIds] }
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireChief(lobby, member, req.user)
      if (lobby.revision !== revision) fail(409, 'Кампания изменилась. Обнови условия перед сохранением.')
      if (candidate.requireStartingRank && !validStartingStep(candidate, lobby.rank)) fail(400, 'В выбранном ранге нет такой ступени.')
      await tx.run(`INSERT INTO lobby_creation_conditions(lobby_id,conditions_json) VALUES(?,?) ON CONFLICT(lobby_id) DO UPDATE SET conditions_json=excluded.conditions_json`, [lobby.id, JSON.stringify(candidate)])
      await tx.run('UPDATE lobbies SET revision=revision+1,updated_at=? WHERE id=?', [now(), lobby.id]); await record(tx, req, 'creation-conditions')
    }); updated(req.params.id); res.json({ revision: revision + 1 })
  })
  app.get('/api/lobbies/:id/characters/:characterId/submission', auth.middleware, async (req, res) => {
    const result = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req)
      const binding = await tx.get('SELECT * FROM character_bindings WHERE lobby_id=? AND character_id=?', [lobby.id, req.params.characterId])
      if (!binding) fail(404, 'Герой не найден.')
      const owner = binding.owner_id === req.user.id
      if (!owner) requireLobbyPermission(member, 'approveHeroes')
      const row = await tx.get('SELECT * FROM character_submissions WHERE lobby_id=? AND character_id=?', [lobby.id, binding.character_id])
      if (!owner) requireReviewable(member, lobby, binding, row)
      const state = JSON.parse(lobby.world_json), actor = state.characters.find(c => c.id === binding.character_id), sheet = row?.submitted_json ? JSON.parse(row.submitted_json) : null
      if (!actor) fail(404, 'Лист героя не найден.')
      const delegated = await tx.get('SELECT 1 AS n FROM character_delegations WHERE lobby_id=? AND character_id=?', [lobby.id, binding.character_id])
      return { revision: lobby.revision, sourceId: owner ? row?.source_character_id ?? undefined : undefined, review: reviewSummary(binding, row), sheet,
        ...(hasLobbyPermission(member.role, member.permissions, 'viewSecrets') ? { currentSheet: actor } : {}),
        changedSinceSubmission: !!sheet && !isDeepStrictEqual(sheet, actor), conditionErrors: sheet ? creationConditionErrors(sheet, await creationConditions(tx, lobby.id), lobby) : [],
        canResubmit: owner && editableSubmission(lobby, state, binding, row, delegated) }
    }); res.json(result)
  })
  app.post('/api/lobbies/:id/characters/:characterId/review', auth.middleware, async (req, res) => {
    const revision = integer(req.body.revision), decision = req.body.decision
    if (!['approve','return'].includes(decision)) fail(400, 'Выбери принятие или возврат листа.')
    const note = text(req.body.note ?? '', 4000, decision === 'return' ? 1 : 0)
    await db.transaction(async tx => { const { lobby, member } = await lockedMembership(tx, req); await reviewHero(tx, req, lobby, member, decision, note, revision); await record(tx, req, decision === 'approve' ? 'approve-character' : 'return-character') })
    updated(req.params.id); res.json({ revision: revision + 1 })
  })
  app.post('/api/lobbies/:id/characters/:characterId/resubmit', auth.middleware, async (req, res) => {
    const revision = integer(req.body.revision), sourceId = text(req.body.characterId, 160), sourceRevision = integer(req.body.sourceRevision)
    await db.transaction(async tx => {
      const { lobby } = await lockedMembership(tx, req)
      if (lobby.revision !== revision) fail(409, 'Лист или условия изменились. Обнови заявку перед отправкой.')
      const binding = await tx.get('SELECT * FROM character_bindings WHERE lobby_id=? AND character_id=?', [lobby.id, req.params.characterId])
      if (!binding) fail(404, 'Герой не найден.')
      if (binding.owner_id !== req.user.id) fail(403, 'Исправить заявку может только владелец героя.')
      const row = await tx.get('SELECT * FROM character_submissions WHERE lobby_id=? AND character_id=?', [lobby.id, binding.character_id]), state = JSON.parse(lobby.world_json)
      const delegated = await tx.get('SELECT 1 AS n FROM character_delegations WHERE lobby_id=? AND character_id=?', [lobby.id, binding.character_id])
      if (!editableSubmission(lobby, state, binding, row, delegated)) fail(409, 'Замена исходником недоступна после принятия героя, его игровых действий, закрытия лобби или передачи управления. Изменения игрового героя проводит мастер в кампании.')
      const source = await tx.get('SELECT * FROM characters WHERE id=? AND owner_id=?', [sourceId, req.user.id])
      if (!source) fail(404, 'Сохрани исправленный исходник в своём аккаунте.')
      if (source.revision !== sourceRevision) fail(409, 'Исходник изменился. Обнови список героев аккаунта.')
      const actor = sourceActor(JSON.parse(source.data_json), binding.character_id), errors = creationConditionErrors(actor, await creationConditions(tx, lobby.id), lobby)
      if (errors.length) fail(409, errors.join(' '))
      state.characters = state.characters.map(c => c.id === actor.id ? actor : c); worldSize(state); await checkSubmissionBudget(tx, lobby.id, actor)
      await tx.run(`INSERT INTO character_submissions(lobby_id,character_id,source_character_id,submitted_json,status,submitted_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(lobby_id,character_id) DO UPDATE SET source_character_id=excluded.source_character_id,submitted_json=excluded.submitted_json,status=excluded.status,submitted_at=excluded.submitted_at`,
        [lobby.id, actor.id, sourceId, JSON.stringify(actor), 'pending', now()])
      await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=?', [JSON.stringify(state), now(), lobby.id]); await record(tx, req, 'resubmit-character')
    }); updated(req.params.id); res.json({ revision: revision + 1 })
  })
}
