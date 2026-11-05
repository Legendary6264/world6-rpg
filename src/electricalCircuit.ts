import type { Scene, SceneObject, ScenePosition } from './sceneTypes'
import { waterConductivitySM } from './waterPhysics'

type Box = { min: ScenePosition; max: ScenePosition; center: ScenePosition }
type Conductor = Box & { object: SceneObject; conductivity: number | null }
type Link = { to: number; ohms: number | null; direct?: SceneObject }
export type DischargeSettings = { returnContact: ScenePosition; voltageV: number; limitA: number; durationMs: number; thresholdA: number }
export type CircuitResult = { status: 'open' } | { status: 'unknown' } | {
  status: 'closed'; ohms: number; currentA: number; energyJ: number; path: { id: string; name: string }[]
}

const axes = ['x', 'y', 'z'] as const
const EPS_M = 1e-8
const MAX_OHMS = 1e24
const length = (a: ScenePosition, b: ScenePosition) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)

function objectBox(o: SceneObject): Box {
  return {
    min: { x: o.x - o.width / 2, y: o.y - o.depth / 2, z: o.z },
    max: { x: o.x + o.width / 2, y: o.y + o.depth / 2, z: o.z + o.height },
    center: { x: o.x, y: o.y, z: o.z + o.height / 2 },
  }
}
const contains = (box: Box, p: ScenePosition) => axes.every(axis => p[axis] >= box.min[axis] - EPS_M && p[axis] <= box.max[axis] + EPS_M)
export const pointInObject = (o: SceneObject, p: ScenePosition) => contains(objectBox(o), p)

function contact(a: Box, b: Box): { point: ScenePosition; areaM2: number } | null {
  const spans = axes.map(k => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]))
  if (spans.some(span => span < -EPS_M)) return null
  const normal = spans.indexOf(Math.min(...spans))
  const areaM2 = spans.reduce((area, span, index) => index === normal ? area : area * Math.max(0, span), 1)
  if (areaM2 <= EPS_M ** 2) return null
  const midpoint = (k: keyof ScenePosition) => (Math.min(a.max[k], b.max[k]) + Math.max(a.min[k], b.min[k])) / 2
  return { point: { x: midpoint('x'), y: midpoint('y'), z: midpoint('z') }, areaM2 }
}

function resistance(c: Conductor, a: ScenePosition, b: ScenePosition, contactArea = Infinity): number | null {
  if (c.conductivity === null) return null
  const { width, depth, height } = c.object
  const metres = length(a, b)
  const projectedLength = metres > EPS_M
    ? (Math.abs(b.x - a.x) * width + Math.abs(b.y - a.y) * depth + Math.abs(b.z - a.z) * height) / metres
    : Math.max(width, depth, height)
  const section = Math.min(contactArea, width * depth * height / projectedLength)
  return Math.min(MAX_OHMS, Math.max(metres, 1e-6) / (c.conductivity * section))
}

function connected(graph: Link[][]): boolean {
  const reached = new Set([0]), queue = [0]
  for (const index of queue) for (const link of graph[index]) {
    if (reached.has(link.to)) continue
    if (link.to === 1) return true
    reached.add(link.to)
    queue.push(link.to)
  }
  return false
}

// A single dominant path. Each solid or water volume has a hub for contacts
// with neighbours; electrodes in one volume can also use the direct section.
export function calculateCircuit(scene: Scene, contactPoint: ScenePosition, settings: DischargeSettings): CircuitResult {
  const { returnContact, voltageV, limitA, durationMs } = settings
  if (length(contactPoint, returnContact) <= EPS_M) throw Error('Контакт разряда и обратная клемма должны быть в разных точках.')
  const parts: Conductor[] = []
  for (const object of scene.objects) {
    if (object.height <= EPS_M || (object.kind === 'door' && object.open)) continue
    const material = object.physics?.material
    const conductivity = object.water ? waterConductivitySM(object.water, object) :
      (material?.phase === 'solid' || material?.phase === 'liquid' && object.kind === 'water') ? material.electricalConductivitySM : undefined
    if (conductivity !== undefined && conductivity !== 0) parts.push({ ...objectBox(object), object, conductivity })
  }
  parts.sort((a, b) => a.object.id < b.object.id ? -1 : a.object.id > b.object.id ? 1 : 0)
  const graph: Link[][] = Array.from({ length: parts.length + 2 }, () => [])
  const link = (a: number, b: number, ohms: number | null, direct?: SceneObject) => {
    graph[a].push({ to: b, ohms, direct })
    graph[b].push({ to: a, ohms, direct })
  }
  for (const [i, part] of parts.entries()) {
    const starts = contains(part, contactPoint), returns = contains(part, returnContact)
    if (starts) link(0, i + 2, resistance(part, contactPoint, part.center))
    if (returns) link(i + 2, 1, resistance(part, part.center, returnContact))
    if (starts && returns) link(0, 1, resistance(part, contactPoint, returnContact), part.object)
    for (let j = 0; j < i; j++) {
      const other = parts[j], joint = contact(part, other)
      if (!joint) continue
      const left = resistance(part, part.center, joint.point, joint.areaM2)
      const right = resistance(other, joint.point, other.center, joint.areaM2)
      link(i + 2, j + 2, left === null || right === null ? null : left + right)
    }
  }
  const dist = graph.map(() => Infinity), settled = new Set<number>()
  const previous: ({ from: number; link: Link } | undefined)[] = []
  dist[0] = 0
  for (;;) {
    let from = -1, best = Infinity
    for (let i = 0; i < dist.length; i++) if (!settled.has(i) && dist[i] < best) { best = dist[i]; from = i }
    if (from === -1 || from === 1) break
    settled.add(from)
    for (const edge of graph[from]) {
      if (edge.ohms === null || settled.has(edge.to) || best + edge.ohms >= dist[edge.to]) continue
      dist[edge.to] = best + edge.ohms
      previous[edge.to] = { from, link: edge }
    }
  }
  if (!Number.isFinite(dist[1])) return { status: connected(graph) ? 'unknown' : 'open' }

  const path: SceneObject[] = []
  for (let i = 1; previous[i];) {
    const step = previous[i]!
    if (step.link.direct) path.push(step.link.direct)
    if (step.from >= 2) path.push(parts[step.from - 2].object)
    i = step.from
  }
  const ohms = dist[1], currentA = Math.min(limitA, voltageV / ohms)
  return {
    status: 'closed', ohms, currentA, energyJ: currentA * currentA * ohms * durationMs / 1000,
    path: path.reverse().map(({ id, name }) => ({ id, name })),
  }
}
