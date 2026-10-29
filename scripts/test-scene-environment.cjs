const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('three')
const {load}=require('./generate-tabletop-thumbnails.cjs')
const {sceneEnvironment}=load('sceneEnvironment'),{createScene,emptyScenes,isSceneState,copySceneState,replaceScene}=load('scenes')
const {mapFrame,isScenePerceptions}=load('scenePerception'),{masterRenderModel}=load('scene3dModel')
const {createSceneLighting,createLightingEnvironment}=load('scene3dLighting'),{defaultLightTuning}=load('scene3dViewSettings')
const {createSceneBackdrop}=load('scene3dBackdrop'),{withContactGeometry}=load('scene3dContact')

test('Environment: old underground ids and explicit overrides work without treating every stone scene as a cave',()=>{
 assert.equal(sceneEnvironment({id:'example:gallery'}),'underground')
 assert.equal(sceneEnvironment({id:'example:underground'}),'underground')
 assert.equal(sceneEnvironment({id:'example:renamed',background:'pixel-gallery'}),'underground')
 assert.equal(sceneEnvironment({id:'example:gate',palette:'stone',name:'Вход в подземелье'}),'surface')
 assert.equal(sceneEnvironment({id:'example:gallery',environment:'surface'}),'surface')
 assert.equal(sceneEnvironment({id:'arbitrary',environment:'underground'}),'underground')
})
test('Environment: saved scenes keep their setting through validation, copying, edits and export; legacy saves remain valid',()=>{
 const state=createScene(emptyScenes(),'custom-location','Локация','top'),original=structuredClone(state)
 assert(isSceneState(state));assert(!Object.hasOwn(copySceneState(state).scenes[0],'environment'))
 for(const environment of ['surface','underground']){
  const edited=replaceScene(state,{...state.scenes[0],environment}),copy=copySceneState(edited)
  assert.equal(copy.scenes[0].environment,environment);assert(isSceneState(JSON.parse(JSON.stringify(copy))))
  assert.equal(masterRenderModel(copy.scenes[0],[]).frame.environment,environment)
 }
 for(const environment of ['white','auto',null,0,{}])assert(!isSceneState({...state,scenes:[{...state.scenes[0],environment}]}))
 assert.deepEqual(state,original)
})
test('Environment: disclosure copies only the declared presentation setting, including legacy cave defaults',()=>{
 const scene=createScene(emptyScenes(),'campaign:gallery','Имя мастера','top').scenes[0]
 scene.description='secret';scene.objects=[];scene.environment='underground'
 const frame=mapFrame(scene);assert.equal(frame.environment,'underground');assert(!JSON.stringify(frame).includes('secret'));assert(!Object.hasOwn(frame,'objects'))
 const perception={version:1,heroes:[{actorId:'hero',activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Известная область',description:'',frame,areas:[],objects:[],contacts:[]}]}]}
 assert(isScenePerceptions(perception));assert(!isScenePerceptions({...perception,heroes:[{...perception.heroes[0],scenes:[{...perception.heroes[0].scenes[0],frame:{...frame,environment:'white'}}]}]}))
 delete scene.environment;assert.equal(mapFrame(scene).environment,'underground')
})
test('Environment: cavern radiance contains no sun and the general light stays subdued while local lamps remain usable',()=>{
 const frame=createScene(emptyScenes(),'cave','Пещера','top').scenes[0],tuning=defaultLightTuning('day')
 const outdoor=createSceneLighting(frame,'day','balanced',false,tuning,'surface'),cave=createSceneLighting(frame,'day','balanced',false,tuning,'underground')
 const sun=view=>view.group.children.find(o=>o.isDirectionalLight),ambient=view=>view.group.children.find(o=>o.isHemisphereLight)
 assert(sun(cave).intensity<sun(outdoor).intensity*.2);assert(ambient(cave).intensity<ambient(outdoor).intensity*.4);assert(cave.environmentIntensity<outdoor.environmentIntensity*.3)
 const radiance=createLightingEnvironment('day',tuning,'underground');assert.equal(radiance.scene.children[0].material.uniforms.sunPower.value,0)
 const lamp={id:'lamp',geometry:{kind:'lamp',artwork:'expanded-object-torch',height:2,width:.3,depth:.3},appearance:{remembered:false}},anchor=new THREE.Group()
 cave.addLamp(lamp,anchor);assert(anchor.children.some(o=>o.isPointLight&&o.intensity>0))
 outdoor.dispose();cave.dispose();radiance.dispose()
})
test('Environment: the sky never becomes foreground geometry in the contact shadow pass',()=>{
 const frame=createScene(emptyScenes(),'contact-stage','Площадка','top').scenes[0],backdrop=createSceneBackdrop(frame,'surface','day',defaultLightTuning('day'),false,'balanced'),scene=new THREE.Scene()
 scene.add(backdrop.group);const sky=backdrop.group.getObjectByName('backdrop-sky'),ground=backdrop.group.getObjectByName('backdrop-ground')
 withContactGeometry(scene,()=>{assert(!sky.visible);assert(ground.visible)})
 assert(sky.visible&&ground.visible);backdrop.dispose()
})
