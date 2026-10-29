import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {populateBasicStructure} from '../src/scene3dBasicStructure.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'

function build(kind,w=4,d=.5,h=2.5,low=false){
 const group=new THREE.Group(),resources=new Set(),materials=new Map()
 const e={id:'basic:'+kind,geometry:{kind,width:w,depth:d,height:h},appearance:{color:'#aaa',heightKnown:true,remembered:false}}
 assert(populateBasicStructure(e,(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.FrontSide});material.userData.castsShadow=s.castShadow!==false;materials.set(key,material)}
  resources.add(g);const part=new THREE.Mesh(g,material);part.position.set(x,y,z);group.add(part);return part
 },low))
 group.updateMatrixWorld(true)
 return {group,resources,dispose(){resources.forEach(r=>r.dispose());materials.forEach(r=>r.dispose())}}
}
function assertClosed(g){
 const p=g.getAttribute('position'),idx=g.index,count=idx?.count??p.count,edges=new Map();let volume=0
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',')
 for(let i=0;i<count;i+=3){
  const ia=idx?idx.getX(i):i,ib=idx?idx.getX(i+1):i+1,ic=idx?idx.getX(i+2):i+2
  a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic)
  if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()<1e-20)continue
  volume+=a.dot(b.clone().cross(c))/6
  for(const [from,to] of [[ia,ib],[ib,ic],[ic,ia]]){const ka=key(from),kb=key(to),k=ka<kb?ka+'|'+kb:kb+'|'+ka,v=edges.get(k)??[0,0];v[0]++;v[1]+=ka<kb?1:-1;edges.set(k,v)}
 }
 assert([...edges.values()].every(([count,direction])=>count===2&&direction===0),g.name+' welded edges close with opposing directions')
 assert(volume>1e-9,g.name+' has positive enclosed volume and outward winding')
}
test('Базовая кладка: камни замкнуты, обе лицевые стороны имеют физический рельеф и глубокие швы',()=>{
 const m=build('wall'),stones=m.group.children.filter(p=>p.geometry.name==='basic-dressed-stone')
 assert(stones.length>20)
 stones.forEach(p=>assertClosed(p.geometry))
 const a=stones[0],b=stones[1],seam=(a.position.x+b.position.x)/2,y=a.position.y
 for(const side of [-1,1]){
  const rayAt=x=>new THREE.Raycaster(new THREE.Vector3(x,y,side*2),new THREE.Vector3(0,0,-side)).intersectObject(m.group,true)[0]
  const face=rayAt(a.position.x),joint=rayAt(seam)
  assert(face&&joint,'Both the ashlar and the solid mortar core must face outward')
  assert(joint.distance-face.distance>.025,'Recessed pointing is actual depth on both wall faces')
 }
 m.dispose()
})
test('Базовая опора: сплошной верх точно на заданной высоте, карниз замкнут и под аркой настоящий просвет',()=>{
 for(const low of [false,true]){
  const w=2,d=2,h=2,m=build('platform',w,d,h,low),deck=m.group.children.find(p=>p.geometry.name==='basic-platform-deck')
  assertClosed(deck.geometry)
  for(const x of [-.999,-.7,0,.7,.999])for(const z of [-.999,-.7,0,.7,.999]){
   const hit=new THREE.Raycaster(new THREE.Vector3(x,h+.5,z),new THREE.Vector3(0,-1,0)).intersectObject(m.group,true)[0]
   assert(hit&&Math.abs(hit.point.y-h)<1e-6,'The full support rectangle, including corners, stays flat at its saved top')
   assert(hit.face.normal.y>.999,'The complete top is outward-facing, without interpolated vertical side normals')
  }
  const rayAt=x=>new THREE.Raycaster(new THREE.Vector3(x,h*.45,2),new THREE.Vector3(0,0,-1)).intersectObject(m.group,true)
  assert.equal(rayAt(0).length,0,'The opening beneath the deck is genuine empty geometry')
  assert(rayAt(.72).length>0,'Solid piers remain beside the arch')
  m.group.children.filter(p=>['basic-platform-arch','basic-platform-voussoir'].includes(p.geometry.name)).forEach(p=>assertClosed(p.geometry))
  m.dispose()
 }
})
test('Базовые конструкции: габариты, минимальная высота, нормали, материалы и low-бюджет',t=>{
 for(const kind of ['wall','platform']){
  let high=0
  for(const low of [false,true])for(const [w,d,h] of [[4,.5,2.5],[2.6,1.6,.7],[.3,.1,.2],[.1,3.2,.035],[3,.1,0]]){
   const m=build(kind,w,d,h,low),bounds=new THREE.Box3().setFromObject(m.group,true),top=Math.max(.035,h)
   assert(bounds.min.x>=-w/2-.00001&&bounds.max.x<=w/2+.00001,kind+' width')
   assert(bounds.min.z>=-d/2-.00001&&bounds.max.z<=d/2+.00001,kind+' depth')
   assert(bounds.min.y>=-.00001&&Math.abs(bounds.max.y-top)<.00001,kind+' exact top')
   let triangles=0
   m.group.traverse(p=>{if(p.isMesh){triangles+=(p.geometry.index?.count??p.geometry.attributes.position.count)/3;for(const name of ['position','normal'])assert(p.geometry.attributes[name].array.every(Number.isFinite))}})
   const before=bounds.clone();batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g})
   const after=new THREE.Box3().setFromObject(m.group,true)
   assert(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6,'Batching retains the carved silhouette')
   assert(m.group.children.length<=6,kind+' material batches stay bounded')
   assert(m.group.children.every(p=>p.castShadow),'Opaque structural surfaces continue casting shadows')
   assert(triangles<(low?5000:20000),kind+' bounded geometry')
   if(w===4&&d===.5){if(!low)high=triangles;else assert(triangles<high/2,'The economical variant substantially reduces geometry');t.diagnostic(`${kind}, ${low?'low':'detailed'}: ${triangles} triangles / ${m.group.children.length} batches`)}
   m.dispose()
  }
 }
 let called=false
 assert.equal(populateBasicStructure({geometry:{kind:'crate'}},()=>{called=true}),false);assert(!called)
 assert.equal(populateBasicStructure({geometry:{kind:'wall',asset:'stone-wall'}},()=>{called=true}),false);assert(!called)
})
