import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createSceneBackdrop} from '../src/scene3dBackdrop.ts'
import {defaultLightTuning,lightDirection} from '../src/scene3dViewSettings.ts'

const frame={id:'backdrop-test',width:30,depth:20,groundZ:3,minZ:-4,maxZ:15,view:'top',palette:'forest'}
function build(environment='surface',mode='day',restricted=false,quality='balanced',f=frame){return createSceneBackdrop(f,environment,mode,defaultLightTuning(mode),restricted,quality)}
const named=(b,name)=>b.group.getObjectByName(name)
function bounds(object){object.updateWorldMatrix(true,false);return new THREE.Box3().setFromObject(object,true)}

test('Surrounding grass/slate is real shadow-receiving geometry below the map, with a bounded draw cost',()=>{
 for(const environment of ['surface','underground'])for(const quality of ['low','balanced','high']){
  const b=build(environment,'day',false,quality),ground=named(b,'backdrop-ground'),earth=named(b,'backdrop-earth')
  assert(ground?.isMesh&&earth?.isMesh);assert(ground.material.isMeshStandardMaterial);assert(ground.receiveShadow&&earth.receiveShadow)
  const gb=bounds(ground),eb=bounds(earth)
  assert(gb.min.x<0&&gb.max.x>frame.width&&gb.min.z<0&&gb.max.z>frame.depth,'stage extends around the playable map')
  assert(Math.abs(gb.min.y-(frame.groundZ-.04))<1e-7&&Math.abs(gb.max.y-gb.min.y)<1e-7,'grass cannot cover the authored floor')
  assert(eb.max.y<gb.min.y&&eb.min.y<eb.max.y,'earth body stays below the surface')
  const ray=new THREE.Raycaster(new THREE.Vector3(-2,frame.groundZ+2,frame.depth/2),new THREE.Vector3(0,-1,0)),hits=[]
  THREE.Mesh.prototype.raycast.call(ground,ray,hits)
  assert.equal(hits.length,1);assert(Math.abs(hits[0].point.y-(frame.groundZ-.04))<1e-7)
  assert.equal(ray.intersectObjects(b.group.children).length,0,'decoration never captures editor pointing')
  let triangles=0;b.group.traverse(o=>{if(o.isMesh){const g=o.geometry;triangles+=(g.index?.count??g.attributes.position.count)/3;for(const a of Object.values(g.attributes))assert(a.array.every(Number.isFinite));assert(!o.userData.selection)}})
  assert(b.group.children.length<=3&&triangles<1000,'background stays inexpensive in every quality')
  b.dispose()
 }
})

test('A personal map has atmosphere only: no inferred terrain outside disclosed areas',()=>{
 const source=structuredClone(frame),snapshot=JSON.stringify(source)
 for(const environment of ['surface','underground']){
  const b=build(environment,'night',true,'balanced',source)
  assert.equal(b.group.children.length,1);assert.equal(b.group.children[0].name,'backdrop-sky')
  assert(!named(b,'backdrop-earth')&&!named(b,'backdrop-ground'))
  assert.equal(new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,1,0)).intersectObjects(b.group.children).length,0)
  b.dispose()
 }
 assert.equal(JSON.stringify(source),snapshot,'presentation does not mutate the disclosed map frame')
})

test('Day/night celestial body tracks the lighting compass; underground always remains a cave',()=>{
 for(const environment of ['surface','underground']){
  const b=build(environment),sky=named(b,'backdrop-sky'),uniforms=sky.material.uniforms,dayColors=[b.background,b.fogColor]
  const tuning={...defaultLightTuning('night'),azimuth:120,elevation:21,sun:.7}
  b.configure('night',tuning)
  assert.equal(uniforms.night.value,1);assert.equal(uniforms.cavern.value,environment==='underground'?1:0)
  assert(uniforms.celestialDirection.value.distanceTo(new THREE.Vector3().copy(lightDirection(tuning)))<1e-12)
  assert.equal(uniforms.celestialPower.value,.7)
  if(environment==='surface'){assert.notDeepEqual([b.background,b.fogColor],dayColors);assert(!uniforms.zenith.value.equals(uniforms.horizon.value))}
  else assert.deepEqual([b.background,b.fogColor],dayColors,'night does not turn a cavern into outdoor sky')
  assert(sky.material.toneMapped===false&&sky.material.depthWrite===false&&!sky.castShadow&&!sky.receiveShadow)
  b.configure('day',{...defaultLightTuning('day'),sun:0});assert.equal(uniforms.celestialPower.value,0)
  b.dispose()
 }
})

test('Atmosphere follows camera translation, covers both projections inside the far plane and releases resources once',()=>{
 for(const camera of [new THREE.PerspectiveCamera(46,1,.05,500),new THREE.OrthographicCamera(-150,150,100,-100,.05,500)]){
  const b=build(),sky=named(b,'backdrop-sky'),resources=new Set()
  b.group.traverse(o=>{if(o.isMesh){resources.add(o.geometry);resources.add(o.material)}})
  let releases=0;resources.forEach(r=>r.addEventListener('dispose',()=>releases++))
  camera.position.set(70,83,-12);b.update(camera)
  assert(sky.position.equals(camera.position));assert(sky.scale.x<camera.far&&sky.scale.x>camera.far*.8);assert(sky.rotation.x===0&&sky.rotation.y===0&&sky.rotation.z===0)
  camera.position.set(-91,2,184);b.update(camera);assert(sky.position.equals(camera.position));assert.equal(releases,0)
  const scene=new THREE.Scene();scene.add(b.group);b.dispose();assert.equal(b.group.parent,null);assert.equal(releases,resources.size)
  b.dispose();assert.equal(releases,resources.size,'repeated cleanup cannot double-dispose shared resources')
 }
})
