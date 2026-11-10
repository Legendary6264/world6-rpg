import type { AbilitySpatial, ChargePolicy, ActionInput, ConsumableEffect } from './rpgTypes'
import type { RuleDecision, RuleRow } from './roundRules'
import {isAbilityObjectEffects} from './abilityEnvironment'
import { isAbilityPhysicsEffect, isWaterAdditive } from './abilityPhysics'
import type { AbilityPhysicsEffect, WaterAdditive } from './abilityPhysics'
import type {ObjectOperation} from './tabletopInteractions'
import { MAX_SHOCK_GRIPS } from './electricalCircuit'
import type { ShockGrip } from './electricalCircuit'
export type RuleSceneObject={id:string;name:string;operations?:ObjectOperation[]}
export type RuleActor={id:string;name:string;canFly?:boolean;speechEligible?:boolean;items?:{id:string;name:string;quantity?:number;consumable?:ConsumableEffect}[];abilities?:{id:string;name:string;spatial?:AbilitySpatial}[];regions?:{key:string;label:string}[];casts?:{id:string;abilityId:string;name:string;status:string;binding:'bound'|'unbound';spatial?:AbilitySpatial;chargePolicy?:ChargePolicy;roundPreparation?:boolean}[]}
export const ruleNumbers=[['manualLocal','Локальное повреждение'],['manualSystemic','Системное поле прежнего движка'],['bleedingMlPerSecond','Кровотечение, мл/с'],['criticalChance','Шанс критического контакта, %'],['dodgeChance','Шанс уворота, %'],['criticalContactFactor','Коэффициент критического контакта']] as const
export type TargetRuleForm={fields:Record<string,string>;accessible:boolean;conditionsConfirmed:boolean;canSpeak:boolean;armorPath:'covered'|'gap';gapConfirmed:boolean}
export type RuleForm=TargetRuleForm&{key:string;kind:'item'|'ability';confirmed:boolean;operation:string;binding:string;charge:string;
  spatialConfirmed?:boolean;overrides?:{actorId:string;form:TargetRuleForm}[];environment?:{objectId:string;operation:string;reason:string}[];physics?: AbilityPhysicsForm}

export const physicsFields = {
  'create-water': { widthM: 'Ширина слоя, м', depthM: 'Длина слоя, м', heightM: 'Глубина воды, м' },
  'fill-water': { volumeL: 'Объём доливаемой воды, л' },
  'add-substance': { massKg: 'Масса примеси, кг' },
  discharge: { x: 'X обратной клеммы, м', y: 'Y обратной клеммы, м', z: 'Z обратной клеммы, м',
    voltageV: 'Напряжение источника, В', limitA: 'Предел тока источника, А', durationMs: 'Длительность разряда, мс', thresholdA: 'Ток для операций с объектами, А' },
  heat: { energyKJ: 'Изменение тепловой энергии, кДж' },
  'structural-impact': { energyJ: 'Энергия удара по конструкции, Дж' },
  'push-object': { impulseNs: 'Импульс толчка, Н·с' },
  sound: { levelDbAt1m: 'Уровень звука на 1 м, дБ' },
} satisfies Record<AbilityPhysicsEffect['kind'], Record<string, string>>
export type AbilityPhysicsForm = { kind: AbilityPhysicsEffect['kind']; fields: Record<string, string>; substance: WaterAdditive; grips?:ShockGrip[] }

