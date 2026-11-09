import { airAxes, boxVolumeM3, MIN_AIR_VOLUME_M3 } from './airProfiles'
import type { AirContents, AirRoom } from './airProfiles'
import type { Scene, SceneObject, ScenePosition } from './sceneTypes'

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
