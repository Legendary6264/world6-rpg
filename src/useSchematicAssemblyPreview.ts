import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {PointerEvent,RefObject} from 'react'
import type {Scene,ScenePosition} from './sceneTypes'
import type {AssemblyPlacement,ScenePlacement} from './sceneAssemblies'
import {assemblyAnchor,assemblyLayout} from './sceneAssemblies'
import {MAX_SCENE_OBJECTS} from './scenes'
import {schematicPoint} from './useSchematicDrag'
import type {SchematicView} from './schematicCamera'
import {editorObjectCount} from './sceneEditorClipboard'

export function schematicAssemblyPreview(scene:Scene,placement:AssemblyPlacement,point:ScenePosition,step?:number){
 const {assembly,facing,elevation}=placement
 const fallback={x:point.x,y:point.y,z:scene.groundZ+(Number.isFinite(elevation)?elevation:0)}
 let at=fallback,problem=''
 try{
  at=assemblyAnchor(scene,assembly,point,facing,elevation,step)
  if(at.z<scene.minZ-1e-6||at.z+assembly.height>scene.maxZ+1e-6)throw Error('Для группы недостаточно места по высоте.')
  if(scene.objects.length+assembly.objects.length>MAX_SCENE_OBJECTS)throw Error('Группа превышает лимит 250 объектов сцены.')
 }catch(error){problem=(error as Error).message}
 const objects=assemblyLayout(assembly,at,facing)
 return {point:at,objects,valid:!problem,status:problem||`${assembly.name} · ${editorObjectCount(objects.length)} · X ${at.x.toFixed(3)} · Y ${at.y.toFixed(3)} · Z ${at.z.toFixed(3)} м · R — поворот · Esc — отмена`}
}

export function useSchematicAssemblyPreview(svg:RefObject<SVGSVGElement|null>,scene:Scene,placement:ScenePlacement|undefined,step:number|undefined,view:SchematicView){
 const [cursor,setCursor]=useState<ScenePosition|null>(null),client=useRef<{clientX:number;clientY:number}|null>(null)
 function clear(){client.current=null;setCursor(null)}
 function at(mapped:{x:number;y:number}){return {x:mapped.x,y:scene.view==='top'?mapped.y:scene.depth/2,z:scene.view==='side'?scene.maxZ-mapped.y:scene.groundZ}}
 useLayoutEffect(()=>{
  if(!placement||!('assembly' in placement)||!client.current||!svg.current)return
  const mapped=schematicPoint(svg.current,client.current);if(mapped){const next=at(mapped);setCursor(previous=>previous&&previous.x===next.x&&previous.y===next.y&&previous.z===next.z?previous:next)}
 },[view.x,view.y,view.width,view.height,scene.id,scene.view,scene.depth,scene.maxZ])
 useEffect(()=>{const blur=()=>clear();window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur)},[])
 const assembly=placement&&'assembly' in placement?placement.assembly:undefined
 useEffect(()=>{if(!assembly)clear()},[assembly])
 function move(event:PointerEvent<SVGSVGElement>){
  if(!placement||!('assembly' in placement))return
  const mapped=schematicPoint(event.currentTarget,event);if(!mapped)return
  client.current={clientX:event.clientX,clientY:event.clientY};setCursor(at(mapped))
 }
 const preview=cursor&&placement&&'assembly' in placement?schematicAssemblyPreview(scene,placement,cursor,step):null
 function resolve(event:PointerEvent<SVGSVGElement>,mapped:{x:number;y:number}){
  if(!placement||!('assembly' in placement))return null
  client.current={clientX:event.clientX,clientY:event.clientY};const point=at(mapped);setCursor(point)
  return schematicAssemblyPreview(scene,placement,point,step)
 }
 return {preview,move,resolve,clear}
}
