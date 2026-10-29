import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'
import {tabletopAsset} from './tabletopCatalog'
import {populateTabletopExtra,addTabletopJoinery} from './scene3dTabletopDetails'
import {populateTavernFurniture} from './scene3dTavernFurniture'
import {populateTavernStructure} from './scene3dTavernStructure'
import {populateServiceFurniture} from './scene3dServiceFurniture'
import {populateStorageFurniture} from './scene3dStorageFurniture'

// A single art direction for the modular set: lime plaster, dark oak, warm
// stone and forged iron. Furniture details are solid geometry, including the
// backs, feet, crockery and joinery visible from an orbiting tabletop camera.
export function populateTabletopEntity(e:RenderEntity,output:ModelMesh,low=false):boolean{
 const a=e.geometry.asset
 if(!a)return false
 const reference=tabletopAsset(a);if(!reference)return false
 const parts:THREE.Mesh[]=[],mesh:ModelMesh=(...args)=>{const part=output(...args);parts.push(part);return part}
 const {width:w,depth:d}=reference,h=Math.max(.02,reference.height),lit=e.geometry.active!==false
 const wood:Surface={texture:'wood',roughness:.83},stone:Surface={texture:'stone',roughness:.95},iron:Surface={metalness:.75,roughness:.5}
 const oak='#745039',edge='#49382b',board='#a88257',plaster='#d4c5a2',rock='#999484',metal='#45453a'
 const box=(x:number,y:number,z:number,px:number,py:number,pz:number,c=oak,s?:Surface,bevel=.04)=>mesh(low||bevel===0?new THREE.BoxGeometry(Math.max(.001,x),Math.max(.001,y),Math.max(.001,z)):new RoundedBoxGeometry(Math.max(.001,x),Math.max(.001,y),Math.max(.001,z),1,Math.min(x,y,z)*bevel),c,px,py,pz,s)
 const cyl=(r1:number,r2:number,height:number,x:number,y:number,z:number,c:string,s?:Surface,segments=low?8:16)=>mesh(new THREE.CylinderGeometry(r1,r2,Math.max(.001,height),segments),c,x,y,z,s)
 const ring=(r:number,t:number,x:number,y:number,z:number,c=metal)=>{const m=mesh(new THREE.TorusGeometry(r,t,low?4:6,low?12:24),c,x,y,z,iron);m.rotation.x=Math.PI/2;return m}
 const beam=(from:THREE.Vector3,to:THREE.Vector3,thick:number,c=oak,s:Surface=wood)=>{const middle=from.clone().add(to).multiplyScalar(.5),b=box(thick,from.distanceTo(to),thick,middle.x,middle.y,middle.z,c,s);b.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());return b}
 const lathe=(profile:number[][],x:number,y:number,z:number,c:string,s:Surface=wood,segments=low?8:20)=>mesh(new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),segments),c,x,y,z,s)
 const closedTube=(points:THREE.Vector3[],radius:number,segments=low?8:22)=>{
  const path=new THREE.CatmullRomCurve3(points),radial=low?5:8,g=new THREE.TubeGeometry(path,segments,radius,radial,false),p=g.attributes.position,tex=g.attributes.uv
  const positions=Array.from(p.array),uv=Array.from(tex.array),indices=Array.from(g.index!.array),centers=[path.getPointAt(0),path.getPointAt(1)]
  for(let side=0;side<2;side++){
   const index=positions.length/3,c=centers[side],offset=side?segments*(radial+1):0,tangent=path.getTangentAt(side).multiplyScalar(side?1:-1)
   positions.push(c.x,c.y,c.z);uv.push(.5,.5)
   for(let i=0;i<radial;i++){
    const a=offset+i,b=offset+i+1,v1=new THREE.Vector3().fromArray(positions,a*3).sub(c),v2=new THREE.Vector3().fromArray(positions,b*3).sub(c)
    if(v1.cross(v2).dot(tangent)>0)indices.push(index,a,b);else indices.push(index,b,a)
   }
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
 }
 const sculptedSlab=(width:number,depth:number,thickness:number,nx:number,nz:number,heightAt:(x:number,z:number)=>number)=>{
  const positions:number[]=[],uv:number[]=[],indices:number[]=[],stride=nx+1,layer=stride*(nz+1)
  for(const top of [true,false])for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
   const x=(i/nx-.5)*width,z=(j/nz-.5)*depth;positions.push(x,top?thickness/2+heightAt(x,z):-thickness/2,z);uv.push(i/nx,j/nz)
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
   const a=j*stride+i,b=a+1,c=a+stride,d=c+1;indices.push(a,c,b,b,c,d,layer+a,layer+b,layer+c,layer+b,layer+d,layer+c)
  }
  const border:number[]=[]
  for(let i=0;i<=nx;i++)border.push(nz*stride+i)
  for(let j=nz-1;j>=0;j--)border.push(j*stride+nx)
  for(let i=nx-1;i>=0;i--)border.push(i)
  for(let j=1;j<nz;j++)border.push(j*stride)
  for(let i=0;i<border.length;i++){const a=border[i],b=border[(i+1)%border.length];indices.push(a,layer+a,b,b,layer+a,layer+b)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
 }
 const flame=(x:number,y:number,z:number,r:number,height:number)=>{
  if(!lit)return
  const outer=mesh(new THREE.SphereGeometry(1,low?8:12,low?6:10),'#ef963f',x,y,z,{emissive:'#ef7b2d',roughness:.6,castShadow:false});outer.scale.set(r,height*.5,r*.7)
  if(!low){const core=mesh(new THREE.SphereGeometry(1,10,8),'#ffe2a0',x-r*.12,y-height*.16,z+r*.35,{emissive:'#ffd178',castShadow:false});core.scale.set(r*.55,height*.3,r*.45)}
 }
 const authored=populateTavernFurniture(e,mesh,low)||populateServiceFurniture(e,mesh,low)||populateStorageFurniture(e,mesh,low)||populateTavernStructure(e,mesh,low)
 if(authored){
  // These complete models include their own joinery and material palette.
 }else if(a.startsWith('floor-')){
  if(a==='floor-wood'){
   box(w,.012,d,0,.006,0,edge,wood,0)
   const count=low?2:7
   for(let i=0;i<count;i++){
    const x=-w/2+(i+.5)*w/count,split=(i%3+1)/5
    for(const [start,end] of [[-d/2,-d/2+d*split],[-d/2+d*split,d/2]]){
     box(w/count-.008,.018,end-start-.008,x,.011,(start+end)/2,['#d0bd8c','#c1bc98'][i%2],wood,.09)
     if(!low)for(const z of [start+.045,end-.045])for(const dx of [-1,1])cyl(.008,.008,.003,x+dx*w/count*.33,.021,z,metal,iron,6)
    }
   }
  }else if(a==='floor-stone'){
   box(w,.012,d,0,.006,0,'#555b50',stone,0)
   const n=low?1:3
   for(let i=0;i<n;i++)for(let j=0;j<n;j++)box(w/n-.018,.022,d/n-.018,-w/2+(i+.5)*w/n,.012,-d/2+(j+.5)*d/n,(i+j)%3?'#a7a394':'#919789',stone,.13)
  }else{
   box(w,.015,d,0,.0075,0,'#647551',{texture:'forest',roughness:1},0)
   if(!low)for(let i=0;i<9;i++){
    const x=Math.sin(i*13.1)*w*.42,z=Math.cos(i*9.7)*d*.42
    const p=mesh(new THREE.IcosahedronGeometry(.04,0),'#879164',x,.018,z,{roughness:1});p.scale.y=.4
   }
  }
 }else if(a==='timber-wall'||a==='timber-window'){
  const t=Math.min(.14,w*.07),sill=h*.36,head=h*.79,opening=w*.57
  if(a==='timber-wall')box(w-t,h-.08,d*.65,0,h/2,0,plaster,{roughness:1})
  else{
   box(w-t,sill,d*.65,0,sill/2,0,plaster,{roughness:1})
   box(w-t,h-head,d*.65,0,(h+head)/2,0,plaster,{roughness:1})
   for(const sign of [-1,1])box((w-opening)/2-t*.5,head-sill,d*.65,sign*(w+opening-t)/4,(sill+head)/2,0,plaster,{roughness:1})
   for(const y of [sill,head])box(opening+.08,.08,d,0,y,0,edge,wood)
   for(const x of [-opening/2,0,opening/2])box(.045,head-sill,d*.72,x,(head+sill)/2,0,edge,wood)
   box(opening,.035,d*.65,0,(head+sill)/2,0,edge,wood)
   if(!low){
    const sillShape=new THREE.Shape();sillShape.moveTo(-d*.49,0);sillShape.lineTo(d*.49,.012);sillShape.lineTo(d*.39,.06);sillShape.lineTo(-d*.39,.055);sillShape.closePath()
    const sillGeo=new THREE.ExtrudeGeometry(sillShape,{depth:opening+.14,bevelEnabled:false});sillGeo.rotateY(Math.PI/2);sillGeo.translate(-(opening+.14)/2,0,0)
    mesh(sillGeo,board,0,sill-.06,0,wood)
    for(const side of [-1,1])for(const x of [-opening*.37,opening*.37])beam(new THREE.Vector3(x,sill-.18,side*d*.21),new THREE.Vector3(x,sill-.035,side*d*.38),.035,edge)
   }
   // Shutters sit beside a genuinely empty opening; no opaque window card.
   if(!low)for(const sign of [-1,1])for(let i=0;i<3;i++)box(w*.035,(head-sill)*.9,d*.1,sign*(opening*.58+i*w*.04),(head+sill)/2,d*.42,board,wood)
  }
  for(const sign of [-1,1])box(t,h,d,sign*(w-t)/2,h/2,0,edge,wood)
  for(const y of [.08,h*.35,h-.07])box(w,.12,d*.95,0,y,0,oak,wood)
  if(a==='timber-wall')for(const face of [-1,1])for(const sign of [-1,1])beam(new THREE.Vector3(sign*(w/2-t),h*.38,face*d*.3),new THREE.Vector3(0,h-.16,face*d*.3),t*.55,oak)
  // Stone footing, with separate blocks and a visible mortar joint.
  const count=low?2:4
  for(let i=0;i<count;i++)box(w/count-.015,h*.08,d,-w/2+(i+.5)*w/count,h*.04,0,rock,stone)
 }else if(a==='stone-wall'){
  const base=h*.075,cap=h*.05,rows=low?3:6,cols=low?2:3,rowH=(h-base-cap)/rows,cw=w/cols,gap=low?.025:.018
  // Recessed pointing remains behind distinct staggered ashlar blocks.
  box(w*.994,h*.97,d*.65,0,h*.485,0,'#55594e',stone,0)
  for(let row=0;row<rows;row++)for(let col=0;col<cols+row%2;col++){
   const left=Math.max(-w/2,-w/2+(col-row%2*.5)*cw),right=Math.min(w/2,-w/2+(col+1-row%2*.5)*cw)
   if(right-left<=gap)continue
   const bw=right-left-gap,bh=rowH-gap,bd=d*(.86+.1*(.5+.5*Math.sin(row*19+col*13))),g=low?new THREE.BoxGeometry(bw,bh,bd):new RoundedBoxGeometry(bw,bh,bd,1,Math.min(bw,bh,bd)*.085)
   if(!low){const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),dent=1-.022*(.5+.5*Math.sin(x*33+y*31+row*7+col*11))*Math.sin(z*37+x*17)**2;p.setXYZ(i,x*dent,y*dent,z*dent)}g.computeVertexNormals()}
   mesh(g,['#999484','#aaa692','#8d9385'][(row+col)%3],(left+right)/2,base+(row+.5)*rowH,0,stone)
  }
  for(let i=0;i<(low?2:4);i++){
   const n=low?2:4,x=-w/2+(i+.5)*w/n
   box(w/n-.012,base,d*.98,x,base/2,0,'#aaa692',stone,.09)
   box(w/n-.012,cap,d,x,h-cap/2,0,'#bbb09a',stone,.12)
  }
 }else if(a==='dungeon-arch'){
  const outerX=w*.48,innerX=w*.33,outerY=h*.27,innerY=h*.17,spring=h*.69,depth=d*.92,jamb=outerX-innerX,rows=low?3:6,blocks=low?7:13,bevel=low?0:Math.min(.008,d*.015)
  for(const side of [-1,1])for(let row=0;row<rows;row++)box(jamb*.985,spring/rows*.978,depth,side*(outerX+innerX)/2,(row+.5)*spring/rows,0,row%2?rock:'#aaa692',stone,.1)
  for(let i=0;i<blocks;i++){
   const start=i/blocks*Math.PI+.007,end=(i+1)/blocks*Math.PI-.007,shape=new THREE.Shape(),segments=low?2:5
   shape.moveTo(Math.cos(start)*innerX,spring+Math.sin(start)*innerY)
   for(let j=0;j<=segments;j++){const t=start+(end-start)*j/segments;shape.lineTo(Math.cos(t)*outerX,spring+Math.sin(t)*outerY)}
   for(let j=segments;j>=0;j--){const t=start+(end-start)*j/segments;shape.lineTo(Math.cos(t)*innerX,spring+Math.sin(t)*innerY)}shape.closePath()
   const g=new THREE.ExtrudeGeometry(shape,{depth:depth-bevel*2,bevelEnabled:!low,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1})
   mesh(g,i===Math.floor(blocks/2)?'#bbb09a':i%2?rock:'#aaa692',0,0,-depth/2+bevel,stone)
  }
  for(const side of [-1,1]){
   box(jamb*1.1,h*.075,d,side*(outerX+innerX)/2,h*.0375,0,'#bbb09a',stone,.1)
   box(jamb*1.08,h*.035,d*.99,side*(outerX+innerX)/2,spring-h*.02,0,'#bbb09a',stone,.1)
  }
  box(w*.97,h*.014,d*.9,0,h*.007,0,rock,stone,.08)
  const leafWidth=e.geometry.open?w*.027:innerX*1.96,leafX=e.geometry.open?-innerX+leafWidth*.6:0,leafDepth=d*.26,clearHeight=spring+innerY-h*.014
  if(e.geometry.open)box(leafWidth,spring+innerY*.16,leafDepth,leafX,(spring+innerY*.16)/2,0,board,wood)
  else{
   const n=low?4:10
   for(let i=0;i<n;i++){
    const x=leafX-leafWidth/2+(i+.5)*leafWidth/n,half=leafWidth/n*.485,s=new THREE.Shape();s.moveTo(x-half,h*.014);s.lineTo(x+half,h*.014)
    for(let j=0;j<=4;j++){const px=x+half-j/4*half*2;s.lineTo(px,spring+Math.sqrt(Math.max(0,1-(px/innerX)**2))*innerY-h*.014)}s.closePath()
    mesh(new THREE.ExtrudeGeometry(s,{depth:leafDepth,bevelEnabled:false}),i%2?board:oak,0,0,-leafDepth/2,wood)
   }
  }
  if(!e.geometry.open){
   // Tongue-and-groove backing closes the plank joints without a rectangular
   // card protruding above the fitted arch of the timber leaf.
   const s=new THREE.Shape();s.moveTo(-leafWidth/2,h*.014);s.lineTo(leafWidth/2,h*.014)
   for(let i=0;i<=(low?8:20);i++){const x=leafWidth/2-i/(low?8:20)*leafWidth;s.lineTo(x,spring+Math.sqrt(Math.max(0,1-(x/innerX)**2))*innerY-h*.014)}s.closePath()
   mesh(new THREE.ExtrudeGeometry(s,{depth:leafDepth*.28,bevelEnabled:false}),edge,0,0,-leafDepth*.14,wood)
  }
  for(const side of [-1,1])for(const level of [.19,.72]){
   const y=spring*level,z=side*(leafDepth*.5+d*.028)
   box(leafWidth*.96,h*.024,d*.045,leafX,y,z,metal,iron,.08)
   if(!low&&!e.geometry.open)for(const x of [-.4,-.17,.17,.4]){
    const rivet=cyl(w*.006,w*.006,d*.024,x*leafWidth,y,z+side*d*.026,'#928b73',iron,6);rivet.rotation.x=Math.PI/2
   }
  }
  if(!e.geometry.open){
   for(const side of [-1,1]){
    const handle=mesh(new THREE.TorusGeometry(w*.036,w*.006,low?4:7,low?10:22),'#aa9263',leafWidth*.29,clearHeight*.46,side*(leafDepth*.5+d*.065),iron);handle.rotation.x=side*.08
    box(w*.065,h*.09,d*.025,leafWidth*.29,clearHeight*.48,side*(leafDepth*.5+d*.033),metal,iron,.1)
   }
   if(e.geometry.locked){
    box(w*.043,h*.045,d*.047,leafWidth*.27,clearHeight*.4,leafDepth*.5+d*.075,'#aa9263',iron,.12)
    const lock=mesh(new THREE.TorusGeometry(w*.015,w*.0035,6,16),'#aa9263',leafWidth*.27,clearHeight*.4+h*.032,leafDepth*.5+d*.075,iron);lock.rotation.x=0
   }
  }
 }else if(a==='timber-door'){
  const t=w*.09,clear=w-t*2,top=h*.91,leaf=e.geometry.open?Math.min(.055,clear*.08):clear*.98,x=e.geometry.open?-w/2+t+leaf/2:0
  for(const sign of [-1,1])box(t,h,d,sign*(w-t)/2,h/2,0,edge,wood)
  box(w,h-top,d,0,(h+top)/2,0,edge,wood)
  const count=e.geometry.open?1:low?3:7
  for(let i=0;i<count;i++)box(leaf/count*.97,top-.035,d*.5,x-leaf/2+(i+.5)*leaf/count,top/2,0,i%2?board:oak,wood)
  for(const y of [top*.2,top*.77]){
   box(leaf,.065,d*.58,x,y,0,metal,iron)
   if(!low&&!e.geometry.open)for(let i=0;i<5;i++)mesh(new THREE.SphereGeometry(.017,6,6),'#9d9477',x+(i-2)*leaf*.2,y,d*.31,iron)
  }
  if(!e.geometry.open){const handle=mesh(new THREE.TorusGeometry(.07,.014,6,20),'#aa9263',clear*.32,top*.47,d*.35,iron);handle.rotation.x=.12}
 }else if(a==='chair'){
  const seat=h*.47,thick=h*.065,seatW=w*.9,seatD=d*.86
  for(const sx of [-1,1])for(const sz of [-1,1]){
   const legH=sz<0?h*.94:seat,r=Math.min(w,d)*.052
   if(low)box(w*.1,legH,d*.1,sx*w*.36,legH/2,sz*d*.34,edge,wood)
   else lathe([[0,0],[r*.85,0],[r,legH*.04],[r*.7,legH*.12],[r*.62,legH*.33],[r*.95,legH*.39],[r*.95,legH*.45],[r*.72,legH*.5],[r*.86,legH*.88],[r,legH*.94],[r,legH],[0,legH]],sx*w*.36,0,sz*d*.34,edge)
  }
  const cushion=low?new THREE.BoxGeometry(seatW,thick,seatD):sculptedSlab(seatW,seatD,thick,16,12,(x,z)=>-.018*(1-(x/(seatW*.5))**2)*(1-(z/(seatD*.5))**2)-.006*Math.max(Math.abs(x/(seatW*.5)),Math.abs(z/(seatD*.5)))**16)
  mesh(cushion,board,0,seat,0,wood)
  if(low)for(const y of [h*.67,h*.9])box(w*.82,h*.13,d*.08,0,y,-d*.34,oak,wood)
  else {
   // A scalloped crest and two curved splats leave a real central opening.
   const crest=new THREE.Shape();crest.moveTo(-w*.39,h*.82);crest.lineTo(w*.39,h*.82);crest.lineTo(w*.39,h*.94);crest.bezierCurveTo(w*.24,h*.92,w*.16,h*.995,0,h*.995);crest.bezierCurveTo(-w*.16,h*.995,-w*.24,h*.92,-w*.39,h*.94);crest.closePath()
   mesh(new THREE.ExtrudeGeometry(crest,{depth:d*.065,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.006,bevelThickness:.004}),oak,0,0,-d*.375,wood)
   for(const side of [-1,1]){
    const path=new THREE.CatmullRomCurve3([new THREE.Vector3(side*w*.2,seat+h*.035,-d*.34),new THREE.Vector3(side*w*.13,h*.65,-d*.38),new THREE.Vector3(side*w*.18,h*.84,-d*.34)])
    mesh(new THREE.TubeGeometry(path,12,w*.032,8,false),oak,0,0,0,wood)
   }
   box(w*.81,h*.065,d*.08,0,seat-h*.07,-d*.34,oak,wood)
  }
  for(const sx of [-1,1])box(w*.07,.045,d*.74,sx*w*.36,h*.2,0,oak,wood)
  if(!low)box(w*.72,.045,d*.07,0,h*.2,0,oak,wood)
 }else if(a==='barrel'){
  const r=Math.min(w,d)*.46,count=low?8:16,rows=low?4:10,around=low?1:3,wall=r*.095
  const radius=(v:number)=>r*(.82+.18*Math.sin(v*Math.PI)**.82)
  for(let i=0;i<count;i++){
   const start=i/count*Math.PI*2+.012,end=(i+1)/count*Math.PI*2-.012,positions:number[]=[],uv:number[]=[],indices:number[]=[]
   const stride=around+1,layer=(rows+1)*stride
   for(const inner of [false,true])for(let row=0;row<=rows;row++)for(let col=0;col<=around;col++){
    const v=row/rows,t=start+(end-start)*col/around,rr=radius(v)-(inner?wall:0)
    positions.push(Math.cos(t)*rr,v*h,Math.sin(t)*rr);uv.push(col/around,v)
   }
   const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,b,d,b,c,d)
   for(let row=0;row<rows;row++)for(let col=0;col<around;col++){
    const j=row*stride+col,k=j+stride;quad(j,k,k+1,j+1);quad(layer+j+1,layer+k+1,layer+k,layer+j)
   }
   for(let row=0;row<rows;row++)for(const col of [0,around]){const j=row*stride+col,k=j+stride;if(col===0)quad(j,layer+j,layer+k,k);else quad(k,layer+k,layer+j,j)}
   for(let col=0;col<around;col++){const j=col,k=rows*stride+col;quad(j+1,layer+j+1,layer+j,j);quad(k,layer+k,layer+k+1,k+1)}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals()
   mesh(g,i%3?board:oak,0,0,0,wood)
  }
  for(const v of [.1,.26,.74,.9]){
   const rr=radius(v)+.002,band=h*.037
   lathe([[rr-.012,-band/2],[rr+.008,-band/2],[rr+.013,-band*.3],[rr+.013,band*.3],[rr+.008,band/2],[rr-.012,band/2],[rr-.012,-band/2]],0,h*v,0,metal,iron,low?12:48)
   if(!low)for(let i=0;i<8;i++){const angle=i/8*Math.PI*2,rivet=mesh(new THREE.SphereGeometry(.009,6,5),'#918a70',Math.cos(angle)*(rr+.015),h*v,Math.sin(angle)*(rr+.015),iron);rivet.scale.y=.65}
  }
  for(const y of [.024,h-.015])cyl(r*.8,r*.8,.03,0,y,0,oak,wood,low?12:32)
  if(!low){
   for(let i=-2;i<=2;i++)box(.008,.003,Math.sqrt(Math.max(0,(r*.78)**2-(i*r*.27)**2))*2,i*r*.27,h-.0015,0,edge,wood,0)
   cyl(r*.11,r*.115,.011,r*.16,h-.0055,-r*.13,board,wood,12)
  }
 }else if(a==='bed'){
  const mattress=h*.38,base=h*.38
  box(w*.94,base*.66,d*.95,0,base*.54,0,edge,wood)
  box(w*.88,mattress,d*.87,0,base+mattress/2,0,'#d2c6a6',{roughness:1},.2)
  const blanketW=w*.9,blanketD=d*.61,blanketH=h*.12,blanket=low?new THREE.BoxGeometry(blanketW,blanketH,blanketD):sculptedSlab(blanketW,blanketD,blanketH,32,18,(x,z)=>{
   const end=Math.max(0,(z/blanketD+.5)),fold=(Math.sin(x/w*43+Math.sin(z/d*12))*.55+Math.sin(x/w*23-z/d*8)*.45)*h*.021*(.3+.7*end)
   return fold-h*.025*Math.max(Math.abs(x/(blanketW*.5)),Math.abs(z/(blanketD*.5)))**14
  })
  mesh(blanket,'#6d7d72',0,base+mattress+h*.025,d*.12,{roughness:1})
  const pillow=mesh(low?new THREE.SphereGeometry(1,8,6):new THREE.SphereGeometry(1,24,12),'#e4d8ba',0,base+mattress+h*.055,-d*.3,{roughness:1});pillow.scale.set(w*.315,h*.085,d*.105)
  for(const sign of [-1,1]){
   const postH=sign<0?h:h*.62
   for(const sx of [-1,1]){
    const r=w*.035
    if(low)box(r*2,postH,d*.07,sx*w*.46,postH/2,sign*d*.46,oak,wood)
    else lathe([[0,0],[r*.95,0],[r,postH*.05],[r*.7,postH*.13],[r*.72,postH*.7],[r,postH*.75],[r,postH*.83],[r*.7,postH*.87],[r*.9,postH*.91],[r*.92,postH*.96],[r*.62,postH*.99],[0,postH]],sx*w*.46,0,sign*d*.46,oak)
   }
   if(low)box(w,.1,d*.06,0,sign<0?h*.92:h*.56,sign*d*.47,board,wood)
   else {
    const top=sign<0?h*.95:h*.56,bottom=sign<0?h*.44:h*.25,head=new THREE.Shape()
    head.moveTo(-w*.42,bottom);head.lineTo(w*.42,bottom);head.lineTo(w*.42,top-h*.06);head.bezierCurveTo(w*.3,top-h*.05,w*.19,top+h*.035,0,top+h*.035);head.bezierCurveTo(-w*.19,top+h*.035,-w*.3,top-h*.05,-w*.42,top-h*.06);head.closePath()
    mesh(new THREE.ExtrudeGeometry(head,{depth:d*.035,bevelEnabled:true,bevelSize:.006,bevelThickness:.005,bevelSegments:1}),board,0,0,sign*d*.46-d*.0175,wood)
    for(const x of [-w*.28,0,w*.28])box(w*.018,(top-bottom)*.65,d*.006,x,(top+bottom)/2,sign*d*.46+d*.022,edge,wood)
   }
  }
  if(!low){
   const edgeRoll=mesh(new THREE.CylinderGeometry(h*.035,h*.035,w*.82,24),'#a8ae8e',0,base+mattress+h*.087,-d*.17,{roughness:1});edgeRoll.rotation.z=Math.PI/2
   for(const sign of [-1,1])box(w*.045,h*.18,d*.88,sign*w*.455,base*.8,0,board,wood)
  }
 }else if(a==='rug'){
  box(w,.014,d,0,.01,0,'#7d4c3b',{roughness:1},0)
  box(w*.85,.002,d*.78,0,.018,0,'#b59a67',{roughness:1},0)
  box(w*.76,.002,d*.65,0,.02,0,'#62736a',{roughness:1},0)
  if(!low)for(let i=0;i<11;i++)for(const sign of [-1,1])box(w*.009,.006,d*.055,(i-5)*w*.08,.013,sign*d*.468,'#c9b58b',{roughness:1},0)
 }else if(a==='candle'){
  const r=Math.min(w,d)*.45
  lathe([[0,0],[r*.7,0],[r*.93,h*.016],[r,h*.04],[r*.87,h*.065],[r*.43,h*.075],[r*.24,h*.11],[r*.15,h*.3],[r*.2,h*.34],[r*.2,h*.38],[r*.12,h*.42],[0,h*.42]],0,0,0,metal,iron,low?8:24)
  for(let i=0;i<3;i++){
   const x=(i-1)*r*.63,y=h*(i===1?.64:.5),wax=h*.2
   if(i===1)lathe([[0,h*.4],[r*.12,h*.4],[r*.1,y],[0,y]],0,0,0,metal,iron)
   else if(low)beam(new THREE.Vector3(0,h*.38,0),new THREE.Vector3(x,y,0),r*.1,metal,iron)
   else mesh(closedTube([new THREE.Vector3(0,h*.38,0),new THREE.Vector3(x*.55,h*.4,0),new THREE.Vector3(x*.96,h*.44,0),new THREE.Vector3(x,y,0)],r*.055),metal,0,0,0,iron)
   lathe([[0,0],[r*.2,0],[r*.28,h*.015],[r*.3,h*.035],[r*.25,h*.038],[r*.2,h*.022],[0,h*.02]],x,y-h*.025,0,metal,iron,low?8:20)
   const waxBody=new THREE.CylinderGeometry(r*.2,r*.22,wax,low?8:20,1)
   if(!low){const p=waxBody.attributes.position;for(let j=0;j<p.count;j++)if(p.getY(j)>0){const px=p.getX(j),pz=p.getZ(j),amount=Math.hypot(px,pz)>r*.05?.5+.5*Math.sin(Math.atan2(pz,px)*3+i*1.7):.55;p.setY(j,p.getY(j)-h*.013*amount)}waxBody.computeVertexNormals()}
   mesh(waxBody,'#e3cf9e',x,y+wax/2,0,{roughness:.85})
   if(!low)for(let j=0;j<3;j++){
    const angle=j/3*Math.PI*2+i*.8,drip=mesh(new THREE.SphereGeometry(1,8,6),'#e3cf9e',x+Math.cos(angle)*r*.19,y+wax*(.58+j*.08),Math.sin(angle)*r*.19,{roughness:.85});drip.scale.set(r*.038,wax*(.11+j*.035),r*.038)
   }
   cyl(r*.025,r*.025,h*.029,x,y+wax-h*.004,0,'#494037',{roughness:1},low?5:8)
   flame(x,y+wax+h*.065,0,r*.1,h*.13)
  }
 }else if(a==='brazier'){
  const r=Math.min(w,d)*.44
  for(let i=0;i<3;i++){
   const angle=i/3*Math.PI*2,at=(radius:number,y:number)=>new THREE.Vector3(Math.cos(angle)*radius,y,Math.sin(angle)*radius)
   if(low)beam(at(r*.69,h*.05),at(r*.6,h*.61),r*.13,metal,iron)
   else mesh(closedTube([at(r*.68,h*.065),at(r*.44,h*.26),at(r*.31,h*.44),at(r*.6,h*.61)],r*.07),metal,0,0,0,iron)
   const foot=mesh(new THREE.SphereGeometry(1,low?6:12,low?4:8),metal,...at(r*.68,h*.032).toArray() as [number,number,number],iron);foot.scale.set(r*.17,h*.031,r*.17)
  }
  lathe([[0,h*.49],[r*.35,h*.49],[r*.52,h*.51],[r*.88,h*.63],[r,h*.72],[r,h*.765],[r*.91,h*.765],[r*.85,h*.67],[r*.5,h*.56],[r*.3,h*.545],[0,h*.545]],0,0,0,metal,iron,low?10:32)
  ring(r*.96,.018,0,h*.765,0);ring(r*.43,.015,0,h*.32,0)
  lathe([[0,h*.55],[r*.5,h*.55],[r*.68,h*.63],[r*.75,h*.66],[r*.35,h*.68],[0,h*.68]],0,0,0,lit?'#a9532b':'#393930',lit?{emissive:'#8c3f1e',castShadow:false}:{roughness:1},low?8:20)
  for(let i=0;i<(low?5:9);i++){
   const angle=i*2.4,cr=r*(i%2?.17:.22),coal=mesh(new THREE.IcosahedronGeometry(cr,low?0:1),lit?'#a9532b':'#393930',Math.cos(angle)*r*.48,h*.67,Math.sin(angle)*r*.48,lit?{emissive:'#8c3f1e',castShadow:false}:{roughness:1});coal.scale.y=.5
  }
  if(!low){
   for(const side of [-1,1])mesh(new THREE.TorusGeometry(r*.14,r*.027,8,24),metal,side*r*.94,h*.69,0,iron)
   for(let i=0;i<8;i++){
    const angle=i/8*Math.PI*2,rivet=mesh(new THREE.SphereGeometry(r*.025,6,5),'#928b73',Math.cos(angle)*r*.99,h*.7,Math.sin(angle)*r*.99,iron);rivet.scale.y=.7
   }
  }
  for(let i=0;i<5;i++){const angle=i*2.4;flame(Math.cos(angle)*r*.45,h*.84,Math.sin(angle)*r*.45,r*.17,h*.26)}
 }else if(a==='fireplace'){
  const inner=w*.29,outer=w*.445,spring=h*.27,hearth=h*.07,archTop=spring+outer,blocks=low?5:9
  box(w,hearth,d,0,hearth/2,0,rock,stone)
  for(const side of [-1,1])for(let i=0;i<3;i++)box(outer-inner,(spring-hearth)/3*.97,d*.9,side*(inner+outer)/2,hearth+(i+.5)*(spring-hearth)/3,0,i%2?rock:'#aaa28e',stone,.09)
  // Individual radial voussoirs form a load-bearing arch around an empty bore.
  for(let i=0;i<blocks;i++){
   const a=i/blocks*Math.PI+.008,b=(i+1)/blocks*Math.PI-.008,shape=new THREE.Shape()
   shape.moveTo(Math.cos(a)*inner,Math.sin(a)*inner)
   const segments=low?2:5
   for(let j=0;j<=segments;j++){const t=a+(b-a)*j/segments;shape.lineTo(Math.cos(t)*outer,Math.sin(t)*outer)}
   for(let j=segments;j>=0;j--){const t=a+(b-a)*j/segments;shape.lineTo(Math.cos(t)*inner,Math.sin(t)*inner)}shape.closePath()
   mesh(new THREE.ExtrudeGeometry(shape,{depth:d*.9,bevelEnabled:!low,bevelSize:.009,bevelThickness:.008,bevelSegments:1}),i%3?rock:'#bbb09a',0,spring,-d*.45,stone)
  }
  box(inner*2,archTop-hearth,d*.09,0,(archTop+hearth)/2,-d*.43,'#383d35',stone)
  box(w,h*.065,d,0,archTop+h*.04,0,'#bbb09a',stone)
  box(w*.93,h*.025,d*.93,0,archTop+h*.085,0,edge,stone)
  const chimneyStart=archTop+h*.1,chimneyH=h-chimneyStart
  const chimney=new THREE.CylinderGeometry(w*.29*Math.SQRT2,w*.36*Math.SQRT2,chimneyH,4,1);chimney.rotateY(Math.PI/4);chimney.scale(1,1,d/(w*.85))
  mesh(chimney,rock,0,chimneyStart+chimneyH/2,-d*.04,stone)
  const courses=low?3:5
  for(let i=0;i<courses;i++)box(w*(.71-i*.025),h*.016,d*(.76-i*.02),0,chimneyStart+i*chimneyH/courses,-d*.04,'#736f60',stone)
  for(const side of [-1,1]){const log=cyl(d*.08,d*.075,inner*1.6,0,h*.14,side*d*.13,edge,wood);log.rotation.z=Math.PI/2;log.rotation.y=side*.22}
  for(let i=0;i<5;i++)flame((i-2)*inner*.25,h*.29+(i%2)*h*.055,d*.03,d*.065,h*.28)
  if(!low){
   for(let i=0;i<5;i++)box(.02,h*.12,.02,(i-2)*inner*.3,h*.18,d*.4,metal,iron)
   box(inner*1.6,.022,.025,0,h*.16,d*.4,metal,iron)
   for(const side of [-1,1])for(let i=0;i<2;i++)beam(new THREE.Vector3(side*w*.43,archTop-h*.17+i*.05,-d*.05),new THREE.Vector3(side*w*.43,archTop-.015,d*.35),.04,'#aaa28e',stone)
  }
 }else if(a==='stairs'){
  const n=low?4:7,run=d/n,rise=h/n,cap=rise*.22,cols=low?1:3
  for(let i=0;i<n;i++){
   const top=(i+1)*rise,front=d/2-i*run,bodyH=top-cap
   box(w*.96,bodyH,run*.92,0,bodyH/2,front-run*.54,'#55594e',stone,.025)
   for(let j=0;j<cols;j++){
    const x=-w/2+(j+.5)*w/cols,width=w/cols*.99
    if(low)box(width,cap,run*.99,x,top-cap/2,front-run*.5,j%2?rock:'#aaa692',stone,0)
    else {
     const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(run*.99,0);s.lineTo(run*.99,-cap);s.lineTo(run*.12,-cap);s.lineTo(run*.025,-cap*.85);s.quadraticCurveTo(0,-cap*.7,0,-cap*.38);s.closePath()
     const g=new THREE.ExtrudeGeometry(s,{depth:width,bevelEnabled:false,curveSegments:5});g.rotateY(Math.PI/2);mesh(g,(i+j)%2?rock:'#aaa692',x-width/2,top,front,stone)
    }
   }
   if(!low)for(const side of [-1,1])for(let row=0;row<=i;row++){
    const height=bodyH/(i+1),x=side*w*.476
    box(w*.028,height*.96,run*.9,x,(row+.5)*height,front-run*.54,(i+row)%2?rock:'#aaa692',stone,0)
   }
  }
 }else if(a==='trap-pit'){
  box(w,.014,d,0,.008,0,'#292d28',{roughness:1},0)
  for(const sign of [-1,1]){
   box(w,.03,d*.08,0,.018,sign*d*.46,rock,stone)
   box(w*.08,.03,d*.84,sign*w*.46,.018,0,rock,stone)
  }
  if(!lit)for(let i=0;i<6;i++)box(w*.82,.025,d*.81/6*.97,0,.022,-d*.405+(i+.5)*d*.81/6,board,wood)
  else if(!low)for(let i=0;i<5;i++)box(.025,.01,d*.77,(i-2)*w*.15,.018,0,'#454b3c',{roughness:1},0)
 }else if(a==='trap-spikes'){
  box(w,h*.07,d,0,h*.035,0,rock,stone)
  const n=low?3:5
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
   const x=(i/(n-1)-.5)*w*.78,z=(j/(n-1)-.5)*d*.78,r=Math.min(w,d)*.045
   cyl(r*1.15,r*1.15,h*.025,x,h*.085,z,metal,iron)
   if(lit)mesh(new THREE.ConeGeometry(r,h*.85,low?4:6),metal,x,h*.07+h*.425,z,iron)
  }
 }else if(!populateTabletopExtra({...e,geometry:{...e.geometry,width:w,depth:d,height:h}},mesh,low))return false
 if(!authored)addTabletopJoinery({...e,geometry:{...e.geometry,width:w,depth:d,height:h}},mesh,low)
 // Bake the native asset's complete transforms before resizing. Joinery and
 // fixed-size details therefore remain inside the editable physical bounds.
 const scale=new THREE.Matrix4().makeScale(e.geometry.width/w,Math.max(.035,e.geometry.height)/Math.max(.035,reference.height),e.geometry.depth/d)
 for(const part of parts){part.updateMatrix();part.geometry.applyMatrix4(scale.clone().multiply(part.matrix));part.position.set(0,0,0);part.quaternion.identity();part.scale.set(1,1,1)}
 return true
}
