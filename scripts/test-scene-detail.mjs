import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {populateCraftedEntity} from '../src/scene3dCrafted.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'
import {createSceneLighting,createLightingEnvironment} from '../src/scene3dLighting.ts'

function build(kind,w,d,h,open=false){
 const group=new THREE.Group(),materials=new Map(),resources=new Set()
 const entity={id:'detail:'+kind,geometry:{kind,width:w,depth:d,height:h,open},appearance:{remembered:false}}
 populateCraftedEntity(entity,(geometry,color,x,y,z,options={})=>{
  const key=JSON.stringify([color,options]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,roughness:options.roughness??.85,metalness:options.metalness??0,transparent:options.opacity<1,opacity:options.opacity??1,side:THREE.DoubleSide});material.userData.lightEmitter=!!options.emissive;materials.set(key,material)}
  resources.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh);return mesh
 })
 return {group,resources,dispose(){resources.forEach(r=>r.dispose());materials.forEach(m=>m.dispose())}}
}
test('Детальная геометрия: нормальные и узкие габариты, конечные вершины, открытая дверь',()=>{
 for(const kind of ['wall','door','crate','platform','lamp'])for(const [w,d,h] of [[2,2,2],[1.5,1.1,1.1],[2,.35,3.6],[.65,.65,2.8],[.3,.1,.2]]){
  const model=build(kind,w,d,h),bounds=new THREE.Box3().setFromObject(model.group,true),epsilon=.002
  assert(bounds.min.x>=-w/2-epsilon&&bounds.max.x<=w/2+epsilon,`${kind} ${w},${d},${h} width`)
  assert(bounds.min.z>=-d/2-epsilon&&bounds.max.z<=d/2+epsilon,`${kind} depth`)
  assert(bounds.min.y>=-epsilon&&bounds.max.y<=h+epsilon,`${kind} height`)
  model.group.traverse(p=>{if(p.isMesh)assert(p.geometry.getAttribute('position').array.every(Number.isFinite))})
  model.dispose()
 }
 for(const open of [false,true]){
  const door=build('door',2,.35,3.6,open);door.group.updateMatrixWorld(true)
  const ray=new THREE.Raycaster(new THREE.Vector3(0,1,2),new THREE.Vector3(0,0,-1))
  assert.equal(ray.intersectObject(door.group,true).length>0,!open,'The opened leaf clears the central opening')
  door.dispose()
 }
})
test('Объединение деталей сохраняет силуэт и материал, сокращает число мешей, стекло пропускает свет',()=>{
 for(const kind of ['wall','door','crate','platform','lamp']){
  const model=build(kind,2,2,2),before=new THREE.Box3().setFromObject(model.group,true),parts=model.group.children.length
  const old=new Set(model.resources);let released=0
  old.forEach(g=>g.addEventListener('dispose',()=>released++))
  batchEntityParts(model.group,g=>{model.resources.delete(g);g.dispose()},g=>{model.resources.add(g);return g})
  const after=new THREE.Box3().setFromObject(model.group,true)
  assert(before.min.distanceTo(after.min)<.00001&&before.max.distanceTo(after.max)<.00001,kind+' silhouette')
  assert.equal(released,old.size);assert(model.group.children.length<parts);assert(model.group.children.length<=16,kind+' draw call budget')
  if(kind==='lamp')assert(model.group.children.filter(m=>m.material.transparent||m.material.userData.lightEmitter).every(m=>!m.castShadow),'Glass/emitter must not black out the point light')
  model.dispose()
 }
})
const frame={width:14,depth:12,groundZ:0},lamp={geometry:{width:.65,depth:.65,height:2.8},appearance:{remembered:false}}
test('Освещение: ночные локальные источники, бюджет теней, движение фонаря и приватность',()=>{
 const night=createSceneLighting(frame,'night','balanced',false),camera=new THREE.PerspectiveCamera();camera.position.set(7,4,11)
 const anchors=Array.from({length:4},(_,i)=>{const g=new THREE.Group();g.position.x=i*4;night.addLamp(lamp,g);return g})
 night.update(camera,new THREE.Vector3(7,1,5))
 const lamps=anchors.flatMap(g=>g.children.filter(c=>c.isPointLight))
 assert.equal(lamps.length,4);assert.equal(lamps.filter(l=>l.castShadow).length,1)
 const first=lamps[0].getWorldPosition(new THREE.Vector3());anchors[0].position.x+=2
 assert.equal(lamps[0].getWorldPosition(new THREE.Vector3()).x,first.x+2)
 const hidden=createSceneLighting(frame,'night','high',true),anchor=new THREE.Group();hidden.addLamp(lamp,anchor)
 assert.equal(anchor.children.length,0);hidden.group.traverse(o=>{if(o.isLight)assert(!o.castShadow)})
 const remembered=new THREE.Group();night.addLamp({...lamp,appearance:{remembered:true}},remembered);assert.equal(remembered.children.length,0)
 const studio=createSceneLighting(frame,'studio','high',false),neutral=new THREE.Group();studio.addLamp(lamp,neutral);assert.equal(neutral.children.length,0)
 night.dispose();hidden.dispose();studio.dispose()
 for(const mode of ['day','night','studio']){const env=createLightingEnvironment(mode);assert(env.scene.isScene);env.dispose()}
})
