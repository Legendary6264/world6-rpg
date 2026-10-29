import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {populateTavernFurniture} from '../src/scene3dTavernFurniture.ts'
import {tabletopAsset} from '../src/tabletopCatalog.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'

function build(id,low=false){
 const group=new THREE.Group(),materials=new Map(),resources=new Set()
 const a=tabletopAsset(id)
 assert(populateTavernFurniture({geometry:{asset:id}},(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.FrontSide});materials.set(key,material)}
  const part=new THREE.Mesh(g,material);part.position.set(x,y,z);group.add(part);resources.add(g);return part
 },low))
 group.updateMatrixWorld(true)
 return {a,group,resources,materials,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const ray=(m,origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(m.group,true)[0]

test('Tavern furniture has closed readable forms within the catalog bounds and a small material budget',()=>{
 for(const id of ['table','round-table','chair','stool','mug','plate','bread'])for(const low of [false,true]){
  const m=build(id,low),b=new THREE.Box3().setFromObject(m.group,true),{width:w,depth:d,height:h}=m.a
  assert(b.min.x>=-w/2-.001&&b.max.x<=w/2+.001,id+' width')
  assert(b.min.z>=-d/2-.001&&b.max.z<=d/2+.001,id+' depth')
  assert(b.min.y>=-.001&&b.max.y<=h+.001,id+' height')
  assert(m.materials.size<=7,id+' material budget')
  let triangles=0;m.group.traverse(p=>{if(!p.isMesh)return;triangles+=(p.geometry.index?.count??p.geometry.attributes.position.count)/3;assert(p.geometry.attributes.position.array.every(Number.isFinite));assert(p.geometry.attributes.normal.array.every(Number.isFinite))})
  assert(triangles<(low?1000:7000),id+' triangle budget')
  const before=b.clone();batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g})
  const after=new THREE.Box3().setFromObject(m.group,true)
  assert(before.min.distanceTo(after.min)<.00001&&before.max.distanceTo(after.max)<.00001)
  assert(m.group.children.length<=7);m.dispose()
 }
})
test('Ladder-back chair has actual open rail gaps and a solid scooped seat from above and below',()=>{
 for(const low of [false,true]){
  const m=build('chair',low)
  assert.equal(ray(m,[0,.70,1],[0,0,-1]),undefined,'Gap between back rails must remain empty')
  assert.equal(ray(m,[0,.77,1],[0,0,-1]).object.geometry.name,'tavern-chair-back-rail')
  const top=ray(m,[0,1,0],[0,-1,0]),bottom=ray(m,[0,.1,0],[0,1,0])
  assert.equal(top.object.geometry.name,'tavern-saddle-seat');assert.equal(bottom.object.geometry.name,'tavern-saddle-seat')
  assert(top.point.y>bottom.point.y+.03,'Seat retains physical thickness after scooping')
  m.dispose()
 }
})
test('Table, pedestal table and stool have solid flat tops exactly at the saved support height',()=>{
 for(const id of ['table','round-table','stool'])for(const low of [false,true]){
  const m=build(id,low),h=m.a.height
  const top=ray(m,[0,h+1,0],[0,-1,0])
  assert(top&&Math.abs(top.point.y-h)<1e-6,id+' support height')
  assert(ray(m,[0,-1,0],[0,1,0]),'Solid downward-facing furniture surfaces')
  assert(!m.group.children.some(p=>['tavern-cup-shell','tavern-cup-drink','tavern-dish','tavern-bread-loaf'].includes(p.geometry.name)),'Crockery is not baked into furniture')
  m.dispose()
 }
})
test('Standalone crockery has a real hollow opening, closed bottom and base at zero',()=>{
 for(const low of [false,true]){
  const cup=build('mug',low),x=-cup.a.width*.11
  const drink=ray(cup,[x,1,0],[0,-1,0]),inside=ray(cup,[x,.1,0],[0,-1,0]),under=ray(cup,[x,-1,0],[0,1,0])
  assert.equal(drink.object.geometry.name,'tavern-cup-drink');assert(drink.point.y<cup.a.height*.8)
  assert.equal(inside.object.geometry.name,'tavern-cup-shell');assert(Math.abs(inside.point.y-cup.a.height*.15)<1e-6)
  assert(under&&Math.abs(under.point.y)<1e-6)
  cup.dispose()
  for(const id of ['plate','bread']){
   const m=build(id,low),top=ray(m,[0,1,0],[0,-1,0]),bottom=ray(m,[0,-1,0],[0,1,0])
   assert(top&&bottom);assert(top.point.y>bottom.point.y+.005);assert(Math.abs(bottom.point.y)<1e-6)
   m.dispose()
  }
 }
})
