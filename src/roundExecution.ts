import { inspectionRows, inspectionDecisions, finishInspection } from './roundInspection'
import type { InspectionDecision } from './roundInspection'
import type { ListeningWindow } from './roundListening'
import { finishRoundSpeech, speechRows, speechDecisionsFor } from './roundSpeech'
import type { SpeechDecision, SpeechOutcome } from './roundSpeech'
import { manageRoundCharges } from './roundCharges'
import type { ChargeDecision, ChargeOutcome } from './roundCharges'
import { copyDeclaredAction } from './actionDeclarations'
import { addAmounts, amountFromNumber, compareAmounts, exactAmount, scaleAmount, subtractAmounts } from './exactWork'
import { advanceWorld } from './rpgEngine'
import { bodyConsequences } from './characterBody'
import { evaluatedParameters } from './rpgParameters'
import { copyRoundWorkEntry, isRoundWork, projectWorkProgress, remainingWorldTime } from './roundWork'
import { previewRoundTimeline, MAX_TIMING_MS } from './roundTimeline'
import { advanceMovement, checkClosingDoor, movementPosition, prepareMovement, supportAt, MAX_MOVEMENT_CHECKS, MAX_MOVEMENT_SEGMENTS } from './sceneMovement'
import { beginRoundAbility, decisionsFor, finishRoundRule, newRuleKey, roundRuleRows } from './roundRules'
import type { RuleDecision, RuleOutcome } from './roundRules'
import type { DeclarationCollection } from './actionDeclarations'
import type { ExactAmount } from './exactWork'
import type { World } from './rpgEngine'
import type { RoundWorkEntry } from './roundWork'
import type { ActorTiming } from './roundTimeline'
import type { MovementBody, MovementChange, MovementPlan } from './sceneMovement'
import { isRoundReplay } from './roundReplay'
import type { RoundReplay } from './roundReplay'
export const ROUND_EXECUTOR_VERSION = 'r09-inspection-v1'
export const compatibleRoundExecutor = (version: string) => [ROUND_EXECUTOR_VERSION, 'r08-listening-v1', 'r08-round-speech-v1', 'r04-round-history-v8', 'r04-round-history-v7'].includes(version)

export type ContinuationChoice = { actorId: string; mode: 'continue' | 'hold'; budgetMs: number }
export type RoundExecutionInput = { timings: ActorTiming[]; continuations: ContinuationChoice[];
  missingDecisions: { actorId: string; reason: string }[]; interactionsConfirmed: boolean;
  movement?: { confirmed: boolean; bodies: MovementBody[] }; rules?: RuleDecision[]; charges?: ChargeDecision[]; replay?: RoundReplay; speech?: SpeechDecision[]; inspections?: InspectionDecision[] }
export type RoundExecutionEvent = { actorId: string; actionIndex: number; workId: string; atMs: ExactAmount;
  kind: 'inspect' | 'speak' | 'wait' | 'open' | 'close' | 'move' | 'item' | 'prepare' | 'ready' | 'release'; objectId?: string; castId?:string; listening?:'listen'|'eavesdrop' }
export type RoundExecutionSummary = { listeningWindows?:ListeningWindow[]; speech?: (SpeechOutcome & {atMs:ExactAmount})[]; durationSeconds: number; events: RoundExecutionEvent[];
  carried: { id: string; actorId: string; actionKind: string; remaining: ExactAmount; unit: string }[];
  charges?: ChargeOutcome[]; replay?: { sourceReceiptId: string; selections: {key:string;mode:'new'|'preserve';sourceKey?:string}[] }; missingDecisions: RoundExecutionInput['missingDecisions']; warnings: string[]; movements?: MovementChange[];
  movementApprovals?: {actorId:string;reason:string}[]; rules?: (RuleOutcome & {atMs:ExactAmount})[] }
