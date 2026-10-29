import {abilityAreaContains} from './abilityArea'
import type { AbilitySpatial } from './rpgTypes'
import type { DeclarationTarget } from './actionDeclarations'
import type { ScenePosition, Scene } from './sceneTypes'
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=1e6
export function isAbilitySpatial(v:unknown):v is AbilitySpatial {
  if(!record(v))return false
  const expected=v.shape==='point'?['shape','includeCaster']:v.shape==='sphere'?['shape','includeCaster','radiusM']:v.shape==='beam'?['shape','includeCaster','lengthM','radiusM']:v.shape==='cone'?['shape','includeCaster','lengthM','angleDeg']:[]
  return typeof v.includeCaster==='boolean'&&expected.length>0&&Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k))&&
    (v.shape==='point'||v.shape==='sphere'&&positive(v.radiusM)||v.shape==='beam'&&positive(v.lengthM)&&positive(v.radiusM)||v.shape==='cone'&&positive(v.lengthM)&&positive(v.angleDeg)&&v.angleDeg<180)
}
export const spatialKind=(s:AbilitySpatial)=>s.shape==='point'?'point':s.shape==='sphere'?'area':'direction'
export const copyAbilitySpatial=(s:AbilitySpatial):AbilitySpatial=>s.shape==='point'?{shape:s.shape,includeCaster:s.includeCaster}:s.shape==='sphere'?{shape:s.shape,includeCaster:s.includeCaster,radiusM:s.radiusM}:s.shape==='beam'?{shape:s.shape,includeCaster:s.includeCaster,lengthM:s.lengthM,radiusM:s.radiusM}:{shape:s.shape,includeCaster:s.includeCaster,lengthM:s.lengthM,angleDeg:s.angleDeg}
export const spatialLabel=(s:AbilitySpatial)=>s.shape==='point'?'Точка':s.shape==='sphere'?'Сфера · радиус '+s.radiusM+' м':s.shape==='beam'?'Луч · длина '+s.lengthM+' м · радиус '+s.radiusM+' м':'Конус · длина '+s.lengthM+' м · полный угол '+s.angleDeg+'°'
const distance=(a:ScenePosition,b:ScenePosition)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
const epsilon=1e-8 // geometric boundary tolerance in scene metres, not a game radius
export function spatialTargets(scene:Scene,ownerId:string,spatial:AbilitySpatial,target:DeclarationTarget,rangeM:number):{actorIds:string[];distanceM:number} {
  if(!isAbilitySpatial(spatial)||!('point' in target)||target.kind!==spatialKind(spatial))throw Error('Вид пространственной цели должен совпадать с формой способности.')
  const aim=target.point,origin=scene.tokens.find(t=>t.actorId===ownerId)
  if(!origin||aim.x<0||aim.x>scene.width||aim.y<0||aim.y>scene.depth||aim.z<scene.minZ||aim.z>scene.maxZ)throw Error('Размести применяющего и выбери координаты в пределах сцены.')
  const aimDistance=distance(origin,aim)
  if(!Number.isFinite(aimDistance)||aimDistance>rangeM+epsilon)throw Error('Пространственная цель вне дальности способности.')
  if((spatial.shape==='beam'||spatial.shape==='cone')&&(aimDistance<=epsilon||spatial.lengthM>rangeM))throw Error('Направлению нужна отличная от применяющего точка; длина не должна превышать дальность способности.')
  return {actorIds:scene.tokens.filter(t=>(spatial.includeCaster||t.actorId!==ownerId)&&abilityAreaContains(origin,aim,spatial,t)).map(t=>t.actorId).sort(),distanceM:aimDistance}
}
