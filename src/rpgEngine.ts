import { stateById } from './functionalStates'
import { abilityLimit, abilityLimits, artifactCompatibility, magicEfficiency, skillValue, effectiveAttribute } from './creationRules'
import { resolveAnatomyImpact, automaticLife, isHitLocation, copyHitLocation, structureBlocked } from './anatomyModel'
import { activeEffects, evaluatedParameters, workingItem } from './rpgParameters'
export { activeEffects, evaluatedParameters, workingItem, inventoryMass } from './rpgParameters'
import { normalizeCharacterDraft, isCharacterDraft, resourceFields } from './characterModel'
import type { ReadyCharacterDraft, SavedCharacter } from './characterModel'
import { bodyConsequences, bodyRegionDefs, partCondition } from './characterBody'
import { parameterFields, isCampaign, copyAbility, copyItem } from './rpgSchema'
import type { ActionInput, ActionLog, Campaign, Cast, InventoryItem, ItemTemplate, LearnedAbility, MechanicalEffect, Modifier, ParameterKey } from './rpgTypes'
import { statisticFields } from './characterStatistics'
export type Actor = ReadyCharacterDraft & {id:string}
export type World = {characters: Actor[]; campaign: Campaign}
export type Plan = {fingerprint:string; world:World; text:string; details:string; eventId:string}
export type PlanResult = {ok:true;plan:Plan} | {ok:false;message:string}
const round = (x:number) => Math.abs(x)>1e9?x:Math.round(x*1e6)/1e6
const safe = (x:number) => Number.isFinite(x) && Math.abs(x)<=1e12
const fail = (s:string): never => {throw new Error(s)}
const cloneWorld = (w:World):World => ({characters:w.characters.map(c=>({...normalizeCharacterDraft(c),id:c.id})),campaign:structuredClone(w.campaign)})
export const worldFingerprint = (w:World) => JSON.stringify(w)
export function effectiveActor(actor:Actor,seconds:number):Actor {
  const next={...normalizeCharacterDraft(actor),id:actor.id}
  const p=evaluatedParameters(actor,seconds)
  for(const r of resourceFields){const max=p[('maximum'+r.key[0].toUpperCase()+r.key.slice(1)) as ParameterKey];next.resources[r.key]={maximum:max,current:String(Math.min(Number(actor.resources[r.key].current),Number(max)))}}
  for(const s of statisticFields)next.statistics[s.key]=p[s.key]
  return next
}
function clampResources(actor:Actor,seconds:number){const effective=effectiveActor(actor,seconds);for(const r of resourceFields)actor.resources[r.key].current=effective.resources[r.key].current}
export function physiologyStatus(actor:Actor,seconds:number){
  const p=actor.rpg.physiology,effects=activeEffects(actor.rpg,seconds)
  if(p.mode==='none')return {effectiveMl:0,deficit:0,label:'Кровь не требуется'}
  if(!p.normalMl)return {effectiveMl:0,deficit:0,label:'Физиология не настроена'}
  let resource:Actor['resources']['mana']|null=null
  try{resource=p.mode==='mana'||p.mode==='shadow'?effectiveActor(actor,seconds).resources[p.mode]:null}catch{return {effectiveMl:0,deficit:0,label:'Проверь формулы'}}
  const own=resource? (Number(resource.maximum)>0?p.normalMl*Number(resource.current)/Number(resource.maximum):0):p.currentMl
  const effectiveMl=Math.min(p.normalMl,own+effects.reduce((s,e)=>s+e.substituteMl,0))
  const deficit=Math.max(0,1-effectiveMl/p.normalMl)
  const label=deficit>=p.criticalFraction?'Критическое состояние':deficit>=p.impairedFraction?'Нарушение функций':deficit>=p.weakFraction?'Слабость':'Стабильно'
  return {effectiveMl:round(effectiveMl),deficit,label}
}
export function equipItem(actor:Actor,itemId:string,equip:boolean):Actor {
  const next={...normalizeCharacterDraft(actor),id:actor.id},item=next.rpg.inventory.find(i=>i.id===itemId)
  if(!item)fail('Предмет не найден.')
  if(!equip){item!.equipped=false;return next}
  const i=item!
  const compatibility=artifactCompatibility(actor,i);if(!compatibility.ok)fail(compatibility.risk)
  if(i.quantity!==1 || i.slot==='none')fail('Экипируется отдельный экземпляр с заданным местом. Раздели стопку.')
  const c=bodyConsequences(next.body)
  if((i.slot==='left'&&!c.leftHand)||(i.slot==='right'&&!c.rightHand)||(i.slot==='both'&&!c.twoHands))fail('Нужная рука недоступна.')
  if(i.covers.some(k=>!next.body.parts[k]?.present))fail('Предмет покрывает отсутствующую область тела.')
  for(const other of next.rpg.inventory.filter(x=>x.equipped && x.id!==i.id)){
    const hands=['left','right','both'].includes(i.slot)&&['left','right','both'].includes(other.slot)&&(i.slot===other.slot||i.slot==='both'||other.slot==='both')
    const sameLayer=i.slot==='body' && other.slot==='body' && i.layer===other.layer && i.covers.some(k=>other.covers.includes(k))
    const incompatible=i.conflictTags.some(t=>other.tags.includes(t))||other.conflictTags.some(t=>i.tags.includes(t))
    const allowed=i.compatibleTags.some(t=>other.tags.includes(t))||other.compatibleTags.some(t=>i.tags.includes(t))
    if(hands || incompatible || sameLayer&&!allowed)fail('Конфликт с «'+other.name+'»: место, слой или совместимость.')
  }
  i.equipped=true;return next
}
export function instantiateItem(t:ItemTemplate,id:string):InventoryItem{return {...copyItem(t),id,templateId:t.id,quantity:1,durability:t.maximumDurability,equipped:false}}
export function activateArtifact(actor:Actor,itemId:string,seconds:number):Actor {
 const next={...normalizeCharacterDraft(actor),id:actor.id},item=next.rpg.inventory.find(i=>i.id===itemId)
 if(!item?.artifactLevel)fail('Это не артефакт.')
 if(next.rpg.dead||next.body.consciousness!=='awake')fail('Нужно сознание живого персонажа.')
 const compatibility=artifactCompatibility(next,item!);if(!compatibility.ok)fail(compatibility.risk)
 if(!workingItem(item!))fail('Артефакт должен быть экипирован и работоспособен.')
 const cost=item!.activationCost??1,charge=item!.artifactCharge??item!.energyReserve??0
 if(charge<cost)fail('Собственной энергии артефакта недостаточно.')
 if(!item!.activationModifiers?.length)fail('Задай численные эффекты активации артефакта.')
 item!.artifactCharge=round(charge-cost)
 addEffect(next,{id:crypto.randomUUID(),name:'Артефакт: '+item!.name,strength:item!.artifactLevel!,stackKey:'artifact-'+item!.id,stacking:'refresh',modifiers:structuredClone(item!.activationModifiers!),expiresAt:seconds+(item!.activationDuration??60),bloodMlPerSecond:0,substituteMl:0,ownerId:'',castId:''})
 next.rpg.logs=[...next.rpg.logs,{id:crypto.randomUUID(),seconds,text:'Активирован: '+item!.name,details:'Потрачено '+cost+' собственной энергии. Осталось '+item!.artifactCharge+'.'}].slice(-200)
 return next
}
export function rechargeArtifact(actor:Actor,itemId:string,amount:number,seconds:number):Actor {
 if(!safe(amount)||amount<=0)fail('Укажи положительное количество энергии.')
 const next={...normalizeCharacterDraft(actor),id:actor.id},item=next.rpg.inventory.find(i=>i.id===itemId)
 if(!item?.artifactLevel)fail('Артефакт не найден.')
 const energy=item!.energyType??'mana';if(energy!==(next.profile.energy??'mana'))fail('Для зарядки нужна энергия того же типа.')
 const current=item!.artifactCharge??item!.energyReserve??0,needed=Math.min(amount,(item!.energyReserve??0)-current)
 if(needed<=0)fail('Запас уже полон.')
 if(Number(next.resources[energy].current)<needed)fail('Недостаточно энергии персонажа.')
 item!.artifactCharge=round(current+needed);next.resources[energy].current=String(round(Number(next.resources[energy].current)-needed))
 next.rpg.logs=[...next.rpg.logs,{id:crypto.randomUUID(),seconds,text:'Заряжен: '+item!.name,details:'Передано '+needed+' энергии персонажа.'}].slice(-200)
 return next
}
export function artifactContact(actor:Actor,itemId:string,seconds:number):Actor {
 const next={...normalizeCharacterDraft(actor),id:actor.id},item=next.rpg.inventory.find(i=>i.id===itemId)
 if(!item)fail('Предмет не найден.')
 const compatibility=artifactCompatibility(next,item!)
 if(compatibility.ok)fail('Опасной несовместимости нет.')
 const catastrophic=compatibility.risk.includes('аннигиляции'),region=item!.slot==='left'?'leftHand':'rightHand',part=next.body.parts[region]
 if(catastrophic){next.rpg.dead=true;next.body.consciousness='unconscious'}
 else if(part?.present){part.current=Math.max(0,part.current-10);part.wound=[part.wound,'Энергетический ожог от '+item!.name].filter(Boolean).join('\n').slice(-2000);const skin=next.body.anatomy?.structures.find(s=>s.region===region&&s.kind==='skin');if(skin){skin.current=Math.max(0,skin.current-10);skin.injuries.push({id:crypto.randomUUID(),label:'Энергетический ожог',blocksUse:false,diagnosed:true});skin.injuries=skin.injuries.slice(-20)}}
 if(next.body.anatomy)next.body.anatomy.harmRevision++
 next.rpg.logs=[...next.rpg.logs,{id:crypto.randomUUID(),seconds,text:'Опасный контакт: '+item!.name,details:catastrophic?'Аннигиляция при критической несовместимости.':'Ожог при перегрузке: локальное повреждение 10.'}].slice(-200)
 return next
}
export function addEffect(target:Actor,e:MechanicalEffect){
  if(e.stacking==='refresh' && e.stackKey){target.rpg.effects=target.rpg.effects.filter(x=>x.stackKey!==e.stackKey)}
  if(target.rpg.effects.length>=200)fail('Достигнут предел эффектов.')
  target.rpg.effects.push(e)
}
function requirements(actor:Actor,a:LearnedAbility,input:ActionInput,seconds:number){
  applyAutomaticLife(actor,seconds,'auto-state-'+seconds+'-'+(actor.body.anatomy?.harmRevision??0))
  if(actor.rpg.dead)fail('Применяющий отмечен погибшим.')
  const limit=abilityLimit(actor,a);if(limit)fail(limit)
  if(!a.approved)fail('Способность не утверждена.')
  const blocked=activeEffects(actor.rpg,seconds).flatMap(e=>e.statusEffects??[]).map(id=>stateById(id)?.blocks)
  if(a.schoolId&&!a.innate&&blocked.includes('magic'))fail('Магические каналы заблокированы.')
  if(a.speech&&blocked.includes('speech'))fail('Безмолвие мешает речи.')
  if((a.movement||a.flight)&&blocked.includes('movement'))fail('Движение заблокировано эффектом.')
  if(a.schoolId&&['word','soul','illusion','dreams','divination'].includes(a.schoolId)&&blocked.includes('mental'))fail('Ментальное действие сейчас недоступно.')
  const c=bodyConsequences(actor.body)
  if(a.requiresAwake&&actor.body.consciousness!=='awake')fail('Нужно сознание.')
  const occupied=(hand:'left'|'right')=>actor.rpg.inventory.some(i=>i.equipped&&(i.slot===hand||i.slot==='both'))
  const left=c.leftHand&&(!a.freeHands||!occupied('left')),right=c.rightHand&&(!a.freeHands||!occupied('right'))
  if(a.hands==='left'&&!left || a.hands==='right'&&!right || a.hands==='both'&&!(left&&right) || a.hands==='any'&&!(left||right))fail('Не выполнено требование к рукам.')
  if(a.flight&&!c.canFly)fail(c.flightReasons.join(' '))
  if(a.movement&&!a.flight&&(c.movementFactor<=0||evaluatedParameters(actor,seconds).movement!==''&&Number(evaluatedParameters(actor,seconds).movement)<=0))fail('Нужна возможность двигаться.')
  if(a.requiredParts.some(k=>!usablePart(actor,k)))fail('Не действует необходимая область тела.')
  if((a.requiredStructures??[]).some(id=>{const s=actor.body.anatomy?.structures.find(s=>s.id===id);return !s||!actor.body.parts[s.region]?.present||structureBlocked(s)}))fail('Не действует необходимая внутренняя структура.')
  if(a.speech&&actor.body.anatomy?.structures.some(s=>s.functionGroup==='speech'&&structureBlocked(s)))fail('Повреждение не позволяет произнести слова.')
  if(a.speech&&!input.canSpeak)fail('Нужно подтверждение возможности говорить.')
  if(a.condition&&!input.conditionsConfirmed)fail('Подтверди особое условие способности.')
  const tags=actor.rpg.inventory.filter(workingItem).flatMap(i=>i.tags)
  if(a.requiredTags.some(t=>!tags.includes(t)))fail('Не хватает рабочего экипированного предмета с нужной меткой.')
  if(!input.accessible)fail('Цель или область недоступна.')
  if(!safe(input.distanceM)||input.distanceM<0||input.distanceM>a.rangeM)fail('Цель вне заданной дальности.')
  clampResources(actor,seconds)
}
function spend(actor:Actor,cost:LearnedAbility['cost']){
  for(const k of ['mana','shadow','stamina'] as const)if(Number(actor.resources[k].current)+1e-8<cost[k])fail('Недостаточно ресурса: '+k)
  for(const k of ['mana','shadow','stamina'] as const)actor.resources[k].current=String(round(Math.max(0,Number(actor.resources[k].current)-cost[k])))
}
function logWorld(w:World,id:string,text:string,details:string,ids:string[]){
  const log:ActionLog={id,seconds:w.campaign.seconds,text,details:details.slice(0,12000)}
  w.campaign.logs=[...w.campaign.logs,log].slice(-200)
  for(const a of w.characters.filter(c=>ids.includes(c.id)))a.rpg.logs=[...a.rpg.logs,log].slice(-200)
}
function impacts(w:World,owner:Actor,target:Actor,cast:Cast,random:()=>number){
  const original=cast.ability,skill=(original.skillId??(original.schoolId?'spellcraft':original.mechanism==='heal'?'medicine':original.mechanism==='stone'?'ranged':'melee')) as Parameters<typeof skillValue>[1]
  const masteryFactor=(0.5+skillValue(owner,skill,w.campaign.seconds)/40)*(0.5+(original.mastery??20)/40)
  const basePower=effectiveAttribute(owner,'energyThroughput')*1.2+effectiveAttribute(owner,'magicControl')*.8
  const powerRatio=basePower>0?Number(evaluatedParameters(owner,w.campaign.seconds).spellPower)/basePower:0
  const rawFactor=masteryFactor*(original.schoolId&&!original.innate?magicEfficiency(owner,original.schoolId,original.basisSchoolId)*powerRatio:1)*(original.flight?bodyConsequences(owner.body).flightFactor:1)
  const powerCap=original.schoolId&&!original.innate?abilityLimits(owner.profile).power:Infinity
  const factor=original.strength>0?Math.min(rawFactor,powerCap/original.strength):rawFactor

  const a={...original,strength:original.strength*factor,healAmount:Math.floor(original.healAmount*factor),modifiers:original.modifiers.map(m=>({...m,flat:m.flat*factor,percent:m.percent*factor}))},i=cast.input,t=w.campaign.seconds
  if(owner.id!==target.id)applyAutomaticLife(target,t,(cast.id+'-life-check').slice(0,160))
  let details='Эффективность: '+Math.round(factor*100)+'%; Механизм: '+a.mechanism+'; дистанция '+i.distanceM+' м. '+(i.note?'Решение мастера: '+i.note:'')
  let text=owner.name+' → '+target.name+': '+a.name
  if(original.schoolId&&!original.innate)details+='\nРасчётная сила: '+round(original.strength*rawFactor)+'; предел развития: '+powerCap+'; применена сила: '+round(a.strength)+'.'
  if(original.flight)details+='\nДоступная мощность крыльев: '+Math.round(bodyConsequences(owner.body).flightFactor*100)+'%.'
  if(target.rpg.dead && a.mechanism!=='manual')fail('Цель отмечена погибшей; воскрешение требует отдельного правила.')
  const area=target.body.parts[i.region]
  const needsArea=['stone','impact','manual','heal'].includes(a.mechanism)
  if(needsArea&&(!area?.present||!area.maximum))fail('Настрой область цели и её локальное здоровье.')
  if(['stone','impact','manual'].includes(a.mechanism)){
    const dodge=random()*100,critical=random()*100
    const dodged=dodge<i.dodgeChance,crit=!dodged&&critical<i.criticalChance
    details+='\nБроски: уворот '+dodge.toFixed(3)+' / '+i.dodgeChance+'%; крит '+critical.toFixed(3)+' / '+i.criticalChance+'%.'
    if(dodged){text+=' — уворот';details+=' Воздействия на цель нет.'}
    else {
      const previousHarm=target.body.anatomy?.harmRevision
      let damage=Math.floor(i.manualLocal*factor), internalEnergy:number|null=null
      if(a.mechanism==='stone'||a.mechanism==='impact'){
        const profile=target.rpg.impact[i.region]
        if(!profile)fail('Для области цели не задана калибровка тупого удара.')
        if(!safe(i.criticalContactFactor)||i.criticalContactFactor<=0)fail('Коэффициент критического контакта должен быть положительным.')
        let energy=0.5*a.massKg*a.speedMs*a.speedMs*factor
        if(!safe(energy))fail('Энергия выходит за допустимый диапазон.')
        details+='\nМасса '+a.massKg+' кг; скорость '+a.speedMs+' м/с; энергия '+energy+' Дж; импульс '+a.massKg*a.speedMs+' кг·м/с; контакт '+a.contactCm2+' см².'
        if(i.armorPath==='gap'&&!i.gapConfirmed)fail('Попадание в зазор должен подтвердить мастер.')
        const armor=i.armorPath==='gap'?[]:target.rpg.inventory.filter(x=>workingItem(x)&&x.covers.includes(i.region)).sort((a,b)=>b.layer-a.layer||a.id.localeCompare(b.id))
        for(const armorItem of armor){
          const before=energy,factor=armorItem.maximumDurability>0?armorItem.durability/armorItem.maximumDurability:1
          const removed=Math.min(energy*(1-armorItem.transmission),armorItem.absorptionJ*factor)
          energy=Math.max(0,energy-removed)
          if(armorItem.maximumDurability>0&&armorItem.joulesPerWear>0)armorItem.durability=round(Math.max(0,armorItem.durability-removed/armorItem.joulesPerWear))
          details+='\nСлой '+armorItem.layer+' «'+armorItem.name+'»: '+before.toFixed(3)+' → '+energy.toFixed(3)+' Дж; прочность '+armorItem.durability+'.'
        }
        internalEnergy=energy
        const contact=profile.referenceCm2/a.contactCm2*(crit?i.criticalContactFactor:1)
        const threshold=profile.thresholdJ/contact
        damage=Math.floor(Math.max(0,(energy-threshold)/profile.joulesPerHp))
        if(!safe(damage))fail('Повреждение выходит за допустимый диапазон.')
        details+='\nТестовая модель: порог '+threshold.toFixed(3)+' Дж; '+profile.joulesPerHp+' Дж/HP; локальный урон '+damage+'. Крит меняет контакт, не энергию и не обход брони.'
      }
      if(!Number.isSafeInteger(damage)||damage<0)fail('Локальное повреждение должно быть целым неотрицательным.')
      if(target.body.anatomy && !i.skipAnatomy && internalEnergy!==null){
        const result=resolveAnatomyImpact(target.body.anatomy,i.region,{...copyHitLocation(i.hit??{x:.5,y:.5,approach:'front',mechanism:'blunt',angleX:0,angleY:0}),mechanism:a.mechanism==='stone'?'blunt':a.damageType??'blunt'},internalEnergy,a.contactCm2/(crit?i.criticalContactFactor:1),cast.id)
        target.body.anatomy=result.anatomy
        area.bleedingMlPerSecond=Math.max(area.bleedingMlPerSecond??0,result.bleedingRate)
        area.internalBleeding=area.internalBleeding||result.internal
        details+='\nВнутренний путь: '+(result.anatomy.lastTrace?.steps.map(s=>s.name+': '+s.beforeJ.toFixed(2)+' → '+s.afterJ.toFixed(2)+' Дж, '+s.damage+' HP').join('; ')||'структуры не пересечены')
      }else if(target.body.anatomy && (damage || i.manualSystemic || i.bleedingMlPerSecond || i.injury))target.body.anatomy.harmRevision++
      if(target.body.anatomy&&target.body.anatomy.harmRevision===previousHarm&&(damage||i.manualSystemic||i.bleedingMlPerSecond||i.injury))target.body.anatomy.harmRevision++
      area.current=Math.max(0,area.current-damage)
      area.bleedingMlPerSecond=Math.max(area.bleedingMlPerSecond??0,i.bleedingMlPerSecond)
      if(i.injury){if((area.injuries??[]).length>=100)fail('Слишком много травм области.');area.injuries=[...(area.injuries??[]),{id:cast.id+'-injury',label:i.injury,blocksUse:false,slowdown:0}]}
      if(damage)area.wound=[area.wound,a.name+(crit?' (критический контакт)':'')].filter(Boolean).join('\n').slice(-2000)
      details+='\nИтог: '+damage+' локального HP; кровь '+(area.bleedingMlPerSecond??0)+' мл/с.'
      text+=crit?' — критический контакт':' — попадание'
    }
  } else if(a.mechanism==='heal'){
    if(i.structureId){const s=target.body.anatomy?.structures.find(s=>s.id===i.structureId&&s.region===i.region);if(!s)fail('Структура для лечения не принадлежит выбранной области.');s!.current=Math.min(s!.maximum,s!.current+Math.floor(a.healAmount));s!.injuries=s!.injuries.filter(injury=>!a.cureLabels.includes(injury.label));details+='\nЛечение структуры: '+s!.name+'; целостность '+s!.current+'/'+s!.maximum+'.'}else area.current=Math.min(area.maximum,area.current+Math.floor(a.healAmount))
    if(a.stopBleeding){area.bleedingMlPerSecond=0;area.bleeding=0;if(target.body.anatomy)for(const s of target.body.anatomy.structures)if(s.region===i.region)s.activeBleeding=0}
    area.injuries=(area.injuries??[]).filter(x=>!a.cureLabels.includes(x.label))
    if(area.current===area.maximum&&!area.injuries.length&&!area.bleeding&&!area.bleedingMlPerSecond)area.wound=''
    details+='\nЛокальное лечение '+a.healAmount+'; снимаемые травмы: '+a.cureLabels.join(', ')+'. Объём крови не восстанавливается.'
  } else {
    if(a.mechanism==='blood'&&(!target.rpg.physiology.normalMl||target.rpg.physiology.mode!=='blood'))fail('Восстановление крови требует настроенной кровяной физиологии.')
    if(['blood','substitute'].includes(a.mechanism)&&a.duration<=0)fail('Задай положительную длительность восстановления или замещения.')
    const expires=a.duration>0?t+a.duration:null
    if(a.stacking==='refresh'&&a.stackKey){for(const old of target.rpg.effects.filter(e=>e.stackKey===a.stackKey)){const prior=w.characters.find(c=>c.id===old.ownerId)?.rpg.casts.find(c=>c.id===old.castId);if(prior&&prior.status==='maintaining')prior.status='ended'}}
    addEffect(target,{id:cast.id+'-effect',strength:a.strength,statusEffects:a.statusEffects?[...a.statusEffects]:[],name:a.name,stackKey:a.stackKey,stacking:a.stacking,modifiers:a.modifiers.map(m=>({...m})),expiresAt:expires,bloodMlPerSecond:a.mechanism==='blood'?a.bloodMlPerSecond:0,substituteMl:a.mechanism==='substitute'?a.substituteMl:0,ownerId:owner.id,castId:cast.id})
    cast.status=Object.values(a.upkeep).some(n=>n>0)?'maintaining':'ended';cast.endsAt=expires
    details+='\nДлительность: '+(expires===null?'до ручного снятия':a.duration+' с')+'; поддержание '+JSON.stringify(a.upkeep)+' ед./с.'
  }
  if(cast.status==='ready')cast.status='ended'
  clampResources(target,t)
  applyAutomaticLife(target,t,cast.id+'-life')
  if(target.rpg.dead)details+='\nАвтоматический итог: смерть. Мастер может отменить её с указанием причины.'
  else if(target.body.consciousness==='unconscious')details+='\nИтог: без сознания.'
  return {text,details}
}
export function makeActionPlan(world:World,actorId:string,abilityId:string,targetId:string,input:ActionInput,eventId:string,random:()=>number=Math.random):PlanResult {
  try {
    if(!isCampaign(world.campaign)||world.characters.some(c=>!isCharacterDraft(c)))fail('Исправь незавершённые поля персонажей перед действием.')
    if(world.campaign.logs.some(l=>l.id===eventId)||world.characters.some(c=>c.rpg.casts.some(x=>x.id===eventId)))fail('Это действие уже учтено.')
    if(!/^[a-zA-Z0-9:_-]+$/.test(eventId))fail('Некорректный идентификатор действия.')
    const w=cloneWorld(world),owner=w.characters.find(c=>c.id===actorId),target=w.characters.find(c=>c.id===targetId)
    if(!owner||!target)fail('Выбери применяющего и цель.')
    const a=owner!.rpg.abilities.find(a=>a.id===abilityId);if(!a)fail('Способность не найдена.')
    if(![input.manualLocal,input.manualSystemic,input.bleedingMlPerSecond,input.distanceM,input.criticalChance,input.dodgeChance,input.criticalContactFactor].every(x=>safe(x)&&x>=0)||input.criticalChance>100||input.dodgeChance>100)fail('Проверь численные поля действия.')
    if(input.hit!==undefined&&!isHitLocation(input.hit))fail('Проверь точку и направление попадания.')
    if(!Number.isInteger(input.manualLocal)||input.injury.length>120||input.note.length>1000)fail('Проверь описание или локальный урон.')
    requirements(owner!,a!,input,w.campaign.seconds)
    if(['stone','impact','manual','heal'].includes(a!.mechanism)&&(!target!.body.parts[input.region]?.present||!target!.body.parts[input.region]?.maximum))fail('Настрой локальное здоровье области цели.')
    if(['stone','impact'].includes(a!.mechanism)&&!target!.rpg.impact[input.region])fail('Для области цели не задана калибровка тупого удара.')
    spend(owner!,a!.cost)
    if(owner!.rpg.casts.length>=200){owner!.rpg.casts=owner!.rpg.casts.filter(c=>['preparing','ready','maintaining'].includes(c.status)||w.characters.some(t=>t.rpg.effects.some(e=>e.ownerId===owner!.id&&e.castId===c.id)));if(owner!.rpg.casts.length>=200)fail('Слишком много незавершённых применений.')}
    const cast:Cast={id:eventId,ability:{...copyAbility(a!),id:a!.id,templateId:a!.templateId,approved:a!.approved},targetId,input:{...input,...(input.hit?{hit:copyHitLocation(input.hit)}:{})},status:a!.preparation>0?'preparing':'ready',readyAt:w.campaign.seconds+a!.preparation,endsAt:null}
    owner!.rpg.casts.push(cast)
    const result=cast.status==='preparing'?{text:owner!.name+': подготовка «'+a!.name+'»',details:'Оплачено '+JSON.stringify(a!.cost)+'. Готово в '+cast.readyAt+' с. Цель: '+target!.name+'.'}:impacts(w,owner!,target!,cast,random)
    applyAutomaticLife(owner!,w.campaign.seconds,eventId+'-cost-life')
    if(owner!.rpg.dead)result.details+='\nПосле расхода ресурсов применяющий погиб. Мастер может отменить это с указанием причины.'
    else if(owner!.body.consciousness==='unconscious')result.details+='\nПосле расхода ресурсов применяющий без сознания.'
    logWorld(w,eventId,result.text,result.details,[actorId,targetId]);w.campaign.revision++
    if(!w.characters.every(isCharacterDraft)||!isCampaign(w.campaign))fail('Результат вышел за допустимые пределы. Ничего не изменено.')
    return {ok:true,plan:{fingerprint:worldFingerprint(world),world:w,...result,eventId}}
  }catch(e){return {ok:false,message:e instanceof Error?e.message:'Не удалось рассчитать действие.'}}
}
export function releasePlan(world:World,ownerId:string,castId:string,eventId:string,random:()=>number=Math.random):PlanResult {
  try{
    const w=cloneWorld(world),owner=w.characters.find(c=>c.id===ownerId),cast=owner?.rpg.casts.find(c=>c.id===castId)
    if(!owner||!cast||cast.status!=='ready')fail('Применение ещё не готово или уже завершено.')
    const target=w.characters.find(c=>c.id===cast!.targetId);if(!target)fail('Цель больше не существует.')
    requirements(owner!,cast!.ability,cast!.input,w.campaign.seconds)
    const result=impacts(w,owner!,target!,cast!,random)
    logWorld(w,eventId,result.text,result.details,[ownerId,target!.id]);w.campaign.revision++
    if(!w.characters.every(isCharacterDraft)||!isCampaign(w.campaign))fail('Некорректный результат.')
    return {ok:true,plan:{fingerprint:worldFingerprint(world),world:w,...result,eventId}}
  }catch(e){return {ok:false,message:e instanceof Error?e.message:'Ошибка выпуска.'}}
}
export function interruptCast(world:World,ownerId:string,castId:string,eventId:string):World {
  const w=cloneWorld(world),cast=w.characters.find(c=>c.id===ownerId)?.rpg.casts.find(c=>c.id===castId)
  if(!cast||!['preparing','ready','maintaining'].includes(cast.status))fail('Незавершённое применение не найдено.')
  cast!.status='interrupted';for(const actor of w.characters)actor.rpg.effects=actor.rpg.effects.filter(e=>e.castId!==castId||e.ownerId!==ownerId)
  for(const actor of w.characters)clampResources(actor,w.campaign.seconds)
  logWorld(w,eventId,'Прервано: '+cast!.ability.name,'Оплаченные ресурсы не возвращаются.',[ownerId,cast!.targetId]);w.campaign.revision++
  return w
}
function ongoingCosts(actor:Actor,seconds:number){
  const costs={mana:0,shadow:0,stamina:0}
  for(const c of actor.rpg.casts.filter(c=>c.status==='maintaining'))for(const k of ['mana','shadow','stamina'] as const)costs[k]+=c.ability.upkeep[k]
  const p=actor.rpg.physiology
  if((p.mode==='mana'||p.mode==='shadow')&&p.normalMl>0&&!actor.rpg.dead){
    const rate=Object.values(actor.body.parts).reduce((s,x)=>s+(x.bleedingMlPerSecond??0),0)
    costs[p.mode]+=rate/p.normalMl*Number(effectiveActor(actor,seconds).resources[p.mode].maximum)
  }
  if(!actor.rpg.dead){const energy=actor.profile.energy??'mana';costs[energy]-=Number(evaluatedParameters(actor,seconds).energyRegeneration)||0}
  return costs
}
export function advanceWorld(world:World,seconds:number,eventId:string):World {
  if(!safe(seconds)||seconds<=0||seconds>31536000||!safe(world.campaign.seconds+seconds))fail('Введи время больше нуля, не более года за операцию.')
  const w=cloneWorld(world),end=w.campaign.seconds+seconds,initialLost=new Map(w.characters.map(c=>[c.id,c.rpg.physiology.totalLostMl]))
  for(const actor of w.characters)applyAutomaticLife(actor,w.campaign.seconds,eventId+'-start-'+actor.id)
  let count=0
  while(w.campaign.seconds<end-1e-8){
    if(++count>10000)fail('Слишком много границ событий. Продвинь время меньшим интервалом.')
    const now=w.campaign.seconds
    for(const owner of w.characters){
      for(const cast of owner.rpg.casts){
        if(cast.status==='preparing'&&cast.readyAt<=now+1e-8)cast.status='ready'
        if(cast.status==='maintaining'&&cast.endsAt!==null&&cast.endsAt<=now+1e-8)cast.status='ended'
        if(cast.status==='maintaining'){
          const deprived=Object.entries(cast.ability.upkeep).some(([k,v])=>v>0&&Number(owner.resources[k as 'mana'|'shadow'|'stamina'].current)<=1e-8)
          let impossible=false
          try{requirements(owner,cast.ability,cast.input,now)}catch{impossible=true}
          if(deprived||impossible)cast.status='interrupted'
        }
      }
    }
    for(const target of w.characters){target.rpg.effects=target.rpg.effects.filter(e=>{
      if(e.expiresAt!==null&&e.expiresAt<=now+1e-8)return false
      if(!e.ownerId||!e.castId)return true
      const cast=w.characters.find(c=>c.id===e.ownerId)?.rpg.casts.find(c=>c.id===e.castId)
      return !!cast&&cast.status!=='interrupted'
    });clampResources(target,now)}
    let dt=end-now
    for(const actor of w.characters){
      for(const e of actor.rpg.effects)if(e.expiresAt!==null&&e.expiresAt>now)dt=Math.min(dt,e.expiresAt-now)
      for(const c of actor.rpg.casts)if(c.status==='preparing'&&c.readyAt>now)dt=Math.min(dt,c.readyAt-now)
      const costs=ongoingCosts(actor,now)
      for(const k of ['mana','shadow','stamina'] as const)if(costs[k]>0&&Number(actor.resources[k].current)>1e-8)dt=Math.min(dt,Number(actor.resources[k].current)/costs[k])
      const p=actor.rpg.physiology
      if(p.normalMl>0&&p.mode!=='none'){
        const support=activeEffects(actor.rpg,now).reduce((s,e)=>s+e.substituteMl,0)
        if(p.mode==='blood'){
          const loss=Object.values(actor.body.parts).reduce((s,x)=>s+(x.bleedingMlPerSecond??0),0)-p.naturalMlPerSecond-activeEffects(actor.rpg,now).reduce((s,e)=>s+e.bloodMlPerSecond,0)
          if(loss>0)for(const f of [p.weakFraction,p.impairedFraction,p.criticalFraction,...(actor.body.anatomy?.automatic?[actor.body.anatomy.unconsciousDeficit,actor.body.anatomy.lethalDeficit]:[])]){const until=(p.currentMl-((1-f)*p.normalMl-support))/loss;if(until>1e-6)dt=Math.min(dt,until)}
        }else{
          const max=Number(effectiveActor(actor,now).resources[p.mode].maximum),cost=costs[p.mode]
          if(max>0&&cost>0)for(const f of [p.weakFraction,p.impairedFraction,p.criticalFraction,...(actor.body.anatomy?.automatic?[actor.body.anatomy.unconsciousDeficit,actor.body.anatomy.lethalDeficit]:[])]){const threshold=((1-f)*p.normalMl-support)/p.normalMl*max,until=(Number(actor.resources[p.mode].current)-threshold)/cost;if(until>1e-6)dt=Math.min(dt,until)}
        }
      }

    }
    if(dt<=1e-8)fail('Не удалось определить границу времени; проверь расходы поддержания.')
    for(const actor of w.characters){
      const p=actor.rpg.physiology
      if(p.mode==='blood'&&p.normalMl>0&&!actor.rpg.dead){
        const rate=Object.values(actor.body.parts).reduce((s,p)=>s+(p.bleedingMlPerSecond??0),0)
        const regen=p.naturalMlPerSecond+activeEffects(actor.rpg,now).reduce((s,e)=>s+e.bloodMlPerSecond,0)
        const actualLost=Math.min(rate*dt,p.currentMl+regen*dt)
        p.currentMl=round(Math.min(p.normalMl,Math.max(0,p.currentMl+(regen-rate)*dt)))
        p.totalLostMl=round(p.totalLostMl+actualLost)
      }
      if((p.mode==='mana'||p.mode==='shadow')&&p.normalMl>0&&!actor.rpg.dead){
        const max=Number(effectiveActor(actor,now).resources[p.mode].maximum),rate=Object.values(actor.body.parts).reduce((s,x)=>s+(x.bleedingMlPerSecond??0),0)
        const lost=max>0?Math.min(rate*dt,Number(actor.resources[p.mode].current)/max*p.normalMl):0
        p.totalLostMl=round(p.totalLostMl+lost)
      }
      const costs=ongoingCosts(actor,now)
      for(const k of ['mana','shadow','stamina'] as const)actor.resources[k].current=String(round(Math.min(Number(effectiveActor(actor,now).resources[k].maximum),Math.max(0,Number(actor.resources[k].current)-costs[k]*dt))))
    }
    w.campaign.seconds=round(now+dt)
    for(const actor of w.characters)applyAutomaticLife(actor,w.campaign.seconds,eventId+'-life-'+count+'-'+actor.id)
  }
  w.campaign.seconds=end
  for(const owner of w.characters)for(const cast of owner.rpg.casts){
    if(cast.status==='preparing'&&cast.readyAt<=end)cast.status='ready'
    if(cast.status==='maintaining'){
      let impossible=false
      try{requirements(owner,cast.ability,cast.input,end)}catch{impossible=true}
      if(cast.endsAt!==null&&cast.endsAt<=end)cast.status='ended'
      else if(impossible||Object.entries(cast.ability.upkeep).some(([k,v])=>v>0&&Number(owner.resources[k as 'mana'|'shadow'|'stamina'].current)<=1e-8))cast.status='interrupted'
    }
  }
  for(const actor of w.characters){actor.rpg.effects=actor.rpg.effects.filter(e=> (e.expiresAt===null||e.expiresAt>end)&&(!e.ownerId||w.characters.find(c=>c.id===e.ownerId)?.rpg.casts.find(c=>c.id===e.castId)?.status!=='interrupted'));clampResources(actor,end);applyAutomaticLife(actor,end,eventId+'-end-'+actor.id)}
  const details=w.characters.map(c=>c.name+': потеря крови '+round(c.rpg.physiology.totalLostMl-(initialLost.get(c.id)??0))+' мл; '+physiologyStatus(c,end).label).join('\n')
  logWorld(w,eventId,'Время +'+seconds+' с → '+end+' с',details,w.characters.map(c=>c.id));w.campaign.revision++
  if(!w.characters.every(isCharacterDraft)||!isCampaign(w.campaign))fail('После расчёта получились недопустимые значения. Ничего не изменено.')
  return w
}
export function worldFrom(characters:SavedCharacter[],campaign:Campaign):World{return {characters:characters.map(c=>({...normalizeCharacterDraft(c),id:c.id})),campaign}}
export function removeEffect(world:World,targetId:string,effectId:string,eventId:string):World{
  const w=cloneWorld(world),target=w.characters.find(c=>c.id===targetId),effect=target?.rpg.effects.find(e=>e.id===effectId)
  if(!target||!effect)fail('Эффект не найден.')
  target!.rpg.effects=target!.rpg.effects.filter(e=>e.id!==effectId)
  const cast=w.characters.find(c=>c.id===effect!.ownerId)?.rpg.casts.find(c=>c.id===effect!.castId)
  if(cast&&cast.status==='maintaining')cast.status='interrupted'
  clampResources(target!,w.campaign.seconds);logWorld(w,eventId,'Снят эффект: '+effect!.name,'Решение мастера.',[targetId]);w.campaign.revision++;return w
}
export function availableAreas(actor:Actor){return bodyRegionDefs(actor.body).filter(r=>actor.body.parts[r.key].present)}
export const usablePart = (actor:Actor,key:string) => actor.body.parts[key] && !['absent','disabled'].includes(partCondition(actor.body.parts[key])) && !(actor.body.parts[key].injuries??[]).some(i=>i.blocksUse) && !(actor.body.anatomy?.structures??[]).some(s=>s.region===key&&!!s.functionGroup&&structureBlocked(s))
export function modifiersText(ms:Modifier[]){return ms.map(m=>parameterFields.find(p=>p.key===m.parameter)?.label+': '+m.flat+'; '+m.percent+'%').join('; ')}

