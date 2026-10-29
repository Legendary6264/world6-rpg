import {abilityAreaContains} from './abilityArea'
import {aimSpatial} from './sceneAimTargets'
import {supportsObjectOperation} from './tabletopInteractions'
import type {Scene} from './sceneTypes'
import type {SceneAbilityAim} from './sceneAbilityAim'
import {firstSceneTrajectoryHit} from './sceneTrajectory'
import type {PlaytestTrajectoryOptions} from './scenePlayTrajectory'
export type PlaytestReaction={key:string;actionIndex:number;objectId:string;name:string;abilityName:string;operation:'ignite'|'extinguish'}
// Authored exercises in the private playtest, not inferred universal school
// rules. The master selects each reaction; geometric proximity is no hit test.
export function suggestPlaytestReactions(scene:Scene,aim:SceneAbilityAim,abilityId:string,actionIndex:number,options:PlaytestTrajectoryOptions={}):PlaytestReaction[]{
 const operation=abilityId==='practice-fire'?'ignite':abilityId==='practice-water'?'extinguish':null
 if(!operation||!aim.valid)return []
 const spatial=aimSpatial(aim)
 return scene.objects.filter(o=>{
  const center={x:o.x,y:o.y,z:o.z+o.height/2}
  if(!supportsObjectOperation(o,operation)||(operation==='ignite'?o.active!==false:o.active===false)||!abilityAreaContains(aim.visual.start,aim.visual.end,spatial,center))return false
  const origin=aim.visual.shape==='sphere'?aim.visual.end:aim.visual.start
  return options.obstacles===false||!firstSceneTrajectoryHit(scene,origin,center,[o.id])
 }).map(o=>({key:actionIndex+':'+o.id+':'+operation,actionIndex,objectId:o.id,name:o.name,abilityName:aim.name,operation}))
}
