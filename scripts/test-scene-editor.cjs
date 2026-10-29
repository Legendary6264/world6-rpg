const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const {pathToFileURL}=require('node:url'),React=require('react'),{act,useState,useEffect}=React,{JSDOM}=require('jsdom')
const dom=new JSDOM('<div id="root"></div>',{url:'https://editor.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'))
let viewport,current,setExternal,setScope,environmentPicker,selectedModelPicker,writes=0
const stubs={SceneViewport:{__esModule:true,SceneGlyph:()=>null,default:p=>{viewport=p;return React.createElement('button',{'data-canvas':true},'Сцена')}},VisualElements:{ArtworkPicker:p=>{if(p.label==='Объект для размещения')environmentPicker=p;if(p.label==='Модель объекта'||p.label==='Изображение на схеме')selectedModelPicker=p;return null}}}
const cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'')
 if(name.endsWith('.css'))return {};if(stubs[name])return stubs[name];if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name)
 const mod={exports:{}};cache.set(name,mod)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.env',JSON.stringify({BASE_URL:'/'})).replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports)
 return mod.exports
}
const Editor=load('SceneEditor').default,{create3DSandbox}=load('sandboxCampaign')
const flush=async fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,10))})
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
async function fixture(options={}){
 await flush(()=>root.render(null));writes=0
 const {world}=create3DSandbox('editor',{environment:'legacy'})
 function Wrapper(){const [value,setValue]=useState(world.campaign.scenes),[scope,changeScope]=useState(options.libraryScope);useEffect(()=>{current=value;setExternal=setValue;setScope=changeScope},[value]);return React.createElement(Editor,{value,actors:world.characters,disabled:options.disabled,mode:options.mode,libraryScope:scope,onChange:next=>{writes++;if(options.reject)return {ok:false,message:'Отказ записи'};setValue(next);return {ok:true,message:'Сохранено'}}})}
 await flush(()=>root.render(React.createElement(Wrapper)));await flush();return world
}
async function key(key,extra={},target=document.querySelector('[data-canvas]')){let event;await flush(()=>{event=new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event)});return event}
const active=()=>current.scenes.find(s=>s.id===current.activeSceneId)
function arrangementFixture(){
 const {createScene,emptyScenes,sceneObject}=load('scenes'),state=createScene(emptyScenes(),'precise-layout','Точная расстановка','top'),scene=state.scenes[0]
 scene.objects=[1,2,.5].map((width,i)=>({...sceneObject('platform','precise-'+i,{x:[3,8,13][i],y:5+i,z:0}),name:['Левый','Ориентир','Правый'][i],width,depth:[1,2,1][i],height:1,canSupport:true}))
 scene.tokens=[{actorId:'rider',x:8.25,y:6.25,z:1,diameter:.5,support:{kind:'object',objectId:'precise-1'}}]
 return {state,scene,items:scene.objects.map(o=>({kind:'object',id:o.id}))}
}
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

test('Редактор: прямой перенос доступен сразу, без выбора инструмента G, и отменяется одним шагом',async()=>{
 await fixture();assert.equal(typeof viewport.onMove,'function')
 const o=active().objects.find(o=>o.kind==='crate'),before=structuredClone(o)
 await flush(()=>viewport.onSelect({kind:'object',id:o.id}));assert(viewport.onMove)
 await flush(()=>viewport.onMove({kind:'object',id:o.id},{x:o.x+2,y:o.y+1,z:o.z}))
 assert.equal(writes,1);assert.equal(active().objects.find(v=>v.id===o.id).x,o.x+2)
 await key('z',{ctrlKey:true});assert.deepEqual(active().objects.find(v=>v.id===o.id),before)
})

test('3D-библиотека: штамп, R, кисть одним шагом undo и ластик без удаления мебели',async()=>{
 await fixture()
 const card=name=>[...document.querySelectorAll('.gb-tabletop-assets button')].find(b=>b.querySelector('strong')?.textContent===name)
 const count=active().objects.length
 await flush(()=>card('Обеденный стол').click());await key('r');await flush(()=>viewport.onPoint({x:10,y:12,z:0}))
 const table=active().objects.at(-1);assert.equal(table.asset,'table');assert.equal(table.facing,90);assert.equal(table.width,1);assert.equal(active().objects.length,count+1)
 await key('v');await flush(()=>viewport.onSelect({kind:'object',id:table.id}));await key('r');assert.equal(active().objects.at(-1).facing,180)
 await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Полы').click());await flush(()=>card('Дощатый пол').click())
 assert.equal(viewport.brush.asset,'floor-wood');const before=writes,cells=[{x:1,y:1,z:0},{x:3,y:1,z:0},{x:5,y:1,z:0}]
 await flush(()=>viewport.onPaintStroke(cells));assert.equal(writes,before+1);assert.equal(active().objects.length,count+4)
 await key('z',{ctrlKey:true});assert.equal(active().objects.length,count+1)
 await key('z',{ctrlKey:true,shiftKey:true});assert.equal(active().objects.length,count+4)
 await flush(()=>button('Ластик пола').click());await flush(()=>viewport.onPaintStroke(cells));assert.equal(active().objects.length,count+1);assert(active().objects.some(o=>o.id===table.id))
 await key('z',{ctrlKey:true});assert.equal(active().objects.length,count+4)
})

test('Группа: Shift, перенос и поворот одной командой, дублирование, удаление и история',async()=>{
 await fixture();const items=active().objects.filter(o=>o.kind==='crate'||o.kind==='tree').slice(0,2),original=structuredClone(active()),count=original.objects.length
 await flush(()=>viewport.onSelect({kind:'object',id:items[0].id}));await flush(()=>viewport.onSelect({kind:'object',id:items[1].id},{extend:true}));assert.equal(viewport.selections.length,2)
 await flush(()=>viewport.onSelect({kind:'object',id:items[0].id}));assert.equal(viewport.selections.length,2,'Clicking a selected member retains the group')
 await flush(()=>viewport.onMove({kind:'object',id:items[0].id},{x:items[0].x+1,y:items[0].y+1,z:items[0].z}));assert.equal(writes,1)
 for(const o of items){const next=active().objects.find(v=>v.id===o.id);assert.equal(next.x,o.x+1);assert.equal(next.y,o.y+1)}
 await key('z',{ctrlKey:true});assert.deepEqual(active(),original)
 await key('r');assert.equal(writes,3);for(const o of items)assert.equal(active().objects.find(v=>v.id===o.id).facing,90)
 await key('z',{ctrlKey:true});assert.deepEqual(active(),original)
 await key('d',{ctrlKey:true});assert.equal(active().objects.length,count+2);assert.equal(viewport.selections.length,2)
 await key('Delete');assert.equal(active().objects.length,count)
 await key('z',{ctrlKey:true});assert.equal(active().objects.length,count+2)
 await key('Escape');assert.equal(viewport.selections.length,0)
})
test('Группа: выбранная опора несёт героя один раз; отказ, удаление и копирование сохраняют источник',()=>{
 const {translateEditorGroup,removeEditorGroup,duplicateEditorGroup,rotateEditorGroup}=load('sceneEditorCommands'),{world}=create3DSandbox('group-support'),state=world.campaign.scenes
 state.activeSceneId=state.scenes[2].id;const scene=state.scenes[2],platform=scene.objects.find(o=>o.kind==='platform'),token=scene.tokens[0],items=[{kind:'object',id:platform.id},{kind:'token',id:token.actorId}],before=structuredClone(state)
 const moved=translateEditorGroup(state,items,{x:1,y:1,z:.5}).scenes[2];assert.equal(moved.tokens[0].x,token.x+1);assert.equal(moved.tokens[0].z,token.z+.5);assert.equal(moved.objects.find(o=>o.id===platform.id).x,platform.x+1)
 assert.throws(()=>translateEditorGroup(state,items,{x:1e6,y:0,z:0}));assert.deepEqual(state,before)
 assert.throws(()=>removeEditorGroup(state,[items[0]]),/стоит персонаж/)
 const removed=removeEditorGroup(state,items).scenes[2];assert(!removed.objects.some(o=>o.id===platform.id));assert(!removed.tokens.some(t=>t.actorId===token.actorId))
 const copy=duplicateEditorGroup(state,items,()=> 'platform-copy');assert.equal(copy.items.length,1);assert.equal(copy.state.scenes[2].tokens.length,scene.tokens.length);assert.equal(copy.state.scenes[2].tokens[0].support.objectId,platform.id)
 const boundary=structuredClone(state),pair=boundary.scenes[2].objects.filter(o=>o.id!==platform.id).slice(0,2);pair[0].x=scene.width;pair[1].x=scene.width-1
 let serial=0;const copied=duplicateEditorGroup(boundary,pair.map(o=>({kind:'object',id:o.id})),()=> 'edge-copy-'+serial++).state.scenes[2].objects.filter(o=>o.id.startsWith('edge-copy-'))
 assert.equal(copied[0].x-copied[1].x,pair[0].x-pair[1].x);assert(copied[0].x<pair[0].x);assert(copied.every(o=>o.x-o.width/2>=0&&o.x+o.width/2<=scene.width))
 const rotating=structuredClone(state),rs=rotating.scenes[2],rp=rs.objects.find(o=>o.id===platform.id),dx=rs.width/2-rp.x,dy=rs.depth/2-rp.y
 rp.x+=dx;rp.y+=dy;rs.tokens[0].x+=dx;rs.tokens[0].y+=dy
 const rotationBefore=structuredClone(rotating);let turned=rotating;for(let i=0;i<4;i++)turned=rotateEditorGroup(turned,items)
 assert.deepEqual(turned.scenes[2].tokens,rotationBefore.scenes[2].tokens);assert.equal(turned.scenes[2].objects.find(o=>o.id===platform.id).x,rp.x);assert.deepEqual(state,before)
})
test('Фильтр выделения: Ctrl+A выбирает мебель без пола, окружения и героев; поля сохраняют ввод',async()=>{
 await fixture();const select=document.querySelector('[aria-label="Выбор на сцене"]');await flush(()=>{select.value='props';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});await key('a',{ctrlKey:true})
 assert.equal(viewport.selectionFilter,'props');assert(viewport.selections.length>0)
 assert(viewport.selections.every(s=>s.kind==='object'&&['crate','lamp'].includes(active().objects.find(o=>o.id===s.id).kind)))
 assert.equal(writes,0);const before=viewport.selections.length,input=document.querySelector('input[name=name]');await key('a',{ctrlKey:true},input);assert.equal(viewport.selections.length,before)
})

test('Расстановка: выравнивание по краям, равные зазоры разных размеров и перенос героя с опорой',()=>{
 const {arrangeEditorObjects}=load('sceneEditorCommands'),{createScene,emptyScenes,sceneObject}=load('scenes')
 const state=createScene(emptyScenes(),'layout','Расстановка','top'),scene=state.scenes[0]
 scene.objects=[1,2,.5].map((width,i)=>({...sceneObject('platform','obj-'+i,{x:[2,8,13][i],y:4+i,z:0}),width,depth:1,height:1,canSupport:true}))
 scene.tokens=[{actorId:'hero',x:2,y:4,z:1,diameter:.5,support:{kind:'object',objectId:'obj-0'}}]
 const items=scene.objects.map(o=>({kind:'object',id:o.id})),before=structuredClone(state)
 const left=arrangeEditorObjects(state,items,'x','min').scenes[0];assert.deepEqual(left.objects.map(o=>o.x-o.width/2),[1.5,1.5,1.5]);assert.equal(left.tokens[0].x,2)
 const right=arrangeEditorObjects(state,items,'x','max').scenes[0];assert.deepEqual(right.objects.map(o=>o.x+o.width/2),[13.25,13.25,13.25]);assert.equal(right.tokens[0].x,right.objects[0].x)
 const spaced=arrangeEditorObjects(state,items,'x','distribute').scenes[0].objects
 assert.equal(spaced[0].x,2);assert.equal(spaced[2].x,13)
 assert.equal(spaced[1].x-spaced[1].width/2-(spaced[0].x+spaced[0].width/2),spaced[2].x-spaced[2].width/2-(spaced[1].x+spaced[1].width/2))
 const centred=arrangeEditorObjects(state,items,'y','center').scenes[0];assert(centred.objects.every(o=>o.y===5));assert.equal(centred.tokens[0].y,5)
 assert.throws(()=>arrangeEditorObjects(state,[...items,{kind:'token',id:'hero'}],'x','min'),/без героев/)
 const tight=structuredClone(state);tight.scenes[0].tokens=[];tight.scenes[0].objects.forEach((o,i)=>{o.x=3+i*.5})
 assert.throws(()=>arrangeEditorObjects(tight,items,'x','distribute'),/раздвинь/);assert.deepEqual(state,before)
})
test('Группа: точный сдвиг через форму — одна запись и одна отмена, отказ сохраняет ввод',async()=>{
 await fixture();const pair=active().objects.filter(o=>o.kind==='crate'||o.kind==='tree').slice(0,2),before=structuredClone(active())
 await flush(()=>viewport.onSelectMany(pair.map(o=>({kind:'object',id:o.id}))))
 const form=document.querySelector('[aria-label="Точный сдвиг группы"]')
 await flush(()=>{form.elements.x.value='1.25';form.elements.y.value='.5';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))})
 assert.equal(writes,1);assert.equal(active().objects.find(o=>o.id===pair[0].id).x,pair[0].x+1.25);assert.equal(form.elements.x.value,'0')
 await key('z',{ctrlKey:true});assert.deepEqual(active(),before)
 await flush(()=>{form.elements.x.value='10000';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))})
 assert.equal(writes,2,'Invalid positions are rejected before onChange');assert.equal(form.elements.x.value,'10000');assert.deepEqual(active(),before)
})
test('Размещение: новая свеча на столе, отключённый магнит, undo и устаревшая поверхность',async()=>{
 await fixture();const card=name=>[...document.querySelectorAll('.gb-tabletop-assets button')].find(b=>b.querySelector('strong')?.textContent===name)
 await flush(()=>card('Обеденный стол').click());await flush(()=>viewport.onPoint({x:10,y:12,z:0},{surfaceId:null}));const table=active().objects.at(-1)
 await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Свет').click());await flush(()=>card('Свечи на подставке').click())
 const count=active().objects.length;await flush(()=>viewport.onPoint({x:10,y:12,z:table.height},{surfaceId:table.id}));assert.equal(active().objects.at(-1).z,table.z+table.height)
 await key('z',{ctrlKey:true});assert.equal(active().objects.length,count)
 await flush(()=>viewport.onPoint({x:10,y:12,z:table.height},{surfaceId:'missing'}));assert.equal(active().objects.length,count)
 await flush(()=>document.querySelector('[aria-label="Размещение на поверхностях"]').click());assert.equal(viewport.placement.surfaceSnap,false)
 await flush(()=>viewport.onPoint({x:10,y:12,z:table.height}));assert.equal(active().objects.at(-1).z,active().groundZ)
})
test('Сборки в UI: сохранение без записи сцены, поворот и штамп с одной отменой, своя история библиотеки',async()=>{
 await fixture({libraryScope:'test:assemblies-ui'});const original=structuredClone(active()),pair=original.objects.filter(o=>o.kind==='crate'||o.kind==='tree').slice(0,2)
 await flush(()=>viewport.onSelectMany(pair.map(o=>({kind:'object',id:o.id}))));await flush(()=>button('Мои сборки').click())
 const form=document.querySelector('[aria-label="Сохранить сборку"]');await flush(()=>{form.elements.assemblyName.value='Уголок';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))})
 assert.equal(writes,0);let card=document.querySelector('.gb-assembly-pick');assert(card);assert.equal(card.querySelector('strong').textContent,'Уголок')
 await flush(()=>card.click());assert.equal(viewport.placement.assembly.objects.length,2);await key('r');assert.equal(viewport.placement.facing,90)
 await flush(()=>viewport.onPoint({x:15,y:10,z:0}));assert.equal(writes,1);assert.equal(active().objects.length,original.objects.length+2);assert.equal(viewport.selections.length,2)
 await key('z',{ctrlKey:true});assert.equal(writes,2);assert.deepEqual(active(),original)
 await flush(()=>document.querySelector('[aria-label="Удалить сборку: Уголок"]').click());assert.equal(document.querySelectorAll('.gb-assembly-pick').length,0);assert.equal(writes,2)
 await flush(()=>button('Отмена в библиотеке').click());assert.equal(document.querySelectorAll('.gb-assembly-pick').length,1);assert.equal(writes,2)
 await fixture({libraryScope:'test:assemblies-ui'});await flush(()=>button('Мои сборки').click());assert.equal(document.querySelectorAll('.gb-assembly-pick').length,1,'Scope restores its own saved library')
 await fixture({libraryScope:'different-account:same-lobby'});await flush(()=>button('Мои сборки').click());assert.equal(document.querySelectorAll('.gb-assembly-pick').length,0)
})
test('Слои в UI: защита блокирует клавиши/перенос/undo, скрытие меняет только вид и Ctrl+A',async()=>{
 await fixture();const object=active().objects.find(o=>o.kind==='crate'),before=structuredClone(active())
 await flush(()=>viewport.onSelect({kind:'object',id:object.id}));await key('ArrowRight');assert.equal(writes,1)
 await flush(()=>button('Объекты').click());await flush(()=>document.querySelector('[aria-label="Защитить от правок: '+object.name+'"]').click())
 assert(viewport.editorProtected.includes(object.id));await key('ArrowRight');await key('Delete');await key('z',{ctrlKey:true});assert.equal(writes,1)
 await flush(()=>viewport.onMove({kind:'object',id:object.id},{x:object.x+2,y:object.y,z:object.z}));assert.equal(writes,1)
 await flush(()=>document.querySelector('[aria-label="Снять защиту: '+object.name+'"]').click());await key('z',{ctrlKey:true});assert.equal(writes,2);assert.deepEqual(active(),before)
 await flush(()=>button('Объекты').click());await flush(()=>document.querySelector('[aria-label="Скрыть в редакторе: '+object.name+'"]').click());assert(viewport.editorHidden.includes(object.id));assert.deepEqual(active(),before)
 await key('a',{ctrlKey:true});assert(!viewport.selections.some(s=>s.kind==='object'&&s.id===object.id));assert.equal(writes,2)
 await flush(()=>button('Показать всё').click());assert.equal(viewport.editorHidden.length,0);assert.deepEqual(active(),before)
})
test('Сборки: отложенное чтение файла не отменяет удаление, сделанное в том же событии',async()=>{
 const scope='test:assembly-import-race';await fixture({libraryScope:scope});const object=active().objects.find(o=>o.kind==='crate')
 await flush(()=>viewport.onSelect({kind:'object',id:object.id}));await flush(()=>button('Мои сборки').click())
 const form=document.querySelector('[aria-label="Сохранить сборку"]');await flush(()=>{form.elements.assemblyName.value='Исходная';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))})
 const {readAssemblyLibrary,encodeAssemblyLibrary}=load('sceneAssemblies'),original=readAssemblyLibrary(scope)[0],raw=encodeAssemblyLibrary([{...original,id:'incoming',name:'Из файла'}])
 let resolve;const fake={size:raw.length,text:()=>new Promise(r=>{resolve=r})},input=document.querySelector('.gb-assembly-transfer input[type=file]')
 await flush(()=>{Object.defineProperty(input,'files',{value:[fake],configurable:true});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 assert.equal(typeof resolve,'function');await flush(()=>{document.querySelector('[aria-label="Удалить сборку: Исходная"]').click();resolve(raw)})
 assert.equal(document.querySelectorAll('.gb-assembly-pick').length,0);assert.equal(readAssemblyLibrary(scope).length,0);assert(document.body.textContent.includes('изменилась во время чтения'));assert.equal(writes,0)
})

