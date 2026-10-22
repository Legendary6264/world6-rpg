import {sceneObject} from './scenes'
import type {Scene,SceneObjectKind} from './sceneTypes'

export const detailSceneId='browser-preview:detail-studio'
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
