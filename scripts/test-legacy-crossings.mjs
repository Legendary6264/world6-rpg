import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'

const require=createRequire(import.meta.url),{load}=require('./generate-tabletop-thumbnails.cjs')
const {populateEntityModel}=load('scene3dMeshes'),{legacyAssets}=load('legacyAssets')
const {createEnvironmentObject,flatPlacementSurface}=load('sceneEditorPlacement')
const slugs=['bridge','rope-bridge','ladder']
function build(slug,low=false,facing=0,dimensions=[3.7,1.8,2.4]){
 const a=legacyAssets.find(a=>a.slug===slug),object=createEnvironmentObject(a.kind,a.id,slug,{x:6,y:7,z:1.25},facing)
 Object.assign(object,{width:dimensions[0],depth:dimensions[1],height:dimensions[2]})
 const group=new THREE.Group(),materials=new Map(),resources=new Set()
 populateEntityModel({id:slug,geometry:object,appearance:{color:'#8b6443',heightKnown:true,remembered:false}},(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.FrontSide});materials.set(key,material)}
  const p=new THREE.Mesh(g,material);p.position.set(x,y,z);group.add(p);resources.add(g);return p
 },low)
 group.position.set(object.x,object.z,object.y);group.rotation.y=-facing*Math.PI/180;group.updateMatrixWorld(true)
 return {slug,object,group,materials,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const named=(m,name)=>m.group.children.filter(p=>p.geometry.name===name)
const localBounds=part=>{part.geometry.computeBoundingBox();return part.geometry.boundingBox}
const count=m=>m.group.children.reduce((sum,p)=>sum+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)
function castLocal(m,parts,x,z,direction=-1){
 const p=m.group.localToWorld(new THREE.Vector3(x,direction<0?m.object.height+2:-2,z))
 return new THREE.Raycaster(p,new THREE.Vector3(0,direction,0)).intersectObjects(parts,true)[0]
}
const height=(m,hit)=>m.group.worldToLocal(hit.point.clone()).y
function ringCenter(part,index,radial,segments){
 const g=part.geometry,p=g.attributes.position,v=new THREE.Vector3()
 // Extreme saved proportions intentionally flatten folded analytic normals.
 // Read the same physical ring from its actual triangle vertices in that case.
 for(let i=0;i<radial;i++){
  const at=g.index||g.type!=='TubeGeometry'?index*(radial+1)+i:index<segments?(index*radial+i)*6:((segments-1)*radial+i)*6+1
  v.add(new THREE.Vector3().fromBufferAttribute(p,at))
 }
 return v.divideScalar(radial)
}
function cylinderEnds(part){
 const g=part.geometry,p=g.attributes.position
 return g.groups.filter(group=>group.materialIndex===1||group.materialIndex===2).map(group=>new THREE.Vector3().fromBufferAttribute(p,g.index?g.index.getX(group.start+2):group.start+2)).sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x)
}
function solid(part){
 const g=part.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,index=g.index,edges=new Map();let volume=0
 for(const a of [p,n,uv])assert(a?.array.every(Number.isFinite),g.name+' finite attributes')
 const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e7)).join(',')
 for(let i=0;i<(index?.count??p.count);i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),face=b.clone().sub(a).cross(c.clone().sub(a))
  if(face.lengthSq()<1e-20)continue
  volume+=a.dot(b.clone().cross(c))/6
  const normal=new THREE.Vector3();ids.forEach(j=>normal.add(new THREE.Vector3().fromBufferAttribute(n,j)))
  assert(face.dot(normal)>-1e-10,g.name+' normals follow outward winding')
  const points=[a,b,c].map(key)
  for(let j=0;j<3;j++){const from=points[j],to=points[(j+1)%3];if(from===to)continue;const k=from<to?from+'|'+to:to+'|'+from,e=edges.get(k)??{count:0,balance:0};e.count++;e.balance+=from<to?1:-1;edges.set(k,e)}
 }
 assert(volume>1e-12,g.name+' positive enclosed volume')
 assert([...edges.values()].every(e=>e.count===2&&e.balance===0),g.name+' closed directed edges')
}

