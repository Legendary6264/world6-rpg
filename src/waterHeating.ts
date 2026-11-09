import { MAX_AEROSOL_KG, MIN_AIR_VOLUME_M3, moistureKg } from './airProfiles'
import { MAX_TEMPERATURE_K, physicsNumber } from './physicsUnits'
import type { Scene, SceneObject } from './sceneTypes'
import { frameVolumeM3, sceneAir } from './sceneAir'
import type { AirRegion, SceneAir } from './sceneAir'
import {
  BOIL_K, BOILING_ENTHALPY_J_KG, MIN_WATER_ENTHALPY_J_KG, VAPORIZATION_J_KG,
  WATER_HEAT_J_KG_K, WATER_MASS_KG_M3, waterEnthalpy, waterPhase, waterVolumeM3,
} from './waterPhysics'

const AIR_DENSITY = 1.2
const AIR_HEAT = 1005
export const STEAM_HEAT_J_KG_K = 1850

export const roomVolumeM3 = (scene: Scene) => Math.max(MIN_AIR_VOLUME_M3,frameVolumeM3(scene))
export const airMassKg = (volumeM3:number) => AIR_DENSITY*volumeM3
export const airHeatCapacity = (volumeM3:number, steamKg:number, fogKg = 0) =>
  airMassKg(volumeM3) * AIR_HEAT + steamKg * STEAM_HEAT_J_KG_K + fogKg * WATER_HEAT_J_KG_K
export const roomHeatCapacity = (scene: Scene, steamKg: number, fogKg = 0) =>
  airHeatCapacity(roomVolumeM3(scene),steamKg,fogKg)

export function checkedTemperature(k: number) {
  if (!physicsNumber(k, 0, MAX_TEMPERATURE_K)) throw Error('Тепловое действие выходит за допустимый диапазон температуры.')
  return k
}

// Energy above the boiling point first pays for vaporization. Energy left
// after all the liquid boils is carried into the room with the steam.
export function resolveWaterEnergy(massKg: number, totalJ: number) {
  const enthalpy = totalJ / massKg
  if (enthalpy < MIN_WATER_ENTHALPY_J_KG - 1e-7) throw Error('Для такого охлаждения у воды недостаточно тепловой энергии.')
  const boilingJ = Math.max(0, totalJ - massKg * BOILING_ENTHALPY_J_KG)
  const evaporatedKg = Math.min(massKg, boilingJ / VAPORIZATION_J_KG)
  return {
    enthalpyJKg: Math.min(BOILING_ENTHALPY_J_KG, Math.max(MIN_WATER_ENTHALPY_J_KG, enthalpy)),
    evaporatedKg,
    excessJ: Math.max(0, boilingJ - evaporatedKg * VAPORIZATION_J_KG),
  }
}

export type SteamRelease = {evaporatedKg:number; excessJ:number}

// Validate the whole batch before mutating any room or changing the water layers.
export function addSteamFromWater(layout: SceneAir, releases: ReadonlyMap<AirRegion,SteamRelease>) {
  let totalKg = 0
  const updates = layout.regions.flatMap(region => {
    const {air,climate,volumeM3} = region, release = releases.get(region)
    totalKg += moistureKg(air) + (release?.evaporatedKg ?? 0)
    if (!release?.evaporatedKg) return []
    const steamKg = air.steamKg + release.evaporatedKg, fogKg = air.fogKg ?? 0
    const before = airHeatCapacity(volumeM3,air.steamKg,fogKg), after = airHeatCapacity(volumeM3,steamKg,fogKg)
    const temperature = BOIL_K + ((climate.ambientTemperatureK-BOIL_K)*before+release.excessJ)/after
    return [{region,steamKg,temperature:checkedTemperature(temperature)}]
  })
  if (totalKg > MAX_AEROSOL_KG) throw Error('В этой сцене превышен предел учёта влаги в воздухе.')
  for (const {region,steamKg,temperature} of updates) {
    region.air.steamKg = steamKg
    region.climate.ambientTemperatureK = temperature
  }
}

export function applyWaterHeat(scene: Scene, object: SceneObject, energyJ: number, layout = sceneAir(scene)) {
  const water = object.water!
  const massKg = waterVolumeM3(object) * WATER_MASS_KG_M3
  const region = layout?.at(object)
  const previousH = waterEnthalpy(water, region?.climate.ambientTemperatureK ?? scene.physics?.ambientTemperatureK)
  const {enthalpyJKg, evaporatedKg, excessJ} = resolveWaterEnergy(massKg, previousH * massKg + energyJ)
  if (evaporatedKg) {
    if (!layout || !region) throw Error('Включи тепло и воздух в физических условиях сцены.')
    addSteamFromWater(layout,new Map([[region,{evaporatedKg,excessJ}]]))
    object.height *= (massKg - evaporatedKg) / massKg
  }
  object.water = { ...water, enthalpyJKg: object.height > 0 ? enthalpyJKg : 0 }
  return { ...waterPhase(enthalpyJKg), evaporatedKg }
}
