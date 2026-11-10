import {copyPhysicsMaterial, isPhysicsMaterial} from './physicsMaterials'
import type {PhysicsMaterial} from './physicsMaterials'
import {MAX_TEMPERATURE_K, physicsKeys, physicsNumber, physicsRecord} from './physicsUnits'
import type {SceneState} from './sceneTypes'
import { copyWaterComposition } from './waterPhysics'
import { isSlidingProfile, isStructureProfile, restingObject, slidePlacementChanged } from './mechanicalProfiles'
import type { SlidingProfile, StructureProfile } from './mechanicalProfiles'
import { isLightIntensity, isVisionProfile } from './opticalProfiles'
import type { VisionProfile } from './opticalProfiles'
import { airContentsKeys, copyAirRooms, isAirRoomList, MAX_AEROSOL_KG, moistureKg, validAirContents } from './airProfiles'
import type { AirContents, AirRoom } from './airProfiles'
import { isExposureProfile } from './exposureProfiles'
import type { ExposureProfile } from './exposureProfiles'
import { isTractionProfile } from './surfaceTraction'
import type { TractionProfile } from './surfaceTraction'
import { isContactHazardProfile } from './contactProfiles'
import type { ContactHazardProfile } from './contactProfiles'
import { isAquaticProfile } from './aquaticMotion'
import type { AquaticProfile } from './aquaticMotion'
export { MAX_AEROSOL_KG } from './airProfiles'

export const DEFAULT_BACKGROUND_NOISE_DB = 30
export const MAX_SOUND_LEVEL_DB = 160
export const OUTSIDE_OXYGEN_FRACTION = .2095
export type RoomAtmosphere = AirContents & {
  outsideTemperatureK:number;doorVentilation:boolean;reactionHeat?:boolean
}
export type Combustion = {fuelKg:number;burnRateKgS:number;ignitionTemperatureK:number}
export type PhysicsEnvironment = {version:1;gravityMs2:number;ambientTemperatureK:number;backgroundNoiseDb?:number|null;
  eventSounds?:true|null;atmosphere?:RoomAtmosphere|null;vision?:VisionProfile|null;airRooms?:AirRoom[]|null;
  exposure?:ExposureProfile|null;traction?:TractionProfile|null;contactHazards?:ContactHazardProfile|null;aquatics?:AquaticProfile|null}
export type PhysicsBody = {version:1;material:PhysicsMaterial;massKg:number;temperatureK:number;wetnessFraction:number;
  noiseLevelDbAt1m?:number|null;combustion?:Combustion|null;structure?:StructureProfile|null;sliding?:SlidingProfile|null;lightIntensityCd?:number|null;
  climbable?:true|null}

export function isRoomAtmosphere(value: unknown): value is RoomAtmosphere {
  if (!physicsRecord(value)) return false
  const keys = [...airContentsKeys,'outsideTemperatureK','doorVentilation']
  if (Object.hasOwn(value, 'reactionHeat')) {
    if (typeof value.reactionHeat !== 'boolean') return false
    keys.push('reactionHeat')
  }
  if (Object.hasOwn(value, 'fogKg')) {
    if (value.fogKg === undefined) return false
    keys.push('fogKg')
  }
  return physicsKeys(value, keys) && validAirContents(value) &&
    physicsNumber(value.outsideTemperatureK, 0, MAX_TEMPERATURE_K) &&
    typeof value.doorVentilation === 'boolean'
}
export function isCombustion(value: unknown): value is Combustion {
  return physicsRecord(value) && physicsKeys(value, ['fuelKg','burnRateKgS','ignitionTemperatureK']) &&
    physicsNumber(value.fuelKg, 0, 1e12) && physicsNumber(value.burnRateKgS, 1e-12, 1e6) &&
    physicsNumber(value.ignitionTemperatureK, 1, MAX_TEMPERATURE_K)
}
function withOptionalProfiles(value: Record<string,unknown>, keys: string[], optional: Record<string,(v:unknown)=>boolean>) {
  for (const [key, check] of Object.entries(optional)) {
    if (!Object.hasOwn(value, key)) continue
    if (value[key] !== null && !check(value[key])) return false
    keys.push(key)
  }
  return physicsKeys(value, keys)
}
const isSoundLevel = (v: unknown) => physicsNumber(v, 0, MAX_SOUND_LEVEL_DB)

