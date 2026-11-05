import {compareAmounts, isExactAmount} from './exactWork'
import type {ExactAmount} from './exactWork'
import {copyPhysicsMaterial, isPhysicsMaterial} from './physicsMaterials'
import type {PhysicsMaterial} from './physicsMaterials'
import {MAX_PHYSICS_QUANTITY, physicsId, physicsKeys, physicsNumber, physicsRecord} from './physicsUnits'

type Vector = {x:number;y:number;z:number}
type Header = {version:1;id:string;sceneId:string;causeId:string;atMs:ExactAmount}
export type PhysicsEvent = Header & (
  {kind:'heat';objectId:string;energyJ:number} |
  {kind:'impulse';objectId:string;impulseNs:Vector} |
  {kind:'matter';objectId:string;massDeltaKg:number;material:PhysicsMaterial} |
  {kind:'sound';position:Vector;powerW:number;durationMs:number}
)
const headerKeys = ['version','id','sceneId','causeId','atMs']
const signed = (value: unknown) => physicsNumber(value, -MAX_PHYSICS_QUANTITY)
const vector = (value: unknown, maximum: number) => physicsRecord(value) && physicsKeys(value, ['x','y','z']) &&
  ['x','y','z'].every(key => physicsNumber(value[key], -maximum, maximum))

export function isPhysicsEvent(value: unknown): value is PhysicsEvent {
  if (!physicsRecord(value) || value.version !== 1 || ![value.id,value.sceneId,value.causeId].every(physicsId) || !isExactAmount(value.atMs)) return false
  const matches = (...fields: string[]) => physicsKeys(value, [...headerKeys,'kind',...fields])
  switch (value.kind) {
    case 'heat': return matches('objectId','energyJ') && physicsId(value.objectId) && signed(value.energyJ)
    case 'impulse': return matches('objectId','impulseNs') && physicsId(value.objectId) && vector(value.impulseNs, MAX_PHYSICS_QUANTITY)
    case 'matter': return matches('objectId','massDeltaKg','material') && physicsId(value.objectId) && signed(value.massDeltaKg) && isPhysicsMaterial(value.material)
    case 'sound': return matches('position','powerW','durationMs') && vector(value.position, 1e6) &&
      physicsNumber(value.powerW, Number.MIN_VALUE) && physicsNumber(value.durationMs, Number.MIN_VALUE, 86400000)
    default: return false
  }
}
// Contracts for future solvers. Sorting never applies damage, advances time,
// creates matter, deduplicates commands silently or invents a magic energy rate.
export function orderPhysicsEvents(events: readonly PhysicsEvent[]): PhysicsEvent[] {
  if (events.length > 1000 || !events.every(isPhysicsEvent) || new Set(events.map(event => event.id)).size !== events.length) {
    throw Error('Проверь события физики: формат, уникальные ID и предел 1000 событий.')
  }
  return events.map(event => {
    const copy = {...event,atMs:{...event.atMs}}
    if (copy.kind === 'matter') copy.material = copyPhysicsMaterial(copy.material)
    if (copy.kind === 'impulse') copy.impulseNs = {...copy.impulseNs}
    if (copy.kind === 'sound') copy.position = {...copy.position}
    return copy
  }).sort((left,right) => compareAmounts(left.atMs,right.atMs) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}
