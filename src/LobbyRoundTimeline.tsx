import type { RuleActor } from './roundRuleForms'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
import { actionSummary } from './actionDeclarations'
import { MAX_TIMING_MS } from './roundTimeline'
import type { DeclarationCollection } from './actionDeclarations'
import type { ActorTiming, RoundTimeline } from './roundTimeline'
import './roundTimeline.css'
import LobbyRoundExecution from './LobbyRoundExecution'
import type { RoundWork } from './roundWork'

type Source = { revision: number; collectionId: string; epoch: number }
type Draft = { source: Source; actors: { actorId: string; budget: string; costs: string[] }[] }
type Preview = { source: string; timeline: RoundTimeline }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const shortText = (v: unknown): v is string => typeof v === 'string' && v.length <= 40
const valid = (v: unknown): v is Draft => record(v) && record(v.source) && Number.isSafeInteger(v.source.revision) &&
  typeof v.source.collectionId === 'string' && Number.isSafeInteger(v.source.epoch) && Array.isArray(v.actors) && v.actors.length <= 200 &&
  v.actors.every(a => record(a) && typeof a.actorId === 'string' && a.actorId.length <= 160 && shortText(a.budget) &&
    Array.isArray(a.costs) && a.costs.length <= 20 && a.costs.every(shortText)) && new Set(v.actors.map(a => a.actorId)).size === v.actors.length
const milliseconds = (text: string) => {
  const value = Number(text.trim().replace(',', '.'))
  return text.trim() && Number.isSafeInteger(value) && value > 0 && value <= MAX_TIMING_MS ? value : null
}
const format = (value: number) => value > 0 && value < 0.001 ? '<0,001' : value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })

