import {useEffect,useRef} from 'react'
import type {ReactNode,KeyboardEvent} from 'react'
import type {ScenePickTarget} from './sceneEditorPicking'

export default function SceneContextMenu({x,y,title,targets,onPick,onClose,children}:{x:number;y:number;title:string;targets:ScenePickTarget[];onPick:(target:ScenePickTarget)=>void;onClose:()=>void;children:ReactNode}){
 const menu=useRef<HTMLDivElement>(null),close=useRef(onClose)
 close.current=onClose
 useEffect(()=>{
  const node=menu.current;if(!node)return
  const previous=document.activeElement instanceof window.HTMLElement||document.activeElement instanceof window.SVGElement?document.activeElement:null
  // Measure after layout: action counts and long names must not push the menu
  // below the screen. The list itself scrolls in a short browser window.
  const rect=node.getBoundingClientRect()
  node.style.left=Math.max(8,Math.min(x,window.innerWidth-rect.width-8))+'px'
  node.style.top=Math.max(8,Math.min(y,window.innerHeight-rect.height-8))+'px'
  node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true})
  const dismiss=()=>close.current()
  const outside=(e:Event)=>{if(!node.contains(e.target as Node))dismiss()}
  window.addEventListener('pointerdown',outside,true);window.addEventListener('resize',dismiss);window.addEventListener('blur',dismiss)
  return ()=>{window.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',dismiss);window.removeEventListener('blur',dismiss);if(document.activeElement===document.body||node.contains(document.activeElement))previous?.focus({preventScroll:true})}
 },[x,y])
 function keyboard(e:KeyboardEvent<HTMLDivElement>){
  e.stopPropagation()
  if(e.key==='Escape'){e.preventDefault();onClose();return}
  if(e.key==='Tab'){onClose();return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return
  e.preventDefault()
  const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]),index=buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length
  buttons[next]?.focus()
 }
 return <div ref={menu} className="gb-object-context" role="menu" aria-label="Действия на сцене" style={{left:x,top:y}} onKeyDown={keyboard} onPointerDown={e=>e.stopPropagation()} onContextMenu={e=>e.preventDefault()}>
  <strong>{title}</strong>
  {targets.length>1&&<div className="gb-context-picks" role="group" aria-label="Объекты под курсором"><small>ВЫБРАТЬ ПОД КУРСОРОМ · {targets.length}</small>{targets.map(t=><button type="button" role="menuitem" key={t.selection.kind+':'+t.selection.id} aria-label={'Выбрать: '+t.label} onClick={()=>onPick(t)}><span>{t.label}</span><small>{t.selection.kind==='token'?'Герой':'Объект'}</small></button>)}</div>}
  {children}<button type="button" role="menuitem" onClick={onClose}>Закрыть меню <kbd>Esc</kbd></button>
 </div>
}
