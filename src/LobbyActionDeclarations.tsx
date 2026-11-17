import type {SceneAbilityAim} from './sceneAbilityAim'
import { emptyQuickAction, isQuickActionDraft, gameActionLabel, gameTurnStatus } from './gameControls'
import type { QuickActionDraft } from './gameControls'
import GameActionBar from './GameActionBar'
import {itemPlanIssues} from './plannedInteractions'
import {reviewDeclaration} from './declarationReview'
import DeclarationActionReview from './DeclarationActionReview'
import AbilityChargeSelect from './AbilityChargeSelect'
import type { PerceivedMap } from './scenePerception'
import { spatialLabel } from './abilitySpatial'
import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { useRemote } from './onlineHooks'
import { NetworkError } from './onlineClient'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
import { actionKinds, isDeclaredAction, actionTarget, isTerrainMovement, movementLabels } from './actionDeclarations'
import type { DeclaredAction, HeroDeclarations } from './actionDeclarations'
import type { ScenePosition } from './sceneTypes'
type Form = { kind: string; targetKind: string; targetId: string; x: string; y: string; z: string; seconds: string; quantity: string;
  itemId: string; abilityId: string; stage: string; volume: string; speech: string; operation: string; note: string; support: string; route: ScenePosition[]; itemOperation?:string; listeningMode?:string; castId?:string }
type Base = { collectionId: string; epoch: number; baseVersion: number; controlStamp: string }
type Submission = Base & {actions:DeclaredAction[];commandKey:string}
type Draft = { form: Form; actions: DeclaredAction[]; base?: Base; quick?: QuickActionDraft; submission?:Submission }
const validBase=(b:Base)=>!!b&&typeof b.collectionId==='string'&&Number.isSafeInteger(b.epoch)&&Number.isSafeInteger(b.baseVersion)&&typeof b.controlStamp==='string'
const emptyQueue: DeclaredAction[] = []
const emptyForm = (): Form => ({ kind: 'move', targetKind: 'none', targetId: '', x: '', y: '', z: '', seconds: '', quantity: '1', itemId: '', abilityId: '', stage: 'prepare', volume: 'normal', speech: '', operation: 'inspect', note: '', support: 'ground', route: [], listeningMode:'' })
const valid = (v: unknown): v is Draft => !!v && typeof v === 'object' && (() => { const d = v as Draft
  return (d.quick===undefined||isQuickActionDraft(d.quick)) && !!d.form && Object.keys(emptyForm()).filter(k => k !== 'route'&&k!=='listeningMode').every(k => typeof d.form[k as keyof Form] === 'string' && (d.form[k as keyof Form] as string).length <= 4000) &&
    Array.isArray(d.form.route) && d.form.route.length <= 20 && d.form.route.every(p => !!p && ['x', 'y', 'z'].every(k => typeof p[k as keyof ScenePosition] === 'number' && Number.isFinite(p[k as keyof ScenePosition]))) &&
    (d.form.listeningMode===undefined||['','listen','eavesdrop'].includes(d.form.listeningMode)) &&
    (d.form.itemOperation===undefined||typeof d.form.itemOperation==='string'&&d.form.itemOperation.length<=40) && Array.isArray(d.actions) && d.actions.length <= 20 && d.actions.every(isDeclaredAction) && (!d.base || validBase(d.base)) &&
    (d.form.castId===undefined||typeof d.form.castId==='string'&&d.form.castId.length<=160) &&
    (!d.submission||validBase(d.submission)&&typeof d.submission.commandKey==='string'&&/^declaration:[a-zA-Z0-9_-]{8,140}$/.test(d.submission.commandKey)&&Array.isArray(d.submission.actions)&&d.submission.actions.length>0&&d.submission.actions.length<=20&&d.submission.actions.every(isDeclaredAction)) })()
