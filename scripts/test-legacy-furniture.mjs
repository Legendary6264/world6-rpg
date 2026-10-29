import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import * as THREE from 'three'
import {legacyAssets} from '../src/legacyAssets.ts'
import {populateLegacyFurniture} from '../src/scene3dLegacyFurniture.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'

const owned=legacyAssets.filter(a=>a.group==='furniture'&&!a.native)
function build(slug,low=false,flags={},dimensions=[1.6,1,1.2]){
 const a=owned.find(a=>a.slug===slug);assert(a,slug+' is a legacy furniture asset')
 const group=new THREE.Group(),materials=new Map(),resources=new Set(),surfaces=new Set()
 const [width,depth,height]=dimensions,e={geometry:{kind:a.kind,artwork:a.id,width,depth,height,...flags}}
 assert(populateLegacyFurniture(e,(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.FrontSide});material.userData.paletteBatch=JSON.stringify([s,false,1]);materials.set(key,material)}
  const part=new THREE.Mesh(g,material);part.position.set(x,y,z);group.add(part);resources.add(g);surfaces.add(JSON.stringify(s));return part
 },low),slug+' is handled')
 group.updateMatrixWorld(true)
 return {a,group,materials,resources,surfaces,e,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const triangles=m=>m.group.children.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)
const ray=(m,origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(m.group,true)[0]
const named=(m,suffix)=>m.group.children.filter(p=>p.geometry.name.endsWith('-'+suffix))
const partBounds=(m,suffix)=>new THREE.Box3().setFromObject(named(m,suffix)[0],true)
const hash=m=>{const h=createHash('sha256');for(const p of m.group.children){h.update(Buffer.from(p.geometry.attributes.position.array.buffer));h.update(Buffer.from(p.geometry.index?.array.buffer??new ArrayBuffer(0)))}return h.digest('hex')}
function solid(p,checkNormals=true){
 const g=p.geometry,pos=g.attributes.position,normal=g.attributes.normal,index=g.index,count=index?.count??pos.count,edges=new Map();let volume=0
 const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e5)).join(',')
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(pos,j)),face=b.clone().sub(a).cross(c.clone().sub(a))
  if(face.lengthSq()<1e-19)continue
  volume+=a.dot(b.clone().cross(c))/6
  const n=new THREE.Vector3();ids.forEach(j=>n.add(new THREE.Vector3().fromBufferAttribute(normal,j)))
  if(checkNormals)assert(face.dot(n)>-1e-10,g.name+' winding and normals agree')
  const points=[a,b,c].map(key)
  for(let j=0;j<3;j++){const aa=points[j],bb=points[(j+1)%3];if(aa===bb)continue;const edge=aa<bb?aa+'|'+bb:bb+'|'+aa;edges.set(edge,(edges.get(edge)??0)+1)}
 }
 assert(volume>1e-10,g.name+' encloses positive volume')
 assert([...edges.values()].every(n=>n===2),g.name+' is a capped closed solid')
}

test('All old furniture models are finite, closed outward solids, grounded in their saved bounds with a cheaper low LOD',()=>{
 assert(owned.length>=60)
 let highTotal=0,lowTotal=0,max=0,maxId=''
 const signatures=new Set()
 for(const a of owned){
  let high=0
  for(const low of [false,true]){
   const m=build(a.slug,low),bounds=new THREE.Box3().setFromObject(m.group,true),g=m.e.geometry,n=triangles(m)
   assert(bounds.min.x>=-g.width/2-1e-5&&bounds.max.x<=g.width/2+1e-5,a.slug+' inside saved width')
   assert(bounds.min.z>=-g.depth/2-1e-5&&bounds.max.z<=g.depth/2+1e-5,a.slug+' inside saved depth')
   assert(Math.abs(bounds.min.y)<1e-5&&bounds.max.y<=g.height+1e-5,a.slug+' grounded inside saved height')
   assert(n<14000,a.slug+' triangle budget: '+n);assert(m.surfaces.size<=8,a.slug+' palette surface budget')
   for(const p of m.group.children){for(const attr of ['position','normal','uv'])assert(p.geometry.attributes[attr]?.array.every(Number.isFinite),p.geometry.name+' finite '+attr);solid(p)}
   if(low){assert(n<high*.65,a.slug+' low LOD is substantially cheaper');lowTotal+=n}
   else{high=n;highTotal+=n;if(n>max){max=n;maxId=a.slug}const signature=hash(m);assert(!signatures.has(signature),a.slug+' is a distinct geometric construction');signatures.add(signature)}
   m.dispose()
  }
 }
 console.log(JSON.stringify({models:owned.length,highTriangles:highTotal,lowTriangles:lowTotal,maxTriangles:max,maxModel:maxId}))
})

