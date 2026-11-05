import { PURE_WATER_CONDUCTIVITY_SM } from './physicsMaterials'
import { physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'
import type { SceneObject } from './sceneTypes'

export const MIN_WATER_HEIGHT_M = 0.0001
export const MAX_WATER_ADDITIVE_KG = 1e9
export const MAX_FLOW_CELLS = 64
export const WATER_EDGE_TOLERANCE_M = 1e-8
export type WaterComposition = { version: 1; base: 'pure' | 'unknown'; saltKg: number; sedimentKg: number; flow?: boolean }
type Dimensions = Pick<SceneObject, 'width' | 'depth' | 'height'>

export const pureWater = (): WaterComposition => ({ version: 1, base: 'pure', saltKg: 0, sedimentKg: 0 })

export function isWaterComposition(value: unknown): value is WaterComposition {
  if (!physicsRecord(value)) return false
  const keys = ['version', 'base', 'saltKg', 'sedimentKg']
  if (Object.hasOwn(value, 'flow')) {
    if (typeof value.flow !== 'boolean') return false
    keys.push('flow')
  }
  return physicsKeys(value, keys) && value.version === 1 &&
    (value.base === 'pure' || value.base === 'unknown') && physicsNumber(value.saltKg, 0, MAX_WATER_ADDITIVE_KG) &&
    physicsNumber(value.sedimentKg, 0, MAX_WATER_ADDITIVE_KG)
}

export function copyWaterComposition(value: WaterComposition | null): WaterComposition | null {
  if (value === null) return null
  if (!isWaterComposition(value)) throw Error('Проверь состав воды и массы примесей.')
  return { ...value }
}

export const waterVolumeM3 = (size: Dimensions) => size.width * size.depth * size.height
export const supportsSceneTokens = (object: Pick<SceneObject, 'canSupport' | 'water' | 'height'>) =>
  object.canSupport && (!object.water?.flow || object.height >= MIN_WATER_HEIGHT_M)

// Concentration in kg/m³ (numerically g/L). The dilute slope uses the NaCl
// limiting molar conductivity at 25 °C (NBS J. Res. 69A, 39, table 6).
// Higher points use the room-temperature increments in OUP table 9325285.
const conductivitySamples = [[0, 0], [.05844, .012645], [10, 1.398], [50, 5.698]] as const

export function waterConductivitySM(water: WaterComposition, size: Dimensions): number | null {
  const volume = waterVolumeM3(size)
  if (water.base === 'unknown' || volume <= 0) return null
  const concentration = water.saltKg / volume
  for (let i = 1; i < conductivitySamples.length; i++) {
    const [end, high] = conductivitySamples[i]
    if (concentration > end) continue
    const [start, low] = conductivitySamples[i - 1]
    return PURE_WATER_CONDUCTIVITY_SM + low + (high - low) * (concentration - start) / (end - start)
  }
  return null
}
