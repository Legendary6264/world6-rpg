import { overlapLength } from './sceneGeometry'
import type { Scene, ScenePosition } from './sceneTypes'
import { MAX_TEMPERATURE_K, physicsId, physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'

export const MAX_AIR_ROOMS = 8
export const MAX_AEROSOL_KG = 1e15
export const MIN_AIR_VOLUME_M3 = .01
export const airAxes = ['x', 'y', 'z'] as const
export type AirContents = { oxygenFraction:number; smokeKg:number; steamKg:number; fogKg?:number|null }
export type AirRoom = {
  id:string; name:string; min:ScenePosition; max:ScenePosition; ambientTemperatureK:number
  air:AirContents & {fogKg:number}
}
export const airContentsKeys = ['oxygenFraction', 'smokeKg', 'steamKg']
export const moistureKg = (air: AirContents) => air.steamKg + (air.fogKg ?? 0)
export const boxVolumeM3 = ({min,max}: Pick<AirRoom,'min'|'max'>) =>
  (max.x-min.x) * (max.y-min.y) * (max.z-min.z)

export function validAirContents(value: Record<string, unknown>) {
  const fog = value.fogKg
  return (fog == null || physicsNumber(fog, 0, MAX_AEROSOL_KG)) &&
    physicsNumber(value.oxygenFraction, 0, 1) && physicsNumber(value.smokeKg, 0, MAX_AEROSOL_KG) &&
    physicsNumber(value.steamKg, 0, MAX_AEROSOL_KG) && value.steamKg + (fog ?? 0) <= MAX_AEROSOL_KG
}

const point = (value:unknown): value is ScenePosition => physicsRecord(value) &&
  physicsKeys(value, airAxes) && airAxes.every(axis => physicsNumber(value[axis], -1e6, 1e6))

export function isAirRoom(value:unknown): value is AirRoom {
  if (!physicsRecord(value) || !physicsKeys(value,['id','name','min','max','ambientTemperatureK','air'])) return false
  const {min,max,air} = value
  return physicsId(value.id) && typeof value.name === 'string' && !!value.name.trim() && value.name.length <= 80 &&
    point(min) && point(max) && airAxes.every(axis => min[axis] < max[axis]) &&
    boxVolumeM3({min,max}) >= MIN_AIR_VOLUME_M3 && physicsNumber(value.ambientTemperatureK, 0, MAX_TEMPERATURE_K) &&
    physicsRecord(air) && physicsKeys(air,[...airContentsKeys,'fogKg']) && typeof air.fogKg === 'number' && validAirContents(air)
}

export function isAirRoomList(value:unknown): value is AirRoom[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_AIR_ROOMS && value.every(isAirRoom) &&
    new Set(value.map(room => room.id)).size === value.length && value.every((room,index) =>
      value.slice(0,index).every(other => airAxes.some(axis =>
        overlapLength(room.min[axis],room.max[axis],other.min[axis],other.max[axis]) <= 0)))
}

export function airRoomsFit(rooms:readonly AirRoom[]|null|undefined, frame:Pick<Scene,'width'|'depth'|'minZ'|'maxZ'>) {
  return !rooms || rooms.every(({min,max}) => min.x >= 0 && min.y >= 0 && min.z >= frame.minZ &&
    max.x <= frame.width && max.y <= frame.depth && max.z <= frame.maxZ)
}

export function copyAirRooms(rooms: AirRoom[]) {
  return rooms.map(room => ({...room, min:{...room.min}, max:{...room.max}, air:{...room.air}}))
}
