import type { ChargePolicy, Cost } from './rpgTypes'
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k))
export const isChargeCost=(v:unknown):v is Cost=>record(v)&&keys(v,['mana','shadow','stamina'])&&Object.values(v).every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e12)
export const copyChargeCost=(c:Cost):Cost=>({mana:c.mana,shadow:c.shadow,stamina:c.stamina})
export function isChargePolicy(v:unknown):v is ChargePolicy {
  return record(v)&&keys(v,['maxHoldSeconds','holdCost','requireConditions','refundPreparingPercent','refundReadyPercent'])&&
    (v.maxHoldSeconds===null||typeof v.maxHoldSeconds==='number'&&Number.isFinite(v.maxHoldSeconds)&&v.maxHoldSeconds>0&&v.maxHoldSeconds<=31536000)&&
    isChargeCost(v.holdCost)&&typeof v.requireConditions==='boolean'&&['refundPreparingPercent','refundReadyPercent'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&Number(v[k])>=0&&Number(v[k])<=100)
}
export const copyChargePolicy=(p:ChargePolicy):ChargePolicy=>({maxHoldSeconds:p.maxHoldSeconds,holdCost:copyChargeCost(p.holdCost),requireConditions:p.requireConditions,refundPreparingPercent:p.refundPreparingPercent,refundReadyPercent:p.refundReadyPercent})
