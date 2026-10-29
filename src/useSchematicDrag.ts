import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {PointerEvent} from 'react'
import type {Scene,ScenePosition} from './sceneTypes'
import {translateEditorGroup} from './sceneEditorCommands'
import type {EditorItem} from './sceneEditorCommands'
import {resolveObjectPlacement,surfacePlacementObject} from './sceneEditorPlacement'
import type {PlacementSurface} from './sceneEditorPlacement'
import type {SelectionFilter} from './scene3dModel'

type Props={scene:Scene;selecting:boolean;selections?:EditorItem[];editorHidden?:string[];editorProtected?:string[];selectionFilter?:SelectionFilter;snapStep?:number;moveSurfaces?:PlacementSurface[];onMove?:(selection:EditorItem,point:ScenePosition,options?:{surfaceId:string|null})=>boolean|void}
type Drag={pointerId:number;svg:SVGSVGElement;scene:Scene;items:EditorItem[];picked:EditorItem;origin:ScenePosition;start:{x:number;y:number};last:{x:number;y:number};cursor:{x:number;y:number};client:{x:number;y:number};moved:boolean;valid:boolean;point:ScenePosition;surface?:{surfaceId:string|null};layerKey:string;error?:string}
const key=(s:EditorItem)=>s.kind+':'+s.id
const layerKey=(p:Props)=>JSON.stringify([p.editorHidden,p.editorProtected,p.selectionFilter])
export function schematicPoint(svg:SVGSVGElement,client:{clientX:number;clientY:number}){
 const matrix=svg.getScreenCTM();if(!matrix)return null
 const p=svg.createSVGPoint();p.x=client.clientX;p.y=client.clientY
 return p.matrixTransform(matrix.inverse())
}
export function useSchematicDrag(props:Props){
 const latest=useRef(props),active=useRef<Drag|null>(null)
 const [view,setView]=useState<{scene?:Scene;status:string;valid:boolean}>({status:'',valid:true})
 function clear(status=''){
  const d=active.current;active.current=null
  if(d?.svg.hasPointerCapture?.(d.pointerId))d.svg.releasePointerCapture(d.pointerId)
  setView({status,valid:!status})
 }
 useLayoutEffect(()=>{
  latest.current=props
  const d=active.current
  if(d&&(d.scene!==props.scene||!props.selecting||!props.onMove||d.layerKey!==layerKey(props)))clear('Перенос отменён: сцена или доступ к объектам изменились.')
 })
 useEffect(()=>{const blur=()=>{if(active.current)clear('Перенос отменён.')};window.addEventListener('blur',blur);return ()=>{window.removeEventListener('blur',blur);active.current=null}},[])
 function begin(event:PointerEvent<SVGSVGElement>,picked:EditorItem,point:{x:number;y:number}){
  const p=latest.current
  if(event.button!==0||event.altKey||event.shiftKey||event.ctrlKey||event.metaKey||!p.onMove||!p.selecting)return
  const items=p.selections?.some(s=>key(s)===key(picked))?p.selections:[picked]
  if(items.some(s=>s.kind==='object'&&(p.editorHidden?.includes(s.id)||p.editorProtected?.includes(s.id))))return
  const source=picked.kind==='object'?p.scene.objects.find(o=>o.id===picked.id):p.scene.tokens.find(t=>t.actorId===picked.id)
  if(!source)return
  const svg=event.currentTarget;svg.focus({preventScroll:true});event.preventDefault()
  setView({status:'',valid:true})
  active.current={pointerId:event.pointerId,svg,scene:p.scene,items:[...items],picked,origin:{x:source.x,y:source.y,z:source.z},start:{x:point.x,y:point.y},last:{x:point.x,y:point.y},cursor:{x:point.x,y:point.y},client:{x:event.clientX,y:event.clientY},moved:false,valid:true,point:{x:source.x,y:source.y,z:source.z},layerKey:layerKey(p)}
  svg.setPointerCapture?.(event.pointerId)
 }
 function move(event:PointerEvent<SVGSVGElement>){
  const d=active.current,p=latest.current;if(!d||d.pointerId!==event.pointerId)return
  event.preventDefault();event.stopPropagation()
  const at=schematicPoint(d.svg,event);if(!at)return
  const rate=event.shiftKey?.1:1
  d.cursor.x+=(at.x-d.last.x)*rate;d.cursor.y+=(at.y-d.last.y)*rate;d.last={x:at.x,y:at.y}
  if(!d.moved&&Math.hypot(event.clientX-d.client.x,event.clientY-d.client.y)<5)return
  d.moved=true
  const step=event.shiftKey?undefined:p.snapStep,snap=(v:number)=>step?Math.round(v/step)*step:v
  let point={x:snap(d.origin.x+d.cursor.x-d.start.x),y:d.origin.y,z:d.origin.z},surface:Drag['surface'],surfaceName=''
  if(d.scene.view==='top')point.y=snap(d.origin.y+d.cursor.y-d.start.y)
  else point.z=snap(d.origin.z-d.cursor.y+d.start.y)
  const selected=new Set(d.items.map(key)),members=[...d.scene.objects.filter(o=>selected.has('object:'+o.id)).map(o=>({...o,h:o.height,w:o.width,d:o.depth})),...d.scene.tokens.filter(t=>selected.has('token:'+t.actorId)||t.support.kind==='object'&&selected.has('object:'+t.support.objectId)).map(t=>({...t,h:1.7,w:t.diameter,d:t.diameter}))]
  const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n))
  point.x=d.origin.x+clamp(point.x-d.origin.x,-Math.min(...members.map(m=>m.x-m.w/2)),d.scene.width-Math.max(...members.map(m=>m.x+m.w/2)))
  if(d.scene.view==='top')point.y=d.origin.y+clamp(point.y-d.origin.y,-Math.min(...members.map(m=>m.y-m.d/2)),d.scene.depth-Math.max(...members.map(m=>m.y+m.d/2)))
  else point.z=d.origin.z+clamp(point.z-d.origin.z,d.scene.minZ-Math.min(...members.map(m=>m.z)),d.scene.maxZ-Math.max(...members.map(m=>m.z+m.h)))
  try{
   const source=d.picked.kind==='object'?d.scene.objects.find(o=>o.id===d.picked.id):undefined
   if(d.scene.view==='top'&&d.items.length===1&&source&&p.moveSurfaces&&surfacePlacementObject(source)){
    const result=resolveObjectPlacement(d.scene,p.moveSurfaces,source,point,{surfaceSnap:true,snapStep:step});point={x:result.object.x,y:result.object.y,z:result.object.z};surface={surfaceId:result.surfaceId};surfaceName=result.surfaceName+' · '
   }
   const delta={x:point.x-d.origin.x,y:point.y-d.origin.y,z:point.z-d.origin.z}
   const preview=translateEditorGroup({version:1,activeSceneId:d.scene.id,scenes:[d.scene]},d.items,delta).scenes[0]
   d.point=point;d.surface=surface;d.valid=true
   const f=(n:number)=>n.toFixed(3)
   setView({scene:preview,valid:true,status:`${event.shiftKey?'Точно · ':''}${surfaceName}X ${f(point.x)} · Y ${f(point.y)} · Z ${f(point.z)} м · Esc — отмена`})
  }catch(error){d.valid=false;d.error=(error as Error).message;setView(v=>({...v,valid:false,status:d.error!}))}
 }
 function end(event:PointerEvent<SVGSVGElement>){
  const d=active.current;if(!d||d.pointerId!==event.pointerId)return
  event.stopPropagation()
  const p=latest.current,commit=d.moved&&d.valid&&d.scene===p.scene&&!!p.onMove&&d.layerKey===layerKey(p)
  clear(d.moved&&!d.valid?d.error??'Перенос отменён: проверь положение и опору.':'')
  if(commit)try{if(p.onMove?.(d.picked,d.point,d.surface)===false)setView({status:'Перемещение не применено.',valid:false})}catch(error){setView({status:(error as Error).message,valid:false})}
 }
 return {preview:view.scene,status:view.status,valid:view.valid,begin,active:()=>!!active.current,handlers:{onPointerMove:move,onPointerUp:end,onPointerCancel:()=>{if(active.current)clear('Перенос отменён.')},onLostPointerCapture:()=>{if(active.current)clear('Перенос отменён.')},onKeyDown:(event:React.KeyboardEvent<SVGSVGElement>)=>{if(active.current&&event.key==='Escape'){event.preventDefault();event.stopPropagation();clear('Перенос отменён.')}}}}
}
