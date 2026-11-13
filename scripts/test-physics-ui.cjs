const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const React=require('react'),{act}=React,{JSDOM}=require('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://physics.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root')),cache=new Map()
function load(name){if(cache.has(name))return cache.get(name).exports;const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name);const mod={exports:{}};cache.set(name,mod);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports}
const {ObjectPhysicsPanel,EnvironmentPhysicsPanel,LandingPhysicsPanel,WaterVolumePanel}=load('ScenePhysicsPanel'),{physicsMaterialPreset}=load('physicsMaterials')
const flush=async fn=>act(async()=>{fn?.();await new Promise(resolve=>setTimeout(resolve,10))})
const input=label=>document.querySelector('[aria-label="'+label+'"]')
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
async function field(label,value){await flush(()=>{const element=input(label);assert(element,label);element.value=value;element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}))})}
async function submit(){await flush(()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))}
async function fixture(Panel=ObjectPhysicsPanel,initial,options={}){
  await flush(()=>root.render(null));const observed={value:initial,changes:[]}
  function Wrapper(){const [value,setValue]=React.useState(initial);React.useEffect(()=>{observed.value=value;observed.changes.push(value)},[value]);return React.createElement(Panel,{key:JSON.stringify(value),...(Panel===WaterVolumePanel?{object:value}:{value}),scene:options.scene&&{...options.scene,physics:value},canEmitLight:options.canEmitLight,canBreak:options.canBreak,canSlide:options.canSlide,canClimb:options.canClimb,disabled:!!options.disabled,onChange:next=>{if(options.reject)return false;setValue(next);return true}})}
  await flush(()=>root.render(React.createElement(Wrapper)));return observed
}
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})

test('Химия UI: мастер задаёт избыток реагента и явно убирает его из состава',async()=>{
  const {pureWater}=load('waterPhysics')
  const state=await fixture(WaterVolumePanel,{id:'pool',width:2,depth:1,height:.1,water:pureWater()})
  const named=name=>document.querySelector('[name="'+name+'"]')
  await flush(()=>{named('waterReagent').value='acid'})
  await submit();assert(document.querySelector('[role=alert]'));assert.equal(state.value.water.reagentMol,undefined)
  await flush(()=>{named('waterReagentMassKg').value='.036461'})
  await submit();assert.equal(state.value.water.reagentMol,1)
  assert.match(document.body.textContent,/pH при 25 °C/)
  await flush(()=>{named('waterReagent').value='none'})
  await submit();assert.equal(state.value.water.reagentMol,0)
})

test('Акустика UI: источник, фон и звуки событий редактируются независимо',async()=>{
  const object=await fixture(ObjectPhysicsPanel,{version:1,material:physicsMaterialPreset('steel'),massKg:4,temperatureK:293.15,wetnessFraction:0})
  const noise=()=>document.querySelector('[name="noiseLevelDbAt1m"]')
  await flush(()=>{noise().value='80'});await submit();assert.equal(object.value.noiseLevelDbAt1m,80)
  await flush(()=>{noise().value='161'});await submit();assert.equal(object.value.noiseLevelDbAt1m,80);assert(document.querySelector('[role=alert]'))
  await flush(()=>{noise().value=''});await submit();assert.equal(object.value.noiseLevelDbAt1m,null)
  const environment=await fixture(EnvironmentPhysicsPanel),background=()=>document.querySelector('[name="backgroundNoiseDb"]')
  const events=()=>document.querySelector('[name="eventSounds"]')
  await flush(()=>{background().value='0';events().click()});await submit()
  assert.equal(environment.value.backgroundNoiseDb,0);assert.equal(environment.value.eventSounds,true)
  await flush(()=>{background().value=''});await submit()
  assert.equal(environment.value.backgroundNoiseDb,null);assert.equal(environment.value.eventSounds,true)
  await flush(()=>events().click());await submit();assert.equal(environment.value.eventSounds,null)
})

