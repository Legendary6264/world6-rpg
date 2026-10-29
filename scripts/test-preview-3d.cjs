const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const {pathToFileURL}=require('node:url')
const React=require('react'),{JSDOM}=require('jsdom'),{act}=React
const dom=new JSDOM('<div id="root"></div>',{url:'https://preview.example.test/?preview=3d'})
Object.assign(global,{window:dom.window,document:dom.window.document,location:dom.window.location,localStorage:dom.window.localStorage,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'))
let providerMounts=0,viewport
const stubs={
 SceneViewport:{__esModule:true,SceneGlyph:()=>null,default:p=>{viewport=p;return React.createElement('button',{'data-canvas':true},p.scene.name)}},
 VisualElements:{ArtworkPicker:()=>null},
 TutorialSandbox:{__esModule:true,default:()=>React.createElement('p',null,'Учебный эпизод')},
 OnlineProvider:{__esModule:true,default:({children})=>{providerMounts++;return children}},App:{__esModule:true,default:()=>React.createElement('p',null,'Обычный сайт')},
}
function modules(env={BASE_URL:'/'}){const cache=new Map();function load(name){
 name=name.replace(/\.tsx?$/,'')
 if(stubs[name])return stubs[name];if(name.endsWith('.css'))return {};if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name)
 const mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.env',JSON.stringify(env)).replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports)
 return mod.exports
 }return load}
const load=modules(),Preview=load('Preview3D').default,key='grani-bytiya:3d-preview:v1'
const flush=async fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,15))})
async function click(text){const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert(b,text);await flush(()=>b.click());await flush()}
async function mount(Component=Preview){await flush(()=>root.render(null));await flush(()=>root.render(React.createElement(Component)));await flush()}
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})
test('Полигон открывается без сетевого провайдера; обычный вход сохраняется',async()=>{
 const Entry=load('AppEntry').default;await mount(Entry);assert.equal(providerMounts,0);assert(document.querySelector('.gb-preview-brand').textContent.includes('Грани Бытия'))
 dom.reconfigure({url:'https://preview.example.test/'});await mount(Entry);assert(providerMounts>0);assert(document.body.textContent.includes('Обычный сайт'))
 providerMounts=0;const BuildEntry=modules({VITE_PREVIEW_ONLY:'true',BASE_URL:'/'})('AppEntry').default;await mount(BuildEntry);assert.equal(providerMounts,0)
})
const saved=()=>JSON.parse(localStorage.getItem(key))
async function chooseScene(index){const select=document.querySelector('[aria-label="Открытая сцена"]');await flush(()=>{select.value=saved().scenes[index].id;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
test('Четыре области, четыре объёмные фигурки, действия, сохранение и восстановление копии',async()=>{
 localStorage.clear();await mount();assert.equal(document.querySelectorAll('[aria-label="Открытая сцена"] option').length-1,4)
 assert.equal(viewport.scene.tokens.filter(t=>t.actorId.startsWith('preview-player-')).length,4)
 const door=viewport.scene.objects.find(o=>o.kind==='door');await flush(()=>viewport.onSelect({kind:'object',id:door.id}));await click('Открыть')
 assert(viewport.scene.objects.find(o=>o.id===door.id).open)
 await mount();assert(viewport.scene.objects.find(o=>o.id===door.id).open)
 await chooseScene(1);assert(viewport.scene.name.includes('лес'))
 await click('Редактор');assert(document.querySelector('[aria-label="Инструменты строительства"]'))
 await click('Учебный раунд');assert(document.body.textContent.includes('Учебный эпизод'))
})
test('Повреждённая копия восстанавливается; сброс отменяется или подтверждается явно',async()=>{
 localStorage.setItem(key,'{"version":99}');await mount();assert.equal(document.querySelectorAll('[aria-label="Открытая сцена"] option').length-1,4)
 await click('Редактор');const table=viewport.scene.objects.find(o=>o.id.endsWith(':practice-crate'));await flush(()=>viewport.onMove({kind:'object',id:table.id},{x:table.x+.5,y:table.y,z:table.z}))
 const before=saved();window.confirm=()=>false;await click('Сбросить копию');assert.deepEqual(saved(),before)
 window.confirm=()=>true;await click('Сбросить копию');assert.equal(viewport.scene.objects.find(o=>o.id===table.id).x,table.x)
})
test('Мастерская открывается в сохранённой копии и повторно не дублирует сцену',async()=>{
 await mount();const before=saved(),ids=before.scenes.map(s=>s.id)
 await click('Детальная сцена');assert(viewport.scene.name.includes('Мастерская'));assert.equal(viewport.scene.objects.length,9)
 assert.equal(saved().scenes.length,ids.length+1);assert.deepEqual(saved().scenes.slice(0,ids.length),before.scenes)
 const id=viewport.scene.id;await click('Редактор');await click('Детальная сцена');assert.equal(saved().activeSceneId,id);assert.equal(saved().scenes.length,ids.length+1)
 await mount();assert.equal(viewport.scene.id,id)
})
test('Вода и фигурки: четыре образца сохраняют существующие сцены',async()=>{
 const before=saved();await click('Вода и фигурки');assert.equal(viewport.scene.tokens.length,4);assert(viewport.scene.tokens.every(t=>t.actorId.startsWith('preview-figure-')))
 assert.equal(viewport.scene.objects.filter(o=>o.kind==='water').length,2);assert.deepEqual(saved().scenes.slice(0,before.scenes.length),before.scenes)
 assert.equal(saved().scenes.length,before.scenes.length+1)
 const id=viewport.scene.id;await click('Вода и фигурки');assert.equal(saved().scenes.length,before.scenes.length+1);await mount();assert.equal(viewport.scene.id,id)
})
test('Новая таверна сохраняет версию 0.10 и её героев; режимы используют одну историю undo/redo',async()=>{
 const {create3DSandbox}=load('sandboxCampaign'),{createTavernScene}=load('tabletopShowcase'),old=create3DSandbox('old-copy').world.campaign.scenes
 old.scenes.forEach(s=>s.tokens=[]);old.scenes.push(createTavernScene(['preview-tavern-0','preview-tavern-1','preview-tavern-2','preview-tavern-3']));localStorage.setItem(key,JSON.stringify(old));await mount()
 const before=structuredClone(old);await click('Таверна');assert.equal(viewport.scene.tokens.length,4);assert.deepEqual(saved().scenes.slice(0,4),before.scenes)
 const lamp=viewport.scene.objects.find(o=>o.asset==='candle'),table=viewport.scene.objects.find(o=>o.asset==='table'),originalLamp=structuredClone(lamp)
 await flush(()=>viewport.onMove({kind:'object',id:table.id},{x:table.x+.5,y:table.y+.5,z:table.z}));await flush(()=>viewport.onSelect({kind:'object',id:lamp.id}));await click('Погасить')
 await click('Редактор');assert.equal(viewport.scene.objects.find(o=>o.id===lamp.id).active,false)
 await click('↶ Отменить');assert.deepEqual(viewport.scene.objects.find(o=>o.id===lamp.id),originalLamp)
 await click('↷ Вернуть');assert.equal(viewport.scene.objects.find(o=>o.id===lamp.id).active,false)
 await click('Игровой стол');assert.equal(viewport.scene.objects.find(o=>o.id===table.id).x,table.x+.5)
 const count=saved().scenes.length;await click('Таверна');assert.equal(saved().scenes.length,count)
 await mount();assert.equal(viewport.scene.objects.find(o=>o.id===lamp.id).active,false)
})
test('Базовые модели: отдельная сцена со всеми состояниями сохраняет работу, не дублируется и помнит действия',async()=>{
 const before=saved();await click('Базовые модели');assert(viewport.scene.name.startsWith('Базовые модели'));assert.equal(viewport.scene.objects.length,8)
 assert(viewport.scene.objects.every(o=>!o.asset));assert.equal(viewport.scene.objects.filter(o=>o.kind==='door'&&o.open).length,1);assert.equal(viewport.scene.objects.filter(o=>o.kind==='crate'&&o.open).length,1)
 assert.equal(viewport.scene.objects.filter(o=>o.kind==='lamp'&&o.active===false).length,1);assert.deepEqual(saved().scenes.slice(0,before.scenes.length),before.scenes)
 const id=viewport.scene.id,container=viewport.scene.objects.find(o=>o.kind==='crate'&&o.open)
 await flush(()=>viewport.onSelect({kind:'object',id:container.id}));await click('Закрыть');assert.equal(viewport.scene.objects.find(o=>o.id===container.id).open,false)
 await mount();assert.equal(viewport.scene.id,id);assert.equal(viewport.scene.objects.find(o=>o.id===container.id).open,false)
 await click('Базовые модели');assert.equal(saved().scenes.length,before.scenes.length+1)
})
test('Таверна из ролика добавляется к прежней работе, не дублирует героев и сохраняет изменения при повторном открытии',async()=>{
 const before=saved();await click('Таверна из ролика');assert(viewport.scene.name.includes('видеореференсу'))
 assert.equal(viewport.scene.tokens.length,4);assert(viewport.scene.tokens.every(t=>t.actorId.startsWith('preview-reference-video2-')))
 assert.deepEqual(saved().scenes.slice(0,before.scenes.length),before.scenes)
 const allActors=saved().scenes.flatMap(s=>s.tokens.map(t=>t.actorId));assert.equal(new Set(allActors).size,allActors.length)
 const count=saved().scenes.length,id=viewport.scene.id,table=viewport.scene.objects.find(o=>o.asset==='round-table')
 await flush(()=>viewport.onMove({kind:'object',id:table.id},{x:table.x+.25,y:table.y,z:table.z}))
 await click('Таверна');assert.notEqual(viewport.scene.id,id)
 await click('Таверна из ролика');assert.equal(viewport.scene.id,id);assert.equal(saved().scenes.length,count)
 assert.equal(viewport.scene.objects.find(o=>o.id===table.id).x,table.x+.25)
 await mount();assert.equal(viewport.scene.id,id);assert.equal(viewport.scene.objects.find(o=>o.id===table.id).x,table.x+.25)
})
test('Переполнение хранилища: предупреждение остаётся после открытия примеров и сброса до успешного сохранения',async()=>{
 const prototype=dom.window.Storage.prototype,original=prototype.setItem
 try{
  prototype.setItem=function(k,value){if(k===key)throw Error('Quota exceeded');return original.call(this,k,value)}
  await click('Таверна');assert(document.querySelector('[role=alert]').textContent.includes('Сохранение браузера недоступно'))
  await click('Таверна из ролика');assert(document.querySelector('[role=alert]').textContent.includes('Экспортируй сцену'))
  window.confirm=()=>true;await click('Сбросить копию');assert(document.querySelector('[role=alert]').textContent.includes('Сохранение браузера недоступно'))
 }finally{prototype.setItem=original}
 await click('Таверна из ролика');assert.equal(document.querySelector('.gb-preview-storage-warning'),null);assert(saved())
})
test('Обновлённый пример сохраняет таверну v0.17 и добавляет новую с отдельными предметами и героями',async()=>{
 const {createVideoTavernScene,legacyVideoTavernSceneId}=load('tavernReference')
 const scene=createVideoTavernScene([0,1,2,3].map(i=>'preview-reference-video-'+i));scene.id=legacyVideoTavernSceneId;scene.name='Моя таверна v0.17';scene.objects=scene.objects.filter(o=>!['mug','plate','bread'].includes(o.asset))
 const before={version:1,activeSceneId:scene.id,scenes:[scene]};localStorage.setItem(key,JSON.stringify(before));await mount();assert.equal(viewport.scene.id,scene.id)
 await click('Таверна из ролика');assert.notEqual(viewport.scene.id,scene.id);assert(viewport.scene.objects.some(o=>o.asset==='mug'));assert.deepEqual(saved().scenes[0],before.scenes[0])
 const ids=saved().scenes.flatMap(s=>s.tokens.map(t=>t.actorId));assert.equal(new Set(ids).size,ids.length)
})

test('Исходные сцены возвращаются без сброса сохранённых правок и не дублируются при переключении',async()=>{
 const {create3DSandbox}=load('sandboxCampaign'),old=create3DSandbox('browser-preview',{environment:'legacy'}).world.campaign.scenes
 const settlement=old.scenes[0],tree=settlement.objects.find(o=>o.kind==='tree'),removed=settlement.objects.find(o=>o.kind==='rock')
 tree.x=22;tree.width=1.5;settlement.objects=settlement.objects.filter(o=>o.id!==removed.id);settlement.name='Моя прежняя сцена'
 old.activeSceneId=old.scenes[1].id;localStorage.setItem(key,JSON.stringify(old));await mount()
 assert.equal(viewport.scene.id,old.activeSceneId,'Loading retains the saved active scene')
 await click('Исходные сцены');assert.equal(viewport.scene.id,settlement.id);assert.equal(viewport.scene.name,settlement.name)
 assert.deepEqual(viewport.scene.objects.find(o=>o.id===tree.id),tree);assert(!viewport.scene.objects.some(o=>o.id===removed.id));assert.equal(viewport.scene.objects.length,settlement.objects.length)
 const before=saved();await click('Лес и дорога');assert.equal(viewport.scene.id,old.scenes[1].id);await click('Подземелье');assert.equal(viewport.scene.id,old.scenes[2].id)
 assert.equal(saved().scenes.length,before.scenes.length);assert.deepEqual(saved().scenes[0],before.scenes[0]);await mount();assert.equal(viewport.scene.id,old.scenes[2].id)
})
