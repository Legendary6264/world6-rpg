const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{pathToFileURL}=require('node:url')
const React=require('react'),{act}=React,{JSDOM}=require('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://tabletop.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root')),cache=new Map()
let editor
function load(name){
 name=name.replace(/\.tsx?$/,'');if(name.endsWith('.css'))return {};if(name==='SceneEditor')return {__esModule:true,default:p=>{editor=p;return React.createElement('p',null,'Редактор')}}
 if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name)
 const mod={exports:{}};cache.set(name,mod)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports
}
const Panel=load('LobbyScenesEditor').default,{OnlineContext}=load('onlineContext'),{createScene,emptyScenes}=load('scenes'),{readSceneDraft}=load('lobbySceneDraftStorage')
const flush=async(fn,ms=10)=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,ms))})
let scenes,actors,revision,writes,fail,checking,refreshes,request,accountId,putGate,fixtureId=0
const render=()=>root.render(React.createElement(OnlineContext.Provider,{value:{request,refresh:()=>refreshes++}},React.createElement(Panel,{accountId,lobbyId:'live-room',revision,checkingAccess:checking})))
async function mount(){
 await flush(()=>root.render(null));localStorage.clear();accountId='live-user-'+(++fixtureId);revision=7;writes=[];fail=false;checking=false;refreshes=0;putGate=null;actors=[];scenes=createScene(emptyScenes(),'scene','Таверна','top')
 request=async(url,options)=>{
  if(options?.method==='PUT'){const body=JSON.parse(options.body);writes.push(body);if(putGate){const gate=putGate;putGate=null;await gate}if(fail)throw Error('Конфликт версии');assert.equal(body.revision,revision);scenes=body.scenes;return {revision:++revision}}
  return {revision,scenes,actors,visuals:{}}
 }
 await flush(render);await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Открыть сцены в редакторе').click())
}
const rename=name=>editor.onChange({...editor.value,scenes:editor.value.scenes.map(s=>({...s,name}))})
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})
test('Прямая передача: свежая сцена не пишется повторно, серия изменений объединяется, новая ревизия и undo передаются игрокам',async()=>{
 await mount();await flush(()=>document.querySelector('input[type=checkbox]').click(),520);assert.equal(writes.length,0)
 await flush(()=>rename('Промежуточное'));await flush(()=>rename('Готовое'));await flush(null,520);await flush()
 assert.equal(writes.length,1);assert.equal(writes[0].scenes.scenes[0].name,'Готовое');assert.equal(readSceneDraft(accountId,'live-room').revision,8);assert.equal(refreshes,1)
 await flush(null,520);assert.equal(writes.length,1)
 await flush(()=>rename('Таверна'));await flush(null,520);assert.equal(writes.length,2);assert.equal(writes[1].revision,8)
})
test('Конфликт останавливает автоматическую запись, сохраняет черновик и не обходит проверку доступа',async()=>{
 await mount();fail=true;await flush(()=>document.querySelector('input[type=checkbox]').click());await flush(()=>rename('Мой черновик'));await flush(null,520);await flush()
 assert.equal(writes.length,1);assert(!document.querySelector('input[type=checkbox]').checked);assert(document.body.textContent.includes('Прямая передача приостановлена'));assert.equal(readSceneDraft(accountId,'live-room').scenes.scenes[0].name,'Мой черновик')
 await flush(null,520);assert.equal(writes.length,1)
 checking=true;await flush(render);assert.equal(rename('Запрещённое').ok,false);assert.equal(readSceneDraft(accountId,'live-room').scenes.scenes[0].name,'Мой черновик')
})
test('Выход из редактора отменяет ещё не отправленный мазок',async()=>{
 await mount();await flush(()=>document.querySelector('input[type=checkbox]').click());await flush(()=>rename('Перед выходом'));await flush(()=>root.render(null));await flush(null,520);assert.equal(writes.length,0)
 assert.equal(readSceneDraft(accountId,'live-room').scenes.scenes[0].name,'Перед выходом')
})