export type RoundExecutionPreview = { id: string; revision: number; generation: number; collectionId: string; epoch: number; summary: RoundExecutionSummary }
export type RoundReceipt = { id: string; previewId: string; collectionId: string; revision: number; generation: number; appliedAt: string; summary: RoundExecutionSummary }
const zero = exactAmount(0n), thousand = exactAmount(1000n)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const numberOf = (v: ExactAmount) => Number(v.numerator) / Number(v.denominator)

// Only supported actions enter this executor. A master confirms interaction
// access; no distance, lock, inventory or ability rule is invented here.
function supported(work: RoundWorkEntry, world: World, confirmed: boolean) {
  const a = work.action
  if (a.kind === 'wait' || a.kind === 'move' || a.kind === 'ability' || a.kind === 'speak') return
  if(a.kind==='interact'&&a.operation==='inspect') {if(!confirmed)throw Error('Подтверди возможность осмотра.');return}
  if (a.kind === 'item') {
    if(a.quantity!==1||!['self','contact'].includes(a.target.kind))throw Error('Предмет: поддержана одна доза расходника на себя/раскрытое существо или один собственный экземпляр снаряжения/артефакта.')
    return
  }
  if (a.kind !== 'interact' || !['open', 'close'].includes(a.operation) || a.target.kind !== 'object') {
    throw Error('Эта категория пока не исполняется. Верни действие на согласование.')
  }
  if (!confirmed) throw Error('Мастер должен проверить доступность объектов и подтвердить взаимодействия.')
  const objectId = a.target.id
  const object = world.campaign.scenes?.scenes.find(s => s.id === work.sceneId)?.objects.find(o => o.id === objectId)
  if (!object || !['door', 'crate'].includes(object.kind)) throw Error('Цель исчезла или не является дверью/контейнером. Решение требуется до исполнения.')
}

