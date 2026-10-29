import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {legacyAssets} from '../src/legacyAssets.ts'
import {populateLegacyFurniture} from '../src/scene3dLegacyFurniture.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'

const slugs=['anvil','grindstone','bellows']
function build(slug,{low=false,dimensions=[1.4,.9,1.2],facing=0,flags={}}={}){
 const a=legacyAssets.find(a=>a.slug===slug),group=new THREE.Group(),materials=new Map(),resources=new Set(),geometry={kind:a.kind,artwork:a.id,width:dimensions[0],depth:dimensions[1],height:dimensions[2],...flags}
 assert(populateLegacyFurniture({geometry},(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide});material.userData.paletteBatch=key;materials.set(key,material)}
  const p=new THREE.Mesh(g,material);p.position.set(x,y,z);group.add(p);resources.add(g);return p
 },low))
 group.rotation.y=-facing*Math.PI/180;group.updateMatrixWorld(true)
 return {slug,geometry,group,materials,resources,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const named=(m,suffix)=>m.group.children.filter(p=>p.geometry.name===m.slug+'-'+suffix)
const box=p=>{p.geometry.computeBoundingBox();return p.geometry.boundingBox.clone()}
const tris=m=>m.group.children.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)
function authored(m,p){
 let bounds,sourceMin,sourceMax
 if(m.slug==='anvil'){bounds=box(named(m,'anvil-face')[0]);sourceMin=[-.49,.958,-.16];sourceMax=[.28,1,.16]}
 else if(m.slug==='grindstone'){bounds=box(named(m,'grindstone-axle')[0]);sourceMin=[-.47,.669,-.031];sourceMax=[.55,.731,.031]}
 else{bounds=box(named(m,'bellows-board')[0]);sourceMin=[-.36,.03,-.41];sourceMax=[.36,.08,.54]}
 const q=new THREE.Vector3(...p)
 for(let i=0;i<3;i++)q.setComponent(i,bounds.min.getComponent(i)+(p[i]-sourceMin[i])/(sourceMax[i]-sourceMin[i])*(bounds.max.getComponent(i)-bounds.min.getComponent(i)))
 return q.applyMatrix4(m.group.matrixWorld)
}
function ray(m,p,d,parts=m.group.children){const o=authored(m,p),q=authored(m,p.map((n,i)=>n+d[i]));return new THREE.Raycaster(o,q.sub(o).normalize()).intersectObjects(parts)}
function inside(p,point){const hits=new THREE.Raycaster(point,new THREE.Vector3(.713,.121,.691).normalize()).intersectObject(p);return hits.filter((h,i)=>!i||h.distance-hits[i-1].distance>1e-6).length%2===1}
function joins(m,a,b,p,label){const point=authored(m,p);assert(named(m,a).some(part=>inside(part,point)),label+' first solid');assert(named(m,b).some(part=>inside(part,point)),label+' attached solid')}

test('Three original workshop tools retain finite saved envelopes and cheap high/low palette batches',()=>{
 const costs=[]
 for(const slug of slugs){let high
  for(const low of [false,true])for(const dimensions of [[1.4,.9,1.2],[.19,4.1,.16],[4.2,.17,2.8]]){
   const m=build(slug,{low,dimensions,flags:{open:true,active:false,locked:true}}),bounds=new THREE.Box3()
   for(const part of m.group.children){bounds.union(box(part));for(const attr of ['position','normal','uv'])assert(part.geometry.attributes[attr]?.array.every(Number.isFinite),slug+' '+attr);assert(m.resources.has(part.geometry))}
   assert(bounds.min.x>=-dimensions[0]/2-1e-6&&bounds.max.x<=dimensions[0]/2+1e-6,slug+' width')
   assert(bounds.min.z>=-dimensions[1]/2-1e-6&&bounds.max.z<=dimensions[1]/2+1e-6,slug+' depth')
   assert(Math.abs(bounds.min.y)<1e-6&&bounds.max.y<=dimensions[2]+1e-6,slug+' ground and height')
   const n=tris(m);assert(n<(low?3000:14000),slug+' triangle budget '+n)
   if(dimensions[0]===1.4){costs.push({slug,low,triangles:n,parts:m.group.children.length});if(!low)high=n;else assert(n<high*.65,slug+' cheaper low LOD')}
   batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g});assert(m.group.children.length<=8,slug+' palette batching')
   m.dispose()
  }
 }
 console.log(JSON.stringify({legacyWorkshop:costs}))
})

