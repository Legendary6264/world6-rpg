const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{pathToFileURL}=require('node:url')
const {JSDOM}=require('jsdom'),React=require('react'),{act}=React,dom=new JSDOM('<div id="root"></div>',{url:'https://grani.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})
dom.window.SVGElement.prototype.getScreenCTM=()=>({inverse:()=>({})})
// Browser SVGPoint coordinates are inherited accessors, not enumerable fields.
dom.window.SVGElement.prototype.createSVGPoint=function(){const svg=this;return {x:0,y:0,matrixTransform(){const [x,y,w,h]=svg.getAttribute('viewBox').split(' ').map(Number),fullH=props.scene.view==='side'?props.scene.maxZ-props.scene.minZ:props.scene.depth;return Object.create({x:x+this.x/20*w/props.scene.width,y:y+this.y/20*h/fullH})}}}
dom.window.SVGElement.prototype.setPointerCapture=()=>{};dom.window.SVGElement.prototype.hasPointerCapture=()=>false
const cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'');if(name.endsWith('.css'))return {};if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name)
 const mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports
}
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root')),{SvgSceneViewport}=load('SceneViewport'),{createScene,emptyScenes}=load('scenes'),{createEnvironmentObject}=load('sceneEditorPlacement'),{createTabletopObject}=load('tabletopCatalog')
const flush=async fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,10))})
let props,moves,selected
async function fixture(objects,extra={}){
 await flush(()=>root.render(null));moves=[];selected=[]
 const scene=createScene(emptyScenes(),'drag-map','Исходная сцена','top').scenes[0];scene.objects=objects;scene.tokens=[]
 props={scene,actors:[],selection:null,selecting:true,onSelect:s=>selected.push(s),onPoint:()=>{},onMove:(s,p,o)=>{moves.push({s,p,o});return true},...extra}
 await mount()
}
async function mount(patch={}){props={...props,...patch};await flush(()=>root.render(React.createElement(SvgSceneViewport,props)))}
const svg=()=>document.querySelector('svg[role=group]'),entity=id=>document.querySelector('[data-scene-id="'+id+'"]')
async function pointer(type,x,y,target=svg(),extra={}){await flush(()=>{const e=new dom.window.MouseEvent(type,{clientX:x*20,clientY:y*20,button:0,bubbles:true,cancelable:true,...extra});Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e)})}
const center=id=>{const r=entity(id).querySelector('.gb-object-hit,.gb-object-selected,.gb-token-frame');return {x:Number(r.getAttribute('x'))+Number(r.getAttribute('width'))/2,y:Number(r.getAttribute('y'))+Number(r.getAttribute('height'))/2}}
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})

