import { MAX_AEROSOL_KG, OUTSIDE_OXYGEN_FRACTION } from './physicsState'
import type { RoomAtmosphere } from './physicsState'
import { MAX_TEMPERATURE_K, physicsNumber } from './physicsUnits'
import type { Scene, SceneObject } from './sceneTypes'
import { supportsObjectOperation } from './tabletopInteractions'
import { advanceWaterFlow, MAX_WATER_FLOW_STEPS } from './waterFlow'
import {
  BOIL_K, BOILING_ENTHALPY_J_KG, ICE_HEAT_J_KG_K, MIN_WATER_ENTHALPY_J_KG, VAPORIZATION_J_KG,
  WATER_MASS_KG_M3, liquidEnthalpy, waterEnthalpy, waterPhase, waterVolumeM3,
} from './waterPhysics'

const AIR_DENSITY = 1.2, AIR_HEAT = 1005, STEAM_HEAT = 1850
const OXYGEN_FLOOR = .15, WETNESS_LIMIT = .85, OXYGEN_PER_FUEL = 1.4
const SMOKE_PER_FUEL = .025, HEAT_PER_FUEL_J = 16e6
const DOOR_AIR_SPEED_MS = .3, HEAT_TRANSFER_W_M2_K = 5
const SMOKE_EXTINCTION_M2_KG = 8700, VISIBILITY_FACTOR = 3
export const MAX_ABILITY_HEAT_KJ = 1e9

// One well-mixed zone. Keep a minimum effective volume for very flat scenes.
const volumeM3 = (scene: Scene) => Math.max(.01, scene.width * scene.depth * (scene.maxZ - scene.minZ))
const airMass = (scene: Scene) => AIR_DENSITY * volumeM3(scene)
const heatCapacity = (scene: Scene, steamKg: number) => airMass(scene) * AIR_HEAT + steamKg * STEAM_HEAT
const bodyCapacity = (object: SceneObject) => (object.physics?.massKg ?? 0) * (object.physics?.material.specificHeatJKgK ?? 0)
const surfaceM2 = ({ width, depth, height }: SceneObject) => 2 * (width * depth + height * (width + depth))
export const thermalTarget = (object: SceneObject) => object.kind === 'water'
  ? !!object.water && waterVolumeM3(object) > 0 : bodyCapacity(object) > 0

export function smokeExtinctionPerM(scene: Scene) {
  return SMOKE_EXTINCTION_M2_KG * (scene.physics?.atmosphere?.smokeKg ?? 0) / volumeM3(scene)
}

export function smokeVisibilityM(scene: Scene): number | undefined {
  const distance = VISIBILITY_FACTOR / smokeExtinctionPerM(scene)
  return distance < Math.hypot(scene.width, scene.depth, scene.maxZ - scene.minZ) ? distance : undefined
}

function canBurn(object: SceneObject, room: RoomAtmosphere) {
  const body = object.physics
  return !!body?.combustion?.fuelKg && supportsObjectOperation(object, 'ignite') &&
    body.wetnessFraction < WETNESS_LIMIT && room.oxygenFraction > OXYGEN_FLOOR
}

export function settleFire(scene: Scene) {
  const room = scene.physics?.atmosphere
  if (!room) return
  for (const object of scene.objects) {
    if (object.active !== false && object.physics?.combustion && supportsObjectOperation(object, 'ignite') && !canBurn(object, room)) object.active = false
  }
}

function checkedTemperature(k: number) {
  if (!physicsNumber(k, 0, MAX_TEMPERATURE_K)) throw Error('Тепловое действие выходит за допустимый диапазон температуры.')
  return k
}

export type HeatOutcome = { kind:'heat'; objectId:string; energyKJ:number; temperatureK:number; iceFraction?:number; evaporatedKg:number; ignited?:true }

