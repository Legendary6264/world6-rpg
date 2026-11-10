import type { SceneObject, ScenePosition } from './sceneTypes'

export type ObjectBounds = { min: ScenePosition; max: ScenePosition; center: ScenePosition }
export const overlapLength = (aMin: number, aMax: number, bMin: number, bMax: number) =>
  Math.min(aMax, bMax) - Math.max(aMin, bMin)

export function objectBounds(object: SceneObject): ObjectBounds {
  const { x, y, z, width, depth, height } = object
  return {
    min: { x: x - width / 2, y: y - depth / 2, z },
    max: { x: x + width / 2, y: y + depth / 2, z: z + height },
    center: { x, y, z: z + height / 2 },
  }
}

export function segmentSlab(start: number, end: number, low: number, high: number): [number, number] | null {
  const change = end - start
  if (!change) return start >= low && start <= high ? [0, 1] : null
  const a = (low - start) / change, b = (high - start) / change
  const left = Math.max(0, Math.min(a, b)), right = Math.min(1, Math.max(a, b))
  return left <= right ? [left, right] : null
}

export function arcHeight(start:number,end:number,arc:number,t:number):number {
  return start+(end-start)*t+arc*t*(1-t)
}

// An arc can enter the same height band on both sides of its apex.
export function arcSlabs(start:number,end:number,arc:number,low:number,high:number):[number,number][] {
  if (!arc) {
    const range = segmentSlab(start,end,low,high)
    return range ? [range] : []
  }
  const b = end-start+arc
  const roots = (level:number) => {
    const c = start-level, discriminant = b*b+4*arc*c
    if (discriminant < 0) return []
    const delta = Math.sqrt(discriminant)
    const q = -.5*(b+(b < 0 ? -delta : delta))
    return q ? [q/(-arc),c/q] : [0]
  }
  const cuts = [0,...[...roots(low),...roots(high)].filter(t=>t>0&&t<1).sort((a,b)=>a-b),1]
  return cuts.slice(1).flatMap((right,i)=>{
    const left = cuts[i], height = arcHeight(start,end,arc,(left+right)/2)
    return right > left && height >= low && height <= high ? [[left,right] as [number,number]] : []
  })
}