export function emptyAbilityPhysicsForm(kind: AbilityPhysicsForm['kind']): AbilityPhysicsForm {
  return { kind, fields: Object.fromEntries(Object.keys(physicsFields[kind]).map(key => [key, ''])), substance: 'salt' }
}
export function emptyRuleForm(row:RuleRow,binding=''):RuleForm {
  return {key:row.key,kind:row.action.kind,confirmed:false,operation:row.action.kind==='item'?row.action.operation??'':'',binding:row.action.kind==='ability'&&row.action.stage==='release'?'bound':binding,charge:row.action.kind==='ability'&&row.action.castId?'cast:'+row.action.castId:'',
    fields:{region:'torso',structureId:'',note:'',injury:'',...Object.fromEntries(ruleNumbers.map(([k])=>[k,k==='criticalContactFactor'?'1':'0']))},accessible:false,conditionsConfirmed:false,canSpeak:false,armorPath:'covered',gapConfirmed:false}
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
function validPhysicsForm(value: unknown): value is AbilityPhysicsForm {
  if (!record(value) || typeof value.kind !== 'string' || !Object.hasOwn(physicsFields, value.kind) ||
      !isWaterAdditive(value.substance) || !record(value.fields)) return false
  const fields = value.fields
  const keys = Object.keys(physicsFields[value.kind as AbilityPhysicsForm['kind']])
  return Object.keys(fields).length === keys.length && keys.every(key => typeof fields[key] === 'string' && fields[key].length <= 40) &&
    (value.grips===undefined || value.kind==='discharge' && Array.isArray(value.grips) && value.grips.length<=MAX_SHOCK_GRIPS &&
      value.grips.every(grip=>record(grip) && Object.keys(grip).length===4 &&
        ['actorId','objectId','handRegion','footRegion'].every(key=>typeof grip[key]==='string' && grip[key].length<=160)))
}

function physicsFormEffect(form: AbilityPhysicsForm): AbilityPhysicsEffect | null {
  const n = (key: string) => form.fields[key].trim() ? Number(form.fields[key].trim().replace(',', '.')) : NaN
  let effect: AbilityPhysicsEffect
  switch (form.kind) {
    case 'create-water':
      effect = { kind: form.kind, widthM: n('widthM'), depthM: n('depthM'), heightM: n('heightM') }
      break
    case 'fill-water':
      effect = { kind: form.kind, volumeL: n('volumeL') }
      break
    case 'add-substance':
      effect = { kind: form.kind, substance: form.substance, massKg: n('massKg') }
      break
    case 'discharge':
      effect = { kind: form.kind, returnContact: { x: n('x'), y: n('y'), z: n('z') },
        voltageV: n('voltageV'), limitA: n('limitA'), durationMs: n('durationMs'), thresholdA: n('thresholdA'),
        ...(form.grips?.length ? {grips:form.grips} : {}) }
      break
    case 'heat':
      effect = { kind: form.kind, energyKJ: n('energyKJ') }
      break
    case 'structural-impact':
      effect = { kind: form.kind, energyJ: n('energyJ') }
      break
    case 'push-object':
      effect = { kind: form.kind, impulseNs: n('impulseNs') }
      break
    case 'sound':
      effect = {kind:form.kind,levelDbAt1m:n('levelDbAt1m')}
      break
  }
  return isAbilityPhysicsEffect(effect) ? effect : null
}
const validTarget=(v:unknown):boolean=>record(v)&&['accessible','conditionsConfirmed','canSpeak','gapConfirmed'].every(k=>typeof v[k]==='boolean')&&
  ['covered','gap'].includes(String(v.armorPath))&&record(v.fields)&&Object.keys(v.fields).length===10&&['region','structureId','note','injury',...ruleNumbers.map(([k])=>k)].every(k=>typeof (v.fields as Record<string,unknown>)[k]==='string'&&((v.fields as Record<string,string>)[k]).length<=2000)
export const isRuleForm=(v:unknown):v is RuleForm=>record(v)&&validTarget(v)&&typeof v.key==='string'&&v.key.length<=400&&['item','ability'].includes(String(v.kind))&&typeof v.confirmed==='boolean'&&
  ['operation','binding','charge'].every(k=>typeof v[k]==='string'&&(v[k] as string).length<=500)&&(v.spatialConfirmed===undefined||typeof v.spatialConfirmed==='boolean')&&
  (v.physics===undefined||v.kind==='ability'&&validPhysicsForm(v.physics))&&
  (v.environment===undefined||Array.isArray(v.environment)&&v.environment.length<=20&&v.environment.every(e=>record(e)&&typeof e.objectId==='string'&&e.objectId.length<=160&&typeof e.operation==='string'&&e.operation.length<=40&&typeof e.reason==='string'&&e.reason.length<=500))&&
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
  if(f.environment!==undefined&&!isAbilityObjectEffects(f.environment))return null
  const physics = f.physics && physicsFormEffect(f.physics)
  if (f.physics && !physics) return null
  return {key:f.key,kind:'ability',confirmed:f.confirmed,binding:f.binding as 'bound'|'unbound',charge:f.charge,input,
    ...(f.spatialConfirmed!==undefined?{spatialConfirmed:f.spatialConfirmed}:{}),...(targets.length?{targetInputs:targets as {actorId:string;input:ActionInput}[]}:{}),...(f.environment?.length?{environment:f.environment}:{}),
    ...(physics ? { physics } : {})}
}
