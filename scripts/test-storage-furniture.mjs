import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {populateStorageFurniture} from '../src/scene3dStorageFurniture.ts'
import {tabletopAsset} from '../src/tabletopCatalog.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'
function build(id,low=false,flags={}){
 const a=tabletopAsset(id),group=new THREE.Group(),materials=new Map(),resources=new Set()
 assert(populateStorageFurniture({geometry:{asset:id,...flags}},(g,c,x,y,z,s={})=>{
  const key=JSON.stringify([c,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color:c,side:THREE.FrontSide});material.userData.paletteBatch=JSON.stringify([s,false,1]);materials.set(key,material)}
  const part=new THREE.Mesh(g,material);part.position.set(x,y,z);resources.add(g);group.add(part);return part
 },low));group.updateMatrixWorld(true)
 return {a,group,materials,resources,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const named=(m,name)=>m.group.children.filter(p=>p.geometry.name===name)
const hit=(m,p,d)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d)).intersectObject(m.group,true)[0]
function closed(part){
 const p=part.geometry.attributes.position,n=part.geometry.attributes.normal,index=part.geometry.index,count=index?.count??p.count,edges=new Map();let volume=0
 const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e5)).join(',')
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),face=b.clone().sub(a).cross(c.clone().sub(a))
  if(face.lengthSq()<1e-19)continue
  volume+=a.dot(b.clone().cross(c))/6
  const normal=new THREE.Vector3();ids.forEach(j=>normal.add(new THREE.Vector3().fromBufferAttribute(n,j)))
  assert(face.dot(normal)>-1e-10,part.geometry.name+' normal follows outward winding')
  const keys=[a,b,c].map(key)
  for(let j=0;j<3;j++){const a=keys[j],b=keys[(j+1)%3];if(a===b)continue;const edge=a<b?a+'|'+b:b+'|'+a;edges.set(edge,(edges.get(edge)??0)+1)}
 }
 assert(volume>1e-10,part.geometry.name+' positive enclosed volume')
 assert([...edges.values()].every(v=>v===2),part.geometry.name+' closed boundary edges')
 assert(p.array.every(Number.isFinite)&&n.array.every(Number.isFinite),part.geometry.name+' finite vertices and normals')
 for(let i=0;i<n.count;i++)assert(Math.abs(new THREE.Vector3().fromBufferAttribute(n,i).length()-1)<1e-4,part.geometry.name+' normalized normals')
}

