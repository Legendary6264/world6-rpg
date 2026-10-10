import { useId } from 'react'
import type { PerceivedMap, VisibleContact } from './scenePerception'
import { SceneGlyph } from './SceneViewport'
import { artworkSource } from './visualMedia'
import './sceneStyle.css'
export default function PerceivedScene({ map, selected, onSelect }: { map: PerceivedMap; selected?: string; onSelect?: (id: string) => void }) {
  const clip = useId().replace(/:/g, ''), f = map.frame, side = f.view === 'side', vertical = side ? f.maxZ - f.minZ : f.depth
  const size = Math.max(f.width, vertical) * .022
  const yOf = (c: VisibleContact) => side ? c.z === undefined ? vertical / 2 : f.maxZ - c.z : c.y
  return <section aria-label="Доступная сцена"><h3>{map.title}</h3><p className="w6-prose">{map.description}</p>
    <div className={'gb-scene-viewport gb-player-map gb-palette-' + f.palette}><svg viewBox={`0 0 ${f.width} ${vertical}`} role="group" aria-label={map.title + (side ? ', вид сбоку' : ', вид сверху')}>
      <defs><clipPath id={clip}>{map.areas.map(a => <rect key={a.id} x={a.x} y={side ? f.maxZ - a.z - a.height : a.y} width={a.width} height={side ? a.height : a.depth}/>)}</clipPath></defs>
      <rect width={f.width} height={vertical} fill="#10121d"/>
      {map.areas.map(a => <rect key={a.id} x={a.x} y={side ? f.maxZ - a.z - a.height : a.y} width={a.width} height={side ? a.height : a.depth} className={a.visible ? 'gb-ground' : 'gb-known-ground'}/>)}
      <g clipPath={'url(#' + clip + ')'}>{map.objects.map(o => <g key={o.id} opacity={o.visible ? 1 : .48}>
        <svg x={o.x - o.width / 2} y={side ? f.maxZ - o.z - Math.max(o.height, .2) : o.y - o.depth / 2} width={o.width} height={side ? Math.max(o.height, .2) : o.depth}><SceneGlyph kind={o.kind} open={o.open}/></svg>
        <title>{o.name}{o.visible ? '' : ' · последнее известное состояние'}</title>
      </g>)}</g>
      {map.contacts.map(c => <g key={c.id} className="gb-contact" role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={c.label} onKeyDown={e => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(c.id) } }} onClick={() => onSelect?.(c.id)}>
        <title>{c.label}{c.z === undefined ? ' · высота не раскрыта' : ' · Z ' + c.z + ' м'}{c.signs ? ' · ' + c.signs : ''}</title>
        {c.kind === 'sound' ? <><circle cx={c.x} cy={yOf(c)} r={c.radius || size} className="gb-sound-mark"/><text x={c.x} y={yOf(c)} fontSize={size} className="gb-token-label">♪</text></> : <>
          <rect x={c.x - size} y={yOf(c) - size} width={size * 2} height={size * 2} className={'gb-token-frame' + (selected === c.id ? ' gb-selected' : '')}/>
          {c.kind === 'silhouette' ? <text x={c.x} y={yOf(c) + size * .4} fontSize={size * 1.6} className="gb-token-label">?</text> : <image href={artworkSource(c.portrait, 'portrait-traveler')} x={c.x - size * .85} y={yOf(c) - size * .85} width={size * 1.7} height={size * 1.7} preserveAspectRatio="xMidYMid slice"/>}
        </>}
        <text x={c.x} y={yOf(c) + size * 1.6} fontSize={size * .55} className="gb-token-label">{c.label}</text>
        {c.z !== undefined && <text x={c.x} y={yOf(c) - size * 1.3} fontSize={size * .5} className="gb-height-label">{c.flying ? '↑ ' : ''}Z {Number(c.z.toFixed(2))} м</text>}
      </g>)}
    </svg><p className="gb-map-caption">{side ? 'X / Z' : 'X / Y'} · метры · тёмные области неизвестны; приглушённые объекты известны по прежнему наблюдению.</p></div>
    <div className="gb-scene-entities">{map.contacts.map(c => <button className={'w6-button' + (selected === c.id ? ' w6-active' : '')} type="button" key={c.id} onClick={() => onSelect?.(c.id)}>{c.label}<small>{c.kind === 'sound' ? 'Приблизительная отметка звука' : c.z === undefined ? 'Высота не раскрыта' : (c.flying ? 'В воздухе · ' : c.support === 'object' ? 'На опоре · ' : c.support === 'ground' ? 'На земле · ' : '') + 'Z ' + c.z + ' м'}{c.signs ? ' · ' + c.signs : ''}</small></button>)}</div>
    {side && map.contacts.some(c => c.z === undefined) && <p className="w6-copy">Отметки без известной высоты показаны условно в середине схемы.</p>}
  </section>
}
