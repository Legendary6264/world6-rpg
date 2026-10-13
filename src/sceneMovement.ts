import { addAmounts, amountFromNumber, compareAmounts, exactAmount, scaleAmount, subtractAmounts } from './exactWork'
import type { ExactAmount } from './exactWork'
import type { RoundWorkEntry } from './roundWork'
import type { Scene, ScenePosition, SceneSupport, SceneToken } from './sceneTypes'
export type MovementBody = { actorId: string; heightM: number; flightReason?: string }
export type MovementPlan = { work: RoundWorkEntry; startMs: ExactAmount; endMs: ExactAmount; points: ScenePosition[]; lengths: number[]; distance: number }
export type MovementChange = { workId: string; actorId: string; from: ScenePosition; to: ScenePosition; support: SceneSupport; atMs: ExactAmount; completed: boolean }
export const MAX_MOVEMENT_SEGMENTS = 4000, MAX_MOVEMENT_CHECKS = 200000
const EPS = 1e-6, one = exactAmount(1n)
const scalar = (v: ExactAmount) => Number(v.numerator) / Number(v.denominator)
const point = (p: ScenePosition): ScenePosition => ({ x: p.x, y: p.y, z: p.z })
const mix = (a: ScenePosition, b: ScenePosition, t: number): ScenePosition => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
const same = (a: ScenePosition, b: ScenePosition) => ['x', 'y', 'z'].every(k => Math.abs(a[k as keyof ScenePosition] - b[k as keyof ScenePosition]) <= EPS)
function path(points: ScenePosition[]) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y, p.z - points[i].z))
  return { points, lengths, distance: lengths.reduce((a, b) => a + b, 0) }
}
function onPath(p: Pick<MovementPlan, 'points' | 'lengths' | 'distance'>, fraction: number): ScenePosition {
  if (fraction <= 0) return point(p.points[0])
  if (fraction >= 1 || !p.distance) return point(p.points.at(-1)!)
  let left = fraction * p.distance
  for (let i = 0; i < p.lengths.length; i++) {
    if (p.lengths[i] > 0 && left <= p.lengths[i]) return mix(p.points[i], p.points[i + 1], left / p.lengths[i])
    left -= p.lengths[i]
  }
  return point(p.points.at(-1)!)
}
function beforeProgress(work: RoundWorkEntry) { return scaleAmount(subtractAmounts(work.amount.total, work.amount.remaining), one, work.amount.total) }
export function movementPosition(p: MovementPlan, atMs: ExactAmount): ScenePosition {
  const before = beforeProgress(p.work)
  if (compareAmounts(atMs, p.startMs) < 0) return onPath(p, scalar(before))
  if (compareAmounts(atMs, p.endMs) >= 0) return point(p.points.at(-1)!)
  const elapsed = subtractAmounts(atMs, p.startMs), duration = subtractAmounts(p.endMs, p.startMs)
  const fraction = addAmounts(before, scaleAmount(scaleAmount(p.work.amount.remaining, one, p.work.amount.total), elapsed, duration))
  return onPath(p, scalar(fraction))
}
export function prepareMovement(work: RoundWorkEntry, token: SceneToken | undefined, scene: Scene | undefined, startMs: ExactAmount, endMs: ExactAmount): MovementPlan {
  if (work.action.kind !== 'move' || !token || !scene) throw Error('Перед движением размести героя в сцене сбора.')
  if (!work.movement && compareAmounts(work.amount.remaining, work.amount.total) !== 0) throw Error('У прежнего движения нет начальной позиции. Согласуй восстановление маршрута с мастером; позиция не угадана.')
  const initial = work.movement?.start ?? point(token), geometry = path([initial, ...work.action.route.map(point)])
  if (work.movement && (Math.abs(work.movement.diameter - token.diameter) > EPS || !same(onPath(geometry, scalar(beforeProgress(work))), token))) {
    throw Error('Позиция или диаметр героя изменились относительно сохранённого движения. Требуется решение мастера.')
  }
  if (!geometry.points.every(p => p.x >= 0 && p.x <= scene.width && p.y >= 0 && p.y <= scene.depth && p.z >= scene.minZ && p.z <= scene.maxZ)) throw Error('Маршрут выходит за пределы сцены.')
  if (work.action.support === 'ground' && !geometry.points.every(p => Math.abs(p.z - initial.z) <= EPS)) throw Error('Ходьба требует непрерывной опоры на одной высоте. Прыжок, подъём и падение пока требуют отдельного решения.')
  work.movement = { start: point(initial), diameter: token.diameter }
  return { work, startMs, endMs, ...geometry }
}
export function supportAt(scene: Scene, p: ScenePosition): SceneSupport {
  if (Math.abs(p.z - scene.groundZ) < EPS) return { kind: 'ground' }
  const surface = scene.objects.find(o => o.canSupport && Math.abs(p.z - o.z - o.height) < EPS && Math.abs(p.x - o.x) <= o.width / 2 && Math.abs(p.y - o.y) <= o.depth / 2)
  if (!surface) throw Error('На маршруте нет опоры. Для полёта выбери движение в воздухе; падение автоматически не назначено.')
  return { kind: 'object', objectId: surface.id }
}
type Range = [number, number]
function slab(start: number, end: number, low: number, high: number): Range | null {
  const change = end - start
  if (!change) return start >= low && start <= high ? [0, 1] : null
  const a = (low - start) / change, b = (high - start) / change
  const left = Math.max(0, Math.min(a, b)), right = Math.min(1, Math.max(a, b))
  return left <= right ? [left, right] : null
}
function rectangle(a: ScenePosition, b: ScenePosition, x: number, y: number, width: number, depth: number): Range | null {
  const horizontal = slab(a.x, b.x, x - width / 2, x + width / 2), vertical = slab(a.y, b.y, y - depth / 2, y + depth / 2)
  if (!horizontal || !vertical) return null
  const left = Math.max(horizontal[0], vertical[0]), right = Math.min(horizontal[1], vertical[1])
  return left <= right ? [left, right] : null
}
function grounded(scene: Scene, a: ScenePosition, b: ScenePosition, check: () => void) {
  if (Math.abs(a.z - scene.groundZ) < EPS && Math.abs(b.z - scene.groundZ) < EPS) return
  const ranges: Range[] = []
  for (const o of scene.objects) {
    check()
    if (!o.canSupport || Math.abs(a.z - o.z - o.height) >= EPS || Math.abs(b.z - o.z - o.height) >= EPS) continue
    const covered = rectangle(a, b, o.x, o.y, o.width, o.depth)
    if (covered) ranges.push(covered)
  }
  ranges.sort((a, b) => a[0] - b[0]); let end = 0
  for (const r of ranges) { if (r[0] > end + 1e-12) break; end = Math.max(end, r[1]) }
  if (end < 1) throw Error('Маршрут ходьбы пересекает участок без опоры. Согласуй другой маршрут или способ движения.')
}
function closest(a: ScenePosition, b: ScenePosition, x: number, y: number) {
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy
  const t = square ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / square)) : 0
  return (a.x + t * dx - x) ** 2 + (a.y + t * dy - y) ** 2
}
function rectangleDistance(a: ScenePosition, b: ScenePosition, x: number, y: number, width: number, depth: number) {
  if (rectangle(a, b, x, y, width, depth)) return 0
  const distance = (p: ScenePosition) => Math.max(0, Math.abs(p.x - x) - width / 2) ** 2 + Math.max(0, Math.abs(p.y - y) - depth / 2) ** 2
  return Math.min(distance(a), distance(b), ...[-1, 1].flatMap(i => [-1, 1].map(j => closest(a, b, x + i * width / 2, y + j * depth / 2))))
}
function overlapZ(a: ScenePosition, b: ScenePosition, height: number, c: ScenePosition, d: ScenePosition, otherHeight: number): Range | null {
  // Feet at a surface, or a body just touching a ceiling, do not penetrate it.
  return slab(a.z - c.z, b.z - d.z, -height + EPS, otherHeight - EPS)
}
type Piece = { start: number; end: number; a: ScenePosition; b: ScenePosition }
function tokenPosition(token: SceneToken, plans: MovementPlan[], time: ExactAmount) {
  const started = plans.filter(p => p.work.actorId === token.actorId && compareAmounts(p.startMs, time) <= 0)
  return started.length ? movementPosition(started.at(-1)!, time) : point(token)
}
function pieces(token: SceneToken, plans: MovementPlan[], from: ExactAmount, to: ExactAmount): Piece[] {
  const fromNumber = scalar(from), toNumber = scalar(to), span = toNumber - fromNumber, cuts = [0, 1]
  for (const p of plans.filter(p => p.work.actorId === token.actorId)) {
    const before = scalar(beforeProgress(p.work)), start = scalar(p.startMs), end = scalar(p.endMs)
    const times = [start, end]; let distance = 0
    for (const length of p.lengths) {
      distance += length
      if (p.distance && before < 1) times.push(start + (distance / p.distance - before) / (1 - before) * (end - start))
    }
    for (const t of times) if (t > fromNumber && t < toNumber) cuts.push((t - fromNumber) / span)
  }
  const sorted = [...new Set(cuts)].sort((a, b) => a - b)
  const at = (fraction: number) => fraction === 0 ? from : fraction === 1 ? to : addAmounts(from, scaleAmount(subtractAmounts(to, from), amountFromNumber(fraction)))
  return sorted.slice(1).map((end, i) => ({ start: sorted[i], end, a: tokenPosition(token, plans, at(sorted[i])), b: tokenPosition(token, plans, at(end)) }))
}
const portion = (p: Piece, t: number) => mix(p.a, p.b, (t - p.start) / (p.end - p.start))
export function checkClosingDoor(scene: Scene, objectId: string, bodies: MovementBody[], check: () => void) {
  const object = scene.objects.find(o => o.id === objectId)!
  if (object.kind !== 'door' || !object.blocksMovement || object.height <= 0) return
  for (const token of scene.tokens) {
    check(); const height = bodies.find(b => b.actorId === token.actorId)!.heightM
    if (overlapZ(token, token, height, object, object, object.height) && rectangleDistance(token, token, object.x, object.y, object.width, object.depth) < (token.diameter / 2 - EPS) ** 2) {
      throw Error('Закрытие двери пересекает объём персонажа. Мастер должен согласовать действие; урон или вытеснение автоматически не назначены.')
    }
  }
}

