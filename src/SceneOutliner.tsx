import {editorKey} from './sceneEditorKeyboard'
import {useRef,useState} from 'react'
import type {KeyboardEvent,MouseEvent} from 'react'
import type {Scene,SceneActor} from './sceneTypes'
import type {EditorItem} from './sceneEditorCommands'
import type {EditorLayers} from './sceneEditorLayers'
import {sceneObjectLabels} from './scenes'
import {artworkLabels,artworkMetadata} from './visualMedia'
import {legacyAsset} from './legacyAssets'
import {tabletopAsset} from './tabletopCatalog'
import EditorIcon from './EditorIcon'

type Entry={item:EditorItem;key:string;name:string;type:string;detail:string;words:string;image?:string;hidden:boolean;protected:boolean}
type View='all'|'objects'|'tokens'|'selected'|'hidden'|'protected'
type Props={scene:Scene;actors:SceneActor[];items:EditorItem[];primary:EditorItem|null;layers:EditorLayers;build:boolean;disabled:boolean;
 onSelect:(items:EditorItem[],primary:EditorItem|null)=>void;onInspect:()=>void;onFocus:()=>void;
 onLayer:(ids:string[],flag:keyof EditorLayers,value:boolean)=>void}
const keyOf=(item:EditorItem)=>item.kind+':'+item.id
const normalize=(value:string)=>value.toLocaleLowerCase('ru').replaceAll('ё','е')

