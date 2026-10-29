import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'

// Generic objects retain their saved frame and pivot. Articulated leaves and
// lids keep their actual dimensions while swinging outside that closed frame;
// this is presentation, not an additional collision or physics simulation.
export function populateBasicProps(e:RenderEntity,output:ModelMesh,low=false):boolean{
 const {kind,width:w,depth:d}=e.geometry,h=Math.max(.035,e.geometry.height)
 if(e.geometry.asset||!['door','crate','lamp'].includes(kind))return false
 const wood:Surface={texture:'wood',roughness:.82},stone:Surface={texture:'stone',roughness:.93},iron:Surface={metalness:.8,roughness:.42},brass:Surface={metalness:.8,roughness:.32}
 const oak='#a58b67',pale='#ba9d75',dark='#71573e',metal='#3b423e',gold='#9b8659'
 const mesh=(geometry:THREE.BufferGeometry,color:string,x:number,y:number,z:number,surface?:Surface,name?:string)=>{if(name)geometry.name=name;return output(geometry,color,x,y,z,surface)}
 const box=(a:number,b:number,c:number,x:number,y:number,z:number,color:string,surface?:Surface,name?:string)=>{
  const dims=[a,b,c].map(n=>Math.max(.00001,n))
  return mesh(low?new THREE.BoxGeometry(...dims as [number,number,number]):new RoundedBoxGeometry(dims[0],dims[1],dims[2],1,Math.min(...dims)*.09),color,x,y,z,surface,name)
 }
 const cylinder=(r:number,length:number,x:number,y:number,z:number,color=metal,surface:Surface=iron,axis:'x'|'y'|'z'='y',segments=low?6:12)=>{
  const p=mesh(new THREE.CylinderGeometry(r,r,Math.max(.00001,length),segments),color,x,y,z,surface);if(axis==='x')p.rotation.z=Math.PI/2;if(axis==='z')p.rotation.x=Math.PI/2;return p
 }
 const ring=(r:number,t:number,x:number,y:number,z:number,color=gold,surface:Surface=brass)=>mesh(new THREE.TorusGeometry(r,t,low?4:8,low?12:24),color,x,y,z,surface)
 const bolt=(x:number,y:number,z:number,r:number,axis:'x'|'z'='z')=>cylinder(r,r*.6,x,y,z,'#817e6b',iron,axis,6)
 const beam=(a:THREE.Vector3,b:THREE.Vector3,width:number,depth:number,color=dark,surface:Surface=wood)=>{
  const center=a.clone().add(b).multiplyScalar(.5),p=box(width,a.distanceTo(b),depth,center.x,center.y,center.z,color,surface)
  p.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return p
 }
 const lathe=(profile:number[][],x:number,y:number,z:number,color:string,surface:Surface=iron,name?:string)=>mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),low?12:32),color,x,y,z,surface,name)
 const pose=(parts:THREE.Mesh[],pivot:THREE.Vector3,axis:THREE.Vector3,angle:number)=>{
  const rotation=new THREE.Quaternion().setFromAxisAngle(axis,angle)
  for(const p of parts){p.position.sub(pivot).applyQuaternion(rotation).add(pivot);p.quaternion.premultiply(rotation)}
 }
 const padlock=(x:number,y:number,z:number,size:number)=>{
  box(size,size*.8,size*.38,x,y,z,gold,brass,'basic-padlock-body')
  const shackle=ring(size*.32,size*.065,x,y+size*.47,z,'#8c9182',iron);shackle.scale.y=1.25
  cylinder(size*.08,size*.04,x,y-size*.08,z+size*.2,'#302f28',undefined,'z',8)
 }
 if(kind==='door'){
  const frame=Math.min(w*.14,h*.08),arch=Math.min(w*.3,h*.24),spring=h-arch,inner=w/2-frame,leafW=inner*1.94,leafD=Math.min(d*.32,w*.055),bottom=h*.016
  const rows=low?3:Math.max(3,Math.min(12,Math.ceil(spring/.38))),archCount=low?7:13
  for(const side of [-1,1])for(let row=0;row<rows;row++)box(frame,spring/rows*.98,d*.98,side*(w-frame)/2,(row+.5)*spring/rows,0,row%2?'#a9a38f':'#b8b09b',stone)
  for(let i=0;i<archCount;i++){
   const start=i/archCount*Math.PI+.008,end=(i+1)/archCount*Math.PI-.008,s=new THREE.Shape(),samples=low?2:5
   for(let j=0;j<=samples;j++){const a=start+(end-start)*j/samples,x=Math.cos(a)*w*.499,y=spring+Math.sin(a)*(arch-h*.002);(j?s.lineTo(x,y):s.moveTo(x,y))}
   for(let j=samples;j>=0;j--){const a=start+(end-start)*j/samples;s.lineTo(Math.cos(a)*inner,spring+Math.sin(a)*Math.max(.001,arch-frame*.65))}s.closePath()
   const bevel=low?0:Math.min(frame*.015,d*.012,h*.0008,w*.0005),g=new THREE.ExtrudeGeometry(s,{depth:d*.94-2*bevel,bevelEnabled:!low,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1})
   mesh(g,i===Math.floor(archCount/2)?'#c7bfa6':'#aba491',0,0,-d*.47+bevel,stone,'basic-door-arch-stone')
  }
  box(w-frame*1.7,bottom,d*.94,0,bottom/2,0,'#b8b09b',stone)
  if(!low)for(const side of [-1,1])for(const level of [.04,.98])box(frame*.99,h*.025,d,side*(w-frame)/2,spring*level,0,'#c7bfa6',stone)
  const leaf:THREE.Mesh[]=[],planks=low?4:Math.max(5,Math.min(11,Math.ceil(leafW/.2)))
  const leafMesh=(...args:Parameters<typeof mesh>)=>{const p=mesh(...args);leaf.push(p);return p}
  const capture=<T extends THREE.Mesh>(p:T)=>{leaf.push(p);return p}
  const core=new THREE.Shape();core.moveTo(-leafW/2,bottom);core.lineTo(leafW/2,bottom)
  for(let i=0;i<=20;i++){const x=leafW/2-i/20*leafW;core.lineTo(x,spring+Math.sqrt(Math.max(0,1-(x/inner)**2))*(arch-frame*.65)-h*.007)}core.closePath()
  leafMesh(new THREE.ExtrudeGeometry(core,{depth:leafD*.65,bevelEnabled:false,steps:1}),dark,0,0,-leafD*.325,wood,'basic-door-leaf-core')
  for(let i=0;i<planks;i++){
   const x=-leafW/2+(i+.5)*leafW/planks,half=leafW/planks*.487,s=new THREE.Shape(),bevel=low?0:Math.min(leafD*.06,leafW/planks*.02,h*.0015)
   s.moveTo(x-half,bottom+bevel);s.lineTo(x+half,bottom+bevel)
   for(let j=0;j<=5;j++){const px=x+half-j/5*half*2,top=spring+Math.sqrt(Math.max(0,1-(px/inner)**2))*(arch-frame*.65)-h*.006;s.lineTo(px,top-bevel)}s.closePath()
   leafMesh(new THREE.ExtrudeGeometry(s,{depth:leafD-2*bevel,bevelEnabled:!low,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1}),i%2?oak:pale,0,0,-leafD/2+bevel,wood,'basic-door-leaf-board')
  }
  const hingeR=Math.min(w*.018,leafD*.2),strapH=Math.min(h*.034,w*.045),hardwareZ=Math.min(d*.18,w*.035)
  for(const side of [-1,1])for(const level of [h*.19,h*.69]){
   capture(box(leafW*.94,strapH,leafD*.12,0,level,side*(leafD/2+leafD*.07),metal,iron,'basic-door-strap'))
   if(!low)for(const x of [-.42,-.21,0,.21,.42])capture(bolt(leafW*x,level,side*(leafD/2+leafD*.17),Math.min(strapH*.22,leafD*.13)))
  }
  for(const y of [h*.19,h*.44,h*.69]){
   cylinder(hingeR,h*.052,-leafW/2,y,0,'#817e6b',iron)
   if(!low)for(const dy of [-1,1])cylinder(hingeR*1.15,hingeR*.45,-leafW/2,y+dy*h*.028,0,'#817e6b',iron)
  }
  for(const side of [-1,1]){
   const x=leafW*.29,y=h*.45,plateW=Math.min(leafW*.14,h*.1),plateH=h*.125,z=side*(leafD/2+hardwareZ*.2),thick=Math.min(leafD*.16,d*.045)
   const s=new THREE.Shape();s.moveTo(-plateW/2,-plateH/2);s.lineTo(plateW/2,-plateH/2);s.lineTo(plateW/2,plateH/2);s.lineTo(-plateW/2,plateH/2);s.closePath()
   const hole=new THREE.Path(),r=Math.min(plateW*.18,plateH*.12),neck=r*.35,cy=-plateH*.12,join=cy-Math.sqrt(r*r-neck*neck)
   hole.moveTo(-neck,-plateH*.36);hole.lineTo(-neck,join);hole.absarc(0,cy,r,Math.atan2(join-cy,-neck),Math.atan2(join-cy,neck),true);hole.lineTo(neck,-plateH*.36);hole.closePath();s.holes.push(hole)
   const plate=capture(mesh(new THREE.ExtrudeGeometry(s,{depth:thick,bevelEnabled:false,curveSegments:low?8:20}),metal,x,y,z-thick/2,iron,'basic-door-keyplate'))
   plate.rotation.y=side<0?Math.PI:0
   const handle=capture(ring(Math.min(leafW*.053,h*.032,d*.3),Math.min(leafW*.009,leafD*.14),x,y+plateH*.3,side*(leafD/2+hardwareZ*.74)));handle.rotation.x=side*.16
   if(!low)capture(cylinder(Math.min(plateW*.1,leafD*.16),hardwareZ*.6,x,y+plateH*.54,side*(leafD/2+hardwareZ*.45),gold,brass,'z'))
  }
  if(e.geometry.locked&&!e.geometry.open){const lockSize=Math.min(w*.075,h*.055,d*.4);padlock(leafW*.29,h*.4,leafD/2+hardwareZ*.75,lockSize)}
  if(e.geometry.open)pose(leaf,new THREE.Vector3(-leafW/2,0,0),new THREE.Vector3(0,1,0),-Math.PI/2)
 }else if(kind==='crate'){
  const t=Math.min(w,d,h)*.065,lidT=t*.85,bodyTop=h-lidT,wallTop=bodyTop-t*.32,boards=low?3:Math.max(4,Math.min(10,Math.ceil(w/.2))),sides=low?3:Math.max(4,Math.min(10,Math.ceil(d/.2)))
  // A continuous inner floor and four separate plank walls enclose a real cavity.
  box(w-t*2,t*.7,d-t*2,0,t*.75,0,dark,wood,'basic-container-floor')
  for(const sign of [-1,1]){
   box(w-t*2.4,wallTop-t,t*.25,0,(wallTop+t)/2,sign*(d/2-t*1.3),dark,wood,'basic-container-liner')
   box(t*.25,wallTop-t,d-t*2.4,sign*(w/2-t*1.3),(wallTop+t)/2,0,dark,wood,'basic-container-liner')
   for(let i=0;i<boards;i++)box(w/boards*.986,wallTop-t,t,-w/2+(i+.5)*w/boards,(wallTop+t)/2,sign*(d/2-t*.85),i%2?oak:pale,wood,'basic-container-wall')
   for(let i=0;i<sides;i++)box(t,wallTop-t,(d-t*2)/sides*.986,sign*(w/2-t*.85),(wallTop+t)/2,-(d-t*2)/2+(i+.5)*(d-t*2)/sides,i%2?pale:oak,wood,'basic-container-wall')
   for(const y of [t*.7,bodyTop-t*.6]){
    box(w,t*1.2,t*1.4,0,y,sign*((d-t*1.4)/2-t*.12),dark,wood)
    box(t*1.4,t*1.2,d-t*.24,sign*((w-t*1.4)/2-t*.12),y,0,dark,wood)
   }
   for(const x of [-1,1]){
    box(t*1.3,bodyTop-t*2.5,t*.9,x*(w-t*1.3)/2,bodyTop/2+t*.05,sign*((d-t*.9)/2-t*.12),dark,wood)
    if(!low)for(const y of [t*1.9,bodyTop-t*1.7]){
     box(t*2.2,t*1.45,t*.16,x*(w-t*2.2)/2,y,sign*(d-t*.16)/2,metal,iron)
     box(t*.16,t*1.45,t*2.2,x*(w-t*.16)/2,y,sign*(d-t*2.2)/2,metal,iron)
     bolt(x*(w-t*1.3)/2,y,sign*(d-t*.12)/2,t*.16)
    }
   }
   if(!low)beam(new THREE.Vector3(-w*.34,t*1.8,sign*((d-t*.42)/2-t*.1)),new THREE.Vector3(w*.34,bodyTop-t*1.8,sign*((d-t*.42)/2-t*.1)),t*.58,t*.42,pale)
  }
  if(!low)for(const side of [-1,1]){
   const x=side*(w-t*.55)/2,handle=new THREE.TorusGeometry(Math.min(h*.09,d*.18),t*.13,6,24,Math.PI)
   handle.rotateZ(Math.PI);handle.rotateY(Math.PI/2)
   mesh(handle,'#a18b64',x,h*.56,0,{roughness:.98},'basic-container-handle')
   for(const z of [-1,1])bolt(x,h*.56,z*Math.min(h*.09,d*.18),t*.2,'x')
  }
  const lid:THREE.Mesh[]=[],capture=(p:THREE.Mesh)=>{lid.push(p);return p},lidY=h-lidT/2
  capture(box(w-t*2,lidT*.3,d-t*2,0,h-lidT*.74,0,dark,wood,'basic-container-lid-liner'))
  for(let i=0;i<boards;i++)capture(box((w-t*2)/boards*.987,lidT*.65,d-t*2,-(w-t*2)/2+(i+.5)*(w-t*2)/boards,lidY,0,i%2?oak:pale,wood,'basic-container-lid-board'))
  for(const side of [-1,1]){
   capture(box(w,lidT,t*1.2,0,lidY,side*(d-t*1.2)/2,dark,wood))
   capture(box(t*1.2,lidT,d,side*(w-t*1.2)/2,lidY,0,dark,wood))
   capture(box(t*.55,lidT*.22,d*.92,side*w*.3,h-lidT*.12,0,metal,iron))
   cylinder(t*.22,w*.14,side*w*.3,bodyTop,-d/2+t*.4,metal,iron,'x')
  }
  capture(box(t*.8,t*2.4,t*.14,0,bodyTop-t*.45,d/2-t*.08,metal,iron,'basic-container-hasp'))
  if(e.geometry.locked&&!e.geometry.open)padlock(0,bodyTop-t*.9,d/2-t*.22,Math.min(w*.08,h*.085,d*.18))
  if(e.geometry.open)pose(lid,new THREE.Vector3(0,bodyTop,-d/2+t*.4),new THREE.Vector3(1,0,0),-Math.PI*.56)
 }else{
  const r=Math.min(w,d)*.09,headH=Math.min(h*.39,Math.min(w,d)*1.4),floor=h-headH,headY=floor+headH*.42,hw=w*.7,hd=d*.7,glassH=headH*.58,post=Math.min(w,d)*.037
  lathe([[0,0],[r*2.6,0],[r*2.8,h*.018],[r*2.75,h*.04],[r*1.7,h*.065],[r*1.4,h*.08],[r*.67,h*.11],[r*.6,floor*.77],[r*.95,floor*.81],[r*.95,floor*.85],[r*.63,floor*.88],[r*.63,floor],[0,floor]],0,0,0,metal,iron,'basic-lantern-pedestal')
  if(!low){
   for(const side of [-1,1]){
    const curve=new THREE.CatmullRomCurve3([[0,.65],[side*.19,.69],[side*.22,.78],[side*.15,.84],[side*.08,.8]].map(([x,y])=>new THREE.Vector3(x*w,y*floor,0)))
    mesh(new THREE.TubeGeometry(curve,32,Math.min(w,d)*.012,8,false),metal,0,0,0,iron)
   }
   for(let i=0;i<8;i++){const angle=i/8*Math.PI*2;cylinder(r*.13,r*.13,Math.cos(angle)*r*2.05,h*.042,Math.sin(angle)*r*2.05,gold,brass,'y',6)}
  }
  for(const y of [floor,floor+glassH])box(hw*1.08,headH*.045,hd*1.08,0,y,0,metal,iron)
  for(const sx of [-1,1])for(const sz of [-1,1])box(post,glassH,post,sx*(hw-post)/2,floor+glassH/2,sz*(hd-post)/2,metal,iron)
  for(const side of [-1,1]){
   box(hw-post*2,glassH*.94,post*.12,0,floor+glassH/2,side*(hd-post)/2,'#b7c7b4',{opacity:.14,roughness:.16,metalness:.03,castShadow:false},'basic-lantern-pane')
   box(post*.12,glassH*.94,hd-post*2,side*(hw-post)/2,floor+glassH/2,0,'#b7c7b4',{opacity:.14,roughness:.16,metalness:.03,castShadow:false},'basic-lantern-pane')
   if(!low){
    for(const sign of [-1,1])beam(new THREE.Vector3(sign*hw*.31,floor+glassH*.08,side*(hd-post)/2),new THREE.Vector3(sign*hw*.14,floor+glassH*.9,side*(hd-post)/2),post*.32,post*.28,metal,iron)
    cylinder(post*.27,post*.65,hw*.29,floor+glassH*.48,side*hd*.51,gold,brass,'z')
   }
  }
  // The burner, wick and pierced vents remain present when the lamp is off.
  lathe([[0,0],[post*1.25,0],[post*1.4,headH*.025],[post*.85,headH*.09],[post*.65,headH*.095],[post*.58,headH*.07],[0,headH*.07]],0,headY-headH*.18,0,gold,brass,'basic-lantern-burner')
  cylinder(post*.15,headH*.055,0,headY-headH*.085,0,'#2d2a23',{roughness:1},'y',6)
  const roof=mesh(new THREE.CylinderGeometry(.1,1,headH*.19,4).rotateY(Math.PI/4),metal,0,floor+glassH+headH*.13,0,iron,'basic-lantern-roof');roof.scale.set(hw*.79,1,hd*.79)
  const ventY=floor+glassH+headH*.025
  for(let i=0;i<(low?4:8);i++){const a=i/(low?4:8)*Math.PI*2;box(post*.55,headH*.04,post*.55,Math.cos(a)*Math.min(hw,hd)*.16,ventY,Math.sin(a)*Math.min(hw,hd)*.16,metal,iron)}
  const ringR=Math.min(Math.min(hw,hd)*.12,headH*.065),ringT=Math.min(post*.25,headH*.012)
  const handle=ring(ringR,ringT,0,h-ringR-ringT,0);handle.rotation.y=.2
  if(e.geometry.active!==false){
   const flameH=headH*.25,flameR=Math.min(hw,hd)*.063
   const p=lathe([[0,0],[flameR*.65,flameH*.08],[flameR,flameH*.28],[flameR*.8,flameH*.52],[flameR*.42,flameH*.76],[0,flameH]],0,headY-flameH*.5,0,'#ffc36d',{emissive:'#f49a3c',roughness:.4,castShadow:false},'basic-lantern-flame')
   if(!low){const positions=p.geometry.attributes.position;for(let i=0;i<positions.count;i++){const y=positions.getY(i)/flameH;positions.setX(i,positions.getX(i)+Math.sin(y*2.7)*flameR*.25*y)}p.geometry.computeVertexNormals()}
   if(!low)lathe([[0,0],[flameR*.5,flameH*.1],[flameR*.46,flameH*.35],[0,flameH*.62]],0,headY-flameH*.48,flameR*.35,'#ffecc0',{emissive:'#ffd58a',castShadow:false},'basic-lantern-flame-core')
  }
 }
 return true
}
