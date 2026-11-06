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
const {emptyScenes,createScene,sceneObject,isSceneState,copySceneState,moveSceneObject,placeSceneToken}=await load('scenes'),{copyEditorScene}=await load('sceneEditorSceneCopy')
const {captureSceneAssembly,assemblyLayout,isSceneAssembly}=await load('sceneAssemblies'),{mergeSceneDraft}=await load('sceneDraftMerge')
const {emptyCampaign,isCampaign,copyCampaign}=await load('rpgSchema'),{createCharacterArchive,parseCharacterArchive}=await load('characterTransfer')
const {createDefaultCharacter}=await load('characterModel'),{advanceWorld}=await load('rpgEngine'),{exactAmount}=await load('exactWork'),{publicObject}=await load('scenePerception')
const {pureWater,waterConductivitySM,waterPH,waterReagents}=await load('waterPhysics'),{calculateCircuit}=await load('electricalCircuit')
const {applyAbilityPhysics}=await load('abilityPhysics')
const {advanceWaterFlow,settleWaterSupports,waterRoundChanges}=await load('waterFlow')
const {advanceMovement}=await load('sceneMovement')
const {perceivedMap,preparePerception,emptyPerception}=await load('scenePerception')
const {advanceThermal,applyHeat,smokeVisibilityM}=await load('thermalPhysics')
const {sceneOptics}=await load('sceneOptics')
const {perceivedRenderModel}=await load('scene3dModel')
const {advanceFalls,nextFallSeconds}=await load('structuralPhysics')
const {planSlide,slideStep,applySlide,checkDoorSlideClearance}=await load('horizontalPhysics')
const {duplicateEditorGroup}=await load('sceneEditorCommands')
const {BOILING_ENTHALPY_J_KG,FUSION_J_KG,VAPORIZATION_J_KG,waterVolumeM3,liquidEnthalpy}=await load('waterPhysics')
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

const pool=(id,x)=>({...sceneObject('water',id,{x,y:5,z:0}),width:2,depth:1,height:.1,water:pureWater()})
const discharge=(x,y=5,z=.05)=>({kind:'discharge',returnContact:{x,y,z},voltageV:24,limitA:.5,durationMs:100,thresholdA:.02})
const flowCell=(id,x,height=.2,z=0)=>({...pool(id,x),z,height,water:{...pureWater(),flow:true}})
const totals=cells=>['volume','saltKg','sedimentKg'].map(key=>cells.reduce((sum,c)=>sum+(key==='volume'?c.width*c.depth*c.height:c.water[key]),0))
const closeTo=(actual,expected)=>assert(Math.abs(actual-expected)<1e-10,`${actual} differs from ${expected}`)

function slidingCrate() {
 const state=sceneState(),scene=state.scenes[0]
 scene.physics.gravityMs2=10
 const crate={...scene.objects[0],x:4,physics:{...body('wood'),massKg:10,
   sliding:{dryFriction:.2,wetFriction:.05,impactTransfer:.5,vxMs:0,vyMs:0}}}
 scene.objects=[crate]
 const push=(impulseNs=60,fromX=2)=>applyAbilityPhysics(scene,{x:crate.x,y:crate.y,z:.5},'unused',{kind:'push-object',impulseNs},{x:fromX,y:crate.y,z:0})
 const advance=seconds=>{const step=slideStep(planSlide(scene),seconds);return {step,impact:applySlide(scene,step)}}
 return {state,scene,crate,push,advance}
}

test('Скольжение: импульс зависит от массы, смачивание меняет торможение, скорость переживает копию',()=>{
 const dry=slidingCrate(),wet=slidingCrate(),heavy=slidingCrate()
 wet.crate.physics.wetnessFraction=1
 heavy.crate.physics.massKg=20
 assert.equal(dry.push().speedMs,6);assert.equal(wet.push().speedMs,6);assert.equal(heavy.push().speedMs,3)
 dry.advance(.5);wet.advance(.5)
 closeTo(dry.crate.x,6.75);closeTo(dry.crate.physics.sliding.vxMs,5)
 assert(wet.crate.x>dry.crate.x);closeTo(wet.crate.physics.sliding.vxMs,5.75)
 const saved=copySceneState(JSON.parse(JSON.stringify(dry.state))).scenes[0]
 const rest=slideStep(planSlide(saved),10)
 assert(rest.stopped);assert.equal(rest.collision,undefined);closeTo(rest.point.x,13)
 const once=slidingCrate();once.push()
 closeTo(once.advance(10).step.point.x,rest.point.x)
 const stoppedByImpulse=wet.push(wet.crate.physics.sliding.vxMs*10,wet.crate.x+2)
 closeTo(stoppedByImpulse.speedMs,0);assert.equal(planSlide(wet.scene),undefined)
})

