import type {Scene,SceneObject,ScenePosition} from './sceneTypes'

export type SceneTrajectoryHit={kind:'object'|'ground';objectId?:string;name:string;point:ScenePosition;distanceM:number}
const epsilon=1e-8
// Saved dimensions are world-aligned collision bounds, including quarter turns.
// This is a centre-line query, not a triangle/particle or aperture simulation.
function entryFraction(start:ScenePosition,end:ScenePosition,o:SceneObject):number|null {
 let enter=0,leave=1
 const bounds={x:[o.x-o.width/2,o.x+o.width/2],y:[o.y-o.depth/2,o.y+o.depth/2],z:[o.z,o.z+o.height]}
 for(const axis of ['x','y','z'] as const){
  const [min,max]=bounds[axis],delta=end[axis]-start[axis]
  if(Math.abs(delta)<=epsilon){if(start[axis]<min-epsilon||start[axis]>max+epsilon)return null;continue}
  const a=(min-start[axis])/delta,b=(max-start[axis])/delta
  enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b))
  if(leave<enter-epsilon)return null
 }
 // Starting on a face and moving away must not hit that same face again.
 return leave<=epsilon||enter>1+epsilon?null:Math.max(0,Math.min(1,enter))
}
export function firstSceneTrajectoryHit(scene:Pick<Scene,'objects'|'groundZ'>,start:ScenePosition,end:ScenePosition,ignoreIds:readonly string[]=[]):SceneTrajectoryHit|null {
 if(![start.x,start.y,start.z,end.x,end.y,end.z].every(Number.isFinite))return null
 const length=Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z);if(length<=epsilon)return null
 const ignored=new Set(ignoreIds);let first:{fraction:number;kind:'object'|'ground';objectId?:string;name:string}|null=null
 for(const o of scene.objects){
  if(ignored.has(o.id)||!o.blocksMovement||o.height<=epsilon||o.kind==='door'&&(o.open||o.asset==='dungeon-arch'||o.artwork==='expanded-object-archway'))continue
  const fraction=entryFraction(start,end,o);if(fraction===null)continue
  if(!first||fraction<first.fraction-epsilon||Math.abs(fraction-first.fraction)<=epsilon&&o.id<(first.objectId??''))first={fraction,kind:'object',objectId:o.id,name:o.name}
 }
 if(end.z<scene.groundZ-epsilon&&start.z>=scene.groundZ-epsilon){
  const fraction=(scene.groundZ-start.z)/(end.z-start.z)
  if(!first||fraction<first.fraction-epsilon)first={fraction,kind:'ground',name:'Земля'}
 }
 if(!first)return null
 const t=first.fraction
 return {kind:first.kind,...(first.objectId?{objectId:first.objectId}:{}),name:first.name,distanceM:length*t,point:{x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:start.z+(end.z-start.z)*t}}
}