test('Схема: прямой захват старой модели сохраняет смещение, предпросмотр и одну команду по отпусканию',async()=>{
 const desk=createEnvironmentObject('platform','expanded-object-desk','desk',{x:5,y:5,z:0});await fixture([desk],{snapStep:.5})
 const before=JSON.stringify(props.scene)
 await pointer('pointerdown',5.2,5.1,entity('desk'));assert.equal(selected.at(-1).id,'desk')
 await pointer('pointermove',7.55,6.45);assert.equal(moves.length,0);assert.equal(JSON.stringify(props.scene),before);assert.equal(center('desk').x,7.5);assert.equal(center('desk').y,6.5)
 await pointer('pointerup',7.55,6.45);assert.equal(moves.length,1);assert.deepEqual(moves[0].p,{x:7.5,y:6.5,z:0});assert.equal(center('desk').x,5,'Unaccepted external position is never written into the source')
 await pointer('pointerdown',5,5,entity('desk'));await pointer('pointerup',5,5);assert.equal(moves.length,1,'Ordinary click does not write')
})
test('Схема: группа и герой на опоре двигаются вместе; Esc и потеря фокуса отменяют весь жест',async()=>{
 const table=createEnvironmentObject('platform','expanded-object-table','table',{x:5,y:5,z:0}),stool=createEnvironmentObject('platform','expanded-object-stool','stool',{x:8,y:5,z:0})
 await fixture([table,stool],{selections:[{kind:'object',id:'table'},{kind:'object',id:'stool'}]})
 const token={actorId:'carried',x:5,y:5,z:table.height,diameter:.8,support:{kind:'object',objectId:'table'}}
 await mount({scene:{...props.scene,tokens:[token]}});const before=JSON.stringify(props.scene)
 await pointer('pointerdown',5,5,entity('table'));await pointer('pointermove',7,6);assert.equal(center('stool').x,10);assert.equal(center('carried').x,7);assert.equal(moves.length,0)
 await flush(()=>svg().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(center('table').x,5);await pointer('pointerup',7,6);assert.equal(moves.length,0)
 await pointer('pointerdown',5,5,entity('table'));await pointer('pointermove',6,6);await flush(()=>window.dispatchEvent(new dom.window.Event('blur')));await pointer('pointerup',6,6);assert.equal(moves.length,0);assert.equal(JSON.stringify(props.scene),before)
 await pointer('pointerdown',5,5,entity('table'));await pointer('pointermove',6,6);await pointer('pointerup',6,6);assert.equal(moves.length,1);assert.deepEqual(moves[0].p,{x:6,y:6,z:0})
})
test('Схема: реальная поверхность старого стола, тесная высота, точность Shift и смена защиты',async()=>{
 const desk=createEnvironmentObject('platform','expanded-object-desk','desk',{x:8,y:8,z:0}),jar={...createEnvironmentObject('crate','expanded-object-jar','jar',{x:3,y:3,z:0}),width:.2,depth:.2,height:.2}
 await fixture([desk,jar],{moveSurfaces:[desk,jar],snapStep:1})
 await pointer('pointerdown',3,3,entity('jar'));await pointer('pointermove',8,8);assert(document.querySelector('[role=status]').textContent.includes(desk.name));await pointer('pointerup',8,8)
 assert.equal(moves.length,1);assert.deepEqual(moves[0].p,{x:8,y:8,z:desk.height});assert.deepEqual(moves[0].o,{surfaceId:'desk'})
 await mount({scene:{...props.scene,maxZ:desk.height+.1}});await pointer('pointerdown',3,3,entity('jar'));await pointer('pointermove',8,8);await pointer('pointerup',8,8);assert.equal(moves.length,1,'Insufficient room cancels the commit')
 await mount({scene:{...props.scene,maxZ:12},moveSurfaces:undefined});await pointer('pointerdown',3,3,entity('jar'));await pointer('pointermove',4,3);await pointer('pointermove',5,3,svg(),{shiftKey:true});assert(Math.abs(center('jar').x-4.1)<1e-9,'Shift scales only subsequent cursor movement')
 await mount({editorProtected:['jar']});assert.equal(center('jar').x,3);await pointer('pointerup',5,3);assert.equal(moves.length,1,'New protection cancels an in-flight move')
})
test('Схема сбоку: перенос X/Z сохраняет глубину; отказ, read-only и внешняя замена не оставляют предпросмотр',async()=>{
 const box={...createEnvironmentObject('crate','expanded-object-jar','jar',{x:5,y:7,z:1}),height:1};await fixture([box])
 await mount({scene:{...props.scene,view:'side',maxZ:12}})
 await pointer('pointerdown',5,10.5,entity('jar'));await pointer('pointermove',6,9);await pointer('pointerup',6,9);assert.deepEqual(moves[0].p,{x:6,y:7,z:2.5})
 await mount({onMove:()=>false});await pointer('pointerdown',5,10.5,entity('jar'));await pointer('pointermove',6,9);await pointer('pointerup',6,9);assert.equal(center('jar').x,5);assert(document.querySelector('[role=status]').textContent.includes('не применено'))
 await mount({onMove:undefined});await pointer('pointerdown',5,10.5,entity('jar'));await pointer('pointermove',9,9);await pointer('pointerup',9,9);assert.equal(center('jar').x,5)
 await mount({onMove:()=>{throw Error('Should not commit stale scene')}});await pointer('pointerdown',5,10.5,entity('jar'));await pointer('pointermove',6,9);await mount({scene:{...props.scene,name:'Внешняя сцена'}});await pointer('pointerup',6,9);assert.equal(center('jar').x,5)
})

const view=()=>svg().getAttribute('viewBox').split(' ').map(Number)
const cameraButton=name=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent===name)
async function wheel(x,y,deltaY){let event;await flush(()=>{event=new dom.window.WheelEvent('wheel',{clientX:x*20,clientY:y*20,deltaY,bubbles:true,cancelable:true});svg().dispatchEvent(event)});return event}
async function mapKey(key,code){await flush(()=>svg().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,code,bubbles:true,cancelable:true})))}

