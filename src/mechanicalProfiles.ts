import { physicsId, physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'

export const MAX_STRUCTURAL_ENERGY_J = 1e12
export type StructureProfile = { failureJ: number; absorbedJ: number }
export type LandingProfile = { massKg: number; region: string; contactCm2: number }
export type FallMotion = { sourceId: string; fromZ: number; speedMs: number }

export function isStructureProfile(value: unknown): value is StructureProfile {
  return physicsRecord(value) && physicsKeys(value, ['failureJ', 'absorbedJ']) &&
    physicsNumber(value.failureJ, .001, MAX_STRUCTURAL_ENERGY_J) &&
    physicsNumber(value.absorbedJ, 0, value.failureJ) && value.absorbedJ < value.failureJ
}

export function isLandingProfile(value: unknown): value is LandingProfile {
  return physicsRecord(value) && physicsKeys(value, ['massKg', 'region', 'contactCm2']) &&
    physicsNumber(value.massKg, .001, 1e5) && physicsId(value.region) &&
    physicsNumber(value.contactCm2, .01, 1e6)
}

export function isFallMotion(value: unknown): value is FallMotion {
  return physicsRecord(value) && physicsKeys(value, ['sourceId', 'fromZ', 'speedMs']) &&
    physicsId(value.sourceId) && physicsNumber(value.fromZ, -1e6, 1e6) &&
    physicsNumber(value.speedMs, 0, 1e8)
}
