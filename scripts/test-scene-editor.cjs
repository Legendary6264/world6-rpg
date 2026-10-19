const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const {pathToFileURL}=require('node:url'),React=require('react'),{act,useState,useEffect}=React,{JSDOM}=require('jsdom')
const dom=new JSDOM('<div id="root"></div>',{url:'https://editor.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'))
let viewport,current,setExternal,writes=0
const stubs={SceneViewport:{__esModule:true,SceneGlyph:()=>null,default:p=>{viewport=p;return React.createElement('button',{'data-canvas':true},'Сцена')}},VisualElements:{ArtworkPicker:()=>null}}
const cache=new Map()
function load(name){
 if(name.endsWith('.css'))return {};if(stubs[name])return stubs[name];if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name)
 const mod={exports:{}};cache.set(name,mod)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports)
 return mod.exports
}
const Editor=load('SceneEditor').default,{create3DSandbox}=load('sandboxCampaign')
const flush=async fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,10))})
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
async function fixture(options={}){
 await flush(()=>root.render(null));writes=0
 const {world}=create3DSandbox('editor')
 function Wrapper(){const [value,setValue]=useState(world.campaign.scenes);useEffect(()=>{current=value;setExternal=setValue},[value]);return React.createElement(Editor,{value,actors:world.characters,disabled:options.disabled,onChange:next=>{writes++;if(options.reject)return {ok:false,message:'Отказ записи'};setValue(next);return {ok:true,message:'Сохранено'}}})}
 await flush(()=>root.render(React.createElement(Wrapper)));await flush();return world
}
async function key(key,extra={},target=document.querySelector('[data-canvas]')){let event;await flush(()=>{event=new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event)});return event}
const active=()=>current.scenes.find(s=>s.id===current.activeSceneId)
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})

test('Редактор: клавиши, дублирование, undo/redo и одна запись на завершённый перенос',async()=>{
 await fixture();const o=active().objects.find(o=>o.kind==='crate'),original=o.x,count=active().objects.length
 await flush(()=>viewport.onSelect({kind:'object',id:o.id}));await key('ArrowRight')
 assert.equal(active().objects.find(v=>v.id===o.id).x,original+.25)
 await key('z',{ctrlKey:true});assert.equal(active().objects.find(v=>v.id===o.id).x,original)
 await key('z',{ctrlKey:true,shiftKey:true});assert.equal(active().objects.find(v=>v.id===o.id).x,original+.25)
 await key('d',{ctrlKey:true});assert.equal(active().objects.length,count+1)
 const copy=viewport.selection;assert.notEqual(copy.id,o.id)
 await key('Delete');assert.equal(active().objects.length,count)
 await key('z',{ctrlKey:true});assert.equal(active().objects.length,count+1)
 await flush(()=>viewport.onSelect({kind:'object',id:o.id}));await key('g');assert(viewport.onMove)
 const before=writes;await flush(()=>viewport.onMove({kind:'object',id:o.id},{x:12,y:15,z:0}))
 assert.equal(writes,before+1);assert.equal(active().objects.find(v=>v.id===o.id).x,12)
 await key('z',{ctrlKey:true});assert.equal(active().objects.find(v=>v.id===o.id).x,original+.25)
})
test('Редактор: поля сохраняют обычный ввод; внешняя замена сбрасывает историю; read-only и отказ защищены',async()=>{
 await fixture();const o=active().objects[0];await flush(()=>viewport.onSelect({kind:'object',id:o.id}));await key('ArrowRight')
 const old=JSON.stringify(current),input=document.querySelector('input[name=name]');assert(input)
 const e=await key('z',{ctrlKey:true},input);assert(!e.defaultPrevented);assert.equal(JSON.stringify(current),old)
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>({...s,name:s.name+' извне'}))}));assert(button('↶ Отменить').disabled)
 await fixture({disabled:true});await flush(()=>viewport.onSelect({kind:'object',id:active().objects[0].id}));await key('d',{ctrlKey:true});await key('ArrowRight');await key('Delete');assert.equal(writes,0)
 await fixture({reject:true});await flush(()=>viewport.onSelect({kind:'object',id:active().objects[0].id}));await key('ArrowRight');assert(button('↶ Отменить').disabled);assert(document.body.textContent.includes('Отказ записи'))
})
test('Команды редактора сохраняют опоры, исходник и границы; копия не копирует персонажа',()=>{
 const {translateEditorSelection,duplicateEditorObject,removeEditorSelection}=load('sceneEditorCommands'),{world}=create3DSandbox('supports'),s=world.campaign.scenes
 s.activeSceneId=s.scenes[2].id
 const scene=s.scenes[2],platform=scene.objects.find(o=>o.kind==='platform'),token=scene.tokens[0],source=JSON.stringify(s)
 const moved=translateEditorSelection(s,{kind:'object',id:platform.id},{x:2,y:3,z:.5}),after=moved.scenes[2].tokens[0]
 assert.equal(after.x,token.x+2);assert.equal(after.y,token.y+3);assert.equal(after.z,token.z+.5);assert.equal(JSON.stringify(s),source)
 assert.throws(()=>removeEditorSelection(s,{kind:'object',id:platform.id}),/стоит персонаж/)
 assert.throws(()=>translateEditorSelection(s,{kind:'token',id:token.actorId},{x:0,y:0,z:1}),/опорой/)
 assert.throws(()=>translateEditorSelection(s,{kind:'object',id:platform.id},{x:1e7,y:0,z:0}),/Проверь/)
 const copy=duplicateEditorObject(s,platform.id,'new-platform');assert.equal(copy.scenes[2].tokens.length,scene.tokens.length)
 assert.equal(copy.scenes[2].tokens[0].support.objectId,platform.id)
})
