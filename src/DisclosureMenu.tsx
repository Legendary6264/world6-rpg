import {useEffect,useRef} from 'react'
import type {ReactNode} from 'react'

/** A disclosure of ordinary buttons, with native Tab/Enter behaviour. Actions
 * retain their handlers and permission checks; closing never unmounts a draft. */
export default function DisclosureMenu({label,children,className='',returnFocus=true}:{label:string;children:ReactNode;className?:string;returnFocus?:boolean}){
 const ref=useRef<HTMLDetailsElement>(null)
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(event.target instanceof window.Node&&!ref.current?.contains(event.target)&&ref.current)ref.current.open=false};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[])
 return <details ref={ref} className={'ui-disclosure-menu '+className} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}>
  <summary>{label}<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></summary>
  <div className="ui-disclosure-content" onClick={event=>{if((event.target as Element).closest('button')){const details=event.currentTarget.parentElement as HTMLDetailsElement;details.open=false;if(returnFocus)queueMicrotask(()=>{if(!document.querySelector('[aria-modal="true"]'))details.querySelector('summary')?.focus({preventScroll:true})})}}}>{children}</div>
 </details>
}
