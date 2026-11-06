import { PURE_WATER_CONDUCTIVITY_SM } from './physicsMaterials'
import { physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'
import type { SceneObject } from './sceneTypes'
import { isSliding } from './mechanicalProfiles'

export const MIN_WATER_HEIGHT_M = 0.0001
export const MAX_WATER_ADDITIVE_KG = 1e9
export const MAX_WATER_REAGENT_MOL = 1e9
export const MAX_FLOW_CELLS = 64
export const WATER_EDGE_TOLERANCE_M = 1e-8
export const WATER_MASS_KG_M3 = 1000
export const FREEZE_K = 273.15, BOIL_K = 373.15
export const ICE_HEAT_J_KG_K = 2100, WATER_HEAT_J_KG_K = 4180
export const FUSION_J_KG = 334000, VAPORIZATION_J_KG = 2257000
export const BOILING_ENTHALPY_J_KG = FUSION_J_KG + WATER_HEAT_J_KG_K * (BOIL_K - FREEZE_K)
export const MIN_WATER_ENTHALPY_J_KG = -FREEZE_K * ICE_HEAT_J_KG_K
// After neutralization, positive moles are excess HCl and negative moles are excess NaOH.
// Stored height is liquid-equivalent condensed volume; steam is stored in the room.
export type WaterComposition = {
  version: 1; base: 'pure' | 'unknown'; saltKg: number; sedimentKg: number
  reagentMol?: number; flow?: boolean; enthalpyJKg?: number | null
}
type Dimensions = Pick<SceneObject, 'width' | 'depth' | 'height'>

export const waterReagents = {
  acid: {label:'Соляная кислота (HCl)', molarMassKg:.036461},
  alkali: {label:'Щёлочь (NaOH)', molarMassKg:.0399971},
} as const
export type WaterReagent = keyof typeof waterReagents
export const isWaterReagent = (value: unknown): value is WaterReagent => value === 'acid' || value === 'alkali'
const WATER_KG_MOL = .0180153
// Use consistent rounding for the products so the reaction conserves mass.
const SALT_KG_MOL = waterReagents.acid.molarMassKg + waterReagents.alkali.molarMassKg - WATER_KG_MOL

export function reactWaterReagents(acidMol: number, alkaliMol: number) {
  const neutralizedMol = Math.min(acidMol, alkaliMol)
  return {
    reagentMol:acidMol - alkaliMol, neutralizedMol,
    saltKg:neutralizedMol * SALT_KG_MOL, waterKg:neutralizedMol * WATER_KG_MOL,
  }
}

export const pureWater = (): WaterComposition => ({ version: 1, base: 'pure', saltKg: 0, sedimentKg: 0 })

export function isWaterComposition(value: unknown): value is WaterComposition {
  if (!physicsRecord(value)) return false
  const keys = ['version', 'base', 'saltKg', 'sedimentKg']
  if (Object.hasOwn(value, 'flow')) {
    if (typeof value.flow !== 'boolean') return false
    keys.push('flow')
  }
  if (Object.hasOwn(value, 'reagentMol')) {
    if (!physicsNumber(value.reagentMol, -MAX_WATER_REAGENT_MOL, MAX_WATER_REAGENT_MOL)) return false
    keys.push('reagentMol')
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
export const isVariableWater = (water: WaterComposition | null | undefined) =>
  !!water && (!!water.flow || water.enthalpyJKg != null || water.reagentMol !== undefined)
export const validWaterHeight = (water: WaterComposition, height: number) =>
  water.enthalpyJKg != null ? height > 0 || height === 0 && water.enthalpyJKg === 0 :
    water.flow ? height > 0 || height === 0 && water.saltKg === 0 && water.sedimentKg === 0 && !water.reagentMol : height >= MIN_WATER_HEIGHT_M
export const supportsSceneTokens = (object: Pick<SceneObject, 'canSupport' | 'water' | 'height' | 'physics'>) =>
  object.canSupport && !isSliding(object.physics?.sliding) && (!isVariableWater(object.water) || object.height >= MIN_WATER_HEIGHT_M)

// Concentration in kg/m³ (numerically g/L). The dilute slope uses the NaCl
// limiting molar conductivity at 25 °C (NBS J. Res. 69A, 39, table 6).
// Higher points use the room-temperature increments in OUP table 9325285.
const conductivitySamples = [[0, 0], [.05844, .012645], [10, 1.398], [50, 5.698]] as const

function diluteReagentMolM3(water: WaterComposition, liquidM3: number) {
  if (liquidM3 <= 0 || water.base === 'unknown') return null
  const reagentMol = water.reagentMol ?? 0
  // 0.01 mol/L total of the model's 1:1 electrolytes.
  if ((Math.abs(reagentMol) + water.saltKg / SALT_KG_MOL) / liquidM3 > 10) return null
  return reagentMol / liquidM3
}

// 25 °C reference, using concentration as an approximation to activity.
export function waterPH(water: WaterComposition, size: Dimensions): number | null {
  const molM3 = diluteReagentMolM3(water, size.width * size.depth * liquidWaterHeight(water, size.height))
  if (molM3 === null) return null
  const excessMolL = Math.abs(molM3) / 1000
  const majorityIonMolL = (excessMolL + Math.hypot(excessMolL, 2e-7)) / 2
  const ionLog = -Math.log10(majorityIonMolL)
  return molM3 < 0 ? 14 - ionLog : ionLog
}

export function waterConductivitySM(water: WaterComposition, size: Dimensions): number | null {
  const volume = size.width * size.depth * liquidWaterHeight(water, size.height)
  if (size.height <= 0) return null
  if (volume <= 0) return 0
  if (water.base === 'unknown') return null
  const reagentMolM3 = water.reagentMol ? diluteReagentMolM3(water, volume) : 0
  if (reagentMolM3 === null) return null
  // Dilute HCl and NaOH at 25 °C, from NBS NSRDS 33 and Snyder et al., table 1.
  const reagentSM = reagentMolM3 >= 0 ? .042606 * reagentMolM3 : -.02481 * reagentMolM3
  const concentration = water.saltKg / volume
  for (let i = 1; i < conductivitySamples.length; i++) {
    const [end, high] = conductivitySamples[i]
    if (concentration > end) continue
    const [start, low] = conductivitySamples[i - 1]
    return PURE_WATER_CONDUCTIVITY_SM + low + (high - low) * (concentration - start) / (end - start) + reagentSM
  }
  return null
}
