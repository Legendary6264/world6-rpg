import type {SceneObject,SceneObjectKind,ScenePosition} from './sceneTypes'

export type TabletopCategory='Полы'|'Строение'|'Мебель'|'Свет'|'Подземелье'
export type TabletopAsset={id:string;name:string;category:TabletopCategory;kind:SceneObjectKind;width:number;depth:number;height:number;blocksMovement:boolean;blocksSight:boolean;canSupport?:boolean}
const asset=(id:string,name:string,category:TabletopCategory,kind:SceneObjectKind,width:number,depth:number,height:number,blocksMovement=false,blocksSight=false,canSupport=false):TabletopAsset=>({id,name,category,kind,width,depth,height,blocksMovement,blocksSight,canSupport})
// Presentation assets reuse the existing movement, support and disclosure rules.
// The catalog is shared with validation; arbitrary URLs and executable assets are
// never accepted as model identifiers.
export const tabletopAssets:readonly TabletopAsset[]=[
 asset('floor-wood','Дощатый пол','Полы','platform',2,2,0),
 asset('floor-stone','Каменная плитка','Полы','platform',2,2,0),
 asset('floor-grass','Трава и земля','Полы','platform',2,2,0),
 asset('timber-wall','Фахверковая стена','Строение','wall',2,.24,2.7,true,true),
 asset('timber-window','Стена с окном','Строение','wall',2,.24,2.7,true,true),
 asset('timber-door','Деревянная дверь','Строение','door',2,.24,2.7,true,true),
 asset('stone-wall','Кладка подземелья','Строение','wall',2,.4,2.8,true,true),
 asset('timber-pillar','Резной столб','Строение','wall',.36,.36,2.7,true),
 asset('timber-railing','Деревянные перила','Строение','wall',2,.22,1,true),
 asset('timber-beam','Потолочная балка','Строение','wall',2,.24,.24,true),
 asset('roof-tile','Черепичная крыша','Строение','platform',2,2,.85),
 asset('table','Обеденный стол','Мебель','crate',1.8,1,.98,true,false,true),
 asset('chair','Стул','Мебель','crate',.6,.65,1,true),
 asset('round-table','Круглый стол','Мебель','crate',1.4,1.4,.96,true,false,true),
 asset('stool','Табурет','Мебель','crate',.55,.55,.55,true,false,true),
 asset('mug','Глиняная кружка','Мебель','crate',.22,.18,.18),
 asset('plate','Глиняная тарелка','Мебель','crate',.30,.30,.035),
 asset('bread','Хлеб','Мебель','crate',.24,.16,.085),
 asset('bench','Скамья','Мебель','crate',1.8,.46,.5,true,false,true),
 asset('bar','Барная стойка','Мебель','crate',2,.8,1.3,true,false,true),
 asset('barrel','Бочка','Мебель','crate',.72,.72,1,true,false,true),
 asset('shelf','Стеллаж с посудой','Мебель','crate',1.6,.42,2,true),
 asset('bed','Кровать','Мебель','crate',1.3,2.1,.85,true,false,true),
 asset('rug','Тканый ковёр','Мебель','platform',2.8,1.8,0),
 asset('chest','Сундук','Мебель','crate',1,.6,.62,true,false,true),
 asset('candle','Свечи на подставке','Свет','lamp',.42,.42,.62),
 asset('brazier','Жаровня','Свет','lamp',.8,.8,1),
 asset('fireplace','Камин','Свет','lamp',1.8,.8,2.3,true,true),
 asset('torch','Настенный факел','Свет','lamp',.32,.46,1.1),
 asset('chandelier','Кованая люстра','Свет','lamp',1.6,1.6,1),
 asset('stairs','Каменные ступени','Подземелье','platform',2,2.4,.9,true,false,true),
 asset('dungeon-arch','Вход в подземелье','Подземелье','door',2.4,.6,3,true,true),
 asset('trap-pit','Люк-ловушка','Подземелье','platform',2,2,0),
 asset('trap-spikes','Шипы','Подземелье','crate',1.5,1.5,.65,true),
 asset('trap-fire','Огненная ловушка','Подземелье','lamp',1.5,1.5,2),
]
export const tabletopCategories:TabletopCategory[]=['Полы','Строение','Мебель','Свет','Подземелье']
export const tabletopAsset=(id:string|undefined)=>tabletopAssets.find(a=>a.id===id)
export const isFloorAsset=(id:string|undefined)=>!!id&&id.startsWith('floor-')&&!!tabletopAsset(id)
export function validTabletopAppearance(input:unknown):boolean{
 if(!input||typeof input!=='object'||Array.isArray(input))return false
 const value=input as Record<string,unknown>
 const a=value.asset===undefined?undefined:typeof value.asset==='string'?tabletopAsset(value.asset):undefined
 return (value.asset===undefined||!!a&&a.kind===value.kind)&&
  (value.facing===undefined||[0,90,180,270].includes(value.facing as number))&&
  (value.active===undefined||typeof value.active==='boolean')&&
  (value.locked===undefined||typeof value.locked==='boolean')
}
export function createTabletopObject(assetId:string,id:string,point:ScenePosition,facing=0):SceneObject{
 const a=tabletopAsset(assetId)
 if(!a)throw Error('Такой модели нет в библиотеке.')
 if(![0,90,180,270].includes(facing))throw Error('Поворот должен быть кратен 90°.')
 const odd=facing%180!==0
 return {...point,id,name:a.name,kind:a.kind,asset:a.id,facing,width:odd?a.depth:a.width,depth:odd?a.width:a.depth,height:a.height,
  blocksMovement:a.blocksMovement,blocksSight:a.blocksSight,canSupport:!!a.canSupport,open:a.id==='dungeon-arch',...(a.kind==='lamp'||a.id.startsWith('trap-')?{active:true}:{})}
}
