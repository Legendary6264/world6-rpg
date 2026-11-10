import { defaultExposureProfile, exposureKinds, stepExposureLoad } from './exposureProfiles'
import type { ExposureKind, ExposureLoad, ExposureProfile } from './exposureProfiles'
import { airSpans, sceneAir } from './sceneAir'
import type { AirRegion, AirSpan, SceneAir } from './sceneAir'
import { fallTravelSeconds } from './structuralPhysics'
import type { MovementPiece } from './sceneMovement'
import type { Scene, SceneToken } from './sceneTypes'
import type { Actor, World } from './rpgEngine'
import { AIRWAY_HEIGHT, airwaySubmerged, liquidSpans, mergeSpans } from './aquaticMotion'
import type { AquaticProfile } from './aquaticMotion'
import { breathesUnderwater } from './characterBody'
import type { BodyState } from './characterBody'

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
export const submergedAirBreather = (scene:Scene,token:SceneToken,body:BodyState) =>
  !!scene.physics?.aquatics && token.support.kind==='water' && airwaySubmerged(scene,token,token.support.heightM) && !breathesUnderwater(body)

function applyLoad(actor:Actor,intensity:ExposureLoad|undefined,seconds:number,responseSeconds:number,holdOxygen=false) {
  const before = actor.body.exposure
  const next = stepExposureLoad(before,intensity,seconds,responseSeconds,actor.body.exposureProtection)
  if (holdOxygen && before?.oxygen) {
    actor.body.exposure = {smoke:0,heat:0,cold:0,...next,oxygen:before.oxygen}
  } else if (next || before) actor.body.exposure = next
}

function applyMedium(actor:Actor,air:ExposureLoad|undefined,seconds:number,responseSeconds:number,
    aquatic:AquaticProfile|null|undefined,submerged:boolean) {
  const used = actor.body.breathUsedSeconds ?? 0
  if (aquatic && submerged && !breathesUnderwater(actor.body)) {
    const holding = Math.min(seconds,Math.max(0,aquatic.breathSeconds-used))
    actor.body.breathUsedSeconds = Math.min(aquatic.breathSeconds,used+seconds)
    if (holding>0) applyLoad(actor,undefined,holding,responseSeconds,true)
    if (seconds>holding) applyLoad(actor,{oxygen:4,smoke:0,heat:0,cold:0},seconds-holding,responseSeconds)
    return
  }
  if (used>0 && (submerged || !(air && air.oxygen>0) || actor.body.exposureProtection?.breathing)) {
    actor.body.breathUsedSeconds = Math.max(0,used-2*seconds) || null
  }
  if (air || actor.body.exposure) applyLoad(actor,submerged ? undefined : air,seconds,responseSeconds)
}

// When time advances, rooms outside the simulated round use their saved air.
// Unplaced heroes and scenes with exposure disabled supply recovery time.
export function advanceStationaryExposure(world:World,seconds:number,simulatedSceneId?:string) {
  const conditions = new Map<string,{intensity?:ExposureLoad; responseSeconds:number; aquatic?:AquaticProfile|null; submerged:boolean}>()
  const skipped = new Set<string>()
  for (const scene of world.campaign.scenes?.scenes ?? []) {
    const profile = scene.physics?.exposure, aquatic = scene.physics?.aquatics
    if (!profile && !aquatic) continue
    if (scene.id === simulatedSceneId) {
      for (const token of scene.tokens) skipped.add(token.actorId)
      continue
    }
    const layout = profile ? sceneAir(scene) : undefined
    const byRegion = layout && profile ? layout.regions.map(region=>strain(readAir(region),profile)) : []
    for (const token of scene.tokens) {
      const submerged = !!aquatic && token.support.kind==='water' && airwaySubmerged(scene,token,token.support.heightM)
      conditions.set(token.actorId,{intensity:layout ? byRegion[layout.indexAt(token)] : undefined,
        responseSeconds:profile?.responseSeconds ?? defaultExposureProfile.responseSeconds,aquatic,submerged})
    }
  }
  for (const actor of world.characters) {
    if (actor.rpg.dead || skipped.has(actor.id)) continue
    const condition = conditions.get(actor.id)
    if (condition || actor.body.exposure || actor.body.breathUsedSeconds) {
      applyMedium(actor,condition?.intensity,seconds,condition?.responseSeconds ?? 1,condition?.aquatic,!!condition?.submerged)
    }
  }
}

