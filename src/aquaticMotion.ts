import { physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'
import { arcSlabs, segmentSlab } from './sceneGeometry'
import type { Scene, SceneObject, ScenePosition, SceneSupport } from './sceneTypes'
import { liquidWaterHeight, MIN_WATER_HEIGHT_M, waterIceCover } from './waterPhysics'

export type AquaticProfile = {version:1; swimSpeedMs:number; breathSeconds:number}
export const defaultAquaticProfile:AquaticProfile = {version:1,swimSpeedMs:1.25,breathSeconds:30}
export const MAX_BREATH_SECONDS = 600
export const validSwimHeight = (height:unknown):height is number => physicsNumber(height,.1,100)
export function isAquaticProfile(value:unknown):value is AquaticProfile {
  return physicsRecord(value) && physicsKeys(value,['version','swimSpeedMs','breathSeconds']) &&
    value.version===1 && physicsNumber(value.swimSpeedMs,.1,20) && physicsNumber(value.breathSeconds,1,MAX_BREATH_SECONDS)
}

export const SWIM_DRAFT = .4
export const AIRWAY_HEIGHT = .88
const EPS = 1e-6
type Span = [number,number]
type WaterBox = {object:SceneObject;top:number}

export function liquidBox(object:SceneObject):WaterBox|undefined {
  if (!object.water) return undefined
  const depth = liquidWaterHeight(object.water,object.height)
  return depth>=MIN_WATER_HEIGHT_M ? {object,top:object.z+depth} : undefined
}

function inFootprint(object:SceneObject,p:ScenePosition) {
  return Math.abs(p.x-object.x)<=object.width/2+EPS && Math.abs(p.y-object.y)<=object.depth/2+EPS
}

export function waterSupportAt(scene:Pick<Scene,'objects'>,p:ScenePosition,heightM:number):Extract<SceneSupport,{kind:'water'}>|undefined {
  let best:WaterBox|undefined
  for (const object of scene.objects) {
    const box = liquidBox(object)
    if (!box || !inFootprint(object,p) || p.z<object.z-EPS || p.z+SWIM_DRAFT*heightM>box.top+EPS) continue
    if (!best || box.top>best.top || box.top===best.top && object.id<best.object.id) best=box
  }
  return best && {kind:'water',objectId:best.object.id,heightM}
}

export function isTrappedByIce(scene:Pick<Scene,'objects'>,p:ScenePosition):boolean {
  return scene.objects.some(object=>waterIceCover(object)==='ice' && p.z>=object.z-EPS &&
    p.z<object.z+object.height-EPS && inFootprint(object,p))
}

export function airwaySubmerged(scene:Pick<Scene,'objects'>,p:ScenePosition,heightM:number) {
  const z = p.z+heightM*AIRWAY_HEIGHT
  return scene.objects.some(object=>{
    const box = liquidBox(object)
    return box && z>=object.z-EPS && z<box.top-EPS && inFootprint(object,p)
  })
}

// For breathing, sample a point above the feet. For propulsion, require a
// minimum amount of liquid above the feet.
export function liquidSpans(scene:Pick<Scene,'objects'>,a:ScenePosition,b:ScenePosition,headM:number,
    draftM:number,arcM:number,check:()=>void):Span[] {
  return scene.objects.flatMap(object=>{
    check()
    const box = liquidBox(object)
    if (!box) return []
    const x = segmentSlab(a.x,b.x,object.x-object.width/2-EPS,object.x+object.width/2+EPS)
    const y = segmentSlab(a.y,b.y,object.y-object.depth/2-EPS,object.y+object.depth/2+EPS)
    const top = box.top-draftM+(headM ? -EPS : EPS), bottom = object.z-EPS
    if (!x || !y || top<bottom) return []
    return arcSlabs(a.z+headM,b.z+headM,arcM,bottom,top).flatMap(([from,to])=>{
      const start=Math.max(from,x[0],y[0]), end=Math.min(to,x[1],y[1])
      return end>start ? [[start,end] as Span] : []
    })
  })
}

export function mergeSpans(ranges:Span[]):Span[] {
  const spans:Span[] = []
  for (const [start,end] of ranges.sort((a,b)=>a[0]-b[0])) {
    const previous = spans.at(-1)
    if (previous && start<=previous[1]+1e-12) previous[1]=Math.max(previous[1],end)
    else spans.push([start,end])
  }
  return spans
}
