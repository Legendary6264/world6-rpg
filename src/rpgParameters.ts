import { functionalModifiers, selectActiveEffects } from './functionalStates'
import { effectiveAttribute, standardFormulas, artifactCompatibility } from './creationRules'
import { injuryModifiers } from './bodyPerception'
import type { ReadyCharacterDraft } from './characterModel'
import type { InventoryItem, Modifier, ParameterKey, RpgState, Formula } from './rpgTypes'
import { parameterFields } from './rpgSchema'
import { attributeFields } from './attributes'
import { parseDecimalNumber, statisticFields } from './characterStatistics'
const round=(x:number)=>Math.abs(x)>1e9?x:Math.round(x*1e6)/1e6
const safe=(x:number)=>Number.isFinite(x)&&Math.abs(x)<=1e12
export const workingItem = (i:InventoryItem) => i.equipped && (i.maximumDurability === 0 || i.durability>0 || i.worksBroken)
export function activeEffects(rpg:RpgState,seconds:number){return selectActiveEffects(rpg.effects,seconds)}
export function inventoryMass(rpg:RpgState) {return round(rpg.inventory.reduce((s,i)=>s+i.massKg*i.quantity,0))}
type SourcedModifier=Modifier&{source:string}
export type ParameterTrace={
 mode:Formula['mode'];fallback:boolean;raw:string;base:number;adjustment:number;basis:number|null;
 terms:{label:string;value:number;raw:number;bonus:number;weight:number;contribution:number}[];
 modifiers:SourcedModifier[];flat:number;percent:number;beforeLimit:number|null;limits:string[];result:string
}
export function parameterCalculation(actor:ReadyCharacterDraft,seconds:number){
 const effects=activeEffects(actor.rpg,seconds)
 const sourced=(mods:Modifier[],source:string):SourcedModifier[]=>mods.map(m=>({...m,source}))
 const modifiers=[
  ...actor.rpg.inventory.filter(i=>workingItem(i)&&artifactCompatibility(actor,i).ok).flatMap(i=>sourced(i.modifiers,'Экипировка: '+i.name)),
  ...effects.flatMap(e=>sourced(functionalModifiers(e),'Эффект: '+e.name)),
  ...sourced(injuryModifiers(actor.body),'Боль от ранений'),
 ]
 function calculate(extra:SourcedModifier[]){
  const values={} as Record<ParameterKey,string>,traces={} as Record<ParameterKey,ParameterTrace>
  for(const p of parameterFields){
   const resource=(['health','mana','shadow','stamina'] as const).find(key=>'maximum'+key[0].toUpperCase()+key.slice(1)===p.key)
   const raw=resource?actor.resources[resource].maximum:actor.statistics[p.key as keyof typeof actor.statistics]
   const saved=actor.rpg.formulas.find(f=>f.parameter===p.key)
   const f=saved??(raw.trim()===''?standardFormulas().find(f=>f.parameter===p.key):undefined)
   const mode=f?.mode??'manual',terms:ParameterTrace['terms']=[]
   let basis:number|null=raw.trim()===''?null:parseDecimalNumber(raw)
   if(f&&mode!=='manual'){
    for(const a of attributeFields){const weight=f.weights[a.key]??0;if(!weight)continue
     const value=effectiveAttribute(actor,a.key),rawAttribute=Number(actor.attributes[a.key]??10)
     terms.push({label:a.label,value,raw:rawAttribute,bonus:value-rawAttribute,weight,contribution:value*weight})
    }
    basis=f.base+terms.reduce((sum,t)=>sum+t.contribution,0)+(mode==='adjusted'?f.adjustment:0)
   }
   const applied=[...modifiers,...extra].filter(m=>m.parameter===p.key),flat=applied.reduce((s,m)=>s+m.flat,0),percent=applied.reduce((s,m)=>s+m.percent,0)
   const beforeLimit=basis===null?null:(basis+flat)*(1+percent/100)
   if(beforeLimit!==null&&!safe(beforeLimit))throw new Error('Формула «'+p.label+'» вышла за допустимый диапазон.')
   let n=beforeLimit;const limits:string[]=[]
   const field=statisticFields.find(s=>s.key===p.key)
   if(n!==null){
    if((!field||field.minimum===0)&&n<0){n=0;limits.push('Не меньше нуля')}
    if(field?.maximum===100&&n>100){n=100;limits.push('Шанс не больше 100%')}
   }
   const other=(actor.profile.energy??'mana')==='mana'?'maximumShadow':'maximumMana'
   if(p.key===other){n=0;limits.push('Запас невыбранной энергии отключён')}
   const result=n===null?'':String(round(n))
   values[p.key]=result
   traces[p.key]={mode,fallback:!saved&&!!f,raw,base:f?.base??0,adjustment:mode==='adjusted'?(f?.adjustment??0):0,basis,terms,modifiers:applied,flat,percent,beforeLimit,limits,result}
  }
  values.maximumHealth='0'
  traces.maximumHealth={mode:'manual',fallback:false,raw:actor.resources.health.maximum,base:0,adjustment:0,basis:0,terms:[],modifiers:[],flat:0,percent:0,beforeLimit:0,limits:['Общий HP отключён; повреждения рассчитываются по структурам'],result:'0'}
  return {values,traces}
 }
 const initial=calculate([]),p=actor.rpg.physiology
 if(p.normalMl>0&&p.mode!=='none'){
  const max=p.mode==='mana'?Number(initial.values.maximumMana):p.mode==='shadow'?Number(initial.values.maximumShadow):0
  const own=p.mode==='blood'?p.currentMl:max>0?p.normalMl*Number(actor.resources[p.mode].current)/max:0
  const equivalent=Math.min(p.normalMl,own+effects.reduce((s,e)=>s+e.substituteMl,0)),deficit=Math.max(0,1-equivalent/p.normalMl)
  const extra=deficit>=p.criticalFraction?p.criticalModifiers:deficit>=p.impairedFraction?p.impairedModifiers:deficit>=p.weakFraction?p.weakModifiers:[]
  return calculate(sourced(extra,'Дефицит жизненного носителя'))
 }
 return initial
}
export function evaluatedParameters(actor:ReadyCharacterDraft,seconds:number):Record<ParameterKey,string>{return parameterCalculation(actor,seconds).values}
