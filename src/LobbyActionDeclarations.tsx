import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { useRemote } from './onlineHooks'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
import { actionKinds, actionSummary, isDeclaredAction } from './actionDeclarations'
import type { DeclaredAction, DeclarationTarget, HeroDeclarations } from './actionDeclarations'
import type { ScenePosition } from './sceneTypes'
type Form = { kind: string; targetKind: string; targetId: string; x: string; y: string; z: string; seconds: string; quantity: string;
  itemId: string; abilityId: string; stage: string; volume: string; speech: string; operation: string; note: string; support: string; route: ScenePosition[] }
type Base = { collectionId: string; epoch: number; baseVersion: number; controlStamp: string }
type Draft = { form: Form; actions: DeclaredAction[]; base?: Base }
const emptyForm = (): Form => ({ kind: 'move', targetKind: 'none', targetId: '', x: '', y: '', z: '', seconds: '', quantity: '1', itemId: '', abilityId: '', stage: 'prepare', volume: 'normal', speech: '', operation: 'inspect', note: '', support: 'ground', route: [] })
const valid = (v: unknown): v is Draft => !!v && typeof v === 'object' && (() => { const d = v as Draft
  return !!d.form && Object.keys(emptyForm()).filter(k => k !== 'route').every(k => typeof d.form[k as keyof Form] === 'string' && (d.form[k as keyof Form] as string).length <= 4000) &&
    Array.isArray(d.form.route) && d.form.route.length <= 20 && d.form.route.every(p => !!p && ['x', 'y', 'z'].every(k => typeof p[k as keyof ScenePosition] === 'number' && Number.isFinite(p[k as keyof ScenePosition]))) &&
    Array.isArray(d.actions) && d.actions.length <= 20 && d.actions.every(isDeclaredAction) && (!d.base || typeof d.base.collectionId === 'string' && Number.isSafeInteger(d.base.epoch) && Number.isSafeInteger(d.base.baseVersion) && typeof d.base.controlStamp === 'string') })()
