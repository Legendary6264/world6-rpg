import { useState } from 'react'
import { useOnline } from './onlineContext'
import { useRemote } from './onlineHooks'
import { CommunityShell, RemoteStatus, formatDate } from './NetworkCommon'
import { TextField } from './RpgControls'
import type { Feed, WorldEntry } from './onlineTypes'

const categories = ['Устройство мира', 'Народы и культуры', 'Места', 'История', 'Правила сообщества']
type Draft = { id?: string; revision?: number; title: string; category: string; body: string }
const emptyDraft = (): Draft => ({ title: '', category: categories[0], body: '' })
export default function WorldEntriesPanel({ manage = false }: { manage?: boolean }) {
  const { user, request, refresh } = useOnline()
  const allowed = !!user && ['WORLD_EDITOR', 'ADMIN', 'OWNER'].includes(user.role)
  const admin = !!user && ['ADMIN', 'OWNER'].includes(user.role)
  const [offset, setOffset] = useState(0), [draft, setDraft] = useState<Draft>(emptyDraft), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const feed = useRemote<Feed<WorldEntry>>(manage ? null : '/world-entries?offset=' + offset)
  const entries = useRemote<WorldEntry[]>(manage && allowed && !user?.mfaRequired ? '/world-entries/manage' : null)
  async function act(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); refresh(); setMessage('Материал сохранён.') }
    catch (e) { setMessage((e as Error).message) }
    finally { setBusy(false) }
  }
  const items = manage ? entries.value : feed.value?.items
  return <CommunityShell title={manage ? 'Редактор мира' : 'Материалы мира'}>
    <p className="w6-copy">{manage ? 'Редактор готовит свои черновики. Администратор или владелец проверяет и публикует материалы. Эта роль не даёт доступа к чужим лобби или аккаунтам.' : 'Проверенные материалы команды Мира 6. Предложения участников обсуждаются на форуме.'}</p>
    {manage && !allowed && <p className="w6-notice">Этот раздел доступен редакторам мира и администрации.</p>}
    {manage && user?.mfaRequired && <p className="w6-notice">Подтверди второй фактор в разделе «Аккаунт».</p>}
    {manage && allowed && !user?.mfaRequired && <form className="w6-form w6-fieldset" onSubmit={e => {
      e.preventDefault()
      void act(async () => {
        await request('/world-entries' + (draft.id ? '/' + draft.id : ''), { method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify(draft) })
        setDraft(emptyDraft())
      })
    }}>
      <h3>{draft.id ? 'Редактирование материала' : 'Новый черновик'}</h3>
      <TextField label="Название материала" value={draft.title} onChange={title => setDraft({ ...draft, title })} max={120}/>
      <label className="w6-field"><span>Раздел справочника</span><select value={draft.category} onChange={e => setDraft({ ...draft, category: e.currentTarget.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="w6-field"><span>Текст материала</span><textarea required maxLength={20000} rows={10} value={draft.body} onChange={e => setDraft({ ...draft, body: e.currentTarget.value })}/></label>
      <div className="w6-buttons"><button className="w6-button w6-primary" disabled={busy || !draft.title.trim() || !draft.body.trim()}>Сохранить {draft.id ? 'изменения' : 'черновик'}</button>{draft.id && <button type="button" className="w6-button" onClick={() => setDraft(emptyDraft())}>Отмена</button>}</div>
    </form>}
    <RemoteStatus loading={manage ? entries.loading : feed.loading} error={manage ? entries.error : feed.error}/>
    <div className="w6-story-grid">{items?.map(entry => <article key={entry.id} className="w6-story-card">
      <small>{entry.category} · {entry.author} · {formatDate(entry.updated_at)}{manage && ' · ' + (entry.status === 'draft' ? 'Черновик' : 'Опубликовано')}</small>
      <h2>{entry.title}</h2><p className="w6-prose">{entry.body}</p>
      {manage && <div className="w6-buttons">
        {(admin || entry.status === 'draft') && <button className="w6-button" disabled={busy} onClick={() => setDraft({ id: entry.id, revision: entry.revision, title: entry.title, body: entry.body, category: entry.category })}>Редактировать</button>}
        {admin && <button className="w6-button" disabled={busy} onClick={() => {
          if (window.confirm(entry.status === 'draft' ? 'Опубликовать материал в справочнике для всех участников?' : 'Снять материал с публикации?')) void act(async () => { await request('/world-entries/' + entry.id, { method: 'PATCH', body: JSON.stringify({ revision: entry.revision, status: entry.status === 'draft' ? 'published' : 'draft' }) }); if (draft.id === entry.id) setDraft(emptyDraft()) })
        }}>{entry.status === 'draft' ? 'Опубликовать' : 'Вернуть в черновики'}</button>}
        {(admin || entry.status === 'draft') && <button className="w6-button w6-danger" disabled={busy} onClick={() => { if (window.confirm('Удалить материал?')) void act(async () => { await request('/world-entries/' + entry.id + '?revision=' + entry.revision, { method: 'DELETE' }); if (draft.id === entry.id) setDraft(emptyDraft()) }) }}>Удалить</button>}
      </div>}
    </article>)}</div>
    {items?.length === 0 && <p className="w6-empty">{manage ? 'Черновиков пока нет. Можно подготовить первый материал.' : 'Опубликованных материалов пока нет.'}</p>}
    {!manage && <div className="w6-buttons">{offset > 0 && <button className="w6-button" onClick={() => setOffset(offset - 20)}>Предыдущие материалы</button>}{feed.value?.hasMore && <button className="w6-button" onClick={() => setOffset(offset + 20)}>Следующие материалы</button>}</div>}
    <p className="w6-notice" role="status">{message}</p>
  </CommunityShell>
}
