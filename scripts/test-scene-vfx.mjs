import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createSceneAbilityEffect} from '../src/scene3dAbilityEffects.ts'
import {abilityVisualStyle} from '../src/abilityVisualStyles.ts'
import {abilityVisualFamilies,abilityVisualPhases} from '../src/abilityVisuals.ts'
import {abilityBurstParticle} from '../src/sceneAbilityDynamics.ts'

const example={id:'mesh-effect',spec:{familyId:'fire',scale:1,intensity:1},start:{x:1,y:2,z:3},end:{x:9,y:2,z:3},phase:'sequence',shape:'point',radius:2,coneAngleDeg:60}
const build=(patch={},low=false,clippingPlanes=[])=>createSceneAbilityEffect({...example,...patch},{low,clippingPlanes})
const sample=(effect,phase='impact',progress=.4,seconds=1.2)=>{effect.update({phase,progress,visible:true},seconds);effect.group.updateMatrixWorld(true);return effect.group}
function resources(group){const result=new Set();group.traverse(o=>{if(o.geometry)result.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])result.add(m);if(o.isInstancedMesh)result.add(o)});return result}

test('Ability VFX: every family has finite actual geometry, bounded instancing and no editor picking in either quality',()=>{
 for(const family of abilityVisualFamilies)for(const low of [false,true]){
  const before=structuredClone(example),effect=build({spec:{familyId:family.id}},low),group=effect.group
  for(const {id:phase} of abilityVisualPhases){
   sample(effect,phase)
   assert(group.visible,family.id+' visible');assert(group.position.toArray().every(Number.isFinite))
   let drawObjects=0,triangles=0
   group.traverse(o=>{
    if(!o.isMesh&&!o.isLine)return
    drawObjects++;assert(!o.castShadow&&!o.receiveShadow);assert(!o.userData.selection)
    for(const attr of Object.values(o.geometry.attributes))assert(attr.array.every(Number.isFinite),family.id+' finite vertices/attributes')
    assert(o.material.opacity>=0&&o.material.opacity<=1)
    if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1)
   })
   assert(drawObjects<=(low?8:13)&&triangles<(low?1000:4000),family.id+' bounded render cost')
   assert.equal(new THREE.Raycaster(group.position.clone().add(new THREE.Vector3(0,10,0)),new THREE.Vector3(0,-1,0)).intersectObject(group,true).length,0,family.id+' never steals a click')
  }
  assert(group.getObjectByName('ability-particles:'+group.children[0].name.split(':')[1]))
  assert.deepEqual(example,before);effect.dispose()
 }
})

test('Ability VFX: world XYZ and phase-local travel are deterministic; residual and hidden states stop displaying',()=>{
 const effect=build({end:{x:9,y:10,z:7}}),group=sample(effect,'preparation',.7)
 assert.deepEqual(group.position.toArray(),[1,3,2]);sample(effect,'release');assert.deepEqual(group.position.toArray(),[1,3,2])
 sample(effect,'travel',.25);assert.deepEqual(group.position.toArray(),[3,4,4])
 const particles=group.children.find(o=>o.isInstancedMesh),snapshot=Array.from(particles.instanceMatrix.array)
 sample(effect,'travel',.25);assert.deepEqual(Array.from(particles.instanceMatrix.array),snapshot,'result is independent of previous update calls')
 sample(effect,'impact');assert.deepEqual(group.position.toArray(),[9,7,10])
 sample(effect,'residue',.6);assert(!group.getObjectByName('ability-core:fire').visible)
 effect.update({phase:'impact',progress:NaN,visible:true},NaN);group.traverse(o=>{assert(o.position.toArray().every(Number.isFinite));assert(o.scale.toArray().every(Number.isFinite))})
 effect.update({phase:'impact',progress:0,visible:false},0);assert(!group.visible)
 effect.dispose();sample(effect);assert.equal(group.children.length,0,'updates after disposal do nothing')
 const none=build({spec:{familyId:'none'}});sample(none);assert(!none.group.visible);none.dispose()
})

