import {copyPhysicsMaterial, isPhysicsMaterial} from './physicsMaterials'
import type {PhysicsMaterial} from './physicsMaterials'
import {MAX_TEMPERATURE_K, physicsKeys, physicsNumber, physicsRecord} from './physicsUnits'
import type {SceneState} from './sceneTypes'
import { copyWaterComposition } from './waterPhysics'

export const DEFAULT_BACKGROUND_NOISE_DB = 30
export const MAX_SOUND_LEVEL_DB = 160
export type PhysicsEnvironment = {version:1;gravityMs2:number;ambientTemperatureK:number;backgroundNoiseDb?:number|null}
export type PhysicsBody = {version:1;material:PhysicsMaterial;massKg:number;temperatureK:number;wetnessFraction:number;noiseLevelDbAt1m?:number|null}

function withOptionalSoundLevel(value: Record<string,unknown>, keys: string[], key: string): boolean {
  return Object.hasOwn(value, key)
    ? physicsKeys(value, [...keys, key]) && (value[key] === null || physicsNumber(value[key], 0, MAX_SOUND_LEVEL_DB))
    : physicsKeys(value, keys)
}

export function isPhysicsEnvironment(value: unknown): value is PhysicsEnvironment {
  return physicsRecord(value) && withOptionalSoundLevel(value, ['version','gravityMs2','ambientTemperatureK'], 'backgroundNoiseDb') && value.version === 1 &&
    physicsNumber(value.gravityMs2, 0, 1e6) && physicsNumber(value.ambientTemperatureK, 0, MAX_TEMPERATURE_K)
}
export function isPhysicsBody(value: unknown): value is PhysicsBody {
  return physicsRecord(value) && withOptionalSoundLevel(value, ['version','material','massKg','temperatureK','wetnessFraction'], 'noiseLevelDbAt1m') && value.version === 1 &&
    isPhysicsMaterial(value.material) && physicsNumber(value.massKg, 1e-12, 1e12) &&
    physicsNumber(value.temperatureK, 0, MAX_TEMPERATURE_K) && physicsNumber(value.wetnessFraction, 0, 1)
}
export function copyPhysicsEnvironment(value: PhysicsEnvironment | null): PhysicsEnvironment | null {
  if (value === null) return null
  if (!isPhysicsEnvironment(value)) throw Error('Проверь физические условия сцены.')
  return {...value}
}
export function copyPhysicsBody(value: PhysicsBody | null): PhysicsBody | null {
  if (value === null) return null
  if (!isPhysicsBody(value)) throw Error('Проверь физические свойства объекта.')
  return {...value,material:copyPhysicsMaterial(value.material)}
}

// Old clients may omit unknown fields. Explicit null is the new client's clear
// operation and stays in the snapshot; deleted objects/scenes stay deleted.
export function preserveScenePhysics(current: SceneState | undefined, next: SceneState | undefined): void {
  for (const scene of next?.scenes ?? []) {
    const previous = current?.scenes.find(value => value.id === scene.id)
    if (!previous) continue
    if (scene.physics === undefined && previous.physics !== undefined) scene.physics = copyPhysicsEnvironment(previous.physics)
    else if (scene.physics && scene.physics.backgroundNoiseDb === undefined && previous.physics?.backgroundNoiseDb !== undefined) {
      scene.physics = {...scene.physics, backgroundNoiseDb:previous.physics.backgroundNoiseDb}
    }
    const objects = new Map(previous.objects.map(object => [object.id,object]))
    for (const object of scene.objects) {
      const before = objects.get(object.id)
      if (object.kind === 'water' && object.water === undefined && before?.water !== undefined) object.water = copyWaterComposition(before.water)
      if (object.physics === undefined && before?.physics !== undefined) object.physics = copyPhysicsBody(before.physics)
      else if (object.physics && object.physics.noiseLevelDbAt1m === undefined && before?.physics?.noiseLevelDbAt1m !== undefined) {
        object.physics = {...object.physics, noiseLevelDbAt1m:before.physics.noiseLevelDbAt1m}
      }
    }
  }
}
