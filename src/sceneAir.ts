import { airAxes, boxVolumeM3, MIN_AIR_VOLUME_M3 } from './airProfiles'
import type { AirContents, AirRoom } from './airProfiles'
import type { Scene, SceneObject, ScenePosition } from './sceneTypes'
import { segmentSlab } from './sceneGeometry'

export type AirRegion = {
  volumeM3:number; air:AirContents; climate:{ambientTemperatureK:number}; room?:AirRoom
}
export type AirPortal = { a:number; b:number; areaM2:number }
export const OUTSIDE_AIR = -1
export const frameVolumeM3 = (scene: Scene) => scene.width * scene.depth * (scene.maxZ-scene.minZ)
const topCorner = (scene: Scene) => ({x:scene.width,y:scene.depth,z:scene.maxZ})

export function withinRoomAxis(room: AirRoom, axis: typeof airAxes[number], value: number, frameMax: ScenePosition) {
  return value >= room.min[axis] && (value < room.max[axis] || value === room.max[axis] && value === frameMax[axis])
}

export function sceneAir(scene: Scene) {
  const climate = scene.physics, atmosphere = climate?.atmosphere
  if (!climate || !atmosphere) return undefined
  const rooms = climate.airRooms ?? [], frameMax = topCorner(scene)
  const spareM3 = rooms.reduce((volume,room) => volume-boxVolumeM3(room), frameVolumeM3(scene))
  const regions: AirRegion[] = [
    {volumeM3:Math.max(MIN_AIR_VOLUME_M3,spareM3), air:atmosphere, climate},
    ...rooms.map(room => ({volumeM3:boxVolumeM3(room), air:room.air, climate:room, room})),
  ]
  const indexAt = (point: ScenePosition) =>
    1 + rooms.findIndex(room => airAxes.every(axis => withinRoomAxis(room,axis,point[axis],frameMax)))
  return {regions, atmosphere, frameMax, indexAt, at:(point:ScenePosition) => regions[indexAt(point)]}
}
export type SceneAir = NonNullable<ReturnType<typeof sceneAir>>
export type AirSpan = {index:number; start:number; end:number}

// Fractions along a straight segment. Shared faces belong to the same region
// for rays, moving tokens and a stationary point on the boundary.
export function airSpans(layout:SceneAir,from:ScenePosition,to:ScenePosition):AirSpan[] {
  const hits:AirSpan[] = []
  for (let index=1;index<layout.regions.length;index++) {
    const room = layout.regions[index].room!
    let start = 0, end = 1
    for (const axis of airAxes) {
      const hit = from[axis] === to[axis]
        ? withinRoomAxis(room,axis,from[axis],layout.frameMax) && [0,1]
        : segmentSlab(from[axis],to[axis],room.min[axis],room.max[axis])
      if (!hit) {end=0;break}
      start = Math.max(start,hit[0])
      end = Math.min(end,hit[1])
      if (start >= end) break
    }
    if (start < end) hits.push({index,start,end})
  }
  hits.sort((a,b)=>a.start-b.start)
  let cursor = 0
  const spans:AirSpan[] = []
  for (const {index,start,end} of hits) {
    if (start > cursor) spans.push({index:0,start:cursor,end:start})
    if (end > Math.max(start,cursor)) spans.push({index,start:Math.max(start,cursor),end})
    cursor = Math.max(cursor,end)
  }
  if (cursor < 1) spans.push({index:0,start:cursor,end:1})
  return spans
}

// Doors use their thin axis as the normal, matching their scene collision box.
// Sample just beyond both faces so a doorway can straddle a wall's thickness.
export function airPortal(scene: Scene, layout: SceneAir, door: SceneObject): AirPortal|undefined {
  if (door.kind !== 'door' || door.height <= 0) return undefined
  const normal = door.width <= door.depth ? 'x' : 'y'
  const offset = Math.min(door.width,door.depth) / 2 + .000001
  const side = (sign:number) => {
    const point = {x:door.x,y:door.y,z:door.z+door.height/2}
    point[normal] += sign * offset
    return point[normal] < 0 || point[normal] > layout.frameMax[normal] || point.z < scene.minZ
      ? OUTSIDE_AIR : layout.indexAt(point)
  }
  const a = side(-1), b = side(1)
  return a === b ? undefined : {a,b,areaM2:Math.max(door.width,door.depth)*door.height}
}
