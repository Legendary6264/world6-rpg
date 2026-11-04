import {sceneAbilityAimLines} from './sceneAbilityAim'
import type {SceneAbilityAim} from './sceneAbilityAim'
import {visualPoint} from './sceneAbilityVisuals'
import type {VisualFrame} from './sceneAbilityVisuals'
import type {AimTarget} from './sceneAimTargets'
import type {ScenePosition} from './sceneTypes'

export const abilityAimColor=(aim:SceneAbilityAim)=>!aim.valid?'#ed936f':aim.obstruction?'#edbd79':'#a9e7bf'
export const abilityAimTargetColor=(target:AimTarget)=>target.isCaster?'#f4cc80':target.kind==='object'?'#8cc9f0':'#b5f1d0'

// Orthographic silhouettes of the actual 3D outline, including vertical axes.
// The source-to-destination guide and collision cross must not enlarge a sphere.
export function projectedAimSurface(aim:SceneAbilityAim,frame:VisualFrame){
 if(aim.visual.shape==='point')return []
 const points=sceneAbilityAimLines({...aim,obstruction:undefined}).slice(1).flat().map(p=>visualPoint(p,frame)).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.x-b.x||a.y-b.y)
 const unique=points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y)
 if(unique.length<3)return []
 type Point=typeof unique[number]
 const cross=(o:Point,a:Point,b:Point)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x)
 const half=(input:Point[])=>{const result:Point[]=[];for(const p of input){while(result.length>1&&cross(result.at(-2)!,result.at(-1)!,p)<=0)result.pop();result.push(p)}return result.slice(0,-1)}
 return [...half(unique),...half([...unique].reverse())]
}

export function aimTargetLines(target:AimTarget):ScenePosition[][]{
 const p=target.point,r=target.kind==='contact'?.43:.28
 if(target.kind==='object')return [[{x:p.x-r,y:p.y,z:p.z},{x:p.x,y:p.y-r,z:p.z},{x:p.x+r,y:p.y,z:p.z},{x:p.x,y:p.y+r,z:p.z},{x:p.x-r,y:p.y,z:p.z}]]
 return [-1,1].flatMap(x=>[-1,1].map(y=>[{x:p.x+x*r*.5,y:p.y+y*r,z:p.z+.025},{x:p.x+x*r,y:p.y+y*r,z:p.z+.025},{x:p.x+x*r,y:p.y+y*r*.5,z:p.z+.025}]))
}
