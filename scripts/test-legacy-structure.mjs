import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {populateLegacyStructure} from '../src/scene3dLegacyStructure.ts'
import {legacyAssets} from '../src/legacyAssets.ts'
import {modelEmission} from '../src/scene3dEmitters.ts'

const owned=legacyAssets.filter(a=>a.group==='structure'&&!a.native)
const reserved=new Set('iron-door arched-door gate portcullis sluice-gate shutters road-barrier trapdoor trap-grate drawbridge-machine campfire torch street-lamp hanging-lantern signal-lantern'.split(' '))
const withinSavedBounds=(m)=>{
 const b=new THREE.Box3().setFromObject(m.group,true),{width:w,depth:d,height:h}=m.geometry,id=m.a.slug
 assert(b.min.x>=-w/2-1e-6&&b.max.x<=w/2+1e-6,id+' width contains complete state')
 assert(b.min.z>=-d/2-1e-6&&b.max.z<=d/2+1e-6,id+' depth contains complete state')
 assert(b.min.y>=-1e-6&&b.max.y<=h+1e-6,id+' height contains complete state')
 return b
}
function build(slug,low=false,flags={},dimensions=[2,1,3]){
 const a=owned.find(a=>a.slug===slug);assert(a,slug+' owned asset')
 const [width,depth,height]=dimensions,geometry={kind:a.kind,artwork:a.id,width,depth,height,...flags},group=new THREE.Group(),resources=new Set(),materials=new Map(),surfaces=new Map()
 assert(populateLegacyStructure({geometry},(g,c,x,y,z,s={})=>{
  const key=JSON.stringify([c,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color:c,side:THREE.FrontSide,...(s.emissive?{emissive:s.emissive,emissiveIntensity:1}:{})});material.userData.lightEmitter=!!s.emissive;materials.set(key,material)}
  const part=new THREE.Mesh(g,material);part.position.set(x,y,z);part.castShadow=s.castShadow!==false;group.add(part);resources.add(g);surfaces.set(JSON.stringify(s),s);return part
 },low),slug+' handled');group.updateMatrixWorld(true)
 return {a,geometry,group,materials,surfaces,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const ray=(m,origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(m.group,true)[0]
function validateSolid(part){
 const g=part.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,index=g.index,count=index?.count??p.count,edges=new Map();let volume=0
 assert(p.array.every(Number.isFinite),g.name+' finite positions');assert(n?.array.every(Number.isFinite),g.name+' finite normals');assert(uv?.array.every(Number.isFinite),g.name+' finite UVs')
 const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e6)).join(',')
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),normal=b.clone().sub(a).cross(c.clone().sub(a))
  if(normal.lengthSq()<1e-19)continue
  volume+=a.dot(b.clone().cross(c))/6
  const average=new THREE.Vector3();ids.forEach(j=>average.add(new THREE.Vector3().fromBufferAttribute(n,j)))
  assert(normal.dot(average)>-1e-10,g.name+' normals agree with outward winding')
  const points=[a,b,c].map(key)
  for(let j=0;j<3;j++){const x=points[j],y=points[(j+1)%3];if(x===y)continue;const edge=x<y?x+'|'+y:y+'|'+x;edges.set(edge,(edges.get(edge)??0)+1)}
 }
 assert(volume>1e-10,g.name+' has outward winding and positive enclosed volume: '+volume)
 assert([...edges.values()].every(n=>n===2),g.name+' has closed edges')
 return count/3
}