export function isPhysicsEnvironment(value: unknown): value is PhysicsEnvironment {
  if (!physicsRecord(value) || !withOptionalProfiles(value, ['version','gravityMs2','ambientTemperatureK'], {
    backgroundNoiseDb:isSoundLevel, eventSounds:v=>v===true, atmosphere:isRoomAtmosphere, vision:isVisionProfile, airRooms:isAirRoomList,
    exposure:isExposureProfile, traction:isTractionProfile, contactHazards:isContactHazardProfile, aquatics:isAquaticProfile,
  }) || value.version !== 1 || !physicsNumber(value.gravityMs2, 0, 1e6) ||
    !physicsNumber(value.ambientTemperatureK, 0, MAX_TEMPERATURE_K)) return false
  const {airRooms,atmosphere,exposure} = value as PhysicsEnvironment
  if (exposure && !atmosphere) return false
  return !airRooms || !!atmosphere && atmosphere.fogKg != null &&
    airRooms.reduce((total,room) => total + room.air.smokeKg, atmosphere.smokeKg) <= MAX_AEROSOL_KG &&
    airRooms.reduce((total,room) => total + moistureKg(room.air), moistureKg(atmosphere)) <= MAX_AEROSOL_KG
}
export function isPhysicsBody(value: unknown): value is PhysicsBody {
  return physicsRecord(value) && withOptionalProfiles(value, ['version','material','massKg','temperatureK','wetnessFraction'], {
    noiseLevelDbAt1m:isSoundLevel, combustion:isCombustion, structure:isStructureProfile, sliding:isSlidingProfile, lightIntensityCd:isLightIntensity,
    climbable:v=>v===true,
  }) && value.version === 1 &&
    isPhysicsMaterial(value.material) && physicsNumber(value.massKg, 1e-12, 1e12) &&
    physicsNumber(value.temperatureK, 0, MAX_TEMPERATURE_K) && physicsNumber(value.wetnessFraction, 0, 1)
}
export function copyPhysicsEnvironment(value: PhysicsEnvironment | null): PhysicsEnvironment | null {
  if (value === null) return null
  if (!isPhysicsEnvironment(value)) throw Error('Проверь физические условия сцены.')
  return {...value, ...(value.atmosphere ? {atmosphere:{...value.atmosphere}} : {}), ...(value.vision ? {vision:{...value.vision}} : {}),
    ...(value.airRooms ? {airRooms:copyAirRooms(value.airRooms)} : {}), ...(value.exposure ? {exposure:{...value.exposure}} : {}),
    ...(value.traction ? {traction:{...value.traction}} : {}),
    ...(value.contactHazards ? {contactHazards:{...value.contactHazards}} : {}),
    ...(value.aquatics ? {aquatics:{...value.aquatics}} : {})}
}
export function copyPhysicsBody(value: PhysicsBody | null): PhysicsBody | null {
  if (value === null) return null
  if (!isPhysicsBody(value)) throw Error('Проверь физические свойства объекта.')
  return {...value,material:copyPhysicsMaterial(value.material), ...(value.combustion ? {combustion:{...value.combustion}} : {}),
    ...(value.structure ? {structure:{...value.structure}} : {}), ...(value.sliding ? {sliding:{...value.sliding}} : {})}
}