test('Навигация схемы: масштаб под курсором, кнопки, вся сцена и фокус на целой группе без записей',async()=>{
 const desk=createEnvironmentObject('platform','expanded-object-desk','desk',{x:8,y:7,z:0}),stool=createEnvironmentObject('platform','expanded-object-stool','stool',{x:15,y:11,z:0});await fixture([desk,stool])
 const before=JSON.stringify(props.scene),old=view(),event=await wheel(8,7,-100),next=view();assert(event.defaultPrevented,'Wheel does not scroll the document');assert(next[2]<old[2]);assert(Math.abs(next[0]+8/30*next[2]-8)<1e-9);assert(Math.abs(next[1]+7/20*next[3]-7)<1e-9)
 await flush(()=>cameraButton('Приблизить схему').click());assert(view()[2]<next[2]);await mapKey('Home');assert.deepEqual(view(),[0,0,30,20])
 await mount({selections:[{kind:'object',id:'desk'},{kind:'object',id:'stool'}],selection:{kind:'object',id:'desk'}});await mapKey('f');const [x,y,w,h]=view();assert(x<=desk.x-desk.width/2&&x+w>=stool.x+stool.width/2);assert(y<=desk.y-desk.depth/2&&y+h>=stool.y+stool.depth/2)
 assert.equal(moves.length,0);assert.equal(selected.length,0);assert.equal(JSON.stringify(props.scene),before)
 await mount({scene:{...props.scene,id:'another-scene'}});assert.deepEqual(view(),[0,0,30,20],'New scene opens at its own full frame')
})
test('Навигация схемы: средняя кнопка и пробел двигают только вид, Esc возвращает исходный ракурс',async()=>{
 const desk=createEnvironmentObject('platform','expanded-object-desk','desk',{x:5,y:5,z:0});await fixture([desk]);await flush(()=>cameraButton('Приблизить схему').click());const original=view()
 await pointer('pointerdown',10,10,svg(),{button:1});await pointer('pointermove',12,11);await pointer('pointerup',12,11,svg(),{button:1});const panned=view();assert(panned[0]<original[0]&&panned[1]<original[1]);assert.equal(moves.length,0);assert.equal(selected.length,0)
 await mapKey(' ','Space');await pointer('pointerdown',5,5,entity('desk'));await pointer('pointermove',7,6);assert.notDeepEqual(view(),panned);await mapKey('Escape');assert.deepEqual(view(),panned);await pointer('pointerup',7,6);assert.equal(moves.length,0);assert.equal(selected.length,0)
 await flush(()=>window.dispatchEvent(new dom.window.KeyboardEvent('keyup',{key:' ',code:'Space'})));assert(!document.querySelector('.gb-map-pan-ready'))
})
test('Рамка на схеме: добавление к группе по фильтру, защищённые/скрытые слои, Shift-клик и отмена',async()=>{
 const make=(kind,slug,id,x)=>createEnvironmentObject(kind,'expanded-object-'+slug,id,{x,y:5,z:0}),desk=make('platform','desk','desk',5),stool=make('platform','stool','stool',8),hidden=make('crate','jar','hidden',6),protectedJar=make('crate','jar','protected',7),outside=make('crate','jar','outside',13)
 const floor={...createTabletopObject('floor-stone','floor',{x:7,y:5,z:0}),width:10,depth:10};const groups=[]
 await fixture([desk,stool,hidden,protectedJar,outside,floor],{onSelectMany:items=>groups.push(items),selections:[{kind:'object',id:'outside'}],selectionFilter:'props',editorHidden:['hidden'],editorProtected:['protected']})
 await pointer('pointerdown',4,4,svg(),{shiftKey:true});await pointer('pointermove',9,6,svg(),{shiftKey:true});assert(document.querySelector('.gb-schematic-marquee'));assert.equal(groups.length,0);await pointer('pointerup',9,6,svg(),{shiftKey:true});assert.deepEqual(new Set(groups[0].map(s=>s.id)),new Set(['outside','desk','stool']));assert.equal(moves.length,0);assert(!document.querySelector('.gb-schematic-marquee'))
 await pointer('pointerdown',5,5,entity('desk'),{shiftKey:true});await pointer('pointerup',5,5,svg(),{shiftKey:true});assert.equal(selected.at(-1).id,'desk','Shift click still toggles a single item')
 await pointer('pointerdown',4,4,svg(),{shiftKey:true});await pointer('pointermove',9,6,svg(),{shiftKey:true});await mapKey('Escape');await pointer('pointerup',9,6,svg(),{shiftKey:true});assert.equal(groups.length,1)
 await pointer('pointerdown',4,4,svg(),{shiftKey:true});await pointer('pointermove',9,6,svg(),{shiftKey:true});await mount({editorProtected:['desk']});await pointer('pointerup',9,6,svg(),{shiftKey:true});assert.equal(groups.length,1,'Changed protection cancels a pending frame')
 await flush(()=>cameraButton('Выделить рамкой').click());assert.equal(cameraButton('Выделить рамкой').getAttribute('aria-pressed'),'true');await pointer('pointerdown',4,4);await pointer('pointermove',9,6);await pointer('pointerup',9,6);assert.equal(groups.length,2);assert.equal(cameraButton('Выделить рамкой').getAttribute('aria-pressed'),'false','Frame button returns to direct dragging after one use')
})
test('Масштаб схемы: реальные координаты постановки и переноса сохраняются, колесо не меняет вид во время захвата',async()=>{
 const desk=createEnvironmentObject('platform','expanded-object-desk','desk',{x:8,y:8,z:0});let placed
 await fixture([],{selecting:false,onPoint:p=>placed=p});await flush(()=>cameraButton('Приблизить схему').click());let [x,y,w,h]=view();await pointer('pointerdown',10,10);assert(Math.abs(placed.x-(x+10/30*w))<1e-9);assert(Math.abs(placed.y-(y+10/20*h))<1e-9)
 await fixture([desk]);await flush(()=>cameraButton('Приблизить схему').click());[x,y,w,h]=view();const physical=(wx,wy)=>[(wx-x)*30/w,(wy-y)*20/h]
 await pointer('pointerdown',...physical(8,8),entity('desk'));const held=view();await wheel(8,8,-100);assert.deepEqual(view(),held,'Camera does not jump under a grabbed object');await pointer('pointermove',...physical(10,9));await pointer('pointerup',...physical(10,9));assert.equal(moves.length,1);assert(Math.abs(moves[0].p.x-10)<1e-9&&Math.abs(moves[0].p.y-9)<1e-9)
})

