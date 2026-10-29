const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const {pathToFileURL}=require('node:url'),cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'');if(cache.has(name))return cache.get(name).exports
 const file=path.resolve('src',name+'.ts'),mod={exports:{}};cache.set(name,mod)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.env','({BASE_URL:"/"})').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports
}
const a=load('sceneAssemblies'),{createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog')
function fixture(){
 const state=createScene(emptyScenes(),'room','Комната','top'),scene=state.scenes[0]
 scene.objects=[createTabletopObject('table','table',{x:6,y:8,z:0}),createTabletopObject('chair','chair-one',{x:4.8,y:8,z:0}),createTabletopObject('chair','chair-two',{x:7.2,y:8,z:0},180),createTabletopObject('candle','candle',{x:6,y:8,z:.98})]
 scene.tokens=[{actorId:'hero',x:6,y:8,z:.98,diameter:.5,support:{kind:'object',objectId:'table'}}]
 const items=scene.objects.map(o=>({kind:'object',id:o.id})),assembly=a.captureSceneAssembly(scene,items,'Стол на двоих','set-one')
 return {state,scene,items,assembly}
}
test('Сборка: нормализованные габариты, состояние моделей, отсутствие героев и исходных изменений',()=>{
 const {state,scene,items,assembly}=fixture(),before=structuredClone(state)
 assert.equal(assembly.objects.length,4);assert.equal(assembly.width,3);assert.equal(assembly.height,1.6);assert(a.isSceneAssembly(assembly))
 assert.equal(assembly.objects.find(o=>o.asset==='candle').z,.98);assert.equal(assembly.objects.find(o=>o.id==='chair-two').facing,180)
 const raw=a.encodeAssemblyLibrary([assembly]);assert(!raw.includes('actorId'));assert(!raw.includes('hero'));assert.deepEqual(a.decodeAssemblyLibrary(raw),[assembly])
 assert.throws(()=>a.captureSceneAssembly(scene,[...items,{kind:'token',id:'hero'}],'Нет','bad'),/без героев/)
 assert.deepEqual(state,before)
 const precise={...scene,objects:[{...scene.objects[0],width:1.333333333,depth:.777777777,height:.999999999}]}
 assert(a.isSceneAssembly(a.captureSceneAssembly(precise,[items[0]],'Дробные размеры','precise')))
})
test('Штамп сборки: четыре поворота, привязка целиком, новые ID и сохранение высоты без копии героя',()=>{
 const {state,scene,assembly}=fixture(),before=structuredClone(state)
 for(const facing of [0,90,180,270]){
  let serial=0;const result=a.stampSceneAssembly(state,assembly,{x:30,y:20,z:0},facing,()=> 'copy-'+serial++,2,1),next=result.state.scenes[0]
  assert.equal(next.objects.length,8);assert.equal(result.items.length,4);assert.deepEqual(next.tokens,scene.tokens)
  const copied=next.objects.slice(4),table=copied.find(o=>o.asset==='table'),candle=copied.find(o=>o.asset==='candle')
  assert.equal(table.z,2);assert.equal(candle.z,2.98);assert.equal(table.facing,facing);assert.equal(table.width,facing%180?1:1.8)
  assert.equal(new Set(next.objects.map(o=>o.id)).size,8)
  copied.forEach(o=>{assert(o.x-o.width/2>=-1e-6&&o.x+o.width/2<=scene.width+1e-6);assert(o.y-o.depth/2>=-1e-6&&o.y+o.depth/2<=scene.depth+1e-6)})
 }
 assert.deepEqual(state,before)
})
test('Штамп: превышение лимита, высоты и размеров отказывает атомарно; повреждённые файлы не проходят',()=>{
 const {state,assembly}=fixture(),full=structuredClone(state);full.scenes[0].objects=Array.from({length:249},(_,i)=>({...state.scenes[0].objects[0],id:'object-'+i}));full.scenes[0].tokens=[]
 let ids=0;assert.throws(()=>a.stampSceneAssembly(full,assembly,{x:10,y:10,z:0},0,()=> 'id-'+ids++),/250/);assert.equal(ids,0)
 const before=structuredClone(state);assert.throws(()=>a.stampSceneAssembly(state,assembly,{x:10,y:10,z:0},0,()=> 'new-'+ids++,100));assert.deepEqual(state,before)
 assert.throws(()=>a.stampSceneAssembly({...state,scenes:[{...state.scenes[0],width:1}]},assembly,{x:1,y:1,z:0},0,()=> 'id'),/границы/)
 assert(!a.isSceneAssembly({...assembly,objects:[{...assembly.objects[0],asset:'javascript:invalid'}]}))
 assert.throws(()=>a.decodeAssemblyLibrary('{"format":"grani-scene-assemblies","version":2,"assemblies":[]}'))
 assert.throws(()=>a.encodeAssemblyLibrary([assembly,assembly]))
 assert.throws(()=>a.decodeAssemblyLibrary(' '.repeat(1024*1024+1)),/2 МБ/)
})
test('Библиотека: конфликты импортируются новым ID, одинаковые файлы не дублируются, лимит сохраняет источник',()=>{
 const {assembly}=fixture(),before=structuredClone(assembly)
 assert.equal(a.mergeAssemblyLibraries([assembly],[structuredClone(assembly)],()=> 'new-id').length,1)
 const merged=a.mergeAssemblyLibraries([assembly],[{...assembly,name:'Другой вариант'}],()=> 'new-id');assert.equal(merged.length,2);assert.equal(merged[1].id,'new-id');assert.deepEqual(assembly,before)
 const full=Array.from({length:20},(_,i)=>({...assembly,id:'set-'+i}));assert.throws(()=>a.mergeAssemblyLibraries(full,[assembly],()=> 'overflow'),/20/);assert.equal(full.length,20)
})
test('Библиотека: хранилища разделены по аккаунту/лобби, отказ хранилища не меняет сцену',()=>{
 const old=global.window,values=new Map(),{assembly}=fixture()
 try{
  global.window={localStorage:{getItem:key=>values.get(key),setItem:(key,v)=>values.set(key,v)}}
  assert(a.writeAssemblyLibrary('account-a:lobby-one',[assembly]));assert.equal(a.readAssemblyLibrary('account-a:lobby-one').length,1)
  assert.equal(a.readAssemblyLibrary('account-b:lobby-one').length,0);assert.equal(a.readAssemblyLibrary('account-a:lobby-two').length,0)
  global.window={get localStorage(){throw Error('blocked')}};assert.equal(a.writeAssemblyLibrary('account-a:lobby-one',[assembly]),false);assert.deepEqual(a.readAssemblyLibrary('account-a:lobby-one'),[])
 }finally{if(old===undefined)delete global.window;else global.window=old}
})
test('Слои: защищённые и скрытые объекты отклоняют правку/удаление, положение героя остаётся независимым',()=>{
 const {assertEditorLayerChange}=load('sceneEditorLayers'),{state}=fixture(),changed=structuredClone(state)
 changed.scenes[0].objects[0].x++;assert.throws(()=>assertEditorLayerChange(state,changed,'room',['table']),/защищён/)
 const deleted=structuredClone(state);deleted.scenes[0].objects=[];assert.throws(()=>assertEditorLayerChange(state,deleted,'room',['table']))
 const token=structuredClone(state);token.scenes[0].tokens[0].x+=.1;assert.doesNotThrow(()=>assertEditorLayerChange(state,token,'room',['table']))
 assert.doesNotThrow(()=>assertEditorLayerChange(state,structuredClone(state),'room',['table']));assert.doesNotThrow(()=>assertEditorLayerChange(state,changed,'other-scene',['table']))
})

test('Буфер редактора: отделённый снимок, прежняя высота, состояния и исключение персонажей',()=>{
 const {captureEditorClipboard}=load('sceneEditorClipboard'),{scene,items}=fixture();scene.groundZ=-2;scene.objects.forEach(o=>o.z+=3);scene.objects[0].active=false;scene.objects[0].locked=true
 const before=structuredClone(scene),clipboard=captureEditorClipboard(scene,[...items,{kind:'token',id:'hero'}]);assert.deepEqual(scene,before);assert.equal(clipboard.elevation,5);assert.equal(clipboard.skippedActors,1);assert.equal(clipboard.assembly.objects.length,4)
 assert.equal(clipboard.assembly.objects[0].active,false);assert.equal(clipboard.assembly.objects[0].locked,true);assert.equal(clipboard.assembly.objects[3].z,.98);assert(!JSON.stringify(clipboard).includes('actorId'))
 scene.objects[0].name='Изменено после копирования';scene.objects[0].x=20;assert.notEqual(clipboard.assembly.objects[0].name,scene.objects[0].name);assert.notEqual(clipboard.assembly.objects[0].x,20)
 assert.throws(()=>captureEditorClipboard(scene,[{kind:'token',id:'hero'}]),/Для копирования/)
 const full={...scene,objects:Array.from({length:65},(_,i)=>({...before.objects[0],id:'copy-'+i}))};assert.throws(()=>captureEditorClipboard(full,full.objects.map(o=>({kind:'object',id:o.id}))),/64/);assert.equal(full.objects.length,65)
})

test('Повторная вставка: счётчик видит только полные группы и не меняет входные данные',()=>{
 const {visiblePasteBatches}=load('sceneEditorPaste'),{scene}=fixture(),batches=[[{kind:'object',id:'table'},{kind:'object',id:'chair-one'}],[{kind:'object',id:'missing'}],[],[{kind:'token',id:'hero'}],[{kind:'object',id:'chair-two'}]],before=structuredClone(batches)
 assert.deepEqual(visiblePasteBatches(scene,batches),[batches[0],batches[4]]);assert.deepEqual(visiblePasteBatches(undefined,batches),[]);assert.deepEqual(batches,before)
})
test('Повторная вставка: граница истории не пропускает чужие правки и переход в другую сцену',()=>{
 const {pasteHistoryAvailable}=load('sceneEditorPaste'),{state,scene,assembly,items}=fixture(),session={sceneId:scene.id,clipboard:{assembly,elevation:0,skippedActors:1},originalItems:items,primary:items[0],repeat:true,facing:0,elevation:0,batches:[[{kind:'object',id:'added'}]]},after=structuredClone(state)
 after.scenes[0].objects.push({...scene.objects[0],id:'added'})
 assert(pasteHistoryAvailable(session,after,state));assert(pasteHistoryAvailable(session,state,after,true));assert(!pasteHistoryAvailable(session,state,after));assert(!pasteHistoryAvailable(session,after,after));assert(!pasteHistoryAvailable(session,after,{...state,activeSceneId:'elsewhere'}));assert(!pasteHistoryAvailable(session,state,undefined));assert(!pasteHistoryAvailable(null,after,state))
})
test('Повторная вставка: завершение выбирает последнюю оставшуюся группу либо прежнее выделение',()=>{
 const {finishPasteSelection}=load('sceneEditorPaste'),{scene,assembly,items}=fixture(),session={sceneId:scene.id,clipboard:{assembly,elevation:0,skippedActors:1},originalItems:[items[0],{kind:'token',id:'hero'},{kind:'object',id:'gone'}],primary:{kind:'token',id:'hero'},repeat:true,facing:0,elevation:0,batches:[[items[1]],[{kind:'object',id:'undone'}]]}
 assert.deepEqual(finishPasteSelection(session,scene),{items:[items[1]],primary:items[1],count:1});assert.deepEqual(finishPasteSelection({...session,batches:[]},scene),{items:[items[0],{kind:'token',id:'hero'}],primary:{kind:'token',id:'hero'},count:0});assert.deepEqual(finishPasteSelection(session,{...scene,id:'other'}),{items:[],primary:null,count:0})
})

test('Ряд: восемь сочетаний оси и поворота сохраняют промежуток по полным габаритам',()=>{
 const {buildAssemblyRow}=load('sceneAssemblyRow'),{assembly}=fixture();assembly.objects[0].locked=true;assembly.objects[0].active=false;const before=structuredClone(assembly)
 const bounds=(objects,axis)=>{const size=axis==='x'?'width':'depth';return {min:Math.min(...objects.map(o=>o[axis]-o[size]/2)),max:Math.max(...objects.map(o=>o[axis]+o[size]/2))}}
 for(const axis of ['x','y'])for(const facing of [0,90,180,270]){
  const row=buildAssemblyRow(assembly,facing,{count:3,axis,gap:.75}),size=a.assemblyDimensions(assembly,facing);assert(a.isSceneAssembly(row));assert.equal(row.objects.length,12);assert.equal(row.height,assembly.height)
  assert.equal(row.width,axis==='x'?size.width*3+1.5:size.width);assert.equal(row.depth,axis==='y'?size.depth*3+1.5:size.depth)
  for(let i=0;i<3;i++){const group=row.objects.slice(i*4,i*4+4);assert.equal(group[0].locked,true);assert.equal(group[0].active,false);assert.equal(group[0].facing,facing);assert.equal(group[3].z,assembly.objects[3].z);if(i){const previous=bounds(row.objects.slice((i-1)*4,i*4),axis),next=bounds(group,axis);assert(Math.abs(next.min-previous.max-.75)<1e-6)}}
  assert.equal(new Set(row.objects.map(o=>o.id)).size,12);assert.equal('tokens' in row,false)
 }
 assert.deepEqual(assembly,before)
})
test('Ряд: ограничения количества, оси и промежутка отклоняют целый запрос без изменения исходника',()=>{
 const {buildAssemblyRow,maxAssemblyRowCopies}=load('sceneAssemblyRow'),{assembly}=fixture(),before=structuredClone(assembly);assert.equal(maxAssemblyRowCopies(assembly),16)
 for(const row of [{count:1,axis:'x',gap:0},{count:2.5,axis:'x',gap:0},{count:NaN,axis:'x',gap:0},{count:17,axis:'x',gap:0},{count:2,axis:'z',gap:0},{count:2,axis:'x',gap:-.1},{count:2,axis:'x',gap:Infinity},{count:2,axis:'x',gap:NaN},{count:2,axis:'x',gap:1e20}])assert.throws(()=>buildAssemblyRow(assembly,0,row))
 assert.throws(()=>buildAssemblyRow(assembly,45,{count:2,axis:'x',gap:0}),/90/);assert.throws(()=>buildAssemblyRow({...assembly,objects:[]},0,{count:2,axis:'x',gap:0}),/повреждена/)
 const many={...assembly,objects:Array.from({length:33},(_,i)=>({...assembly.objects[0],id:'source-'+i}))};assert(a.isSceneAssembly(many));assert.throws(()=>buildAssemblyRow(many,0,{count:2,axis:'x',gap:0}),/32 объект/)
 assert.deepEqual(assembly,before)
})
test('Ряд: общая привязка у края сохраняет дробный промежуток и героя, не сжимая копии',()=>{
 const {buildAssemblyRow}=load('sceneAssemblyRow'),{state,scene,assembly}=fixture(),row=buildAssemblyRow(assembly,90,{count:3,axis:'x',gap:.3333337}),before=structuredClone(state)
 let serial=0;const result=a.stampSceneAssembly(state,row,{x:29.99,y:19.99,z:0},0,()=> 'row-stamp-'+serial++,2,1),copies=result.state.scenes[0].objects.slice(scene.objects.length)
 assert.equal(copies.length,12);assert.deepEqual(result.state.scenes[0].tokens,scene.tokens);assert.equal(new Set(copies.map(o=>o.id)).size,12);assert(copies.every(o=>!row.objects.some(v=>v.id===o.id)))
 copies.forEach(o=>assert(o.x-o.width/2>=-1e-6&&o.x+o.width/2<=scene.width+1e-6&&o.y-o.depth/2>=-1e-6&&o.y+o.depth/2<=scene.depth+1e-6))
 assert.equal(copies[0].z,2);assert.equal(copies[3].z,2.98);assert(Math.abs(copies[4].x-copies[0].x-1.3333337)<1e-6);assert(Math.abs(copies[8].x-copies[4].x-1.3333337)<1e-6);assert.deepEqual(state,before)
})
test('Ряд: 64 объекта допустимы; выход за размер, высоту или лимит сцены отказывает атомарно',()=>{
 const {buildAssemblyRow}=load('sceneAssemblyRow'),{state,assembly}=fixture(),row=buildAssemblyRow(assembly,0,{count:16,axis:'x',gap:0});assert.equal(row.objects.length,64);assert(a.isSceneAssembly(row))
 let serial=0;const before=structuredClone(state);assert.throws(()=>a.stampSceneAssembly(state,row,{x:10,y:10,z:0},0,()=> 'bad-'+serial++),/границы/);assert.deepEqual(state,before)
 const small=buildAssemblyRow(assembly,0,{count:2,axis:'x',gap:0}),full=structuredClone(state);full.scenes[0].objects=Array.from({length:243},(_,i)=>({...state.scenes[0].objects[0],id:'fill-'+i}));full.scenes[0].tokens=[]
 serial=0;const fullBefore=structuredClone(full);assert.throws(()=>a.stampSceneAssembly(full,small,{x:10,y:10,z:0},0,()=> 'limit-'+serial++),/250/);assert.equal(serial,0);assert.deepEqual(full,fullBefore)
 assert.throws(()=>a.stampSceneAssembly(state,small,{x:10,y:10,z:0},0,()=> 'high-'+serial++,100));assert.deepEqual(state,before)
})
test('Ряд: результат совместим со сборками и экспортом; повторный штамп получает независимые ID',()=>{
 const {buildAssemblyRow}=load('sceneAssemblyRow'),{state,assembly}=fixture(),row=buildAssemblyRow(assembly,270,{count:3,axis:'y',gap:0});assert.deepEqual(a.decodeAssemblyLibrary(a.encodeAssemblyLibrary([row])),[row])
 let serial=0;const first=a.stampSceneAssembly(state,row,{x:10,y:8,z:0},0,()=> 'first-row-'+serial++),second=a.stampSceneAssembly(first.state,row,{x:20,y:8,z:0},0,()=> 'second-row-'+serial++)
 assert.equal(first.items.length,12);assert.equal(second.items.length,12);assert.equal(new Set(second.state.scenes[0].objects.map(o=>o.id)).size,28);assert.deepEqual(second.state.scenes[0].tokens,state.scenes[0].tokens)
 const captured=a.captureSceneAssembly(second.state.scenes[0],second.items,'Готовый ряд','captured-row');assert(a.isSceneAssembly(captured));assert.equal(captured.objects.length,12)
})
test('Ряд: предпросмотр и запись получают один план; неверные параметры не подменяются одиночной копией',()=>{
 const {resolvePasteShape}=load('sceneAssemblyRow'),{assembly}=fixture(),ordinary=resolvePasteShape(assembly,90,2)
 assert.equal(ordinary.placement.assembly,assembly);assert.equal(ordinary.placement.facing,90)
 const row=resolvePasteShape(assembly,90,2,{count:3,axis:'x',gap:.5});assert.equal(row.placement.facing,0);assert.equal(row.placement.elevation,2);assert.equal(row.placement.assembly.width,4);assert.equal(row.placement.assembly.depth,3)
 const invalid=resolvePasteShape(assembly,90,2,{count:2,axis:'x',gap:NaN});assert.equal(invalid.placement,undefined);assert.match(invalid.error,/Промежуток/);assert(resolvePasteShape(assembly,90,2,{count:2,axis:'x',gap:0}).placement)
})
