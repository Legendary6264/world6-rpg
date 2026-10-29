import type {SceneState} from './sceneTypes'
import type {EditorItem} from './sceneEditorCommands'
import {translateEditorGroup} from './sceneEditorCommands'
import {surfaceContents} from './sceneEditorContents'
import {canPlaceOnSurface,flatPlacementSurface} from './sceneEditorPlacement'

export type LowerOptions={groundOnly?:boolean;hidden?:readonly string[]}
export function lowerEditorObjects(state:SceneState,items:readonly EditorItem[],options:LowerOptions={}){
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),roots=new Set(items.map(i=>i.id))
 if(!scene||!roots.size||items.some(i=>i.kind!=='object')||scene.objects.filter(o=>roots.has(o.id)).length!==roots.size)throw Error('Для опускания выбери объекты без героев.')
 // Contents are discovered before filtering hidden supports: a protected or
 // hidden item on the moving table must be reported by the editor's layer guard.
 const moving=surfaceContents(scene,items).filter(i=>i.kind==='object'),ids=new Set(moving.map(i=>i.id)),objects=scene.objects.filter(o=>ids.has(o.id))
 if(objects.some(o=>o.z<scene.groundZ-1e-6))throw Error('Часть группы находится ниже земли сцены. Проверь высоту перед опусканием.')
 const supports=options.groundOnly?[]:scene.objects.filter(o=>!ids.has(o.id)&&!options.hidden?.includes(o.id)&&flatPlacementSurface(o))
 let delta=-Infinity,surfaceName='Земля сцены'
 for(const object of objects){
  let top=scene.groundZ,name='Земля сцены'
  for(const support of supports){const height=support.z+support.height
   if(height>top+1e-6&&height<=object.z+1e-6&&canPlaceOnSurface(object,support)){top=height;name=support.name}
  }
  // A row/stack descends as one arrangement until its first complete footprint
  // reaches a support. Never lift another item or change relative heights.
  const shift=top-object.z
  if(shift>delta){delta=shift;surfaceName=name}
 }
 delta=Math.min(0,delta)
 if(Math.abs(delta)<1e-6)return {state,distance:0,objectCount:objects.length,surfaceName}
 return {state:translateEditorGroup(state,moving,{x:0,y:0,z:delta}),distance:-delta,objectCount:objects.length,surfaceName}
}