// Изменение состояния не лечит раны. Отметка смерти сохраняется до решения мастера.
export function applyAutomaticLife(actor:Actor,seconds:number,eventId:string):void {
 const a=actor.body.anatomy
 if(!a?.automatic)return
 const deficit=physiologyStatus(actor,seconds).deficit
 const before=actor.rpg.dead?'dead':actor.body.consciousness
 const previousOverride=a.override
 if(a.override&&(a.override.revision!==a.harmRevision||deficit>a.lastDeficit+1e-8))a.override=null
 a.lastDeficit=deficit
 const result=automaticLife(a,deficit,Object.entries(actor.body.parts).filter(([,p])=>!p.present).map(([key])=>key),false)
 if(a.override){actor.rpg.dead=a.override.state==='dead';actor.body.consciousness=a.override.state==='awake'?'awake':'unconscious'}
 else if(!actor.rpg.dead){actor.rpg.dead=result.dead;actor.body.consciousness=result.unconscious?'unconscious':'awake'}
 if(actor.rpg.dead)actor.body.consciousness='unconscious'
 const after=actor.rpg.dead?'dead':actor.body.consciousness
 if(before!==after||previousOverride&&!a.override){
  const log={id:eventId.replace(/[^a-zA-Z0-9:_-]/g,'_').slice(0,160)||'auto-life',seconds,text:'Состояние: '+({dead:'погиб',awake:'в сознании',unconscious:'без сознания'}[after]),details:(previousOverride&&!a.override?'Решение мастера перестало действовать после нового ухудшения. ':'')+result.reasons.join('; ')}
  if(!actor.rpg.logs.some(x=>x.id===log.id))actor.rpg.logs=[...actor.rpg.logs,log].slice(-200)
 }
}
export function recalculateLife(actor:Actor,seconds:number,eventId:string):Actor {
 const next={...normalizeCharacterDraft(actor),id:actor.id};applyAutomaticLife(next,seconds,eventId);return next
}
export function masterLifeOverride(actor:Actor,seconds:number,state:'awake'|'unconscious'|'dead',reason:string,eventId:string):Actor {
 if(!['awake','unconscious','dead'].includes(state)||!reason.trim()||reason.length>1000||!eventId||eventId.length>160||!/^[a-zA-Z0-9:_-]+$/.test(eventId)||actor.rpg.logs.some(l=>l.id===eventId))throw new Error('Укажи причину решения мастера (до 1000 знаков).')
 const next={...normalizeCharacterDraft(actor),id:actor.id}
 if(next.body.anatomy){next.body.anatomy.override={state,reason:reason.trim(),revision:next.body.anatomy.harmRevision};next.body.anatomy.lastDeficit=physiologyStatus(next,seconds).deficit}
 next.rpg.dead=state==='dead';next.body.consciousness=state==='awake'?'awake':'unconscious'
 next.rpg.logs=[...next.rpg.logs,{id:eventId,seconds,text:'Решение мастера: '+({dead:'погиб',awake:'в сознании',unconscious:'жив, без сознания'}[state]),details:reason.trim()+'. Травмы и кровь сохранены; новое ухудшение запускает автоматическую проверку.'}].slice(-200)
 return next
}
