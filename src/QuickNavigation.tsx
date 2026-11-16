import {useEffect,useRef,useState} from 'react'
import {sitePageAllowed,sitePages} from './siteRoutes'
import type {SitePage} from './siteRoutes'
import {sitePresentation} from './siteDescriptions'
import InterfaceIcon from './InterfaceIcon'
export default function QuickNavigation({open,onClose,onNavigate,role}:{open:boolean;onClose:()=>void;onNavigate:(page:SitePage)=>void;role?:string}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState(0),dialog=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null)
 const needle=query.trim().toLocaleLowerCase('ru'),results=(Object.keys(sitePages) as SitePage[]).filter(id=>sitePageAllowed(id,role)&&(sitePages[id]+' '+sitePresentation[id].keywords+' '+sitePresentation[id].description).toLocaleLowerCase('ru').includes(needle))
 const index=Math.min(selected,Math.max(0,results.length-1))
 useEffect(()=>{if(!open)return;const opener=document.activeElement as HTMLElement|null,old=document.body.style.overflow;document.body.style.overflow='hidden';input.current?.focus();return()=>{document.body.style.overflow=old;if(opener?.isConnected&&!document.getElementById('gb-main-content')?.contains(document.activeElement))opener.focus()}},[open])
 useEffect(()=>{if(open)dialog.current?.querySelector('[data-selected="true"]')?.scrollIntoView?.({block:'nearest'})},[open,index,query])
 if(!open)return null
 const choose=(page:SitePage)=>{onClose();onNavigate(page)}
 return <div className="realm-command-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)onClose()}}><div ref={dialog} className="realm-command" role="dialog" aria-modal="true" aria-label="Быстрый переход" onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose()}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setSelected((index+(e.key==='ArrowDown'?1:-1)+Math.max(1,results.length))%Math.max(1,results.length))}
  else if(e.key==='Enter'&&e.target===input.current&&results[index]){e.preventDefault();choose(results[index])}
  else if(e.key==='Tab'){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,input')??[]);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
 }}><div className="realm-command-search"><InterfaceIcon name="search"/><input ref={input} aria-label="Найти раздел сайта" placeholder="Куда отправимся?" value={query} autoComplete="off" onChange={e=>{setQuery(e.currentTarget.value);setSelected(0)}}/><button type="button" className="realm-icon-button" aria-label="Закрыть быстрый переход" onClick={onClose}><InterfaceIcon name="close"/></button></div>
  <p className="realm-command-label">Разделы платформы <span>{results.length}</span></p><div className="realm-command-results">{results.map((id,i)=><button type="button" key={id} data-selected={i===index} onClick={()=>choose(id)}><span className="realm-command-icon"><InterfaceIcon name={id}/></span><span><strong>{sitePages[id]}</strong><small>{sitePresentation[id].description}</small></span><InterfaceIcon name="arrow" size={16}/></button>)}{!results.length&&<p className="realm-command-empty">Ничего не найдено. Попробуй «герой», «игра» или «правила».</p>}</div><footer><span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span><span><kbd>Enter</kbd> перейти</span><span><kbd>Esc</kbd> закрыть</span></footer>
 </div></div>
}