test('Схема: команда фокуса из списка использует текущее выделение и не меняет мир',async()=>{
 const desk=createEnvironmentObject('platform','expanded-object-desk','desk',{x:8,y:7,z:0}),stool=createEnvironmentObject('platform','expanded-object-stool','stool',{x:15,y:11,z:0});await fixture([desk,stool],{focusRequest:0})
 const before=JSON.stringify(props.scene);await mount({selection:{kind:'object',id:'desk'},selections:[{kind:'object',id:'desk'},{kind:'object',id:'stool'}]});assert.deepEqual(view(),[0,0,30,20],'Selection alone does not move camera')
 await mount({focusRequest:1});let [x,y,w,h]=view();assert(x<=desk.x-desk.width/2&&x+w>=stool.x+stool.width/2);assert(y<=desk.y-desk.depth/2&&y+h>=stool.y+stool.depth/2);assert(w<30)
 await mount({editorHidden:['stool'],focusRequest:2});assert(view()[2]<w,'Hidden members are excluded from the focused bounds');assert.equal(moves.length,0);assert.equal(selected.length,0);assert.equal(JSON.stringify(props.scene),before)
})

test('Предпросмотр группы на схеме: полный габарит у края, один показанный результат и разрешённые координаты',async()=>{
 const object={...createEnvironmentObject('crate','expanded-object-jar','copy-jar',{x:4,y:4,z:0}),width:1.3,depth:.7,height:.9},a=load('sceneAssemblies'),assembly=a.captureSceneAssembly({...createScene(emptyScenes(),'source','Источник','top').scenes[0],objects:[object]},[{kind:'object',id:object.id}],'Копия','clipboard')
 let placed;await fixture([],{selecting:false,placement:{assembly,facing:0,elevation:0},snapStep:1,onPoint:(p,o)=>{placed={p,o}}});const original=JSON.stringify(props.scene)
 await pointer('pointermove',29.99,19.99);let preview=document.querySelector('[data-placement-preview]');assert(preview);assert.equal(preview.getAttribute('data-valid'),'true');let r=preview.querySelector('rect');assert(Math.abs(Number(r.getAttribute('x'))+Number(r.getAttribute('width'))-30)<1e-9)
 await pointer('pointerdown',29.99,19.99);assert.deepEqual(placed,{p:{x:29.35,y:19.65,z:0},o:{surfaceId:null,resolved:true}});assert.equal(JSON.stringify(props.scene),original);assert.equal(moves.length,0)
 await mount({placement:{assembly,facing:90,elevation:2}});r=document.querySelector('[data-placement-preview] rect');assert.equal(Number(r.getAttribute('width')),.7);assert(document.querySelector('.gb-schematic-readout').textContent.includes('Z 2.000'))
 await pointer('pointerout',29.99,19.99);assert(!document.querySelector('[data-placement-preview]'));await pointer('pointermove',12,10);assert(document.querySelector('[data-placement-preview]'));await mount({placement:undefined});assert(!document.querySelector('[data-placement-preview]'))
})

