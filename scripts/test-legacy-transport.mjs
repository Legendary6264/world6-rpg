import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {legacyAssets} from '../src/legacyAssets.ts'
import {populateLegacyFurniture} from '../src/scene3dLegacyFurniture.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'

const slugs=['cart','wheelbarrow','mine-cart']
function build(slug,{low=false,dimensions=[2.4,1.4,1.4],facing=0}={}){
 const asset=legacyAssets.find(a=>a.slug===slug),group=new THREE.Group(),materials=new Map(),resources=new Set(),geometry={kind:asset.kind,artwork:asset.id,width:dimensions[0],depth:dimensions[1],height:dimensions[2]}
 assert(populateLegacyFurniture({geometry},(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide});material.userData.paletteBatch=key;materials.set(key,material)}
  const p=new THREE.Mesh(g,material);p.position.set(x,y,z);group.add(p);resources.add(g);return p
 },low))
 group.rotation.y=-facing*Math.PI/180;group.updateMatrixWorld(true)
 return {slug,low,group,geometry,materials,resources,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const named=(m,suffix)=>m.group.children.filter(p=>p.geometry.name===m.slug+'-'+suffix)
const box=p=>{p.geometry.computeBoundingBox();return p.geometry.boundingBox.clone()}
function authored(m,p){
 const b=box(named(m,'chassis-crossmember')[0]),barrow=m.slug==='wheelbarrow',min=barrow?[-.18,.325,-.31]:[-.06,.34,-.41],max=barrow?[-.06,.415,.31]:[.06,.43,.41],q=new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2)
 for(let i=0;i<3;i++)q.setComponent(i,b.min.getComponent(i)+(q.getComponent(i)-min[i])/(max[i]-min[i])*(b.max.getComponent(i)-b.min.getComponent(i)))
 return q.applyMatrix4(m.group.matrixWorld)
}
function ray(m,p,d,parts=m.group.children){const origin=authored(m,p),end=authored(m,p.map((v,i)=>v+d[i]));return new THREE.Raycaster(origin,end.sub(origin).normalize()).intersectObjects(parts)}
function inside(part,p){const hits=new THREE.Raycaster(p,new THREE.Vector3(.713,.121,.691).normalize()).intersectObject(part);return hits.filter((h,i)=>!i||h.distance-hits[i-1].distance>1e-6).length%2===1}
function joins(m,a,b,p,label){const q=authored(m,p);assert(named(m,a).some(part=>inside(part,q)),label+' first solid');assert(named(m,b).some(part=>inside(part,q)),label+' joined solid')}

test('Original transport has finite normals, saved envelopes, economical LODs and bounded palette batches',()=>{
 const costs=[]
 for(const slug of slugs){let high
  for(const low of [false,true])for(const dimensions of [[2.4,1.4,1.4],[.19,4.1,.16],[4.2,.17,2.8]]){
   const m=build(slug,{low,dimensions}),bounds=new THREE.Box3().setFromObject(m.group,true)
   assert(bounds.min.distanceTo(new THREE.Vector3(-dimensions[0]/2,0,-dimensions[1]/2))<2e-6,slug+' min saved envelope')
   assert(bounds.max.distanceTo(new THREE.Vector3(dimensions[0]/2,dimensions[2],dimensions[1]/2))<2e-6,slug+' max saved envelope')
   let triangles=0
   for(const part of m.group.children){
    const g=part.geometry,p=g.attributes.position,n=g.attributes.normal,index=g.index,count=index?.count??p.count
    for(const attr of ['position','normal','uv'])assert(g.attributes[attr]?.array.every(Number.isFinite),slug+' '+attr)
    for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),face=b.sub(a).cross(c.sub(a)),normal=new THREE.Vector3();ids.forEach(j=>normal.add(new THREE.Vector3().fromBufferAttribute(n,j)));assert(face.dot(normal)>-1e-10,g.name+' normals face outward after edited dimensions')}
    triangles+=count/3
   }
   assert(triangles<(low?3000:14000),slug+' triangle budget '+triangles)
   if(dimensions[0]===2.4){costs.push({slug,low,triangles,parts:m.group.children.length});if(!low)high=triangles;else assert(triangles<high*.65,slug+' meaningful low LOD')}
   batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g});assert(m.group.children.length<=8,slug+' bounded palette batches')
   m.dispose()
  }
 }
 console.log(JSON.stringify({legacyTransport:costs}))
})

