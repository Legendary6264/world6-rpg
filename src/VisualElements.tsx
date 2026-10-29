import './artworkPicker.css'
import { validateImageFile, MAX_IMAGE_PIXELS } from './uploadSafety'
import { useEffect, useRef, useState } from 'react'
import { artworkSource, visualArtwork, artworkLabels, artworkMetadata, artworkCategoryLabels, MAX_ARTWORK_LENGTH } from './visualMedia'
import type { ArtworkKey } from './visualMedia'
import type { ReadyCharacterDraft } from './characterModel'
import { resourceFields } from './characterModel'
export function Illustration({value,fallback='artifact',alt='',className=''}:{value?:string;fallback?:ArtworkKey;alt?:string;className?:string}){return <img className={'w6-illustration '+className} src={artworkSource(value,fallback)} alt={alt} loading="lazy" decoding="async"/>}
export function ResourceStrip({draft}:{draft:ReadyCharacterDraft}){return <div className="w6-resource-strip">{resourceFields.filter(f=>f.key!=='health'&&(f.key==='stamina'||f.key===(draft.profile.energy??'mana'))).map(r=>{const v=draft.resources[r.key],max=Number(v.maximum),now=Number(v.current),percent=Number.isFinite(now)&&max>0?Math.max(0,Math.min(100,now/max*100)):0;return <div className={'w6-mini-resource w6-resource-'+r.key} key={r.key}><span><StateIcon kind={r.key}/>{r.label}</span><strong>{v.current||'—'} / {v.maximum||'—'}</strong><div className="w6-meter" role="meter" aria-label={r.label} aria-valuemin={0} aria-valuemax={max>0?max:1} aria-valuenow={Number.isFinite(now)?Math.min(max>0?max:1,Math.max(0,now)):0}><i style={{width:percent+'%'}}/></div></div>})}</div>}
const iconPaths:Record<string,string>={health:'M12 21C-4 10 5 0 12 7C19 0 28 10 12 21Z',mana:'M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9Z',shadow:'M17 2A10 10 0 1 0 22 17A10 10 0 0 1 17 2Z',stamina:'M14 1L4 14H11L9 23L21 9H13Z',bleeding:'M12 2C10 7 4 11 4 16A8 8 0 0 0 20 16C20 11 14 7 12 2Z',fracture:'M5 4L9 8L7 12L13 15L16 19M7 2L11 7L10 10L16 13L19 17M3 3L6 1M16 20L20 16',armor:'M12 2L21 6V13Q20 20 12 23Q4 20 3 13V6Z',healing:'M9 3H15V9H21V15H15V21H9V15H3V9H9Z',knowledge:'M3 3Q9 1 12 5Q15 1 21 3V21Q15 18 12 22Q9 18 3 21Z',critical:'M12 2L23 21H1ZM12 8V14M12 17V19'}
export function StateIcon({kind}:{kind:string}){return <svg className={'w6-state-icon w6-icon-'+kind} viewBox="0 0 24 24" aria-hidden="true"><path d={iconPaths[kind]??iconPaths.knowledge} fill={kind==='fracture'?'none':'currentColor'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>}
export type ArtworkFilterGroup={id:string;label:string;keys:ArtworkKey[]}
export function ArtworkPicker({label,value,presets,onChange,disabled=false,thumbnails,filterGroups}:{label:string;value?:string;presets:ArtworkKey[];onChange:(v:string)=>void;disabled?:boolean;thumbnails?:Record<string,string>;filterGroups?:ArtworkFilterGroup[]}){
 const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[page,setPage]=useState(0)
 const unique=[...new Set(presets)], categories=filterGroups??[...new Set(unique.map(k=>artworkMetadata[k]?.category??'legacy'))].map(id=>({id,label:artworkCategoryLabels[id]??id,keys:unique.filter(k=>(artworkMetadata[k]?.category??'legacy')===id)}))
 const selectedGroup=categories.find(c=>c.id===category),groupKeys=selectedGroup?new Set(selectedGroup.keys):undefined
 const normalize=(value:string)=>value.toLocaleLowerCase('ru').replaceAll('ё','е'),terms=normalize(query).trim().split(/\s+/).filter(Boolean)
 const filtered=unique.filter(k=>{const words=normalize(artworkLabels[k]+' '+(artworkMetadata[k]?.tags??[]).join(' '));return (!groupKeys||groupKeys.has(k))&&terms.every(term=>words.includes(term))})
 const pages=Math.max(1,Math.ceil(filtered.length/24)),currentPage=Math.min(page,pages-1),shown=filtered.slice(currentPage*24,(currentPage+1)*24)
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),latest=useRef(onChange),request=useRef(0);useEffect(()=>{latest.current=onChange},[onChange]);useEffect(()=>()=>{request.current++},[])
 async function upload(file:File|undefined){
  if(!file)return
  const requestId=++request.current
  try{await validateImageFile(file)}catch(e){setMessage((e as Error).message);return}
  if(requestId!==request.current)return
  setBusy(true);const url=URL.createObjectURL(file)
  try{const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Изображение не удалось открыть.'));img.src=url})
   if(img.naturalWidth*img.naturalHeight>MAX_IMAGE_PIXELS)throw new Error('Слишком большое разрешение изображения.')
   const canvas=document.createElement('canvas'),scale=Math.min(1,420/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale))
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('В этом браузере загрузка изображений недоступна.');ctx.drawImage(img,0,0,canvas.width,canvas.height)
   let data=canvas.toDataURL('image/webp',.82)
   if(data.length>MAX_ARTWORK_LENGTH)data=canvas.toDataURL('image/jpeg',.65)
   if(data.length>MAX_ARTWORK_LENGTH)throw new Error('Изображение слишком тяжёлое. Выбери уменьшенный файл.')
   if(requestId!==request.current)return
   latest.current(data);setMessage('Изображение добавлено в лист; сохрани изменения.')
  }catch(e){setMessage((e as Error).message)}finally{URL.revokeObjectURL(url);if(requestId===request.current)setBusy(false)}
 }
 function choose(value:string){request.current++;setBusy(false);onChange(value)}
 return <fieldset disabled={disabled} className="w6-art-picker"><legend>{label} · {unique.length}</legend>{unique.length>24&&<div className="gb-art-filter"><label className="w6-field"><span>Поиск</span><input type="search" aria-label={'Поиск: '+label} placeholder="Название или тег" value={query} onChange={e=>{setQuery(e.currentTarget.value);setPage(0)}}/></label>{categories.length>1&&<label className="w6-field"><span>Категория</span><select aria-label={'Категория: '+label} value={selectedGroup?.id??'all'} onChange={e=>{setCategory(e.currentTarget.value);setPage(0)}}><option value="all">Все</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}</div>}{value&&value!=='auto'&&!value.startsWith('data:')&&<div className="gb-art-current"><img className="w6-illustration" src={thumbnails?.[value]??artworkSource(value)} alt={artworkLabels[value]??'Выбранное изображение'} loading="lazy"/><span>Выбрано: {artworkLabels[value]??value}</span></div>}<div className="w6-art-options"><button className={'w6-button'+(!value||value==='auto'?' w6-active':'')} type="button" onClick={()=>choose('auto')}>Автоматически</button>{shown.map(k=><button className={'w6-art-option'+(value===k?' w6-art-selected':'')} type="button" key={k} aria-pressed={value===k} onClick={()=>choose(k)}><img src={thumbnails?.[k]??visualArtwork[k]} alt="" loading="lazy"/><span>{artworkLabels[k]}</span></button>)}</div>{!filtered.length&&<p role="status">По этому запросу изображений нет.</p>}{pages>1&&<div className="gb-art-pagination"><button className="w6-button" type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Назад</button><span aria-live="polite">{currentPage+1} / {pages} · найдено {filtered.length}</span><button className="w6-button" type="button" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Далее</button></div>}<label className="w6-field"><span>{busy?'Обработка изображения…':'Своё изображение'}</span><input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void upload(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/></label>{value?.startsWith('data:')&&<img className="w6-upload-preview" src={value} alt="Загруженное изображение"/>}<p className="w6-notice" role="status">{message}</p></fieldset>
}
export function EquipmentGallery(){return <div className="w6-category-gallery">{(['weapons','armor','artifact','supplies'] as const).map(k=><figure key={k}><Illustration fallback={k}/><figcaption>{artworkLabels[k]}</figcaption></figure>)}</div>}
