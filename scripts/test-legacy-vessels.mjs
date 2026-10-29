import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'

const require=createRequire(import.meta.url),{load}=require('./generate-tabletop-thumbnails.cjs')
const {populateEntityModel}=load('scene3dMeshes'),{legacyAssets}=load('legacyAssets'),{createEnvironmentObject}=load('sceneEditorPlacement')
const slugs=['sack','basket','jar','amphora']
function build(slug,{low=false,open=false,facing=0,dimensions=[1.4,.9,1.2],capture=false}={}){
 const a=legacyAssets.find(a=>a.slug===slug),object=createEnvironmentObject(a.kind,a.id,slug,{x:0,y:0,z:0},facing)
 Object.assign(object,{width:dimensions[0],depth:dimensions[1],height:dimensions[2],open})
 const group=new THREE.Group(),materials=new Map(),resources=new Set(),before=[]
 populateEntityModel({id:slug,geometry:object,appearance:{color:'#87603f',heightKnown:true,remembered:false}},(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide});materials.set(key,material)}
  const p=new THREE.Mesh(g,material);p.position.set(x,y,z);group.add(p);resources.add(g)
  if(capture)before.push({part:p,geometry:g,name:g.name,uv:Array.from(g.attributes.uv.array),corners:g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i)})
  return p
 },low)
 group.rotation.y=-facing*Math.PI/180;group.updateMatrixWorld(true)
 return {slug,object,group,materials,before,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const named=(m,suffix)=>m.group.children.filter(p=>p.geometry.name===m.slug+'-'+suffix)
const count=m=>m.group.children.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)
const distinct=hits=>hits.filter((h,i)=>!i||h.distance-hits[i-1].distance>1e-7)
const ray=(m,origin,direction,parts=m.group.children)=>new THREE.Raycaster(m.group.localToWorld(new THREE.Vector3(...origin)),new THREE.Vector3(...direction).transformDirection(m.group.matrixWorld)).intersectObjects(parts,true)
const inside=(m,part,p)=>distinct(new THREE.Raycaster(m.group.localToWorld(p.clone()),new THREE.Vector3(.713,.113,.692).transformDirection(m.group.matrixWorld).normalize()).intersectObject(part)).length%2===1
function ringCenter(p,index,radial){const v=new THREE.Vector3(),a=p.geometry.attributes.position;for(let i=0;i<radial;i++)v.add(new THREE.Vector3().fromBufferAttribute(a,index*(radial+1)+i));return v.divideScalar(radial)}
function solid(part,label=''){
 const g=part.geometry,p=g.attributes.position,n=g.attributes.normal,index=g.index,edges=new Map();let volume=0
 for(const attr of ['position','normal','uv'])assert(g.attributes[attr]?.array.every(Number.isFinite),g.name+' finite '+attr)
 const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e6)).join(',')
 for(let i=0;i<(index?.count??p.count);i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),face=b.clone().sub(a).cross(c.clone().sub(a))
  if(face.lengthSq()<1e-20)continue
  volume+=a.dot(b.clone().cross(c))/6
  const normal=new THREE.Vector3();ids.forEach(j=>normal.add(new THREE.Vector3().fromBufferAttribute(n,j)));assert(face.dot(normal)>-1e-10,g.name+' outward normals '+label)
  const points=[a,b,c].map(key)
  for(let j=0;j<3;j++){const a=points[j],b=points[(j+1)%3];if(a===b)continue;const k=a<b?a+'|'+b:b+'|'+a,e=edges.get(k)??{count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(k,e)}
 }
 assert(volume>1e-12,g.name+' positive enclosed volume');assert([...edges.values()].every(e=>e.count===2&&e.balance===0),g.name+' closed directed edges')
}

test('Four old vessels retain closed geometry at saved quarter-turn dimensions, with bounded cheaper LODs',()=>{
 const stats=[]
 for(const slug of slugs){
  const costs=[]
  for(const low of [false,true])for(const facing of [0,90,180,270])for(const dimensions of [[1.4,.9,1.2],[.35,4.8,.14],[5.6,.12,3.8]]){
   const m=build(slug,{low,facing,dimensions,open:true}),o=m.object,b=new THREE.Box3().setFromObject(m.group,true)
   assert(b.min.x>=-o.width/2-1e-6&&b.max.x<=o.width/2+1e-6,slug+' saved width');assert(b.min.z>=-o.depth/2-1e-6&&b.max.z<=o.depth/2+1e-6,slug+' saved depth');assert(b.min.y>=-1e-6&&b.min.y<o.height*.003&&b.max.y<=o.height+1e-6,slug+' grounded saved height')
   assert(count(m)<14000,slug+' triangle ceiling');assert(m.materials.size<=8,slug+' material ceiling')
   for(const part of m.group.children)solid(part,JSON.stringify({low,facing,dimensions}))
   if(facing===0&&dimensions[0]===1.4){costs.push(count(m));stats.push({slug,low,triangles:count(m),parts:m.group.children.length})}
   m.dispose()
  }
  assert(costs[1]<costs[0]*.65,slug+' substantially cheaper low LOD')
 }
 console.log(JSON.stringify({legacyVessels:stats}))
})