test('Ability VFX: sphere radius, beam cylinder and full cone aperture match scene metres regardless of motif scale',()=>{
 for(const low of [false,true])for(const scale of [.25,4])for(const shape of ['sphere','beam','cone']){
  const effect=build({shape,spec:{familyId:'water',scale}},low);sample(effect,'impact')
  const volume=effect.group.getObjectByName('ability-volume:'+shape),bounds=new THREE.Box3().setFromObject(volume,true)
  assert(volume.visible)
  const r=shape==='cone'?8*Math.tan(Math.PI/6):2
  const expectedMin=new THREE.Vector3(shape==='sphere'?7:1,3-r,2-r),expectedMax=new THREE.Vector3(shape==='sphere'?11:9,3+r,2+r)
  assert(bounds.min.distanceTo(expectedMin)<1e-5,shape+' minimum matches spatial geometry')
  assert(bounds.max.distanceTo(expectedMax)<1e-5,shape+' maximum matches spatial geometry')
  effect.dispose()
 }
 for(const shape of ['point','sphere','beam','cone']){
  const effect=build({shape,start:{x:3,y:4,z:2},end:{x:3,y:4,z:2}})
  sample(effect,'impact');effect.group.traverse(o=>{if(o.geometry)for(const a of Object.values(o.geometry.attributes))assert(a.array.every(Number.isFinite))});effect.dispose()
 }
})

test('Ability VFX: elemental motifs are distinct and all materials respect disclosure clipping',()=>{
 const plane=new THREE.Plane(new THREE.Vector3(1,0,0),-5),motifs=[]
 for(const familyId of ['fire','water','earth','wind','electricity','healing','runes']){
  const effect=build({spec:{familyId}},false,[plane]);sample(effect,'impact')
  motifs.push(effect.group.getObjectByName('ability-core:'+({fire:'fire',water:'water',earth:'shards',wind:'wind',electricity:'electricity',healing:'growth',runes:'sigil'}[familyId])).name)
  effect.group.traverse(o=>{if(o.material){assert.deepEqual(o.material.clippingPlanes,[plane]);assert(o.material.transparent&&!o.material.depthWrite)}})
  assert(effect.group.children.find(o=>o.isMesh).material.color.equals(new THREE.Color(abilityVisualFamilies.find(f=>f.id===familyId).primary)))
  effect.dispose()
 }
 assert.equal(new Set(motifs).size,7)
})

test('Ability VFX: GPU resources, including instance buffers, dispose once and detach from their scene',()=>{
 for(const low of [false,true]){
  const effect=build({},low),scene=new THREE.Scene();scene.add(effect.group);sample(effect)
  const objects=resources(effect.group),released=new Map();objects.forEach(o=>o.addEventListener('dispose',()=>released.set(o,(released.get(o)??0)+1)))
  effect.dispose();effect.dispose();assert.equal(effect.group.parent,null);assert.equal(released.size,objects.size)
  assert([...released.values()].every(n=>n===1))
 }
})

test('Ability VFX: local flash is explicit, budget-friendly, shadow-free and follows its stage anchor',()=>{
 for(const familyId of ['fire','electricity','light','healing','runes']){
  const effect=createSceneAbilityEffect({...example,spec:{familyId}},{low:false,light:true}),flash=effect.group.getObjectByName('ability-flash')
  assert(flash?.isPointLight);assert(!flash.castShadow);assert.equal(flash.shadow.map,null);assert(flash.distance<=8)
  assert(flash.color.equals(new THREE.Color(abilityVisualFamilies.find(f=>f.id===familyId).primary)))
  sample(effect,'preparation',.5);assert(flash.visible&&flash.intensity>0)
  let lightWorld=flash.getWorldPosition(new THREE.Vector3());assert(lightWorld.distanceTo(new THREE.Vector3(1,3.32,2))<1e-9)
  sample(effect,'travel',.5);lightWorld=flash.getWorldPosition(new THREE.Vector3());assert(lightWorld.distanceTo(new THREE.Vector3(5,3.32,2))<1e-9)
  sample(effect,'impact',0);const peak=flash.intensity;assert(peak<=27)
  sample(effect,'impact',.9);assert(flash.intensity<peak)
  sample(effect,'residue',1);assert.equal(flash.intensity,0);assert(!flash.visible)
  effect.update({phase:'impact',progress:0,visible:false},0);assert.equal(flash.intensity,0);assert(!flash.visible)
  sample(effect,'impact',.2);assert(flash.visible);effect.dispose();assert.equal(flash.parent,null);assert.equal(flash.intensity,0);assert(!flash.visible)
 }
 const plane=new THREE.Plane(new THREE.Vector3(1,0,0),-1)
 for(const options of [{low:false},{low:true,light:true},{low:false,light:true,clippingPlanes:[plane]}]){
  const effect=createSceneAbilityEffect(example,options);sample(effect);assert(!effect.group.getObjectByProperty('isPointLight',true));effect.dispose()
 }
 const earthy=createSceneAbilityEffect({...example,spec:{familyId:'earth'}},{low:false,light:true});sample(earthy);assert(!earthy.group.getObjectByProperty('isPointLight',true));earthy.dispose()
})

