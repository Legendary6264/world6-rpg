import type { DeclarationCollection } from './actionDeclarations'

export const MAX_TIMING_MS = 1_000_000_000_000
export type ActorTiming = { actorId: string; entryRevision: number; budgetMs: number; costs: { index: number; personalMs: number }[] }
export type ExactTime = { numerator: string; denominator: string }
export type TimelineAction = { actorId: string; index: number; startMs: number; endMs: number; exactEnd: ExactTime;
  status: 'finishes' | 'continues' | 'queued'; personalCostMs: number; remainingPersonalMs: number; progressPercent: number }
export type RoundTimeline = { collectionId: string; epoch: number; durationMs: number;
  missingActorIds: string[]; actors: { actorId: string; budgetMs: number; actions: TimelineAction[] }[];
  groups: { atMs: number; exactTime: ExactTime; actions: { actorId: string; index: number }[] }[] }
type Fraction = { n: bigint; d: bigint }
const zero: Fraction = { n: 0n, d: 1n }
function fraction(n: bigint, d = 1n): Fraction {
  let a = n < 0n ? -n : n, b = d
  while (b) { const remainder = a % b; a = b; b = remainder }
  return { n: n / (a || 1n), d: d / (a || 1n) }
}
function decimal(value: number): Fraction {
  const [mantissa, exponent = '0'] = value.toString().split('e')
  const [whole, digits = ''] = mantissa.split('.'), scale = digits.length - Number(exponent)
  return scale >= 0 ? fraction(BigInt(whole + digits), 10n ** BigInt(scale)) : fraction(BigInt(whole + digits) * 10n ** BigInt(-scale))
}
const add = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d)
const subtract = (a: Fraction, b: Fraction) => fraction(a.n * b.d - b.n * a.d, a.d * b.d)
const multiply = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d)
const divide = (a: Fraction, b: Fraction) => fraction(a.n * b.d, a.d * b.n)
const compare = (a: Fraction, b: Fraction) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0
// Display approximation only. Ordering and grouping always use exact fractions.
const display = (a: Fraction) => Number(a.n / a.d) + Number(a.n % a.d * 1_000_000n / a.d) / 1_000_000
const exact = (a: Fraction): ExactTime => ({ numerator: String(a.n), denominator: String(a.d) })
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const milliseconds = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= MAX_TIMING_MS

export function previewRoundTimeline(collection: DeclarationCollection, input: unknown): RoundTimeline {
  if (collection.phase !== 'closed') throw new Error('Для предпросмотра сначала закрой приём заявлений.')
  const entries = collection.entries.filter(entry => entry.status === 'submitted')
  if (!Array.isArray(input) || input.length !== entries.length || input.length > 200) throw new Error('Задай время для каждого полученного заявления.')
  const timings: ActorTiming[] = []
  for (const value of input) {
    if (!record(value) || typeof value.actorId !== 'string' || timings.some(t => t.actorId === value.actorId)) throw new Error('Проверь список героев для расчёта.')
    const entry = entries.find(e => e.actorId === value.actorId)
    if (!entry || value.entryRevision !== entry.revision) throw new Error('Заявление изменилось. Проверь длительности с новой версией.')
    if (!milliseconds(value.budgetMs)) throw new Error('Личный бюджет должен быть целым положительным числом миллисекунд.')
    const expected = entry.actions.flatMap((action, index) => action.kind === 'wait' ? [] : [index])
    if (!Array.isArray(value.costs) || value.costs.length !== expected.length) throw new Error('Задай стоимость каждого действия кроме ожидания.')
    const costs: ActorTiming['costs'] = []
    for (const cost of value.costs) {
      if (!record(cost) || !Number.isInteger(cost.index) || !expected.includes(Number(cost.index)) || costs.some(c => c.index === cost.index) || !milliseconds(cost.personalMs)) {
        throw new Error('Проверь номера действий и положительную стоимость в личных миллисекундах.')
      }
      costs.push({ index: Number(cost.index), personalMs: cost.personalMs })
    }
    timings.push({ actorId: value.actorId, entryRevision: entry.revision, budgetMs: value.budgetMs, costs })
  }
  const round = multiply(decimal(collection.durationSeconds), fraction(1000n))
  const finished: { time: Fraction; actorId: string; index: number }[] = []
  const actors = entries.map(entry => {
    const timing = timings.find(t => t.actorId === entry.actorId)!, budget = fraction(BigInt(timing.budgetMs))
    let cursor = zero
    const actions = entry.actions.map((action, index): TimelineAction => {
      // Waiting is already declared in world seconds: a faster hero waits for the same world interval.
      const duration = action.kind === 'wait' ? multiply(decimal(action.seconds), fraction(1000n)) :
        divide(multiply(round, fraction(BigInt(timing.costs.find(c => c.index === index)!.personalMs))), budget)
      const personalCost = action.kind === 'wait' ? divide(multiply(duration, budget), round) : fraction(BigInt(timing.costs.find(c => c.index === index)!.personalMs))
      const start = cursor, end = add(start, duration)
      const status = compare(end, round) <= 0 ? 'finishes' : compare(start, round) < 0 ? 'continues' : 'queued'
      const progress = status === 'finishes' ? fraction(1n) : status === 'queued' ? zero : divide(subtract(round, start), duration)
      cursor = end
      if (status === 'finishes') finished.push({ time: end, actorId: entry.actorId, index })
      return { actorId: entry.actorId, index, startMs: display(start), endMs: display(end), exactEnd: exact(end), status,
        personalCostMs: display(personalCost), remainingPersonalMs: display(multiply(personalCost, subtract(fraction(1n), progress))), progressPercent: display(multiply(progress, fraction(100n))) }
    })
    return { actorId: entry.actorId, budgetMs: timing.budgetMs, actions }
  })
  finished.sort((a, b) => compare(a.time, b.time))
  const groups: RoundTimeline['groups'] = []
  let previous: Fraction | null = null
  for (const event of finished) {
    if (!previous || compare(previous, event.time) !== 0) groups.push({ atMs: display(event.time), exactTime: exact(event.time), actions: [] })
    groups[groups.length - 1].actions.push({ actorId: event.actorId, index: event.index }); previous = event.time
  }
  return { collectionId: collection.id, epoch: collection.epoch, durationMs: display(round), actors, groups,
    missingActorIds: collection.participantIds.filter(id => !entries.some(e => e.actorId === id)) }
}
