import { MAX_TEMPERATURE_K, physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'

export const exposureKinds = ['oxygen','smoke','heat','cold'] as const
export type ExposureKind = typeof exposureKinds[number]
export type ExposureLoad = Record<ExposureKind,number>
export type ExposureProtection = {breathing:boolean; temperature:boolean}
export type ExposureProfile = {
  version:1; oxygenFraction:number; smokeMgM3:number; coldK:number; hotK:number; responseSeconds:number
}

// These values define pacing for a campaign. The editor can set its own thresholds.
export const defaultExposureProfile:ExposureProfile = {
  version:1, oxygenFraction:.18, smokeMgM3:20, coldK:273.15, hotK:313.15, responseSeconds:10,
}
export const exposureLabels:Record<ExposureKind,string> = {
  oxygen:'Недостаток кислорода', smoke:'Дым', heat:'Жар', cold:'Холод',
}
export const exposureStageLabels = ['Без симптомов','Лёгкая','Выраженная','Сильная'] as const
const MAX_LOAD = 4
const recoverySeconds:Record<ExposureKind,number> = {oxygen:10,smoke:30,heat:45,cold:45}

export function isExposureProfile(value:unknown):value is ExposureProfile {
  return physicsRecord(value) && physicsKeys(value,['version','oxygenFraction','smokeMgM3','coldK','hotK','responseSeconds']) &&
    value.version === 1 && physicsNumber(value.oxygenFraction,0,1) && physicsNumber(value.smokeMgM3,.01,1e9) &&
    physicsNumber(value.coldK,0,MAX_TEMPERATURE_K) && physicsNumber(value.hotK,0,MAX_TEMPERATURE_K) &&
    value.coldK < value.hotK && physicsNumber(value.responseSeconds,1,3600)
}

export function isExposureLoad(value:unknown):value is ExposureLoad {
  return physicsRecord(value) && physicsKeys(value,exposureKinds) &&
    exposureKinds.every(kind => physicsNumber(value[kind],0,MAX_LOAD))
}

export function isExposureProtection(value:unknown):value is ExposureProtection {
  return physicsRecord(value) && physicsKeys(value,['breathing','temperature']) &&
    typeof value.breathing === 'boolean' && typeof value.temperature === 'boolean'
}

export function exposureStage(load:number) {
  const level = load+1e-9
  return level >= 3 ? 3 : level >= 2 ? 2 : level >= 1 ? 1 : 0
}

export function exposureLimits(load:ExposureLoad|null|undefined) {
  const breathing = Math.max(exposureStage(load?.oxygen ?? 0),exposureStage(load?.smoke ?? 0))
  const heat = exposureStage(load?.heat ?? 0), cold = exposureStage(load?.cold ?? 0)
  const severity = Math.max(breathing,heat,cold)
  return {breathing,severity,focusPenalty:8*Math.max(breathing,heat),accuracyPenalty:5*severity,
    movementFactor:1-.1*severity}
}

export function stepExposureLoad(current:ExposureLoad|null|undefined, intensity:ExposureLoad|undefined,
    seconds:number, responseSeconds:number, protection?:ExposureProtection|null):ExposureLoad|null {
  function next(kind:ExposureKind) {
    const protectedFrom = kind === 'oxygen' || kind === 'smoke' ? protection?.breathing : protection?.temperature
    const strain = protectedFrom ? 0 : intensity?.[kind] ?? 0
    const rate = strain > 0 ? Math.min(4,strain)/responseSeconds : -1/recoverySeconds[kind]
    const load = (current?.[kind] ?? 0)+seconds*rate
    return load > 1e-12 ? Math.min(MAX_LOAD,load) : 0
  }
  const load = {oxygen:next('oxygen'),smoke:next('smoke'),heat:next('heat'),cold:next('cold')}
  return exposureKinds.some(kind => load[kind] > 0) ? load : null
}