test('Акустика UI включает распространение только вместе со звуками событий',async()=>{
  const env=await fixture(EnvironmentPhysicsPanel),travel=()=>document.querySelector('[name="soundTravel"]')
  const events=()=>document.querySelector('[name="eventSounds"]')
  assert(travel().disabled)
  await flush(()=>events().click());assert(!travel().disabled)
  await flush(()=>travel().click());await submit()
  assert.equal(env.value.eventSounds,true);assert.equal(env.value.soundTravel,true)
  await flush(()=>events().click());await submit()
  assert.equal(env.value.eventSounds,null);assert.equal(env.value.soundTravel,null)
})

test('Оптика UI: мастер включает и отключает видимость и отдельно задаёт свет фонаря',async()=>{
  const env=await fixture(EnvironmentPhysicsPanel),named=name=>document.querySelector('[name="'+name+'"]')
  assert(!named('ambientLux'))
  await flush(()=>named('simulateVision').click())
  await flush(()=>{named('ambientLux').value='.12';named('detectionLux').value='.8'})
  await submit();assert.deepEqual(env.value.vision,{ambientLux:.12,detectionLux:.8})
  await flush(()=>named('simulateVision').click())
  await submit();assert.equal(env.value.vision,null)
  const source=await fixture(ObjectPhysicsPanel,{version:1,material:physicsMaterialPreset('steel'),massKg:2,temperatureK:293.15,wetnessFraction:0},{canEmitLight:true})
  await flush(()=>{named('lightIntensityCd').value='0'})
  await submit();assert.equal(source.value.lightIntensityCd,0)
  await flush(()=>{named('lightIntensityCd').value=''})
  await submit();assert.equal(source.value.lightIntensityCd,null)
})

test('Физика UI: выбор материала не назначает массу или профиль автоматически',async()=>{
  const state=await fixture();assert.equal(input('Физическая масса объекта (кг)').value,'');await field('Физический материал объекта','water-pure')
  assert.equal(state.value,undefined);assert.equal(state.changes.length,1);assert.match(document.body.textContent,/Плотность/)
})
test('Физика UI: масса, температура и влажность записываются явно в единицах SI',async()=>{
  const state=await fixture();await field('Физический материал объекта','water-pure');await field('Физическая масса объекта (кг)','2.5');await field('Температура объекта (°C)','25');await field('Влажность поверхности (%)','10');await submit()
  assert.equal(state.value.massKg,2.5);assert.equal(state.value.temperatureK,298.15);assert.equal(state.value.wetnessFraction,.1);assert.equal(state.value.material.electricalConductivitySM,5.5e-6)
})
test('Физика UI: ошибочный ввод не сохраняется и не очищает остальные поля',async()=>{
  const state=await fixture();await field('Физический материал объекта','water-pure');await field('Физическая масса объекта (кг)','-1');await field('Температура объекта (°C)','25');await submit()
  assert.equal(state.value,undefined);assert(document.querySelector('[role=alert]'));assert.equal(input('Физическая масса объекта (кг)').value,'-1');assert.equal(input('Температура объекта (°C)').value,'25')
  await field('Физическая масса объекта (кг)','2');await field('Температура объекта (°C)','-274');await submit();assert.equal(state.value,undefined)
})
test('Физика UI: неизвестная проводимость не превращается в нулевую',async()=>{
  const state=await fixture();await field('Физический материал объекта','water-unspecified');await field('Физическая масса объекта (кг)','1');await submit()
  assert.equal(state.value.material.electricalConductivitySM,null);assert.match(document.body.textContent,/Не задано/)
})
test('Физика UI: сохранённое значение материала переживает обновление каталога',async()=>{
  const material={...physicsMaterialPreset('water-pure'),basis:'custom',name:'Материал мастера',electricalConductivitySM:3},state=await fixture(ObjectPhysicsPanel,{version:1,material,massKg:4,temperatureK:298.15,wetnessFraction:.2})
  await field('Физическая масса объекта (кг)','5');await submit();assert.equal(state.value.material.electricalConductivitySM,3);assert.equal(state.value.material.name,'Материал мастера');assert.equal(state.value.massKg,5)
})
test('Физика UI: мастер может разрешить подъём и явно отозвать разрешение',async()=>{
  const initial={version:1,material:physicsMaterialPreset('steel'),massKg:40,temperatureK:293.15,wetnessFraction:.1}
  await fixture(ObjectPhysicsPanel,initial)
  const checkbox=()=>document.querySelector('[name="climbable"]')
  assert.equal(checkbox(),null)
  const state=await fixture(ObjectPhysicsPanel,initial,{canClimb:true})
  await flush(()=>checkbox().click());await submit()
  assert.equal(state.value.climbable,true);assert.equal(state.value.wetnessFraction,.1)
  await flush(()=>checkbox().click());await submit()
  assert.equal(state.value.climbable,null)
})
test('Физика UI: снятие профиля — явное null, отказ записи сохраняет черновик',async()=>{
  const initial={version:1,material:physicsMaterialPreset('steel'),massKg:4,temperatureK:293.15,wetnessFraction:0},state=await fixture(ObjectPhysicsPanel,initial)
  await flush(()=>button('Снять физический профиль').click());assert.equal(state.value,null)
  const rejected=await fixture(ObjectPhysicsPanel,initial,{reject:true});await field('Физическая масса объекта (кг)','12');await submit();assert.equal(rejected.value.massKg,4);assert.equal(input('Физическая масса объекта (кг)').value,'12');assert(document.querySelector('[role=alert]'))
})
test('Физика UI: read-only не отправляет изменения даже при программном submit',async()=>{
  const state=await fixture(ObjectPhysicsPanel,undefined,{disabled:true});assert(input('Физическая масса объекта (кг)').matches(':disabled'));await submit();assert.equal(state.value,undefined);assert.equal(state.changes.length,1)
})
test('Физика UI: среда допускает нулевую гравитацию и абсолютный ноль, но не отрицательную гравитацию',async()=>{
  const state=await fixture(EnvironmentPhysicsPanel);await field('Гравитация сцены (м/с²)','-1');await submit();assert.equal(state.value,undefined);assert(document.querySelector('[role=alert]'))
  await field('Гравитация сцены (м/с²)','0');await field('Температура среды (°C)','-273.15');await submit();assert.deepEqual(state.value,{version:1,gravityMs2:0,ambientTemperatureK:0})
  await flush(()=>button('Снять условия среды').click());assert.equal(state.value,null)
})

