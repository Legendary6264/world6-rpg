import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'
import {batchEntityParts} from '../src/scene3dBatch.ts'

const require=createRequire(import.meta.url),{load}=require('./generate-tabletop-thumbnails.cjs')
const {populateEntityModel}=load('scene3dMeshes'),{legacyAssets}=load('legacyAssets')
const {createEnvironmentObject,placementSurfaceFootprint,resolveObjectPlacement}=load('sceneEditorPlacement')
const profiles={desk:[.92,.70],workbench:[.92,.80],platform:[.92,.88]}
// These are the former triangle totals, so a smoother work surface must also
// stay within the existing performance cost in each LOD.
const ceilings={desk:[6592,912],workbench:[2544,228],platform:[1948,212]}

function build(slug,low=false,facing=0,dimensions=[2.3,1.4,1.1],flags={}){
 const a=legacyAssets.find(a=>a.slug===slug);assert(a&&!a.native,slug+' original artwork')
 const object=createEnvironmentObject(a.kind,a.id,'support:'+slug,{x:7,y:8,z:1.25},facing)
 Object.assign(object,{width:dimensions[0],depth:dimensions[1],height:dimensions[2]},flags)
 const group=new THREE.Group(),resources=new Set(),materials=new Map(),surfaces=new Set()
 populateEntityModel({id:object.id,geometry:object,appearance:{color:'#8b6443',heightKnown:true,remembered:false}},(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.FrontSide});material.userData.paletteBatch=JSON.stringify([s,false,1]);material.userData.castsShadow=s.castShadow!==false;materials.set(key,material)}
  const part=new THREE.Mesh(g,material);part.position.set(x,y,z);part.castShadow=s.castShadow!==false;group.add(part);resources.add(g);surfaces.add(JSON.stringify(s));return part
 },low)
 group.position.set(object.x,object.z,object.y);group.rotation.y=-facing*Math.PI/180;group.updateMatrixWorld(true)
 return {slug,object,group,resources,materials,surfaces,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const named=(m,name)=>m.group.children.filter(p=>p.geometry.name===name)
const triangleCount=m=>m.group.children.reduce((sum,p)=>sum+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)
const ray=(m,x,z)=>new THREE.Raycaster(new THREE.Vector3(x,m.object.z+m.object.height+2,z),new THREE.Vector3(0,-1,0)).intersectObject(m.group,true)[0]
function flatHit(m,x,z,label='top'){
 const hit=ray(m,x,z),height=m.object.z+m.object.height
 assert(hit,`${m.slug} ${label} has physical geometry`)
 assert(Math.abs(hit.point.y-height)<1e-6,`${m.slug} ${label} hits saved height: ${hit.point.y} / ${height}`)
 assert(hit.face.normal.y>.999999,`${m.slug} ${label} is level and upward facing`)
}
function flatGrid(m){
 const top=placementSurfaceFootprint(m.object),[w,d]=profiles[m.slug],odd=m.object.facing%180!==0
 assert.equal(top.shape,'rectangle');assert.equal(top.width,m.object.width*(odd?d:w));assert.equal(top.depth,m.object.depth*(odd?w:d))
 for(let x=0;x<=6;x++)for(let z=0;z<=6;z++)flatHit(m,m.object.x+(x/6-.5)*top.width,m.object.y+(z/6-.5)*top.depth,`grid ${x},${z}`)
}
function inBounds(m){
 const b=new THREE.Box3().setFromObject(m.group,true),o=m.object
 assert(b.min.x>=o.x-o.width/2-1e-6&&b.max.x<=o.x+o.width/2+1e-6,m.slug+' complete width')
 assert(b.min.z>=o.y-o.depth/2-1e-6&&b.max.z<=o.y+o.depth/2+1e-6,m.slug+' complete depth')
 assert(Math.abs(b.min.y-o.z)<1e-6&&Math.abs(b.max.y-o.z-o.height)<1e-6,m.slug+' grounded at saved height')
}
function seamRays(m){
 const points=[],odd=m.object.facing%180!==0,w=odd?m.object.depth:m.object.width,d=odd?m.object.width:m.object.depth
 if(m.slug==='desk'){
  const b=named(m,'desk-writing-inlay')[0].geometry.boundingBox,xc=(b.min.x+b.max.x)/2,zc=(b.min.z+b.max.z)/2,eps=Math.min(w,d)*1e-8
  for(const x of [b.min.x,b.max.x])for(const z of [b.min.z,zc,b.max.z])for(const dx of [-eps,0,eps])for(const dz of [-eps,0,eps])points.push([x+dx,z+dz])
  for(const z of [b.min.z,b.max.z])points.push([xc,z])
 }else{
  // The former plank divisions are tested exactly, including centre and
  // diagonal triangle boundaries rather than sampling away from joins.
  for(const n of m.slug==='platform'?[5,9]:[3,7])for(let i=1;i<n;i++)for(const z of [-.3,0,.3])points.push([w*(i/n-.5),d*z])
 }
 for(const [x,z] of points){const p=m.group.localToWorld(new THREE.Vector3(x,0,z));flatHit(m,p.x,p.z,'seam')}
}

test('Original work surfaces match saved height at support grids, corners and seams in both LODs and every quarter turn',()=>{
 for(const slug of Object.keys(profiles))for(const low of [false,true])for(const facing of [0,90,180,270])for(const dimensions of [[2.3,1.4,1.1],[.35,4.8,.14],[5.6,.12,3.8]])for(const open of [false,true]){
  const m=build(slug,low,facing,dimensions,{open,locked:true})
  assert.equal(m.object.canSupport,true,slug+' new original artwork placement is a support')
  inBounds(m);flatGrid(m);seamRays(m);m.dispose()
 }
})

function closedSolid(part,checkNormals=true){
 const g=part.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,index=g.index,count=index?.count??p.count,edges=new Map();let volume=0
 for(const a of [p,n,uv])assert(a?.array.every(Number.isFinite),g.name+' finite attributes')
 for(let i=0;i<n.count;i++)assert(Math.abs(new THREE.Vector3().fromBufferAttribute(n,i).length()-1)<1e-4,g.name+' unit normals')
 const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e7)).join(',')
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),face=b.clone().sub(a).cross(c.clone().sub(a))
  if(face.lengthSq()<1e-20)continue
  volume+=a.dot(b.clone().cross(c))/6
  const normal=new THREE.Vector3();ids.forEach(j=>normal.add(new THREE.Vector3().fromBufferAttribute(n,j)))
  if(checkNormals)assert(face.dot(normal)>-1e-10,g.name+' normals agree with outward winding')
  const keys=[a,b,c].map(key)
  for(let j=0;j<3;j++){
   const from=keys[j],to=keys[(j+1)%3];if(from===to)continue
   const k=from<to?from+'|'+to:to+'|'+from,e=edges.get(k)??{count:0,balance:0}
   e.count++;e.balance+=from<to?1:-1;edges.set(k,e)
  }
 }
 assert(volume>1e-12,g.name+' positive enclosed volume')
 assert([...edges.values()].every(e=>e.count===2&&e.balance===0),g.name+' is closed with opposite directed edge pairs')
}

