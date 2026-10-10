import type { PointerEvent } from 'react'
import type { Actor } from './rpgEngine'
import type { Scene, SceneObjectKind, ScenePosition } from './sceneTypes'
import { artworkSource } from './visualMedia'

type Selection = { kind: 'object'; id: string } | { kind: 'token'; id: string } | null
export type SceneSelection = Selection
type Props = { scene: Scene; actors: Actor[]; selection: Selection;
  onPoint: (point: ScenePosition) => void; onSelect: (value: Selection) => void; selecting: boolean }

// Small original SVG tiles. They remain sharp at any zoom and need no asset service.
export function SceneGlyph({ kind, open = false }: { kind: SceneObjectKind; open?: boolean }) {
  const tiles = {
    wall: <><rect width="16" height="16" fill="#555567"/><path d="M0 4H16M0 10H16M5 0V4M11 4V10M5 10V16" stroke="#9693aa" strokeWidth="1"/><path d="M0 15H16" stroke="#262736"/></>,
    door: <><rect x="1" width="14" height="16" fill="#3e384e"/><rect x="3" y="1" width={open ? 3 : 10} height="14" fill="#a88458"/><rect x="10" y="8" width="2" height="2" fill="#f7d676"/></>,
    tree: <><rect x="6" y="10" width="4" height="6" fill="#765848"/><path d="M5 0H11V2H14V5H16V10H13V13H3V10H0V5H2V2H5Z" fill="#376c5d"/><path d="M5 2H10V4H13V6H5Z" fill="#68a078"/><rect x="3" y="8" width="8" height="3" fill="#28534d"/></>,
    rock: <><path d="M4 1H11L15 6V13L12 16H2L0 12V6Z" fill="#777e95"/><path d="M4 2H10L12 5L5 7L2 5Z" fill="#b7bed0"/><path d="M8 9L14 7V12L11 15H4Z" fill="#515873"/></>,
    crate: <><rect x="1" y="1" width="14" height="14" fill="#8d694f"/><path d="M2 3H14M2 8H14M2 13H14M3 2L13 14M13 2L3 14" stroke="#c69c6c" strokeWidth="2"/><rect x="1" y="1" width="14" height="14" fill="none" stroke="#4e3940"/></>,
    platform: <><rect y="2" width="16" height="11" fill="#73748b"/><rect y="2" width="16" height="3" fill="#b4adc8"/><rect y="13" width="16" height="3" fill="#3c4056"/><path d="M3 6V11M8 6V11M13 6V11" stroke="#9698b3"/></>,
    lamp: <><rect x="7" y="5" width="2" height="11" fill="#9299b2"/><rect x="3" y="2" width="10" height="5" fill="#674176"/><rect x="5" y="3" width="6" height="3" fill="#98f0ea"/><rect x="5" y="14" width="6" height="2" fill="#414860"/></>,
    water: <><rect width="16" height="16" fill="#244e73"/><path d="M1 3H6M9 6H15M2 11H9M11 14H16" stroke="#54a5bc" strokeWidth="1"/></>,
  }
  return <svg viewBox="0 0 16 16" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" shapeRendering="crispEdges">{tiles[kind]}</svg>
}

