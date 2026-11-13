import { physicsId, physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'
import type { ScenePosition } from './sceneTypes'

export const soundLabels = {door:'Движение двери',impact:'Удар',landing:'Приземление',ability:'Звук способности',footstep:'Шаги'} as const
export const MAX_SOUND_EVENTS = 200
export const MAX_PENDING_LISTENERS = 4000

export type SoundSource = {
  kind:keyof typeof soundLabels
  point:ScenePosition
  levelDbAt1m:number
  objectId?:string
  actorId?:string
}
export type SoundPortal = {point:ScenePosition; prefixM:number; bends:1|2; label:string}
export type PendingListener = {actorId:string; direct:boolean; portal?:SoundPortal}
export type SoundWave = {id:string; source:SoundSource; emittedSeconds:number; speedMs:number; listeners:PendingListener[]}

const position = (value:unknown):value is ScenePosition => physicsRecord(value) && physicsKeys(value,['x','y','z']) &&
  ['x','y','z'].every(axis=>physicsNumber(value[axis],-1e6,1e6))
function validSource(value:unknown):value is SoundSource {
  return physicsRecord(value) && physicsKeys(value,['kind','point','levelDbAt1m',
    ...(value.objectId===undefined?[]:['objectId']),...(value.actorId===undefined?[]:['actorId'])]) &&
    typeof value.kind==='string' && Object.hasOwn(soundLabels,value.kind) && position(value.point) &&
    physicsNumber(value.levelDbAt1m,0,160) && (value.objectId===undefined||physicsId(value.objectId)) &&
    (value.actorId===undefined||physicsId(value.actorId))
}
function validPortal(value:unknown):value is SoundPortal {
  return physicsRecord(value) && physicsKeys(value,['point','prefixM','bends','label']) && position(value.point) &&
    physicsNumber(value.prefixM,0,8e6) && (value.bends===1||value.bends===2) &&
    typeof value.label==='string' && value.label.length>0 && value.label.length<=250
}
function validListener(value:unknown):value is PendingListener {
  return physicsRecord(value) && physicsKeys(value,['actorId','direct',...(value.portal===undefined?[]:['portal'])]) &&
    physicsId(value.actorId) && typeof value.direct==='boolean' &&
    (value.portal===undefined ? value.direct : validPortal(value.portal))
}
export function isSoundWaves(value:unknown):value is SoundWave[] {
  return Array.isArray(value) && value.length<=MAX_SOUND_EVENTS && value.every(wave=>
    physicsRecord(wave) && physicsKeys(wave,['id','source','emittedSeconds','speedMs','listeners']) &&
    physicsId(wave.id) && validSource(wave.source) && physicsNumber(wave.emittedSeconds) &&
    physicsNumber(wave.speedMs,Number.MIN_VALUE,21000) && Array.isArray(wave.listeners) &&
    wave.listeners.length>0 && wave.listeners.length<=200 && wave.listeners.every(validListener) &&
    new Set(wave.listeners.map(listener=>listener.actorId)).size===wave.listeners.length) &&
    new Set(value.map(wave=>wave.id)).size===value.length &&
    value.reduce((total,wave)=>total+wave.listeners.length,0)<=MAX_PENDING_LISTENERS
}
