import type { ScenePosition, SceneState } from './sceneTypes'

export const actionKinds = [{ key: 'move', label: 'Идти' }, { key: 'wait', label: 'Ждать' }, { key: 'interact', label: 'Взаимодействовать' },
  { key: 'speak', label: 'Говорить' }, { key: 'item', label: 'Использовать предмет' }, { key: 'ability', label: 'Использовать способность' }] as const
export type DeclarationTarget = { kind: 'self' | 'none' } | { kind: 'point'; point: ScenePosition } | { kind: 'contact' | 'object'; id: string }
export type DeclaredAction = { note: string } & (
  { kind: 'move'; route: ScenePosition[]; support: 'ground' | 'air' } |
  { kind: 'wait'; seconds: number } |
  { kind: 'interact'; target: DeclarationTarget; operation: 'inspect' | 'open' | 'close' | 'take' | 'activate' } |
  { kind: 'speak'; target: DeclarationTarget; volume: 'whisper' | 'normal' | 'shout'; text: string } |
  { kind: 'item'; itemId: string; target: DeclarationTarget; quantity: number } |
  { kind: 'ability'; abilityId: string; stage: 'prepare' | 'release'; target: DeclarationTarget })
export type DeclarationEntry = { actorId: string; actorName: string; revision: number; status: 'submitted' | 'withdrawn' | 'returned';
  actions: DeclaredAction[]; resolved: { index: number; actorId?: string; objectId?: string }[]; submittedBy: string; submittedAt: string; note: string }
export type DeclarationEvent = { id: string; kind: 'open' | 'close' | 'reopen' | 'submit' | 'withdraw' | 'return'; actorId: string; authorId: string; at: string; entry?: DeclarationEntry }
export type DeclarationCollection = { id: string; sceneId: string; sceneName: string; durationSeconds: number; allowReplace: boolean;
  phase: 'open' | 'closed' | 'cancelled'; epoch: number; participantIds: string[]; entries: DeclarationEntry[]; history: DeclarationEvent[] }
export type ActionDeclarations = { version: 1; active: DeclarationCollection | null; archive: DeclarationCollection[] }
export type DeclarationOptions = { frame: { width: number; depth: number; minZ: number; maxZ: number } | null;
  targets: { id: string; kind: 'contact' | 'object'; label: string }[];
  items: { id: string; name: string; quantity: number }[]; abilities: { id: string; name: string }[] }
export type HeroDeclarations = { collection: { id: string; epoch: number; phase: DeclarationCollection['phase']; durationSeconds: number; allowReplace: boolean } | null;
  participating: boolean; canSubmit: boolean; controlStamp: string; entry: Pick<DeclarationEntry, 'revision' | 'status' | 'actions' | 'submittedAt' | 'submittedBy' | 'note'> | null;
  options: DeclarationOptions | null; readiness: { userId: string; ready: boolean }[] }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(v)
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const integer = (v: unknown, max = 1e9): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6
const seconds = (v: unknown): v is number => finite(v) && v > 0 && v <= 86400
const choice = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v)
const unique = (v: string[]) => new Set(v).size === v.length
const point = (v: unknown): v is ScenePosition => record(v) && finite(v.x) && finite(v.y) && finite(v.z)
export function isDeclarationTarget(v: unknown): v is DeclarationTarget {
  return record(v) && (v.kind === 'self' || v.kind === 'none' || v.kind === 'point' && point(v.point) || (v.kind === 'contact' || v.kind === 'object') && id(v.id))
}
export function isDeclaredAction(v: unknown): v is DeclaredAction {
  if (!record(v) || !text(v.note, 1000)) return false
  if (v.kind === 'move') return Array.isArray(v.route) && v.route.length > 0 && v.route.length <= 20 && v.route.every(point) && choice(v.support, ['ground', 'air'])
  if (v.kind === 'wait') return seconds(v.seconds)
  if (!isDeclarationTarget(v.target)) return false
  if (v.kind === 'interact') return choice(v.operation, ['inspect', 'open', 'close', 'take', 'activate']) && v.target.kind !== 'none'
  if (v.kind === 'speak') return choice(v.volume, ['whisper', 'normal', 'shout']) && text(v.text, 4000) && !!v.text.trim()
  if (v.kind === 'item') return id(v.itemId) && integer(v.quantity, 100000) && v.quantity > 0
  return v.kind === 'ability' && id(v.abilityId) && choice(v.stage, ['prepare', 'release'])
}
export const isActionSequence = (v: unknown): v is DeclaredAction[] => Array.isArray(v) && v.length > 0 && v.length <= 20 && v.every(isDeclaredAction)
const copyPoint = (p: ScenePosition): ScenePosition => ({ x: p.x, y: p.y, z: p.z })
const copyTarget = (t: DeclarationTarget): DeclarationTarget => t.kind === 'point' ? { kind: t.kind, point: copyPoint(t.point) } :
  t.kind === 'contact' || t.kind === 'object' ? { kind: t.kind, id: t.id } : { kind: t.kind }