function changeWater(scene: Scene, object: SceneObject, energyJ: number) {
  const environment = scene.physics!, room = environment.atmosphere!, water = object.water!
  const mass = waterVolumeM3(object) * WATER_MASS_KG_M3
  const previousH = waterEnthalpy(water, environment.ambientTemperatureK)
  const totalJ = previousH * mass + energyJ
  const enthalpy = totalJ / mass
  if (enthalpy < MIN_WATER_ENTHALPY_J_KG - 1e-7) throw Error('Для такого охлаждения у воды недостаточно тепловой энергии.')
  const boiling = Math.max(0, totalJ - mass * BOILING_ENTHALPY_J_KG)
  const evaporatedKg = Math.min(mass, boiling / VAPORIZATION_J_KG)
  const remainingKg = mass - evaporatedKg, steamKg = room.steamKg + evaporatedKg
  if (steamKg > MAX_AEROSOL_KG) throw Error('В этой сцене превышен предел учёта пара.')
  const h = Math.min(BOILING_ENTHALPY_J_KG, Math.max(MIN_WATER_ENTHALPY_J_KG, enthalpy))
  if (evaporatedKg) {
    const before = heatCapacity(scene, room.steamKg), after = heatCapacity(scene, steamKg)
    const excessJ = Math.max(0, boiling - evaporatedKg * VAPORIZATION_J_KG)
    environment.ambientTemperatureK = checkedTemperature(BOIL_K + ((environment.ambientTemperatureK - BOIL_K) * before + excessJ) / after)
    room.steamKg = steamKg
    object.height *= remainingKg / mass
  }
  object.water = { ...water, enthalpyJKg: object.height > 0 ? h : 0 }
  return { ...waterPhase(h), evaporatedKg }
}

export function applyHeat(scene: Scene, object: SceneObject, energyKJ: number): HeatOutcome {
  const environment = scene.physics, room = environment?.atmosphere
  if (!environment || !room) throw Error('Включи тепло и воздух в физических условиях сцены.')
  if (!thermalTarget(object)) throw Error('У цели должен быть объём воды или материал с теплоёмкостью.')
  const energyJ = energyKJ * 1000
  if (object.kind === 'water') {
    return { kind:'heat', objectId:object.id, energyKJ, ...changeWater(scene, object, energyJ) }
  }
  const body = object.physics!, oldK = body.temperatureK
  const temperatureK = checkedTemperature(oldK + energyJ / bodyCapacity(object))
  body.temperatureK = temperatureK
  const ignition = body.combustion?.ignitionTemperatureK
  const ignited = ignition !== undefined && oldK < ignition && temperatureK >= ignition && object.active === false && canBurn(object, room)
  if (ignited) object.active = true
  return { kind:'heat', objectId:object.id, energyKJ, temperatureK, evaporatedKg:0, ...(ignited ? {ignited:true} : {}) }
}

function ventilate(scene: Scene, room: RoomAtmosphere, seconds: number) {
  if (!room.doorVentilation) return
  const areaM2 = scene.objects.reduce((sum, o) =>
    o.kind === 'door' && o.open ? sum + Math.max(o.width, o.depth) * o.height : sum, 0)
  const exchanged = -Math.expm1(-DOOR_AIR_SPEED_MS * areaM2 * seconds / volumeM3(scene))
  if (!exchanged) return
  const environment = scene.physics!
  room.oxygenFraction += (OUTSIDE_OXYGEN_FRACTION - room.oxygenFraction) * exchanged
  room.smokeKg *= 1 - exchanged
  room.steamKg *= 1 - exchanged
  // Lost steam carries its sensible and latent energy out with it. Incoming dry
  // air replaces the same fraction of the room's reference air mass.
  const fraction = heatCapacity(scene, 0) * exchanged / heatCapacity(scene, room.steamKg)
  environment.ambientTemperatureK += (room.outsideTemperatureK - environment.ambientTemperatureK) * fraction
}

function burn(scene: Scene, room: RoomAtmosphere, seconds: number) {
  const environment = scene.physics!, air = airMass(scene), capacity = heatCapacity(scene, room.steamKg)
  const fires = scene.objects.flatMap(object => {
    if (object.active === false || !canBurn(object, room)) return []
    const body = object.physics!, fuel = body.combustion!
    return [{ fuel, demand: Math.min(fuel.fuelKg, seconds * fuel.burnRateKgS * (1 - body.wetnessFraction) ** 2) }]
  })
  const demand = fires.reduce((sum, fire) => sum + fire.demand, 0)
  if (!demand) return
  const oxygenLimit = Math.max(0, room.oxygenFraction - OXYGEN_FLOOR) * air / OXYGEN_PER_FUEL
  const burnKg = Math.min(demand, oxygenLimit, (MAX_TEMPERATURE_K - environment.ambientTemperatureK) * capacity / HEAT_PER_FUEL_J,
    (MAX_AEROSOL_KG - room.smokeKg) / SMOKE_PER_FUEL)
  if (!burnKg) return
  for (const fire of fires) fire.fuel.fuelKg = Math.max(0, fire.fuel.fuelKg - fire.demand * (burnKg / demand))
  room.oxygenFraction = burnKg === oxygenLimit ? OXYGEN_FLOOR : Math.max(OXYGEN_FLOOR, room.oxygenFraction - burnKg * OXYGEN_PER_FUEL / air)
  room.smokeKg = Math.min(MAX_AEROSOL_KG, room.smokeKg + SMOKE_PER_FUEL * burnKg)
  environment.ambientTemperatureK = Math.min(MAX_TEMPERATURE_K, environment.ambientTemperatureK + HEAT_PER_FUEL_J * burnKg / capacity)
}

