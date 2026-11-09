import { MAX_AEROSOL_KG, OUTSIDE_OXYGEN_FRACTION } from './physicsState'
import type { RoomAtmosphere } from './physicsState'
import { MAX_TEMPERATURE_K } from './physicsUnits'
import type { Scene, SceneObject } from './sceneTypes'
import { supportsObjectOperation } from './tabletopInteractions'
import { advanceWaterFlow, MAX_WATER_FLOW_STEPS } from './waterFlow'
import { BOIL_K, ICE_HEAT_J_KG_K, WATER_MASS_KG_M3, liquidEnthalpy, waterPhase, waterVolumeM3 } from './waterPhysics'
import { applyWaterHeat, checkedTemperature, roomAirMassKg, roomHeatCapacity, roomVolumeM3 } from './waterHeating'
import { fogExtinctionPerM, saturatedVapourDensityKgM3, settleAtmosphericMoisture } from './atmosphericMoisture'

const OXYGEN_FLOOR = .15, WETNESS_LIMIT = .85, OXYGEN_PER_FUEL = 1.4
const SMOKE_PER_FUEL = .025, HEAT_PER_FUEL_J = 16e6
const DOOR_AIR_SPEED_MS = .3, HEAT_TRANSFER_W_M2_K = 5
const SMOKE_EXTINCTION_M2_KG = 8700, VISIBILITY_FACTOR = 3
export const MAX_ABILITY_HEAT_KJ = 1e9

const bodyCapacity = (object: SceneObject) => (object.physics?.massKg ?? 0) * (object.physics?.material.specificHeatJKgK ?? 0)
const surfaceM2 = ({ width, depth, height }: SceneObject) => 2 * (width * depth + height * (width + depth))
export const thermalTarget = (object: SceneObject) => object.kind === 'water'
  ? !!object.water && waterVolumeM3(object) > 0 : bodyCapacity(object) > 0

export function smokeExtinctionPerM(scene: Scene) {
  return SMOKE_EXTINCTION_M2_KG * (scene.physics?.atmosphere?.smokeKg ?? 0) / roomVolumeM3(scene)
}

export function aerosolExtinctionPerM(scene: Scene) {
  return smokeExtinctionPerM(scene) + fogExtinctionPerM(scene)
}

function visibilityM(scene: Scene, extinctionPerM: number) {
  const distance = VISIBILITY_FACTOR / extinctionPerM
  return distance < Math.hypot(scene.width, scene.depth, scene.maxZ - scene.minZ) ? distance : undefined
}

export const smokeVisibilityM = (scene: Scene) => visibilityM(scene, smokeExtinctionPerM(scene))
export const aerosolVisibilityM = (scene: Scene) => visibilityM(scene, aerosolExtinctionPerM(scene))

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

export type HeatOutcome = { kind:'heat'; objectId:string; energyKJ:number; temperatureK:number; iceFraction?:number; evaporatedKg:number; ignited?:true }