test('Масштаб объектов: общий центр, нижняя опора, относительное положение героя и атомарный отказ',()=>{
 const {scaleEditorObjects}=load('sceneEditorCommands'),{createScene,emptyScenes,sceneObject}=load('scenes')
 const state=createScene(emptyScenes(),'scale','Масштаб','top'),scene=state.scenes[0]
 scene.objects=[{...sceneObject('platform','left',{x:6,y:6,z:1}),width:2,depth:2,height:1},{...sceneObject('crate','right',{x:10,y:6,z:2}),width:2,depth:2,height:2}]
 scene.tokens=[{actorId:'hero',x:6.5,y:6.25,z:2,diameter:.5,support:{kind:'object',objectId:'left'}}]
 const items=scene.objects.map(o=>({kind:'object',id:o.id})),before=structuredClone(state)
 assert.equal(scaleEditorObjects(state,items,{x:1,y:1,z:1}),state)
 const next=scaleEditorObjects(state,items,{x:2,y:.5,z:2}).scenes[0]
 assert.deepEqual(next.objects.map(o=>({x:o.x,y:o.y,z:o.z,width:o.width,depth:o.depth,height:o.height})),[{x:4,y:6,z:1,width:4,depth:1,height:2},{x:12,y:6,z:3,width:4,depth:1,height:4}])
 assert.deepEqual(next.tokens[0],{...scene.tokens[0],x:5,y:6.125,z:3});assert.equal(next.tokens[0].diameter,.5)
 for(const factor of [{x:0,y:1,z:1},{x:NaN,y:1,z:1},{x:20,y:1,z:1},{x:.01,y:1,z:1},{x:1,y:1,z:100}])assert.throws(()=>scaleEditorObjects(state,items,factor))
 assert.throws(()=>scaleEditorObjects(state,[...items,{kind:'token',id:'hero'}],{x:2,y:2,z:2}),/без героев/)
 assert.throws(()=>scaleEditorObjects(state,[{kind:'object',id:'gone'}],{x:2,y:2,z:2}),/выбери/)
 assert.deepEqual(state,before)
})
const editValue=async(input,value)=>flush(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
test('Масштаб в UI: пропорции, одна запись и отмена, отдельные оси и сохранение ввода при отказе',async()=>{
 const world=await fixture(),{createScene,emptyScenes,sceneObject}=load('scenes'),state=createScene(emptyScenes(),'scale-ui','Размер','top'),scene=state.scenes[0]
 scene.objects=[{...sceneObject('platform','platform',{x:6,y:6,z:0}),width:2,depth:2,height:1}]
 scene.tokens=[{actorId:world.characters[0].id,x:6.5,y:6.25,z:1,diameter:.5,support:{kind:'object',objectId:'platform'}}]
 await flush(()=>setExternal(state));await flush(()=>viewport.onSelect({kind:'object',id:'platform'}))
 const form=document.querySelector('form[aria-label="Масштаб объектов"]'),input=axis=>form.querySelector('[aria-label="Масштаб '+axis+', %"]')
 await editValue(input('X'),'200');assert.equal(input('Y').value,'200');assert.equal(input('Z').value,'200')
 await flush(()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(writes,1);assert.equal(active().objects[0].width,4);assert.equal(active().objects[0].height,2);assert.equal(active().tokens[0].x,7);assert.equal(active().tokens[0].z,2);assert.equal(active().tokens[0].diameter,.5);assert.equal(input('X').value,'100')
 await key('z',{ctrlKey:true});assert.deepEqual(active(),scene)
 await flush(()=>form.querySelector('input[type=checkbox]').click());await editValue(input('X'),'150');await editValue(input('Y'),'50');await editValue(input('Z'),'200')
 await flush(()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(writes,3);assert.equal(active().objects[0].width,3);assert.equal(active().objects[0].depth,1);assert.equal(active().objects[0].height,2)
 const before=structuredClone(active());await editValue(input('X'),'100000')
 await flush(()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(writes,3);assert.deepEqual(active(),before);assert.equal(input('X').value,'100000');assert(document.body.textContent.includes('помещаться в сцену'))
})
test('Перенос предмета в UI: поверхность перепроверяется, параметры и герой сохраняются, одна отмена',async()=>{
 const world=await fixture(),{createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),state=createScene(emptyScenes(),'move-surface-ui','Перенос','top'),scene=state.scenes[0]
 const chest={...createTabletopObject('chest','chest',{x:3,y:3,z:0},90),width:.6,depth:.4,height:.3,name:'Особый сундук',canSupport:true},table=createTabletopObject('table','table',{x:10,y:10,z:0})
 scene.objects=[chest,table];scene.tokens=[{actorId:world.characters[0].id,x:3.1,y:3,z:.3,diameter:.2,support:{kind:'object',objectId:chest.id}}]
 await flush(()=>setExternal(state));await flush(()=>viewport.onSelect({kind:'object',id:chest.id}));assert.equal(viewport.moveSurfaces.length,2)
 await flush(()=>viewport.onMove({kind:'object',id:chest.id},{x:10,y:10,z:.98},{surfaceId:table.id}))
 assert.equal(writes,1);assert.deepEqual(active().objects[0],{...chest,x:10,y:10,z:.98});assert.equal(active().tokens[0].x,10.1);assert.equal(active().tokens[0].z,1.28)
 await key('z',{ctrlKey:true});assert.deepEqual(active(),scene)
 await flush(()=>viewport.onMove({kind:'object',id:chest.id},{x:10,y:10,z:.98},{surfaceId:'gone'}));assert.equal(writes,2);assert.deepEqual(active(),scene)
 await flush(()=>button('Объекты').click());await flush(()=>document.querySelector('[aria-label="Скрыть в редакторе: '+table.name+'"]').click())
 assert.equal(viewport.moveSurfaces.length,1);await flush(()=>viewport.onMove({kind:'object',id:chest.id},{x:10,y:10,z:.98},{surfaceId:table.id}));assert.equal(writes,2)
 await flush(()=>document.querySelector('[aria-label="Размещение на поверхностях"]').click());assert.equal(viewport.moveSurfaces,undefined)
 await flush(()=>viewport.onMove({kind:'object',id:chest.id},{x:10,y:10,z:0}));assert.equal(active().objects[0].z,0)
})
test('Рабочее место в UI: восстановление после открытия, разделение проектов и отсутствие слоёв в игре',async()=>{
 const a='test:workspace:a',b='test:workspace:b';window.localStorage.clear();await fixture({libraryScope:a})
 const object=active().objects.find(o=>o.kind==='crate'),before=structuredClone(current)
 const step=document.querySelector('[aria-label="Шаг привязки к сетке"]'),filter=document.querySelector('[aria-label="Выбор на сцене"]')
 await flush(()=>[...document.querySelectorAll('label')].find(l=>l.textContent.trim()==='Сетка').querySelector('input').click())
 await flush(()=>{step.value='0.5';step.dispatchEvent(new dom.window.Event('change',{bubbles:true}));filter.value='props';filter.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 await flush(()=>document.querySelector('[aria-label="Размещение на поверхностях"]').click());await key('x');await flush(()=>button('Объекты').click())
 await flush(()=>document.querySelector('[aria-label="Защитить от правок: '+object.name+'"]').click());await flush(()=>document.querySelector('[aria-label="Скрыть в редакторе: '+object.name+'"]').click());await key('b')
 assert.equal(writes,0);assert.deepEqual(current,before);assert(viewport.editorHidden.includes(object.id));assert(viewport.gizmo)
 await fixture({libraryScope:a});assert.equal(document.querySelector('[aria-label="Шаг привязки к сетке"]').value,'0.5');assert.equal(viewport.selectionFilter,'props');assert.equal(viewport.moveSurfaces,undefined);assert(viewport.editorProtected.includes(object.id));assert(viewport.editorHidden.includes(object.id));assert.equal(document.querySelector('.gb-workspace-library'),null)
 await flush(()=>setScope(b));assert.deepEqual(viewport.editorHidden,[]);assert.deepEqual(viewport.editorProtected,[]);assert.equal(viewport.selectionFilter,'all');assert.equal(viewport.gizmo,false);assert(document.querySelector('.gb-workspace-library'))
 await flush(()=>viewport.onSelect({kind:'object',id:object.id}));await key('ArrowRight');assert(!button('↶ Отменить').disabled)
 await flush(()=>setScope(a));assert.equal(viewport.selection,null);assert(button('↶ Отменить').disabled);assert(viewport.editorHidden.includes(object.id))
 await fixture({libraryScope:a,mode:'play'});assert.deepEqual(viewport.editorHidden,[]);assert.deepEqual(viewport.editorProtected,[]);assert.equal(viewport.gizmo,false);assert.equal(viewport.moveSurfaces,undefined)
})
test('Базовые объекты в UI: миниатюры реальных моделей, контейнер без asset и явное состояние крышки',async()=>{
 await fixture();const library=document.querySelector('[aria-label="Ассеты окружения"]'),cards=[...library.querySelectorAll('button')]
 assert.equal(cards.length,8);assert(cards.every(b=>b.querySelector('img')?.getAttribute('src').startsWith('/basic-thumbnails/')))
 await flush(()=>cards.find(b=>b.textContent==='Контейнер').click());await flush(()=>viewport.onPoint({x:5,y:5,z:0}))
 const object=active().objects.at(-1);assert.equal(object.kind,'crate');assert.equal(object.asset,undefined)
 const input=document.querySelector('input[name=open]');assert(input);assert(document.body.textContent.includes('Контейнер открыт'))
 await flush(()=>input.click());const form=input.closest('form');await flush(()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(active().objects.at(-1).open,true);await key('z',{ctrlKey:true});assert.equal(active().objects.at(-1).open,false)
 await flush(()=>button('Открыть').click());assert.equal(active().objects.at(-1).open,true);await flush(()=>button('Закрыть').click());assert.equal(active().objects.at(-1).open,false)
 const lamp=active().objects.find(o=>o.kind==='lamp');await flush(()=>viewport.onSelect({kind:'object',id:lamp.id}));await flush(()=>button('Погасить').click());assert.equal(active().objects.find(o=>o.id===lamp.id).active,false)
})

test('Импорт: смена прав во время чтения отменяет запись',async()=>{
 const options={disabled:false};await fixture(options)
 const imported=structuredClone(current);imported.scenes[0].objects[0].name+=' IMPORTED'
 let resolveFile;const text=new Promise(resolve=>{resolveFile=resolve})
 const input=document.querySelector('input[type=file]')
 Object.defineProperty(input,'files',{value:[{size:100,text:()=>text}],configurable:true})
 window.confirm=()=>true
 await flush(()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})))
 options.disabled=true;await flush(()=>setExternal({...current}))
 assert(document.querySelector('[aria-label="Импорт сцены"]').disabled,'Read-only UI is active')
 await flush(()=>resolveFile(JSON.stringify(imported)))
 assert.equal(writes,0)
})
test('Импорт: отложенное чтение не переносит данные в другой проект',async()=>{
 await fixture({libraryScope:'import-project-a'})
 const imported=structuredClone(current);imported.scenes[0].objects[0].name+=' IMPORTED'
 let resolveFile;const pending=new Promise(resolve=>{resolveFile=resolve}),input=document.querySelector('input[type=file]')
 Object.defineProperty(input,'files',{value:[{size:100,text:()=>pending}],configurable:true});window.confirm=()=>true
 await flush(()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})))
 await flush(()=>setScope('import-project-b'));await flush(()=>resolveFile(JSON.stringify(imported)))
 assert.equal(writes,0);assert(!active().objects[0].name.includes('IMPORTED'))
})
test('Границы: копия учитывает весь габарит, перенос и поворот отказывают атомарно',()=>{
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),{duplicateEditorGroup,duplicateEditorObject,translateEditorGroup,rotateEditorGroup}=load('sceneEditorCommands'),{rotateTabletopObject}=load('tabletopCommands')
 const state=createScene(emptyScenes(),'edge-objects','Границы','top'),scene=state.scenes[0],table=createTabletopObject('table','table',{x:scene.width-.9,y:8,z:0});scene.objects=[table]
 const before=structuredClone(state),items=[{kind:'object',id:table.id}]
 for(const result of [duplicateEditorGroup(state,items,()=> 'copy',.5).state,duplicateEditorObject(state,table.id,'copy',.5)]){
  const copy=result.scenes[0].objects.at(-1);assert(copy.x+copy.width/2<=scene.width+1e-6);assert(copy.x<table.x)
 }
 assert.throws(()=>translateEditorGroup(state,items,{x:.5,y:0,z:0}),/границы/);assert.deepEqual(state,before)
 const narrow=createTabletopObject('table','narrow',{x:.5,y:8,z:0},90);scene.objects=[narrow];const original=structuredClone(state)
 assert.throws(()=>rotateTabletopObject(state,narrow.id),/границы/);assert.throws(()=>rotateEditorGroup(state,[{kind:'object',id:narrow.id}]),/границы/);assert.deepEqual(state,original)
})
test('Базовое размещение у края удерживает полный габарит; свойства не выпускают предмет за границу',async()=>{
 await fixture();const library=document.querySelector('[aria-label="Ассеты окружения"]')
 await flush(()=>[...library.querySelectorAll('button')].find(b=>b.textContent==='Контейнер').click());await flush(()=>viewport.onPoint({x:0,y:0,z:0}))
 const object=active().objects.at(-1);assert.equal(object.x,object.width/2);assert.equal(object.y,object.depth/2)
 const prior=writes,before=structuredClone(object),input=document.querySelector('input[name=x]'),form=input.closest('form')
 await flush(()=>{input.value=String(active().width-.1);form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))})
 assert.equal(writes,prior);assert.deepEqual(active().objects.find(o=>o.id===object.id),before);assert(document.body.textContent.includes('целиком'))
})
test('Импорт уважает новую защиту во время чтения и защищённые объекты в другой сцене',async()=>{
 await fixture({libraryScope:'import-live-layer-guard'});const object=active().objects.find(o=>o.kind==='crate'),sceneId=active().id
 const candidate=structuredClone(current);candidate.scenes.find(s=>s.id===sceneId).objects.find(o=>o.id===object.id).name+=' IMPORTED'
 const input=document.querySelector('input[type=file]');let resolveFile
 const begin=async()=>flush(()=>{Object.defineProperty(input,'files',{value:[{size:100,text:()=>new Promise(resolve=>{resolveFile=resolve})}],configurable:true});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 window.confirm=()=>true;await begin()
 await flush(()=>button('Объекты').click());await flush(()=>document.querySelector('[aria-label="Защитить от правок: '+object.name+'"]').click())
 await flush(()=>resolveFile(JSON.stringify(candidate)));assert.equal(writes,0);assert.equal(active().objects.find(o=>o.id===object.id).name,object.name)
 const select=document.querySelector('[aria-label="Открытая сцена"]');await flush(()=>{select.value=current.scenes.find(s=>s.id!==sceneId).id;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 const prior=writes;await begin();await flush(()=>resolveFile(JSON.stringify(candidate)))
 assert.equal(writes,prior);assert.equal(current.scenes.find(s=>s.id===sceneId).objects.find(o=>o.id===object.id).name,object.name)
})
test('Содержимое: стол и посуда выделяются и перемещаются одной командой, undo и защита сохраняются',async()=>{
 await fixture({libraryScope:'v019-surface-contents'});const {createTabletopObject}=load('tabletopCatalog')
 const table=createTabletopObject('table','content-table',{x:5,y:5,z:0}),cup=createTabletopObject('mug','content-cup',{x:5.3,y:5.1,z:.98}),floating={...cup,id:'floating-cup',z:1.1}
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,objects:[table,cup,floating],tokens:[]}:s)}))
 await flush(()=>viewport.onSelect({kind:'object',id:table.id}));await flush(()=>button('Выделить с содержимым').click())
 assert.deepEqual(new Set(viewport.selections.map(s=>s.id)),new Set([table.id,cup.id]));assert.equal(viewport.selection.id,table.id);assert.equal(writes,0)
 await flush(()=>viewport.onMove({kind:'object',id:table.id},{x:8,y:7,z:0}))
 assert.equal(writes,1);assert.equal(active().objects.find(o=>o.id===cup.id).x,8.3);assert.equal(active().objects.find(o=>o.id===cup.id).z,.98);assert.equal(active().objects.find(o=>o.id===floating.id).x,floating.x)
 await key('z',{ctrlKey:true});assert.deepEqual(active().objects,[table,cup,floating])
 await flush(()=>button('Объекты').click());await flush(()=>document.querySelector('[aria-label="Защитить от правок: '+cup.name+'"]').click())
 await key('Escape');await flush(()=>viewport.onSelect({kind:'object',id:table.id}));const before=writes
 await key('g',{shiftKey:true});assert.equal(viewport.selections.length,1);assert.equal(writes,before);assert(document.body.textContent.includes('скрытые или защищённые'))
})
test('Точное размещение: подтверждение не округляет повторно уже показанную координату',async()=>{
 await fixture({libraryScope:'v019-precision-commit'});const {createTabletopObject}=load('tabletopCatalog'),table=createTabletopObject('table','precision-table',{x:8,y:8,z:0}),cup=createTabletopObject('mug','precision-cup',{x:5,y:5,z:0})
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,objects:[table,cup],tokens:[]}:s)}))
 const grid=[...document.querySelectorAll('label')].find(l=>l.textContent.trim()==='Сетка').querySelector('input');if(!grid.checked)await flush(()=>grid.click())
 await flush(()=>viewport.onSelect({kind:'object',id:cup.id}));await flush(()=>viewport.onMove({kind:'object',id:cup.id},{x:8.123,y:8.075,z:.98},{surfaceId:table.id}))
 const placed=active().objects.find(o=>o.id===cup.id);assert.equal(placed.x,8.123);assert.equal(placed.y,8.075);assert.equal(placed.z,.98)
})
test('Поворот содержимого: центр задаёт полный габарит стола, посуда сохраняет расположение и четыре поворота обратимы',()=>{
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),{rotateEditorGroup}=load('sceneEditorCommands'),{surfaceContents}=load('sceneEditorContents'),state=createScene(emptyScenes(),'contents-pivot','Центр','top'),scene=state.scenes[0]
 const table=createTabletopObject('table','table',{x:8,y:8,z:0}),cup=createTabletopObject('mug','cup',{x:8.3,y:8.1,z:.98});scene.objects=[table,cup]
 const items=surfaceContents(scene,[{kind:'object',id:table.id}]),before=structuredClone(state),turned=rotateEditorGroup(state,items),objects=turned.scenes[0].objects
 assert.equal(objects[0].x,table.x);assert.equal(objects[0].y,table.y);assert.equal(objects[1].x,7.9);assert.equal(objects[1].y,8.3)
 let restored=turned;for(let i=0;i<3;i++)restored=rotateEditorGroup(restored,items)
 assert.deepEqual(restored,state);assert.deepEqual(state,before)
})