export default function LobbyRoundTimeline({ accountId, lobbyId, collection, revision, checkingAccess, roundWork, executed, actors, objects, movementBodies }: {
  accountId: string; lobbyId: string; collection: DeclarationCollection; revision: number; checkingAccess: boolean;
  roundWork: RoundWork; executed: boolean; actors: RuleActor[]; objects: {sceneId:string;id:string;name:string}[]; movementBodies: {sceneId:string;actorId:string;diameter:number;x?:number;y?:number;z?:number}[]
}) {
  const { request } = useOnline(), key = lobbyFormKey('round-timeline', accountId, lobbyId, collection.id)
  const source: Source = { revision, collectionId: collection.id, epoch: collection.epoch }, sourceKey = JSON.stringify(source)
  const [draft, setDraft] = useState<Draft>(() => readLobbyForm(key, valid) ?? { source, actors: [] })
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState<{ source: string; request: typeof request } | null>(null)
  const [message, setMessage] = useState(''), [warning, setWarning] = useState('')
  const active = useRef(false), pending = useRef<AbortController | null>(null), sequence = useRef(0), currentSource = useRef(sourceKey)
  useLayoutEffect(() => { currentSource.current = sourceKey }, [sourceKey])
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => {
    sequence.current += 1; pending.current?.abort()
    return () => { sequence.current += 1; pending.current?.abort() }
  }, [sourceKey, request])
  const entries = collection.entries.filter(e => e.status === 'submitted'), stale = JSON.stringify(draft.source) !== sourceKey
  const row = (id: string) => draft.actors.find(a => a.actorId === id) ?? { actorId: id, budget: '', costs: [] }
  function remember(next: Draft) {
    sequence.current += 1; pending.current?.abort(); setBusy(null); setPreview(null); setMessage('')
    setDraft(next); setWarning(writeLobbyForm(key, next) ? '' : 'Параметры времени не сохранены на устройстве. Не закрывай страницу.')
  }
  function change(id: string, patch: Partial<Draft['actors'][number]>) {
    remember({ ...draft, actors: [...draft.actors.filter(a => a.actorId !== id), { ...row(id), ...patch }] })
  }
  const timings: ActorTiming[] = entries.map(entry => ({ actorId: entry.actorId, entryRevision: entry.revision, budgetMs: milliseconds(row(entry.actorId).budget) ?? 0,
    costs: entry.actions.flatMap((action, index) => action.kind === 'wait' ? [] : [{ index, personalMs: milliseconds(row(entry.actorId).costs[index] ?? '') ?? 0 }]) }))
  const incomplete = timings.some(t => !t.budgetMs || t.costs.some(c => !c.personalMs)), disabled = checkingAccess || busy?.source === sourceKey && busy.request === request
  async function calculate() {
    if (checkingAccess || stale || incomplete) return
    const abort = new AbortController(), attempt = ++sequence.current, origin = sourceKey
    pending.current?.abort(); pending.current = abort; setBusy({ source: origin, request }); setPreview(null); setMessage('')
    try {
      const result = await request<{ revision: number; timeline: RoundTimeline }>('/lobbies/' + lobbyId + '/declarations/preview', {
        method: 'POST', signal: abort.signal, body: JSON.stringify({ ...source, timings }),
      })
      if (!active.current || abort.signal.aborted || attempt !== sequence.current || origin !== currentSource.current) return
      if (result.revision !== revision || result.timeline.collectionId !== collection.id || result.timeline.epoch !== collection.epoch) {
        setMessage('Предпросмотр относится к другой версии. Обнови заявления.'); return
      }
      setPreview({ source: origin, timeline: result.timeline }); setMessage('Временная шкала рассчитана. Игровое состояние не изменено.')
    } catch (error) {
      if (active.current && !abort.signal.aborted && attempt === sequence.current) setMessage((error as Error).message)
    } finally {
      if (active.current && pending.current === abort) setBusy(null)
    }
  }
  const visible = !checkingAccess && !stale && preview?.source === sourceKey ? preview.timeline : null
  const name = (id: string) => collection.entries.find(e => e.actorId === id)?.actorName ?? 'Герой без заявления'
  return <section className="w6-fieldset gb-round-timeline" aria-label="Предпросмотр времени раунда"><h3>Временная шкала раунда</h3>
    <p className="w6-copy">Мастер задаёт личный бюджет работы на {collection.durationSeconds} с мирового времени и стоимость действий в тех же личных миллисекундах. Сайт переводит стоимость на общую шкалу один раз. Зависимость бюджета от характеристик ещё не задана.</p>
    <p className="w6-copy">Ожидание использует заявленные мировые секунды. Здесь проверяется время; цели, расходы и последствия проверяются при исполнении. Параметры сохраняются на этом устройстве.</p>
    {!!roundWork.entries.length && <p className="w6-copy">Эта шкала показывает новое заявление отдельно. Прежнюю очередь и её остатки учитывает расчёт последствий ниже.</p>}
    <fieldset disabled={disabled}><legend>Заданные мастером длительности</legend>
      {entries.map(entry => <article className="gb-journal-entry" key={entry.actorId}><h4>{entry.actorName} · заявление {entry.revision}</h4>
        <label className="w6-field"><span>Личный бюджет на раунд, мс</span><input aria-label={'Бюджет ' + entry.actorName + ', мс'} inputMode="numeric" maxLength={40} value={row(entry.actorId).budget} onChange={e => change(entry.actorId, { budget: e.currentTarget.value })}/></label>
        {entry.actions.map((action, index) => <div className="gb-round-cost" key={index}><p>{index + 1}. {actionSummary(action)}</p>
          {action.kind === 'wait' ? <p>Фиксированное ожидание: {action.seconds} с мирового времени.</p> : <label className="w6-field"><span>Стоимость действия, личные мс</span><input aria-label={'Стоимость ' + entry.actorName + ', действие ' + (index + 1) + ', мс'} inputMode="numeric" maxLength={40} value={row(entry.actorId).costs[index] ?? ''} onChange={e => change(entry.actorId, { costs: entry.actions.map((_, i) => i === index ? e.currentTarget.value : row(entry.actorId).costs[i] ?? '') })}/></label>}
        </div>)}
      </article>)}
      {!entries.length && <p>Полученных заявлений нет. Сайт не назначает действия отсутствующим участникам.</p>}
      {stale && <><p role="alert">Кампания или сбор изменились. Сверь бюджеты и длительности с текущими заявлениями.</p><button className="w6-button" onClick={() => remember({ ...draft, source })}>Параметры времени проверены</button></>}
      <button className="w6-button" disabled={incomplete || stale} onClick={() => void calculate()}>Рассчитать временную шкалу</button>
    </fieldset>
    {checkingAccess && <p role="status">Проверяем текущую кампанию и права…</p>}
    {warning && <p role="alert">{warning}</p>}<p role="status">{checkingAccess ? '' : message}</p>
    {visible && <div aria-label="Результат временной шкалы">
      <p>Граница раунда: {format(visible.durationMs)} мс. Отображаемые числа округлены; порядок и совпадения рассчитаны точно.</p>
      {!!visible.missingActorIds.length && <p role="alert">Без полученного заявления: {visible.missingActorIds.length}. Решение остаётся за мастером; штрафы и ожидание не назначены.</p>}
      <ol className="gb-round-events">{visible.groups.map((group, index) => <li key={index}><strong>{format(group.atMs)} мс</strong>
        {group.actions.length > 1 && <p>Совпавшее время. Порядок и взаимодействие определяет мастер.</p>}
        {group.actions.map(action => <p key={action.actorId + ':' + action.index}>{name(action.actorId)} · действие {action.index + 1} завершится в этом раунде.</p>)}
      </li>)}</ol>
      {!visible.groups.length && <p>В этом раунде нет действий, которые успеют завершиться.</p>}
      {visible.actors.flatMap(actor => actor.actions.filter(action => action.status !== 'finishes').map(action => <article className="gb-journal-entry" key={action.actorId + ':' + action.index}>
        <h4>{name(action.actorId)} · действие {action.index + 1}</h4>
        <p>{action.status === 'continues' ? 'Начнётся, но не завершится' : 'Останется в очереди'} · оставшаяся работа: {format(action.remainingPersonalMs)} личных мс.</p>
        {action.status === 'continues' && <p>Прогноз прогресса: {format(action.progressPercent)}%. Исполнение ниже рассчитает и сохранит фактический остаток с учётом прежней работы.</p>}
      </article>))}
    </div>}
    <LobbyRoundExecution accountId={accountId} lobbyId={lobbyId} collection={collection} revision={revision} checkingAccess={checkingAccess}
      timings={timings} timingReady={!incomplete && !stale} roundWork={roundWork} executed={executed} actors={actors} objects={objects} movementBodies={movementBodies}/>
  </section>
}
