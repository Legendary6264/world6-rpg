const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('three')
const {load}=require('./generate-tabletop-thumbnails.cjs')
const {legacyAssets,legacyAsset,presentationAssetId}=load('legacyAssets')
const {populateEntityModel}=load('scene3dMeshes'),{detailedAsset}=load('scene3dAssets'),{batchEntityParts}=load('scene3dBatch')
const {createEnvironmentObject,resolveObjectPlacement,placementSurfaceFootprint,flatPlacementSurface}=load('sceneEditorPlacement')
const {masterRenderModel,perceivedRenderModel}=load('scene3dModel'),{create3DSandbox}=load('sandboxCampaign')
const {upgradeOriginalScenes}=load('originalSceneEnvironment'),{isSceneState,sceneReferencesValid}=load('scenes')
const {operateSceneObject,objectActions}=load('tabletopInteractions')
function model(asset,low,dimensions,facing=0){
 const o={...createEnvironmentObject(asset.kind,asset.id,'saved:'+asset.slug,{x:0,y:0,z:0},facing),...dimensions},e={id:o.id,geometry:o,appearance:{color:'#87958a',heightKnown:true,remembered:false}},group=new THREE.Group(),materials=new Map(),geometries=new Set()
 group.rotation.y=-facing*Math.PI/180
 populateEntityModel(e,(g,c,x,y,z,s={})=>{
  const key=JSON.stringify([c,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color:c,transparent:(s.opacity??1)<1,opacity:s.opacity??1});material.userData.lightEmitter=!!s.emissive;material.userData.castsShadow=s.castShadow!==false;if(!s.emissive&&(s.opacity??1)>=.99)material.userData.paletteBatch=JSON.stringify([s,false,1]);materials.set(key,material)}
  const part=new THREE.Mesh(g,material);part.position.set(x,y,z);group.add(part);geometries.add(g);return part
 },low)
 group.updateMatrixWorld(true)
 return {e,o,group,materials,geometries,dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
test('All 220 original artwork ids own a real bounded 3D model, both LODs, saved scales and facing',()=>{
 assert.equal(legacyAssets.length,220);assert.equal(new Set(legacyAssets.map(a=>a.id)).size,220)
 const stats={models:0,highTriangles:0,lowTriangles:0,maxTriangles:0,maxBatches:0}
 for(const asset of legacyAssets)for(const low of [false,true])for(const [dimensions,facing] of [[undefined,0],[{width:2.7,depth:.63,height:1.13},90]]){
  const m=model(asset,low,dimensions,facing),b=new THREE.Box3().setFromObject(m.group,true),label=asset.slug+' '+low+' '+facing
  assert(m.group.children.length>0,label+' modeled');assert.equal(detailedAsset(m.e),undefined,label+' cannot be overwritten by the generic pine/rock GLB')
  assert(b.min.x>=-m.o.width/2-2e-6&&b.max.x<=m.o.width/2+2e-6,label+' width')
  assert(b.min.z>=-m.o.depth/2-2e-6&&b.max.z<=m.o.depth/2+2e-6,label+' depth')
  assert(b.min.y>=-2e-6&&b.max.y<=Math.max(.035,m.o.height)+2e-6,label+' height')
  let triangles=0
  for(const part of m.group.children){
   const g=part.geometry;assert(g.attributes.position.array.every(Number.isFinite),label+' finite vertices');assert(g.attributes.normal.array.every(Number.isFinite),label+' finite normals');assert(g.attributes.uv?.array.every(Number.isFinite),label+' UVs')
   triangles+=(g.index?.count??g.attributes.position.count)/3
  }
  assert(triangles<20000,label+' triangle ceiling')
  const before=b.clone();batchEntityParts(m.group,g=>{m.geometries.delete(g);g.dispose()},g=>{m.geometries.add(g);return g});m.group.updateMatrixWorld(true)
  const after=new THREE.Box3().setFromObject(m.group,true)
  assert(before.min.distanceTo(after.min)<3e-6&&before.max.distanceTo(after.max)<3e-6,label+' batching preserves shape')
  assert(m.group.children.length<=12,label+' draw-group ceiling')
  stats.models++;stats[low?'lowTriangles':'highTriangles']+=triangles;stats.maxTriangles=Math.max(stats.maxTriangles,triangles);stats.maxBatches=Math.max(stats.maxBatches,m.group.children.length);m.dispose()
 }
 console.log('Legacy geometry census',JSON.stringify(stats))
})
test('Specific old artwork survives master and disclosed/remembered rendering without enriching hidden state',()=>{
 const s=create3DSandbox('art-adapter').world.campaign.scenes.scenes[0],before=structuredClone(s),e=masterRenderModel(s,[]).entities.find(e=>e.geometry.artwork)
 assert(e);assert.equal(e.geometry.artwork,s.objects.find(o=>o.id===e.id).artwork);assert.deepEqual(s,before)
 const map={frame:{id:'disclosed',view:'top',width:30,depth:20,groundZ:0,minZ:-2,maxZ:10,palette:'forest'},title:'Disclosed',description:'',areas:[{id:'a',x:0,y:0,z:-2,width:4,depth:4,height:12,visible:false}],contacts:[],objects:[{id:'known',name:'Known palm',kind:'tree',artwork:'expanded-object-palm',x:2,y:2,z:0,width:2,depth:2,height:4,open:false,visible:false}]}
 const memory=perceivedRenderModel(map);assert.equal(memory.entities.length,1);assert.equal(memory.entities[0].geometry.artwork,'expanded-object-palm');assert(memory.entities[0].appearance.remembered);assert(!JSON.stringify(memory).includes('art-adapter'))
 assert.equal(detailedAsset({geometry:{kind:'tree'}}),'pine');assert.equal(detailedAsset({geometry:{kind:'rock'}}),'rocks')
 assert.equal(legacyAsset({kind:'rock',artwork:'expanded-object-oak'}),undefined)
 assert.equal(presentationAssetId({kind:'platform',artwork:'expanded-object-table'}),'table')
 assert.equal(presentationAssetId({kind:'crate',asset:'barrel',artwork:'expanded-object-crate'}),'barrel')
})
test('Old artwork placement is sized, rotatable, bounded and physically consistent with native flat supports',()=>{
 const frame={width:30,depth:20,groundZ:0,maxZ:10},point={x:15,y:10,z:0}
 for(const a of legacyAssets){const o=createEnvironmentObject(a.kind,a.id,a.slug,point,90),s={...frame,id:'s',name:'s',description:'',view:'top',minZ:-2,palette:'stone',objects:[o],tokens:[]};assert(isSceneState({version:1,activeSceneId:'s',scenes:[s]}),a.slug);assert.deepEqual(resolveObjectPlacement(frame,[],o,point).object,o)}
 const grass=createEnvironmentObject('rock','expanded-object-grass-tuft','grass',point);assert(grass.height<1);assert(!grass.blocksMovement&&!grass.blocksSight&&!grass.canSupport)
 const table=createEnvironmentObject('platform','expanded-object-round-table','table',point),lamp=createEnvironmentObject('lamp','expanded-object-candle-stand','lamp',point)
 assert(flatPlacementSurface(table));assert.equal(placementSurfaceFootprint(table).shape,'ellipse')
 const placed=resolveObjectPlacement(frame,[table],lamp,point,{surfaceSnap:true,surfaceId:table.id});assert.equal(placed.surfaceId,table.id);assert.equal(placed.object.z,table.height)
 for(const slug of ['bed','chest','locked-chest','stairs']){const a=legacyAssets.find(a=>a.slug===slug),o=createEnvironmentObject(a.kind,a.id,slug,point);assert(!flatPlacementSurface(o),slug+' has no fictitious top plane')}
 for(const slug of ['table','bench','stool','barrel']){const a=legacyAssets.find(a=>a.slug===slug),o=createEnvironmentObject(a.kind,a.id,slug,point);assert.deepEqual(placementSurfaceFootprint(o),placementSurfaceFootprint({...o,asset:presentationAssetId(o)}),slug+' same safe footprint')}
 const chest=createEnvironmentObject('crate','expanded-object-locked-chest','locked',point);assert(chest.locked);assert.throws(()=>operateSceneObject(chest,'open'));assert(operateSceneObject(operateSceneObject(chest,'unlock'),'open').open)
 for(const slug of ['barrel','cart','mine-cart','flower-planter']){const a=legacyAssets.find(a=>a.slug===slug);assert.deepEqual(objectActions(createEnvironmentObject(a.kind,a.id,slug,point)),[],slug+' does not offer a fictitious lid')}
 const arch=createEnvironmentObject('door','expanded-object-archway','arch',point);assert(arch.open);assert.deepEqual(objectActions(arch),[])
})
test('Original scenes keep all identities, support rules and valid saves with improved scenery',()=>{
 const old=create3DSandbox('originals',{environment:'legacy'}),current=create3DSandbox('originals'),state=current.world.campaign.scenes
 assert(isSceneState(state));assert(sceneReferencesValid(state,current.world.characters.map(a=>a.id)))
 assert.deepEqual(state.scenes.map(s=>s.id),old.world.campaign.scenes.scenes.map(s=>s.id))
 for(const [i,scene] of state.scenes.entries()){
  const previous=old.world.campaign.scenes.scenes[i]
  assert(scene.objects.length>previous.objects.length)
  for(const o of previous.objects)assert(scene.objects.some(n=>n.id===o.id),o.id+' retained')
  assert.deepEqual(scene.tokens,previous.tokens)
  for(const o of scene.objects){assert(o.x-o.width/2>=0&&o.x+o.width/2<=scene.width,o.id+' width');assert(o.y-o.depth/2>=0&&o.y+o.depth/2<=scene.depth,o.id+' depth');assert(o.z+o.height<=scene.maxZ,o.id+' height')}
  for(const o of scene.objects.filter(o=>o.id.includes(':environment-v021-')))assert(!o.blocksMovement&&!o.blocksSight&&!o.canSupport,o.id+' dressing does not add gameplay barriers')
 }
 assert.equal(state.scenes[2].tokens[0].z,3);assert.equal(state.scenes[2].tokens[0].support.objectId,'originals:upper-support')
})
test('Stock-scene refresh preserves edits, deletions, imported scenes, active selection and actor placement',()=>{
 const previous=create3DSandbox('migration',{environment:'legacy'}).world.campaign.scenes,current=create3DSandbox('migration').world.campaign.scenes
 const stock=structuredClone(previous),upgraded=upgradeOriginalScenes(stock,previous,current)
 assert.deepEqual(stock,previous);assert.deepEqual(upgraded.scenes.map(s=>s.objects),current.scenes.map(s=>s.objects));assert.equal(upgraded.activeSceneId,stock.activeSceneId)
 const edited=structuredClone(previous),village=edited.scenes[0],tree=village.objects.find(o=>o.kind==='tree'),deleted=village.objects.find(o=>o.kind==='rock')
 tree.x-=1;tree.width=1.5;tree.artwork='expanded-object-palm';village.objects=village.objects.filter(o=>o.id!==deleted.id);village.name='Моё поселение';village.tokens[0].x=6
 const own={...structuredClone(village),id:'my-imported',tokens:[],objects:[]};edited.scenes.push(own);edited.activeSceneId=own.id
 const before=structuredClone(edited),result=upgradeOriginalScenes(edited,previous,current)
 assert.deepEqual(edited,before);assert.deepEqual(result.scenes[0].objects.find(o=>o.id===tree.id),tree);assert(!result.scenes[0].objects.some(o=>o.id===deleted.id))
 assert.equal(result.scenes[0].objects.length,village.objects.length);assert.equal(result.scenes[0].name,village.name);assert.deepEqual(result.scenes[0].tokens,village.tokens);assert.deepEqual(result.scenes.at(-1),own);assert.equal(result.activeSceneId,own.id)
 assert.equal(upgradeOriginalScenes(result,previous,current),result,'Refresh is idempotent')
})

test('Old furniture uses the furniture selection filter without changing its saved logical kind',()=>{
 const {selectionAllowed}=load('scene3dModel'),pick={kind:'object',id:'old-table'}
 const table={kind:'platform',artwork:'expanded-object-table'},tree={kind:'tree',artwork:'expanded-object-palm'}
 assert(selectionAllowed(pick,table,'props'));assert(!selectionAllowed(pick,table,'structure'));assert(!selectionAllowed(pick,tree,'props'));assert(selectionAllowed(pick,tree,'structure'))
})
