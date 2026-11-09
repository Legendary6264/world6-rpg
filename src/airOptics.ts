import { fogExtinctionPerM } from './atmosphericMoisture'
import { airSpans, sceneAir } from './sceneAir'
import type { AirRegion } from './sceneAir'
import type { Scene, ScenePosition } from './sceneTypes'

const SMOKE_EXTINCTION_M2_KG = 8700
export const SIGHT_DEPTH_LIMIT = 3
const smokeExtinctionPerM = ({air,volumeM3}:AirRegion) => SMOKE_EXTINCTION_M2_KG*air.smokeKg/volumeM3
export const distanceM = (a:ScenePosition,b:ScenePosition) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)

function visibilityM(scene: Scene, extinctionPerM: number) {
  const distance = SIGHT_DEPTH_LIMIT / extinctionPerM
  return distance < Math.hypot(scene.width,scene.depth,scene.maxZ-scene.minZ) ? distance : undefined
}

export function smokeVisibilityM(scene:Scene) {
  const layout = sceneAir(scene)
  if (layout?.regions.length === 1) return visibilityM(scene,smokeExtinctionPerM(layout.regions[0]))
}

export function aerosolVisibilityM(scene:Scene, layout = sceneAir(scene)) {
  if (layout?.regions.length !== 1) return undefined
  const region = layout.regions[0]
  return visibilityM(scene,smokeExtinctionPerM(region)+fogExtinctionPerM(region))
}

// Integrate attenuation over disjoint room volumes and the space between them.
// A ray lying on a shared face belongs to the same room as a point on the face.
export function airOptics(scene:Scene) {
  const layout = sceneAir(scene)
  const media = layout?.regions.map(region => {
    const smoke = smokeExtinctionPerM(region), fog = fogExtinctionPerM(region)
    return {room:region.room, smoke, fog, extinction:smoke+fog}
  })
  const base = media?.[0].extinction ?? 0
  const rooms = media?.slice(1) ?? []
  const hasExtinction = base > 0 || rooms.some(room => room.extinction > 0)

  function depthBetween(from:ScenePosition,to:ScenePosition,metres = distanceM(from,to)) {
    if (!hasExtinction || !metres) return 0
    if (!layout || !media || !rooms.length) return base*metres
    return metres*airSpans(layout,from,to).reduce((depth,{index,start,end})=>depth+(end-start)*media[index].extinction,0)
  }
  return {
    zoned:rooms.length > 0, depthBetween, visibilityM:aerosolVisibilityM(scene,layout),
    at:(point:ScenePosition) => layout && media ? media[layout.indexAt(point)] : undefined,
  }
}
