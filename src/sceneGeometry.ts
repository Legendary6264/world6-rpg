export function segmentSlab(start: number, end: number, low: number, high: number): [number, number] | null {
  const change = end - start
  if (!change) return start >= low && start <= high ? [0, 1] : null
  const a = (low - start) / change, b = (high - start) / change
  const left = Math.max(0, Math.min(a, b)), right = Math.min(1, Math.max(a, b))
  return left <= right ? [left, right] : null
}
