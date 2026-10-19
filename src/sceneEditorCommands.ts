import type {ScenePosition,SceneState} from './sceneTypes'
import {addSceneObject,moveSceneObject,placeSceneToken,removeSceneObject,replaceScene} from './scenes'

export type EditorSelection={kind:'object'|'token';id:string}|null
export function translateEditorSelection(state:SceneState,selection:EditorSelection,delta:ScenePosition):SceneState {
 const scene=state.scenes.find(s=>s.id===state.activeSceneId)
 if(!scene||!selection)throw Error('Сначала выбери объект или персонажа.')
 const round=(n:number)=>Math.round(n*1e6)/1e6
 if(selection.kind==='object'){
  const o=scene.objects.find(o=>o.id===selection.id);if(!o)throw Error('Объект больше не существует.')
  return moveSceneObject(state,scene.id,{...o,x:round(o.x+delta.x),y:round(o.y+delta.y),z:round(o.z+delta.z)})
 }
 const t=scene.tokens.find(t=>t.actorId===selection.id);if(!t)throw Error('Персонаж больше не находится на сцене.')
 if(delta.z&&t.support.kind!=='air')throw Error('Высота персонажа определяется опорой. Сначала выбери другую опору или состояние «В воздухе».')
 return placeSceneToken(state,scene.id,{...t,x:round(t.x+delta.x),y:round(t.y+delta.y),z:round(t.z+delta.z)})
}
export function duplicateEditorObject(state:SceneState,objectId:string,newId:string,step=.5):SceneState {
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),o=scene?.objects.find(o=>o.id===objectId)
 if(!scene||!o)throw Error('Выбери объект для копирования.')
 const x=o.x+step<=scene.width?o.x+step:Math.max(0,o.x-step),y=o.y+step<=scene.depth?o.y+step:Math.max(0,o.y-step)
 return addSceneObject(state,scene.id,{...o,id:newId,name:o.name.slice(0,110)+' · копия',x,y})
}
export function removeEditorSelection(state:SceneState,selection:EditorSelection):SceneState {
 const scene=state.scenes.find(s=>s.id===state.activeSceneId)
 if(!scene||!selection)throw Error('Выбери объект или персонажа.')
 return selection.kind==='object'?removeSceneObject(state,scene.id,selection.id):replaceScene(state,{...scene,tokens:scene.tokens.filter(t=>t.actorId!==selection.id)})
}
