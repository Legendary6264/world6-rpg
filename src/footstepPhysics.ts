import { isGroundMovement } from './actionDeclarations'
import { skillValue } from './creationRules'
import { amountFromNumber } from './exactWork'
import type { ExactAmount } from './exactWork'
import { movementPosition } from './sceneMovement'
import type { MovementPlan } from './sceneMovement'
import { liquidWaterHeight, supportsSceneTokens, waterIceCover } from './waterPhysics'
import type { Actor } from './rpgEngine'
import type { Scene, ScenePosition } from './sceneTypes'
import type { TimedSound } from './roundWaveSound'

const MAX_STEPS_PER_ROUTE = 12
const EPS = 1e-6
const numberOf = (amount:ExactAmount) => Number(amount.numerator)/Number(amount.denominator)
const floorNoise:Record<string,number> = {wood:2,stone:3,steel:6,copper:6,cloth:-5,sand:-4}

function surfaceNoise(scene:Scene,p:ScenePosition) {
  let surface=0, water=0
  for (const object of scene.objects) {
    if (Math.abs(p.x-object.x)>object.width/2 || Math.abs(p.y-object.y)>object.depth/2) continue
    const onTop= Math.abs(p.z-object.z-object.height)<EPS && supportsSceneTokens(object)
    if (object.water && object.height>EPS) {
      const liquidTop=object.z+liquidWaterHeight(object.water,object.height)
      if (liquidTop>object.z+EPS && p.z>=object.z-EPS && p.z<=liquidTop+EPS) water=Math.max(water,6)
      else if (waterIceCover(object)==='ice' && (onTop || Math.abs(p.z-object.z)<EPS)) water=Math.max(water,3)
    } else if (onTop && object.physics) {
      const material=object.physics.material.id
      surface=Object.hasOwn(floorNoise,material) ? floorNoise[material] : 0
    }
  }
  return water || surface
}

export function footsteps(scene:Scene,plans:MovementPlan[],actors:Actor[],startSeconds:number,fromMs:number,toMs:number):TimedSound[] {
  const byId=new Map(actors.map(actor=>[actor.id,actor]))
  const events:TimedSound[]=[]
  for (const plan of plans) {
    const {work,distance}=plan
    if (work.action.kind!=='move' || !isGroundMovement(work.action.support) || distance<=EPS) continue
    const actor=byId.get(work.actorId)
    if (!actor || actor.rpg.dead || actor.body.consciousness!=='awake') continue
    const start=numberOf(plan.startMs), duration=numberOf(plan.endMs)-start
    const left=numberOf(work.amount.remaining)/numberOf(work.amount.total), before=1-left
    const count=Math.max(1,Math.min(MAX_STEPS_PER_ROUTE,Math.ceil(distance/.75)))
    const pace=Math.min(4,Math.max(.1,distance*left/duration*1000/1.5))
    const quiet=work.action.support==='sneak'
    const reduction=quiet ? 8+Math.min(10,Math.sqrt(skillValue(actor,'stealth',startSeconds))) : 0
    for (let i=0;i<count;i++) {
      // Number the impulses across the whole route, including a saved part.
      const progress=(i+.5)/count
      if (progress<=before) continue
      const atMs=start+(progress-before)/left*duration
      if (atMs<=fromMs || atMs>toMs) continue
      const point=movementPosition(plan,amountFromNumber(atMs))
      const levelDbAt1m=46+12*Math.log10(pace)+surfaceNoise(scene,point)-reduction
      events.push({atMs,source:{kind:'footstep',point,actorId:actor.id,levelDbAt1m}})
    }
  }
  return events.sort((a,b)=>a.atMs-b.atMs)
}
