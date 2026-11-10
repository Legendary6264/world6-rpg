import { MAX_TEMPERATURE_K, physicsId, physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'

export type ContactHazardProfile = {
  version:1; bodyResistanceOhm:number; electricJPerHp:number;
  burnAboveK:number; heatKelvinSecondsPerHp:number; acidMolarSecondsPerHp:number
}
export type ContactProtection = {
  version:1; dryOhm:number; wetOhm:number; heatTransmission:number; acidTransmission:number
}
export const contactKinds = ['electric','heat','acid'] as const
export type ContactKind = typeof contactKinds[number]
export type ContactRemainders = Record<string,Partial<Record<ContactKind,number>>>
export const contactLabels = {electric:'Электрический контакт',heat:'Термический ожог',acid:'Химический ожог'} as const

// Opt-in game calibrations. No material name or body type implies a value.
export const defaultContactHazards:ContactHazardProfile = {
  version:1, bodyResistanceOhm:1000, electricJPerHp:2,
  burnAboveK:333.15, heatKelvinSecondsPerHp:60, acidMolarSecondsPerHp:.02,
}
export const emptyContactProtection:ContactProtection = {
  version:1, dryOhm:0, wetOhm:0, heatTransmission:1, acidTransmission:1,
}

export function isContactHazardProfile(value:unknown):value is ContactHazardProfile {
  return physicsRecord(value) && physicsKeys(value,['version','bodyResistanceOhm','electricJPerHp','burnAboveK','heatKelvinSecondsPerHp','acidMolarSecondsPerHp']) &&
    value.version===1 && physicsNumber(value.bodyResistanceOhm,1,1e9) && physicsNumber(value.electricJPerHp,.001,1e9) &&
    physicsNumber(value.burnAboveK,273.15,MAX_TEMPERATURE_K) && physicsNumber(value.heatKelvinSecondsPerHp,.001,1e9) &&
    physicsNumber(value.acidMolarSecondsPerHp,1e-6,1e6)
}
export function isContactProtection(value:unknown):value is ContactProtection {
  return physicsRecord(value) && physicsKeys(value,['version','dryOhm','wetOhm','heatTransmission','acidTransmission']) &&
    value.version===1 && physicsNumber(value.dryOhm,0,1e12) && physicsNumber(value.wetOhm,0,1e12) &&
    physicsNumber(value.heatTransmission,0,1) && physicsNumber(value.acidTransmission,0,1)
}
export function isContactRemainders(value:unknown,regions:readonly string[]):value is ContactRemainders {
  return physicsRecord(value) && Object.entries(value).every(([region,doses])=>
    physicsId(region) && regions.includes(region) && physicsRecord(doses) && Object.keys(doses).length>0 &&
    Object.entries(doses).every(([kind,amount])=>contactKinds.some(key=>key===kind) && physicsNumber(amount,Number.MIN_VALUE) && amount<1))
}
export function copyContactRemainders(value:ContactRemainders):ContactRemainders {
  return Object.fromEntries(Object.entries(value).map(([region,doses])=>[region,{...doses}]))
}
type ItemWithProtection = {id:string;contactProtection?:ContactProtection|null}
export function retainContactProtection(previous:readonly ItemWithProtection[]|undefined,next:readonly ItemWithProtection[]):boolean {
  if (!previous?.some(item=>item.contactProtection!==undefined)) return false
  const saved = new Map(previous.map(item=>[item.id,item.contactProtection]))
  let changed = false
  for (const item of next) {
    const old = saved.get(item.id)
    if (item.contactProtection===undefined && old!==undefined) {
      item.contactProtection = old && {...old}
      changed = true
    }
  }
  return changed
}
