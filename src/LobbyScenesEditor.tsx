import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import SceneEditor from './SceneEditor'
import { readSceneDraft, writeSceneDraft } from './lobbySceneDraftStorage'
import type { SceneDraft } from './lobbySceneDraftStorage'
import type { SceneState } from './sceneTypes'
import { assertCampaignSize } from './campaignLimits'

export default function LobbyScenesEditor({ accountId, lobbyId, revision, checkingAccess }: { accountId: string; lobbyId: string; revision?: number; checkingAccess: boolean }) {
  const { request, refresh } = useOnline()
  const [draft, setDraft] = useState(() => readSceneDraft(accountId, lobbyId)), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [warning, setWarning] = useState('')
  const current = useRef(draft), active = useRef(false), pending = useRef<AbortController | null>(null)
  function remember(next: SceneDraft) { current.current = next; setDraft(next); setWarning(writeSceneDraft(next) ? '' : 'Черновик доступен до закрытия страницы: на устройстве не хватает места. Сохрани изменения на сервер перед выходом.') }
  useEffect(() => { active.current = true; if (current.current) remember(current.current); return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  async function load() {
    if (current.current && !window.confirm('Загрузить свежие сцены и заменить черновик сцен?')) return
    pending.current?.abort(); const abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<Omit<SceneDraft, 'accountId' | 'lobbyId'>>('/lobbies/' + lobbyId + '/scenes', { signal: abort.signal })
      if (active.current && !abort.signal.aborted) { remember({ ...result, accountId, lobbyId }); setMessage('Сцены загружены в отдельный черновик.') }
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) }
    finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  function change(scenes: SceneState) {
    if (!active.current || !current.current || checkingAccess || busy) return { ok: false, message: 'Дождись подтверждения доступа.' }
    const next = { ...current.current, scenes }
    try { assertCampaignSize(next); remember(next); return { ok: true, message: 'Сцены сохранены в черновик.' } }
    catch (e) { return { ok: false, message: (e as Error).message } }
  }
  async function publish() {
    const source = current.current; if (!source || checkingAccess || busy) return
    const abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<{ revision: number }>('/lobbies/' + source.lobbyId + '/scenes', {
        signal: abort.signal, method: 'PUT', body: JSON.stringify({ scenes: source.scenes, revision: source.revision }),
      })
      const latest = active.current ? current.current : readSceneDraft(source.accountId, source.lobbyId)
      if (latest?.revision === source.revision) {
        const next = { ...latest, revision: result.revision }
        if (active.current) { remember(next); setMessage('Сцены сохранены на сервер.'); refresh() } else writeSceneDraft(next)
      }
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) }
    finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  return <section className="w6-fieldset"><h3>Сцены кампании</h3><p className="w6-copy">Здесь меняются только сцены. Листы, каталог и время мира остаются прежними. Черновик хранится отдельно для аккаунта и лобби.</p>
    <button className="w6-button" disabled={busy || checkingAccess} onClick={() => void load()}>{draft ? 'Загрузить свежие сцены' : 'Открыть сцены в редакторе'}</button>
    {draft && <><p className="w6-copy">{revision === undefined ? 'Проверяем версию сервера.' : draft.revision !== revision ? 'На сервере новая версия. Обнови сцены перед сохранением.' : 'Используется текущая версия сцены.'}</p>
      <SceneEditor value={draft.scenes} actors={draft.actors} disabled={busy || checkingAccess} onChange={change}/>
      <button className="w6-button w6-primary" disabled={busy || checkingAccess} onClick={() => void publish()}>Сохранить сцены на сервер</button></>}
    {warning && <p role="alert">{warning}</p>}<p className="w6-notice" role="status">{message}</p>
  </section>
}
