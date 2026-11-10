import { addAmounts, amountFromNumber, compareAmounts, exactAmount, scaleAmount, subtractAmounts } from './exactWork'
import type { ExactAmount } from './exactWork'
import type { RoundWorkEntry } from './roundWork'
import type { Scene, SceneObject, ScenePosition, SceneSupport, SceneToken } from './sceneTypes'
import { arcHeight, arcSlabs, segmentSlab as slab } from './sceneGeometry'
import { isTerrainMovement } from './actionDeclarations'
import { liquidWaterHeight, supportsSceneTokens, waterIceCover } from './waterPhysics'
import { FLOOR_FILM_M, surfaceContact } from './surfaceTraction'
import type { SurfaceContact, TractionTravel } from './surfaceTraction'
import { canMarkClimbable, climbPath, jumpMotion } from './terrainMovement'
import type { JumpMotion } from './terrainMovement'
import { fallSweep } from './structuralPhysics'
import { liquidSpans, mergeSpans, SWIM_DRAFT, validSwimHeight, waterSupportAt } from './aquaticMotion'
export type MovementBody = { actorId: string; heightM: number; flightReason?: string }
export type MovementPlan = { work: RoundWorkEntry; startMs: ExactAmount; endMs: ExactAmount; points: ScenePosition[];
  lengths: number[]; distance: number; jump?: JumpMotion; climb?: SceneObject; swimHeightM?:number }
export type MovementChange = { workId: string; actorId: string; from: ScenePosition; to: ScenePosition; support: SceneSupport; atMs: ExactAmount; completed: boolean;
  terrain?: {kind:'jump';apexZ:number;launchMs:number;landingMs:number} | {kind:'climb';objectId:string} | {kind:'swim'} }
export const MAX_MOVEMENT_SEGMENTS = 4000, MAX_MOVEMENT_CHECKS = 200000
const EPS = 1e-6, one = exactAmount(1n)
const scalar = (v: ExactAmount) => Number(v.numerator) / Number(v.denominator)
const point = (p: ScenePosition): ScenePosition => ({ x: p.x, y: p.y, z: p.z })
const mix = (a: ScenePosition, b: ScenePosition, t: number): ScenePosition => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
const curvePoint = (a:ScenePosition,b:ScenePosition,arcM:number,t:number):ScenePosition =>
  ({...mix(a,b,t),z:arcHeight(a.z,b.z,arcM,t)})
