import {abilityAreaContains} from './abilityArea'
import {objectOperations,operateSceneObject,operationLabels} from './tabletopInteractions'
import type {ObjectOperation} from './tabletopInteractions'
import type {World} from './rpgEngine'
import type {AbilitySpatial} from './rpgTypes'
import type {ScenePosition} from './sceneTypes'

export type AbilityObjectEffect={objectId:string;operation:ObjectOperation;reason:string}
export type AbilityObjectOutcome=AbilityObjectEffect&{name:string}
export const MAX_ABILITY_OBJECT_EFFECTS=20
export function isAbilityObjectEffects(v:unknown):v is AbilityObjectEffect[] {
  return Array.isArray(v)&&v.length<=MAX_ABILITY_OBJECT_EFFECTS&&new Set(v.map(e=>e?.objectId)).size===v.length&&v.every(e=>
    !!e&&typeof e==='object'&&!Array.isArray(e)&&Object.keys(e).length===3&&typeof e.objectId==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(e.objectId)&&
    objectOperations.includes(e.operation)&&typeof e.reason==='string'&&!!e.reason.trim()&&e.reason.length<=500)
}
// Called only on the private candidate of a confirmed spatial release. Visual
// families never determine physical rules: the master specifies every change.
export function applyAbilityObjectEffects(world:World,sceneId:string,ownerId:string,aim:ScenePosition,spatial:AbilitySpatial,effects:AbilityObjectEffect[]):AbilityObjectOutcome[] {
  if(!isAbilityObjectEffects(effects))throw Error('Проверь последствия способности для окружения и основание каждого изменения.')
  const scene=world.campaign.scenes?.scenes.find(s=>s.id===sceneId),origin=scene?.tokens.find(t=>t.actorId===ownerId)
  if(!scene||!origin)throw Error('Сцена пространственного выпуска изменилась.')
  const changes=effects.map(effect=>{
    const object=scene.objects.find(o=>o.id===effect.objectId)
    if(!object)throw Error('Объект последствия исчез из сцены. Проверь выпуск.')
    const center={x:object.x,y:object.y,z:object.z+object.height/2}
    if(!abilityAreaContains(origin,aim,spatial,center))throw Error('Центр объекта «'+object.name+'» вне формы выпуска в момент применения.')
    return {object,updated:operateSceneObject(object,effect.operation),outcome:{...effect,reason:effect.reason.trim(),name:object.name}}
  })
  changes.forEach(change=>Object.assign(change.object,change.updated))
  return changes.map(change=>change.outcome)
}
export const abilityObjectDetails=(effects:AbilityObjectOutcome[])=>effects.map(e=>'Окружение · '+e.name+' · '+operationLabels[e.operation]+': '+e.reason).join('\n')