test('Changed constructions are closed outward solids and cheaper than the previous geometry in both LODs',()=>{
 const stats=[],changed=new Set('desk-tabletop-surround desk-writing-inlay desk-leg desk-apron desk-end-apron workbench-work-surface workbench-leg workbench-apron workbench-end-apron workbench-vice-toggle platform-top-deck platform-deck-backing platform-edge-joinery platform-fascia-plank-joint'.split(' '))
 for(const slug of Object.keys(profiles))for(const low of [false,true])for(const dimensions of [[2.3,1.4,1.1],[.35,4.8,.14]]){
  const m=build(slug,low,0,dimensions,{open:true}),triangles=triangleCount(m)
  inBounds(m)
  // Existing smooth drawer rings retain their authored normals under very
  // unequal scaling; every changed part must also match its face winding.
  m.group.children.forEach(p=>closedSolid(p,dimensions[0]===2.3||changed.has(p.geometry.name)))
  assert(triangles<=ceilings[slug][Number(low)],slug+' existing triangle ceiling: '+triangles)
  assert(m.surfaces.size<=8,slug+' existing surface palette ceiling')
  if(dimensions[0]===2.3)stats.push({slug,low,parts:m.group.children.length,triangles})
  m.dispose()
 }
 console.log(JSON.stringify({legacyWorkSurfaces:stats}))
})

