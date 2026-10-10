import { fail, integer, text, id, now, worldSize, playerWorld, character } from './validation.mjs'
import { requireLobbyPermission } from './permissions.mjs'
import { controlledBindings, requireCharacterController } from './lobby-access.mjs'
import { emptyPerception, isPerceptionDraft, perceptionDraft, preparePerception, perceivedMap } from './generated/scenePerception.mjs'
import { emptyScenes } from './generated/scenes.mjs'
import { emptyJournalContent, isJournalContent, isJournal, MAX_JOURNAL_ENTRIES } from './generated/characterKnowledge.mjs'

const requireDisclosure = member => { requireLobbyPermission(member, 'scenes'); requireLobbyPermission(member, 'viewSecrets') }
const checkRevision = (lobby, revision) => { if (lobby.revision !== revision) fail(409, 'Кампания изменилась. Обнови сведения перед отправкой.') }
const publicEntry = e => ({ id: e.id, title: e.title, text: e.text, category: e.category, certainty: e.certainty, source: e.source, gameTime: e.gameTime,
  annotation: e.annotation, origin: e.origin, createdAt: e.createdAt, updatedAt: e.updatedAt })
const publicEffect = (e, index) => ({ id: 'observation:' + index, title: e.title, description: e.description, perception: e.perception, kind: e.kind, source: e.source,
  gameTime: e.gameTime, duration: e.duration, status: e.status })
async function heroContext(tx, lobby, characterId) {
  const state = JSON.parse(lobby.world_json), actor = state.characters.find(c => c.id === characterId)
  const [binding] = await controlledBindings(tx, lobby, await tx.all('SELECT * FROM character_bindings WHERE lobby_id=? AND character_id=?', [lobby.id, characterId]))
  if (!actor || !binding) fail(404, 'Герой не найден.')
  return { state, actor, binding, perception: state.campaign.perceptions?.heroes.find(h => h.actorId === actor.id) ?? emptyPerception(actor.id) }
}
function viewHero(state, actor, binding, perception, revision) {
  const hero = playerWorld({ ...state, revision }, binding.owner_id, [binding]).characters[0]
  return { revision, hero, map: perceivedMap(perception, state.campaign.scenes, state.characters),
    knowledge: { journal: actor.journal.map(publicEntry), knownEffects: actor.knownEffects.map(publicEffect) },
    inventory: actor.rpg.inventory.map(i => ({ id: i.id, name: i.name, description: i.description, quantity: i.quantity })) }
}
async function writeWorld(tx, req, lobby, state, action, record) {
  worldSize(state)
  await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=?', [JSON.stringify(state), now(), lobby.id])
  await record(tx, req, action)
}
export function perceptionRoutes(app, { db, auth, updated, lockedMembership, record }) {
  app.get('/api/lobbies/:id/characters/:characterId/perception', auth.middleware, async (req, res) => {
    const result = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req), context = await heroContext(tx, lobby, req.params.characterId)
      if (context.binding.owner_id !== req.user.id && context.binding.control.controllerId !== req.user.id) requireDisclosure(member)
      return { ...viewHero(context.state, context.actor, context.binding, context.perception, lobby.revision), canWriteNotes: context.binding.control.controllerId === req.user.id }
    }); res.json(result)
  })
  app.get('/api/lobbies/:id/characters/:characterId/disclosure', auth.middleware, async (req, res) => {
    const result = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireDisclosure(member)
      const { perception, state } = await heroContext(tx, lobby, req.params.characterId)
      return { revision: lobby.revision, draft: perceptionDraft(perception), scenes: state.campaign.scenes ?? emptyScenes(),
        actors: state.characters.map(c => ({ id: c.id, name: c.name })), preview: perceivedMap(perception, state.campaign.scenes, state.characters) }
    }); res.json(result)
  })
  app.put('/api/lobbies/:id/characters/:characterId/disclosure', auth.middleware, async (req, res) => {
    const revision = integer(req.body.revision), draft = req.body.draft
    if (!isPerceptionDraft(draft)) fail(400, 'Проверь раскрытие областей, объектов и контактов.')
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireDisclosure(member); checkRevision(lobby, revision)
      const { state, perception } = await heroContext(tx, lobby, req.params.characterId)
      let prepared
      try { prepared = preparePerception(draft, perception, state.campaign.scenes ?? emptyScenes(), state.characters.map(c => c.id)) }
      catch (e) { fail(400, e.message) }
      const others = state.campaign.perceptions?.heroes.filter(h => h.actorId !== req.params.characterId) ?? []
      state.campaign.perceptions = { version: 1, heroes: [...others, prepared] }
      await writeWorld(tx, req, lobby, state, 'disclose-scene', record)
    }); updated(req.params.id); res.json({ revision: revision + 1 })
  })
  app.post('/api/lobbies/:id/characters/:characterId/knowledge', auth.middleware, async (req, res) => {
    if (req.body.disclosure !== undefined && typeof req.body.disclosure !== 'boolean') fail(400, 'Проверь способ записи сведения.')
    const revision = integer(req.body.revision), disclosure = req.body.disclosure === true
    const content = { ...emptyJournalContent(), title: text(req.body.title, 120), text: text(req.body.text, 8000),
      category: req.body.category ?? 'other', certainty: disclosure ? req.body.certainty ?? 'reported' : 'hypothesis', source: disclosure ? 'Сведения мастера' : 'Личная заметка', gameTime: '' }
    if (!isJournalContent(content)) fail(400, 'Проверь категорию и достоверность сведения.')
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); checkRevision(lobby, revision)
      const { state, actor, binding } = await heroContext(tx, lobby, req.params.characterId)
      if (disclosure) requireDisclosure(member); else requireCharacterController(member, binding, req.user.id)
      if (actor.journal.length >= MAX_JOURNAL_ENTRIES) fail(409, 'Журнал героя заполнен.')
      const at = now(), entryId = id()
      actor.journal.push({ ...content, gameTime: String(state.campaign.seconds) + ' с', id: entryId, origin: disclosure ? 'automatic' : 'manual',
        ...(disclosure ? { eventKey: 'disclosure:' + entryId } : {}), annotation: '', createdAt: at, updatedAt: at })
      character(actor); await writeWorld(tx, req, lobby, state, disclosure ? 'disclose-knowledge' : 'hero-note', record)
    }); updated(req.params.id); res.status(201).json({ revision: revision + 1 })
  })
  app.patch('/api/lobbies/:id/characters/:characterId/knowledge/:entryId', auth.middleware, async (req, res) => {
    const revision = integer(req.body.revision), annotation = text(req.body.annotation ?? '', 4000, 0)
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); checkRevision(lobby, revision)
      const { state, actor, binding } = await heroContext(tx, lobby, req.params.characterId); requireCharacterController(member, binding, req.user.id)
      const entry = actor.journal.find(e => e.id === req.params.entryId); if (!entry) fail(404, 'Запись не найдена.')
      entry.annotation = annotation; entry.updatedAt = now()
      if (!isJournal(actor.journal)) fail(400, 'Не удалось проверить заметку.')
      character(actor); await writeWorld(tx, req, lobby, state, 'annotate-knowledge', record)
    }); updated(req.params.id); res.json({ revision: revision + 1 })
  })
}
