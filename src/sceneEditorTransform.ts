import type {Scene,ScenePosition,SceneState} from './sceneTypes'
import type {EditorItem} from './sceneEditorCommands'
import {translateEditorGroup} from './sceneEditorCommands'

export type EditorObjectBounds={anchor:ScenePosition;size:ScenePosition;min:ScenePosition;max:ScenePosition}
export function editorObjectBounds(scene:Pick<Scene,'objects'>,items:readonly EditorItem[]):EditorObjectBounds|undefined{
 const ids=new Set(items.map(i=>i.id)),objects=scene.objects.filter(o=>ids.has(o.id))
 if(!ids.size||items.some(i=>i.kind!=='object')||objects.length!==ids.size)return
 const min={x:Math.min(...objects.map(o=>o.x-o.width/2)),y:Math.min(...objects.map(o=>o.y-o.depth/2)),z:Math.min(...objects.map(o=>o.z))}
 const max={x:Math.max(...objects.map(o=>o.x+o.width/2)),y:Math.max(...objects.map(o=>o.y+o.depth/2)),z:Math.max(...objects.map(o=>o.z+o.height))}
 const round=(n:number)=>Math.round(n*1e6)/1e6
 return {min,max,anchor:{x:round((min.x+max.x)/2),y:round((min.y+max.y)/2),z:round(min.z)},size:{x:round(max.x-min.x),y:round(max.y-min.y),z:round(max.z-min.z)}}
}
export function positionEditorObjects(state:SceneState,items:readonly EditorItem[],position:ScenePosition):SceneState{
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),bounds=scene&&editorObjectBounds(scene,items)
 if(!bounds)throw Error('Для точного положения выбери объекты без героев.')
 if(![position.x,position.y,position.z].every(Number.isFinite))throw Error('Проверь координаты группы.')
 const delta={x:position.x-bounds.anchor.x,y:position.y-bounds.anchor.y,z:position.z-bounds.anchor.z}
 if(Object.values(delta).every(n=>Math.abs(n)<1e-6))return state
 return translateEditorGroup(state,items,delta)
}