function topTriangles(part,height){
 const g=part.geometry,p=g.attributes.position,index=g.index,count=index?.count??p.count,triangles=[]
 for(let i=0;i<count;i+=3){
  const t=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j))
  if(t.every(v=>Math.abs(v.y-height)<1e-6)&&t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0])).y>1e-12)triangles.push(t.map(v=>[v.x,v.z]))
 }
 return triangles
}
const signedArea=p=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0]},0)/2
function overlapArea(a,b){
 let clipped=a;const sign=Math.sign(signedArea(b))
 for(let i=0;i<b.length&&clipped.length;i++){
  const q=b[i],r=b[(i+1)%b.length],distance=p=>sign*((r[0]-q[0])*(p[1]-q[1])-(r[1]-q[1])*(p[0]-q[0])),out=[]
  for(let j=0;j<clipped.length;j++){
   const p=clipped[j],s=clipped[(j+1)%clipped.length],dp=distance(p),ds=distance(s),inside=dp>=-1e-12,next=ds>=-1e-12
   if(inside)out.push(p)
   if(inside!==next){const t=dp/(dp-ds);out.push([p[0]+(s[0]-p[0])*t,p[1]+(s[1]-p[1])*t])}
  }
  clipped=out
 }
 return clipped.length<3?0:Math.abs(signedArea(clipped))
}

test('Desk inlay fits a real opening flush with the tabletop without overlapping top faces',()=>{
 for(const low of [false,true])for(const dimensions of [[1.6,.85,.95],[.53,2.7,.41]]){
  const m=build('desk',low,0,dimensions),surround=named(m,'desk-tabletop-surround')[0],inlay=named(m,'desk-writing-inlay')[0],a=topTriangles(surround,m.object.height),b=topTriangles(inlay,m.object.height)
  assert(a.length&&b.length,'Both fitted parts have actual horizontal top faces')
  const centre=new THREE.Vector3(0,0,inlay.geometry.boundingBox.getCenter(new THREE.Vector3()).z);m.group.localToWorld(centre)
  const cast=new THREE.Raycaster(new THREE.Vector3(centre.x,m.object.z+m.object.height+1,centre.z),new THREE.Vector3(0,-1,0))
  assert.equal(cast.intersectObject(surround).length,0,'Surround leaves a real recess for the insert')
  const expected=m.object.width*m.object.depth*.79/1.02,total=[...a,...b].reduce((sum,t)=>sum+Math.abs(signedArea(t)),0)
  assert(Math.abs(total-expected)<expected*2e-7,'Fitted tabletop covers its full rectangle once')
  for(const left of a)for(const right of b)assert(overlapArea(left,right)<expected*1e-10,'No coplanar inlay/top face overlap')
  m.dispose()
 }
})

test('Opening desk drawers preserves every fixed body and tabletop vertex exactly',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270])for(const dimensions of [[2.3,1.4,1.1],[.53,2.7,.41]]){
  const m=build('desk',low,facing,dimensions),fixed=p=>!/^desk-drawer-(floor|side|back|front|pull)$/.test(p.geometry.name),body=m.group.children.filter(fixed)
  for(const flags of [{open:true},{locked:true},{open:true,locked:true}]){
   const changed=build('desk',low,facing,dimensions,flags),other=changed.group.children.filter(fixed)
   assert(body.length>20);assert.equal(other.length,body.length)
   body.forEach((part,i)=>{
    assert.equal(other[i].geometry.name,part.geometry.name)
    for(const attr of ['position','normal','uv'])assert.deepEqual(other[i].geometry.attributes[attr].array,part.geometry.attributes[attr].array,'Fixed '+part.geometry.name+' '+attr)
   })
   if(flags.open){const a=named(m,'desk-drawer-front')[0].geometry.boundingBox,b=named(changed,'desk-drawer-front')[0].geometry.boundingBox;assert(b.min.z>a.min.z,'The drawers still physically slide out')}
   inBounds(changed);changed.dispose()
  }
  m.dispose()
 }
})

test('A real placed prop has flat physical geometry under all four corners and survives palette batching',()=>{
 const frame={width:20,depth:20,groundZ:0,maxZ:8}
 for(const slug of Object.keys(profiles))for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build(slug,low,facing,[3.2,1.6,1.1],{open:slug==='desk'}),top=placementSurfaceFootprint(m.object),point={x:m.object.x+top.width/2-.05,y:m.object.y+top.depth/2-.05,z:0}
  const source={id:'cup',name:'cup',kind:'crate',asset:'mug',width:.1,depth:.1,height:.14,x:1,y:1,z:0,canSupport:false},placed=resolveObjectPlacement(frame,[m.object],source,point,{surfaceSnap:true,surfaceId:m.object.id})
  assert.equal(placed.surfaceId,m.object.id);assert.equal(placed.object.z,m.object.z+m.object.height)
  const check=()=>{for(const x of [-.05,.05])for(const z of [-.05,.05])flatHit(m,placed.object.x+x,placed.object.y+z,'placed prop corner')}
  check()
  batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g});m.group.updateMatrixWorld(true)
  assert(m.group.children.length<=8,'Original support stays within palette draw-call ceiling')
  check();inBounds(m);m.dispose()
 }
})
