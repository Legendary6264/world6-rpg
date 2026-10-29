import {sceneEditorId} from './sceneEditorId'
import {useEffect,useRef,useState} from 'react'
import type {SceneAssembly} from './sceneAssemblies'
import {decodeAssemblyLibrary,encodeAssemblyLibrary,mergeAssemblyLibraries,readAssemblyLibrary,writeAssemblyLibrary} from './sceneAssemblies'
import EditorIcon from './EditorIcon'

export function useAssemblyLibrary(scope?:string){
 const [data,setData]=useState(()=>({scope,items:readAssemblyLibrary(scope),past:[] as SceneAssembly[][]})),[notice,setNotice]=useState('')
 useEffect(()=>{if(data.scope!==scope){setData({scope,items:readAssemblyLibrary(scope),past:[]});setNotice('')}},[scope,data.scope])
 const items=data.scope===scope?data.items:[]
 const revision=JSON.stringify(items),current=useRef(revision);current.current=revision
 function commit(next:SceneAssembly[],undo=false){
  try{
   if(data.scope!==scope)throw Error('Дождись загрузки библиотеки.')
   encodeAssemblyLibrary(next);const persisted=writeAssemblyLibrary(scope,next)
   current.current=JSON.stringify(next)
   setData({scope,items:next,past:undo?data.past.slice(0,-1):[...data.past,items].slice(-6)})
   setNotice(persisted?'Библиотека сохранена в этом браузере.':'Библиотека доступна до закрытия редактора. Экспортируй её для сохранения.')
   return true
  }catch(e){setNotice((e as Error).message);return false}
 }
 return {items,notice,revision,report:setNotice,canUndo:!!data.past.length,
  add:(a:SceneAssembly)=>commit([...items,a]),remove:(id:string)=>commit(items.filter(a=>a.id!==id)),
  undo:()=>data.past.length?commit(data.past.at(-1)!,true):false,
  import:(raw:string,expected?:string)=>{try{if(expected!==undefined&&expected!==current.current)throw Error('Библиотека изменилась во время чтения файла. Повтори импорт.');return commit(mergeAssemblyLibraries(items,decodeAssemblyLibrary(raw),()=>sceneEditorId()))}catch(e){setNotice((e as Error).message);return false}}}
}
type Library=ReturnType<typeof useAssemblyLibrary>
function AssemblyPlan({assembly:a}:{assembly:SceneAssembly}){
 const pad=Math.max(a.width,a.depth)*.06
 return <svg viewBox={`${-pad} ${-pad} ${a.width+pad*2} ${a.depth+pad*2}`} aria-label="План сборки" role="img"><rect width={a.width} height={a.depth} fill="#182a20" stroke="#758361" strokeWidth=".7" vectorEffect="non-scaling-stroke"/>{a.objects.slice().sort((x,y)=>x.z-y.z).map(o=><rect key={o.id} x={o.x-o.width/2} y={o.y-o.depth/2} width={o.width} height={o.depth} rx={Math.min(o.width,o.depth)*.06} fill={o.kind==='lamp'?'#ddbd78':o.kind==='crate'?'#b79a6a':o.kind==='platform'?'#4e6d58':'#a3b0a2'} stroke="#213c2b" strokeWidth="1" vectorEffect="non-scaling-stroke"/> )}</svg>
}
export default function SceneAssemblyLibrary({library,selected,disabled,onCapture,onPick,selectionCount,facing,elevation,onRotate,onElevation,scope}:{library:Library;selected:string;disabled:boolean;onCapture:(name:string)=>SceneAssembly;onPick:(id:string)=>void;selectionCount:number;facing:number;elevation:number;onRotate:()=>void;onElevation:(n:number)=>void;scope?:string}){
 const [query,setQuery]=useState(''),input=useRef<HTMLInputElement>(null),mounted=useRef(true),currentScope=useRef(scope),blocked=useRef(disabled)
 currentScope.current=scope;blocked.current=disabled
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 async function importFile(file:File){const scopeAtStart=scope,version=library.revision;try{if(file.size>2*1024*1024)throw Error('Файл сборок превышает 2 МБ.');const raw=await file.text();if(!mounted.current||blocked.current||scopeAtStart!==currentScope.current)return;library.import(raw,version)}catch(e){if(mounted.current)library.report((e as Error).message)}}
 function download(){const url=URL.createObjectURL(new Blob([encodeAssemblyLibrary(library.items)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='grani-assemblies.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <section className="gb-assembly-library" aria-label="Библиотека сборок"><small>ТВОИ КОМПОЗИЦИИ</small><h3>Мои сборки</h3><p>Сохрани объекты вместе и расставляй готовую композицию одним нажатием.</p>
  <form aria-label="Сохранить сборку" onSubmit={e=>{e.preventDefault();if(disabled)return;try{const name=String(new FormData(e.currentTarget).get('assemblyName')??'');if(library.add(onCapture(name)))e.currentTarget.reset()}catch(error){library.report((error as Error).message)}}}>
   <label className="w6-field"><span>Название сборки</span><input name="assemblyName" required maxLength={80} placeholder="Стол на четверых…"/></label><button className="w6-button" disabled={disabled||!selectionCount}>Сохранить выделение · {selectionCount}</button>
  </form>
  <div className="gb-assembly-transfer"><button className="w6-button" disabled={!library.items.length} onClick={download}><EditorIcon name="download" size={15}/>Экспорт</button><button className="w6-button" disabled={disabled} onClick={()=>input.current?.click()}><EditorIcon name="upload" size={15}/>Импорт</button><button className="w6-button" disabled={disabled||!library.canUndo} onClick={()=>library.undo()}>Отмена в библиотеке</button><input hidden ref={input} type="file" accept=".json,application/json" onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void importFile(file);e.currentTarget.value=''}}/></div>
  <label className="w6-field"><span>Поиск сборки</span><input type="search" value={query} onChange={e=>setQuery(e.currentTarget.value)} placeholder="Найти композицию…"/></label>
  <div className="gb-assembly-cards">{library.items.filter(a=>a.name.toLowerCase().includes(query.toLowerCase())).map(a=><article key={a.id}><button className="gb-assembly-pick" aria-pressed={selected===a.id} disabled={disabled} onClick={()=>onPick(a.id)}><AssemblyPlan assembly={a}/><strong>{a.name}</strong><small>{a.objects.length} объектов · {a.width} × {a.depth} м</small></button><button className="gb-assembly-remove" aria-label={'Удалить сборку: '+a.name} disabled={disabled} onClick={()=>library.remove(a.id)}><EditorIcon name="trash" size={15}/></button></article>)}</div>
  {!library.items.length&&<p className="gb-assembly-empty">Выдели мебель и свет на сцене, затем дай композиции название. Герои сохраняются в сцене отдельно.</p>}
  {selected&&library.items.some(a=>a.id===selected)&&<div className="gb-assembly-placement"><button className="w6-button" disabled={disabled} onClick={onRotate}>Поворот {facing}° · R</button><label className="w6-field"><span>Высота над землёй, м</span><input type="number" step=".1" value={elevation} disabled={disabled} onChange={e=>onElevation(e.currentTarget.valueAsNumber||0)}/></label><small>Нажми на сцену, чтобы поставить сборку. V — вернуться к выбору.</small></div>}
  <p className="gb-assembly-notice" role="status">{library.notice||(scope?'Хранится в этом браузере. Экспорт переносит сборки между устройствами.':'Сборки этой сессии. Экспорт сохраняет их в файл.')}</p>
 </section>
}