test('Ability VFX: impact contact stays on the specified floor, fades, clips and never appears for airborne endpoints',()=>{
 const plane=new THREE.Plane(new THREE.Vector3(1,0,0),-1),ground=3,effect=createSceneAbilityEffect(example,{low:false,groundZ:ground,clippingPlanes:[plane]}),contact=effect.group.getObjectByName('ability-ground-contact')
 assert(contact?.isMesh)
 for(const phase of ['preparation','release','travel']){sample(effect,phase,.5);assert(!contact.visible)}
 sample(effect,'impact',.4);assert(contact.visible);let bounds=new THREE.Box3().setFromObject(contact,true)
 assert(Math.abs(bounds.min.y-(ground+.015))<1e-7&&Math.abs(bounds.max.y-bounds.min.y)<1e-7,'contact is coplanar with the actual floor, not with the camera or projectile')
 const center=bounds.getCenter(new THREE.Vector3());assert(Math.abs(center.x-9)<1e-7&&Math.abs(center.z-2)<1e-7)
 assert.deepEqual(contact.material.clippingPlanes,[plane]);assert(!contact.castShadow&&!contact.receiveShadow)
 assert.equal(new THREE.Raycaster(new THREE.Vector3(9,10,2),new THREE.Vector3(0,-1,0)).intersectObject(effect.group,true).length,0)
 const opacity=contact.material.opacity;sample(effect,'residue',.7);assert(contact.visible&&contact.material.opacity<opacity)
 sample(effect,'residue',1);assert(!contact.visible);effect.dispose()
 for(const [endpoint,groundZ,low] of [[4,3,false],[2,3,false],[3,undefined,false],[3,NaN,false],[3,3,true]]){
  const e=createSceneAbilityEffect({...example,end:{...example.end,z:endpoint}},{low,groundZ});sample(e);assert(!e.group.getObjectByName('ability-ground-contact'));e.dispose()
 }
 for(const endpoint of [3-.079,3+.079]){
  const e=createSceneAbilityEffect({...example,end:{...example.end,z:endpoint}},{low:false,groundZ:3});sample(e);bounds=new THREE.Box3().setFromObject(e.group.getObjectByName('ability-ground-contact'),true);assert(Math.abs(bounds.min.y-3.015)<1e-7);e.dispose()
 }
})

test('Ability VFX: opt-in light/contact resources detach and dispose once stay within both quality budgets',()=>{
 for(const low of [false,true]){
  const effect=createSceneAbilityEffect(example,{low,light:true,groundZ:3}),scene=new THREE.Scene();scene.add(effect.group);sample(effect,'impact',.4)
  let drawObjects=0;effect.group.traverse(o=>{if(o.isMesh||o.isLine)drawObjects++})
  assert.equal(drawObjects,low?8:12)
  const objects=resources(effect.group),released=new Map(),flash=effect.group.getObjectByName('ability-flash')
  objects.forEach(o=>o.addEventListener('dispose',()=>released.set(o,(released.get(o)??0)+1)))
  effect.dispose();effect.dispose();assert.equal(effect.group.parent,null);assert.equal(released.size,objects.size);assert([...released.values()].every(n=>n===1))
  if(flash){assert.equal(flash.parent,null);assert(!flash.visible);assert.equal(flash.intensity,0)}
 }
})


