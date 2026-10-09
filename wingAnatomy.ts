import type { AnatomyForm, AnatomyStructure } from './anatomyModel'

export type WingStyle='membrane'|'feathers'
export const wingBones=[
 ['scapula','Лопаточная опора',.025,.53,.065,.075],
 ['bone','Плечевая кость',.075,.49,.065,.035],
 ['radius','Лучевая кость',.18,.405,.08,.04],
 ['ulna','Локтевая кость',.17,.425,.08,.04],
 ['carpus','Кости запястья',.24,.36,.04,.04],
 ['digit-1','Верхний опорный палец',.5,.175,.27,.14],
 ['digit-2','Наружный опорный палец',.58,.445,.32,.085],
 ['digit-3','Нижний опорный палец',.46,.66,.23,.30],
 ['digit-4','Внутренний опорный палец',.18,.60,.055,.23],
] as const
export function createWingStructures(regions:string[],style:WingStyle='membrane'):AnatomyStructure[]{
 const out:AnatomyStructure[]=[]
 for(const side of ['left','right']){
  const region=side+'Wing';if(!regions.includes(region))continue
  const label=side==='left'?'левого':'правого',prefix=side+'-wing-'
  function add(suffix:string,name:string,kind:AnatomyStructure['kind'],x:number,y:number,rx:number,ry:number,depth:number,group=region,connections?:string[]){
   out.push({id:prefix+suffix,name:name+' '+label+' крыла',region,kind,x,y,rx,ry,depth,current:100,maximum:100,thresholdJ:kind==='bone'?12:3,joulesPerHp:kind==='bone'?4:2,transmission:kind==='bone'?.45:.72,bleedingRate:kind==='vessel'?3:kind==='skin'?.15:.3,activeBleeding:0,slowdown:25,functionGroup:group,role:'none',injuries:[],...(connections?{connections:connections.map(id=>prefix+id)}:{})})
  }
  for(const [id,name,x,y,rx,ry] of wingBones)add(id,name,'bone',x,y,rx,ry,.55)
  add('joint','Плечевой сустав','joint',.02,.52,.05,.025,.52,region,['scapula','bone'])
  add('elbow','Локтевой сустав','joint',.12,.46,.05,.025,.52,region,['bone','radius','ulna'])
  add('wrist','Запястный сустав','joint',.24,.36,.045,.025,.52,region,['radius','ulna','carpus','digit-1','digit-2','digit-3','digit-4'])
  add('elevator','Мышца подъёма','muscle',.05,.52,.055,.08,.25)
  add('depressor','Мышца опускания','muscle',.07,.61,.065,.085,.30)
  add('extensor','Разгибатели','muscle',.17,.39,.075,.05,.27)
  add('flexor','Сгибатели','muscle',.20,.48,.065,.06,.32)
  add('nerve','Нервное сплетение','organ',.055,.545,.05,.04,.67)
  add('artery','Крыльевая артерия','vessel',.14,.44,.075,.08,.39)
  add('vein','Крыльевая вена','vessel',.19,.46,.075,.08,.18)
  if(style==='membrane')add('membrane','Несущая перепонка','skin',.55,.55,.36,.36,.03)
  else add('feathers','Маховой покров','tissue',.65,.75,.30,.23,.02)
 }
 return out
}

// Общие координаты данных. Проекция перьев меняет контур, но не идентичность структуры.
export function wingProjection(x:number,y:number,style:WingStyle){
 if(style==='membrane')return {x:177+x*122,y:15+y*238}
 return {x:190+x*107,y:110+y*188}
}
export function isWingRegion(form:AnatomyForm,region:string){return region.endsWith('Wing')||form==='bird'&&/^(left|right)(Arm|Hand)$/.test(region)}