test('Предпросмотр группы: масштаб, вид сбоку, отказ по высоте и лимиту, отмена потери фокуса',async()=>{
 const object={...createEnvironmentObject('crate','expanded-object-jar','copy-jar',{x:4,y:4,z:0}),width:1,depth:1,height:2},assembly=load('sceneAssemblies').captureSceneAssembly({...createScene(emptyScenes(),'source','Источник','top').scenes[0],objects:[object]},[{kind:'object',id:object.id}],'Копия','clipboard');let placed=0
 await fixture([],{selecting:false,placement:{assembly,facing:0,elevation:0},onPoint:()=>placed++});await pointer('pointermove',8,8);await wheel(8,8,-100);let r=document.querySelector('[data-placement-preview] rect');assert(Math.abs(Number(r.getAttribute('x'))+.5-8)<1e-8,'World anchor stays under the cursor after zoom')
 await mount({scene:{...props.scene,view:'side',maxZ:12}});r=document.querySelector('[data-placement-preview] rect');assert.equal(Number(r.getAttribute('y')),10);assert.equal(Number(r.getAttribute('height')),2)
 await mount({placement:{assembly,facing:0,elevation:11}});assert.equal(document.querySelector('[data-placement-preview]').getAttribute('data-valid'),'false');await pointer('pointerdown',8,8);assert.equal(placed,0)
 await mount({placement:{assembly,facing:0,elevation:0},scene:{...props.scene,view:'top',objects:Array.from({length:250},(_,i)=>({...object,id:'full-'+i}))}});assert.equal(document.querySelector('[data-placement-preview]').getAttribute('data-valid'),'false');assert(document.querySelector('.gb-schematic-readout').textContent.includes('250'));await pointer('pointerdown',8,8);assert.equal(placed,0)
 await flush(()=>window.dispatchEvent(new dom.window.Event('blur')));assert(!document.querySelector('[data-placement-preview]'))
})