test('Ability VFX v2: sixty profiles cover twelve distinct silhouettes and never return mutable shared presets',()=>{
 const styles=abilityVisualFamilies.map(f=>abilityVisualStyle(f.id));assert.equal(new Set(styles.map(s=>s.archetype)).size,12)
 for(const style of styles){assert(Object.values(style).every(v=>typeof v!=='number'||Number.isFinite(v)));assert(style.ribbons>=2&&style.ribbons<=4);assert(style.turns>0&&style.spread>0)}
 const fresh=abilityVisualStyle('fire');fresh.turns=999;assert.notEqual(abilityVisualStyle('fire').turns,999)
 assert.notDeepEqual(abilityVisualStyle('fire'),abilityVisualStyle('embers'));assert.notDeepEqual(abilityVisualStyle('water'),abilityVisualStyle('mist'));assert.notDeepEqual(abilityVisualStyle('wind'),abilityVisualStyle('cyclone'))
 for(const id of ['__proto__','constructor','unknown'])assert.equal(abilityVisualStyle(id).archetype,'sigil')
})

test('Ability VFX v2: maximum density, spatial shells and ground contact stay under explicit geometry budgets',()=>{
 for(const family of abilityVisualFamilies)for(const low of [false,true])for(const shape of ['point','sphere','beam','cone']){
  const effect=createSceneAbilityEffect({...example,spec:{familyId:family.id,intensity:2,scale:4},shape,end:{x:9,y:2,z:0}},{low,groundZ:0});sample(effect,'impact',.4)
  let draws=0,triangles=0;effect.group.traverse(o=>{if(o.isMesh||o.isLine)draws++;if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1)})
  assert(draws<=(low?8:13),family.id+' '+shape+' bounded draws');assert(triangles<(low?1000:4000),family.id+' '+shape+' bounded triangles')
  assert.equal(!!effect.group.getObjectByName('ability-field:'+shape),!low&&shape!=='point');effect.dispose()
 }
})

test('Ability VFX v2: surfaces retain Three clipping/instancing/color-space chunks and receive deterministic uniforms',()=>{
 const plane=new THREE.Plane(new THREE.Vector3(1,0,0),-5)
 for(const familyId of ['fire','water','electricity','wind','earth','frost','vegetation','healing','light','void','runes','resonance']){
  const effect=createSceneAbilityEffect({...example,spec:{familyId},shape:'sphere'},{low:false,clippingPlanes:[plane]}),shaders=[]
  effect.group.traverse(o=>{if(o.material?.userData.proceduralSurface){const shader={vertexShader:THREE.ShaderLib[o.material.isMeshPhysicalMaterial?'physical':'basic'].vertexShader,fragmentShader:THREE.ShaderLib[o.material.isMeshPhysicalMaterial?'physical':'basic'].fragmentShader,uniforms:{}};o.material.onBeforeCompile(shader,{});shaders.push(shader);assert(o.material.toneMapped);assert.deepEqual(o.material.clippingPlanes,[plane]);assert(shader.vertexShader.includes('#include <clipping_planes_vertex>'));assert(shader.fragmentShader.includes('#include <clipping_planes_fragment>'));assert(shader.fragmentShader.includes('#include <colorspace_fragment>'));assert(shader.vertexShader.includes('USE_INSTANCING'));assert(!/https?:/.test(shader.fragmentShader));assert.equal(o.material.map,null)}})
  assert(shaders.length>=4);sample(effect,'impact',.3,12.5)
  for(const shader of shaders){assert.equal(shader.uniforms.fxTime.value,12.5);assert(Number.isFinite(shader.uniforms.fxStyle.value));assert(shader.uniforms.fxPower.value<=2)}
  sample(effect,'impact',.3,12.5);effect.dispose()
 }
})

