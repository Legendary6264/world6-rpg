import { copyDeclaredAction, isDeclaredAction } from './actionDeclarations'
import { amountFromNumber, compareAmounts, copyAmount, exactAmount, isExactAmount, scaleAmount, subtractAmounts } from './exactWork'
import type { DeclaredAction } from './actionDeclarations'
import type { ExactAmount } from './exactWork'
import type { ScenePosition, SceneState } from './sceneTypes'

export const MAX_ROUND_WORK_ENTRIES = 200
const MAX_PERSONAL_MS = 1_000_000_000_000
export type RoundWorkEntry = {
  id: string; actorId: string; sceneId: string
  origin: { collectionId: string; epoch: number; entryRevision: number; actionIndex: number }
  action: DeclaredAction
  amount: { unit: 'personal-ms' | 'world-ms'; total: ExactAmount; remaining: ExactAmount }
  movement?: { start: ScenePosition; diameter: number }
  targetActorId?: string
  ability?: { castId: string }
}
export type RoundWork = { version: 1; entries: RoundWorkEntry[] }
export type PersonalRoundWork = Pick<RoundWorkEntry, 'id' | 'actorId' | 'amount'> & { actionKind: DeclaredAction['kind']; status: 'working' | 'ready' }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k))
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(v)
const integer = (v: unknown, min: number, max: number) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max
const position = (v: unknown): v is ScenePosition => record(v) && keys(v, ['x', 'y', 'z']) && Object.values(v).every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e6)
// Existing action readers are forward-compatible. Saved work instead accepts a
// closed shape so hidden/operational properties cannot survive an import.
function knownShape(value: unknown, copied: unknown): boolean {
  if (Array.isArray(copied)) return Array.isArray(value) && value.length === copied.length && copied.every((v, i) => knownShape(value[i], v))
  if (record(copied)) return record(value) && keys(value, Object.keys(copied)) && Object.entries(copied).every(([k, v]) => knownShape(value[k], v))
  return value === copied
}
export function isRoundWorkEntry(v: unknown): v is RoundWorkEntry {
  if (!record(v) || !keys(v, ['id', 'actorId', 'sceneId', 'origin', 'action', 'amount', ...(v.movement === undefined ? [] : ['movement']), ...(v.targetActorId === undefined ? [] : ['targetActorId']), ...(v.ability === undefined ? [] : ['ability'])]) || !id(v.id) || !id(v.actorId) || !id(v.sceneId) ||
      !record(v.origin) || !keys(v.origin, ['collectionId', 'epoch', 'entryRevision', 'actionIndex']) || !id(v.origin.collectionId) ||
      !integer(v.origin.epoch, 1, 1e9) || !integer(v.origin.entryRevision, 1, 1e9) || !integer(v.origin.actionIndex, 0, 19) ||
      !isDeclaredAction(v.action) || !knownShape(v.action, copyDeclaredAction(v.action)) ||
      !record(v.amount) || !keys(v.amount, ['unit', 'total', 'remaining']) || !isExactAmount(v.amount.total) || !isExactAmount(v.amount.remaining)) return false
  if (v.movement !== undefined && (v.action.kind !== 'move' || !record(v.movement) || !keys(v.movement, ['start', 'diameter']) ||
      !position(v.movement.start) ||
      typeof v.movement.diameter !== 'number' || !Number.isFinite(v.movement.diameter) || v.movement.diameter < 0.1 || v.movement.diameter > 100)) return false
  if (v.targetActorId !== undefined && (!['ability','item'].includes(v.action.kind) || !('target' in v.action) || v.action.target.kind !== 'contact' || !id(v.targetActorId))) return false
  if (v.ability !== undefined && (v.action.kind !== 'ability' || v.action.stage !== 'prepare' || !record(v.ability) || !keys(v.ability,['castId']) || !id(v.ability.castId))) return false
  const { total, remaining, unit } = v.amount
  if (compareAmounts(total, exactAmount(0n)) <= 0 || compareAmounts(remaining, total) > 0) return false
  if (v.action.kind === 'wait') {
    try { return unit === 'world-ms' && compareAmounts(total, scaleAmount(amountFromNumber(v.action.seconds), exactAmount(1000n))) === 0 }
    catch { return false }
  }
  return unit === 'personal-ms' && compareAmounts(total, exactAmount(BigInt(MAX_PERSONAL_MS))) <= 0
}
export function isRoundWork(v: unknown): v is RoundWork {
  if (!record(v) || !keys(v, ['version', 'entries']) || v.version !== 1 || !Array.isArray(v.entries) || v.entries.length > MAX_ROUND_WORK_ENTRIES || !v.entries.every(isRoundWorkEntry)) return false
  const sources = v.entries.map(e => JSON.stringify([e.actorId, e.origin.collectionId, e.origin.epoch, e.origin.entryRevision, e.origin.actionIndex]))
  return new Set(v.entries.map(e => e.id)).size === v.entries.length && new Set(sources).size === v.entries.length
}
export function copyRoundWorkEntry(e: RoundWorkEntry): RoundWorkEntry {
  return { id: e.id, actorId: e.actorId, sceneId: e.sceneId,
    origin: { collectionId: e.origin.collectionId, epoch: e.origin.epoch, entryRevision: e.origin.entryRevision, actionIndex: e.origin.actionIndex },
    action: copyDeclaredAction(e.action), amount: { unit: e.amount.unit, total: copyAmount(e.amount.total), remaining: copyAmount(e.amount.remaining) },
    ...(e.movement ? { movement: { start: { ...e.movement.start }, diameter: e.movement.diameter } } : {}),
    ...(e.targetActorId ? {targetActorId:e.targetActorId} : {}), ...(e.ability ? {ability:{castId:e.ability.castId}} : {}) }
}
export const copyRoundWork = (v: RoundWork): RoundWork => ({ version: 1, entries: v.entries.map(copyRoundWorkEntry) })
export function roundWorkReferencesValid(v: RoundWork | undefined, scenes: SceneState | undefined, actorIds: string[]): boolean {
  return v === undefined || isRoundWork(v) && v.entries.every(e => actorIds.includes(e.actorId) && !!scenes?.scenes.some(s => s.id === e.sceneId))
}
export function personalRoundWork(v: RoundWork | undefined, actorIds: string[]): PersonalRoundWork[] {
  return (v?.entries ?? []).filter(e => actorIds.includes(e.actorId)).map(e => ({ id: e.id, actorId: e.actorId, actionKind: e.action.kind,
    status: e.amount.remaining.numerator === '0' ? 'ready' : 'working',
    amount: { unit: e.amount.unit, total: copyAmount(e.amount.total), remaining: copyAmount(e.amount.remaining) } }))
}
function timing(budgetMs: number, durationMs: ExactAmount) {
  if (!integer(budgetMs, 1, MAX_PERSONAL_MS) || !isExactAmount(durationMs) || compareAmounts(durationMs, exactAmount(0n)) <= 0 || compareAmounts(durationMs, exactAmount(86_400_000n)) > 0) throw Error('Проверь бюджет и мировую длительность раунда.')
}
// Pure projection only: never changes a campaign, clock, resources or cast.
export function remainingWorldTime(e: RoundWorkEntry, budgetMs: number, durationMs: ExactAmount): ExactAmount {
  if (!isRoundWorkEntry(e)) throw Error('Некорректная переносимая работа.')
  timing(budgetMs, durationMs)
  return e.amount.unit === 'world-ms' ? copyAmount(e.amount.remaining) : scaleAmount(e.amount.remaining, durationMs, exactAmount(BigInt(budgetMs)))
}
export function projectWorkProgress(e: RoundWorkEntry, elapsedWorldMs: ExactAmount, budgetMs: number, durationMs: ExactAmount): RoundWorkEntry {
  if (!isRoundWorkEntry(e)) throw Error('Некорректная переносимая работа.')
  timing(budgetMs, durationMs)
  if (!isExactAmount(elapsedWorldMs) || compareAmounts(elapsedWorldMs, durationMs) > 0) throw Error('Интервал работы должен находиться внутри раунда.')
  const done = e.amount.unit === 'world-ms' ? elapsedWorldMs : scaleAmount(elapsedWorldMs, exactAmount(BigInt(budgetMs)), durationMs)
  const result = copyRoundWorkEntry(e)
  result.amount.remaining = compareAmounts(done, e.amount.remaining) >= 0 ? exactAmount(0n) : subtractAmounts(e.amount.remaining, done)
  return result
}
