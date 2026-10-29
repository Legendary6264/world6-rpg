import {abilityAreaContains} from './abilityArea'
import type {AbilitySpatial} from './rpgTypes'
import type {SceneAbilityAim} from './sceneAbilityAim'
import type {PerceivedMap} from './scenePerception'
import type {ScenePosition} from './sceneTypes'
export type AimTarget={kind:'object'|'contact';id:string;label:string;point:ScenePosition}
export function aimSpatial(aim:SceneAbilityAim):AbilitySpatial {
 const v=aim.visual,includeCaster=aim.includeCaster??false,lengthM=Math.hypot(v.end.x-v.start.x,v.end.y-v.start.y,v.end.z-v.start.z)
 return v.shape==='point'?{shape:'point',includeCaster}:v.shape==='sphere'?{shape:'sphere',includeCaster,radiusM:v.radius}:v.shape==='beam'?{shape:'beam',includeCaster,lengthM,radiusM:v.radius}:{shape:'cone',includeCaster,lengthM,angleDeg:v.coneAngleDeg}
}
export function knownAimTargets(map:PerceivedMap,aim:SceneAbilityAim|null):AimTarget[]{
 if(!aim||!aim.valid||aim.sceneId!==map.frame.id)return []
 const spatial=aimSpatial(aim),visible=(p:ScenePosition)=>map.areas.some(a=>a.visible&&p.x>=a.x&&p.x<=a.x+a.width&&p.y>=a.y&&p.y<=a.y+a.depth&&p.z>=a.z&&p.z<=a.z+a.height)
 const inside=(p:ScenePosition)=>visible(p)&&abilityAreaContains(aim.visual.start,aim.visual.end,spatial,p)
 const objects: AimTarget[]=map.objects.filter(o=>o.visible).map(o=>({kind:'object',id:o.id,label:o.name,point:{x:o.x,y:o.y,z:o.z+o.height/2}}))
 const contacts:AimTarget[]=map.contacts.flatMap(c=>c.kind==='sound'||c.z===undefined||c.kind==='self'&&!spatial.includeCaster?[]:[{kind:'contact',id:c.id,label:c.label,point:{x:c.x,y:c.y,z:c.z}}])
 return [...contacts,...objects].filter(t=>inside(t.point))
}
