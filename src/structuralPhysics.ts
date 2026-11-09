import { overlapLength } from './sceneGeometry'
import type { Scene, SceneObject, SceneSupport, SceneToken } from './sceneTypes'
import { supportsSceneTokens } from './waterPhysics'

const EPS_M = 1e-8
const gravity = (scene: Scene) => scene.physics?.gravityMs2 ?? 9.81

export type StructuralImpactOutcome = {
  kind: 'structural-impact'
  objectId: string
  name: string
  energyJ: number
  absorbedJ: number
  failureJ: number
  collapsed: boolean
  releasedActors: string[]
}

export function strikeStructure(scene: Scene, object: SceneObject, energyJ: number): StructuralImpactOutcome {
  const structure = object.physics!.structure!
  const absorbedJ = Math.min(structure.failureJ, structure.absorbedJ + energyJ)
  const collapsed = absorbedJ === structure.failureJ
  const releasedActors: string[] = []
  if (collapsed) {
    scene.objects = scene.objects.filter(o => o.id !== object.id)
    for (const token of scene.tokens) {
      if (token.support.kind !== 'object' || token.support.objectId !== object.id) continue
      releasedActors.push(token.actorId)
      token.support = { kind: 'air' }
      if (gravity(scene) > 0) token.fall = { sourceId: object.id, fromZ: token.z, speedMs: 0 }
    }
  } else structure.absorbedJ = absorbedJ
  return { kind:'structural-impact', objectId:object.id, name:object.name, energyJ, absorbedJ,
    failureJ:structure.failureJ, collapsed, releasedActors }
}

type Surface = { z: number; support: SceneSupport }

function landingSurface(scene: Scene, token: SceneToken): Surface {
  let surface: Surface = scene.groundZ <= token.z
    ? { z:scene.groundZ, support:{ kind:'ground' } }
    : { z:scene.minZ, support:{ kind:'air' } }
  for (const object of scene.objects) {
    const top = object.z + object.height
    if (top > token.z || top < surface.z || !supportsSceneTokens(object) ||
        Math.abs(token.x - object.x) > object.width / 2 || Math.abs(token.y - object.y) > object.depth / 2) continue
    if (top === surface.z && (surface.support.kind === 'ground' ||
        surface.support.kind === 'object' && surface.support.objectId < object.id)) continue
    surface = { z:top, support:{ kind:'object', objectId:object.id } }
  }
  return surface
}

export function fallTravelSeconds(distance: number, speed: number, g: number): number {
  if (distance <= EPS_M) return 0
  const sum = speed + Math.sqrt(speed * speed + 2 * g * distance)
  return sum > 0 ? 2 * distance / sum : Infinity
}

export function nextFallSeconds(scene: Scene): number {
  let nearest = Infinity
  const g = gravity(scene)
  for (const token of scene.tokens) {
    if (token.fall) nearest = Math.min(nearest, fallTravelSeconds(token.z - landingSurface(scene, token).z, token.fall.speedMs, g))
  }
  return nearest
}

export type FallLanding = {
  actorId: string
  sourceId: string
  fromZ: number
  toZ: number
  speedMs: number
  support: SceneSupport
}

// Falls use vertical sweeps and the scene's gravity. Air tokens without an
// active fall are untouched. The lower frame boundary is not a physical floor.
export function advanceFalls(scene: Scene, seconds: number): FallLanding[] {
  const g = gravity(scene)
  const motions = scene.tokens.flatMap(token => {
    const fall = token.fall
    if (!fall) return []
    const surface = landingSurface(scene, token), distance = token.z - surface.z
    const travel = (fall.speedMs + .5 * g * seconds) * seconds
    const landed = distance <= travel + EPS_M
    const z = landed ? surface.z : token.z - travel
    const speedMs = landed ? Math.sqrt(fall.speedMs ** 2 + 2 * g * distance) : fall.speedMs + g * seconds
    if (scene.objects.some(o => {
      if (!o.blocksMovement || o.kind === 'door' && o.open || o.kind === 'water' ||
          overlapLength(z, token.z, o.z, o.z + o.height) <= EPS_M) return false
      const dx = Math.max(0, Math.abs(token.x - o.x) - o.width / 2)
      const dy = Math.max(0, Math.abs(token.y - o.y) - o.depth / 2)
      return Math.hypot(dx, dy) < token.diameter / 2 - EPS_M
    })) throw Error('Падение пересекает препятствие сбоку. Согласуй опору или положение героя до расчёта.')
    return [{ token, fall, z, speedMs, surface, landed }]
  })
  const heights = new Map(motions.map(motion => [motion.token.actorId, motion.z]))
  for (const { token, z, landed, surface } of motions) {
    if (!landed || surface.support.kind === 'air') continue
    if (scene.tokens.some(other => other !== token && Math.abs((heights.get(other.actorId) ?? other.z) - z) < EPS_M &&
        Math.hypot(other.x - token.x, other.y - token.y) < (other.diameter + token.diameter) / 2 - EPS_M)) {
      throw Error('В месте приземления находится другое существо. Мастер должен согласовать исход столкновения.')
    }
  }
  return motions.flatMap(({ token, fall, z, speedMs, surface, landed }) => {
    token.z = z
    if (!landed) { fall.speedMs = speedMs; return [] }
    token.support = surface.support
    delete token.fall
    return [{ actorId:token.actorId, sourceId:fall.sourceId, fromZ:fall.fromZ, toZ:z, speedMs, support:surface.support }]
  })
}