test('Скольжение: тонкая дверь останавливает предмет, открытая пропускает, герой защищён от автоматического удара',()=>{
 const {scene,crate,push,advance}=slidingCrate()
 const gate={...sceneObject('door','gate',{x:8,y:5,z:0}),width:.1,depth:1,height:2}
 const wall={...sceneObject('wall','wall',{x:12,y:5,z:0}),width:1,depth:1,height:2,
   physics:{...body('stone'),structure:{failureJ:1e6,absorbedJ:0}}}
 scene.objects.push(gate,wall)
 push(300)
 const hitGate=advance(1)
 assert.equal(hitGate.step.collision.contact.objectId,'gate');closeTo(crate.x,7.45)
 gate.open=true
 push(300,6)
 const hitWall=advance(1)
 assert.equal(hitWall.step.collision.contact.objectId,'wall');closeTo(crate.x,11)
 closeTo(hitWall.impact.energyJ,hitWall.step.collision.energyJ/2)
 closeTo(wall.physics.structure.absorbedJ,hitWall.impact.energyJ)
 const protectedScene=slidingCrate()
 protectedScene.scene.tokens=[{actorId:'bystander',x:6,y:5,z:0,diameter:1,support:{kind:'ground'}}]
 protectedScene.push()
 const stopped=protectedScene.advance(1)
 assert.deepEqual(stopped.step.collision.contact,{kind:'actor',actorId:'bystander'})
 assert.equal(stopped.impact,undefined);closeTo(protectedScene.crate.x,5)
})

test('Скольжение: редактор копирует настройки, не копируя скорость, дверь проверяет занятый проём',()=>{
 const {state,scene,crate,push}=slidingCrate()
 push()
 const old=copySceneState(state)
 delete old.scenes[0].objects[0].physics.sliding
 preserveScenePhysics(state,old);assert.equal(old.scenes[0].objects[0].physics.sliding.vxMs,6)
 const duplicate=duplicateEditorGroup(state,[{kind:'object',id:crate.id}],()=> 'copy').state.scenes[0]
 assert.equal(duplicate.objects[0].physics.sliding.vxMs,6)
 assert.deepEqual(duplicate.objects[1].physics.sliding,{...crate.physics.sliding,vxMs:0})
 const gate={...sceneObject('door','gate',{x:4.4,y:5,z:0}),open:true,width:.2,depth:1,height:2}
 scene.objects.push(gate)
 assert.throws(()=>checkDoorSlideClearance(scene,gate.id),/мешает предмет/)
 const moved=moveSceneObject(state,scene.id,{...crate,x:6})
 assert.equal(moved.scenes[0].objects[0].physics.sliding.vxMs,0)
 assert.equal(crate.physics.sliding.vxMs,6)
})

function breakablePlatform() {
 const state=sceneState(),scene=state.scenes[0]
 scene.physics.gravityMs2=10
 const upper={...sceneObject('platform','upper',{x:5,y:5,z:7}),width:2,depth:2,height:1,
   physics:{...body('wood'),structure:{failureJ:200,absorbedJ:0}}}
 const lower={...sceneObject('platform','lower',{x:5,y:5,z:1}),width:2,depth:2,height:1}
 scene.objects=[upper,lower]
 scene.tokens=[{actorId:'rider',x:5,y:5,z:8,diameter:.6,support:{kind:'object',objectId:upper.id},landing:{massKg:60,region:'torso',contactCm2:100}}]
 return {state,scene,upper,lower,strike:energyJ=>applyAbilityPhysics(scene,{x:5,y:5,z:7.5},'unused',{kind:'structural-impact',energyJ})}
}

test('Конструкции: накапливают удар, разрушаются и приземляют героя по времени на ближайшую опору',()=>{
 const {state,scene,upper,strike}=breakablePlatform()
 assert.equal(strike(75).collapsed,false)
 assert.equal(upper.physics.structure.absorbedJ,75)
 assert.deepEqual(scene.tokens[0].support,{kind:'object',objectId:'upper'})
 assert.equal(strike(125).collapsed,true)
 assert.deepEqual(scene.objects.map(o=>o.id),['lower'])
 closeTo(nextFallSeconds(scene),Math.sqrt(1.2))
 assert.deepEqual(advanceFalls(scene,.5),[])
 assert.equal(scene.tokens[0].z,6.75);assert.equal(scene.tokens[0].fall.speedMs,5)
 const resumed=copySceneState(JSON.parse(JSON.stringify(state)))
 assert(isSceneState(resumed))
 const [landing]=advanceFalls(resumed.scenes[0],1)
 assert.equal(landing.toZ,2);closeTo(landing.speedMs,Math.sqrt(120))
 assert.deepEqual(landing.support,{kind:'object',objectId:'lower'})
 assert.equal(resumed.scenes[0].tokens[0].fall,undefined)
 assert.deepEqual(advanceFalls(resumed.scenes[0],2),[])
})

test('Конструкции: в невесомости опора исчезает без ускорения, препятствие останавливает расчёт атомарно',()=>{
 const zero=breakablePlatform();zero.scene.physics.gravityMs2=0
 zero.strike(200);assert.equal(zero.scene.tokens[0].fall,undefined)
 assert.deepEqual(zero.scene.tokens[0].support,{kind:'air'})
 assert.equal(zero.scene.tokens[0].z,8)
 const {scene,strike}=breakablePlatform()
 scene.objects.push({...sceneObject('wall','blocking-side',{x:5.65,y:5,z:4}),width:1,depth:1,height:2})
 strike(200)
 const falling=structuredClone(scene.tokens)
 assert.throws(()=>advanceFalls(scene,1),/препятствие сбоку/)
 assert.deepEqual(scene.tokens,falling)
})

