import SceneAbilityOverlay, { useVisualReplay } from './SceneAbilityOverlay'
import { useId, useState } from 'react'
import type { ScenePosition } from './sceneTypes'
import type { PerceivedMap, VisibleContact } from './scenePerception'
import { SceneGlyph } from './SceneViewport'
import { artworkSource, isTiledArtwork } from './visualMedia'
import './sceneStyle.css'
export default function PerceivedScene({ map, selected, onSelect, onPoint, onObject, selectedObject, pickedPoint, plannedRoute = [] }: { map: PerceivedMap; selected?: string; onSelect?: (id: string) => void; onPoint?: (p: ScenePosition) => void; onObject?: (id: string) => void; selectedObject?: string; pickedPoint?: ScenePosition | null; plannedRoute?: ScenePosition[] }) {
  const [camera,setCamera]=useState<{sceneId:string;zoom:number;center:{x:number;y:number}|null}>({sceneId:map.frame.id,zoom:1,center:null})
  const playback=useVisualReplay(map.visuals?.some(v=>v.phase==='sequence')??false)
  const clip = useId().replace(/:/g, ''),visualClip=clip+'-visual', f = map.frame, side = f.view === 'side', vertical = side ? f.maxZ - f.minZ : f.depth
  const tiled=isTiledArtwork(f.background),tileSize=f.backgroundTileSizeM??4
  const size = Math.max(f.width, vertical) * .022, self = map.contacts.find(c=>c.kind==='self')
  const yPoint = (p:ScenePosition) => side ? f.maxZ-p.z : p.y
  const route = [...(self&&self.z!==undefined?[{x:self.x,y:self.y,z:self.z}]:[]),...plannedRoute]
  const yOf = (c: VisibleContact) => side ? c.z === undefined ? vertical / 2 : f.maxZ - c.z : c.y
  const zoom=camera.sceneId===f.id?camera.zoom:1,viewWidth=f.width/zoom,viewHeight=vertical/zoom
  const focus=camera.sceneId===f.id?camera.center:null,center=focus??(self?{x:self.x,y:yOf(self)}:{x:f.width/2,y:vertical/2})
  const origin={x:Math.max(0,Math.min(f.width-viewWidth,center.x-viewWidth/2)),y:Math.max(0,Math.min(vertical-viewHeight,center.y-viewHeight/2))}
  function scale(next:number){const anchor=pickedPoint?{x:pickedPoint.x,y:yPoint(pickedPoint)}:center;setCamera({sceneId:f.id,zoom:Math.max(1,Math.min(4,next)),center:anchor})}
  function pan(dx:number,dy:number){setCamera({sceneId:f.id,zoom,center:{x:Math.max(viewWidth/2,Math.min(f.width-viewWidth/2,origin.x+viewWidth/2+dx*viewWidth*.3)),y:Math.max(viewHeight/2,Math.min(vertical-viewHeight/2,origin.y+viewHeight/2+dy*viewHeight*.3))}})}
  return <section aria-label="Доступная сцена"><h3>{map.title}</h3><p className="w6-prose">{map.description}</p>
    <div className="gb-map-tools" aria-label="Масштаб и обзор карты"><button type="button" className="w6-button" aria-label="Уменьшить карту" disabled={zoom===1} onClick={()=>scale(zoom/1.5)}>−</button><span>{Math.round(zoom*100)}%</span><button type="button" className="w6-button" aria-label="Увеличить карту" disabled={zoom===4} onClick={()=>scale(zoom*1.5)}>+</button><button type="button" className="w6-button" onClick={()=>setCamera({sceneId:f.id,zoom:1,center:null})}>Вся сцена</button>{zoom>1&&<>{([[-1,0,'Обзор влево','←'],[0,-1,'Обзор вверх','↑'],[0,1,'Обзор вниз','↓'],[1,0,'Обзор вправо','→']] as const).map(([x,y,label,icon])=><button key={label} type="button" className="w6-button" aria-label={label} onClick={()=>pan(x,y)}>{icon}</button>)}</>}</div>
    <div className={'gb-scene-viewport gb-player-map gb-palette-' + f.palette}><svg viewBox={`${origin.x} ${origin.y} ${viewWidth} ${viewHeight}`} onClick={event => {
      if (!onPoint) return
      const box = event.currentTarget.getBoundingClientRect(), scale = Math.min(box.width / viewWidth, box.height / viewHeight)
      if (!(scale > 0)) return
      const x = origin.x + (event.clientX - box.left - (box.width - viewWidth * scale) / 2) / scale, v = origin.y + (event.clientY - box.top - (box.height - viewHeight * scale) / 2) / scale
      if (x < 0 || x > f.width || v < 0 || v > vertical) return
      const self = map.contacts.find(c => c.kind === 'self'), rounded = (n: number) => Math.round(n * 1000) / 1000
      onPoint({ x: rounded(x), y: side ? self?.y ?? f.depth / 2 : rounded(v), z: side ? rounded(f.maxZ - v) : self?.z ?? f.groundZ })
    }} tabIndex={onPoint ? 0 : undefined} onKeyDown={e => {
      if(e.target!==e.currentTarget||!onPoint||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return
      e.preventDefault();const p=pickedPoint??(self?{x:self.x,y:self.y,z:self.z??f.groundZ}:null);if(!p)return
      const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0
      onPoint({x:Math.max(0,Math.min(f.width,p.x+dx)),y:side?p.y:Math.max(0,Math.min(f.depth,p.y+dy)),z:side?Math.max(f.minZ,Math.min(f.maxZ,p.z-dy)):p.z})
    }} role="group" aria-label={map.title + (side ? ', вид сбоку' : ', вид сверху')}>
      <defs><clipPath id={clip}>{map.areas.map(a => <rect key={a.id} x={a.x} y={side ? f.maxZ - a.z - a.height : a.y} width={a.width} height={side ? a.height : a.depth}/>)}</clipPath><clipPath id={visualClip}>{map.areas.filter(a=>a.visible).map(a=><rect key={a.id} x={a.x} y={side?f.maxZ-a.z-a.height:a.y} width={a.width} height={side?a.height:a.depth}/>)}</clipPath>{tiled&&<pattern id={clip+'-texture'} width={tileSize} height={tileSize} patternUnits="userSpaceOnUse"><image href={artworkSource(f.background)} width={tileSize} height={tileSize} preserveAspectRatio="none"/></pattern>}</defs>
      <rect width={f.width} height={vertical} fill="#10121d"/>
      {map.areas.map(a => <rect key={a.id} x={a.x} y={side ? f.maxZ - a.z - a.height : a.y} width={a.width} height={side ? a.height : a.depth} className={a.visible ? 'gb-ground' : 'gb-known-ground'}/>)}
      {!tiled&&f.background&&<g clipPath={'url(#'+clip+')'}><image href={artworkSource(f.background)} width={f.width} height={vertical} preserveAspectRatio="none"/>{map.areas.filter(a=>!a.visible).map(a=><rect key={a.id} x={a.x} y={side?f.maxZ-a.z-a.height:a.y} width={a.width} height={side?a.height:a.depth} fill="#10121d" opacity=".55"/>)}</g>}
      {tiled&&map.areas.map(a=><rect key={'texture-'+a.id} x={a.x} y={side?f.maxZ-a.z-a.height:a.y} width={a.width} height={side?a.height:a.depth} fill={'url(#'+clip+'-texture)'} opacity={a.visible?1:.45}/>)}
      {route.length>1&&<polyline points={route.map(p=>`${p.x},${yPoint(p)}`).join(' ')} className="gb-game-route" vectorEffect="non-scaling-stroke"/>}
      {pickedPoint&&<g className="gb-game-destination"><circle cx={pickedPoint.x} cy={yPoint(pickedPoint)} r={size*.55} vectorEffect="non-scaling-stroke"/><path d={`M${pickedPoint.x-size} ${yPoint(pickedPoint)}h${size*2}M${pickedPoint.x} ${yPoint(pickedPoint)-size}v${size*2}`} vectorEffect="non-scaling-stroke"/></g>}
      <g clipPath={'url(#' + clip + ')'}>{map.objects.map(o => <g key={o.id} opacity={o.visible ? 1 : .48} className="gb-game-object" role={onObject?'button':undefined} tabIndex={onObject?0:undefined} aria-label={'Объект: '+o.name} onClick={e=>{if(onObject){e.stopPropagation();onObject(o.id)}}} onKeyDown={e=>{if(onObject&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();onObject(o.id)}}}>
        {onObject&&<rect x={o.x-o.width/2} y={side?f.maxZ-o.z-Math.max(o.height,.2):o.y-o.depth/2} width={o.width} height={side?Math.max(o.height,.2):o.depth} className={selectedObject===o.id?'gb-game-object-picked':'gb-game-object-hit'} vectorEffect="non-scaling-stroke"/>}
        {o.artwork && o.artwork !== 'auto' ? <image href={artworkSource(o.artwork)} x={o.x - o.width / 2} y={side ? f.maxZ - o.z - Math.max(o.height, .2) : o.y - o.depth / 2} width={o.width} height={side ? Math.max(o.height, .2) : o.depth} preserveAspectRatio="xMidYMid meet" opacity={o.kind === 'door' && o.open ? .45 : 1}/> : <svg x={o.x - o.width / 2} y={side ? f.maxZ - o.z - Math.max(o.height, .2) : o.y - o.depth / 2} width={o.width} height={side ? Math.max(o.height, .2) : o.depth}><SceneGlyph kind={o.kind} open={o.open}/></svg>}
        <title>{o.name}{o.visible ? '' : ' · последнее известное состояние'}</title>
      </g>)}</g>
      {map.contacts.map(c => <g key={c.id} className="gb-contact" role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={c.label} onKeyDown={e => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(c.id) } }} onClick={e => { e.stopPropagation(); onSelect?.(c.id); if (c.kind === 'sound') onPoint?.({x:c.x,y:c.y,z:c.z??map.contacts.find(t=>t.kind==='self')?.z??f.groundZ}) }}>
        <title>{c.label}{c.z === undefined ? ' · высота не раскрыта' : ' · Z ' + c.z + ' м'}{c.signs ? ' · ' + c.signs : ''}</title>
        {c.kind === 'sound' ? <><circle cx={c.x} cy={yOf(c)} r={c.radius || size} className="gb-sound-mark"/><text x={c.x} y={yOf(c)} fontSize={size} className="gb-token-label">♪</text></> : <>
          <rect x={c.x - size} y={yOf(c) - size} width={size * 2} height={size * 2} vectorEffect="non-scaling-stroke" className={'gb-token-frame' + (c.kind==='self'?' gb-game-self':'') + (selected === c.id ? ' gb-selected' : '')}/>
          {c.kind === 'silhouette' ? <text x={c.x} y={yOf(c) + size * .4} fontSize={size * 1.6} className="gb-token-label">?</text> : <image href={artworkSource(c.portrait, 'portrait-traveler')} x={c.x - size * .85} y={yOf(c) - size * .85} width={size * 1.7} height={size * 1.7} preserveAspectRatio="xMidYMid slice"/>}
        </>}
        <text x={c.x} y={yOf(c) + size * 1.6} fontSize={size * .55} className="gb-token-label">{c.label}</text>
        {c.z !== undefined && <text x={c.x} y={yOf(c) - size * 1.3} fontSize={size * .5} className="gb-height-label">{c.flying ? '↑ ' : ''}Z {Number(c.z.toFixed(2))} м</text>}
      </g>)}
      <g clipPath={'url(#' + visualClip + ')'}><SceneAbilityOverlay frame={f} visuals={map.visuals??[]} replay={playback.replay} paused={playback.paused} enabled={playback.enabled}/></g>
    </svg>{!!map.visuals?.length&&playback.controls}<p className="gb-map-caption">{side ? 'X / Z' : 'X / Y'} · метры{onPoint ? ' · нажми на землю для маршрута; стрелки уточняют отметку, когда карта в фокусе' : ''} · тёмные области неизвестны; приглушённые объекты известны по прежнему наблюдению.</p></div>
    <div className="gb-scene-entities">{map.contacts.map(c => <button className={'w6-button' + (selected === c.id ? ' w6-active' : '')} type="button" key={c.id} onClick={e => { e.stopPropagation(); onSelect?.(c.id); if (c.kind === 'sound') onPoint?.({x:c.x,y:c.y,z:c.z??map.contacts.find(t=>t.kind==='self')?.z??f.groundZ}) }}>{c.label}<small>{c.kind === 'sound' ? 'Приблизительная отметка звука' : c.z === undefined ? 'Высота не раскрыта' : (c.flying ? 'В воздухе · ' : c.support === 'object' ? 'На опоре · ' : c.support === 'ground' ? 'На земле · ' : '') + 'Z ' + c.z + ' м'}{c.signs ? ' · ' + c.signs : ''}</small></button>)}</div>
    {side && map.contacts.some(c => c.z === undefined) && <p className="w6-copy">Отметки без известной высоты показаны условно в середине схемы.</p>}
  </section>
}