export function copyDeclaredAction(a: DeclaredAction): DeclaredAction {
  const note = a.note
  if (a.kind === 'move') return { kind: a.kind, note, route: a.route.map(copyPoint), support: a.support }
  if (a.kind === 'wait') return { kind: a.kind, note, seconds: a.seconds }
  const target = copyTarget(a.target)
  if (a.kind === 'interact') return { kind: a.kind, note, target, operation: a.operation }
  if (a.kind === 'speak') return { kind: a.kind, note, target, volume: a.volume, text: a.text }
  if (a.kind === 'item') return { kind: a.kind, note, target, itemId: a.itemId, quantity: a.quantity }
  return { kind: a.kind, note, target, abilityId: a.abilityId, stage: a.stage }
}
const isEntry = (v: unknown): v is DeclarationEntry => record(v) && id(v.actorId) && text(v.actorName, 120) && integer(v.revision) && v.revision > 0 &&
  choice(v.status, ['submitted', 'withdrawn', 'returned']) && Array.isArray(v.actions) && v.actions.length <= 20 && v.actions.every(isDeclaredAction) &&
  (v.status !== 'submitted' || v.actions.length > 0) && id(v.submittedBy) && text(v.submittedAt, 60) && text(v.note, 2000) &&
  Array.isArray(v.resolved) && v.resolved.length <= 20 && v.resolved.every(r => record(r) && integer(r.index, 19) && r.index < (v.actions as DeclaredAction[]).length &&
    (r.actorId === undefined || id(r.actorId)) && (r.objectId === undefined || id(r.objectId)))
const isCollection = (v: unknown): v is DeclarationCollection => record(v) && id(v.id) && id(v.sceneId) && text(v.sceneName, 120) && seconds(v.durationSeconds) &&
  typeof v.allowReplace === 'boolean' && choice(v.phase, ['open', 'closed', 'cancelled']) && integer(v.epoch) && v.epoch > 0 &&
  Array.isArray(v.participantIds) && v.participantIds.length <= 200 && v.participantIds.every(id) && unique(v.participantIds) &&
  Array.isArray(v.entries) && v.entries.length <= 200 && v.entries.every(isEntry) && unique(v.entries.map(e => e.actorId)) && v.entries.every(e => (v.participantIds as string[]).includes(e.actorId)) &&
  Array.isArray(v.history) && v.history.length <= 500 && v.history.every(e => record(e) && id(e.id) && choice(e.kind, ['open', 'close', 'reopen', 'submit', 'withdraw', 'return']) &&
    (e.actorId === '' || id(e.actorId)) && id(e.authorId) && text(e.at, 60) && (e.entry === undefined || isEntry(e.entry))) && unique(v.history.map(e => e.id))
export function isActionDeclarations(v: unknown): v is ActionDeclarations {
  return record(v) && v.version === 1 && (v.active === null || isCollection(v.active)) && Array.isArray(v.archive) && v.archive.length <= 20 &&
    v.archive.every(c => isCollection(c) && c.phase !== 'open') && unique([...v.archive.map(c => c.id), ...(v.active ? [v.active.id] : [])])
}
const copyEntry = (e: DeclarationEntry): DeclarationEntry => ({ actorId: e.actorId, actorName: e.actorName, revision: e.revision, status: e.status,
  actions: e.actions.map(copyDeclaredAction), resolved: e.resolved.map(r => ({ index: r.index, ...(r.actorId ? { actorId: r.actorId } : {}), ...(r.objectId ? { objectId: r.objectId } : {}) })),
  submittedBy: e.submittedBy, submittedAt: e.submittedAt, note: e.note })
const copyCollection = (c: DeclarationCollection): DeclarationCollection => ({ id: c.id, sceneId: c.sceneId, sceneName: c.sceneName, durationSeconds: c.durationSeconds,
  allowReplace: c.allowReplace, phase: c.phase, epoch: c.epoch, participantIds: [...c.participantIds], entries: c.entries.map(copyEntry),
  history: c.history.map(e => ({ id: e.id, kind: e.kind, actorId: e.actorId, authorId: e.authorId, at: e.at, ...(e.entry ? { entry: copyEntry(e.entry) } : {}) })) })
export const emptyDeclarations = (): ActionDeclarations => ({ version: 1, active: null, archive: [] })
export const copyActionDeclarations = (v: ActionDeclarations): ActionDeclarations => ({ version: 1, active: v.active ? copyCollection(v.active) : null, archive: v.archive.map(copyCollection) })
export function declarationReferencesValid(v: ActionDeclarations | undefined, scenes: SceneState | undefined, actorIds: string[]) {
  return !v?.active || v.active.phase === 'cancelled' || !!scenes?.scenes.some(s => s.id === v.active!.sceneId) && v.active.participantIds.every(id => actorIds.includes(id))
}
export function pruneDeclarations(v: ActionDeclarations, scenes: SceneState | undefined, actorIds: string[]): ActionDeclarations {
  const result = copyActionDeclarations(v), c = result.active
  if (c) {
    c.participantIds = c.participantIds.filter(id => actorIds.includes(id)); c.entries = c.entries.filter(e => c.participantIds.includes(e.actorId))
    if (!scenes?.scenes.some(s => s.id === c.sceneId) && c.phase !== 'cancelled') { c.phase = 'cancelled'; c.epoch += 1 }
  }
  return result
}
export function actionSummary(a: DeclaredAction): string {
  if (a.kind === 'move') return 'Идти: ' + a.route.map(p => `(${p.x}; ${p.y}; ${p.z})`).join(' → ') + (a.support === 'air' ? ' · воздух' : ' · земля')
  if (a.kind === 'wait') return 'Ждать: ' + a.seconds + ' с'
  if (a.kind === 'speak') return 'Говорить · ' + ({ whisper: 'шёпот', normal: 'обычная речь', shout: 'крик' }[a.volume]) + ': ' + a.text
  if (a.kind === 'interact') return 'Взаимодействовать · ' + ({ inspect: 'осмотреть', open: 'открыть', close: 'закрыть', take: 'взять', activate: 'активировать' }[a.operation])
  if (a.kind === 'item') return 'Использовать предмет · ' + a.quantity + ' шт.'
  return 'Способность · ' + (a.stage === 'prepare' ? 'подготовить' : 'применить')
}