test('Конструкции: старый клиент сохраняет прочность и падение, ручная перестановка прекращает падение',()=>{
 const {state,scene,strike}=breakablePlatform(),legacy=copySceneState(state)
 delete legacy.scenes[0].objects[0].physics.structure;delete legacy.scenes[0].tokens[0].landing
 preserveScenePhysics(state,legacy)
 assert.equal(legacy.scenes[0].objects[0].physics.structure.failureJ,200)
 assert.equal(legacy.scenes[0].tokens[0].landing.massKg,60)
 legacy.scenes[0].objects[0].physics.structure.absorbedJ=20
 assert.equal(scene.objects[0].physics.structure.absorbedJ,0)
 strike(200);advanceFalls(scene,.5)
 const snapshot=copySceneState(state)
 delete snapshot.scenes[0].tokens[0].fall
 preserveScenePhysics(state,snapshot)
 assert.equal(snapshot.scenes[0].tokens[0].fall.speedMs,5)
 const moved=placeSceneToken(snapshot,scene.id,{...snapshot.scenes[0].tokens[0],z:0,support:{kind:'ground'}})
 assert.equal(moved.scenes[0].tokens[0].fall,null)
 assert.equal(moved.scenes[0].tokens[0].landing.massKg,60)
})

function thermalRoom() {
 const state=sceneState(),scene=state.scenes[0]
 Object.assign(scene,{width:8,depth:6,minZ:0,maxZ:3,objects:[]})
 scene.physics.atmosphere={oxygenFraction:.2095,smokeKg:0,steamKg:0,outsideTemperatureK:293.15,doorVentilation:true}
 return {state,scene,air:scene.physics.atmosphere}
}

test('Тепло: скрытая теплота удерживает 0 °C при таянии, замерзание размыкает цепь',()=>{
 const {scene}=thermalRoom(),water={...pool('ice',4),height:.001,water:{...pureWater(),saltKg:.001,enthalpyJKg:0}}
 scene.objects=[water]
 const aim={x:3.5,y:5,z:.0001},settings=discharge(4.5,5,.0001)
 assert.equal(calculateCircuit(scene,aim,settings).status,'open')
 let heat=applyAbilityPhysics(scene,aim,'unused',{kind:'heat',energyKJ:334})
 closeTo(heat.iceFraction,.5);closeTo(heat.temperatureK,273.15)
 assert.equal(calculateCircuit(scene,aim,settings).status,'closed')
 heat=applyAbilityPhysics(scene,aim,'unused',{kind:'heat',energyKJ:-334})
 assert.equal(heat.iceFraction,1);assert.equal(water.water.saltKg,.001)
 assert.equal(calculateCircuit(scene,aim,settings).status,'open')
 const before=structuredClone(scene)
 assert.throws(()=>applyHeat(scene,water,-2000),/недостаточно/)
 assert.deepEqual(scene,before)
})

test('Тепло: при кипении сохраняются вода с паром, энергия и масса осадка',()=>{
 const {state,scene,air}=thermalRoom(),water={...pool('boil',4),height:.001,water:{...pureWater(),saltKg:.003,sedimentKg:.007,enthalpyJKg:BOILING_ENTHALPY_J_KG}}
 scene.objects=[water]
 const capacity=1.2*8*6*3*1005
 const ledger=()=>waterVolumeM3(water)*1000*water.water.enthalpyJKg+
   air.steamKg*(BOILING_ENTHALPY_J_KG+VAPORIZATION_J_KG)+(scene.physics.ambientTemperatureK-373.15)*(capacity+1850*air.steamKg)
 const before=ledger(),half=applyHeat(scene,water,VAPORIZATION_J_KG/1000)
 closeTo(half.evaporatedKg,1);closeTo(waterVolumeM3(water)*1000+air.steamKg,2)
 assert(Math.abs(ledger()-before-VAPORIZATION_J_KG)<1e-7)
 applyHeat(scene,water,VAPORIZATION_J_KG/1000+10)
 closeTo(water.height,0);closeTo(air.steamKg,2);assert(isSceneState(state))
 assert(Math.abs(ledger()-before-2*VAPORIZATION_J_KG-10000)<1e-7)
 assert.throws(()=>applyAbilityPhysics(scene,{x:4,y:5,z:0},'overlap',{kind:'create-water',widthM:1,depthM:.5,heightM:.01}),/свободное место/)
 applyAbilityPhysics(scene,{x:4,y:5,z:0},'unused',{kind:'fill-water',volumeL:2})
 assert.equal(water.water.saltKg,.003);assert.equal(water.water.sedimentKg,.007)
 assert.equal(water.water.enthalpyJKg,liquidEnthalpy(scene.physics.ambientTemperatureK))
})

