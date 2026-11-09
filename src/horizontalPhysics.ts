import { isSliding, MAX_SLIDE_SPEED_MS, onSlideFloor } from './mechanicalProfiles'
import { kineticEnergyJ } from './physicsUnits'
import { overlapLength } from './sceneGeometry'
import type { Scene, SceneObject, ScenePosition } from './sceneTypes'
import { strikeStructure } from './structuralPhysics'
import type { StructuralImpactOutcome } from './structuralPhysics'
import { surfaceContact } from './surfaceTraction'
import type { SurfaceContact, TractionTravel } from './surfaceTraction'

const EPS = 1e-8
const isRider = (scene: Scene, objectId: string) =>
  scene.tokens.some(token => token.support.kind === 'object' && token.support.objectId === objectId)

export type PushOutcome = { kind: 'push-object'; objectId: string; name: string; impulseNs: number; speedMs: number }

export function pushObject(scene: Scene, object: SceneObject, origin: ScenePosition, aim: ScenePosition, impulseNs: number): PushOutcome {
  const body = object.physics, slide = body?.sliding
  if (!body || !slide || !onSlideFloor(object, scene)) throw Error('Толкать можно настроенный твёрдый предмет на полу сцены.')
  if (isRider(scene, object.id)) throw Error('На предмете стоит персонаж. Согласуй его опору перед толчком.')
  if (scene.objects.some(other => other !== object && isSliding(other.physics?.sliding))) {
    throw Error('В этой сцене уже скользит предмет. Дождись его остановки, чтобы толкнуть другой.')
  }
  const dx = aim.x - origin.x, dy = aim.y - origin.y, distance = Math.hypot(dx, dy)
  if (distance <= EPS) throw Error('Для толчка нужна точка в стороне от применяющего по X или Y.')
  const speed = impulseNs / body.massKg
  const vxMs = slide.vxMs + dx / distance * speed, vyMs = slide.vyMs + dy / distance * speed
  const speedMs = Math.hypot(vxMs, vyMs)
  if (!Number.isFinite(speedMs) || speedMs > MAX_SLIDE_SPEED_MS) throw Error('Скорость после толчка выше предела расчёта. Проверь массу и импульс.')
  slide.vxMs = speedMs <= EPS ? 0 : vxMs
  slide.vyMs = speedMs <= EPS ? 0 : vyMs
  return { kind:'push-object', objectId:object.id, name:object.name, impulseNs, speedMs:speedMs <= EPS ? 0 : speedMs }
}

export type SlideContact =
  | { kind: 'boundary' }
  | { kind: 'object'; objectId: string; name: string }
  | { kind: 'actor'; actorId: string }

type SlidePlan = {
  object: SceneObject
  width: number
  depth: number
  speedMs: number
  dirX: number
  dirY: number
  deceleration: number
  endSeconds: number
  endDistance: number
  contact?: SlideContact
  travel?: SlideTravel
}
type TravelSection = {fromM:number; fromSeconds:number; toSeconds:number; speedMs:number; deceleration:number}
type SlideTravel = {
  sections:TravelSection[]; contacts:SurfaceContact[]; maxDistance:number
  endDistance:number; endSeconds:number; endSpeedMs:number
}

// Ray entry into a rectangle expanded by the moving footprint. A body on an
// edge can move away or along it. Point contact at a grazing corner is free.
function rectangleEntry(moving: SceneObject, dirX: number, dirY: number, x: number, y: number, width: number, depth: number) {
  function interval(start: number, direction: number, center: number, half: number): [number, number] | undefined {
    const low = center - half, high = center + half
    if (!direction) return start > low + EPS && start < high - EPS ? [-Infinity, Infinity] : undefined
    const a = (low - start) / direction, b = (high - start) / direction
    return [Math.min(a, b), Math.max(a, b)]
  }
  const dx = interval(moving.x, dirX, x, (moving.width + width) / 2)
  const dy = interval(moving.y, dirY, y, (moving.depth + depth) / 2)
  if (!dx || !dy) return Infinity
  const enter = Math.max(0, dx[0], dy[0])
  return Math.min(dx[1], dy[1]) > enter + EPS ? enter : Infinity
}

function frameDistance(center: number, direction: number, size: number, span: number) {
  if (!direction) return Infinity
  return (direction < 0 ? size / 2 - center : span - size / 2 - center) / direction
}

