import { confirmChargeConditions, interruptCast } from './rpgEngine'
import type { World } from './rpgEngine'
import type { Cost } from './rpgTypes'
export type ChargeDecision={actorId:string;castId:string;mode:'keep'|'interrupt';confirmed:boolean;reason:string;conditionsConfirmed:boolean;canSpeak:boolean}
export type ChargeForm=Omit<ChargeDecision,'mode'>&{mode:''|'keep'|'interrupt'}
export type ChargeOutcome={actorId:string;castId:string;name:string;mode:'keep'|'interrupt';reason:string;refunded:Cost;removedWorkIds:string[]}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export const isChargeDecision=(v:unknown):v is ChargeDecision=>record(v)&&['actorId','castId'].every(k=>typeof v[k]==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(String(v[k])))&&['keep','interrupt'].includes(String(v.mode))&&['confirmed','conditionsConfirmed','canSpeak'].every(k=>typeof v[k]==='boolean')&&typeof v.reason==='string'&&v.reason.length<=1000&&(v.mode!=='interrupt'||!!v.reason.trim())
export const isChargeForm=(v:unknown):v is ChargeForm=>record(v)&&['','keep','interrupt'].includes(String(v.mode))&&isChargeDecision({...v,mode:'keep'})
export function manageRoundCharges(world:World,value:unknown,seed:string):{world:World;outcomes:ChargeOutcome[]} {
  const active=world.characters.flatMap(a=>a.rpg.casts.filter(c=>c.roundPreparation&&['preparing','ready'].includes(c.status)).map(c=>({actorId:a.id,cast:c})))
  const decisions=value??[]
  if(!Array.isArray(decisions)||decisions.length>200||!decisions.every(isChargeDecision)||new Set(decisions.map(d=>JSON.stringify([d.actorId,d.castId]))).size!==decisions.length||decisions.some(d=>!active.some(a=>a.actorId===d.actorId&&a.cast.id===d.castId)))throw Error('Проверь решения по собственным незавершённым раундовым зарядам.')
  if(active.some(a=>a.cast.ability.chargePolicy&&!decisions.some(d=>d.actorId===a.actorId&&d.castId===a.cast.id&&d.confirmed)))throw Error('Подтверди удержание или прерывание каждого заряда с заданными условиями.')
  let candidate=structuredClone(world);const outcomes:ChargeOutcome[]=[]
  for(const [index,d] of decisions.entries()){
    if(!d.confirmed)throw Error('Решение по заряду не подтверждено.')
    const removedWorkIds:string[]=[]
    if(d.mode==='keep')candidate=confirmChargeConditions(candidate,d.actorId,d.castId,d.conditionsConfirmed,d.canSpeak)
    else {
      candidate=interruptCast(candidate,d.actorId,d.castId,'round-'+seed+'-charge-'+index,d.reason)
      const entries=candidate.campaign.roundWork?.entries??[],start=entries.findIndex(e=>e.actorId===d.actorId&&e.ability?.castId===d.castId)
      if(start>=0){for(let i=start;i<entries.length;i++)if(entries[i].actorId===d.actorId)removedWorkIds.push(entries[i].id);candidate.campaign.roundWork={version:1,entries:entries.filter(e=>!removedWorkIds.includes(e.id))}}
    }
    const cast=candidate.characters.find(a=>a.id===d.actorId)!.rpg.casts.find(c=>c.id===d.castId)!
    outcomes.push({actorId:d.actorId,castId:d.castId,name:cast.ability.name,mode:d.mode,reason:d.reason,refunded:d.mode==='interrupt'?cast.interruption!.refunded:{mana:0,shadow:0,stamina:0},removedWorkIds})
  }
  return {world:candidate,outcomes}
}
