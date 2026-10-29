import type {SceneObject,SceneObjectKind,ScenePosition} from './sceneTypes'

export const sceneObjectLabels:Record<SceneObjectKind,string>={wall:'Стена',door:'Дверь',tree:'Дерево',rock:'Камень',crate:'Контейнер',platform:'Платформа',lamp:'Источник света',water:'Вода'}
export function sceneObject(kind:SceneObjectKind,objectId:string,at:ScenePosition):SceneObject{
 return {...at,id:objectId,kind,name:sceneObjectLabels[kind],width:kind==='wall'?4:2,
  depth:kind==='wall'?.5:2,height:kind==='water'?0:kind==='platform'?1:2,
  blocksMovement:!['lamp','water','platform'].includes(kind),blocksSight:['wall','door','tree','rock'].includes(kind),canSupport:kind==='platform',open:false}
}