test('Медленная сеть не прерывает перетаскивание: следующие изменения отправляются последовательно с новой ревизией',async()=>{
 await mount();await flush(()=>document.querySelector('input[type=checkbox]').click())
 let release;putGate=new Promise(r=>release=r)
 await flush(()=>rename('Первое изменение'));await flush(null,520);assert.equal(writes.length,1);assert(!editor.disabled)
 let result;await flush(()=>{result=rename('Следующее изменение')});assert(result.ok);assert.equal(writes.length,1)
 await flush(()=>release());await flush(null,520);await flush()
 assert.equal(writes.length,2);assert.equal(writes[1].revision,8);assert.equal(writes[1].scenes.scenes[0].name,'Следующее изменение')
 assert.equal(readSceneDraft(accountId,'live-room').revision,9);assert.equal(readSceneDraft(accountId,'live-room').scenes.scenes[0].name,'Следующее изменение')
})

const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
test('Новая серверная версия останавливает передачу, сохраняя редактируемый черновик',async()=>{
 await mount();await flush(()=>document.querySelector('input[type=checkbox]').click());await flush(()=>rename('Несохранённая работа'))
 revision++;await flush(render);await flush(null,520)
 assert.equal(writes.length,0);assert(!document.querySelector('input[type=checkbox]').checked);assert(button('Сохранить сцены на сервер').disabled)
 assert(document.body.textContent.includes('На сервере новая версия кампании'));assert(!editor.disabled)
 await flush(()=>rename('Можно продолжать локально'));assert.equal(readSceneDraft(accountId,'live-room').scenes.scenes[0].name,'Можно продолжать локально')
})
test('Повторный клик не создаёт второй PUT; старый callback не правит мир во время ручного сохранения',async()=>{
 await mount();await flush(()=>rename('Одна запись'))
 const retainedChange=editor.onChange;let release;putGate=new Promise(r=>release=r)
 await flush(()=>{const save=button('Сохранить сцены на сервер');save.click();save.click()})
 assert.equal(writes.length,1)
 assert.equal(retainedChange({...editor.value,activeSceneId:null}).ok,false)
 await flush(()=>release());assert.equal(writes.length,1);assert(button('Сохранить сцены на сервер').disabled)
})
test('Смена доступа к API отменяет старую загрузку; поздний ответ не заменяет свежие сцены',async()=>{
 await mount();const original=request,confirm=window.confirm;window.confirm=()=>true
 let release;const held=new Promise(r=>release=r)
 try{
  request=()=>held;await flush(render);await flush(()=>button('Загрузить свежие сцены').click())
  request=original;await flush(render);await flush(()=>button('Загрузить свежие сцены').click())
  const late=createScene(emptyScenes(),'late','Устаревший ответ','top')
  await flush(()=>release({revision:1,scenes:late,actors:[]}))
  assert.equal(editor.value.scenes[0].name,'Таверна');assert.equal(readSceneDraft(accountId,'live-room').revision,7)
 }finally{window.confirm=confirm}
})
test('Таверны добавляются отдельно, без фигурок полигона и замены имеющихся сцен',async()=>{
 await mount();const before=structuredClone(editor.value)
 await flush(()=>button('Добавить таверну из примера').click());await flush(()=>button('Добавить таверну из примера').click())
 const state=readSceneDraft(accountId,'live-room').scenes
 assert.equal(state.scenes.length,3);assert.deepEqual(state.scenes[0],before.scenes[0]);assert.equal(writes.length,0)
 assert(state.scenes.slice(1).every(s=>s.tokens.length===0&&s.objects.length>100))
 const ids=state.scenes.flatMap(s=>[s.id,...s.objects.map(o=>o.id)])
 assert.equal(ids.length,new Set(ids).size)
 const {addLobbyTavern}=load('lobbySceneTemplates')
 assert.throws(()=>addLobbyTavern(state,state.scenes[0].id),/занят/)
 const full={...state,scenes:Array.from({length:20},(_,i)=>({...before.scenes[0],id:'full-'+i}))}
 assert.throws(()=>addLobbyTavern(full,'overflow'),/20 сцен/)
 assert.equal(full.scenes.length,20)
})

async function seed(){
 await mount();scenes.scenes[0].objects=[load('tabletopCatalog').createTabletopObject('table','table',{x:4,y:5,z:0}),load('tabletopCatalog').createTabletopObject('timber-door','door',{x:10,y:5,z:0})]
 const original=window.confirm;window.confirm=()=>true
 try{await flush(()=>button('Загрузить свежие сцены').click())}finally{window.confirm=original}
}
const editTable=x=>editor.onChange({...editor.value,scenes:editor.value.scenes.map(s=>({...s,objects:s.objects.map(o=>o.id==='table'?{...o,x}:o)}))})
const currentTable=()=>editor.value.scenes[0].objects.find(o=>o.id==='table')
const openServerDoor=()=>{scenes.scenes[0].objects.find(o=>o.id==='door').open=true;revision++}