test('Старая библиотека: реальные 3D-миниатюры, геометрический призрак, поворот и точный штамп с undo',async()=>{
 await fixture();const count=active().objects.length,old=active().objects.find(o=>o.kind==='crate')
 await flush(()=>viewport.onSelect({kind:'object',id:old.id}))
 assert.equal(Object.keys(environmentPicker.thumbnails).length,220)
 assert(environmentPicker.thumbnails['expanded-object-woodpile'].endsWith('/legacy-thumbnails/woodpile.png'))
 await flush(()=>environmentPicker.onChange('expanded-object-woodpile'))
 assert.equal(viewport.selection,null);assert.equal(viewport.placement.object.artwork,'expanded-object-woodpile')
 const preview=structuredClone(viewport.placement.object);await key('r')
 assert.equal(viewport.placement.object.facing,90);assert.equal(viewport.placement.object.width,preview.depth);assert.equal(viewport.placement.object.depth,preview.width)
 await flush(()=>viewport.onPoint({x:13.125,y:14.875,z:0},{surfaceId:null}))
 const placed=active().objects.at(-1);assert.equal(placed.width,viewport.placement.object.width);assert.equal(placed.depth,viewport.placement.object.depth)
 assert.equal(placed.artwork,'expanded-object-woodpile');assert.equal(placed.facing,90);assert.equal(placed.x,13.125);assert.equal(placed.y,14.875)
 assert.equal(active().objects.length,count+1);await key('z',{ctrlKey:true});assert.equal(active().objects.length,count)
 await flush(()=>environmentPicker.onChange('expanded-object-grass-tuft'));await flush(()=>viewport.onPoint({x:30,y:20,z:0}))
 const grass=active().objects.at(-1);assert.equal(grass.artwork,'expanded-object-grass-tuft');assert(!grass.blocksMovement&&!grass.blocksSight&&!grass.canSupport)
 assert(grass.x+grass.width/2<=30&&grass.y+grass.depth/2<=20)
})

test('Старая мебель и печь: действия по модели, отдельный огонь, совместимый выбор и единая отмена',async()=>{
 await fixture();const {artworkMetadata}=load('visualMedia')
 assert.equal(environmentPicker.filterGroups.length,4);assert.equal(new Set(environmentPicker.filterGroups.flatMap(g=>g.keys)).size,220)
 await flush(()=>environmentPicker.onChange('expanded-object-cabinet'));await flush(()=>viewport.onPoint({x:13,y:14,z:0},{surfaceId:null}))
 const cabinet=active().objects.at(-1),before=structuredClone(cabinet);assert.equal(cabinet.kind,'platform')
 assert(selectedModelPicker.presets.every(key=>artworkMetadata[key]?.objectKind==='platform'))
 await flush(()=>button('Открыть').click());assert(active().objects.at(-1).open);assert(button('Запереть').disabled)
 await key('z',{ctrlKey:true});assert.deepEqual(active().objects.at(-1),before)
 await flush(()=>button('Запереть').click());assert(active().objects.at(-1).locked);assert(button('Открыть').disabled)
 await flush(()=>button('Отпереть').click());await flush(()=>button('Открыть').click());assert(active().objects.at(-1).open)
 await flush(()=>environmentPicker.onChange('expanded-object-kiln'));await flush(()=>viewport.onPoint({x:17,y:14,z:0},{surfaceId:null}))
 const oven=structuredClone(active().objects.at(-1));assert.equal(oven.kind,'platform');assert(button('Открыть')&&button('Погасить'));assert.equal(button('Запереть'),undefined)
 await flush(()=>button('Погасить').click());assert.equal(active().objects.at(-1).active,false);assert.equal(active().objects.at(-1).open,oven.open)
 await key('z',{ctrlKey:true});assert.deepEqual(active().objects.at(-1),oven)
 await flush(()=>button('Открыть').click());assert(active().objects.at(-1).open);await flush(()=>button('Погасить').click());assert(!active().objects.at(-1).active)
 assert.equal(active().objects.find(o=>o.id===cabinet.id).open,true)
})

test('Перекрывающиеся старые объекты: выбор из меню, клавиши меню не сдвигают сцену, Escape возвращает фокус',async()=>{
 await fixture();const a=active().objects[0],b=active().objects[1],canvas=document.querySelector('[data-canvas]');canvas.focus()
 await flush(()=>viewport.onContext({kind:'object',id:a.id},{x:4,y:5,z:0},{x:1000,y:700,targets:[{selection:{kind:'object',id:a.id},label:a.name},{selection:{kind:'object',id:b.id},label:b.name}]}))
 let menu=document.querySelector('[role=menu]');assert(menu);assert(menu.contains(document.activeElement));assert.equal(writes,0)
 const first=document.activeElement;await key('ArrowDown',{},first);assert(document.activeElement!==first,'Arrow moves menu focus');assert.equal(writes,0,'Arrow navigation does not nudge a model')
 await flush(()=>document.querySelector('[aria-label="Выбрать: '+b.name+'"]').click());assert.equal(viewport.selection.id,b.id);assert.equal(document.querySelector('[role=menu]'),null);assert.equal(writes,0)
 canvas.focus();await flush(()=>viewport.onContext({kind:'object',id:b.id},null,{x:4,y:4}));menu=document.querySelector('[role=menu]');await key('Escape',{},document.activeElement)
 assert.equal(document.querySelector('[role=menu]'),null);assert.equal(viewport.selection.id,b.id,'Closing the menu preserves selection');assert(document.activeElement===canvas,'Closing restores the original canvas focus')
 await flush(()=>viewport.onContext({kind:'object',id:a.id},null,{x:4,y:4}));assert(document.querySelector('[role=menu]'))
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,name:s.name+' изменена'}:s)}));assert.equal(document.querySelector('[role=menu]'),null,'External replacement dismisses stale actions')
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('tabindex','0');document.body.appendChild(svg);svg.focus()
 await flush(()=>viewport.onContext({kind:'object',id:a.id},null,{x:4,y:4}));await key('Escape',{},document.activeElement);assert(document.activeElement===svg,'Schematic SVG receives its focus back too');svg.remove()
})

test('Панели: клавиатура, перетаскивание, отмена, сброс и восстановление не записывают сцену',async()=>{
 const scope='v024-panels';await fixture({libraryScope:scope});const {readEditorWorkspace}=load('sceneEditorWorkspace'),divider=()=>document.querySelector('[aria-label="Ширина библиотеки"]')
 await key('ArrowRight',{},divider());assert.equal(divider().getAttribute('aria-valuenow'),'290');assert.equal(writes,0)
 const emit=async(type,x)=>flush(()=>{const e=new dom.window.MouseEvent(type,{clientX:x,button:0,bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:4});divider().dispatchEvent(e)})
 await emit('pointerdown',300);await emit('pointermove',325);assert.equal(readEditorWorkspace(scope).value.panels.libraryWidth,290,'Preview is not stored before release')
 await emit('pointerup',325);assert.equal(readEditorWorkspace(scope).value.panels.libraryWidth,315);assert.equal(writes,0)
 await emit('pointerdown',300);await emit('pointermove',320);await key('Escape',{},divider());assert.equal(readEditorWorkspace(scope).value.panels.libraryWidth,315)
 await key('i');assert(document.querySelector('.gb-workspace-inspector').hidden);await key('i');assert(!document.querySelector('.gb-workspace-inspector').hidden)
 await fixture({libraryScope:scope});assert.equal(divider().getAttribute('aria-valuenow'),'315');await flush(()=>divider().dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true})));assert.equal(divider().getAttribute('aria-valuenow'),'280');assert.equal(writes,0)
})

test('Памятка управления: доступ с клавиатуры, фокус, Escape без потери выделения и обычный ввод',async()=>{
 await fixture();const object=active().objects[0],canvas=document.querySelector('[data-canvas]');await flush(()=>viewport.onSelect({kind:'object',id:object.id}));canvas.focus()
 await key('?');let dialog=document.querySelector('[role=dialog]');assert(dialog);assert(dialog.contains(document.activeElement));assert.equal(writes,0)
 await key('ArrowRight',{},document.activeElement);assert.equal(writes,0,'Dialog keys do not move the scene')
 await key('Tab',{},document.activeElement);assert(dialog.contains(document.activeElement));await key('Escape',{},document.activeElement)
 assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(viewport.selection.id,object.id);assert(document.activeElement===canvas)
 await key('?',{},document.querySelector('input[name=name]'));assert.equal(document.querySelector('[role=dialog]'),null,'Text input does not invoke a shortcut')
 await key('F1');assert(document.querySelector('[role=dialog]'));await key('Escape',{},document.activeElement)
})

