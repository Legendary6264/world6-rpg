import { canonicalRaceId } from './raceCatalog'
import { evaluatedParameters } from './rpgParameters'
import { createDetailedAnatomy } from './anatomyModel'
import type { AnatomyForm } from './anatomyModel'
import { emptyBody } from './characterBody'
import { raceById, standardFormulas, defaultCreation, type CreationState } from './creationRules'
import { emptyPhysiology, emptyAbility, emptyRpg } from './rpgSchema'
import type { ReadyCharacterDraft } from './characterModel'

export function applyRace(actor:ReadyCharacterDraft,raceId:string,form:CreationState['form']='base',reset=false):ReadyCharacterDraft {
 raceId=canonicalRaceId(raceId)
 const race=raceById(raceId,actor.creation.customRaces),energy=race.id==='shadowborn'?'shadow':actor.profile.energy??'mana'
 const memory=reset||actor.creation.raceId!==raceId?{}:{...actor.creation.formMemory,[actor.creation.form]:structuredClone(actor.body)}
 const stored=memory[form]
 const body=emptyBody(),creation={...actor.creation,raceId,form,formMemory:memory,appearance:{...actor.creation.appearance,skin:race.skin}}
 const anatomyForm:AnatomyForm=form==='full'&&race.transform?race.fullForm:race.form
 if(anatomyForm==='winged')for(const key of ['leftWing','rightWing'])body.parts[key]={...body.parts.leftArm,label:key==='leftWing'?'Левое крыло':'Правое крыло',present:true}
 if((race.tail||race.horns)&&(form!=='base'||!race.transform)){
 if(race.tail)body.parts.tail={...body.parts.leftArm,label:'Хвост',present:true}
 if(race.horns)for(const key of ['leftHorn','rightHorn'])body.parts[key]={...body.parts.leftArm,label:key==='leftHorn'?'Левый рог':'Правый рог',present:true}
 }
 if(anatomyForm==='quadruped'||anatomyForm==='bird')for(const side of ['left','right']){const label=side==='left'?'Левая':'Правая';body.parts[side+'Arm'].label=label+(anatomyForm==='bird'?' часть крыла':' передняя конечность');body.parts[side+'Arm'].group=anatomyForm==='bird'?'other':side==='left'?'leftLeg':'rightLeg';body.parts[side+'Hand'].group=body.parts[side+'Arm'].group;body.parts[side+'Hand'].label=label+(anatomyForm==='bird'?' оконечность крыла':' передняя лапа')}
 for(const [key,p] of Object.entries(body.parts)){
 p.current=100;p.maximum=100
 if(!reset&&(actor.body.parts[key]??stored?.parts[key])?.maximum){const old=actor.body.parts[key]??stored!.parts[key];body.parts[key]={...structuredClone(old),label:p.label??old.label,group:p.group}}
 }
 body.anatomy=createDetailedAnatomy(anatomyForm,Object.keys(body.parts),race.wings);body.anatomy.wingStyle=race.wings
 if(!race.blood){
 body.anatomy.structures=body.anatomy.structures.filter(s=>s.kind!=='vessel'&&s.kind!=='organ')
 body.anatomy.structures.push({id:'energy-core',name:race.id==='artificial'?'Опорное ядро':'Энергетическое ядро',region:'torso',kind:'organ',x:.5,y:.4,rx:.18,ry:.14,depth:.5,current:100,maximum:100,thresholdJ:8,joulesPerHp:3,transmission:.5,bleedingRate:0,functionGroup:'',role:'core',injuries:[]})
 }
 if(race.gills)for(const side of ['left','right'])body.anatomy.structures.push({id:side+'-gill',name:side==='left'?'Левые жабры':'Правые жабры',region:'head',kind:'organ',x:side==='left'?.85:.15,y:.7,rx:.1,ry:.18,depth:.15,current:100,maximum:100,thresholdJ:3,joulesPerHp:1,transmission:.8,bleedingRate:.1,functionGroup:'waterBreathing',role:'none',injuries:[]})
 if(race.fireBreath)body.anatomy.structures.push({id:'fire-gland',name:'Огненная железа',region:'torso',kind:'organ',x:.5,y:.18,rx:.12,ry:.09,depth:.6,current:100,maximum:100,thresholdJ:4,joulesPerHp:2,transmission:.7,bleedingRate:.1,functionGroup:'fireBreath',role:'none',injuries:[]})
 if(!reset){
 for(const s of body.anatomy.structures){const old=actor.body.anatomy?.structures.find(x=>x.id===s.id)??stored?.anatomy?.structures.find(x=>x.id===s.id);if(old){s.current=Math.round(s.maximum*old.current/old.maximum);s.injuries=structuredClone(old.injuries);s.activeBleeding=old.activeBleeding??0}}
 body.consciousness=actor.body.consciousness;body.history=structuredClone(actor.body.history);body.anatomy.harmRevision=actor.body.anatomy?.harmRevision??0
 }
 const physiology={...emptyPhysiology(),race:race.name,mode:race.blood?'blood' as const:race.id==='artificial'?'none' as const:energy,normalMl:race.blood||1000,currentMl:race.blood||1000,naturalMlPerSecond:race.blood?.3:0,weakModifiers:[{parameter:'movement' as const,flat:0,percent:-15}],impairedModifiers:[{parameter:'movement' as const,flat:0,percent:-40},{parameter:'concentrationPower' as const,flat:0,percent:-30}],criticalModifiers:[{parameter:'movement' as const,flat:0,percent:-80},{parameter:'controlPower' as const,flat:0,percent:-50}]}
 if(!reset&&actor.rpg.physiology.normalMl>0){physiology.currentMl=physiology.normalMl*actor.rpg.physiology.currentMl/actor.rpg.physiology.normalMl;physiology.totalLostMl=actor.rpg.physiology.totalLostMl}
 const abilities=actor.rpg.abilities.filter(a=>!a.innate||!a.raceId||a.raceId===raceId)
 if(race.fireBreath&&!abilities.some(a=>a.id==='innate-fire-breath'))abilities.push({...emptyAbility(),id:'innate-fire-breath',templateId:'innate-fire-breath',name:'Огненное дыхание',description:'Врождённое пламя огненной железы. Мана не расходуется; требуется выносливость и действующая железа. Тепловое повреждение определяет мастер.',innate:true,raceId,approved:true,cost:{mana:0,shadow:0,stamina:5},rangeM:6,requiredStructures:['fire-gland'],condition:'Доступно дыхание и выбрана тепловая травма цели',minimumLevel:0})
 const other=energy==='mana'?'shadow':'mana'
 return {...actor,creation,profile:{...actor.profile,energy},body,rpg:{...actor.rpg,physiology,abilities,inventory:actor.rpg.inventory.map(i=>({...i,equipped:i.equipped&&!i.covers.some(k=>!body.parts[k])})),dead:reset?false:actor.rpg.dead},resources:{...actor.resources,[other]:{current:'0',maximum:'0'}}}
}
export const characterTemplates=[
 {id:'elf-scout',name:'Эльфийская разведчица',race:'elf',energy:'mana',school:'wind',portrait:'portrait-elf',skills:{stealth:25,tracking:20,ranged:20}},
 {id:'shadow-thief',name:'Теневой вор',race:'human',energy:'shadow',school:'shadows',portrait:'portrait-traveler',skills:{stealth:25,pickpocket:20,lockpicking:20}},
 {id:'water-draconid',name:'Драконид · маг воды',race:'draconid',energy:'mana',school:'water',portrait:'portrait-mage',skills:{spellcraft:25,channeling:20}},
 {id:'nephalem',name:'Нефалем · свет и огонь',race:'nephalem',energy:'mana',school:'light',portrait:'portrait-mage',skills:{mental:20,spellcraft:20}},
] as const
export function applyCharacterTemplate(actor:ReadyCharacterDraft,id:string):ReadyCharacterDraft {
 const t=characterTemplates.find(t=>t.id===id);if(!t)return actor
 const creation=defaultCreation();Object.assign(creation.skills,t.skills)
 let next:ReadyCharacterDraft={...actor,name:t.name,creation,profile:{...actor.profile,rank:'spellcaster' as const,rankStep:1,energy:t.energy,portrait:t.portrait,advancement:'' as const,concept:'',emperor:false,magic:[{schoolId:t.school,state:'mastered' as const,notes:'Учебный пример'}]},rpg:{...emptyRpg(),formulas:standardFormulas()}}
 next=applyRace(next,t.race,'base',true)
 const energy=t.energy;next.resources={...next.resources,health:{current:'0',maximum:'0'},mana:{current:energy==='mana'?'100':'0',maximum:energy==='mana'?'100':'0'},shadow:{current:energy==='shadow'?'70':'0',maximum:energy==='shadow'?'70':'0'},stamina:{current:'80',maximum:'80'}}
 const parameters=evaluatedParameters(next,0)
 for(const [key,max] of [['mana',parameters.maximumMana],['shadow',parameters.maximumShadow],['stamina',parameters.maximumStamina]] as const)next.resources[key]={current:max,maximum:max}
 return next
}