test('Unusual saved envelopes, open states, and palette batching retain the construction',()=>{
 for(const a of owned)for(const low of [false,true]){
  const m=build(a.slug,low,{open:true,locked:true,active:false},[.53,2.7,.41]),before=new THREE.Box3().setFromObject(m.group,true),n=m.group.children.length
  for(const p of m.group.children){for(const attr of ['position','normal','uv'])assert(p.geometry.attributes[attr].array.every(Number.isFinite),a.slug+' finite open pose '+attr);solid(p,false)}
  assert(before.min.y>=-1e-6&&before.max.y<=.410001&&before.min.x>=-.265001&&before.max.x<=.265001&&before.min.z>=-1.350001&&before.max.z<=1.350001,a.slug+' edited dimensions')
  batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g})
  const after=new THREE.Box3().setFromObject(m.group,true)
  assert(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6,a.slug+' batching keeps bounds')
  assert(m.group.children.length<=8&&m.group.children.length<n,a.slug+' palette batching reduces draw calls')
  m.dispose()
 }
})

test('Vessels, a basket, and the bath have actual deep cavities',()=>{
 for(const slug of ['jar','amphora','basket','bathtub'])for(const low of [false,true]){
  const m=build(slug,low),g=m.e.geometry,origin=[0,g.height+1,slug==='basket'?.1:0],hit=ray(m,origin,[0,-1,0])
  assert(hit,slug+' cavity has a bottom');assert(hit.point.y<g.height*.4,slug+' centre ray reaches the interior floor')
  assert.equal(hit.face.normal.y>0,true,slug+' interior floor faces upward')
  const side=ray(m,[g.width+1,g.height*.35,0],[-1,0,0]);assert(side,slug+' has a physical enclosing side')
  m.dispose()
 }
})

test('Crate lid and cage gate really open, locks have geometry, and cage bars have open space',()=>{
 for(const slug of ['crate','cage'])for(const low of [false,true]){
  const shut=build(slug,low),open=build(slug,low,{open:true}),locked=build(slug,low,{locked:true})
  assert.notEqual(hash(shut),hash(open),slug+' has a moved hinge pose')
  assert(named(locked,'lock-body').length===1,slug+' closed lock is visible');assert.equal(named(open,'lock-body').length,0)
  if(slug==='crate'){
   const a=ray(shut,[.03,2.2,.1],[0,-1,0]),b=ray(open,[.03,2.2,.1],[0,-1,0]);assert(a&&b&&b.point.y<a.point.y*.3,'Open crate centre ray reaches its bottom')
  }else{
   const gate=partBounds(shut,'gate-bar'),center=gate.getCenter(new THREE.Vector3()),a=ray(shut,[center.x,center.y,2],[0,0,-1]),b=ray(open,[center.x,center.y,2],[0,0,-1])
   assert(a?.object.geometry.name.endsWith('-gate-bar'),'Closed cage gate ray hits a real bar')
   assert(!b||b.point.z<a.point.z-.08,'Open cage exposes the interior')
   const gap=ray(shut,[.11,.62,2],[0,0,-1]);assert(!gap||gap.point.z<0,'Cage gaps are empty between front bars')
  }
  shut.dispose();open.dispose();locked.dispose()
 }
})