test('Физика UI: плавание включает собственные параметры дыхания и скорости',async()=>{
  const state=await fixture(EnvironmentPhysicsPanel,{version:1,gravityMs2:10,ambientTemperatureK:293.15})
  const fieldByName=name=>document.querySelector('[name="'+name+'"]')
  assert.equal(fieldByName('swimBreathSeconds'),null)
  await flush(()=>fieldByName('simulateAquatics').click())
  await flush(()=>{fieldByName('swimBreathSeconds').value='18';fieldByName('swimSpeedMs').value='1.4'})
  await submit();assert.deepEqual(state.value.aquatics,{version:1,swimSpeedMs:1.4,breathSeconds:18})
  assert.equal(state.value.gravityMs2,10)
  await flush(()=>fieldByName('simulateAquatics').click())
  await submit();assert.equal(state.value.aquatics,null)
})

test('Тепло UI: проветривание и нагрев при реакции сохраняются независимо',async()=>{
  const state=await fixture(EnvironmentPhysicsPanel,{version:1,gravityMs2:9.81,ambientTemperatureK:293.15,backgroundNoiseDb:35,
    atmosphere:{oxygenFraction:.18,smokeKg:.02,steamKg:.5,outsideTemperatureK:280,doorVentilation:false}})
  const name=key=>document.querySelector('[name="'+key+'"]')
  await flush(()=>{name('doorVentilation').click()});await submit()
  assert.equal(state.value.atmosphere.doorVentilation,true)
  assert.equal(state.value.atmosphere.reactionHeat,undefined)
  await flush(()=>name('reactionHeat').click());await submit()
  assert.equal(state.value.atmosphere.reactionHeat,true);assert.equal(state.value.atmosphere.doorVentilation,true)
  await flush(()=>name('reactionHeat').click());await submit()
  assert.equal(state.value.atmosphere.reactionHeat,false)
  assert.equal(state.value.atmosphere.smokeKg,.02);assert.equal(state.value.atmosphere.steamKg,.5)
  await flush(()=>{name('simulateThermal').click()});assert.equal(name('doorVentilation'),null)
  await submit();assert.equal(state.value.atmosphere,null);assert.equal(state.value.backgroundNoiseDb,35)
})