test('Тепло: закрытая сцена сохраняет тепло при обмене, поток переносит его вместе с водой',()=>{
 const {scene}=thermalRoom(),source=flowCell('hot',4,.2),other=flowCell('cold',6,.03)
 source.water.enthalpyJKg=liquidEnthalpy(350);other.water.enthalpyJKg=liquidEnthalpy(275)
 scene.objects=[source,other]
 const energy=()=>scene.objects.reduce((total,o)=>total+waterVolumeM3(o)*1000*o.water.enthalpyJKg,0)+
   (scene.physics.ambientTemperatureK-373.15)*8*6*3*1.2*1005
 const initial=energy()
 advanceWaterFlow(scene,2)
 assert(other.height>.03);assert(other.water.enthalpyJKg>liquidEnthalpy(275))
 assert(Math.abs(energy()-initial)<1e-6)
 advanceThermal(scene,2)
 assert(scene.physics.ambientTemperatureK>293.15);assert(Math.abs(energy()-initial)<1e-6)
 source.water.enthalpyJKg=FUSION_J_KG/2
 const levels=scene.objects.map(o=>o.height)
 advanceWaterFlow(scene,2)
 assert.deepEqual(scene.objects.map(o=>o.height),levels)
})

test('Тепло: участок оттаивает и начинает течь до следующего действия',()=>{
 const {scene}=thermalRoom(),source=flowCell('thaw',4,.01),receiver=flowCell('dry',6,0)
 source.water.enthalpyJKg=FUSION_J_KG-.1
 scene.objects=[source,receiver]
 advanceThermal(scene,2)
 assert(source.water.enthalpyJKg>=FUSION_J_KG)
 assert(receiver.height>0)
 closeTo(waterVolumeM3(source)+waterVolumeM3(receiver),.02)
})

test('Горение: влажность замедляет расход, вода гасит, кислород ограничивает огонь, дверь выпускает дым',()=>{
 const {scene,air}=thermalRoom()
 const flame=(id,x,wetnessFraction)=>({...sceneObject('lamp',id,{x,y:4,z:0}),width:.3,depth:.3,height:.1,active:true,
   physics:{...body('wood'),wetnessFraction,combustion:{fuelKg:1,burnRateKgS:.01,ignitionTemperatureK:600}}})
 const dry=flame('dry',2,0),damp=flame('damp',3,.5),soaked=flame('soaked',5,0)
 const gate={...sceneObject('door','door',{x:7,y:2,z:0}),height:2,width:1,depth:.2}
 scene.objects=[dry,damp,soaked,{...pool('pool',5),y:4,height:.2},gate]
 advanceWaterFlow(scene,0)
 advanceThermal(scene,1)
 closeTo(dry.physics.combustion.fuelKg,.99);closeTo(damp.physics.combustion.fuelKg,.9975)
 assert.equal(soaked.active,false);assert.equal(soaked.physics.combustion.fuelKg,1)
 assert(air.oxygenFraction<.2095);assert(air.smokeKg>0);assert(scene.physics.ambientTemperatureK>293.15)
 air.oxygenFraction=.15001;advanceThermal(scene,1)
 assert.equal(dry.active,false);assert.equal(damp.active,false)
 const smoke=air.smokeKg;air.steamKg=.1;gate.open=true;advanceThermal(scene,60)
 assert(air.smokeKg<smoke&&air.oxygenFraction>.15&&air.steamKg<.1)
 assert.equal(dry.active,false)
 const ignition=applyHeat(scene,dry,2*(600-dry.physics.temperatureK+1)*1.7)
 assert.equal(ignition.ignited,true)
})

test('Дым: проекция скрывает далёкую цель, сохраняет память и слух, не выдаёт физический профиль',()=>{
 const {state,scene,air}=thermalRoom(),self={id:'viewer',name:'Герой',profile:{}},other={id:'npc',name:'Дозорный',profile:{}}
 scene.tokens=[{actorId:self.id,x:1,y:1,z:0},{actorId:other.id,x:6,y:4,z:0}].map(t=>({...t,diameter:1,support:{kind:'ground'}}))
 const near={...pool('near',2),y:1,water:{...pureWater(),enthalpyJKg:0}},far={...sceneObject('crate','far',{x:6,y:4,z:0})}
 scene.objects=[near,far]
 const projection=(kind,visible=true)=>preparePerception({activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Зал',description:'',
   areas:[{id:'area',x:0,y:0,z:0,width:8,depth:6,height:3,visible:true}],objects:[{objectId:near.id,visible:true},{objectId:far.id,visible}],
   contacts:[{actorId:other.id,kind,label:'Дозорный',signs:'',showHeight:true,point:{x:6,y:4,z:0},radius:1}]}]},emptyPerception(self.id),state,[self.id,other.id])
 const sight=projection('identified'),memory=projection('sound',false)
 air.smokeKg=.014
 assert(smokeVisibilityM(scene)>1&&smokeVisibilityM(scene)<4)
 const map=perceivedMap(sight,state,[self,other])
 assert.deepEqual(map.objects.map(o=>o.id),['near']);assert.equal(map.objects[0].iceCover,'ice')
 assert.deepEqual(map.contacts.map(c=>c.kind),['self']);assert.equal(Object.hasOwn(map.objects[0],'water'),false)
 assert.equal(Object.hasOwn(map,'atmosphere'),false)
 const remembered=perceivedMap(memory,state,[self,other])
 assert(remembered.objects.some(o=>o.id==='far'&&!o.visible));assert(remembered.contacts.some(c=>c.kind==='sound'))
 air.smokeKg=0
 assert(perceivedMap(sight,state,[self,other]).contacts.some(c=>c.kind==='identified'))
})