test('Open mouths lead to real recessed floors; basket handle and ear handles leave empty hand openings',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  for(const slug of ['jar','amphora','basket']){
   const m=build(slug,{low,facing}),localDepth=facing%180?m.object.width:m.object.depth,hit=ray(m,[0,m.object.height+1,slug==='basket'?localDepth*.12:0],[0,-1,0])[0]
   assert(hit,slug+' has a physical floor');assert(hit.point.y<m.object.height*.2,slug+' mouth opens onto a deep interior')
   if(slug==='basket'){
    const b=new THREE.Box3().setFromObject(named(m,'basket-handle')[0]),y=b.max.y*.84
    assert.equal(ray(m,[0,y,localDepth+1],[0,0,-1]).length,0,'Basket handle leaves a real hand opening')
   }else{
    const pot=named(m,'hollow-pot')[0];pot.geometry.computeBoundingBox();const b=pot.geometry.boundingBox,unitR=slug==='jar'?.397:.30,unitH=slug==='jar'?.85:1.14,sx=(b.max.x-b.min.x)/(unitR*2),sy=(b.max.y-b.min.y)/unitH
    const x=(slug==='jar'?.457:.30)*sx,y=(slug==='jar'?.53:.91)*sy
    assert.equal(ray(m,[x,y,localDepth+1],[0,0,-1]).length,0,slug+' ear loop encloses empty space beside the body')
   }
   m.dispose()
  }
 }
})

test('Pottery handle ends are embedded in the actual thick wall, including extreme saved proportions',()=>{
 for(const slug of ['jar','amphora'])for(const low of [false,true])for(const facing of [0,90,180,270])for(const dimensions of [[1.4,.9,1.2],[.35,4.8,.14],[5.6,.12,3.8]]){
  const m=build(slug,{low,facing,dimensions}),body=named(m,'hollow-pot')[0],handles=named(m,'pot-handle')
  assert.equal(handles.length,2,slug+' two modeled ear handles')
  for(const p of handles){const {tubularSegments,radialSegments}=p.geometry.parameters;for(const i of [0,tubularSegments])assert(inside(m,body,ringCenter(p,i,radialSegments)),slug+' tube end penetrates the ceramic wall instead of floating beside it')}
  m.dispose()
 }
})

test('Basket weave interlocks with every stake and rim; handle reinforcement retains its support',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('basket',{low,facing}),stakes=named(m,'basket-stake'),courses=named(m,'woven-hoop'),rims=named(m,'basket-braided-rim')
  assert.equal(stakes.length,low?12:20);assert.equal(courses.length,low?6:10);assert.equal(rims.length,2)
  for(const stake of stakes){
   const r=stake.geometry.parameters.radialSegments,ends=[ringCenter(stake,0,r),ringCenter(stake,1,r)].sort((a,b)=>a.y-b.y)
   for(const course of courses){course.geometry.computeBoundingBox();const y=course.geometry.boundingBox.getCenter(new THREE.Vector3()).y,t=(y-ends[0].y)/(ends[1].y-ends[0].y),contact=ends[0].clone().lerp(ends[1],t);assert(inside(m,course,contact),'Woven course intersects the actual supporting stake')}
   assert(rims.some(rim=>inside(m,rim,ends[1])),'Stake tip enters a braided rim strand')
  }
  const handle=named(m,'basket-handle')[0],{radialSegments,tubularSegments}=handle.geometry.parameters
  for(const i of [0,tubularSegments])assert(rims.some(p=>inside(m,p,ringCenter(handle,i,radialSegments))),'Handle end enters the real braided rim')
  m.dispose()
 }
})

test('Opening the sack exposes its grain without moving any lower folded body, seam or stitch',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270])for(const dimensions of [[1.4,.9,1.2],[.35,4.8,.14],[5.6,.12,3.8]]){
  const closed=build('sack',{low,facing,dimensions}),opened=build('sack',{low,facing,dimensions,open:true})
  for(const suffix of ['sack-body','sack-seam',...(!low?['sack-stitch']:[])]){
   const a=named(closed,suffix),b=named(opened,suffix);assert(a.length&&a.length===b.length,suffix+' fixed part count')
   for(let i=0;i<a.length;i++)for(const attr of ['position','normal'])assert(a[i].geometry.attributes[attr].array.every((x,j)=>x===b[i].geometry.attributes[attr].array[j]),suffix+' stays exactly fixed between open and closed')
  }
  const localWidth=facing%180?closed.object.depth:closed.object.width,top=ray(closed,[localWidth*.012,closed.object.height+1,0],[0,-1,0])[0],inside=ray(opened,[localWidth*.012,closed.object.height+1,0],[0,-1,0])[0]
  assert(top&&inside&&inside.point.y<top.point.y-closed.object.height*.15,'Untied mouth reveals grain below the closed gathered neck')
  assert.equal(named(opened,'sack-tie').length,0);assert(named(opened,'grain').length>0)
  closed.dispose();opened.dispose()
 }
})

test('Final normal refinement retains geometry resources, part names and every triangle UV corner',()=>{
 for(const slug of slugs)for(const low of [false,true])for(const dimensions of [[1.4,.9,1.2],[.35,4.8,.14],[5.6,.12,3.8]]){
  const m=build(slug,{low,dimensions,open:true,capture:true})
  for(const before of m.before){
   const g=before.part.geometry,uv=g.attributes.uv,index=g.index,count=index?.count??g.attributes.position.count
   assert(g===before.geometry,'GPU resource identity remains stable');assert.equal(g.name,before.name,'Named picking/emitter parts remain stable');assert.equal(count,before.corners.length,'Triangle count/order remains stable');assert(g.boundingBox&&g.boundingSphere,'Baked picking and culling bounds remain available')
   for(let i=0;i<count;i++){const old=before.corners[i],next=index?index.getX(i):i;assert.equal(uv.getX(next),before.uv[old*2],g.name+' U corner retained');assert.equal(uv.getY(next),before.uv[old*2+1],g.name+' V corner retained')}
  }
  m.dispose()
 }
})