const coordinate = (s: string) => s.trim() ? Number(s.replace(',', '.')) : NaN
export default function LobbyActionDeclarations({ accountId, lobbyId, characterId, checkingAccess, selectedContact, pickedPoint, members }: {
  accountId: string; lobbyId: string; characterId: string; checkingAccess: boolean; selectedContact: string; pickedPoint: ScenePosition | null; members: {id:string;displayName:string}[] }) {
  const { request, refresh } = useOnline(), path = '/lobbies/' + lobbyId + '/characters/' + characterId + '/declarations'
  const remote = useRemote<HeroDeclarations>(path), key = lobbyFormKey('action-sequence', accountId, lobbyId, characterId)
  const [draft, setDraft] = useState(() => readLobbyForm(key, valid) ?? { form: emptyForm(), actions: [] }), [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(''), [warning, setWarning] = useState(''), active = useRef(false), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  const value = remote.value, c = value?.collection, f = draft.form
  const base = (): Base | undefined => c ? { collectionId: c.id, epoch: c.epoch, baseVersion: value?.entry?.revision ?? 0, controlStamp: value?.controlStamp ?? '' } : undefined
  function remember(next: Draft) { const saved = { ...next, base: next.base ?? base() }; setDraft(saved); setWarning(writeLobbyForm(key, saved) ? '' : 'Не удалось сохранить черновик на устройстве. Не закрывай страницу.') }
  function field(k: keyof Omit<Form, 'route'>, text: string) { remember({ ...draft, form: { ...f, [k]: text } }) }
  const point = (): ScenePosition => ({ x: coordinate(f.x), y: coordinate(f.y), z: coordinate(f.z) })
  function addPoint() { const p = point(); if (!Object.values(p).every(Number.isFinite) || f.route.length >= 20) { setMessage('Укажи X/Y/Z; маршрут содержит не больше 20 точек.'); return }
    remember({ ...draft, form: { ...f, route: [...f.route, p] } }); setMessage('Точка добавлена в маршрут.') }
  function addAction() {
    const target = f.targetKind === 'point' ? { kind: 'point', point: point() } : ['contact', 'object'].includes(f.targetKind) ? { kind: f.targetKind, id: f.targetId } : { kind: f.targetKind }
    const shared = { note: f.note, kind: f.kind }, candidate = f.kind === 'move' ? { ...shared, route: f.route.length ? f.route : [point()], support: f.support } :
      f.kind === 'wait' ? { ...shared, seconds: coordinate(f.seconds) } : f.kind === 'interact' ? { ...shared, target, operation: f.operation } :
        f.kind === 'speak' ? { ...shared, target, volume: f.volume, text: f.speech } : f.kind === 'item' ? { ...shared, target, itemId: f.itemId, quantity: coordinate(f.quantity) } :
          { ...shared, target, abilityId: f.abilityId, stage: f.stage }
    if (!isDeclaredAction(candidate) || draft.actions.length >= 20) { setMessage('Проверь параметры действия. В последовательности допустимо от 1 до 20 действий.'); return }
    remember({ ...draft, actions: [...draft.actions, candidate], form: { ...f, route: [], note: '' } }); setMessage('Действие добавлено в черновик.')
  }
  async function submit() {
    const source = draft, b = source.base ?? base(); if (!b) return
    const abort = new AbortController(); pending.current = abort; setBusy(true)
    try { const result = await request<{ entryVersion: number }>(path, { method: 'PUT', signal: abort.signal, body: JSON.stringify({ ...b, actions: source.actions }) })
      if (!active.current || abort.signal.aborted) return
      remember({ form: emptyForm(), actions: [], base: { ...b, baseVersion: result.entryVersion } }); setMessage('Заявление отправлено. Последствия ещё не применены.'); refresh()
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) } finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  function loadSent() {
    if (!value?.entry || (draft.actions.length || Object.keys(f).some(k => k !== 'route' && f[k as keyof Form] !== emptyForm()[k as keyof Form])) && !window.confirm('Заменить текущий черновик отправленной последовательностью?')) return
    remember({ form: emptyForm(), actions: value.entry.actions, base: base() })
  }
  const stale = !!draft.base && (!c || draft.base.collectionId !== c.id || draft.base.epoch !== c.epoch || draft.base.baseVersion !== (value?.entry?.revision ?? 0) || draft.base.controlStamp !== value?.controlStamp)
  const editable = !busy && !checkingAccess && !remote.loading, canSend = editable && !!value?.canSubmit && !!value.options && draft.actions.length > 0 && !stale && (value.entry?.status !== 'submitted' || !!c?.allowReplace)
  const targetLabel = (a: DeclaredAction) => 'target' in a ? a.target.kind === 'point' ? `Точка (${a.target.point.x}; ${a.target.point.y}; ${a.target.point.z})` :
    a.target.kind === 'self' ? 'На себя' : a.target.kind === 'none' ? 'Без конкретной цели' : value?.options?.targets.find(t => t.kind === a.target.kind && t.id === (a.target as Extract<DeclarationTarget, { id: string }>).id)?.label ?? 'Прежняя отметка; требуется проверка' : ''
  const pointsNeeded = f.kind === 'move' || f.targetKind === 'point'
  return <section className="w6-fieldset gb-action-declarations"><h4>Заявление действий</h4><p role="status">{remote.loading ? 'Проверяем приём заявлений…' : remote.error}</p>
    <p className="w6-copy">Заявление описывает план. Время, ресурсы и положение героя меняются только при последующем исполнении. Неисполненная реплика не рассылается слушателям.</p>
    {value && <><p>{!c ? 'Мастер ещё не открыл приём.' : c.phase === 'open' ? 'Приём открыт · длительность раунда: ' + c.durationSeconds + ' с' : c.phase === 'cancelled' ? 'Сцена удалена; сбор остановлен.' : 'Приём закрыт.'}</p>
      {c?.phase === 'open' && value.participating && !value.canSubmit && <p>Заявлять действия может действующий управляющий принятого героя.</p>}{c && !value.participating && <p>Мастер не включил героя в этот сбор.</p>}{c && <p>{c.allowReplace ? 'До закрытия можно заменить отправленную последовательность.' : 'Для изменения отправленного заявления нужен возврат мастером.'}</p>}
      <p>Готовность игроков: {value.readiness.map(r => <span key={r.userId}>{members.find(m => m.id === r.userId)?.displayName ?? 'Игрок'}: {r.ready ? 'готов' : 'ожидаем'} · </span>)} · содержимое чужих планов скрыто.</p>
      {value.entry && <details open><summary>Моё отправленное заявление · {value.entry.status === 'submitted' ? 'отправлено' : 'возвращено'}</summary>
        <p>Автор плана: {members.find(m => m.id === value.entry!.submittedBy)?.displayName ?? 'Участник кампании'}</p>{value.entry.actions.map((a, i) => <p key={i}>{i + 1}. {actionSummary(a)} · {targetLabel(a)}{a.note && ' · ' + a.note}</p>)}{value.entry.note && <p>Замечание мастера: {value.entry.note}</p>}
        <button className="w6-button" disabled={!editable} onClick={loadSent}>Загрузить отправленное в черновик</button></details>}
    </>}
    <fieldset disabled={!editable}><legend>Черновик последовательности</legend>
      {pickedPoint && <button className="w6-button" onClick={() => remember({ ...draft, form: { ...f, targetKind: 'point', x: String(pickedPoint.x), y: String(pickedPoint.y), z: String(pickedPoint.z) } })}>Использовать выбранные координаты ({pickedPoint.x}; {pickedPoint.y}; {pickedPoint.z})</button>}
      {value?.options?.targets.some(t => t.kind === 'contact' && t.id === selectedContact) && <button className="w6-button" onClick={() => remember({ ...draft, form: { ...f, targetKind: 'contact', targetId: selectedContact } })}>Использовать отмеченный контакт</button>}<label className="w6-field"><span>Категория действия</span><select aria-label="Категория действия" value={f.kind} onChange={e => field('kind', e.currentTarget.value)}>{actionKinds.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
      {f.kind !== 'move' && f.kind !== 'wait' && <><label className="w6-field"><span>Вид цели</span><select aria-label="Вид цели" value={f.targetKind} onChange={e => field('targetKind', e.currentTarget.value)}><option value="none">Без конкретной цели</option><option value="self">На себя</option><option value="point">Точка</option><option value="contact">Контакт</option><option value="object">Объект</option></select></label>
        {(f.targetKind === 'contact' || f.targetKind === 'object') && <label className="w6-field"><span>Доступная цель</span><select aria-label="Доступная цель" value={f.targetId} onChange={e => field('targetId', e.currentTarget.value)}><option value="">Выбери раскрытую отметку</option>{value?.options?.targets.filter(t => t.kind === f.targetKind).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}</>}
      {pointsNeeded && <div className="gb-action-coordinates">{(['x', 'y', 'z'] as const).map(k => <label className="w6-field" key={k}><span>{k.toUpperCase()}, м</span><input aria-label={'Действие ' + k.toUpperCase()} inputMode="decimal" value={f[k]} onChange={e => field(k, e.currentTarget.value)}/></label>)}</div>}
      {f.kind === 'move' && <><label className="w6-field"><span>Способ движения</span><select aria-label="Способ движения" value={f.support} onChange={e => field('support', e.currentTarget.value)}><option value="ground">Ходьба</option><option value="air">Полёт</option></select></label><button className="w6-button" onClick={addPoint}>Добавить точку маршрута</button>{f.route.map((p, i) => <p key={i}>{i + 1}: {p.x}; {p.y}; {p.z} м <button className="w6-button" onClick={() => remember({ ...draft, form: { ...f, route: f.route.filter((_, n) => n !== i) } })}>Убрать точку {i + 1}</button></p>)}</>}
      {f.kind === 'wait' && <label className="w6-field"><span>Ожидание, с</span><input aria-label="Ожидание, с" inputMode="decimal" value={f.seconds} onChange={e => field('seconds', e.currentTarget.value)}/></label>}
      {f.kind === 'interact' && <label className="w6-field"><span>Взаимодействие</span><select aria-label="Взаимодействие" value={f.operation} onChange={e => field('operation', e.currentTarget.value)}><option value="inspect">Осмотреть</option><option value="open">Открыть</option><option value="close">Закрыть</option><option value="take">Взять</option><option value="activate">Активировать</option></select></label>}
      {f.kind === 'speak' && <><label className="w6-field"><span>Громкость</span><select aria-label="Громкость" value={f.volume} onChange={e => field('volume', e.currentTarget.value)}><option value="whisper">Шёпот</option><option value="normal">Обычная речь</option><option value="shout">Крик</option></select></label><label className="w6-field"><span>Планируемая реплика</span><textarea aria-label="Планируемая реплика" maxLength={4000} value={f.speech} onChange={e => field('speech', e.currentTarget.value)}/></label></>}
      {f.kind === 'item' && <><label className="w6-field"><span>Предмет для действия</span><select aria-label="Предмет для действия" value={f.itemId} onChange={e => field('itemId', e.currentTarget.value)}><option value="">Выбери предмет</option>{value?.options?.items.map(i => <option key={i.id} value={i.id}>{i.name} × {i.quantity}</option>)}</select></label><label className="w6-field"><span>Количество</span><input aria-label="Количество для действия" value={f.quantity} onChange={e => field('quantity', e.currentTarget.value)} inputMode="numeric"/></label></>}
      {f.kind === 'ability' && <><label className="w6-field"><span>Способность для действия</span><select aria-label="Способность для действия" value={f.abilityId} onChange={e => field('abilityId', e.currentTarget.value)}><option value="">Выбери утверждённую способность</option>{value?.options?.abilities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="w6-field"><span>Этап способности</span><select aria-label="Этап способности" value={f.stage} onChange={e => field('stage', e.currentTarget.value)}><option value="prepare">Подготовить заряд</option><option value="release">Применить</option></select></label></>}
      <label className="w6-field"><span>Пояснение действия</span><textarea aria-label="Пояснение действия" maxLength={1000} value={f.note} onChange={e => field('note', e.currentTarget.value)}/></label>
      <button className="w6-button" onClick={addAction}>Добавить действие в последовательность</button>
      {draft.actions.map((a, i) => <article className="gb-journal-entry" key={i}><p>{i + 1}. {actionSummary(a)} · {targetLabel(a)}{a.note && ' · ' + a.note}</p><button className="w6-button" onClick={() => remember({ ...draft, actions: draft.actions.filter((_, n) => n !== i) })}>Убрать действие {i + 1}</button></article>)}
      {stale && <><p role="alert">Изменились приём, управление или моё заявление. Проверь черновик и доступные цели.</p><button className="w6-button" disabled={!c} onClick={() => remember({ ...draft, base: base() })}>Последовательность проверена с текущей версией</button></>}
      <button className="w6-button" disabled={!canSend} onClick={() => void submit()}>{value?.entry?.status === 'submitted' ? 'Заменить заявление' : 'Отправить заявление'}</button>
    </fieldset>{warning && <p role="alert">{warning}</p>}<p role="status">{message}</p>
  </section>
}
