import { PURE_WATER_CONDUCTIVITY_SM } from './physicsMaterials'
import { physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'
import type { SceneObject } from './sceneTypes'
import { isSliding } from './mechanicalProfiles'

export const MIN_WATER_HEIGHT_M = 0.0001
export const MAX_WATER_ADDITIVE_KG = 1e9
export const MAX_FLOW_CELLS = 64
export const WATER_EDGE_TOLERANCE_M = 1e-8
export const WATER_MASS_KG_M3 = 1000
export const FREEZE_K = 273.15, BOIL_K = 373.15
export const ICE_HEAT_J_KG_K = 2100, WATER_HEAT_J_KG_K = 4180
export const FUSION_J_KG = 334000, VAPORIZATION_J_KG = 2257000
export const BOILING_ENTHALPY_J_KG = FUSION_J_KG + WATER_HEAT_J_KG_K * (BOIL_K - FREEZE_K)
export const MIN_WATER_ENTHALPY_J_KG = -FREEZE_K * ICE_HEAT_J_KG_K
// Stored height is liquid-equivalent condensed volume; steam is stored in the room.
export type WaterComposition = { version: 1; base: 'pure' | 'unknown'; saltKg: number; sedimentKg: number; flow?: boolean; enthalpyJKg?: number | null }
type Dimensions = Pick<SceneObject, 'width' | 'depth' | 'height'>

export const pureWater = (): WaterComposition => ({ version: 1, base: 'pure', saltKg: 0, sedimentKg: 0 })

export function isWaterComposition(value: unknown): value is WaterComposition {
  if (!physicsRecord(value)) return false
  const keys = ['version', 'base', 'saltKg', 'sedimentKg']
  if (Object.hasOwn(value, 'flow')) {
    if (typeof value.flow !== 'boolean') return false
    keys.push('flow')
  }
  if (Object.hasOwn(value, 'enthalpyJKg')) {
    if (value.enthalpyJKg !== null && !physicsNumber(value.enthalpyJKg, MIN_WATER_ENTHALPY_J_KG, BOILING_ENTHALPY_J_KG)) return false
    keys.push('enthalpyJKg')
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
export const liquidEnthalpy = (temperatureK: number) => FUSION_J_KG + WATER_HEAT_J_KG_K *
  (Math.max(FREEZE_K, Math.min(BOIL_K, temperatureK)) - FREEZE_K)
export const waterEnthalpy = (water: WaterComposition, ambientK = 293.15) => water.enthalpyJKg ?? liquidEnthalpy(ambientK)
export function waterPhase(enthalpyJKg: number) {
  if (enthalpyJKg < 0) return { temperatureK: FREEZE_K + enthalpyJKg / ICE_HEAT_J_KG_K, iceFraction: 1 }
  if (enthalpyJKg < FUSION_J_KG) return { temperatureK: FREEZE_K, iceFraction: 1 - enthalpyJKg / FUSION_J_KG }
  return { temperatureK: FREEZE_K + (enthalpyJKg - FUSION_J_KG) / WATER_HEAT_J_KG_K, iceFraction: 0 }
}
export const liquidWaterHeight = (water: WaterComposition, height: number) =>
  height * (1 - waterPhase(waterEnthalpy(water)).iceFraction)
export function waterIceCover(object: Pick<SceneObject, 'water' | 'height'>): 'ice' | 'slush' | undefined {
  if (object.water?.enthalpyJKg == null || object.height <= 0) return undefined
  const fraction = waterPhase(object.water.enthalpyJKg).iceFraction
  return fraction === 1 ? 'ice' : fraction > 0 ? 'slush' : undefined
}
export const isVariableWater = (water: WaterComposition | null | undefined) => !!water && (!!water.flow || water.enthalpyJKg != null)
export const validWaterHeight = (water: WaterComposition, height: number) =>
  water.enthalpyJKg != null ? height > 0 || height === 0 && water.enthalpyJKg === 0 :
    water.flow ? height > 0 || height === 0 && water.saltKg === 0 && water.sedimentKg === 0 : height >= MIN_WATER_HEIGHT_M
export const supportsSceneTokens = (object: Pick<SceneObject, 'canSupport' | 'water' | 'height' | 'physics'>) =>
  object.canSupport && !isSliding(object.physics?.sliding) && (!isVariableWater(object.water) || object.height >= MIN_WATER_HEIGHT_M)

// Concentration in kg/m³ (numerically g/L). The dilute slope uses the NaCl
// limiting molar conductivity at 25 °C (NBS J. Res. 69A, 39, table 6).
// Higher points use the room-temperature increments in OUP table 9325285.
const conductivitySamples = [[0, 0], [.05844, .012645], [10, 1.398], [50, 5.698]] as const

export function waterConductivitySM(water: WaterComposition, size: Dimensions): number | null {
  const volume = size.width * size.depth * liquidWaterHeight(water, size.height)
  if (size.height <= 0) return null
  if (volume <= 0) return 0
  if (water.base === 'unknown') return null
  const concentration = water.saltKg / volume
  for (let i = 1; i < conductivitySamples.length; i++) {
    const [end, high] = conductivitySamples[i]
    if (concentration > end) continue
    const [start, low] = conductivitySamples[i - 1]
    return PURE_WATER_CONDUCTIVITY_SM + low + (high - low) * (concentration - start) / (end - start)
  }
  return null
}
