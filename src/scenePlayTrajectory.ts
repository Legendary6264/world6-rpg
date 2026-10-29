import {firstSceneTrajectoryHit} from './sceneTrajectory'
import type {Scene} from './sceneTypes'
import type {SceneAbilityAim} from './sceneAbilityAim'

export type PlaytestTrajectoryOptions={obstacles?:boolean}
export function physicalPlaytestAbility(id:string){return id==='practice-fire'||id==='practice-water'}
// Only the two authored physical exercises use this behaviour. No general
// collision rule is inferred for healing, shadows or a hero's approved spells.
export function resolvePlaytestTrajectory(scene:Scene,aim:SceneAbilityAim,abilityId:string,options:PlaytestTrajectoryOptions={}):SceneAbilityAim {
 if(options.obstacles===false||!aim.valid||aim.sceneId!==scene.id||!physicalPlaytestAbility(abilityId))return aim
 const hit=firstSceneTrajectoryHit(scene,aim.visual.start,aim.visual.end)
 if(!hit)return aim
 return {...aim,obstruction:hit,visual:{...aim.visual,end:{...hit.point}},message:'Преграда: '+hit.name+' · '+hit.distanceM.toFixed(2)+' м. Эффект завершится у первого пересечения.'}
}
