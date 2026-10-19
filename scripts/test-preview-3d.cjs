const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const {pathToFileURL}=require('node:url')
const React=require('react'),{JSDOM}=require('jsdom'),{act}=React
const dom=new JSDOM('<div id="root"></div>',{url:'https://preview.example.test/?preview=3d'})
Object.assign(global,{window:dom.window,document:dom.window.document,location:dom.window.location,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'))
let providerMounts=0,viewport
const stubs={
 SceneViewport:{__esModule:true,default:p=>{viewport=p;return React.createElement('button',{'data-pick-door':true,onClick:()=>p.onSelect({kind:'object',id:p.scene.objects.find(o=>o.kind==='door').id})},p.scene.name)}},
 SceneEditor:{__esModule:true,default:p=>React.createElement('button',{'data-edit':true,onClick:()=>p.onChange({...p.value,scenes:p.value.scenes.map((s,i)=>i===0?{...s,name:'Моя сцена'}:s)})},'Изменить копию')},
 TutorialSandbox:{__esModule:true,default:()=>React.createElement('p',null,'Учебный эпизод')},
 OnlineProvider:{__esModule:true,default:({children})=>{providerMounts++;return children}},App:{__esModule:true,default:()=>React.createElement('p',null,'Обычный сайт')},
}
function modules(env={}){const cache=new Map();function load(name){
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
 const Entry=load('AppEntry').default;await mount(Entry);assert.equal(providerMounts,0);assert(document.querySelector('h1').textContent.includes('трёх миров'))
 dom.reconfigure({url:'https://preview.example.test/'});await mount(Entry);assert(providerMounts>0);assert(document.body.textContent.includes('Обычный сайт'))
 providerMounts=0;const BuildEntry=modules({VITE_PREVIEW_ONLY:'true'})('AppEntry').default;await mount(BuildEntry);assert.equal(providerMounts,0)
})
test('Три области, четыре игровые метки, дверь, сохранение и восстановление копии',async()=>{
 localStorage.clear();await mount();assert.equal(document.querySelectorAll('[aria-label="Области полигона"] button').length,3)
 assert.equal(viewport.scene.tokens.filter(t=>t.actorId.startsWith('preview-player-')).length,4)
 await flush(()=>document.querySelector('[data-pick-door]').click());await click('Открыть дверь')
 assert(viewport.scene.objects.find(o=>o.kind==='door').open)
 await mount();assert(viewport.scene.objects.find(o=>o.kind==='door').open)
 const areas=document.querySelectorAll('[aria-label="Области полигона"] button');await flush(()=>areas[1].click());assert(viewport.scene.name.includes('лес'))
 await click('Редактор');await flush(()=>document.querySelector('[data-edit]').click());assert.equal(JSON.parse(localStorage.getItem(key)).scenes[0].name,'Моя сцена')
 await click('Учебный раунд');assert(document.body.textContent.includes('Учебный эпизод'))
})
test('Повреждённая копия восстанавливается; сброс отменяется или подтверждается явно',async()=>{
 localStorage.setItem(key,'{"version":99}');await mount();assert.equal(document.querySelectorAll('[aria-label="Области полигона"] button').length,3)
 await click('Редактор');await flush(()=>document.querySelector('[data-edit]').click())
 window.confirm=()=>false;await click('Сбросить копию');assert.equal(JSON.parse(localStorage.getItem(key)).scenes[0].name,'Моя сцена')
 window.confirm=()=>true;await click('Сбросить копию');assert(JSON.parse(localStorage.getItem(key)).scenes[0].name.includes('поселение'))
})