test('Anvil heel has two actual through holes and its horn and holdfasts join the casting',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('anvil',{low,facing}),casting=['anvil-face','anvil-heel','anvil-body'].flatMap(name=>named(m,name))
  for(const p of [[-.405,1.2,0],[-.301,1.2,.062]])assert(ray(m,p,[0,-1,0],casting).every(hit=>hit.point.y<authored(m,[0,.88,0]).y),'tool hole is open through entire heel above the lower foot')
  assert(ray(m,[-.46,1.2,.09],[0,-1,0],casting).length,'solid material separates tool holes and edge')
  joins(m,'anvil-horn','anvil-body',[.25,.925,0],'horn shoulders enter main casting')
  for(const side of [-1,1])joins(m,'anvil-clamp-toe','anvil-body',[.26,.649,side*.13],'holdfast toe clamps anvil foot')
  m.dispose()
 }
})

test('Grindstone wheel, bearing seats, crank and trough are physical connected constructions',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('grindstone',{low,facing}),wheel=named(m,'grinding-stone')
  assert.equal(ray(m,[1,.7,0],[-1,0,0],wheel).length,0,'wheel has real axle bore')
  assert(ray(m,[1,.9,0],[-1,0,0],wheel).length,'wheel face remains solid outside bore')
  joins(m,'grindstone-hub','grinding-stone',[.114,.76,0],'wheel washer is seated on stone')
  joins(m,'axle-bearing','bearing-seat',[.31,.64,.045],'bearing has timber backing')
  joins(m,'crank-boss','grindstone-axle',[.49,.7,0],'crank fastens to axle')
  joins(m,'crank-arm','crank-spindle',[.49,.7,.175],'grip spindle fastens to crank')
  const walls=['trough-bottom','trough-side','trough-end'].flatMap(name=>named(m,name)),hits=ray(m,[.17,1,.19],[0,-1,0],walls)
  assert(hits.length&&hits[0].object.geometry.name.endsWith('trough-bottom'),'water trough has an open cavity and actual bottom')
  m.dispose()
 }
})

test('Bellows retain an air chamber, folded solid leather, attached boards, handles and an open nozzle',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('bellows',{low,facing}),leather=named(m,'leather-gusset'),nozzle=named(m,'bellows-nozzle')
  assert.equal(ray(m,[0,.17,-.12],[0,1,0],leather).length,0,'air chamber has no filled leather disks')
  assert.equal(ray(m,[0,.095,1],[0,0,-1],nozzle).length,0,'nozzle mouth has a real through bore')
  assert(ray(m,[.04,.095,1],[0,0,-1],nozzle).length,'nozzle has a physical tapered wall')
  joins(m,'bellows-handle','bellows-board',[0,.055,-.37],'lower handle enters lower board')
  joins(m,'bellows-handle','bellows-board',[0,.212+.18*.37,-.37],'upper handle enters inclined board')
  joins(m,'leather-gusset','bellows-board',[-.3393,.0785,-.12],'lower leather hem seats inside lower board')
  joins(m,'leather-gusset','bellows-board',[-.3393,.2101,-.12],'upper leather hem seats inside inclined board')
  for(const x of [-.22,.22]){
   joins(m,'skid-rail','bellows-board',[x,.032,-.12],'timber skid frame supports lower board')
   for(const z of [-.18,.16])joins(m,'skid-rail','skid-cross-tie',[x,.018,z],'frame cross ties join both longitudinal skids')
  }
  m.dispose()
 }
})