test('Туман UI: режим и масса капель сохраняются, при отключении сохраняется масса влаги',async()=>{
  const state=await fixture(EnvironmentPhysicsPanel,{version:1,gravityMs2:9.81,ambientTemperatureK:293.15,
    atmosphere:{oxygenFraction:.2095,smokeKg:0,steamKg:.5,outsideTemperatureK:293.15,doorVentilation:true}})
  const named=name=>document.querySelector('[name="'+name+'"]')
  assert.equal(named('fogKg'),null)
  await flush(()=>named('simulateFog').click())
  await flush(()=>{named('fogKg').value='.25'});await submit()
  assert.equal(state.value.atmosphere.fogKg,.25);assert.equal(state.value.atmosphere.steamKg,.5)
  await flush(()=>named('simulateFog').click());await submit()
  assert.equal(state.value.atmosphere.fogKg,null);assert.equal(state.value.atmosphere.steamKg,.75)
})

test('Помещения UI: две комнаты и связь дверей, отказ при пересечении и явное удаление',async()=>{
  const scene={width:12,depth:8,groundZ:0,minZ:0,maxZ:3,objects:[{kind:'door',id:'gate',name:'Дверь',x:6,y:4,z:0,width:.2,depth:2,height:2,open:false}]}
  const state=await fixture(EnvironmentPhysicsPanel,undefined,{scene})
  await flush(()=>document.querySelector('[name="simulateThermal"]').click())
  await flush(()=>button('Добавить комнату').click())
  await flush(()=>button('Добавить комнату').click())
  const rooms=()=>[...document.querySelectorAll('[data-air-room]')],field=(index,suffix)=>rooms()[index].querySelector('[name$="-'+suffix+'"]')
  assert.equal(rooms().length,2)
  assert(document.querySelector('[name="simulateFog"]').checked)
  await flush(()=>{field(0,'name').value='Кузня';field(1,'name').value='Коридор';field(1,'min-x').value='5';field(0,'steam').value='1.5'})
  await submit();assert.equal(state.value,undefined);assert.match(document.querySelector('[role=alert]').textContent,/пересекаться/)
  assert.equal(field(0,'steam').value,'1.5')
  await flush(()=>{field(1,'min-x').value='6'})
  await submit()
  assert.equal(state.value.airRooms[0].air.steamKg,1.5);assert.equal(state.value.atmosphere.fogKg,0)
  assert.match(document.body.textContent,/Кузня ↔ Коридор · закрыта/)
  await flush(()=>rooms()[0].querySelector('button').click())
  await submit();assert.deepEqual(state.value.airRooms.map(room=>room.name),['Коридор'])
  await flush(()=>rooms()[0].querySelector('button').click())
  await submit();assert.equal(state.value.airRooms,null)
})

test('Воздействие на героев UI: игровые пороги сохраняются и явно выключаются',async()=>{
  const state=await fixture(EnvironmentPhysicsPanel),field=name=>document.querySelector('[name="'+name+'"]')
  assert(!field('simulateExposure'))
  await flush(()=>field('simulateThermal').click())
  await flush(()=>field('simulateExposure').click())
  await flush(()=>{field('exposureCold').value='41';field('exposureResponse').value='6'})
  await submit();assert.equal(state.value,undefined);assert.match(document.querySelector('[role=alert]').textContent,/порог холода/i)
  assert.equal(field('exposureResponse').value,'6')
  await flush(()=>{field('exposureCold').value='-10'})
  await submit();assert.equal(state.value.exposure.coldK,263.15);assert.equal(state.value.exposure.responseSeconds,6)
  await flush(()=>field('simulateExposure').click())
  await submit();assert.equal(state.value.exposure,null);assert(state.value.atmosphere)
})

