import { objectBounds, overlapLength } from './sceneGeometry'
import type { ObjectBounds } from './sceneGeometry'
import type { Scene, SceneObject, SceneSupport } from './sceneTypes'
import { isWaterComposition, supportsSceneTokens, waterVolumeM3, WATER_EDGE_TOLERANCE_M } from './waterPhysics'
import type { WaterComposition } from './waterPhysics'

type Cell = ObjectBounds & {
  object: SceneObject
  areaM2: number
  volumeM3: number
  saltKg: number
  sedimentKg: number
  unknown: boolean
}
type Spillway = { widthM: number; sillZ: number }
type Connection = { a: number; b: number; spillways: Spillway[] }
const EPS = WATER_EDGE_TOLERANCE_M
const MAX_STEPS = 64
const STEP_SECONDS = .25

function spillways(a: Cell, b: Cell, barriers: ObjectBounds[]): Spillway[] {
  const normal = (['x', 'y'] as const).find(axis =>
    Math.abs(a.max[axis] - b.min[axis]) <= EPS || Math.abs(b.max[axis] - a.min[axis]) <= EPS)
  if (!normal) return []
  const tangent = normal === 'x' ? 'y' : 'x'
  const from = Math.max(a.min[tangent], b.min[tangent]), to = Math.min(a.max[tangent], b.max[tangent])
  if (to - from <= EPS) return []
  const seam = Math.min(a.max[normal], b.max[normal]), floor = Math.max(a.min.z, b.min.z)
  const obstructions = barriers.filter(box =>
    box.min[normal] <= seam + EPS && box.max[normal] >= seam - EPS &&
    box.min.z <= floor + EPS && box.max.z > floor + EPS &&
    overlapLength(from, to, box.min[tangent], box.max[tangent]) > EPS)
  const cuts = [from, to, ...obstructions.flatMap(box => [Math.max(from, box.min[tangent]), Math.min(to, box.max[tangent])])]
    .sort((first, second) => first - second)
  const result: Spillway[] = []
  for (let i = 1; i < cuts.length; i++) {
    const widthM = cuts[i] - cuts[i - 1]
    if (widthM <= EPS) continue
    const middle = (cuts[i] + cuts[i - 1]) / 2
    let sillZ = floor
    for (const box of obstructions) if (middle >= box.min[tangent] && middle <= box.max[tangent]) sillZ = Math.max(sillZ, box.max.z)
    result.push({ widthM, sillZ })
  }
  return result
}

const surface = (cell: Cell) => cell.min.z + cell.volumeM3 / cell.areaM2

function exchange(cells: Cell[], connections: Connection[], neighbours: number[], factor: number): boolean {
  const changes = cells.map(() => ({ volumeM3: 0, saltKg: 0, sedimentKg: 0, unknown: false }))
  let moved = false
  for (const { a, b, spillways } of connections) {
    const aZ = surface(cells[a]), bZ = surface(cells[b])
    const from = aZ > bZ ? a : b, to = from === a ? b : a
    const source = cells[from], receiver = cells[to]
    const high = Math.max(aZ, bZ), low = Math.min(aZ, bZ)
    if (!source.volumeM3 || high - low <= EPS) continue
    let rate = 0, lowestSill = Infinity
    for (const { widthM, sillZ } of spillways) {
      const head = high - Math.max(sillZ, low)
      if (head <= EPS) continue
      rate += widthM * head ** 1.5
      lowestSill = Math.min(lowestSill, sillZ)
    }
    if (!rate) continue
    const equilibrium = (high - low) / (1 / source.areaM2 + 1 / receiver.areaM2)
    // Each edge gets a share of the available head. Multiple outlets can drain
    // together while keeping both volume and each transported mass nonnegative.
    const available = Math.min(source.volumeM3, equilibrium, (high - lowestSill) * source.areaM2)
    const volumeM3 = Math.min(rate * factor, available / Math.max(neighbours[from], neighbours[to]))
    if (!volumeM3) continue
    const ratio = volumeM3 / source.volumeM3
    const saltKg = source.saltKg * ratio, sedimentKg = source.sedimentKg * ratio
    changes[from].volumeM3 -= volumeM3
    changes[from].saltKg -= saltKg
    changes[from].sedimentKg -= sedimentKg
    changes[to].volumeM3 += volumeM3
    changes[to].saltKg += saltKg
    changes[to].sedimentKg += sedimentKg
    changes[to].unknown ||= source.unknown
    moved = true
  }
  for (const [index, cell] of cells.entries()) {
    const change = changes[index]
    cell.volumeM3 = Math.max(0, cell.volumeM3 + change.volumeM3)
    cell.saltKg = Math.max(0, cell.saltKg + change.saltKg)
    cell.sedimentKg = Math.max(0, cell.sedimentKg + change.sedimentKg)
    cell.unknown = cell.volumeM3 > 0 && (cell.unknown || change.unknown)
  }
  return moved
}

