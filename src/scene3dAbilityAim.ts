import * as THREE from 'three'
import {sceneAbilityAimLines} from './sceneAbilityAim'
import type {SceneAbilityAim} from './sceneAbilityAim'
import {abilityAimColor,abilityAimTargetColor,aimTargetLines} from './sceneAbilityAimPresentation'
import type {AimTarget} from './sceneAimTargets'
import type {ScenePosition} from './sceneTypes'

const vector=(p:ScenePosition)=>new THREE.Vector3(p.x,p.z,p.y)
// Passive geometry only: no picking, lighting, animation loop or world writes.
export function createSceneAbilityAim(aim:SceneAbilityAim,targets:AimTarget[],clippingPlanes:THREE.Plane[]=[]){
 const group=new THREE.Group(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>()
 group.name='ability-aim-layer';group.userData.editorOverlay=true
 const decorate=<T extends THREE.Line|THREE.Mesh>(part:T)=>{geometries.add(part.geometry);materials.add(part.material as THREE.Material);part.raycast=()=>{};part.renderOrder=60;group.add(part);return part}
 const color=abilityAimColor(aim),v=aim.visual,start=vector(v.start),end=vector(v.end),delta=end.clone().sub(start),length=delta.length()
 for(const points of sceneAbilityAimLines(aim)){
  const line=decorate(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(vector)),new THREE.LineDashedMaterial({color,transparent:true,opacity:.9,depthWrite:false,depthTest:false,toneMapped:false,dashSize:.18,gapSize:.12,clippingPlanes})))
  line.name='ability-aim-outline';line.computeLineDistances()
 }
 let geometry:THREE.BufferGeometry|undefined
 if(v.shape==='sphere'&&v.radius>0&&Number.isFinite(v.radius))geometry=new THREE.SphereGeometry(v.radius,24,12)
 else if((v.shape==='beam'||v.shape==='cone')&&length>1e-8&&Number.isFinite(length)){
  const radius=v.shape==='cone'?length*Math.tan(v.coneAngleDeg*Math.PI/360):v.radius
  if(radius>0&&Number.isFinite(radius))geometry=new THREE.CylinderGeometry(radius,v.shape==='cone'?0:radius,length,24)
 }
 if(geometry){
  const surface=decorate(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.085,side:THREE.DoubleSide,depthWrite:false,depthTest:true,toneMapped:false,clippingPlanes})))
  surface.name='ability-aim-surface:'+v.shape;surface.renderOrder=59
  surface.position.copy(v.shape==='sphere'?end:start.clone().addScaledVector(delta,.5))
  if(v.shape!=='sphere')surface.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.divideScalar(length))
 }
 for(const target of aim.valid?targets:[]){
  if(!clippingPlanes.every(plane=>plane.distanceToPoint(vector(target.point))>=-.5))continue
  const points=aimTargetLines(target).flatMap(line=>line.slice(1).flatMap((p,i)=>[vector(line[i]),vector(p)]))
  const marker=decorate(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:abilityAimTargetColor(target),transparent:true,opacity:1,depthWrite:false,depthTest:false,toneMapped:false,clippingPlanes})))
  marker.name='ability-aim-target:'+target.kind+':'+target.id;marker.userData.aimTarget={kind:target.kind,id:target.id};marker.renderOrder=61
 }
 let disposed=false
 return {group,dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear()}}
}