function exposureTrack(layout:SceneAir,token:SceneToken,seconds:number,gravity:number,
    pieces:MovementPiece[]|undefined, fall:ExposureFallStart|undefined):AirSpan[] {
  if (layout.regions.length > 1 && pieces) {
    return pieces.flatMap(piece=>airSpans(layout,piece.a,piece.b,piece.arcM).map(span=>({
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

type MediumSpan = AirSpan & {submerged?:true}
function withWater(scene:Scene,token:SceneToken,air:AirSpan[],pieces:MovementPiece[]|undefined,heightM:number,check:()=>void):MediumSpan[] {
  const submerged = mergeSpans((pieces ?? [{start:0,end:1,a:token,b:token}]).flatMap(piece=>
    liquidSpans(scene,piece.a,piece.b,heightM*AIRWAY_HEIGHT,0,piece.arcM ?? 0,check).map<[number,number]>(([start,end])=>
      [lerp(piece.start,piece.end,start),lerp(piece.start,piece.end,end)])))
  return air.flatMap(span=>{
    const result:MediumSpan[] = []
    let cursor=span.start
    for (const [start,end] of submerged) {
      const left=Math.max(cursor,start), right=Math.min(span.end,end)
      if (right<=left) continue
      if (cursor<left) result.push({...span,start:cursor,end:left})
      result.push({...span,start:left,end:right,submerged:true})
      cursor=right
    }
    if (cursor<span.end) result.push({...span,start:cursor})
    return result
  })
}

export function roundExposureObserver(world:World,scene:Scene,profile:ExposureProfile|null|undefined,seconds:number,
    movements:ReadonlyMap<string,MovementPiece[]>, falls:ReadonlyMap<string,ExposureFallStart>,
    swimming?:{heights:ReadonlyMap<string,number>; underwaterSeconds:Map<string,number>; check:()=>void}) {
  const actors = new Map(world.characters.map(actor=>[actor.id,actor]))
  const aquatic = scene.physics?.aquatics
  const responseSeconds = profile?.responseSeconds ?? defaultExposureProfile.responseSeconds
  let before:AirSample[]|undefined, previous = 0
  let tracks:{actor:Actor; spans:MediumSpan[]; next:number}[] = []
  return (layout:SceneAir|undefined,fraction:number) => {
    const after = profile && layout ? layout.regions.map(readAir) : []
    if (!before) {
      tracks = scene.tokens.flatMap(token=>{
        const actor = actors.get(token.actorId)
        if (!actor || actor.rpg.dead) return []
        const pieces = movements.get(actor.id)
        const air = profile && layout ? exposureTrack(layout,token,seconds,scene.physics?.gravityMs2 ?? 9.81,
          pieces,falls.get(actor.id)) : [{index:0,start:0,end:1}]
        const heightM = swimming?.heights.get(actor.id)
        const spans = aquatic && swimming && heightM!==undefined ? withWater(scene,token,air,pieces,heightM,swimming.check) : air
        return [{actor,spans,next:0}]
      })
    } else {
      for (const track of tracks) {
        while (track.next < track.spans.length && track.spans[track.next].start < fraction) {
          const span = track.spans[track.next], start = Math.max(span.start,previous), end = Math.min(span.end,fraction)
          if (end > start) {
            const weight = ((start+end)/2-previous)/(fraction-previous)
            const a = before[span.index], b = after[span.index]
            const sample = a && b && {oxygenFraction:lerp(a.oxygenFraction,b.oxygenFraction,weight),
              smokeMgM3:lerp(a.smokeMgM3,b.smokeMgM3,weight), temperatureK:lerp(a.temperatureK,b.temperatureK,weight)}
            const elapsed = seconds*(end-start)
            applyMedium(track.actor,sample && profile ? strain(sample,profile) : undefined,elapsed,responseSeconds,aquatic,!!span.submerged)
            if (span.submerged && swimming) {
              const {underwaterSeconds} = swimming, id = track.actor.id
              underwaterSeconds.set(id,(underwaterSeconds.get(id) ?? 0)+elapsed)
            }
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