test('Wooden cart has seated hubs and axle bearings, joined floor/boards and shafts, and an open load bed',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('cart',{low,facing})
  joins(m,'cart-axle','wheel-hub',[.59,.319,-.02],'axle seats in wheel hub')
  joins(m,'cart-axle','axle-bearing-seat',[.33,.305,-.02],'axle enters supported bearing')
  joins(m,'axle-bearing-seat','chassis-longitudinal',[.33,.355,-.02],'bearing is fastened under chassis')
  joins(m,'cart-side-board','floor-board',[.46,.4735,.1],'side boards meet the load floor')
  joins(m,'cart-shaft','chassis-longitudinal',[.32,.395,-.39],'draw shafts join chassis')
  joins(m,'corner-strap','corner-stake',[.512,.66,.535],'corner straps seat on timber')
  const floor=ray(m,[.10,1.2,.10],[0,-1,0]);assert(floor.length&&floor[0].point.distanceTo(authored(m,[.10,.475,.10]))<1e-4,'open cart mouth reaches actual floor')
  const wheel=named(m,'wheel-rim').concat(named(m,'wheel-iron-tyre'));assert.equal(ray(m,[1,.39,.09],[-1,0,0],wheel).length,0,'wheel has negative space between rim and hub')
  m.dispose()
 }
})

test('Wheelbarrow has one front wheel clear of its hollow tray and joined handles, feet and stays',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('wheelbarrow',{low,facing});assert.equal(named(m,'wheel-hub').length,1,'one centred front wheel')
  joins(m,'cart-axle','wheel-hub',[0,.279,-.61],'wheel hub is on its axle')
  joins(m,'cart-axle','axle-bearing-seat',[.22,.266,-.61],'short front axle joins its bearing')
  joins(m,'axle-bearing-seat','barrow-handle',[.22,.309,-.61],'bearing joins longitudinal rail')
  joins(m,'chassis-crossmember','barrow-handle',[.22,.410,.12],'crossmember joins handles')
  joins(m,'barrow-leg','barrow-handle',[.248,.469,.354],'rear leg joins frame')
  joins(m,'barrow-leg','barrow-foot',[.28,.025,.64],'rear feet have support')
  joins(m,'barrow-tray','barrow-handle',[.22,.456,.12],'tray floor rests on rails')
  joins(m,'barrow-tray','tray-top-rail',[.414,.824,.08],'tray has backed lip rails')
  const tray=named(m,'barrow-tray'),wheel=named(m,'wheel-iron-tyre')
  const cavity=ray(m,[.04,1.2,.08],[0,-1,0],tray);assert(cavity.length&&cavity[0].point.distanceTo(authored(m,[.04,.485,.08]))<1e-4,'hollow tray has a real thick bottom')
  for(const y of [.44,.46,.48]){const wh=ray(m,[0,y,-1],[0,0,1],wheel),th=ray(m,[0,y,-1],[0,0,1],tray);assert(wh.length&&th.length&&wh.at(-1).distance<th[0].distance-1e-4,'front wheel has actual clearance from tray at '+y)}
  m.dispose()
 }
})

test('Mine cart has four supported flanged wheels, a real open steel hopper, and connected buffers/couplings',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('mine-cart',{low,facing});assert.equal(named(m,'wheel-hub').length,4,'four rail wheels on two axles')
  joins(m,'cart-axle','wheel-hub',[.49,.259,-.36],'steel wheel is on axle')
  joins(m,'axle-bearing-seat','chassis-longitudinal',[.33,.34,-.36],'wheel bearing joins chassis')
  joins(m,'steel-hopper','chassis-longitudinal',[.33,.426,0],'hopper floor rests on steel frame')
  joins(m,'steel-hopper','hopper-side-rim',[.52,.93,0],'rolled lip backs the hopper edge')
  joins(m,'buffer','buffer-crossmember',[0,.35,.68],'buffers connect to chassis end member')
  joins(m,'buffer','coupling',[0,.33,.783],'coupling rings connect to buffer neck')
  const hopper=ray(m,[.05,1.2,.10],[0,-1,0],named(m,'steel-hopper'));assert(hopper.length&&hopper[0].point.distanceTo(authored(m,[.05,.475,.10]))<1e-4,'steel hopper mouth is open down to its bottom')
  m.dispose()
 }
})
