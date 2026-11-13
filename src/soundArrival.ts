import { arcHeight } from './sceneGeometry'
import type { MovementPiece } from './sceneMovement'
import type { ScenePosition } from './sceneTypes'

export const WAVE_EPS_M = 1e-6
const mix = (a:number,b:number,u:number) => a+(b-a)*u
function pointAt(piece:MovementPiece,u:number):ScenePosition {
  return {x:mix(piece.a.x,piece.b.x,u),y:mix(piece.a.y,piece.b.y,u),z:arcHeight(piece.a.z,piece.b.z,piece.arcM ?? 0,u)}
}
export function soundTrackPoint(pieces:MovementPiece[],fraction:number):ScenePosition {
  const piece = pieces.find(p=>p.end>=fraction) ?? pieces.at(-1)!
  return pointAt(piece,Math.max(0,Math.min(1,(fraction-piece.start)/(piece.end-piece.start))))
}
const distance = (a:ScenePosition,b:ScenePosition) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)

// On one straight leg, squared distance minus squared wave radius is quadratic.
// Its first crossing is bounded by the minimum on the valid time interval,
// even when the listener temporarily outruns the wave.
function intercept(a:ScenePosition,b:ScenePosition,origin:ScenePosition,radius:number,growth:number):number|undefined {
  const begin = Math.max(0,-radius/growth)
  if (begin>1) return undefined
  const x=a.x-origin.x, y=a.y-origin.y, z=a.z-origin.z
  const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z
  if (!dx && !dy && !dz) {
    const time = (Math.hypot(x,y,z)-radius)/growth
    return time<=1 ? Math.max(begin,time) : undefined
  }
  const gap = (u:number) => Math.hypot(x+dx*u,y+dy*u,z+dz*u)-(radius+growth*u)
  if (gap(begin)<=WAVE_EPS_M) return begin
  const a2=dx**2+dy**2+dz**2-growth**2
  const b2=x*dx+y*dy+z*dz-radius*growth
  let right = a2>0 ? Math.max(begin,Math.min(1,-b2/a2)) : 1
  if (gap(right)>WAVE_EPS_M) return undefined
  let left = begin
  for (let i=0;i<40;i++) {
    const middle=(left+right)/2
    if (gap(middle)>0) left=middle
    else right=middle
  }
  return right
}

export function waveCrossing(pieces:MovementPiece[],origin:ScenePosition,prefixM:number,speedMs:number,emittedMs:number,
    fromMs:number,toMs:number,check:()=>void):number|'passed'|undefined {
  const span=toMs-fromMs, metresPerMs=speedMs/1000
  const radius=(fromMs-emittedMs)*metresPerMs-prefixM
  const initialDistance=distance(pieces[0].a,origin)
  if (radius>initialDistance+WAVE_EPS_M) return 'passed'
  if (span===0 && fromMs>=emittedMs-1e-6 && Math.abs(radius-initialDistance)<=WAVE_EPS_M) return fromMs
  if (!(span>0) || !(metresPerMs>0)) return undefined
  for (const piece of pieces) {
    // Jump and fall chords have at most centimetre sag in ordinary scenes.
    const chords = Math.max(1,Math.min(64,Math.ceil(Math.sqrt(Math.abs(piece.arcM ?? 0)/.04))))
    const legMs = span*(piece.end-piece.start)/chords
    if (!(legMs*metresPerMs>0)) continue
    let a=piece.a
    for (let i=0;i<chords;i++) {
      check()
      const b=i+1===chords ? piece.b : pointAt(piece,(i+1)/chords)
      const at=fromMs+span*piece.start+i*legMs
      const crossed=intercept(a,b,origin,(at-emittedMs)*metresPerMs-prefixM,legMs*metresPerMs)
      if (crossed!==undefined) return Math.max(fromMs,Math.min(toMs,at+crossed*legMs))
      a=b
    }
  }
}
