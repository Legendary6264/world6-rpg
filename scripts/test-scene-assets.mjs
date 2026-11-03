import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import * as THREE from 'three'
import {SceneAssetLibrary} from '../src/scene3dAssets.ts'
import {surfaceUV,SceneSurfaceLibrary} from '../src/scene3dSurfaces.ts'
import {sceneAssetUrl} from '../src/sceneAssetUrl.ts'

test('Пути 3D-ресурсов: корень, вложенный GitHub Pages и index.html сохраняют каталог сайта',()=>{
 for(const base of ['https://example.test/world6-rpg/','https://example.test/world6-rpg/index.html']){
  assert.equal(sceneAssetUrl('models/pine.glb',base),'https://example.test/world6-rpg/models/pine.glb')
  assert.equal(sceneAssetUrl('materials/skin-normal.jpg',base),'https://example.test/world6-rpg/materials/skin-normal.jpg')
 }
 assert.equal(sceneAssetUrl('models/pine.glb','https://example.test/'),'https://example.test/models/pine.glb')
})

// Real GLTFLoader and bundled binary geometry/materials. Image decoding and
// WebGL are unavailable in Node; fake only the decoded ImageBitmap surface.
const realFetch=globalThis.fetch,requests=[]
globalThis.self=globalThis
globalThis.ImageBitmap=class {width=1024;height=1024;close(){this.closed=true}}
globalThis.createImageBitmap=async()=>new ImageBitmap()
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('/models/')){requests.push(String(url));return new Response(readFileSync('public'+url))}
 return realFetch(url,options)
}
test.after(()=>{globalThis.fetch=realFetch;delete globalThis.createImageBitmap;delete globalThis.ImageBitmap;delete globalThis.self})
const entity=(kind,id='fixture')=>({id,geometry:{kind,width:2,depth:1.5,height:3},appearance:{remembered:false,heightKnown:true,color:'#fff'}})
function meshes(root){const all=[];root.traverse(o=>{if(o.isMesh)all.push(o)});return all}

test('Бинарные ассеты: целостность, встроенные текстуры и конечная геометрия всех вариантов',async()=>{
 const manifest=JSON.parse(readFileSync('public/models/sources.json','utf8'))
 for(const asset of manifest){
  const bytes=readFileSync('public/models/'+asset.file)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256)
  assert.equal(bytes.readUInt32LE(8),bytes.length)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  assert(doc.images.length>=3);assert(doc.images.every(i=>i.bufferView!==undefined&&!i.uri))
  assert(!doc.buffers.some(b=>b.uri));assert.equal(asset.license,'CC0-1.0')
 }
 const library=new SceneAssetLibrary()
 for(const kind of ['tree','rock'])for(let i=0;i<(kind==='rock'?12:6);i++){
  const root=await library.instantiate(entity(kind,'variant-'+i),[],false),bounds=new THREE.Box3().setFromObject(root)
  assert(root);assert(bounds.min.x>=-1.0001&&bounds.max.x<=1.0001,kind+' width')
  assert(bounds.min.z>=-.7501&&bounds.max.z<=.7501,kind+' depth')
  assert(Math.abs(bounds.min.y)<.0001&&bounds.max.y<=3.0001,kind+' height')
  root.traverse(part=>{if(part.userData.detailedModel)assert.equal(part.scale.x,part.scale.y,'Natural proportions are not stretched')})
  assert(meshes(root).some(m=>m.material.map&&m.material.normalMap&&m.material.roughnessMap),kind+' PBR')
  assert(meshes(root).every(m=>m.geometry.getAttribute('position').array.every(Number.isFinite)))
 }
 assert.equal(requests.length,2,'Only natural model bundles are downloaded; crafted objects are local geometry')
 library.dispose()
})
test('PBR: приватное отсечение, память и общая геометрия без общей видимости',async()=>{
 const library=new SceneAssetLibrary(),planes=[new THREE.Plane(new THREE.Vector3(1,0,0),-1)],e=entity('rock')
 const full=await library.instantiate(e,[],false),remembered=await library.instantiate({...e,appearance:{...e.appearance,remembered:true}},planes,true)
 const a=meshes(full)[0],b=meshes(remembered)[0]
 assert.equal(a.geometry,b.geometry);assert.notEqual(a.material,b.material)
 assert.equal(a.material.opacity,1);assert.equal(b.material.opacity,.4);assert.equal(b.material.clippingPlanes,planes)
 assert(b.material.clipShadows);assert(!b.castShadow);assert(a.castShadow)
 const clay=await library.instantiate(e,planes,true,true),gray=meshes(clay)[0].material
 assert.equal(gray.map,null);assert.equal(gray.normalMap,null);assert.equal(gray.clippingPlanes,planes)
 let disposed=0;a.material.addEventListener('dispose',()=>disposed++)
 library.dispose();assert.equal(disposed,1)
 const rebuilding=new SceneAssetLibrary(),next=await rebuilding.instantiate(e,[],false)
 assert.equal(meshes(next)[0].geometry,a.geometry,'Undo/move reuses parsed assets during rebuild')
 rebuilding.dispose()
 const late=new SceneAssetLibrary(),pending=late.instantiate(entity('rock'),[],true);late.dispose();assert.equal(await pending,null)
})
test('Материалы: плотность UV в метрах на соседних гранях',()=>{
 const geometry=new THREE.BoxGeometry(8,3,1);surfaceUV(geometry,new THREE.Vector3(4,1.5,0),2)
 const uv=geometry.getAttribute('uv');assert(uv.array.every(Number.isFinite))
 assert(Math.max(...uv.array)>=4,'Wide walls repeat rather than stretch one texture')
 geometry.dispose()
 for(const entry of [...JSON.parse(readFileSync('public/materials/sources.json','utf8')),...JSON.parse(readFileSync('public/materials/character-sources.json','utf8'))])for(const file of entry.files){
  const data=readFileSync('public/materials/'+file.file);assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256)
 }
})

test('Материалы персонажа: карты общие внутри библиотеки, сталь сохраняет metalness, кожа не становится металлом',()=>{
 const load=THREE.TextureLoader.prototype.load,loaded=[],library=new SceneSurfaceLibrary(()=>{})
 THREE.TextureLoader.prototype.load=function(url){loaded.push(url);return new THREE.Texture()}
 try{
  const steel=new THREE.MeshStandardMaterial({metalness:.82,roughness:.38}),skin=new THREE.MeshStandardMaterial({metalness:0,roughness:.73}),second=new THREE.MeshStandardMaterial({metalness:.82,roughness:.38})
  library.apply(steel,'steel');library.apply(skin,'skin');library.apply(second,'steel')
  assert.equal(steel.metalness,.82);assert.equal(steel.roughness,.38);assert.equal(skin.metalness,0);assert.equal(skin.roughness,.73)
  assert.equal(steel.map,second.map);assert.equal(loaded.length,6);assert.equal(steel.map.colorSpace,THREE.SRGBColorSpace);assert.equal(steel.normalMap.colorSpace,THREE.NoColorSpace)
  steel.dispose();skin.dispose();second.dispose()
 }finally{library.dispose();THREE.TextureLoader.prototype.load=load}
})
