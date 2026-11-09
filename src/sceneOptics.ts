import { objectLightReachesRoom, objectLightSource } from './legacyObjectBehavior'
import { DEFAULT_LIGHT_CD, lightLevel } from './opticalProfiles'
import { objectBounds, segmentSlab } from './sceneGeometry'
import type { ObjectBounds } from './sceneGeometry'
import type { Scene, SceneObject, ScenePosition } from './sceneTypes'
import { airOptics, distanceM } from './airOptics'

const EDGE_M = .000001
const NEAR_LIGHT_M = .25
const EYE_HEIGHT_M = 1.5
const TARGET_HEIGHT_M = 1.2

const axes = ['x','y','z'] as const
type Obstacle = { id: string; bounds: ObjectBounds }
type Emitter = { id: string; point: ScenePosition; intensityCd: number }
export const sceneEye = (scene:Scene,point:ScenePosition) =>
  ({x:point.x,y:point.y,z:Math.min(scene.maxZ,point.z+EYE_HEIGHT_M)})

function luminousIntensity(object: SceneObject) {
  return object.active === false || !objectLightReachesRoom(object) ? 0 : object.physics?.lightIntensityCd ?? DEFAULT_LIGHT_CD
}

export function visibleLightLevel(object: SceneObject) {
  return objectLightSource(object) ? lightLevel(luminousIntensity(object)) : undefined
}

function emitter(object: SceneObject): Emitter | undefined {
  const intensityCd = luminousIntensity(object)
  if (!intensityCd) return undefined
  return { id:object.id, intensityCd, point:{x:object.x, y:object.y, z:object.z + object.height * .8} }
}

function rayBlocked(obstacles: readonly Obstacle[], from: ScenePosition, to: ScenePosition, skipStart?: string, skipEnd?: string) {
  if (from.x === to.x && from.y === to.y && from.z === to.z) return false
  return obstacles.some(({id, bounds}) => {
    if (id === skipStart || id === skipEnd) return false
    let enter = 0, exit = 1
    for (const axis of axes) {
      const low = bounds.min[axis] + EDGE_M, high = bounds.max[axis] - EDGE_M
      if (low >= high) return false
      const hit = segmentSlab(from[axis], to[axis], low, high)
      if (!hit) return false
      enter = Math.max(enter, hit[0])
      exit = Math.min(exit, hit[1])
      if (enter >= exit) return false
    }
    return true
  })
}

function illuminance(intensityCd: number, metres: number, opticalDepth: number) {
  return intensityCd * Math.exp(-opticalDepth) / Math.max(NEAR_LIGHT_M, metres) ** 2
}

// A per-observer snapshot. Geometry and light are evaluated on the server
// before disclosure is projected; this result does not contain hidden sources.
export function sceneOptics(scene: Scene, observer: ScenePosition, medium = airOptics(scene)) {
  const vision = scene.physics?.vision
  if (!vision) return undefined
  const { ambientLux, detectionLux } = vision
  const obstacles = scene.objects.filter(o => o.blocksSight && !(o.kind === 'door' && o.open))
    .map(o => ({id:o.id, bounds:objectBounds(o)}))
  const sources = scene.objects.flatMap(o => {
    const source = emitter(o)
    return source ? [source] : []
  })
  const sourcesById = new Map(sources.map(source => [source.id, source]))
  const raised = (p: ScenePosition, metres: number) => ({x:p.x, y:p.y, z:Math.min(scene.maxZ, p.z + metres)})
  const eye = sceneEye(scene,observer)

  function sees(point: ScenePosition, objectId?: string) {
    // Recognize the glowing part itself at its distance from the eye.
    const direct = objectId && sourcesById.get(objectId)
    if (direct) {
      const metres = distanceM(direct.point,eye)
      if (illuminance(direct.intensityCd,metres,medium.depthBetween(eye,direct.point,metres)) >= detectionLux &&
          !rayBlocked(obstacles,eye,direct.point,undefined,objectId)) return true
    }
    const transmission = Math.exp(-medium.depthBetween(eye,point))
    const needed = detectionLux / transmission
    if (!Number.isFinite(needed) || ambientLux < needed && !sources.length ||
        rayBlocked(obstacles, eye, point, undefined, objectId)) return false
    if (ambientLux >= needed) return true

    // Test an optimistic total before tracing the source rays. In a dark
    // region with no sufficient light we can skip all the shadow tests.
    let possible = ambientLux, received = ambientLux
    const candidates = sources.flatMap(source => {
      if (source.id === objectId) return []
      const metres = distanceM(source.point,point)
      const lux = illuminance(source.intensityCd,metres,medium.depthBetween(source.point,point,metres))
      if (!lux) return []
      possible += lux
      return [{source, lux}]
    })
    if (possible < needed) return false
    for (const {source, lux} of candidates) {
      if (rayBlocked(obstacles, source.point, point, source.id, objectId)) {
        possible -= lux
        if (possible < needed) return false
      } else {
        received += lux
        if (received >= needed) return true
      }
    }
    return false
  }

  return {
    dim:ambientLux < detectionLux,
    seesPoint:sees,
    seesToken:(point: ScenePosition) => sees(raised(point, TARGET_HEIGHT_M)),
    seesObject:(object: SceneObject) => sees(raised(object, object.height / 2), object.id),
  }
}
