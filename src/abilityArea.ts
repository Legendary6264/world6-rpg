import type {ScenePosition} from './sceneTypes'
import type {AbilitySpatial} from './rpgTypes'
const epsilon=1e-8
// Pure point membership. This does not decide visibility, collision, cover,
// eligibility, damage or distance to the chosen aim point.
export function abilityAreaContains(origin:ScenePosition,aim:ScenePosition,spatial:AbilitySpatial,p:ScenePosition):boolean {
 if(![origin,aim,p].every(v=>[v.x,v.y,v.z].every(Number.isFinite)))return false
 const distance=(a:ScenePosition,b:ScenePosition)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
 if(spatial.shape==='point')return distance(p,aim)<=epsilon
 if(spatial.shape==='sphere')return distance(p,aim)<=spatial.radiusM+epsilon
 const length=distance(origin,aim);if(length<=epsilon)return false
 const v={x:(aim.x-origin.x)/length,y:(aim.y-origin.y)/length,z:(aim.z-origin.z)/length},o={x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z},along=o.x*v.x+o.y*v.y+o.z*v.z
 if(along< -epsilon||along>spatial.lengthM+epsilon)return false
 const radial=Math.hypot(o.x-along*v.x,o.y-along*v.y,o.z-along*v.z)
 return radial<=(spatial.shape==='beam'?spatial.radiusM:along*Math.tan(spatial.angleDeg*Math.PI/360))+epsilon
}
