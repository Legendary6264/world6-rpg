import { MAX_AEROSOL_KG, OUTSIDE_OXYGEN_FRACTION } from './physicsState'
import type { AirContents } from './airProfiles'
import { MAX_TEMPERATURE_K } from './physicsUnits'
import type { Scene, SceneObject } from './sceneTypes'
import { supportsObjectOperation } from './tabletopInteractions'
import { advanceWaterFlow, MAX_WATER_FLOW_STEPS } from './waterFlow'
import { BOIL_K, ICE_HEAT_J_KG_K, WATER_MASS_KG_M3, liquidEnthalpy, waterConductivitySM, waterEnthalpy, waterPhase, waterVolumeM3 } from './waterPhysics'
import { airHeatCapacity, airMassKg, applyWaterHeat, checkedTemperature } from './waterHeating'
import { saturatedVapourDensityKgM3, settleAtmosphericMoisture } from './atmosphericMoisture'
import { sceneAir } from './sceneAir'
import type { AirRegion, SceneAir } from './sceneAir'
import { DOOR_AIR_SPEED_MS, roomAirExchange } from './airExchange'
import { aerosolVisibilityM } from './airOptics'
export { smokeVisibilityM } from './airOptics'

const OXYGEN_FLOOR = .15, WETNESS_LIMIT = .85, OXYGEN_PER_FUEL = 1.4
const SMOKE_PER_FUEL = .025, HEAT_PER_FUEL_J = 16e6
const HEAT_TRANSFER_W_M2_K = 5
export const MAX_ABILITY_HEAT_KJ = 1e9

const bodyCapacity = (object: SceneObject) => (object.physics?.massKg ?? 0) * (object.physics?.material.specificHeatJKgK ?? 0)
const surfaceM2 = ({ width, depth, height }: SceneObject) => 2 * (width * depth + height * (width + depth))
export const thermalTarget = (object: SceneObject) => object.kind === 'water'
  ? !!object.water && waterVolumeM3(object) > 0 : bodyCapacity(object) > 0

function canBurn(object: SceneObject, room: AirContents) {
  const body = object.physics
  return !!body?.combustion?.fuelKg && supportsObjectOperation(object, 'ignite') &&
    body.wetnessFraction < WETNESS_LIMIT && room.oxygenFraction > OXYGEN_FLOOR
}

export function settleFire(scene: Scene, layout = sceneAir(scene)) {
  if (!layout) return
  for (const object of scene.objects) {
    if (object.active !== false && object.physics?.combustion && supportsObjectOperation(object, 'ignite') &&
        !canBurn(object, layout.at(object).air)) object.active = false
  }
}

export type HeatOutcome = { kind:'heat'; objectId:string; energyKJ:number; temperatureK:number; iceFraction?:number; evaporatedKg:number; ignited?:true;
  waterTransition?:{fromIceFraction:number; conductivitySM:number|null} }

export function applyHeat(scene: Scene, object: SceneObject, energyKJ: number): HeatOutcome {
  const layout = sceneAir(scene)
  if (!layout) throw Error('Включи тепло и воздух в физических условиях сцены.')
  if (!thermalTarget(object)) throw Error('У цели должен быть объём воды или материал с теплоёмкостью.')
  const energyJ = energyKJ * 1000
  if (object.kind === 'water') {
    const from = waterPhase(waterEnthalpy(object.water!,layout.at(object).climate.ambientTemperatureK)).iceFraction
    const change = applyWaterHeat(scene,object,energyJ,layout)
    return { kind:'heat', objectId:object.id, energyKJ, ...change,
      ...(object.height>0 && from!==change.iceFraction ? {waterTransition:{fromIceFraction:from,conductivitySM:waterConductivitySM(object.water!,object)}} : {}) }
  }
  const body = object.physics!, oldK = body.temperatureK
  const temperatureK = checkedTemperature(oldK + energyJ / bodyCapacity(object))
  body.temperatureK = temperatureK
  const ignition = body.combustion?.ignitionTemperatureK
  const ignited = ignition !== undefined && oldK < ignition && temperatureK >= ignition && object.active === false && canBurn(object, layout.at(object).air)
  if (ignited) object.active = true
  return { kind:'heat', objectId:object.id, energyKJ, temperatureK, evaporatedKg:0, ...(ignited ? {ignited:true} : {}) }
}

