import {copyPhysicsMaterial, isPhysicsMaterial} from './physicsMaterials'
import type {PhysicsMaterial} from './physicsMaterials'
import {MAX_TEMPERATURE_K, physicsKeys, physicsNumber, physicsRecord} from './physicsUnits'
import type {SceneState} from './sceneTypes'
import { copyWaterComposition } from './waterPhysics'
import { isSlidingProfile, isStructureProfile, restingObject, slidePlacementChanged } from './mechanicalProfiles'
import type { SlidingProfile, StructureProfile } from './mechanicalProfiles'
import { isLightIntensity, isVisionProfile } from './opticalProfiles'
import type { VisionProfile } from './opticalProfiles'

export const DEFAULT_BACKGROUND_NOISE_DB = 30
export const MAX_SOUND_LEVEL_DB = 160
export const OUTSIDE_OXYGEN_FRACTION = .2095
export const MAX_AEROSOL_KG = 1e15
export type RoomAtmosphere = {oxygenFraction:number;smokeKg:number;steamKg:number;outsideTemperatureK:number;doorVentilation:boolean;reactionHeat?:boolean}
export type Combustion = {fuelKg:number;burnRateKgS:number;ignitionTemperatureK:number}
export type PhysicsEnvironment = {version:1;gravityMs2:number;ambientTemperatureK:number;backgroundNoiseDb?:number|null;
  atmosphere?:RoomAtmosphere|null;vision?:VisionProfile|null}
export type PhysicsBody = {version:1;material:PhysicsMaterial;massKg:number;temperatureK:number;wetnessFraction:number;
  noiseLevelDbAt1m?:number|null;combustion?:Combustion|null;structure?:StructureProfile|null;sliding?:SlidingProfile|null;lightIntensityCd?:number|null}

export function isRoomAtmosphere(value: unknown): value is RoomAtmosphere {
  if (!physicsRecord(value)) return false
  const keys = ['oxygenFraction','smokeKg','steamKg','outsideTemperatureK','doorVentilation']
  if (Object.hasOwn(value, 'reactionHeat')) {
    if (typeof value.reactionHeat !== 'boolean') return false
    keys.push('reactionHeat')
  }
  return physicsKeys(value, keys) &&
    physicsNumber(value.oxygenFraction, 0, 1) && physicsNumber(value.smokeKg, 0, MAX_AEROSOL_KG) &&
    physicsNumber(value.steamKg, 0, MAX_AEROSOL_KG) && physicsNumber(value.outsideTemperatureK, 0, MAX_TEMPERATURE_K) &&
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
  return physicsRecord(value) && withOptionalProfiles(value, ['version','gravityMs2','ambientTemperatureK'], {
    backgroundNoiseDb:isSoundLevel, atmosphere:isRoomAtmosphere, vision:isVisionProfile,
  }) && value.version === 1 &&
    physicsNumber(value.gravityMs2, 0, 1e6) && physicsNumber(value.ambientTemperatureK, 0, MAX_TEMPERATURE_K)
}
export function isPhysicsBody(value: unknown): value is PhysicsBody {
  return physicsRecord(value) && withOptionalProfiles(value, ['version','material','massKg','temperatureK','wetnessFraction'], {
    noiseLevelDbAt1m:isSoundLevel, combustion:isCombustion, structure:isStructureProfile, sliding:isSlidingProfile, lightIntensityCd:isLightIntensity,
  }) && value.version === 1 &&
    isPhysicsMaterial(value.material) && physicsNumber(value.massKg, 1e-12, 1e12) &&
    physicsNumber(value.temperatureK, 0, MAX_TEMPERATURE_K) && physicsNumber(value.wetnessFraction, 0, 1)
}
export function copyPhysicsEnvironment(value: PhysicsEnvironment | null): PhysicsEnvironment | null {
  if (value === null) return null
  if (!isPhysicsEnvironment(value)) throw Error('Проверь физические условия сцены.')
  return {...value, ...(value.atmosphere ? {atmosphere:{...value.atmosphere}} : {}), ...(value.vision ? {vision:{...value.vision}} : {})}
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
      if (scene.physics.atmosphere === undefined && previous.physics.atmosphere !== undefined) {
        scene.physics.atmosphere = previous.physics.atmosphere && {...previous.physics.atmosphere}
      }
      const air = scene.physics.atmosphere, oldAir = previous.physics.atmosphere
      if (air && air.reactionHeat === undefined && oldAir?.reactionHeat !== undefined) air.reactionHeat = oldAir.reactionHeat
      if (scene.physics.vision === undefined && previous.physics.vision !== undefined) {
        scene.physics.vision = previous.physics.vision && {...previous.physics.vision}
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
