import {editorKey} from './sceneEditorKeyboard'
import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {PointerEvent,KeyboardEvent,RefObject} from 'react'
import {constrainSchematic,fitSchematic,wholeSchematic,zoomSchematic} from './schematicCamera'
import type {SchematicView} from './schematicCamera'
import {schematicPoint} from './useSchematicDrag'
import type {Scene} from './sceneTypes'
import type {EditorItem} from './sceneEditorCommands'

export function useSchematicCamera(svg:RefObject<SVGSVGElement|null>,scene:Scene,items:EditorItem[],hidden:string[]|undefined,blocked:()=>boolean){
 const frame={width:scene.width,height:scene.view==='side'?scene.maxZ-scene.minZ:scene.depth},signature=[scene.id,scene.view,frame.width,frame.height].join(':')
 const [stored,setStored]=useState(()=>({signature,view:wholeSchematic(frame)})),[panning,setPanning]=useState(false),[space,setSpace]=useState(false)
 const view=stored.signature===signature?stored.view:wholeSchematic(frame),latest=useRef({frame,signature,view,scene,items,hidden,blocked}),pan=useRef<{id:number;svg:SVGSVGElement;start:{x:number;y:number};view:SchematicView;signature:string}|null>(null),spaceHeld=useRef(false)
 function apply(next:SchematicView){const p=latest.current;latest.current={...p,view:next};setStored({signature:p.signature,view:next})}
 function end(){const p=pan.current;pan.current=null;setPanning(false);if(p?.svg.hasPointerCapture?.(p.id))p.svg.releasePointerCapture(p.id)}
 useLayoutEffect(()=>{latest.current={frame,signature,view,scene,items,hidden,blocked};if(pan.current&&pan.current.signature!==signature)end()})
 useEffect(()=>{
  const node=svg.current;if(!node)return
  const wheel=(e:WheelEvent)=>{e.preventDefault();const p=latest.current;if(p.blocked()||pan.current)return;const at=schematicPoint(node,e);if(!at)return;const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?node.clientHeight:1);apply(zoomSchematic(p.view,p.frame,Math.exp(Math.max(-240,Math.min(240,delta))*.002),at))}
  const release=(e:globalThis.KeyboardEvent)=>{if(e.code==='Space'||e.key===' '){spaceHeld.current=false;setSpace(false)}}
  const blur=()=>{spaceHeld.current=false;setSpace(false);end()}
  node.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keyup',release);window.addEventListener('blur',blur)
  return ()=>{node.removeEventListener('wheel',wheel);window.removeEventListener('keyup',release);window.removeEventListener('blur',blur);pan.current=null}
 },[])
 function down(e:PointerEvent<SVGSVGElement>){
  if(e.button!==1&&!(e.button===0&&spaceHeld.current))return false
  e.preventDefault();e.stopPropagation();const p=latest.current;if(p.blocked())return true
  const at=schematicPoint(e.currentTarget,e);if(!at)return true
  e.currentTarget.focus({preventScroll:true});pan.current={id:e.pointerId,svg:e.currentTarget,start:{x:at.x,y:at.y},view:{...p.view},signature:p.signature};setPanning(true);e.currentTarget.setPointerCapture?.(e.pointerId);return true
 }
 function move(e:PointerEvent<SVGSVGElement>){
  const d=pan.current;if(!d||d.id!==e.pointerId)return false
  e.preventDefault();e.stopPropagation();const at=schematicPoint(d.svg,e);if(at){const p=latest.current;apply(constrainSchematic({...p.view,x:p.view.x+d.start.x-at.x,y:p.view.y+d.start.y-at.y},p.frame))}return true
 }
 function focus(){
  const p=latest.current;if(p.blocked())return
  if(pan.current)end()
  const selected=new Set(p.items.map(s=>s.kind+':'+s.id)),bounds:{minX:number;minY:number;maxX:number;maxY:number}[]=[]
  for(const o of p.scene.objects)if(selected.has('object:'+o.id)&&!p.hidden?.includes(o.id)){const h=p.scene.view==='top'?o.depth:Math.max(.2,o.height),y=p.scene.view==='top'?o.y:p.scene.maxZ-o.z-h/2;bounds.push({minX:o.x-o.width/2,minY:y-h/2,maxX:o.x+o.width/2,maxY:y+h/2})}
  const size=Math.max(p.frame.width,p.frame.height)*.022
  for(const t of p.scene.tokens)if(selected.has('token:'+t.actorId)){const y=p.scene.view==='top'?t.y:p.scene.maxZ-t.z-size;bounds.push({minX:t.x-size,minY:y-size,maxX:t.x+size,maxY:y+size})}
  if(bounds.length)apply(fitSchematic({minX:Math.min(...bounds.map(b=>b.minX)),minY:Math.min(...bounds.map(b=>b.minY)),maxX:Math.max(...bounds.map(b=>b.maxX)),maxY:Math.max(...bounds.map(b=>b.maxY))},p.frame))
 }
 function keydown(e:KeyboardEvent<SVGSVGElement>){
  if(e.code==='Space'||e.key===' '){e.preventDefault();e.stopPropagation();spaceHeld.current=true;setSpace(true);return true}
  if(e.key==='Escape'&&pan.current){e.preventDefault();e.stopPropagation();const original=pan.current.view;end();apply(original);return true}
  if((editorKey(e)==='f'||e.key==='Home')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!latest.current.blocked()){e.preventDefault();e.stopPropagation();if(e.key==='Home'){end();apply(wholeSchematic(latest.current.frame))}else focus();return true}return false
 }
 return {view,zoom:Math.round(frame.width/view.width*100),panning,space,down,move,end,active:()=>!!pan.current,keydown,focus,reset:()=>{const p=latest.current;if(!p.blocked()){end();apply(wholeSchematic(p.frame))}},zoomBy:(scale:number)=>{const p=latest.current;if(!p.blocked()&&!pan.current)apply(zoomSchematic(p.view,p.frame,scale))}}
}