test('Every nonnative original structure has detailed, closed finite geometry at arbitrary saved dimensions',()=>{
 assert.equal(owned.length,53)
 for(const a of owned){
  const stats=[]
  for(const low of [false,true]){
   const m=build(a.slug,low),b=withinSavedBounds(m),{width:w,depth:d,height:h}=m.geometry
   if(!reserved.has(a.slug)){
    assert(Math.abs(b.min.x+w/2)<1e-6&&Math.abs(b.max.x-w/2)<1e-6,a.slug+' saved width')
    assert(Math.abs(b.min.z+d/2)<1e-6&&Math.abs(b.max.z-d/2)<1e-6,a.slug+' saved depth')
    assert(Math.abs(b.min.y)<1e-6&&Math.abs(b.max.y-h)<1e-6,a.slug+' grounded saved height')
   }else assert(b.min.y<h*.003,a.slug+' reserved state remains grounded')
   let triangles=0
   for(const part of m.group.children)triangles+=validateSolid(part)
   assert(triangles<16000,a.slug+' triangle budget: '+triangles)
   assert(m.surfaces.size<=8,a.slug+' surface option budget: '+m.surfaces.size)
   stats.push(triangles);m.dispose()
   for(const dimensions of [[.35,4.8,.14],[5.6,.12,3.8]])for(const flags of [{open:true,active:true},{open:false,active:false}]){
    const unusual=build(a.slug,low,flags,dimensions),bounds=withinSavedBounds(unusual),size=bounds.getSize(new THREE.Vector3())
    if(!reserved.has(a.slug))assert(size.distanceTo(new THREE.Vector3(dimensions[0],dimensions[2],dimensions[1]))<2e-6,a.slug+' complete assembly fits arbitrary dimensions')
    assert(bounds.min.y<dimensions[2]*.003,a.slug+' complete assembly meets ground')
    for(const part of unusual.group.children){assert(part.geometry.attributes.position.array.every(Number.isFinite));assert(part.geometry.attributes.normal.array.every(Number.isFinite));assert(part.geometry.attributes.uv.array.every(Number.isFinite))}
    unusual.dispose()
   }
  }
  assert(stats[1]<=stats[0],a.slug+' low detail is cheaper')
 }
})

test('Only legacy nonnative structure artwork is claimed',()=>{
 for(const geometry of [{kind:'wall',width:1,depth:1,height:1},{kind:'wall',artwork:'expanded-object-stone-wall',width:1,depth:1,height:1},{kind:'wall',artwork:'expanded-object-brick-wall',asset:'stone-wall',width:1,depth:1,height:1},{kind:'tree',artwork:'expanded-object-brick-wall',width:1,depth:1,height:1},{kind:'rock',artwork:'expanded-object-amethyst',width:1,depth:1,height:1}]){
  let calls=0;assert.equal(populateLegacyStructure({geometry},()=>{calls++}),false);assert.equal(calls,0)
 }
})

test('Opened doors, gates, windows and hatches expose real unobstructed passages',()=>{
 for(const low of [false,true]){
  for(const slug of ['iron-door','arched-door','gate','portcullis','sluice-gate','shutters','road-barrier']){
   const closed=build(slug,low,{},[1,1,1]),opened=build(slug,low,{open:true},[1,1,1])
   // Raised portcullises and sluices keep their lifting mechanism overhead;
   // the ray crosses the lower opening at an offset away from grille gaps.
   const x=slug==='road-barrier'?0:.085,y=slug==='road-barrier'?.40:slug==='portcullis'?.18:slug==='sluice-gate'?.22:.40
   assert(ray(closed,[x,y,2],[0,0,-1]),slug+' closed surface intercepts passage')
   assert.equal(ray(opened,[x,y,2],[0,0,-1]),undefined,slug+' open passage')
   closed.dispose();opened.dispose()
  }
  for(const slug of ['trapdoor','trap-grate','drawbridge-machine']){
   const closed=build(slug,low,{},[1,1,1]),opened=build(slug,low,{open:true},[1,1,1])
   assert(ray(closed,[.115,2,0],[0,-1,0]),slug+' closed deck intercepts passage')
   assert.equal(ray(opened,[.115,2,0],[0,-1,0]),undefined,slug+' raised leaf leaves a real vertical opening')
   closed.dispose();opened.dispose()
  }
  const arch=build('archway',low);assert.equal(ray(arch,[0,1.1,2],[0,0,-1]),undefined,'archway has a masonry opening');arch.dispose()
 }
})


