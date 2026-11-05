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
