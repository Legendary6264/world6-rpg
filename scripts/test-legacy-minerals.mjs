import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {populateLegacyMinerals} from '../src/scene3dLegacyMinerals.ts'
import {legacyAssets,legacyPlacementDefaults} from '../src/legacyAssets.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'

const owned=legacyAssets.filter(a=>a.group==='mineral'&&!a.native)
function build(slug,low=false,dimensions={}){
 const a=owned.find(a=>a.slug===slug),geometry={kind:a.kind,artwork:a.id,...legacyPlacementDefaults(a.id),...dimensions},group=new THREE.Group(),materials=new Map(),resources=new Set()
 const e={geometry,appearance:{color:'#849097'}}
 assert(populateLegacyMinerals(e,(g,c,x,y,z,s={})=>{
  const key=JSON.stringify([c,s]);let m=materials.get(key)
  if(!m){m=new THREE.MeshStandardMaterial({color:c,side:THREE.FrontSide});m.userData.paletteBatch=JSON.stringify([s,false,1]);materials.set(key,m)}
  const part=new THREE.Mesh(g,m);part.position.set(x,y,z);group.add(part);resources.add(g);return part
 },low),slug+' is handled');group.updateMatrixWorld(true)
 return {a,e,group,materials,resources,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const ray=(m,origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(m.group,true)[0]
const named=(m,name)=>m.group.children.find(p=>p.geometry.name===name)
const bounds=part=>new THREE.Box3().setFromObject(part,true)
function closedSolid(part){
 const p=part.geometry.attributes.position,n=part.geometry.attributes.normal,index=part.geometry.index,count=index?.count??p.count,edges=new Map();let volume=0
 const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e5)).join(',')
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),face=b.clone().sub(a).cross(c.clone().sub(a))
  if(face.lengthSq()<1e-20)continue
  volume+=a.dot(b.clone().cross(c))/6
  const average=new THREE.Vector3();ids.forEach(j=>average.add(new THREE.Vector3().fromBufferAttribute(n,j)))
  assert(face.dot(average)>-1e-11,part.geometry.name+' normals follow winding')
  const points=[a,b,c].map(key)
  for(let j=0;j<3;j++){const a=points[j],b=points[(j+1)%3];if(a===b)continue;const edge=a<b?a+'|'+b:b+'|'+a,entry=edges.get(edge)??[0,0];entry[0]++;entry[1]+=a<b?1:-1;edges.set(edge,entry)}
 }
 assert(volume>1e-10,part.geometry.name+' has positive enclosed volume')
 assert([...edges.values()].every(([count,direction])=>count===2&&direction===0),part.geometry.name+' has closed consistently wound edges')
 for(let i=0;i<n.count;i++)assert(Math.abs(new THREE.Vector3().fromBufferAttribute(n,i).length()-1)<1e-4,part.geometry.name+' unit normals')
}
function signature(m){
 let triangles=0,m2=0,m3=0,m4=0
 for(const part of m.group.children){const p=part.geometry.attributes.position;triangles+=(part.geometry.index?.count??p.count)/3;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);m2+=x*x+y*y+z*z;m3+=x*y*z;m4+=x*x*y*y+z*z*z*z}}
 return [m.group.children.length,triangles,m2.toFixed(5),m3.toFixed(5),m4.toFixed(5)].join(':')
}