test('Changing a door or lamp state preserves every fixed frame and body coordinate',()=>{
 const moving={
  'iron-door':['iron-door-jamb','iron-door-lintel'],
  'arched-door':['arched-door-frame-pier-course','arched-door-frame-voussoir'],
  gate:['gate-stone-pier','gate-pier-cap'],
  portcullis:['portcullis-pier','portcullis-guide','portcullis-crosshead','portcullis-upper-guide-tower','portcullis-hoist-crosshead'],
  'sluice-gate':['sluice-gate-pier','sluice-gate-guide','sluice-gate-crosshead'],
  shutters:['shutter-window-jamb','shutter-window-sill'],
  'road-barrier':['road-barrier-pier','road-barrier-cap','road-barrier-pivot'],
  trapdoor:['trapdoor-frame-side','trapdoor-frame-end','trapdoor-hinge'],
  'trap-grate':['trap-grate-frame-side','trap-grate-frame-end','trap-grate-hinge'],
  'drawbridge-machine':['drawbridge-winch-post','drawbridge-ground-sill','drawbridge-winch-drum'],
 }
 const lights={
  campfire:['campfire-stone-ring','campfire-log','campfire-charcoal-bed'],
  torch:['torch-foot','torch-shaft','torch-iron-basket','torch-basket-prong'],
  'street-lamp':['street-lamp-foot','street-lamp-column','street-lamp-base','street-lamp-glass'],
  'hanging-lantern':['hanging-lantern-base','hanging-lantern-cap','hanging-lantern-glass','hanging-lantern-chain'],
  'signal-lantern':['signal-lantern-tripod-leg','signal-lantern-base','signal-lantern-glass'],
 }
 for(const low of [false,true])for(const dimensions of [[2,1.4,2.5],[.5,3.1,.4]])for(const [slug,names] of Object.entries({...moving,...lights})){
  const isMoving=slug in moving,before=build(slug,low,isMoving?{open:false}:{active:false},dimensions),after=build(slug,low,isMoving?{open:true}:{active:true},dimensions)
  withinSavedBounds(before);withinSavedBounds(after)
  for(const name of names){
   const a=before.group.children.filter(p=>p.geometry.name===name),b=after.group.children.filter(p=>p.geometry.name===name)
   assert(a.length>0,name+' exists');assert.equal(a.length,b.length,name+' fixed part count')
   for(let i=0;i<a.length;i++){
    const p=a[i].geometry.attributes.position.array,q=b[i].geometry.attributes.position.array
    assert.equal(p.length,q.length,name+' fixed topology')
    assert(p.every((v,j)=>Math.abs(v-q[j])<1e-7),name+' stays exactly in place across states')
   }
  }
  before.dispose();after.dispose()
 }
 for(const low of [false,true])for(const slug of ['trapdoor','trap-grate']){
  const closed=build(slug,low,{open:false},[1.4,1.4,1.2]),opened=build(slug,low,{open:true},[1.4,1.4,1.2]),closedBounds=withinSavedBounds(closed),openBounds=withinSavedBounds(opened)
  assert(closedBounds.max.y<.2,'closed hatch remains a low slab')
  assert(openBounds.max.y>1.15,'open lid uses the reserved height')
  const frame=closed.group.children.filter(p=>p.geometry.name.startsWith(slug+'-frame-'))
  const bounds=new THREE.Box3();frame.forEach(p=>bounds.union(p.geometry.boundingBox))
  assert(bounds.max.y<.14,'hatch frame remains near the floor')
  closed.dispose();opened.dispose()
 }
})

