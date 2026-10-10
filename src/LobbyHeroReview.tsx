import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import type { CloudCharacter, Lobby, PlayerCharacter } from './onlineTypes'
import { hasLobbyPermission } from './lobbyAccess'
import { heroReviewLabels } from './heroReview'
import type { HeroSubmission } from './heroReview'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
const HeroReviewSheet = lazy(() => import('./HeroReviewSheet'))
type Draft = { note: string; sourceId: string }
const valid = (v: unknown): v is Draft => !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as Draft).note === 'string' && (v as Draft).note.length <= 4000 && typeof (v as Draft).sourceId === 'string' && (v as Draft).sourceId.length <= 160
export default function LobbyHeroReview({ accountId, lobby, character, cloud, checkingAccess }: { accountId: string; lobby: Lobby; character: PlayerCharacter; cloud: CloudCharacter[]; checkingAccess: boolean }) {
  const { request, refresh } = useOnline(), owner = character.ownerId === accountId, reviewer = hasLobbyPermission(lobby.myRole, lobby.myPermissions, 'approveHeroes')
  const key = lobbyFormKey('review', accountId, lobby.id, character.id)
  const [draft, setDraft] = useState(() => readLobbyForm(key, valid) ?? { note: '', sourceId: '' }), [submission, setSubmission] = useState<HeroSubmission | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [warning, setWarning] = useState('')
  const active = useRef(false), pending = useRef<AbortController | null>(null), current = useRef(draft)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  function remember(next: Draft) { current.current = next; setDraft(next); setWarning(writeLobbyForm(key, next) ? '' : 'Черновик замечания доступен до закрытия страницы: не удалось сохранить его на устройстве.') }
  if (!owner && !reviewer) return null
  async function act(path: string, body?: object) {
    pending.current?.abort(); const abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<HeroSubmission>('/lobbies/' + lobby.id + '/characters/' + character.id + '/' + path, {
        signal: abort.signal, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      })
      if (!active.current || abort.signal.aborted) return
      if (!body) { setSubmission(result); if (!current.current.sourceId && result.sourceId && cloud.some(c => c.id === result.sourceId)) remember({ ...current.current, sourceId: result.sourceId }) }
      else { setSubmission(null); setMessage(path === 'resubmit' ? 'Исправленный лист отправлен на рассмотрение. Владение и расстановка сохранены.' : 'Решение по листу сохранено.'); refresh() }
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) }
    finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  const selected = cloud.find(c => c.id === draft.sourceId), stale = submission && submission.revision !== lobby.revision
  const locked = character.review?.locked ?? character.approved
  return <section className="w6-fieldset"><h4>Заявка героя</h4><p>{heroReviewLabels[character.review?.status ?? (character.approved ? 'approved' : 'pending')]}</p>
    {character.review?.note && <p className="w6-prose">Замечание мастера: {character.review.note}</p>}
    <button className="w6-button" disabled={busy || checkingAccess} onClick={() => void act('submission')}>{submission ? 'Обновить заявку' : 'Открыть заявку и проверяемый лист'}</button>
    {submission && <><p>{heroReviewLabels[submission.review.status]}</p>{submission.review.note && <p className="w6-prose">{submission.review.note}</p>}
      {stale && <p role="alert">Кампания изменилась. Обнови заявку перед решением или отправкой.</p>}
      {submission.changedSinceSubmission && <p role="alert">Мастер изменил текущий лоббийный лист после отправки. Снимок ниже показывает отправленный вариант.</p>}
      {submission.conditionErrors.map(e => <p role="alert" key={e}>{e}</p>)}
      <Suspense fallback={<p>Загружаем просмотр листа…</p>}>{submission.sheet ? <HeroReviewSheet sheet={submission.sheet} label="Отправленный лист"/> : <p>У прежнего героя нет снимка заявки. Текущий игровой лист автоматически не раскрывается проверяющему.</p>}
        {submission.currentSheet && (!submission.sheet || submission.changedSinceSubmission) && <HeroReviewSheet sheet={submission.currentSheet} label="Текущий лист мастера"/>}
      </Suspense>
      {reviewer && <fieldset disabled={busy || checkingAccess || !!stale}><label className="w6-field"><span>Замечание к герою {character.name}</span><textarea aria-label={'Замечание к герою ' + character.name} rows={3} maxLength={4000} value={draft.note} onChange={e => remember({ ...draft, note: e.currentTarget.value })}/></label>
        <button className="w6-button" disabled={!draft.note.trim()} onClick={() => void act('review', { decision: 'return', note: draft.note, revision: submission.revision })}>Вернуть лист с замечанием</button>
        <button className="w6-button w6-primary" disabled={character.approved} onClick={() => void act('review', { decision: 'approve', note: draft.note, revision: submission.revision })}>Принять героя в кампанию</button>
      </fieldset>}
      {owner && submission.canResubmit && <fieldset disabled={busy || checkingAccess || !!stale}><p className="w6-copy">Исправь исходник в разделе «Персонажи» и сохрани его в аккаунт. Повторная отправка заменит только этот ещё не принятый лист, сохранив его место на сцене. Подготовки и внешние эффекты из исходника в лобби не переносятся.</p>
        <label className="w6-field"><span>Исправленный исходник {character.name}</span><select aria-label={'Исправленный исходник ' + character.name} value={draft.sourceId} onChange={e => remember({ ...draft, sourceId: e.currentTarget.value })}>
          <option value="">Выбери героя аккаунта</option>{cloud.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className="w6-button" disabled={!selected} onClick={() => { if (selected && window.confirm('Заменить ещё не принятый лист исправленной копией и отправить на рассмотрение?')) void act('resubmit', { characterId: selected.id, sourceRevision: selected.revision, revision: submission.revision }) }}>Отправить исправленный лист</button>
      </fieldset>}
    </>}
    {owner && locked && <p className="w6-copy">Герой уже был принят: облачный исходник не может заменить его прогресс. Изменения игрового героя проводит мастер в кампании.</p>}
    {warning && <p role="alert">{warning}</p>}<p className="w6-notice" role="status">{message}</p>
  </section>
}