test('All 38 old mineral IDs are bounded, finite, capped solids in both detail modes',()=>{
 assert.equal(owned.length,38)
 for(const a of owned)for(const low of [false,true]){
  const m=build(a.slug,low,{width:2.13,depth:.87,height:1.71,facing:90}),b=bounds(m.group),size=b.getSize(new THREE.Vector3());let triangles=0
  assert(Math.abs(size.x-2.13)<1e-5,a.slug+' exact saved width');assert(Math.abs(size.z-.87)<1e-5,a.slug+' exact saved depth');assert(Math.abs(size.y-1.71)<1e-5,a.slug+' exact saved height')
  assert(Math.abs(b.min.x+2.13/2)<1e-5&&Math.abs(b.min.z+.87/2)<1e-5&&Math.abs(b.min.y)<1e-6,a.slug+' centred and grounded')
  for(const part of m.group.children){
   assert(part.geometry.name.startsWith('mineral-'),a.slug+' named authored geometry')
   for(const name of ['position','normal','uv'])assert(part.geometry.attributes[name]?.array.every(Number.isFinite),a.slug+' finite '+name)
   assert(part.position.length()<1e-9&&part.scale.equals(new THREE.Vector3(1,1,1)),a.slug+' baked transforms')
   triangles+=(part.geometry.index?.count??part.geometry.attributes.position.count)/3;closedSolid(part)
  }
  assert(triangles<14000,a.slug+' triangle budget ('+triangles+')');assert(new Set([...m.materials.values()].map(x=>x.userData.paletteBatch)).size<=8,a.slug+' surface budget');m.dispose()
 }
})
test('Saved zero heights use the renderer minimum without lifting the ground',()=>{
 for(const slug of ['stone-arch-natural','geode','bones','anchor'])for(const low of [false,true]){const m=build(slug,low,{width:.61,depth:2.9,height:0}),b=bounds(m.group);assert(Math.abs(b.min.y)<1e-6&&Math.abs(b.max.y-.035)<1e-6,slug+' minimum saved height');m.dispose()}
})
test('High and low shapes are all distinct; low detail reduces geometry',()=>{
 for(const low of [false,true]){
  const seen=new Map()
  for(const a of owned){const m=build(a.slug,low,{width:1,depth:1,height:1}),s=signature(m);assert(!seen.has(s),a.slug+' duplicates '+seen.get(s));seen.set(s,a.slug);m.dispose()}
 }
 for(const a of owned){const high=build(a.slug),low=build(a.slug,true),tri=m=>m.group.children.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0);assert(tri(low)<tri(high),a.slug+' lower detail uses fewer triangles');high.dispose();low.dispose()}
})
test('Unrelated, native, malformed and overridden artwork does not emit any mineral mesh',()=>{
 for(const geometry of [{kind:'rock',width:1,depth:1,height:1},{kind:'rock',artwork:'expanded-object-table'},{kind:'tree',artwork:'expanded-object-boulder'},{kind:'rock',artwork:'expanded-object-boulder',asset:'rock'},{kind:'rock',artwork:'expanded-object-fern'},{kind:'rock',artwork:'missing'}]){
  let calls=0;assert.equal(populateLegacyMinerals({geometry},()=>{calls++}),false);assert.equal(calls,0)
 }
})
test('Natural arch and burrow have clear through openings with solid roof and side walls',()=>{
 for(const low of [false,true])for(const [slug,name] of [['stone-arch-natural','mineral-natural-arch-open-span'],['sand-burrow','mineral-sand-burrow-open-tunnel']]){
  const m=build(slug,low),b=bounds(named(m,name)),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3()),z=b.max.z+1
  assert(!ray(m,[center.x,b.min.y+size.y*.27,z],[0,0,-1]),slug+' portal passes all the way through')
  const roof=ray(m,[center.x,b.min.y+size.y*.84,z],[0,0,-1]);assert(roof&&roof.object.geometry.name===name,slug+' roof is solid')
  assert(ray(m,[b.min.x+size.x*.13,b.min.y+size.y*.2,z],[0,0,-1]),slug+' left pier is solid')
  const below=ray(m,[center.x,-1,center.z],[0,1,0]);assert(below&&below.point.y>b.min.y+size.y*.45,slug+' clear underside rises above the ground');m.dispose()
 }
})
test('Geode is an open deep bowl and anchor has a real eye and open fluke gaps',()=>{
 for(const low of [false,true]){
  const m=build('geode',low),b=bounds(named(m,'mineral-geode-stone-bowl')),c=b.getCenter(new THREE.Vector3()),h=b.max.y-b.min.y
  const cavity=ray(m,[c.x,b.max.y+1,c.z],[0,-1,0]);assert(cavity&&cavity.point.y<b.min.y+h*.42,'Geode centre reaches the actual recessed bowl floor')
  const rim=ray(m,[c.x+(b.max.x-b.min.x)*.43,b.max.y+1,c.z],[0,-1,0]);assert(rim&&rim.point.y>cavity.point.y+h*.35,'Geode has thick high rim around its opening')
  assert(ray(m,[c.x,-1,c.z],[0,1,0]),'Geode bowl has a closed solid bottom');m.dispose()
  const a=build('anchor',low),eye=bounds(named(a,'mineral-anchor-open-eye')),ec=eye.getCenter(new THREE.Vector3())
  assert(!ray(a,[ec.x,ec.y,eye.max.z+1],[0,0,-1]),'Anchor eye is a through hole')
  assert(ray(a,[ec.x,eye.max.y-.01,eye.max.z+1],[0,0,-1]),'Anchor eye rim is solid')
  const shank=bounds(named(a,'mineral-anchor-tapered-shank')),sc=shank.getCenter(new THREE.Vector3()),swidth=shank.max.x-shank.min.x
  assert(ray(a,[sc.x,sc.y,eye.max.z+1],[0,0,-1]),'Anchor has its central shank')
  assert(!ray(a,[sc.x+swidth*2.2,shank.min.y+(shank.max.y-shank.min.y)*.25,eye.max.z+1],[0,0,-1]),'Anchor arm and shaft enclose open water space');a.dispose()
 }
})
test('Pumice pores and skull eye sockets are geometric holes',()=>{
 for(const low of [false,true]){
  const m=build('pumice-boulder',low),b=bounds(named(m,'mineral-pumice-through-pores')),w=b.max.x-b.min.x,h=b.max.y-b.min.y
  // The first authored pore is at (-.28,.25) inside the .98 × .84 profile.
  const x=b.min.x+w*((-.28+.53)/1.03),y=b.min.y+h*(.25/.84)
  assert(!ray(m,[x,y,b.max.z+1],[0,0,-1]),'Pumice pore is clear through the rock')
  assert(ray(m,[b.min.x+w*.51,b.min.y+h*.42,b.max.z+1],[0,0,-1]),'Pumice stone remains between the pores');m.dispose()
  const bones=build('bones',low),skull=named(bones,'mineral-skull-open-eye-sockets'),sb=bounds(skull),sz=sb.max.z-sb.min.z,sx=sb.max.x-sb.min.x
  const eyeX=sb.min.x+sx*((-.062+.16)/.31),eyeZ=sb.min.z+sz*((.18-.04)/.32)
  assert(!ray(bones,[eyeX,sb.max.y+1,eyeZ],[0,-1,0]),'Skull has an open eye socket');bones.dispose()
 }
})
test('Palette batching preserves all old mineral bounds and never exceeds eight groups',()=>{
 for(const a of owned)for(const low of [false,true]){
  const m=build(a.slug,low),before=bounds(m.group)
  batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g})
  const after=bounds(m.group);assert(before.min.distanceTo(after.min)<1e-5&&before.max.distanceTo(after.max)<1e-5,a.slug+' batched bounds');assert(m.group.children.length<=8,a.slug+' batched surface groups');m.dispose()
 }
})
