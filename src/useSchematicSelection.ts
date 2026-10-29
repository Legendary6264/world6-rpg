import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {KeyboardEvent,PointerEvent} from 'react'
import type {Scene,SceneActor} from './sceneTypes'
import type {EditorItem} from './sceneEditorCommands'
import type {SelectionFilter} from './scene3dModel'
import {schematicPickTargets,schematicRegionTargets} from './sceneEditorPicking'
import {schematicPoint} from './useSchematicDrag'

type Props={scene:Scene;actors:SceneActor[];selecting:boolean;selections?:EditorItem[];selection:EditorItem|null;editorHidden?:string[];editorProtected?:string[];selectionFilter?:SelectionFilter;onSelect:(s:EditorItem|null,options?:{extend?:boolean})=>void;onSelectMany?:(items:EditorItem[])=>void;placement?:unknown;brush?:unknown}
type Frame={id:number;svg:SVGSVGElement;scene:Scene;start:{x:number;y:number};end:{x:number;y:number};client:{x:number;y:number};moved:boolean;policy:string;base:EditorItem[]}
const policy=(p:Props)=>JSON.stringify([p.editorHidden,p.editorProtected,p.selectionFilter])
export function useSchematicSelection(props:Props){
 const latest=useRef(props),active=useRef<Frame|null>(null),[rectangle,setRectangle]=useState<{x:number;y:number;width:number;height:number}|null>(null),[mode,setMode]=useState(false)
 function finish(commit:boolean){
  const d=active.current;if(!d)return
  active.current=null;setRectangle(null);setMode(false);const p=latest.current
  if(commit&&d.scene===p.scene&&policy(p)===d.policy&&p.onSelectMany){
   if(d.moved){const candidates=schematicRegionTargets(d.scene,d.start,d.end,{hidden:p.editorHidden,protected:p.editorProtected,filter:p.selectionFilter}),items=new Map(d.base.map(s=>[s.kind+':'+s.id,s]));for(const s of candidates)items.set(s.kind+':'+s.id,s);p.onSelectMany([...items.values()])}
   else{const picked=schematicPickTargets(p.scene,p.actors,d.start,{hidden:p.editorHidden,protected:p.editorProtected,filter:p.selectionFilter})[0]?.selection;if(picked&&picked.kind!=='contact')p.onSelect({kind:picked.kind,id:picked.id},{extend:true})}
  }
  if(d.svg.hasPointerCapture?.(d.id))d.svg.releasePointerCapture(d.id)
 }
 useLayoutEffect(()=>{latest.current=props;const d=active.current;if(d&&(d.scene!==props.scene||policy(props)!==d.policy||!props.selecting||!props.onSelectMany||props.placement||props.brush))finish(false);if(mode&&(!props.selecting||!props.onSelectMany||props.placement||props.brush))setMode(false)})
 useEffect(()=>{const blur=()=>finish(false);window.addEventListener('blur',blur);return ()=>{window.removeEventListener('blur',blur);active.current=null}},[])
 function down(e:PointerEvent<SVGSVGElement>){
  const p=latest.current;if(e.button!==0||!e.shiftKey&&!mode||e.altKey||e.ctrlKey||e.metaKey||!p.selecting||!p.onSelectMany||p.placement||p.brush)return false
  const at=schematicPoint(e.currentTarget,e);if(!at)return true
  e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});active.current={id:e.pointerId,svg:e.currentTarget,scene:p.scene,start:{x:at.x,y:at.y},end:{x:at.x,y:at.y},client:{x:e.clientX,y:e.clientY},moved:false,policy:policy(p),base:[...(p.selections??(p.selection?[p.selection]:[]))]};e.currentTarget.setPointerCapture?.(e.pointerId);return true
 }
 function move(e:PointerEvent<SVGSVGElement>){
  const d=active.current;if(!d||d.id!==e.pointerId)return false
  e.preventDefault();e.stopPropagation();const at=schematicPoint(d.svg,e);if(!at)return true
  d.end={x:at.x,y:at.y};d.moved=Math.hypot(e.clientX-d.client.x,e.clientY-d.client.y)>5
  setRectangle(d.moved?{x:Math.min(d.start.x,at.x),y:Math.min(d.start.y,at.y),width:Math.abs(d.start.x-at.x),height:Math.abs(d.start.y-at.y)}:null);return true
 }
 return {rectangle,mode,toggle:()=>setMode(v=>!v),active:()=>!!active.current,down,move,end:()=>finish(true),cancel:()=>{finish(false);setMode(false)},keydown:(e:KeyboardEvent<SVGSVGElement>)=>{if(e.key==='Escape'&&(active.current||mode)){e.preventDefault();e.stopPropagation();finish(false);setMode(false);return true}return false}}
}
