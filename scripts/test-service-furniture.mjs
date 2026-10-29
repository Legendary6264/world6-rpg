import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {populateServiceFurniture} from '../src/scene3dServiceFurniture.ts'
import {tabletopAsset} from '../src/tabletopCatalog.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'
function build(id,low=false){
 const a=tabletopAsset(id),group=new THREE.Group(),materials=new Map(),resources=new Set()
 assert(populateServiceFurniture({geometry:{asset:id}},(g,c,x,y,z,s={})=>{
  const key=JSON.stringify([c,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color:c,side:THREE.FrontSide});material.userData.paletteBatch=JSON.stringify([s,false,1]);materials.set(key,material)}
  const part=new THREE.Mesh(g,material);part.position.set(x,y,z);resources.add(g);group.add(part);return part
 },low));group.updateMatrixWorld(true)
 return {a,group,materials,resources,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const ray=(model,origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(model.group,true)[0]
function closedSolid(part){
 const p=part.geometry.attributes.position,n=part.geometry.attributes.normal,index=part.geometry.index,count=index?.count??p.count,edges=new Map();let volume=0
 const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e5)).join(',')
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),face=b.clone().sub(a).cross(c.clone().sub(a))
  if(face.lengthSq()<1e-20)continue
  volume+=a.dot(b.clone().cross(c))/6
  const average=new THREE.Vector3();ids.forEach(j=>average.add(new THREE.Vector3().fromBufferAttribute(n,j)))
  assert(face.dot(average)>-1e-12,part.geometry.name+' normals follow outward winding')
  const points=[a,b,c].map(key)
  for(let j=0;j<3;j++){const x=points[j],y=points[(j+1)%3];if(x===y)continue;const edge=x<y?x+'|'+y:y+'|'+x;edges.set(edge,(edges.get(edge)??0)+1)}
 }
 assert(volume>1e-9,part.geometry.name+' positive enclosed volume')
 assert([...edges.values()].every(count=>count===2),part.geometry.name+' has no uncapped boundary edges')
 for(let i=0;i<n.count;i++)assert(Math.abs(new THREE.Vector3().fromBufferAttribute(n,i).length()-1)<1e-4,part.geometry.name+' unit normals')
}

test('Service furniture uses closed outward solids inside native bounds in both detail modes',()=>{
 for(const id of ['bar','bench'])for(const low of [false,true]){
  const m=build(id,low),{width:w,depth:d,height:h}=m.a,b=new THREE.Box3().setFromObject(m.group,true)
  assert(b.min.x>=-w/2+.001-1e-6&&b.max.x<=w/2-.001+1e-6,id+' width clearance')
  assert(b.min.z>=-d/2+.001-1e-6&&b.max.z<=d/2-.001+1e-6,id+' depth clearance')
  assert(b.min.y>=-1e-6&&b.max.y<=h+1e-6,id+' height')
  let triangles=0
  for(const part of m.group.children){assert(part.geometry.attributes.position.array.every(Number.isFinite));assert(part.geometry.attributes.normal.array.every(Number.isFinite));triangles+=(part.geometry.index?.count??part.geometry.attributes.position.count)/3;closedSolid(part)}
  assert(triangles<12000,id+' triangle budget');assert(m.materials.size<=7,id+' material budget');m.dispose()
 }
 let calls=0;assert.equal(populateServiceFurniture({geometry:{asset:'table'}},()=>{calls++}),false);assert.equal(calls,0)
})
test('Broad flat tops match saved support height at the centre and conservative footprint corners',()=>{
 for(const id of ['bar','bench'])for(const low of [false,true]){
  const m=build(id,low),{width:w,depth:d,height:h}=m.a
  for(const x of [0,-w*.48,w*.48])for(const z of [0,-d*.45,d*.45]){
   const hit=ray(m,[x,h+1,z],[0,-1,0]);assert(hit,`${id} flat support at ${x},${z}`)
   assert(Math.abs(hit.point.y-h)<1e-6,`${id} flat top at ${x},${z}`)
   assert(hit.face.normal.y>.999,'A support point is on a level face')
  }
  const foot=id==='bar'?[0,-1,d*.25]:[w*.36,-1,d*.39],bottom=ray(m,foot,[0,1,0])
  assert(bottom&&Math.abs(bottom.point.y)<1e-6,id+' foot meets the ground')
  m.dispose()
 }
})
test('Recessed bar panels on both faces and the bench arch are actual geometry',()=>{
 for(const low of [false,true]){
  const m=build('bar',low),{width:w,depth:d,height:h}=m.a
  for(const side of [-1,1]){
   const panel=ray(m,[0,h*.5,side*(d+1)],[0,0,-side]),stile=ray(m,[w*.88/6,h*.5,side*(d+1)],[0,0,-side])
   assert.equal(panel.object.geometry.name,'service-bar-panel');assert.equal(stile.object.geometry.name,'service-bar-stile')
   assert(Math.abs(stile.point.z)>Math.abs(panel.point.z)+d*.02,'The panel is physically behind its frame')
  }
  m.dispose()
  const bench=build('bench',low),b=bench.a
  assert.equal(ray(bench,[0,b.height*.6,b.depth+1],[0,0,-1]),undefined,'The bench has open leg space')
  const arch=ray(bench,[b.width*.36,-1,0],[0,1,0]);assert(arch&&arch.point.y>b.height*.1,'The support underside has a real arch opening')
  bench.dispose()
 }
})
test('Normal batching preserves the constructed bounds and palette while reducing material groups',()=>{
 for(const id of ['bar','bench'])for(const low of [false,true]){
  const m=build(id,low),before=new THREE.Box3().setFromObject(m.group,true),parts=m.group.children.length
  batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g})
  const after=new THREE.Box3().setFromObject(m.group,true)
  assert(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6)
  assert(m.group.children.length<parts);assert(m.group.children.length<=(id==='bar'?3:2))
  assert(m.group.children.every(p=>p.material.vertexColors&&p.geometry.attributes.color))
  m.dispose()
 }
})
