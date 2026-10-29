import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {ModelMesh,Surface} from './scene3dMeshes'
import type {RenderEntity} from './scene3dModel'
import {tabletopAsset} from './tabletopCatalog.ts'

// Native catalog dimensions. The tabletop adapter bakes the completed model
// once before applying editable width/depth/height and its placement rotation.
export function populateTavernFurniture(e:RenderEntity,mesh:ModelMesh,low=false):boolean{
 const a=e.geometry.asset,asset=tabletopAsset(a)
 if(!asset||!['table','round-table','chair','stool','mug','plate','bread'].includes(a!))return false
 const {width:w,depth:d,height:h}=asset
 const timber:Surface={texture:'wood',roughness:.8,textureStrength:.38,normalStrength:.18},ceramic:Surface={roughness:.76},food:Surface={roughness:.98}
 const oak='#87503a',edge='#633e2e',topColor='#af7050',grain='#a16546',cream='#d3bc8b'
 const box=(name:string,x:number,y:number,z:number,px:number,py:number,pz:number,c=oak,s=timber)=>{
  const g=low?new THREE.BoxGeometry(x,y,z):new RoundedBoxGeometry(x,y,z,2,Math.min(x,y,z)*.14);g.name=name
  return mesh(g,c,px,py,pz,s)
 }
 const turned=(name:string,profile:number[][],x:number,y:number,z:number,c=oak,segments=low?8:20,s=timber)=>{
  const g=new THREE.LatheGeometry(profile.map(([r,p])=>new THREE.Vector2(r,p)),segments);g.name=name;return mesh(g,c,x,y,z,s)
 }
 const rod=(name:string,from:THREE.Vector3,to:THREE.Vector3,r0:number,r1=r0,c=edge)=>{
  const g=new THREE.CylinderGeometry(r1,r0,from.distanceTo(to),low?6:12);g.name=name
  const p=from.clone().add(to).multiplyScalar(.5),m=mesh(g,c,p.x,p.y,p.z,timber)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());return m
 }
 const seat=(width:number,depth:number,thickness:number,level:number)=>{
  // Closed saddle seat, with a shallow scooped top and eased front corners.
  const nx=low?2:12,nz=low?2:10,stride=nx+1,layer=stride*(nz+1),p:number[]=[],uv:number[]=[],idx:number[]=[]
  for(const top of [true,false])for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
   const u=ix/nx*2-1,v=iz/nz*2-1,corner=Math.abs(v)>.8?1-(Math.abs(v)-.8)*.18:1
   const scoop=top?-.018*(1-u*u)*(1-v*v):0
   p.push(u*width*.5*corner,(top?thickness*.5:-thickness*.5)+scoop,v*depth*.5);uv.push(ix/nx,iz/nz)
  }
  for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
   const i=iz*stride+ix,j=i+stride;idx.push(i,j,i+1,i+1,j,j+1,layer+i,layer+i+1,layer+j,layer+i+1,layer+j+1,layer+j)
  }
  const border:number[]=[]
  for(let i=0;i<=nx;i++)border.push(i)
  for(let i=1;i<=nz;i++)border.push(i*stride+nx)
  for(let i=nx-1;i>=0;i--)border.push(nz*stride+i)
  for(let i=nz-1;i>0;i--)border.push(i*stride)
  for(let i=0;i<border.length;i++){const j=border[i],k=border[(i+1)%border.length];idx.push(j,k,layer+j,k,layer+k,layer+j)}
  const g=new THREE.BufferGeometry();g.name='tavern-saddle-seat';g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();mesh(g,topColor,0,level,0,timber)
 }
 if(a==='table'){
  const level=h,thick=h*.065,legTop=level-thick,legR=Math.min(w,d)*.041
  for(const sx of [-1,1])for(const sz of [-1,1]){
   const x=sx*w*.415,z=sz*d*.345
   turned('tavern-table-leg',[[0,0],[legR*.83,0],[legR*.98,h*.018],[legR*.91,h*.055],[legR*.68,h*.13],[legR*.9,h*.22],[legR*.99,h*.25],[legR*.75,h*.29],[legR*.75,legTop-h*.13],[legR*1.05,legTop-h*.11],[legR*1.05,legTop],[0,legTop]],x,0,z)
  }
  for(const side of [-1,1]){
   box('tavern-table-apron',w*.88,h*.13,d*.052,0,legTop-h*.065,side*d*.345,edge)
   box('tavern-table-apron',w*.055,h*.13,d*.73,side*w*.415,legTop-h*.065,0,edge)
   box('tavern-table-stretcher',w*.88,h*.045,d*.048,0,h*.25,side*d*.345,edge)
  }
  const count=low?3:5
  for(let i=0;i<count;i++)box('tavern-table-top-plank',w*.985,thick,d*.985/count-.003,0,level-thick*.5,-d*.4925+(i+.5)*d*.985/count,i%2?grain:topColor)
 }else if(a==='round-table'){
  const r=Math.min(w,d)*.48,level=h
  turned('tavern-pedestal-base',[[0,0],[r*.48,0],[r*.54,h*.025],[r*.53,h*.055],[r*.44,h*.088],[r*.42,h*.11],[r*.26,h*.14],[r*.23,h*.17],[0,h*.17]],0,0,0,edge)
  turned('tavern-pedestal-shaft',[[0,.12],[r*.23,.12],[r*.25,.16],[r*.22,.2],[r*.145,.25],[r*.13,.43],[r*.16,.53],[r*.26,.59],[r*.27,.62],[r*.21,.66],[r*.39,.74],[r*.64,.77],[0,.77]].map(([radius,y])=>[radius,h*(.12+(y-.12)*.81/.65)]),0,0,0)
  turned('tavern-round-top',[[0,level-h*.07],[r*.94,level-h*.07],[r,level-h*.045],[r,level-h*.016],[r*.98,level],[0,level]],0,0,0,topColor,low?16:40)
  if(!low){
   // The concentric moulding belongs to the top silhouette and remains
   // visible at the same medium-distance camera as the reference.
   const g=new THREE.TorusGeometry(r*.965,h*.009,6,40);g.name='tavern-round-rim';const rim=mesh(g,grain,0,level-h*.018,0,timber);rim.rotation.x=Math.PI/2
  }
 }else if(a==='chair'){
  const level=h*.47,seatW=w*.89,seatD=d*.83,front=d*.305,back=-d*.31
  for(const side of [-1,1]){
   rod('tavern-chair-front-leg',new THREE.Vector3(side*w*.38,.015,front),new THREE.Vector3(side*w*.345,level,front-.018),w*.039,w*.053)
   rod('tavern-chair-back-post',new THREE.Vector3(side*w*.365,.015,back+.035),new THREE.Vector3(side*w*.37,h*.965,back-.025),w*.046,w*.043)
   box('tavern-chair-apron',w*.08,h*.075,d*.68,side*w*.345,level-h*.065,0,edge)
   rod('tavern-chair-rung',new THREE.Vector3(side*w*.36,h*.2,back+.02),new THREE.Vector3(side*w*.36,h*.2,front),w*.024)
  }
  seat(seatW,seatD,h*.065,level)
  box('tavern-chair-front-apron',w*.75,h*.075,d*.066,0,level-h*.065,front,edge)
  rod('tavern-chair-cross-rung',new THREE.Vector3(-w*.36,h*.19,front),new THREE.Vector3(w*.36,h*.19,front),w*.024)
  // Three separated curved ladder rails preserve the characteristic open
  // back and rounded crown, with solid thickness from every viewing angle.
  for(const [i,y] of [h*.64,h*.77,h*.92].entries()){
   const rail=box('tavern-chair-back-rail',w*.76,h*(i===2?.085:.06),d*.065,0,y,back-.01,i===2?topColor:oak)
   if(!low){const p=rail.geometry.attributes.position;for(let j=0;j<p.count;j++){const x=p.getX(j);p.setZ(j,p.getZ(j)+.025*(1-(x/(w*.38))**2))}rail.geometry.computeVertexNormals()}
  }
 }else if(a==='stool'){
  const level=h,r=Math.min(w,d)*.46,legTop=level-h*.07
  for(const sx of [-1,1])for(const sz of [-1,1]){
   const foot=new THREE.Vector3(sx*w*.30,.01,sz*d*.30),head=new THREE.Vector3(sx*w*.24,legTop,sz*d*.24)
   rod('tavern-stool-splayed-leg',foot,head,w*.045,w*.058)
  }
  for(const side of [-1,1]){
   rod('tavern-stool-rung',new THREE.Vector3(-w*.28,h*.35,side*d*.28),new THREE.Vector3(w*.28,h*.35,side*d*.28),w*.028)
   rod('tavern-stool-rung',new THREE.Vector3(side*w*.28,h*.38,-d*.28),new THREE.Vector3(side*w*.28,h*.38,d*.28),w*.028)
  }
  turned('tavern-stool-seat',[[0,legTop],[r*.94,legTop],[r,legTop+h*.02],[r,level-h*.015],[r*.96,level],[0,level]],0,0,0,topColor,low?12:28)
 }else if(a==='mug'){
  const r=Math.min(d*.45,w*.32),x=-w*.11
  // Rim, inner wall, base and interior bottom are one closed ceramic shell.
  // The opening remains real in both detail modes; its contents sit below it.
  turned('tavern-cup-shell',[[0,0],[r*.70,0],[r*.87,h*.09],[r,h*.90],[r*.97,h],[r*.79,h],[r*.75,h*.15],[0,h*.15]],x,0,0,cream,low?10:24,ceramic)
  const drink=new THREE.CylinderGeometry(r*.76,r*.76,h*.018,low?10:24);drink.name='tavern-cup-drink'
  mesh(drink,'#543b29',x,h*.75,0,{roughness:.34})
  const handle=new THREE.TorusGeometry(r*.55,r*.13,low?5:8,low?12:20);handle.name='tavern-cup-handle'
  mesh(handle,cream,x+r*1.05,h*.51,0,ceramic)
 }else if(a==='plate'){
  const r=Math.min(w,d)*.5
  turned('tavern-dish',[[0,0],[r*.58,0],[r*.66,h*.12],[r*.97,h*.73],[r,h*.91],[r*.98,h],[r*.90,h],[r*.64,h*.32],[0,h*.28]],0,0,0,cream,low?12:32,ceramic)
 }else if(a==='bread'){
  // A scored loaf with a genuinely flat underside, rather than a sphere
  // floating on a single tangent point. Scores deform the solid crust itself.
  const g=new THREE.SphereGeometry(1,low?12:28,low?8:16),p=g.attributes.position
  g.name='tavern-bread-loaf'
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),level=(Math.max(-.35,y)+.35)/1.35
   let score=0
   if(!low&&y>.1)for(const slash of [-.46,-.15,.16,.47])score+=Math.exp(-(((x+z*.23-slash)/.045)**2))
   p.setXYZ(i,x*w*.5,Math.max(0,level-Math.min(.085,score*.07)*Math.max(0,y))*h,z*d*.5)
  }
  g.computeVertexNormals();mesh(g,'#c39a5b',0,0,0,food)
 }
 return true
}
