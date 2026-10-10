import { fail, id, integer, now, text, worldSize } from './validation.mjs'
import { requireChief, requireLobbyPermission } from './permissions.mjs'
import { hasLobbyPermission, validLobbyPermissions } from './generated/lobbyAccess.mjs'
import { copySceneState, emptyScenes, isSceneState, sceneReferencesValid } from './generated/scenes.mjs'

export async function controlEvent(tx, lobbyId, characterId, actorId, controllerId, action) {
  await tx.run('INSERT INTO character_control_events(id,lobby_id,character_id,actor_id,controller_id,action,created_at) VALUES(?,?,?,?,?,?,?)',
    [id(), lobbyId, characterId, actorId, controllerId, action, now()])
}
export async function resetAssistantControl(tx, lobby, userId, actorId) {
  const rows = await tx.all('SELECT character_id FROM character_delegations WHERE lobby_id=? AND assistant_id=?', [lobby.id, userId])
  for (const row of rows) await controlEvent(tx, lobby.id, row.character_id, actorId, lobby.owner_id, 'fallback')
  await tx.run('UPDATE character_delegations SET assistant_id=NULL WHERE lobby_id=? AND assistant_id=?', [lobby.id, userId])
}
export async function controlledBindings(db, lobby, bindings) {
  const rows = await db.all(`SELECT d.*,m.role,u.disabled,p.permissions_json FROM character_delegations d
    LEFT JOIN members m ON m.lobby_id=d.lobby_id AND m.user_id=d.assistant_id
    LEFT JOIN users u ON u.id=d.assistant_id
    LEFT JOIN lobby_permissions p ON p.lobby_id=d.lobby_id AND p.user_id=d.assistant_id WHERE d.lobby_id=?`, [lobby.id])
  return bindings.map(b => {
    const d = rows.find(d => d.character_id === b.character_id)
    const validAssistant = d && !d.disabled && hasLobbyPermission(d.role, JSON.parse(d.permissions_json ?? '[]'), 'controlDelegated')
    return { ...b, control: d ? { delegated: true, controllerId: validAssistant ? d.assistant_id : lobby.owner_id, delegatedAt: d.delegated_at } :
      { delegated: false, controllerId: b.owner_id } }
  })
}
export function requireCharacterController(member, binding, userId) {
  if (binding.control.controllerId !== userId) fail(403, 'Этим героем сейчас управляет другой участник.')
  if (binding.control.delegated) requireLobbyPermission(member, 'controlDelegated')
}

