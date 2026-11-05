import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename,dirname,join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'world6-physics-'))
test.after(()=>{
  const target=resolve(directory)
  if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('world6-physics-'))throw Error('Refusing cleanup outside the physics test directory')
  return rm(target,{recursive:true,force:true})
})
for(const file of await readdir('src')){
  if(!file.endsWith('.ts'))continue
  const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a.replace(/\.ts$/,'')+'.mjs'+b)
  await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const load=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const units=await load('physicsUnits'),{physicsMaterialPresets,physicsMaterialPreset,isPhysicsMaterial}=await load('physicsMaterials')
const {isPhysicsBody,isPhysicsEnvironment,preserveScenePhysics}=await load('physicsState'),{isPhysicsEvent,orderPhysicsEvents}=await load('physicsEvents')
const {emptyScenes,createScene,sceneObject,isSceneState,copySceneState,moveSceneObject}=await load('scenes'),{copyEditorScene}=await load('sceneEditorSceneCopy')
const {captureSceneAssembly,assemblyLayout,isSceneAssembly}=await load('sceneAssemblies'),{mergeSceneDraft}=await load('sceneDraftMerge')
const {emptyCampaign,isCampaign,copyCampaign}=await load('rpgSchema'),{createCharacterArchive,parseCharacterArchive}=await load('characterTransfer')
const {createDefaultCharacter}=await load('characterModel'),{advanceWorld}=await load('rpgEngine'),{exactAmount}=await load('exactWork'),{publicObject}=await load('scenePerception')
const environment=()=>({version:1,gravityMs2:9.81,ambientTemperatureK:293.15})
const body=(id='water-pure')=>({version:1,material:physicsMaterialPreset(id),massKg:2,temperatureK:298.15,wetnessFraction:0})
function sceneState(physical=true){const state=createScene(emptyScenes(),'scene','Физический полигон','top'),scene=state.scenes[0];scene.objects=[{...sceneObject('crate','object',{x:5,y:5,z:0}),width:1,depth:1,height:1,...(physical?{physics:body()}: {})}];if(physical)scene.physics=environment();return state}
const header=(id='event',atMs=exactAmount(0n))=>({version:1,id,sceneId:'scene',causeId:'action:1',atMs})

