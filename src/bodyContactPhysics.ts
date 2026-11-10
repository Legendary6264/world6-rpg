import { bodyRegionDefs, partCondition } from './characterBody'
import { artifactCompatibility } from './creationRules'
import { workingItem } from './rpgParameters'
import { objectBounds, segmentSlab } from './sceneGeometry'
import type { ObjectBounds } from './sceneGeometry'
import type { Scene } from './sceneTypes'
import type { Actor, World } from './rpgEngine'
import type { MovementPiece } from './sceneMovement'
import type { CircuitBridge, ShockGrip } from './electricalCircuit'
import type { ContactHazardProfile, ContactKind } from './contactProfiles'
import { liquidWaterHeight, supportsSceneTokens, waterEnthalpy, waterPhase } from './waterPhysics'
import { sceneAir } from './sceneAir'

const EPS = 1e-7, MAX_CONTACT_CHECKS = 200000
const axes = ['x','y','z'] as const
type Protection = {dryOhm:number;wetOhm:number;heatTransmission:number;acidTransmission:number}
export type ContactDose = {actorId:string;region:string;kind:ContactKind;doseHp:number;shieldedHp:number}
export type ContactOutcome = ContactDose & {damage:number}

function protectionFor(actor:Actor,region:string):Protection {
  const result:Protection = {dryOhm:0,wetOhm:0,heatTransmission:1,acidTransmission:1}
  for (const item of actor.rpg.inventory) {
    const protection = item.contactProtection
    if (!protection || !item.covers.includes(region) || !workingItem(item) || !artifactCompatibility(actor,item).ok) continue
    const condition = item.maximumDurability ? item.durability/item.maximumDurability : 1
    result.dryOhm += condition*protection.dryOhm
    result.wetOhm += condition*protection.wetOhm
    result.heatTransmission *= 1-condition*(1-protection.heatTransmission)
    result.acidTransmission *= 1-condition*(1-protection.acidTransmission)
  }
  return result
}

export function shockBridges(world:World,scene:Scene,profile:ContactHazardProfile,grips:readonly ShockGrip[]):CircuitBridge[] {
  return grips.flatMap(({actorId,objectId,handRegion,footRegion})=>{
    const actor = world.characters.find(a=>a.id===actorId)
    if (!actor || !Object.hasOwn(actor.body.parts,handRegion) || !Object.hasOwn(actor.body.parts,footRegion)) {
      throw Error('Для хвата разряда выбери существующего героя и две разные области его тела.')
    }
    const token = scene.tokens.find(t=>t.actorId===actorId), object = scene.objects.find(o=>o.id===objectId)
    if (!token || !object || token.support.kind==='air' || actor.rpg.dead || actor.body.consciousness!=='awake' ||
        ['absent','disabled'].includes(partCondition(actor.body.parts[handRegion])) || !actor.body.parts[footRegion].present) return []
    const box = objectBounds(object)
    const handPoint = {
      x:Math.max(box.min.x,Math.min(box.max.x,token.x)),
      y:Math.max(box.min.y,Math.min(box.max.y,token.y)),
      z:Math.max(box.min.z,Math.min(box.max.z,token.z+1)),
    }
    // Master confirms the grip. Recheck a bounded reach at the actual release,
    // because the hero or object may have moved since the declaration.
    if (Math.hypot(handPoint.x-token.x,handPoint.y-token.y)>token.diameter/2+.75 ||
        handPoint.z<token.z-EPS || handPoint.z>token.z+1.8) return []
    return [{actorId,bodyResistanceOhm:profile.bodyResistanceOhm,
      hand:{point:handPoint,objectId,region:handRegion,...protectionFor(actor,handRegion)},
      foot:{point:{x:token.x,y:token.y,z:token.z},region:footRegion,
        ...(token.support.kind==='object'?{objectId:token.support.objectId}:{}),...protectionFor(actor,footRegion)},
    }]
  })
}

