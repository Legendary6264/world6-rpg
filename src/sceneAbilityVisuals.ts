import type { Cast } from './rpgTypes'
import type { Scene, SceneActor, ScenePosition } from './sceneTypes'
import { resolveAbilityVisual } from './abilityVisuals'
import type { AbilityVisualSpec, AbilityVisualPhase } from './abilityVisuals'

export type SceneAbilityVisual = {
  id: string; spec: AbilityVisualSpec; start: ScenePosition; end: ScenePosition
  phase: AbilityVisualPhase | 'sequence'; shape: 'point' | 'sphere' | 'beam' | 'cone'
  radius: number; coneAngleDeg: number
}
export type VisualActor = SceneActor & { rpg?: { casts: Cast[] } }
export type VisualFrame = Pick<Scene,'id'|'view'|'width'|'depth'|'minZ'|'maxZ'>
export const visualPoint = (point: ScenePosition, frame: VisualFrame) => ({ x: point.x, y: frame.view === 'side' ? frame.maxZ - point.z : point.y })

// Presentation only. No resources, rules, clock or campaign state are changed.
export function castSceneVisual(cast: Cast, start: ScenePosition, end: ScenePosition, id: string, phase: SceneAbilityVisual['phase']): SceneAbilityVisual | null {
  const spec = resolveAbilityVisual(cast.ability)
  if (!spec || spec.familyId === 'none') return null
  const spatial = cast.ability.spatial, shape = phase === 'preparation' ? 'point' : spatial?.shape ?? 'point'
  let aim = { x:end.x, y:end.y, z:end.z }
  if (spatial && 'lengthM' in spatial && shape !== 'point') {
    const distance = Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)
    if (distance > 0) aim = { x:start.x+(end.x-start.x)*spatial.lengthM/distance, y:start.y+(end.y-start.y)*spatial.lengthM/distance, z:start.z+(end.z-start.z)*spatial.lengthM/distance }
  }
  return { id, spec: {...spec}, start: {x:start.x,y:start.y,z:start.z}, end: aim, phase, shape,
    radius: spatial && 'radiusM' in spatial ? spatial.radiusM : .65,
    coneAngleDeg: spatial?.shape === 'cone' ? spatial.angleDeg : 45 }
}
export function sceneAbilityVisuals(scene: Scene, actors: VisualActor[], seconds = 0): SceneAbilityVisual[] {
  const result: SceneAbilityVisual[] = []
  for (let actorIndex=0;actorIndex<actors.length;actorIndex++) {
    const actor=actors[actorIndex],start=scene.tokens.find(t=>t.actorId===actor.id)
    if (!start) continue
    const casts=actor.rpg?.casts??[], last=casts.findLast(c=>c.status==='ended'&&!c.interruption)
    for(let index=0;index<casts.length;index++) {
      const cast=casts[index]
      if(cast.status==='interrupted'||cast.spatialRelease&&cast.spatialRelease.sceneId!==scene.id) continue
      const prepared=cast.status==='preparing'||cast.status==='ready',persistent=cast.status==='maintaining'||cast.status==='ended'&&cast.endsAt!==null&&cast.endsAt>seconds
      if(!prepared&&!persistent&&(cast!==last||!cast.visualRelease))continue
      if(cast.visualRelease&&cast.visualRelease.sceneId!==scene.id)continue
      const origin=!prepared&&!persistent?cast.visualRelease?.start??start:start
      const end=prepared?start:!persistent?cast.visualRelease?.end:cast.spatialRelease?.point??scene.tokens.find(t=>t.actorId===cast.targetId)
      if(!end)continue
      const effect=castSceneVisual(cast,origin,end,'visual-'+actorIndex+'-'+index+'-'+(cast.visualRelease?.releasedAt??0),prepared?'preparation':persistent?'residue':'sequence')
      if(effect)result.push(effect)
    }
  }
  return result.slice(-40)
}