test('Ability VFX v2: ribbons have nonzero surface width, animate without reallocating buffers and respect pause samples',()=>{
 for(const familyId of ['fire','water','electricity','wind','healing','void']){
  const effect=build({spec:{familyId}});sample(effect,'travel',.45,1)
  const ribbon=effect.group.getObjectByName('ability-ribbons:'+abilityVisualStyle(familyId).archetype),geometry=ribbon.geometry,buffer=geometry.attributes.position.array,first=Array.from(buffer)
  assert(geometry.index.count>0);assert(first.every(Number.isFinite));assert(first.some((n,i)=>i>=3&&n!==first[i-3]))
  sample(effect,'travel',.45,1);assert.deepEqual(Array.from(buffer),first,'paused frame is deterministic');sample(effect,'travel',.45,2);assert.notDeepEqual(Array.from(buffer),first,'flow changes over presentation time');assert.equal(ribbon.geometry,geometry);assert.equal(geometry.attributes.position.array,buffer)
  effect.dispose()
 }
})

test('Ability VFX v2: filled sphere/beam/cone surfaces match authoritative bounds at all visual scales',()=>{
 for(const shape of ['sphere','beam','cone'])for(const scale of [.25,4]){
  const effect=build({shape,spec:{familyId:'water',scale}});sample(effect,'impact')
  const field=effect.group.getObjectByName('ability-field:'+shape),wire=effect.group.getObjectByName('ability-volume:'+shape),a=new THREE.Box3().setFromObject(field,true),b=new THREE.Box3().setFromObject(wire,true)
  assert(field.visible);assert(a.min.distanceTo(b.min)<1e-5,shape+' field min');assert(a.max.distanceTo(b.max)<1e-5,shape+' field max');assert(field.material.opacity<=.16);effect.dispose()
 }
})

test('Ability VFX v3: soft atmosphere preserves final billboard positions for clipping and keeps its instance buffers',()=>{
 const plane=new THREE.Plane(new THREE.Vector3(1,0,0),-5),effect=build({},false,[plane]),cloud=effect.group.getObjectByName('ability-atmosphere'),geometry=cloud.geometry,life=geometry.attributes.fxLife.array,matrix=cloud.instanceMatrix.array
 const shader={vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader,uniforms:{}}
 cloud.material.onBeforeCompile(shader,{});assert(shader.vertexShader.includes('mvPosition.xy+=position.xy*fxSize'));assert(shader.vertexShader.includes('#include <clipping_planes_vertex>'));assert(shader.fragmentShader.includes('#include <clipping_planes_fragment>'));assert(shader.fragmentShader.includes('vFxLife'));assert.equal(geometry.attributes.fxSeed.count,cloud.count)
 sample(effect,'impact',.3,1);const first=Array.from(matrix);assert(life.every(n=>n>=0&&n<=1));assert(life.some(n=>n>0));sample(effect,'impact',.3,1);assert.deepEqual(Array.from(matrix),first)
 sample(effect,'impact',.6,2);assert.equal(cloud.geometry,geometry);assert.equal(geometry.attributes.fxLife.array,life);assert.equal(cloud.instanceMatrix.array,matrix);assert.notDeepEqual(Array.from(matrix),first);effect.dispose()
})

test('Ability VFX v3: ice and metal use physical highlights without transmission or external textures',()=>{
 for(const familyId of ['earth','metal','frost','crystal']){
  const effect=build({spec:{familyId}}),core=effect.group.children[0],material=core.material,shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}}
  assert(material.isMeshPhysicalMaterial);assert.equal(material.transmission,0);assert.equal(material.map,null);assert(material.roughness>=0&&material.roughness<=1);assert(!material.depthWrite)
  material.onBeforeCompile(shader,{});assert(shader.fragmentShader.includes('#include <lights_physical_fragment>'));assert(shader.fragmentShader.includes('totalEmissiveRadiance+=fxHighlight'));assert(shader.vertexShader.includes('USE_INSTANCING'))
  if(familyId==='metal')assert(material.metalness>.5);if(familyId==='frost')assert.equal(material.clearcoat,1)
  effect.dispose()
 }
})