const outlinerRow=id=>Array.from(document.querySelectorAll('[data-outliner-key]')).find(r=>r.dataset.outlinerKey===id)
const outlinerRows=()=>Array.from(document.querySelectorAll('[data-outliner-key]'))
async function chooseRow(row,extra={}){await flush(()=>row.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,...extra})))}
async function selectValue(label,value){await flush(()=>{const input=document.querySelector('[aria-label="'+label+'"]');input.value=value;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
async function searchOutliner(value){await flush(()=>{const input=document.querySelector('[aria-label="Поиск по расстановке"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})}

test('Расстановка: список остаётся открытым; Shift выбирает диапазон, Ctrl переключает строку; Enter открывает свойства',async()=>{
 await fixture();await key('o');assert(document.querySelector('.gb-outliner'));const rows=outlinerRows().slice(0,4)
 await chooseRow(rows[0]);assert(document.querySelector('.gb-outliner'),'Choosing a row does not close the list');assert.equal(viewport.selections.length,1)
 await chooseRow(rows[3],{shiftKey:true});assert.equal(viewport.selections.length,4);assert.equal(viewport.selection.kind+':'+viewport.selection.id,rows[3].dataset.outlinerKey);assert(!document.querySelector('.gb-group-inspector'),'The list is not displaced by group transform forms')
 await chooseRow(rows[1],{ctrlKey:true});assert.equal(viewport.selections.length,3);assert(!viewport.selections.some(i=>i.kind+':'+i.id===rows[1].dataset.outlinerKey))
 await chooseRow(rows[1],{metaKey:true});assert.equal(viewport.selections.length,4);assert.equal(writes,0)
 await key('Enter',{},rows[1]);assert(!document.querySelector('.gb-outliner'));assert(document.querySelector('.gb-group-inspector'));assert.equal(viewport.selections.length,4)
})

test('Расстановка: стрелки и Home/End выбирают строки; диапазон по клавиатуре и действия слоя не сдвигают модели',async()=>{
 await fixture();await key('o');const before=JSON.stringify(current),rows=outlinerRows();await chooseRow(rows[0]);rows[0].focus()
 await key('ArrowDown',{},rows[0]);assert(document.activeElement===rows[1]);assert.equal(viewport.selection.kind+':'+viewport.selection.id,rows[1].dataset.outlinerKey);assert.equal(viewport.selections.length,1)
 await key('ArrowDown',{shiftKey:true},rows[1]);await key('ArrowDown',{shiftKey:true},rows[2]);assert.equal(viewport.selections.length,3)
 const old=JSON.stringify(viewport.selections);await key('End',{ctrlKey:true},rows[3]);assert.equal(JSON.stringify(viewport.selections),old);assert(document.activeElement===rows.at(-1))
 await key('Home',{},rows.at(-1));assert(document.activeElement===rows[0]);assert.equal(viewport.selections.length,1)
 const objectRow=rows.find(r=>r.dataset.outlinerKey.startsWith('object:'));await chooseRow(objectRow);objectRow.focus();await key('ArrowRight',{},objectRow);assert.equal(document.activeElement.getAttribute('aria-label'),'Скрыть в редакторе: '+active().objects[0].name)
 await key('ArrowRight',{},document.activeElement);assert.equal(document.activeElement.getAttribute('aria-label'),'Защитить от правок: '+active().objects[0].name)
 await key('ArrowLeft',{},document.activeElement);await key('ArrowLeft',{},document.activeElement);assert(document.activeElement===objectRow)
 await key(' ',{},objectRow);assert.equal(viewport.selections.length,0);assert.equal(writes,0);assert.equal(JSON.stringify(current),before)
})

test('Расстановка: поиск по нескольким словам и ё/е, фильтры и сортировка не меняют порядок сцены',async()=>{
 await fixture();const {createEnvironmentObject}=load('sceneEditorPlacement'),objects=[{...createEnvironmentObject('crate','expanded-object-jar','vessel-2',{x:5,y:5,z:0}),name:'Жёлтый сосуд 2'},{...createEnvironmentObject('crate','expanded-object-amphora','vessel-10',{x:8,y:5,z:0}),name:'Жёлтый сосуд 10'}]
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,objects}:s)}));const original=JSON.stringify(current);await key('o')
 await searchOutliner('желтый тара');assert.equal(outlinerRows().length,2)
 await selectValue('Порядок расстановки','name');assert(outlinerRows()[0].textContent.includes('2'));assert(outlinerRows()[1].textContent.includes('10'))
 await searchOutliner('амфора желтый');assert.equal(outlinerRows().length,1);assert.equal(outlinerRows()[0].dataset.outlinerKey,'object:vessel-10')
 await key('a',{ctrlKey:true},outlinerRows()[0]);assert.equal(viewport.selections.length,1);assert.equal(viewport.selection.id,'vessel-10')
 const input=document.querySelector('[aria-label="Поиск по расстановке"]');await key('a',{ctrlKey:true},input);assert.equal(viewport.selections.length,1,'Native input selection does not change editor selection')
 await key('Escape',{},input);assert.equal(input.value,'');assert.equal(outlinerRows().length,objects.length+active().tokens.length)
 await selectValue('Фильтр расстановки','selected');assert.equal(outlinerRows().length,1);await selectValue('Фильтр расстановки','tokens');assert.equal(outlinerRows().length,active().tokens.length)
 assert.equal(JSON.stringify(current),original);assert.equal(writes,0)
})

test('Расстановка: групповая видимость и защита локальны; запрет редактирования и восстановление сохранены',async()=>{
 const scope='v026-outliner-layers';await fixture({libraryScope:scope});await key('o');await selectValue('Фильтр расстановки','objects');let rows=outlinerRows().slice(0,2);await chooseRow(rows[0]);await chooseRow(rows[1],{shiftKey:true});const ids=viewport.selections.map(i=>i.id),before=JSON.stringify(current)
 await flush(()=>button('Защитить 2').click());assert(ids.every(id=>viewport.editorProtected.includes(id)));assert.equal(viewport.selections.length,2)
 await key('ArrowRight');assert.equal(writes,0,'Protected items remain protected through normal commands')
 await flush(()=>button('Снять защиту 2').click());assert(!ids.some(id=>viewport.editorProtected.includes(id)))
 await flush(()=>button('Скрыть 2').click());assert(ids.every(id=>viewport.editorHidden.includes(id)));assert.equal(viewport.selections.length,0);assert.equal(writes,0)
 await selectValue('Фильтр расстановки','hidden');assert.equal(outlinerRows().length,2);await flush(()=>button('Выделить найденные').click());assert.equal(viewport.selections.length,2)
 await flush(()=>button('Показать 2').click());assert(!ids.some(id=>viewport.editorHidden.includes(id)));assert.equal(outlinerRows().length,0)
 await selectValue('Фильтр расстановки','objects');rows=outlinerRows().slice(0,2);await chooseRow(rows[0]);await chooseRow(rows[1],{shiftKey:true});await flush(()=>button('Защитить 2').click())
 await fixture({libraryScope:scope});assert(ids.every(id=>viewport.editorProtected.includes(id)));assert.equal(JSON.stringify(current),before);assert.equal(writes,0)
 await fixture({disabled:true});await key('o');assert(document.querySelectorAll('.gb-outliner .gb-layer-toggle:disabled').length>0);assert(button('Показать всё').disabled&&button('Снять защиту').disabled)
 await fixture({mode:'play'});await key('o');assert(!document.querySelector('.gb-outliner .gb-layer-toggle'));assert.equal(document.querySelector('[aria-label="Фильтр расстановки"]').querySelector('option[value=hidden]'),null)
})

test('Расстановка: фокус камеры передаёт всю группу, не пишет сцену и поиск не перехватывает горячие клавиши ввода',async()=>{
 await fixture();await key('i');assert(document.querySelector('.gb-workspace-inspector').hidden);await key('o');assert(!document.querySelector('.gb-workspace-inspector').hidden)
 const rows=outlinerRows(),before=JSON.stringify(current);await chooseRow(rows[0]);await chooseRow(rows[1],{shiftKey:true});const count=viewport.focusRequest
 await flush(()=>button('На сцене F').click());assert.equal(viewport.focusRequest,count+1);assert.equal(viewport.selections.length,2);assert(document.querySelector('.gb-outliner'))
 await key('f',{},rows[1]);assert.equal(viewport.focusRequest,count+2);assert.equal(viewport.selections.length,2)
 await key('/',{},rows[1]);const input=document.querySelector('[aria-label="Поиск по расстановке"]');assert(document.activeElement===input)
 await key('Delete',{},input);assert.equal(JSON.stringify(current),before);assert.equal(writes,0)
 await searchOutliner('ничегоненайдено');assert(!outlinerRows().length);await flush(()=>button('Сбросить поиск и фильтр').click());assert(outlinerRows().length>0)
})


test('Расстановка: фильтр скрытых слоёв не оставляет пустой игровой список при смене режима',async()=>{
 const options={mode:'build'};await fixture(options);await key('o');await selectValue('Фильтр расстановки','hidden');assert.equal(outlinerRows().length,0)
 options.mode='play';await flush(()=>setExternal({...current}));assert.equal(document.querySelector('[aria-label="Фильтр расстановки"]').value,'all');assert.equal(outlinerRows().length,active().objects.length+active().tokens.length);assert(!document.querySelector('.gb-outliner .gb-layer-toggle'));assert.equal(writes,0)
 options.mode='build';await flush(()=>setExternal({...current}));assert.equal(document.querySelector('[aria-label="Фильтр расстановки"]').value,'hidden');assert.equal(outlinerRows().length,0,'The local build filter is retained')
})

const editorToolbarButton=label=>document.querySelector('[aria-label="'+label+'"]')
test('Буфер: Ctrl+C/V, поворот и высота дают одну вставку и отмену без копирования героя',async()=>{
 const world=await fixture({libraryScope:'v027-copy'}),{createTabletopObject}=load('tabletopCatalog'),table={...createTabletopObject('table','clipboard-table',{x:6,y:8,z:1}),open:true},lamp={...createTabletopObject('candle','clipboard-light',{x:6.3,y:8.1,z:1.98}),active:false},token={actorId:world.characters[0].id,x:6,y:8,z:1.98,diameter:.5,support:{kind:'object',objectId:table.id}}
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,objects:[table,lamp],tokens:[token]}:s)}));const original=structuredClone(current)
 await flush(()=>viewport.onSelectMany([{kind:'object',id:table.id},{kind:'object',id:lamp.id},{kind:'token',id:token.actorId}]));await key('c',{ctrlKey:true});assert.equal(writes,0);assert(document.body.textContent.includes('Персонажи остаются'))
 await key('v',{ctrlKey:true});assert.equal(viewport.placement.assembly.objects.length,2);assert(!viewport.selecting);assert(!viewport.onMove);assert.equal(viewport.selection,null);assert(document.querySelector('[aria-label="Вставка группы"]'))
 await key('r');assert.equal(viewport.placement.facing,90);await flush(()=>{const input=document.querySelector('[aria-label="Высота вставки над землёй, м"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'2.25');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});assert.equal(viewport.placement.elevation,2.25)
 const assembly=viewport.placement.assembly,expected=load('sceneAssemblies').assemblyLayout(assembly,{x:12.125,y:11.375,z:2.25},90);await flush(()=>viewport.onPoint({x:12.125,y:11.375,z:2.25},{surfaceId:null,resolved:true}));assert.equal(writes,1);assert.equal(active().objects.length,4);assert.deepEqual(active().tokens,[token]);assert(!viewport.placement);assert.equal(viewport.selections.length,2)
 active().objects.slice(2).forEach((o,i)=>{assert.notEqual(o.id,expected[i].id);assert.deepEqual({...o,id:expected[i].id},expected[i])});assert.deepEqual(active().objects.slice(0,2),[table,lamp])
 await key('z',{ctrlKey:true});assert.deepEqual(current,original)
})

test('Буфер: Escape и Ctrl+Z отменяют предпросмотр и возвращают выделение; ввод и клавиши не сдвигают оригинал',async()=>{
 await fixture();const object=active().objects.find(o=>o.kind==='crate');await flush(()=>viewport.onSelect({kind:'object',id:object.id}));const original=JSON.stringify(current)
 await key('o');const row=outlinerRow('object:'+object.id);await key('c',{ctrlKey:true},row);await key('v',{ctrlKey:true},row);assert(viewport.placement);assert(editorToolbarButton('Удалить выбранное').disabled);assert(editorToolbarButton('Дублировать').disabled)
 await key('ArrowRight');await key('Delete');await key('a',{ctrlKey:true});await key('d',{ctrlKey:true});assert.equal(writes,0);assert.equal(viewport.selection,null);assert.equal(JSON.stringify(current),original)
 await key('v',{ctrlKey:true},row);await key('Escape',{},row);assert(!viewport.placement);assert.equal(viewport.selection.id,object.id);assert.equal(writes,0)
 await key('v',{ctrlKey:true});await key('z',{ctrlKey:true});assert(!viewport.placement);assert.equal(viewport.selection.id,object.id);assert.equal(writes,0)
 await flush(()=>button('Свойства').click());const input=document.querySelector('input[name=name]');const event=await key('v',{ctrlKey:true},input);assert(!event.defaultPrevented);assert(!viewport.placement);assert.equal(writes,0)
})

test('Буфер: другая сцена получает новые ID и прежнюю высоту над землёй; другой проект не получает буфер',async()=>{
 await fixture({libraryScope:'v027-project-a'});const originalSceneId=active().id,object=active().objects.find(o=>o.kind==='crate');await flush(()=>viewport.onSelect({kind:'object',id:object.id}));await key('c',{ctrlKey:true});const snapshot=structuredClone(object),targetId=current.scenes.find(s=>s.id!==originalSceneId).id
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===originalSceneId?{...s,objects:s.objects.map(o=>o.id===object.id?{...o,name:'После копирования'}:o)}:s.id===targetId?{...s,groundZ:-1,minZ:-3,objects:[],tokens:[]}:s)}));await selectValue('Открытая сцена',targetId);const before=writes
 await key('v',{ctrlKey:true});assert(viewport.placement);const stale=viewport.onPoint;await flush(()=>viewport.onPoint({x:9,y:7,z:-1}));assert.equal(writes,before+1);assert.equal(active().objects.length,1);assert.equal(active().objects[0].name,snapshot.name);assert.equal(active().objects[0].z,-1+snapshot.z);assert.notEqual(active().objects[0].id,snapshot.id)
 await key('v',{ctrlKey:true});await flush(()=>setScope('v027-project-b'));assert(!viewport.placement);assert(editorToolbarButton('Вставить · Ctrl+V').disabled);const count=writes;await flush(()=>stale({x:10,y:9,z:0}));assert.equal(writes,count);await key('v',{ctrlKey:true});assert(!viewport.placement);assert(document.body.textContent.includes('Буфер редактора пуст'))
})

