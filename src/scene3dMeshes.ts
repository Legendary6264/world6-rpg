import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {SurfaceKind} from './scene3dSurfaces'
import {populateCraftedEntity} from './scene3dCrafted'
import {populateWater} from './scene3dOrganic'
import {populateCharacter} from './scene3dCharacters'
import {populateTabletopEntity} from './scene3dTabletop'
import {populateLegacyEntity} from './scene3dLegacy'

export type Surface={metalness?:number;roughness?:number;emissive?:string;opacity?:number;texture?:SurfaceKind;textureStrength?:number;normalStrength?:number;clearcoat?:number;castShadow?:boolean;doubleSided?:boolean}
export type ModelMesh=(geometry:THREE.BufferGeometry,color:string,x:number,y:number,z:number,surface?:Surface)=>THREE.Mesh
// Procedural presentation only. Every part stays within the saved object's
// closed dimensions. Open doors/lids use real hinge poses; gameplay continues
// to use the existing collision/support data.
export function populateEntityModel(e:RenderEntity,mesh:ModelMesh,low=false){
 if((e.geometry.facing??0)%180!==0)e={...e,geometry:{...e.geometry,width:e.geometry.depth,depth:e.geometry.width}}
 if(e.geometry.kind==='water'&&e.geometry.waterVolume&&e.geometry.height===0){
  const area=new THREE.PlaneGeometry(e.geometry.width,e.geometry.depth).rotateX(-Math.PI/2)
  mesh(area,'#6397a5',0,.004,0,{opacity:.28,castShadow:false,doubleSided:true})
  return
 }
 if(e.geometry.iceCover&&populateWater(e,mesh))return
 if(populateLegacyEntity(e,mesh,low))return
 if(populateTabletopEntity(e,mesh,low))return
 if(populateCraftedEntity(e,mesh,low))return
 if(populateCharacter(e,mesh,low)||!low&&populateWater(e,mesh))return
 const g=e.geometry,w=g.width,d=g.depth,h=Math.max(g.height,.035),color=e.appearance.color
 const box=(a:number,b:number,c:number,x:number,y:number,z:number,tint=color,surface?:Surface)=>mesh(!low&&surface?.texture?new RoundedBoxGeometry(Math.max(.001,a),Math.max(.001,b),Math.max(.001,c),2,Math.min(a,b,c)*.075):new THREE.BoxGeometry(Math.max(.001,a),Math.max(.001,b),Math.max(.001,c)),tint,x,y,z,surface)
 if(g.kind==='actor'){
  const r=Math.max(.05,w/2),token=mesh(new THREE.CylinderGeometry(r,r,.035,low?16:32),color,0,.018,0,{metalness:.25,roughness:.7});token.scale.z=d/w
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
  const waterHeight=g.waterVolume?g.height:.018
  mesh(new THREE.BoxGeometry(w,waterHeight,d),color,0,waterHeight/2,0,{opacity:.78,roughness:.15,metalness:.4})
  if(!low)for(let i=0;i<5;i++)box(w*(.12+(i%3)*.08),.003,Math.min(.035,d*.02),Math.sin(i*4)*w*.28,.02,(i-2)*d*.16,'#91c6c7',{opacity:.55})
 }else{
  const ring=mesh(new THREE.TorusGeometry(w/2,.035,4,32),color,0,.08,0);ring.rotation.x=Math.PI/2
 }
}