test('SI: литры, объём, масса и граница абсолютного нуля',()=>{
  assert.equal(units.litresToCubicMetres(1000),1);assert.equal(units.cubicMetresToLitres(1),1000);assert.equal(units.massFromVolumeKg(1000,.002),2)
  assert.equal(units.celsiusToKelvin(-273.15),0);assert.equal(units.kelvinToCelsius(0),-273.15);assert.equal(units.celsiusToKelvin(25),298.15)
  for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>units.celsiusToKelvin(value))
  assert.throws(()=>units.celsiusToKelvin(-273.151));assert.throws(()=>units.kelvinToCelsius(-1));assert.throws(()=>units.litresToCubicMetres(-1));assert.throws(()=>units.massFromVolumeKg(0,1))
})
test('SI: энергия, импульс и нагрев/охлаждение имеют согласованные единицы',()=>{
  assert.equal(units.kineticEnergyJ(2,3),9);assert.equal(units.momentumNs(2,3),6)
  assert.equal(units.temperatureChangeEnergyJ(2,4180,293.15,303.15),83600)
  assert.equal(units.temperatureChangeEnergyJ(2,4180,303.15,293.15),-83600)
  assert.throws(()=>units.kineticEnergyJ(-1,3));assert.throws(()=>units.kineticEnergyJ(1e24,1e24));assert.throws(()=>units.cubicMetresToLitres(1e24))
})
test('Материалы: примеры проверяемы и возвращаются независимыми снимками',()=>{
  const materials=physicsMaterialPresets();assert.equal(materials.length,7);assert(materials.every(isPhysicsMaterial));assert.equal(new Set(materials.map(m=>m.id)).size,7)
  materials[0].densityKgM3=123;assert.equal(physicsMaterialPreset('water-pure').densityKgM3,997);assert.equal(physicsMaterialPreset('unknown'),undefined)
})
test('Вода: слабая проводимость отличается от неизвестного состава и не зависит от оформления',()=>{
  const pure=physicsMaterialPreset('water-pure'),unknown=physicsMaterialPreset('water-unspecified')
  assert(pure.electricalConductivitySM>0);assert.equal(pure.electricalConductivitySM,5.5e-6);assert.equal(unknown.electricalConductivitySM,null)
  assert.equal(pure.referenceTemperatureK,298.15);assert.match(pure.note,/примеси/)
  const state=sceneState(false);state.scenes[0].objects[0].kind='water';assert(isSceneState(state));assert.equal(state.scenes[0].objects[0].physics,undefined)
})
test('Материалы: неизвестные поля, неверные типы и нечисловые свойства отвергаются',()=>{
  for(const patch of [{phase:['liquid']},{basis:['custom']},{densityKgM3:0},{densityKgM3:Infinity},{specificHeatJKgK:-1},{electricalConductivitySM:NaN},{note:''},{voltage:1000}])assert(!isPhysicsMaterial({...physicsMaterialPreset('water-pure'),...patch}),JSON.stringify(patch))
  assert(isPhysicsMaterial({...physicsMaterialPreset('water-pure'),electricalConductivitySM:0}))
})
test('Профили: строгая версия, положительная масса, температура и доля влажности',()=>{
  assert(isPhysicsBody(body()));assert(isPhysicsEnvironment(environment()));assert(isPhysicsEnvironment({...environment(),gravityMs2:0,ambientTemperatureK:0}))
  for(const patch of [{version:2},{massKg:0},{massKg:-1},{massKg:NaN},{temperatureK:-.01},{wetnessFraction:1.01},{conductive:true}])assert(!isPhysicsBody({...body(),...patch}))
  assert(!isPhysicsEnvironment({...environment(),gravityMs2:-1}));assert(!isPhysicsEnvironment({...environment(),extra:1}))
})
test('Сохранения: прежняя сцена сохраняет значения и не получает новые поля',()=>{
  const state=sceneState(false);assert(isSceneState(state));assert.deepEqual(JSON.parse(JSON.stringify(copySceneState(state))),JSON.parse(JSON.stringify(state)))
  assert(!Object.hasOwn(copySceneState(state).scenes[0],'physics'));assert(!Object.hasOwn(copySceneState(state).scenes[0].objects[0],'physics'))
})
test('Сохранения: физические данные проходят JSON и копируются без общих ссылок',()=>{
  const source=sceneState(),copy=copySceneState(JSON.parse(JSON.stringify(source)));assert(isSceneState(copy));assert.deepEqual(copy,source)
  copy.scenes[0].objects[0].physics.material.note='Изменённая копия';copy.scenes[0].physics.gravityMs2=0
  assert.notEqual(source.scenes[0].objects[0].physics.material.note,'Изменённая копия');assert.equal(source.scenes[0].physics.gravityMs2,9.81)
})
test('Схема сцен: повреждённый профиль и будущая версия не теряются молча',()=>{
  const source=sceneState();source.scenes[0].objects[0].physics.version=2;assert(!isSceneState(source));assert(!isCampaign({...emptyCampaign(),scenes:source}))
  assert.throws(()=>copySceneState(source));source.scenes[0].objects[0].physics=body();source.scenes[0].physics.future=true;assert(!isSceneState(source))
})
test('Перемещение: масса и материал не меняются от координат или размера внешней модели',()=>{
  const state=sceneState(),object=state.scenes[0].objects[0],next=moveSceneObject(state,'scene',{...object,x:8,width:2})
  assert.deepEqual(next.scenes[0].objects[0].physics,object.physics);assert.equal(state.scenes[0].objects[0].x,5)
})
test('Копия сцены: физические снимки исходника и копии полностью независимы',()=>{
  const source=sceneState();let nextId=0;const copy=copyEditorScene(source,'scene','Копия',()=>'fresh-'+ ++nextId)
  assert(isSceneState(copy));assert.deepEqual(copy.scenes[1].objects[0].physics,copy.scenes[0].objects[0].physics)
  copy.scenes[1].objects[0].physics.massKg=55;copy.scenes[1].objects[0].physics.material.note='Только копия';copy.scenes[1].physics.gravityMs2=0
  assert.equal(copy.scenes[0].objects[0].physics.massKg,2);assert.equal(source.scenes[0].physics.gravityMs2,9.81);assert.equal(copy.scenes[0].physics.gravityMs2,9.81)
})
test('Сборки: профиль переносим между сценами и предпросмотр не меняет библиотеку',()=>{
  const source=sceneState(),assembly=captureSceneAssembly(source.scenes[0],[{kind:'object',id:'object'}],'Сборка','assembly')
  assert(isSceneAssembly(JSON.parse(JSON.stringify(assembly))));const placed=assemblyLayout(assembly,{x:10,y:10,z:0},90)
  assert.deepEqual(placed[0].physics,body());placed[0].physics.material.note='Предпросмотр';assert.notEqual(assembly.objects[0].physics.material.note,'Предпросмотр')
  const state=sceneState(false);state.scenes[0].objects=placed;assert(isSceneState(state),'Object snapshots do not require a material registry in another scene')
})
test('Сверка: координаты и профиль объединяются; конкурирующие физические правки требуют решения',()=>{
  const base=sceneState(),local=copySceneState(base),remote=copySceneState(base);local.scenes[0].objects[0].physics.massKg=3;remote.scenes[0].objects[0].x=7
  const merged=mergeSceneDraft(base,local,remote,[]);assert.equal(merged.unresolved,0);assert.equal(merged.state.scenes[0].objects[0].physics.massKg,3);assert.equal(merged.state.scenes[0].objects[0].x,7)
  remote.scenes[0].objects[0].physics.temperatureK=400;const conflict=mergeSceneDraft(base,local,remote,[]);assert.equal(conflict.unresolved,1)
  const resolved=mergeSceneDraft(base,local,remote,[],{[conflict.conflicts[0].id]:'remote'});assert.equal(resolved.unresolved,0);assert.equal(resolved.state.scenes[0].objects[0].physics.temperatureK,400)
})
test('Старый клиент: пропущенные поля сохраняются только у прежнего объекта своей сцены',()=>{
  const before=sceneState(),next=sceneState(false);next.scenes[0].objects[0].x=7
  const another=sceneState(false).scenes[0];another.id='another';next.scenes.push(another);preserveScenePhysics(before,next)
  assert.deepEqual(next.scenes[0].physics,before.scenes[0].physics);assert.deepEqual(next.scenes[0].objects[0].physics,body());assert.equal(next.scenes[1].objects[0].physics,undefined)
  next.scenes[0].objects[0].physics.material.note='Копия';assert.notEqual(before.scenes[0].objects[0].physics.material.note,'Копия')
})
test('Старый клиент: явное снятие профиля и удаление объекта не отменяются сохранением метаданных',()=>{
  const before=sceneState(),next=copySceneState(before);next.scenes[0].physics=null;next.scenes[0].objects[0].physics=null;preserveScenePhysics(before,next)
  assert(isSceneState(next));assert.equal(next.scenes[0].physics,null);assert.equal(copySceneState(next).scenes[0].objects[0].physics,null)
  next.scenes[0].objects=[];preserveScenePhysics(before,next);assert.equal(next.scenes[0].objects.length,0)
})
test('Акустические поля проверяются и переживают запись физического профиля старым клиентом',()=>{
  const before=sceneState(),scene=before.scenes[0],object=scene.objects[0]
  for (const invalid of [NaN,Infinity,-1,161,'30',undefined]) {
    assert(!isPhysicsEnvironment({...scene.physics,backgroundNoiseDb:invalid}))
    assert(!isPhysicsBody({...object.physics,noiseLevelDbAt1m:invalid}))
  }
  scene.physics.backgroundNoiseDb=0;object.physics.noiseLevelDbAt1m=95
  const copy=copySceneState(before);assert.deepEqual(copy,before)
  const next=sceneState();next.scenes[0].physics.gravityMs2=5;next.scenes[0].objects[0].physics.massKg=3
  preserveScenePhysics(before,next)
  assert.equal(next.scenes[0].physics.gravityMs2,5);assert.equal(next.scenes[0].physics.backgroundNoiseDb,0)
  assert.equal(next.scenes[0].objects[0].physics.massKg,3);assert.equal(next.scenes[0].objects[0].physics.noiseLevelDbAt1m,95)
  next.scenes[0].physics.backgroundNoiseDb=null;next.scenes[0].objects[0].physics.noiseLevelDbAt1m=null
  preserveScenePhysics(before,next);assert(isSceneState(next))
  assert.equal(next.scenes[0].physics.backgroundNoiseDb,null);assert.equal(next.scenes[0].objects[0].physics.noiseLevelDbAt1m,null)
})
test('Архив героя и копия кампании сохраняют физику; повреждённый архив отклоняется',()=>{
  const campaign={...emptyCampaign(),scenes:sceneState()},hero={...createDefaultCharacter(),id:'hero',name:'Герой полигона'}
  const archive=createCharacterArchive([hero],'2026-11-05T00:00:00.000Z',campaign),result=parseCharacterArchive(archive)
  assert(result.ok);assert.deepEqual(result.preview.campaign.scenes,campaign.scenes);assert.deepEqual(copyCampaign(campaign).scenes,campaign.scenes)
  const broken=JSON.parse(archive);broken.campaign.scenes.scenes[0].objects[0].physics.massKg=-1;assert(!parseCharacterArchive(JSON.stringify(broken)).ok)
})
test('События: точные доли времени, стабильный порядок и независимые данные',()=>{
  const events=[{...header('z',exactAmount(1n,2n)),kind:'heat',objectId:'object',energyJ:-5},{...header('b',exactAmount(1n,3n)),kind:'matter',objectId:'object',massDeltaKg:2,material:physicsMaterialPreset('water-pure')},{...header('a',exactAmount(1n,3n)),kind:'impulse',objectId:'object',impulseNs:{x:1,y:0,z:-2}}]
  const sorted=orderPhysicsEvents(events);assert.deepEqual(sorted.map(e=>e.id),['a','b','z']);assert.deepEqual(events.map(e=>e.id),['z','b','a'])
  sorted[1].material.note='Копия';sorted[0].impulseNs.x=99;assert.notEqual(events[1].material.note,'Копия');assert.equal(events[2].impulseNs.x,1)
})
test('События: версия, неизвестные поля, повторы и превышение лимита отвергаются',()=>{
  const event={...header(),kind:'sound',position:{x:0,y:0,z:0},powerW:1,durationMs:1000};assert(isPhysicsEvent(event))
  for(const patch of [{version:2},{kind:'unknown'},{powerW:NaN},{powerW:0},{durationMs:-1},{damage:99},{position:{x:0,y:0,z:0,secret:1}},{atMs:{numerator:'2',denominator:'2'}}])assert(!isPhysicsEvent({...event,...patch}))
  assert.throws(()=>orderPhysicsEvents([event,event]));assert.throws(()=>orderPhysicsEvents(Array.from({length:1001},(_,i)=>({...event,id:'e'+i}))))
})
test('Знания игрока: физический профиль не раскрывается вместе с видимым объектом',()=>{
  const object=sceneState().scenes[0].objects[0],visible=publicObject(object);assert(!Object.hasOwn(visible,'physics'));assert(!JSON.stringify(visible).includes(object.physics.material.note))
})
test('Игровой движок: добавление профилей не назначает автоматический урон, падение или нагрев',()=>{
  const plain={characters:[],campaign:{...emptyCampaign(),scenes:sceneState(false)}},physical=structuredClone(plain);physical.campaign.scenes=sceneState()
  const next=advanceWorld(physical,1,'advance'),reference=advanceWorld(plain,1,'advance');assert(next.campaign.scenes.scenes[0].physics)
  delete next.campaign.scenes.scenes[0].physics;delete next.campaign.scenes.scenes[0].objects[0].physics;assert.deepEqual(next,reference)
})