const ObjectGlyph=load('SceneObjectGlyph').default,{renderToStaticMarkup}=require('react-dom/server')
function glyph(object,view='top'){
 const wrapper=document.createElement('div');wrapper.innerHTML=renderToStaticMarkup(React.createElement(ObjectGlyph,{object,view}));return wrapper.querySelector('svg')
}
const objectHit=id=>entity(id).querySelector('.gb-object-hit,.gb-object-selected')
test('Обозначения: все 32 модели каталога имеют рисунки сверху и сбоку без внешних ресурсов',()=>{
 const {tabletopAssets,isFloorAsset}=load('tabletopCatalog'),assets=tabletopAssets.filter(a=>!isFloorAsset(a.id));assert.equal(assets.length,32)
 for(const asset of assets)for(const view of ['top','side']){
  const object=createTabletopObject(asset.id,'glyph-'+asset.id,{x:5,y:5,z:0}),before=structuredClone(object),svg=glyph(object,view)
  assert.equal(svg.dataset.schematicAsset,asset.id);assert.equal(svg.dataset.schematicView,view);assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('pointer-events'),'none');assert(svg.querySelector('path,rect,circle,ellipse'));assert.equal(svg.querySelector('image,script,foreignObject,animate,filter'),null);assert.equal(svg.querySelector('[id]'),null);assert.deepEqual(object,before)
 }
})
test('Обозначения: мебель, посуда и свет различаются, прежние типы и неизвестная модель сохраняют запасной значок',()=>{
 const shapes=new Set(['table','chair','round-table','stool','mug','plate','bread','bench','bar','barrel','shelf','bed','rug','chest','candle'].map(asset=>glyph(createTabletopObject(asset,'sample',{x:5,y:5,z:0})).querySelector('g').innerHTML));assert.equal(shapes.size,15)
 const {sceneObject}=load('scenes'),LegacyGlyph=load('SceneViewport').SceneGlyph
 for(const kind of ['wall','door','tree','rock','crate','platform','lamp','water']){
  const object=sceneObject(kind,'old-'+kind,{x:5,y:5,z:0}),fallback=glyph(object);assert.equal(fallback.outerHTML,renderToStaticMarkup(React.createElement(LegacyGlyph,{kind,open:object.open})));assert.equal(glyph({...object,asset:'future-asset'}).outerHTML,fallback.outerHTML)
 }
 const wrong={...createTabletopObject('table','wrong',{x:5,y:5,z:0}),kind:'lamp'};assert.equal(glyph(wrong).dataset.schematicAsset,undefined)
})
test('Обозначения: огонь, двери, сундук и ловушки показывают переданное состояние в обоих видах',()=>{
 for(const view of ['top','side']){
  for(const asset of ['candle','brazier','fireplace','torch','chandelier','trap-fire']){
   const object=createTabletopObject(asset,'light',{x:5,y:5,z:0});assert(glyph({...object,active:true},view).querySelector('.gb-schematic-flame'));assert.equal(glyph({...object,active:false},view).querySelector('.gb-schematic-flame'),null);assert(glyph({...object,active:undefined},view).querySelector('.gb-schematic-flame'))
  }
  for(const asset of ['timber-door','dungeon-arch','chest']){const object=createTabletopObject(asset,'openable',{x:5,y:5,z:0});assert.notEqual(glyph({...object,open:true},view).innerHTML,glyph({...object,open:false},view).innerHTML)}
  for(const asset of ['trap-pit','trap-spikes']){const object=createTabletopObject(asset,'trap',{x:5,y:5,z:0});assert.notEqual(glyph({...object,active:true},view).innerHTML,glyph({...object,active:false},view).innerHTML)}
 }
})
test('Обозначения: поворот меняет план, боковой рисунок остаётся вертикальным; габариты и обычный выбор сохранены',async()=>{
 for(const facing of [0,90,180,270]){
  const chair=createTabletopObject('chair','chair',{x:5,y:5,z:.5},facing);await fixture([chair]);const before=JSON.stringify(props.scene),draw=entity(chair.id).querySelector('[data-schematic-asset]'),box=objectHit(chair.id)
  assert.equal(draw.querySelector('g').getAttribute('transform'),'rotate('+facing+' 8 8)');assert.equal(Number(box.getAttribute('width')),chair.width);assert.equal(Number(box.getAttribute('height')),chair.depth);assert.deepEqual(center(chair.id),{x:5,y:5});await pointer('pointerdown',5,5,entity(chair.id));await pointer('pointerup',5,5);assert.equal(selected.at(-1).id,chair.id);assert.equal(moves.length,0)
  await mount({scene:{...props.scene,view:'side',maxZ:12}});const side=entity(chair.id).querySelector('[data-schematic-asset]');assert.equal(side.dataset.schematicView,'side');assert(!/rotate/.test(side.querySelector('g').getAttribute('transform')??''));assert.equal(Number(objectHit(chair.id).getAttribute('height')),chair.height);assert.equal(Number(objectHit(chair.id).getAttribute('y')),12-chair.z-chair.height);assert.equal(JSON.stringify({...props.scene,view:'top'}),JSON.stringify({...JSON.parse(before),maxZ:12}))
 }
 for(const asset of ['plate','bread','mug']){const object=createTabletopObject(asset,'thin-'+asset,{x:5,y:5,z:1}),draw=glyph(object,'side'),ratio=object.height/.2,transform=draw.querySelector('g').getAttribute('transform'),values=transform.match(/translate\(0 ([^)]+)\) scale\(1 ([^)]+)\)/);assert(values);assert(Math.abs(Number(values[1])-16*(1-ratio))<1e-9);assert(Math.abs(Number(values[2])-ratio)<1e-9);assert.equal(glyph(object,'top').querySelector('g').getAttribute('transform'),'rotate(0 8 8)')}
})
test('Обозначения: пол и выбранные изображения сохраняют приоритет, скрытая модель не рисуется',async()=>{
 const floor={...createTabletopObject('floor-wood','floor',{x:5,y:5,z:0}),width:10,depth:10},table={...createTabletopObject('table','custom',{x:5,y:5,z:0}),artwork:'expanded-object-desk'},torch=createTabletopObject('torch','hidden-light',{x:8,y:5,z:0}),before=JSON.stringify([floor,table,torch]);await fixture([floor,table,torch],{editorHidden:[torch.id]})
 assert.equal(entity(floor.id).querySelector('[data-schematic-asset]'),null);assert.match(entity(floor.id).querySelector('rect').getAttribute('fill'),/floor-wood/);assert.equal(entity(table.id).querySelector('[data-schematic-asset]'),null);assert.equal(entity(table.id).querySelector('image').getAttribute('href'),load('visualMedia').artworkSource(table.artwork));assert.equal(entity(torch.id),null);assert.equal(JSON.stringify(props.scene.objects),before)
 await mount({scene:{...props.scene,objects:[floor,{...table,artwork:'auto'},torch]}});assert.equal(entity(table.id).querySelector('[data-schematic-asset]').dataset.schematicAsset,'table')
})
test('Обозначения: детали рисунка не обходят защиту и не меняют точку захвата объекта',async()=>{
 const chair=createTabletopObject('chair','protected-chair',{x:5,y:5,z:0});await fixture([chair],{editorProtected:[chair.id]});await pointer('pointerdown',5.1,5.1,entity(chair.id).querySelector('path'));await pointer('pointermove',7,6);await pointer('pointerup',7,6);assert.equal(selected.length,0);assert.equal(moves.length,0);assert.equal(entity(chair.id).querySelector('[data-schematic-asset]').dataset.schematicAsset,'chair')
 await mount({editorProtected:[]});await pointer('pointerdown',5.1,5.1,entity(chair.id).querySelector('path'));await pointer('pointermove',7.1,6.1);assert.equal(moves.length,0);assert(Math.abs(center(chair.id).x-7)<1e-6);await pointer('pointerup',7.1,6.1);assert.equal(moves.length,1);assert.deepEqual(moves[0].p,{x:7,y:6,z:0})
})
test('Обозначения: новая мебель и герой на опоре сохраняют общий перенос и исходник',async()=>{
 const table=createTabletopObject('table','new-table',{x:5,y:5,z:0}),cup=createTabletopObject('mug','new-cup',{x:5.3,y:5.1,z:table.height}),token={actorId:'rider',x:5,y:5,z:table.height,diameter:.4,support:{kind:'object',objectId:table.id}};await fixture([table,cup],{selections:[{kind:'object',id:table.id},{kind:'object',id:cup.id}]});await mount({scene:{...props.scene,tokens:[token]}});const before=JSON.stringify(props.scene)
 await pointer('pointerdown',5,5,entity(table.id));await pointer('pointermove',7,6);assert.equal(entity(table.id).querySelector('[data-schematic-asset]').dataset.schematicAsset,'table');assert.equal(entity(cup.id).querySelector('[data-schematic-asset]').dataset.schematicAsset,'mug');assert.deepEqual(center(table.id),{x:7,y:6});assert(Math.abs(center(cup.id).x-7.3)<1e-9);assert.equal(center(token.actorId).x,7);assert.equal(JSON.stringify(props.scene),before);await pointer('pointerup',7,6);assert.equal(moves.length,1);assert.equal(JSON.stringify(props.scene),before)
})
const PlayerMap=load('PerceivedScene').SvgPerceivedScene
function knownFixture(){
 const {preparePerception,emptyPerception,perceivedMap}=load('scenePerception'),state=createScene(emptyScenes(),'glyph-room','Комната','top'),scene=state.scenes[0],candle={...createTabletopObject('candle','known-candle',{x:5,y:5,z:0}),active:false},chest={...createTabletopObject('chest','known-chest',{x:8,y:5,z:0}),open:false},torch=createTabletopObject('torch','seen-torch',{x:12,y:5,z:0}),secret=createTabletopObject('trap-fire','secret-trap',{x:15,y:5,z:0});scene.objects=[candle,chest,torch,secret]
 const draft={activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Известная комната',description:'',areas:[{id:'known-area',x:0,y:0,z:0,width:scene.width,depth:scene.depth,height:scene.maxZ,visible:true}],objects:[{objectId:candle.id,visible:true},{objectId:chest.id,visible:true},{objectId:torch.id,visible:true}],contacts:[]}]}
 let known=preparePerception(draft,emptyPerception('viewer'),state,[]);draft.scenes[0].objects[0].visible=false;draft.scenes[0].objects[1].visible=false;known=preparePerception(draft,known,state,[]);scene.objects=scene.objects.map(o=>o.id===candle.id?{...o,active:true}:o.id===chest.id?{...o,open:true}:o)
 return {state,map:perceivedMap(known,state,[])}
}
test('Обозначения игрока: туман и последнее известное состояние сохраняются без раскрытия текущего огня',async()=>{
 await flush(()=>root.render(null));const {state,map}=knownFixture(),before=JSON.stringify(state);assert.equal(map.objects.length,3);assert.equal(map.objects.find(o=>o.id==='known-candle').active,false);assert.equal(map.objects.find(o=>o.id==='known-chest').open,false)
 for(const view of ['top','side']){await flush(()=>root.render(React.createElement(PlayerMap,{map:{...map,frame:{...map.frame,view}}})));assert.equal(document.querySelectorAll('.gb-game-object').length,3);assert.equal(document.querySelector('[data-schematic-asset="trap-fire"]'),null);const candle=document.querySelector('[data-schematic-asset="candle"]');assert.equal(candle.querySelector('.gb-schematic-flame'),null);assert.equal(candle.dataset.schematicView,view);assert(document.querySelector('[data-schematic-asset="torch"] .gb-schematic-flame'));assert(document.body.textContent.includes('последнее известное состояние'))}
 assert.equal(JSON.stringify(state),before)
})
test('Обозначения игрока: явные изображения, напольные узоры и действия с объектом не меняются',async()=>{
 await flush(()=>root.render(null));const {map}=knownFixture(),table={...createTabletopObject('table','player-custom',{x:5,y:5,z:0}),artwork:'expanded-object-desk',visible:true},floor={...createTabletopObject('floor-stone','player-floor',{x:10,y:10,z:0}),visible:true},clicked=[];const value={...map,objects:[table,floor]},before=JSON.stringify(value)
 await flush(()=>root.render(React.createElement(PlayerMap,{map:value,onObject:id=>clicked.push(id)})));const object=document.querySelector('[aria-label="Объект: '+table.name+'"]');assert(object);assert.equal(object.querySelector('[data-schematic-asset]'),null);assert.equal(object.querySelector('image').getAttribute('href'),load('visualMedia').artworkSource(table.artwork));assert.match(document.querySelector('[aria-label="Объект: '+floor.name+'"] rect[fill]').getAttribute('fill'),/floor-stone/)
 await flush(()=>object.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));assert.deepEqual(clicked,[table.id]);assert.equal(JSON.stringify(value),before)
})
