import {copyPhysicsMaterial, isPhysicsMaterial} from './physicsMaterials'
import type {PhysicsMaterial} from './physicsMaterials'
import {MAX_TEMPERATURE_K, physicsKeys, physicsNumber, physicsRecord} from './physicsUnits'
import type {SceneState} from './sceneTypes'

export type PhysicsEnvironment = {version:1;gravityMs2:number;ambientTemperatureK:number}
export type PhysicsBody = {version:1;material:PhysicsMaterial;massKg:number;temperatureK:number;wetnessFraction:number}

export function isPhysicsEnvironment(value: unknown): value is PhysicsEnvironment {
  return physicsRecord(value) && physicsKeys(value, ['version','gravityMs2','ambientTemperatureK']) && value.version === 1 &&
    physicsNumber(value.gravityMs2, 0, 1e6) && physicsNumber(value.ambientTemperatureK, 0, MAX_TEMPERATURE_K)
}
export function isPhysicsBody(value: unknown): value is PhysicsBody {
  return physicsRecord(value) && physicsKeys(value, ['version','material','massKg','temperatureK','wetnessFraction']) && value.version === 1 &&
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
    const objects = new Map(previous.objects.map(object => [object.id,object]))
    for (const object of scene.objects) {
      const before = objects.get(object.id)
      if (object.physics === undefined && before?.physics !== undefined) object.physics = copyPhysicsBody(before.physics)
    }
  }
}
