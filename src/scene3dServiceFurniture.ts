import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {ModelMesh,Surface} from './scene3dMeshes'
import type {RenderEntity} from './scene3dModel'
import {tabletopAsset} from './tabletopCatalog.ts'

// Complete solids at native catalog dimensions. The tabletop adapter owns
// rotation and editable scaling after these profiles and joints are baked.
export function populateServiceFurniture(e:RenderEntity,mesh:ModelMesh,low=false):boolean{
 const asset=tabletopAsset(e.geometry.asset)
 if(!asset||!['bar','bench'].includes(asset.id))return false
 const {width:w,depth:d,height:h}=asset
 const timber:Surface={texture:'wood',roughness:.82,textureStrength:.32,normalStrength:.18}
 const topSurface:Surface={texture:'wood',roughness:.76,textureStrength:.36,normalStrength:.14}
 const iron:Surface={metalness:.72,roughness:.48}
 const oak='#87583b',shadow='#68432f',board='#ad7950',endgrain='#bc9463',metal='#665d4b'
 const box=(name:string,sx:number,sy:number,sz:number,x:number,y:number,z:number,color=oak,surface:Surface=timber,radius=.08)=>{
  const geometry=low?new THREE.BoxGeometry(sx,sy,sz):new RoundedBoxGeometry(sx,sy,sz,1,Math.min(sx,sy,sz)*radius)
  geometry.name=name;return mesh(geometry,color,x,y,z,surface)
 }
 const cylinder=(name:string,r:number,length:number,x:number,y:number,z:number,color=metal,surface:Surface=iron,axis:'x'|'y'|'z'='y')=>{
  const g=new THREE.CylinderGeometry(r,r,length,low?8:16);g.name=name
  const part=mesh(g,color,x,y,z,surface)
  if(axis==='z')part.rotation.x=Math.PI/2
  if(axis==='x')part.rotation.z=Math.PI/2
  return part
 }
 const beam=(name:string,from:THREE.Vector3,to:THREE.Vector3,size:number,color=shadow,surface:Surface=timber)=>{
  const p=from.clone().add(to).multiplyScalar(.5),part=box(name,size,from.distanceTo(to),size,p.x,p.y,p.z,color,surface)
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());return part
 }
 const rail=(name:string,length:number,profile:number[][],x:number,y:number,z:number,axis:'x'|'z'='x',color=board)=>{
  const shape=new THREE.Shape();profile.forEach(([u,v],i)=>i?shape.lineTo(u,v):shape.moveTo(u,v));shape.closePath()
  const g=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false,steps:1});g.name=name
  if(axis==='x'){g.rotateY(Math.PI/2);g.translate(-length/2,0,0)}else g.translate(0,0,-length/2)
  return mesh(g,color,x,y,z,timber)
 }
 const top=(thickness:number)=>{
  // Three eased, solid planks retain a continuous centre and broad flat edge
  // clearance. All crown vertices stay at Y=h; mouldings remain below it.
  const width=w-.004,depth=d-.004,n=3,gap=low?.0006:.0012
  for(let i=0;i<n;i++){
   const part=box('service-'+asset.id+'-top-board',width,thickness,depth/n-gap,0,h-thickness/2,-depth/2+(i+.5)*depth/n,i===1?board:'#a4734c',topSurface,.075)
   part.geometry.computeBoundingBox();part.position.y=h-part.geometry.boundingBox!.max.y
  }
 }
 if(asset.id==='bar'){
  const cap=h*.07,bodyTop=h-cap,plinth=h*.11,bodyW=w*.88,bodyD=d*.62,panelBottom=plinth+h*.06,panelTop=bodyTop-h*.09
  // Recessed faces stand in front of a fully enclosed wooden carcass. The
  // projecting frame, not a texture, establishes the depth of each panel.
  box('service-bar-carcass',bodyW,bodyTop-plinth,bodyD,0,(bodyTop+plinth)/2,0,shadow)
  const base=box('service-bar-plinth',w*.92,plinth,d*.72,0,plinth/2,0,shadow)
  base.geometry.computeBoundingBox();base.position.y=-base.geometry.boundingBox!.min.y
  for(const side of [-1,1])rail('service-bar-plinth-profile',w*.93,[[-d*.035,0],[d*.035,0],[d*.035,h*.023],[d*.018,h*.04],[-d*.035,h*.04]].map(([u,v])=>[u*side,v]),0,plinth-h*.012,side*d*.34,'x',oak)
  for(const side of [-1,1]){
   const face=side*bodyD/2,postW=w*.045,frameD=d*.065,postZ=face+side*d*.023,cell=bodyW/3
   for(const y of [panelBottom,panelTop])box('service-bar-panel-rail',bodyW,h*.065,frameD,0,y,postZ,oak)
   for(let i=0;i<=3;i++){
    const x=-bodyW/2+i*cell
    box('service-bar-stile',postW,panelTop-panelBottom+h*.065,frameD,x,(panelTop+panelBottom)/2,postZ,oak)
    if(!low)for(const y of [panelBottom+h*.055,panelTop-h*.055])cylinder('service-bar-dowel',Math.min(w,d)*.011,d*.009,x,y,postZ+side*frameD*.49,endgrain,timber,'z')
   }
   for(let i=0;i<3;i++){
    const x=-bodyW/2+(i+.5)*cell,pw=cell-postW*1.24,ph=panelTop-panelBottom-h*.07
    box('service-bar-panel',pw,ph,d*.018,x,(panelTop+panelBottom)/2,face+side*d*.008,board)
    if(!low){
     const trim=d*.018,innerZ=face+side*d*.025
     for(const dx of [-1,1])box('service-bar-panel-bead',trim,ph*.96,trim,x+dx*pw*.46,(panelTop+panelBottom)/2,innerZ,endgrain)
     for(const y of [-1,1])box('service-bar-panel-bead',pw*.94,trim,trim,x,(panelTop+panelBottom)/2+y*ph*.46,innerZ,endgrain)
    }
   }
   const molding=d*.06,profile=[[-molding/2,0],[molding/2,0],[molding/2,h*.02],[molding*.32,h*.032],[molding*.32,h*.057],[-molding/2,h*.07]]
   rail('service-bar-counter-edge',w*.98,profile.map(([u,v])=>[u*side,v]),0,h-cap-h*.035,side*d*.46,'x',oak)
  }
  // The short ends receive the same shadow line as the long edge.
  for(const side of [-1,1])rail('service-bar-counter-end',d*.91,[[-w*.012,0],[w*.012,0],[w*.012,h*.035],[-w*.012,h*.06]],side*w*.477,h-cap-h*.025,0,'z',oak)
  // A capped iron foot rail and solid diagonal brackets stay inside the
  // counter overhang, including their mounting rosettes.
  const z=d*.455,y=h*.17
  cylinder('service-bar-foot-rail',d*.022,w*.83,0,y,z,metal,iron,'x')
  for(const x of [-w*.35,0,w*.35]){
   cylinder('service-bar-rail-mount',d*.038,d*.016,x,h*.135,bodyD/2+d*.009,metal,iron,'z')
   beam('service-bar-rail-bracket',new THREE.Vector3(x,h*.135,bodyD/2+d*.012),new THREE.Vector3(x,y,z),d*.027,metal,iron)
  }
  top(cap)
 }else{
  const cap=h*.14,legTop=h-cap,legX=w*.36,foot=d*.90,shoulder=d*.86,waist=d*.62,thickness=w*.055
  for(const side of [-1,1]){
   // The arched underside is part of a closed support silhouette. Each
   // trestle has two physical feet and a broad shoulder under the seat.
   const shape=new THREE.Shape();shape.moveTo(-foot/2,0);shape.lineTo(-foot/2,h*.09)
   shape.lineTo(-waist/2,legTop*.70);shape.lineTo(-shoulder/2,legTop*.88);shape.lineTo(-shoulder/2,legTop)
   shape.lineTo(shoulder/2,legTop);shape.lineTo(shoulder/2,legTop*.88);shape.lineTo(waist/2,legTop*.70);shape.lineTo(foot/2,h*.09);shape.lineTo(foot/2,0)
   shape.lineTo(foot*.22,0);shape.quadraticCurveTo(foot*.15,h*.13,0,h*.13);shape.quadraticCurveTo(-foot*.15,h*.13,-foot*.22,0);shape.closePath()
   const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:low?2:5,steps:1});g.name='service-bench-trestle';g.rotateY(Math.PI/2);g.translate(-thickness/2,0,0)
   mesh(g,oak,side*legX,0,0,timber)
  }
  for(const side of [-1,1]){
   const length=w*.84,height=h*.14,t=d*.075,shape=new THREE.Shape()
   shape.moveTo(-length/2,0);shape.lineTo(length/2,0);shape.lineTo(length/2,-height)
   if(low)shape.lineTo(-length/2,-height)
   else shape.bezierCurveTo(length*.25,-height*.58,-length*.25,-height*.58,-length/2,-height)
   shape.closePath()
   const g=new THREE.ExtrudeGeometry(shape,{depth:t,bevelEnabled:false,curveSegments:low?1:6,steps:1});g.name='service-bench-apron'
   mesh(g,shadow,0,legTop,side*d*.365-t/2,timber)
   if(!low)for(const x of [-legX,legX])cylinder('service-bench-dowel',d*.023,d*.012,x,legTop-height*.42,side*d*.405,endgrain,timber,'z')
  }
  box('service-bench-stretcher',w*.82,h*.115,d*.17,0,h*.28,0,shadow)
  for(const side of [-1,1]){
   box('service-bench-tenon',w*.035,h*.14,d*.20,side*w*.402,h*.28,0,board)
   beam('service-bench-knee-brace',new THREE.Vector3(0,h*.28,0),new THREE.Vector3(side*w*.29,legTop-h*.03,0),h*.07,oak)
  }
  top(cap)
  if(!low)for(const x of [-legX,legX])for(const z of [-d*.30,d*.30]){
   const pin=cylinder('service-bench-flush-seat-dowel',d*.019,h*.006,x,h-h*.003,z,endgrain,topSurface)
   pin.geometry.computeBoundingBox();pin.position.y=h-pin.geometry.boundingBox!.max.y
  }
 }
 return true
}
