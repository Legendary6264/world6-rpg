import { inspectionRows, isInspectionDecision } from './roundInspection'
import type { InspectionDecision } from './roundInspection'
import LobbyListeningPlans from './LobbyListeningPlans'
import { listeningRows, listeningPlanLabel, listeningFocusLabel } from './roundListening'
import LobbyRoundSpeech from './LobbyRoundSpeech'
import { speechRows, emptySpeechDecision, isSpeechDecision, speechDecisionReady } from './roundSpeech'
import type { SpeechDecision } from './roundSpeech'
import { isChargeDecision, isChargeForm } from './roundCharges'
import LobbyRoundCharges from './LobbyRoundCharges'
import type { ChargeForm } from './roundCharges'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
import { MAX_TIMING_MS } from './roundTimeline'
import { NetworkError } from './onlineClient'
import { actionSummary } from './actionDeclarations'
import { roundRuleRows } from './roundRules'
import { emptyRuleForm, isRuleForm, ruleFormDecision } from './roundRuleForms'
import LobbyRoundRules from './LobbyRoundRules'
import type { RuleActor, RuleForm } from './roundRuleForms'
import type { DeclarationCollection } from './actionDeclarations'
import type { RoundWork } from './roundWork'
import type { ActorTiming } from './roundTimeline'
import type { RoundExecutionPreview, RoundReceipt } from './roundExecution'
import type { EditedReplayOptions } from './roundReplay'
import { releaseSignature } from './roundReplay'

type Command = { previewId: string; generation: number; commandKey: string }
type Draft = { source: string; interactionsConfirmed: boolean; missing: Record<string, string>;
  continuations: { actorId: string; mode: '' | 'continue' | 'hold'; budget: string }[]; command: Command | null;
  movementConfirmed?: boolean; bodyHeights?: Record<string, string>; flightReasons?:Record<string,string>; rules?:RuleForm[]; charges?:ChargeForm[];
  speech?:SpeechDecision[]; inspections?:InspectionDecision[]; replayEnabled?:boolean; replayReceiptId?:string; replayChoices?:{key:string;value:string}[] }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const heightsValid = (v: unknown): v is Record<string, string> => record(v) && Object.keys(v).length <= 200 && Object.keys(v).every(k => /^[a-zA-Z0-9:_-]{1,160}$/.test(k)) && Object.values(v).every(x => typeof x === 'string' && x.length <= 40)
const valid = (v: unknown): v is Draft => record(v) && typeof v.source === 'string' && v.source.length <= 500000 && typeof v.interactionsConfirmed === 'boolean' &&
  record(v.missing) && Object.keys(v.missing).length <= 200 && Object.values(v.missing).every(x => typeof x === 'string' && x.length <= 2000) &&
  Array.isArray(v.continuations) && v.continuations.length <= 200 && v.continuations.every(c => record(c) && typeof c.actorId === 'string' && c.actorId.length <= 160 &&
    ['', 'continue', 'hold'].includes(String(c.mode)) && typeof c.budget === 'string' && c.budget.length <= 40) &&
  (v.movementConfirmed === undefined || typeof v.movementConfirmed === 'boolean') && (v.bodyHeights === undefined || heightsValid(v.bodyHeights)) &&
  (v.flightReasons === undefined || record(v.flightReasons) && Object.keys(v.flightReasons).length <= 200 && Object.keys(v.flightReasons).every(k => /^[a-zA-Z0-9:_-]{1,160}$/.test(k)) && Object.values(v.flightReasons).every(x => typeof x === 'string' && x.length <= 2000)) &&
  (v.charges===undefined||Array.isArray(v.charges)&&v.charges.length<=200&&v.charges.every(isChargeForm)) &&
  (v.inspections===undefined||Array.isArray(v.inspections)&&v.inspections.length<=200&&v.inspections.every(isInspectionDecision)) &&
  (v.speech===undefined||Array.isArray(v.speech)&&v.speech.length<=200&&v.speech.every(isSpeechDecision)) &&
  (v.rules===undefined||Array.isArray(v.rules)&&v.rules.length<=200&&v.rules.every(isRuleForm)) &&
  (v.replayEnabled===undefined||typeof v.replayEnabled==='boolean') && (v.replayReceiptId===undefined||typeof v.replayReceiptId==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(v.replayReceiptId)) &&
  (v.replayChoices===undefined||Array.isArray(v.replayChoices)&&v.replayChoices.length<=200&&v.replayChoices.every(c=>record(c)&&typeof c.key==='string'&&c.key.length<=400&&typeof c.value==='string'&&c.value.length<=420)) &&
  (v.command === null || record(v.command) && typeof v.command.previewId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(v.command.previewId) &&
    Number.isInteger(v.command.generation) && Number(v.command.generation) >= 1 && typeof v.command.commandKey === 'string' && /^[a-zA-Z0-9_-]{8,160}$/.test(v.command.commandKey))
