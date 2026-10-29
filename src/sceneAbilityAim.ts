import {resolveAbilityVisual} from './abilityVisuals'
import type {DeclarationOptions,DeclarationTarget} from './actionDeclarations'
import type {PerceivedMap} from './scenePerception'
import type {ScenePosition} from './sceneTypes'
import type {SceneAbilityVisual} from './sceneAbilityVisuals'
import type {SceneTrajectoryHit} from './sceneTrajectory'
export type SceneAbilityAim={sceneId:string;name:string;visual:SceneAbilityVisual;valid:boolean;includeCaster?:boolean;message:string;distanceM:number;rangeM?:number;obstruction?:SceneTrajectoryHit}
type Ability=DeclarationOptions['abilities'][number]
const finite=(p:ScenePosition)=>Object.values(p).every(Number.isFinite)
export function buildSceneAbilityAim(map:PerceivedMap|null,ability:Ability|undefined,target:DeclarationTarget|null):SceneAbilityAim|null {
 if(!map||!ability||!target||target.kind==='none')return null
 const self=map.contacts.find(c=>c.kind==='self');if(!self||self.z===undefined)return null
 const start={x:self.x,y:self.y,z:self.z},contact=target.kind==='contact'?map.contacts.find(c=>c.id===target.id&&c.kind!=='sound'):undefined
 const end='point' in target?{...target.point}:target.kind==='self'?{...start}:contact&&contact.z!==undefined?{x:contact.x,y:contact.y,z:contact.z}:null
 if(!end||!finite(start)||!finite(end))return null
 const f=map.frame,spatial=ability.spatial,distanceM=Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z),rangeM=ability.rangeM
 let message='Область прицеливания. Попадание и последствия подтверждает мастер.'
 let valid=true
 if(end.x<0||end.x>f.width||end.y<0||end.y>f.depth||end.z<f.minZ||end.z>f.maxZ){valid=false;message='Точка находится за границей сцены.'}
 else if(rangeM!==undefined&&distanceM>rangeM+1e-8){valid=false;message='Точка вне дальности способности.'}
 else if(spatial&&(spatial.shape==='beam'||spatial.shape==='cone')&&(distanceM<=1e-8||rangeM!==undefined&&spatial.lengthM>rangeM)){valid=false;message=distanceM<=1e-8?'Выбери направление от героя.':'Длина области превышает дальность способности.'}
 const aim={...end}
 if(spatial&&'lengthM' in spatial&&distanceM>1e-8){for(const k of ['x','y','z'] as const)aim[k]=start[k]+(end[k]-start[k])*spatial.lengthM/distanceM}
 return {sceneId:f.id,name:ability.name,valid,includeCaster:spatial?.includeCaster??target.kind==='self',message,distanceM,...(rangeM===undefined?{}:{rangeM}),visual:{id:'aim-'+ability.id,spec:resolveAbilityVisual({visualEffect:ability.visualEffect}),start,end:aim,phase:'residue',shape:spatial?.shape??'point',radius:spatial&&'radiusM' in spatial?spatial.radiusM:.25,coneAngleDeg:spatial?.shape==='cone'?spatial.angleDeg:45}}
}
// World-space outlines shared by SVG and WebGL, including vertical aim. They
// describe geometry only and never identify undisclosed occupants of an area.
export function sceneAbilityAimLines(aim:SceneAbilityAim):ScenePosition[][] {
 const {start,end,shape,radius,coneAngleDeg}=aim.visual,lines:ScenePosition[][]=[[start,end]],ring=(center:ScenePosition,u:ScenePosition,v:ScenePosition,r:number)=>Array.from({length:33},(_,i)=>{const a=i*Math.PI/16;return {x:center.x+(u.x*Math.cos(a)+v.x*Math.sin(a))*r,y:center.y+(u.y*Math.cos(a)+v.y*Math.sin(a))*r,z:center.z+(u.z*Math.cos(a)+v.z*Math.sin(a))*r}})
 const x={x:1,y:0,z:0},y={x:0,y:1,z:0},z={x:0,y:0,z:1}
 if(aim.obstruction){const p=aim.obstruction.point;for(const axis of ['x','y','z'] as const)lines.push([{...p,[axis]:p[axis]-.16},{...p,[axis]:p[axis]+.16}])}
 if(shape==='sphere'){lines.push(ring(end,x,y,radius),ring(end,x,z,radius),ring(end,y,z,radius))}
 else if(shape==='point'){lines.push(ring(end,x,y,.25),ring(end,x,z,.25))}
 else {
  const d={x:end.x-start.x,y:end.y-start.y,z:end.z-start.z},length=Math.hypot(d.x,d.y,d.z)
  if(length<1e-8)return lines
  const w={x:d.x/length,y:d.y/length,z:d.z/length},n=Math.hypot(w.x,w.y),u=n>1e-8?{x:-w.y/n,y:w.x/n,z:0}:x,v={x:w.y*u.z-w.z*u.y,y:w.z*u.x-w.x*u.z,z:w.x*u.y-w.y*u.x}
  const r=shape==='cone'?length*Math.tan(coneAngleDeg*Math.PI/360):radius,outer=ring(end,u,v,r),inner=ring(start,u,v,shape==='cone'?0:radius)
  lines.push(outer);if(shape==='beam')lines.push(inner)
  for(const i of [0,8,16,24])lines.push([inner[i],outer[i]])
 }
 return lines
}