test('Сцепление UI: валидируются оба коэффициента, снятие режима сохраняется явно',async()=>{
  const state=await fixture(EnvironmentPhysicsPanel),field=name=>document.querySelector('[name="'+name+'"]')
  await flush(()=>field('simulateTraction').click())
  await flush(()=>{field('gripWaterPct').value='50';field('gripIcePct').value='60'})
  await submit();assert.equal(state.value,undefined);assert.match(document.querySelector('[role=alert]').textContent,/льду/)
  assert.equal(field('gripWaterPct').value,'50')
  await flush(()=>{field('gripIcePct').value='25'})
  await submit();assert.deepEqual(state.value.traction,{version:1,waterFactor:.5,iceFactor:.25})
  await flush(()=>field('simulateTraction').click())
  await submit();assert.equal(state.value.traction,null)
})

test('Контактные повреждения UI: игровые пороги валидируются и снимаются явно',async()=>{
  const state=await fixture(EnvironmentPhysicsPanel),named=name=>document.querySelector('[name="'+name+'"]')
  await flush(()=>named('simulateContacts').click())
  await flush(()=>{named('contactBodyOhm').value='0'})
  await submit();assert(document.querySelector('[role=alert]'));assert.equal(state.value,undefined)
  await flush(()=>{named('contactBodyOhm').value='750';named('contactBurnC').value='70';named('contactAcidMolarSeconds').value='.015'})
  await submit()
  assert.equal(state.value.contactHazards.bodyResistanceOhm,750)
  assert.equal(state.value.contactHazards.burnAboveK,343.15)
  assert.equal(state.value.contactHazards.acidMolarSecondsPerHp,.015)
  await flush(()=>named('simulateContacts').click())
  await submit();assert.equal(state.value.contactHazards,null)
})

test('Конструкции UI: прочность сохраняется, накопленный удар можно исправить без сброса материала',async()=>{
  const state=await fixture(ObjectPhysicsPanel,{version:1,material:physicsMaterialPreset('wood'),massKg:4,temperatureK:293.15,wetnessFraction:0},{canBreak:true})
  const name=key=>document.querySelector('[name="'+key+'"]')
  await flush(()=>{name('simulateStructure').click()})
  await flush(()=>{name('structureFailureJ').value='200';name('structureAbsorbedJ').value='75'})
  await submit();assert.deepEqual(state.value.structure,{failureJ:200,absorbedJ:75})
  await flush(()=>{name('structureAbsorbedJ').value='201'});await submit()
  assert(document.querySelector('[role=alert]'));assert.equal(state.value.structure.absorbedJ,75)
  await flush(()=>{name('structureAbsorbedJ').value='0'});await submit()
  assert.equal(state.value.structure.absorbedJ,0);assert.equal(state.value.material.id,'wood')
})

test('Конструкции UI: параметры травмы задаются для отдельного героя и снимаются явно',async()=>{
  const state=await fixture(LandingPhysicsPanel),name=key=>document.querySelector('[name="'+key+'"]')
  await flush(()=>{name('landingEnabled').click()})
  await flush(()=>{name('landingMassKg').value='60';name('landingRegion').value='torso';name('landingContactCm2').value='100'})
  await submit();assert.deepEqual(state.value,{massKg:60,region:'torso',contactCm2:100})
  await flush(()=>{name('landingEnabled').click()})
  await submit();assert.equal(state.value,null)
})

test('Скольжение UI: изменение трения сохраняет текущую скорость предмета',async()=>{
  const state=await fixture(ObjectPhysicsPanel,{version:1,material:physicsMaterialPreset('wood'),massKg:10,temperatureK:293.15,wetnessFraction:.5,
    sliding:{dryFriction:.3,wetFriction:null,impactTransfer:0,vxMs:3,vyMs:4}},{canSlide:true})
  const name=key=>document.querySelector('[name="'+key+'"]')
  await flush(()=>{name('dryFriction').value='0.2';name('wetFriction').value='0';name('impactTransfer').value='50'})
  await submit()
  assert.deepEqual(state.value.sliding,{dryFriction:.2,wetFriction:0,impactTransfer:.5,vxMs:3,vyMs:4})
})
