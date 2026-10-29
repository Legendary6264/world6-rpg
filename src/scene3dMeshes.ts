import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {SurfaceKind} from './scene3dSurfaces'
import {populateCraftedEntity} from './scene3dCrafted'
import {populateFigure,populateWater} from './scene3dOrganic'
import {populateTabletopEntity} from './scene3dTabletop'
import {populateLegacyEntity} from './scene3dLegacy'

export type Surface={metalness?:number;roughness?:number;emissive?:string;opacity?:number;texture?:SurfaceKind;textureStrength?:number;normalStrength?:number;clearcoat?:number;castShadow?:boolean;doubleSided?:boolean}
export type ModelMesh=(geometry:THREE.BufferGeometry,color:string,x:number,y:number,z:number,surface?:Surface)=>THREE.Mesh
// Procedural presentation only. Every part stays within the saved object's
// closed dimensions. Open doors/lids use real hinge poses; gameplay continues
// to use the existing collision/support data.
export function populateEntityModel(e:RenderEntity,mesh:ModelMesh,low=false){
 if((e.geometry.facing??0)%180!==0)e={...e,geometry:{...e.geometry,width:e.geometry.depth,depth:e.geometry.width}}
 if(populateLegacyEntity(e,mesh,low))return
 if(populateTabletopEntity(e,mesh,low))return
 if(populateCraftedEntity(e,mesh,low))return
 if(!low&&(populateFigure(e,mesh)||populateWater(e,mesh)))return
 const g=e.geometry,w=g.width,d=g.depth,h=Math.max(g.height,.035),color=e.appearance.color
 const box=(a:number,b:number,c:number,x:number,y:number,z:number,tint=color,surface?:Surface)=>mesh(!low&&surface?.texture?new RoundedBoxGeometry(Math.max(.001,a),Math.max(.001,b),Math.max(.001,c),2,Math.min(a,b,c)*.075):new THREE.BoxGeometry(Math.max(.001,a),Math.max(.001,b),Math.max(.001,c)),tint,x,y,z,surface)
 if(g.kind==='actor'){
  const r=Math.max(.05,w/2)
  mesh(new THREE.CylinderGeometry(r,r,.045,low?10:24),color,0,.023,0,{metalness:.4})
  if(!e.appearance.heightKnown)return
  const bw=Math.min(w,h*.6),bd=Math.min(d,h*.6)
  const dark='#253343',skin='#c9ac90',steel='#8498a2'
  if(low)box(bw*.32,h*.29,bd*.35,0,h*.62,0)
  else{
   const torso=mesh(new THREE.LatheGeometry([[.12,.0],[.16,.025],[.145,.12],[.205,.22],[.21,.28],[.12,.32],[.07,.34]].map(([x,y])=>new THREE.Vector2(x,y)),24),color,0,h*.48,0)
   torso.scale.set(bw,h,bd)
   const collar=mesh(new THREE.TorusGeometry(bw*.095,bw*.025,8,24),'#b9a17a',0,h*.813,0,{metalness:.5});collar.rotation.x=Math.PI/2
  }
  mesh(new THREE.ConeGeometry(bw*.35,h*.35,low?6:12),dark,0,h*.45,0)
  mesh(new THREE.SphereGeometry(bw*.14,low?8:24,low?6:16),skin,0,h*.88,0).scale.set(.84,1.15,.9)
  mesh(new THREE.SphereGeometry(bw*.21,low?8:16,low?6:12),dark,0,h*.92,-bd*.025).scale.set(1,.6,1)
  for(const sign of [-1,1]){
   if(low)box(bw*.16,h*.33,bd*.19,sign*bw*.13,h*.25,0,dark)
   else{const leg=mesh(new THREE.CapsuleGeometry(bw*.075,h*.25,6,12),dark,sign*bw*.105,h*.26,0);leg.scale.z=bd/bw}
   box(bw*.22,h*.09,bd*.35,sign*bw*.13,h*.08,bd*.05,dark)
   const arm=low?box(bw*.14,h*.3,bd*.2,sign*bw*.29,h*.57,0):mesh(new THREE.CapsuleGeometry(bw*.065,h*.21,6,12),color,sign*bw*.27,h*.62,0);arm.rotation.z=sign*.12
   if(!low){
    mesh(new THREE.SphereGeometry(bw*.105,20,12),steel,sign*bw*.25,h*.74,0,{metalness:.75,roughness:.34}).scale.set(1,.7,bd/bw)
    mesh(new THREE.SphereGeometry(bw*.065,12,8),skin,sign*bw*.29,h*.475,0).scale.set(.8,1.15,bd/bw)
    box(bw*.15,h*.05,bd*.22,sign*bw*.28,h*.53,0,'#574637')
   }
  }
  box(bw*.4,h*.045,bd*.39,0,h*.49,0,'#a58c61',{metalness:.35})
  if(!low){
   box(bw*.085,h*.042,bd*.035,0,h*.49,bd*.21,'#bca269',{metalness:.8,roughness:.3})
   for(const sign of [-1,1])box(bw*.08,h*.045,bd*.06,sign*bw*.13,h*.64,bd*.17,'#c4b6a0',{metalness:.6})
  }
 }else if(g.kind==='tree'){
  mesh(new THREE.CylinderGeometry(Math.min(w,d)*.065,Math.min(w,d)*.12,h*.65,low?6:10),'#73563e',0,h*.325,0)
  for(let i=0;i<(low?2:3);i++){
   const height=h*(low?.48:.38),y=h*(low?.54+i*.22:.48+i*.18)
   const crown=mesh(new THREE.ConeGeometry(1,height,low?7:12),i%2?'#508368':color,0,Math.min(h-height/2,y),0)
   crown.scale.set(w*(.48-i*.09),1,d*(.48-i*.09))
   crown.geometry.rotateY(i*.7)
  }
 }else if(g.kind==='rock'){
  const rock=mesh(new THREE.IcosahedronGeometry(1,low?0:1),color,0,h*.5,0);rock.scale.set(w*.5,h*.5,d*.5)
  if(!low){const seam=mesh(new THREE.DodecahedronGeometry(1,0),'#a2a8ac',w*.15,h*.35,-d*.08);seam.scale.set(w*.26,h*.26,d*.3)}
 }else if(g.kind==='water'){
  box(w,.018,d,0,.009,0,color,{opacity:.78,roughness:.15,metalness:.4})
  if(!low)for(let i=0;i<5;i++)box(w*(.12+(i%3)*.08),.003,Math.min(.035,d*.02),Math.sin(i*4)*w*.28,.02,(i-2)*d*.16,'#91c6c7',{opacity:.55})
 }else{
  const ring=mesh(new THREE.TorusGeometry(w/2,.035,4,32),color,0,.08,0);ring.rotation.x=Math.PI/2
 }
}