test('Ability VFX v3: impact fragments are deterministic and continuous into residue for all sixty styles',()=>{
 for(const family of abilityVisualFamilies){const style=abilityVisualStyle(family.id)
  for(let i=0;i<12;i++){
   const a=new THREE.Vector3(),b=new THREE.Vector3();const end=abilityBurstParticle(style,i,12,'impact',1,.37,a,true),start=abilityBurstParticle(style,i,12,'residue',0,.37,b,true)
   assert(a.distanceTo(b)<1e-9,family.id+' continuous burst');assert.equal(end,start)
   for(const phase of ['impact','residue'])for(const progress of [0,.3,.8,1,NaN]){const opacity=abilityBurstParticle(style,i,12,phase,progress,.37,a,false);assert(a.toArray().every(Number.isFinite));assert(opacity>=0&&opacity<=1)}
  }
 }
})

test('Ability VFX v3: every beam stream spans source to current head without overshooting or replacing buffers',()=>{
 for(const familyId of ['fire','water','earth','healing'])for(const low of [false,true]){
  const effect=build({shape:'beam',spec:{familyId},start:{x:0,y:0,z:0},end:{x:15,y:0,z:0}},low);sample(effect,'travel',.25,1)
  const stream=effect.group.getObjectByName('ability-stream:'+abilityVisualStyle(familyId).archetype),buffer=stream.geometry.attributes.position.array,geometry=stream.geometry,bounds=new THREE.Box3().setFromObject(stream,true)
  assert(stream.visible);assert(Math.abs(bounds.min.x)<1e-6);assert(Math.abs(bounds.max.x-3.75)<1e-6);const before=Array.from(buffer)
  sample(effect,'travel',.25,1);assert.deepEqual(Array.from(buffer),before);sample(effect,'travel',.5,2);assert.equal(stream.geometry,geometry);assert.equal(geometry.attributes.position.array,buffer);assert(buffer.every(Number.isFinite));effect.dispose()
 }
})

test('Ability VFX v3: forked lightning has actual finite surfaces in both qualities and preserves frozen frames',()=>{
 for(const low of [false,true]){
  const effect=build({spec:{familyId:'electricity'}},low);sample(effect,'travel',.6,1);const bolt=effect.group.getObjectByName('ability-ribbons:storm'),buffer=bolt.geometry.attributes.position.array,before=Array.from(buffer)
  assert(bolt.isMesh&&bolt.geometry.index.count>100);assert(before.every(Number.isFinite));assert(before.some((n,i)=>i%3===1&&Math.abs(n)>.3));sample(effect,'travel',.6,1);assert.deepEqual(Array.from(buffer),before);sample(effect,'travel',.6,1.1);assert.notDeepEqual(Array.from(buffer),before);effect.dispose()
 }
})

test('Ability VFX v3: elemental ground paint has twelve profiles and invalid samples cannot poison GPU attributes',()=>{
 const contacts=new Set()
 for(const familyId of ['fire','water','electricity','wind','earth','frost','vegetation','healing','light','void','runes','resonance']){
  const effect=createSceneAbilityEffect({...example,spec:{familyId},end:{...example.end,z:0}},{low:false,groundZ:0}),contact=effect.group.getObjectByName('ability-ground-contact'),shader={vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader,uniforms:{}}
  contacts.add(contact.material.userData.elementalContact);contact.material.onBeforeCompile(shader,{});assert(shader.fragmentShader.includes('#include <clipping_planes_fragment>'));assert(shader.fragmentShader.includes('fxProgress'));assert(!/https?:|sampler2D/.test(shader.fragmentShader))
  effect.update({phase:'impact',progress:NaN,visible:true},NaN);effect.group.traverse(o=>{if(o.geometry)for(const a of Object.values(o.geometry.attributes))assert(a.array.every(Number.isFinite),familyId+' finite '+o.name);if(o.material)assert(o.material.opacity>=0&&o.material.opacity<=1)})
  effect.dispose()
 }
 assert.equal(contacts.size,12)
})
