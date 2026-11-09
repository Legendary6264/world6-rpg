import { MAX_AEROSOL_KG } from './physicsState'
import { MAX_TEMPERATURE_K, physicsNumber } from './physicsUnits'
import type { Scene, SceneObject } from './sceneTypes'
import {
  BOIL_K, BOILING_ENTHALPY_J_KG, MIN_WATER_ENTHALPY_J_KG, VAPORIZATION_J_KG,
  WATER_HEAT_J_KG_K, WATER_MASS_KG_M3, waterEnthalpy, waterPhase, waterVolumeM3,
} from './waterPhysics'

const AIR_DENSITY = 1.2
const AIR_HEAT = 1005
export const STEAM_HEAT_J_KG_K = 1850

// One well-mixed zone with a minimum effective volume for very flat scenes.
export const roomVolumeM3 = (scene: Scene) => Math.max(.01, scene.width * scene.depth * (scene.maxZ - scene.minZ))
export const roomAirMassKg = (scene: Scene) => AIR_DENSITY * roomVolumeM3(scene)
export const roomHeatCapacity = (scene: Scene, steamKg: number, fogKg = 0) =>
  roomAirMassKg(scene) * AIR_HEAT + steamKg * STEAM_HEAT_J_KG_K + fogKg * WATER_HEAT_J_KG_K

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

export function addSteamFromWater(scene: Scene, evaporatedKg: number, excessJ: number) {
  if (!evaporatedKg) return
  const environment = scene.physics, room = environment?.atmosphere
  if (!environment || !room) throw Error('Включи тепло и воздух в физических условиях сцены.')
  const steamKg = room.steamKg + evaporatedKg
  const fogKg = room.fogKg ?? 0
  if (steamKg + fogKg > MAX_AEROSOL_KG) throw Error('В этой сцене превышен предел учёта влаги в воздухе.')
  const before = roomHeatCapacity(scene, room.steamKg, fogKg), after = roomHeatCapacity(scene, steamKg, fogKg)
  environment.ambientTemperatureK = checkedTemperature(BOIL_K + ((environment.ambientTemperatureK - BOIL_K) * before + excessJ) / after)
  room.steamKg = steamKg
}

export function applyWaterHeat(scene: Scene, object: SceneObject, energyJ: number) {
  const water = object.water!
  const massKg = waterVolumeM3(object) * WATER_MASS_KG_M3
  const previousH = waterEnthalpy(water, scene.physics?.ambientTemperatureK)
  const {enthalpyJKg, evaporatedKg, excessJ} = resolveWaterEnergy(massKg, previousH * massKg + energyJ)
  if (evaporatedKg) {
    addSteamFromWater(scene, evaporatedKg, excessJ)
    object.height *= (massKg - evaporatedKg) / massKg
  }
  object.water = { ...water, enthalpyJKg: object.height > 0 ? enthalpyJKg : 0 }
  return { ...waterPhase(enthalpyJKg), evaporatedKg }
}
