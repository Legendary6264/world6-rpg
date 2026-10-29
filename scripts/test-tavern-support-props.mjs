import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'
const require=createRequire(import.meta.url),{load}=require('./generate-tabletop-thumbnails.cjs')
const {populateEntityModel}=load('scene3dMeshes'),{createTabletopObject}=load('tabletopCatalog')
const {resolveAssetPlacement,resolveObjectPlacement,canPlaceOnSurface,placementSurfaceFootprint}=load('sceneEditorPlacement'),{createVideoTavernScene,videoTavernSceneId}=load('tavernReference')
const {isSceneState,copySceneState}=load('scenes')
function build(object,low=false){
 const group=new THREE.Group(),resources=[]
 populateEntityModel({id:object.id,geometry:object,appearance:{color:'#a08060',heightKnown:true,remembered:false}},(g,c,x,y,z)=>{
  const material=new THREE.MeshStandardMaterial({color:c,side:THREE.FrontSide}),part=new THREE.Mesh(g,material);part.position.set(x,y,z);group.add(part);resources.push(g,material);return part
 },low)
 group.position.set(object.x,object.z,object.y);group.rotation.y=-(object.facing??0)*Math.PI/180;group.updateMatrixWorld(true)
 return {group,dispose(){resources.forEach(r=>r.dispose())}}
}
const ray=(m,x,z,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(0,-1,0)).intersectObject(m.group,true)[0]
test('Physical furniture supports match the logical height after resizing, rotation and elevation',()=>{
 for(const asset of ['table','round-table','stool','bar','bench','barrel'])for(const low of [false,true])for(const facing of [0,90,180,270])for(const scale of [[1,1,1],[1.4,.8,.6],[.7,1.3,1.2]]){
  const object=createTabletopObject(asset,'support',{x:7,y:8,z:1.25},facing);object.width*=scale[0];object.depth*=scale[1];object.height*=scale[2]
  const m=build(object,low),hit=ray(m,object.x,object.y,object.z+object.height+2),bounds=new THREE.Box3().setFromObject(m.group,true)
  assert(hit&&Math.abs(hit.point.y-object.z-object.height)<1e-6,`${asset}/${facing}/${scale}/${low} flat top`)
  assert(bounds.min.x>=object.x-object.width/2-.001&&bounds.max.x<=object.x+object.width/2+.001,`${asset}/${facing}/${scale}/${low} width`)
  assert(bounds.min.z>=object.y-object.depth/2-.001&&bounds.max.z<=object.y+object.depth/2+.001,`${asset}/${facing}/${scale}/${low} depth`)
  assert(bounds.max.y<=object.z+object.height+.001,`${asset}/${facing}/${scale}/${low} height`)
  m.dispose()
 }
})
test('Separate props placed by the real surface resolver touch table tops and respect rotated custom sizes',()=>{
 const frame={width:20,depth:20,groundZ:0,maxZ:8}
 for(const asset of ['table','round-table'])for(const facing of [0,90,180,270])for(const low of [false,true]){
  const table=createTabletopObject(asset,'support',{x:7,y:8,z:1.25},facing);table.width*=1.2;table.depth*=.8;table.height*=.6
  for(const decor of ['mug','plate','bread']){
   const {object,surfaceId}=resolveAssetPlacement(frame,[table],decor,'decor',{x:7,y:8,z:0},facing,{surfaceSnap:true,surfaceId:table.id})
   assert.equal(surfaceId,table.id);assert.equal(object.z,table.z+table.height)
   assert(!object.blocksMovement&&!object.blocksSight&&!object.canSupport)
   const m=build(object,low),bounds=new THREE.Box3().setFromObject(m.group,true)
   assert(Math.abs(bounds.min.y-object.z)<1e-6,decor+' physical base touches support')
   assert(bounds.min.x>=object.x-object.width/2-.001&&bounds.max.x<=object.x+object.width/2+.001)
   assert(bounds.min.z>=object.y-object.depth/2-.001&&bounds.max.z<=object.y+object.depth/2+.001)
   m.dispose()
  }
 }
})
test('Previously resized standalone props keep their physical base on the resolved surface in every facing',()=>{
 const frame={width:20,depth:20,groundZ:0,maxZ:8},table=createTabletopObject('table','support',{x:7,y:8,z:1.25})
 for(const decor of ['mug','plate','bread'])for(const facing of [0,90,180,270])for(const low of [false,true]){
  const source=createTabletopObject(decor,'resized',{x:2,y:3,z:0},facing);source.width*=1.3;source.depth*=.7;source.height*=1.8
  const {object,surfaceId}=resolveObjectPlacement(frame,[table],source,{x:7,y:8,z:0},{surfaceSnap:true,surfaceId:table.id})
  assert.equal(surfaceId,table.id);assert.equal(object.width,source.width);assert.equal(object.depth,source.depth);assert.equal(object.height,source.height)
  const m=build(object,low),bounds=new THREE.Box3().setFromObject(m.group,true)
  assert(Math.abs(bounds.min.y-table.z-table.height)<1e-6,decor+' resized physical base')
  assert(bounds.min.x>=object.x-object.width/2-.001&&bounds.max.x<=object.x+object.width/2+.001)
  assert(bounds.min.z>=object.y-object.depth/2-.001&&bounds.max.z<=object.y+object.depth/2+.001)
  assert(bounds.max.y<=object.z+object.height+.001);m.dispose()
 }
})
test('Reference decoration consists of independent valid objects on tables and preserves existing saves',()=>{
 const scene=createVideoTavernScene(['a','b','c','d']),state={version:1,activeSceneId:scene.id,scenes:[scene]},before=structuredClone(state)
 assert.equal(scene.id,videoTavernSceneId);assert(scene.objects.length<=250);assert(isSceneState(state));assert.equal(scene.tokens.length,4)
 const tables=scene.objects.filter(o=>['table','round-table'].includes(o.asset)),props=scene.objects.filter(o=>['mug','plate','bread'].includes(o.asset))
 assert.equal(props.length,tables.length*3+tables.filter(o=>o.asset==='table').length)
 assert.equal(new Set(scene.objects.map(o=>o.id)).size,scene.objects.length)
 for(const object of props){assert(tables.some(table=>canPlaceOnSurface(object,table)&&Math.abs(object.z-table.z-table.height)<1e-6),object.asset+' rests on an actual table');assert(!object.blocksMovement&&!object.blocksSight&&!object.canSupport)}
 assert.deepEqual(copySceneState(state),state);assert.deepEqual(state,before)
 const legacy=structuredClone(state);legacy.scenes[0].objects=legacy.scenes[0].objects.filter(o=>!['mug','plate','bread'].includes(o.asset))
 assert(isSceneState(legacy));assert.deepEqual(copySceneState(legacy),legacy,'Old authored scenes remain valid without forced decoration')
})
test('Accepted support contours have real geometry beneath every corner after quarter turns and edited dimensions',()=>{
 const frame={width:20,depth:20,groundZ:0,maxZ:8}
 for(const asset of ['table','round-table','stool','bar','bench','barrel'])for(const facing of [0,90,180,270])for(const low of [false,true]){
  const support=createTabletopObject(asset,'top',{x:7,y:8,z:1.1},facing);support.width*=1.3;support.depth*=.8
  const top=placementSurfaceFootprint(support),rx=top.width/2,ry=top.depth/2
  const point={x:support.x+(top.shape==='ellipse'?rx*Math.sqrt(.98**2-(.05/ry)**2)-.05:rx-.06),y:support.y+(top.shape==='ellipse'?0:ry-.06),z:0}
  const source={...createTabletopObject('mug','cup',point),width:.1,depth:.1},placed=resolveObjectPlacement(frame,[support],source,point,{surfaceSnap:true,surfaceId:support.id}),model=build(support,low)
  assert.equal(placed.surfaceId,support.id)
  for(const dx of [-.05,.05])for(const dy of [-.05,.05]){
   const hit=ray(model,point.x+dx,point.y+dy,support.z+support.height+1)
   assert(hit&&Math.abs(hit.point.y-placed.object.z)<1e-6,`${asset}/${facing}/${low}: a supported prop corner needs an actual flat top`)
  }
  model.dispose()
 }
})
