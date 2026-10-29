import {useState} from 'react'
import {tabletopAssets,tabletopCategories,isFloorAsset,tabletopAsset} from './tabletopCatalog'

function AssetIcon({id}:{id:string}){
 const [failed,setFailed]=useState(false)
 if(!failed)return <img src={import.meta.env.BASE_URL+'tabletop-thumbnails/'+id+'.png'} width="160" height="120" alt="" loading="lazy" onError={()=>setFailed(true)}/>
 const floor=id.startsWith('floor-')||id==='rug',wall=id.includes('wall')||id==='timber-window',door=id.includes('door')||id==='dungeon-arch'
 return <svg viewBox="0 0 56 44" aria-hidden="true" fill="none" strokeLinejoin="round" strokeLinecap="round">
  <path d="M4 33 27 43 52 31 29 21Z" fill="#263d3c" opacity=".45"/>
  {floor?<><path d="M5 24 29 13 51 24 27 36Z" fill={id==='floor-grass'?'#6f8760':id==='floor-stone'?'#a6ac99':id==='rug'?'#9d7264':'#ad8b61'} stroke="#d4c4a0"/><path d="m12 27 24-11m-17 15 24-11M13 20l22 12m-13-17 22 12" stroke="#3f4c3d" opacity=".6"/></>:
   wall||door?<><path d="M9 12 42 5 47 9 14 17Z" fill="#a7875c"/><path d="M9 12v24l33-9V5Z" fill={wall?'#cfbe96':'#9c7954'} stroke="#ddcba6"/><path d="M42 5v22l5 4V9Z" fill="#5a4d3a"/>{door?<path d="m17 33 1-15q9-12 17-4v15m-9-11v12m-7-8 14-4" stroke="#4d402e" strokeWidth="3"/>:<path d="M12 13v22m27-28v21M12 28l27-7M14 32l22-22" stroke="#665138" strokeWidth="3"/>}{id==='timber-window'&&<path d="m20 16 12-3v9l-12 3Z" fill="#354c4b" stroke="#8b744f" strokeWidth="2"/>}</>:
   id==='barrel'?<><path d="M15 13q-7 13 0 24 12 8 25-2 7-13-1-24Z" fill="#9d7b50" stroke="#c3aa7d"/><ellipse cx="27" cy="12" rx="13" ry="6" fill="#b19469"/><path d="M13 20q13 8 29-2m-29 11q13 8 29-2M20 15v22m13-22v22" stroke="#4e574b" strokeWidth="3"/></>:
   id==='candle'||id==='brazier'||id==='fireplace'?<><path d="m12 36 17-7 16 5-17 8Z" fill="#7c8472"/><path d="M16 33V16l12-6 14 5v17l-8 3V22l-11 4v10Z" fill={id==='fireplace'?'#a4a08b':'#6b6e58'} stroke="#c1b18c"/><path d="M26 32q-8-9 2-17-1 8 7 7 5 9-9 10Z" fill="#efac57" stroke="#ffdc90"/></>:
   id==='chair'?<><path d="M17 12v20m18-26v20M17 12l18-6v12l-18 6Z" fill="#9f8058" stroke="#d6b487" strokeWidth="3"/><path d="m14 28 21-7 10 5-22 9Z" fill="#bc9a69"/><path d="M16 29v10m25-12v10m-18-2v7" stroke="#866743" strokeWidth="4"/></>:
   id==='bed'?<><path d="m7 26 25-14 18 8-25 17Z" fill="#7e9a89" stroke="#d1bd98"/><path d="M8 21v15m41-22v14m-24 3v12m7-38v12m0-12 18 8" stroke="#997951" strokeWidth="4"/><path d="m31 16 5-3 9 4-6 4Z" fill="#d9d0b3"/></>:
   id==='shelf'?<><path d="M12 10v29m31-37v29M12 10 43 2v29l-31 8Z" fill="#725a3e" stroke="#b89462" strokeWidth="3"/><path d="m13 20 29-8m-29 18 29-8" stroke="#d5b581" strokeWidth="3"/><path d="m19 17v-5m8 3V9m9 4V7m-16 20v-5m9 2v-5m8 3v-6" stroke="#8ca58b" strokeWidth="4"/></>:
   id==='stairs'?<path d="m7 32 12-6v-5l10-5v-5l12-6 8 6v20L25 43Z" fill="#a3a58c" stroke="#d1c7a2" strokeWidth="2"/>:
   id.startsWith('trap-')?<><path d="M7 27 29 16 49 26 27 39Z" fill="#777f6b" stroke="#b7b393"/>{[0,1,2].map(i=><path key={i} d={`m${13+i*10} 29 4-17 4 14Z`} fill="#b8bba2" stroke="#d9d6b9"/>)}</>:
   <><path d="M12 21v15m30-17v14m-17-4v13" stroke="#755b3f" strokeWidth="4"/><path d="M6 20 31 9 50 18 25 32Z" fill="#b29264" stroke="#dac59f" strokeWidth="2"/><path d="m14 23 25-10m-17 14 24-10" stroke="#6d5a3f"/></>}
 </svg>
}
type Props={selected:string;disabled:boolean;onPick:(id:string)=>void;size:number;onSize:(n:number)=>void;erasing:boolean;onErase:()=>void;facing:number;onRotate:()=>void}
export default function TabletopLibrary({selected,disabled,onPick,size,onSize,erasing,onErase,facing,onRotate}:Props){
 const [categoryChoice,setCategory]=useState({name:'Мебель',selection:selected}),[query,setQuery]=useState('')
 const category=categoryChoice.selection===selected?categoryChoice.name:tabletopAsset(selected)?.category??categoryChoice.name
 const assets=tabletopAssets.filter(a=>(query||a.category===category)&&a.name.toLowerCase().includes(query.toLowerCase()))
 return <section className="gb-tabletop-library" aria-label="Библиотека 3D-моделей">
  <div className="gb-tabletop-library-heading"><div><small>МОДУЛЬНЫЙ НАБОР</small><strong>Таверна и подземелье</strong></div><label><span className="sr-only">Поиск 3D-модели</span><input aria-label="Поиск 3D-модели" type="search" placeholder="Найти модель…" value={query} onChange={e=>setQuery(e.currentTarget.value)}/></label><span>{tabletopAssets.length} модели</span></div>
  <nav aria-label="Категории 3D-моделей">{tabletopCategories.map(c=><button key={c} type="button" className="w6-button" aria-pressed={category===c&&!query} onClick={()=>{setCategory({name:c,selection:selected});setQuery('')}}>{c}</button>)}</nav>
  <div className="gb-tabletop-assets">{assets.map(a=><button key={a.id} type="button" aria-pressed={selected===a.id&&!erasing} disabled={disabled} onClick={()=>onPick(a.id)}><AssetIcon id={a.id}/><strong>{a.name}</strong><small>{isFloorAsset(a.id)?'Кисть · плитка 2 × 2 м':`${a.width} × ${a.depth} м`}</small></button>)}{!assets.length&&<p>Моделей с таким названием нет.</p>}</div>
  <div className="gb-tabletop-tool-options">{isFloorAsset(selected)||erasing?<><label>Ширина кисти <select aria-label="Ширина кисти" value={size} disabled={disabled} onChange={e=>onSize(Number(e.currentTarget.value))}>{[1,2,3].map(n=><option value={n} key={n}>{n*2} м</option>)}</select></label><button className="w6-button" type="button" aria-pressed={erasing} disabled={disabled} onClick={onErase}>Ластик пола</button><span>ЛКМ — мазок · Alt+ЛКМ — камера · Esc — отмена</span></>:<><button className="w6-button" type="button" disabled={disabled} onClick={onRotate}>Поворот {facing}° · R</button><span>Выбери модель и нажми на сцену. V — вернуться к выбору.</span></>}</div>
 </section>
}
