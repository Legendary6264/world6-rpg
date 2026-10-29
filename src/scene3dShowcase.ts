import {sceneObject} from './scenes'
import type {Scene,SceneObjectKind} from './sceneTypes'

export const detailSceneId='browser-preview:detail-studio'
export const organicSceneId='browser-preview:detail-organic'
export const basicModelsSceneId='browser-preview:basic-models-v016'
export function createBasicModelsScene():Scene{
 const object=(kind:SceneObjectKind,id:string,name:string,x:number,y:number,width:number,depth:number,height:number)=>({...sceneObject(kind,basicModelsSceneId+':'+id,{x,y,z:0}),name,width,depth,height})
 return {id:basicModelsSceneId,name:'Базовые модели · дверь, контейнер и фонарь',description:'Неканоническая мастерская базовых моделей. Передний ряд: закрытая и открытая дверь, контейнер с крышкой, зажжённый и погашенный фонарь. Створки и крышки вращаются на петлях, выходя за закрытый габарит. Выбери объект, нажми F и сравни режим без текстур.',view:'top',width:20,depth:16,groundZ:0,minZ:-2,maxZ:12,palette:'stone',background:'auto',tokens:[],objects:[
  {...object('door','door-closed','Дверь · закрыта, кольца и петли',4,4,2,.5,3.2),locked:true},
  {...object('door','door-open','Дверь · полноценная открытая створка',8,4,2,.5,3.2),open:true},
  {...object('crate','crate-closed','Контейнер · закрыт, обвязка и замок',12,5,1.6,1.1,1.2),locked:true},
  {...object('crate','crate-open','Контейнер · полость, дно и крышка',16,5,1.6,1.1,1.2),open:true},
  object('lamp','lamp-lit','Фонарь · горелка и тёплый свет',4,10,.8,.8,2.8),
  {...object('lamp','lamp-off','Фонарь · погашен',7,10,.8,.8,2.8),active:false},
  object('wall','masonry','Стена · рельефная двусторонняя кладка',11,10,3.4,.6,2.8),
  object('platform','platform','Платформа · сплошной верх и арочные опоры',16,10,2.6,1.8,1.3),
 ]}
}
export function createDetailScene():Scene {
 const object=(kind:SceneObjectKind,id:string,name:string,x:number,y:number,width:number,depth:number,height:number)=>({...sceneObject(kind,detailSceneId+':'+id,{x,y,z:0}),name,width,depth,height})
 return {id:detailSceneId,name:'Мастерская · геометрия и свет',description:'Неканоническая небольшая площадка для осмотра конструктивных деталей, материалов, дневного и ночного света. Выдели предмет и нажми F. Режим «Без текстур» показывает чистую геометрию.',view:'top',width:14,depth:12,groundZ:0,minZ:-2,maxZ:12,palette:'stone',background:'auto',tokens:[],objects:[
  object('wall','masonry-left','Кладка · швы, сколы и навершие',4.3,4.5,3.4,.72,3.6),
  object('door','arched-door','Арочная дверь · доски и фурнитура',7,4.5,2,.72,3.6),
  object('wall','masonry-right','Кладка · правая секция',9.7,4.5,3.4,.72,3.6),
  object('crate','timber-crate','Ящик · соединения, скобы и верёвка',5.3,6.7,1.5,1.1,1.1),
  object('lamp','wrought-lantern','Фонарь · стекло, решётка и тёплый свет',8.6,6.6,.65,.65,2.8),
  object('platform','stone-plinth','Каменная опора · колонны и капители',2.8,7.5,2.6,1.6,.7),
  object('tree','rooted-pine','Сосна · ветви и объёмные корни',12,5.3,2.8,2.8,4.2),
  object('rock','mossy-rock','Мшистый камень · естественные пропорции',11.5,8.7,2.4,1.8,.95),
  object('rock','small-rock','Малый камень · другой силуэт',12.9,9.7,1.1,.9,.65),
 ]}
}

export function createOrganicScene(actorIds:string[]):Scene {
 const object=(kind:SceneObjectKind,id:string,name:string,x:number,y:number,width:number,depth:number,height:number)=>({...sceneObject(kind,organicSceneId+':'+id,{x,y,z:0}),name,width,depth,height})
 return {id:organicSceneId,name:'Мастерская · вода и фигурки',description:'Площадка для сравнения рельефа волн, берега и складок одежды. Выдели фигурку и нажми F. Попробуй низкий боковой свет и режим «Без текстур».',view:'top',width:12,depth:10,groundZ:0,minZ:-2,maxZ:10,palette:'forest',background:'auto',
 tokens:actorIds.slice(0,4).map((actorId,i)=>({actorId,x:3+i*1.8,y:7.7,z:0,diameter:.85,support:{kind:'ground' as const}})),objects:[
  object('water','pond','Водоём · волны и неровный берег',5.6,4.2,5.2,3.1,.03),
  object('water','small-pool','Мелкая вода · отражения и кромка',9.4,6.6,2.3,1.5,.02),
  object('lamp','left-light','Фонарь · боковой тёплый свет',1.8,6.9,.65,.65,2.8),
  object('lamp','right-light','Фонарь · свет у берега',9.3,3.8,.65,.65,2.8),
  object('rock','shore-rock','Камень у воды',2.8,3,1.4,1,.65),
 ]}
}
