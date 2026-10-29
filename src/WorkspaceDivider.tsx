import {useEffect,useRef,useState} from 'react'
import type {PointerEvent} from 'react'

export default function WorkspaceDivider({side,width,otherWidth,onResize}:{side:'library'|'inspector';width:number;otherWidth:number;onResize:(width:number)=>void}){
 const node=useRef<HTMLDivElement>(null),active=useRef<{id:number;clientX:number;width:number;value:number;body:HTMLElement}|null>(null),[dragging,setDragging]=useState(false),[live,setLive]=useState(width)
 const min=side==='library'?220:260,initial=side==='library'?280:304,variable='--gb-'+side+'-width',sign=side==='library'?1:-1
 const limit=(value:number,body?:HTMLElement)=>Math.round(Math.max(min,Math.min(460,Math.max(min,(body?.clientWidth||window.innerWidth)-48-otherWidth-330),value)))
 function end(commit:boolean){
  const d=active.current;if(!d)return
  active.current=null;setDragging(false);d.body.style.setProperty(variable,(commit?d.value:d.width)+'px')
  if(node.current?.hasPointerCapture?.(d.id))node.current.releasePointerCapture(d.id)
  if(commit)onResize(d.value)
 }
 useEffect(()=>{const cancel=()=>end(false);window.addEventListener('blur',cancel);return ()=>{window.removeEventListener('blur',cancel);const d=active.current;if(d)d.body.style.setProperty(variable,d.width+'px');active.current=null}},[])
 const down=(e:PointerEvent<HTMLDivElement>)=>{
  if(e.button!==0)return
  const body=e.currentTarget.parentElement;if(!body)return
  e.preventDefault();e.currentTarget.focus();active.current={id:e.pointerId,clientX:e.clientX,width,value:width,body};setLive(width);setDragging(true);e.currentTarget.setPointerCapture?.(e.pointerId)
 }
 return <div ref={node} className={'gb-workspace-divider gb-divider-'+side+(dragging?' gb-divider-dragging':'')} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={side==='library'?'Ширина библиотеки':'Ширина инспектора'} aria-valuemin={min} aria-valuemax={460} aria-valuenow={dragging?live:width} title="Потяни для изменения ширины · двойной клик — сброс" onPointerDown={down} onPointerMove={e=>{const d=active.current;if(!d||d.id!==e.pointerId)return;d.value=limit(d.width+(e.clientX-d.clientX)*sign,d.body);d.body.style.setProperty(variable,d.value+'px');setLive(d.value)}} onPointerUp={()=>end(true)} onPointerCancel={()=>end(false)} onLostPointerCapture={()=>end(false)} onDoubleClick={()=>onResize(initial)} onKeyDown={e=>{if(e.key==='Escape'&&active.current){e.preventDefault();e.stopPropagation();end(false);return}if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();e.stopPropagation();onResize(e.key==='Home'?initial:limit(width+(e.key==='ArrowRight'?1:-1)*sign*(e.shiftKey?30:10),e.currentTarget.parentElement??undefined))}}}/>
}
