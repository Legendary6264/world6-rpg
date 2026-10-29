import type {Scene} from './sceneTypes'
import type {EditorItem} from './sceneEditorCommands'
import {captureSceneAssembly} from './sceneAssemblies'
import type {SceneAssembly} from './sceneAssemblies'

export type EditorClipboard={assembly:SceneAssembly;elevation:number;skippedActors:number}
export function editorObjectCount(count:number){const last=count%10,tail=count%100;return count+' '+(tail>=11&&tail<=14?'объектов':last===1?'объект':last>=2&&last<=4?'объекта':'объектов')}
// Copy a detached snapshot. Scene IDs and character support relations stay in
// the source; stamping the assembly will assign fresh object IDs exactly once.
export function captureEditorClipboard(scene:Scene,selection:readonly EditorItem[]):EditorClipboard{
 const items=selection.filter(i=>i.kind==='object'),ids=new Set(items.map(i=>i.id)),objects=scene.objects.filter(o=>ids.has(o.id))
 if(!items.length)throw Error('Для копирования выбери объекты сцены. Персонажи остаются в исходной сцене.')
 const name=objects.length===1?objects[0].name.slice(0,80):'Группа'
 const assembly=captureSceneAssembly(scene,items,name,'editor-clipboard')
 return {assembly,elevation:Math.min(...objects.map(o=>o.z))-scene.groundZ,skippedActors:selection.filter(i=>i.kind==='token').length}
}