// Between footprint boundaries the drag is constant. Carry velocity across
// the boundary, then use the new coefficient for the next part of the path.
function slideTravel(scene:Scene,object:SceneObject,dirX:number,dirY:number,limit:number,speedMs:number,deceleration:number):SlideTravel|undefined {
  const profile = scene.physics?.traction
  if (!profile || !limit) return undefined
  const end = {x:object.x+dirX*limit,y:object.y+dirY*limit,z:object.z}
  const contacts = scene.objects.flatMap(other=>{
    const patch = other !== object && surfaceContact(other,profile,object,end)
    return patch ? [patch] : []
  })
  if (!contacts.length) return undefined
  const cuts = [...new Set([0,1,...contacts.flatMap(patch=>[patch.start,patch.end])])].sort((a,b)=>a-b)
  const sections:TravelSection[] = []
  let distance = 0, elapsed = 0, speed = speedMs
  for (let i=1;i<cuts.length && speed>0;i++) {
    const middle = (cuts[i-1]+cuts[i])/2, goal = cuts[i]*limit
    if (goal <= distance) continue
    const factor = contacts.reduce((lowest,patch)=>middle >= patch.start && middle <= patch.end ? Math.min(lowest,patch.factor) : lowest,1)
    const drag = deceleration*factor, stoppingDistance = drag>0 ? speed**2/(2*drag) : Infinity
    const stops = stoppingDistance < goal-distance, step = stops ? stoppingDistance : goal-distance
    const exitSpeed = stops ? 0 : Math.sqrt(Math.max(0,speed**2-2*drag*step))
    const endSeconds = elapsed+2*step/(speed+exitSpeed)
    sections.push({fromM:distance,fromSeconds:elapsed,toSeconds:endSeconds,speedMs:speed,deceleration:drag})
    distance = stops ? distance+step : goal
    elapsed = endSeconds
    speed = exitSpeed
  }
  return {sections,contacts,maxDistance:limit,endDistance:distance,endSeconds:elapsed,endSpeedMs:speed}
}

export function planSlide(scene: Scene, movingActors?: ReadonlySet<string>): SlidePlan | undefined {
  const object = scene.objects.find(object => isSliding(object.physics?.sliding))
  if (!object) return undefined
  const body = object.physics!, slide = body.sliding!
  const speedMs = Math.hypot(slide.vxMs, slide.vyMs)
  const dirX = slide.vxMs / speedMs, dirY = slide.vyMs / speedMs
  const friction = slide.dryFriction + ((slide.wetFriction ?? slide.dryFriction) - slide.dryFriction) * body.wetnessFraction
  const deceleration = (scene.physics?.gravityMs2 ?? 9.81) * friction
  let endDistance = Math.max(0, Math.min(frameDistance(object.x, dirX, object.width, scene.width),
    frameDistance(object.y, dirY, object.depth, scene.depth)))
  let contact: SlideContact = { kind:'boundary' }
  for (const other of scene.objects) {
    if (other === object || !other.blocksMovement || other.kind === 'water' || other.kind === 'door' && other.open ||
        overlapLength(object.z, object.z + object.height, other.z, other.z + other.height) <= EPS) continue
    const entry = rectangleEntry(object, dirX, dirY, other.x, other.y, other.width, other.depth)
    if (entry < endDistance || entry === endDistance && (contact.kind !== 'object' || other.id < contact.objectId)) {
      endDistance = entry
      contact = { kind:'object', objectId:other.id, name:other.name }
    }
  }
  for (const token of scene.tokens) {
    if (movingActors?.has(token.actorId) || token.z < object.z - EPS || !token.fall && token.z >= object.z + object.height - EPS) continue
    // Character footprints are conservative squares at this stage. Falling
    // heroes reserve the ground below them while their vertical motion settles.
    const entry = rectangleEntry(object, dirX, dirY, token.x, token.y, token.diameter, token.diameter)
    if (entry < endDistance || entry === endDistance && (contact.kind !== 'actor' || token.actorId < contact.actorId)) {
      endDistance = entry
      contact = { kind:'actor', actorId:token.actorId }
    }
  }
  const travel = slideTravel(scene,object,dirX,dirY,endDistance,speedMs,deceleration)
  if (travel) {
    return {object,width:scene.width,depth:scene.depth,speedMs,dirX,dirY,deceleration,travel,
      endSeconds:travel.endSeconds,endDistance:travel.endDistance,
      ...(travel.endDistance===endDistance ? {contact} : {})}
  }
  const stoppingDistance = deceleration > 0 ? speedMs ** 2 / (2 * deceleration) : Infinity
  if (stoppingDistance < endDistance) {
    return { object, width:scene.width, depth:scene.depth, speedMs, dirX, dirY, deceleration,
      endSeconds:speedMs / deceleration, endDistance:stoppingDistance }
  }
  const contactSpeed = Math.sqrt(Math.max(0, speedMs ** 2 - 2 * deceleration * endDistance))
  return { object, width:scene.width, depth:scene.depth, speedMs, dirX, dirY, deceleration,
    endSeconds:2 * endDistance / (speedMs + contactSpeed), endDistance, contact }
}

