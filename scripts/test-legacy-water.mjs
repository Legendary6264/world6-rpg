import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {legacyAssets} from '../src/legacyAssets.ts'
import {populateLegacyStructure} from '../src/scene3dLegacyStructure.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'

function build(slug,{low=false,dimensions=[2,1.7,2.7],facing=0}={}){
 const asset=legacyAssets.find(a=>a.slug===slug),group=new THREE.Group(),resources=new Set(),materials=new Map(),surfaces=new Map(),geometry={kind:asset.kind,artwork:asset.id,width:dimensions[0],depth:dimensions[1],height:dimensions[2]}
 assert(populateLegacyStructure({geometry},(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide});material.userData.paletteBatch=JSON.stringify(s);materials.set(key,material)}
  const part=new THREE.Mesh(g,material);part.position.set(x,y,z);group.add(part);resources.add(g);surfaces.set(part,s);return part
 },low))
 group.rotation.y=-facing*Math.PI/180;group.updateMatrixWorld(true)
 return {slug,low,group,geometry,resources,materials,surfaces,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const named=(m,name)=>m.group.children.filter(p=>p.geometry.name===name)
const box=p=>{p.geometry.computeBoundingBox();return p.geometry.boundingBox.clone()}
function authored(m,p){
 const part=named(m,m.slug==='well'?'well-roof-tie':'fountain-carved-pedestal')[0],b=box(part)
 const rr=.19*(m.low?1:Math.sin(4*Math.PI/9)),min=m.slug==='well'?[-.46,.975,-.06]:[-rr,.155,-.19],max=m.slug==='well'?[.46,1.055,.06]:[rr,.595,.19],q=new THREE.Vector3()
 for(let i=0;i<3;i++)q.setComponent(i,b.min.getComponent(i)+(p[i]-min[i])/(max[i]-min[i])*(b.max.getComponent(i)-b.min.getComponent(i)))
 return q.applyMatrix4(m.group.matrixWorld)
}
function cast(m,p,d,parts=m.group.children){const origin=authored(m,p),end=authored(m,p.map((v,i)=>v+d[i]));return new THREE.Raycaster(origin,end.sub(origin).normalize()).intersectObjects(parts)}
function inside(part,p){const hits=new THREE.Raycaster(p,new THREE.Vector3(.713,.121,.691).normalize()).intersectObject(part);return hits.filter((h,i)=>!i||h.distance-hits[i-1].distance>1e-6).length%2===1}
function joins(m,a,b,p,label){const q=authored(m,p);assert(named(m,a).some(part=>inside(part,q)),label+' first body');assert(named(m,b).some(part=>inside(part,q)),label+' joined body')}

test('Original water structures retain finite saved envelopes, cheap LODs and bounded palette batches',()=>{
 const costs=[]
 for(const slug of ['well','fountain'])for(const low of [false,true]){
  for(const dimensions of [[2,1.7,2.7],[.19,4.1,.16],[4.2,.17,2.8]]){
   const m=build(slug,{low,dimensions}),b=new THREE.Box3().setFromObject(m.group,true)
   assert(Math.abs(b.min.y)<1e-6&&Math.abs(b.max.y-dimensions[2])<1e-6,slug+' ground/height')
   assert(Math.abs(b.min.x+dimensions[0]/2)<1e-6&&Math.abs(b.max.x-dimensions[0]/2)<1e-6,slug+' width')
   assert(Math.abs(b.min.z+dimensions[1]/2)<1e-6&&Math.abs(b.max.z-dimensions[1]/2)<1e-6,slug+' depth')
   let triangles=0
   for(const part of m.group.children){for(const attr of ['position','normal','uv'])assert(part.geometry.attributes[attr]?.array.every(Number.isFinite),slug+' '+attr);triangles+=(part.geometry.index?.count??part.geometry.attributes.position.count)/3}
   assert(triangles<(low?3000:14000),slug+' triangle budget '+triangles)
   if(dimensions[0]===2)costs.push({slug,low,triangles,parts:m.group.children.length})
   batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g});assert(m.group.children.length<=8,slug+' bounded draw palettes')
   m.dispose()
  }
 }
 for(const slug of ['well','fountain'])assert(costs.find(v=>v.slug===slug&&v.low).triangles<costs.find(v=>v.slug===slug&&!v.low).triangles*.65)
 console.log(JSON.stringify({legacyWater:costs}))
})

