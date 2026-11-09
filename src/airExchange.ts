import { MAX_TEMPERATURE_K } from './physicsUnits'
import { OUTSIDE_OXYGEN_FRACTION } from './physicsState'
import { MAX_AEROSOL_KG } from './airProfiles'
import type { AirContents } from './airProfiles'
import { airPortal, OUTSIDE_AIR } from './sceneAir'
import type { AirPortal, SceneAir } from './sceneAir'
import type { Scene } from './sceneTypes'
import { airHeatCapacity } from './waterHeating'

export const DOOR_AIR_SPEED_MS = .3

// A conservative swap can round a scene at the storage ceiling a few ULPs
// above it. Correct the affected parcels only, leaving isolated rooms exact.
function boundSwapMasses(next:(AirContents & {fogKg:number})[], exchanged:number[]) {
  for (const fields of [['smokeKg'],['steamKg','fogKg']] as const) {
    let totalKg = 0, mixedKg = 0
    for (const [index,room] of next.entries()) {
      const massKg = fields.reduce((mass,key) => mass+room[key],0)
      totalKg += massKg
      if (exchanged[index]) mixedKg += massKg
    }
    if (totalKg <= MAX_AEROSOL_KG || !mixedKg) continue
    const marginKg = MAX_AEROSOL_KG*Number.EPSILON*next.length
    const scale = Math.max(0,1-(totalKg-MAX_AEROSOL_KG+marginKg)/mixedKg)
    for (const [index,room] of next.entries()) {
      if (exchanged[index]) for (const field of fields) room[field] *= scale
    }
  }
}

// One equal-volume swap per aperture. Every aperture reads the same snapshot,
// so opening several doors cannot depend on the order of scene objects.
export function roomAirExchange(scene: Scene, layout: SceneAir, seconds: number) {
  const {regions,atmosphere} = layout
  const portals = new Map<string, AirPortal>()
  const open = scene.objects.filter(object => object.kind === 'door' && object.open)
    .sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  for (const object of open) {
    const portal = airPortal(scene,layout,object)
    if (!portal) continue
    const a = Math.min(portal.a,portal.b), b = Math.max(portal.a,portal.b)
    if (a === OUTSIDE_AIR && !atmosphere.doorVentilation) continue
    const key = a + ':' + b, previous = portals.get(key)
    portals.set(key,{a,b,areaM2:portal.areaM2+(previous?.areaM2 ?? 0)})
  }
  if (!portals.size) return undefined
  const used = regions.map(() => 0)
  const swaps = [...portals.values()].map(({a,b,areaM2}) => {
    const perM3 = (a === OUTSIDE_AIR ? 0 : 1/regions[a].volumeM3) + 1/regions[b].volumeM3
    const volumeM3 = -Math.expm1(-DOOR_AIR_SPEED_MS*areaM2*seconds*perM3) / perM3
    if (a !== OUTSIDE_AIR) used[a] += volumeM3/regions[a].volumeM3
    used[b] += volumeM3/regions[b].volumeM3
    return {a,b,volumeM3}
  })
  const scale = Math.max(1,...used)
  return () => {
    const previous = regions.map(({air,climate,volumeM3}) => ({
      ...air, sensibleJ:airHeatCapacity(volumeM3,air.steamKg,air.fogKg ?? 0)*climate.ambientTemperatureK,
    }))
    const next = previous.map((value,index) => {
      const remain = Math.max(0,1-used[index]/scale)
      return {
        oxygenFraction:value.oxygenFraction*remain, smokeKg:value.smokeKg*remain, steamKg:value.steamKg*remain,
        fogKg:(value.fogKg ?? 0)*remain, sensibleJ:value.sensibleJ*remain,
      }
    })
    function receive(from:number, to:number, volumeM3:number) {
      const target = next[to], fraction = volumeM3/regions[to].volumeM3
      if (from === OUTSIDE_AIR) {
        target.oxygenFraction += OUTSIDE_OXYGEN_FRACTION*fraction
        target.sensibleJ += airHeatCapacity(volumeM3,0)*atmosphere.outsideTemperatureK
      } else {
        const source = previous[from], share = volumeM3/regions[from].volumeM3
        target.oxygenFraction += source.oxygenFraction*fraction
        target.smokeKg += source.smokeKg*share
        target.steamKg += source.steamKg*share
        target.fogKg += (source.fogKg ?? 0)*share
        target.sensibleJ += source.sensibleJ*share
      }
    }
    for (const {a,b,volumeM3} of swaps) {
      receive(a,b,volumeM3/scale)
      if (a !== OUTSIDE_AIR) receive(b,a,volumeM3/scale)
    }
    boundSwapMasses(next,used)
    for (const [index,{air,climate,volumeM3}] of regions.entries()) {
      if (!used[index]) continue
      const {oxygenFraction,smokeKg,steamKg,fogKg,sensibleJ} = next[index]
      climate.ambientTemperatureK = Math.min(MAX_TEMPERATURE_K,sensibleJ/airHeatCapacity(volumeM3,steamKg,fogKg))
      air.oxygenFraction = Math.min(1,oxygenFraction)
      air.smokeKg = smokeKg
      air.steamKg = steamKg
      air.fogKg = fogKg
    }
  }
}
