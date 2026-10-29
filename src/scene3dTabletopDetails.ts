import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'

// Welded at their UV seam, these solids keep their carved edges when viewed
// from below. No double-sided cards are needed for the column or roof skins.
function flutedTimber(radius:number,height:number,low:boolean){
 const rings=low?[[.37,0],[.29,.1],[.25,.5],[.29,.9],[.37,1]]:[[.37,0],[.37,.018],[.33,.045],[.31,.075],[.29,.11],[.27,.18],[.255,.32],[.25,.5],[.26,.68],[.28,.83],[.31,.91],[.33,.955],[.37,.982],[.37,1]]
 const segments=low?8:64,positions:number[]=[],uv:number[]=[],indices:number[]=[],stride=segments+1
 for(const [r,y] of rings)for(let j=0;j<=segments;j++){
  const angle=j/segments*Math.PI*2,fade=low?0:Math.min(1,y/.12,(1-y)/.12),cut=.12*Math.sin(angle*4)**8*fade,rr=r*radius*(1-cut)
  positions.push(Math.cos(angle)*rr,y*height,Math.sin(angle)*rr);uv.push(j/segments,y)
 }
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<segments;j++){
  const a=i*stride+j,b=a+stride;indices.push(a,b,a+1,a+1,b,b+1)
 }
 for(const side of [0,1]){
  const center=positions.length/3,y=side*height,offset=side?(rings.length-1)*stride:0
  positions.push(0,y,0);uv.push(.5,side)
  for(let j=0;j<segments;j++)side?indices.push(center,offset+j+1,offset+j):indices.push(center,offset+j,offset+j+1)
 }
 const g=new THREE.BufferGeometry();g.name='timber-carved-shaft';g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
}

function clayTile(side:number,u0:number,u1:number,z0:number,z1:number,span:number,rise:number,eave:number,lift:number,low:boolean){
 const rows=low?1:4,segments=low?4:12,stride=segments+1,layer=(rows+1)*stride,positions:number[]=[],uv:number[]=[],indices:number[]=[]
 for(const bottom of [false,true])for(let i=0;i<=rows;i++)for(let j=0;j<=segments;j++){
  const t=i/rows,v=j/segments,roundEnd=low?0:span*.022*(1-Math.sin(v*Math.PI)),u=u0+(u1-u0-roundEnd)*t,z=z0+(z1-z0)*v
  const crown=Math.sin(v*Math.PI)*.017,nose=low?0:-.004*t**8,y=eave+(1-u/span)*rise+lift+crown+nose-(bottom?.018:0)
  positions.push(side*u,y,z);uv.push(u,z)
 }
 for(let i=0;i<rows;i++)for(let j=0;j<segments;j++){
  const a=i*stride+j,b=a+stride;indices.push(a,a+1,b,a+1,b+1,b,layer+a,layer+b,layer+a+1,layer+a+1,layer+b,layer+b+1)
 }
 const border:number[]=[]
 for(let j=0;j<=segments;j++)border.push(j)
 for(let i=1;i<=rows;i++)border.push(i*stride+segments)
 for(let j=segments-1;j>=0;j--)border.push(rows*stride+j)
 for(let i=rows-1;i>0;i--)border.push(i*stride)
 for(let i=0;i<border.length;i++){const a=border[i],b=border[(i+1)%border.length];indices.push(a,layer+a,b,b,layer+a,layer+b)}
 if(side<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]]
 const g=new THREE.BufferGeometry();g.name='clay-overlap-tile';g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
}

function ridgeTile(radius:number,length:number,low:boolean){
 const segments=low?8:16,positions:number[]=[],uv:number[]=[],indices:number[]=[],stride=segments+1,layer=stride*2
 for(const inner of [false,true])for(const end of [-1,1])for(let j=0;j<=segments;j++){
  const theta=j/segments*Math.PI,r=radius-(inner?.014:0)
  positions.push(Math.cos(theta)*r,Math.sin(theta)*r,end*length*.5);uv.push(j/segments,end*.5+.5)
 }
 for(let j=0;j<segments;j++){
  const a=j,b=a+stride;indices.push(a,b,a+1,a+1,b,b+1,layer+a,layer+a+1,layer+b,layer+a+1,layer+b+1,layer+b)
  indices.push(a,a+1,layer+a,a+1,layer+a+1,layer+a,b,layer+b,b+1,b+1,layer+b,layer+b+1)
 }
 for(const j of [0,segments]){
  const a=j,b=a+stride
  j===0?indices.push(a,layer+a,b,b,layer+a,layer+b):indices.push(a,b,layer+a,b,layer+b,layer+a)
 }
 for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]]
 const g=new THREE.BufferGeometry();g.name='clay-ridge-shell';g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
}

