import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import type { Lobby } from './onlineTypes'
import { defaultCreationConditions, isCreationConditions } from './heroReview'
import type { CreationConditions } from './heroReview'
import { progressionSteps, rankOptions } from './characterProfile'
import { raceTemplates } from './raceCatalog'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
type Draft = { revision: number; conditions: CreationConditions }
const valid = (v: unknown): v is Draft => !!v && typeof v === 'object' && !Array.isArray(v) && Number.isSafeInteger((v as Draft).revision) && (v as Draft).revision >= 0 && isCreationConditions((v as Draft).conditions)
export default function LobbyCreationConditions({ accountId, lobby, checkingAccess }: { accountId: string; lobby: Lobby; checkingAccess: boolean }) {
  const { request, refresh } = useOnline(), key = lobbyFormKey('conditions', accountId, lobby.id)
  const published = lobby.creationConditions ?? defaultCreationConditions(), rank = rankOptions.find(r => r.key === lobby.rank)
  const [draft, setDraft] = useState(() => readLobbyForm(key, valid) ?? { revision: lobby.revision, conditions: published })
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [warning, setWarning] = useState('')
  const active = useRef(false), current = useRef(draft), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  function remember(next: Draft) { current.current = next; setDraft(next); setWarning(writeLobbyForm(key, next) ? '' : 'Черновик условий доступен до закрытия страницы: не удалось сохранить его на устройстве.') }
  function change(conditions: CreationConditions) { remember({ ...current.current, conditions }) }
  async function save() {
    const source = current.current, abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<{ revision: number }>('/lobbies/' + lobby.id + '/creation-conditions', { signal: abort.signal, method: 'PATCH', body: JSON.stringify(source) })
      if (active.current && !abort.signal.aborted) { remember({ ...source, revision: result.revision }); setMessage('Условия создания сохранены. Принятые герои не сброшены.'); refresh() }
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) }
    finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  return <section className="w6-fieldset"><h3>Условия создания героев</h3>
    <p>Энергия: {lobby.energy === 'any' ? 'Мана или Тень' : lobby.energy === 'shadow' ? 'Тень' : 'Мана'}. Стартовый ранг: {rank?.label ?? lobby.rank}{published.requireStartingRank ? ', обязательная ступень ' + published.rankStep : ' · проверяется мастером'}.</p>
    <p>{published.allowedRaceIds.length ? 'Допустимые расы: ' + published.allowedRaceIds.map(id => raceTemplates.find(r => r.id === id)?.name ?? id).join(', ') : 'Раса согласовывается с мастером; автоматического ограничения нет.'}</p>
    <p className="w6-prose">{published.instructions || 'Дополнительные условия ещё не заданы.'}</p>
    <p className="w6-copy">Условия относятся к новым заявкам. Проверка имущества, способностей и текстовых требований остаётся за мастером. Изменение условий не отменяет развитие принятых героев.</p>
    {lobby.myRole === 'GM' && <details><summary>Настроить условия создания</summary><fieldset disabled={busy || checkingAccess}>
      <label className="w6-field"><span>Требования и пояснения для игроков</span><textarea aria-label="Требования и пояснения для игроков" maxLength={4000} rows={4} value={draft.conditions.instructions}
        onChange={e => change({ ...draft.conditions, instructions: e.currentTarget.value })}/></label>
      <label className="w6-check"><input type="checkbox" checked={draft.conditions.requireStartingRank} onChange={e => change({ ...draft.conditions, requireStartingRank: e.currentTarget.checked })}/>Требовать указанный стартовый ранг и ступень</label>
      <label className="w6-field"><span>Стартовая ступень</span><select aria-label="Стартовая ступень" value={draft.conditions.rankStep} onChange={e => change({ ...draft.conditions, rankStep: Number(e.currentTarget.value) })}>
        {Array.from({ length: rank ? progressionSteps(rank.key) : 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
      <fieldset><legend>Разрешённые расы из каталога</legend><p className="w6-copy">Пустой список оставляет выбор свободным, включая собственные расовые шаблоны. При выборе рас будет действовать этот список.</p>
        {raceTemplates.map(r => <label className="w6-check" key={r.id}><input type="checkbox" checked={draft.conditions.allowedRaceIds.includes(r.id)} onChange={e => {
          const checked = e.currentTarget.checked; change({ ...draft.conditions, allowedRaceIds: checked ? [...draft.conditions.allowedRaceIds, r.id] : draft.conditions.allowedRaceIds.filter(id => id !== r.id) })
        }}/>{r.name}</label>)}</fieldset>
      <p className="w6-copy">{draft.revision === lobby.revision ? 'Черновик использует текущую версию.' : 'Кампания изменилась. Перед сохранением загрузи свежие условия и перенеси свои правки.'}</p>
      <button type="button" className="w6-button" onClick={() => { if (window.confirm('Заменить черновик условий текущими условиями кампании?')) remember({ revision: lobby.revision, conditions: published }) }}>Загрузить свежие условия</button>
      <button type="button" className="w6-button" onClick={() => void save()}>Сохранить условия создания</button>
    </fieldset></details>}
    {warning && <p role="alert">{warning}</p>}<p className="w6-notice" role="status">{message}</p>
  </section>
}