function wettedFraction(box: ObjectBounds, water: ObjectBounds): number {
  const axes = ['x', 'y', 'z'] as const
  let covered = 0, total = 0
  for (const [i, axis] of axes.entries()) {
    const u = axes[(i + 1) % 3], v = axes[(i + 2) % 3]
    const patch = Math.max(0, overlapLength(box.min[u], box.max[u], water.min[u], water.max[u])) *
      Math.max(0, overlapLength(box.min[v], box.max[v], water.min[v], water.max[v]))
    for (const side of [box.min[axis], box.max[axis]]) {
      if (side >= water.min[axis] - EPS && side <= water.max[axis] + EPS) covered += patch
    }
    total += 2 * (box.max[u] - box.min[u]) * (box.max[v] - box.min[v])
  }
  return Math.min(1, covered / total)
}

function wetObjects(scene: Scene, water: ObjectBounds[]) {
  if (!water.length) return
  for (const object of scene.objects) {
    const profile = object.physics
    if (!profile || object.kind === 'water' || object.height <= EPS || profile.wetnessFraction === 1) continue
    const box = objectBounds(object)
    for (const volume of water) profile.wetnessFraction = Math.max(profile.wetnessFraction, wettedFraction(box, volume))
  }
}

// Advances only configured cells of the round's scene. Spillways approximate
// a shallow sheet using surface height, a head-dependent rate and a bounded
// conservative exchange. Salt and suspended sediment move with the water.
export function advanceWaterFlow(scene: Scene, seconds: number) {
  const cells: Cell[] = scene.objects.flatMap(object => {
    const water = object.water
    return water?.flow ? [{
      ...objectBounds(object), object, areaM2: object.width * object.depth, volumeM3: waterVolumeM3(object),
      saltKg: water.saltKg, sedimentKg: water.sedimentKg, unknown: object.height > 0 && water.base === 'unknown',
    }] : []
  })
  if (!cells.length) return
  const peak = cells.map(surface)
  const wet = () => wetObjects(scene, cells.flatMap((cell, i) => peak[i] > cell.min.z ? [{
    ...cell, max: { ...cell.max, z: peak[i] },
  }] : []))
  const gravity = scene.physics?.gravityMs2 ?? 9.81
  if (seconds <= 0 || gravity === 0 || cells.length < 2) { wet(); return }
  const barriers = scene.objects.filter(o => o.kind !== 'water' && o.blocksMovement && o.height > EPS && !(o.kind === 'door' && o.open)).map(objectBounds)
  const connections: Connection[] = [], neighbours = cells.map(() => 0)
  for (const [a, cell] of cells.entries()) for (let b = 0; b < a; b++) {
    const ways = spillways(cell, cells[b], barriers)
    if (!ways.length) continue
    connections.push({ a, b, spillways: ways })
    neighbours[a]++
    neighbours[b]++
  }
  const steps = Math.min(MAX_STEPS, Math.ceil(seconds / STEP_SECONDS))
  const factor = (2 / 3) * .6 * Math.sqrt(2 * gravity) * seconds / steps
  let changed = false
  for (let step = 0; step < steps; step++) {
    if (!exchange(cells, connections, neighbours, factor)) break
    changed = true
    cells.forEach((cell, i) => { peak[i] = Math.max(peak[i], surface(cell)) })
  }
  const updates = changed ? cells.flatMap(cell => {
    const previous = cell.object.water!, sameVolume = cell.volumeM3 === waterVolumeM3(cell.object)
    const height = sameVolume ? cell.object.height : cell.volumeM3 / cell.areaM2
    const base = height === 0 && sameVolume ? previous.base : cell.unknown ? 'unknown' : 'pure'
    if (sameVolume && base === previous.base && cell.saltKg === previous.saltKg && cell.sedimentKg === previous.sedimentKg) return []
    const water: WaterComposition = { version: 1, flow: true, base, saltKg: cell.saltKg, sedimentKg: cell.sedimentKg }
    if (!isWaterComposition(water) || cell.min.z + height > scene.maxZ ||
        (height === 0 && (water.saltKg > 0 || water.sedimentKg > 0))) {
      throw Error('Расчёт растекания вышел за пределы сцены или состава. Проверь габариты и количество примесей.')
    }
    return [{ object: cell.object, height, water }]
  }) : []
  for (const { object, height, water } of updates) Object.assign(object, { height, water })
  wet()
}