// Shared construction language for the additional modules. Geometry is built
// at catalog dimensions; the caller bakes all transforms before resizing.
function tools(mesh:ModelMesh,low:boolean){
 const wood:Surface={texture:'wood',roughness:.83},iron:Surface={metalness:.8,roughness:.43},brass:Surface={metalness:.72,roughness:.4}
 const oak='#79553b',edge='#49382b',board='#ac895b',metal='#46483e'
 const box=(w:number,h:number,d:number,x:number,y:number,z:number,c=oak,s:Surface=wood)=>mesh(low?new THREE.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,1,Math.min(w,h,d)*.1),c,x,y,z,s)
 const cylinder=(r:number,h:number,x:number,y:number,z:number,c=oak,s:Surface=wood)=>mesh(new THREE.CylinderGeometry(r,r,h,low?8:20),c,x,y,z,s)
 const beam=(from:THREE.Vector3,to:THREE.Vector3,r:number,c=oak,s:Surface=wood)=>{const p=from.clone().add(to).multiplyScalar(.5),m=box(r,from.distanceTo(to),r,p.x,p.y,p.z,c,s);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());return m}
 const torus=(r:number,t:number,x:number,y:number,z:number,c=metal,s:Surface=iron)=>mesh(new THREE.TorusGeometry(r,t,low?4:6,low?12:28),c,x,y,z,s)
 const pin=(x:number,y:number,z:number,r=.012)=>{const p=cylinder(r,.006,x,y,z,'#b09c70',brass);p.rotation.x=Math.PI/2;return p}
 const flame=(x:number,y:number,z:number,r:number,h:number,lit=true)=>{
  if(!lit)return
  const p=mesh(new THREE.SphereGeometry(1,low?8:14,low?6:10),'#eb8d3e',x,y,z,{emissive:'#f58a36',roughness:.7,castShadow:false});p.scale.set(r,h*.5,r*.73)
  if(!low){const core=mesh(new THREE.SphereGeometry(1,10,8),'#ffe1a0',x,y-h*.18,z+r*.2,{emissive:'#ffd48a',castShadow:false});core.scale.set(r*.52,h*.3,r*.5)}
 }
 return {wood,iron,brass,oak,edge,board,metal,box,cylinder,beam,torus,pin,flame}
}