export function lobbyAccessRoutes(app, { db, auth, updated, lockedMembership, record }) {
  const bump = async (tx, lobbyId) => tx.run('UPDATE lobbies SET revision=revision+1,updated_at=? WHERE id=?', [now(), lobbyId])
  const checkRevision = (lobby, revision) => { if (lobby.revision !== revision) fail(409, 'Кампания или управление изменились. Обнови лобби и повтори решение.') }
  app.patch('/api/lobbies/:id/members/:userId/permissions', auth.middleware, async (req, res) => {
    if (!validLobbyPermissions(req.body.permissions)) fail(400, 'Некорректный набор разрешений помощника.')
    const revision = integer(req.body.revision)
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireChief(lobby, member, req.user); checkRevision(lobby, revision)
      const target = await tx.get('SELECT m.*,u.disabled FROM members m JOIN users u ON u.id=m.user_id WHERE m.lobby_id=? AND m.user_id=?', [lobby.id, req.params.userId])
      if (!target || target.role !== 'ASSISTANT' || target.disabled) fail(409, 'Разрешения назначаются действующему помощнику этого лобби.')
      await tx.run(`INSERT INTO lobby_permissions(lobby_id,user_id,permissions_json) VALUES(?,?,?)
        ON CONFLICT(lobby_id,user_id) DO UPDATE SET permissions_json=excluded.permissions_json`, [lobby.id, target.user_id, JSON.stringify(req.body.permissions)])
      if (!req.body.permissions.includes('controlDelegated')) await resetAssistantControl(tx, lobby, target.user_id, req.user.id)
      await bump(tx, lobby.id); await record(tx, req, 'lobby-member-permissions')
    }); updated(req.params.id); res.json({ ok: true, revision: revision + 1 })
  })
  app.get('/api/lobbies/:id/scenes', auth.middleware, async (req, res) => {
    const result = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireLobbyPermission(member, 'scenes')
      const state = JSON.parse(lobby.world_json)
      return { revision: lobby.revision, scenes: state.campaign.scenes ?? emptyScenes(),
        actors: state.characters.map(c => ({ id: c.id, name: c.name, profile: { portrait: c.profile.portrait } })) }
    }); res.json(result)
  })
  app.put('/api/lobbies/:id/scenes', auth.middleware, async (req, res) => {
    const revision = integer(req.body.revision)
    if (!isSceneState(req.body.scenes)) fail(400, 'Некорректные сцены.')
    // Explicit narrow input; characters, time, templates and controls in the body are ignored.
    const scenes = copySceneState(req.body.scenes)
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireLobbyPermission(member, 'scenes'); checkRevision(lobby, revision)
      const state = JSON.parse(lobby.world_json)
      if (!sceneReferencesValid(scenes, state.characters.map(c => c.id))) fail(400, 'В сценах есть неизвестные персонажи.')
      state.campaign.scenes = scenes; worldSize(state)
      await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=?', [JSON.stringify(state), now(), lobby.id])
      await record(tx, req, 'publish-scenes')
    }); updated(req.params.id); res.json({ revision: revision + 1 })
  })
  app.post('/api/lobbies/:id/characters/:characterId/control', auth.middleware, async (req, res) => {
    if (typeof req.body.delegated !== 'boolean') fail(400, 'Укажи решение о передаче управления.')
    const revision = integer(req.body.revision)
    await db.transaction(async tx => {
      const { lobby } = await lockedMembership(tx, req); checkRevision(lobby, revision)
      const binding = await tx.get('SELECT * FROM character_bindings WHERE lobby_id=? AND character_id=?', [lobby.id, req.params.characterId])
      if (!binding) fail(404, 'Герой не найден.')
      if (binding.owner_id !== req.user.id) fail(403, 'Передать или вернуть управление может только владелец героя.')
      const existing = await tx.get('SELECT * FROM character_delegations WHERE lobby_id=? AND character_id=?', [lobby.id, binding.character_id])
      if (!!existing === req.body.delegated) fail(409, 'Управление уже находится в выбранном состоянии.')
      if (req.body.delegated) {
        if (binding.owner_id === lobby.owner_id) fail(409, 'Ты уже главный ГМ и управляешь своим героем.')
        if (lobby.status === 'closed') fail(409, 'Лобби закрыто. Вернуть управление можно, передать — после открытия.')
        await tx.run('INSERT INTO character_delegations(lobby_id,character_id,delegated_at) VALUES(?,?,?)', [lobby.id, binding.character_id, now()])
      } else await tx.run('DELETE FROM character_delegations WHERE lobby_id=? AND character_id=?', [lobby.id, binding.character_id])
      await controlEvent(tx, lobby.id, binding.character_id, req.user.id, req.body.delegated ? lobby.owner_id : binding.owner_id, req.body.delegated ? 'delegate' : 'return')
      await bump(tx, lobby.id); await record(tx, req, 'character-control')
    }); updated(req.params.id); res.json({ ok: true, revision: revision + 1 })
  })
  app.post('/api/lobbies/:id/characters/:characterId/control-assignee', auth.middleware, async (req, res) => {
    const revision = integer(req.body.revision)
    const targetId = text(req.body.userId, 160)
    await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireChief(lobby, member, req.user); checkRevision(lobby, revision)
      const delegated = await tx.get('SELECT * FROM character_delegations WHERE lobby_id=? AND character_id=?', [lobby.id, req.params.characterId])
      if (!delegated) fail(409, 'Сначала владелец должен передать героя мастеру.')
      if (targetId !== lobby.owner_id) {
        const target = await tx.get(`SELECT m.*,u.disabled,p.permissions_json FROM members m JOIN users u ON u.id=m.user_id
          LEFT JOIN lobby_permissions p ON p.lobby_id=m.lobby_id AND p.user_id=m.user_id WHERE m.lobby_id=? AND m.user_id=?`, [lobby.id, targetId ?? ''])
        if (!target || target.disabled || target.role !== 'ASSISTANT' || !hasLobbyPermission(target.role, JSON.parse(target.permissions_json ?? '[]'), 'controlDelegated')) fail(403, 'Выбери главного ГМ или помощника с разрешением управлять переданными героями.')
      }
      const assistantId = targetId === lobby.owner_id ? null : targetId
      if (delegated.assistant_id === assistantId) fail(409, 'Управляющий уже назначен.')
      await tx.run('UPDATE character_delegations SET assistant_id=? WHERE lobby_id=? AND character_id=?', [assistantId, lobby.id, req.params.characterId])
      await controlEvent(tx, lobby.id, req.params.characterId, req.user.id, targetId, 'assign')
      await bump(tx, lobby.id); await record(tx, req, 'assign-character-controller')
    }); updated(req.params.id); res.json({ ok: true, revision: revision + 1 })
  })
  app.get('/api/lobbies/:id/characters/:characterId/control-history', auth.middleware, async (req, res) => {
    const result = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req)
      const bindings = await controlledBindings(tx, lobby, await tx.all('SELECT * FROM character_bindings WHERE lobby_id=? AND character_id=?', [lobby.id, req.params.characterId]))
      const binding = bindings[0]; if (!binding) fail(404, 'Герой не найден.')
      if (binding.owner_id !== req.user.id && lobby.owner_id !== req.user.id) requireCharacterController(member, binding, req.user.id)
      return tx.all(`SELECT e.id,e.action,e.actor_id AS "actorId",u.display_name AS actor,e.controller_id AS "controllerId",e.created_at AS "createdAt"
        FROM character_control_events e JOIN users u ON u.id=e.actor_id WHERE e.lobby_id=? AND e.character_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 100`, [lobby.id, binding.character_id])
    }); res.json(result)
  })
}
