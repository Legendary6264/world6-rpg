import { useState } from 'react'
import type { MouseEvent } from 'react'
import AnatomySilhouette from './AnatomySilhouette'
import type { BodyState } from './characterBody'
import { bodyRegionDefs } from './characterBody'
import { kindLabels, regionBounds, structurePoint, structureBlocked } from './anatomyModel'
import type { AnatomyStructure, HitLocation, StructureKind } from './anatomyModel'
import { hasRealisticAnatomy } from './anatomyArtwork'
import AnatomyPlate from './AnatomyPlate'
import type { InventoryItem } from './rpgTypes'
type Layer='body'|StructureKind|'armor'
type Props={body:BodyState;selectedRegion:string;selectedStructure?:string;point?:HitLocation;inventory?:InventoryItem[];playerView?:boolean;onSelectRegion:(id:string)=>void;onSelectStructure?:(id:string)=>void;onPoint?:(point:HitLocation)=>void;onLayer?:(layer:string)=>void}
export function StructureGlyph({s,fill,stroke,back=false}:{s:AnatomyStructure;fill:string;stroke:string;back?:boolean}){
 const id=s.id
 let d='M0-1C.7-1 1-.5 1 0C1 .6 .5 1 0 1C-.7 1-1 .5-1 0C-1-.7-.4-1 0-1Z'
 let detail=''
 if(s.kind==='bone'){
  d=s.ry>s.rx*1.4?'M-.5-1Q-1-1-1-.7L-.5-.5L-.4 .5L-.9 .75Q-1 1-.5 1Q0 .65 .5 1Q1 1 .9 .75L.4 .5L.5-.5L1-.7Q1-1 .5-1Q0-.6-.5-1Z':'M-1-.4Q-.9-1-.5-.8L.5-.8Q1-1 1-.4L.8 .5Q.5 1 0 .8L-.7 .8Z'
  detail='M0-.6L.08 .65'
  if(id.startsWith('rib-')){d='M-1-.45C-.6-1.8 .75-1.5 1 .8L.9 1.2C.6-1.05-.6-1.1-1 .4Z';detail='M-.7-.4Q0-1 .7 .25'}
  if(id.endsWith('scapula')){d='M-1-.8C-.5-1 .65-1 1-.6L.25 1L-.2 .7Z';detail='M-.6-.6L.4-.1L.2 .7'}
  if(id==='pelvis'){d='M-1-.7C-.8-1.3-.2-1 0-.65C.2-1 .8-1.3 1-.7L.8 .6L.4 .95L-.4 .95L-.8 .6ZM-.7-.1Q-.2-.5-.1 .2Q-.2 .6-.65 .4ZM.7-.1Q.2-.5 .1 .2Q.2 .6 .65 .4Z';detail='M0-.5V.7M-.75 .65L-.4 .85M.75 .65L.4 .85'}
  if(id.startsWith('vertebra-')){d='M-.5-1L.5-1L.7-.4L1 0L.6 .4L.4 1L-.4 1L-.6 .4L-1 0L-.7-.4Z';detail='M-.3-.45L.3-.45L.3 .45L-.3 .45Z'}
  if(id==='skull'){d='M0-1C1-1 1 .15 .65 .4L.55 .9L-.55 .9L-.65 .4C-1 .15-1-1 0-1Z';detail='M-.6-.05Q-.3-.45-.12-.05L-.15 .22L-.55 .22ZM.6-.05Q.3-.45 .12-.05L.15 .22L.55 .22ZM0 .1L-.1 .4L.1 .4ZM-.4 .65L.4 .65M-.3 .55V.8M-.1 .55V.8M.1 .55V.8M.3 .55V.8'}
 }
 if(s.kind==='vessel'){d='M-.22-1L.2-1L.3 1L-.2 1Z';detail='M0-.8L.1 .8M0-.4L.7-.7M.1 .2L-.7 .6'}
 if(s.kind==='organ'){
  if(id==='heart'){d='M0-.45C.25-1 .9-.85 1-.15C1 .5 .35 .9 0 1C-.5 .65-1 .15-.9-.4C-.75-.9-.2-1 0-.45Z';detail='M-.2-.65L.1-.05L-.1 .6M.1-.05L.6 .25'}
  if(id.startsWith('lung-')){d='M-.1-1C.5-.95 1 .1 1 .65C1 1-.2 1-1 .7L-.85-.1C-.7-.7-.3-.95-.1-1Z';detail='M0-.7L0 .6M0-.3L-.5 .1M0 0L.6 .4M0 .3L-.6 .65'}
  if(id==='brain'){d='M0-1C.4-1 .4-.9 .7-.7C1-.7 .95-.1 1 .1C1 .6 .5 1 0 .85C-.5 1-1 .6-1 .1C-.95-.2-1-.7-.7-.7C-.4-.9-.4-1 0-1Z';detail='M0-.8V.7M-.7-.45Q-.1-.7-.25-.25Q-.75 .1-.3 .35L-.6 .6M.65-.55Q.1-.6 .3-.1Q.8 .15 .25 .5'}
  if(id==='liver'){d='M-1-.45C-.5-1 .8-.9 1-.35L.75 .55L.1 .9L-.4 .2L-1 .25Z';detail='M-.15-.7L.1 .8'}
  if(id==='stomach'){d='M.2-1L.5-.9L.2-.4C1-.25 1 .65 .5 .95C0 1-.6 .7-.8 .2L-1-.2L-.7-.45C-.2 0 .2 .2 .2-1Z';detail='M.4-.05Q.8 .4 .2 .55Q-.1 .7-.5 .15'}
  if(id.startsWith('kidney')){d='M.6-1C-1-1-1 1 .6 1C1 .8 .85 .5 .2 .3Q-.1 0 .2-.3C.9-.5 1-.8 .6-1Z';detail='M-.2-.5Q-.8 0-.2 .5'}
  if(id==='intestines'){d='M-.8-.8H.8V.8H-.8Z';detail='M-.7-.6H.5Q.9-.5 .5-.3H-.5Q-.9-.1-.5 .1H.5Q.9 .3 .5 .4H-.5Q-.9 .7-.5 .7H.5'}
 }
 if(back&&id==='skull')detail='M0-1V-.2L-.2 .1L.15 .4L0 .8M-.8-.2Q0 .1 .8-.2'
 return <><path d={d} fillRule="evenodd" fill={fill} stroke={stroke} strokeWidth={.075} vectorEffect="non-scaling-stroke"/>{detail&&<path d={detail} fill="none" stroke={s.kind==='bone'?'#675746':'#42292d'} strokeWidth={.055} opacity={.8}/>}</>
}
export default function AnatomyAtlas({body,selectedRegion,selectedStructure,point,inventory=[],playerView=false,onSelectRegion,onSelectStructure,onPoint,onLayer}:Props){
 const [layer,setLayer]=useState<Layer>('body'),[back,setBack]=useState(false),[zoom,setZoom]=useState(false),[showPoints,setShowPoints]=useState(true),[candidates,setCandidates]=useState<string[]>([])
 const form=body.anatomy?.form??'humanoid',regions=bodyRegionDefs(body),selected=regions.find(r=>r.key===selectedRegion)??regions[0]
 if(!selected)return <p>Нет областей тела. Восстанови физиологию из шаблона расы.</p>
 const wingStyle=body.anatomy?.wingStyle??'membrane'
 const bounds=regionBounds(form,selected.key,regions.indexOf(selected),wingStyle)
 const view=zoom?`${(back?300-bounds.x:bounds.x)-bounds.rx-18} ${bounds.y-bounds.ry-18} ${bounds.rx*2+36} ${bounds.ry*2+36}`:'0 0 300 600'
 const structures=(body.anatomy?.structures??[]).filter(s=>s.kind===layer&&body.parts[s.region]?.present&&(!playerView||s.kind==='skin'||s.injuries.some(i=>i.diagnosed)))
 const isHumanoid=form==='humanoid'||form==='winged'
 const realistic=hasRealisticAnatomy(form)&&['body','skin','armor','bone','joint','tissue','muscle','organ','vessel'].includes(layer)
 function selectStructure(s:AnatomyStructure){onSelectRegion(s.region);onSelectStructure?.(s.id);setCandidates([]);if(onPoint)onPoint({x:s.x,y:s.y,approach:back?'back':'front',mechanism:point?.mechanism??'blunt',angleX:point?.angleX??0,angleY:point?.angleY??0})}
 function canvasClick(event:MouseEvent<SVGSVGElement>){const svg=event.currentTarget,matrix=svg.getScreenCTM();if(!matrix)return;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const screen=p.matrixTransform(matrix.inverse()),x=back?300-screen.x:screen.x,y=screen.y
  if(structures.length){const nearest=structures.map(s=>{const b=structurePoint(form,s,0,wingStyle);return {s,d:Math.hypot(b.x-x,b.y-y)}}).filter(s=>s.d<(zoom?7:14)).sort((a,b)=>a.d-b.d);if(nearest.length){selectStructure(nearest[0].s);if(nearest.length>1&&nearest[1].d-nearest[0].d<3)setCandidates(nearest.slice(0,8).map(v=>v.s.id));return}}
  const nearest=regions.filter(r=>body.parts[r.key].present).map(r=>{const b=regionBounds(form,r.key,0,wingStyle);return {r,d:((x-b.x)/b.rx)**2+((y-b.y)/b.ry)**2}}).filter(v=>v.d<=1).sort((a,b)=>a.d-b.d)[0];if(!nearest)return;onSelectRegion(nearest.r.key);setCandidates([]);const b=regionBounds(form,nearest.r.key,0,wingStyle);onPoint?.({x:Math.max(0,Math.min(1,(x-b.x)/(2*b.rx)+.5)),y:Math.max(0,Math.min(1,(y-b.y)/(2*b.ry)+.5)),approach:back?'back':'front',mechanism:point?.mechanism??'blunt',angleX:point?.angleX??0,angleY:point?.angleY??0})
 }
 const dotColor=(s:AnatomyStructure)=>structureBlocked(s)?'#ef8b7c':s.current<s.maximum?'#d6a263':s.id===selectedStructure?'#ffe5a7':'#b3c8c5'
 return <section className="w6-anatomy-atlas" aria-label="Визуальная анатомия"><div className="w6-anatomy-toolbar"><div className="w6-modes" aria-label="Слои тела">{([['body','Тело'],['skin','Кожа'],['muscle','Мышцы'],['bone','Кости'],['joint','Суставы'],['organ','Органы'],['vessel','Сосуды'],['armor','Защита']] as const).map(([k,label])=><button type="button" key={k} className={'w6-button'+(layer===k?' w6-active':'')} aria-pressed={layer===k} onClick={()=>{setLayer(k);setCandidates([]);onLayer?.(k)}} disabled={playerView&&!['body','skin','armor'].includes(k)&&!body.anatomy?.structures.some(s=>s.kind===k&&s.injuries.some(i=>i.diagnosed))}>{label}</button>)}</div><div className="w6-buttons"><button type="button" className="w6-button" onClick={()=>setBack(!back)}>{back?'Вид спереди':'Вид сзади'}</button><button type="button" className="w6-button" aria-pressed={zoom} onClick={()=>setZoom(!zoom)}>{zoom?'Показать всё тело':'Увеличить область'}</button><button type="button" className="w6-button" aria-pressed={showPoints} onClick={()=>setShowPoints(!showPoints)}>{showPoints?'Скрыть точки':'Показать точки'}</button></div></div>
 <div className={'w6-anatomy-stage'+(zoom?' w6-anatomy-zoom':'')}><svg viewBox={view} onClick={canvasClick} role="group" aria-label={(back?'Вид сзади':'Вид спереди')+' · '+(layer==='body'?'Тело':layer==='armor'?'Защита':kindLabels[layer])}>
 {isHumanoid&&!back&&<g transform={undefined}><AnatomySilhouette wingStyle={wingStyle} featuresOnly form={form} layer={layer} parts={regions.filter(r=>body.parts[r.key].present).map(r=>r.key)}/></g>}
 {realistic&&<AnatomyPlate form={form} kind={['body','armor'].includes(layer)?'skin':layer as StructureKind} back={back}/>}
 {(!isHumanoid||back)&&<g transform={back?'translate(300 0) scale(-1 1)':undefined}><AnatomySilhouette wingStyle={wingStyle} featuresOnly={realistic&&(isHumanoid||['body','skin','armor'].includes(layer))} form={form} back={back} layer={layer} parts={regions.filter(r=>body.parts[r.key].present).map(r=>r.key)}/></g>}

 <g transform={back?'translate(300 0) scale(-1 1)':undefined}>
 {['body','armor'].includes(layer)&&regions.filter(r=>body.parts[r.key].present).map(r=>{const b=regionBounds(form,r.key,0,wingStyle),isSelected=selected.key===r.key;return <g key={r.key} role="button" tabIndex={0} aria-label={'Выбрать область: '+r.label} aria-pressed={isSelected} onClick={e=>{e.stopPropagation();onSelectRegion(r.key)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelectRegion(r.key)}}} className="w6-anatomy-dot"><title>{r.label}</title><circle cx={b.x} cy={b.y} r="6" fill="transparent"/>{showPoints&&<circle cx={b.x} cy={b.y} r={isSelected?2.4:1.8} fill={isSelected?'#ffe5a7':'#b3c8c5'}/>}</g>})}
 {structures.map(s=>{const b=structurePoint(form,s,0,wingStyle),isSelected=s.id===selectedStructure;return <g key={s.id} className="w6-anatomy-dot" role="button" tabIndex={s.region===selected.key?0:-1} aria-label={'Осмотреть: '+s.name} aria-pressed={isSelected} onClick={e=>{e.stopPropagation();selectStructure(s);const nearby=structures.filter(other=>{const b2=structurePoint(form,other,0,wingStyle);return Math.hypot(b.x-b2.x,b.y-b2.y)<5});if(nearby.length>1)setCandidates(nearby.map(v=>v.id).slice(0,8))}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectStructure(s)}}}><title>{s.name}</title><circle cx={b.x} cy={b.y} r={zoom?3:4} fill="transparent"/>{showPoints&&<circle className="w6-point" cx={b.x} cy={b.y} r={isSelected?2.2:s.kind==='joint'?2:1.4} fill={dotColor(s)} opacity={s.region===selected.key?1:.7}/>}</g>})}
 {point&&<path d={`M${bounds.x+(point.x-.5)*2*bounds.rx-3} ${bounds.y+(point.y-.5)*2*bounds.ry}h6m-3-3v6`} stroke="#f7cc77" strokeWidth=".8" pointerEvents="none"/>}
 </g></svg><div className="w6-atlas-caption"><span>{form==='quadruped'?'Боковая проекция':back?'Задняя проекция':'Передняя проекция'}</span><strong>{selected.label}</strong></div></div>
 {candidates.length>1&&<div className="w6-point-picker"><small>Рядом несколько структур — выбери точную:</small>{candidates.map(id=>{const s=structures.find(s=>s.id===id);return s&&<button type="button" key={id} className="w6-button" onClick={()=>selectStructure(s)}>{s.name}</button>})}</div>}
 <label className="w6-field"><span>Область на фигуре</span><select value={selected.key} onChange={e=>onSelectRegion(e.currentTarget.value)}>{regions.map(r=><option value={r.key} key={r.key}>{r.label}</option>)}</select></label>
 {structures.length>0&&<label className="w6-field"><span>Точная структура · {kindLabels[layer as StructureKind]}</span><select value={structures.some(s=>s.id===selectedStructure)?selectedStructure:''} onChange={e=>{const s=structures.find(s=>s.id===e.currentTarget.value);if(s)selectStructure(s)}}><option value="">Выбери структуру</option>{structures.map(s=><option key={s.id} value={s.id}>{regions.find(r=>r.key===s.region)?.label} / {s.name}</option>)}</select></label>}
 <p className="w6-atlas-legend"><span>Точка — структура</span><span>Золотая — выбрана</span><span>Красная — функция утрачена</span></p><p className="w6-copy">Суставы открывают список соединённых костей. Для небольших структур увеличь область или используй точный список.</p>
 {layer==='armor'&&inventory.filter(i=>i.equipped).map(i=><p className="w6-copy" key={i.id}>{i.name}: {i.covers.map(r=>body.parts[r]?.label??r).join(', ')}</p>)}
 </section>
}
