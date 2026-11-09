import { physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'
import { segmentSlab } from './sceneGeometry'
import type { SceneObject, ScenePosition } from './sceneTypes'
import { supportsSceneTokens, waterEnthalpy, waterPhase } from './waterPhysics'

export type TractionProfile = {version:1; waterFactor:number; iceFactor:number}
export type SurfaceContact = {
  objectId:string; name:string; kind:'wet'|'slush'|'ice'; factor:number; start:number; end:number
}
export type TractionTravel = Omit<SurfaceContact,'start'|'end'> & {distanceM:number}
export const defaultTractionProfile:TractionProfile = {version:1,waterFactor:.75,iceFactor:.2}
export const tractionLabels = {wet:'Мокрая поверхность',slush:'Вода со льдом',ice:'Лёд'} as const
const EPS_M = 1e-6
const FLOOR_FILM_M = .1

export function isTractionProfile(value:unknown):value is TractionProfile {
  return physicsRecord(value) && physicsKeys(value,['version','waterFactor','iceFactor']) &&
    value.version === 1 && physicsNumber(value.waterFactor,.01,1) &&
    physicsNumber(value.iceFactor,.01,value.waterFactor)
}

// A shallow floor coating can be crossed at floor height. Thicker volumes
// affect traction only on a surface that already supports tokens.
export function surfaceContact(object:SceneObject,profile:TractionProfile,from:ScenePosition,to:ScenePosition):SurfaceContact|undefined {
  if (object.height <= 0 || Math.abs(from.z-to.z) > EPS_M) return undefined
  const surface = Math.abs(from.z-(object.z+object.height)) <= EPS_M && supportsSceneTokens(object)
  let kind:SurfaceContact['kind'] = 'wet', factor = 1
  if (object.water && (surface || object.height <= FLOOR_FILM_M && Math.abs(from.z-object.z) <= EPS_M)) {
    const ice = waterPhase(waterEnthalpy(object.water)).iceFraction
    kind = ice === 1 ? 'ice' : ice > 0 ? 'slush' : 'wet'
    factor = profile.waterFactor + (profile.iceFactor-profile.waterFactor)*ice
  } else if (surface && object.physics?.wetnessFraction) {
    factor = 1-(1-profile.waterFactor)*object.physics.wetnessFraction
  }
  if (factor >= 1) return undefined
  const x = segmentSlab(from.x,to.x,object.x-object.width/2,object.x+object.width/2)
  const y = segmentSlab(from.y,to.y,object.y-object.depth/2,object.y+object.depth/2)
  if (!x || !y) return undefined
  const start = Math.max(x[0],y[0]), end = Math.min(x[1],y[1])
  if (end <= start) return undefined
  return {objectId:object.id,name:object.name,kind,factor,start,end}
}