function ventilate(scene: Scene, layout: SceneAir, seconds: number) {
  const {atmosphere:room,regions:[{climate,volumeM3}]} = layout
  if (!room.doorVentilation) return
  const areaM2 = scene.objects.reduce((sum, o) =>
    o.kind === 'door' && o.open ? sum + Math.max(o.width, o.depth) * o.height : sum, 0)
  const exchanged = -Math.expm1(-DOOR_AIR_SPEED_MS * areaM2 * seconds / volumeM3)
  if (!exchanged) return
  room.oxygenFraction += (OUTSIDE_OXYGEN_FRACTION - room.oxygenFraction) * exchanged
  room.smokeKg *= 1 - exchanged
  room.steamKg *= 1 - exchanged
  if (room.fogKg != null) room.fogKg *= 1 - exchanged
  // Lost steam carries its sensible and latent energy out with it. Incoming dry
  // air replaces the same fraction of the room's reference air mass.
  const fraction = airHeatCapacity(volumeM3, 0) * exchanged / airHeatCapacity(volumeM3, room.steamKg, room.fogKg ?? 0)
  climate.ambientTemperatureK += (room.outsideTemperatureK - climate.ambientTemperatureK) * fraction
}

function burn({air:room,climate,volumeM3}: AirRegion, objects:SceneObject[], seconds:number, smokeBudgetKg:number) {
  const air = airMassKg(volumeM3), capacity = airHeatCapacity(volumeM3, room.steamKg, room.fogKg ?? 0)
  const fires = objects.flatMap(object => {
    if (object.active === false || !canBurn(object, room)) return []
    const body = object.physics!, fuel = body.combustion!
    return [{ fuel, demand: Math.min(fuel.fuelKg, seconds * fuel.burnRateKgS * (1 - body.wetnessFraction) ** 2) }]
  })
  const demand = fires.reduce((sum, fire) => sum + fire.demand, 0)
  if (!demand) return 0
  const oxygenLimit = Math.max(0, room.oxygenFraction - OXYGEN_FLOOR) * air / OXYGEN_PER_FUEL
  const burnKg = Math.min(demand, oxygenLimit, (MAX_TEMPERATURE_K - climate.ambientTemperatureK) * capacity / HEAT_PER_FUEL_J,
    smokeBudgetKg / SMOKE_PER_FUEL)
  if (!burnKg) return 0
  for (const fire of fires) fire.fuel.fuelKg = Math.max(0, fire.fuel.fuelKg - fire.demand * (burnKg / demand))
  room.oxygenFraction = burnKg === oxygenLimit ? OXYGEN_FLOOR : Math.max(OXYGEN_FLOOR, room.oxygenFraction - burnKg * OXYGEN_PER_FUEL / air)
  const smokeKg = SMOKE_PER_FUEL * burnKg
  room.smokeKg = Math.min(MAX_AEROSOL_KG, room.smokeKg + smokeKg)
  climate.ambientTemperatureK = Math.min(MAX_TEMPERATURE_K, climate.ambientTemperatureK + HEAT_PER_FUEL_J * burnKg / capacity)
  return smokeKg
}

function exchangeHeat(scene: Scene, layout: SceneAir, seconds: number) {
  for (const object of scene.objects) {
    if (!thermalTarget(object)) continue
    const water = object.kind === 'water' ? object.water : undefined
    const {air,climate,volumeM3} = layout.at(object)
    const airCapacity = airHeatCapacity(volumeM3, air.steamKg, air.fogKg ?? 0)
    const temperatureK = water ? waterPhase(water.enthalpyJKg!).temperatureK : object.physics!.temperatureK
    const capacity = water ? waterVolumeM3(object) * WATER_MASS_KG_M3 * ICE_HEAT_J_KG_K : bodyCapacity(object)
    const equivalent = 1 / (1 / capacity + 1 / airCapacity)
    const fraction = -Math.expm1(-HEAT_TRANSFER_W_M2_K * surfaceM2(object) * seconds / equivalent)
    const transferJ = (climate.ambientTemperatureK - temperatureK) * equivalent * fraction
    if (!transferJ) continue
    climate.ambientTemperatureK = Math.min(MAX_TEMPERATURE_K, Math.max(0, climate.ambientTemperatureK - transferJ / airCapacity))
    if (water) applyWaterHeat(scene, object, transferJ, layout)
    else {
      object.physics!.temperatureK = Math.min(MAX_TEMPERATURE_K, Math.max(0, temperatureK + transferJ / capacity))
    }
  }
}

export type ThermalObserver = (layout:SceneAir, fraction:number) => void