export function calculateRound(world: World, collection: DeclarationCollection, value: unknown, seed: string): { world: World; summary: RoundExecutionSummary } {
  if (!record(value) || !Array.isArray(value.continuations) || value.continuations.length > 200 || !Array.isArray(value.missingDecisions) ||
      value.missingDecisions.length > 200 || typeof value.interactionsConfirmed !== 'boolean' || !/^[a-zA-Z0-9_-]{1,60}$/.test(seed)) throw Error('Проверь решения и параметры расчёта.')
  previewRoundTimeline(collection, value.timings) // validates versions and all action costs
  const input = value as unknown as RoundExecutionInput, duration = scaleAmount(amountFromNumber(collection.durationSeconds), thousand)
  if (input.replay !== undefined && !isRoundReplay(input.replay)) throw Error('Некорректные сохранённые броски переигровки.')
  const managed=manageRoundCharges(world,input.charges,seed)
  const old = managed.world.campaign.roundWork ?? { version: 1, entries: [] }
  if (!isRoundWork(old)) throw Error('Некорректная переносимая работа.')
  const workActors = [...new Set(old.entries.map(e => e.actorId))]
  if (input.continuations.length !== workActors.length || new Set(input.continuations.map(c => c.actorId)).size !== workActors.length ||
      !input.continuations.every(c => record(c) && workActors.includes(c.actorId) && ['continue', 'hold'].includes(c.mode) &&
        Number.isSafeInteger(c.budgetMs) && c.budgetMs >= 1 && c.budgetMs <= MAX_TIMING_MS)) throw Error('Для каждой прежней работы выбери продолжение или сохранение без продвижения и бюджет.')
  const entries = collection.entries.filter(e => e.status === 'submitted')
  const ruleRows=roundRuleRows(collection,old,input.continuations.filter(c=>c.mode==='continue').map(c=>c.actorId))
  const ruleDecisions=decisionsFor(ruleRows,input.rules)
  const releases=ruleRows.filter(r=>r.action.kind==='ability'&&r.action.stage==='release')
  if(input.replay && (input.replay.selections.length!==releases.length || input.replay.selections.some(s=>!releases.some(r=>r.key===s.key)))) throw Error('Для каждого выпуска выбери прежние либо новые броски.')
  const inspectionChoices=inspectionDecisions(inspectionRows(collection,old,input.continuations.filter(c=>c.mode==='continue').map(c=>c.actorId)),input.inspections)
  const speechDecisions=speechDecisionsFor(speechRows(collection,old,input.continuations.filter(c=>c.mode==='continue').map(c=>c.actorId)),input.speech)
  const works=new Map<string,RoundWorkEntry>(),workKeys=new Map<string,string>()
  const held: RoundWorkEntry[] = [], queues = new Map<string, RoundWorkEntry[]>(), budgets = new Map<string, number>()
  for (const choice of input.continuations) {
    const previous = old.entries.filter(e => e.actorId === choice.actorId)
    if (choice.mode === 'hold') {
      if (entries.some(e => e.actorId === choice.actorId)) throw Error('У героя есть сохранённая работа. Продолжи её перед новыми действиями либо верни новое заявление.')
      held.push(...previous.map(copyRoundWorkEntry)); continue
    }
    if (!collection.participantIds.includes(choice.actorId) || previous.some(e => e.sceneId !== collection.sceneId)) throw Error('Продолжение работы требует участия героя в прежней сцене.')
    previous.forEach(e => supported(e, world, input.interactionsConfirmed))
    const copied=previous.map(copyRoundWorkEntry)
    copied.forEach(w=>{works.set(w.id,w);workKeys.set(w.id,w.id)})
    queues.set(choice.actorId, copied); budgets.set(choice.actorId, choice.budgetMs)
  }
  for (const [actorIndex, entry] of entries.entries()) {
    const timing = input.timings.find(t => t.actorId === entry.actorId)!
    if (budgets.has(entry.actorId) && budgets.get(entry.actorId) !== timing.budgetMs) throw Error('Для продолжения и нового заявления нужен один бюджет героя.')
    budgets.set(entry.actorId, timing.budgetMs)
    const queue = queues.get(entry.actorId) ?? []
    entry.actions.forEach((a, actionIndex) => {
      const action = copyDeclaredAction(a), resolved = entry.resolved.find(r => r.index === actionIndex)
      if (action.kind === 'interact' && action.target.kind === 'object') {
        if (resolved?.objectId !== action.target.id) throw Error('Объект заявления не подтверждён сервером. Верни заявление для выбора цели.')
      }
      const total = action.kind === 'wait' ? scaleAmount(amountFromNumber(action.seconds), thousand) : exactAmount(BigInt(timing.costs.find(c => c.index === actionIndex)!.personalMs))
      const work: RoundWorkEntry = { id: 'work:' + seed + ':' + actorIndex + ':' + actionIndex, actorId: entry.actorId, sceneId: collection.sceneId,
        origin: { collectionId: collection.id, epoch: collection.epoch, entryRevision: entry.revision, actionIndex }, action,
        amount: { unit: action.kind === 'wait' ? 'world-ms' : 'personal-ms', total, remaining: total },
        ...((action.kind==='ability'||action.kind==='item')&&action.target.kind==='contact'&&resolved?.actorId?{targetActorId:resolved.actorId}:{}) }
      supported(work, world, input.interactionsConfirmed); queue.push(work)
      const key=newRuleKey(entry.actorId,actionIndex);works.set(key,work);workKeys.set(work.id,key)
    })
    queues.set(entry.actorId, queue)
  }
  const missing = collection.participantIds.filter(id => !queues.has(id))
  if (input.missingDecisions.length !== missing.length || new Set(input.missingDecisions.map(c => c.actorId)).size !== missing.length ||
      !input.missingDecisions.every(c => record(c) && missing.includes(c.actorId) && typeof c.reason === 'string' && !!c.reason.trim() && c.reason.length <= 2000)) {
    throw Error('Для участников без действия мастер должен явно указать причину продолжения раунда без их действия. Таймаут не назначен.')
  }
  const hasMovement = [...queues.values()].some(q => q.some(w => w.action.kind === 'move'))
  const scene = world.campaign.scenes?.scenes.find(s => s.id === collection.sceneId)
  const bodies: MovementBody[] = input.movement?.bodies ?? []
  if (hasMovement && (!scene || !record(input.movement) || input.movement.confirmed !== true || !Array.isArray(bodies) || bodies.length !== scene.tokens.length || bodies.length > 200 ||
      !bodies.every(b => record(b) && scene.tokens.some(t => t.actorId === b.actorId) && typeof b.heightM === 'number' && Number.isFinite(b.heightM) && b.heightM > 1e-6 && b.heightM <= 1e6 &&
        (b.flightReason === undefined || typeof b.flightReason === 'string' && b.flightReason.length <= 2000)) ||
      new Set(bodies.map(b => b.actorId)).size !== bodies.length)) throw Error('Мастер должен подтвердить возможность ходьбы/полёта и задать высоту тела каждой отметки сцены для проверки столкновений.')
  const finished: { work: RoundWorkEntry; at: ExactAmount }[] = [], starts: {work:RoundWorkEntry;at:ExactAmount}[] = [], carried = [...held], movements: MovementPlan[] = []
  const listeningWindows:ListeningWindow[]=[]
  const planningScene = scene ? structuredClone(scene) : undefined
  let segmentCount = 0
  for (const [actorId, queue] of queues) {
    const actor = world.characters.find(a => a.id === actorId)
    if (!actor || actor.rpg.dead || actor.body.consciousness !== 'awake') throw Error('Действующий герой должен быть жив и в сознании. Решение требуется до расчёта.')
    let cursor = zero
    for (const work of queue) {
      const cost = remainingWorldTime(work, budgets.get(actorId)!, duration), end = addAmounts(cursor, cost)
      if(work.action.kind==='wait'&&work.action.listening&&compareAmounts(cursor,duration)<0) {
        const a=copyDeclaredAction(work.action) as Extract<typeof work.action,{kind:'wait'}>
        listeningWindows.push({key:workKeys.get(work.id)!,actorId,sceneId:work.sceneId,...a.listening!,fromMs:cursor,toMs:compareAmounts(end,duration)<=0?end:duration,completes:compareAmounts(end,duration)<=0})
      }
      if(work.action.kind==='ability') {
        const decision=ruleDecisions.get(workKeys.get(work.id)!)!
        if(decision.kind!=='ability')throw Error('Некорректные параметры способности.')
        if((work.action.stage==='release'||decision.binding==='bound')&&!['self','contact'].includes(work.action.target.kind)&&!(work.action.stage==='release'&&'point' in work.action.target&&decision.spatialConfirmed===true))throw Error('Для выпуска нужны собственная/раскрытая цель или подтверждённая пространственная цель; подготовка пространства только без привязки.')
        if(work.action.stage==='prepare'&&compareAmounts(cursor,duration)<0)starts.push({work,at:cursor})
      }
      if(work.action.kind==='item') {
        const decision=ruleDecisions.get(workKeys.get(work.id)!)!
        if(decision.kind!=='item'||work.action.operation&&work.action.operation!==decision.operation)throw Error('Операция мастера должна совпадать с заявленным использованием предмета.')
      }
      if (work.action.kind === 'move' && (compareAmounts(cursor, duration) < 0 || compareAmounts(end, duration) <= 0)) {
        const token = planningScene?.tokens.find(t => t.actorId === actorId), plan = prepareMovement(work, token, planningScene, cursor, end)
        segmentCount += plan.lengths.length
        if (segmentCount > MAX_MOVEMENT_SEGMENTS) throw Error('Маршрут слишком сложен для одного расчёта. Технический предел: 4000 отрезков.')
        movements.push(plan)
        if (token && compareAmounts(end, duration) <= 0) {
          Object.assign(token, movementPosition(plan, end))
          token.support = work.action.support === 'air' ? { kind: 'air' } : supportAt(planningScene!, token)
        }
      }
      if (compareAmounts(end, duration) <= 0) finished.push({ work, at: end })
      else if (compareAmounts(cursor, duration) < 0) carried.push(projectWorkProgress(work, subtractAmounts(duration, cursor), budgets.get(actorId)!, duration))
      else carried.push(copyRoundWorkEntry(work))
      cursor = end
    }
  }
  if (!isRoundWork({ version: 1, entries: carried })) throw Error('Объём или точность очереди превышает технический предел. Ничего не применено.')
  finished.sort((a, b) => compareAmounts(a.at, b.at))
  const ticks=[...finished.map(t=>({...t,stage:'finish' as const})),...starts.map(t=>({...t,stage:'start' as const}))].sort((a,b)=>compareAmounts(a.at,b.at)||(a.stage==='finish'?-1:1)-(b.stage==='finish'?-1:1))
  const affected=(t:typeof ticks[number])=>[t.work.actorId,...(t.stage==='finish'&&t.work.action.kind==='speak'?speechDecisions.get(workKeys.get(t.work.id)!)!.hearers.map(h=>h.actorId):[]),...(t.stage==='finish'&&(t.work.action.kind==='item'||t.work.action.kind==='ability'&&t.work.action.stage==='release')&&t.work.targetActorId?[t.work.targetActorId]:[])]
  for(let i=0;i<ticks.length;i++)for(let j=i+1;j<ticks.length&&compareAmounts(ticks[i].at,ticks[j].at)===0;j++) {
    const a=ticks[i],b=ticks[j]
    if(a.work.actorId!==b.work.actorId&&a.work.sceneId===b.work.sceneId&&[a,b].some(t=>t.stage==='finish'&&t.work.action.kind==='ability'&&t.work.action.stage==='release'&&'point' in t.work.action.target))throw Error('Одновременный пространственный выпуск и другое действие в этой сцене требуют решения мастера о порядке.')
    if(a.work.actorId!==b.work.actorId&&[a,b].some(t=>t.work.action.kind==='item'||t.work.action.kind==='ability')&&affected(a).some(id=>affected(b).includes(id)))throw Error('Одновременные предметы/способности затрагивают одного героя. Мастер должен согласовать порядок; случайный порядок не назначен.')
  }
  for (let i = 0; i < finished.length; i++) {
    const a = finished[i]
    if (a.work.action.kind !== 'interact') continue
    const target = a.work.action.target
    if (target.kind !== 'object') continue
    if (finished.slice(i + 1).some(b => compareAmounts(a.at, b.at) === 0 && b.work.sceneId === a.work.sceneId &&
        b.work.action.kind === 'interact' && b.work.action.target.kind === 'object' && b.work.action.target.id === target.id)) {
      throw Error('Одновременные взаимодействия с одним объектом требуют решения мастера. Измени или верни заявления до расчёта.')
    }
  }
  let candidate = managed.world, cursor = zero, segment = 0, movementChecks = 0
  const movementApprovals = new Map<string,string>()
  function checkCapabilities(plans: MovementPlan[]) {
    for (const plan of plans) {
      const actor = candidate.characters.find(a => a.id === plan.work.actorId)!, consequence = bodyConsequences(actor.body)
      if (actor.rpg.dead || actor.body.consciousness !== 'awake') throw Error('Герой потерял возможность двигаться. Мастер должен пересмотреть раунд.')
      if (plan.work.action.kind !== 'move') continue
      if (plan.work.action.support === 'ground') {
        const speed = evaluatedParameters(actor,candidate.campaign.seconds).movement
        if (consequence.movementFactor <= 0 || speed !== '' && Number(speed) <= 0) throw Error('Состояние тела или скорость не позволяют ходьбу. Мастер должен пересмотреть движение.')
      } else if (!consequence.canFly) {
        const reason = bodies.find(b => b.actorId === actor.id)?.flightReason?.trim()
        if (!reason) throw Error('Нет работающего лётного аппарата. Для магического или другого полёта требуется явное основание мастера.')
        movementApprovals.set(actor.id,reason)
      }
    }
  }
  const movementCheck = () => { if (++movementChecks > MAX_MOVEMENT_CHECKS) throw Error('Сцена слишком сложна для одного расчёта движения. Технический предел проверок; ничего не применено.') }
  const advance = (at: ExactAmount) => {
    const move = () => { if (movements.length) advanceMovement(candidate.campaign.scenes!.scenes.find(s => s.id === collection.sceneId)!, movements, bodies, cursor, at, movementCheck) }
    if (compareAmounts(cursor, at) === 0) { move(); return }
    const activeMovements = movements.filter(p => compareAmounts(p.startMs,at) < 0 && compareAmounts(p.endMs,cursor) > 0)
    checkCapabilities(activeMovements)
    const seconds = numberOf(subtractAmounts(at, cursor)) / 1000, previous = candidate.campaign.seconds
    // The legacy physiology engine uses a numeric clock and microsecond steps.
    // Exact ordering/work is preserved; unrepresentable intervals block atomically.
    if (seconds < 0.000001 || previous + seconds <= previous || Math.abs((previous + seconds - previous) - seconds) > Math.max(1e-9, seconds * 1e-10)) {
      throw Error('Интервал слишком мал для текущих игровых часов. Требуется решение мастера; время не округлено для исполнения.')
    }
    move()
    candidate = advanceWorld(candidate, seconds, 'round-' + seed + '-' + (++segment))
    checkCapabilities(activeMovements)
    cursor = at
  }
  const events: RoundExecutionEvent[] = []
  const ruleOutcomes:(RuleOutcome&{atMs:ExactAmount})[]=[]
  const speechOutcomes:(SpeechOutcome&{atMs:ExactAmount})[]=[]
  for (const { work, at, stage } of ticks) {
    advance(at)
    const a = work.action
    if(a.kind==='item'||a.kind==='ability') {
      const key=workKeys.get(work.id)!,decision=ruleDecisions.get(key)!
      const replay=input.replay?.selections.find(s=>s.key===key)
      const result=stage==='start'?beginRoundAbility(candidate,work,key,decision):finishRoundRule(candidate,work,key,decision,works,replay,replay?seed+':'+key:undefined)
      candidate=result.world;ruleOutcomes.push({...result.outcome,atMs:at})
      events.push({actorId:work.actorId,actionIndex:work.origin.actionIndex,workId:work.id,atMs:at,kind:result.outcome.kind,...(result.outcome.castId?{castId:result.outcome.castId}:{})})
      continue
    }
    if(a.kind==='speak') {
      const key=workKeys.get(work.id)!,result=finishRoundSpeech(candidate,work,key,speechDecisions.get(key)!)
      candidate=result.world;speechOutcomes.push({...result.outcome,atMs:at})
      events.push({actorId:work.actorId,actionIndex:work.origin.actionIndex,workId:work.id,atMs:at,kind:'speak'})
    }
    else if(a.kind==='interact'&&a.operation==='inspect'){candidate=finishInspection(candidate,work,inspectionChoices.get(workKeys.get(work.id)!)!);events.push({actorId:work.actorId,actionIndex:work.origin.actionIndex,workId:work.id,atMs:at,kind:'inspect'})}
    else if (a.kind === 'wait') events.push({ actorId: work.actorId, actionIndex: work.origin.actionIndex, workId: work.id, atMs: at, kind: 'wait',...(a.listening?{listening:a.listening.mode}:{}) })
    else if (a.kind === 'move') events.push({ actorId: work.actorId, actionIndex: work.origin.actionIndex, workId: work.id, atMs: at, kind: 'move' })
    else if (a.kind === 'interact' && a.target.kind === 'object') {
      const actor = candidate.characters.find(c => c.id === work.actorId)!
      if (actor.rpg.dead || actor.body.consciousness !== 'awake') throw Error('Герой потерял возможность выполнить взаимодействие. Мастер должен пересмотреть раунд.')
      const objectId = a.target.id
      const object = candidate.campaign.scenes!.scenes.find(s => s.id === work.sceneId)!.objects.find(o => o.id === objectId)!
      if (a.operation === 'close' && hasMovement) checkClosingDoor(candidate.campaign.scenes!.scenes.find(s => s.id === work.sceneId)!, objectId, bodies, movementCheck)
      object.open = a.operation === 'open'
      events.push({ actorId: work.actorId, actionIndex: work.origin.actionIndex, workId: work.id, atMs: at, kind: a.operation as 'open' | 'close', objectId: object.id })
    }
  }
  advance(duration)
  if (carried.some(work => queues.has(work.actorId) && (()=>{const a=candidate.characters.find(c=>c.id===work.actorId)!;return a.rpg.dead||a.body.consciousness!=='awake'})())) {
    throw Error('В раунде герой потерял возможность действовать. Мастер должен пересмотреть действия и перенос работы.')
  }
  for(const work of carried) {
    const source=[...works.values()].find(w=>w.id===work.id)
    if(source?.ability)work.ability={...source.ability}
  }
  candidate.campaign.roundWork = { version: 1, entries: carried }
  if(!isRoundWork(candidate.campaign.roundWork))throw Error('Некорректная очередь после исполнения способностей.')
  candidate.campaign.revision = world.campaign.revision + 1
  const changes: MovementChange[] = movements.map(m => {
    const atMs = compareAmounts(m.endMs, duration) <= 0 ? m.endMs : duration, to = movementPosition(m, atMs)
    return { workId: m.work.id, actorId: m.work.actorId, from: movementPosition(m, m.startMs), to, atMs,
      support: m.work.action.kind === 'move' && m.work.action.support === 'air' ? { kind: 'air' } : supportAt(scene!, to), completed: compareAmounts(m.endMs, duration) <= 0 }
  })
  if(input.replay?.selections.some(s=>s.mode==='preserve'&&!ruleOutcomes.some(r=>r.key===s.key&&r.kind==='release'))) throw Error('Выпуск с прежними бросками должен завершиться в этом раунде. Для переноса выбери новые броски.')
  return { world: candidate, summary: { durationSeconds: collection.durationSeconds, events,
    ...(listeningWindows.length?{listeningWindows}:{}),
    ...(speechOutcomes.length?{speech:speechOutcomes}:{}),
    ...(input.replay?{replay:{sourceReceiptId:input.replay.sourceReceiptId,selections:input.replay.selections.map(({key,mode,sourceKey})=>({key,mode,...(sourceKey?{sourceKey}:{})}))}}:{}),
    ...(managed.outcomes.length?{charges:managed.outcomes}:{}), carried: carried.map(e => ({ id: e.id, actorId: e.actorId, actionKind: e.action.kind, remaining: e.amount.remaining, unit: e.amount.unit })),
    ...(changes.length ? { movements: changes } : {}), ...(movementApprovals.size ? {movementApprovals:[...movementApprovals].map(([actorId,reason])=>({actorId,reason}))} : {}), ...(ruleOutcomes.length?{rules:ruleOutcomes}:{}), missingDecisions: structuredClone(input.missingDecisions),
    warnings: [...(speechDecisions.size?['Слышимость, преграды и разборчивость подтвердил мастер. Фиксированные радиусы и автоматическое подслушивание не вводились; каждый герой получает только свою запись.']:[]), 'Доступность, расстояние и запирание объектов проверяет мастер. Правила взаимодействия ещё расширяются.',
      ...(hasMovement ? ['Высоту тела и бюджет подтверждает мастер. Полёт без работающих крыльев требует основания мастера; его условия и ресурсные расходы проверяются отдельно. Столкновения проверены для прямых отрезков и вертикальных объёмов; прыжки, падение и толкание ещё не рассчитываются.'] : []),
      ...(ruleDecisions.size?['Подготовка оплачивается один раз в начале по прежним правилам. Точную личную стоимость, привязку и условия удержания подтверждает мастер. Предметы: снаряжение и активация одного собственного артефакта; расходники, точки/области/направления и новые правила прерывания ещё не подключены.']:[])] } }
}