export default function SceneViewport({ scene, actors, selection, onPoint, onSelect, selecting }: Props) {
  const vertical = scene.view === 'side' ? scene.maxZ - scene.minZ : scene.depth
  const displaySize = Math.max(scene.width, vertical) * 0.022
  const groundY = scene.maxZ - scene.groundZ
  function point(event: PointerEvent<SVGSVGElement>) {
    const svg = event.currentTarget, matrix = svg.getScreenCTM()
    if (!matrix) return
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY
    const mapped = p.matrixTransform(matrix.inverse())
    if (mapped.x < 0 || mapped.x > scene.width || mapped.y < 0 || mapped.y > vertical) return
    const entity = (event.target as Element).closest?.('[data-scene-entity]')
    if (selecting && entity) {
      onSelect({ kind: entity.getAttribute('data-scene-entity') as 'object' | 'token', id: entity.getAttribute('data-scene-id')! })
      return
    }
    onPoint({ x: mapped.x, y: scene.view === 'top' ? mapped.y : scene.depth / 2,
      z: scene.view === 'side' ? scene.maxZ - mapped.y : scene.groundZ })
  }
  return <div className={'gb-scene-viewport gb-palette-' + scene.palette}>
    <svg viewBox={`0 0 ${scene.width} ${vertical}`} role="group" aria-label={'Сцена «' + scene.name + '», ' + (scene.view === 'top' ? 'вид сверху' : 'вид сбоку')}
      onPointerDown={point} className={selecting ? '' : 'gb-place-mode'}>
      <title>{scene.name}</title>
      <defs><pattern id={'ground-' + scene.id} width="3.7" height="2.9" patternUnits="userSpaceOnUse">
        <rect width="3.7" height="2.9" className="gb-ground"/><path d="M.4 .7H.8M2.7 1.8H3.1M1.2 2.4H1.5" className="gb-ground-marks" strokeWidth=".05"/>
      </pattern></defs>
      <rect width={scene.width} height={vertical} fill={'url(#ground-' + scene.id + ')'} />
      {scene.background && scene.background !== 'auto' && <image href={artworkSource(scene.background, 'banner')} width={scene.width} height={vertical} preserveAspectRatio="none" opacity=".85"/>}
      {scene.view === 'side' && <><rect y={groundY} width={scene.width} height={scene.groundZ - scene.minZ} className="gb-underground"/><line x1="0" x2={scene.width} y1={groundY} y2={groundY} className="gb-ground-line"/></>}
      {scene.objects.slice().sort((a, b) => a.z - b.z).map(o => {
        const y = scene.view === 'top' ? o.y - o.depth / 2 : scene.maxZ - o.z - Math.max(o.height, .2)
        const height = scene.view === 'top' ? o.depth : Math.max(o.height, .2)
        return <g key={o.id} data-scene-entity="object" data-scene-id={o.id}>
          <title>{o.name} · Z {o.z} м</title>
          <svg x={o.x - o.width / 2} y={y} width={o.width} height={height} overflow="visible"><SceneGlyph kind={o.kind} open={o.open}/></svg>
          <rect x={o.x - o.width / 2} y={y} width={o.width} height={height} className={selection?.kind === 'object' && selection.id === o.id ? 'gb-object-selected' : 'gb-object-hit'} vectorEffect="non-scaling-stroke"/>
        </g>
      })}
      {scene.tokens.map(t => {
        const actor = actors.find(a => a.id === t.actorId), y = scene.view === 'top' ? t.y : scene.maxZ - t.z - displaySize
        const flying = t.support.kind === 'air', selected = selection?.kind === 'token' && selection.id === t.actorId
        return <g key={t.actorId} data-scene-entity="token" data-scene-id={t.actorId}>
          <title>{actor?.name || 'Без имени'} · X {t.x.toFixed(2)}, Y {t.y.toFixed(2)}, Z {t.z.toFixed(2)} м · {flying ? 'В воздухе' : 'На опоре'}</title>
          {scene.view === 'top' && <circle cx={t.x} cy={t.y} r={t.diameter / 2} className="gb-body-footprint" vectorEffect="non-scaling-stroke"/>}
          {flying && <><ellipse cx={t.x} cy={scene.view === 'top' ? t.y + displaySize : groundY} rx={displaySize * .8} ry={displaySize * .24} className="gb-token-shadow"/>{scene.view === 'side' && <line x1={t.x} x2={t.x} y1={y + displaySize} y2={groundY} className="gb-altitude-line" vectorEffect="non-scaling-stroke"/>}</>}
          <rect x={t.x - displaySize} y={y - displaySize} width={displaySize * 2} height={displaySize * 2} className={selected ? 'gb-token-frame gb-selected' : 'gb-token-frame'} vectorEffect="non-scaling-stroke"/>
          <image href={artworkSource(actor?.profile.portrait, 'portrait-traveler')} x={t.x - displaySize * .86} y={y - displaySize * .86} width={displaySize * 1.72} height={displaySize * 1.72} preserveAspectRatio="xMidYMid slice" pointerEvents="none"/>
          <text x={t.x} y={y + displaySize * 1.55} fontSize={displaySize * .58} className="gb-token-label">{actor?.name || 'Без имени'}</text>
          <text x={t.x} y={y - displaySize * 1.25} fontSize={displaySize * .52} className="gb-height-label">{flying ? '↑ ' : ''}Z {Number(t.z.toFixed(2))} м</text>
        </g>
      })}
    </svg>
    <p className="gb-map-caption">{scene.view === 'top' ? 'X / Y' : 'X / Z'} · метры · {scene.width} × {scene.view === 'top' ? scene.depth : vertical} · высота земли {scene.groundZ} м</p>
  </div>
}