test('Вставка: отказ по высоте не создаёт частичных копий; права и режим останавливают жест',async()=>{
 const options={mode:'build'};await fixture(options);const object=active().objects.find(o=>o.kind==='crate');await flush(()=>viewport.onSelect({kind:'object',id:object.id}));await key('c',{ctrlKey:true});await key('v',{ctrlKey:true})
 const original=JSON.stringify(current);await flush(()=>{const input=document.querySelector('[aria-label="Высота вставки над землёй, м"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'1000');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});await flush(()=>viewport.onPoint({x:10,y:10,z:0}));assert.equal(writes,0);assert.equal(JSON.stringify(current),original);assert(viewport.placement)
 options.disabled=true;await flush(()=>setExternal({...current}));assert(!viewport.placement);assert(!document.querySelector('[aria-label="Вставка группы"]'));await key('v',{ctrlKey:true});assert.equal(writes,0)
 options.disabled=false;options.mode='play';await flush(()=>setExternal({...current}));assert(!editorToolbarButton('Вставить · Ctrl+V'));const native=await key('c',{ctrlKey:true});assert(!native.defaultPrevented);assert.equal(writes,0)
})

test('Размещение: показанная привязанная координата у края не округляется заново для старой модели и буфера',async()=>{
 await fixture();const grid=[...document.querySelectorAll('label')].find(l=>l.textContent.trim()==='Сетка').querySelector('input');if(!grid.checked)await flush(()=>grid.click());await selectValue('Шаг привязки к сетке','1')
 await flush(()=>environmentPicker.onChange('expanded-object-jar'));const preview=viewport.placement.object,at={x:active().width-preview.width/2,y:active().depth-preview.depth/2,z:0}
 await flush(()=>viewport.onPoint(at,{surfaceId:null,resolved:true}));assert.equal(active().objects.at(-1).x,at.x);assert.equal(active().objects.at(-1).y,at.y)
 await key('c',{ctrlKey:true});await key('v',{ctrlKey:true});const {assemblyAnchor}=load('sceneAssemblies'),point=assemblyAnchor(active(),viewport.placement.assembly,{x:29.99,y:19.99,z:0},0,0,1);const before=writes
 await flush(()=>viewport.onPoint(point,{surfaceId:null,resolved:true}));assert.equal(writes,before+1);assert.equal(active().objects.at(-1).x,at.x);assert.equal(active().objects.at(-1).y,at.y)
})

test('Буфер: отсутствие открытой сцены не запускает вставку и сохраняет копию для повторного выбора сцены',async()=>{
 await fixture();const id=active().id,object=active().objects.find(o=>o.kind==='crate');await flush(()=>viewport.onSelect({kind:'object',id:object.id}));await key('c',{ctrlKey:true});await flush(()=>setExternal({...current,activeSceneId:null}));const root=document.querySelector('[aria-label="Конструктор сцен мастера"]')
 await key('v',{ctrlKey:true},root);assert(!document.querySelector('[aria-label="Вставка группы"]'));assert(document.body.textContent.includes('Выбери сцену для вставки'));assert.equal(writes,0)
 await selectValue('Открытая сцена',id);await key('v',{ctrlKey:true});assert(viewport.placement);await key('Escape');assert(!viewport.placement)
})

test('Русская раскладка: копирование, вставка, поворот, undo и список работают по клавишам; поля сохраняют обычный ввод',async()=>{
 await fixture();const object=active().objects.find(o=>o.kind==='crate'),before=structuredClone(current);await flush(()=>viewport.onSelect({kind:'object',id:object.id}))
 await key('с',{code:'KeyC',ctrlKey:true});await key('м',{code:'KeyV',ctrlKey:true});assert(viewport.placement);await key('к',{code:'KeyR'});assert.equal(viewport.placement.facing,90);await key('Escape');assert.equal(viewport.selection.id,object.id);assert.equal(writes,0)
 await key('ArrowRight');assert.equal(writes,1);await key('я',{code:'KeyZ',ctrlKey:true});assert.deepEqual(current,before)
 await key('щ',{code:'KeyO'});assert(document.querySelector('.gb-outliner'));const row=outlinerRow('object:'+object.id),old=viewport.focusRequest;await key('а',{code:'KeyF'},row);assert.equal(viewport.focusRequest,old+1)
 await key('Enter',{},row);const input=document.querySelector('input[name=name]'),event=await key('м',{code:'KeyV',ctrlKey:true},input);assert(!event.defaultPrevented);assert(!viewport.placement)
})

test('Точная расстановка: активный ориентир сохраняется при выравнивании по краям и центру обеих осей',()=>{
 const {arrangeEditorObjects}=load('sceneEditorCommands'),{state,scene,items}=arrangementFixture(),before=structuredClone(state),reference=scene.objects[1]
 for(const axis of ['x','y'])for(const mode of ['min','center','max']){
  const next=arrangeEditorObjects(state,items,axis,mode,reference.id).scenes[0],dimension=axis==='x'?'width':'depth'
  assert.deepEqual(next.objects[1],reference);assert.deepEqual(next.tokens,scene.tokens)
  const edge=o=>mode==='min'?o[axis]-o[dimension]/2:mode==='max'?o[axis]+o[dimension]/2:o[axis]
  for(const o of next.objects)assert.equal(edge(o),edge(reference))
  assert(next.objects.every((o,i)=>o[axis==='x'?'y':'x']===scene.objects[i][axis==='x'?'y':'x']&&o.z===scene.objects[i].z))
 }
 assert.deepEqual(state,before)
})
test('Точный промежуток: разные размеры, ориентир внутри ряда, сортировка и герой на перемещаемой опоре',()=>{
 const {spaceEditorObjects}=load('sceneEditorCommands'),{state,scene,items}=arrangementFixture(),before=structuredClone(state)
 const next=spaceEditorObjects(state,items.slice().reverse(),'x',.375,'precise-1').scenes[0]
 assert.equal(next.objects[1].x,8);assert.equal(next.objects[0].x,6.125);assert.equal(next.objects[2].x,9.625)
 assert.deepEqual(next.tokens,scene.tokens)
 for(let i=1;i<next.objects.length;i++)assert.equal(next.objects[i].x-next.objects[i].width/2-next.objects[i-1].x-next.objects[i-1].width/2,.375)
 const touching=spaceEditorObjects(state,items,'x',0).scenes[0]
 assert.equal(touching.objects[0].x,scene.objects[0].x)
 assert.equal(touching.tokens[0].x,scene.tokens[0].x+touching.objects[1].x-scene.objects[1].x)
 assert.equal(touching.tokens[0].y,scene.tokens[0].y);assert.deepEqual(touching.tokens[0].support,scene.tokens[0].support)
 const y=spaceEditorObjects(state,items,'y',.5,'precise-1').scenes[0]
 assert.deepEqual(y.objects.map(o=>o.y),[4,6,8]);assert(y.objects.every((o,i)=>o.x===scene.objects[i].x))
 assert.deepEqual(state,before)
})
test('Точная расстановка: отказы атомарны, выход за края запрещён, повтор готового ряда не создаёт состояние',()=>{
 const {spaceEditorObjects,arrangeEditorObjects}=load('sceneEditorCommands'),{state,items}=arrangementFixture(),before=structuredClone(state)
 for(const gap of [NaN,Infinity,-.1])assert.throws(()=>spaceEditorObjects(state,items,'x',gap),/Промежуток/)
 assert.throws(()=>spaceEditorObjects(state,items,'x',100),/границы/)
 assert.throws(()=>spaceEditorObjects(state,items,'x',8,'precise-1'),/границы/)
 assert.throws(()=>spaceEditorObjects(state,items,'x',.5,'missing'),/Опорный/)
 assert.throws(()=>spaceEditorObjects(state,[...items,{kind:'token',id:'rider'}],'x',.5),/без героев/)
 assert.throws(()=>spaceEditorObjects(state,[items[0],{kind:'object',id:'missing'}],'x',.5),/без героев/)
 const edge=structuredClone(state);edge.scenes[0].objects[0].x=.5
 assert.throws(()=>arrangeEditorObjects(edge,items,'x','center','precise-0'),/границы/)
 const spaced=spaceEditorObjects(state,items,'x',.25,'precise-1')
 assert.equal(spaceEditorObjects(spaced,items,'x',.25,'precise-1'),spaced)
 const aligned=arrangeEditorObjects(state,items,'x','center','precise-1')
 assert.equal(arrangeEditorObjects(aligned,items,'x','center','precise-1'),aligned)
 assert.deepEqual(state,before)
})
test('Точная расстановка в UI: выбор ориентира, заданный зазор, одна запись и undo, повтор без истории',async()=>{
 await fixture();const {state,items}=arrangementFixture();state.scenes[0].tokens=[]
 await flush(()=>setExternal(state));await flush(()=>viewport.onSelectMany([items[0],items[2],items[1]]))
 assert(document.querySelector('[aria-label="Точная расстановка"]'))
 await selectValue('Ориентир расстановки','active');assert(document.body.textContent.includes('Остаётся на месте: Ориентир'))
 await editValue(document.querySelector('[aria-label="Промежуток, м"]'),'.375')
 const form=document.querySelector('[aria-label="Промежуток между объектами"]'),before=structuredClone(current)
 await flush(()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(writes,1);assert.deepEqual(active().objects.map(o=>o.x),[6.125,8,9.625]);assert.equal(document.querySelector('[aria-label="Промежуток, м"]').value,'.375')
 await flush(()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(writes,1)
 await key('z',{ctrlKey:true});assert.deepEqual(current,before)
 await flush(()=>button('К началу').click());assert.equal(writes,3);assert.deepEqual(active().objects.map(o=>o.x-o.width/2),[7,7,7])
 await key('z',{ctrlKey:true});assert.deepEqual(current,before)
})
test('Точная расстановка в UI: ошибка сохраняет ввод; read-only, защита и режим игры блокируют команды',async()=>{
 await fixture();const {state,items}=arrangementFixture();state.scenes[0].tokens=[]
 await flush(()=>setExternal(state));await flush(()=>viewport.onSelectMany(items));const before=structuredClone(current)
 await editValue(document.querySelector('[aria-label="Промежуток, м"]'),'100')
 await flush(()=>document.querySelector('[aria-label="Промежуток между объектами"]').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(writes,0);assert.deepEqual(current,before);assert.equal(document.querySelector('[aria-label="Промежуток, м"]').value,'100');assert(document.body.textContent.includes('границы сцены'))
 await fixture({disabled:true});await flush(()=>viewport.onSelectMany(active().objects.slice(0,3).map(o=>({kind:'object',id:o.id}))))
 assert(document.querySelector('[aria-label="Точная расстановка"] button').matches(':disabled'));assert.equal(writes,0)
 await fixture();const pair=active().objects.slice(0,2);await flush(()=>viewport.onSelectMany(pair.map(o=>({kind:'object',id:o.id}))))
 await key('o');await flush(()=>button('Защитить 2').click());await flush(()=>button('Свойства').click())
 assert(document.querySelector('[aria-label="Точная расстановка"] button').matches(':disabled'));assert.equal(writes,0)
 await fixture({mode:'play'});await flush(()=>viewport.onSelectMany?.(active().objects.slice(0,2).map(o=>({kind:'object',id:o.id}))))
 assert.equal(document.querySelector('[aria-label="Точная расстановка"]'),null)
})

function lowerFixture(){
 const {createScene,emptyScenes,sceneObject}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),state=createScene(emptyScenes(),'lower','Опускание','top'),scene=state.scenes[0]
 const table=createTabletopObject('table','floating-table',{x:8,y:8,z:2}),barrel=createTabletopObject('barrel','barrel-on-table',{x:8,y:8,z:table.z+table.height}),candle={...createTabletopObject('candle','candle-on-barrel',{x:8,y:8,z:barrel.z+barrel.height}),width:.18,depth:.18}
 const platform={...sceneObject('platform','lower-platform',{x:8,y:8,z:0}),name:'Нижняя платформа',width:6,depth:6,height:.5,canSupport:true}
 scene.objects=[platform,table,barrel,candle];scene.tokens=[{actorId:'rider',x:8.05,y:8,z:barrel.z+barrel.height,diameter:.3,support:{kind:'object',objectId:barrel.id}}]
 return {state,scene,table,barrel,candle,platform,items:[{kind:'object',id:table.id}]}
}
test('Опускание: выбирается ближайшая полная опора снизу, X/Y и свойства сохраняются',()=>{
 const {lowerEditorObjects}=load('sceneEditorLower'),f=lowerFixture(),before=structuredClone(f.state)
 const source={...f.candle,id:'floating-lamp',x:8.1,z:6};f.scene.objects.push(source)
 const sourceBefore=structuredClone(source),result=lowerEditorObjects(f.state,[{kind:'object',id:source.id}]),next=result.state.scenes[0].objects.at(-1)
 assert.equal(next.z,f.barrel.z+f.barrel.height);assert.equal(result.surfaceName,f.barrel.name)
 assert.deepEqual({...next,z:sourceBefore.z},sourceBefore);assert.equal(f.state.scenes[0].objects.at(-1),source)
 assert.deepEqual(f.state.scenes[0].objects.slice(0,4),before.scenes[0].objects)
})
test('Опускание: стол, вложенная бочка, свеча и герой опускаются вместе и каждый ровно один раз',()=>{
 const {lowerEditorObjects}=load('sceneEditorLower'),f=lowerFixture(),before=structuredClone(f.state),result=lowerEditorObjects(f.state,[...f.items,{kind:'object',id:f.barrel.id}]),scene=result.state.scenes[0]
 assert.equal(result.objectCount,3);assert.equal(result.distance,1.5);assert.equal(result.surfaceName,f.platform.name)
 assert.deepEqual(scene.objects[0],f.platform)
 for(let i=1;i<scene.objects.length;i++)assert.equal(scene.objects[i].z,f.scene.objects[i].z-1.5)
 assert.equal(scene.tokens[0].z,f.scene.tokens[0].z-1.5);assert.equal(scene.tokens[0].x,f.scene.tokens[0].x);assert.deepEqual(scene.tokens[0].support,f.scene.tokens[0].support)
 const ground=lowerEditorObjects(f.state,f.items,{groundOnly:true}).state.scenes[0]
 assert.equal(ground.objects[1].z,0);assert.equal(ground.objects[2].z,f.table.height);assert.equal(ground.objects[3].z,f.table.height+f.barrel.height)
 assert.deepEqual(f.state,before)
})
test('Опускание: группа сохраняет форму и останавливается при первом полном контакте',()=>{
 const {lowerEditorObjects}=load('sceneEditorLower'),{sceneObject}=load('scenes'),f=lowerFixture()
 const a={...sceneObject('crate','a',{x:3,y:5,z:5}),width:.5,depth:.5,height:.5},b={...a,id:'b',x:10,z:3},support={...f.platform,x:10,y:5,width:2,depth:2,height:2},overhead={...support,id:'overhead',z:6,height:1}
 f.scene.objects=[a,b,support,overhead];f.scene.tokens=[]
 const next=lowerEditorObjects(f.state,[{kind:'object',id:a.id},{kind:'object',id:b.id}]).state.scenes[0]
 assert.deepEqual(next.objects.slice(0,2).map(o=>o.z),[4,2]);assert.equal(next.objects[0].z-next.objects[1].z,2);assert.deepEqual(next.objects.slice(2),f.scene.objects.slice(2))
})
test('Опускание: скрытые, неполные и открытые поверхности не используются; команда не поднимает предмет',()=>{
 const {lowerEditorObjects}=load('sceneEditorLower'),{createTabletopObject}=load('tabletopCatalog'),f=lowerFixture();f.scene.tokens=[]
 const lamp={...f.candle,id:'falling',z:6};f.scene.objects.push(lamp)
 assert.equal(lowerEditorObjects(f.state,[{kind:'object',id:lamp.id}],{hidden:[f.barrel.id]}).state.scenes[0].objects.at(-1).z,f.table.z+f.table.height)
 const round=createTabletopObject('round-table','round',{x:8,y:8,z:0}),edge={...lamp,x:8+round.width*.48,z:4}
 f.scene.objects=[round,edge];assert.equal(lowerEditorObjects(f.state,[{kind:'object',id:edge.id}]).state.scenes[0].objects[1].z,0)
 f.scene.objects=[{...f.barrel,open:true,z:0},{...lamp,z:.3}]
 assert.equal(lowerEditorObjects(f.state,[{kind:'object',id:lamp.id}]).state.scenes[0].objects[1].z,0)
})
test('Опускание: no-op не создаёт историю; неверное выделение и группа ниже земли отклоняются без изменений',()=>{
 const {lowerEditorObjects}=load('sceneEditorLower'),f=lowerFixture(),before=structuredClone(f.state)
 const grounded=lowerEditorObjects(f.state,f.items).state;assert.equal(lowerEditorObjects(grounded,f.items).state,grounded)
 for(const items of [[],[{kind:'token',id:'rider'}],[{kind:'object',id:'missing'}]])assert.throws(()=>lowerEditorObjects(f.state,items),/объекты без героев/)
 f.scene.objects[1].z=-.5;const underground=structuredClone(f.state)
 assert.throws(()=>lowerEditorObjects(f.state,f.items),/ниже земли/);assert.deepEqual(f.state,underground)
 f.scene.objects[1].z=2;assert.deepEqual(f.state,before)
})
test('Опускание в UI: End, содержимое, одна отмена/повтор, Shift+End и повтор без записи',async()=>{
 await fixture();const f=lowerFixture();f.scene.tokens=[];await flush(()=>setExternal(f.state));await flush(()=>viewport.onSelect(f.items[0]));const before=structuredClone(current)
 assert(!button('Опустить на поверхность · End').disabled)
 await key('End');assert.equal(writes,1);assert.equal(active().objects[1].z,.5);assert.equal(active().objects[2].z,.5+f.table.height);assert.equal(active().objects[3].z,.5+f.table.height+f.barrel.height)
 await key('End');assert.equal(writes,1,'Already supported contents do not add undo entries')
 await key('z',{ctrlKey:true});assert.deepEqual(current,before)
 await key('z',{ctrlKey:true,shiftKey:true});assert.equal(active().objects[1].z,.5)
 await key('End',{shiftKey:true});assert.equal(writes,4);assert.equal(active().objects[1].z,0)
 await key('z',{ctrlKey:true});assert.equal(active().objects[1].z,.5)
})
test('Опускание в UI: скрытое или защищённое содержимое блокирует всю запись; скрытая опора исключается',async()=>{
 await fixture();const f=lowerFixture();f.scene.tokens=[];await flush(()=>setExternal(f.state));await flush(()=>viewport.onSelect(f.items[0]));await key('o')
 await flush(()=>document.querySelector('[aria-label="Защитить от правок: '+f.candle.name+'"]').click());const before=structuredClone(current)
 await key('End');assert.equal(writes,0);assert.deepEqual(current,before);assert(document.body.textContent.includes('скрыт или защищён'))
 await flush(()=>document.querySelector('[aria-label="Снять защиту: '+f.candle.name+'"]').click())
 await flush(()=>document.querySelector('[aria-label="Скрыть в редакторе: '+f.candle.name+'"]').click());await key('End');assert.equal(writes,0);assert.deepEqual(current,before)
 await flush(()=>document.querySelector('[aria-label="Показать в редакторе: '+f.candle.name+'"]').click())
 await flush(()=>document.querySelector('[aria-label="Скрыть в редакторе: '+f.platform.name+'"]').click());await key('End');assert.equal(writes,1);assert.equal(active().objects[1].z,0)
})
test('Опускание в UI: поля и End списка сохраняют ввод/навигацию; read-only, отказ и режим игры защищены',async()=>{
 await fixture();const f=lowerFixture();f.scene.tokens=[];await flush(()=>setExternal(f.state));await flush(()=>viewport.onSelect(f.items[0]))
 const field=document.querySelector('input[name=name]'),inputEnd=await key('End',{},field);assert(!inputEnd.defaultPrevented);assert.equal(writes,0)
 await key('o');const row=outlinerRow('object:'+f.table.id);await key('End',{},row);assert.equal(writes,0,'End inside outliner navigates rows without dropping the group')
 await fixture({disabled:true});await flush(()=>viewport.onSelect({kind:'object',id:active().objects[0].id}));await key('End');assert.equal(writes,0);assert(button('Опустить на поверхность · End').disabled)
 await fixture({reject:true});await flush(()=>setExternal(f.state));await flush(()=>viewport.onSelect(f.items[0]));await key('End');assert.equal(writes,1);assert.deepEqual(current,f.state);assert(button('↶ Отменить').disabled)
 await fixture({mode:'play'});await flush(()=>viewport.onSelect({kind:'object',id:active().objects[0].id}));await key('End');assert.equal(writes,0);assert.equal(button('Опустить на поверхность · End'),undefined)
})

test('Защита слоёв: порядок полей после копирования не блокирует чужой перенос, реальные изменения блокируются',()=>{
 const {assertEditorLayerChange}=load('sceneEditorLayers'),{lowerEditorObjects}=load('sceneEditorLower'),f=lowerFixture(),next=lowerEditorObjects(f.state,f.items).state
 assert.doesNotThrow(()=>assertEditorLayerChange(f.state,next,f.scene.id,[f.platform.id]))
 const reordered=structuredClone(f.state);reordered.scenes[0].objects[0]=Object.fromEntries(Object.entries(f.platform).reverse())
 assert.doesNotThrow(()=>assertEditorLayerChange(f.state,reordered,f.scene.id,[f.platform.id]))
 for(const [key,value] of Object.entries({x:9,z:1,height:2,canSupport:false,artwork:'auto',facing:90,active:false,locked:true,name:'Изменённое имя'})){
  const changed=structuredClone(reordered);changed.scenes[0].objects[0][key]=value
  assert.throws(()=>assertEditorLayerChange(f.state,changed,f.scene.id,[f.platform.id]),/скрыт или защищён/,key)
 }
 const removed=structuredClone(f.state);removed.scenes[0].objects.shift();assert.throws(()=>assertEditorLayerChange(f.state,removed,f.scene.id,[f.platform.id]),/скрыт или защищён/)
})

test('Габариты группы: полные следы, разная высота, нулевой пол и поворот; герои не получают выдуманную высоту',()=>{
 const {editorObjectBounds}=load('sceneEditorTransform'),{rotateEditorGroup}=load('sceneEditorCommands'),f=arrangementFixture(),items=f.items
 f.scene.objects[0].z=2;f.scene.objects[1].z=.5;f.scene.objects[1].height=2;f.scene.objects[2].z=1;f.scene.tokens=[]
 const b=editorObjectBounds(f.scene,items)
 assert.deepEqual(b,{min:{x:2.5,y:4.5,z:.5},max:{x:13.25,y:7.5,z:3},anchor:{x:7.875,y:6,z:.5},size:{x:10.75,y:3,z:2.5}})
 const turned=rotateEditorGroup(f.state,items).scenes[0],r=editorObjectBounds(turned,items)
 assert.deepEqual(r.size,{x:3,y:10.75,z:2.5});assert.deepEqual(r.anchor,b.anchor)
 const floor={...f.scene.objects[0],id:'floor',height:0,z:-1};assert.equal(editorObjectBounds({objects:[floor]},[{kind:'object',id:'floor'}]).size.z,0)
 assert.equal(editorObjectBounds(f.scene,[...items,{kind:'token',id:'hero'}]),undefined)
 assert.equal(editorObjectBounds(f.scene,[{kind:'object',id:'missing'}]),undefined);assert.equal(editorObjectBounds(f.scene,[]),undefined)
})
test('Положение группы: точный центр X/Y и нижняя точка Z, относительная композиция и герой сохраняются',()=>{
 const {editorObjectBounds,positionEditorObjects}=load('sceneEditorTransform'),f=lowerFixture(),items=f.scene.objects.slice(1).map(o=>({kind:'object',id:o.id})),before=structuredClone(f.state)
 const b=editorObjectBounds(f.scene,items);assert.deepEqual(b.anchor,{x:8,y:8,z:2});assert.deepEqual(b.size,{x:1.8,y:1,z:2.6})
 const next=positionEditorObjects(f.state,items,{x:10.25,y:9.5,z:1.125}),scene=next.scenes[0]
 assert.deepEqual(editorObjectBounds(scene,items).anchor,{x:10.25,y:9.5,z:1.125});assert.deepEqual(editorObjectBounds(scene,items).size,b.size)
 for(let i=1;i<scene.objects.length;i++){const old=f.scene.objects[i],o=scene.objects[i];assert.deepEqual({...o,x:old.x,y:old.y,z:old.z},old);assert.equal(o.x-old.x,2.25);assert.equal(o.y-old.y,1.5);assert(Math.abs(o.z-old.z+.875)<1e-6)}
 assert.deepEqual(scene.objects[0],f.platform);assert.equal(scene.tokens[0].x,f.scene.tokens[0].x+2.25);assert.equal(scene.tokens[0].z,f.scene.tokens[0].z-.875)
 assert.deepEqual(positionEditorObjects(next,items,b.anchor),before);assert.deepEqual(f.state,before)
})
test('Положение группы: границы, высота, NaN и устаревшее выделение отклоняются атомарно; no-op сохраняет источник',()=>{
 const {editorObjectBounds,positionEditorObjects}=load('sceneEditorTransform'),f=arrangementFixture(),before=structuredClone(f.state),b=editorObjectBounds(f.scene,f.items)
 assert.equal(positionEditorObjects(f.state,f.items,b.anchor),f.state)
 for(const target of [{x:0,y:6,z:0},{x:30,y:6,z:0},{x:8,y:0,z:0},{x:8,y:20,z:0},{x:8,y:6,z:20},{x:8,y:6,z:-6},{x:NaN,y:6,z:0},{x:8,y:Infinity,z:0}])assert.throws(()=>positionEditorObjects(f.state,f.items,target))
 assert.throws(()=>positionEditorObjects(f.state,[...f.items,{kind:'token',id:'hero'}],b.anchor),/без героев/)
 assert.throws(()=>positionEditorObjects(f.state,[{kind:'object',id:'missing'}],b.anchor),/без героев/)
 assert.deepEqual(f.state,before)
})
test('Положение группы в UI: измерения, абсолютные координаты, одна отмена и актуальные поля после redo',async()=>{
 await fixture();const f=arrangementFixture();f.scene.tokens=[];await flush(()=>setExternal(f.state));await flush(()=>viewport.onSelectMany(f.items));const before=structuredClone(current)
 assert.equal(document.querySelector('[aria-label="Габариты выделения"]').textContent,'Ширина10,75 мГлубина3 мВысота1 м')
 await flush(()=>button('Положение').click());let form=document.querySelector('[aria-label="Точное положение группы"]');assert(form);assert.equal(form.elements.x.value,'7.875');assert.equal(form.elements.y.value,'6');assert.equal(form.elements.z.value,'0')
 await flush(()=>{form.elements.x.value='10';form.elements.y.value='9';form.elements.z.value='2';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))})
 assert.equal(writes,1);assert.deepEqual(load('sceneEditorTransform').editorObjectBounds(active(),f.items).anchor,{x:10,y:9,z:2});form=document.querySelector('[aria-label="Точное положение группы"]');assert.equal(form.elements.x.value,'10')
 await flush(()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(writes,1)
 await key('z',{ctrlKey:true});assert.deepEqual(current,before);assert.equal(document.querySelector('[aria-label="Точное положение группы"]').elements.x.value,'7.875')
 await key('z',{ctrlKey:true,shiftKey:true});assert.equal(document.querySelector('[aria-label="Точное положение группы"]').elements.x.value,'10')
 await flush(()=>button('Сдвиг').click());form=document.querySelector('[aria-label="Точный сдвиг группы"]');assert.equal(form.elements.x.value,'0');assert.equal(form.elements.z.value,'0')
})
test('Положение группы в UI: ошибка и отказ сохраняют ввод, защита и read-only блокируют запись',async()=>{
 const setup=async options=>{await fixture(options);const f=arrangementFixture();f.scene.tokens=[];await flush(()=>setExternal(f.state));await flush(()=>viewport.onSelectMany(f.items));await flush(()=>button('Положение').click());return f}
 let f=await setup(),form=document.querySelector('[aria-label="Точное положение группы"]'),before=structuredClone(current)
 await flush(()=>{form.elements.x.value='0';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});assert.equal(writes,0);assert.deepEqual(current,before);assert.equal(form.elements.x.value,'0');assert(document.body.textContent.includes('границы сцены'))
 await flush(()=>{form.elements.x.value='7.875';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});assert.equal(writes,0);assert(document.body.textContent.includes('Изменений нет.'));assert(!document.body.textContent.includes('границы сцены'))
 await key('o');await flush(()=>outlinerRow('object:'+f.items[0].id).querySelector('[aria-label^="Защитить от правок:"]').click());await flush(()=>button('Свойства').click());await flush(()=>button('Положение').click());assert(document.querySelector('[aria-label="Точное положение группы"] input').matches(':disabled'));assert.equal(writes,0)
 await setup({disabled:true});assert(document.querySelector('[aria-label="Точное положение группы"] input').matches(':disabled'))
 await setup({reject:true});form=document.querySelector('[aria-label="Точное положение группы"]');before=structuredClone(current)
 await flush(()=>{form.elements.x.value='10';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});assert.equal(writes,1);assert.deepEqual(current,before);assert.equal(form.elements.x.value,'10');assert(button('↶ Отменить').disabled)
})
test('Положение группы в UI: смешанное выделение сохраняет обычный сдвиг, поля сохраняют клавиши',async()=>{
 await fixture();const scene=active(),items=[{kind:'object',id:scene.objects[0].id},{kind:'token',id:scene.tokens[0].actorId}]
 await flush(()=>viewport.onSelectMany(items));assert(button('Положение').disabled);assert.equal(document.querySelector('[aria-label="Габариты выделения"]'),null);assert(document.querySelector('[aria-label="Точный сдвиг группы"]'))
 const field=document.querySelector('[aria-label="Точный сдвиг группы"] input'),event=await key('ArrowRight',{},field);assert(!event.defaultPrevented);assert.equal(writes,0)
})
test('Окружение сцены: сохранение, отмена, возврат автоматического выбора и read-only',async()=>{
 await fixture();await flush(()=>button('Параметры сцены').click())
 const original=structuredClone(active()),field=()=>document.querySelector('select[name=environment]')
 assert(field());assert.equal(field().value,'auto')
 await flush(()=>{field().value='underground';field().closest('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))})
 assert.equal(active().environment,'underground');assert.equal(writes,1);assert.deepEqual(active().objects,original.objects)
 await key('z',{ctrlKey:true});assert.equal(active().environment,undefined)
 await key('z',{ctrlKey:true,shiftKey:true});assert.equal(active().environment,'underground')
 await flush(()=>{field().value='auto';field().closest('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))})
 assert(!Object.hasOwn(active(),'environment'));assert.deepEqual(active().objects,original.objects)
 await fixture({disabled:true});await flush(()=>button('Параметры сцены').click());assert(field().closest('form').querySelector('button').disabled)
 await flush(()=>{field().value='underground';field().closest('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});assert.equal(writes,0)
})


async function contentsFixture(options={}){
 const world=await fixture(options),{createTabletopObject}=load('tabletopCatalog')
 const table={...createTabletopObject('table','composition-table',{x:8,y:8,z:1}),name:'Стол композиции'},tray={...createTabletopObject('bar','composition-tray',{x:8,y:8,z:1.98}),name:'Поднос композиции',width:.5,depth:.4,height:.3},cup={...createTabletopObject('mug','composition-cup',{x:8.1,y:8,z:2.28}),name:'Кружка композиции'},peer={...createTabletopObject('chair','composition-peer',{x:11,y:8,z:0}),name:'Соседний стул'},floating={...cup,id:'composition-floating',name:'Парящая кружка',z:2.5}
 const token={actorId:world.characters[0].id,x:8.05,y:8,z:2.28,diameter:.25,support:{kind:'object',objectId:tray.id}}
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,objects:[table,tray,cup,peer,floating],tokens:[token]}:s)}))
 await flush(()=>viewport.onSelect({kind:'object',id:table.id}))
 return {table,tray,cup,peer,floating,token,original:structuredClone(current)}
}
test('Композиция в UI: прямой перенос вложенных опор несёт героя один раз, undo/redo целиком',async()=>{
 const {table,tray,cup,peer,floating,token,original}=await contentsFixture({libraryScope:'contents-move'})
 assert(document.querySelector('[aria-label="Композиция с содержимым"]').textContent.includes('Объектов: 3 · героев на опорах: 1'))
 await flush(()=>button('Перенести с содержимым').click());assert.equal(writes,0);assert.deepEqual(viewport.selections.map(i=>i.id),[table.id,tray.id,cup.id]);assert(viewport.selections.every(i=>i.kind==='object'))
 await flush(()=>viewport.onPoint({x:11,y:10,z:0},{resolved:true}));assert.equal(writes,1)
 for(const object of [table,tray,cup]){const moved=active().objects.find(o=>o.id===object.id);assert.equal(moved.x,object.x+3);assert.equal(moved.y,object.y+2);assert.equal(moved.z,object.z)}
 assert.deepEqual(active().tokens,[{...token,x:11.05,y:10}]);assert.deepEqual(active().objects.filter(o=>[peer.id,floating.id].includes(o.id)),[peer,floating])
 await key('z',{ctrlKey:true});assert.deepEqual(current,original);await key('z',{ctrlKey:true,shiftKey:true});assert.equal(active().tokens[0].x,11.05);assert.equal(writes,3)
})
test('Композиция в UI: масштаб и сборка доступны с героем на вложенной опоре, Del его не удаляет',async()=>{
 const {table,tray,cup,token,original}=await contentsFixture({libraryScope:'contents-scale'})
 await key('g',{shiftKey:true});assert.equal(viewport.selections.length,3);assert(viewport.selections.every(i=>i.kind==='object'));assert(!button('Сохранить в сборку').disabled)
 await key('Delete');assert.equal(writes,0);assert.deepEqual(current,original);assert(document.body.textContent.includes('стоит персонаж'))
 const input=document.querySelector('[aria-label="Масштаб X, %"]'),form=input.form
 await flush(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'150');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
 await flush(()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(writes,1)
 for(const object of [table,tray,cup]){const scaled=active().objects.find(o=>o.id===object.id);assert.equal(scaled.width,Math.round(object.width*1.5*1e6)/1e6)}
 assert.deepEqual(active().tokens,[{...token,x:8.075,z:2.92}]);assert.equal(active().tokens[0].diameter,token.diameter)
 await flush(()=>button('Сохранить в сборку').click());const save=document.querySelector('[aria-label="Сохранить сборку"]')
 await flush(()=>{save.elements.assemblyName.value='Занятая композиция';save.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});assert.equal(writes,1);const card=[...document.querySelectorAll('.gb-assembly-pick')].find(b=>b.querySelector('strong').textContent==='Занятая композиция');assert(card)
 await flush(()=>card.click());assert.equal(viewport.placement.assembly.objects.length,3);assert.equal(viewport.placement.assembly.objects.length,viewport.placement.assembly.objects.filter(o=>o.kind!=='token').length)
})
test('Композиция в UI: явно выбранный герой сохраняется в группе и продолжает ограничивать масштаб/сборку',async()=>{
 const {table,token}=await contentsFixture({libraryScope:'contents-explicit-actor'})
 await flush(()=>viewport.onSelect({kind:'token',id:token.actorId},{extend:true}));await flush(()=>viewport.onSelect({kind:'object',id:table.id}))
 await key('g',{shiftKey:true});assert(viewport.selections.some(i=>i.kind==='token'&&i.id===token.actorId));assert(document.body.textContent.includes('Явно выбранные герои остались в группе'));assert.equal(viewport.selections.length,4);assert(button('Сохранить в сборку').disabled);assert.equal(document.querySelector('[aria-label="Масштаб объектов"]'),null);assert.equal(writes,0)
})
test('Композиция в UI: дубликат получает новые ID только для предметов, герой остаётся на исходнике',async()=>{
 const {table,tray,cup,token,original}=await contentsFixture({libraryScope:'contents-duplicate'})
 await flush(()=>button('Дублировать с содержимым').click());assert.equal(writes,1);assert.equal(active().objects.length,8);assert.equal(viewport.selections.length,3)
 const copies=active().objects.slice(5),dx=copies[0].x-table.x,dy=copies[0].y-table.y
 assert(dx||dy);for(const [i,source] of [table,tray,cup].entries()){const copy=copies[i];assert(!original.scenes.find(s=>s.id===current.activeSceneId).objects.some(o=>o.id===copy.id));assert.equal(copy.x,source.x+dx);assert.equal(copy.y,source.y+dy);assert.equal(copy.z,source.z)}
 assert.deepEqual(active().tokens,[token]);assert(document.body.textContent.includes('Герои остались на исходных опорах'))
 await key('z',{ctrlKey:true});assert.deepEqual(current,original);assert(button('↶ Отменить').disabled)
})
test('Композиция в UI: копирование делает независимый снимок всей вложенности, вставка в другую сцену и одна отмена',async()=>{
 const {table,token}=await contentsFixture({libraryScope:'contents-copy'})
 await flush(()=>button('Копировать с содержимым').click());assert.equal(writes,0);assert(document.body.textContent.includes('Персонажи остаются'))
 await key('ArrowRight');const original=structuredClone(current),from=current.activeSceneId,to=current.scenes.find(s=>s.id!==from).id,sourceScene=original.scenes.find(s=>s.id===from),target=original.scenes.find(s=>s.id===to)
 const select=document.querySelector('[aria-label="Открытая сцена"]');await flush(()=>{select.value=to;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 const beforePaste=writes;await key('v',{ctrlKey:true});assert.equal(viewport.placement.assembly.objects.length,3)
 const copiedTable=viewport.placement.assembly.objects.find(o=>o.name===table.name),copiedCup=viewport.placement.assembly.objects.find(o=>o.id==='composition-cup')
 assert.equal(Math.round((copiedCup.x-copiedTable.x)*1e6)/1e6,.1,'Clipboard kept the original arrangement despite moving the source table')
 await key('r');const layout=load('sceneAssemblies').assemblyLayout(viewport.placement.assembly,{x:12,y:12,z:target.groundZ+1},90)
 await flush(()=>viewport.onPoint({x:12,y:12,z:target.groundZ+1},{resolved:true}));assert.equal(writes,beforePaste+1);assert.equal(active().objects.length,target.objects.length+3);assert.deepEqual(active().tokens,target.tokens);assert.deepEqual(current.scenes.find(s=>s.id===from),sourceScene);assert.deepEqual(sourceScene.tokens,[{...token}])
 active().objects.slice(target.objects.length).forEach((o,i)=>assert.deepEqual({...o,id:layout[i].id},layout[i]));assert.equal(new Set(active().objects.map(o=>o.id)).size,active().objects.length)
 await key('z',{ctrlKey:true});assert.deepEqual(active(),target);assert.deepEqual(current.scenes.find(s=>s.id===from),sourceScene)
})
test('Композиция в UI: скрытое/защищённое вложение блокирует все общие действия и не заменяет буфер',async()=>{
 for(const flag of ['hidden','protected']){
  const {table,cup,original}=await contentsFixture({libraryScope:'contents-block-'+flag})
  await key('c',{ctrlKey:true});await flush(()=>button('Объекты').click());const label=flag==='hidden'?'Скрыть в редакторе: ':'Защитить от правок: '
  await flush(()=>document.querySelector('[aria-label="'+label+cup.name+'"]').click());await flush(()=>viewport.onSelect({kind:'object',id:table.id}));await flush(()=>button('Свойства').click())
  const section=document.querySelector('[aria-label="Композиция с содержимым"]');assert(section);assert.equal(section.querySelectorAll('button:disabled').length,4)
  await key('g',{shiftKey:true});assert.equal(viewport.selections.length,1);assert.equal(writes,0);assert.deepEqual(current,original)
  await key('v',{ctrlKey:true});assert.equal(viewport.placement.assembly.objects.length,1,'Blocked composition must not partially replace the old table-only clipboard');await key('Escape')
 }
})
test('Композиция в UI: read-only, игровой режим, отказ сохранения и устаревший callback не пишут сцену',async()=>{
 let data=await contentsFixture({disabled:true,libraryScope:'contents-readonly'});assert(button('Перенести с содержимым').disabled);assert(button('Дублировать с содержимым').disabled);await flush(()=>button('Копировать с содержимым').click());assert(document.body.textContent.includes('В буфере: 3 объекта'));await key('v',{ctrlKey:true});assert(!viewport.placement);assert.equal(writes,0)
 data=await contentsFixture({reject:true,libraryScope:'contents-reject'});await flush(()=>button('Дублировать с содержимым').click());assert.equal(writes,1);assert.deepEqual(current,data.original);assert(button('↶ Отменить').disabled);assert(document.body.textContent.includes('Отказ записи'))
 await fixture({mode:'play'});const support=active().objects.find(o=>o.canSupport);await flush(()=>viewport.onSelect({kind:'object',id:support.id}));assert(!button('Перенести с содержимым'));await key('g',{shiftKey:true});assert.equal(writes,0)
 data=await contentsFixture({libraryScope:'contents-stale'});const duplicate=button('Дублировать с содержимым'),reactProps=duplicate[Object.keys(duplicate).find(k=>k.startsWith('__reactProps'))],stale=reactProps.onClick
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,name:s.name+' извне'}:s)}));const before=structuredClone(current)
 await flush(()=>stale());assert.equal(writes,0);assert.deepEqual(current,before);assert(document.body.textContent.includes('Сцена или режим изменились'))
})
test('Композиция в UI: превышение лимита объектов отклоняет дублирование целиком',async()=>{
 const {table,cup}=await contentsFixture({libraryScope:'contents-limit'}),{createTabletopObject}=load('tabletopCatalog')
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,objects:[...s.objects,...Array.from({length:244},(_,i)=>createTabletopObject('chair','limit-'+i,{x:15,y:15,z:0}))]}:s)}));await flush(()=>viewport.onSelect({kind:'object',id:table.id}));const before=structuredClone(current)
 await flush(()=>button('Дублировать с содержимым').click());assert.equal(writes,0);assert.equal(active().objects.length,249);assert.deepEqual(current,before);assert(button('↶ Отменить').disabled);assert(active().objects.some(o=>o.id===cup.id))
})

const repeatBox=()=>document.querySelector('[aria-label="Повторять вставку"]')
const pasteCount=()=>document.querySelector('.gb-paste-count')?.textContent
async function startRepeat(options={}){
 const data=await contentsFixture(options)
 await flush(()=>button('Копировать с содержимым').click());await key('v',{ctrlKey:true});assert.equal(repeatBox().checked,false)
 await flush(()=>repeatBox().click());return data
}
async function setPasteHeight(value){
 const input=document.querySelector('[aria-label="Высота вставки над землёй, м"]')
 await flush(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
}
test('Повторная вставка: три независимые копии сохраняют угол, высоту и исходного героя; завершение выделяет последнюю',async()=>{
 const {original,token}=await startRepeat({libraryScope:'paste-repeat-many'}),source=structuredClone(active())
 await key('r');await setPasteHeight(2);const assembly=structuredClone(viewport.placement.assembly)
 const points=[{x:12,y:8,z:0},{x:16,y:8,z:0},{x:20,y:8,z:0}],created=[]
 for(const [i,point] of points.entries()){
  await flush(()=>viewport.onPoint(point,{surfaceId:null,resolved:true}));assert.equal(writes,i+1);assert(viewport.placement);assert.equal(viewport.placement.facing,90);assert.equal(viewport.placement.elevation,2);assert.equal(viewport.selection,null);assert.equal(viewport.selections.length,0);assert.equal(pasteCount(),'Вставок на сцене: '+(i+1))
  const copies=active().objects.slice(source.objects.length+i*3),layout=load('sceneAssemblies').assemblyLayout(assembly,{...point,z:2},90)
  assert.equal(copies.length,3);copies.forEach((o,n)=>assert.deepEqual({...o,id:layout[n].id},layout[n]));created.push(copies.map(o=>o.id));assert.deepEqual(active().tokens,[token]);assert(editorToolbarButton('Удалить выбранное').disabled)
 }
 assert.equal(new Set(active().objects.map(o=>o.id)).size,14);assert.deepEqual(active().objects.slice(0,5),source.objects)
 await flush(()=>button('Завершить вставку Esc').click());assert(!viewport.placement);assert.deepEqual(viewport.selections.map(i=>i.id),created[2]);assert.equal(writes,3);assert(document.body.textContent.includes('Вставка завершена'))
 await key('z',{ctrlKey:true});assert.equal(active().objects.length,11);assert.deepEqual(active().tokens,original.scenes.find(s=>s.id===current.activeSceneId).tokens)
})
test('Повторная вставка: undo/redo работают внутри режима и не затрагивают прежнюю правку',async()=>{
 const {table}=await contentsFixture({libraryScope:'paste-repeat-history'});await key('ArrowRight');const base=structuredClone(current);await key('c',{ctrlKey:true});await key('v',{ctrlKey:true});await flush(()=>repeatBox().click())
 assert(editorToolbarButton('↶ Отменить').disabled);assert(button('Отменить вставку').disabled);await flush(()=>viewport.onPoint({x:12,y:8,z:0}));const first=active().objects.at(-1).id;await flush(()=>viewport.onPoint({x:16,y:8,z:0}));const second=active().objects.at(-1).id;assert.equal(pasteCount(),'Вставок на сцене: 2')
 await key('z',{ctrlKey:true});assert(viewport.placement);assert.equal(pasteCount(),'Вставок на сцене: 1');assert(!active().objects.some(o=>o.id===second));await flush(()=>button('Отменить вставку').click());assert.deepEqual(current,base);assert.equal(pasteCount(),'Вставок на сцене: 0');assert(editorToolbarButton('↶ Отменить').disabled)
 const before=writes;await key('z',{ctrlKey:true});assert.equal(writes,before);assert(viewport.placement);assert.equal(active().objects.find(o=>o.id===table.id).x,table.x+.25)
 await key('z',{metaKey:true,shiftKey:true});assert(active().objects.some(o=>o.id===first));assert.equal(pasteCount(),'Вставок на сцене: 1');await flush(()=>button('Вернуть вставку').click());assert(active().objects.some(o=>o.id===second));assert.equal(pasteCount(),'Вставок на сцене: 2');assert(button('Вернуть вставку').disabled)
 await key('Escape');assert.equal(viewport.selection.id,second);assert(!viewport.placement)
})
test('Повторная вставка: отмена последней копии возвращает выделение предыдущей при завершении',async()=>{
 await startRepeat({libraryScope:'paste-repeat-finish-previous'});await flush(()=>viewport.onPoint({x:12,y:8,z:0}));const first=viewport.placement&&active().objects.slice(-3).map(o=>o.id);await flush(()=>viewport.onPoint({x:16,y:8,z:0}));await key('z',{ctrlKey:true});await key('Escape')
 assert.deepEqual(viewport.selections.map(i=>i.id),first);assert(!viewport.placement);assert.equal(active().objects.length,8)
 await key('v',{ctrlKey:true});assert.equal(repeatBox().checked,false);await flush(()=>viewport.onPoint({x:20,y:8,z:0}));assert(!viewport.placement);assert.equal(active().objects.length,11,'A new Ctrl+V returns to ordinary one-shot paste')
})
test('Повторная вставка: новая копия после undo отбрасывает старую ветвь redo и обновляет счётчик',async()=>{
 await startRepeat({libraryScope:'paste-repeat-branch'});await flush(()=>viewport.onPoint({x:12,y:8,z:0}));await flush(()=>viewport.onPoint({x:16,y:8,z:0}));const abandoned=active().objects.slice(-3).map(o=>o.id);await key('z',{ctrlKey:true})
 await flush(()=>viewport.onPoint({x:20,y:8,z:0}));const last=active().objects.slice(-3).map(o=>o.id);assert.equal(pasteCount(),'Вставок на сцене: 2');assert(button('Вернуть вставку').disabled);assert(abandoned.every(id=>!active().objects.some(o=>o.id===id)))
 const before=writes;await key('y',{ctrlKey:true});assert.equal(writes,before);await key('Escape');assert.deepEqual(viewport.selections.map(i=>i.id),last)
})
test('Повторная вставка: Ctrl+V сохраняет параметры открытого режима; Escape в поле завершает и возвращает исходное выделение после undo',async()=>{
 const {table,original}=await startRepeat({libraryScope:'paste-repeat-controls'});await key('r');await setPasteHeight(2.5);await key('v',{ctrlKey:true});assert.equal(repeatBox().checked,true);assert.equal(viewport.placement.facing,90);assert.equal(viewport.placement.elevation,2.5)
 const input=document.querySelector('[aria-label="Высота вставки над землёй, м"]'),native=await key('z',{ctrlKey:true},input);assert(!native.defaultPrevented);assert.equal(writes,0)
 await flush(()=>viewport.onPoint({x:12,y:8,z:0}));await key('z',{ctrlKey:true});assert.deepEqual(current,original);await key('Escape',{},input);assert(!viewport.placement);assert.deepEqual(viewport.selections,[{kind:'object',id:table.id}]);assert.equal(viewport.selection.id,table.id)
 await key('v',{ctrlKey:true});assert.equal(repeatBox().checked,false);assert.equal(viewport.placement.facing,0);assert.equal(viewport.placement.elevation,1)
})
test('Повторная вставка: отказ записи и неверная высота не увеличивают счётчик, после исправления можно продолжить',async()=>{
 const options={libraryScope:'paste-repeat-reject'},data=await startRepeat(options);await flush(()=>viewport.onPoint({x:12,y:8,z:0}));const before=structuredClone(current)
 options.reject=true;await flush(()=>viewport.onPoint({x:16,y:8,z:0}));assert.equal(writes,2);assert.deepEqual(current,before);assert.equal(pasteCount(),'Вставок на сцене: 1');assert(document.body.textContent.includes('Отказ записи'));assert(viewport.placement)
 options.reject=false;await setPasteHeight(1000);await flush(()=>viewport.onPoint({x:16,y:8,z:0}));assert.equal(writes,2);assert.deepEqual(current,before);assert.equal(pasteCount(),'Вставок на сцене: 1')
 await setPasteHeight('');await flush(()=>viewport.onPoint({x:16,y:8,z:0}));assert.equal(writes,2);assert.deepEqual(current,before);await setPasteHeight(1);await flush(()=>viewport.onPoint({x:16,y:8,z:0}));assert.equal(writes,3);assert.equal(pasteCount(),'Вставок на сцене: 2');assert.deepEqual(active().tokens,data.original.scenes.find(s=>s.id===current.activeSceneId).tokens)
})
test('Повторная вставка: лимит 250 блокирует целую копию, undo освобождает место без частичного результата',async()=>{
 const {table}=await contentsFixture({libraryScope:'paste-repeat-limit'}),{createTabletopObject}=load('tabletopCatalog')
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,objects:[...s.objects,...Array.from({length:242},(_,i)=>createTabletopObject('chair','repeat-fill-'+i,{x:25,y:15,z:0}))]}:s)}));await flush(()=>viewport.onSelect({kind:'object',id:table.id}));await flush(()=>button('Копировать с содержимым').click());await key('v',{ctrlKey:true});await flush(()=>repeatBox().click());const original=structuredClone(current)
 await flush(()=>viewport.onPoint({x:12,y:8,z:0}));assert.equal(active().objects.length,250);const full=structuredClone(current);await flush(()=>viewport.onPoint({x:16,y:8,z:0}));assert.equal(writes,1);assert.deepEqual(current,full);assert.equal(pasteCount(),'Вставок на сцене: 1');assert(document.body.textContent.includes('250 объектов'))
 await key('z',{ctrlKey:true});assert.deepEqual(current,original);await flush(()=>viewport.onPoint({x:16,y:8,z:0}));assert.equal(active().objects.length,250);assert.equal(pasteCount(),'Вставок на сцене: 1');assert(button('Вернуть вставку').disabled)
})
test('Повторная вставка: устаревший обработчик и двойное завершение жеста не создают лишних копий',async()=>{
 await startRepeat({libraryScope:'paste-repeat-stale'});const oldSettings=viewport.onPoint;await key('r');await flush(()=>oldSettings({x:12,y:8,z:0}));assert.equal(writes,0)
 const oldSession=viewport.onPoint;await key('Escape');await key('v',{ctrlKey:true});await flush(()=>repeatBox().click());await flush(()=>oldSession({x:12,y:8,z:0}));assert.equal(writes,0,'Restarting in the same scene and revision still invalidates the old session')
 const point=viewport.onPoint;await flush(()=>{point({x:12,y:8,z:0});point({x:16,y:8,z:0})});assert.equal(writes,1);assert.equal(pasteCount(),'Вставок на сцене: 1');await flush(()=>point({x:16,y:8,z:0}));assert.equal(writes,1);await flush(()=>viewport.onPoint({x:16,y:8,z:0}));assert.equal(writes,2)
})
test('Повторная вставка: внешняя замена, другая сцена, отзыв доступа и другой проект останавливают предпросмотр',async()=>{
 for(const change of ['external','scene','disabled','mode','scope','tool','other_tool']){
  const options={mode:'build',libraryScope:'paste-repeat-context-'+change};await startRepeat(options);await flush(()=>viewport.onPoint({x:12,y:8,z:0}));const stale=viewport.onPoint,oldId=active().id,oldScene=structuredClone(active())
  if(change==='external')await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===oldId?{...s,name:s.name+' новая версия'}:s)}))
  else if(change==='scene')await selectValue('Открытая сцена',current.scenes.find(s=>s.id!==oldId).id)
  else if(change==='scope')await flush(()=>setScope('another-account:'+change))
  else if(change==='tool')await flush(()=>editorToolbarButton('Выбрать · V').click())
  else if(change==='other_tool'){await flush(()=>editorToolbarButton('Стена линией · W').click());await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===oldId?{...s,name:s.name+' после смены инструмента'}:s)}));assert(!document.body.textContent.includes('Вставка остановлена'))}
  else{if(change==='disabled')options.disabled=true;else options.mode='play';await flush(()=>setExternal({...current}))}
  assert(!viewport.placement);assert(!document.querySelector('[aria-label="Вставка группы"]'));const before=structuredClone(current),prior=writes;await flush(()=>stale({x:16,y:8,z:0}));assert.equal(writes,prior);assert.deepEqual(current,before);assert.deepEqual(current.scenes.find(s=>s.id===oldId).objects,oldScene.objects)
  if(change==='external'||change==='scene'){await key('v',{ctrlKey:true});assert(viewport.placement);assert.equal(repeatBox().checked,false)}
  if(change==='scope')assert(editorToolbarButton('Вставить · Ctrl+V').disabled)
 }
})
test('Повторная вставка: защита созданной копии блокирует undo до снятия защиты и сохраняет историю',async()=>{
 await startRepeat({libraryScope:'paste-repeat-layers'});await flush(()=>viewport.onPoint({x:12,y:8,z:0}));const copy=active().objects.at(-1),before=structuredClone(current)
 await key('o');let row=outlinerRow('object:'+copy.id);await flush(()=>row.querySelector('[aria-label="Защитить от правок: '+copy.name+'"]').click());const prior=writes;await key('z',{ctrlKey:true});assert.equal(writes,prior);assert.deepEqual(current,before);assert.equal(pasteCount(),'Вставок на сцене: 1');assert(viewport.placement)
 row=outlinerRow('object:'+copy.id);await flush(()=>row.querySelector('[aria-label="Снять защиту: '+copy.name+'"]').click());await key('z',{ctrlKey:true});assert.equal(active().objects.length,5);assert.equal(pasteCount(),'Вставок на сцене: 0');assert(!button('Вернуть вставку').disabled)
})