export type WaterSupportChange = { actorId: string; waterId: string; fromZ: number; toZ: number; lostSupport: boolean }
export type WetRouteContact = { actorId: string; objectId: string; name: string; kind: 'water' | 'support' }
export type WaterRoundChanges = {
  layers: { id: string; name: string; fromL: number; toL: number; saltKg: number; sedimentKg: number }[]
  wetted: { id: string; name: string; fraction: number }[]
  supports: WaterSupportChange[]
  routes: WetRouteContact[]
}

// A rider follows an explicitly supporting layer. On loss of support, settle
// on the highest solid surface below the feet in this round slice.
export function settleWaterSupports(scene: Scene): WaterSupportChange[] {
  const changes: WaterSupportChange[] = []
  for (const token of scene.tokens) {
    const previous = token.support
    if (previous.kind !== 'object') continue
    const water = scene.objects.find(o => o.id === previous.objectId && o.water?.flow)
    if (!water) continue
    const afloat = supportsSceneTokens(water)
    const nextZ = water.z + water.height
    if (afloat && nextZ === token.z) continue
    const floor = afloat ? nextZ : scene.minZ
    let landingZ = afloat ? nextZ : token.z
    let support: SceneSupport = afloat ? previous : { kind: 'air' }
    if (scene.groundZ >= floor && scene.groundZ <= token.z) {
      landingZ = scene.groundZ
      support = { kind: 'ground' }
    }
    for (const object of scene.objects) {
      const top = object.z + object.height
      if (object.id === water.id || !supportsSceneTokens(object) || top < floor || top > token.z ||
          (support.kind !== 'air' && top <= landingZ) ||
          Math.abs(token.x - object.x) > object.width / 2 || Math.abs(token.y - object.y) > object.depth / 2) continue
      landingZ = top
      support = { kind: 'object', objectId: object.id }
    }
    const bottom = Math.min(token.z, landingZ), top = Math.max(token.z, landingZ)
    if (top - bottom > EPS && scene.objects.some(o => {
      if (!o.blocksMovement || o.kind === 'water' || o.kind === 'door' && o.open ||
          overlapLength(bottom, top, o.z, o.z + o.height) <= EPS) return false
      const x = Math.max(0, Math.abs(token.x - o.x) - o.width / 2)
      const y = Math.max(0, Math.abs(token.y - o.y) - o.depth / 2)
      return Math.hypot(x, y) < token.diameter / 2 - EPS
    })) throw Error('Сдвиг водной опоры пересекает препятствие. Проверь позицию героя и границы слоя.')
    changes.push({ actorId: token.actorId, waterId: water.id, fromZ: token.z, toZ: landingZ, lostSupport: support !== previous })
    token.z = landingZ
    token.support = support
  }
  return changes
}

export function waterRoundChanges(before: Scene, after: Scene, supports: WaterSupportChange[], routes: WetRouteContact[]): WaterRoundChanges | undefined {
  const previous = new Map(before.objects.map(object => [object.id, object]))
  const layers: WaterRoundChanges['layers'] = [], wetted: WaterRoundChanges['wetted'] = []
  for (const object of after.objects) {
    const old = previous.get(object.id), water = object.water
    if (water?.flow && old?.water?.flow && (object.height !== old.height ||
        water.saltKg !== old.water.saltKg || water.sedimentKg !== old.water.sedimentKg || water.base !== old.water.base)) {
      layers.push({ id: object.id, name: object.name, fromL: waterVolumeM3(old) * 1000, toL: waterVolumeM3(object) * 1000,
        saltKg: water.saltKg, sedimentKg: water.sedimentKg })
    }
    if (object.physics && old?.physics && object.physics.wetnessFraction > old.physics.wetnessFraction) {
      wetted.push({ id: object.id, name: object.name, fraction: object.physics.wetnessFraction })
    }
  }
  return layers.length || wetted.length || supports.length || routes.length ? { layers, wetted, supports, routes } : undefined
}
