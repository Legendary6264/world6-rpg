import {useId,useRef,useState,useSyncExternalStore} from 'react'
import type {KeyboardEvent,ReactNode} from 'react'
import InterfaceIcon from './InterfaceIcon'

const media='(max-width: 900px)'
const mobileSnapshot=()=>typeof window!=='undefined'&&!!window.matchMedia?.(media).matches
const subscribe=(notify:()=>void)=>{
 const query=window.matchMedia?.(media)
 query?.addEventListener('change',notify)
 return()=>query?.removeEventListener('change',notify)
}

/** Both panes stay mounted so a map selection never discards an action draft. */
export default function GameSceneWorkspace({board,actions,queueCount,readOnly=false}:{board:ReactNode;actions:ReactNode;queueCount:number;readOnly?:boolean}){
 const mobile=useSyncExternalStore(subscribe,mobileSnapshot,()=>false),[pane,setPane]=useState<'map'|'actions'>('map'),id=useId(),nav=useRef<HTMLElement>(null)
 function move(event:KeyboardEvent<HTMLElement>){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  event.preventDefault();const next=event.key==='Home'?'map':event.key==='End'?'actions':pane==='map'?'actions':'map'
  setPane(next);nav.current?.querySelector<HTMLButtonElement>('[data-pane="'+next+'"]')?.focus()
 }
 return <section className="realm-scene-workspace" aria-label="Карта и ход героя">
  <header className="realm-scene-heading"><div><small>{readOnly?'Сохранённые сведения':'Твой следующий ход'}</small><h4>{readOnly?'Просмотр сцены':'От замысла к действию'}</h4><p>{readOnly?'Карта и записи доступны для просмотра.':'Выбери цель на карте, составь план и отправь его мастеру.'}</p></div><span className="realm-queue-count">В плане <strong>{queueCount} / 20</strong></span></header>
  {!readOnly&&<ol className="realm-turn-steps" aria-label="Как составить ход"><li><span>1</span>Выбери цель</li><li><span>2</span>Добавь действия</li><li><span>3</span>Отправь мастеру</li></ol>}
  <nav ref={nav} className="realm-scene-switch" aria-label="Панели сцены" hidden={!mobile} onKeyDown={move}>
   <button type="button" data-pane="map" aria-pressed={pane==='map'} aria-controls={id+'-map'} onClick={()=>setPane('map')}><InterfaceIcon name="worldEditor" size={18}/>Карта</button>
   <button type="button" data-pane="actions" aria-pressed={pane==='actions'} aria-controls={id+'-actions'} onClick={()=>setPane('actions')}><InterfaceIcon name="stories" size={18}/>Мой ход <span>{queueCount}</span></button>
  </nav>
  <div className="realm-scene-columns"><section id={id+'-map'} className="realm-scene-board" aria-label="Карта героя" hidden={mobile&&pane!=='map'}>{board}</section><aside id={id+'-actions'} className="realm-scene-composer" aria-label="План действий героя" hidden={mobile&&pane!=='actions'}>{actions}</aside></div>
 </section>
}