export type SlideStep = {
  objectId: string
  name: string
  point: ScenePosition
  vxMs: number
  vyMs: number
  speedMs: number
  stopped: boolean
  collision?: { contact: SlideContact; speedMs: number; energyJ: number }
  traction?: TractionTravel[]
}

export function slideStep(plan: SlidePlan, seconds: number): SlideStep {
  const { object, dirX, dirY, deceleration, endDistance, speedMs, contact, travel } = plan
  const slide = object.physics!.sliding!
  const stopped = seconds >= plan.endSeconds
  const section = travel?.sections.find(section=>seconds<section.toSeconds)
  const elapsed = section ? Math.max(0,seconds-section.fromSeconds) : seconds
  const speedAtStart = section?.speedMs ?? speedMs, drag = section?.deceleration ?? deceleration
  const distance = stopped ? endDistance : (section?.fromM ?? 0)+elapsed*(speedAtStart-.5*drag*elapsed)
  const remaining = stopped ? 0 : Math.max(0,speedAtStart-drag*elapsed)
  const limit = (point: number, size: number, frame: number) => Math.min(frame - size / 2, Math.max(size / 2, point))
  const point = { x:limit(object.x + dirX * distance, object.width, plan.width),
    y:limit(object.y + dirY * distance, object.depth, plan.depth), z:object.z }
  const impactSpeed = stopped && contact ? travel?.endSpeedMs ?? Math.sqrt(Math.max(0, speedMs ** 2 - 2 * deceleration * distance)) : 0
  const traction = travel?.contacts.flatMap(({start,end,...patch})=>{
    const distanceM = Math.min(distance,end*travel.maxDistance)-start*travel.maxDistance
    return distanceM>EPS ? [{...patch,distanceM}] : []
  })
  return { objectId:object.id, name:object.name, point, speedMs:remaining, stopped,
    vxMs:slide.vxMs * (remaining / speedMs), vyMs:slide.vyMs * (remaining / speedMs),
    ...(traction?.length ? {traction} : {}),
    ...(stopped && contact ? { collision:{contact, speedMs:impactSpeed, energyJ:kineticEnergyJ(object.physics!.massKg, impactSpeed)} } : {}) }
}

export function applySlide(scene: Scene, step: SlideStep): StructuralImpactOutcome | undefined {
  const object = scene.objects.find(object => object.id === step.objectId)!
  const slide = object.physics!.sliding!
  if (isRider(scene, object.id)) throw Error('Персонаж оказался на скользящем предмете. Согласуй приземление до расчёта.')
  Object.assign(object, step.point)
  slide.vxMs = step.vxMs
  slide.vyMs = step.vyMs
  if (step.collision?.contact.kind !== 'object' || !slide.impactTransfer || !step.collision.energyJ) return undefined
  const { objectId } = step.collision.contact
  const obstacle = scene.objects.find(object => object.id === objectId)
  if (!obstacle?.physics?.structure) return undefined
  return strikeStructure(scene, obstacle, step.collision.energyJ * slide.impactTransfer)
}

export function slideSweep(object: SceneObject, to: ScenePosition): SceneObject {
  return { ...object, x:(object.x + to.x) / 2, y:(object.y + to.y) / 2,
    width:object.width + Math.abs(to.x - object.x), depth:object.depth + Math.abs(to.y - object.y),
    blocksMovement:true, canSupport:false }
}

export function checkDoorSlideClearance(scene: Scene, objectId: string) {
  const door = scene.objects.find(o => o.id === objectId)
  if (door?.kind !== 'door' || !door.blocksMovement) return
  if (scene.objects.some(o => o.physics?.sliding && onSlideFloor(o, scene) &&
      overlapLength(door.z, door.z + door.height, o.z, o.z + o.height) > EPS &&
      Math.abs(o.x - door.x) < (o.width + door.width) / 2 - EPS &&
      Math.abs(o.y - door.y) < (o.depth + door.depth) / 2 - EPS)) {
    throw Error('Закрытию двери мешает предмет. Согласуй положение предмета перед закрытием.')
  }
}
