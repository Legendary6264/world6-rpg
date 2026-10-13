import type { AbilitySpatial, ChargePolicy, ActionInput, ConsumableEffect } from './rpgTypes'
import type { RuleDecision, RuleRow } from './roundRules'
export type RuleActor={id:string;name:string;canFly?:boolean;items?:{id:string;name:string;quantity?:number;consumable?:ConsumableEffect}[];abilities?:{id:string;name:string;spatial?:AbilitySpatial}[];regions?:{key:string;label:string}[];casts?:{id:string;abilityId:string;name:string;status:string;binding:'bound'|'unbound';spatial?:AbilitySpatial;chargePolicy?:ChargePolicy;roundPreparation?:boolean}[]}
export const ruleNumbers=[['manualLocal','Локальное повреждение'],['manualSystemic','Системное поле прежнего движка'],['bleedingMlPerSecond','Кровотечение, мл/с'],['criticalChance','Шанс критического контакта, %'],['dodgeChance','Шанс уворота, %'],['criticalContactFactor','Коэффициент критического контакта']] as const
export type TargetRuleForm={fields:Record<string,string>;accessible:boolean;conditionsConfirmed:boolean;canSpeak:boolean;armorPath:'covered'|'gap';gapConfirmed:boolean}
export type RuleForm=TargetRuleForm&{key:string;kind:'item'|'ability';confirmed:boolean;operation:string;binding:string;charge:string;
  spatialConfirmed?:boolean;overrides?:{actorId:string;form:TargetRuleForm}[]}
export function emptyRuleForm(row:RuleRow,binding=''):RuleForm {
  return {key:row.key,kind:row.action.kind,confirmed:false,operation:row.action.kind==='item'?row.action.operation??'':'',binding:row.action.kind==='ability'&&row.action.stage==='release'?'bound':binding,charge:'',
    fields:{region:'torso',structureId:'',note:'',injury:'',...Object.fromEntries(ruleNumbers.map(([k])=>[k,k==='criticalContactFactor'?'1':'0']))},accessible:false,conditionsConfirmed:false,canSpeak:false,armorPath:'covered',gapConfirmed:false}
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const validTarget=(v:unknown):boolean=>record(v)&&['accessible','conditionsConfirmed','canSpeak','gapConfirmed'].every(k=>typeof v[k]==='boolean')&&
  ['covered','gap'].includes(String(v.armorPath))&&record(v.fields)&&Object.keys(v.fields).length===10&&['region','structureId','note','injury',...ruleNumbers.map(([k])=>k)].every(k=>typeof (v.fields as Record<string,unknown>)[k]==='string'&&((v.fields as Record<string,string>)[k]).length<=2000)
export const isRuleForm=(v:unknown):v is RuleForm=>record(v)&&validTarget(v)&&typeof v.key==='string'&&v.key.length<=400&&['item','ability'].includes(String(v.kind))&&typeof v.confirmed==='boolean'&&
  ['operation','binding','charge'].every(k=>typeof v[k]==='string'&&(v[k] as string).length<=500)&&(v.spatialConfirmed===undefined||typeof v.spatialConfirmed==='boolean')&&
  (v.overrides===undefined||Array.isArray(v.overrides)&&v.overrides.length<=200&&v.overrides.every(o=>record(o)&&typeof o.actorId==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(o.actorId)&&validTarget(o.form))&&new Set(v.overrides.map(o=>o.actorId)).size===v.overrides.length)
export function targetFormInput(f:TargetRuleForm):ActionInput|null {
  if(f.fields.region.length>160||f.fields.structureId.length>160||f.fields.note.length>1000||f.fields.injury.length>120)return null
  const values=Object.fromEntries(ruleNumbers.map(([k])=>[k,f.fields[k].trim()?Number(f.fields[k].trim().replace(',','.')):NaN]))
  if(!Object.values(values).every(n=>Number.isFinite(n)&&n>=0&&n<=1e12)||!Number.isInteger(values.manualLocal)||values.criticalChance>100||values.dodgeChance>100||values.criticalContactFactor<=0)return null
  return {region:f.fields.region,structureId:f.fields.structureId,note:f.fields.note,injury:f.fields.injury,
    distanceM:0,manualLocal:values.manualLocal,manualSystemic:values.manualSystemic,bleedingMlPerSecond:values.bleedingMlPerSecond,criticalChance:values.criticalChance,dodgeChance:values.dodgeChance,criticalContactFactor:values.criticalContactFactor,
    accessible:f.accessible,conditionsConfirmed:f.conditionsConfirmed,canSpeak:f.canSpeak,armorPath:f.armorPath,gapConfirmed:f.gapConfirmed}
}
export function ruleFormDecision(f:RuleForm):RuleDecision|null {
  if(f.kind==='item'&&f.operation!=='consume')return ['equip','unequip','activate'].includes(f.operation)?{key:f.key,kind:'item',confirmed:f.confirmed,operation:f.operation as 'equip'|'unequip'|'activate'}:null
  if(f.kind==='ability'&&!['bound','unbound'].includes(f.binding))return null
  const input=targetFormInput(f);if(!input)return null
  if(f.kind==='item')return {key:f.key,kind:'item',confirmed:f.confirmed,operation:'consume',input}
  const targets=(f.overrides??[]).map(o=>({actorId:o.actorId,input:targetFormInput(o.form)}));if(targets.some(t=>!t.input))return null
  return {key:f.key,kind:'ability',confirmed:f.confirmed,binding:f.binding as 'bound'|'unbound',charge:f.charge,input,
    ...(f.spatialConfirmed!==undefined?{spatialConfirmed:f.spatialConfirmed}:{}),...(targets.length?{targetInputs:targets as {actorId:string;input:ActionInput}[]}:{})}
}