const ms = (v: string) => { const n = Number(v.trim()); return v.trim() && Number.isSafeInteger(n) && n > 0 && n <= MAX_TIMING_MS ? n : 0 }
const height = (v: string) => { const n = Number(v.trim().replace(',', '.')); return Number.isFinite(n) && n > 1e-6 && n <= 1e6 ? n : 0 }
const coords = (p: {x:number;y:number;z:number}) => [p.x, p.y, p.z].map(n => n.toLocaleString('ru-RU', {maximumFractionDigits:6})).join('; ')

export default function LobbyRoundExecution({ accountId, lobbyId, collection, revision, checkingAccess, timings, timingReady, roundWork, executed, actors, objects, movementBodies }: {
  accountId: string; lobbyId: string; collection: DeclarationCollection; revision: number; checkingAccess: boolean;
  timings: ActorTiming[]; timingReady: boolean; roundWork: RoundWork; executed: boolean; actors: RuleActor[];
  objects: { sceneId: string; id: string; name: string }[]; movementBodies: {sceneId:string;actorId:string;diameter:number;x?:number;y?:number;z?:number}[]
}) {
  const { request, refresh } = useOnline(), key = lobbyFormKey('round-execution', accountId, lobbyId, collection.id)
  const heightsKey = lobbyFormKey('movement-bodies', accountId, lobbyId, collection.sceneId)
  const source = JSON.stringify([revision, collection.id, collection.epoch, timings]), current = useRef(source)
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = readLobbyForm(key, valid) ?? { source, interactionsConfirmed: false, missing: {}, continuations: [], command: null }
    return { ...saved, movementConfirmed: saved.movementConfirmed ?? false, bodyHeights: saved.bodyHeights ?? readLobbyForm(heightsKey, heightsValid) ?? {} }
  })
  const [preview, setPreview] = useState<{ source: string; value: RoundExecutionPreview } | null>(null), [receipt, setReceipt] = useState<RoundReceipt | null>(null)
  const [busy, setBusy] = useState<{ source: string; request: typeof request } | null>(null), [message, setMessage] = useState(''), [warning, setWarning] = useState('')
  const [replayOptions,setReplayOptions]=useState<{source:string;value:EditedReplayOptions}|null>(null),[replayError,setReplayError]=useState('')
  const [replayAttempt,setReplayAttempt]=useState(0)
  const active = useRef(false), pending = useRef<AbortController | null>(null), sequence = useRef(0), inFlight = useRef(false)
  useLayoutEffect(() => { current.current = source }, [source])
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => { ++sequence.current; pending.current?.abort(); inFlight.current = false }, [source, request])
  useEffect(()=>{
    const abort=new AbortController()
    if(!checkingAccess&&!executed)request<EditedReplayOptions>('/lobbies/'+lobbyId+'/rounds/replay/options',{signal:abort.signal})
      .then(value=>{if(active.current&&!abort.signal.aborted&&current.current===source){setReplayOptions({source,value});setReplayError('')}})
      .catch(e=>{if(active.current&&!abort.signal.aborted&&current.current===source){setReplayOptions(null);setReplayError((e as Error).message)}})
    return ()=>abort.abort()
  },[source,request,lobbyId,checkingAccess,executed,replayAttempt])
  const chargeRows=actors.flatMap(a=>(a.casts??[]).filter(c=>c.roundPreparation).map(c=>({actor:a,cast:c})))
  const chargeForm=(a:string,c:string):ChargeForm=>draft.charges?.find(f=>f.actorId===a&&f.castId===c)??{actorId:a,castId:c,mode:chargeRows.find(r=>r.actor.id===a&&r.cast.id===c)?.cast.chargePolicy?'':'keep',confirmed:false,reason:'',conditionsConfirmed:false,canSpeak:false}
  const charges=chargeRows.map(r=>chargeForm(r.actor.id,r.cast.id)).filter(f=>chargeRows.find(r=>r.actor.id===f.actorId&&r.cast.id===f.castId)?.cast.chargePolicy||f.mode==='interrupt')
  const chargesReady=charges.every(f=>isChargeDecision(f)&&f.confirmed)
  const interrupted=charges.filter(f=>f.mode==='interrupt').map(f=>f.castId)
  const removedIds=new Set<string>()
  for(const id of interrupted){const start=roundWork.entries.findIndex(e=>e.ability?.castId===id);if(start>=0){const actor=roundWork.entries[start].actorId;roundWork.entries.slice(start).filter(e=>e.actorId===actor).forEach(e=>removedIds.add(e.id))}}
  const effectiveWork={...roundWork,entries:roundWork.entries.filter(e=>!removedIds.has(e.id))}
  const workActors = [...new Set(effectiveWork.entries.map(e => e.actorId))], row = (actorId: string) => draft.continuations.find(c => c.actorId === actorId) ?? { actorId, mode: '' as const, budget: '' }
  const missing = collection.participantIds.filter(id => !collection.entries.some(e => e.actorId === id && e.status === 'submitted') && !(workActors.includes(id)&&row(id).mode==='continue'))
  const stale = draft.source !== source, disabled = checkingAccess || busy?.source === source && busy.request === request, name = (id: string) => actors.find(a => a.id === id)?.name ?? 'Герой'
  const reason = (id: string) => Object.hasOwn(draft.missing, id) && typeof draft.missing[id] === 'string' ? draft.missing[id] : ''
  const bodyHeight = (id: string) => draft.bodyHeights && Object.hasOwn(draft.bodyHeights, id) ? draft.bodyHeights[id] : ''
  const flightReason = (id:string) => draft.flightReasons && Object.hasOwn(draft.flightReasons,id) ? draft.flightReasons[id] : ''
  const bodyRows = movementBodies.filter(b => b.sceneId === collection.sceneId)
  const hasMovement = collection.entries.some(e => e.status === 'submitted' && e.actions.some(a => a.kind === 'move')) || effectiveWork.entries.some(e => e.action.kind === 'move' && row(e.actorId).mode === 'continue')
  const airActors = [...new Set([...collection.entries.filter(e=>e.status==='submitted'&&e.actions.some(a=>a.kind==='move'&&a.support==='air')).map(e=>e.actorId),
    ...effectiveWork.entries.filter(e=>e.action.kind==='move'&&e.action.support==='air'&&row(e.actorId).mode==='continue').map(e=>e.actorId)])]
  const movementReady = !hasMovement || draft.movementConfirmed && bodyRows.length > 0 && bodyRows.every(b => !!height(bodyHeight(b.actorId))) && airActors.every(id=>actors.find(a=>a.id===id)?.canFly || !!flightReason(id).trim())
  const ruleRows=roundRuleRows(collection,effectiveWork,workActors.filter(id=>row(id).mode==='continue'))
  const listeningEntries=listeningRows(collection,effectiveWork,workActors.filter(id=>row(id).mode==='continue'))
  const inspections=inspectionRows(collection,effectiveWork,workActors.filter(id=>row(id).mode==='continue')).map(r=>({row:r,decision:draft.inspections?.find(d=>d.key===r.key)??{key:r.key,text:'',confirmed:false,recordedAt:new Date().toISOString()}}))
  const inspectionsReady=inspections.every(r=>r.decision.confirmed&&!!r.decision.text.trim())
  const speechEntries=speechRows(collection,effectiveWork,workActors.filter(id=>row(id).mode==='continue'))
  const speech=speechEntries.map(r=>draft.speech?.find(d=>d.key===r.key)??emptySpeechDecision(r.key)),speechReady=speechEntries.every((r,i)=>speechDecisionReady(r,speech[i]))
  const releases=ruleRows.filter(r=>r.action.kind==='ability'&&r.action.stage==='release')
  const replayValue=!checkingAccess&&replayOptions?.source===source?replayOptions.value:null
  const replayLoaded=replayOptions?.source===source
  const replayChoice=(key:string)=>draft.replayReceiptId===replayValue?.receiptId?draft.replayChoices?.find(c=>c.key===key)?.value??'':''
  const preserved=releases.map(r=>replayChoice(r.key)).filter(v=>v.startsWith('preserve:'))
  const replayReady=!draft.replayEnabled||!!replayValue&&new Set(preserved).size===preserved.length&&releases.every(r=>replayChoice(r.key)==='new'||replayValue.actions.some(a=>replayChoice(r.key)==='preserve:'+a.key&&a.canPreserve&&a.actorId===r.actorId&&r.action.kind==='ability'&&a.abilityId===r.action.abilityId))
  const releaseLabel=(key:string)=>{const r=releases.find(r=>r.key===key);return r?name(r.actorId)+' · '+(key.startsWith('new:')?'действие '+(Number(key.slice(key.lastIndexOf(':')+1))+1):'прежняя очередь'):'Выпуск способности'}
  const signature=(r:typeof releases[number])=>{
    if(r.action.kind!=='ability')return ''
    const work=roundWork.entries.find(w=>w.id===r.key),target=r.action.target
    const targetId=target.kind==='self'?r.actorId:target.kind==='contact'?work?.targetActorId??collection.entries.find(e=>e.actorId===r.actorId)?.resolved.find(v=>v.index===Number(r.key.slice(r.key.lastIndexOf(':')+1)))?.actorId:null
    return releaseSignature(r.actorId,work?.sceneId??collection.sceneId,r.action.abilityId,targetId??target)
  }
  const ruleForm=(r:typeof ruleRows[number])=>draft.rules?.find(f=>f.key===r.key&&f.kind===r.action.kind&&!(r.action.kind==='item'&&r.action.operation&&f.operation!==r.action.operation))??emptyRuleForm(r,actors.find(a=>a.id===r.actorId)?.casts?.find(c=>c.id===roundWork.entries.find(w=>w.id===r.key)?.ability?.castId)?.binding)
  const rules=ruleRows.map(r=>ruleFormDecision(ruleForm(r))),rulesReady=rules.every((d,i)=>{const a=ruleRows[i].action;return d?.confirmed&&!(a.kind==='ability'&&a.stage==='release'&&d.kind==='ability'&&(!d.charge||'point' in a.target&&d.spatialConfirmed!==true))})
  const objectName = (sceneId: string, id: string) => objects.find(o => o.sceneId === sceneId && o.id === id)?.name ?? 'Прежний объект'
  function remember(next: Draft) { setDraft(next); const shared = writeLobbyForm(heightsKey, next.bodyHeights ?? {}), saved = writeLobbyForm(key, next); setWarning(saved && shared ? '' : 'Решения не сохранены на устройстве. Не закрывай страницу.'); return saved }
  function change(next: Draft) { ++sequence.current; pending.current?.abort(); setPreview(null); setMessage(''); remember(next) }
  async function calculate() {
    if (disabled || inFlight.current || stale || !timingReady || !movementReady || !rulesReady || !inspectionsReady || !speechReady || !chargesReady || !replayReady || !replayLoaded || draft.command || executed) return
    const abort = new AbortController(), attempt = ++sequence.current, origin = source
    pending.current = abort; inFlight.current = true; setBusy({ source, request }); setPreview(null); setMessage('')
    try {
      const value = await request<RoundExecutionPreview>('/lobbies/' + lobbyId + (draft.replayEnabled?'/rounds/replay/edited/calculate':'/rounds/calculate'), { method: 'POST', signal: abort.signal,
        body: JSON.stringify({ revision, collectionId: collection.id, epoch: collection.epoch,
          ...(draft.replayEnabled?{receiptId:replayValue!.receiptId,choices:releases.map(r=>replayChoice(r.key)==='new'?{key:r.key,mode:'new'}:{key:r.key,mode:'preserve',sourceKey:replayChoice(r.key).slice(9)})}:{}), input: { timings, interactionsConfirmed: draft.interactionsConfirmed,
          continuations: workActors.map(id => ({ actorId: id, mode: row(id).mode, budgetMs: ms(row(id).budget) })),
          missingDecisions: missing.map(id => ({ actorId: id, reason: reason(id) })),
          ...(inspections.length?{inspections:inspections.map(r=>r.decision)}:{}),...(ruleRows.length?{rules}:{}),...(speechEntries.length?{speech}:{}),...(charges.length?{charges}:{}),
          ...(hasMovement ? {movement:{confirmed:!!draft.movementConfirmed,bodies:bodyRows.map(b=>({actorId:b.actorId,heightM:height(bodyHeight(b.actorId)),...(flightReason(b.actorId).trim()?{flightReason:flightReason(b.actorId).trim()}:{})}))}} : {}) } }) })
      if (!active.current || abort.signal.aborted || attempt !== sequence.current || origin !== current.current) return
      if (value.revision !== revision || value.collectionId !== collection.id || value.epoch !== collection.epoch) { setMessage('Расчёт относится к другой версии. Обнови кампанию.'); return }
      setPreview({ source: origin, value }); setMessage('Последствия рассчитаны на сервере. Проверь их перед применением.')
    } catch (e) { if (active.current && !abort.signal.aborted && attempt === sequence.current) setMessage((e as Error).message) }
    finally { if (active.current && pending.current === abort) { setBusy(null); inFlight.current = false } }
  }
  async function apply() {
    if (disabled || inFlight.current || (!draft.command && (!preview || preview.source !== source || stale))) return
    const command = draft.command ?? { previewId: preview!.value.id, generation: preview!.value.generation, commandKey: crypto.randomUUID() }
    // Persist BEFORE sending. A lost response/remount must retry the same command.
    if (!remember({ ...draft, command })) { setMessage('Не удалось сохранить команду повтора. Освободи место в хранилище браузера перед применением.'); return }
    const abort = new AbortController(), attempt = ++sequence.current
    pending.current = abort; inFlight.current = true; setBusy({ source, request }); setMessage('')
    try {
      const result = await request<{ receipt: RoundReceipt; duplicate: boolean }>('/lobbies/' + lobbyId + '/rounds/apply', { method: 'POST', signal: abort.signal, body: JSON.stringify(command) })
      if (!active.current || abort.signal.aborted || attempt !== sequence.current) return
      remember({ ...draft, command: null }); setReceipt(result.receipt); setPreview(null)
      setMessage(result.duplicate ? 'Получено подтверждение прежней команды. Повторных последствий нет.' : 'Раунд применён. Исходное состояние сохранено для отката.'); refresh()
    } catch (e) { if (active.current && !abort.signal.aborted && attempt === sequence.current) {
      const rejected = e instanceof NetworkError && [400, 409, 413].includes(e.status)
      if (rejected) { remember({ ...draft, command: null }); setPreview(null) }
      setMessage((e as Error).message + (rejected ? ' Проверь кампанию перед новым расчётом.' : ' Команда сохранена для проверки повтором.'))
    } }
    finally { if (active.current && pending.current === abort) { setBusy(null); inFlight.current = false } }
  }
  const visible = !checkingAccess && !stale && preview?.source === source ? preview.value : null
  return <section className="w6-fieldset" aria-label="Исполнение раунда"><h3>Исполнение раунда</h3>
    <p className="w6-copy">Доступны движение по X/Y/Z, ожидание, открытие/закрытие объектов, снаряжение, артефакты и подготовка/выпуск способностей на себя или существо. Расчёт проверяет весь раунд до изменения кампании.</p>
    {executed && !checkingAccess && <p role="status">Этот сбор уже исполнен. Сохрани его в истории для следующего раунда.</p>}
    <fieldset disabled={disabled || !!draft.command || executed}><legend>Решения мастера</legend>
      <LobbyListeningPlans rows={listeningEntries} actors={actors} objects={objects.filter(o=>o.sceneId===collection.sceneId)}/>
      <LobbyRoundSpeech listening={listeningEntries} rows={speechEntries} form={speech} actors={actors} locations={movementBodies} sceneId={collection.sceneId} onChange={f=>change({...draft,speech:[...(draft.speech??[]).filter(d=>d.key!==f.key&&speechEntries.some(r=>r.key===d.key)),f]})}/>
      <LobbyRoundCharges actors={actors} form={chargeForm} onChange={f=>change({...draft,charges:[...(draft.charges??[]).filter(x=>x.actorId!==f.actorId||x.castId!==f.castId),f]})}/>
      {workActors.map(id => <div key={id}><h4>Прежняя работа · {name(id)}</h4>
        <p>Сохраняется очередь из {effectiveWork.entries.filter(e => e.actorId === id).length} действий. Продолжение идёт перед новым заявлением.</p>
        {effectiveWork.entries.filter(e => e.actorId === id).map(e => <p key={e.id}>{actionSummary(e.action)}{'target' in e.action && e.action.target.kind === 'object' ? ' · ' + objectName(e.sceneId, e.action.target.id) : ''} · остаток {e.amount.remaining.numerator}/{e.amount.remaining.denominator} {e.amount.unit === 'world-ms' ? 'мировых мс' : 'личных мс'}</p>)}
        <div className="w6-buttons"><button className="w6-button" aria-pressed={row(id).mode === 'continue'} onClick={() => change({ ...draft, continuations: [...draft.continuations.filter(c => c.actorId !== id), { ...row(id), mode: 'continue' }] })}>Продолжить работу {name(id)}</button>
          <button className="w6-button" aria-pressed={row(id).mode === 'hold'} onClick={() => change({ ...draft, continuations: [...draft.continuations.filter(c => c.actorId !== id), { ...row(id), mode: 'hold' }] })}>Сохранить без продвижения {name(id)}</button></div>
        <label className="w6-field"><span>Текущий бюджет, личные мс</span><input aria-label={'Бюджет продолжения ' + name(id)} inputMode="numeric" maxLength={40} value={row(id).budget} onChange={e => change({ ...draft, continuations: [...draft.continuations.filter(c => c.actorId !== id), { ...row(id), budget: e.currentTarget.value }] })}/></label>
      </div>)}
      {missing.map(id => <label className="w6-field" key={id}><span>{name(id)} без полученного действия: решение мастера</span><textarea aria-label={'Решение для ' + name(id)} maxLength={2000} value={reason(id)} onChange={e => change({ ...draft, missing: { ...draft.missing, [id]: e.currentTarget.value } })}/></label>)}
      {inspections.map(({row:r,decision:d})=><fieldset key={r.key}><legend>Осмотр · {name(r.actorId)}</legend><p>Только этот герой получит указанный результат после завершения действия. Скрытые свойства, награды и предметы сами не раскрываются.</p><label className="w6-field"><span>Результат осмотра</span><textarea aria-label={'Результат осмотра '+r.key} rows={3} maxLength={4000} value={d.text} onChange={e=>change({...draft,inspections:[...(draft.inspections??[]).filter(v=>v.key!==r.key),{...d,text:e.currentTarget.value,confirmed:false,recordedAt:new Date().toISOString()}]})}/></label><label><input type="checkbox" aria-label={'Подтвердить осмотр '+r.key} checked={d.confirmed} onChange={e=>change({...draft,inspections:[...(draft.inspections??[]).filter(v=>v.key!==r.key),{...d,confirmed:e.currentTarget.checked,recordedAt:new Date().toISOString()}]})}/> Проверены доступность цели и сведения, которые герой может получить</label></fieldset>)}
      <label className="w6-check"><input type="checkbox" checked={draft.interactionsConfirmed} onChange={e => change({ ...draft, interactionsConfirmed: e.currentTarget.checked })}/>Проверил расстояние, доступность и запирание объектов для взаимодействий</label>
      {hasMovement && <fieldset><legend>Движение и занимаемый объём</legend><p>Диаметр задан отметкой в сцене. Укажи высоту тела всех персонажей сцены для проверки пересечений. Эти значения сохраняются для этой сцены на устройстве. Тело считается вертикальным объёмом; специальные формы согласуются отдельно.</p>
        {!bodyRows.length && <p role="alert">Перед расчётом размести героев в сцене.</p>}
        {bodyRows.map(b=><label className="w6-field" key={b.actorId}><span>{name(b.actorId)} · диаметр {b.diameter} м · высота тела, м</span><input aria-label={'Высота тела '+name(b.actorId)+', м'} inputMode="decimal" maxLength={40} value={bodyHeight(b.actorId)} onChange={e=>change({...draft,movementConfirmed:false,bodyHeights:{...draft.bodyHeights,[b.actorId]:e.currentTarget.value}})}/></label>)}
        {airActors.map(id=><label className="w6-field" key={id}><span>{name(id)} · основание полёта {actors.find(a=>a.id===id)?.canFly?'(необязательно при работающих крыльях)':'без работающего лётного аппарата'}</span><textarea aria-label={'Основание полёта '+name(id)} maxLength={2000} value={flightReason(id)} onChange={e=>change({...draft,movementConfirmed:false,flightReasons:{...draft.flightReasons,[id]:e.currentTarget.value}})}/></label>)}
        <label className="w6-check"><input aria-label="Движение подтверждено мастером" type="checkbox" checked={!!draft.movementConfirmed} onChange={e=>change({...draft,movementConfirmed:e.currentTarget.checked})}/>Проверил возможность ходьбы/полёта, высоту тела и бюджет с учётом состояния героев</label>
        <p>Ходьба требует непрерывной опоры на одной высоте и возможности двигаться. Для полёта без работающих крыльев мастер указывает основание, проверяет его условия и расходы. Прыжки, падение и толкание пока требуют отдельного решения.</p>
      </fieldset>}
      <LobbyRoundRules rows={ruleRows} actors={actors} actorIds={bodyRows.map(b=>b.actorId)} form={ruleForm} onChange={f=>change({...draft,rules:[...(draft.rules??[]).filter(x=>x.key!==f.key&&ruleRows.some(r=>r.key===x.key)),f]})}/>
      {replayError&&!checkingAccess&&<><p role="alert">Не удалось проверить источник прежних бросков: {replayError}</p><button className="w6-button" onClick={()=>setReplayAttempt(n=>n+1)}>Повторить проверку переигровки</button></>}
      {(replayValue||draft.replayEnabled)&&<fieldset><legend>Переигровка изменённого раунда</legend>
        <p>Обычный расчёт использует новые броски. В переигровке сопоставь каждый выпуск с прежним или выбери новые броски. Расходы, условия и последствия рассчитываются заново.</p>
        <label className="w6-check"><input aria-label="Сопоставить прежние броски" type="checkbox" checked={!!draft.replayEnabled} onChange={e=>change({...draft,replayEnabled:e.currentTarget.checked,replayReceiptId:replayValue?.receiptId,replayChoices:[]})}/>Настроить броски переигровки</label>
        {draft.replayEnabled&&!replayValue&&<p role="alert">Источник ещё загружается или недоступен для этого сбора. {replayError}</p>}
        {draft.replayEnabled&&replayValue&&<>
          {!releases.length&&<p>В текущих заявлениях нет выпусков способностей с бросками.</p>}
          {releases.map(r=><label className="w6-field" key={r.key}><span>{releaseLabel(r.key)} · {actionSummary(r.action)}</span>
            <select aria-label={'Броски переигровки '+r.key} value={replayChoice(r.key)} onChange={e=>change({...draft,replayReceiptId:replayValue.receiptId,replayChoices:[...(draft.replayChoices??[]).filter(c=>c.key!==r.key),{key:r.key,value:e.currentTarget.value}]})}>
              <option value="">Выбери броски явно</option><option value="new">Новые броски</option>
              {replayValue.actions.filter(a=>a.canPreserve&&a.actorId===r.actorId&&r.action.kind==='ability'&&a.abilityId===r.action.abilityId).map(a=><option key={a.key} value={'preserve:'+a.key}>Прежние · {a.signature===signature(r)?'совпадают герой, способность и цель · ':''}{a.label}</option>)}
            </select></label>)}
          <p>Один прежний выпуск нельзя использовать дважды. Для новой цели нужны новые броски. Выпуск с сохранёнными бросками должен завершиться в этом раунде.</p>
        </>}
      </fieldset>}
      {stale && <><p role="alert">Время или кампания изменились. Сверь решения с текущим сбором.</p><button className="w6-button" onClick={() => change({ ...draft, source, replayChoices:[], interactionsConfirmed: false, movementConfirmed: false,charges:draft.charges?.map(f=>({...f,confirmed:false})),speech:draft.speech?.map(d=>({...d,confirmed:false})),rules:draft.rules?.map(f=>({...f,confirmed:false,spatialConfirmed:false})) })}>Решения мастера проверены</button></>}
      <button className="w6-button" disabled={stale || !timingReady || !movementReady || !rulesReady || !inspectionsReady || !speechReady || !chargesReady || !replayReady || !replayLoaded || workActors.some(id => !row(id).mode || !ms(row(id).budget)) || missing.some(id => !reason(id).trim())} onClick={() => void calculate()}>{replayValue&&!draft.replayEnabled?'Рассчитать с новыми бросками':'Рассчитать последствия раунда'}</button>
    </fieldset>
    {visible && <div aria-label="Расчёт последствий"><p>Мировое время: +{visible.summary.durationSeconds} с. Завершатся {visible.summary.events.length} действий; в очереди останется {visible.summary.carried.length}.</p>
      {visible.summary.replay&&<div aria-label="Выбранные броски переигровки">{visible.summary.replay.selections.map(s=><p key={s.key}>{releaseLabel(s.key)}: {s.mode==='new'?'новые броски':'прежние броски · '+(replayValue?.actions.find(a=>a.key===s.sourceKey)?.label??'выбранный прежний выпуск')}</p>)}</div>}
      {visible.summary.charges?.map(c=><p key={c.actorId+':'+c.castId}>{name(c.actorId)} · {c.name}: {c.mode==='interrupt'?'прерван перед раундом':'сохранён'}. {c.reason} Возврат: Мана {c.refunded.mana}, Тень {c.refunded.shadow}, Выносливость {c.refunded.stamina}. Снято действий: {c.removedWorkIds.length}.</p>)}
      {visible.summary.events.map(e => <p key={e.workId+':'+e.kind}>{name(e.actorId)} · {{inspect:'осмотр',speak:'реплика',wait:'ожидание',move:'перемещение',open:'открытие объекта',close:'закрытие объекта',item:'предмет',prepare:'начало подготовки',ready:'готовый заряд',release:'выпуск'}[e.kind]}{e.listening?' · '+({listen:'прислушивание',eavesdrop:'подслушивание'}[e.listening]):''}{e.objectId ? ' · ' + objectName(collection.sceneId, e.objectId) : ''} · {e.atMs.numerator}/{e.atMs.denominator} мс</p>)}
      {!!visible.summary.rules?.length&&<div aria-label="Последствия предметов и способностей">{visible.summary.rules.map(r=><article key={r.key+':'+r.kind}><p>{r.text}</p><pre className="w6-copy">{r.details}</pre>{r.targets&&<div aria-label="Цели пространственного выпуска"><p>Получателей: {r.targets.length}</p>{r.targets.map(t=><details key={t.actorId}><summary>{t.name}</summary><pre className="w6-copy">{t.details}</pre></details>)}</div>}</article>)}</div>}
      {!!visible.summary.listeningWindows?.length&&<section aria-label="Время внимания слушателей"><h4>Заявленное внимание</h4>{visible.summary.listeningWindows.map(r=><p key={r.key}>{name(r.actorId)} · {listeningPlanLabel(r)} · {listeningFocusLabel(r,objects.filter(o=>o.sceneId===r.sceneId))} · с {Number(r.fromMs.numerator)/Number(r.fromMs.denominator)/1000} до {Number(r.toMs.numerator)/Number(r.toMs.denominator)/1000} с раунда · {r.completes?'ожидание завершится':'продолжится в следующем раунде'}</p>)}<p className="w6-copy">Это время заявленного действия, не автоматический результат слышимости или скрытности. Пограничные и одновременные события оценивает мастер.</p></section>}
      {!!visible.summary.speech?.length&&<div aria-label="Расчёт слышимости">{visible.summary.speech.map(s=><article key={s.key}><h4>{name(s.actorId)} · реплика</h4><p className="w6-prose">{s.text}</p><p>Других слушателей: {s.heard.length}</p>{s.heard.map(h=><div key={h.actorId}><strong>{name(h.actorId)} · обозначение говорящего: {h.speaker}</strong><p className="w6-prose">{h.text}</p></div>)}</article>)}</div>}
      {!!visible.summary.movements?.length && <div aria-label="Позиции после движения">{visible.summary.movements.map(m=><p key={m.workId}>{name(m.actorId)} · ({coords(m.from)}) → ({coords(m.to)}) м · {m.support.kind==='air'?'в воздухе':m.support.kind==='ground'?'на земле':'на объекте '+objectName(collection.sceneId,m.support.objectId)} · {m.completed?'маршрут завершён':'маршрут продолжается'}</p>)}</div>}
      {visible.summary.movementApprovals?.map(a=><p key={a.actorId}>{name(a.actorId)} · основание полёта: {a.reason}</p>)}
      {visible.summary.carried.map(e => <p key={e.id}>{name(e.actorId)} · остаток {e.remaining.numerator}/{e.remaining.denominator} {e.unit === 'world-ms' ? 'мировых мс' : 'личных мс'}</p>)}
      {visible.summary.warnings.map(w => <p key={w}>{w}</p>)}
      {!draft.command && <button className="w6-button" disabled={disabled} onClick={() => void apply()}>Применить рассчитанный раунд</button>}
    </div>}
    {draft.command && !checkingAccess && <><p role="alert">Результат команды ещё не подтверждён. Повтор проверит её результат без повторного исполнения.</p><button className="w6-button" disabled={disabled} onClick={() => void apply()}>Проверить результат команды</button></>}
    {receipt && !checkingAccess && <p>Подтверждение: {receipt.id} · версия {receipt.revision}. Текущая кампания могла измениться позже.</p>}
    {warning && <p role="alert">{warning}</p>}<p role="status">{checkingAccess ? '' : message}</p>
  </section>
}
