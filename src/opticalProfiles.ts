import { physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'

export const DEFAULT_LIGHT_CD = 40
export const MAX_LIGHT_CD = 1e9
export const MAX_ILLUMINANCE_LUX = 1e9
export const MIN_SIGHT_LUX = .000001

export type VisionProfile = { ambientLux: number; detectionLux: number }
export type LightLevel = 'off' | 'faint' | 'normal' | 'bright'

export function isVisionProfile(value: unknown): value is VisionProfile {
  return physicsRecord(value) && physicsKeys(value, ['ambientLux', 'detectionLux']) &&
    physicsNumber(value.ambientLux, 0, MAX_ILLUMINANCE_LUX) &&
    physicsNumber(value.detectionLux, MIN_SIGHT_LUX, MAX_ILLUMINANCE_LUX)
}

export const isLightIntensity = (value: unknown): value is number => physicsNumber(value, 0, MAX_LIGHT_CD)

export function lightLevel(intensityCd: number): LightLevel {
  if (!intensityCd) return 'off'
  if (intensityCd < DEFAULT_LIGHT_CD / 2) return 'faint'
  return intensityCd >= DEFAULT_LIGHT_CD * 2 ? 'bright' : 'normal'
}
