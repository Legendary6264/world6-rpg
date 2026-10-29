const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{pathToFileURL}=require('node:url')
const React=require('react'),{act,useEffect,useState}=React,{JSDOM}=require('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://playtest.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})
let viewport,current,setExternal,writes=0,reject=false
const cache=new Map()
function load(name){name=name.replace(/\.tsx?$/,'');if(name.endsWith('.css'))return {};if(name==='PerceivedScene')return {__esModule:true,default:p=>{viewport=p;return React.createElement('p',null,'Сцена игрока')}};if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name);const mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href)).replaceAll('import.meta.env',JSON.stringify({BASE_URL:'/'}))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports
}
const {createScene,emptyScenes,sceneObject}=load('scenes'),{playtestMap,playtestAbilities,applyPlaytestActions}=load('scenePlaytest'),{buildSceneAbilityAim,sceneAbilityAimLines}=load('sceneAbilityAim'),{sampleAbilityVisual}=load('abilityVisualTimeline')
const actors=[{id:'hero',name:'Игрок 1',profile:{}},{id:'other',name:'Игрок 2',profile:{}}]
function fixture(){const state=createScene(emptyScenes(),'test-play','Проба','top'),scene=state.scenes[0];scene.objects=[{...sceneObject('door','door',{x:8,y:2,z:0}),name:'Дверь'},{...sceneObject('crate','crate',{x:6,y:8,z:0}),name:'Ящик'},{...sceneObject('lamp','lamp',{x:12,y:5,z:0}),name:'Светильник',active:true}];scene.tokens=[{actorId:'hero',x:4,y:4,z:0,diameter:.8,support:{kind:'ground'}},{actorId:'other',x:18,y:8,z:0,diameter:.8,support:{kind:'ground'}}];return {state,scene}}
const action=(id,operation)=>({kind:'interact',note:'',target:{kind:'object',id},operation})
const ability=(id,target,stage='release')=>({kind:'ability',note:'',abilityId:id,stage,target})
test('Прицел: реальные радиусы, 3D направление, дальность и нулевая ось; неизвестная высота не угадывается',()=>{
 const {scene}=fixture(),map=playtestMap(scene,actors,'hero'),sphere=buildSceneAbilityAim(map,playtestAbilities[0],{kind:'area',point:{x:10,y:10,z:2}})
 assert(sphere.valid);assert.equal(sphere.visual.radius,2.5);assert.equal(sphere.visual.end.z,2)
 const outside=buildSceneAbilityAim(map,playtestAbilities[0],{kind:'area',point:{x:29,y:19,z:0}});assert.equal(outside.valid,false);assert.match(outside.message,/дальности/)
 const beam=buildSceneAbilityAim(map,playtestAbilities[1],{kind:'direction',point:{x:4,y:4,z:4}});assert(beam.valid);assert.equal(beam.visual.end.z,12);assert.equal(beam.visual.start.z,0);assert.equal(buildSceneAbilityAim(map,playtestAbilities[1],{kind:'direction',point:{x:4,y:4,z:0}}).valid,false)
 for(const aim of [sphere,beam,buildSceneAbilityAim(map,playtestAbilities[2],{kind:'direction',point:{x:8,y:8,z:0}})])assert(sceneAbilityAimLines(aim).flat().every(p=>Object.values(p).every(Number.isFinite)))
 assert.equal(buildSceneAbilityAim({...map,contacts:map.contacts.map(c=>({...c,z:undefined}))},playtestAbilities[0],{kind:'area',point:{x:10,y:10,z:0}}),null)
 const hidden={id:'hidden',kind:'identified',label:'Контакт',x:8,y:8,signs:''};assert.equal(buildSceneAbilityAim({...map,contacts:[...map.contacts,hidden]},{id:'own',name:'Личная',rangeM:10},{kind:'contact',id:'hidden'}),null)
})
test('Временная шкала: пять фаз, локальная доля стадии, завершение, пауза и reduced motion',()=>{
 const v={phase:'sequence',spec:{durationMs:1000}}
 for(const [ms,phase] of [[0,'preparation'],[200,'release'],[400,'travel'],[700,'impact'],[900,'residue']]){const s=sampleAbilityVisual(v,ms);assert.equal(s.phase,phase);assert(s.visible);assert(s.progress>=0&&s.progress<=1)}
 assert(!sampleAbilityVisual(v,1000).visible);assert(!sampleAbilityVisual(v,10,false).visible);assert.equal(sampleAbilityVisual(v,99999,true,true).phase,'impact');assert(sampleAbilityVisual({...v,phase:'preparation'},99999,false).visible)
})
test('Предметы: подтверждение открывает дверь и гасит свет; исходная сцена остаётся неизменной',()=>{
 const {scene}=fixture(),before=structuredClone(scene),result=applyPlaytestActions(scene,actors,'hero',[action('door','open'),action('lamp','extinguish')],'r1')
 assert(result.scene.objects[0].open);assert.equal(result.scene.objects[2].active,false);assert.deepEqual(scene,before);assert.equal(result.visuals.length,0)
})
test('План атомарен: замок, исчезнувшая цель и перенос за границу не оставляют частичных изменений',()=>{
 const {scene}=fixture();scene.objects[0].locked=true;const before=structuredClone(scene)
 assert.throws(()=>applyPlaytestActions(scene,actors,'hero',[action('lamp','extinguish'),action('door','open')],'r2'),/заперт/);assert.deepEqual(scene,before)
 assert.throws(()=>applyPlaytestActions(scene,actors,'hero',[action('gone','open')],'r3'),/существует/)
 assert.throws(()=>applyPlaytestActions(scene,actors,'hero',[{...action('crate','relocate'),destination:{x:30,y:8,z:0}}],'r4'),/границ/)
})
test('Перенос предмета переносит стоящего на нём героя один раз; визуальный выпуск не тратит ресурсы и не выдаёт способности',()=>{
 const {scene}=fixture();const crate=scene.objects[1];crate.canSupport=true;scene.tokens[1]={actorId:'other',x:crate.x,y:crate.y,z:crate.height,diameter:.5,support:{kind:'object',objectId:crate.id}}
 const before=structuredClone(scene),a=ability('practice-fire',{kind:'area',point:{x:12,y:8,z:0}}),result=applyPlaytestActions(scene,actors,'hero',[{...action('crate','relocate'),destination:{x:10,y:8,z:1}},a],'r5')
 assert.equal(result.scene.tokens[1].x,10);assert.equal(result.scene.tokens[1].z,crate.height+1);assert.equal(result.visuals[0].spec.familyId,'fire');assert.equal(result.visuals[0].phase,'sequence');assert.deepEqual(scene,before)
 assert.equal(actors[0].rpg,undefined)
 for(const a of playtestAbilities){const prepared=applyPlaytestActions(scene,actors,'hero',[ability(a.id,{kind:'none'},'prepare')],'prepare');assert.equal(prepared.visuals[0].phase,'preparation');assert.equal(prepared.visuals[0].shape,'point')}
})
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root')),Playtest=load('ScenePlaytest').default
const flush=async fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,10))}),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
async function mount(stateOverride){await flush(()=>root.render(null));writes=0;reject=false;const state=stateOverride??fixture().state;function Wrapper(){const [value,setValue]=useState(state);useEffect(()=>{current=value;setExternal=setValue},[value]);return React.createElement(Playtest,{value,actors,onChange:next=>{writes++;if(reject)return {ok:false,message:'Отказ сохранения'};setValue(next);return {ok:true,message:'Сохранено'}}})}await flush(()=>root.render(React.createElement(Wrapper)));await flush()}
async function backToScene(){const b=button('Вернуться к сцене');if(b)await flush(()=>b.click())}
async function select(label,value){await flush(()=>{const f=document.querySelector('[aria-label="'+label+'"]');f.value=value;f.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})
test('UI игрока: очередь не меняет мир, подтверждение меняет предмет и отменяется одним действием',async()=>{
 await mount();await select('Предмет в окружении','door');const original=structuredClone(current)
 await flush(()=>button('Открыть дверь').click());assert.deepEqual(current,original);assert.equal(writes,0);assert(document.querySelector('[aria-label="Управляемый герой"]').disabled)
 await flush(()=>button('Подтвердить действия').click());assert.equal(writes,1);assert(current.scenes[0].objects[0].open);assert(!button('Отменить подтверждение').disabled)
 await backToScene();await flush(()=>button('Отменить подтверждение').click());assert.equal(writes,2);assert.deepEqual(current,original)
})
test('UI игрока: выбранный предмет сохраняется после точки, перенос создаёт намерение, отказ и устаревшая сцена защищены',async()=>{
 await mount();await select('Предмет в окружении','crate');await flush(()=>viewport.onPoint({x:12,y:8,z:0}));assert.equal(viewport.selectedObject,'crate')
 await flush(()=>button('Передвинуть к отметке').click());assert.equal(writes,0);reject=true;await flush(()=>button('Подтвердить действия').click());assert.equal(current.scenes[0].objects[1].x,6);assert(document.body.textContent.includes('Отказ сохранения'))
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>({...s,name:'Изменено мастером'}))}));assert(button('Подтвердить действия').disabled);assert(document.body.textContent.includes('Сцена изменилась'))
})
test('UI способностей: прицел передаётся на карту, дальняя цель блокирует выпуск; эффект появляется после подтверждения',async()=>{
 await mount();await flush(()=>button('Способности').click());await select('Быстрая способность','practice-fire');await flush(()=>viewport.onPoint({x:12,y:8,z:0}));await select('Цель быстрой способности','point')
 assert(viewport.abilityAim?.valid);assert.equal(viewport.abilityAim.visual.shape,'sphere');assert.equal(viewport.map.visuals.length,0)
 await flush(()=>button('Применить способность').click());assert.equal(writes,0);assert.equal(viewport.map.visuals.length,0)
 await flush(()=>button('Подтвердить действия').click());assert.equal(writes,1);assert.equal(viewport.map.visuals[0].phase,'sequence');assert.equal(viewport.map.visuals[0].spec.familyId,'fire')
 await backToScene();await flush(()=>viewport.onPoint({x:29,y:19,z:0}));assert.equal(viewport.abilityAim.valid,false);assert(button('Применить способность').disabled)
})