// Old clients may omit unknown fields. Explicit null is the new client's clear
// operation and stays in the snapshot; deleted objects/scenes stay deleted.
export function preserveScenePhysics(current: SceneState | undefined, next: SceneState | undefined): void {
  for (const scene of next?.scenes ?? []) {
    const previous = current?.scenes.find(value => value.id === scene.id)
    if (!previous) continue
    if (scene.physics === undefined && previous.physics !== undefined) scene.physics = copyPhysicsEnvironment(previous.physics)
    else if (scene.physics && previous.physics) {
      if (scene.physics.backgroundNoiseDb === undefined && previous.physics.backgroundNoiseDb !== undefined) scene.physics.backgroundNoiseDb = previous.physics.backgroundNoiseDb
      if (scene.physics.eventSounds === undefined && previous.physics.eventSounds !== undefined) scene.physics.eventSounds = previous.physics.eventSounds
      if (scene.physics.atmosphere === undefined && previous.physics.atmosphere !== undefined) {
        scene.physics.atmosphere = previous.physics.atmosphere && {...previous.physics.atmosphere}
      }
      const air = scene.physics.atmosphere, oldAir = previous.physics.atmosphere
      if (air && air.reactionHeat === undefined && oldAir?.reactionHeat !== undefined) air.reactionHeat = oldAir.reactionHeat
      if (air && air.fogKg === undefined && oldAir?.fogKg !== undefined) air.fogKg = oldAir.fogKg
      if (air && scene.physics.airRooms === undefined && previous.physics.airRooms !== undefined) {
        scene.physics.airRooms = previous.physics.airRooms && copyAirRooms(previous.physics.airRooms)
      }
      if (air && scene.physics.exposure === undefined && previous.physics.exposure !== undefined) {
        scene.physics.exposure = previous.physics.exposure && {...previous.physics.exposure}
      }
      if (scene.physics.vision === undefined && previous.physics.vision !== undefined) {
        scene.physics.vision = previous.physics.vision && {...previous.physics.vision}
      }
      if (scene.physics.traction === undefined && previous.physics.traction !== undefined) {
        scene.physics.traction = previous.physics.traction && {...previous.physics.traction}
      }
      if (scene.physics.contactHazards === undefined && previous.physics.contactHazards !== undefined) {
        scene.physics.contactHazards = previous.physics.contactHazards && {...previous.physics.contactHazards}
      }
      if (scene.physics.aquatics === undefined && previous.physics.aquatics !== undefined) {
        scene.physics.aquatics = previous.physics.aquatics && {...previous.physics.aquatics}
      }
    }
    const objects = new Map(previous.objects.map(object => [object.id,object]))
    for (const object of scene.objects) {
      const before = objects.get(object.id)
      const omittedSlide = object.physics === undefined || object.physics?.sliding === undefined
      if (object.kind === 'water' && object.water === undefined && before?.water !== undefined) object.water = copyWaterComposition(before.water)
      else if (object.water && before?.water) {
        if (object.water.flow === undefined && before.water.flow !== undefined) object.water.flow = before.water.flow
        if (object.water.enthalpyJKg === undefined && before.water.enthalpyJKg !== undefined) object.water.enthalpyJKg = before.water.enthalpyJKg
        if (object.water.reagentMol === undefined && before.water.reagentMol !== undefined) object.water.reagentMol = before.water.reagentMol
      }
      if (object.physics === undefined && before?.physics !== undefined) object.physics = copyPhysicsBody(before.physics)
      else if (object.physics && before?.physics) {
        if (object.physics.noiseLevelDbAt1m === undefined && before.physics.noiseLevelDbAt1m !== undefined) object.physics.noiseLevelDbAt1m = before.physics.noiseLevelDbAt1m
        if (object.physics.combustion === undefined && before.physics.combustion !== undefined) {
          object.physics.combustion = before.physics.combustion && {...before.physics.combustion}
        }
        if (object.physics.structure === undefined && before.physics.structure !== undefined) {
          object.physics.structure = before.physics.structure && {...before.physics.structure}
        }
        if (object.physics.sliding === undefined && before.physics.sliding !== undefined) {
          object.physics.sliding = before.physics.sliding && {...before.physics.sliding}
        }
        if (object.physics.lightIntensityCd === undefined && before.physics.lightIntensityCd !== undefined) {
          object.physics.lightIntensityCd = before.physics.lightIntensityCd
        }
        if (object.physics.climbable === undefined && before.physics.climbable !== undefined) {
          object.physics.climbable = before.physics.climbable
        }
      }
      if (before && omittedSlide && object.physics?.sliding && slidePlacementChanged(before, object)) {
        object.physics = restingObject(object).physics
      }
    }
    const tokens = new Map(previous.tokens.map(token => [token.actorId, token]))
    for (const token of scene.tokens) {
      const before = tokens.get(token.actorId)
      if (!before) continue
      if (token.landing === undefined && before.landing !== undefined) token.landing = before.landing && {...before.landing}
      if (token.fall === undefined && before.fall && token.support.kind === 'air' &&
          token.x === before.x && token.y === before.y && token.z === before.z) token.fall = {...before.fall}
    }
  }
}