test('Furniture legs, frames, wheels and handles leave real negative space',()=>{
 for(const low of [false,true]){
  for(const slug of ['desk','workbench','sawhorse','tanning-frame','loom']){
   const m=build(slug,low),g=m.e.geometry,hit=ray(m,[0,g.height*.12,2],[0,0,-1]);assert(!hit,slug+' has an open lower frame');m.dispose()
  }
  for(const slug of ['cart','carriage','spinning-wheel','grindstone']){
   const m=build(slug,low);assert(m.group.children.some(p=>/wheel-spoke|grinding-stone/.test(p.geometry.name)),slug+' uses a constructed wheel or stone');m.dispose()
  }
  const basket=build('basket',low),bounds=partBounds(basket,'basket-handle'),middle=bounds.getCenter(new THREE.Vector3()),hit=ray(basket,[middle.x,bounds.max.y*.92,2],[0,0,-1]);assert(!hit,'Basket handle has a real empty hand opening');basket.dispose()
 }
})

test('Doors, drawers, lids, mouths and locks leave every stationary body vertex unchanged',()=>{
 const bodies={desk:['leg','drawer-case-side'],cabinet:['case-side','case-foot'],wardrobe:['case-side','case-foot'],crate:['floor-board','corner-cleat'],sack:['sack-body'],cage:['cage-tray','cage-bar'],kiln:['hearth','kiln-dome'],'bread-oven':['hearth','oven-dome'],smokehouse:['house-side','floor-board'],'chicken-coop':['house-side','leg'],carriage:['carriage-chassis','coach-pillar']}
 for(const [slug,suffixes] of Object.entries(bodies))for(const low of [false,true]){
  const base=build(slug,low)
  for(const flags of [{open:true},{locked:true},{open:true,locked:true}]){
   const changed=build(slug,low,flags)
   for(const suffix of suffixes){
    const a=named(base,suffix),b=named(changed,suffix);assert(a.length&&a.length===b.length,slug+' stationary '+suffix+' parts')
    for(let i=0;i<a.length;i++)for(const attr of ['position','normal']){
     const x=a[i].geometry.attributes[attr].array,y=b[i].geometry.attributes[attr].array
     assert(x.length===y.length&&x.every((v,j)=>v===y[j]),slug+' '+suffix+' '+attr+' stays exactly fixed across '+JSON.stringify(flags))
    }
   }
   changed.dispose()
  }
  base.dispose()
 }
})

test('Extinguishing fire or disabling equipment keeps the housing geometry fixed',()=>{
 for(const [slug,suffix] of [['forge','hood-flue'],['smokehouse','house-side'],['still','copper-boiler'],['kiln','hearth'],['bread-oven','oven-dome']])for(const low of [false,true]){
  const lit=build(slug,low,{active:true}),off=build(slug,low,{active:false}),a=named(lit,suffix),b=named(off,suffix)
  assert(a.length&&a.length===b.length,slug+' fixed housing is present')
  for(let i=0;i<a.length;i++){const x=a[i].geometry.attributes.position.array,y=b[i].geometry.attributes.position.array;assert(x.length===y.length&&x.every((v,j)=>v===y[j]),slug+' body does not rescale when disabled')}
  lit.dispose();off.dispose()
 }
})

test('Dispatch rejects native catalog assets, wrong legacy kinds, and unrelated legacy groups without emitting parts',()=>{
 for(const geometry of [{asset:'chair',kind:'platform'},{kind:'rock',artwork:'expanded-object-jar'},{kind:'tree',artwork:'expanded-object-oak'},{kind:'platform',artwork:'expanded-object-table'},{kind:'crate'}]){
  let calls=0;assert.equal(populateLegacyFurniture({geometry},()=>{calls++}),false);assert.equal(calls,0)
 }
})