const hasDraftContent=(d:Draft)=>d.actions.length>0||d.form.route.length>0||!!d.quick?.text.trim()||Object.keys(emptyForm()).some(k=>k!=='route'&&(d.form[k as keyof Form]??emptyForm()[k as keyof Form])!==emptyForm()[k as keyof Form])
const coordinate = (s: string) => s.trim() ? Number(s.replace(',', '.')) : NaN
export default function LobbyActionDeclarations({ accountId, lobbyId, characterId, checkingAccess, selectedContact, pickedPoint, members, map = null, selectedObject = '', onQueue,sceneActionRef,onAimChange,onTalk }: {
  onTalk?:()=>void;onAimChange?:(aim:SceneAbilityAim|null)=>void;accountId: string; lobbyId: string; characterId: string; checkingAccess: boolean; selectedContact: string; pickedPoint: ScenePosition | null; members: {id:string;displayName:string}[]; map?: PerceivedMap | null; selectedObject?: string; onQueue?: (actions: DeclaredAction[]) => void;sceneActionRef?:{current:((action:DeclaredAction)=>boolean)|null} }) {
  const { request, refresh } = useOnline(), path = '/lobbies/' + lobbyId + '/characters/' + characterId + '/declarations'
  const remote = useRemote<HeroDeclarations>(path), key = lobbyFormKey('action-sequence', accountId, lobbyId, characterId)
  const [draft, setDraft] = useState(() => readLobbyForm(key, valid) ?? { form: emptyForm(), actions: [] }), [busy, setBusy] = useState(false)
  const [undo,setUndo]=useState<{actions:DeclaredAction[];base:string}|null>(null),inFlight=useRef(false)
  const [message, setMessage] = useState(''), [warning, setWarning] = useState(''), active = useRef(false), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  const value = remote.value, c = value?.collection, f = draft.form
  const base = (): Base | undefined => c ? { collectionId: c.id, epoch: c.epoch, baseVersion: value?.entry?.revision ?? 0, controlStamp: value?.controlStamp ?? '' } : undefined
  function saveDraft(next: Draft) { const saved = { ...next, base: next.base && (hasDraftContent(draft)||next.base.collectionId===c?.id) ? next.base : base() }; setDraft(saved);const persisted=writeLobbyForm(key,saved); setWarning(persisted ? '' : 'Не удалось сохранить черновик на устройстве. Не закрывай страницу.');return {draft:saved,persisted} }
  function remember(next:Draft){return saveDraft(next).draft}
  function field(k: keyof Omit<Form, 'route'>, text: string) { remember({ ...draft, form: { ...f, [k]: text } }) }
  const point = (): ScenePosition => ({ x: coordinate(f.x), y: coordinate(f.y), z: coordinate(f.z) })
  function addPoint() { const p = point(); if (!Object.values(p).every(Number.isFinite) || f.route.length >= 20) { setMessage('Укажи X/Y/Z; маршрут содержит не больше 20 точек.'); return }
    remember({ ...draft, form: { ...f, route: [...f.route, p] } }); setMessage('Точка добавлена в маршрут.') }
  function addAction() {
    if(f.kind==='ability'&&f.stage==='prepare'&&value?.options?.abilities.find(a=>a.id===f.abilityId)?.canPrepare===false){setMessage('Доступен только прежний оплаченный заряд. Новая подготовка требует утверждённой способности.');return}
    if(f.kind==='ability'&&f.stage==='release'&&f.castId&&!value?.options?.casts?.some(c=>c.id===f.castId&&c.abilityId===f.abilityId)){setMessage('Выбранный заряд больше не доступен. Проверь его перед добавлением действия.');return}
    const target = ['point','area','direction'].includes(f.targetKind) ? { kind: f.targetKind, point: point() } : ['contact', 'object'].includes(f.targetKind) ? { kind: f.targetKind, id: f.targetId } : { kind: f.targetKind }
    const shared = { note: f.note, kind: f.kind }, candidate = f.kind === 'move' ? { ...shared, route: f.route.length ? f.route : [point()], support: f.support } :
      f.kind === 'wait' ? { ...shared, seconds: coordinate(f.seconds),...(f.listeningMode?{listening:{mode:f.listeningMode,target}}:{}) } : f.kind === 'interact' ? { ...shared, target, operation: f.operation } :
        f.kind === 'speak' ? { ...shared, target, volume: f.volume, text: f.speech } : f.kind === 'item' ? { ...shared, target, itemId: f.itemId, quantity: coordinate(f.quantity),...(f.itemOperation?{operation:f.itemOperation}:{}) } :
          { ...shared, target, abilityId: f.abilityId, stage: f.stage, ...(f.stage==='release'&&f.castId?{castId:f.castId}:{}) }
    if (!isDeclaredAction(candidate) || draft.actions.length >= 20) { setMessage('Проверь параметры действия. В последовательности допустимо от 1 до 20 действий.'); return }
    const inventoryIssue=value?.options?itemPlanIssues(value.options.items,[...draft.actions,candidate])[0]:undefined
    if(inventoryIssue){setMessage(inventoryIssue.message);return}
    if(repeatedCharge(candidate)){setMessage('Этот заряд уже запланирован к выпуску в очереди. Каждый заряд выпускается один раз.');return}
    remember({ ...draft, actions: [...draft.actions, candidate], form: { ...f, route: [], note: '' } }); setMessage('Действие добавлено в черновик.')
  }
  function editQueue(actions:DeclaredAction[]) { const next=remember({...draft,actions});setUndo({actions:draft.actions,base:JSON.stringify(next.base)}) }
  const repeatedCharge=(action:DeclaredAction)=>action.kind==='ability'&&action.stage==='release'&&!!action.castId&&draft.actions.some(a=>a.kind==='ability'&&a.stage==='release'&&a.castId===action.castId)
  function appendActions(actions:DeclaredAction[]):boolean {
    if(!actions.length||!actions.every(isDeclaredAction)||draft.actions.length+actions.length>20){
      setMessage('В ходе допускается до 20 действий. Освободи место для всей последовательности.');return false
    }
    const combined=[...draft.actions,...actions],charges=new Set<string>()
    for(const action of combined){
      if(action.kind==='ability'&&action.stage==='release'&&action.castId){
        if(charges.has(action.castId)){setMessage('Этот заряд уже запланирован к выпуску в очереди. Каждый заряд выпускается один раз.');return false}
        charges.add(action.castId)
      }
    }
    const inventoryIssue=value?.options?itemPlanIssues(value.options.items,combined)[0]:undefined
    if(inventoryIssue){setMessage(inventoryIssue.message);return false}
    const next=remember({...draft,actions:combined,...(actions.some(action=>action.kind==='speak')?{quick:{...(draft.quick??emptyQuickAction()),text:''}}:{})})
    setUndo({actions:draft.actions,base:JSON.stringify(next.base)});setMessage(actions.length===1?'Действие добавлено в ход.':'Подготовка и применение добавлены в ход.');return true
  }
  const appendAction=(action:DeclaredAction)=>appendActions([action])
  async function submit() {
    if(!available||!value||!draft.submission&&!canSend||inFlight.current)return
    const source = draft, b = source.base ?? source.submission ?? base(); if (!b) return
    const command=source.submission??{...b,actions:source.actions,commandKey:'declaration:'+crypto.randomUUID()}
    if(!saveDraft({...source,submission:command}).persisted){writeLobbyForm(key,source);setDraft(source);setMessage('Ход не отправлен: команда повтора не сохранена. Освободи место на устройстве и повтори отправку.');return}
    inFlight.current=true
    const abort = new AbortController(); pending.current = abort; setBusy(true)
    try { const result = await request<{ entryVersion: number }>(path, { method: 'PUT', signal: abort.signal, body: JSON.stringify(command) })
      if (!active.current || abort.signal.aborted) return
      if(!Number.isSafeInteger(result?.entryVersion)||result.entryVersion<1)throw Error('Сервер не подтвердил версию хода. Повтори ту же отправку после проверки соединения.')
      setUndo(null); remember({ form: emptyForm(), actions: [], quick:source.quick??emptyQuickAction(), base: { collectionId:b.collectionId,epoch:b.epoch,controlStamp:b.controlStamp,baseVersion:result.entryVersion } }); setMessage('Заявление отправлено. Сервер подтвердил ход; последствия применяет мастер при исполнении раунда.'); refresh()
    } catch (e) { if (active.current && !abort.signal.aborted) {if(e instanceof NetworkError&&e.status>=400&&e.status<500)remember({...source,submission:undefined});setMessage((e as Error).message);refresh()} } finally { inFlight.current=false; if (active.current && pending.current === abort) {pending.current=null;setBusy(false)} }
  }
  function loadSent() {
    if (!value?.entry || (draft.actions.length || Object.keys(f).some(k => k !== 'route' && f[k as keyof Form] !== emptyForm()[k as keyof Form])) && !window.confirm('Заменить текущий черновик отправленной последовательностью?')) return
    remember({ ...draft, form: emptyForm(), actions: value.entry.actions, base: base() })
  }
  const stale = hasDraftContent(draft) && !!draft.base && (!c || draft.base.collectionId !== c.id || draft.base.epoch !== c.epoch || draft.base.baseVersion !== (value?.entry?.revision ?? 0) || draft.base.controlStamp !== value?.controlStamp)
  useEffect(() => { onQueue?.(stale ? emptyQueue : draft.actions) }, [draft.actions, stale, onQueue])
  const planIssues=value?.options?reviewDeclaration(draft.actions,value.options):[],sentIssues=!checkingAccess&&!value?.executed&&c?.phase!=='cancelled'&&value?.options&&value.entry?reviewDeclaration(value.entry.actions,value.options):[]
  const available = !busy && !checkingAccess && !remote.loading,editable=available&&!draft.submission, canSend = editable && !!value?.canSubmit && !!value.options && draft.actions.length > 0 && !planIssues.length && !stale && (value.entry?.status !== 'submitted' || !!c?.allowReplace)
  useEffect(()=>{if(sceneActionRef)sceneActionRef.current=action=>editable&&!stale?appendAction(action):false;return ()=>{if(sceneActionRef)sceneActionRef.current=null}})
  const targetLabel = (a: DeclaredAction) => {
    const t=actionTarget(a)
    return !t?'':'point' in t?`${{point:'Точка',area:'Область',direction:'Направление'}[t.kind]} (${t.point.x}; ${t.point.y}; ${t.point.z})`:
      t.kind==='self'?'На себя':t.kind==='none'?'Без конкретной цели':value?.options?.targets.find(x=>x.kind===t.kind&&x.id===t.id)?.label??'Прежняя отметка; требуется проверка'
  }
  const turnStatus=gameTurnStatus(value,draft.actions.length>0)
  const spatial=(f.stage==='release'&&f.castId?value?.options?.casts?.find(c=>c.id===f.castId&&c.abilityId===f.abilityId):value?.options?.abilities.find(a=>a.id===f.abilityId))?.spatial
  const pointsNeeded = f.kind === 'move' || (f.kind!=='wait'||!!f.listeningMode)&&['point','area','direction'].includes(f.targetKind)
  return <section className="w6-fieldset gb-action-declarations"><h4>Заявление действий</h4><p role="status">{remote.loading ? 'Проверяем приём заявлений…' : remote.error}</p>
    <div className={'gb-turn-status gb-turn-'+turnStatus.tone} role="status"><strong>{turnStatus.title}</strong><p>{turnStatus.hint}</p></div><details className="realm-turn-rules"><summary>Правила хода и готовность игроков</summary><p className="w6-copy">Заявление описывает план. Время, ресурсы и положение героя меняются только при последующем исполнении. Неисполненная реплика не рассылается слушателям.</p>{value&&<p>Готовность игроков: {value.readiness.map(r => <span key={r.userId}>{members.find(m => m.id === r.userId)?.displayName ?? 'Игрок'}: {r.ready ? 'готов' : 'ожидаем'} · </span>)} · содержимое чужих планов скрыто.</p>}</details>
    {value && <><p>{!c ? 'Мастер ещё не открыл приём.' : c.phase === 'open' ? 'Приём открыт · длительность раунда: ' + c.durationSeconds + ' с' : c.phase === 'cancelled' ? 'Сцена удалена; сбор остановлен.' : 'Приём закрыт.'}</p>
      {value.paused&&<p role="status">Кампания на паузе. Черновик можно подготовить; отправка доступна после продолжения.</p>}{c?.phase === 'open' && value.participating && !value.canSubmit && !value.paused && <p>Заявлять действия может действующий управляющий принятого героя.</p>}{c && !value.participating && <p>Мастер не включил героя в этот сбор.</p>}{c && <p>{c.allowReplace ? 'До закрытия можно заменить отправленную последовательность.' : 'Для изменения отправленного заявления нужен возврат мастером.'}</p>}
      {value.entry && <details open><summary>Моё отправленное заявление · {value.entry.status === 'submitted' ? 'отправлено' : 'возвращено'}</summary>
        {!!sentIssues.length&&<section aria-label="Отправленный ход требует проверки"><p>После отправки изменились доступные сведения. Подтверждённый ход сохранён; проверь его перед заменой.</p>{sentIssues.map(issue=><p key={issue.index+':'+issue.code}>Действие {issue.index+1}: {issue.message}</p>)}</section>}
        <p>Автор плана: {members.find(m => m.id === value.entry!.submittedBy)?.displayName ?? 'Участник кампании'}</p>{value.entry.actions.map((a, i) => <p key={i}>{i + 1}. {gameActionLabel(a,value?.options)} · {targetLabel(a)}{a.note && ' · ' + a.note}</p>)}{value.entry.note && <p>Замечание мастера: {value.entry.note}</p>}
        <button className="w6-button" disabled={!editable} onClick={loadSent}>Загрузить отправленное в черновик</button></details>}
    </>}
    <GameActionBar plannedActions={stale?[]:draft.actions} onAimChange={onAimChange} onTalk={onTalk} map={map} point={pickedPoint} contactId={selectedContact} objectId={selectedObject} options={value?.options??null} disabled={!editable||draft.actions.length>=20} draft={draft.quick??emptyQuickAction()} onChange={quick=>remember({...draft,quick})} onAdd={appendAction} onAddMany={appendActions}/>
    <details className="gb-game-advanced"><summary>Точные параметры и сложная последовательность</summary><fieldset disabled={!editable}><legend>Черновик последовательности</legend>
      {pickedPoint && <button className="w6-button" onClick={() => remember({ ...draft, form: { ...f, targetKind: ['area','direction'].includes(f.targetKind)?f.targetKind:'point', x: String(pickedPoint.x), y: String(pickedPoint.y), z: String(pickedPoint.z) } })}>Использовать выбранные координаты ({pickedPoint.x}; {pickedPoint.y}; {pickedPoint.z})</button>}
      {value?.options?.targets.some(t => t.kind === 'contact' && t.id === selectedContact) && <button className="w6-button" onClick={() => remember({ ...draft, form: { ...f, targetKind: 'contact', targetId: selectedContact } })}>Использовать отмеченный контакт</button>}<label className="w6-field"><span>Категория действия</span><select aria-label="Категория действия" value={f.kind} onChange={e => field('kind', e.currentTarget.value)}>{actionKinds.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
      {(f.kind !== 'move' && f.kind !== 'wait'||f.kind==='wait'&&!!f.listeningMode) && <><label className="w6-field"><span>Вид цели</span><select aria-label="Вид цели" value={f.targetKind} onChange={e => field('targetKind', e.currentTarget.value)}><option value="none">Без конкретной цели</option><option value="self">На себя</option><option value="point">Точка</option>{f.kind==='ability'&&<><option value="area">Область · центр</option><option value="direction">Направление · опорная точка</option></>}<option value="contact">Контакт</option><option value="object">Объект</option></select></label>
        {(f.targetKind === 'contact' || f.targetKind === 'object') && <label className="w6-field"><span>Доступная цель</span><select aria-label="Доступная цель" value={f.targetId} onChange={e => field('targetId', e.currentTarget.value)}><option value="">Выбери раскрытую отметку</option>{value?.options?.targets.filter(t => t.kind === f.targetKind).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}</>}
      {pointsNeeded && <div className="gb-action-coordinates">{(['x', 'y', 'z'] as const).map(k => <label className="w6-field" key={k}><span>{k.toUpperCase()}, м</span><input aria-label={'Действие ' + k.toUpperCase()} inputMode="decimal" value={f[k]} onChange={e => field(k, e.currentTarget.value)}/></label>)}</div>}
      {f.kind === 'move' && <><label className="w6-field"><span>Способ движения</span><select aria-label="Способ движения" value={f.support} onChange={e => field('support', e.currentTarget.value)}>
        {Object.entries(movementLabels).map(([id,label])=><option key={id} value={id} disabled={id==='sneak'&&!!map&&!map.soundTravel}>{label}</option>)}</select></label>
        {f.support==='swim'&&<p className="gb-game-help">Z обозначает высоту ног. Добавь точку в воде и при необходимости точки всплытия или выхода на берег.</p>}
        {f.support==='sneak'&&<p className="gb-game-help">Тихий шаг требует больше времени и доступен в сценах с расчётом распространения звука.</p>}
        {isTerrainMovement(f.support) ? <p className="gb-game-help">Укажи одну точку назначения на опоре. Для подъёма или спуска используй ту же грань объекта.</p>
          : <button className="w6-button" onClick={addPoint}>Добавить точку маршрута</button>}
        {f.route.map((p, i) => <p key={i}>{i + 1}: {p.x}; {p.y}; {p.z} м <button className="w6-button" onClick={() => remember({ ...draft, form: { ...f, route: f.route.filter((_, n) => n !== i) } })}>Убрать точку {i + 1}</button></p>)}</>}
      {f.kind==='wait'&&<><label className="w6-field"><span>Режим ожидания</span><select aria-label="Режим ожидания" value={f.listeningMode??''} onChange={e=>remember({...draft,form:{...f,listeningMode:e.currentTarget.value,targetKind:['none','self','point','contact','object'].includes(f.targetKind)?f.targetKind:'none'}})}><option value="">Обычное ожидание</option><option value="listen">Прислушиваться</option><option value="eavesdrop">Подслушивать</option></select></label>{f.listeningMode&&<p className="w6-copy">Это намерение занять время слушанием. Укажи доступную отметку или точку, либо оставь без конкретной цели. Слышимость и скрытность определит мастер; новых сведений и бонусов автоматически нет.</p>}</>}
      {f.kind === 'wait' && <label className="w6-field"><span>Ожидание, с</span><input aria-label="Ожидание, с" inputMode="decimal" value={f.seconds} onChange={e => field('seconds', e.currentTarget.value)}/></label>}
      {f.kind === 'interact' && <label className="w6-field"><span>Взаимодействие</span><select aria-label="Взаимодействие" value={f.operation} onChange={e => field('operation', e.currentTarget.value)}><option value="inspect">Осмотреть</option><option value="open">Открыть</option><option value="close">Закрыть</option><option value="take">Взять</option><option value="activate">Активировать</option><option value="deactivate">Отключить</option><option value="ignite">Зажечь</option><option value="extinguish">Погасить</option><option value="lock">Запереть</option><option value="unlock">Отпереть</option></select></label>}
      {f.kind === 'speak' && <><label className="w6-field"><span>Громкость</span><select aria-label="Громкость" value={f.volume} onChange={e => field('volume', e.currentTarget.value)}><option value="whisper">Шёпот</option><option value="normal">Обычная речь</option><option value="shout">Крик</option></select></label><label className="w6-field"><span>Планируемая реплика</span><textarea aria-label="Планируемая реплика" maxLength={4000} value={f.speech} onChange={e => field('speech', e.currentTarget.value)}/></label></>}
      {f.kind === 'item' && <><label className="w6-field"><span>Операция с предметом</span><select aria-label="Операция с предметом" value={f.itemOperation??''} onChange={e=>field('itemOperation',e.currentTarget.value)}><option value="">Уточнить с мастером</option><option value="equip">Экипировать</option><option value="unequip">Снять</option><option value="activate">Активировать артефакт</option><option value="consume">Использовать расходник · одна доза</option></select></label><label className="w6-field"><span>Предмет для действия</span><select aria-label="Предмет для действия" value={f.itemId} onChange={e => field('itemId', e.currentTarget.value)}><option value="">Выбери предмет</option>{value?.options?.items.map(i => <option key={i.id} value={i.id}>{i.name} × {i.quantity}</option>)}</select></label><label className="w6-field"><span>Количество</span><input aria-label="Количество для действия" value={f.quantity} onChange={e => field('quantity', e.currentTarget.value)} inputMode="numeric"/></label></>}
      {f.kind==='ability'&&spatial&&<p>{spatialLabel(spatial)}. Подготовка без привязки; для выпуска выбери {spatial.shape==='point'?'точку':spatial.shape==='sphere'?'область и её центр':'направление и его опорную точку'}.</p>}
      {f.kind === 'ability' && <><label className="w6-field"><span>Способность для действия</span><select aria-label="Способность для действия" value={f.abilityId} onChange={e => remember({...draft,form:{...f,abilityId:e.currentTarget.value,castId:''}})}><option value="">Выбери утверждённую способность</option>{value?.options?.abilities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="w6-field"><span>Этап способности</span><select aria-label="Этап способности" value={f.stage} onChange={e => field('stage', e.currentTarget.value)}><option value="prepare">Подготовить заряд</option><option value="release">Применить</option></select></label>{f.stage==='release'&&<AbilityChargeSelect label="Заряд для точного действия" options={value?.options} abilityId={f.abilityId} value={f.castId??''} onChange={id=>field('castId',id)}/>}</>}
      <label className="w6-field"><span>Пояснение действия</span><textarea aria-label="Пояснение действия" maxLength={1000} value={f.note} onChange={e => field('note', e.currentTarget.value)}/></label>
      <button className="w6-button" onClick={addAction}>Добавить действие в последовательность</button>
    </fieldset></details><fieldset disabled={!editable} className="gb-game-queue"><legend>Мой ход · {draft.actions.length} / 20 действий</legend>
      {!!draft.quick?.text.trim()&&<p className="w6-copy">В поле реплики есть текст, который ещё не добавлен в очередь хода.</p>}
      {!!planIssues.length&&<p role="status">Нужно проверить действий: {new Set(planIssues.map(issue=>issue.index)).size}. Причины показаны в очереди.</p>}
      {draft.actions.length===0&&<p className="w6-copy">Выбери действие на панели над очередью. После исполнения результат появится на карте.</p>}
      {draft.actions.map((a, i) => <article className="gb-journal-entry" key={i}><p>{i + 1}. {gameActionLabel(a,value?.options)} · {targetLabel(a)}{a.note && ' · ' + a.note}</p>
        <DeclarationActionReview action={a} index={i} options={value?.options??null} issues={planIssues.filter(issue=>issue.index===i)} onChange={action=>{editQueue(draft.actions.map((current,index)=>index===i?action:current));setMessage('Действие '+(i+1)+' обновлено. Проверь оставшуюся очередь.')}}/>
        <button className="w6-button" onClick={() => editQueue(draft.actions.filter((_, n) => n !== i))}>Убрать действие {i + 1}</button><button type="button" className="w6-button" aria-label={'Переместить действие '+(i+1)+' выше'} disabled={i===0} onClick={()=>{const next=[...draft.actions];[next[i-1],next[i]]=[next[i],next[i-1]];editQueue(next)}}>↑</button><button type="button" className="w6-button" aria-label={'Переместить действие '+(i+1)+' ниже'} disabled={i===draft.actions.length-1} onClick={()=>{const next=[...draft.actions];[next[i+1],next[i]]=[next[i],next[i+1]];editQueue(next)}}>↓</button></article>)}
      <button type="button" className="w6-button" disabled={!undo||undo.base!==JSON.stringify(draft.base)||stale} onClick={()=>{if(undo){remember({...draft,actions:undo.actions});setUndo(null)}}}>Отменить правку очереди</button>
      {stale && <><p role="alert">Изменились приём, управление или моё заявление. Проверь черновик и доступные цели.</p><button className="w6-button" disabled={!c} onClick={() => remember({ ...draft, base: base() })}>Последовательность проверена с текущей версией</button></>}
      <button className="w6-button" disabled={!canSend} onClick={() => void submit()}>{value?.entry?.status === 'submitted' ? 'Заменить заявление' : 'Отправить заявление'}</button>
    </fieldset>{draft.submission&&<div role="status"><p>Подтверждение хода не получено. Повтор подтвердит прежнюю отправку без второго хода.</p><button type="button" className="w6-button" disabled={!available} onClick={()=>void submit()}>Повторить отправку хода</button></div>}{warning && <p role="alert">{warning}</p>}<p role="status">{message}</p>
  </section>
}
