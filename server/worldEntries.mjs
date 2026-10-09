import { fail, text, choice, integer, id, now } from './validation.mjs'
import { requireWorldEditor } from './permissions.mjs'

const categories = ['Устройство мира', 'Народы и культуры', 'Места', 'История', 'Правила сообщества']
export function worldEntryRoutes(app, { db, auth, io, config }) {
  const changed = () => io.to('public').emit('communityChanged', { area: 'world-entries' })
  app.get('/api/world-entries', async (req, res) => {
    const offset = Math.max(0, Math.min(10000, Number(req.query.offset) || 0))
    const rows = await db.all("SELECT e.id,e.title,e.category,e.body,e.status,e.revision,e.updated_at,u.display_name AS author FROM world_entries e JOIN users u ON u.id=e.author_id WHERE e.status='published' ORDER BY e.updated_at DESC,e.id LIMIT 21 OFFSET ?", [offset])
    res.json({ items: rows.slice(0, 20), hasMore: rows.length > 20 })
  })
  app.get('/api/world-entries/manage', auth.middleware, async (req, res) => {
    requireWorldEditor(req.user, config)
    const admin = ['ADMIN', 'OWNER'].includes(req.user.role)
    res.json(await db.all('SELECT e.*,u.display_name AS author FROM world_entries e JOIN users u ON u.id=e.author_id' + (admin ? '' : ' WHERE e.author_id=?') + ' ORDER BY e.updated_at DESC LIMIT 200', admin ? [] : [req.user.id]))
  })
  app.post('/api/world-entries', auth.middleware, async (req, res) => {
    requireWorldEditor(req.user, config)
    const entry = { id: id(), title: text(req.body.title, 120), category: choice(req.body.category, categories), body: text(req.body.body, 20000), at: now() }
    await db.run('INSERT INTO world_entries(id,author_id,title,category,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', [entry.id, req.user.id, entry.title, entry.category, entry.body, entry.at, entry.at])
    changed(); res.status(201).json({ id: entry.id, revision: 0 })
  })
  app.patch('/api/world-entries/:id', auth.middleware, async (req, res) => {
    requireWorldEditor(req.user, config)
    const revision = integer(req.body.revision)
    await db.transaction(async tx => {
      const row = await tx.get('SELECT * FROM world_entries WHERE id=?' + tx.lock, [req.params.id])
      if (!row) fail(404, 'Материал не найден.')
      const admin = ['ADMIN', 'OWNER'].includes(req.user.role)
      if (!admin && (row.author_id !== req.user.id || row.status !== 'draft')) fail(403, 'Редактор может менять только свои черновики.')
      if (row.revision !== revision) fail(409, 'Материал изменён. Загрузи свежую версию.')
      const status = req.body.status === undefined ? row.status : choice(req.body.status, ['draft', 'published'])
      if (status !== row.status) auth.moderator(req.user)
      const title = req.body.title === undefined ? row.title : text(req.body.title, 120)
      const body = req.body.body === undefined ? row.body : text(req.body.body, 20000)
      const category = req.body.category === undefined ? row.category : choice(req.body.category, categories)
      await tx.run('UPDATE world_entries SET title=?,body=?,category=?,status=?,revision=revision+1,published_by=?,updated_at=? WHERE id=?', [title, body, category, status, status === 'published' ? req.user.id : null, now(), row.id])
      await tx.run('INSERT INTO audit(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)', [id(), req.user.id, status === 'published' ? 'publish-world-entry' : 'save-world-entry', row.id, now()])
    })
    changed(); res.json({ revision: revision + 1 })
  })
  app.delete('/api/world-entries/:id', auth.middleware, async (req, res) => {
    requireWorldEditor(req.user, config)
    const revision = integer(Number(req.query.revision))
    await db.transaction(async tx => {
      const row = await tx.get('SELECT * FROM world_entries WHERE id=?' + tx.lock, [req.params.id])
      if (!row) fail(404, 'Материал не найден.')
      if (row.author_id !== req.user.id || row.status === 'published') auth.moderator(req.user)
      if (row.revision !== revision) fail(409, 'Материал изменён. Загрузи свежую версию.')
      await tx.run('DELETE FROM world_entries WHERE id=?', [row.id])
      await tx.run('INSERT INTO audit(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)', [id(), req.user.id, 'delete-world-entry', row.id, now()])
    })
    changed(); res.json({ ok: true })
  })
}