test('Сверка: независимые правки попадают в черновик без записи; сохранение использует свежую ревизию',async()=>{
 await seed();await flush(()=>editTable(8));openServerDoor();await flush(render)
 const localBefore=readSceneDraft(accountId,'live-room')
 await flush(()=>button('Сверить с сервером').click())
 assert(document.querySelector('[aria-label="Сверка сцен с сервером"]'));assert.equal(writes.length,0)
 assert.equal(readSceneDraft(accountId,'live-room').revision,localBefore.revision)
 assert(!button('Принять согласованный черновик').disabled)
 await flush(()=>button('Принять согласованный черновик').click())
 assert.equal(writes.length,0);assert.equal(currentTable().x,8);assert(editor.value.scenes[0].objects.find(o=>o.id==='door').open)
 let draft=readSceneDraft(accountId,'live-room');assert.equal(draft.revision,8);assert.deepEqual(draft.baseScenes,scenes)
 assert(!document.querySelector('input[type=checkbox]').checked)
 await flush(()=>button('Сохранить сцены на сервер').click());assert.equal(writes.length,1);assert.equal(writes[0].revision,8)
 assert.equal(writes[0].baseScenes,undefined);assert.equal(writes[0].actors,undefined)
 draft=readSceneDraft(accountId,'live-room');assert.deepEqual(draft.baseScenes,draft.scenes)
})
test('Сверка: спорный перенос требует явного выбора и не записывается автоматически',async()=>{
 await seed();await flush(()=>document.querySelector('input[type=checkbox]').click());await flush(()=>editTable(8))
 scenes.scenes[0].objects.find(o=>o.id==='table').x=11;revision++;await flush(render)
 await flush(()=>button('Сверить с сервером').click())
 assert(button('Принять согласованный черновик').disabled);assert.equal(document.querySelectorAll('[data-merge-conflict]').length,1)
 await flush(()=>document.querySelector('[data-merge-conflict] input[value=local]').click())
 assert(!button('Принять согласованный черновик').disabled)
 await flush(()=>button('Принять согласованный черновик').click());await flush(null,520)
 assert.equal(currentTable().x,8);assert.equal(writes.length,0);assert(!document.querySelector('input[type=checkbox]').checked)
})
test('Сверка: локальное редактирование, новая серверная версия и отзыв доступа блокируют старый результат',async()=>{
 await seed();await flush(()=>editTable(8));openServerDoor();await flush(render);await flush(()=>button('Сверить с сервером').click())
 await flush(()=>editTable(9));assert(button('Принять согласованный черновик').disabled);assert(document.body.textContent.includes('Повтори её перед применением'))
 await flush(()=>button('Сверить с сервером').click());revision++;await flush(render)
 assert(button('Принять согласованный черновик').disabled)
 await flush(()=>button('Сверить с сервером').click());checking=true;await flush(render)
 assert(button('Принять согласованный черновик').disabled);assert.equal(writes.length,0);assert.equal(currentTable().x,9)
})
test('Сверка: медленное чтение учитывает последнюю правку и не блокирует работу мышью',async()=>{
 await seed();const native=request;let release
 request=(url,options)=>options?.method==='PUT'?native(url,options):new Promise(r=>release=r)
 await flush(render);await flush(()=>button('Сверить с сервером').click());assert(!editor.disabled)
 await flush(()=>editTable(9));const remote=structuredClone(scenes);remote.scenes[0].objects.find(o=>o.id==='door').open=true;revision++
 await flush(()=>release({revision,scenes:remote,actors:[]}))
 await flush(()=>button('Принять согласованный черновик').click());assert.equal(currentTable().x,9)
 assert(editor.value.scenes[0].objects.find(o=>o.id==='door').open);assert.equal(writes.length,0)
})
test('Сверка: старый ответ после смены аккаунта не открывает чужой вариант',async()=>{
 await seed();let release;const native=request
 request=()=>new Promise(r=>release=r);await flush(render);await flush(()=>button('Сверить с сервером').click())
 const origin=accountId;accountId='other-'+origin;request=native;await flush(render)
 await flush(()=>release({revision:100,scenes:structuredClone(scenes),actors:[]}))
 assert.equal(document.querySelector('[aria-label="Сверка сцен с сервером"]'),null)
 assert(button('Открыть сцены в редакторе'));assert.equal(readSceneDraft(origin,'live-room').revision,7)
})
test('Сверка: отмена согласования восстанавливает только местный черновик',async()=>{
 await seed();await flush(()=>editTable(8));const before=readSceneDraft(accountId,'live-room');openServerDoor();await flush(render)
 await flush(()=>button('Сверить с сервером').click());await flush(()=>button('Принять согласованный черновик').click())
 await flush(()=>button('Отменить согласование черновика').click())
 assert.deepEqual(readSceneDraft(accountId,'live-room'),before);assert.equal(writes.length,0);assert(scenes.scenes[0].objects.find(o=>o.id==='door').open)
 assert(button('Сохранить сцены на сервер').disabled)
})
test('Сохранение: исходный снимок переживает перезапуск страницы; повреждённый и чужой снимок не читаются',async()=>{
 await seed();await flush(()=>editTable(8))
 const key='world6.scene-draft.v1.',saved=JSON.parse(localStorage.getItem(key+JSON.stringify([accountId,'live-room'])))
 const restoreId='restore-'+accountId;localStorage.setItem(key+JSON.stringify([restoreId,'live-room']),JSON.stringify({...saved,accountId:restoreId}))
 assert.deepEqual(readSceneDraft(restoreId,'live-room').baseScenes,scenes)
 assert.equal(readSceneDraft(restoreId,'live-room').scenes.scenes[0].objects[0].x,8)
 const brokenId='broken-'+accountId;localStorage.setItem(key+JSON.stringify([brokenId,'live-room']),JSON.stringify({...saved,accountId:brokenId,baseScenes:{version:1}}))
 assert.equal(readSceneDraft(brokenId,'live-room'),null)
 const foreignId='foreign-'+accountId;localStorage.setItem(key+JSON.stringify([foreignId,'live-room']),JSON.stringify(saved))
 assert.equal(readSceneDraft(foreignId,'live-room'),null)
 const oldId='legacy-'+accountId;delete saved.baseScenes;localStorage.setItem(key+JSON.stringify([oldId,'live-room']),JSON.stringify({...saved,accountId:oldId}))
 assert(readSceneDraft(oldId,'live-room'));accountId=oldId;await flush(render);await flush(()=>button('Сверить с сервером').click())
 assert(button('Принять согласованный черновик').disabled);assert(document.body.textContent.includes('нет исходного снимка'))
 await flush(()=>document.querySelector('[data-merge-conflict] input[value=local]').click())
 await flush(()=>button('Принять согласованный черновик').click());assert.equal(currentTable().x,8);assert.equal(writes.length,0)
})
test('Сверка: целый серверный вариант исправляет несовместимые размеры и положение героя',async()=>{
 await seed();await flush(()=>editor.onChange({...editor.value,scenes:editor.value.scenes.map(s=>({...s,width:12,objects:s.objects.map(o=>o.id==='table'?{...o,x:8}:o)}))}))
 actors=[{id:'new-hero',name:'Новый герой',profile:{}}];scenes.scenes[0].tokens=[{actorId:'new-hero',x:20,y:4,z:0,diameter:.8,support:{kind:'ground'}}]
 revision++;await flush(render);await flush(()=>button('Сверить с сервером').click())
 assert(button('Принять согласованный черновик').disabled);assert(document.body.textContent.includes('несовместимы'))
 await flush(()=>document.querySelector('input[name=scene-merge-mode][value=remote]').click())
 await flush(()=>button('Принять согласованный черновик').click());assert.deepEqual(editor.value,scenes);assert(button('Сохранить сцены на сервер').disabled)
})
test('Сохранение: исходный снимок не уменьшает сетевой бюджет',()=>{
 const {assertSceneDraftSize}=load('lobbySceneDraftStorage'),{jsonBytes,MAX_CAMPAIGN_BYTES}=load('campaignLimits')
 const full={accountId:'size-user',lobbyId:'size-room',revision:0,scenes:emptyScenes(),actors:[],padding:''}
 full.padding='x'.repeat(MAX_CAMPAIGN_BYTES-jsonBytes(full)-1)
 assert(jsonBytes({...full,baseScenes:full.scenes})>MAX_CAMPAIGN_BYTES)
 assert.doesNotThrow(()=>assertSceneDraftSize({...full,baseScenes:full.scenes}))
})