type Rates = {heat:number;acid:number}
type Surface = ObjectBounds & Rates
const heatRate = (temperatureK:number,profile:ContactHazardProfile) => Math.max(0,temperatureK-profile.burnAboveK)/profile.heatKelvinSecondsPerHp
function surfaces(scene:Scene,profile:ContactHazardProfile):Surface[] {
  const air = sceneAir(scene)
  return scene.objects.flatMap(object=>{
    if (object.water) {
      const height = liquidWaterHeight(object.water,object.height)
      if (height<=EPS) return []
      const temperatureK = waterPhase(waterEnthalpy(object.water,air?.at(object).climate.ambientTemperatureK ??
        scene.physics?.ambientTemperatureK)).temperatureK
      const heat = heatRate(temperatureK,profile)
      const litres = object.width*object.depth*height*1000
      const excess = object.water.base==='pure' ? Math.max(0,object.water.reagentMol ?? 0) : 0
      const acid = litres>0 ? Math.min(1e9,excess/litres/profile.acidMolarSecondsPerHp) : 0
      return heat || acid ? [{...objectBounds({...object,height}),heat,acid}] : []
    }
    if (!object.physics || object.kind==='door' && object.open || !supportsSceneTokens(object)) return []
    const heat = heatRate(object.physics.temperatureK,profile)
    if (!heat) return []
    const bounds = objectBounds(object), top = bounds.max.z
    return [{...bounds,min:{...bounds.min,z:top-EPS},max:{...bounds.max,z:top+EPS},heat,acid:0}]
  })
}

function supportedRegions(actor:Actor):string[] {
  const parts = actor.body.parts, defs = bodyRegionDefs(actor.body)
  return (['left','right'] as const).flatMap(side=>{
    const supported = defs.filter(({key,group})=>group===side+'Leg' && parts[key].present && parts[key].maximum>0)
    const region = supported.find(({key})=>key===side+'Foot') ?? supported[0]
    return region && parts[region.key].current>0 ? [region.key] : []
  })
}

function pieceDose(piece:MovementPiece,active:Surface[],check:()=>void):Rates {
  const spans = active.flatMap(surface=>{
    check()
    let start=0,end=1
    for (const axis of axes) {
      const span = segmentSlab(piece.a[axis],piece.b[axis],surface.min[axis],surface.max[axis])
      if (!span) return []
      start=Math.max(start,span[0]);end=Math.min(end,span[1])
    }
    return end>start ? [{start,end,heat:surface.heat,acid:surface.acid}] : []
  })
  const result = {heat:0,acid:0}, duration = piece.end-piece.start
  if (!spans.length) return result
  const cuts = [...new Set(spans.flatMap(({start,end})=>[start,end]))].sort((a,b)=>a-b)
  for (let i=1;i<cuts.length;i++) {
    const left = cuts[i-1], right = cuts[i], fraction = (right-left)*duration
    let heat=0,acid=0
    for (const span of spans) {
      check()
      if (span.start<=left && span.end>=right) { heat=Math.max(heat,span.heat);acid=Math.max(acid,span.acid) }
    }
    result.heat+=heat*fraction
    result.acid+=acid*fraction
  }
  return result
}

export function contactChecker() {
  let checks = 0
  return ()=>{
    if (++checks>MAX_CONTACT_CHECKS) throw Error('Слишком много контактов со средой за один раунд. Сократи раунд или число поверхностей.')
  }
}

function protectedDoses(actor:Actor,regions:string[],total:Rates):ContactDose[] {
  return regions.flatMap(region=>{
    const {heatTransmission,acidTransmission} = protectionFor(actor,region)
    return ([['heat',heatTransmission],['acid',acidTransmission]] as const).flatMap(([kind,transmission])=>total[kind]>EPS ?
      [{actorId:actor.id,region,kind,doseHp:total[kind]*transmission,shieldedHp:total[kind]*(1-transmission)}] : [])
  })
}

export function surfaceDoses(world:World,scene:Scene,profile:ContactHazardProfile,seconds:number,
    movement:ReadonlyMap<string,MovementPiece[]>,airborne:ReadonlySet<string>,check:()=>void,climbs?:ReadonlyMap<string,string>):ContactDose[] {
  const active = surfaces(scene,profile)
  if (!active.length) return []
  const actors = new Map(world.characters.map(actor=>[actor.id,actor]))
  return scene.tokens.flatMap(token=>{
    const actor = actors.get(token.actorId), trace = movement.get(token.actorId)
    if (!actor || actor.rpg.dead || airborne.has(actor.id) || token.fall || !trace && token.support.kind==='air') return []
    const climb = climbs?.get(actor.id)
    if (climb) {
      const anchor = scene.objects.find(o=>o.id===climb)
      const heat = anchor?.physics ? heatRate(anchor.physics.temperatureK,profile)*seconds : 0
      return heat>EPS ? protectedDoses(actor,['leftHand','rightHand'],{heat,acid:0}) : []
    }
    const regions = supportedRegions(actor)
    if (!regions.length) return []
    const total = {heat:0,acid:0}
    for (const piece of trace ?? [{start:0,end:1,a:token,b:token}]) {
      const sample = pieceDose(piece,active,check)
      total.heat += sample.heat*seconds
      total.acid += sample.acid*seconds
    }
    if (!total.heat && !total.acid) return []
    return protectedDoses(actor,regions,total)
  })
}