function opticsRoom(ambientLux=0) {
 const room=thermalRoom()
 room.scene.physics.vision={ambientLux,detectionLux:1}
 return room
}
const lamp=(id,x,intensity,y=3)=>({...sceneObject('lamp',id,{x,y,z:0}),height:1.5,physics:{...body('steel'),lightIntensityCd:intensity}})

test('Оптика: освещённость убывает с квадратом расстояния, источники складываются и гаснут',()=>{
 const {scene}=opticsRoom(),eye={x:1,y:3,z:0},at=x=>({x,y:3,z:0})
 const first=lamp('first',1,4),second=lamp('second',1,5)
 scene.objects=[first]
 assert(sceneOptics(scene,eye).seesToken(at(2.99)))
 assert(!sceneOptics(scene,eye).seesToken(at(3.01)))
 assert(!sceneOptics(scene,eye).seesToken(at(3.99)))
 scene.objects.push(second)
 assert(sceneOptics(scene,eye).seesToken(at(3.99)))
 assert(!sceneOptics(scene,eye).seesToken(at(4.01)))
 second.active=false
 assert(!sceneOptics(scene,eye).seesToken(at(3.99)))
 first.physics.lightIntensityCd=0
 assert(!sceneOptics(scene,eye).seesObject(first))
})

test('Оптика: дверь блокирует луч от лампы и луч от цели; дым ослабляет свет на обоих отрезках',()=>{
 const {scene,air}=opticsRoom(),eye={x:2,y:3,z:0},target={x:5,y:3,z:0}
 const door={...sceneObject('door','door',{x:4,y:3,z:0}),width:.2,depth:2,height:2,blocksSight:true,open:false}
 scene.objects=[door]
 scene.physics.vision.ambientLux=10
 assert(!sceneOptics(scene,eye).seesToken(target))
 door.open=true
 assert(sceneOptics(scene,eye).seesToken(target))

 scene.physics.vision.ambientLux=0
 scene.objects.push(lamp('behind',7,36))
 door.x=6;door.open=false
 assert(!sceneOptics(scene,eye).seesToken(target))
 door.open=true
 assert(sceneOptics(scene,eye).seesToken(target))

 scene.objects=[lamp('front',1,36)]
 assert(sceneOptics(scene,eye).seesToken(target))
 // In this room either leg by itself leaves over 1 lx, both together leave less.
 air.smokeKg=.003
 assert(!sceneOptics(scene,eye).seesToken(target))
 air.smokeKg=0
 assert(sceneOptics(scene,eye).seesToken(target))
})

test('Оптика: проекция не выдаёт скрытый источник, сохраняет память и слух',()=>{
 const {state,scene,air}=opticsRoom(),self={id:'viewer',name:'Герой',profile:{}},other={id:'other',name:'Дозорный',profile:{}}
 scene.tokens=[{actorId:self.id,x:2,y:3,z:0},{actorId:other.id,x:5,y:3,z:0}]
   .map(t=>({...t,diameter:1,support:{kind:'ground'}}))
 const secret=lamp('SECRET-LIGHT',1,100),known=lamp('known',2,4,4),memory=sceneObject('crate','memory',{x:6,y:3,z:0})
 scene.objects=[secret,known,memory]
 const disclosure=kind=>preparePerception({activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Зал',description:'',
   areas:[{id:'area',x:0,y:0,z:0,width:8,depth:6,height:3,visible:true}],objects:[{objectId:known.id,visible:true},{objectId:memory.id,visible:false}],
   contacts:[{actorId:other.id,kind,label:'Дозорный',signs:'',showHeight:true,point:{x:5,y:3,z:0},radius:1}]}]},emptyPerception(self.id),state,[self.id,other.id])
 const vision=disclosure('identified'),hearing=disclosure('sound')
 let map=perceivedMap(vision,state,[self,other]),model=perceivedRenderModel(map)
 assert(map.contacts.some(c=>c.kind==='identified'));assert.equal(map.objects[0].light,'faint');assert(model.dim)
 assert.equal(model.entities.find(o=>o.id===known.id).appearance.light,'faint')
 for(const view of [map,model])assert.doesNotMatch(JSON.stringify(view),/SECRET-LIGHT|ambientLux|detectionLux|lightIntensityCd|atmosphere/)
 air.smokeKg=.02
 map=perceivedMap(vision,state,[self,other])
 assert.deepEqual(map.optics,{dim:true,smoke:true});assert.equal(map.smokeVisibilityM,undefined)
 assert.deepEqual(map.contacts.map(c=>c.kind),['self'])
 map=perceivedMap(hearing,state,[self,other])
 assert(map.objects.some(o=>o.id===memory.id&&!o.visible));assert(map.contacts.some(c=>c.kind==='sound'))
 air.smokeKg=0;scene.tokens.shift()
 map=perceivedMap(vision,state,[self,other])
 assert.deepEqual(map.optics,{dim:false,unplaced:true})
 assert.deepEqual(map.contacts,[]);assert.deepEqual(map.objects.map(o=>o.id),[memory.id])
})