test('Original crossings fit old saved envelopes in every quarter turn, retain closed geometry and bounded LOD costs',()=>{
 const stats=[]
 for(const slug of slugs){
  const costs=[]
  for(const low of [false,true])for(const facing of [0,90,180,270])for(const dimensions of [[3.7,1.8,2.4],[.35,4.8,.14],[5.6,.12,3.8]]){
   const m=build(slug,low,facing,dimensions),o=m.object,b=new THREE.Box3().setFromObject(m.group,true),triangles=count(m)
   assert(Math.abs(b.min.x-o.x+o.width/2)<2e-6&&Math.abs(b.max.x-o.x-o.width/2)<2e-6,slug+' saved width')
   assert(Math.abs(b.min.z-o.y+o.depth/2)<2e-6&&Math.abs(b.max.z-o.y-o.depth/2)<2e-6,slug+' saved depth')
   assert(Math.abs(b.min.y-o.z)<2e-6&&Math.abs(b.max.y-o.z-o.height)<2e-6,slug+' saved height')
   assert.equal(flatPlacementSurface({...o,canSupport:true}),false,slug+' envelope includes rails or inclination, not a tabletop')
   assert(triangles<16000,slug+' triangle ceiling');assert(m.materials.size<=8,slug+' material budget')
   for(const p of m.group.children)solid(p)
   if(facing===0&&dimensions[0]===3.7){costs.push(triangles);stats.push({slug,low,parts:m.group.children.length,triangles})}
   m.dispose()
  }
  assert(costs[1]<costs[0],slug+' low detail is cheaper')
 }
 console.log(JSON.stringify({legacyCrossings:stats}))
})

test('Both old bridges have a continuous physical deck across plank joints and below their handrails',()=>{
 for(const slug of ['bridge','rope-bridge'])for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build(slug,low,facing),deck=named(m,'bridge-deck-plank'),bounds=new THREE.Box3();deck.forEach(p=>bounds.union(localBounds(p)))
  const xValues=deck.flatMap(p=>{const b=localBounds(p);return [b.min.x,(b.min.x+b.max.x)/2,b.max.x]}),eps=bounds.getSize(new THREE.Vector3()).x*1e-8
  for(const x of xValues)for(const dx of [-eps,0,eps])for(const z of [bounds.min.z*.96,0,bounds.max.z*.96]){
   if(x+dx<bounds.min.x||x+dx>bounds.max.x)continue
   const sampleX=Math.max(bounds.min.x+eps,Math.min(bounds.max.x-eps,x+dx)),hit=castLocal(m,deck,sampleX,z)
   assert(hit,`${slug} low=${low} facing=${facing} uninterrupted seam at ${x+dx},${z}`)
   const y=height(m,hit);assert(y>m.object.height*.1&&y<m.object.height*.65,slug+' walking height is below rails')
  }
  m.dispose()
 }
})

test('Wooden bridge stringers meet the entire underside and post feet remain connected to the construction',()=>{
 for(const low of [false,true])for(const dimensions of [[3.7,1.8,2.4],[.35,4.8,.14]]){
  const m=build('bridge',low,0,dimensions),deck=named(m,'bridge-deck-plank'),beams=named(m,'bridge-longitudinal-beam')
  for(const beam of beams){
   const b=localBounds(beam),z=(b.min.z+b.max.z)/2
   for(let i=1;i<40;i++){
    const x=b.min.x+(b.max.x-b.min.x)*i/40,bottom=castLocal(m,deck,x,z,1),support=castLocal(m,[beam],x,z)
    assert(bottom&&support,'deck and stringer ray hits')
    assert(Math.abs(height(m,bottom)-height(m,support))<1e-6,'no floating gap between arched deck and carrying beam')
   }
  }
  const rails=named(m,'bridge-railing-post'),feet=named(m,'bridge-bearing-foot')
  assert.equal(rails.length,6);assert.equal(feet.length,4)
  for(const foot of feet)assert(localBounds(foot).min.y<1e-6,'stone bearing reaches ground')
  m.dispose()
 }
})