export function populateTabletopExtra(e:RenderEntity,mesh:ModelMesh,low:boolean):boolean{
 const a=e.geometry.asset,{width:w,depth:d,height:h}=e.geometry,t=tools(mesh,low),{box,cylinder,beam,torus,pin,flame,wood,iron,brass,oak,edge,board,metal}=t
 if(a==='timber-pillar'){
  const r=Math.min(w,d),shaft=h*.72,base=h*.13
  box(w,h*.055,d,0,h*.0275,0,edge)
  box(w*.89,h*.04,d*.89,0,h*.075,0,oak)
  box(w*.76,h*.045,d*.76,0,h*.1075,0,board)
  mesh(flutedTimber(r,shaft,low),oak,0,base,0,wood)
  const capital=[[0,0],[r*.33,0],[r*.34,h*.018],[r*.36,h*.025],[r*.32,h*.04],[r*.39,h*.065],[r*.44,h*.085],[r*.44,h*.1],[0,h*.1]].map(([x,y])=>new THREE.Vector2(x,y))
  mesh(new THREE.LatheGeometry(capital,low?8:32),board,0,h*.84,0,wood)
  box(w*.88,h*.025,d*.88,0,h*.9475,0,oak)
  box(w,h*.04,d,0,h*.98,0,edge)
  if(!low){
   // Eight spear-shaped leaves stand clear of the scalloped capital. Their
   // shallow bevels catch side light and leave real shadows in the recesses.
   const leaf=new THREE.Shape();leaf.moveTo(0,0);leaf.bezierCurveTo(-r*.095,h*.035,-r*.075,h*.062,0,h*.078);leaf.bezierCurveTo(r*.075,h*.062,r*.095,h*.035,0,0);leaf.closePath()
   for(let i=0;i<8;i++){
    const angle=i/8*Math.PI*2,g=new THREE.ExtrudeGeometry(leaf,{depth:r*.018,bevelEnabled:true,bevelSegments:1,bevelThickness:r*.009,bevelSize:r*.007,curveSegments:6});g.name='timber-capital-leaf'
    const part=mesh(g,i%2?oak:board,Math.sin(angle)*r*.345,h*.85,Math.cos(angle)*r*.345,wood);part.rotation.y=angle
   }
   for(const side of [-1,1])for(const y of [h*.075,h*.98])pin(side*w*.3,y,d*.465,r*.025)
  }
 }else if(a==='timber-railing'){
  for(const side of [-1,1]){box(w*.06,h,d*.86,side*w*.46,h/2,0,edge);box(w*.08,h*.055,d,side*w*.46,h*.9725,0,board)}
  for(const y of [h*.14,h*.88])box(w*.93,h*.08,d*.76,0,y,0,oak)
  const n=low?5:9
  for(let i=0;i<n;i++){
   const x=-w*.38+i/(n-1)*w*.76
   const profile=[[.021,0],[.028,.04],[.019,.13],[.014,.3],[.025,.48],[.016,.67],[.019,.86],[.028,.96],[.021,1]].map(([r,y])=>new THREE.Vector2(r,y*h*.68))
   mesh(new THREE.LatheGeometry(profile,low?6:10),i%2?board:oak,x,h*.18,0,wood)
  }
  if(!low)for(const x of [-w*.38,w*.38])for(const y of [h*.14,h*.88])pin(x,y,d*.395)
 }else if(a==='timber-beam'){
  box(w,h*.82,d*.86,0,h*.5,0,oak)
  for(const side of [-1,1]){
   box(w*.08,h,d,side*w*.43,h/2,0,edge)
   if(!low)for(const y of [h*.25,h*.75])pin(side*w*.43,y,d*.475,.014)
  }
  if(!low)for(let i=0;i<5;i++)box(w*.11,h*.02,d*.87,(i-2)*w*.17,h*.13,0,board)
 }else if(a==='roof-tile'){
  const span=w*.47,rise=h*.72,eave=h*.12,rows=low?3:4,cols=low?4:6
  for(const side of [-1,1]){
   for(const z of (low?[-d*.43,d*.43]:[-d*.46,-d*.23,0,d*.23,d*.46])){
    const rafter=beam(new THREE.Vector3(side*span,eave-.035,z),new THREE.Vector3(0,eave+rise-.035,z),.05,edge);rafter.geometry.name='roof-rafter'
   }
   if(!low)for(const u of [span*.29,span*.7])box(.045,.045,d*.93,side*u,eave+(1-u/span)*rise-.07,0,oak)
   for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const u0=row/rows*span,u1=Math.min(span,(row+1)/rows*span+(low?0:span*.045)),shift=!low&&row%2?.5:0
    const boundary=(i:number)=>i===0?0:i===cols?1:(i+shift)/cols,z0=-d*.485+boundary(col)*d*.97+.002,z1=-d*.485+boundary(col+1)*d*.97-.002
    const g=clayTile(side,u0,u1,z0,z1,span,rise,eave,(rows-1-row)*.02,low)
    mesh(g,(row+col)%3?'#9d5e43':'#b47850',0,0,0,{roughness:.93})
   }
  }
  for(const z of [-d*.46,d*.46]){
   box(w*.94,.05,.065,0,eave-.027,z,edge)
   if(!low){
    box(.045,rise-.07,.055,0,eave+(rise-.07)/2,z,board)
    for(const side of [-1,1])beam(new THREE.Vector3(side*span*.56,eave,z),new THREE.Vector3(0,eave+rise*.63,z),.035,oak)
   }
  }
  const count=low?4:8
  for(let i=0;i<count;i++){
   mesh(ridgeTile(.075,d*.98/count*.985,low),'#b1744b',0,eave+rise+(rows-1)*.02,-d*.49+(i+.5)*d*.98/count,{roughness:.9})
  }
 }else if(a==='round-table'){
  const top=h*.82,r=Math.min(w,d)*.475
  const profile=[[0,0],[r*.46,0],[r*.54,h*.035],[r*.5,h*.075],[r*.25,h*.13],[r*.15,h*.21],[r*.12,h*.47],[r*.2,h*.65],[r*.41,top-h*.07],[r*.92,top-h*.07],[r,top-h*.045],[r,top-h*.01],[r*.98,top],[0,top]].map(([x,y])=>new THREE.Vector2(x,y))
  mesh(new THREE.LatheGeometry(profile,low?12:32),oak,0,0,0,wood)
  const rim=torus(r*.965,h*.012,0,top-h*.015,0,board,wood);rim.rotation.x=Math.PI/2
  if(!low){
   for(const side of [-1,1]){
    const x=side*r*.43,z=side*r*.19,cr=r*.075
    cylinder(cr,cr*1.4,x,top+cr*.7,z,'#c3b18c',{roughness:.8})
    cylinder(cr*.8,.005,x,top+cr*1.405,z,'#4c3628',{roughness:.4})
    const handle=torus(cr*.5,cr*.13,x+cr,top+cr*.7,z,'#c3b18c',{roughness:.8});handle.rotation.y=Math.PI/2
   }
   cylinder(r*.21,.015,0,top+.008,0,'#c5b796',{roughness:.9})
   for(let i=-2;i<=2;i++)box(r*.09,.002,r*.18,i*r*.075,top+.026,0,'#bd8a51',{roughness:1})
  }
 }else if(a==='stool'){
  const r=Math.min(w,d)*.46,seat=h*.86
  for(let i=0;i<3;i++){
   const angle=i/3*Math.PI*2,from=new THREE.Vector3(Math.cos(angle)*r*.8,h*.035,Math.sin(angle)*r*.8),to=new THREE.Vector3(Math.cos(angle)*r*.51,seat,Math.sin(angle)*r*.51)
   beam(from,to,r*.16,edge)
  }
  const foot=torus(r*.69,r*.055,0,h*.25,0,oak,wood);foot.rotation.x=Math.PI/2
  const profile=[[0,seat],[r*.94,seat],[r,seat+h*.025],[r,h*.97],[r*.94,h],[0,h]].map(([x,y])=>new THREE.Vector2(x,y))
  mesh(new THREE.LatheGeometry(profile,low?12:28),board,0,0,0,wood)
  if(!low)for(const side of [-1,1]){const m=mesh(new THREE.CylinderGeometry(.009,.009,.004,6),metal,side*r*.55,h-.002,0,iron);m.rotation.y=Math.PI/6}
 }else if(a==='torch'){
  box(w*.7,h*.48,.035,0,h*.4,-d*.43,edge)
  for(const y of [h*.2,h*.6])pin(0,y,-d*.385,.017)
  const path=new THREE.CatmullRomCurve3([new THREE.Vector3(0,h*.3,-d*.39),new THREE.Vector3(0,h*.3,d*.03),new THREE.Vector3(0,h*.46,d*.09)])
  mesh(new THREE.TubeGeometry(path,low?8:20,.017,low?5:8,false),metal,0,0,0,iron)
  beam(new THREE.Vector3(0,h*.18,d*.02),new THREE.Vector3(0,h*.72,d*.22),w*.16,oak)
  const head=cylinder(w*.29,h*.14,0,h*.73,d*.22,metal,iron)
  head.rotation.z=.08
  for(const y of [.67,.73,.79]){const binding=torus(w*.285,.012,0,h*y,d*.22,metal,iron);binding.rotation.x=Math.PI/2}
  if(!low)for(const side of [-1,1])box(.012,h*.14,.013,side*w*.25,h*.73,d*.22,board)
  flame(0,h*.885,d*.22,w*.2,h*.18,e.geometry.active!==false)
 }else if(a==='trap-fire'){
  box(w*.98,h*.032,d*.98,0,h*.016,0,'#a19b87',{texture:'stone',roughness:.96})
  box(w*.86,h*.015,d*.86,0,h*.04,0,metal,iron)
  for(let i=0;i<(low?5:9);i++)box(w*.76,h*.014,d*.025,0,h*.055,(i-(low?2:4))*d*.075,'#777465',iron)
  for(const sx of [-1,1])for(const sz of [-1,1]){const bolt=cylinder(.018,.014,sx*w*.36,h*.055,sz*d*.36,'#9c947a',brass);bolt.rotation.y=Math.PI/6}
  if(e.geometry.active!==false){
   const plume=(x:number,z:number,r:number,height:number,color:string)=>{
    const rows=low?8:16,cols=low?8:14,positions:number[]=[],uv:number[]=[],indices:number[]=[]
    for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
     const v=i/rows,theta=j/cols*Math.PI*2,radius=r*(.2*(1-v)+Math.sin(v*Math.PI)**.8*(1-v*.4))*(.9+.1*Math.sin(theta*3+v*11))
     positions.push(x+Math.cos(theta)*radius+Math.sin(v*7)*r*v*.6,h*.058+v*height,z+Math.sin(theta)*radius+Math.cos(v*9)*r*v*.28);uv.push(j/cols,v)
    }
    for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1)}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals()
    mesh(geometry,color,0,0,0,{emissive:color,castShadow:false,roughness:.6,doubleSided:true})
   }
   plume(0,0,w*.13,h*.92,'#ed8235')
   if(!low){plume(w*.13,d*.08,w*.08,h*.56,'#ffc76c');plume(-w*.16,-d*.09,w*.07,h*.49,'#ef9e48')}
  }
 }else if(a==='chandelier'){
  const r=Math.min(w,d)*.38,ringY=h*.33
  const hoop=torus(r,.028,0,ringY,0,metal,iron);hoop.rotation.x=Math.PI/2
  for(let i=0;i<6;i++){
   const angle=i/6*Math.PI*2,x=Math.cos(angle)*r,z=Math.sin(angle)*r
   const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,h*.55,0),new THREE.Vector3(x*.45,h*.48,z*.45),new THREE.Vector3(x,ringY,z)])
   mesh(new THREE.TubeGeometry(curve,low?8:20,.02,low?5:8,false),metal,0,0,0,iron)
   cylinder(.07,.022,x,ringY+.015,z,'#af9464',brass)
   cylinder(.042,h*.17,x,ringY+h*.11,z,'#e7d2a1',{roughness:.85})
   flame(x,ringY+h*.245,z,.035,h*.14,e.geometry.active!==false)
  }
  for(let i=0;i<5;i++){const link=torus(.043,.009,0,h*(.6+i*.08),0,metal,iron);link.rotation.y=i%2?Math.PI/2:0}
  cylinder(.065,h*.025,0,h*.9875,0,metal,iron)
 }else return false
 return true
}

