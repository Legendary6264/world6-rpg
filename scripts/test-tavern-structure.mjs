import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'

const require=createRequire(import.meta.url)
const {load}=require('./generate-tabletop-thumbnails.cjs')
const {populateTavernStructure}=load('scene3dTavernStructure')
const {createTabletopObject}=load('tabletopCatalog')

function build(asset,low=false){
 const group=new THREE.Group(),materials=new Map()
 const geometry=createTabletopObject(asset,'structure:ref-'+asset,{x:0,y:0,z:0})
 const entity={id:geometry.id,geometry,appearance:{color:'#ffffff',heightKnown:true,remembered:false}}
 assert(populateTavernStructure(entity,(g,color,x,y,z,surface={})=>{
  const key=JSON.stringify([color,surface])
  if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,side:THREE.FrontSide}))
  const part=new THREE.Mesh(g,materials.get(key));part.position.set(x,y,z);group.add(part);return part
 },low))
 group.updateMatrixWorld(true)
 return {group,geometry,materials,dispose(){group.traverse(p=>p.isMesh&&p.geometry.dispose());materials.forEach(m=>m.dispose())}}
}

test('Reference structure: closed solids, finite normals, physical bounds and material budget',()=>{
 for(const asset of ['floor-wood','timber-wall','timber-window'])for(const low of [false,true]){
  const model=build(asset,low),b=new THREE.Box3().setFromObject(model.group,true),g=model.geometry,eps=.0001
  assert(b.min.x>=-g.width/2-eps&&b.max.x<=g.width/2+eps,asset+' width')
  assert(b.min.z>=-g.depth/2-eps&&b.max.z<=g.depth/2+eps,asset+' depth')
  assert(b.min.y>=-eps&&b.max.y<=Math.max(.035,g.height)+eps,asset+' height')
  assert(model.materials.size<=4,asset+' material budget')
  model.group.traverse(part=>{
   if(!part.isMesh)return
   const p=part.geometry.attributes.position,n=part.geometry.attributes.normal,index=part.geometry.index
   assert(Array.from(p.array).every(Number.isFinite));assert(Array.from(n.array).every(Number.isFinite))
   let volume=0
   for(let i=0;i<(index?.count??p.count);i+=3){
    const point=j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(j):j)
    volume+=point(i).dot(point(i+1).cross(point(i+2)))/6
   }
   assert(volume>0,'Every structural part has outward solid winding')
  })
  model.dispose()
 }
})

test('Reference window: actual opening, solid sill and capped plaster fields in both detail modes',()=>{
 for(const low of [false,true]){
  const model=build('timber-window',low)
  for(const side of [-1,1]){
   const ray=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,2*side),new THREE.Vector3(0,0,-side)).intersectObject(model.group,true)
   assert.equal(ray(.25,1.6).length,0,'Window ray clears the actual aperture')
   assert(ray(.25,.5).length>0,'Plaster under window is solid')
   assert(ray(.25,2.4).length>0,'Plaster above window is solid')
   assert(ray(.93,1.6).length>0,'Structural end post is solid')
  }
  model.dispose()
 }
})

test('Reference floor: flush module edges, continuous backing and sparse physical board joints',()=>{
 for(const low of [false,true]){
  const model=build('floor-wood',low)
  const floorRay=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0)).intersectObject(model.group,true)
  for(const x of [-.999,-.75,-.25,.25,.75,.999])for(const z of [-.95,-.4,.2,.75,.95])assert(floorRay(x,z).length>0,'Backing closes board gaps and tile edges')
  const b=new THREE.Box3().setFromObject(model.group,true)
  assert(Math.abs(b.min.x+1)<.00001&&Math.abs(b.max.x-1)<.00001,'No recessed outline at the module edges')
  model.dispose()
 }
})