// Upright cylinders, linear path segments and static boxes between world events.
// A shared bounded check counter protects a free service from pathological input.
export function advanceMovement(scene: Scene, plans: MovementPlan[], bodies: MovementBody[], from: ExactAmount, to: ExactAmount, check: () => void) {
  const moving = new Set(plans.filter(p => compareAmounts(p.startMs, to) < 0 && compareAmounts(p.endMs, from) > 0).map(p => p.work.actorId))
  if (compareAmounts(from, to) < 0 && moving.size) {
    const trajectories = scene.tokens.map(t => ({ token: t, height: bodies.find(b => b.actorId === t.actorId)!.heightM, pieces: pieces(t, plans, from, to) }))
    for (const t of trajectories.filter(t => moving.has(t.token.actorId))) {
      for (const p of t.pieces) {
        const middle = addAmounts(from, scaleAmount(subtractAmounts(to, from), amountFromNumber((p.start + p.end) / 2)))
        const active = plans.find(m => m.work.actorId === t.token.actorId && compareAmounts(m.startMs, middle) <= 0 && compareAmounts(m.endMs, middle) >= 0)
        if (active?.work.action.kind === 'move' && active.work.action.support === 'ground') grounded(scene, p.a, p.b, check)
        for (const o of scene.objects) {
          check()
          if (!o.blocksMovement || o.height <= 0 || o.kind === 'door' && o.open) continue
          const overlap = overlapZ(p.a, p.b, t.height, o, o, o.height)
          if (overlap && rectangleDistance(mix(p.a, p.b, overlap[0]), mix(p.a, p.b, overlap[1]), o.x, o.y, o.width, o.depth) < (t.token.diameter / 2 - EPS) ** 2) {
            throw Error('Движение пересекает препятствие «' + o.name + '». Согласуй маршрут; частичные последствия не применены.')
          }
        }
      }
    }
    for (let i = 0; i < trajectories.length; i++) for (let j = i + 1; j < trajectories.length; j++) {
      const a = trajectories[i], b = trajectories[j]
      if (!moving.has(a.token.actorId) && !moving.has(b.token.actorId)) continue
      let ai = 0, bi = 0
      while (ai < a.pieces.length && bi < b.pieces.length) {
        check(); const ap = a.pieces[ai], bp = b.pieces[bi], start = Math.max(ap.start, bp.start), end = Math.min(ap.end, bp.end)
        if (start <= end) {
          const a0 = portion(ap, start), a1 = portion(ap, end), b0 = portion(bp, start), b1 = portion(bp, end)
          const overlap = overlapZ(a0, a1, a.height, b0, b1, b.height)
          if (overlap) {
            const r0 = { x: a0.x - b0.x, y: a0.y - b0.y, z: 0 }, r1 = { x: a1.x - b1.x, y: a1.y - b1.y, z: 0 }
            if (closest(mix(r0, r1, overlap[0]), mix(r0, r1, overlap[1]), 0, 0) < ((a.token.diameter + b.token.diameter) / 2 - EPS) ** 2) throw Error('Траектории персонажей пересекаются в одно время. Мастер должен согласовать движение до применения.')
          }
        }
        if (ap.end <= bp.end) ai++; if (bp.end <= ap.end) bi++
      }
    }
  }
  for (const token of scene.tokens) {
    const started = plans.filter(p => p.work.actorId === token.actorId && compareAmounts(p.startMs, to) <= 0)
    if (!started.length) continue
    const current = started.at(-1)!, location = movementPosition(current, to)
    Object.assign(token, location)
    token.support = current.work.action.kind === 'move' && current.work.action.support === 'air' ? { kind: 'air' } : supportAt(scene, location)
  }
}
