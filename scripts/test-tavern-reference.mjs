import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'
const require=createRequire(import.meta.url)
const {load}=require('./generate-tabletop-thumbnails.cjs')
const {createVideoTavernScene}=load('tavernReference')
const {isSceneState,copySceneState}=load('scenes')
const {nearCutawayWall}=load('scene3dCutaway')
const {batchEntityParts}=load('scene3dBatch')
const {SceneSurfaceLibrary}=load('scene3dSurfaces')

test('Reference tavern is editable, has four distinct heroes and leaves room in the object limit',()=>{
 const scene=createVideoTavernScene(['one','two','three','four','five']),state={version:1,activeSceneId:scene.id,scenes:[scene]}
 assert(isSceneState(state));assert.deepEqual(copySceneState(state),state);assert.equal(scene.tokens.length,4)
 assert(scene.objects.length<230);assert.equal(new Set(scene.objects.map(o=>o.id)).size,scene.objects.length)
 assert.equal(scene.objects.filter(o=>o.asset==='round-table').length,6)
 for(const object of scene.objects){
  assert(object.x-object.width/2>=0&&object.x+object.width/2<=scene.width,object.id+' x bounds')
  assert(object.y-object.depth/2>=0&&object.y+object.depth/2<=scene.depth,object.id+' y bounds')
 }
 // The ladder back is local -Y. Chairs on either side look toward the table.
 const table=scene.objects.find(o=>o.asset==='round-table'),chairs=scene.objects.filter(o=>o.asset==='chair'&&Math.abs(o.x-table.x)<.5&&Math.abs(o.y-table.y)<1.2)
 assert.equal(chairs.length,2);assert.equal(chairs.find(c=>c.y<table.y).facing,0);assert.equal(chairs.find(c=>c.y>table.y).facing,180)
})

test('Interior cutaway keeps the entire far side wall and follows camera side across quarter turns',()=>{
 const target={x:9,z:13.6},direction={x:.32,z:.95}
 for(const z of [3,13,23]){
  assert.equal(nearCutawayWall({x:2,z},target,direction,90),false,'Far wall stays full height even near front corner')
  assert.equal(nearCutawayWall({x:16,z},target,direction,270),true,'Near side wall opens the room')
 }
 assert(nearCutawayWall({x:9,z:24},target,direction,0));assert(!nearCutawayWall({x:9,z:2},target,direction,180))
 assert(nearCutawayWall({x:2,z:23},target,{x:-.32,z:-.95},90))
 assert(!nearCutawayWall({x:16,z:23},target,{x:-.32,z:-.95},90))
 assert(!nearCutawayWall({x:16,z:23},target,{x:0,z:0},90),'Overhead view does not choose an arbitrary near wall')
})

test('Tint batching retains actual linear vertex colors, silhouette and separate shadow/emission materials',()=>{
 const group=new THREE.Group(),resources=new Set(),materials=[]
 for(const [i,color] of ['#d5c18d','#dfcc9b','#c9b984'].entries()){
  const material=new THREE.MeshStandardMaterial({color});material.userData.paletteBatch='same-wood';materials.push(material)
  const g=new THREE.BoxGeometry(.4,.1,.6);resources.add(g);const mesh=new THREE.Mesh(g,material);mesh.position.x=i*.5;group.add(mesh)
 }
 const emitter=new THREE.MeshStandardMaterial({color:'#ff8833',emissive:'#ff8833'});emitter.userData.lightEmitter=true;materials.push(emitter)
 const flameGeometry=new THREE.SphereGeometry(.05,8,6);resources.add(flameGeometry);group.add(new THREE.Mesh(flameGeometry,emitter))
 const before=new THREE.Box3().setFromObject(group),expected=materials.slice(0,3).map(m=>m.color.clone())
 batchEntityParts(group,g=>{resources.delete(g);g.dispose()},g=>{resources.add(g);return g})
 assert.equal(group.children.length,2);const merged=group.children.find(m=>m.material.vertexColors)
 assert.equal(merged.material.color.getHexString(),'ffffff');assert(merged.castShadow)
 const colors=merged.geometry.attributes.color
 for(const color of expected)assert(Array.from({length:colors.count},(_,i)=>new THREE.Color().fromBufferAttribute(colors,i)).some(c=>Math.abs(c.r-color.r)+Math.abs(c.g-color.g)+Math.abs(c.b-color.b)<1e-6))
 const after=new THREE.Box3().setFromObject(group);assert(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6)
 assert.equal(group.children.find(m=>m.material===emitter).castShadow,false)
 resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())
})

test('Texture modulation preserves the authored palette, normal strength and shared texture resources',()=>{
 const original=THREE.TextureLoader.prototype.load,library=new SceneSurfaceLibrary(()=>{}),materials=[]
 THREE.TextureLoader.prototype.load=()=>new THREE.Texture()
 try{
  for(const strength of [.24,.38,1]){
   const material=new THREE.MeshStandardMaterial({color:'#d5c18d'});materials.push(material)
   library.apply(material,'wood',strength,.16)
   assert.equal(material.color.getHexString(),'d5c18d');assert.equal(material.normalScale.x,.16)
   assert(Math.abs(material.aoMapIntensity-.65*strength)<1e-8)
   if(strength<1){const shader={fragmentShader:'#include <map_fragment>'};material.onBeforeCompile(shader,{});assert(shader.fragmentShader.includes('mix(authoredDiffuse.rgb'));assert(shader.fragmentShader.includes(strength.toFixed(4)))}
  }
  assert.equal(materials[0].map,materials[1].map);assert.equal(materials[1].normalMap,materials[2].normalMap)
 }finally{THREE.TextureLoader.prototype.load=original;library.dispose();materials.forEach(m=>m.dispose())}
})