const rowBox=()=>document.querySelector('[aria-label="Создать ряд"]')
async function pasteNumber(label,value){const input=document.querySelector('[aria-label="'+label+'"]');assert(input);await flush(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})}
async function startRow(options={}){const data=await contentsFixture(options);await flush(()=>button('Копировать с содержимым').click());await key('v',{ctrlKey:true});assert.equal(rowBox().checked,false);await flush(()=>rowBox().click());return data}
test('Ряд в UI: ось сцены, поворот и точный промежуток дают общий предпросмотр и одну запись/отмену',async()=>{
 const {original,token}=await startRow({libraryScope:'row-basic'});assert.equal(viewport.placement.assembly.objects.length,9);assert.equal(writes,0)
 await pasteNumber('Количество копий в ряду',4);await selectValue('Ось ряда','y');await pasteNumber('Промежуток между копиями, м',.75);await key('r');await setPasteHeight(2)
 const plan=structuredClone(viewport.placement),row=plan.assembly;assert.equal(plan.facing,0);assert.equal(row.objects.length,12);assert.equal(row.width,1);assert.equal(row.depth,9.45);assert.equal(row.objects[0].facing,90);assert(Math.abs(row.objects[3].y-row.objects[0].y-2.55)<1e-6)
 const expected=load('sceneAssemblies').assemblyLayout(row,{x:12,y:10,z:2},0);await flush(()=>viewport.onPoint({x:12,y:10,z:2},{surfaceId:null,resolved:true}));assert.equal(writes,1);assert.equal(active().objects.length,17);assert(!viewport.placement);assert.equal(viewport.selections.length,12);assert.deepEqual(active().tokens,[token]);active().objects.slice(5).forEach((o,i)=>assert.deepEqual({...o,id:expected[i].id},expected[i]))
 await key('z',{ctrlKey:true});assert.deepEqual(current,original);await key('z',{ctrlKey:true,shiftKey:true});assert.equal(active().objects.length,17);assert.equal(new Set(active().objects.map(o=>o.id)).size,17)
})
test('Ряд в UI: повторение размещает целые ряды, счётчик и история считают вставки',async()=>{
 const options={libraryScope:'row-repeat'};await startRow(options);await pasteNumber('Количество копий в ряду',2);await flush(()=>repeatBox().click());await flush(()=>viewport.onPoint({x:12,y:8,z:0}));const first=active().objects.slice(-6).map(o=>o.id);assert.equal(pasteCount(),'Вставок на сцене: 1');assert(viewport.placement)
 const accepted=structuredClone(current);options.reject=true;await flush(()=>viewport.onPoint({x:20,y:10,z:0}));assert.deepEqual(current,accepted);assert.equal(pasteCount(),'Вставок на сцене: 1');assert(document.body.textContent.includes('Отказ записи'));options.reject=false
 await pasteNumber('Количество копий в ряду',3);await selectValue('Ось ряда','y');await key('v',{ctrlKey:true});assert.equal(rowBox().checked,true);assert.equal(document.querySelector('[aria-label="Количество копий в ряду"]').value,'3');await flush(()=>viewport.onPoint({x:20,y:10,z:0}));const last=active().objects.slice(-9).map(o=>o.id);assert.equal(pasteCount(),'Вставок на сцене: 2');assert.equal(active().objects.length,20)
 await key('z',{ctrlKey:true});assert.equal(active().objects.length,11);assert(first.every(id=>active().objects.some(o=>o.id===id)));await key('z',{ctrlKey:true,shiftKey:true});assert.equal(active().objects.length,20);await key('Escape');assert.deepEqual(viewport.selections.map(i=>i.id),last);assert(!viewport.placement)
})
test('Ряд в UI: некорректное число копий или промежуток убирает предпросмотр и не пишет одиночную замену',async()=>{
 const {original}=await startRow({libraryScope:'row-invalid'})
 for(const value of [1,1.5,100,'']){await pasteNumber('Количество копий в ряду',value);assert(!viewport.placement);assert(document.querySelector('[role=alert]'));await flush(()=>viewport.onPoint({x:12,y:8,z:0}));assert.equal(writes,0);assert.deepEqual(current,original)}
 await pasteNumber('Количество копий в ряду',3)
 for(const value of [-1,'']){await pasteNumber('Промежуток между копиями, м',value);assert(!viewport.placement);await flush(()=>viewport.onPoint({x:12,y:8,z:0}));assert.equal(writes,0);assert.deepEqual(current,original)}
 await pasteNumber('Промежуток между копиями, м',.5);assert.equal(viewport.placement.assembly.objects.length,9);assert(!document.querySelector('[role=alert]'));const input=document.querySelector('[aria-label="Количество копий в ряду"]'),native=await key('ArrowRight',{},input);assert(!native.defaultPrevented)
 await flush(()=>rowBox().click());assert.equal(viewport.placement.assembly.objects.length,3);assert(!document.querySelector('[aria-label="Параметры ряда"]'));await key('Escape');assert.equal(writes,0)
})
test('Ряд в UI: нехватка места блокирует весь ряд; привязка у края не сжимает промежуток',async()=>{
 const {original}=await startRow({libraryScope:'row-bounds'});await pasteNumber('Промежуток между копиями, м',20);assert(viewport.placement.assembly.width>active().width);await flush(()=>viewport.onPoint({x:12,y:8,z:0}));assert.equal(writes,0);assert.deepEqual(current,original);assert(document.body.textContent.includes('границы'))
 await pasteNumber('Количество копий в ряду',2);await pasteNumber('Промежуток между копиями, м',.25);const row=structuredClone(viewport.placement.assembly);await flush(()=>viewport.onPoint({x:29.999,y:8,z:0},{surfaceId:null,resolved:true}));assert.equal(writes,1);const copies=active().objects.slice(5),centres=[copies[0].x,copies[3].x];assert.equal(copies.length,6);assert.equal(Math.round((centres[1]-centres[0])*1e6)/1e6,2.05);assert(copies.every(o=>o.x+o.width/2<=active().width+1e-6));assert(Math.abs(Math.max(...copies.map(o=>o.x+o.width/2))-Math.min(...copies.map(o=>o.x-o.width/2))-row.width)<1e-6)
})
test('Ряд в UI: превышение 250 объектов отклоняется целиком, выключение ряда сохраняет обычный буфер',async()=>{
 const {table}=await contentsFixture({libraryScope:'row-scene-limit'}),{createTabletopObject}=load('tabletopCatalog')
 await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,objects:[...s.objects,...Array.from({length:242},(_,i)=>createTabletopObject('chair','row-fill-'+i,{x:25,y:15,z:0}))]}:s)}));await flush(()=>viewport.onSelect({kind:'object',id:table.id}));await flush(()=>button('Копировать с содержимым').click());await key('v',{ctrlKey:true});await flush(()=>rowBox().click());await pasteNumber('Количество копий в ряду',2);const original=structuredClone(current)
 await flush(()=>viewport.onPoint({x:12,y:8,z:0}));assert.equal(writes,0);assert.deepEqual(current,original);assert(document.body.textContent.includes('250 объектов'));assert.equal(viewport.placement.assembly.objects.length,6)
 await flush(()=>rowBox().click());await flush(()=>viewport.onPoint({x:12,y:8,z:0}));assert.equal(writes,1);assert.equal(active().objects.length,250);await key('z',{ctrlKey:true});assert.deepEqual(current,original)
})
test('Ряд в UI: большой исходник сохраняет одиночную вставку и явно ограничивает создание ряда',async()=>{
 await contentsFixture({libraryScope:'row-source-limit'});const {createTabletopObject}=load('tabletopCatalog');await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,objects:[...s.objects,...Array.from({length:28},(_,i)=>createTabletopObject('chair','row-source-'+i,{x:20,y:12,z:0}))]}:s)}));await flush(()=>viewport.onSelectMany(active().objects.map(o=>({kind:'object',id:o.id}))));await key('c',{ctrlKey:true});await key('v',{ctrlKey:true})
 assert(rowBox().disabled);assert.equal(rowBox().checked,false);assert(document.body.textContent.includes('до 32 объектов'));assert.equal(viewport.placement.assembly.objects.length,33);await flush(()=>viewport.onPoint({x:15,y:10,z:0}));assert.equal(writes,1);assert.equal(active().objects.length,66);assert(!viewport.placement)
})
test('Ряд в UI: изменение параметров, отмена и смена контекста не позволяют старому жесту разместить ряд',async()=>{
 await startRow({libraryScope:'row-stale'});const stale=viewport.onPoint;await pasteNumber('Количество копий в ряду',2);await flush(()=>stale({x:12,y:8,z:0}));assert.equal(writes,0)
 const oldRow=viewport.onPoint;await key('Escape');await key('v',{ctrlKey:true});assert.equal(rowBox().checked,false);await flush(()=>oldRow({x:12,y:8,z:0}));assert.equal(writes,0)
 await flush(()=>rowBox().click());const oldContext=viewport.onPoint;await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>s.id===current.activeSceneId?{...s,name:s.name+' извне'}:s)}));assert(!viewport.placement);await flush(()=>oldContext({x:12,y:8,z:0}));assert.equal(writes,0);await key('v',{ctrlKey:true});assert.equal(rowBox().checked,false)
})

