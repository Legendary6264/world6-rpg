import { createWingStructures, wingProjection } from './wingAnatomy'
import type { WingStyle } from './wingAnatomy'
// Координаты и коэффициенты — редактируемая игровая схема, не медицинский симулятор.
export type AnatomyForm = 'humanoid' | 'winged' | 'quadruped' | 'bird'
export type StructureKind = 'skin' | 'muscle' | 'tissue' | 'bone' | 'joint' | 'organ' | 'vessel'
export type AnatomyInjury = { id:string; label:string; blocksUse:boolean; diagnosed:boolean }
export type AnatomyStructure = {
 connections?:string[]; id:string; name:string; region:string; kind:StructureKind
 x:number; y:number; rx:number; ry:number; depth:number; current:number; maximum:number
 thresholdJ:number; joulesPerHp:number; transmission:number; bleedingRate:number
 slowdown?:number; activeBleeding?:number; functionGroup:string; role:'none'|'brain'|'circulation'|'respiration'|'core'; injuries:AnatomyInjury[]
}
export type HitLocation = { x:number; y:number; approach:'front'|'back'; mechanism:'blunt'|'pierce'|'cut'; angleX:number; angleY:number }
export type HitTrace = { region:string; point:HitLocation; initialJ:number; remainingJ:number; steps:{id:string;name:string;beforeJ:number;afterJ:number;damage:number}[] }
export type LifeOverride = { state:'awake'|'unconscious'|'dead'; reason:string; revision:number }
export type DetailedAnatomy = {
 wingStyle?:'membrane'|'feathers'; zeroHealthLethal?:boolean; form:AnatomyForm; structures:AnatomyStructure[]; harmRevision:number; automatic:boolean
 lethalDeficit:number; unconsciousDeficit:number; lastDeficit:number
 override:LifeOverride|null; lastTrace:HitTrace|null
}
export const anatomyForms:Record<AnatomyForm,string>={humanoid:'Гуманоид',winged:'Крылатый гуманоид',quadruped:'Четвероногое',bird:'Птица'}
export const kindLabels:Record<StructureKind,string>={skin:'Кожа',muscle:'Мышцы',tissue:'Ткани (старый лист)',bone:'Кости',joint:'Суставы',organ:'Органы',vessel:'Сосуды'}
export type RegionBounds = {x:number;y:number;rx:number;ry:number}
const humanoid:Record<string,RegionBounds>={head:{x:154,y:60,rx:28,ry:40},torso:{x:154,y:210,rx:53,ry:107},leftArm:{x:236,y:216,rx:22,ry:80},rightArm:{x:72,y:216,rx:22,ry:80},leftHand:{x:270,y:309,rx:18,ry:27},rightHand:{x:38,y:309,rx:18,ry:27},leftLeg:{x:182,y:409,rx:24,ry:126},rightLeg:{x:126,y:409,rx:24,ry:126},leftFoot:{x:185,y:545,rx:23,ry:29},rightFoot:{x:123,y:545,rx:23,ry:29},leftWing:{x:258,y:170,rx:37,ry:110},rightWing:{x:42,y:170,rx:37,ry:110}}
export function regionBounds(form:AnatomyForm,region:string,index=0,wingStyle:WingStyle='membrane'):RegionBounds {
 if(region.endsWith('Wing')){const p=wingProjection(.5,.5,wingStyle);return {x:region.startsWith('left')?p.x:300-p.x,y:p.y,rx:wingStyle==='membrane'?61:53.5,ry:wingStyle==='membrane'?119:94}}
 if(form==='quadruped'&&region==='tail')return {x:276,y:342,rx:16,ry:60}
 if(['leftHorn','rightHorn','tail','extraLeftArm','extraRightArm'].includes(region))return ({leftHorn:{x:180,y:28,rx:10,ry:27},rightHorn:{x:120,y:28,rx:10,ry:27},tail:{x:240,y:427,rx:17,ry:83},extraLeftArm:{x:261,y:266,rx:18,ry:74},extraRightArm:{x:39,y:266,rx:18,ry:74}} as Record<string,RegionBounds>)[region]
 if(form==='quadruped')return ({head:{x:57,y:235,rx:53,ry:59},torso:{x:167,y:293,rx:84,ry:54},leftArm:{x:105,y:357,rx:15,ry:48},rightArm:{x:86,y:354,rx:13,ry:48},leftHand:{x:91,y:415,rx:20,ry:10},rightHand:{x:79,y:410,rx:19,ry:10},leftLeg:{x:230,y:358,rx:25,ry:50},rightLeg:{x:211,y:355,rx:23,ry:48},leftFoot:{x:251,y:416,rx:19,ry:10},rightFoot:{x:226,y:410,rx:18,ry:10}} as Record<string,RegionBounds>)[region]??{x:160,y:470,rx:25,ry:25}
 if(form==='bird')return ({head:{x:150,y:123,rx:33,ry:35},torso:{x:150,y:255,rx:54,ry:90},leftArm:{x:229,y:245,rx:48,ry:54},rightArm:{x:71,y:245,rx:48,ry:54},leftHand:{x:268,y:326,rx:27,ry:35},rightHand:{x:32,y:326,rx:27,ry:35},leftLeg:{x:173,y:347,rx:13,ry:33},rightLeg:{x:127,y:347,rx:13,ry:33},leftFoot:{x:178,y:385,rx:24,ry:20},rightFoot:{x:122,y:385,rx:24,ry:20}} as Record<string,RegionBounds>)[region]??{x:150,y:480,rx:24,ry:25}
 return humanoid[region]??{x:40+index%4*70,y:585+Math.floor(index/4)*40,rx:25,ry:17}
}
export function structurePoint(form:AnatomyForm,s:Pick<AnatomyStructure,'region'|'x'|'y'|'rx'|'ry'>&{id?:string},index=0,wingStyle:WingStyle='membrane'){
 const b=regionBounds(form,s.region,index,wingStyle)
 let x=b.x+(s.x-.5)*2*b.rx,y=b.y+(s.y-.5)*2*b.ry
 if(form==='humanoid'||form==='winged'){
 const side=s.region.startsWith('left')?1:-1
 if(s.region.endsWith('Arm'))x=154+side*(63+33*s.y+14*s.y*s.y)+(s.x-.5)*20
 if(s.region.endsWith('Hand'))x=154+side*(106+s.y*11)+(s.x-.5)*25
 if(s.region.endsWith('Leg'))x=154+side*(26+s.y*6)+(s.x-.5)*30
 const joint=s.id?.replace(/^(left|right)-/,'');const positions:Record<string,[number,number]>={'shoulder':[62,140],'elbow':[82,216],'wrist-joint':[106,282],'hip':[27,284],'knee':[28,385],'ankle-joint':[31,519]};if(joint&&positions[joint]){x=154+side*positions[joint][0];y=positions[joint][1]}
 }
 if(form==='quadruped'){
 const near=s.region.startsWith('left'),offset=near?0:-17,t=s.y
 if(s.region.endsWith('Arm')){x=105+offset+(t>.5?-18*(t-.5):8*t);y=312+t*92}
 if(s.region.endsWith('Leg')){x=near?224:210;x+=t<.4?-12*t:58*(t-.4);y=307+t*98}
 if(s.region==='torso'){
 const rib=s.id?.match(/^rib-(left|right)-(\d+)$/),vertebra=s.id?.match(/^vertebra-(\d+)$/)
 if(rib){x=112+Number(rib[2])*6;y=rib[1]==='left'?302:286}
 else if(vertebra){x=99+Number(vertebra[1])*6;y=266+Math.sin(Number(vertebra[1])/24*Math.PI)*4}
 else {const organs:Record<string,[number,number]>={heart:[121,304],'lung-left':[117,285],'lung-right':[133,285],liver:[149,311],stomach:[172,303],intestines:[194,320],'kidney-left':[199,281],'kidney-right':[208,287],bladder:[223,315],pelvis:[225,298],sternum:[123,324],'spinal-cord':[170,267],aorta:[155,275],'left-scapula':[110,284],'right-scapula':[93,278],'left-clavicle':[111,306],'right-clavicle':[94,300]};if(s.id&&organs[s.id])[x,y]=organs[s.id]}
 }
 const joint=s.id?.replace(/^(left|right)-/,'');const points:Record<string,[number,number]>={shoulder:[105,312],elbow:[109,348],'wrist-joint':[97,404],hip:[224,307],knee:[216,347],'ankle-joint':[252,403]};if(joint&&points[joint]){[x,y]=points[joint];if(!near){x-=17;y-=4}}
 }
 if(form==='bird'){
 const side=s.region.startsWith('left')?1:-1,t=s.y
 if(s.region.endsWith('Arm')){x=150+side*(49+67*t);y=192+83*t}
 if(s.region.endsWith('Hand')){x=150+side*(104+29*t);y=276+72*t}
 const joint=s.id?.replace(/^(left|right)-/,'');const points:Record<string,[number,number]>={shoulder:[49,192],elbow:[86,229],'wrist-joint':[108,277],hip:[22,313],knee:[24,336],'ankle-joint':[26,371]};if(joint&&points[joint]){x=150+side*points[joint][0];y=points[joint][1]}
 }
 if(s.region.endsWith('Wing')){const p=wingProjection(s.x,s.y,wingStyle);x=s.region.startsWith('left')?p.x:300-p.x;y=p.y}
 return {x,y,rx:s.rx*2*b.rx,ry:s.ry*2*b.ry}
}
export function inferAnatomyForm(race:string,regions:string[]):AnatomyForm {
 const name=race.toLocaleLowerCase()
 if(/птиц|орёл|орел|ворон|сокол|bird/.test(name))return 'bird'
 if(/волк|вепр|медвед|кот|кошк|лошад|пантера|пёс|собак|quadruped/.test(name))return 'quadruped'
 if(regions.some(r=>/wing/i.test(r))||/крылат|ангел|демон с крыл|winged/.test(name))return 'winged'
 return 'humanoid'
}
export function createDetailedAnatomy(form:AnatomyForm,regions:string[],wingStyle:WingStyle='membrane'):DetailedAnatomy {
 const structures:AnatomyStructure[]=[]
 function add(id:string,name:string,region:string,kind:StructureKind,x:number,y:number,rx:number,ry:number,depth:number,group='',role:AnatomyStructure['role']='none'){
  if(!regions.includes(region))return
  structures.push({id,name,region,kind,x,y,rx,ry,depth,current:100,maximum:100,thresholdJ:kind==='bone'?12:(['skin','muscle','tissue'].includes(kind))?5:2,joulesPerHp:kind==='bone'?4:(['skin','muscle','tissue'].includes(kind))?2:1,transmission:kind==='bone'?.45:.75,bleedingRate:kind==='vessel'?5:kind==='organ'?1:.2,activeBleeding:0,slowdown:15,functionGroup:group,role,injuries:[]})
 }
 const names:Record<string,string>={head:'голова',torso:'туловище',leftArm:'левая рука',rightArm:'правая рука',leftHand:'левая кисть',rightHand:'правая кисть',leftLeg:'левая нога',rightLeg:'правая нога',leftFoot:'левая стопа',rightFoot:'правая стопа',leftWing:'левое крыло',rightWing:'правое крыло',tail:'хвост'}
 for(const r of regions){add(r+'-skin','Кожа / покров · '+(names[r]??r),r,'skin',.5,.5,.5,.5,.02);add(r+'-muscle','Мышцы · '+(names[r]??r),r,'muscle',.5,.5,.44,.45,.18)}
 add('skull','Череп','head','bone',.5,.4,.43,.38,.3)
 add('jaw','Нижняя челюсть','head','bone',.5,.78,.29,.13,.25,'speech')
 add('brain','Головной мозг','head','organ',.5,.38,.32,.27,.5,'','brain')
 add('left-eye','Левый глаз','head','organ',.7,.48,.08,.08,.12)
 add('right-eye','Правый глаз','head','organ',.3,.48,.08,.08,.12)
 add('neck-vessel','Шейные сосуды','head','vessel',.5,.9,.13,.1,.4)
 add('sternum','Грудина','torso','bone',.5,.28,.055,.2,.18)
 add('pelvis','Таз','torso','bone',.5,.87,.39,.13,.5,'leftLeg')
 for(let n=1;n<=12;n++)for(const side of ['left','right'])add('rib-'+side+'-'+n,(side==='left'?'Левое':'Правое')+' ребро '+n,'torso','bone',side==='left'?.73:.27,.11+n*.04,.19,.014,.23)
 for(let n=1;n<=24;n++)add('vertebra-'+n,'Позвонок '+n,'torso','bone',.5,.03+n*.035,.055,.015,.85,'', 'none')
 add('spinal-cord','Спинной мозг','torso','organ',.5,.48,.03,.39,.88,'leftLeg')
 add('heart','Сердце','torso','organ',.61,.3,.14,.08,.46,'','circulation')
 add('lung-left','Левое лёгкое','torso','organ',.75,.3,.16,.24,.45,'','respiration')
 add('lung-right','Правое лёгкое','torso','organ',.25,.3,.16,.24,.45,'','respiration')
 add('liver','Печень','torso','organ',.32,.58,.27,.12,.4)
 add('stomach','Желудок','torso','organ',.71,.59,.15,.13,.45)
 add('intestines','Кишечник','torso','organ',.5,.76,.3,.15,.5)
 add('kidney-left','Левая почка','torso','organ',.75,.61,.09,.1,.75)
 add('kidney-right','Правая почка','torso','organ',.25,.61,.09,.1,.75)
 add('bladder','Мочевой пузырь','torso','organ',.5,.9,.11,.07,.4)
 add('aorta','Аорта','torso','vessel',.53,.5,.045,.33,.65)
 for(const side of ['left','right']){
  const ru=side+'Arm',rh=side+'Hand',rl=side+'Leg',rf=side+'Foot',g=side+'Hand',lg=side+'Leg',label=side==='left'?'Левая':'Правая'
  add(side+'-clavicle',label+' ключица','torso','bone',side==='left'?.76:.24,.09,.2,.02,.2,g)
  add(side+'-scapula',label+' лопатка','torso','bone',side==='left'?.75:.25,.25,.19,.17,.8,g)
  add(side+'-humerus',label+' плечевая кость',ru,'bone',.5,.25,.11,.23,.5,g)
  add(side+'-radius',label+' лучевая кость',ru,'bone',.37,.73,.07,.23,.4,g)
  add(side+'-ulna',label+' локтевая кость',ru,'bone',.63,.73,.07,.23,.55,g)
  add(side+'-arm-vessel',label+' плечевая артерия',ru,'vessel',.3,.5,.055,.43,.4)
  add(side+'-femur',label+' бедренная кость',rl,'bone',.5,.2,.12,.2,.5,lg)
  add(side+'-patella',label+' коленная чашечка',rl,'bone',.5,.4,.18,.05,.15,lg)
  add(side+'-tibia',label+' большеберцовая кость',rl,'bone',.4,.69,.1,.28,.4,lg)
  add(side+'-fibula',label+' малоберцовая кость',rl,'bone',.7,.7,.06,.27,.6,lg)
  add(side+'-leg-vessel',label+' бедренная артерия',rl,'vessel',.3,.38,.04,.32,.4)
  add(side+'-wrist',label+' запястье',rh,'bone',.5,.17,.29,.12,.5,g)
  add(side+'-ankle',label+' предплюсна',rf,'bone',.5,.3,.28,.2,.5,lg)
  for(let finger=1;finger<=5;finger++){
   const x=.13+finger*.125
   add(side+'-metacarpal-'+finger,'Пястная кость '+finger+' · '+label.toLowerCase()+' кисть',rh,'bone',x,.4,.035,.15,.5)
   add(side+'-metatarsal-'+finger,'Плюсневая кость '+finger+' · '+label.toLowerCase()+' стопа',rf,'bone',x,.57,.035,.16,.5)
   for(let ph=1;ph<=(finger===1?2:3);ph++){
    add(side+'-finger-'+finger+'-'+ph,'Палец '+finger+', фаланга '+ph+' · '+label.toLowerCase()+' кисть',rh,'bone',x,.53+ph*.12,.035,.048,.5)
    add(side+'-toe-'+finger+'-'+ph,'Палец '+finger+', фаланга '+ph+' · '+label.toLowerCase()+' стопа',rf,'bone',x,.71+ph*.065,.035,.022,.5)
   }
  }
 }
 for(const side of ['left','right']){
  const label=side==='left'?'Левый':'Правый',hand=side+'Hand',leg=side+'Leg'
  const joints:[string,string,string,number,number,string[],string][]=[
   [side+'-shoulder',label+' плечевой сустав',side+'Arm',.5,.06,[side+'-scapula',side+'-humerus'],hand],
   [side+'-elbow',label+' локтевой сустав',side+'Arm',.5,.5,[side+'-humerus',side+'-radius',side+'-ulna'],hand],
   [side+'-wrist-joint',label+' лучезапястный сустав',side+'Hand',.5,.06,[side+'-radius',side+'-ulna',side+'-wrist'],hand],
   [side+'-hip',label+' тазобедренный сустав',side+'Leg',.5,.04,['pelvis',side+'-femur'],leg],
   [side+'-knee',label+' коленный сустав',side+'Leg',.5,.4,[side+'-femur',side+'-tibia',side+'-patella'],leg],
   [side+'-ankle-joint',label+' голеностопный сустав',side+'Foot',.5,.05,[side+'-tibia',side+'-ankle'],leg],
  ]
  for(const [id,name,region,x,y,connections,group] of joints){add(id,name,region,'joint',x,y,.14,.03,.4,group);const joint=structures.find(s=>s.id===id);if(joint)joint.connections=connections.filter(id=>structures.some(s=>s.id===id))}
  for(const [id,name,region,x,y,rx,ry,group] of [
   [side+'-deltoid','Дельтовидная мышца',side+'Arm',.5,.1,.25,.1,hand],
   [side+'-biceps','Двуглавая мышца плеча',side+'Arm',.42,.27,.2,.15,hand],
   [side+'-triceps','Трёхглавая мышца плеча',side+'Arm',.62,.29,.2,.15,hand],
   [side+'-forearm-flexor','Сгибатели предплечья',side+'Arm',.38,.72,.19,.19,hand],
   [side+'-forearm-extensor','Разгибатели предплечья',side+'Arm',.63,.73,.17,.18,hand],
   [side+'-quadriceps','Четырёхглавая мышца бедра',side+'Leg',.45,.21,.28,.17,leg],
   [side+'-hamstring','Задняя группа бедра',side+'Leg',.7,.23,.2,.17,leg],
   [side+'-calf','Икроножная мышца',side+'Leg',.55,.64,.23,.14,leg],
   [side+'-tibialis','Передняя большеберцовая мышца',side+'Leg',.35,.77,.12,.16,leg],
   [side+'-pectoral','Большая грудная мышца','torso',side==='left'?.76:.24,.25,.2,.12,hand],
   [side+'-latissimus','Широчайшая мышца спины','torso',side==='left'?.8:.2,.45,.12,.2,hand],
  ] as [string,string,string,number,number,number,number,string][]){add(id,name+' · '+label.toLowerCase(),region,'muscle',x,y,rx,ry,.2,group)}
 }
 add('abdominal','Прямая мышца живота','torso','muscle',.5,.6,.17,.17,.2)
 add('neck-joint','Атлантозатылочный сустав','head','joint',.5,.96,.15,.03,.55,'speech')
 structures.push(...createWingStructures(regions,wingStyle))
 if(form==='quadruped'||form==='bird'){
 for(const s of structures){s.name=s.name.replace(/ кисть/g,form==='bird'?' крыло':' передняя лапа').replace(/стопа/g,'задняя лапа').replace(/запястье/g,form==='bird'?'карпометакарпус':'запястье передней лапы')}
 }
 if(form==='bird'){
 for(const s of structures){if(s.id==='sternum')s.name='Грудина и киль';if(s.id==='pelvis')s.name='Таз и сложный крестец';if(s.id.endsWith('-tibia'))s.name=s.name.replace('большеберцовая кость','тибиотарзус');if(s.id.endsWith('-ankle'))s.name=s.name.replace('предплюсна','цевка');if(s.id.endsWith('-clavicle'))s.name=s.name.replace('ключица','ветвь вилочки')}
 add('air-sacs','Воздушные мешки','torso','organ',.5,.47,.39,.3,.55,'flight')
 add('crop','Зоб','torso','organ',.5,.08,.13,.07,.2)
 add('gizzard','Мышечный желудок','torso','organ',.4,.74,.14,.12,.45)
 add('syrinx','Сиринкс','torso','organ',.5,.15,.06,.05,.3,'speech')
 }
 if(form==='bird')for(const s of structures)if(/^(left|right)(Arm|Hand)$/.test(s.region)&&s.functionGroup)s.functionGroup=s.region.startsWith('left')?'leftWing':'rightWing'
 return {wingStyle,zeroHealthLethal:false,form,structures,harmRevision:0,automatic:true,lethalDeficit:.4,unconsciousDeficit:.35,lastDeficit:0,override:null,lastTrace:null}
}
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v)
const n=(v:unknown,max=1e12):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max
const t=(v:unknown,max=160):v is string=>typeof v==='string'&&v.length>0&&v.length<=max
const id=(v:unknown):v is string=>t(v)&&/^[a-zA-Z0-9:_-]+$/.test(v)&&!['__proto__','constructor','prototype'].includes(v)
export function isHitLocation(v:unknown):v is HitLocation{return record(v)&&n(v.x,1)&&n(v.y,1)&&['front','back'].includes(String(v.approach))&&['blunt','pierce','cut'].includes(String(v.mechanism))&&typeof v.angleX==='number'&&Number.isFinite(v.angleX)&&Math.abs(v.angleX)<=1&&typeof v.angleY==='number'&&Number.isFinite(v.angleY)&&Math.abs(v.angleY)<=1}
export function isStructure(v:unknown):v is AnatomyStructure {
 return record(v)&&(v.connections===undefined||Array.isArray(v.connections)&&v.connections.length<=8&&v.connections.every(id))&&(v.slowdown===undefined||n(v.slowdown,100))&&(v.activeBleeding===undefined||n(v.activeBleeding,1e9))&&id(v.id)&&t(v.name,120)&&id(v.region)&&['skin','muscle','tissue','bone','joint','organ','vessel'].includes(String(v.kind))&&['x','y','rx','ry','depth','transmission'].every(k=>n(v[k],1))&&(v.rx as number)>0&&(v.ry as number)>0&&n(v.current)&&Number.isSafeInteger(v.current)&&n(v.maximum)&&Number.isSafeInteger(v.maximum)&&(v.maximum as number)>0&&(v.current as number)<=(v.maximum as number)&&n(v.thresholdJ)&&n(v.joulesPerHp)&&(v.joulesPerHp as number)>0&&n(v.bleedingRate,1e9)&&typeof v.functionGroup==='string'&&v.functionGroup.length<=120&&['none','brain','circulation','respiration','core'].includes(String(v.role))&&Array.isArray(v.injuries)&&v.injuries.length<=20&&v.injuries.every(i=>record(i)&&id(i.id)&&t(i.label,120)&&typeof i.blocksUse==='boolean'&&typeof i.diagnosed==='boolean')&&new Set(v.injuries.map(i=>i.id)).size===v.injuries.length
}
export function isDetailedAnatomy(v:unknown,regions?:string[]):v is DetailedAnatomy {
 if(!record(v)||(v.wingStyle!==undefined&&!['membrane','feathers'].includes(String(v.wingStyle)))||(v.zeroHealthLethal!==undefined&&typeof v.zeroHealthLethal!=='boolean')||!Object.keys(anatomyForms).includes(String(v.form))||!Array.isArray(v.structures)||!v.structures.length||v.structures.length>512||!v.structures.every(s=>isStructure(s)&&(!regions||regions.includes(s.region)))||new Set(v.structures.map(s=>s.id)).size!==v.structures.length||!n(v.harmRevision)||!Number.isSafeInteger(v.harmRevision)||typeof v.automatic!=='boolean'||!n(v.lethalDeficit,1)||!n(v.unconsciousDeficit,1)||(v.lethalDeficit as number)<=(v.unconsciousDeficit as number)||!n(v.lastDeficit,1))return false
 if(v.override!==null&&(!record(v.override)||!['awake','unconscious','dead'].includes(String(v.override.state))||!t(v.override.reason,1000)||!n(v.override.revision)||!Number.isSafeInteger(v.override.revision)))return false
 const tr=v.lastTrace
 return tr===null||record(tr)&&id(tr.region)&&(!regions||regions.includes(tr.region))&&isHitLocation(tr.point)&&n(tr.initialJ)&&n(tr.remainingJ)&&(tr.remainingJ as number)<=(tr.initialJ as number)&&Array.isArray(tr.steps)&&tr.steps.length<=512&&tr.steps.every(s=>record(s)&&id(s.id)&&t(s.name,120)&&['beforeJ','afterJ','damage'].every(k=>n(s[k])))
}
export function copyHitLocation(p:HitLocation):HitLocation{return {x:p.x,y:p.y,approach:p.approach,mechanism:p.mechanism,angleX:p.angleX,angleY:p.angleY}}
export function copyDetailedAnatomy(a:DetailedAnatomy):DetailedAnatomy {
 if(a.form==='bird')a={...a,structures:a.structures.map(s=>/^(left|right)(Arm|Hand)$/.test(s.region)&&s.functionGroup?{...s,functionGroup:s.region.startsWith('left')?'leftWing':'rightWing'}:s)}
 if(!a.structures.some(s=>s.kind==='joint')&&a.structures.some(s=>s.kind==='bone')){const added=createDetailedAnatomy(a.form,[...new Set(a.structures.map(s=>s.region))]).structures.filter(s=>(s.kind==='joint'||s.kind==='muscle')&&!a.structures.some(old=>old.id===s.id));const fresh=createDetailedAnatomy(a.form,[...new Set(a.structures.map(s=>s.region))]).structures;a={...a,structures:[...a.structures.map(s=>{const n=fresh.find(v=>v.id===s.id);return n?{...s,x:n.x,y:n.y,rx:n.rx,ry:n.ry}:s}),...added].slice(0,512)}}
 const wingRegions=[...new Set(a.structures.filter(s=>s.region.endsWith('Wing')).map(s=>s.region))]
 if(wingRegions.some(r=>!a.structures.some(s=>s.id===r.replace('Wing','-wing-')+'carpus'))){
 const biology=a.structures.some(s=>s.id==='brain'),templates=createWingStructures(wingRegions,a.wingStyle??'membrane').filter(s=>biology||s.kind!=='organ'&&s.kind!=='vessel')
 const refreshed=a.structures.map(s=>{const template=templates.find(t=>t.id===s.id);return template?{...s,x:template.x,y:template.y,rx:template.rx,ry:template.ry,name:template.name,functionGroup:template.functionGroup,connections:template.connections}:s})
 a={...a,structures:[...refreshed,...templates.filter(t=>!a.structures.some(s=>s.id===t.id))].slice(0,512)}
 }
 return {...(a.wingStyle?{wingStyle:a.wingStyle}:{}),zeroHealthLethal:false,form:a.form,harmRevision:a.harmRevision,automatic:a.automatic,lethalDeficit:a.lethalDeficit,unconsciousDeficit:a.unconsciousDeficit,lastDeficit:a.lastDeficit,override:a.override?{state:a.override.state,reason:a.override.reason,revision:a.override.revision}:null,lastTrace:a.lastTrace?{region:a.lastTrace.region,point:copyHitLocation(a.lastTrace.point),initialJ:a.lastTrace.initialJ,remainingJ:a.lastTrace.remainingJ,steps:a.lastTrace.steps.map(s=>({id:s.id,name:s.name,beforeJ:s.beforeJ,afterJ:s.afterJ,damage:s.damage}))}:null,structures:a.structures.map(s=>({...(s.connections?{connections:[...s.connections]}:{}),id:s.id,name:s.name,region:s.region,kind:s.kind==='tissue'?(s.id.endsWith('-skin')?'skin':s.id.endsWith('-muscle')?'muscle':'tissue'):s.kind,x:s.x,y:s.y,rx:s.rx,ry:s.ry,depth:s.depth,current:s.current,maximum:s.maximum,thresholdJ:s.thresholdJ,joulesPerHp:s.joulesPerHp,transmission:s.transmission,bleedingRate:s.bleedingRate,...(s.slowdown!==undefined?{slowdown:s.slowdown}:{}),...(s.activeBleeding!==undefined?{activeBleeding:s.activeBleeding}:{}),functionGroup:s.functionGroup,role:s.role,injuries:s.injuries.map(i=>({id:i.id,label:i.label,blocksUse:i.blocksUse,diagnosed:i.diagnosed}))}))}
}
export const structureBlocked=(s:AnatomyStructure)=>s.current===0||s.injuries.some(i=>i.blocksUse)
export function anatomicalConsequences(a?:DetailedAnatomy){
 const blocked=new Set<string>(),limited=new Set<string>(),notices:string[]=[],slowdown:Record<string,number>={}
 for(const s of a?.structures??[]){if(s.functionGroup&&structureBlocked(s)){blocked.add(s.functionGroup);if(s.id==='spinal-cord'||s.id==='pelvis')blocked.add('rightLeg')};if(s.functionGroup&&s.current<s.maximum&&!structureBlocked(s))limited.add(s.functionGroup);if(s.functionGroup&&s.current<s.maximum)slowdown[s.functionGroup]=Math.max(slowdown[s.functionGroup]??0,s.slowdown??15);if(s.current<s.maximum||s.injuries.length)notices.push(s.name+': '+(structureBlocked(s)?'функция утрачена':'повреждение'))}
 return {blocked,limited,notices,slowdown}
}
export function resolveAnatomyImpact(a:DetailedAnatomy,region:string,point:HitLocation,energy:number,contactCm2:number,eventId:string):{anatomy:DetailedAnatomy;bleedingRate:number;internal:boolean} {
 if(!isHitLocation(point)||!n(energy)||!n(contactCm2)||contactCm2<=0||!id(eventId))throw new Error('Проверь точку, направление и энергию попадания.')
 const next=copyDetailedAnatomy(a),steps:HitTrace['steps']=[]
 let e=energy,bleedingRate=0,internal=false
 const radius=point.mechanism==='blunt'?Math.min(.24,Math.sqrt(contactCm2)/70):Math.min(.06,Math.sqrt(contactCm2)/140)
 const candidates=next.structures.filter(s=>s.region===region).map(s=>({s,d:point.approach==='front'?s.depth:1-s.depth})).filter(({s,d})=>{const x=point.x+point.angleX*d*.3,y=point.y+point.angleY*d*.3;return ((x-s.x)/(s.rx+radius))**2+((y-s.y)/(s.ry+radius))**2<=1}).sort((a,b)=>a.d-b.d||a.s.id.localeCompare(b.s.id))
 for(const {s} of candidates){
  if(e<=.000001)break
  const before=e,threshold=s.thresholdJ*(point.mechanism==='pierce'?.35:point.mechanism==='cut'?.6:1)
  const damage=Math.min(s.current,Math.floor(Math.max(0,e*(point.mechanism==='blunt'?.22:point.mechanism==='pierce'?.8:.65)-threshold)/s.joulesPerHp))
  s.current-=damage
  const spent=damage*s.joulesPerHp
  e=Math.max(0,(e-spent)*(point.mechanism==='blunt'?s.transmission:point.mechanism==='pierce'?Math.min(.98,s.transmission+.2):s.transmission*.6))
  e=Math.round(e*1e6)/1e6
  if(damage){
   const label=s.kind==='joint'?'Повреждение сустава':s.kind==='bone'?'Перелом':s.kind==='vessel'?'Разрыв сосуда':point.mechanism==='blunt'?'Ушиб':'Разрыв тканей'
   const serious=s.current/s.maximum<=.5
   if(serious&&!s.injuries.some(i=>i.label===label)&&s.injuries.length<20)s.injuries.push({id:(eventId+'-'+s.id).slice(0,160),label,blocksUse:s.kind==='bone'||s.kind==='joint'||s.id.endsWith('-wing-membrane')||s.id.endsWith('-wing-nerve')||s.current===0,diagnosed:s.kind==='skin'})
   if(point.mechanism!=='blunt'||serious&&(s.kind==='organ'||s.kind==='vessel')){s.activeBleeding=(s.activeBleeding??0)+s.bleedingRate*damage/s.maximum;internal=internal||s.kind==='organ'||s.kind==='vessel'}
  }
  steps.push({id:s.id,name:s.name,beforeJ:before,afterJ:e,damage})
 }
 if(steps.some(s=>s.damage>0))next.harmRevision++
 next.lastTrace={region,point:copyHitLocation(point),initialJ:energy,remainingJ:e,steps}
 bleedingRate=next.structures.filter(s=>s.region===region).reduce((sum,s)=>sum+(s.activeBleeding??0),0)
 return {anatomy:next,bleedingRate:Math.round(bleedingRate*1e6)/1e6,internal}
}
export function automaticLife(a:DetailedAnatomy,deficit:number,absentRegions:string[]=[],_healthDepleted=false):{dead:boolean;unconscious:boolean;reasons:string[]} {
 const reasons:string[]=[],roles=['brain','circulation','respiration','core'] as const
 for(const role of roles){const essential=a.structures.filter(s=>s.role===role);if(essential.length&&essential.every(s=>s.current===0||absentRegions.includes(s.region)))reasons.push('Утрачено жизнеобеспечение: '+essential.map(s=>s.name).join(', '))}

 if(deficit>=a.lethalDeficit)reasons.push('Дефицит жизнеобеспечения '+Math.round(deficit*100)+'% ≥ '+Math.round(a.lethalDeficit*100)+'%')
 const brainCritical=a.structures.some(s=>s.role==='brain'&&s.current/s.maximum<=.25)
 return {dead:reasons.length>0,unconscious:reasons.length>0||brainCritical||deficit>=a.unconsciousDeficit,reasons}
}