test('Well has a real lined throat, connected roof and mechanical rope-to-bucket construction',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('well',{low,facing}),stone=['well-coping','well-masonry-course','well-throat-lining','well-foundation'].flatMap(name=>named(m,name))
  assert.equal(cast(m,[.18,.8,.05],[0,-1,0],stone).length,0,'well throat is an actual opening')
  assert(cast(m,[.39,.8,0],[0,-1,0],stone).length,'coping and facing remain solid outside opening')
  joins(m,'well-windlass-bearing','well-bearing-seat',[.44,.653,.02],'bearing has a supported lower seat')
  joins(m,'well-windlass-bearing','well-windlass',[.44,.705,.041],'bearing seats the drum axle')
  joins(m,'well-roof-tie','well-roof-post',[.44,.995,0],'cross tie seats on roof posts')
  joins(m,'well-roof-rafter','well-roof-slope',[.44,1.068,.335],'rafters support the roof slopes')
  joins(m,'well-crank-boss','well-crank',[-.55,.70,.004],'crank connects to axle boss')
  joins(m,'well-bucket-rope','well-bucket-bail',[0,.401,-.06],'rope reaches the bucket bail')
  joins(m,'well-bucket-bail','well-hollow-bucket',[.09,.306,-.06],'bail joins the actual bucket wall')
  joins(m,'well-bucket-band','well-hollow-bucket',[.0905,.292,-.06],'bucket band seats on wooden shell')
  const bucket=cast(m,[0,.36,-.06],[0,-1,0],named(m,'well-hollow-bucket'))
  assert(bucket.length&&bucket[0].point.y<authored(m,[0,.23,0]).y,'bucket has a recessed bottom below its mouth')
  m.dispose()
 }
})

test('Fountain bowls, pedestal and nozzle are joined and water has real rim spill channels',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('fountain',{low,facing})
  joins(m,'fountain-carved-pedestal','fountain-lower-bowl',[.10,.158,0],'pedestal foot joins lower bowl floor')
  joins(m,'fountain-carved-pedestal','fountain-upper-bowl',[.11,.592,0],'upper bowl seats on pedestal capital')
  joins(m,'fountain-jet-nozzle','fountain-upper-bowl',[.022,.655,0],'nozzle stem enters upper bowl floor')
  assert.equal(cast(m,[0,1,0],[0,-1,0],named(m,'fountain-jet-nozzle')).length,0,'nozzle has a real bore')
  const bowl=named(m,'fountain-upper-bowl')
  for(const a of [0,2*Math.PI/3,4*Math.PI/3]){
   const point=[Math.cos(a)*.32,.747,Math.sin(a)*.32],direction=[-Math.cos(a),0,-Math.sin(a)],hits=cast(m,point,direction,bowl)
   assert(!hits.length||hits[0].distance>authored(m,point).distanceTo(authored(m,[0,.747,0])),'spill notch exposes the water channel to the basin cavity')
  }
  const lower=cast(m,[.3,.7,0],[0,-1,0],named(m,'fountain-lower-bowl'))
  assert(lower.length&&lower[0].point.y<authored(m,[0,.20,0]).y,'lower basin has a recessed floor')
  m.dispose()
 }
})

test('Water stays below solid rims and outside masonry while optical surfaces remain shadow free',()=>{
 for(const slug of ['well','fountain'])for(const low of [false,true]){
  const m=build(slug,{low}),water=[...m.surfaces].filter(([,s])=>s.opacity!==undefined),stone=m.group.children.filter(p=>['well-throat-lining','well-coping','well-masonry-course','fountain-lower-bowl','fountain-upper-bowl'].includes(p.geometry.name))
  assert(water.length>0)
  for(const [part,s] of water){assert.equal(s.castShadow,false);assert(s.opacity>0&&s.opacity<1)}
  const pools=water.filter(([part])=>['well-recessed-water','fountain-lower-water','fountain-upper-water'].includes(part.geometry.name))
  for(const [part] of pools){const p=part.geometry.attributes.position;for(let i=0;i<p.count;i++){const point=new THREE.Vector3().fromBufferAttribute(p,i);assert(stone.every(wall=>!inside(wall,point)),slug+' pool never intersects masonry')}}
  if(slug==='well')assert(box(named(m,'well-recessed-water')[0]).max.y<box(named(m,'well-coping')[0]).max.y)
  else{assert(box(named(m,'fountain-lower-water')[0]).max.y<box(named(m,'fountain-lower-bowl')[0]).max.y);assert(box(named(m,'fountain-upper-water')[0]).max.y<box(named(m,'fountain-upper-bowl')[0]).max.y)}
  m.dispose()
 }
})
