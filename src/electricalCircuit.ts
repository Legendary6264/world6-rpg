import type { Scene, SceneObject, ScenePosition } from './sceneTypes'
import { objectBounds, overlapLength } from './sceneGeometry'
import type { ObjectBounds } from './sceneGeometry'
import { liquidWaterHeight, waterConductivitySM } from './waterPhysics'
import { physicsId, physicsKeys, physicsRecord } from './physicsUnits'

type Conductor = ObjectBounds & { object: SceneObject; conductivity: number | null }
type BridgePath = {actorId:string; handRegion:string; footRegion:string; bodyResistanceOhm:number; insulationOhm:number}
type Link = { to: number; ohms: number | null; direct?: SceneObject; body?:BridgePath }
export type ShockGrip = {actorId:string;objectId:string;handRegion:string;footRegion:string}
type BridgeContact = {point:ScenePosition;region:string;dryOhm:number;wetOhm:number}
export type CircuitBridge = {
  actorId:string;bodyResistanceOhm:number;hand:BridgeContact & {objectId:string};foot:BridgeContact & {objectId?:string}
}
export const MAX_SHOCK_GRIPS = 32
export function isShockGrips(value:unknown):value is ShockGrip[] {
  return Array.isArray(value) && value.length<=MAX_SHOCK_GRIPS && value.every(grip=>
    physicsRecord(grip) && physicsKeys(grip,['actorId','objectId','handRegion','footRegion']) &&
    Object.values(grip).every(physicsId) && grip.handRegion!==grip.footRegion) &&
    new Set(value.map(grip=>grip.actorId)).size===value.length
}
export type DischargeSettings = { returnContact: ScenePosition; voltageV: number; limitA: number; durationMs: number; thresholdA: number; grips?:ShockGrip[] }
export type CircuitResult = { status: 'open'; frozenContacts?: ('source'|'return')[] } | { status: 'unknown' } | {
  status: 'closed'; ohms: number; currentA: number; energyJ: number; path: { id: string; name: string }[]
  bodyPath?: (BridgePath & {energyJ:number})[]
}

const axes = ['x', 'y', 'z'] as const
const EPS_M = 1e-8
const MAX_OHMS = 1e24
const length = (a: ScenePosition, b: ScenePosition) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)

const contains = (box: ObjectBounds, p: ScenePosition) => axes.every(axis => p[axis] >= box.min[axis] - EPS_M && p[axis] <= box.max[axis] + EPS_M)
export const pointInObject = (o: SceneObject, p: ScenePosition) => contains(objectBounds(o), p)
const iceAt = (scene:Scene,point:ScenePosition) => scene.objects.some(object=>{
  if (!object.water || object.height <= EPS_M || !pointInObject(object,point)) return false
  const liquid = liquidWaterHeight(object.water,object.height)
  return liquid<object.height && (liquid<=EPS_M || point.z>object.z+liquid+EPS_M)
})

function contact(a: ObjectBounds, b: ObjectBounds): { point: ScenePosition; areaM2: number } | null {
  const spans = axes.map(k => overlapLength(a.min[k], a.max[k], b.min[k], b.max[k]))
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
export function calculateCircuit(scene: Scene, contactPoint: ScenePosition, settings: DischargeSettings, bridges:readonly CircuitBridge[]=[]): CircuitResult {
  const { returnContact, voltageV, limitA, durationMs } = settings
  if (length(contactPoint, returnContact) <= EPS_M) throw Error('Контакт разряда и обратная клемма должны быть в разных точках.')
  const parts: Conductor[] = []
  for (const object of scene.objects) {
    if (object.height <= EPS_M || (object.kind === 'door' && object.open)) continue
    const material = object.physics?.material
    const conductivity = object.water ? waterConductivitySM(object.water, object) :
      (material?.phase === 'solid' || material?.phase === 'liquid' && object.kind === 'water') ? material.electricalConductivitySM : undefined
    if (conductivity === undefined || conductivity === 0) continue
    const height = object.water ? liquidWaterHeight(object.water, object.height) : object.height
    if (height <= EPS_M) continue
    // During a mixed phase, approximate the remaining liquid as a bottom layer.
    const liquid = height === object.height ? object : { ...object, height }
    parts.push({ ...objectBounds(liquid), object: liquid, conductivity })
  }
  parts.sort((a, b) => a.object.id < b.object.id ? -1 : a.object.id > b.object.id ? 1 : 0)
  const graph: Link[][] = Array.from({ length: parts.length + 2 }, () => [])
  const link = (a: number, b: number, ohms: number | null, direct?: SceneObject, body?:BridgePath) => {
    graph[a].push({ to: b, ohms, direct, body })
    graph[b].push({ to: a, ohms, direct, body })
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
  // One confirmed grip and one supported foot form a series bridge. A single
  // volume has one hub, so it cannot supply a separate body return here.
  for (const {actorId,hand,foot,bodyResistanceOhm} of [...bridges].sort((a,b)=>a.actorId<b.actorId ? -1 : a.actorId>b.actorId ? 1 : 0)) {
    const handIndex = parts.findIndex(part=>part.object.id===hand.objectId && contains(part,hand.point))
    const wetFeet = parts.flatMap((part,index)=>part.object.kind==='water' && contains(part,foot.point) ? [index] : [])
    const footIndex = wetFeet.length===1 ? wetFeet[0] : wetFeet.length || iceAt(scene,foot.point) ? -1 :
      parts.findIndex(part=>part.object.id===foot.objectId && contains(part,foot.point))
    if (handIndex<0 || footIndex<0 || handIndex===footIndex) continue
    const handPart = parts[handIndex], footPart = parts[footIndex]
    const insulationOhm = (handPart.object.kind==='water' ? hand.wetOhm : hand.dryOhm) +
      (footPart.object.kind==='water' ? foot.wetOhm : foot.dryOhm)
    const a = resistance(handPart,hand.point,handPart.center), b = resistance(footPart,foot.point,footPart.center)
    link(handIndex+2,footIndex+2,a===null || b===null ? null : a+b+insulationOhm+bodyResistanceOhm,undefined,
      {actorId,handRegion:hand.region,footRegion:foot.region,bodyResistanceOhm,insulationOhm})
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
  if (!Number.isFinite(dist[1])) {
    if (connected(graph)) return {status:'unknown'}
    const frozenContacts:('source'|'return')[] = []
    if (iceAt(scene,contactPoint)) frozenContacts.push('source')
    if (iceAt(scene,returnContact)) frozenContacts.push('return')
    return {status:'open',...(frozenContacts.length ? {frozenContacts} : {})}
  }

  const path: SceneObject[] = []
  const bodyPath:BridgePath[] = []
  for (let i = 1; previous[i];) {
    const step = previous[i]!
    if (step.link.direct) path.push(step.link.direct)
    if (step.link.body) bodyPath.push(step.link.body)
    if (step.from >= 2) path.push(parts[step.from - 2].object)
    i = step.from
  }
  const ohms = dist[1], currentA = Math.min(limitA, voltageV / ohms)
  const ampSquaredSeconds = currentA * currentA * durationMs / 1000
  return {
    status: 'closed', ohms, currentA, energyJ: currentA * currentA * ohms * durationMs / 1000,
    path: path.reverse().map(({ id, name }) => ({ id, name })),
    ...(bodyPath.length ? {bodyPath:bodyPath.reverse().map(body=>({...body,energyJ:ampSquaredSeconds*body.bodyResistanceOhm}))} : {}),
  }
}