export function advanceThermal(scene: Scene, seconds: number, observe?:ThermalObserver) {
  const layout = sceneAir(scene)
  if (!layout) return 0
  const {regions} = layout
  if (seconds <= 0) {
    advanceWaterFlow(scene, 0, MAX_WATER_FLOW_STEPS, layout)
    settleFire(scene, layout)
    regions.forEach(settleAtmosphericMoisture)
    return 0
  }
  // Establish the initial water energy before the room can heat up or vent.
  for (const o of scene.objects) if (o.water && o.height > 0 && o.water.enthalpyJKg == null) {
    o.water.enthalpyJKg = liquidEnthalpy(layout.at(o).climate.ambientTemperatureK)
  }
  // Water and heat share slices. Meltwater can flow in the next slice of the
  // same interval, and newly wetted fuel stops burning before the next exchange.
  const steps = Math.min(32, Math.ceil(seconds))
  const dt = seconds / steps, waterStepLimit = Math.floor(MAX_WATER_FLOW_STEPS / steps)
  const mixing = regions.length > 1 ? roomAirExchange(scene,layout,dt) : undefined
  const fuelByRegion:SceneObject[][] = regions.map(() => [])
  for (const object of scene.objects) if (object.physics?.combustion) fuelByRegion[layout.indexAt(object)].push(object)
  let flowReactionHeatJ = 0
  observe?.(layout,0)
  for (let i = 0; i < steps; i++) {
    flowReactionHeatJ += advanceWaterFlow(scene, dt, waterStepLimit, layout)
    settleFire(scene, layout)
    if (regions.length === 1) ventilate(scene, layout, dt)
    else mixing?.()
    let smokeBudget = Math.max(0,MAX_AEROSOL_KG-regions.reduce((total,region) => total+region.air.smokeKg,0))
    for (const [index,region] of regions.entries()) {
      smokeBudget = Math.max(0,smokeBudget-burn(region,fuelByRegion[index],dt,smokeBudget))
    }
    settleFire(scene, layout)
    exchangeHeat(scene, layout, dt)
    regions.forEach(settleAtmosphericMoisture)
    observe?.(layout,(i+1)/steps)
  }
  return flowReactionHeatJ
}

type ThermalAirStatus = {
  fromK:number; toK:number; oxygenFraction:number; smokeKg:number; steamKg:number
  fogKg?:number; relativeHumidityPct?:number
}
export type ThermalRoundChanges = ThermalAirStatus & {
  visibilityM?:number; flowReactionHeatKJ?:number
  rooms?: (ThermalAirStatus & {id:string;name:string})[]
  fires:{id:string;name:string;fuelKg:number;lit:boolean}[]
  water:{id:string;name:string;temperatureK:number;iceFraction:number;volumeL:number}[]
}

function airStatus({air,climate,volumeM3}: AirRegion, fromK:number):ThermalAirStatus {
  const toK = climate.ambientTemperatureK
  const saturationKg = air.fogKg == null ? 0 : saturatedVapourDensityKgM3(toK)*volumeM3
  const relativeHumidityPct = saturationKg > 0 && Number.isFinite(saturationKg)
    ? Math.min(100,100*air.steamKg/saturationKg) : undefined
  return {fromK,toK,oxygenFraction:air.oxygenFraction,smokeKg:air.smokeKg,steamKg:air.steamKg,
    ...(air.fogKg != null ? {fogKg:air.fogKg} : {}),
    ...(relativeHumidityPct !== undefined ? {relativeHumidityPct} : {})}
}

export function thermalRoundChanges(before: Scene, after: Scene, flowReactionHeatJ = 0): ThermalRoundChanges | undefined {
  const start = before.physics, layout = sceneAir(after)
  if (!start || !layout) return undefined
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
  const visibility = aerosolVisibilityM(after,layout)
  const rooms = layout.regions.slice(1).map(region => {
    const {id,name} = region.room!
    const fromK = start.airRooms?.find(room => room.id === id)?.ambientTemperatureK ?? region.climate.ambientTemperatureK
    return {id,name,...airStatus(region,fromK)}
  })
  return {...airStatus(layout.regions[0],start.ambientTemperatureK), ...(visibility !== undefined ? {visibilityM:visibility} : {}),
    ...(rooms.length ? {rooms} : {}),
    ...(flowReactionHeatJ > 0 ? {flowReactionHeatKJ:flowReactionHeatJ / 1000} : {}), fires, water}
}
