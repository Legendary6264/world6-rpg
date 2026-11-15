import {commitWorld} from './world-coordinator.mjs'
import {personalRoundResults} from './round-feedback.mjs'
import {personalRoundPresentation} from './round-presentation.mjs'
import {createHash} from 'node:crypto'
import {roundGeneration} from './rounds.mjs'
import {rejectRetiredCommand} from './campaign-retention-state.mjs'
import {isKnowledgeCommandKey,knowledgeEntryId} from './generated/knowledgeCommands.mjs'
import { personalRoundWork } from './generated/roundWork.mjs'
import { fail, integer, text, id, now, worldSize, playerWorld, character } from './validation.mjs'
import { requireLobbyPermission } from './permissions.mjs'
import { controlledBindings, requireCharacterController } from './lobby-access.mjs'
import { emptyPerception, isPerceptionDraft, perceptionDraft, preparePerception, perceivedMap } from './generated/scenePerception.mjs'
import { emptyScenes } from './generated/scenes.mjs'
import { emptyJournalContent, isJournalContent, isJournal, MAX_JOURNAL_ENTRIES } from './generated/characterKnowledge.mjs'

const requireDisclosure = member => { requireLobbyPermission(member, 'scenes'); requireLobbyPermission(member, 'viewSecrets') }
const checkRevision = (lobby, revision) => { if(lobby.status==='closed')fail(409,'Игра завершена. Сведения доступны только для чтения.'); if (lobby.revision !== revision) fail(409, 'Кампания изменилась. Обнови сведения перед отправкой.') }
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
  return { revision, seconds: state.campaign.seconds, work: personalRoundWork(state.campaign.roundWork,[actor.id]), hero, map: perceivedMap(perception, state.campaign.scenes, state.characters,state.campaign.seconds),
    knowledge: { journal: actor.journal.map(publicEntry), knownEffects: actor.knownEffects.map(publicEffect) },
    inventory: actor.rpg.inventory.map(i => ({ id: i.id, name: i.name, description: i.description, quantity: i.quantity })) }
}
async function writeWorld(tx, req, lobby, state, action, record) {
  worldSize(state)
  await commitWorld(tx,lobby,state,{at:now()})
  await record(tx, req, action)
}
export function perceptionRoutes(app, { db, auth, updated, lockedMembership, record,store,oldCommand }) {
  app.get('/api/lobbies/:id/characters/:characterId/round-results',auth.middleware,async(req,res)=>{
    const result=await db.transaction(async tx=>{
      const {lobby,member}=await lockedMembership(tx,req),context=await heroContext(tx,lobby,req.params.characterId)
      if(context.binding.owner_id!==req.user.id&&context.binding.control.controllerId!==req.user.id)requireDisclosure(member)
      return {revision:lobby.revision,generation:await roundGeneration(tx,lobby.id),closed:lobby.status==='closed',...await personalRoundResults(tx,lobby,context.actor.id,req.query.limit)}
    });res.json(result)
  })
  app.get('/api/lobbies/:id/characters/:characterId/round-results/:reportId/playback',auth.middleware,async(req,res)=>{
    const result=await db.transaction(async tx=>{
      const {lobby,member}=await lockedMembership(tx,req),context=await heroContext(tx,lobby,req.params.characterId)
      if(context.binding.owner_id!==req.user.id&&context.binding.control.controllerId!==req.user.id)requireDisclosure(member)
      return personalRoundPresentation(tx,lobby,context.actor.id,req.params.reportId)
    });res.json(result)
  })
  app.get('/api/lobbies/:id/characters/:characterId/perception', auth.middleware, async (req, res) => {
    const result = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req), context = await heroContext(tx, lobby, req.params.characterId)
      if (context.binding.owner_id !== req.user.id && context.binding.control.controllerId !== req.user.id) requireDisclosure(member)
      return { ...viewHero(context.state, context.actor, context.binding, context.perception, lobby.revision), closed:lobby.status==='closed', canWriteNotes: lobby.status!=='closed' && context.binding.control.controllerId === req.user.id }
    }); res.json(result)
  })
  app.get('/api/lobbies/:id/characters/:characterId/disclosure', auth.middleware, async (req, res) => {
    const result = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireDisclosure(member)
      const { perception, state } = await heroContext(tx, lobby, req.params.characterId)
      return { revision: lobby.revision, draft: perceptionDraft(perception), scenes: state.campaign.scenes ?? emptyScenes(),
        actors: state.characters.map(c => ({ id: c.id, name: c.name })), preview: perceivedMap(perception, state.campaign.scenes, state.characters,state.campaign.seconds) }
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
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))fail(400,'Проверь запись сведения.')
    const commandKey=req.body.commandKey
    if(commandKey!==undefined&&!isKnowledgeCommandKey(commandKey))fail(400,'Проверь ключ записи сведения.')
    if (req.body.disclosure !== undefined && typeof req.body.disclosure !== 'boolean') fail(400, 'Проверь способ записи сведения.')
    const revision = integer(req.body.revision), disclosure = req.body.disclosure === true
    const content = { ...emptyJournalContent(), title: text(req.body.title, 120), text: text(req.body.text, 8000),
      category: req.body.category ?? 'other', certainty: disclosure ? req.body.certainty ?? 'reported' : 'hypothesis', source: disclosure ? 'Сведения мастера' : 'Личная заметка', gameTime: '' }
    if (!isJournalContent(content)) fail(400, 'Проверь категорию и достоверность сведения.')
    const result=await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req)
      const { state, actor, binding } = await heroContext(tx, lobby, req.params.characterId)
      if (disclosure) requireDisclosure(member); else requireCharacterController(member, binding, req.user.id)
      const generation=commandKey?await roundGeneration(tx,lobby.id):null
      const requestHash=commandKey?createHash('sha256').update(JSON.stringify([req.params.characterId,revision,disclosure,content])).digest('hex'):null
      // Authorization comes first. A saved receipt acknowledges the original
      // command even after later world changes or closing the session.
      if(commandKey){
        await rejectRetiredCommand(tx,lobby.id,commandKey)
        const previous=await oldCommand(tx,lobby,req.user,commandKey,requestHash)
        if(previous){
          if(previous.receipt.generation!==generation)fail(409,'Запись относится к прежнему продолжению кампании. Проверь журнал перед новой записью.')
          return {...previous,revision:previous.receipt.revision,entryId:previous.receipt.entryId}
        }
      }
      checkRevision(lobby, revision)
      if (actor.journal.length >= MAX_JOURNAL_ENTRIES) fail(409, 'Журнал героя заполнен.')
      const at = now(), entryId = commandKey?knowledgeEntryId(commandKey):id()
      if(actor.journal.some(e=>e.id===entryId))fail(409,'Запись с таким идентификатором уже есть. Проверь журнал перед новой записью.')
      actor.journal.push({ ...content, gameTime: String(state.campaign.seconds) + ' с', id: entryId, origin: disclosure ? 'automatic' : 'manual',
        ...(disclosure ? { eventKey: 'disclosure:' + entryId } : {}), annotation: '', createdAt: at, updatedAt: at })
      character(actor)
      const operation=disclosure?'disclose-knowledge':'hero-note'
      if(commandKey){
        const saved=await store(tx,lobby,req.user,commandKey,requestHash,state,{operation,actorId:actor.id,entryId,revision:revision+1,generation,appliedAt:at},req)
        return {...saved,revision:revision+1,entryId}
      }
      await writeWorld(tx,req,lobby,state,operation,record)
      return {revision:revision+1}
    }); if(!result.duplicate)updated(req.params.id); res.status(result.duplicate?200:201).json(result)
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
