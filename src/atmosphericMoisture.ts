import type { AirRegion } from './sceneAir'
import { BOIL_K, FREEZE_K, VAPORIZATION_J_KG, WATER_HEAT_J_KG_K, WATER_MASS_KG_M3 } from './waterPhysics'
import { airHeatCapacity, checkedTemperature, STEAM_HEAT_J_KG_K } from './waterHeating'

const CRITICAL_K = 647.096
const VAPOUR_GAS_CONSTANT = 461.5
const DROPLET_RADIUS_M = 10e-6
// Extinction efficiency of approximately two for drops large relative to visible light.
const FOG_EXTINCTION_M2_KG = 3 * 2 / (4 * WATER_MASS_KG_M3 * DROPLET_RADIUS_M)

export function saturatedVapourDensityKgM3(temperatureK: number) {
  if (temperatureK >= CRITICAL_K) return Infinity
  if (temperatureK < 273.16) {
    // WMO 8, Annex 4.B, over liquid water. Extend the cold tail towards
    // negligible vapour and use supercooled droplets in this scene model.
    const celsius = temperatureK - FREEZE_K
    const denominator = 243.12 + celsius
    return denominator > 0 ? 611.2 * Math.exp(17.62 * celsius / denominator) / (VAPOUR_GAS_CONSTANT * temperatureK) : 0
  }
  // Saturation density, Wagner and Pruss (2002), equation 2.7.
  const reduced = 1 - temperatureK / CRITICAL_K
  return 322 * Math.exp(-2.03150240 * reduced ** (1 / 3) - 2.68302940 * reduced ** (2 / 3) -
    5.38626492 * reduced ** (4 / 3) - 17.2991605 * reduced ** 3 -
    44.7586581 * reduced ** (37 / 6) - 63.9201063 * reduced ** (71 / 6))
}

export function fogExtinctionPerM({air,volumeM3}: AirRegion) {
  return FOG_EXTINCTION_M2_KG * (air.fogKg ?? 0) / volumeM3
}

export function settleAtmosphericMoisture({air:room,climate:environment,volumeM3}: AirRegion) {
  if (room.fogKg == null) return
  const initialVapour = room.steamKg, totalWater = initialVapour + room.fogKg
  if (!totalWater) return
  const initialK = environment.ambientTemperatureK
  const saturationAt = (temperatureK: number) => saturatedVapourDensityKgM3(temperatureK) * volumeM3
  const saturation = saturationAt(initialK)
  const tolerance = 1e-12 * Math.max(1, initialVapour, Math.min(totalWater, saturation))
  if ((room.fogKg === 0 && initialVapour <= saturation + tolerance) || Math.abs(initialVapour - saturation) <= tolerance) return

  // Solve for the partition of a fixed mass of water. Every trial temperature
  // retains the same sensible plus latent energy using the boiling point as reference.
  const latentAtInitialK = Math.max(0, VAPORIZATION_J_KG +
    (STEAM_HEAT_J_KG_K - WATER_HEAT_J_KG_K) * (initialK - BOIL_K))
  const temperatureFor = (vapourKg: number) => initialK +
    (initialVapour - vapourKg) * latentAtInitialK / airHeatCapacity(volumeM3, vapourKg, totalWater - vapourKg)
  let vapourKg = totalWater
  if (vapourKg > saturationAt(temperatureFor(vapourKg))) {
    let low = 0, high = Math.min(totalWater, saturationAt(temperatureFor(0)))
    for (let i = 0; i < 48; i++) {
      const middle = low + (high - low) / 2
      if (middle <= saturationAt(temperatureFor(middle))) low = middle
      else high = middle
    }
    vapourKg = low
  }
  environment.ambientTemperatureK = checkedTemperature(temperatureFor(vapourKg))
  room.steamKg = vapourKg
  room.fogKg = totalWater - vapourKg
}
