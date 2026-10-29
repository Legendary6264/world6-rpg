import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'
import {modelEmission} from '../src/scene3dEmitters.ts'
import {createSceneLighting} from '../src/scene3dLighting.ts'
const require=createRequire(import.meta.url),{load}=require('./generate-tabletop-thumbnails.cjs'),{populateEntityModel}=load('scene3dMeshes'),{createTabletopObject}=load('tabletopCatalog')
const frame={width:20,depth:20,groundZ:0,minZ:-2,maxZ:12},camera=new THREE.PerspectiveCamera();camera.position.set(8,5,12)
function build(asset,low,facing,active=true){
 const object=createTabletopObject(asset,'source',{x:7,y:8,z:1.2},facing);object.width*=1.3;object.depth*=.7;object.height*=.8;object.active=active
 const entity={id:object.id,geometry:object,appearance:{remembered:false,color:'#a88257',heightKnown:true}},group=new THREE.Group(),resources=new Set()
 populateEntityModel(entity,(geometry,color,x,y,z,s={})=>{const material=new THREE.MeshStandardMaterial({color,emissive:s.emissive??0,emissiveIntensity:1});material.userData.lightEmitter=!!s.emissive;const part=new THREE.Mesh(geometry,material);part.position.set(x,y,z);group.add(part);resources.add(geometry);resources.add(material);return part},low)
 group.position.set(object.x,object.z,object.y);group.rotation.y=-facing*Math.PI/180;group.updateMatrixWorld(true)
 return {entity,group,dispose(){resources.forEach(r=>r.dispose())}}
}
test('Local light follows the actual resized emitter geometry, its facing, position and colour in both LODs',()=>{
 for(const asset of ['candle','torch','fireplace','brazier','chandelier'])for(const facing of [0,90,180,270])for(const low of [false,true]){
  const model=build(asset,low,facing),emission=modelEmission(model.group)
  assert(emission&&emission.radius>0&&emission.position.toArray().every(Number.isFinite),asset)
  const worldBounds=new THREE.Box3();model.group.traverse(part=>{if(part.isMesh&&part.material.userData.lightEmitter)worldBounds.union(new THREE.Box3().setFromObject(part,true))})
  const expected=worldBounds.getCenter(new THREE.Vector3()),lighting=createSceneLighting(frame,'tavern',low?'low':'balanced',false)
  lighting.addLamp(model.entity,model.group,emission);lighting.update(camera,new THREE.Vector3(7,0,8))
  const light=model.group.children.find(c=>c.isPointLight);assert(light)
  assert(light.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-6,`${asset}/${facing}/${low}: centre of the completed emitter geometry`)
  assert(light.color.equals(emission.color));assert(light.shadow.camera.near>=.004&&light.shadow.camera.near<=.04);assert.equal(light.shadow.mapSize.x,512)
  const local=light.position.clone();emission.position.y+=100;assert(light.position.equals(local),'Caller vectors are copied rather than shared')
  lighting.dispose();model.dispose()
 }
})
test('Emitter extraction respects nested transforms and ignores painted, hidden and non-emissive parts',()=>{
 const root=new THREE.Group(),inner=new THREE.Group();root.position.set(10,3,20);root.rotation.y=Math.PI/2;root.scale.set(2,3,4);inner.position.set(1,2,3);inner.scale.set(2,1,1);root.add(inner)
 const material=new THREE.MeshStandardMaterial({color:'white',emissive:'#55bbff'});material.userData.lightEmitter=true
 const geometry=new THREE.BoxGeometry(.2,.4,.6),part=new THREE.Mesh(geometry,material);part.position.set(.5,.25,-.5);inner.add(part)
 const paint=new THREE.MeshStandardMaterial({emissive:'white'}),painted=new THREE.Mesh(geometry,paint);painted.position.x=100;root.add(painted)
 const hiddenParent=new THREE.Group();hiddenParent.visible=false;const hidden=new THREE.Mesh(geometry,material);hidden.position.x=1000;hiddenParent.add(hidden);root.add(hiddenParent)
 const emission=modelEmission(root);assert(emission);assert(emission.position.distanceTo(new THREE.Vector3(2,2.25,2.5))<1e-6)
 const expected=new THREE.Color('#55bbff');expected.multiplyScalar(1/Math.max(expected.r,expected.g,expected.b));assert(expected.toArray().every((n,i)=>Math.abs(n-emission.color.toArray()[i])<1e-9))
 part.visible=false;assert.equal(modelEmission(root),undefined)
 geometry.dispose();material.dispose();paint.dispose()
})
test('Off, remembered and undisclosed sources create no local light even when geometry is supplied',()=>{
 const model=build('torch',false,0,false);assert.equal(modelEmission(model.group),undefined)
 const emission={position:new THREE.Vector3(1,2,3),color:new THREE.Color('red'),radius:.1}
 for(const [restricted,remembered,active] of [[false,false,false],[false,true,true],[true,false,true]]){
  const lighting=createSceneLighting(frame,'night','high',restricted),anchor=new THREE.Group()
  lighting.addLamp({...model.entity,geometry:{...model.entity.geometry,active},appearance:{...model.entity.appearance,remembered}},anchor,emission)
  lighting.update(camera,new THREE.Vector3());assert.equal(anchor.children.length,0);lighting.dispose()
 }
 model.dispose()
})