test('Suspension hangers join real rope rings, deck bearers meet rope segments and their planks',()=>{
 for(const low of [false,true])for(const dimensions of [[3.7,1.8,2.4],[.35,4.8,.14],[5.6,.12,3.8]]){
  const m=build('rope-bridge',low,0,dimensions),radial=low?4:6,n=low?12:24,lower=named(m,'rope-bridge-lower-rope').sort((a,b)=>localBounds(a).min.z-localBounds(b).min.z),upper=named(m,'rope-bridge-handrail').sort((a,b)=>localBounds(a).min.z-localBounds(b).min.z),hangers=named(m,'rope-bridge-rope-hanger'),bearers=named(m,'rope-bridge-deck-bearer'),deck=named(m,'bridge-deck-plank')
  assert.equal(hangers.length,(n/2-1)*2);assert.equal(bearers.length,n)
  for(let side=0;side<2;side++){
   const bottomCenters=Array.from({length:n+1},(_,i)=>ringCenter(lower[side],i,radial,n)),topCenters=Array.from({length:n+1},(_,i)=>ringCenter(upper[side],i,radial,n))
   for(let i=2;i<n;i+=2){
    const hanger=hangers[side*(n/2-1)+i/2-1],ends=cylinderEnds(hanger)
    assert(ends[0].distanceTo(bottomCenters[i])<1e-6,'hanger bottom joins the actual lower rope ring')
    assert(ends[1].distanceTo(topCenters[i])<1e-6,'hanger top joins the actual handrail ring')
   }
   for(let i=0;i<n;i++){
    const midpoint=bottomCenters[i].clone().add(bottomCenters[i+1]).multiplyScalar(.5),ends=cylinderEnds(bearers[i]),t=(midpoint.z-ends[0].z)/(ends[1].z-ends[0].z),crossing=ends[0].clone().lerp(ends[1],t)
    assert(crossing.distanceTo(midpoint)<1e-6,'bearer crosses the physical lower rope centreline')
   }
  }
  for(let i=0;i<n;i++){
   const b=localBounds(bearers[i]),x=(b.min.x+b.max.x)/2,plankBottom=castLocal(m,deck,x,0,1),bearerTop=castLocal(m,[bearers[i]],x,0)
   assert(plankBottom&&bearerTop,'bearer and plank underside have real surfaces')
   const overlap=height(m,bearerTop)-height(m,plankBottom)
   assert(overlap>=-1e-6&&overlap<m.object.height*.01,`plank rests on its bearer without a visible air gap: low=${low} dim=${dimensions} i=${i} overlap=${overlap} bearer=${height(m,bearerTop)} plank=${height(m,plankBottom)}`)
  }
  m.dispose()
 }
})

test('Ladder rungs enter both rails and both LODs keep all ten steps and end ferrules',()=>{
 for(const low of [false,true]){
  const m=build('ladder',low),rungs=named(m,'ladder-rung'),rails=named(m,'ladder-side-rail'),ferrules=named(m,'ladder-end-ferrule')
  assert.equal(rungs.length,10);assert.equal(ferrules.length,4)
  for(const rung of rungs){
   const ends=cylinderEnds(rung).sort((a,b)=>a.x-b.x)
   for(let side=0;side<2;side++){
    const end=ends[side],rail=rails[side],sign=side?1:-1,origin=m.group.localToWorld(new THREE.Vector3(0,end.y,end.z)),outside=m.group.localToWorld(new THREE.Vector3(sign*m.object.width,end.y,end.z)),near=new THREE.Raycaster(origin,new THREE.Vector3(sign,0,0)).intersectObject(rail)[0],far=new THREE.Raycaster(outside,new THREE.Vector3(-sign,0,0)).intersectObject(rail)[0]
    assert(near&&far,'rung line intersects solid side rail')
    const a=m.group.worldToLocal(near.point.clone()).x,b=m.group.worldToLocal(far.point.clone()).x
    assert(end.x>=Math.min(a,b)-1e-6&&end.x<=Math.max(a,b)+1e-6,'mortised rung end lies within its rail')
   }
  }
  m.dispose()
 }
})