test('Оптика: профиль сохраняется при копировании и обновлении со старого клиента',()=>{
 const {state,scene}=opticsRoom(.25)
 scene.objects=[lamp('source',1,0)]
 assert(isSceneState(state));assert(!isPhysicsEnvironment({...scene.physics,vision:{ambientLux:0,detectionLux:0}}))
 assert(!isPhysicsBody({...scene.objects[0].physics,lightIntensityCd:-1}))
 const old=copySceneState(state),copy=old.scenes[0]
 assert.notEqual(copy.physics.vision,scene.physics.vision);assert.equal(copy.objects[0].physics.lightIntensityCd,0)
 delete copy.physics.vision;delete copy.objects[0].physics.lightIntensityCd
 preserveScenePhysics(state,old)
 assert.deepEqual(copy.physics.vision,{ambientLux:.25,detectionLux:1});assert.equal(copy.objects[0].physics.lightIntensityCd,0)
 copy.physics.vision=null;copy.objects[0].physics.lightIntensityCd=null
 preserveScenePhysics(state,old)
 assert(isSceneState(old));assert.equal(sceneOptics(copy,{x:1,y:3,z:0}),undefined);assert.equal(copy.objects[0].physics.lightIntensityCd,null)
})

test('Растекание: дверь меняет путь воды, переносит соль и песок, смачивает предмет и замыкает контакт',()=>{
 const state=sceneState(),scene=state.scenes[0],source=flowCell('source',4),receiver=flowCell('receiver',6,0)
 source.water.saltKg=.4;source.water.sedimentKg=.1
 const gate={...sceneObject('door','gate',{x:5,y:5,z:0}),width:.2,depth:1,height:2}
 const prop={...sceneObject('crate','prop',{x:6.5,y:5,z:0}),width:.3,depth:.3,height:.1,physics:body('wood')}
 scene.objects=[source,receiver,gate,prop]
 const original=totals([source,receiver]),aim={x:3.5,y:5,z:.02},settings=discharge(6.25,5,.02)
 advanceWaterFlow(scene,5)
 assert.equal(receiver.height,0);assert.equal(prop.physics.wetnessFraction,0)
 assert.equal(calculateCircuit(scene,aim,settings).status,'open')
 gate.open=true
 advanceWaterFlow(scene,12)
 assert(receiver.height>.08&&receiver.height<=.1)
 assert(receiver.water.saltKg>0&&receiver.water.sedimentKg>0)
 assert(prop.physics.wetnessFraction>0)
 totals([source,receiver]).forEach((total,index)=>closeTo(total,original[index]))
 assert.deepEqual(calculateCircuit(scene,aim,settings).path.map(o=>o.id),['source','receiver'])
 assert(isSceneState(state))
})

test('Растекание: несколько выходов сохраняют воду и примеси, нулевая гравитация удерживает уровень',()=>{
 const scene=sceneState().scenes[0],left=flowCell('left',4,0),source=flowCell('source',6),right=flowCell('right',8,0)
 source.water.base='unknown';source.water.saltKg=1;source.water.sedimentKg=.5
 const isolated=flowCell('isolated',15,0);isolated.water.base='unknown'
 scene.objects=[left,source,right,isolated]
 const original=totals(scene.objects)
 scene.physics.gravityMs2=0;advanceWaterFlow(scene,15)
 assert.equal(left.height,0);assert.equal(right.height,0)
 scene.physics.gravityMs2=9.81;advanceWaterFlow(scene,120)
 assert(left.height>0&&right.height>0);closeTo(left.height,right.height)
 assert.equal(left.water.base,'unknown');assert.equal(right.water.base,'unknown')
 assert.equal(isolated.water.base,'unknown');assert.equal(isolated.height,0)
 totals(scene.objects).forEach((total,index)=>closeTo(total,original[index]))
})

test('Растекание: персонаж с осушенной водной опоры оказывается на ближайшей площадке ниже',()=>{
 const state=sceneState(),scene=state.scenes[0],upper={...flowCell('upper',4,.005,1.5),canSupport:true},lower=flowCell('lower',6,0)
 const platform={...sceneObject('platform','platform',{x:4,y:5,z:0}),width:1,depth:1,height:1}
 scene.objects=[upper,lower,platform]
 scene.tokens=[{actorId:'rider',x:4,y:5,z:1.505,diameter:1,support:{kind:'object',objectId:'upper'}}]
 assert(isSceneState(state))
 advanceWaterFlow(scene,300)
 assert(upper.height<.0001)
 assert.deepEqual(settleWaterSupports(scene),[{actorId:'rider',waterId:'upper',fromZ:1.505,toZ:1,lostSupport:true}])
 assert.deepEqual(scene.tokens[0].support,{kind:'object',objectId:'platform'})
 assert(isSceneState(state))
})

