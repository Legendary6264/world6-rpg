import { exposureKinds, stepExposureLoad } from './exposureProfiles'
import type { ExposureKind, ExposureLoad, ExposureProfile } from './exposureProfiles'
import { airSpans, sceneAir } from './sceneAir'
import type { AirRegion, AirSpan, SceneAir } from './sceneAir'
import { fallTravelSeconds } from './structuralPhysics'
import type { MovementPiece } from './sceneMovement'
import type { Scene, SceneToken } from './sceneTypes'
import type { Actor, World } from './rpgEngine'

type AirSample = {oxygenFraction:number; smokeMgM3:number; temperatureK:number}
export type ExposureFallStart = {z:number;speedMs:number}
export type ExposureChange = {actorId:string; changes:{kind:ExposureKind; from:number; to:number}[]}
const readAir = ({air,climate,volumeM3}:AirRegion):AirSample => ({
  oxygenFraction:air.oxygenFraction, smokeMgM3:air.smokeKg*1e6/volumeM3, temperatureK:climate.ambientTemperatureK,
})
const strain = (sample:AirSample, profile:ExposureProfile):ExposureLoad => ({
  oxygen:(profile.oxygenFraction-sample.oxygenFraction)/.05,
  smoke:sample.smokeMgM3/profile.smokeMgM3-1,
  heat:(sample.temperatureK-profile.hotK)/10, cold:(profile.coldK-sample.temperatureK)/10,
})
const lerp = (a:number,b:number,t:number) => a+(b-a)*t

function applyLoad(actor:Actor,intensity:ExposureLoad|undefined,seconds:number,responseSeconds:number) {
  const before = actor.body.exposure
  const next = stepExposureLoad(before,intensity,seconds,responseSeconds,actor.body.exposureProtection)
  if (next || before) actor.body.exposure = next
}

// When time advances, rooms outside the simulated round use their saved air.
// Unplaced heroes and scenes with exposure disabled supply recovery time.
export function advanceStationaryExposure(world:World,seconds:number,simulatedSceneId?:string) {
  const conditions = new Map<string,{intensity:ExposureLoad; responseSeconds:number}>(), skipped = new Set<string>()
  for (const scene of world.campaign.scenes?.scenes ?? []) {
    const profile = scene.physics?.exposure
    if (!profile) continue
    if (scene.id === simulatedSceneId) {
      for (const token of scene.tokens) skipped.add(token.actorId)
      continue
    }
    const layout = sceneAir(scene)
    if (!layout) continue
    const byRegion = layout.regions.map(region=>strain(readAir(region),profile))
    for (const token of scene.tokens) {
      conditions.set(token.actorId,{intensity:byRegion[layout.indexAt(token)],responseSeconds:profile.responseSeconds})
    }
  }
  for (const actor of world.characters) {
    if (actor.rpg.dead || skipped.has(actor.id)) continue
    const condition = conditions.get(actor.id)
    if (condition || actor.body.exposure) applyLoad(actor,condition?.intensity,seconds,condition?.responseSeconds ?? 1)
  }
}

function exposureTrack(layout:SceneAir,token:SceneToken,seconds:number,gravity:number,
    pieces:MovementPiece[]|undefined, fall:ExposureFallStart|undefined):AirSpan[] {
  if (layout.regions.length > 1 && pieces) {
    return pieces.flatMap(piece=>airSpans(layout,piece.a,piece.b).map(span=>({
      index:span.index, start:lerp(piece.start,piece.end,span.start), end:lerp(piece.start,piece.end,span.end),
    })))
  }
  if (layout.regions.length > 1 && fall && fall.z > token.z) {
    const distance = fall.z-token.z
    const at = (fraction:number) => Math.min(1,fallTravelSeconds(distance*fraction,fall.speedMs,gravity)/seconds)
    const result = airSpans(layout,{...token,z:fall.z},token).map(span=>({
      index:span.index, start:at(span.start), end:at(span.end),
    }))
    const stopped = at(1)
    if (stopped < 1) result.push({index:layout.indexAt(token),start:stopped,end:1})
    return result
  }
  return [{index:layout.indexAt(token),start:0,end:1}]
}

export function roundExposureObserver(world:World,scene:Scene,profile:ExposureProfile,seconds:number,
    movements:ReadonlyMap<string,MovementPiece[]>, falls:ReadonlyMap<string,ExposureFallStart>) {
  const actors = new Map(world.characters.map(actor=>[actor.id,actor]))
  let before:AirSample[]|undefined, previous = 0
  let tracks:{actor:Actor; spans:AirSpan[]; next:number}[] = []
  return (layout:SceneAir,fraction:number) => {
    const after = layout.regions.map(readAir)
    if (!before) {
      tracks = scene.tokens.flatMap(token=>{
        const actor = actors.get(token.actorId)
        if (!actor || actor.rpg.dead) return []
        const spans = exposureTrack(layout,token,seconds,scene.physics?.gravityMs2 ?? 9.81,
          movements.get(actor.id),falls.get(actor.id))
        return [{actor,spans,next:0}]
      })
    } else {
      for (const track of tracks) {
        while (track.next < track.spans.length && track.spans[track.next].start < fraction) {
          const span = track.spans[track.next], start = Math.max(span.start,previous), end = Math.min(span.end,fraction)
          if (end > start) {
            const weight = ((start+end)/2-previous)/(fraction-previous)
            const a = before[span.index], b = after[span.index]
            const sample = {oxygenFraction:lerp(a.oxygenFraction,b.oxygenFraction,weight),
              smokeMgM3:lerp(a.smokeMgM3,b.smokeMgM3,weight), temperatureK:lerp(a.temperatureK,b.temperatureK,weight)}
            applyLoad(track.actor,strain(sample,profile),seconds*(end-start),profile.responseSeconds)
          }
          if (span.end > fraction) break
          track.next++
        }
      }
    }
    before = after
    previous = fraction
  }
}

export function exposureChanges(before:World,after:World):ExposureChange[] {
  const previous = new Map(before.characters.map(actor=>[actor.id,actor.body.exposure]))
  return after.characters.flatMap(actor=>{
    const old = previous.get(actor.id), load = actor.body.exposure
    const changes = exposureKinds.flatMap(kind=>{
      const from = old?.[kind] ?? 0, to = load?.[kind] ?? 0
      return Math.abs(from-to)>1e-9 ? [{kind,from,to}] : []
    })
    return changes.length ? [{actorId:actor.id,changes}] : []
  })
}