test('Выбранная отметка: пространственная способность получает центр, обычная сохраняет контакт; нечисловые точки отклонены',()=>{
 const {quickAbilityTarget}=load('gameControls'),p={x:12,y:5,z:1},target={kind:'object',id:'lamp'}
 const chosen=quickAbilityTarget(playtestAbilities[0].spatial,'selected',null,target,p)
 assert.deepEqual(chosen,{kind:'area',point:p});assert.notEqual(chosen.point,p)
 assert.equal(quickAbilityTarget(undefined,'selected',null,target,p),null)
 assert.deepEqual(quickAbilityTarget(undefined,'selected',null,{kind:'contact',id:'other'}),{kind:'contact',id:'other'})
 assert.equal(quickAbilityTarget(playtestAbilities[1].spatial,'point',{x:NaN,y:0,z:0},null),null)
})
test('Область: точка не превращается в радиус значка; вертикальный луч и кромка конуса соответствуют метрам',()=>{
 const {abilityAreaContains:inside}=load('abilityArea'),origin={x:4,y:4,z:0},aim={x:4,y:4,z:4}
 assert(inside(origin,aim,{shape:'point',includeCaster:false},aim));assert(!inside(origin,aim,{shape:'point',includeCaster:false},{...aim,x:4.01}))
 const beam={shape:'beam',lengthM:12,radiusM:.65,includeCaster:false}
 assert(inside(origin,aim,beam,{x:4.65,y:4,z:12}));assert(!inside(origin,aim,beam,{x:4.66,y:4,z:12}));assert(!inside(origin,aim,beam,{x:4,y:4,z:12.01}))
 const cone={shape:'cone',lengthM:8,angleDeg:60,includeCaster:false}
 assert(inside(origin,{x:12,y:4,z:0},cone,{x:8,y:6.3,z:0}));assert(!inside(origin,{x:12,y:4,z:0},cone,{x:8,y:6.32,z:0}))
 assert(!inside(origin,origin,cone,origin))
})
test('Известные цели: только видимые центры и раскрытая высота; скрытые, память и звуки не обогащаются',()=>{
 const {scene}=fixture(),{knownAimTargets}=load('sceneAimTargets'),map=playtestMap(scene,actors,'hero'),aim=buildSceneAbilityAim(map,playtestAbilities[0],{kind:'area',point:{x:12,y:5,z:1}})
 const before=structuredClone(map),targets=knownAimTargets(map,aim);assert(targets.some(t=>t.id==='lamp'));assert(!targets.some(t=>t.id==='crate'))
 const obscure={...map,objects:map.objects.map(o=>({...o,visible:false})),contacts:[...map.contacts,{id:'sound',kind:'sound',label:'Звук',x:12,y:5,z:1,signs:''},{id:'flat',kind:'silhouette',label:'Без высоты',x:12,y:5,signs:''}]}
 assert.equal(knownAimTargets(obscure,aim).length,0)
 assert.equal(knownAimTargets({...map,areas:map.areas.map(a=>({...a,visible:false}))},aim).length,0)
 const selfAim=buildSceneAbilityAim(map,{...playtestAbilities[0],spatial:{shape:'sphere',radiusM:2,includeCaster:false}},{kind:'area',point:{x:4,y:4,z:0}})
 assert(!knownAimTargets(map,selfAim).some(t=>t.id==='hero'));assert(knownAimTargets(map,{...selfAim,includeCaster:true}).some(t=>t.id==='hero'))
 assert.deepEqual(map,before)
})
test('Реакции окружения: без решения лампа не гаснет; выбранная реакция применяется атомарно с эффектом',()=>{
 const {scene}=fixture(),{previewPlaytestActions}=load('scenePlaytest'),before=structuredClone(scene),lamp=scene.objects[2],target={kind:'direction',point:{x:lamp.x,y:lamp.y,z:lamp.z+lamp.height/2}},actions=[action('door','open'),ability('practice-water',target)]
 const preview=previewPlaytestActions(scene,actors,'hero',actions);assert.equal(preview.reactions.length,1);assert.equal(preview.reactions[0].operation,'extinguish')
 assert.equal(applyPlaytestActions(scene,actors,'hero',actions,'unchecked').scene.objects[2].active,true)
 const result=applyPlaytestActions(scene,actors,'hero',actions,'checked',[preview.reactions[0].key]);assert.equal(result.scene.objects[2].active,false);assert(result.scene.objects[0].open);assert.equal(result.visuals[0].spec.familyId,'water');assert.deepEqual(scene,before)
 assert.throws(()=>applyPlaytestActions(scene,actors,'hero',actions,'stale',['missing-reaction']),/соответствует/);assert.deepEqual(scene,before)
})
test('Реакции учитывают порядок плана: вода гасит, затем огонь зажигает; неверная реакция не оставляет полураунда',()=>{
 const {scene}=fixture(),{previewPlaytestActions}=load('scenePlaytest'),lamp=scene.objects[2],point={x:lamp.x,y:lamp.y,z:lamp.z+lamp.height/2},actions=[ability('practice-water',{kind:'direction',point}),ability('practice-fire',{kind:'area',point})]
 const p1=previewPlaytestActions(scene,actors,'hero',actions);assert.equal(p1.reactions.length,1)
 const water=p1.reactions[0].key,p2=previewPlaytestActions(scene,actors,'hero',actions,[water]);assert.equal(p2.reactions.length,2);const fire=p2.reactions.find(r=>r.operation==='ignite').key
 const result=applyPlaytestActions(scene,actors,'hero',actions,'ordered',[water,fire]);assert.equal(result.scene.objects[2].active,true);assert.equal(result.visuals.length,2)
 assert.throws(()=>applyPlaytestActions(scene,actors,'hero',actions,'bad',[fire]),/соответствует/)
 assert.equal(scene.objects[2].active,true)
})
test('Осмотр существа использует только раскрытую отметку и не добавляет знаний или новых объектов',()=>{
 const {scene}=fixture(),before=structuredClone(scene),a={kind:'interact',target:{kind:'contact',id:'other'},operation:'inspect',note:''},result=applyPlaytestActions(scene,actors,'hero',[a],'inspect')
 assert.deepEqual(result.scene,before);assert(result.log[0].includes('Игрок 2'));assert.throws(()=>applyPlaytestActions(scene,actors,'hero',[{...a,target:{kind:'contact',id:'gone'}}],'missing'),/доступна/)
})
async function typeCoordinate(label,value){await flush(()=>{const f=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(f,value);f.dispatchEvent(new dom.window.Event('input',{bubbles:true}));f.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}

test('UI координат: очистка убирает старый прицел, десятичная запятая работает, карта обновляет поля',async()=>{
 await mount();await flush(()=>button('Способности').click());await select('Быстрая способность','practice-fire')
 await typeCoordinate('Прицел X','12');await typeCoordinate('Прицел Y','5');await typeCoordinate('Прицел Z','1');assert(viewport.abilityAim?.valid)
 await typeCoordinate('Прицел X','');assert.equal(document.querySelector('[aria-label="Прицел X"]').value,'');assert.equal(viewport.pickedPoint,null);assert(button('Применить способность').disabled)
 await typeCoordinate('Прицел X','12,5');assert.equal(viewport.pickedPoint.x,12.5);assert.equal(document.querySelector('[aria-label="Прицел X"]').value,'12,5')
 await flush(()=>viewport.onPoint({x:10,y:9,z:0}));assert.equal(document.querySelector('[aria-label="Прицел X"]').value,'10');assert.equal(document.querySelector('[aria-label="Прицел Y"]').value,'9');assert.equal(writes,0)
})
test('UI наведения: клик на предмет или существо задаёт центр; выбор земли возвращает ручную точку',async()=>{
 await mount();await flush(()=>button('Способности').click());await select('Быстрая способность','practice-fire');await flush(()=>viewport.onObject('lamp'))
 assert.equal(document.querySelector('[aria-label="Цель быстрой способности"]').value,'selected');assert.equal(viewport.abilityAim.visual.end.x,12);assert.equal(viewport.abilityAim.visual.end.z,current.scenes[0].objects[2].height/2)
 await flush(()=>viewport.onSelect('other'));assert.equal(viewport.abilityAim.visual.end.x,18)
 await flush(()=>viewport.onPoint({x:11,y:7,z:0}));assert.equal(document.querySelector('[aria-label="Цель быстрой способности"]').value,'point');assert.equal(viewport.abilityAim.visual.end.x,11)
})
test('UI реакции и история: чекбокс не меняет мир; подтверждение, несколько отмен и возврат восстанавливают целый результат',async()=>{
 await mount();await flush(()=>button('Способности').click());await select('Быстрая способность','practice-water');await flush(()=>viewport.onObject('lamp'));await flush(()=>button('Применить способность').click())
 const choice=document.querySelector('[aria-label="Реакции окружения"] input');assert(choice);assert(!choice.checked);assert.equal(writes,0);assert(document.querySelector('[aria-label="Сцена для пробы"]').disabled)
 await flush(()=>choice.click());assert.equal(writes,0);await flush(()=>button('Подтвердить действия').click());assert.equal(current.scenes[0].objects[2].active,false)
 await backToScene();await flush(()=>button('Мир').click());await select('Предмет в окружении','door');await flush(()=>button('Открыть дверь').click());await flush(()=>button('Подтвердить действия').click());assert(current.scenes[0].objects[0].open)
 await backToScene();await flush(()=>button('Отменить подтверждение').click());assert(!current.scenes[0].objects[0].open);assert.equal(current.scenes[0].objects[2].active,false)
 await backToScene();await flush(()=>button('Отменить подтверждение').click());assert.equal(current.scenes[0].objects[2].active,true)
 await backToScene();await flush(()=>button('Повторить подтверждение').click());assert.equal(current.scenes[0].objects[2].active,false);assert(!current.scenes[0].objects[0].open)
 await backToScene();await flush(()=>button('Повторить подтверждение').click());assert(current.scenes[0].objects[0].open)
 reject=true;await backToScene();await flush(()=>button('Отменить подтверждение').click());assert(current.scenes[0].objects[0].open);assert(!button('Отменить подтверждение').disabled);assert(document.body.textContent.includes('Отказ сохранения'))
})

function trajectoryFixture(){const {state,scene}=fixture();Object.assign(scene.objects[0],{x:8,y:4,width:1,depth:3,height:3});Object.assign(scene.objects[2],{x:9,y:4,height:2});Object.assign(scene.tokens[0],{z:1,support:{kind:'air'}});return {state,scene}}
test('Траектория: ближайшее пересечение габаритов, начало на грани, игнор цели и стабильность порядка',()=>{
 const {firstSceneTrajectoryHit:hit}=load('sceneTrajectory'),{scene}=trajectoryFixture(),start={x:4,y:4,z:1},end={x:16,y:4,z:1},before=structuredClone(scene)
 const contact=hit(scene,start,end);assert.equal(contact.objectId,'door');assert.equal(contact.point.x,7.5);assert.equal(contact.distanceM,3.5)
 assert.equal(hit(scene,contact.point,start),null);assert.equal(hit(scene,contact.point,end).distanceM,0)
 assert.equal(hit(scene,start,end,['door']),null);assert.equal(hit(scene,start,start),null);assert.equal(hit(scene,{...start,z:NaN},end),null)
 const near={...scene.objects[0],id:'a-near',x:6},twin={...near,id:'z-twin'};scene.objects.push(twin,near)
 assert.equal(hit(scene,start,end).objectId,'a-near');scene.objects.reverse();assert.equal(hit(scene,start,end).objectId,'a-near')
 scene.objects=before.objects;assert.deepEqual(scene,before)
})
test('Траектория: высота, сохранённые повёрнутые размеры, открытая дверь, арка и земля',()=>{
 const {firstSceneTrajectoryHit:hit}=load('sceneTrajectory'),{scene}=trajectoryFixture(),start={x:4,y:4,z:4},end={x:16,y:4,z:4}
 assert.equal(hit(scene,start,end),null)
 scene.objects[0].open=true;assert.equal(hit(scene,{...start,z:1},{...end,z:1}),null)
 scene.objects[0].open=false;scene.objects[0].blocksMovement=false;assert.equal(hit(scene,{...start,z:1},{...end,z:1}),null)
 scene.objects[0].blocksMovement=true;scene.objects[0].artwork='expanded-object-archway';assert.equal(hit(scene,{...start,z:1},{...end,z:1}),null)
 delete scene.objects[0].artwork;Object.assign(scene.objects[0],{facing:90,width:3,depth:1});assert.equal(hit(scene,{...start,z:1},{...end,z:1}).point.x,6.5)
 const ground=hit({...scene,objects:[]},{x:4,y:4,z:2},{x:4,y:4,z:-2});assert.equal(ground.kind,'ground');assert.equal(ground.point.z,0);assert.equal(ground.distanceM,2)
 const underground={...scene,objects:[],groundZ:-3};assert.equal(hit(underground,{x:4,y:4,z:-1},{x:4,y:4,z:-5}).point.z,-3)
})
test('Локальная проба: огонь и вода завершаются у преграды; магии других проб и общий прицел не изменены',()=>{
 const {resolvePlaytestTrajectory:resolve}=load('scenePlayTrajectory'),{scene}=trajectoryFixture(),map=playtestMap(scene,actors,'hero'),point={x:9,y:4,z:1}
 for(const a of playtestAbilities){
  const target={kind:a.spatial.shape==='sphere'?'area':a.spatial.shape==='point'?'point':'direction',point},aim=buildSceneAbilityAim(map,a,target),original=structuredClone(aim),resolved=resolve(scene,aim,a.id)
  if(['practice-fire','practice-water'].includes(a.id)){assert.equal(resolved.visual.end.x,7.5);assert.equal(resolved.obstruction.objectId,'door');assert(sceneAbilityAimLines(resolved).length>sceneAbilityAimLines(aim).length)}else assert.equal(resolved,aim)
  assert.equal(resolve(scene,aim,a.id,{obstacles:false}),aim);assert.deepEqual(aim,original)
 }
})
test('Укрытие: сфера не зажигает лампу за гранью, вода не проходит стену; выключенная проверка явно возвращает прежний просмотр',()=>{
 const {scene}=trajectoryFixture(),before=structuredClone(scene),point={x:9,y:4,z:1},water=[ability('practice-water',{kind:'direction',point})]
 const checked=load('scenePlaytest').previewPlaytestActions(scene,actors,'hero',water),free=load('scenePlaytest').previewPlaytestActions(scene,actors,'hero',water,[],{obstacles:false})
 assert.equal(checked.reactions.length,0);assert.equal(checked.impacts[0].hit.objectId,'door');assert.equal(checked.visuals[0].end.x,7.5);assert.equal(free.reactions.length,1);assert.equal(free.impacts.length,0)
 assert.throws(()=>applyPlaytestActions(scene,actors,'hero',water,'stale',[free.reactions[0].key]),/соответствует/);assert.deepEqual(scene,before)
 scene.objects[2].active=false;const fire=load('scenePlaytest').previewPlaytestActions(scene,actors,'hero',[ability('practice-fire',{kind:'area',point})]);assert.equal(fire.visuals[0].end.x,7.5);assert.equal(fire.reactions.length,0)
 const front={...scene.objects[2],id:'front',name:'Перед дверью',x:7,active:false};scene.objects.push(front)
 const splash=load('scenePlaytest').previewPlaytestActions(scene,actors,'hero',[ability('practice-fire',{kind:'area',point})]);assert.deepEqual(splash.reactions.map(r=>r.objectId),['front'])
})
test('Порядок: открыть дверь до выпуска пропускает воду; закрыть после выпуска не меняет прошлое попадание',()=>{
 const {scene}=trajectoryFixture(),before=structuredClone(scene),target={kind:'direction',point:{x:9,y:4,z:1}},actions=[action('door','open'),ability('practice-water',target),action('door','close')],preview=load('scenePlaytest').previewPlaytestActions(scene,actors,'hero',actions)
 assert.equal(preview.impacts.length,0);assert.equal(preview.reactions.length,1);const result=applyPlaytestActions(scene,actors,'hero',actions,'order',[preview.reactions[0].key]);assert.equal(result.scene.objects[0].open,false);assert.equal(result.scene.objects[2].active,false);assert.equal(result.visuals[0].end.x,16);assert.deepEqual(scene,before)
 const reverse=load('scenePlaytest').previewPlaytestActions(scene,actors,'hero',[ability('practice-water',target),action('door','open')]);assert.equal(reverse.reactions.length,0);assert.equal(reverse.impacts[0].actionIndex,0);assert.equal(reverse.visuals[0].end.x,7.5)
})
test('UI преград: переключатель меняет контур, фиксируется планом; подтверждение, отмена и повтор сохраняют точку столкновения',async()=>{
 const {state}=trajectoryFixture();await mount(state);await flush(()=>button('Способности').click());await select('Быстрая способность','practice-fire');await flush(()=>viewport.onObject('lamp'))
 assert.equal(viewport.abilityAim.visual.end.x,7.5);assert.equal(viewport.abilityAim.obstruction.name,'Дверь');assert(document.body.textContent.includes('Первое пересечение: Дверь'))
 const toggle=()=>document.querySelector('.gb-playtest-trajectory input');await flush(()=>toggle().click());assert.equal(viewport.abilityAim.visual.end.x,9);assert(!viewport.abilityAim.obstruction)
 await flush(()=>toggle().click());await flush(()=>button('Применить способность').click());assert(toggle().disabled);assert(document.querySelector('.gb-playtest-impact').textContent.includes('Дверь'));assert.equal(writes,0)
 await flush(()=>button('Подтвердить действия').click());assert.equal(viewport.map.visuals[0].end.x,7.5);assert.equal(current.scenes[0].objects[0].open,false)
 await backToScene();await flush(()=>button('Отменить подтверждение').click());assert.equal(viewport.map.visuals.length,0);await backToScene();await flush(()=>button('Повторить подтверждение').click());assert.equal(viewport.map.visuals[0].end.x,7.5)
})
test('UI порядка: план открытия двери пропускает следующую способность без преждевременной записи мира',async()=>{
 const {state}=trajectoryFixture();await mount(state);await select('Предмет в окружении','door');await flush(()=>button('Открыть дверь').click());await flush(()=>button('Способности').click());await select('Быстрая способность','practice-water');await flush(()=>viewport.onObject('lamp'));assert(viewport.abilityAim.obstruction)
 await flush(()=>button('Применить способность').click());assert.equal(document.querySelector('.gb-playtest-impact'),null);const reaction=document.querySelector('.gb-playtest-reactions input');assert(reaction);assert.equal(writes,0);assert.equal(current.scenes[0].objects[0].open,false)
 await flush(()=>reaction.click());await flush(()=>button('Подтвердить действия').click());assert.equal(current.scenes[0].objects[0].open,true);assert.equal(current.scenes[0].objects[2].active,false);await flush(()=>button('2').click());assert.equal(viewport.map.visuals[0].end.x,16)
})

test('Запись действий: снимки сохраняют порядок двери, воздействия и закрытия, без изменения исходной сцены',()=>{
 const {scene}=trajectoryFixture(),before=structuredClone(scene),point={x:9,y:4,z:1},actions=[action('door','open'),ability('practice-water',{kind:'direction',point}),action('door','close')],preview=load('scenePlaytest').previewPlaytestActions(scene,actors,'hero',actions),result=applyPlaytestActions(scene,actors,'hero',actions,'recorded',[preview.reactions[0].key])
 assert.equal(result.steps.length,3);assert.equal(result.steps[0].before.objects[0].open,false);assert.equal(result.steps[0].after.objects[0].open,true)
 assert.equal(result.steps[1].before.objects[2].active,true);assert.equal(result.steps[1].after.objects[2].active,false);assert.equal(result.steps[1].visuals.length,1);assert.equal(result.steps[2].after.objects[0].open,false)
 assert.equal(result.steps[0].durationMs,650);assert.equal(result.steps[1].durationMs,2500);assert.equal(result.steps[2].visuals.length,0);assert.deepEqual(scene,before)
 actions[1].target.point.x=27;scene.objects[0].open=true;assert.equal(result.steps[1].action.target.point.x,9);assert.equal(result.steps[0].before.objects[0].open,false)
})
test('Перемотка: реакция появляется на стадии воздействия, возврат назад восстанавливает вид, итог совпадает с сохранением',()=>{
 const {playtestReplayFrame:frame,playtestReplayDuration:duration}=load('scenePlayReplay'),{scene}=trajectoryFixture(),actions=[action('door','open'),ability('practice-water',{kind:'direction',point:{x:9,y:4,z:1}}),action('door','close')],preview=load('scenePlaytest').previewPlaytestActions(scene,actors,'hero',actions),record=applyPlaytestActions(scene,actors,'hero',actions,'frames',[preview.reactions[0].key]),before=structuredClone(record)
 assert.equal(duration(record),3800);assert.equal(frame(record,649).visuals.length,0)
 const travel=frame(record,650+1624),impact=frame(record,650+1625);assert.equal(travel.scene.objects[2].active,true);assert.equal(impact.scene.objects[2].active,false);assert.equal(travel.stepIndex,1);assert.equal(travel.effectTimeMs,1624)
 assert.equal(frame(record,0).scene.objects[0].open,true);assert.equal(frame(record,NaN).elapsedMs,0);assert.equal(frame(record,-1).elapsedMs,0)
 const end=frame(record,99999);assert(end.complete);assert.deepEqual(end.scene,record.scene);assert.equal(end.visuals.length,0);assert.equal(end.elapsedMs,3800);assert.deepEqual(record,before)
})
test('Запись: осмотр и подготовка не теряются, несколько способностей не воспроизводятся одновременно',()=>{
 const {scene}=fixture(),{playtestReplayFrame:frame}=load('scenePlayReplay'),actions=[action('crate','inspect'),ability('practice-fire',{kind:'none'},'prepare'),ability('practice-fire',{kind:'area',point:{x:12,y:8,z:1}}),ability('practice-heal',{kind:'area',point:{x:14,y:8,z:1}})],record=applyPlaytestActions(scene,actors,'hero',actions,'sequence')
 assert.equal(record.steps.length,4);assert(record.steps[0].log[0].includes('Осмотр'));assert.equal(frame(record,650).visuals[0].phase,'preparation');assert.equal(frame(record,1550).visuals.length,1);assert.equal(frame(record,1550).visuals[0].spec.familyId,'fire');assert.equal(frame(record,4350).visuals[0].spec.familyId,'healing')
})
async function scrub(value){await flush(()=>{const input=document.querySelector('[aria-label="Время просмотра"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
async function openWaterPlan(){const {state}=trajectoryFixture();await mount(state);await select('Предмет в окружении','door');await flush(()=>button('Открыть дверь').click());await flush(()=>button('Способности').click());await select('Быстрая способность','practice-water');await flush(()=>viewport.onObject('lamp'));await flush(()=>button('Применить способность').click());await flush(()=>document.querySelector('.gb-playtest-reactions input').click())}
test('UI предпросмотра: шаги, ползунок и итог не пишут сцену; редактирование и перетаскивание закрыты до возврата',async()=>{
 await openWaterPlan();const before=structuredClone(current);await flush(()=>button('Посмотреть план').click());assert.equal(writes,0);assert.equal(current.scenes[0].objects[0].open,false);assert.equal(viewport.map.objects[0].open,true);assert.equal(viewport.map.visuals.length,0)
 assert.equal(viewport.onPoint,undefined);assert.equal(viewport.onObjectMove,undefined);assert(document.querySelector('[aria-label="Предмет в окружении"]').matches(':disabled'));assert(document.querySelector('[aria-label="Сцена для пробы"]').disabled)
 await flush(()=>button('Следующее действие').click());assert.equal(viewport.map.visuals[0].spec.familyId,'water');assert.equal(viewport.map.objects[2].active,true);await scrub(2600);assert.equal(viewport.map.objects[2].active,false);assert.equal(viewport.effectTimeMs,1950);assert.equal(writes,0)
 await flush(()=>button('К результату').click());assert.equal(viewport.map.visuals.length,0);assert.equal(viewport.map.objects[2].active,false);assert(document.body.textContent.includes('Просмотр завершён'))
 await flush(()=>button('Предыдущее действие').click());assert.equal(document.querySelector('[aria-label="Показать действие 2"]').getAttribute('aria-current'),'step')
 await backToScene();assert.deepEqual(current,before);assert.equal(viewport.map.objects[0].open,false);assert.equal(viewport.map.objects[2].active,true);assert.equal(writes,0);assert(document.querySelector('.gb-playtest-reactions input').checked);assert(!button('Подтвердить действия').disabled)
})
test('UI подтверждения: одно сохранение, повтор не пишет мир, отмена и возврат восстанавливают запись',async()=>{
 await openWaterPlan();await flush(()=>button('Подтвердить действия').click());assert.equal(writes,1);assert.equal(current.scenes[0].objects[2].active,false);assert.equal(viewport.map.objects[2].active,true);assert(button('Пауза просмотра'))
 await flush(()=>button('Пауза просмотра').click());await flush(()=>button('Следующее действие').click());assert.equal(viewport.map.visuals[0].end.x,16);await scrub(2600);assert.equal(viewport.map.objects[2].active,false);assert.equal(writes,1)
 await flush(()=>button('Повторить просмотр').click());await flush(()=>button('Пауза просмотра').click());assert.equal(viewport.map.objects[2].active,true);assert.equal(writes,1);await backToScene()
 await flush(()=>button('Просмотреть последнее подтверждение').click());await flush(()=>button('К результату').click());assert.equal(writes,1);assert.equal(viewport.map.objects[2].active,false);await backToScene()
 await flush(()=>button('Отменить подтверждение').click());assert.equal(writes,2);assert.equal(current.scenes[0].objects[2].active,true);await flush(()=>button('Повторить подтверждение').click());assert.equal(writes,3);assert.equal(current.scenes[0].objects[2].active,false);assert(document.querySelector('[aria-label="Просмотр действий"]'));await scrub(2600);assert.equal(viewport.map.objects[2].active,false)
})
test('UI проигрывания: смена скорости, скрытая вкладка и ручной поиск не меняют сохранение или игровое время',async()=>{
 await openWaterPlan();await flush(()=>button('Посмотреть план').click());await select('Скорость просмотра','4');await flush(()=>button('Продолжить просмотр').click())
 const descriptor=Object.getOwnPropertyDescriptor(document,'visibilityState');Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new dom.window.Event('visibilitychange'));const time=Number(document.querySelector('[aria-label="Время просмотра"]').value)
 await act(async()=>{await new Promise(r=>setTimeout(r,120))});assert.equal(Number(document.querySelector('[aria-label="Время просмотра"]').value),time)
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new dom.window.Event('visibilitychange'));await act(async()=>{await new Promise(r=>setTimeout(r,120))});assert(Number(document.querySelector('[aria-label="Время просмотра"]').value)>time)
 await scrub(1300);assert(button('Продолжить просмотр'));await act(async()=>{await new Promise(r=>setTimeout(r,100))});assert.equal(Number(document.querySelector('[aria-label="Время просмотра"]').value),1300);assert.equal(writes,0)
 if(descriptor)Object.defineProperty(document,'visibilityState',descriptor);else delete document.visibilityState
})
test('UI просмотра: внешняя правка останавливает старые кадры, отказ сохранения не запускает подтверждённый повтор',async()=>{
 await openWaterPlan();await flush(()=>button('Посмотреть план').click());await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>({...s,name:'Внешняя правка'}))}));assert.equal(document.querySelector('[aria-label="Просмотр действий"]'),null);assert.equal(viewport.effectTimeMs,undefined);assert.equal(viewport.map.title,'Внешняя правка');assert(button('Подтвердить действия').disabled);assert.equal(writes,0)
 await openWaterPlan();reject=true;await flush(()=>button('Подтвердить действия').click());assert.equal(document.querySelector('[aria-label="Просмотр действий"]'),null);assert.equal(current.scenes[0].objects[0].open,false);assert(document.body.textContent.includes('Отказ сохранения'))
})
test('UI доступности: reduced motion открывает подтверждение на паузе и оставляет ручные шаги',async()=>{
 const previous=window.matchMedia;window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})
 try{await openWaterPlan();await flush(()=>button('Подтвердить действия').click());assert(button('Продолжить просмотр'));assert(!button('Пауза просмотра'));await flush(()=>button('Следующее действие').click());assert.equal(viewport.map.visuals[0].spec.familyId,'water');assert.equal(writes,1)}finally{window.matchMedia=previous}
})
