import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'

const require=createRequire(import.meta.url),{load}=require('./generate-tabletop-thumbnails.cjs')
const {populateEntityModel}=load('scene3dMeshes'),{legacyAssets}=load('legacyAssets'),{createEnvironmentObject}=load('sceneEditorPlacement'),{modelEmission}=load('scene3dEmitters')
const slugs=['campfire','torch','street-lamp','hanging-lantern','signal-lantern']
function build(slug,{low=false,active=true,facing=0,dimensions=[1.7,1.3,2.5]}={}){
 const asset=legacyAssets.find(a=>a.slug===slug),object=createEnvironmentObject(asset.kind,asset.id,slug,{x:6,y:7,z:1.25},facing)
 Object.assign(object,{width:dimensions[0],depth:dimensions[1],height:dimensions[2],active})
 const group=new THREE.Group(),materials=new Map(),surfaces=new Map(),resources=new Set()
 populateEntityModel({id:slug,geometry:object,appearance:{color:'#8b6443',heightKnown:true,remembered:false}},(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,transparent:(s.opacity??1)<1,opacity:s.opacity??1,...(s.emissive?{emissive:s.emissive,emissiveIntensity:1}:{})});material.userData.lightEmitter=!!s.emissive;materials.set(key,material)}
  const p=new THREE.Mesh(g,material);p.position.set(x,y,z);p.castShadow=s.castShadow!==false;p.userData.surface=s;group.add(p);resources.add(g);surfaces.set(JSON.stringify(s),s);return p
 },low)
 group.rotation.y=-facing*Math.PI/180;group.updateMatrixWorld(true)
 return {slug,object,group,materials,surfaces,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const named=(m,name)=>m.group.children.filter(p=>p.geometry.name===name)
const count=m=>m.group.children.reduce((sum,p)=>sum+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)
function distinctHits(hits){return hits.filter((h,i)=>!i||h.distance-hits[i-1].distance>1e-6)}
function bounds(m){
 const b=new THREE.Box3().setFromObject(m.group,true),o=m.object
 assert(b.min.x>=-o.width/2-2e-6&&b.max.x<=o.width/2+2e-6,m.slug+' saved width')
 assert(b.min.z>=-o.depth/2-2e-6&&b.max.z<=o.depth/2+2e-6,m.slug+' saved depth')
 assert(b.min.y>=-2e-6&&b.max.y<=o.height+2e-6,m.slug+' saved height')
 assert(b.min.y<o.height*.003,m.slug+' grounded envelope')
 return b
}

test('Five old lights retain finite saved envelopes, fixed opaque bodies and bounded LOD costs',()=>{
 const stats=[]
 for(const slug of slugs){
  const costs=[]
  for(const low of [false,true])for(const facing of [0,90,180,270])for(const dimensions of [[1.7,1.3,2.5],[.35,4.8,.14],[5.6,.12,3.8]]){
   const on=build(slug,{low,facing,dimensions}),off=build(slug,{low,facing,dimensions,active:false})
   bounds(on);bounds(off)
   assert(count(on)<16000,slug+' triangle ceiling');assert(on.surfaces.size<=8,slug+' surface ceiling')
   for(const p of on.group.children)for(const attribute of ['position','normal','uv'])assert(p.geometry.attributes[attribute]?.array.every(Number.isFinite),slug+' finite '+attribute)
   const fixed=on.group.children.filter(p=>!p.material.userData.lightEmitter)
   for(const p of fixed){
    const peers=named(off,p.geometry.name),index=named(on,p.geometry.name).indexOf(p),q=peers[index]
    assert(q,p.geometry.name+' retained while off');assert.equal(p.geometry.attributes.position.count,q.geometry.attributes.position.count)
    assert(p.geometry.attributes.position.array.every((v,i)=>Math.abs(v-q.geometry.attributes.position.array[i])<1e-7),p.geometry.name+' stationary when extinguished')
   }
   assert.equal(modelEmission(off.group),undefined,slug+' off state has no emitter')
   if(facing===0&&dimensions[0]===1.7){costs.push(count(on));stats.push({slug,low,triangles:count(on),parts:on.group.children.length})}
   on.dispose();off.dispose()
  }
  assert(costs[1]<costs[0],slug+' cheaper low LOD')
 }
 console.log(JSON.stringify({legacyLightFixtures:stats}))
})

test('Real fire anchors are outside every opaque solid and retain an open horizontal light path',()=>{
 for(const slug of slugs)for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build(slug,{low,facing}),emission=modelEmission(m.group)
  assert(emission,slug+' real emissive geometry');assert(emission.radius>0)
  const source=m.group.localToWorld(emission.position.clone()),opaque=m.group.children.filter(p=>p.castShadow&&!p.material.userData.lightEmitter)
  // A double-sided ray from inside a closed solid crosses an odd number of
  // surfaces. This catches a source trapped in a solid basket or glass block.
  for(const p of opaque){
   const hits=distinctHits(new THREE.Raycaster(source,new THREE.Vector3(.713,.113,.692).normalize()).intersectObject(p))
   assert.equal(hits.length%2,0,slug+' light anchor is outside opaque '+p.geometry.name)
  }
  let clear=0
  for(let i=0;i<16;i++){
   const a=(i+.35)*Math.PI/8,ray=new THREE.Raycaster(source,new THREE.Vector3(Math.cos(a),0,Math.sin(a)))
   if(!ray.intersectObjects(opaque).length)clear++
  }
  assert(clear>=8,slug+' has exposed light paths rather than a solid opaque housing: '+clear)
  for(const p of m.group.children)if(p.material.userData.lightEmitter||p.geometry.name.endsWith('-glass'))assert.equal(p.castShadow,false,slug+' optical parts do not cast opaque shadows')
  m.dispose()
 }
})

