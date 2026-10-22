import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {SurfaceKind} from './scene3dSurfaces'
import {populateCraftedEntity} from './scene3dCrafted'

export type Surface={metalness?:number;roughness?:number;emissive?:string;opacity?:number;texture?:SurfaceKind}
export type ModelMesh=(geometry:THREE.BufferGeometry,color:string,x:number,y:number,z:number,surface?:Surface)=>THREE.Mesh
// Procedural presentation only. Every part stays within the saved object's
// dimensions; gameplay continues to use the existing collision/support data.
export function populateEntityModel(e:RenderEntity,mesh:ModelMesh,low=false){
 if(!low&&populateCraftedEntity(e,mesh))return
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
 }else if(g.kind==='wall'){
  box(w,h,d*.9,0,h/2,0,'#424b55')
  const rows=low?1:Math.min(5,Math.max(2,Math.ceil(h/.7))),cols=low?2:Math.min(10,Math.max(2,Math.ceil(w/1.3)))
  for(let row=0;row<rows;row++)for(let col=0;col<cols+(row%2);col++){
   const start=Math.max(-w/2,-w/2+(col-(row%2)*.5)*w/cols),end=Math.min(w/2,-w/2+(col+1-(row%2)*.5)*w/cols)
   box((end-start)*.96,h/rows*.94,d*.98,(start+end)/2,(row+.5)*h/rows,0,color,{texture:'stone'})
  }
 }else if(g.kind==='door'){
  const jamb=Math.min(w*.12,.14),lintel=Math.min(h*.12,.18),wood='#876344',metal='#3d454f'
  for(const sign of [-1,1])box(jamb,h,d,sign*(w-jamb)/2,h/2,0,metal,{metalness:.5})
  box(w,lintel,d,0,h-lintel/2,0,metal)
  const leafWidth=g.open?Math.min(w*.07,.1):Math.max(.01,w-jamb*2),leafX=g.open?-w/2+jamb+leafWidth/2:0
  box(leafWidth,h-lintel,d*.65,leafX,(h-lintel)/2,0,wood,{texture:'wood'})
  if(!g.open){
   for(const y of [.25,.7])box(leafWidth,h*.035,d*.72,leafX,h*y,0,metal,{metalness:.6})
   if(!low)for(let i=1;i<5;i++)box(w*.012,h-lintel,d*.67,-leafWidth/2+i*leafWidth/5,(h-lintel)/2,0,'#574634')
   mesh(new THREE.SphereGeometry(Math.min(w,h,d)*.12,8,6),'#ccb67b',w*.26,h*.45,d*.36,{metalness:.7})
  }
 }else if(g.kind==='crate'){
  box(w*.95,h*.94,d*.94,0,h/2,0,'#634a36')
  const boards=low?2:5
  for(let i=0;i<boards;i++){
   const x=-w/2+(i+.5)*w/boards
   box(w/boards*.94,h*.96,d*.98,x,h/2,0,i%2?'#ad8558':color)
  }
  for(const sign of [-1,1]){
   box(w*.13,h*.99,d,sign*w*.36,h/2,0,'#414953',{metalness:.6})
   box(w,h*.075,d*.99,0,h*(sign<0?.06:.94),0,'#bd9b6a')
  }
  if(!low){const len=Math.hypot(w*.8,h*.76),slat=box(len,Math.min(w,h)*.055,d*.02,0,h/2,d*.49,'#c2a174');slat.rotation.z=Math.atan2(h*.76,w*.8)}
 }else if(g.kind==='platform'){
  const cap=Math.min(h*.25,.25)
  box(w,cap,d,0,h-cap/2,0,'#91999d',{texture:'stone'})
  box(w*.9,Math.max(.005,h-cap),d*.9,0,(h-cap)/2,0,color,{texture:'stone'})
  if(!low)for(const sx of [-1,1])for(const sz of [-1,1])box(w*.12,h*.85,d*.12,sx*w*.4,h*.425,sz*d*.4,'#b1b6af',{texture:'stone'})
 }else if(g.kind==='lamp'){
  mesh(new THREE.CylinderGeometry(Math.min(w,d)*.17,Math.min(w,d)*.25,h*.06,low?6:12),'#414a54',0,h*.03,0,{metalness:.55})
  mesh(new THREE.CylinderGeometry(Math.min(w,d)*.035,Math.min(w,d)*.06,h*.74,8),'#576671',0,h*.4,0,{metalness:.65})
  box(w*.36,h*.17,d*.36,0,h*.84,0,'#d3ffee',{emissive:'#5aab94',roughness:.2})
  for(const sign of [-1,1])box(w*.42,h*.025,d*.42,0,h*(sign<0?.75:.94),0,'#4b555d',{metalness:.65})
  if(!low)for(const sx of [-1,1])for(const sz of [-1,1])box(w*.025,h*.19,d*.025,sx*w*.18,h*.84,sz*d*.18,'#444f59',{metalness:.7})
 }else if(g.kind==='water'){
  box(w,.018,d,0,.009,0,color,{opacity:.78,roughness:.15,metalness:.4})
  if(!low)for(let i=0;i<5;i++)box(w*(.12+(i%3)*.08),.003,Math.min(.035,d*.02),Math.sin(i*4)*w*.28,.02,(i-2)*d*.16,'#91c6c7',{opacity:.55})
 }else{
  const ring=mesh(new THREE.TorusGeometry(w/2,.035,4,32),color,0,.08,0);ring.rotation.x=Math.PI/2
 }
}