const copySceneForm=()=>document.querySelector('form[aria-label="Копирование сцены"]')
const submitSceneCopy=async name=>flush(()=>{const form=copySceneForm();if(name!==undefined)form.elements.sceneCopyName.value=name;form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))})
async function sceneCopyFixture(options={}){
 const world=await fixture(options),{state,scene}=arrangementFixture()
 scene.tokens[0].actorId=world.characters[0].id
 Object.assign(scene,{description:'Комната с опорой',view:'side',environment:'underground',background:'pixel-ground-stone',backgroundTileSizeM:2.75,roundDurationSeconds:12.5})
 await flush(()=>setExternal(state));await flush(()=>button('Параметры сцены').click())
 return {original:structuredClone(current),scene}
}
test('Копия сцены: все модели, состояния, оформление и координаты независимы; герои и опоры остаются в исходнике',()=>{
 const {copyEditorScene}=load('sceneEditorSceneCopy'),{createScene,emptyScenes,isSceneState,sceneReferencesValid}=load('scenes'),{tabletopAssets,createTabletopObject}=load('tabletopCatalog')
 let state=createScene(emptyScenes(),'source-room','Исходная комната','side');state=createScene(state,'other-room','Другая сцена','top');state.activeSceneId='source-room'
 const scene=state.scenes[0];Object.assign(scene,{description:'Два этажа и подвал',environment:'underground',background:'pixel-ground-stone',backgroundTileSizeM:3.25,groundZ:-1,minZ:-5,maxZ:20,roundDurationSeconds:6.5})
 scene.objects=tabletopAssets.map((a,i)=>({...createTabletopObject(a.id,'catalog-'+i,{x:4+i%7*3,y:3+Math.floor(i/7)*3,z:0},[0,90,180,270][i%4]),open:i%2===0,...(a.kind==='lamp'||a.id.startsWith('trap-')?{active:false}:{}),...(a.id==='chest'?{locked:true}:{} )}))
 scene.objects.push(load('sceneEditorPlacement').createEnvironmentObject('platform','expanded-object-cabinet','legacy-cabinet',{x:10,y:10,z:-1},90))
 const table=scene.objects.find(o=>o.asset==='table');scene.tokens=[{actorId:'hero',x:table.x,y:table.y,z:table.z+table.height,diameter:.5,support:{kind:'object',objectId:table.id}}]
 state.scenes[1].tokens=[{actorId:'other-hero',x:1,y:1,z:0,diameter:.5,support:{kind:'ground'}}]
 assert(isSceneState(state));const before=structuredClone(state);let generated=0
 const next=copyEditorScene(state,scene.id,'  Новая комната  ',()=> 'copy-'+generated++),copy=next.scenes[1]
 assert.equal(generated,scene.objects.length+1);assert.equal(next.activeSceneId,copy.id);assert.deepEqual(next.scenes.map(s=>s.id),[scene.id,copy.id,'other-room']);assert.equal(copy.name,'Новая комната');assert.deepEqual(copy.tokens,[])
 assert.deepEqual({...copy,id:scene.id,name:scene.name,objects:copy.objects.map((o,i)=>({...o,id:scene.objects[i].id})),tokens:scene.tokens},scene)
 assert.deepEqual(next.scenes[0],scene);assert.deepEqual(next.scenes[2],state.scenes[1]);assert(isSceneState(next));assert(sceneReferencesValid(next,['hero','other-hero']))
 const oldIds=new Set(state.scenes.flatMap(s=>[s.id,...s.objects.map(o=>o.id),...s.tokens.map(t=>t.actorId)]));assert(!oldIds.has(copy.id));assert(copy.objects.every(o=>!oldIds.has(o.id)));assert.equal(new Set([copy.id,...copy.objects.map(o=>o.id)]).size,copy.objects.length+1)
 copy.objects[0].name='Независимая копия';next.scenes[0].tokens[0].support.objectId='independent-snapshot';assert.deepEqual(state,before)
})
test('Копия сцены: пустая комната, 250 объектов и старое размещение у края копируются без скрытой правки геометрии',()=>{
 const {copyEditorScene}=load('sceneEditorSceneCopy'),{createScene,emptyScenes,sceneObject,MAX_SCENE_OBJECTS,isSceneState}=load('scenes')
 for(const count of [0,MAX_SCENE_OBJECTS]){
  const state=createScene(emptyScenes(),'limits','Пределы','top'),scene=state.scenes[0];scene.objects=Array.from({length:count},(_,i)=>({...sceneObject('crate','old-'+i,{x:0,y:0,z:0}),height:0}))
  assert(isSceneState(state));const before=structuredClone(state);let n=0;const next=copyEditorScene(state,scene.id,'Копия',()=> 'fresh-'+n++),copy=next.scenes[1]
  assert.equal(copy.objects.length,count);assert.equal(n,count+1);assert(copy.objects.every(o=>o.x===0&&o.y===0&&o.height===0));assert.deepEqual(state,before)
 }
})
test('Копия сцены: лимит, отсутствующая сцена, имя и конфликт ID отклоняются целиком до записи',()=>{
 const {copyEditorScene}=load('sceneEditorSceneCopy'),{createScene,emptyScenes,isSceneState}=load('scenes');let state=createScene(emptyScenes(),'limits','Пределы','top')
 state.scenes[0].objects=[load('tabletopCatalog').createTabletopObject('chair','original-chair',{x:4,y:4,z:0})];const before=structuredClone(state)
 for(const bad of ['', '   ','x'.repeat(121)])assert.throws(()=>copyEditorScene(state,'limits',bad,()=>{throw Error('ID must not be allocated')}),/Название/)
 assert.throws(()=>copyEditorScene(state,'missing','Копия',()=>{throw Error('ID must not be allocated')}),/больше не существует/)
 for(const id of ['', 'invalid id','x'.repeat(161),'limits','original-chair'])assert.throws(()=>copyEditorScene(state,'limits','Копия',()=>id),/идентификаторы/)
 assert.throws(()=>copyEditorScene(state,'limits','Копия',()=> 'same-id'),/идентификаторы/);assert.deepEqual(state,before)
 const invalid=structuredClone(state);invalid.scenes[0].objects[0].z=100;assert.throws(()=>copyEditorScene(invalid,'limits','Копия',()=>{throw Error('ID must not be allocated')}),/исходных сцен/)
 for(let i=1;i<20;i++)state=createScene(state,'scene-'+i,'Сцена '+i,'top')
 assert(isSceneState(state));const full=structuredClone(state);assert.throws(()=>copyEditorScene(state,'limits','Копия',()=>{throw Error('ID must not be allocated')}),/Максимум 20/);assert.deepEqual(state,full)
})
test('Имя копии: уникальная подсказка, длинные названия и явный ввод не переименовывают исходник',()=>{
 const {sceneCopyName,copyEditorScene}=load('sceneEditorSceneCopy'),{createScene,emptyScenes}=load('scenes'),source={name:'Таверна'}
 assert.equal(sceneCopyName(source,[source]),'Таверна · копия');assert.equal(sceneCopyName(source,[source,{name:'Таверна · копия'},{name:'Таверна · копия 2'},{name:'Таверна · копия 4'}]),'Таверна · копия 3')
 const long={name:'Я'.repeat(120)},first=sceneCopyName(long,[]),second=sceneCopyName(long,[{name:first}]);assert(first.length<=120);assert(second.length<=120);assert.notEqual(first,second);assert(second.endsWith(' · копия 2'))
 const state=createScene(emptyScenes(),'source',source.name,'top'),next=copyEditorScene(state,'source','Таверна',()=> 'copy');assert.deepEqual(next.scenes.map(s=>s.name),['Таверна','Таверна']);assert.equal(state.scenes.length,1)
})
test('Копия сцены в UI: одно создание, открытие копии, завершение инструмента и полная отмена/возврат',async()=>{
 const {original,scene}=await sceneCopyFixture({libraryScope:'scene-copy-undo'})
 await flush(()=>viewport.onSelect({kind:'object',id:scene.objects[0].id}));await key('c',{ctrlKey:true});await key('v',{ctrlKey:true});assert(viewport.placement);await flush(()=>button('Параметры сцены').click())
 assert.equal(copySceneForm().elements.sceneCopyName.value,scene.name+' · копия');await submitSceneCopy('  Нижний зал  ')
 assert.equal(writes,1);assert.equal(current.scenes.length,2);const copied=structuredClone(current),copy=active();assert.equal(copy.name,'Нижний зал');assert.equal(copy.view,'side');assert.equal(copy.environment,'underground');assert.equal(copy.backgroundTileSizeM,2.75);assert.deepEqual(copy.tokens,[]);assert.equal(copy.objects.length,scene.objects.length);assert.deepEqual(current.scenes[0],scene)
 assert.equal(viewport.selection,null);assert.deepEqual(viewport.selections,[]);assert(!viewport.placement);assert.equal(document.querySelector('[aria-label="Открытая сцена"]').value,copy.id);assert(document.body.textContent.includes('Герои остались в исходных сценах'))
 await flush(()=>editorToolbarButton('↶ Отменить').click());assert.equal(writes,2);assert.deepEqual(current,original);assert.equal(document.querySelector('[aria-label="Открытая сцена"]').value,scene.id)
 await flush(()=>editorToolbarButton('↷ Вернуть').click());assert.equal(writes,3);assert.deepEqual(current,copied);assert.equal(copySceneForm().elements.sceneCopyName.value,copy.name+' · копия')
})
test('Копия сцены в UI: скрытые и защищённые предметы копируются; слои исходника и отмена сохранены',async()=>{
 const {original,scene}=await sceneCopyFixture({libraryScope:'scene-copy-layers'}),object=scene.objects[0]
 await flush(()=>button('Объекты').click());await flush(()=>document.querySelector('[aria-label="Защитить от правок: '+object.name+'"]').click());await flush(()=>document.querySelector('[aria-label="Скрыть в редакторе: '+object.name+'"]').click())
 assert.equal(writes,0);await flush(()=>button('Параметры сцены').click());await submitSceneCopy()
 assert.equal(writes,1);assert.equal(active().objects.length,scene.objects.length);assert.deepEqual(viewport.editorHidden,[]);assert.deepEqual(viewport.editorProtected,[]);assert.deepEqual(current.scenes[0],scene)
 await key('z',{ctrlKey:true});assert.deepEqual(current,original);assert(viewport.editorHidden.includes(object.id));assert(viewport.editorProtected.includes(object.id));await key('z',{ctrlKey:true,shiftKey:true});assert.equal(current.scenes.length,2);assert.deepEqual(viewport.editorHidden,[])
})
test('Копия сцены в UI: ошибка имени и отказ записи сохраняют форму, сцену, инструмент и историю',async()=>{
 const {original}=await sceneCopyFixture({libraryScope:'scene-copy-invalid'});await submitSceneCopy('   ');assert.equal(writes,0);assert.deepEqual(current,original);assert.equal(copySceneForm().elements.sceneCopyName.value,'   ');assert(document.body.textContent.includes('Название копии'));assert(editorToolbarButton('↶ Отменить').disabled)
 const options={libraryScope:'scene-copy-reject',reject:true};await sceneCopyFixture(options);const object=active().objects[0];await flush(()=>viewport.onSelect({kind:'object',id:object.id}));await key('c',{ctrlKey:true});await key('v',{ctrlKey:true});await flush(()=>button('Параметры сцены').click());const preview=viewport.placement,before=structuredClone(current)
 await submitSceneCopy('Мой зал');assert.equal(writes,1);assert.deepEqual(current,before);assert.equal(copySceneForm().elements.sceneCopyName.value,'Мой зал');assert.deepEqual(viewport.placement,preview);assert(editorToolbarButton('↶ Отменить').disabled);assert(document.body.textContent.includes('Отказ записи'))
 options.reject=false;await submitSceneCopy();assert.equal(writes,2);assert.equal(active().name,'Мой зал');assert(!viewport.placement)
})
test('Копия сцены в UI: двойное событие и старые обработчики после замены, смены сцены, прав, режима или проекта не пишут',async()=>{
 await sceneCopyFixture({libraryScope:'scene-copy-double'});const form=copySceneForm()
 await flush(()=>{for(let i=0;i<2;i++)form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});assert.equal(writes,1);assert.equal(current.scenes.length,2)
 for(const change of ['external','scene','disabled','mode','scope','unmount']){
  const options={libraryScope:'scene-copy-stale-'+change};await fixture(options);await flush(()=>button('Параметры сцены').click());const form=copySceneForm(),props=form[Object.keys(form).find(k=>k.startsWith('__reactProps'))],stale=props.onSubmit
  if(change==='external')await flush(()=>setExternal({...current,scenes:current.scenes.map(s=>({...s,name:s.name+' с сервера'}))}))
  else if(change==='scene')await selectValue('Открытая сцена',current.scenes.find(s=>s.id!==current.activeSceneId).id)
  else if(change==='scope')await flush(()=>setScope('another-copy-project'))
  else if(change==='unmount')await flush(()=>root.render(null))
  else{if(change==='disabled')options.disabled=true;else options.mode='play';await flush(()=>setExternal({...current}))}
  const before=structuredClone(current),prior=writes;await flush(()=>stale({preventDefault(){},currentTarget:form}));assert.equal(writes,prior,change);assert.deepEqual(current,before,change)
 }
})
test('Копия сцены в UI: режим игры, read-only и предел 20 сцен; возврат ниже предела открывает команду',async()=>{
 await sceneCopyFixture({disabled:true,libraryScope:'scene-copy-readonly'});assert(button('Создать копию сцены').matches(':disabled'));await submitSceneCopy('Не создаётся');assert.equal(writes,0)
 await fixture({mode:'play'});await flush(()=>button('Параметры сцены').click());assert(!copySceneForm());assert(!button('Создать копию сцены'))
 await sceneCopyFixture({libraryScope:'scene-copy-cap'});const {createScene}=load('scenes');let full=current
 while(full.scenes.length<20)full=createScene(full,'full-'+full.scenes.length,'Сцена '+full.scenes.length,'top')
 await flush(()=>setExternal(full));assert(button('Создать копию сцены').matches(':disabled'));assert(document.body.textContent.includes('Достигнут предел: 20 сцен'));await submitSceneCopy('Не помещается');assert.equal(writes,0);assert.deepEqual(current,full)
 await flush(()=>setExternal({...full,scenes:full.scenes.filter(s=>s.id!==full.scenes[0].id)}));assert(!button('Создать копию сцены').matches(':disabled'));await submitSceneCopy('Последний зал');assert.equal(writes,1);assert.equal(current.scenes.length,20);assert.equal(active().name,'Последний зал')
})