test('Растекание: сухой участок можно наполнить, копия сохраняет настройку, игрок видит только заполненную геометрию',()=>{
 const state=sceneState(false),scene=state.scenes[0],cell=flowCell('prepared',4,0)
 scene.objects=[cell]
 const knowledge=preparePerception({activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Вода',description:'',
  areas:[{id:'area',x:0,y:0,z:0,width:10,depth:10,height:4,visible:true}],objects:[{objectId:cell.id,visible:true}],contacts:[]}]},
  emptyPerception('viewer'),state,['viewer'])
 assert.equal(perceivedMap(knowledge,state,[]).objects.length,0)
 const filled=applyAbilityPhysics(scene,{x:4,y:5,z:0},'unused',{kind:'fill-water',volumeL:100})
 assert.equal(filled.volumeL,100);assert.equal(cell.height,.05)
 const [visible]=perceivedMap(knowledge,state,[]).objects
 assert.equal(visible.waterVolume,true);assert(!Object.hasOwn(visible,'water'))
 const older=copySceneState(state)
 delete older.scenes[0].objects[0].water.flow;preserveScenePhysics(state,older)
 assert.equal(older.scenes[0].objects[0].water.flow,true)
 older.scenes[0].objects[0].water.flow=false;preserveScenePhysics(state,older)
 assert.equal(older.scenes[0].objects[0].water.flow,false)
 scene.objects.push(flowCell('overlap',4.5,0));assert(!isSceneState(state))
})

test('Растекание: отмечается контакт пройденного маршрута с водой, даже если обе крайние точки сухие',()=>{
 const scene=sceneState().scenes[0],cell=flowCell('pool',6)
 scene.objects=[cell]
 const from={x:4,y:5,z:0},to={x:8,y:5,z:0},startMs=exactAmount(0n),endMs=exactAmount(4000n)
 scene.tokens=[{actorId:'walker',...from,diameter:1,support:{kind:'ground'}}]
 const plan={work:{actorId:'walker',action:{kind:'move',support:'ground',route:[to]},amount:{total:endMs,remaining:endMs}},
  points:[from,to],lengths:[4],distance:4,startMs,endMs}
 const contacts=[]
 advanceMovement(scene,[plan],[{actorId:'walker',heightM:1.7}],startMs,endMs,()=>{},(actorId,object,kind)=>contacts.push([actorId,object.id,kind]))
 assert.deepEqual(contacts,[['walker','pool','water']])
 assert.equal(scene.tokens[0].x,8)
})

test('Вода: дозирование ведёт отдельный учёт соли и песка, а проводимость зависит от концентрации',()=>{
 const scene=sceneState().scenes[0],water=pool('pool',8),at={x:8,y:5,z:.05}
 scene.objects=[water]
 const initial=waterConductivitySM(water.water,water)
 assert.equal(initial,5.5e-6)
 const sand=applyAbilityPhysics(scene,at,'unused',{kind:'add-substance',substance:'sediment',massKg:.15})
 assert.equal(sand.composition.sedimentKg,.15);assert.equal(sand.conductivitySM,initial)
 const salted=applyAbilityPhysics(scene,at,'unused',{kind:'add-substance',substance:'salt',massKg:.2})
 assert.equal(salted.volumeL,200);assert.equal(salted.composition.saltKg,.2);assert(salted.conductivitySM>initial*10000)
 assert(waterConductivitySM(water.water,{...water,height:.2})<salted.conductivitySM)
 assert.equal(waterConductivitySM({...water.water,base:'unknown'},water),null)
 assert.equal(waterConductivitySM({...water.water,saltKg:20},water),null)
})

test('Раствор: разбавление, нейтрализация и остаток меняют pH и ток, массы сохраняются',()=>{
 const scene=sceneState().scenes[0],water=pool('pool',8),point={x:7.5,y:5,z:.05},settings=discharge(8.5)
 scene.objects=[water]
 const dose=(substance,mol)=>applyAbilityPhysics(scene,point,'unused',{kind:'add-substance',substance,massKg:mol*waterReagents[substance].molarMassKg})
 const pureCurrent=calculateCircuit(scene,point,settings).currentA
 const acid=dose('acid',.2),acidCurrent=calculateCircuit(scene,point,settings).currentA
 assert(Math.abs(acid.ph-3)<1e-6);assert(acidCurrent>pureCurrent*100)
 const dilute=applyAbilityPhysics(scene,point,'unused',{kind:'fill-water',volumeL:200})
 assert(dilute.ph>acid.ph && dilute.conductivitySM<acid.conductivitySM)
 const neutral=dose('alkali',.2)
 closeTo(neutral.ph,7);closeTo(neutral.reaction.neutralizedMol,.2);closeTo(neutral.reaction.saltKg,.01168856)
 closeTo(neutral.reaction.saltKg+neutral.reaction.waterKg,.2*(.036461+.0399971))
 closeTo(neutral.volumeL,400+neutral.reaction.waterKg)
 const saltCurrent=calculateCircuit(scene,point,settings).currentA
 assert(saltCurrent>pureCurrent*100 && saltCurrent<acidCurrent)
 const excess=dose('alkali',.1)
 assert(excess.ph>10);closeTo(excess.composition.reagentMol,-.1)
 assert.equal(waterPH({...water.water,base:'unknown'},water),null)
 assert.equal(waterConductivitySM({...water.water,reagentMol:100},water),null)
 const ice={...water.water,enthalpyJKg:0}
 water.water=ice
 assert.throws(()=>dose('acid',.1),/жидкого объёма/);assert.equal(water.water,ice)
 const oversized={...excess.composition,saltKg:1e9,reagentMol:.1}
 water.water=oversized
 assert.throws(()=>dose('alkali',1e-7),/пределы/);assert.equal(water.water,oversized)
})