test('Storage meshes remain closed, outward and within catalog bounds for both LODs and chest states',()=>{
 for(const id of ['shelf','chest'])for(const low of [false,true])for(const open of (id==='chest'?[false,true]:[false]))for(const locked of [false,true]){
  const m=build(id,low,{open,locked}),b=new THREE.Box3().setFromObject(m.group,true),{width:w,depth:d,height:h}=m.a
  assert(b.min.x>=-w/2-1e-6&&b.max.x<=w/2+1e-6,id+' width')
  assert(b.min.z>=-d/2-1e-6&&b.max.z<=d/2+1e-6,id+' depth')
  assert(b.min.y>=-1e-6&&b.max.y<=h+1e-6,id+' height')
  let triangles=0
  for(const p of m.group.children){closed(p);triangles+=(p.geometry.index?.count??p.geometry.attributes.position.count)/3}
  assert(triangles<=14000,id+' triangle budget');assert(m.materials.size<=8,id+' material palette')
  const before=b.clone();batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g})
  const after=new THREE.Box3().setFromObject(m.group,true)
  assert(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6);assert(m.group.children.length<=8)
  m.dispose()
 }
 let calls=0;assert.equal(populateStorageFurniture({geometry:{asset:'bar'}},()=>{calls++}),false);assert.equal(calls,0)
})
test('Chest has a real floor and cavity; the closed lid covers the opening and 30 degrees reveals its front strip',()=>{
 for(const low of [false,true]){
  const a=build('chest',low),b=build('chest',low,{open:true}),h=a.a.height,d=a.a.depth,x=.12,z=d*.35
  const closedTop=hit(a,[x,2,z],[0,-1,0]),openFloor=hit(b,[x,2,z],[0,-1,0])
  assert.equal(closedTop.object.geometry.name,'storage-chest-lid-board');assert(closedTop.point.y>h*.56)
  assert.equal(openFloor.object.geometry.name,'storage-chest-interior-floor');assert(openFloor.point.y<h*.1)
  const bottom=hit(b,[0,-1,0],[0,1,0]);assert.equal(bottom.object.geometry.name,'storage-chest-floor');assert(Math.abs(bottom.point.y)<1e-6)
  for(const direction of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
   const wall=hit(b,[0,h*.3,0],direction);assert(wall&&wall.object.geometry.name.startsWith('storage-chest-inner'),'The interior has real solid sidewalls')
  }
  // Sample the closed inner rim away from the deliberately narrow plank seams.
  for(const px of [-.36,-.12,.12,.36])for(const pz of [-d*.34,0,d*.34])assert(hit(a,[px,2,pz],[0,-1,0]).object.geometry.name.startsWith('storage-chest-lid-'),'The shut lid spans the actual opening')
  a.dispose();b.dispose()
 }
})
test('Chest lid boards and attached hardware rotate rigidly by 30 degrees without shrinking or changing vertices',()=>{
 for(const low of [false,true]){
  const a=build('chest',low),b=build('chest',low,{open:true}),parts=m=>m.group.children.filter(p=>p.geometry.name.startsWith('storage-chest-lid-'))
  const before=parts(a),after=parts(b),h=a.a.height,d=a.a.depth,hinge=new THREE.Vector3(0,h*(.56+.025),-d*.4),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/6)
  assert.equal(before.length,after.length)
  before.forEach((p,i)=>{
   const other=after[i];assert.equal(p.geometry.name,other.geometry.name)
   assert.deepEqual(other.geometry.attributes.position.array,p.geometry.attributes.position.array,'Lid solid dimensions remain unchanged')
   assert.deepEqual(other.scale.toArray(),[1,1,1]);assert(Math.abs(p.quaternion.angleTo(other.quaternion)-Math.PI/6)<1e-6)
   const expected=p.position.clone().sub(hinge).applyQuaternion(q).add(hinge);assert(expected.distanceTo(other.position)<1e-6,'The full part follows the same hinge')
  })
  a.dispose();b.dispose()
 }
})
test('Locked chest displays a padlock with an actual keyhole, and open state follows existing unlocked-lid semantics',()=>{
 for(const low of [false,true])for(const open of [false,true])for(const locked of [false,true]){
  const m=build('chest',low,{open,locked}),locks=named(m,'storage-chest-padlock')
  assert.equal(locks.length,locked&&!open?1:0)
  if(locks.length){
   const lock=locks[0],ray=new THREE.Raycaster(new THREE.Vector3(lock.position.x,lock.position.y,1),new THREE.Vector3(0,0,-1))
   assert.equal(ray.intersectObject(lock,true).length,0,'Keyhole is empty geometry')
   assert.equal(named(m,'storage-chest-padlock-shackle').length,1)
  }
  m.dispose()
 }
})
test('Shelf has four independent solid shelves, actual back-board gaps and hollow geometric pottery in both LODs',()=>{
 for(const low of [false,true]){
  const m=build('shelf',low),{width:w,depth:d,height:h}=m.a,boards=named(m,'storage-shelf-board')
  assert.equal(boards.length,4)
  const ray=new THREE.Raycaster(new THREE.Vector3(0,h+1,0),new THREE.Vector3(0,-1,0)),levels=[]
  for(const board of boards){const top=ray.intersectObject(board,true)[0];assert(top);levels.push(top.point.y)}
  levels.sort((a,b)=>a-b);[.08,.36,.64,.92].forEach((f,i)=>assert(Math.abs(levels[i]-h*f)<1e-6))
  const gap=w*.88/(low?5:9)/2
  assert.equal(hit(m,[gap,h*.22,1],[0,0,-1]),undefined,'Back-board joint is a real sight gap')
  assert.equal(hit(m,[0,h*.22,1],[0,0,-1]).object.geometry.name,'storage-shelf-back-board')
  const cup=named(m,'storage-shelf-cup')[0],cupRay=new THREE.Raycaster(new THREE.Vector3(cup.position.x,cup.position.y+.3,cup.position.z),new THREE.Vector3(0,-1,0)),inside=cupRay.intersectObject(cup,true)[0]
  assert(inside&&inside.point.y-cup.position.y<d*.04,'Cup interior is genuinely recessed')
  assert(named(m,'storage-shelf-jug-spout').length>0&&named(m,'storage-shelf-bottle').length>0&&named(m,'storage-shelf-dish').length>0)
  m.dispose()
 }
})