test('Inactive lanterns and fires have no emitter and all optical parts remain shadow free',()=>{
 for(const slug of ['campfire','torch','street-lamp','hanging-lantern','signal-lantern'])for(const low of [false,true]){
  const active=build(slug,low,{active:true}),inactive=build(slug,low,{active:false}),emission=modelEmission(active.group)
  assert(emission,slug+' active emitter exists');assert(emission.position.toArray().every(Number.isFinite));assert(emission.radius>0)
  assert.equal(modelEmission(inactive.group),undefined,slug+' inactive has no optical emission')
  assert([...inactive.surfaces.values()].every(s=>!s.emissive),slug+' inactive options omit emissive')
  for(const p of active.group.children)if(p.material.userData.lightEmitter||p.geometry.name.includes('-glass'))assert.equal(p.castShadow,false,slug+' optical part does not block its own light')
  const b=new THREE.Box3().setFromObject(active.group,true);assert(b.containsPoint(emission.position),slug+' light anchor lies inside completed model')
  active.dispose();inactive.dispose()
 }
})

test('Vessels, boat seating, the bird entry and the bell mouth are actual cavities',()=>{
 for(const low of [false,true]){
  for(const slug of ['dye-vat','brewing-vat','well','fountain']){
   const m=build(slug,low,{},[1,1,1]),liquid=m.group.children.find(p=>p.geometry.name.includes('water')||p.geometry.name.includes('liquid'))
   assert(liquid,slug+' water is geometry');liquid.geometry.computeBoundingBox()
   const waterBox=liquid.geometry.boundingBox,top=new THREE.Box3().setFromObject(m.group,true).max.y
   assert(waterBox.max.y<top-.05,slug+' water stays within its hollow vessel')
   if(slug==='well'){
    // A joined roof may correctly cover this vertical ray. Test the throat
    // itself so a valid roof cannot be mistaken for a filled masonry opening.
    const masonry=m.group.children.filter(p=>/^well-(foundation|throat-lining|masonry-course|coping)$/.test(p.geometry.name))
    assert(masonry.length>3,'well has a lined masonry throat')
    const hits=new THREE.Raycaster(new THREE.Vector3(.10,2,0),new THREE.Vector3(0,-1,0)).intersectObjects(masonry)
    assert(hits.every(hit=>hit.point.y<=waterBox.max.y+1e-6),'well masonry leaves an opening down to recessed water')
   }else{const hit=ray(m,[slug==='fountain'?.34:.10,2,0],[0,-1,0]);assert(hit&&hit.point.y<.95,slug+' central recess is physically below the rim')}
   m.dispose()
  }
  const house=build('birdhouse',low,{},[1,1,1]),front=house.group.children.find(p=>p.geometry.name==='birdhouse-front-with-open-entry')
  front.geometry.computeBoundingBox();const b=front.geometry.boundingBox,center=b.getCenter(new THREE.Vector3()),height=b.max.y-b.min.y,entryY=b.min.y+height*(.82-.63)/(1.08-.63)
  const cast=new THREE.Raycaster(new THREE.Vector3(center.x,entryY,2),new THREE.Vector3(0,0,-1));assert.equal(cast.intersectObject(front).length,0,'birdhouse circular entry is an actual hole');house.dispose()
  const boat=build('boat',low,{},[1,1,1]),hull=boat.group.children.find(p=>p.geometry.name==='boat-hollow-hull'),hit=new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0)).intersectObject(hull)[0]
  assert(hit&&hit.point.y<.35,'boat has a deep interior floor');boat.dispose()
  const bell=build('bell',low,{},[1,1,1]),body=bell.group.children.find(p=>p.geometry.name==='bell-hollow-bronze-body'),mouth=new THREE.Raycaster(new THREE.Vector3(.10,-1,0),new THREE.Vector3(0,1,0)).intersectObject(body)[0]
  assert(mouth&&mouth.point.y>.5,'bell mouth opens onto the recessed interior crown');bell.dispose()
 }
})