const same = (a: ScenePosition, b: ScenePosition) => ['x', 'y', 'z'].every(k => Math.abs(a[k as keyof ScenePosition] - b[k as keyof ScenePosition]) <= EPS)
function path(points: ScenePosition[]) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y, p.z - points[i].z))
  return { points, lengths, distance: lengths.reduce((a, b) => a + b, 0) }
}
function onPath(p: Pick<MovementPlan, 'points' | 'lengths' | 'distance' | 'jump'>, fraction: number): ScenePosition {
  if (fraction <= 0) return point(p.points[0])
  if (fraction >= 1) return point(p.points.at(-1)!)
  if (p.jump) return curvePoint(p.points[0],p.points[1],p.jump.arcM,fraction)
  if (!p.distance) return point(p.points.at(-1)!)
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
export function prepareMovement(work: RoundWorkEntry, token: SceneToken | undefined, scene: Scene | undefined,
    startMs: ExactAmount, endMs: ExactAmount, roundEnd:ExactAmount, heightM:number|undefined): MovementPlan {
  if (work.action.kind !== 'move' || !token || !scene || heightM===undefined) throw Error('Перед движением размести героя в сцене сбора.')
  if (token.fall) throw Error('Герой падает. Запланируй маршрут после приземления.')
  if (!work.movement && compareAmounts(work.amount.remaining, work.amount.total) !== 0) throw Error('У прежнего движения нет начальной позиции. Согласуй восстановление маршрута с мастером; позиция не угадана.')
  const initial = work.movement?.start ?? point(token), geometry = path([initial, ...work.action.route.map(point)])
  if (work.movement && (Math.abs(work.movement.diameter - token.diameter) > EPS || !same(onPath(geometry, scalar(beforeProgress(work))), token))) {
    throw Error('Позиция или диаметр героя изменились относительно сохранённого движения. Требуется решение мастера.')
  }
  if (!geometry.points.every(p => p.x >= 0 && p.x <= scene.width && p.y >= 0 && p.y <= scene.depth && p.z >= scene.minZ && p.z <= scene.maxZ)) throw Error('Маршрут выходит за пределы сцены.')
  if (work.action.support==='swim') {
    if (!scene.physics?.aquatics) throw Error('Мастер должен включить плавание в физических условиях сцены.')
    if (!validSwimHeight(heightM)) throw Error('Для плавания укажи высоту тела от 0,1 до 100 м.')
    if (work.movement && work.movement.swimHeightM!==heightM || token.support.kind==='water' && token.support.heightM!==heightM) {
      throw Error('Высота тела изменилась относительно плавания. Согласуй новую высоту отметки и маршрут.')
    }
    if (token.support.kind!=='water' && !geometry.points.some(p=>waterSupportAt(scene,p,heightM))) throw Error('На маршруте нужна хотя бы одна точка в воде достаточной глубины.')
    work.movement = {start:point(initial),diameter:token.diameter,swimHeightM:heightM}
    return {work,startMs,endMs,...geometry,swimHeightM:heightM}
  }
  if (token.support.kind==='water' && work.action.support!=='air') throw Error('Сначала выйди из воды маршрутом плавания.')
  if (work.action.support === 'ground' && !geometry.points.every(p => Math.abs(p.z - initial.z) <= EPS)) throw Error('Ходьба требует непрерывной опоры на одной высоте. Для смены высоты выбери подходящий способ движения.')
  if (isTerrainMovement(work.action.support)) {
    if (work.movement || compareAmounts(endMs,roundEnd)>0) throw Error('Прыжок, подъём или спуск должны целиком помещаться в один раунд. Измени порядок, бюджет или длительность раунда.')
    if (token.support.kind==='air') throw Error('Прыжок, подъём или спуск начинаются на опоре.')
    const goal = geometry.points[1]
    supportAt(scene,initial)
    supportAt(scene,goal)
    if (work.action.support==='jump') {
      const jump = jumpMotion(scene,initial,goal,scalar(subtractAmounts(endMs,startMs))/1000)
      return {work,startMs,endMs,...geometry,jump}
    }
    const {anchor,via} = climbPath(scene,initial,goal,token.diameter/2,heightM)
    return {work,startMs,endMs,...path([initial,via,goal]),climb:anchor}
  }
  work.movement = { start: point(initial), diameter: token.diameter }
  return { work, startMs, endMs, ...geometry }
}
const solidForSwimmer = (object:SceneObject) => object.kind!=='water' || waterIceCover(object)==='ice'
export function standingSupportAt(scene:Scene,p:ScenePosition,swimming=false):SceneSupport|undefined {
  if (Math.abs(p.z - scene.groundZ) < EPS) return { kind: 'ground' }
  const surface = scene.objects.find(o => (!swimming || solidForSwimmer(o)) && supportsSceneTokens(o) &&
    Math.abs(p.z-o.z-o.height)<EPS && Math.abs(p.x-o.x)<=o.width/2 && Math.abs(p.y-o.y)<=o.depth/2)
  return surface && {kind:'object',objectId:surface.id}
}
export function supportAt(scene: Scene, p: ScenePosition): SceneSupport {
  const support = standingSupportAt(scene,p)
  if (!support) throw Error('На маршруте нет опоры в указанной точке. Выбери точку на земле или на пригодном для опоры объекте.')
  return support
}
export function movementSupport(scene:Scene,plan:MovementPlan,time:ExactAmount,position:ScenePosition):SceneSupport {
  if (plan.swimHeightM!==undefined) {
    const support = waterSupportAt(scene,position,plan.swimHeightM) ?? standingSupportAt(scene,position,true)
    if (!support) throw Error('В точке маршрута недостаточно воды для плавания или твёрдой опоры для выхода.')
    return support
  }
  if (plan.work.action.kind==='move' && plan.work.action.support==='air' ||
    (plan.jump || plan.climb) && compareAmounts(time,plan.startMs)>0 && compareAmounts(time,plan.endMs)<0) return {kind:'air'}
  return supportAt(scene,position)
}
export function jumpTraction(scene:Scene,location:ScenePosition,check:()=>void):SurfaceContact|undefined {
  const profile = scene.physics?.traction
  if (!profile) return undefined
  let limiting:SurfaceContact|undefined
  for (const object of scene.objects) {
    check()
    const contact = surfaceContact(object,profile,location,location)
    if (contact && (!limiting || contact.factor<limiting.factor)) limiting = contact
  }
  return limiting
}
type Range = [number, number]
function rectangle(a: ScenePosition, b: ScenePosition, x: number, y: number, width: number, depth: number): Range | null {
  const horizontal = slab(a.x, b.x, x - width / 2, x + width / 2), vertical = slab(a.y, b.y, y - depth / 2, y + depth / 2)
  if (!horizontal || !vertical) return null
  const left = Math.max(horizontal[0], vertical[0]), right = Math.min(horizontal[1], vertical[1])
  return left <= right ? [left, right] : null
}
function standingSpans(scene:Scene,a:ScenePosition,b:ScenePosition,check:()=>void,swimming=false):Range[] {
  if (Math.abs(a.z-scene.groundZ)<EPS && Math.abs(b.z-scene.groundZ)<EPS) return [[0,1]]
  const ranges: Range[] = []
  for (const o of scene.objects) {
    check()
    if (swimming && !solidForSwimmer(o) || !supportsSceneTokens(o) || Math.abs(a.z - o.z - o.height) >= EPS || Math.abs(b.z - o.z - o.height) >= EPS) continue
    const covered = rectangle(a, b, o.x, o.y, o.width, o.depth)
    if (covered) ranges.push(covered)
  }
  return ranges
}
function continuousSupport(ranges:Range[]) {
  const [first] = mergeSpans(ranges)
  return !!first && first[0]<=1e-12 && first[1]>=1
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
export type MovementPiece = { start: number; end: number; a: ScenePosition; b: ScenePosition; arcM?:number }
function tokenPosition(token: SceneToken, actorPlans: MovementPlan[], time: ExactAmount) {
  const latest = actorPlans.findLast(p=>compareAmounts(p.startMs,time)<=0)
  return latest ? movementPosition(latest,time) : point(token)
}
function pieces(token: SceneToken, plans: MovementPlan[], from: ExactAmount, to: ExactAmount): MovementPiece[] {
  const fromNumber = scalar(from), toNumber = scalar(to), span = toNumber - fromNumber, cuts = [0, 1]
  const actorPlans = plans.filter(p => p.work.actorId === token.actorId)
  for (const p of actorPlans) {
    const before = scalar(beforeProgress(p.work)), start = scalar(p.startMs), end = scalar(p.endMs)
    const times = [start, end]; let distance = 0
    for (const length of p.jump ? [] : p.lengths) {
      distance += length
      if (p.distance && before < 1) times.push(start + (distance / p.distance - before) / (1 - before) * (end - start))
    }
    for (const t of times) if (t > fromNumber && t < toNumber) cuts.push((t - fromNumber) / span)
  }
  const sorted = [...new Set(cuts)].sort((a, b) => a - b)
  const at = (fraction: number) => fraction === 0 ? from : fraction === 1 ? to : addAmounts(from, scaleAmount(subtractAmounts(to, from), amountFromNumber(fraction)))
  return sorted.slice(1).map((end, i) => {
    const start = sorted[i], middle = fromNumber+span*(start+end)/2
    const flight = actorPlans.find(p=>p.jump && scalar(p.startMs)<middle && scalar(p.endMs)>middle)
    return { start, end, a:tokenPosition(token,actorPlans,at(start)), b:tokenPosition(token,actorPlans,at(end)),
      ...(flight?.jump ? {arcM:flight.jump.arcM*(span*(end-start)/scalar(subtractAmounts(flight.endMs,flight.startMs)))**2} : {}) }
  })
}
function portion(p:MovementPiece,t:number) {
  const fraction = (t-p.start)/(p.end-p.start)
  return p.arcM ? curvePoint(p.a,p.b,p.arcM,fraction) : mix(p.a,p.b,fraction)
}
const portionArc = (p:MovementPiece,start:number,end:number) => (p.arcM ?? 0)*((end-start)/(p.end-p.start))**2

function fallingPieces(scene:Scene,token:SceneToken,seconds:number):MovementPiece[]|undefined {
  const sweep = fallSweep(scene,token,seconds)
  if (!sweep) return undefined
  const a = point(token), b = {...a,z:sweep.z}, end = sweep.elapsed/seconds
  const pieces:MovementPiece[] = end>0 ? [{start:0,end,a,b,arcM:sweep.arcM}] : []
  if (end<1) pieces.push({start:end,end:1,a:b,b})
  return pieces
}

function checkClimbAnchor(scene:Scene,anchor:SceneObject) {
  const current = scene.objects.find(o=>o.id===anchor.id)
  if (!current?.physics?.climbable || !canMarkClimbable(current) || !same(current,anchor) ||
    (['width','depth','height'] as const).some(k=>Math.abs(current[k]-anchor[k])>EPS)) {
    throw Error('Опора для подъёма или спуска изменилась во время движения. Согласуй другой маршрут или порядок действий.')
  }
}
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

// Upright cylinders, straight legs or jump arcs, and static boxes between events.
// A shared bounded check counter protects a free service from pathological input.
export function advanceMovement(scene: Scene, plans: MovementPlan[], bodies: MovementBody[], from: ExactAmount, to: ExactAmount, check: () => void,
  wetContact?: (actorId: string, object: SceneObject, kind: 'water' | 'support') => void,
  track?: (actorId:string, pieces:MovementPiece[]) => void,
  onTraction?: (actorId:string, contact:TractionTravel, speedMs:number) => void,
  swimFootSpeeds?:ReadonlyMap<string,number>) {
  const activePlans = plans.filter(p=>compareAmounts(p.startMs,to)<0 && compareAmounts(p.endMs,from)>0)
  const moving = new Set(activePlans.map(p=>p.work.actorId))
  if (compareAmounts(from, to) < 0 && moving.size) {
    const intervalSeconds = scalar(subtractAmounts(to,from))/1000
    const terrainActive = activePlans.some(p=>p.jump || p.climb || p.swimHeightM!==undefined)
    const trajectories = scene.tokens.map(t => ({ token:t,height:bodies.find(b=>b.actorId===t.actorId)!.heightM,
      pieces:(terrainActive ? fallingPieces(scene,t,intervalSeconds) : undefined) ?? pieces(t,plans,from,to) }))
    for (const t of trajectories.filter(t => moving.has(t.token.actorId))) {
      track?.(t.token.actorId,t.pieces)
      for (const p of t.pieces) {
        const middle = addAmounts(from, scaleAmount(subtractAmounts(to, from), amountFromNumber((p.start + p.end) / 2)))
        const active = activePlans.find(m=>m.work.actorId===t.token.actorId && compareAmounts(m.startMs,middle)<=0 && compareAmounts(m.endMs,middle)>=0)
        const walking = active?.work.action.kind === 'move' && active.work.action.support === 'ground'
        let liquid:Range[] = [], onFoot = walking
        if (walking) {
          if (!continuousSupport(standingSpans(scene,p.a,p.b,check))) throw Error('Маршрут ходьбы пересекает участок без опоры. Согласуй другой маршрут или способ движения.')
          if (scene.physics?.aquatics && liquidSpans(scene,p.a,p.b,0,t.height*.6,0,check).length) {
            throw Error('На маршруте слишком глубоко для ходьбы. Выбери плавание.')
          }
        }
        if (active?.swimHeightM!==undefined) {
          liquid = mergeSpans(liquidSpans(scene,p.a,p.b,0,active.swimHeightM*SWIM_DRAFT,0,check))
          if (!continuousSupport([...liquid,...standingSpans(scene,p.a,p.b,check,true)])) {
            throw Error('Маршрут плавания пересекает участок без воды достаточной глубины или твёрдой опоры.')
          }
          onFoot = !continuousSupport(liquid)
          const footSpeed = swimFootSpeeds?.get(t.token.actorId)
          if (onFoot && footSpeed!==undefined) {
            if (footSpeed<=0) throw Error('Герой может плыть, но для выхода на сушу ему нужна помощь.')
            if (Math.hypot(p.b.x-p.a.x,p.b.y-p.a.y)>footSpeed*intervalSeconds*(p.end-p.start)+EPS) {
              throw Error('На берегу скорость превышает возможности героя. Увеличь время выхода из воды.')
            }
          }
        }
        if (active?.climb) checkClimbAnchor(scene,active.climb)
        const traction = onFoot && onTraction && scene.physics?.traction
        const distance = traction ? Math.hypot(p.b.x-p.a.x,p.b.y-p.a.y) : 0
        for (const o of scene.objects) {
          check()
          if (traction && onTraction && distance > EPS) {
            const patch = surfaceContact(o,traction,p.a,p.b)
            if (patch) {
              const {start,end,...contact} = patch
              const submerged = liquid.reduce((sum,[left,right])=>sum+Math.max(0,Math.min(end,right)-Math.max(start,left)),0)
              const onFootM = distance*(end-start-submerged)
              if (onFootM>EPS) onTraction(t.token.actorId,{...contact,distanceM:onFootM},distance/(intervalSeconds*(p.end-p.start)))
            }
          }
          if (wetContact && walking) {
            const depth = o.water && (o.water.flow || scene.physics?.atmosphere) ? liquidWaterHeight(o.water, o.height) : 0
            const water = depth > 0 && p.a.z >= o.z - EPS && p.a.z <= o.z + depth + EPS
            const wetSupport = o.physics && o.physics.wetnessFraction > 0 && supportsSceneTokens(o) && Math.abs(p.a.z - o.z - o.height) < EPS
            if ((water || wetSupport) && rectangle(p.a, p.b, o.x, o.y, o.width, o.depth)) {
              wetContact(t.token.actorId, o, water ? 'water' : 'support')
            }
          }
          const solidIce = (active?.jump && o.kind==='water' && supportsSceneTokens(o)) ||
            (scene.physics?.aquatics && o.height>FLOOR_FILM_M && waterIceCover(o)==='ice')
          if ((!o.blocksMovement && !solidIce) || o.height <= 0 || o.kind === 'door' && o.open) continue
          const overlaps = arcSlabs(p.a.z-o.z,p.b.z-o.z,p.arcM ?? 0,-t.height+EPS,o.height-EPS)
          if (overlaps.some(([start,end])=>rectangleDistance(mix(p.a,p.b,start),mix(p.a,p.b,end),o.x,o.y,o.width,o.depth) < (t.token.diameter/2-EPS)**2)) {
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
          const overlaps = arcSlabs(a0.z-b0.z,a1.z-b1.z,portionArc(ap,start,end)-portionArc(bp,start,end),-a.height+EPS,b.height-EPS)
          const r0 = {x:a0.x-b0.x,y:a0.y-b0.y,z:0}, r1 = {x:a1.x-b1.x,y:a1.y-b1.y,z:0}
          if (overlaps.some(([left,right])=>closest(mix(r0,r1,left),mix(r0,r1,right),0,0)<((a.token.diameter+b.token.diameter)/2-EPS)**2)) {
            throw Error('Траектории персонажей пересекаются в одно время. Мастер должен согласовать движение до применения.')
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
    token.support = movementSupport(scene,current,to,location)
  }
}
