import { fail, id, integer, now, worldSize } from './validation.mjs'
import { requireLobbyPermission } from './permissions.mjs'
import { controlledBindings, requireCharacterController } from './lobby-access.mjs'
import { emptyDeclarations, isActionSequence, isActionDeclarations, copyDeclaredAction, actionTarget } from './generated/actionDeclarations.mjs'
import { emptyPerception, perceivedMap } from './generated/scenePerception.mjs'
import { previewRoundTimeline } from './generated/roundTimeline.mjs'
import { bodyConsequences, bodyRegionDefs } from './generated/characterBody.mjs'
import { copyConsumableEffect, copyAbility } from './generated/rpgSchema.mjs'
import { collectionExecuted, requireCampaignRunning, campaignSession } from './round-branch.mjs'
import { roundGeneration } from './rounds.mjs'
const requireMaster = member => { requireLobbyPermission(member, 'rounds'); requireLobbyPermission(member, 'viewSecrets') }
const publicCollection = c => c ? { id: c.id, epoch: c.epoch, phase: c.phase, durationSeconds: c.durationSeconds, allowReplace: c.allowReplace } : null
const publicEntry = e => e ? { revision: e.revision, status: e.status, actions: e.actions.map(copyDeclaredAction), submittedAt: e.submittedAt, submittedBy: e.submittedBy, note: e.note } : null
const checkEpoch = (c, body) => { if (!c || c.id !== body.collectionId || c.epoch !== integer(body.epoch)) fail(409, 'Сбор заявлений изменился. Проверь последовательность и открой свежую версию.') }
const assertOpen = lobby => { if (lobby.status === 'closed') fail(409, 'Лобби закрыто.') }
function options(state, actor, c, npc=false) {
  if(npc&&c){const scene=state.campaign.scenes?.scenes.find(s=>s.id===c.sceneId)
    return {frame:scene?{width:scene.width,depth:scene.depth,minZ:scene.minZ,maxZ:scene.maxZ}:null,
      targets:scene?[...scene.tokens.filter(t=>t.actorId!==actor.id).map(t=>({id:t.actorId,kind:'contact',label:state.characters.find(a=>a.id===t.actorId)?.name??'Существо'})),...scene.objects.map(o=>({id:o.id,kind:'object',label:o.name}))]:[],
      items:actor.rpg.inventory.filter(i=>i.quantity>0).map(i=>({id:i.id,name:i.name,quantity:i.quantity})),
      abilities:[...new Map([...actor.rpg.abilities.filter(a=>a.approved),...actor.rpg.casts.filter(c=>c.ability.approved&&['preparing','ready'].includes(c.status)).map(c=>c.ability)].map(a=>[a.id,{id:a.id,name:a.name,...(a.spatial?{spatial:copyAbility(a).spatial}:{})}])).values()]}
  }
  const p = state.campaign.perceptions?.heroes.find(h => h.actorId === actor.id) ?? emptyPerception(actor.id)
  const map = perceivedMap(p, state.campaign.scenes, state.characters)
  if (!c) return null
  const visible = map && p.activeSceneId === c.sceneId ? map : null
  return { frame: visible ? { width: visible.frame.width, depth: visible.frame.depth, minZ: visible.frame.minZ, maxZ: visible.frame.maxZ } : null,
    targets: [...(visible?.contacts ?? []).filter(t => t.kind !== 'self' && t.kind !== 'sound').map(t => ({ id: t.id, kind: 'contact', label: t.label })), ...(visible?.objects ?? []).map(o => ({ id: o.id, kind: 'object', label: o.name }))],
    items: actor.rpg.inventory.filter(i => i.quantity > 0).map(i => ({ id: i.id, name: i.name, quantity: i.quantity })),
    abilities: [...new Map([...actor.rpg.abilities.filter(a => a.approved),...actor.rpg.casts.filter(c=>c.ability.approved&&['preparing','ready'].includes(c.status)).map(c=>c.ability)].map(a=>[a.id,{id:a.id,name:a.name,...(a.spatial?{spatial:copyAbility(a).spatial}:{})}])).values()] }
}
function prepareActions(actions, state, actor, c,npc=false) {
  const o = options(state, actor, c,npc)
  if (!o) fail(409, 'Мастер должен открыть герою сцену этого сбора заявлений.')
  const inFrame = p => o.frame && p.x >= 0 && p.x <= o.frame.width && p.y >= 0 && p.y <= o.frame.depth && p.z >= o.frame.minZ && p.z <= o.frame.maxZ
  const known = state.campaign.perceptions?.heroes.find(h => h.actorId === actor.id)?.scenes.find(s => s.sceneId === c.sceneId)
  const result = [], resolved = []
  actions.forEach((input, index) => {
    const a = copyDeclaredAction(input), focus=actionTarget(a)
    if (!o.frame && (a.kind === 'move' || focus && ['point','area','direction'].includes(focus.kind))) fail(409, 'Мастер должен открыть герою схему сцены для выбора координат.')
    if (a.kind === 'move' && !a.route.every(inFrame) || focus && ['point','area','direction'].includes(focus.kind) && !inFrame(focus.point)) fail(400, 'Проверь координаты в доступной схеме сцены.')
    if (focus && ['contact', 'object'].includes(focus.kind)) {
      const target = o.targets.find(t => t.kind === focus.kind && t.id === focus.id)
      if (!target) fail(409, 'Выбранная отметка больше не доступна герою. Проверь цель.')
      if (target.kind === 'object') resolved.push({ index, objectId: target.id })
      else {
        const contact = npc?{kind:'creature',actorId:target.id}:known?.contacts.find(t => t.id === target.id)
        // Sound markers do not identify a creature; the player must choose an explicit point.
        if (!contact || contact.kind === 'sound') fail(409, 'Выбери точку звука и высоту вместо существа.')
        resolved.push({ index, actorId: contact.actorId })
      }
    }
    if (a.kind === 'item' && !o.items.some(i => i.id === a.itemId && i.quantity >= a.quantity)) fail(409, 'Проверь предмет и количество в инвентаре героя.')
    if (a.kind === 'ability' && !(a.stage==='prepare'?actor.rpg.abilities.some(b=>b.id===a.abilityId&&b.approved):o.abilities.some(b => b.id === a.abilityId))) fail(409, 'Выбери утверждённую способность героя или существующий заряд для выпуска.')
    result.push(a)
  }); return { actions: result, resolved }
}
async function bindingsFor(tx, lobby) { return controlledBindings(tx, lobby, await tx.all('SELECT * FROM character_bindings WHERE lobby_id=?', [lobby.id])) }
async function context(tx, req, lobby) {
  const state = JSON.parse(lobby.world_json), actor = state.characters.find(a => a.id === req.params.characterId)
  const bindings = await bindingsFor(tx, lobby), binding = bindings.find(b => b.character_id === req.params.characterId)
  if (!actor || !binding) fail(404, 'Герой не найден.')
  const declarations = state.campaign.declarations ?? emptyDeclarations()
  const stamp = await tx.get('SELECT COUNT(*) AS n FROM character_control_events WHERE lobby_id=? AND character_id=?', [lobby.id, actor.id])
  return { state, actor, bindings, binding, declarations, c: declarations.active, controlStamp: String(stamp.n) }
}
function event(c, req, kind, entry) {
  if (c.history.length >= (kind === 'close' ? 500 : 499)) fail(409, 'История сбора заполнена. Закрой приём и сохрани сбор в истории.')
  c.history.push({ id: id(), kind, actorId: entry?.actorId ?? '', authorId: req.user.id, at: now(), ...(entry ? { entry: structuredClone(entry) } : {}) })
}
async function save(tx, req, lobby, state, declarations, record, action) {
  if (!isActionDeclarations(declarations)) fail(400, 'Не удалось проверить заявления.')
  state.campaign.declarations = declarations; worldSize(state)
  await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=?', [JSON.stringify(state), now(), lobby.id])
  await record(tx, req, action)
}
export function declarationRoutes(app, { db, auth, updated, lockedMembership, record }) {
  app.post('/api/lobbies/:id/declarations/preview', auth.middleware, async (req, res) => {
    const value = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireMaster(member); assertOpen(lobby); await requireCampaignRunning(tx,lobby.id)
      if (lobby.revision !== integer(req.body.revision)) fail(409, 'Кампания изменилась. Проверь параметры времени с новой версией.')
      const state = JSON.parse(lobby.world_json), c = state.campaign.declarations?.active; checkEpoch(c, req.body)
      if (c.phase !== 'closed') fail(409, 'Для предпросмотра сначала закрой приём заявлений.')
      const bindings = await bindingsFor(tx, lobby)
      if (!c.participantIds.every(id => bindings.some(b => b.character_id === id && b.approved))) fail(409, 'Состав или допуск героев изменился. Проверь сбор заявлений.')
      let timeline
      try { timeline = previewRoundTimeline(c, req.body.timings) } catch (error) { fail(400, error.message) }
      // Read-only calculation: no world write, audit event, clock advance or socket broadcast.
      return { revision: lobby.revision, timeline }
    }); res.json(value)
  })
  app.get('/api/lobbies/:id/declarations', auth.middleware, async (req, res) => {
    const value = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireMaster(member)
      const state = JSON.parse(lobby.world_json),bindings=await bindingsFor(tx,lobby)
      return { revision: lobby.revision, paused:(await campaignSession(tx,lobby.id)).paused, declarations: state.campaign.declarations ?? emptyDeclarations(),
        scenes: (state.campaign.scenes?.scenes ?? []).map(s => ({ id: s.id, name: s.name, objects: s.objects.map(o => ({ id: o.id, name: o.name })) })),
        roundWork: state.campaign.roundWork ?? { version: 1, entries: [] },
        movementBodies: (state.campaign.scenes?.scenes ?? []).flatMap(s => s.tokens.map(t => ({ sceneId: s.id, actorId: t.actorId, diameter: t.diameter, x:t.x,y:t.y,z:t.z }))),
        executed: !!(state.campaign.declarations?.active?.id && await collectionExecuted(tx,lobby.id,await roundGeneration(tx,lobby.id),state.campaign.declarations.active.id)),
        actors: state.characters.map(a => { const b = bindings.find(b => b.character_id === a.id); return { id: a.id, name: a.name, approved: !!b?.approved, canFly: bodyConsequences(a.body).canFly,
          regions:a?bodyRegionDefs(a.body).map(r=>({key:r.key,label:r.label})):[],
          casts:(a?.rpg.casts??[]).filter(c=>['preparing','ready'].includes(c.status)).map(c=>({id:c.id,abilityId:c.ability.id,name:c.ability.name,status:c.status,binding:c.roundPreparation?.binding??'bound',...(c.roundPreparation?{roundPreparation:true}:{}),...(c.ability.chargePolicy?{chargePolicy:copyAbility(c.ability).chargePolicy}:{}),...(c.ability.spatial?{spatial:copyAbility(c.ability).spatial}:{})})),
          items: (a?.rpg.inventory ?? []).map(i => ({ id: i.id, name: i.name, quantity:i.quantity, ...(i.consumable?{consumable:copyConsumableEffect(i.consumable)}:{}) })), abilities: (a?.rpg.abilities ?? []).map(i => ({ id: i.id, name: i.name, ...(i.spatial?{spatial:copyAbility(i).spatial}:{}) })) } }) }
    }); res.json(value)
  })
  app.post('/api/lobbies/:id/declarations', auth.middleware, async (req, res) => {
    const revision = integer(req.body.revision)
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireMaster(member); assertOpen(lobby); await requireCampaignRunning(tx,lobby.id)
      if (lobby.revision !== revision) fail(409, 'Кампания изменилась. Проверь настройки сбора.')
      const state = JSON.parse(lobby.world_json), d = state.campaign.declarations ?? emptyDeclarations()
      if (d.active) fail(409, 'Сначала закрой прежний приём и сохрани его в истории.')
      const scene = state.campaign.scenes?.scenes.find(s => s.id === req.body.sceneId), ids = req.body.participantIds
      if (!scene || !Array.isArray(ids) || ids.length < 1 || ids.length > 200 || new Set(ids).size !== ids.length || typeof req.body.allowReplace !== 'boolean' || typeof req.body.durationSeconds !== 'number' || !Number.isFinite(req.body.durationSeconds) || req.body.durationSeconds <= 0 || req.body.durationSeconds > 86400) fail(400, 'Выбери сцену, участников, длительность и порядок правок.')
      const previous = scene.roundDurationSeconds!==undefined?{durationSeconds:scene.roundDurationSeconds}:d.archive.find(c => c.sceneId === scene.id)
      if (previous && previous.durationSeconds !== req.body.durationSeconds) fail(409, 'Длительность для этой сцены уже задана: ' + previous.durationSeconds + ' с.')
      const bindings = await bindingsFor(tx, lobby)
      if (!ids.every(id => bindings.some(b => b.character_id === id && b.approved))) fail(400, 'Участвовать могут только принятые герои этой кампании.')
      scene.roundDurationSeconds=req.body.durationSeconds
      d.active = { id: id(), sceneId: scene.id, sceneName: scene.name, durationSeconds: req.body.durationSeconds, allowReplace: req.body.allowReplace,
        phase: 'open', epoch: 1, participantIds: ids, entries: [], history: [] }; event(d.active, req, 'open')
      await save(tx, req, lobby, state, d, record, 'open-declarations')
    }); updated(req.params.id); res.status(201).json({ revision: revision + 1 })
  })
  app.patch('/api/lobbies/:id/declarations', auth.middleware, async (req, res) => {
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireMaster(member); assertOpen(lobby); await requireCampaignRunning(tx,lobby.id)
      const state = JSON.parse(lobby.world_json), d = state.campaign.declarations ?? emptyDeclarations(), c = d.active; checkEpoch(c, req.body)
      if (req.body.operation === 'close' && c.phase === 'open') { c.phase = 'closed'; c.epoch += 1; event(c, req, 'close') }
      else if (req.body.operation === 'reopen' && c.phase === 'closed') {
        if (await collectionExecuted(tx,lobby.id,await roundGeneration(tx,lobby.id),c.id)) fail(409, 'Сбор уже исполнен. Сохрани его в истории; переигровка будет доступна через откат.')
        c.phase = 'open'; c.epoch += 1; event(c, req, 'reopen')
      }
      else if (req.body.operation === 'archive' && c.phase !== 'open') {
        if (d.archive.length >= 20) fail(409, 'История содержит 20 сборов. Сохрани копию перед дальнейшей работой.')
        d.archive.push(c); d.active = null
      } else fail(409, 'Этот переход сейчас недоступен.')
      await save(tx, req, lobby, state, d, record, 'declarations-' + req.body.operation)
    }); updated(req.params.id); res.json({ ok: true })
  })
  app.get('/api/lobbies/:id/characters/:characterId/declarations', auth.middleware, async (req, res) => {
    const value = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req), { state, actor, bindings, binding, c, controlStamp } = await context(tx, req, lobby)
      if (binding.owner_id !== req.user.id && binding.control.controllerId !== req.user.id) requireMaster(member)
      const members = await tx.all("SELECT user_id FROM members WHERE lobby_id=? AND role='PLAYER'", [lobby.id])
      const readiness = members.map(m => { const expected = bindings.filter(b => b.owner_id === m.user_id && c?.participantIds.includes(b.character_id))
        return { userId: m.user_id, ready: expected.length > 0 && expected.every(b => !!b.approved && c.entries.some(e => e.actorId === b.character_id && e.status === 'submitted')) } })
      const paused=(await campaignSession(tx,lobby.id)).paused
      return { controlStamp, paused, collection: publicCollection(c), participating: !!c?.participantIds.includes(actor.id),
        canSubmit: !paused && lobby.status !== 'closed' && c?.phase === 'open' && c.participantIds.includes(actor.id) && !!binding.approved && binding.control.controllerId === req.user.id &&
          (!binding.control.delegated || member.role === 'GM' || member.permissions.includes('controlDelegated')),
        entry: publicEntry(c?.entries.find(e => e.actorId === actor.id)), options: options(state, actor, c,!!binding.npc), readiness }
    }); res.json(value)
  })
  app.put('/api/lobbies/:id/characters/:characterId/declarations', auth.middleware, async (req, res) => {
    if (!isActionSequence(req.body.actions)) fail(400, 'Добавь от 1 до 20 действий с допустимыми параметрами.')
    const baseVersion = integer(req.body.baseVersion)
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); assertOpen(lobby); await requireCampaignRunning(tx,lobby.id)
      const { state, actor, binding, declarations, c, controlStamp } = await context(tx, req, lobby); requireCharacterController(member, binding, req.user.id)
      checkEpoch(c, req.body)
      if (req.body.controlStamp !== controlStamp) fail(409, 'Управление героем изменилось. Проверь черновик перед отправкой.')
      if (c.phase !== 'open' || !c.participantIds.includes(actor.id) || !binding.approved) fail(409, 'Приём закрыт или герой ещё не участвует в этом сборе.')
      const before = c.entries.find(e => e.actorId === actor.id)
      if ((before?.revision ?? 0) !== baseVersion) fail(409, 'Заявление героя изменилось. Проверь его перед отправкой.')
      if (before?.status === 'submitted' && !c.allowReplace) fail(409, 'Для правки мастер должен вернуть заявление.')
      const prepared = prepareActions(req.body.actions, state, actor, c,!!binding.npc), entry = { actorId: actor.id, actorName: actor.name, revision: baseVersion + 1,
        status: 'submitted', ...prepared, submittedBy: req.user.id, submittedAt: now(), note: '' }
      c.entries = [...c.entries.filter(e => e.actorId !== actor.id), entry]; event(c, req, 'submit', entry)
      await save(tx, req, lobby, state, declarations, record, 'submit-declaration')
    }); updated(req.params.id); res.json({ entryVersion: baseVersion + 1 })
  })
  app.post('/api/lobbies/:id/characters/:characterId/declarations/return', auth.middleware, async (req, res) => {
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireMaster(member); assertOpen(lobby); await requireCampaignRunning(tx,lobby.id)
      const { state, actor, declarations, c } = await context(tx, req, lobby); checkEpoch(c, req.body)
      const entry = c.entries.find(e => e.actorId === actor.id)
      if (c.phase !== 'open' || !entry || entry.revision !== integer(req.body.baseVersion) || entry.status !== 'submitted') fail(409, 'Сначала открой приём и обнови заявление.')
      if (typeof req.body.note !== 'string' || !req.body.note.trim() || req.body.note.length > 2000) fail(400, 'Укажи причину возврата.')
      entry.status = 'returned'; entry.revision += 1; entry.note = req.body.note.trim(); event(c, req, 'return', entry)
      await save(tx, req, lobby, state, declarations, record, 'return-declaration')
    }); updated(req.params.id); res.json({ ok: true })
  })
}