export function addTabletopJoinery(e:RenderEntity,mesh:ModelMesh,low:boolean){
 if(low)return
 const a=e.geometry.asset,{width:w,depth:d,height:h}=e.geometry,{box,pin,torus,iron,brass,edge,metal}=tools(mesh,false)
 if(a==='timber-wall'||a==='timber-window'){
  for(const side of [-1,1])for(const x of [-w*.465,w*.465])for(const y of [h*.08,h*.35,h*.94])pin(x,y,side*d*.47,.012)
 }else if(a==='chair'){
  for(const x of [-w*.35,w*.35])for(const y of [h*.67,h*.9])pin(x,y,-d*.392,.01)
 }else if(a==='table'||a==='bench'||a==='bar'){
  const top=h
  for(const sx of [-1,1])for(const sz of [-1,1]){const nail=mesh(new THREE.CylinderGeometry(.009,.009,.003,6),'#6a6853',sx*w*.39,top-.002,sz*d*.34,iron);nail.rotation.y=.2}
 }else if(a==='bed'){
  for(const x of [-w*.46,w*.46])for(const z of [-d*.46,d*.46])box(w*.075,h*.035,d*.075,x,z<0?h*.975:h*.595,z,edge)
 }else if(a==='fireplace'){
  for(const side of [-1,1]){const poker=box(.014,h*.29,.014,side*w*.4,h*.19,d*.41,metal,iron);poker.rotation.z=side*.08}
 }
 const locked=(e.geometry as {locked?:boolean}).locked
 if(locked&&!e.geometry.open&&(a==='timber-door'||a==='chest')){
  const x=a==='timber-door'?w*.27:0,y=a==='timber-door'?h*.41:h*.43,z=a==='timber-door'?d*.445:d*.455
  box(Math.min(.075,w*.1),Math.min(.105,h*.15),Math.min(.025,d*.08),x,y,z,'#b19b6b',brass)
  const hoop=torus(Math.min(.022,w*.03),Math.min(.006,d*.016),x,y+Math.min(.065,h*.1),z,'#b19b6b',brass);hoop.rotation.x=0
  box(.01,.024,.002,x,y,z+Math.min(.014,d*.042),'#3d4038',iron)
 }
}