function exchangeHeat(scene: Scene, room: RoomAtmosphere, seconds: number) {
  const environment = scene.physics!
  for (const object of scene.objects) {
    if (!thermalTarget(object)) continue
    const water = object.kind === 'water' ? object.water : undefined
    const airCapacity = heatCapacity(scene, room.steamKg)
    const temperatureK = water ? waterPhase(water.enthalpyJKg!).temperatureK : object.physics!.temperatureK
    const capacity = water ? waterVolumeM3(object) * WATER_MASS_KG_M3 * ICE_HEAT_J_KG_K : bodyCapacity(object)
    const equivalent = 1 / (1 / capacity + 1 / airCapacity)
    const fraction = -Math.expm1(-HEAT_TRANSFER_W_M2_K * surfaceM2(object) * seconds / equivalent)
    const transferJ = (environment.ambientTemperatureK - temperatureK) * equivalent * fraction
    if (!transferJ) continue
    environment.ambientTemperatureK = Math.min(MAX_TEMPERATURE_K, Math.max(0, environment.ambientTemperatureK - transferJ / airCapacity))
    if (water) changeWater(scene, object, transferJ)
    else {
      object.physics!.temperatureK = Math.min(MAX_TEMPERATURE_K, Math.max(0, temperatureK + transferJ / capacity))
    }
  }
}

export function advanceThermal(scene: Scene, seconds: number) {
  const room = scene.physics?.atmosphere
  if (!room) return
  if (seconds <= 0) {
    advanceWaterFlow(scene, 0)
    settleFire(scene)
    return
  }
  // Establish the initial water energy before the room can heat up or vent.
  const initial = liquidEnthalpy(scene.physics!.ambientTemperatureK)
  for (const o of scene.objects) if (o.water && o.height > 0 && o.water.enthalpyJKg == null) o.water.enthalpyJKg = initial
  // Water and heat share slices. Meltwater can flow in the next slice of the
  // same interval, and newly wetted fuel stops burning before the next exchange.
  const steps = Math.min(32, Math.ceil(seconds))
  const dt = seconds / steps, waterStepLimit = Math.floor(MAX_WATER_FLOW_STEPS / steps)
  for (let i = 0; i < steps; i++) {
    advanceWaterFlow(scene, dt, waterStepLimit)
    settleFire(scene)
    ventilate(scene, room, dt)
    burn(scene, room, dt)
    settleFire(scene)
    exchangeHeat(scene, room, dt)
  }
}

export type ThermalRoundChanges = {
  fromK:number; toK:number; oxygenFraction:number; smokeKg:number; steamKg:number; visibilityM?:number
  fires:{id:string;name:string;fuelKg:number;lit:boolean}[]
  water:{id:string;name:string;temperatureK:number;iceFraction:number;volumeL:number}[]
}

export function thermalRoundChanges(before: Scene, after: Scene): ThermalRoundChanges | undefined {
  const start = before.physics, end = after.physics, room = end?.atmosphere
  if (!start || !end || !room) return undefined
  const old = new Map(before.objects.map(o => [o.id, o]))
  const fires: ThermalRoundChanges['fires'] = [], water: ThermalRoundChanges['water'] = []
  for (const object of after.objects) {
    const previous = old.get(object.id)
    const fuelKg = object.physics?.combustion?.fuelKg
    if (fuelKg !== undefined && (fuelKg !== previous?.physics?.combustion?.fuelKg || object.active !== previous?.active)) {
      fires.push({id:object.id, name:object.name, fuelKg, lit:object.active !== false})
    }
    if (object.water?.enthalpyJKg != null && (object.water.enthalpyJKg !== previous?.water?.enthalpyJKg || object.height !== previous?.height)) {
      if (object.height > 0) water.push({id:object.id, name:object.name, ...waterPhase(object.water.enthalpyJKg), volumeL:waterVolumeM3(object) * 1000})
      else water.push({id:object.id, name:object.name, temperatureK:BOIL_K, iceFraction:0, volumeL:0})
    }
  }
  const visibilityM = smokeVisibilityM(after)
  return {fromK:start.ambientTemperatureK, toK:end.ambientTemperatureK, oxygenFraction:room.oxygenFraction, smokeKg:room.smokeKg,
    steamKg:room.steamKg, ...(visibilityM !== undefined ? {visibilityM} : {}), fires, water}
}