test('Раствор: встречные притоки нейтрализуются в общем слое, состав переживает старого клиента',()=>{
 const state=sceneState(),scene=state.scenes[0]
 const left=flowCell('acid',4,.15),middle=flowCell('mix',6,0),right=flowCell('alkali',8,.15)
 left.water.reagentMol=1;right.water.reagentMol=-1;scene.objects=[left,middle,right]
 const mass=()=>scene.objects.reduce((sum,cell)=>{
  const excess=cell.water.reagentMol??0
  return sum+waterVolumeM3(cell)*1000+cell.water.saltKg+
    Math.abs(excess)*waterReagents[excess>=0?'acid':'alkali'].molarMassKg
 },0)
 const before=copySceneState(state),initial=mass()
 advanceWaterFlow(scene,.25)
 assert(middle.height>0 && middle.water.saltKg>0);closeTo(mass(),initial)
 assert.equal(middle.water.reagentMol,0);assert.equal(waterPH(middle.water,middle),7)
 assert.equal(waterRoundChanges(before.scenes[0],scene,[],[]).layers.find(layer=>layer.id===middle.id).ph,7)
 const old=copySceneState(JSON.parse(JSON.stringify(state))),oldWater=old.scenes[0].objects[0].water
 delete oldWater.reagentMol;preserveScenePhysics(state,old)
 closeTo(oldWater.reagentMol,left.water.reagentMol);assert(isSceneState(old))
 oldWater.reagentMol=0;preserveScenePhysics(state,old);assert.equal(oldWater.reagentMol,0)
 oldWater.reagentMol=Infinity;assert(!isSceneState(old))
 assert.doesNotMatch(JSON.stringify(publicObject(left)),/reagentMol|saltKg/)
})

test('Цепь: сопротивление прямого участка учитывает сечение; ток ограничен источником',()=>{
 const scene=sceneState().scenes[0],water=pool('pool',8)
 water.water.saltKg=.2;scene.objects=[water]
 const settings={...discharge(8.5),limitA:.01,thresholdA:.005},result=calculateCircuit(scene,{x:7.5,y:5,z:.05},settings)
 const expected=1/(.1*waterConductivitySM(water.water,water))
 assert.equal(result.status,'closed');assert(Math.abs(result.ohms-expected)<1e-9)
 assert.equal(result.currentA,.01);assert(Math.abs(result.energyJ-.01**2*expected*.1)<1e-9)
 assert.deepEqual(result.path.map(o=>o.id),['pool'])
})

test('Цепь: проводник соединяет две лужи только при контакте площадью; неизвестный материал отличается от изолятора',()=>{
 const scene=sceneState().scenes[0],left=pool('left',4),right=pool('right',8),start={x:4,y:5,z:.05}
 const bridge={...sceneObject('crate','bridge',{x:6,y:6,z:0}),width:2,depth:1,height:.1,physics:body('copper')}
 scene.objects=[left,right,bridge]
 assert.equal(calculateCircuit(scene,start,discharge(8)).status,'open','касание ребром')
 bridge.y=5
 const connected=calculateCircuit(scene,start,discharge(8))
 assert.equal(connected.status,'closed');assert.deepEqual(connected.path.map(p=>p.id),['left','bridge','right'])
 bridge.x+=.001;assert.equal(calculateCircuit(scene,start,discharge(8)).status,'open','воздушный зазор')
 bridge.x=6;bridge.physics.material.electricalConductivitySM=null
 assert.equal(calculateCircuit(scene,start,discharge(8)).status,'unknown')
 bridge.physics.material.electricalConductivitySM=0
 assert.equal(calculateCircuit(scene,start,discharge(8)).status,'open')
})

test('Вода: копии, сборки и старый клиент сохраняют состав; публичный объект раскрывает геометрию',()=>{
 const state=sceneState(false),scene=state.scenes[0],water=pool('pool',8)
 water.water.saltKg=.1;scene.objects=[water];assert(isSceneState(state))
 const copy=copySceneState(state)
 copy.scenes[0].objects[0].water.saltKg=.5;assert.equal(water.water.saltKg,.1)
 delete copy.scenes[0].objects[0].water;preserveScenePhysics(state,copy)
 assert.deepEqual(copy.scenes[0].objects[0].water,water.water)
 copy.scenes[0].objects[0].water=null;preserveScenePhysics(state,copy)
 assert.equal(copy.scenes[0].objects[0].water,null)
 const assembly=captureSceneAssembly(scene,[{kind:'object',id:water.id}],'Вода','pool-assembly'),placed=assemblyLayout(assembly,{x:8,y:5,z:0},90)
 assert.deepEqual(placed[0].water,water.water);placed[0].water.saltKg=.4;assert.equal(assembly.objects[0].water.saltKg,.1)
 const visible=publicObject(water);assert.equal(visible.height,.1);assert.equal(visible.waterVolume,true);assert(!Object.hasOwn(visible,'water'))
 const bad=copySceneState(state);bad.scenes[0].objects[0].height=0;assert(!isSceneState(bad))
 bad.scenes[0].objects[0].height=.1;bad.scenes[0].objects[0].water.saltKg=-1;assert(!isSceneState(bad))
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