test('Old lanterns contain four thin panes around a real cavity and a hollow metal roof',()=>{
 for(const slug of ['street-lamp','hanging-lantern','signal-lantern'])for(const low of [false,true]){
  const m=build(slug,{low,dimensions:[1,1,1]}),panes=named(m,slug+'-glass'),hood=named(m,slug+'-hood')[0]
  assert.equal(panes.length,4,slug+' separate glass panes')
  const g=new THREE.Box3();for(const p of panes){p.geometry.computeBoundingBox();g.union(p.geometry.boundingBox)}
  const center=g.getCenter(new THREE.Vector3())
  for(const p of panes){
   const b=p.geometry.boundingBox,s=b.getSize(new THREE.Vector3());assert(Math.min(s.x,s.y,s.z)<Math.max(s.x,s.y,s.z)*.05,slug+' physical pane thickness')
   assert(!b.containsPoint(center),slug+' empty optical cavity between panes')
   assert(p.material.opacity<.5,slug+' transmissive-looking glass');assert.equal(p.castShadow,false)
  }
  // Offset from the central chimney aperture to hit the sloping inner roof.
  hood.geometry.computeBoundingBox();const b=hood.geometry.boundingBox,origin=new THREE.Vector3((b.min.x+b.max.x)/2+(b.max.x-b.min.x)*.1,b.min.y-.1,(b.min.z+b.max.z)/2),hit=new THREE.Raycaster(origin,new THREE.Vector3(0,1,0)).intersectObject(hood)[0]
  assert(hit&&hit.point.y>b.min.y+(b.max.y-b.min.y)*.8,slug+' roof underside rises into a genuine recess')
  assert(named(m,slug+'-burner').length===1);assert(named(m,slug+'-wick-collar').length===1)
  m.dispose()
 }
})

test('Torch basket is hollow below the flame and hanging chain keeps every interlocked link at low LOD',()=>{
 for(const low of [false,true]){
  const torch=build('torch',{low,active:false,dimensions:[1,1,1]}),bowl=named(torch,'torch-iron-basket')[0]
  bowl.geometry.computeBoundingBox();const b=bowl.geometry.boundingBox,top=b.max.y,hit=new THREE.Raycaster(new THREE.Vector3(0,top+.2,0),new THREE.Vector3(0,-1,0)).intersectObject(bowl)[0]
  assert(hit&&hit.point.y<top-(b.max.y-b.min.y)*.55,'basket opens onto a recessed fuel bowl')
  assert.equal(named(torch,'torch-basket-prong').length,6);torch.dispose()
  const lantern=build('hanging-lantern',{low});assert.equal(named(lantern,'hanging-lantern-chain').length,5,'complete five-link suspension')
  const links=named(lantern,'hanging-lantern-chain').map(p=>new THREE.Box3().setFromObject(p))
  for(let i=1;i<links.length;i++)assert(links[i-1].intersectsBox(links[i]),'neighboring suspension links overlap physically')
  lantern.dispose()
 }
})
