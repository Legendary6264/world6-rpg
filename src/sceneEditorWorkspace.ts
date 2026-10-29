import {useMemo,useRef,useState} from 'react'
import type {EditorLayers} from './sceneEditorLayers'
import type {SelectionFilter} from './scene3dModel'

export type EditorPanels={libraryWidth:number;inspectorWidth:number;inspectorOpen:boolean}
export const defaultEditorPanels=():EditorPanels=>({libraryWidth:280,inspectorWidth:304,inspectorOpen:true})
export type EditorWorkspace={snap:boolean;snapStep:number;surfaceSnap:boolean;gizmo:boolean;libraryOpen:boolean;libraryTab:'models'|'assemblies';selectionFilter:SelectionFilter;layerMap:Record<string,EditorLayers>;panels:EditorPanels}
type StorageAccess=Pick<Storage,'getItem'|'setItem'>
const limit=2*1024*1024
export const defaultEditorWorkspace=():EditorWorkspace=>({snap:false,snapStep:1,surfaceSnap:true,gizmo:false,libraryOpen:true,libraryTab:'models',selectionFilter:'all',layerMap:{},panels:defaultEditorPanels()})
export const editorWorkspaceKey=(scope:string)=>'grani-bytiya:workspace:v1:'+encodeURIComponent(scope)
function cleanWorkspace(value:unknown):EditorWorkspace{
 if(!value||typeof value!=='object')throw Error('Некорректные настройки рабочего места.')
 const v=value as EditorWorkspace
 if(!['snap','surfaceSnap','gizmo','libraryOpen'].every(k=>typeof v[k as keyof EditorWorkspace]==='boolean')||![.25,.5,1,2].includes(v.snapStep)||!['models','assemblies'].includes(v.libraryTab)||!['all','props','structure','tokens'].includes(v.selectionFilter)||!v.layerMap||typeof v.layerMap!=='object'||Array.isArray(v.layerMap))throw Error('Некорректные настройки рабочего места.')
 const panels=v.panels??defaultEditorPanels()
 if(!Number.isFinite(panels.libraryWidth)||panels.libraryWidth<220||panels.libraryWidth>460||!Number.isFinite(panels.inspectorWidth)||panels.inspectorWidth<260||panels.inspectorWidth>460||typeof panels.inspectorOpen!=='boolean')throw Error('Некорректные размеры панелей.')
 const entries=Object.entries(v.layerMap)
 if(entries.length>20)throw Error('Слишком много сцен в настройках рабочего места.')
 const validId=(id:unknown)=>typeof id==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(id)
 const ids=(values:unknown)=>{if(!Array.isArray(values)||values.length>250||!values.every(validId))throw Error('Некорректный список объектов рабочего места.');return [...new Set(values)] as string[]}
 return {snap:v.snap,snapStep:v.snapStep,surfaceSnap:v.surfaceSnap,gizmo:v.gizmo,libraryOpen:v.libraryOpen,libraryTab:v.libraryTab,selectionFilter:v.selectionFilter,panels:{libraryWidth:panels.libraryWidth,inspectorWidth:panels.inspectorWidth,inspectorOpen:panels.inspectorOpen},
  layerMap:Object.fromEntries(entries.map(([id,layers])=>{if(!validId(id)||!layers||typeof layers!=='object')throw Error('Некорректная сцена рабочего места.');return [id,{hidden:ids(layers.hidden),protected:ids(layers.protected)}]}))}
}
export function readEditorWorkspace(scope?:string,storage?:StorageAccess):{value:EditorWorkspace;notice:string}{
 if(!scope)return {value:defaultEditorWorkspace(),notice:''}
 try{
  const raw=(storage??window.localStorage).getItem(editorWorkspaceKey(scope))
  if(raw===null)return {value:defaultEditorWorkspace(),notice:''}
  if(raw.length*2>limit)throw Error('Слишком большой файл настроек.')
  const data=JSON.parse(raw)
  if(data.version!==1)throw Error('Неизвестная версия настроек.')
  return {value:cleanWorkspace(data.workspace),notice:''}
 }catch{return {value:defaultEditorWorkspace(),notice:'Настройки рабочего места не прочитаны. Используются стандартные.'}}
}
export function writeEditorWorkspace(scope:string|undefined,value:EditorWorkspace,storage?:StorageAccess){
 if(!scope)return
 const raw=JSON.stringify({version:1,workspace:cleanWorkspace(value)})
 if(raw.length*2>limit)throw Error('Настройки рабочего места превышают 2 МБ.')
 ;(storage??window.localStorage).setItem(editorWorkspaceKey(scope),raw)
}
export function useEditorWorkspace(scope?:string){
 const initial=useMemo(()=>readEditorWorkspace(scope),[scope])
 const [stored,setStored]=useState(()=>({scope,...initial}))
 // A new account/lobby must never render the previous scope's hidden layers,
 // even for the first frame before effects run. Only user changes write storage.
 const current=stored.scope===scope?stored:{scope,...initial},revision=useRef(current)
 revision.current=current
 function setField<K extends keyof EditorWorkspace>(key:K,action:EditorWorkspace[K]|((value:EditorWorkspace[K])=>EditorWorkspace[K])){
  const base=revision.current.scope===scope?revision.current:{scope,...initial}
  const value={...base.value,[key]:typeof action==='function'?(action as (value:EditorWorkspace[K])=>EditorWorkspace[K])(base.value[key]):action}
  let notice=''
  try{writeEditorWorkspace(scope,value)}catch{notice='Настройки рабочего места действуют до закрытия страницы: браузер не разрешил их сохранить.'}
  const next={scope,value,notice};revision.current=next;setStored(next)
 }
 return {...current,setField}
}
