import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'

// Construction details are geometry: joints, recesses, bevels, fasteners and
// curved ironwork remain readable in a neutral/clay view. Runtime batches the
// static parts by material so rivets do not become separate draw calls.
export function populateCraftedEntity(e:RenderEntity,mesh:ModelMesh):boolean {
 const {kind,width:w,depth:d}=e.geometry,h=Math.max(.035,e.geometry.height)
 if(!['wall','door','crate','platform','lamp'].includes(kind))return false
 const wood:Surface={texture:'wood',roughness:.78},stone:Surface={texture:'stone',roughness:.94}
 const iron:Surface={metalness:.86,roughness:.43},brass:Surface={metalness:.8,roughness:.3}
 const part=(geometry:THREE.BufferGeometry,color:string,x:number,y:number,z:number,surface?:Surface)=>mesh(geometry,color,x,y,z,surface)
 const box=(a:number,b:number,c:number,x:number,y:number,z:number,color:string,surface?:Surface,bevel=.035)=>{
  const dims=[a,b,c].map(v=>Math.max(.001,v))
  return part(new RoundedBoxGeometry(dims[0],dims[1],dims[2],2,Math.min(...dims)*bevel),color,x,y,z,surface)
 }
 const tube=(points:THREE.Vector3[],radius:number,color:string,surface?:Surface)=>{
  const path=new THREE.CatmullRomCurve3(points),frames=path.computeFrenetFrames(48,false)
  for(let strand=0;strand<3;strand++){
   const helix=Array.from({length:49},(_,i)=>{const angle=i/48*Math.PI*14+strand*Math.PI*2/3;return path.getPointAt(i/48).addScaledVector(frames.normals[i],Math.cos(angle)*radius*.48).addScaledVector(frames.binormals[i],Math.sin(angle)*radius*.48)})
   part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix),64,Math.max(.001,radius*.48),5,false),color,0,0,0,surface)
  }
 }
 const bolt=(x:number,y:number,z:number,r:number,axis:'x'|'z'='z')=>{
  const m=part(new THREE.CylinderGeometry(r,r,r*.5,6), '#6e6a60',x,y,z,iron)
  if(axis==='z')m.rotation.x=Math.PI/2;else m.rotation.z=Math.PI/2
 }
 let seed=[...(e.id??kind)].reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261)
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 if(kind==='wall'){
  box(w*.985,h*.98,d*.73,0,h*.49,0,'#514c43',undefined,.015)
  const rows=Math.min(14,Math.max(2,Math.round(h/.38))),cols=Math.min(24,Math.max(2,Math.round(w/.65)))
  const rh=h/rows,cw=w/cols,gap=Math.min(.022,rh*.045,cw*.025)
  for(let row=0;row<rows;row++)for(let col=0;col<cols+row%2;col++){
   const left=Math.max(-w/2,-w/2+(col-row%2*.5)*cw),right=Math.min(w/2,left+cw*(col===0&&row%2?.5:1))
   if(right-left<=gap)continue
   const bh=rh-gap,bw=right-left-gap,bd=d*(.85+random()*.13)
   const geometry=new RoundedBoxGeometry(bw,bh,bd,2,Math.min(bw,bh,bd)*(.045+random()*.045))
   const p=geometry.getAttribute('position')
   // Small coherent chips displace real surface vertices, without roughening
   // the outer saved envelope or replacing the stone normal map.
   for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),dent=1-.025*(.5+.5*Math.sin(x*31+y*29+row*7+col*13))*Math.sin(z*23+x*11)**2
    p.setXYZ(i,x*dent,y*dent,z*dent)
   }
   geometry.computeVertexNormals()
   const tint=new THREE.Color('#b7b1a0').multiplyScalar([.86,.92,.98,1.04][Math.floor(random()*4)])
   part(geometry,'#'+tint.getHexString(),(left+right)/2,(row+.5)*rh,0,stone)
  }
  // A separately built coping, with joints and a slight overhang inside bounds.
  const capHeight=Math.min(.12,h*.045),caps=Math.max(1,Math.min(20,Math.ceil(w/.8)))
  for(let i=0;i<caps;i++)box(w/caps*.99,capHeight,d, -w/2+(i+.5)*w/caps,h-capHeight/2,0,'#bcb9aa',stone,.07)
 }else if(kind==='door'){
  const frame=Math.min(w*.15,.2,h*.14),arch=Math.min(w*.36,h*.22),shoulder=h-arch,clearWidth=w-2*frame,clearHeight=shoulder-frame*.3
  // Stone jambs and wedge-shaped voussoirs form a real recessed portal.
  const rows=Math.max(2,Math.min(12,Math.round(shoulder/.34)))
  for(const sign of [-1,1])for(let i=0;i<rows;i++)box(frame,shoulder/rows*.98,d,sign*(w-frame)/2,(i+.5)*shoulder/rows,0,'#ada796',stone,.08)
  const archBlocks=11
  for(let i=0;i<archBlocks;i++){
   const a=i*Math.PI/archBlocks+.012,b=(i+1)*Math.PI/archBlocks-.012,shape=new THREE.Shape()
   const point=(angle:number,inner:boolean)=>new THREE.Vector2(Math.cos(angle)*(w/2-(inner?frame:0)),shoulder+Math.sin(angle)*(arch-(inner?frame*.7:0)))
   const outerA=point(a,false),outerB=point(b,false),innerB=point(b,true),innerA=point(a,true)
   shape.moveTo(outerA.x,outerA.y);shape.lineTo(outerB.x,outerB.y);shape.lineTo(innerB.x,innerB.y);shape.lineTo(innerA.x,innerA.y);shape.closePath()
   const bevel=Math.min(.004,arch*.005,frame*.03,d*.01)
   const wedge=new THREE.ExtrudeGeometry(shape,{depth:d*.92,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,steps:1})
   wedge.scale(.997,1,1)
   part(wedge,i===5?'#c2baa5':'#a8a18f',0,0,-d*.46,stone)
  }
  const leafWidth=e.geometry.open?Math.max(.015,Math.min(frame*.55,.06)):clearWidth*.97,leafX=e.geometry.open?-w/2+frame+leafWidth/2:0,leafDepth=d*.42
  const plankCount=e.geometry.open?1:Math.max(4,Math.min(10,Math.round(clearWidth/.17)))
  for(let i=0;i<plankCount;i++){
   const x=leafX-leafWidth/2+(i+.5)*leafWidth/plankCount
   if(e.geometry.open)box(leafWidth/plankCount*.975,clearHeight,leafDepth,x,clearHeight/2,0,'#a58b67',wood,.09)
   else{
    const half=leafWidth/plankCount*.486,bevel=Math.min(.004,leafWidth/plankCount*.009,leafDepth*.06),shape=new THREE.Shape()
    shape.moveTo(x-half,bevel);shape.lineTo(x+half,bevel)
    for(let sample=0;sample<=6;sample++){
     const px=x+half-sample/6*half*2,top=shoulder+Math.sqrt(Math.max(0,1-(px/(w/2-frame))**2))*(arch-frame*.7)
     shape.lineTo(px,top-bevel)
    }
    shape.closePath()
    part(new THREE.ExtrudeGeometry(shape,{depth:Math.max(.001,leafDepth-2*bevel),bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,steps:1}),i%2?'#a58b67':'#bb9a70',0,0,-leafDepth/2+bevel,wood)
   }
  }
  box(leafWidth,Math.min(.07,h*.025),leafDepth*1.06,leafX,clearHeight*.1,0,'#8e704d',wood)
  if(!e.geometry.open){
   for(const side of [-1,1]){
    for(const level of [.2,.75]){
     const y=clearHeight*level,z=side*(leafDepth/2+d*.055)
     box(leafWidth*.94,h*.035,d*.08,0,y,z,'#363a37',iron,.08)
     for(const x of [-.39,-.16,.16,.39])bolt(x*leafWidth,y,z+side*d*.048,Math.min(w,h)*.012)
     const hinge=part(new THREE.CylinderGeometry(frame*.14,frame*.14,h*.07,12),'#4f5047',-leafWidth*.46,y,z,iron)
     hinge.rotation.x=0
    }
    box(w*.12,h*.13,d*.045,leafWidth*.3,clearHeight*.48,side*(leafDepth*.5+d*.075),'#45483f',iron,.12)
    const handle=part(new THREE.TorusGeometry(Math.min(w*.055,h*.035),Math.min(w*.012,d*.035),10,24),'#bba16a',leafWidth*.3,clearHeight*.48,side*(leafDepth*.5+d*.14),brass)
    handle.rotation.x=.12
    part(new THREE.SphereGeometry(Math.min(w*.018,d*.045,h*.008),12,8),'#b7a26f',leafWidth*.3,clearHeight*.53,side*(leafDepth*.5+d*.105),brass)
   }
  }
 }else if(kind==='crate'){
  const t=Math.min(w,d,h)*.075,bottom=t,bodyTop=h-t
  // Individual boards on all six faces, with visible seams and frame joinery.
  const boardCount=Math.min(10,Math.max(4,Math.round(w/.19))),sideCount=Math.min(10,Math.max(4,Math.round(d/.19)))
  for(const sign of [-1,1]){
   for(let i=0;i<boardCount;i++)box(w/boardCount*.977,h-2*t,t,-w/2+(i+.5)*w/boardCount,h/2,sign*(d-t)/2,i%2?'#a88c66':'#c0a078',wood,.12)
   for(let i=0;i<sideCount;i++)box(t,h-2*t,d/sideCount*.977,sign*(w-t)/2,h/2,-d/2+(i+.5)*d/sideCount,i%2?'#b29a73':'#aa8b60',wood,.12)
   for(const y of [bottom,bodyTop]){
    box(w,t*1.4,t*1.35,0,y,sign*(d-t*1.35)/2,'#8e744f',wood,.12)
    box(t*1.35,t*1.4,d,sign*(w-t*1.35)/2,y,0,'#9d835c',wood,.12)
   }
   for(const x of [-1,1])box(t*1.5,h-2*t,t*1.4,x*(w-t*1.5)/2,h/2,sign*(d-t*1.4)/2,'#967952',wood,.12)
   // Raised diagonal braces are actual timber; both endpoints remain inside.
   const a=w*.72,b=(h-2*t)*.8,brace=box(Math.hypot(a,b),t*.7,t*.55,0,h/2,sign*(d-t*.55)/2,'#b6996e',wood,.08)
   brace.rotation.z=Math.atan2(b,a)*(sign>0?1:-1)
   for(const sx of [-1,1])for(const y of [t*1.4,h*.5,h-t*1.4])bolt(sx*(w-t*1.5)/2,y,sign*(d-t*.1)/2,t*.16)
  }
  for(let i=0;i<boardCount;i++)for(const y of [t*.45,h-t*.45])box(w/boardCount*.98,t*.9,d-2*t,-w/2+(i+.5)*w/boardCount,y,0,'#b69a72',wood,.12)
  for(const sx of [-1,1])for(const sz of [-1,1])for(const y of [t*.7,h-t*.7]){
   box(t*2.4,t*1.25,t*.22,sx*(w-t*2.4)/2,y,sz*(d-t*.22)/2,'#454b46',iron,.08)
   box(t*.22,t*1.25,t*2.4,sx*(w-t*.22)/2,y,sz*(d-t*2.4)/2,'#454b46',iron,.08)
  }
  for(const sx of [-1,1]){
   const x=sx*(w-t*.4)/2
   tube([new THREE.Vector3(x,h*.59,-d*.13),new THREE.Vector3(x-sx*t*.8,h*.43,-d*.15),new THREE.Vector3(x-sx*t*.8,h*.43,d*.15),new THREE.Vector3(x,h*.59,d*.13)],t*.13,'#a28c66',{roughness:1})
   for(const z of [-d*.13,d*.13])bolt(x,h*.59,z,t*.19,'x')
  }
 }else if(kind==='platform'){
  const cap=Math.min(h*.17,.18),foot=Math.min(h*.12,.13),pillarHeight=h-cap-foot
  box(w*.98,cap,d*.98,0,h-cap/2,0,'#bdb6a4',stone,.13)
  box(w,cap*.32,d,0,h-cap*.84,0,'#979586',stone,.12)
  box(w*.92,foot,d*.92,0,foot/2,0,'#8d8c7d',stone,.1)
  const columns=Math.min(12,Math.max(2,Math.ceil(w/.7)))
  for(let i=0;i<columns;i++)for(const sz of [-1,1]){
   const x=-w*.4+(columns===1?0:i/(columns-1)*w*.8),z=sz*d*.32,r=Math.min(w*.072,d*.06,w/columns*.22)
   const column=part(new THREE.CylinderGeometry(r*.85,r,pillarHeight,12,4),'#a5a28f',x,foot+pillarHeight/2,z,stone)
   column.receiveShadow=true
   for(const y of [foot+pillarHeight*.07,foot+pillarHeight*.93])box(r*2.55,Math.min(cap*.65,pillarHeight*.12),r*2.55,x,y,z,'#b5ae98',stone,.14)
  }
  box(w*.84,pillarHeight,d*.44,0,foot+pillarHeight/2,0,'#74776b',stone)
 }else if(kind==='lamp'){
  const radius=Math.min(w,d)*.09,headH=Math.min(h*.39,Math.min(w,d)*1.4),floor=h-headH,headY=floor+headH*.42
  const profile=[[0,0],[radius*2.4,0],[radius*2.65,h*.018],[radius*2.6,h*.04],[radius*1.8,h*.055],[radius*1.35,h*.075],[radius*.65,h*.1],[radius*.6,floor*.78],[radius*.9,floor*.84],[radius*.8,floor*.88],[radius*.6,floor]].map(([x,y])=>new THREE.Vector2(x,y))
  part(new THREE.LatheGeometry(profile,32),'#343b37',0,0,0,iron)
  const hw=w*.72,hd=d*.72,glassH=headH*.58,post=Math.min(w,d)*.045
  for(const y of [floor, floor+glassH])box(hw*1.1,headH*.055,hd*1.1,0,y,0,'#4e5346',iron,.1)
  for(const sx of [-1,1])for(const sz of [-1,1])box(post,glassH,post,sx*(hw-post)/2,floor+glassH/2,sz*(hd-post)/2,'#4b5147',iron,.1)
  for(const side of [-1,1]){
   box(hw*.88,glassH*.91,post*.2,0,floor+glassH/2,side*(hd-post)/2,'#b5c4b1',{opacity:.16,roughness:.19,metalness:.05},0)
   box(post*.2,glassH*.91,hd*.88,side*(hw-post)/2,floor+glassH/2,0,'#b5c4b1',{opacity:.16,roughness:.19,metalness:.05},0)
   for(const sign of [-1,1]){
    const brace=box(post*.32,glassH*.87,post*.32,sign*hw*.2,floor+glassH/2,side*(hd-post)/2,'#756e52',brass)
    brace.rotation.z=sign*.21
   }
  }
  const roof=part(new THREE.ConeGeometry(1,headH*.26,4).rotateY(Math.PI/4),'#414b42',0,floor+glassH+headH*.16,0,iron)
  roof.scale.set(hw*.78,1,hd*.78)
  const ringRadius=Math.min(Math.min(hw,hd)*.13,headH*.065),ringTube=Math.min(post*.3,headH*.012)
  const ring=part(new THREE.TorusGeometry(ringRadius,ringTube,8,24),'#6f735c',0,h-ringRadius-ringTube,0,brass)
  part(new THREE.CylinderGeometry(post*.6,post*.9,glassH*.18,16),'#7a6949',0,floor+glassH*.14,0,brass)
  const flame=part(new THREE.SphereGeometry(Math.min(hw,hd)*.085,16,12),'#ffe1a0',0,headY,0,{emissive:'#ff9f38',roughness:.25})
  flame.scale.set(.72,1.75,.72)
  ring.rotation.y=.2
 }
 return true
}