export function applyHeat(scene: Scene, object: SceneObject, energyKJ: number): HeatOutcome {
  const environment = scene.physics, room = environment?.atmosphere
  if (!environment || !room) throw Error('Включи тепло и воздух в физических условиях сцены.')
  if (!thermalTarget(object)) throw Error('У цели должен быть объём воды или материал с теплоёмкостью.')
  const energyJ = energyKJ * 1000
  if (object.kind === 'water') {
    return { kind:'heat', objectId:object.id, energyKJ, ...applyWaterHeat(scene, object, energyJ) }
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
  const exchanged = -Math.expm1(-DOOR_AIR_SPEED_MS * areaM2 * seconds / roomVolumeM3(scene))
  if (!exchanged) return
  const environment = scene.physics!
  room.oxygenFraction += (OUTSIDE_OXYGEN_FRACTION - room.oxygenFraction) * exchanged
  room.smokeKg *= 1 - exchanged
  room.steamKg *= 1 - exchanged
  if (room.fogKg != null) room.fogKg *= 1 - exchanged
  // Lost steam carries its sensible and latent energy out with it. Incoming dry
  // air replaces the same fraction of the room's reference air mass.
  const fraction = roomHeatCapacity(scene, 0) * exchanged / roomHeatCapacity(scene, room.steamKg, room.fogKg ?? 0)
  environment.ambientTemperatureK += (room.outsideTemperatureK - environment.ambientTemperatureK) * fraction
}

function burn(scene: Scene, room: RoomAtmosphere, seconds: number) {
  const environment = scene.physics!, air = roomAirMassKg(scene), capacity = roomHeatCapacity(scene, room.steamKg, room.fogKg ?? 0)
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
    const airCapacity = roomHeatCapacity(scene, room.steamKg, room.fogKg ?? 0)
    const temperatureK = water ? waterPhase(water.enthalpyJKg!).temperatureK : object.physics!.temperatureK
    const capacity = water ? waterVolumeM3(object) * WATER_MASS_KG_M3 * ICE_HEAT_J_KG_K : bodyCapacity(object)
    const equivalent = 1 / (1 / capacity + 1 / airCapacity)
    const fraction = -Math.expm1(-HEAT_TRANSFER_W_M2_K * surfaceM2(object) * seconds / equivalent)
    const transferJ = (environment.ambientTemperatureK - temperatureK) * equivalent * fraction
    if (!transferJ) continue
    environment.ambientTemperatureK = Math.min(MAX_TEMPERATURE_K, Math.max(0, environment.ambientTemperatureK - transferJ / airCapacity))
    if (water) applyWaterHeat(scene, object, transferJ)
    else {
      object.physics!.temperatureK = Math.min(MAX_TEMPERATURE_K, Math.max(0, temperatureK + transferJ / capacity))
    }
  }
}

export function advanceThermal(scene: Scene, seconds: number) {
  const room = scene.physics?.atmosphere
  if (!room) return 0
  if (seconds <= 0) {
    advanceWaterFlow(scene, 0)
    settleFire(scene)
    settleAtmosphericMoisture(scene)
    return 0
  }
  // Establish the initial water energy before the room can heat up or vent.
  const initial = liquidEnthalpy(scene.physics!.ambientTemperatureK)
  for (const o of scene.objects) if (o.water && o.height > 0 && o.water.enthalpyJKg == null) o.water.enthalpyJKg = initial
  // Water and heat share slices. Meltwater can flow in the next slice of the
  // same interval, and newly wetted fuel stops burning before the next exchange.
  const steps = Math.min(32, Math.ceil(seconds))
  const dt = seconds / steps, waterStepLimit = Math.floor(MAX_WATER_FLOW_STEPS / steps)
  let flowReactionHeatJ = 0
  for (let i = 0; i < steps; i++) {
    flowReactionHeatJ += advanceWaterFlow(scene, dt, waterStepLimit)
    settleFire(scene)
    ventilate(scene, room, dt)
    burn(scene, room, dt)
    settleFire(scene)
    exchangeHeat(scene, room, dt)
    settleAtmosphericMoisture(scene)
  }
  return flowReactionHeatJ
}

export type ThermalRoundChanges = {
  fromK:number; toK:number; oxygenFraction:number; smokeKg:number; steamKg:number; visibilityM?:number; flowReactionHeatKJ?:number
  fogKg?:number; relativeHumidityPct?:number
  fires:{id:string;name:string;fuelKg:number;lit:boolean}[]
  water:{id:string;name:string;temperatureK:number;iceFraction:number;volumeL:number}[]
}

export function thermalRoundChanges(before: Scene, after: Scene, flowReactionHeatJ = 0): ThermalRoundChanges | undefined {
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
  const visibility = aerosolVisibilityM(after)
  const saturationKg = room.fogKg == null ? 0 : saturatedVapourDensityKgM3(end.ambientTemperatureK) * roomVolumeM3(after)
  const relativeHumidityPct = saturationKg > 0 && Number.isFinite(saturationKg) ?
    Math.min(100, 100 * room.steamKg / saturationKg) : undefined
  return {fromK:start.ambientTemperatureK, toK:end.ambientTemperatureK, oxygenFraction:room.oxygenFraction, smokeKg:room.smokeKg,
    steamKg:room.steamKg, ...(visibility !== undefined ? {visibilityM:visibility} : {}),
    ...(room.fogKg != null ? {fogKg:room.fogKg} : {}),
    ...(relativeHumidityPct !== undefined ? {relativeHumidityPct} : {}),
    ...(flowReactionHeatJ > 0 ? {flowReactionHeatKJ:flowReactionHeatJ / 1000} : {}), fires, water}
}
