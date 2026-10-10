import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { journalCategories, certaintyOptions } from './characterKnowledge'
import type { JournalCategory, KnowledgeCertainty } from './characterKnowledge'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
type Draft = { title: string; text: string; category: JournalCategory; certainty: KnowledgeCertainty; revision: number }
const valid = (v: unknown): v is Draft => !!v && typeof v === 'object' && typeof (v as Draft).title === 'string' && (v as Draft).title.length <= 120 && typeof (v as Draft).text === 'string' && (v as Draft).text.length <= 8000 &&
  Number.isSafeInteger((v as Draft).revision) && journalCategories.some(c => c.key === (v as Draft).category) && certaintyOptions.some(c => c.key === (v as Draft).certainty)
export default function LobbyKnowledgeDisclosure({ accountId, lobbyId, characterId, characterName, revision, disabled }: { accountId: string; lobbyId: string; characterId: string; characterName: string; revision: number; disabled: boolean }) {
  const { request, refresh } = useOnline(), key = lobbyFormKey('knowledge-disclosure', accountId, lobbyId, characterId)
  const [draft, setDraft] = useState(() => readLobbyForm(key, valid) ?? { title: '', text: '', category: 'other' as const, certainty: 'reported' as const, revision })
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [warning, setWarning] = useState('')
  const active = useRef(false), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  function remember(next: Draft) { setDraft(next); setWarning(writeLobbyForm(key, next) ? '' : 'Черновик сведения доступен до закрытия страницы: не удалось сохранить его на устройстве.') }
  async function send() {
    const source = draft, abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<{ revision: number }>('/lobbies/' + lobbyId + '/characters/' + characterId + '/knowledge', { signal: abort.signal, method: 'POST', body: JSON.stringify({ ...source, disclosure: true }) })
      if (active.current && !abort.signal.aborted) { remember({ ...source, title: '', text: '', revision: result.revision }); setMessage('Сведение раскрыто только выбранному герою.'); refresh() }
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) } finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  const stale = draft.revision !== revision
  return <details className="w6-fieldset"><summary>Раскрыть сведение герою {characterName}</summary><fieldset disabled={busy || disabled}>
    <label className="w6-field"><span>Заголовок раскрываемого сведения</span><input aria-label="Заголовок раскрываемого сведения" maxLength={120} value={draft.title} onChange={e => remember({ ...draft, title: e.currentTarget.value })}/></label>
    <label className="w6-field"><span>Текст раскрываемого сведения</span><textarea aria-label="Текст раскрываемого сведения" maxLength={8000} rows={4} value={draft.text} onChange={e => remember({ ...draft, text: e.currentTarget.value })}/></label>
    <label className="w6-field"><span>Категория сведения</span><select value={draft.category} onChange={e => remember({ ...draft, category: e.currentTarget.value as JournalCategory })}>{journalCategories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
    <label className="w6-field"><span>Достоверность сведения</span><select value={draft.certainty} onChange={e => remember({ ...draft, certainty: e.currentTarget.value as KnowledgeCertainty })}>{certaintyOptions.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
    <p className="w6-copy">Это явная передача информации выбранному герою, включая сообщения от других персонажей. Участники не получают сведения автоматически всей группой.</p>
    {stale && <><p role="alert">Кампания изменилась. Проверь текст и адресата перед отправкой.</p><button className="w6-button" onClick={() => remember({ ...draft, revision })}>Сведение проверено с текущей версией</button></>}
    <button className="w6-button" disabled={stale || !draft.title.trim() || !draft.text.trim()} onClick={() => void send()}>Раскрыть сведение выбранному герою</button>
  </fieldset>{warning && <p role="alert">{warning}</p>}<p role="status">{message}</p></details>
}
