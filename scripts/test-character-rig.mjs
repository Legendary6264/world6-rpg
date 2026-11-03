import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from 'three'
import {populateCharacter,clearCharacterModelCache} from '../src/scene3dCharacters.ts'
import {prepareCharacterSkin,bindCharacterRig,sceneCharacterLandmarks} from '../src/characterRig.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'
import {characterModels} from '../src/characterAppearance.ts'

function build(preset='vanguard',low=false,position=new T.Vector3(),unbatched=false){
  const group=new T.Group(),resources=new Set(),materials=new Map()
  const entity={id:'rig-'+preset,geometry:{kind:'actor',characterModel:preset,width:.8,depth:.8,height:1.7},appearance:{color:'#78baa5',heightKnown:true,remembered:false}}
  const before=structuredClone(entity)
  populateCharacter(entity,(geometry,color,x,y,z,surface={})=>{
    const key=JSON.stringify([color,surface]);let material=materials.get(key)
    if(!material){material=new T.MeshStandardMaterial({color,metalness:surface.metalness??0,roughness:surface.roughness??.8});material.userData.paletteBatch=JSON.stringify(surface);materials.set(key,material)}
    resources.add(geometry);const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh);return mesh
  },low)
  const rest=new T.Box3().setFromObject(group),points=sceneCharacterLandmarks(entity)
  prepareCharacterSkin(group,points)
  if(!unbatched)batchEntityParts(group,g=>{resources.delete(g);g.dispose()},g=>{resources.add(g);return g})
  group.position.copy(position)
  const rig=bindCharacterRig(group,points)
  assert.deepEqual(entity,before,'Presentation must not mutate saved entities')
  return {group,rig,rest,dispose(){rig.dispose();resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const point=new T.Vector3()
test.after(()=>clearCharacterModelCache())

test('All presets and both qualities retain the rest shape with normalized skin weights and independent bones',()=>{
  for(const preset of characterModels)for(const low of [false,true]){
    const a=build(preset.id,low),b=build(preset.id,low)
    assert.equal(a.rig.skeleton.bones.length,18)
    assert.notEqual(a.rig.skeleton,b.rig.skeleton)
    assert(a.rig.meshes.length>0&&a.rig.meshes.length<=16)
    a.rig.sample(0,'rest')
    const bounds=new T.Box3().setFromObject(a.group)
    assert(bounds.min.distanceTo(a.rest.min)<1e-5&&bounds.max.distanceTo(a.rest.max)<1e-5,preset.id+' rest bounds')
    for(const mesh of a.rig.meshes){
      const p=mesh.geometry.getAttribute('position'),ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight')
      assert(mesh.isSkinnedMesh&&ids.count===p.count&&weights.count===p.count)
      for(let i=0;i<p.count;i+=17){
        assert(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-6)
        for(let j=0;j<4;j++)assert(ids.getComponent(i,j)>=0&&ids.getComponent(i,j)<18)
        assert(mesh.getVertexPosition(i,point).distanceTo(new T.Vector3().fromBufferAttribute(p,i))<1e-5,'Rest skinning preserves geometry')
      }
    }
    a.dispose();b.rig.sample(.7,'walk');assert(b.rig.skeleton.bones.every(b=>b.matrixWorld.elements.every(Number.isFinite)));b.dispose()
  }
})

test('Breathing and walking deform real vertices; pause restores rest without root motion or mesh reallocation',()=>{
  const model=build('ranger'),{rig,group}=model,geometries=rig.meshes.map(m=>m.geometry),source=rig.meshes.map(m=>m.geometry.getAttribute('position').array.slice()),origin=group.position.clone()
  rig.sample(1,'idle');assert(Math.abs(rig.skeleton.getBoneByName('gb_chest').quaternion.x)>.001)
  const moved=rig.meshes.some(mesh=>{
    const p=mesh.geometry.getAttribute('position')
    for(let i=0;i<p.count;i+=19)if(mesh.getVertexPosition(i,point).distanceTo(new T.Vector3().fromBufferAttribute(p,i))>.0001)return true
    return false
  })
  assert(moved,'Animation changes skinned vertices, not just a controller value')
  rig.sample(.3,'walk');assert(Math.abs(rig.skeleton.getBoneByName('gb_leftShin').quaternion.x)>.05)
  for(const mesh of rig.meshes){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i+=13)assert(mesh.boundingBox.clone().expandByScalar(1e-5).containsPoint(mesh.getVertexPosition(i,point)),'Animated envelope contains deformed vertices')}
  rig.sample(.3,'walk',false)
  rig.meshes.forEach((mesh,i)=>{assert.equal(mesh.geometry,geometries[i]);assert.deepEqual(mesh.geometry.getAttribute('position').array,source[i])})
  assert(group.position.equals(origin));assert(rig.skeleton.bones.every(b=>Math.abs(b.quaternion.w-1)<1e-6))
  model.dispose()
})

test('Binding under a translated scene pivot survives movement and raycasting in the current pose',()=>{
  const model=build('vanguard',true,new T.Vector3(8,2,5)),{rig,group}=model
  rig.sample(.2,'walk');group.position.add(new T.Vector3(3,1,-4));rig.sample(.6,'walk')
  for(const mesh of rig.meshes){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i+=41)assert(point.copy(mesh.getVertexPosition(i,new T.Vector3())).toArray().every(Number.isFinite))}
  const ray=new T.Raycaster(new T.Vector3(group.position.x,group.position.y+1.2,group.position.z+2),new T.Vector3(0,0,-1))
  assert(ray.intersectObject(group,true).length>0,'Animated models remain selectable after token movement')
  model.dispose()
})

test('Skeleton GPU resources are released exactly once; invalid clocks return to the rest pose',()=>{
  const {rig,dispose}=build('arcanist',true)
  rig.skeleton.computeBoneTexture();let released=0;rig.skeleton.boneTexture.addEventListener('dispose',()=>released++)
  rig.sample(1,'idle');rig.sample(NaN,'walk');assert(rig.skeleton.bones.every(b=>Math.abs(b.quaternion.w-1)<1e-6))
  dispose();rig.dispose();assert.equal(released,1);assert.doesNotThrow(()=>rig.sample(2,'walk'))
})

test('Walking arcanist: the long robe follows knees and keeps the underlying trousers covered',()=>{
 for(const low of [true,false]){
 const model=build('arcanist',low,new T.Vector3(),true),robe=model.rig.meshes.find(m=>m.geometry.name==='character-pleated-robe'),legs=model.rig.meshes.filter(m=>m.geometry.name==='character-trouser-leg')
 assert(robe&&legs.length===2)
 try{
  for(const time of [0,.15,.3,.45,.6,.75,.9,1.05]){
   model.rig.sample(time,'walk')
   for(const leg of legs){
    const p=leg.geometry.getAttribute('position')
    for(let i=0;i<p.count;i+=low?7:37){
     const vertex=leg.getVertexPosition(i,new T.Vector3())
     if(vertex.y<.23||vertex.y>.73)continue
     const ray=new T.Raycaster(new T.Vector3(vertex.x,vertex.y,1),new T.Vector3(0,0,-1)),hit=ray.intersectObject(robe)[0]
     assert(hit&&hit.point.z>=vertex.z-.004,`Trousers covered at t=${time}, y=${vertex.y.toFixed(3)}`)
    }
   }
  }
 }finally{model.dispose()}
 }
})