export default function SceneOutliner({scene,actors,items,primary,layers,build,disabled,onSelect,onInspect,onFocus,onLayer}:Props){
 const [query,setQuery]=useState(''),[view,setView]=useState<View>('all'),[sort,setSort]=useState('scene'),[focused,setFocused]=useState('')
 const activeView=!build&&(view==='hidden'||view==='protected')?'all':view
 const anchor=useRef(''),search=useRef<HTMLInputElement>(null),grid=useRef<HTMLDivElement>(null)
 const selected=new Set(items.map(keyOf)),actorMap=new Map(actors.map(a=>[a.id,a]))
 const entries:Entry[]=[...scene.tokens.map(t=>{
  const name=actorMap.get(t.actorId)?.name||'Без имени',type='Персонаж'
  return {item:{kind:'token' as const,id:t.actorId},key:'token:'+t.actorId,name,type,words:normalize(name+' '+type+' герой'),detail:(t.support.kind==='air'?'В воздухе':'На опоре')+' · Z '+t.z+' м',hidden:false,protected:false}
 }),...scene.objects.map(o=>{
  const type=sceneObjectLabels[o.kind],asset=legacyAsset(o),label=tabletopAsset(o.asset)?.name??artworkLabels[o.artwork??'']??''
  const image=asset?import.meta.env.BASE_URL+'legacy-thumbnails/'+asset.slug+'.png':o.asset?import.meta.env.BASE_URL+'tabletop-thumbnails/'+o.asset+'.png':undefined
  return {item:{kind:'object' as const,id:o.id},key:'object:'+o.id,name:o.name,type,words:normalize([o.name,type,label,...(artworkMetadata[o.artwork??'']?.tags??[])].join(' ')),detail:type+' · Z '+o.z+' м',image,hidden:layers.hidden.includes(o.id),protected:layers.protected.includes(o.id)}
 })]
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean)
 const visible=entries.filter(e=>terms.every(t=>e.words.includes(t))&&(activeView==='all'||activeView==='objects'&&e.item.kind==='object'||activeView==='tokens'&&e.item.kind==='token'||activeView==='selected'&&selected.has(e.key)||activeView==='hidden'&&e.hidden||activeView==='protected'&&e.protected))
 if(sort!=='scene')visible.sort((a,b)=>(sort==='type'?a.type.localeCompare(b.type,'ru'):0)||a.name.localeCompare(b.name,'ru',{numeric:true})||a.key.localeCompare(b.key))
 const focusKey=visible.some(e=>e.key===focused)?focused:visible.find(e=>e.key===(primary&&keyOf(primary)))?.key??visible[0]?.key
 const selectedObjects=entries.filter(e=>e.item.kind==='object'&&selected.has(e.key)),allHidden=!!selectedObjects.length&&selectedObjects.every(e=>e.hidden),allProtected=!!selectedObjects.length&&selectedObjects.every(e=>e.protected)
 function choose(entry:Entry,options:{shiftKey?:boolean;ctrlKey?:boolean;metaKey?:boolean}={}){
  let next:EditorItem[]
  const additive=options.ctrlKey||options.metaKey,from=visible.findIndex(e=>e.key===anchor.current),to=visible.indexOf(entry)
  if(options.shiftKey&&from>=0){
   const range=visible.slice(Math.min(from,to),Math.max(from,to)+1).map(e=>e.item),keys=new Set(range.map(keyOf))
   next=additive?[...items.filter(i=>!keys.has(keyOf(i))),...range]:range
  }else{
   next=additive?(selected.has(entry.key)?items.filter(i=>keyOf(i)!==entry.key):[...items,entry.item]):[entry.item]
   anchor.current=entry.key
  }
  onSelect(next,next.some(i=>keyOf(i)===entry.key)?entry.item:next.at(-1)??null);setFocused(entry.key)
 }
 function focusRow(entry:Entry,column=0){
  setFocused(entry.key)
  const row=Array.from(grid.current?.querySelectorAll<HTMLElement>('[data-outliner-key]')??[]).find(r=>r.dataset.outlinerKey===entry.key)
  const target=column?row?.querySelectorAll<HTMLButtonElement>('button')[column-1]:row
  ;(target??row)?.focus({preventScroll:true});row?.scrollIntoView?.({block:'nearest'})
 }
 function rowKey(event:KeyboardEvent<HTMLDivElement>,entry:Entry){
  const key=editorKey(event),command=event.ctrlKey||event.metaKey
  if(key==='arrowup'||key==='arrowdown'||key==='home'||key==='end'){
   event.preventDefault();event.stopPropagation()
   const index=visible.indexOf(entry),at=key==='home'?0:key==='end'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(key==='arrowdown'?1:-1))),next=visible[at]
   const column=(event.target as HTMLElement).tagName==='BUTTON'?Array.from(event.currentTarget.querySelectorAll('button')).indexOf(event.target as HTMLButtonElement)+1:0
   if(!command)choose(next,{shiftKey:event.shiftKey})
   focusRow(next,column);return
  }
  if(key==='arrowleft'||key==='arrowright'){
   event.preventDefault();event.stopPropagation()
   const controls:HTMLElement[]=[event.currentTarget,...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],at=controls.indexOf(event.target as HTMLElement)
   controls[Math.max(0,Math.min(controls.length-1,at+(key==='arrowright'?1:-1)))]?.focus({preventScroll:true});return
  }
  if(event.target!==event.currentTarget)return
  if(key===' '){event.preventDefault();event.stopPropagation();choose(entry,{ctrlKey:true});return}
  if(key==='enter'){event.preventDefault();event.stopPropagation();if(!selected.has(entry.key))choose(entry);onInspect();return}
  if(key==='f'&&!command&&!event.altKey){event.preventDefault();event.stopPropagation();if(!selected.has(entry.key))choose(entry);onFocus();return}
  if(key==='escape'){event.preventDefault();event.stopPropagation();onSelect([],null);return}
 }
 function clickRow(event:MouseEvent<HTMLDivElement>,entry:Entry){
  if((event.target as HTMLElement).closest('button'))return
  choose(entry,event);event.currentTarget.focus({preventScroll:true})
 }
 return <section className="gb-outliner" aria-label="Расстановка сцены" onKeyDown={e=>{
  const command=e.ctrlKey||e.metaKey,key=editorKey(e),inInput=(e.target as HTMLElement).closest('input,select,textarea')
  if(command&&key==='f'||key==='/'&&!inInput){e.preventDefault();e.stopPropagation();search.current?.focus();return}
  if(command&&key==='a'&&!inInput){e.preventDefault();e.stopPropagation();const next=visible.map(e=>e.item);onSelect(next,next.at(-1)??null);anchor.current=visible[0]?.key??''}
 }}>
  <header><div><small>СОДЕРЖИМОЕ СЦЕНЫ</small><h3>Расстановка</h3></div><span>{scene.objects.length} объектов<br/>{scene.tokens.length} героев</span></header>
  <label className="gb-outliner-search"><span className="gb-sr-only">Поиск по расстановке</span><input ref={search} type="search" aria-label="Поиск по расстановке" placeholder="Найти название, модель, тип…" value={query} onChange={e=>{setQuery(e.currentTarget.value);anchor.current=''}} onKeyDown={e=>{if(e.key==='Escape'&&query){e.preventDefault();e.stopPropagation();setQuery('');anchor.current=''}}}/><kbd>/</kbd></label>
  <div className="gb-outliner-filters"><label><span>Показать</span><select aria-label="Фильтр расстановки" value={activeView} onChange={e=>{setView(e.currentTarget.value as View);anchor.current=''}}><option value="all">Всё</option><option value="objects">Объекты</option><option value="tokens">Герои</option><option value="selected">Выделение</option>{build&&<><option value="hidden">Скрытые</option><option value="protected">Защищённые</option></>}</select></label><label><span>Порядок</span><select aria-label="Порядок расстановки" value={sort} onChange={e=>{setSort(e.currentTarget.value);anchor.current=''}}><option value="scene">В сцене</option><option value="name">По имени</option><option value="type">По типу</option></select></label></div>
  <div className="gb-outliner-summary"><span aria-live="polite">Найдено {visible.length} из {entries.length} · выбрано {items.length}</span><button type="button" disabled={!visible.length} onClick={()=>{const next=visible.map(e=>e.item);onSelect(next,next.at(-1)??null);anchor.current=visible[0]?.key??''}}>Выделить найденные</button></div>
  <div className="gb-outliner-selection" aria-label="Действия с выделением"><div><button type="button" disabled={!items.length} onClick={onInspect}>Свойства</button><button type="button" disabled={!entries.some(e=>selected.has(e.key)&&!e.hidden)} onClick={onFocus}>На сцене <kbd>F</kbd></button><button type="button" aria-label="Снять выделение в расстановке" disabled={!items.length} onClick={()=>onSelect([],null)}><EditorIcon name="close" size={14}/></button></div>{build&&<div><button type="button" disabled={disabled||!selectedObjects.length} onClick={()=>onLayer(selectedObjects.map(e=>e.item.id),'hidden',!allHidden)}><EditorIcon name="eye" size={14}/>{allHidden?'Показать':'Скрыть'} {selectedObjects.length||''}</button><button type="button" disabled={disabled||!selectedObjects.length} onClick={()=>onLayer(selectedObjects.map(e=>e.item.id),'protected',!allProtected)}><EditorIcon name="lock" size={14}/>{allProtected?'Снять защиту':'Защитить'} {selectedObjects.length||''}</button></div>}</div>
  <div ref={grid} className="gb-outliner-grid" role="grid" aria-label="Объекты и герои сцены" aria-multiselectable="true" aria-rowcount={visible.length} aria-colcount={build?3:1}>
   {visible.map((entry,index)=><div role="row" aria-rowindex={index+1} aria-selected={selected.has(entry.key)} aria-label={entry.name+' · '+entry.detail} tabIndex={entry.key===focusKey?0:-1} data-outliner-key={entry.key} key={entry.key} className={'gb-outliner-row'+(entry.hidden?' gb-outliner-hidden':'')} onFocus={()=>setFocused(entry.key)} onClick={e=>clickRow(e,entry)} onDoubleClick={e=>{if(!(e.target as HTMLElement).closest('button')){if(!selected.has(entry.key))choose(entry);onInspect()}}} onKeyDown={e=>rowKey(e,entry)}>
    <div role="gridcell" className="gb-outliner-name">{entry.image?<img src={entry.image} alt="" loading="lazy"/>:<EditorIcon name={entry.item.kind==='token'?'person':'cube'} size={25}/>}<span><strong>{entry.name}</strong><small>{entry.detail}</small>{(entry.hidden||entry.protected)&&<em>{[entry.hidden&&'Скрыт',entry.protected&&'Защищён'].filter(Boolean).join(' · ')}</em>}</span></div>
    {build&&entry.item.kind==='object'?<><div role="gridcell"><button type="button" tabIndex={-1} className="gb-layer-toggle" title={entry.hidden?'Показать':'Скрыть'} aria-label={(entry.hidden?'Показать в редакторе: ':'Скрыть в редакторе: ')+entry.name} aria-pressed={entry.hidden} disabled={disabled} onClick={()=>onLayer([entry.item.id],'hidden',!entry.hidden)}><EditorIcon name="eye" size={15}/></button></div><div role="gridcell"><button type="button" tabIndex={-1} className="gb-layer-toggle" title={entry.protected?'Снять защиту':'Защитить'} aria-label={(entry.protected?'Снять защиту: ':'Защитить от правок: ')+entry.name} aria-pressed={entry.protected} disabled={disabled} onClick={()=>onLayer([entry.item.id],'protected',!entry.protected)}><EditorIcon name="lock" size={15}/></button></div></>:build&&<><div role="gridcell"/><div role="gridcell"/></>}
   </div>)}
  </div>
  {!visible.length&&<div className="gb-outliner-empty"><EditorIcon name="layers" size={26}/><p>{entries.length?'По этому запросу ничего нет.':'В этой сцене пока пусто.'}</p>{(query||activeView!=='all')&&<button type="button" onClick={()=>{setQuery('');setView('all');anchor.current=''}}>Сбросить поиск и фильтр</button>}</div>}
  <details className="gb-outliner-help"><summary>Управление списком</summary><p>Shift — диапазон · Ctrl — добавить<br/>↑↓ — выбрать · ←→ — видимость и защита<br/>Enter — свойства · F — показать на сцене</p></details>
 </section>
}
