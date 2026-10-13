import { isActionInput } from './rpgSchema'
import { activateArtifact, consumeItemPlan, equipItem, makeActionPlan, modifiersText, readyRoundPreparation, releaseRoundPlan, releaseSpatialRoundPlan } from './rpgEngine'
import type { DeclaredAction, DeclarationCollection } from './actionDeclarations'
import type { ActionInput } from './rpgTypes'
import type { World } from './rpgEngine'
import type { RoundWork, RoundWorkEntry } from './roundWork'
import type { ReplaySelection, RollGroup } from './roundReplay'
export type RuleDecision = {key:string;kind:'item';confirmed:boolean;operation:'equip'|'unequip'|'activate'|'consume';input?:ActionInput} |
  {key:string;kind:'ability';confirmed:boolean;binding:'bound'|'unbound';charge:string;input:ActionInput;spatialConfirmed?:boolean;targetInputs?:{actorId:string;input:ActionInput}[]}
export type RuleRow = {key:string;actorId:string;action:Extract<DeclaredAction,{kind:'item'|'ability'}>}
export type RuleOutcome = {key:string;actorId:string;kind:'item'|'prepare'|'ready'|'release';text:string;details:string;castId?:string;rolls?:number[];rollGroups?:RollGroup[];targets?:{actorId:string;name:string;details:string}[]}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export const newRuleKey=(actorId:string,index:number)=>'new:'+actorId+':'+index
export function roundRuleRows(collection:DeclarationCollection,work:RoundWork,continued:string[]):RuleRow[] {
  return [...work.entries.filter(e=>continued.includes(e.actorId)).map(e=>({key:e.id,actorId:e.actorId,action:e.action})),
    ...collection.entries.filter(e=>e.status==='submitted').flatMap(e=>e.actions.map((action,index)=>({key:newRuleKey(e.actorId,index),actorId:e.actorId,action})))]
    .filter((r):r is RuleRow=>r.action.kind==='item'||r.action.kind==='ability')
}
export function isRuleDecision(v:unknown):v is RuleDecision {
  return record(v)&&typeof v.key==='string'&&v.key.length<=400&&/^[a-zA-Z0-9:_-]+$/.test(v.key)&&typeof v.confirmed==='boolean'&&
    (v.kind==='item'?['equip','unequip','activate','consume'].includes(String(v.operation))&&(v.operation!=='consume'||isActionInput(v.input)):
      v.kind==='ability'&&['bound','unbound'].includes(String(v.binding))&&typeof v.charge==='string'&&v.charge.length<=500&&isActionInput(v.input)&&Number.isInteger(v.input.manualLocal)&&v.input.criticalContactFactor>0&&
      (v.spatialConfirmed===undefined||typeof v.spatialConfirmed==='boolean')&&(v.targetInputs===undefined||Array.isArray(v.targetInputs)&&v.targetInputs.length<=200&&new Set(v.targetInputs.map(t=>record(t)?t.actorId:undefined)).size===v.targetInputs.length&&v.targetInputs.every(t=>record(t)&&typeof t.actorId==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(t.actorId)&&isActionInput(t.input)&&Number.isInteger(t.input.manualLocal)&&t.input.criticalContactFactor>0)))
}
export function decisionsFor(rows:RuleRow[],value:unknown):Map<string,RuleDecision> {
  if(!rows.length&&value===undefined)return new Map()
  if(!Array.isArray(value)||value.length!==rows.length||value.length>200||!value.every(isRuleDecision)||new Set(value.map(v=>v.key)).size!==value.length||
    !value.every(d=>d.confirmed&&rows.some(r=>r.key===d.key&&r.action.kind===d.kind)))throw Error('Для каждого предмета/этапа способности нужны проверенные параметры и подтверждение мастера.')
  return new Map(value.map(d=>[d.key,d]))
}
function targetId(work:RoundWorkEntry) {
  if(work.action.kind!=='ability'&&work.action.kind!=='item')throw Error('Некорректная цель действия.')
  if(work.action.target.kind==='self')return work.actorId
  if(work.action.target.kind==='contact'&&work.targetActorId)return work.targetActorId
  throw Error('Для этого действия нужны собственная цель либо раскрытое существо. Точки, области и объекты ещё не подключены.')
}
function actionInput(world:World,work:RoundWorkEntry,decision:{input:ActionInput},unbound=false):ActionInput {
  const input=structuredClone(decision.input)
  if(unbound){input.distanceM=0;return input}
  const target=targetId(work)
  if(!world.characters.some(c=>c.id===target))throw Error('Цель действия исчезла. Требуется решение мастера.')
  if(target===work.actorId){input.distanceM=0;return input}
  const scene=world.campaign.scenes?.scenes.find(s=>s.id===work.sceneId),owner=scene?.tokens.find(t=>t.actorId===work.actorId),other=scene?.tokens.find(t=>t.actorId===target)
  if(!owner||!other)throw Error('Для дальности размести применяющего и цель в сцене действия.')
  input.distanceM=Math.hypot(owner.x-other.x,owner.y-other.y,owner.z-other.z)
  return input
}
const unwrap=(result:ReturnType<typeof makeActionPlan>)=>{if(!result.ok)throw Error(result.message);return result.plan}
function consequences(before:World,after:World):string {
  return after.characters.flatMap(a=>{
    const old=before.characters.find(c=>c.id===a.id);if(!old)return []
    return [...(['mana','shadow','stamina'] as const).filter(k=>old.resources[k].current!==a.resources[k].current).map(k=>a.name+' · '+{mana:'Мана',shadow:'Тень',stamina:'Выносливость'}[k]+': '+old.resources[k].current+' → '+a.resources[k].current),
      ...a.rpg.effects.filter(e=>!old.rpg.effects.some(o=>o.id===e.id)).map(e=>a.name+' · эффект «'+e.name+'»: '+modifiersText(e.modifiers)+(e.bloodMlPerSecond?' восстановление крови '+e.bloodMlPerSecond+' мл/с;':'')+(e.substituteMl?' замещение '+e.substituteMl+' мл;':'')+(e.statusEffects?.length?' состояния: '+e.statusEffects.join(', '):''))]
  }).join('\n')
}
export function beginRoundAbility(world:World,work:RoundWorkEntry,key:string,decision:RuleDecision):{world:World;outcome:RuleOutcome} {
  if(decision.kind!=='ability'||work.action.kind!=='ability'||work.action.stage!=='prepare')throw Error('Некорректный этап подготовки.')
  if(work.ability){
    const cast=world.characters.find(c=>c.id===work.actorId)?.rpg.casts.find(c=>c.id===work.ability!.castId)
    if(!cast||cast.status!=='preparing'||cast.roundPreparation?.workId!==work.id||cast.roundPreparation.binding!==decision.binding)throw Error('Сохранённая подготовка или её привязка изменились. Требуется решение мастера.')
    return {world,outcome:{key,actorId:work.actorId,kind:'prepare',castId:cast.id,text:'Продолжение подготовки',details:'Без повторного расхода.'}}
  }
  if(work.amount.remaining.numerator!==work.amount.total.numerator||work.amount.remaining.denominator!==work.amount.total.denominator)throw Error('У прежней подготовки нет записи начального расхода. Решение мастера требуется до продолжения.')
  const castId=work.id+'-cast',unbound=decision.binding==='unbound'
  const plan=unwrap(makeActionPlan(world,work.actorId,work.action.abilityId,unbound?'':targetId(work),actionInput(world,work,decision,unbound),castId,()=>0,{workId:work.id,binding:decision.binding}))
  work.ability={castId}
  return {world:plan.world,outcome:{key,actorId:work.actorId,kind:'prepare',castId,text:plan.text,details:plan.details+'\n'+consequences(world,plan.world)}}
}
export function finishRoundRule(world:World,work:RoundWorkEntry,key:string,decision:RuleDecision,works:Map<string,RoundWorkEntry>,replay?:ReplaySelection,randomSeed?:string):{world:World;outcome:RuleOutcome} {
  const actor=world.characters.find(c=>c.id===work.actorId)!
  if(actor.rpg.dead||actor.body.consciousness!=='awake')throw Error('Герой потерял возможность выполнить предмет или способность. Требуется решение мастера.')
  if(work.action.kind==='item'&&decision.kind==='item') {
    const a=work.action
    if(decision.operation==='consume'){
      if(a.quantity!==1||a.operation&&a.operation!=='consume'||!decision.input)throw Error('Использование расходника: заяви одну дозу и подтверди её параметры.')
      const plan=unwrap(consumeItemPlan(world,actor.id,a.itemId,targetId(work),actionInput(world,work,{input:decision.input}),work.id+'-item'))
      return {world:plan.world,outcome:{key,actorId:actor.id,kind:'item',text:plan.text,details:plan.details}}
    }
    if(a.quantity!==1||a.target.kind!=='self'||a.operation&&a.operation!==decision.operation)throw Error('Снаряжение и активация артефакта требуют одного собственного экземпляра и совпадения заявленной операции.')
    const item=actor.rpg.inventory.find(i=>i.id===a.itemId)
    if(!item||item.quantity!==1)throw Error('Нужен существующий отдельный экземпляр предмета.')
    const candidate=structuredClone(world),index=candidate.characters.findIndex(c=>c.id===actor.id)
    candidate.characters[index]=decision.operation==='activate'?activateArtifact(actor,item.id,world.campaign.seconds,work.id+'-item'):equipItem(actor,item.id,decision.operation==='equip')
    const text={equip:'Экипирован',unequip:'Снят',activate:'Активирован'}[decision.operation]+': '+item.name
    const details=(decision.operation==='activate'?candidate.characters[index].rpg.logs.at(-1)!.details:'Проверены руки, слот, слои и совместимость существующим движком.')+'\n'+consequences(world,candidate)
    const log={id:work.id+'-item',seconds:world.campaign.seconds,text,details}
    candidate.campaign.logs=[...candidate.campaign.logs,log].slice(-200)
    if(decision.operation!=='activate')candidate.characters[index].rpg.logs=[...candidate.characters[index].rpg.logs,log].slice(-200)
    return {world:candidate,outcome:{key,actorId:actor.id,kind:'item',text,details}}
  }
  if(work.action.kind!=='ability'||decision.kind!=='ability')throw Error('Некорректные параметры способности.')
  if(work.action.stage==='prepare') {
    const cast=actor.rpg.casts.find(c=>c.id===work.ability?.castId)
    if(!cast||cast.roundPreparation?.workId!==work.id||cast.roundPreparation.binding!==decision.binding)throw Error('Не найдена оплаченная подготовка этой работы.')
    const candidate=readyRoundPreparation(world,actor.id,cast.id,work.id+'-ready',actionInput(world,work,decision,decision.binding==='unbound'))
    return {world:candidate,outcome:{key,actorId:actor.id,kind:'ready',castId:cast.id,text:'Готов заряд: '+cast.ability.name,details:'Выпуск отдельным действием; начальный расход повторно не списан.'}}
  }
  const referenced=decision.charge.startsWith('prepare:')?works.get(decision.charge.slice(8)):undefined
  if(referenced&&referenced.actorId!==work.actorId)throw Error('Выпуск может ссылаться только на собственную подготовку.')
  const castId=decision.charge.startsWith('cast:')?decision.charge.slice(5):referenced?.ability?.castId
  const cast=actor.rpg.casts.find(c=>c.id===castId)
  if(!cast||cast.ability.id!==work.action.abilityId)throw Error('Выбери собственный готовый заряд этой способности либо её подготовку ранее в очереди.')
  const rolls:number[]=[],groups=new Map<string,number[]>();let state=2166136261
  for(const ch of randomSeed??work.id)state=Math.imul(state^ch.charCodeAt(0),16777619)>>>0
  const random=(target?:string)=>{
    if(!target)throw Error('Бросок выпуска должен относиться к конкретной цели.')
    const values=groups.get(target)??[]
    state^=state<<13;state^=state>>>17;state^=state<<5
    const n=replay?.mode==='preserve'?replay.groups?.find(g=>g.targetId===target)?.values[values.length]:(state>>>0)/4294967296
    if(n===undefined)throw Error('Для этой цели нет прежнего броска. Выбери новые броски этого выпуска.')
    values.push(n);groups.set(target,values);rolls.push(n);return n
  }
  const spatial='point' in work.action.target
  if(spatial&&decision.spatialConfirmed!==true)throw Error('Подтверди геометрию, затронутых существ и параметры пространственного выпуска.')
  const plan=unwrap(spatial?releaseSpatialRoundPlan(world,actor.id,cast.id,work.sceneId,work.action.target,decision.input,work.id+'-release',random,decision.targetInputs):releaseRoundPlan(world,actor.id,cast.id,targetId(work),actionInput(world,work,decision),work.id+'-release',random))
  return {world:plan.world,outcome:{key,actorId:actor.id,kind:'release',castId:cast.id,text:plan.text,details:(plan.details+'\n'+consequences(world,plan.world)).slice(0,12000),...(spatial?{targets:plan.targets}:{}),rollGroups:[...groups].map(([targetId,values])=>({targetId,values})),...(rolls.length?{rolls}: {})}}
}
