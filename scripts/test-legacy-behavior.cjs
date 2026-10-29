const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('three')
const {load}=require('./generate-tabletop-thumbnails.cjs')
const {legacyAssets}=load('legacyAssets'),{legacyObjectBehavior,objectLightSource,objectLightReachesRoom,objectRelocatable}=load('legacyObjectBehavior')
const {objectActions,supportsObjectOperation,operateSceneObject}=load('tabletopInteractions')
const {createEnvironmentObject,flatPlacementSurface,surfacePlacementObject,resolveObjectPlacement}=load('sceneEditorPlacement')
const {modelEmission}=load('scene3dEmitters'),{populateEntityModel}=load('scene3dMeshes'),{createSceneLighting}=load('scene3dLighting')
function object(slug,flags={}){const a=legacyAssets.find(a=>a.slug===slug);assert(a,slug);return {...createEnvironmentObject(a.kind,a.id,'old:'+slug,{x:6,y:7,z:0}),...flags}}
function build(slug,low=false,facing=0,flags={}){
 const o=object(slug,{...flags,facing,width:1.7,depth:.8,height:2.1}),group=new THREE.Group(),resources=[]
 const entity={id:o.id,geometry:o,appearance:{color:'#87958a',remembered:false,heightKnown:true}}
 populateEntityModel(entity,(g,c,x,y,z,s={})=>{
  const m=new THREE.MeshStandardMaterial({color:c,emissive:s.emissive??0,emissiveIntensity:1});m.userData.lightEmitter=!!s.emissive
  const part=new THREE.Mesh(g,m);part.position.set(x,y,z);part.castShadow=s.castShadow!==false;group.add(part);resources.push(g,m);return part
 },low)
 group.rotation.y=-facing*Math.PI/180;group.position.set(o.x,o.z,o.y);group.updateMatrixWorld(true)
 return {o,entity,group,dispose(){resources.forEach(r=>r.dispose())}}
}
test('Existing old doors, drawers, cabinets, sacks, hatches and equipment expose only their real state controls',()=>{
 for(const slug of ['desk','cabinet','wardrobe','sack','kiln','bread-oven','smokehouse','chicken-coop','carriage','shutters','trap-grate','drawbridge-machine']){
  const o=object(slug),before=structuredClone(o),actions=objectActions(o)
  assert(actions.some(a=>a.operation==='open'),slug+' opens');assert(supportsObjectOperation(o,'open'))
  const opened=operateSceneObject(o,'open');assert(opened.open);assert(!operateSceneObject(opened,'close').open);assert.deepEqual(o,before)
  for(const key of ['id','kind','artwork','width','depth','height','blocksMovement','blocksSight','canSupport'])assert.deepEqual(opened[key],o[key],slug+' retains '+key)
 }
 for(const slug of ['cabinet','wardrobe','smokehouse','chicken-coop','carriage']){
  const o=operateSceneObject(object(slug),'lock');assert(o.locked);assert.throws(()=>operateSceneObject(o,'open'),/заперт/)
  assert(operateSceneObject(operateSceneObject(o,'unlock'),'open').open)
  assert.throws(()=>operateSceneObject(operateSceneObject(object(slug),'open'),'lock'),/Сначала закрой/)
 }
 for(const slug of ['desk','sack','kiln','bread-oven','shutters','trap-grate','drawbridge-machine']){
  const o=object(slug);assert(!supportsObjectOperation(o,'lock'),slug+' has no invented padlock');assert(!objectActions(o).some(a=>a.operation==='lock'))
  assert.equal(operateSceneObject({...o,locked:true},'unlock').locked,false,'An existing custom lock can still be cleared')
 }
 for(const slug of ['table','barrel','cart','mine-cart','archway','well','still','flower-planter'])assert(!objectActions(object(slug)).some(a=>['open','lock'].includes(a.operation)),slug+' has no fake opening')
 assert.equal(legacyObjectBehavior({kind:'rock',artwork:'expanded-object-kiln'}),undefined)
 assert.equal(legacyObjectBehavior({kind:'platform',asset:'roof-tile',artwork:'expanded-object-kiln'}),undefined)
})
test('Old fire equipment has independent ignition and door state; a closed fire door prevents room-light leakage',()=>{
 for(const slug of ['forge','kiln','bread-oven']){
  const o=object(slug);assert(objectLightSource(o));assert(objectActions(o).some(a=>a.operation==='extinguish'))
  const off=operateSceneObject(o,'extinguish');assert.equal(off.active,false);assert.equal(off.open,o.open)
  const on=operateSceneObject(off,'ignite');assert(on.active);assert.equal(on.open,o.open)
  assert.equal(objectLightReachesRoom(o),slug==='forge');assert(objectLightReachesRoom({...o,open:true}))
 }
 for(const slug of ['still','smokehouse','waterwheel','crystal-cluster']){assert(!objectLightSource(object(slug)));assert(!objectActions(object(slug)).some(a=>a.operation==='ignite'||a.operation==='extinguish'))}
})
test('Old furniture shares the move-intent capability across all 220 artwork ids without making structures movable',()=>{
 for(const a of legacyAssets){const o=object(a.slug);assert.equal(objectRelocatable(o),a.group==='furniture'||a.kind==='crate'||a.kind==='lamp',a.slug)}
 for(const o of [{kind:'platform'},{kind:'wall',artwork:'expanded-object-table'},{kind:'platform',asset:'floor-stone'},{kind:'platform',artwork:'expanded-object-bridge'},{kind:'platform',artwork:'expanded-object-not-a-model'}])assert(!objectRelocatable(o))
})
test('Saved canSupport flags on old chairs, beds, wardrobes and mechanisms never invent a flat top',()=>{
 for(const slug of ['chair','throne','bed','cot','bedroll','hammock','bookcase','cabinet','wardrobe','shelf','weapon-rack','loom','forge','kiln','bread-oven','bridge','rope-bridge','trap-grate','chest','stairs'])assert(!flatPlacementSurface(object(slug,{canSupport:true})),slug)
 for(const slug of ['table','round-table','bench','stool','barrel','desk','workbench','platform'])assert(flatPlacementSurface(object(slug,{canSupport:true})),slug)
 const desk=object('desk'),frame={width:30,depth:20,groundZ:0,maxZ:10},smallChair=object('chair',{width:.2,depth:.2,height:.3})
 assert(surfacePlacementObject(smallChair));const placed=resolveObjectPlacement(frame,[desk],smallChair,{x:desk.x,y:desk.y,z:0},{surfaceSnap:true,surfaceId:desk.id})
 assert.equal(placed.object.z,desk.height);assert.equal(placed.surfaceId,desk.id)
 assert.equal(resolveObjectPlacement(frame,[object('wardrobe',{canSupport:true})],smallChair,{x:6,y:7,z:0},{surfaceSnap:true}).object.z,0)
})
test('Real old forge and open-oven lights use completed emitter geometry and never use flames as opaque shadow casters',()=>{
 const frame={width:30,depth:20,groundZ:0,minZ:-2,maxZ:10},camera=new THREE.PerspectiveCamera();camera.position.set(8,5,10)
 for(const slug of ['forge','kiln','bread-oven'])for(const low of [false,true])for(const facing of [0,90,180,270])for(const active of [false,true]){
  const m=build(slug,low,facing,{active,open:true}),preferred=legacyObjectBehavior(m.o)?.emitter,emission=modelEmission(m.group,preferred)
  assert.equal(!!emission,active,slug+' source state')
  const lighting=createSceneLighting(frame,'night',low?'low':'balanced',false)
  if(objectLightReachesRoom(m.o))lighting.addLamp(m.entity,m.group,emission)
  lighting.update(camera,new THREE.Vector3(6,0,7));const light=m.group.children.find(p=>p.isPointLight);assert.equal(!!light,active)
  const bounds=new THREE.Box3();m.group.traverse(p=>{if(p.isMesh&&p.material.userData.lightEmitter){assert(!p.castShadow,'A flame cannot cast a black silhouette');if(!preferred||p.geometry.name===preferred)bounds.union(new THREE.Box3().setFromObject(p,true))}})
  if(active){assert(light.getWorldPosition(new THREE.Vector3()).distanceTo(bounds.getCenter(new THREE.Vector3()))<1e-6);assert(light.color.equals(emission.color))}
  lighting.dispose();m.dispose()
 }
})
test('Legacy operations execute through a confirmed timed round; calculation and saved identities remain intact',()=>{
 const {calculateRound}=load('roundExecution'),{createDefaultCharacter}=load('characterModel'),{emptyCampaign}=load('rpgSchema'),{createScene,emptyScenes}=load('scenes')
 const state=createScene(emptyScenes(),'legacy-round','Прежняя сцена','top'),cabinet=object('cabinet'),oven=object('kiln',{active:false}),table=object('table')
 state.scenes[0].objects=[cabinet,oven,table]
 const world={characters:[{...createDefaultCharacter(),id:'a',name:'Мастер'}],campaign:{...emptyCampaign(),scenes:state}},before=structuredClone(world)
 const actions=[{kind:'interact',operation:'open',target:{kind:'object',id:cabinet.id},note:''},{kind:'interact',operation:'ignite',target:{kind:'object',id:oven.id},note:''},{kind:'interact',operation:'relocate',target:{kind:'object',id:table.id},destination:{x:12,y:10,z:0},note:''}]
 const collection={id:'c',sceneId:'legacy-round',sceneName:'Scene',durationSeconds:10,allowReplace:true,phase:'closed',epoch:2,participantIds:['a'],entries:[{actorId:'a',actorName:'a',revision:1,status:'submitted',actions,resolved:actions.map((a,index)=>({index,objectId:a.target.id})),submittedBy:'gm',submittedAt:'2026-10-24T00:00:00Z',note:''}],history:[]}
 const input={timings:[{actorId:'a',entryRevision:1,budgetMs:10000,costs:actions.map((_,index)=>({index,personalMs:1000}))}],continuations:[],missingDecisions:[],interactionsConfirmed:true}
 assert.throws(()=>calculateRound(world,collection,{...input,interactionsConfirmed:false},'not-confirmed'),/подтверди/i)
 const r=calculateRound(world,collection,input,'legacy-behavior-v022');assert.deepEqual(world,before)
 const objects=r.world.campaign.scenes.scenes[0].objects;assert(objects.find(o=>o.id===cabinet.id).open);assert(objects.find(o=>o.id===oven.id).active);assert.equal(objects.find(o=>o.id===table.id).x,12);assert.equal(objects.find(o=>o.id===table.id).kind,'platform');assert.equal(objects.find(o=>o.id===table.id).artwork,table.artwork)
 assert.deepEqual(r.summary.events.map(e=>e.kind),['open','ignite','relocate']);assert.equal(r.world.campaign.seconds,10)
})

test('Editor ids work without randomUUID while preserving UUIDv4 randomness and native secure-context support',()=>{
 const {sceneEditorId}=load('sceneEditorId'),{webcrypto}=require('node:crypto')
 const source={getRandomValues:bytes=>webcrypto.getRandomValues(bytes)},ids=Array.from({length:1000},()=>sceneEditorId(source))
 assert.equal(new Set(ids).size,1000);assert(ids.every(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)))
 assert.equal(sceneEditorId({randomUUID(){return 'native-id'},getRandomValues(){throw Error('Native path should win')}}),'native-id')
 assert.throws(()=>sceneEditorId({}),/идентификатора/)
})
