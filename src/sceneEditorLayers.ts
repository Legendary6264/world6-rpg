import type {SceneObject,SceneState} from './sceneTypes'
export type EditorLayers={hidden:string[];protected:string[]}
export function assertEditorLayerChange(before:SceneState,next:SceneState,sceneId:string,blocked:readonly string[]){
 const a=before.scenes.find(s=>s.id===sceneId),b=next.scenes.find(s=>s.id===sceneId)
 for(const id of blocked){
  const object=a?.objects.find(o=>o.id===id),next=b?.objects.find(o=>o.id===id)
  // Scene objects contain scalar fields. Copy/import normalization may reorder
  // those fields without changing the protected object itself.
  if(object&&(!next||(Object.keys({...object,...next}) as (keyof SceneObject)[]).some(key=>object[key]!==next[key])))throw Error('Объект скрыт или защищён в редакторе. Покажи его и сними защиту в списке объектов.')
 }
}
