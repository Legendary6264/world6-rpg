import {useId,useState} from 'react'
import type {KeyboardEvent} from 'react'
export type WorkspaceSection={id:string;label:string;group:string;description?:string}

export default function WorkspaceNavigation({label,sections,selectedId,onSelect,tabs=false,idPrefix}:{label:string;sections:readonly WorkspaceSection[];selectedId:string;onSelect:(id:string)=>void;tabs?:boolean;idPrefix?:string}){
 const generated=useId(),prefix=idPrefix??generated,[query,setQuery]=useState(''),needle=query.trim().toLocaleLowerCase('ru')
 const shown=sections.filter(s=>(s.label+' '+s.group+' '+(s.description??'')).toLocaleLowerCase('ru').includes(needle)),groups=[...new Set(shown.map(s=>s.group))],allGroups=[...new Set(sections.map(s=>s.group))]
 const keyboardId=shown.some(s=>s.id===selectedId)?selectedId:shown[0]?.id
 function move(event:KeyboardEvent<HTMLButtonElement>,index:number){
  const next=event.key==='Home'?0:event.key==='End'?shown.length-1:event.key==='ArrowDown'||tabs&&event.key==='ArrowRight'?(index+1)%shown.length:event.key==='ArrowUp'||tabs&&event.key==='ArrowLeft'?(index+shown.length-1)%shown.length:null
  if(next===null||!shown[next])return;event.preventDefault();onSelect(shown[next].id)
  queueMicrotask(()=>{const button=document.getElementById(prefix+'-tab-'+shown[next].id);const details=button?.closest('details');if(details)details.open=true;button?.focus()})
 }
 return <nav className="ui-workspace-navigation" aria-label={label}>
  <label className="realm-workspace-search"><span className="gb-sr-only">Поиск: {label}</span><input type="search" aria-label={'Поиск: '+label} placeholder="Найти инструмент…" value={query} onChange={e=>setQuery(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='ArrowDown'&&shown[0]){e.preventDefault();document.getElementById(prefix+'-tab-'+shown[0].id)?.focus()}}}/></label>
  <label className="ui-workspace-select"><span>{label}</span><select aria-label={label} value={selectedId} onChange={event=>onSelect(event.currentTarget.value)}>{allGroups.map(group=><optgroup key={group} label={group}>{sections.filter(s=>s.group===group).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}</select></label>
  <div className="ui-workspace-groups" role={tabs?'tablist':undefined} aria-label={tabs?label:undefined} aria-orientation={tabs?'vertical':undefined}>{groups.map(group=><details key={group} open={!!needle||shown.some(s=>s.group===group&&s.id===selectedId)}><summary>{group}<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></summary><div>{shown.filter(s=>s.group===group).map(s=><button type="button" key={s.id} id={prefix+'-tab-'+s.id} className={selectedId===s.id?'w6-active':''} role={tabs?'tab':undefined} aria-selected={tabs?selectedId===s.id:undefined} aria-controls={tabs?prefix+'-panel-'+s.id:undefined} tabIndex={tabs&&keyboardId!==s.id?-1:0} aria-pressed={tabs?undefined:selectedId===s.id} title={s.description} onClick={()=>onSelect(s.id)} onKeyDown={event=>move(event,shown.findIndex(item=>item.id===s.id))}>{s.label}</button>)}</div></details>)}</div>
  {!shown.length&&<p className="realm-workspace-empty">Ничего не найдено. <button type="button" onClick={()=>setQuery('')}>Очистить поиск</button></p>}
 </nav>
}
