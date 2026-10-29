import type {SceneObjectKind} from './sceneTypes'

// Small original SVG tiles. They remain sharp at any zoom and need no asset service.
export default function SceneGlyph({ kind, open = false }: { kind: SceneObjectKind; open?: boolean }) {
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

