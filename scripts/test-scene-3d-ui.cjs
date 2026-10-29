const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const {pathToFileURL}=require('node:url')
const {JSDOM}=require('jsdom'),React=require('react'),{act}=React
const dom=new JSDOM('<div id="root"></div>',{url:'https://world6.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,
 requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
 ResizeObserver:class{observe(){}disconnect(){}}})
Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{get:()=>900})
Object.defineProperty(dom.window.HTMLElement.prototype,'clientHeight',{get:()=>600})
dom.window.HTMLElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width:900,height:600,right:900,bottom:600})
dom.window.HTMLElement.prototype.setPointerCapture=()=>{}
dom.window.HTMLElement.prototype.releasePointerCapture=()=>{}
const THREE=require('three'),instances=[]
class Renderer {
 constructor(){this.domElement=document.createElement('canvas');this.shadowMap={};this.disposed=false;this.frames=0;instances.push(this)}
 setPixelRatio(value){this.ratio=value}setClearColor(value){this.clearColor=new THREE.Color(value)}
 setSize(w,h){this.domElement.width=w;this.domElement.height=h}
 render(scene,camera){this.scene=scene;this.camera=camera;scene.updateMatrixWorld();camera.updateMatrixWorld();this.frames++}
 dispose(){this.disposed=true}
}
const cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'')
 if(name.endsWith('.css'))return {}
 if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name)
 const mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id==='three'?{...THREE,WebGLRenderer:Renderer}:id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports)
 return mod.exports
}
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'))
const Scene3D=load('Scene3D').default,{masterRenderModel,perceivedRenderModel}=load('scene3dModel')
const {create3DSandbox:makeSandbox}=load('sandboxCampaign'),create3DSandbox=namespace=>makeSandbox(namespace,{environment:'legacy'})
const flush=async fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,15))})
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})
let props
async function mount(patch={}){props={...props,...patch};await flush(()=>root.render(React.createElement(Scene3D,props)));await flush()}
function screenPoint(renderer,x,y,z){const p=new THREE.Vector3(x,z,y).project(renderer.camera);return {clientX:(p.x+1)*450,clientY:(1-p.y)*300}}
async function clickAt(renderer,p){await flush(()=>{for(const type of ['pointerdown','pointerup'])renderer.domElement.dispatchEvent(new dom.window.MouseEvent(type,{...p,button:0,bubbles:true}))})}

test('3D UI: настоящая геометрия и камера, выбор объекта, обратное преобразование земли, новые callbacks',async()=>{
 const {world}=create3DSandbox('ui'),scene=world.campaign.scenes.scenes[0],door=scene.objects.find(o=>o.kind==='door')
 let selected,point,oldCallback=0
 await mount({model:masterRenderModel(scene,world.characters),selecting:true,onSelect:s=>{selected=s},onPoint:p=>{point=p;oldCallback++}})
 const renderer=instances.at(-1);assert(renderer.scene);assert(document.querySelector('canvas[role=img]'));assert(document.querySelectorAll('.gb-3d-label').length>0)
 await clickAt(renderer,screenPoint(renderer,door.x,door.y,door.height*.6));assert.deepEqual(selected,{kind:'object',id:door.id})
 await mount({selecting:false,onPoint:p=>{point=p}});assert.equal(instances.at(-1),renderer,'Callback changes retain GPU resources')
 await clickAt(renderer,screenPoint(renderer,5.125,17.375,0));assert(Math.abs(point.x-5.125)<.002);assert(Math.abs(point.y-17.375)<.002);assert.equal(point.z,0);assert.equal(oldCallback,0)
 const frames=renderer.frames;await flush();assert.equal(renderer.frames,frames,'Idle scene has no perpetual render loop')
})
test('3D UI: маркер XYZ, переключение качества и освобождение старого рендера',async()=>{
 await mount({marker:{x:4,y:5,z:3}});let r=instances.at(-1)
 assert(r.scene.children.some(m=>m.geometry?.type==='TorusGeometry'&&m.position.x===4&&m.position.z===5&&Math.abs(m.position.y-3.06)<1e-6))
 const old=r,select=document.querySelector('[aria-label="Качество 3D"]')
 await flush(()=>{select.value='high';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});await flush()
 r=instances.at(-1);assert.notEqual(r,old);assert(old.disposed);assert.equal(document.querySelectorAll('canvas').length,1);assert(r.shadowMap.enabled)
})
test('3D UI: неизвестная территория не достраивается, раскрытые объекты обрезаются; потери контекста сообщаются',async()=>{
 const frame={id:'restricted',view:'top',width:30,depth:20,groundZ:0,minZ:-2,maxZ:10,palette:'stone'}
 const area={id:'known',x:1,y:1,z:-2,width:3,depth:3,height:10,visible:true}
 const map={frame,title:'Личная карта',description:'',areas:[area],contacts:[],objects:[{id:'revealed',kind:'wall',name:'Известная стена',x:3,y:3,z:0,width:4,depth:.5,height:3,open:false,visible:true}]}
 let unavailable=0;await mount({model:perceivedRenderModel(map),marker:null,onUnavailable:()=>unavailable++})
 const r=instances.at(-1),ground=r.scene.children.filter(m=>m.geometry?.type==='PlaneGeometry')
 assert.equal(ground.length,1);assert.equal(ground[0].geometry.parameters.width,3)
 let clipped=0;r.scene.traverse(m=>{if(m.isMesh&&m.material.clippingPlanes?.length===6)clipped++});assert(clipped>0)
 const light=r.scene.getObjectByProperty('isDirectionalLight',true);assert(!light.castShadow)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.Event('webglcontextlost',{cancelable:true})));assert.equal(unavailable,1)
 await flush(()=>root.render(null));assert(r.disposed);assert.equal(document.querySelectorAll('canvas,.gb-3d-label').length,0)
})

test('3D UI: виды камеры, фокус, перетаскивание с привязкой и отмена Escape',async()=>{
 const {world}=create3DSandbox('drag'),scene=world.campaign.scenes.scenes[0],crate=scene.objects.find(o=>o.kind==='crate')
 const moves=[];let points=0
 await mount({model:masterRenderModel(scene,world.characters),selection:{kind:'object',id:crate.id},marker:null,onPoint:()=>points++,onMove:(s,p)=>{moves.push({s,p});return true},snapStep:1})
 const r=instances.at(-1)
 const top=[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху');await flush(()=>top.click())
 const point=screenPoint(r,crate.x,crate.y,.6),end=screenPoint(r,crate.x+2,crate.y+1,.6)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{...point,button:0,bubbles:true})))
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...end,button:0,bubbles:true})))
 assert.equal(moves.length,0,'Dragging previews geometry without intermediate world writes')
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerup',{...end,button:0,bubbles:true})))
 assert.equal(moves.length,1);assert.deepEqual(moves[0].s,{kind:'object',id:crate.id});assert.deepEqual(moves[0].p,{x:9,y:16,z:0});assert.equal(points,0)
 await mount({model:masterRenderModel(scene,world.characters)})
 const next=instances.at(-1);await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click())
 const start=screenPoint(next,crate.x,crate.y,.6),finish=screenPoint(next,crate.x+2,crate.y+1,.6)
 await flush(()=>{next.domElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{...start,button:0,bubbles:true}));next.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...finish,button:0,bubbles:true}))})
 await flush(()=>next.domElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
 assert.equal(moves.length,1)
 const group=next.scene.children.find(g=>g.userData.selection?.id===crate.id);assert.equal(group.position.x,crate.x)
 await flush(()=>next.domElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'f',bubbles:true})))
 assert(Math.abs(next.camera.position.x-crate.x)<.1)
 next.domElement.focus();await mount({selection:null});assert.equal(document.activeElement,instances.at(-1).domElement,'Selection rebuild retains keyboard focus')
})
test('3D-модели: детали, габариты, экономный режим и нераскрытая высота',()=>{
 const {populateEntityModel}=load('scene3dMeshes')
 for(const kind of ['actor','tree','rock','wall','door','crate','platform','lamp','water']){
  const e={geometry:{kind,width:2,depth:2,height:2},appearance:{color:'#789abc',heightKnown:true}}
  const build=low=>{const group=new THREE.Group();populateEntityModel(e,(geometry,color,x,y,z)=>{const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color}));m.position.set(x,y,z);group.add(m);return m},low);return group}
  const rich=build(false),low=build(true),bounds=new THREE.Box3().setFromObject(rich)
  assert(bounds.min.x>=-1.001&&bounds.max.x<=1.001,kind+' width');assert(bounds.min.z>=-1.001&&bounds.max.z<=1.001,kind+' depth')
  assert(bounds.min.y>=-.001&&bounds.max.y<=2.001,kind+' height');assert(rich.children.length>=low.children.length,kind)
  for(const group of [rich,low])group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose()}})
 }
 const e={geometry:{kind:'actor',width:1,depth:1,height:1.7},appearance:{color:'#aaa',heightKnown:false}},parts=[]
 populateEntityModel(e,(g,c,x,y,z)=>{const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:c}));m.position.set(x,y,z);parts.push(m);return m})
 assert.equal(parts.length,1,'Unknown height remains a flat footprint')
 parts.forEach(m=>{m.geometry.dispose();m.material.dispose()})
})

test('Прямой захват: первый жест, стабильный renderer при выделении, одна команда на отпускании',async()=>{
 const {world}=create3DSandbox('direct'),scene=world.campaign.scenes.scenes[0],crate=scene.objects.find(o=>o.kind==='crate')
 let selected=null;const moves=[]
 await mount({model:masterRenderModel(scene,world.characters),selection:null,selecting:true,marker:null,snapStep:1,onSelect:s=>{selected=s},onMove:(s,p)=>{moves.push({s,p});return true}})
 const r=instances.at(-1);await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click())
 const start=screenPoint(r,crate.x,crate.y,.6),end=screenPoint(r,crate.x+2,crate.y+1,.6)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{...start,button:0,bubbles:true})))
 assert.deepEqual(selected,{kind:'object',id:crate.id});assert.equal(r.domElement.style.cursor,'grabbing')
 await mount({selection:selected})
 assert.equal(instances.at(-1),r,'Selection updates preserve renderer and pointer capture');assert(!r.disposed);assert(r.domElement.isConnected)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...end,button:0,bubbles:true})))
 assert.equal(moves.length,0)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerup',{...end,button:0,bubbles:true})))
 assert.equal(moves.length,1);assert.deepEqual(moves[0].p,{x:9,y:16,z:0})
 const tree=scene.objects.find(o=>o.kind==='tree'),treeAt=screenPoint(r,tree.x,tree.y,2)
 await clickAt(r,treeAt);assert.deepEqual(selected,{kind:'object',id:tree.id});assert.equal(moves.length,1,'Clicking alone never writes')
})
test('Прямой захват: Alt оставляет камеру, отказ и потеря фокуса возвращают исходную позицию',async()=>{
 const {world}=create3DSandbox('cancel'),scene=world.campaign.scenes.scenes[0],crate=scene.objects.find(o=>o.kind==='crate')
 let moves=0,selections=0
 await mount({model:masterRenderModel(scene,world.characters),selection:null,snapStep:undefined,onSelect:()=>selections++,onMove:()=>{moves++;return false}})
 const r=instances.at(-1);await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click())
 const start=screenPoint(r,crate.x,crate.y,.6),end=screenPoint(r,crate.x+1,crate.y+1,.6)
 await flush(()=>{r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{...start,button:0,altKey:true,bubbles:true}));r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerup',{...start,button:0,altKey:true,bubbles:true}))})
 assert.equal(moves,0);assert.equal(selections,0)
 const group=r.scene.children.find(g=>g.userData.selection?.id===crate.id)
 async function drag(){await flush(()=>{r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{...start,button:0,bubbles:true}));r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...end,button:0,bubbles:true}))})}
 await drag();assert.notEqual(group.position.x,crate.x)
 await flush(()=>window.dispatchEvent(new dom.window.Event('blur')))
 assert.equal(moves,0);assert.equal(group.position.x,crate.x)
 await drag();await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerup',{...end,button:0,bubbles:true})))
 assert.equal(moves,1);assert.equal(group.position.x,crate.x);assert.equal(group.position.z,crate.y)
})

test('Свет и геометрия: экспозиция без пересоздания canvas, ночной фонарь, нейтральный вид',async()=>{
 const {world}=create3DSandbox('lighting'),scene=world.campaign.scenes.scenes[0]
 await mount({model:masterRenderModel(scene,world.characters),selection:null,onMove:undefined})
 let renderer=instances.at(-1)
 const exposure=document.querySelector('[aria-label="Экспозиция 3D"]'),before=renderer.toneMappingExposure
 await flush(()=>{
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(exposure,'1.35')
  exposure.dispatchEvent(new dom.window.Event('input',{bubbles:true}));exposure.dispatchEvent(new dom.window.Event('change',{bubbles:true}))
 })
 assert.equal(instances.at(-1),renderer,'Exposure does not allocate another renderer')
 assert(renderer.toneMappingExposure>before)
 const light=document.querySelector('[aria-label="Освещение 3D"]')
 const original=renderer,camera=renderer.camera.position.clone()
 await flush(()=>{light.value='night';light.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});await flush()
 renderer=instances.at(-1);assert(renderer.scene.getObjectByProperty('isPointLight',true),'Lantern illuminates the night scene')
 assert.equal(renderer,original,'Light preset changes retain renderer and geometry');assert(renderer.camera.position.equals(camera))
 const clay=[...document.querySelectorAll('label')].find(l=>l.textContent===' Без текстур').querySelector('input')
 await flush(()=>clay.click());await flush()
 renderer=instances.at(-1)
 renderer.scene.traverse(o=>{if(o.isMesh&&!o.userData.skyBackground){for(const material of Array.isArray(o.material)?o.material:[o.material])assert.equal(material.map,null)}})
 await flush(()=>{const select=document.querySelector('[aria-label="Освещение 3D"]');select.value='studio';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});await flush()
 assert(!instances.at(-1).scene.getObjectByProperty('isPointLight',true),'Working light excludes coloured local lamps')
})

test('Настройка света: живые регуляторы сохраняют камеру и выделение, восстанавливаются после открытия',async()=>{
 const {world}=create3DSandbox('live-light'),scene=world.campaign.scenes.scenes[0],crate=scene.objects.find(o=>o.kind==='crate')
 await mount({model:masterRenderModel(scene,world.characters),selection:{kind:'object',id:crate.id}})
 const renderer=instances.at(-1),camera=renderer.camera.position.clone(),key=renderer.scene.getObjectByProperty('isDirectionalLight',true)
 const group=renderer.scene.children.find(g=>g.userData.selection?.id===crate.id),geometry=group.children[0].geometry
 async function range(label,value){await flush(()=>{const input=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
 const before=key.position.clone();await range('Азимут света',125);await range('Высота света',25);await range('Яркость основного света',.65);await range('Заполняющий свет',.4)
 assert.equal(instances.at(-1),renderer);assert(renderer.camera.position.equals(camera));assert.equal(group.children[0].geometry,geometry)
 assert(!key.position.equals(before));assert.equal(key.intensity,3.1*.65)
 const shadowRadius=key.shadow.radius;await range('Мягкость теней',1.8);await range('Контактные тени',.35)
 assert.equal(instances.at(-1),renderer);assert(Math.abs(key.shadow.radius-shadowRadius*1.8)<.000001)
 assert(renderer.scene.getObjectByProperty('type','BoxHelper'),'Selection overlay survives light changes')
 await flush(()=>{const select=document.querySelector('[aria-label="Освещение 3D"]');select.value='night';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 await range('Яркость фонарей',0);assert(!renderer.scene.getObjectByProperty('isPointLight',true))
 await range('Яркость фонарей',1.5);assert.equal(renderer.scene.getObjectByProperty('isPointLight',true).intensity,57)
 await range('Азимут света',125);await range('Экспозиция 3D',1.25)
 await flush(()=>root.render(null));await mount()
 assert.equal(document.querySelector('[aria-label="Освещение 3D"]').value,'night')
 assert.equal(document.querySelector('[aria-label="Азимут света"]').value,'125')
 assert.equal(document.querySelector('[aria-label="Яркость фонарей"]').value,'1.5')
 assert.equal(document.querySelector('[aria-label="Экспозиция 3D"]').value,'1.25')
 // The preset resets shadow defaults; later adjustments survive a reload.
 assert.equal(document.querySelector('[aria-label="Мягкость теней"]').value,'1')
 assert.equal(document.querySelector('[aria-label="Контактные тени"]').value,'0.55')
 await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сбросить свет').click())
 assert.equal(document.querySelector('[aria-label="Азимут света"]').value,'315');assert.equal(document.querySelector('[aria-label="Экспозиция 3D"]').value,'1')
})

test('Игровой стол: ортография, обзор интерьера и кисть перехватывают жест без пересоздания canvas',async()=>{
 await flush(()=>root.render(null));props={}
 const scene=load('tabletopShowcase').createTavernScene();scene.tokens=[]
 scene.objects=scene.objects.filter(o=>['timber-wall','floor-wood','table'].includes(o.asset))
 const strokes=[],moves=[]
 await mount({model:masterRenderModel(scene,[]),selecting:false,selection:null,brush:{asset:'floor-stone',size:1},onPaintStroke:p=>strokes.push(p),onMove:(s,p)=>moves.push(p)})
 let r=instances.at(-1);assert(r.camera.isOrthographicCamera);assert.equal(document.querySelectorAll('.gb-3d-label').length,0)
 const walls=r.scene.children.filter(g=>g.userData.cutawayWall);assert(walls.some(g=>g.scale.y<1))
 const check=text=>[...document.querySelectorAll('label')].find(l=>l.textContent.includes(text)).querySelector('input')
 await flush(()=>check('Обзор интерьера').click());assert.equal(instances.at(-1),r);assert(walls.every(g=>g.scale.y===1))
 await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click())
 const start=screenPoint(r,3.2,7.2,0),end=screenPoint(r,9.2,7.2,0)
 const fire=async(type,p=start,extra={})=>flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent(type,{...p,button:0,bubbles:true,cancelable:true,...extra})))
 await fire('pointerdown');await fire('pointermove',end);assert.equal(strokes.length,0);assert.equal(moves.length,0)
 const preview=r.scene.children.find(g=>g.isInstancedMesh);assert.equal(preview.count,4)
 await fire('pointerup',end);assert.equal(strokes.length,1);assert.equal(strokes[0].length,4);assert.equal(preview.count,0)
 await fire('pointerdown');await fire('pointermove',end);await flush(()=>r.domElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await fire('pointerup',end);assert.equal(strokes.length,1)
 await fire('pointerdown');await flush(()=>window.dispatchEvent(new dom.window.Event('blur')));await fire('pointerup');assert.equal(strokes.length,1)
 await fire('pointerdown',start,{altKey:true});await fire('pointerup',start,{altKey:true});assert.equal(strokes.length,1)
 const position=r.camera.position.clone(),old=r;await flush(()=>check('Ортографическая камера').click());await flush();r=instances.at(-1)
 assert(old.disposed);assert(r.camera.isPerspectiveCamera);assert(r.camera.position.distanceTo(position)<.001)
 await mount({brush:undefined,onPaintStroke:undefined,onMove:undefined})
})

test('Перенос обновляет трансформацию без пересоздания рендера; ось Z меняет только высоту',async()=>{
 const {world}=create3DSandbox('axis'),scene=world.campaign.scenes.scenes[0],source={...scene.objects.find(o=>o.kind==='crate'),x:10,y:10,z:1}
 scene.objects=[source];scene.tokens=[];let move
 await mount({model:masterRenderModel(scene,[]),selection:{kind:'object',id:source.id},gizmo:true,onMove:(s,p)=>{move={s,p};return true},onRequestMove:undefined,brush:undefined,placement:undefined,marker:null,route:undefined,snapStep:undefined})
 const renderer=instances.at(-1),group=renderer.scene.children.find(g=>g.userData.selection?.id===source.id),axes=renderer.scene.children.find(g=>g.children.some(c=>c.type==='ArrowHelper'))
 assert(axes.visible);const size=axes.scale.x,grab=screenPoint(renderer,group.position.x,group.position.z,group.position.y+.08+size*.8),to=screenPoint(renderer,group.position.x,group.position.z,group.position.y+1.08+size*.8)
 await flush(()=>renderer.domElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{...grab,button:0,bubbles:true})))
 await flush(()=>renderer.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...to,button:0,bubbles:true})))
 await flush(()=>renderer.domElement.dispatchEvent(new dom.window.MouseEvent('pointerup',{...to,button:0,bubbles:true})))
 assert(move,'Axis drag emits a command');assert(Math.abs(move.p.x-source.x)<.001);assert(Math.abs(move.p.y-source.y)<.001);assert(Math.abs(move.p.z-(source.z+1))<.01)
 const moved=structuredClone(scene);moved.objects[0].x+=2;moved.objects[0].z+=1
 await mount({model:masterRenderModel(moved,[])});assert.equal(instances.at(-1),renderer,'Position-only updates retain scene meshes, camera and canvas');assert.equal(group.position.x,source.x+2);assert.equal(group.position.y,source.z+1)
 await mount({gizmo:false});assert.equal(instances.at(-1),renderer);assert(!axes.visible)
})
test('Игрок перетаскивает видимую мебель в черновик; схема мира и запомненные объекты не меняются',async()=>{
 const {world}=create3DSandbox('request'),scene=world.campaign.scenes.scenes[0],o={...scene.objects.find(o=>o.kind==='crate'),x:10,y:10,z:0};let requests=[]
 const model={...masterRenderModel({...scene,objects:[o],tokens:[]},[]),restricted:true}
 await mount({model,selection:{kind:'object',id:o.id},gizmo:false,onMove:undefined,onRequestMove:(s,p)=>{requests.push({s,p});return true},brush:undefined,marker:null,route:undefined,snapStep:undefined})
 const renderer=instances.at(-1),group=renderer.scene.children.find(g=>g.userData.selection?.id===o.id),origin=group.position.clone(),from=screenPoint(renderer,o.x,o.y,o.height*.6),to={clientX:from.clientX+65,clientY:from.clientY+15}
 async function drag(r){await flush(()=>{for(const [type,p] of [['pointerdown',from],['pointermove',to],['pointerup',to]])r.domElement.dispatchEvent(new dom.window.MouseEvent(type,{...p,button:0,bubbles:true}))})}
 await drag(renderer);assert.equal(requests.length,1);assert.equal(requests[0].s.id,o.id);assert(group.position.equals(origin),'Preview returns to authoritative position after queuing an intent')
 const remembered=structuredClone(model);remembered.entities[0].appearance.remembered=true;requests=[];await mount({model:remembered});await drag(instances.at(-1));assert.equal(requests.length,0)
})

test('Групповой захват: один callback, одинаковый сдвиг двух объектов и несомого героя, отмена всей группы',async()=>{
 const {world}=create3DSandbox('multi-drag'),scene=world.campaign.scenes.scenes[0],one={...scene.objects.find(o=>o.kind==='crate'),id:'one',x:8,y:8,z:0},two={...one,id:'two',x:12};scene.objects=[one,two];scene.tokens=[{actorId:'carried',x:8,y:8,z:one.height,diameter:.5,support:{kind:'object',objectId:'one'}}]
 const picks=[{kind:'object',id:'one'},{kind:'object',id:'two'}],moves=[]
 await mount({model:masterRenderModel(scene,[]),selection:picks[0],selections:picks,selecting:true,marker:null,route:undefined,snapStep:undefined,selectionFilter:'all',onSelectMany:undefined,gizmo:false,brush:undefined,placement:undefined,onRequestMove:undefined,onMove:(s,p)=>{moves.push({s,p});return false}})
 const r=instances.at(-1);await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click());const groups=r.scene.children.filter(g=>g.userData.selection),origins=groups.map(g=>g.position.clone()),from=screenPoint(r,8+one.width*.4,8,one.height),to=screenPoint(r,10+one.width*.4,9,one.height)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{...from,button:0,bubbles:true})));await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...to,button:0,bubbles:true})))
 assert.equal(moves.length,0);groups.forEach((g,i)=>{assert(Math.abs(g.position.x-origins[i].x-2)<.01,JSON.stringify({id:g.userData.selection,from:origins[i],to:g.position}));assert(Math.abs(g.position.z-origins[i].z-1)<.01)})
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerup',{...to,button:0,bubbles:true})));assert.equal(moves.length,1);groups.forEach((g,i)=>assert(g.position.equals(origins[i])));assert.equal(r.scene.children.filter(g=>g.type==='BoxHelper').length,2)
})
test('Рамка: Shift выбирает мебель без пола и камеры; Escape отменяет жест',async()=>{
 const {world}=create3DSandbox('marquee'),scene=world.campaign.scenes.scenes[0],one={...scene.objects.find(o=>o.kind==='crate'),id:'one',x:8,y:8,z:0},two={...one,id:'two',x:12},floor={...scene.objects.find(o=>o.kind==='platform')??one,id:'floor',kind:'platform',x:10,y:8,z:0,width:8,depth:4,height:.05}
 scene.objects=[one,two,floor];scene.tokens=[];let result=null
 await mount({model:masterRenderModel(scene,[]),selection:null,selections:[],selecting:true,marker:null,route:undefined,snapStep:undefined,selectionFilter:'props',gizmo:false,onMove:undefined,onSelectMany:items=>{result=items},onSelect:()=>{},brush:undefined})
 const r=instances.at(-1);await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click());const a=screenPoint(r,7,7,one.height/2),b=screenPoint(r,13,9,one.height/2),camera=r.camera.position.clone()
 const gesture=async(cancel=false)=>{await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{...a,button:0,shiftKey:true,bubbles:true})));await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...b,button:0,shiftKey:true,bubbles:true})));if(cancel)await flush(()=>r.domElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));else await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerup',{...b,button:0,shiftKey:true,bubbles:true})))}
 await gesture();assert.deepEqual(result.map(s=>s.id).sort(),['one','two'],JSON.stringify({a,b,objects:r.scene.children.filter(g=>g.userData.selection).map(g=>{const p=new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());return {id:g.userData.selection,world:p,screen:screenPoint(r,p.x,p.z,p.y)}})}));assert(r.camera.position.equals(camera));assert(document.querySelector('.gb-selection-marquee').hidden)
 result=null;await gesture(true);assert.equal(result,null)
})
test('Живой огонь: кадры без повторного расчёта теней, пауза скрытой вкладки и выключение',async()=>{
 const {createTabletopObject}=load('tabletopCatalog'),{world}=create3DSandbox('motion'),scene=world.campaign.scenes.scenes[0];scene.objects=[createTabletopObject('candle','candle',{x:10,y:8,z:0})];scene.tokens=[]
 const previous=document.visibilityState;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})
 try{
  await mount({model:masterRenderModel(scene,[]),selection:null,selections:[],onSelectMany:undefined,selectionFilter:'all',onMove:undefined});const r=instances.at(-1),checkbox=[...document.querySelectorAll('label')].find(l=>l.textContent===' Живой огонь').querySelector('input')
  if(!checkbox.checked)await flush(()=>checkbox.click());const frames=r.frames;r.shadowMap.needsUpdate=false
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,130))});assert(r.frames>frames);assert.equal(r.shadowMap.needsUpdate,false)
  Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});await flush(()=>document.dispatchEvent(new dom.window.Event('visibilitychange')));const paused=r.frames;await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100))});assert.equal(r.frames,paused)
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});await flush(()=>document.dispatchEvent(new dom.window.Event('visibilitychange')));await flush(()=>checkbox.click());const stopped=r.frames;await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100))});assert.equal(r.frames,stopped)
  await flush(()=>checkbox.click());await mount({editorHidden:['candle']});const hidden=r.frames;await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100))});assert.equal(r.frames,hidden,'Hiding the only flame stops animation work')
  await mount({editorHidden:[]});const resumed=r.frames;await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100))});assert(r.frames>resumed,'Showing a flame resumes animation')
 }finally{Object.defineProperty(document,'visibilityState',{value:previous,configurable:true})}
})
test('3D-размещение: предпросмотр совпадает с кликом на столе, магнит отключается, тесная высота отмечается',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),scene=createScene(emptyScenes(),'surface-ui','Поверхности','top').scenes[0]
 const table=createTabletopObject('table','table',{x:8,y:8,z:0});scene.objects=[table];let placed
 const placement={asset:'candle',facing:0,surfaceSnap:true,surfaces:scene.objects}
 await mount({model:masterRenderModel(scene,[]),selecting:false,placement,snapStep:.25,onPoint:(point,options)=>{placed={point,options}}})
 let r=instances.at(-1),at=screenPoint(r,8,8,table.height)
 const move=async(p)=>flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...p,button:0,bubbles:true})))
 await move(at)
 let ghost=r.scene.children.find(g=>g.userData.placementGhost)
 assert(ghost.visible);assert.equal(ghost.position.y,.98);assert.equal(ghost.position.x,8);assert.equal(ghost.position.z,8)
 await clickAt(r,at);assert.equal(placed.point.z,.98);assert.equal(placed.point.x,ghost.position.x);assert.equal(placed.point.y,ghost.position.z);assert.equal(placed.options.surfaceId,table.id)
 await mount({placement:{...placement,surfaceSnap:false}});assert.equal(instances.at(-1),r)
 at=screenPoint(r,8,8,0);await move(at);await clickAt(r,at);assert.equal(placed.point.z,0);assert.equal(placed.options.surfaceId,null)
 await mount({model:masterRenderModel({...scene,maxZ:1.3},[]),placement});r=instances.at(-1);at=screenPoint(r,8,8,.98);await move(at)
 ghost=r.scene.children.find(g=>g.userData.placementGhost);assert(ghost.visible);ghost.traverse(m=>{if(m.isMesh)assert.equal(m.material.color.getHexString(),'ef8f7b')});assert(document.body.textContent.includes('Недостаточно места по высоте'))
})
test('3D-сборка: реальные меши предпросмотра, поворот без нового renderer и совпадение координат клика',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),{captureSceneAssembly}=load('sceneAssemblies')
 const scene=createScene(emptyScenes(),'assembly-ui','Сборка','top').scenes[0],source={...scene,objects:[createTabletopObject('table','table',{x:5,y:5,z:0}),createTabletopObject('chair','chair',{x:5,y:6.1,z:0}),createTabletopObject('candle','candle',{x:5,y:5,z:.98})]}
 const assembly=captureSceneAssembly(source,source.objects.map(o=>({kind:'object',id:o.id})),'Место у огня','assembly');let placed
 await mount({model:masterRenderModel(scene,[]),selecting:false,placement:{assembly,facing:0,elevation:1},snapStep:.5,onPoint:p=>{placed=p}})
 const r=instances.at(-1),at=screenPoint(r,10.1,9.9,1)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...at,button:0,bubbles:true})))
 const ghost=r.scene.children.find(g=>g.userData.placementGhost);assert(ghost.visible);assert.deepEqual(ghost.position.toArray(),[10,1,10]);assert.equal(ghost.children.length,3)
 const meshes=[];ghost.traverse(m=>{if(m.isMesh)meshes.push(m)});assert(meshes.length>10,'Preview contains the source model geometry')
 await clickAt(r,at);assert.deepEqual(placed,{x:10,y:10,z:1})
 await mount({placement:{assembly,facing:90,elevation:1}});assert.equal(instances.at(-1),r);assert(ghost.visible,'R updates the visible ghost without another mouse movement')
 assert.equal(ghost.userData.width,assembly.depth);assert.equal(ghost.userData.depth,assembly.width)
 const table=ghost.children[0];assert.equal(table.rotation.y,-Math.PI/2)
})
test('3D-слои: скрытие и защита сохраняют renderer; скрытая крыша не возвращается после поворота камеры',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),scene=createScene(emptyScenes(),'layers-ui','Слои','top').scenes[0]
 const table=createTabletopObject('table','table',{x:8,y:8,z:0}),roof=createTabletopObject('roof-tile','roof',{x:8,y:8,z:3});scene.objects=[table,roof];let selected=null,moves=0
 await mount({model:masterRenderModel(scene,[]),selection:{kind:'object',id:'table'},selections:[{kind:'object',id:'table'}],gizmo:true,selecting:true,onSelect:s=>{selected=s},onMove:()=>{moves++},editorProtected:[],editorHidden:[]})
 const r=instances.at(-1),group=r.scene.children.find(g=>g.userData.selection?.id==='table'),roofGroup=r.scene.children.find(g=>g.userData.selection?.id==='roof')
 await mount({editorProtected:['table']});assert.equal(instances.at(-1),r)
 await clickAt(r,screenPoint(r,8,8,.98));assert.equal(selected,null);assert.equal(moves,0)
 await mount({editorHidden:['table']});assert.equal(instances.at(-1),r);assert.equal(group.visible,false);assert.equal(r.scene.children.filter(g=>g.type==='BoxHelper').length,0)
 const cutaway=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Обзор интерьера')).querySelector('input');await flush(()=>cutaway.click())
 await mount({editorHidden:['roof'],editorProtected:[]});assert(roofGroup.visible===false&&group.visible===true)
 await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click());assert.equal(roofGroup.visible,false)
 await mount({editorHidden:[]});assert.equal(roofGroup.visible,true);assert.equal(scene.objects.length,2)
})
test('3D-перенос на поверхность: захват со смещением, герой на сундуке, одна команда, Escape и снятие на землю',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes,moveSceneObject}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),state=createScene(emptyScenes(),'surface-drag','Перенос','top'),scene=state.scenes[0]
 const source={...createTabletopObject('chest','chest',{x:5,y:5,z:0}),width:.6,depth:.4,height:.3,canSupport:true},table=createTabletopObject('table','table',{x:12,y:10,z:0})
 scene.objects=[source,table];scene.tokens=[{actorId:'hero',x:4.85,y:5,z:.3,diameter:.1,support:{kind:'object',objectId:source.id}}]
 const moves=[];await mount({model:masterRenderModel(scene,[]),selection:{kind:'object',id:source.id},selections:[{kind:'object',id:source.id}],selecting:true,moveSurfaces:scene.objects,onMove:(s,p,options)=>{moves.push({s,p,options});return true}})
 const r=instances.at(-1),group=r.scene.children.find(g=>g.userData.selection?.id===source.id),hero=r.scene.children.find(g=>g.userData.selection?.id==='hero'),heroOrigin=hero.position.clone()
 const fire=async(type,p)=>flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent(type,{...p,button:0,bubbles:true})))
 function grabAt(object,target){
  const from=screenPoint(r,object.x+.2,object.y,object.z+.2),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(from.clientX/450-1,1-from.clientY/300),r.camera)
  const hit=ray.intersectObject(group,true)[0];assert(hit,'The real mesh must be grabbed')
  const offset=hit.point.clone().sub(group.position)
  return {from,to:screenPoint(r,target.x+offset.x,target.y+offset.z,target.z+offset.y)}
 }
 const first=grabAt(source,{x:12,y:10,z:table.height})
 await fire('pointerdown',first.from);await fire('pointermove',first.to)
 assert.equal(moves.length,0);assert(Math.abs(group.position.x-12)<1e-6);assert(Math.abs(group.position.z-10)<1e-6);assert.equal(group.position.y,.98)
 assert(Math.abs(hero.position.x-(heroOrigin.x+7))<1e-6);assert.equal(hero.position.y,heroOrigin.y+.98)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert(group.position.equals(new THREE.Vector3(5,0,5)));assert(hero.position.equals(heroOrigin));assert.equal(moves.length,0)
 await fire('pointerdown',first.from);await fire('pointermove',first.to);await fire('pointerup',first.to)
 assert.equal(moves.length,1);assert.equal(moves[0].options.surfaceId,table.id);assert(Math.abs(moves[0].p.x-12)<1e-6);assert.equal(moves[0].p.z,.98)
 const moved=moveSceneObject(state,scene.id,{...source,...moves[0].p}).scenes[0]
 await mount({model:masterRenderModel(moved,[]),moveSurfaces:moved.objects});assert.equal(instances.at(-1),r,'Surface moves preserve renderer and camera')
 const second=grabAt(moved.objects[0],{x:18,y:12,z:0});await fire('pointerdown',second.from);await fire('pointermove',second.to);await fire('pointerup',second.to)
 assert.equal(moves.length,2);assert.equal(moves[1].options.surfaceId,null);assert.equal(moves[1].p.z,0);assert(Math.abs(moves[1].p.x-18)<1e-6)
})
test('3D-поверхности: тесная высота отменяет весь перенос; группа сохраняет общий сдвиг и высоту',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),scene=createScene(emptyScenes(),'surface-reject','Границы','top').scenes[0]
 scene.maxZ=1.2
 const source={...createTabletopObject('chest','chest',{x:5,y:5,z:0}),width:.6,depth:.4,height:.3},table=createTabletopObject('table','table',{x:12,y:10,z:0}),other={...source,id:'other',x:6,y:5}
 scene.objects=[source,table,other];const moves=[]
 await mount({model:masterRenderModel(scene,[]),selection:{kind:'object',id:source.id},selections:[{kind:'object',id:source.id}],selecting:true,moveSurfaces:scene.objects,onMove:(s,p,options)=>{moves.push({s,p,options});return true}})
 const r=instances.at(-1);await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click())
 const group=r.scene.children.find(g=>g.userData.selection?.id===source.id),from=screenPoint(r,5,5,.3),to=screenPoint(r,12,10,1.28)
 const fire=async(type,p)=>flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent(type,{...p,button:0,bubbles:true})))
 await fire('pointerdown',from);await fire('pointermove',to);assert.equal(group.position.y,.98);assert(document.body.textContent.includes('Нет места над поверхностью'))
 await fire('pointerup',to);assert.equal(moves.length,0);assert.equal(group.position.y,0);assert.equal(group.position.x,5)
 await mount({selections:[{kind:'object',id:source.id},{kind:'object',id:other.id}]})
 await fire('pointerdown',from);await fire('pointermove',to);await fire('pointerup',to)
 assert.equal(moves.length,1);assert.equal(moves[0].options,undefined);assert.equal(moves[0].p.z,0,'Groups retain height instead of snapping each member independently')
 const neighbor=r.scene.children.find(g=>g.userData.selection?.id===other.id);assert.equal(neighbor.position.x-group.position.x,1);assert.equal(neighbor.position.y,0)
})
test('3D-референс: восстановление ракурса, света и интерьера после изменения вида; дальняя стена остаётся целой',async()=>{
 await flush(()=>root.render(null));props={}
 const {createVideoTavernScene,tavernReferenceShot}=load('tavernReference'),scene=createVideoTavernScene(['a','b','c','d'])
 await mount({model:masterRenderModel(scene,[]),selection:null,selections:[],editorHidden:[],editorProtected:[],selecting:true})
 const press=async text=>flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click())
 await press('Сверху')
 const lighting=document.querySelector('[aria-label="Освещение 3D"]');await flush(()=>{lighting.value='night';lighting.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 const orthographic=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Ортографическая камера')).querySelector('input')
 await flush(()=>orthographic.click());assert(instances.at(-1).camera.isPerspectiveCamera)
 await press('Ракурс из ролика');await flush()
 const r=instances.at(-1),expected=new THREE.Vector3().fromArray(tavernReferenceShot.target).add(new THREE.Vector3().fromArray(tavernReferenceShot.offset))
 assert(r.camera.isOrthographicCamera);assert(r.camera.position.distanceTo(expected)<1e-8);assert.equal(r.camera.zoom,tavernReferenceShot.zoom)
 assert.equal(document.querySelector('[aria-label="Освещение 3D"]').value,'tavern')
 const far=r.scene.children.filter(g=>g.userData.cutawayWall&&g.position.x===2),near=r.scene.children.filter(g=>g.userData.cutawayWall&&g.position.x===16)
 assert(far.length>5&&near.length>5);assert(far.every(g=>g.scale.y===1));assert(near.every(g=>g.scale.y===.18))
 let meshCount=0;r.scene.traverse(m=>{if(m.isMesh&&!m.userData.editorOverlay)meshCount++});assert(meshCount<650,'Compatible palette tints share one material draw per object')
 const previous=r;await mount({model:masterRenderModel({...scene,objects:scene.objects.map(o=>o.asset==='table'?{...o,x:o.x+.1}:o)},[])})
 assert.equal(instances.at(-1),previous,'Moving furniture preserves the comparison camera and renderer');assert(r.camera.position.distanceTo(expected)<1e-8)
})

test('Оси XYZ: сетка изменяет только выбранную координату',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog')
 const scene=createScene(emptyScenes(),'audit-axis','Axes','top').scenes[0]
 const object=createTabletopObject('table','table',{x:5.3,y:5.6,z:.3});scene.objects=[object]
 const moves=[];await mount({model:masterRenderModel(scene,[]),selection:{kind:'object',id:'table'},selections:[{kind:'object',id:'table'}],gizmo:true,selecting:true,snapStep:1,onMove:(s,p)=>{moves.push(p);return true}})
 const r=instances.at(-1),axes=r.scene.children.find(g=>g.userData.editorOverlay&&g.children.some(c=>c.userData.axis===0))
 assert(axes&&axes.visible)
 const grab=axes.position.clone().add(new THREE.Vector3(axes.scale.x*.88,0,0)),end=grab.clone().add(new THREE.Vector3(2,0,0))
 const from=screenPoint(r,grab.x,grab.z,grab.y),to=screenPoint(r,end.x,end.z,end.y)
 for(const [type,p] of [['pointerdown',from],['pointermove',to],['pointerup',to]])await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent(type,{...p,button:0,bubbles:true})))
 assert.equal(moves.length,1);assert.equal(moves[0].y,object.y,'X axis must retain perpendicular Y');assert.equal(moves[0].z,object.z,'X axis must retain height')
})
test('Слои: подпись скрывается и возвращается вместе с объектом',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog')
 const scene=createScene(emptyScenes(),'audit-label','Labels','top').scenes[0];scene.objects=[createTabletopObject('table','table',{x:8,y:8,z:0})]
 await mount({model:masterRenderModel(scene,[]),selection:null,selections:[],gizmo:false,editorHidden:[]})
 const checkbox=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Подписи')).querySelector('input');if(!checkbox.checked)await flush(()=>checkbox.click())
 const r=instances.at(-1),label=document.querySelector('.gb-3d-label');assert(label);assert.equal(label.hidden,false)
 await mount({editorHidden:['table']});const group=r.scene.children.find(g=>g.userData.selection?.id==='table')
 assert.equal(group.visible,false);assert.equal(label.hidden,true,'Layer-hidden object label must hide too');await mount({editorHidden:[]});assert.equal(label.hidden,false)
})
test('Схема: правая и средняя кнопки не размещают и не выбирают объекты',async()=>{
 await flush(()=>root.render(null));props={}
 const {SvgSceneViewport}=load('SceneViewport'),{createScene,emptyScenes}=load('scenes')
 const scene=createScene(emptyScenes(),'buttons-map','Схема','top').scenes[0];let points=0
 dom.window.SVGElement.prototype.getScreenCTM=()=>({inverse:()=>({})})
 dom.window.SVGElement.prototype.createSVGPoint=()=>({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}})
 await flush(()=>root.render(React.createElement(SvgSceneViewport,{scene,actors:[],selection:null,visuals:[],selecting:false,onSelect:()=>{},onPoint:()=>points++})))
 const svg=document.querySelector('svg[role=group]')
 for(const button of [2,1])await flush(()=>svg.dispatchEvent(new dom.window.MouseEvent('pointerdown',{button,clientX:5,clientY:5,bubbles:true})))
 assert.equal(points,0)
 await flush(()=>svg.dispatchEvent(new dom.window.MouseEvent('pointerdown',{button:0,clientX:5,clientY:5,bubbles:true})));assert.equal(points,1)
})

test('Схема: контекстный выбор всех перекрывающихся старых моделей, фильтры, слои и вид сбоку',async()=>{
 await flush(()=>root.render(null));props={}
 const {SvgSceneViewport}=load('SceneViewport'),{createScene,emptyScenes}=load('scenes'),{createEnvironmentObject}=load('sceneEditorPlacement'),{createTabletopObject}=load('tabletopCatalog'),{schematicPickTargets}=load('sceneEditorPicking')
 const scene=createScene(emptyScenes(),'overlap-map','Исходная сцена','top').scenes[0],at={x:5,y:5,z:0}
 const table=createEnvironmentObject('platform','expanded-object-table','table',at),stool=createEnvironmentObject('platform','expanded-object-stool','stool',{...at,z:1}),floor={...createTabletopObject('floor-stone','floor',at),width:12,depth:12}
 scene.objects=[table,floor,stool];const before=structuredClone(scene);let picked,points=0,selected=0
 const options={scene,actors:[],selection:null,selecting:true,onPoint:()=>points++,onSelect:()=>selected++,onContext:(s,p,client)=>{picked={s,p,client}}}
 await flush(()=>root.render(React.createElement(SvgSceneViewport,options)))
 const context=async()=>flush(()=>document.querySelector('svg[role=group]').dispatchEvent(new dom.window.MouseEvent('contextmenu',{button:2,clientX:5,clientY:5,bubbles:true,cancelable:true})))
 await context();assert.deepEqual(picked.client.targets.map(t=>t.selection.id),['stool','table','floor']);assert.equal(picked.s.id,'stool');assert.equal(points+selected,0,'Menu is read-only')
 await flush(()=>root.render(React.createElement(SvgSceneViewport,{...options,editorHidden:['stool'],editorProtected:['floor'],selectionFilter:'props'})));await context();assert.deepEqual(picked.client.targets.map(t=>t.selection.id),['table'])
 assert.deepEqual(scene,before,'Picking never mutates stored object order')
 const side={...scene,view:'side'},y=side.maxZ-.5
 const sideTargets=schematicPickTargets(side,[],{x:5,y},{filter:'props'})
 assert(sideTargets.some(t=>t.selection.id==='table'));assert(!sideTargets.some(t=>t.selection.id==='stool'),'Side view uses real vertical rectangles')
})

test('3D: контекстный список использует реальные попадания, без повторов треугольников и защищённых объектов',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createEnvironmentObject}=load('sceneEditorPlacement'),scene=createScene(emptyScenes(),'overlap-3d','Старые объекты','top').scenes[0]
 const table=createEnvironmentObject('platform','expanded-object-table','table',{x:8,y:8,z:0}),stool={...createEnvironmentObject('platform','expanded-object-stool','stool',{x:8,y:8,z:1.1}),width:.3,depth:.3,height:.3}
 scene.objects=[table,stool];let context
 await mount({model:masterRenderModel(scene,[]),selection:null,selecting:true,onContext:(selection,point,client)=>{context={selection,point,client}}})
 await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click())
 const r=instances.at(-1),p=screenPoint(r,8,8,1.4),open=async()=>flush(()=>{r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{...p,button:2,bubbles:true}));r.domElement.dispatchEvent(new dom.window.MouseEvent('contextmenu',{...p,button:2,bubbles:true,cancelable:true}))})
 await open();assert.deepEqual(context.client.targets.map(t=>t.selection.id),['stool','table']);assert.equal(context.selection.id,'stool');assert(context.client.targets.every(t=>t.label))
 await mount({editorProtected:['stool']});await open();assert.deepEqual(context.client.targets.map(t=>t.selection.id),['table'])
 await mount({editorProtected:[],editorHidden:['stool']});await open();assert.deepEqual(context.client.targets.map(t=>t.selection.id),['table'])
})
test('Текстуры: реальная модель сохраняет размер зерна при независимом масштабе пола',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),scene=createScene(emptyScenes(),'uv-scale','Текстуры','top').scenes[0]
 const floor=createTabletopObject('floor-wood','floor',{x:8,y:8,z:0})
 for(const width of [2,4]){
  await mount({model:masterRenderModel({...scene,objects:[{...floor,width}]},[]),selection:null,selections:[]})
  const group=instances.at(-1).scene.children.find(g=>g.userData.selection?.id===floor.id),mesh=group.children.find(m=>m.material.map),p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,uv=mesh.geometry.attributes.uv
  const tops=Array.from({length:p.count},(_,i)=>i).filter(i=>n.getY(i)>.999)
  const span=values=>Math.max(...values)-Math.min(...values)
  const metres=span(tops.map(i=>p.getX(i))),tiles=span(tops.map(i=>uv.getX(i)))
  assert(Math.abs(metres/tiles-2)<1e-4,'One texture tile covers two metres in either edited size')
 }
})
test('Точный перенос: Shift замедляет курсор без скачка, показывает координаты и не записывает до отпускания',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),scene=createScene(emptyScenes(),'precise-ui','Точность','top').scenes[0],object=createTabletopObject('table','table',{x:5,y:5,z:.3});scene.objects=[object]
 const moves=[];await mount({model:masterRenderModel(scene,[]),selection:{kind:'object',id:object.id},selections:[{kind:'object',id:object.id}],selecting:true,snapStep:1,onMove:(s,p)=>{moves.push(p);return true}})
 const r=instances.at(-1),group=r.scene.children.find(g=>g.userData.selection?.id===object.id),from=screenPoint(r,5,5,object.z+object.height),to=screenPoint(r,7,5,object.z+object.height)
 const fire=async(type,p,shiftKey=false)=>flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent(type,{...p,button:0,shiftKey,bubbles:true})))
 await fire('pointerdown',from);await fire('pointermove',to,true)
 assert(Math.abs(group.position.x-5.2)<1e-6);assert(Math.abs(group.position.z-5)<1e-6);assert.equal(group.position.y,.3);assert.equal(moves.length,0)
 const readout=document.querySelector('.gb-transform-readout');assert(!readout.hidden&&readout.textContent.includes('Точно'));assert(readout.textContent.includes('Δ 0.200'))
 const extra={clientX:to.clientX+(to.clientX-from.clientX)*.1,clientY:to.clientY+(to.clientY-from.clientY)*.1};await fire('pointermove',extra,true)
 assert(Math.abs(group.position.x-5.22)<1e-6,'Precision integrates new cursor travel instead of jumping back to an absolute fraction')
 await fire('pointerup',extra,true);assert.equal(moves.length,1);assert(Math.abs(moves[0].x-5.22)<1e-6);assert(readout.hidden)
 await flush(()=>root.render(null));assert(!document.querySelector('.gb-transform-readout'),'Cleanup removes the overlay with the renderer')
})
test('Перенос опоры: потолок проверяется по полной высоте стоящего героя и отменяет всю команду',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),scene=createScene(emptyScenes(),'headroom-ui','Высота','top').scenes[0]
 scene.maxZ=2.5;const source={...createTabletopObject('barrel','barrel',{x:5,y:5,z:0}),height:.3},table=createTabletopObject('table','table',{x:12,y:10,z:0});scene.objects=[source,table];scene.tokens=[{actorId:'hero',x:5,y:5,z:.3,diameter:.1,support:{kind:'object',objectId:source.id}}]
 let writes=0;await mount({model:masterRenderModel(scene,[]),selection:{kind:'object',id:source.id},selections:[{kind:'object',id:source.id}],selecting:true,moveSurfaces:scene.objects,onMove:()=>{writes++;return true}})
 const r=instances.at(-1),group=r.scene.children.find(g=>g.userData.selection?.id===source.id)
 await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click())
 const from=screenPoint(r,5.2,5,.3),to=screenPoint(r,12.2,10,1.28),fire=async(type,p)=>flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent(type,{...p,button:0,bubbles:true})))
 await fire('pointerdown',from);await fire('pointermove',to);assert.equal(group.position.y,.98);assert.equal(document.querySelector('.gb-transform-readout').dataset.valid,'false')
 await fire('pointerup',to);assert.equal(writes,0);assert.equal(group.position.y,0);assert.equal(group.position.x,5)
})
test('Контур опоры: фактический эллипс, цвет отказа и очистка предпросмотра при выходе курсора и смене инструмента',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),{placementSurfaceFootprint}=load('sceneEditorPlacement'),scene=createScene(emptyScenes(),'guide-ui','Опора','top').scenes[0]
 const table=createTabletopObject('round-table','table',{x:8,y:8,z:.4},90);table.width*=1.3;table.depth*=.8;scene.objects=[table]
 const placement={asset:'mug',facing:0,surfaceSnap:true,surfaces:scene.objects};let writes=0
 await mount({model:masterRenderModel(scene,[]),selecting:false,placement,onPoint:()=>writes++})
 let r=instances.at(-1),point=screenPoint(r,8,8,table.z+table.height)
 const move=async()=>flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...point,button:0,bubbles:true})))
 r.shadowMap.needsUpdate=false;await move();assert.equal(r.shadowMap.needsUpdate,false,'Moving the guide and transparent ghost reuses the scene shadow maps')
 let guide=r.scene.children.find(g=>g.userData.placementSurface),ghost=r.scene.children.find(g=>g.userData.placementGhost)
 assert(guide.visible&&ghost.visible);assert.equal(guide.userData.surfaceId,table.id);assert.equal(guide.geometry.drawRange.count,32);assert.equal(guide.position.y,table.z+table.height+.004)
 const top=placementSurfaceFootprint(table),p=guide.geometry.attributes.position
 for(let i=0;i<32;i++)assert(Math.abs((p.getX(i)/(top.width/2))**2+(p.getZ(i)/(top.depth/2))**2-1)<1e-6)
 assert.equal(writes,0)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointerleave')));assert(!guide.visible&&!ghost.visible)
 await move();assert(guide.visible);await flush(()=>window.dispatchEvent(new dom.window.Event('blur')));assert(!guide.visible&&!ghost.visible)
 await move();assert(guide.visible);await mount({placement:undefined});assert.equal(instances.at(-1),r);assert(!guide.visible&&!ghost.visible,'Changing tools clears the last GPU preview without a mouse movement')
 await mount({model:masterRenderModel({...scene,maxZ:table.z+table.height+.1},[]),placement});r=instances.at(-1);point=screenPoint(r,8,8,table.z+table.height);await move();guide=r.scene.children.find(g=>g.userData.placementSurface)
 assert(guide.visible);assert.equal(guide.userData.valid,false);assert.equal(guide.material.color.getHexString(),'ef8f7b');assert.equal(writes,0)
})
test('Локальный свет: фактическое смещение факела сохраняется после поворота, изменения размера и переноса',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createTabletopObject}=load('tabletopCatalog'),scene=createScene(emptyScenes(),'lamp-anchor-ui','Горелка','top').scenes[0]
 const torch=createTabletopObject('torch','torch',{x:8,y:8,z:.7},90);torch.width*=1.4;torch.height*=.7;scene.objects=[torch]
 await mount({model:masterRenderModel(scene,[]),selection:null,selections:[]});const r=instances.at(-1),group=r.scene.children.find(g=>g.userData.selection?.id===torch.id),light=group.children.find(g=>g.isPointLight)
 assert(light);const glow=new THREE.Box3();group.updateMatrixWorld(true);group.traverse(p=>{if(p.isMesh&&p.material.userData.lightEmitter)glow.union(new THREE.Box3().setFromObject(p,true))})
 assert(light.getWorldPosition(new THREE.Vector3()).distanceTo(glow.getCenter(new THREE.Vector3()))<1e-6)
 const before=light.getWorldPosition(new THREE.Vector3());await mount({model:masterRenderModel({...scene,objects:[{...torch,x:torch.x+2,y:torch.y+1}]},[])})
 assert.equal(instances.at(-1),r);const after=light.getWorldPosition(new THREE.Vector3());assert(after.distanceTo(before.add(new THREE.Vector3(2,0,1)))<1e-6)
})

test('Старый ассет в 3D: фактический повёрнутый призрак совпадает с координатой штампа и не пересоздаёт renderer',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createEnvironmentObject}=load('sceneEditorPlacement'),scene=createScene(emptyScenes(),'legacy-ghost','Прежние ассеты','top').scenes[0]
 const object=createEnvironmentObject('rock','expanded-object-woodpile','ghost',{x:0,y:0,z:0},90);let placed
 await mount({model:masterRenderModel(scene,[]),selecting:false,placement:{object,facing:90,surfaceSnap:false,surfaces:[]},onPoint:(p,o)=>{placed={p,o}},snapStep:.25})
 const r=instances.at(-1);await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click())
 const at=screenPoint(r,8.11,7.91,0);await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...at,button:0,bubbles:true})))
 const ghost=r.scene.children.find(g=>g.userData.placementGhost);assert(ghost.visible);assert.deepEqual(ghost.position.toArray(),[8,0,8]);assert.equal(ghost.children[0].rotation.y,-Math.PI/2)
 const bounds=new THREE.Box3().setFromObject(ghost,true);assert(bounds.max.x-bounds.min.x<=object.width+1e-6&&bounds.max.z-bounds.min.z<=object.depth+1e-6)
 let parts=0;ghost.traverse(p=>{if(p.isMesh)parts++});assert(parts>5,'The ghost has real logs and end grain geometry')
 await clickAt(r,at);assert.deepEqual(placed,{p:{x:8,y:8,z:0},o:{surfaceId:null,resolved:true}})
 const next=createEnvironmentObject('rock','expanded-object-woodpile','ghost',{x:0,y:0,z:0},180);await mount({placement:{object:next,facing:180,surfaceSnap:false,surfaces:[]}})
 assert.equal(instances.at(-1),r);assert(ghost.visible);assert.equal(ghost.children[0].rotation.y,-Math.PI)
})

test('Схема: плоский пол остаётся под предметами, не рисуется колонной и не меняет порядок сохранения',async()=>{
 await flush(()=>root.render(null));props={}
 const {SvgSceneViewport}=load('SceneViewport'),{createTabletopObject}=load('tabletopCatalog'),{createEnvironmentObject}=load('sceneEditorPlacement'),{createScene,emptyScenes}=load('scenes')
 const scene=createScene(emptyScenes(),'floor-map','Пол','top').scenes[0]
 const table=createEnvironmentObject('platform','expanded-object-table','table',{x:5,y:5,z:0}),floor=createTabletopObject('floor-stone','floor',{x:5,y:5,z:0})
 scene.objects=[table,floor];const before=structuredClone(scene)
 await flush(()=>root.render(React.createElement(SvgSceneViewport,{scene,actors:[],selection:null,onSelect:()=>{},onPoint:()=>{},selecting:true})))
 const entities=[...document.querySelectorAll('[data-scene-entity=object]')];assert.deepEqual(entities.map(e=>e.getAttribute('data-scene-id')),['floor','table'])
 assert.equal(entities[0].querySelector('rect').getAttribute('fill'),'url(#floor-stone-floor-map)');assert.equal(entities[0].querySelector('svg'),null)
 assert(entities[1].querySelector('image'));assert.deepEqual(scene,before)
})

test('Старые печи: локальный свет только при открытой топке, сохранённая позиция источника и отсутствие света у памяти',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createEnvironmentObject}=load('sceneEditorPlacement'),scene=createScene(emptyScenes(),'old-oven','Старая печь','top').scenes[0]
 const oven={...createEnvironmentObject('platform','expanded-object-kiln','kiln',{x:8,y:8,z:0},90),active:true};scene.objects=[oven]
 await mount({model:masterRenderModel(scene,[]),selecting:true})
 const chooseNight=async()=>flush(()=>{const select=document.querySelector('[aria-label="Освещение 3D"]');select.value='night';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 await chooseNight();assert(!instances.at(-1).scene.getObjectByProperty('isPointLight',true),'Closed metal fire door does not leak room light')
 const open={...scene,objects:[{...oven,open:true}]};await mount({model:masterRenderModel(open,[])})
 let r=instances.at(-1),group=r.scene.children.find(g=>g.userData.selection?.id==='kiln'),light=group.children.find(p=>p.isPointLight);assert(light)
 const bounds=new THREE.Box3();group.traverse(p=>{if(p.isMesh&&p.material.userData.lightEmitter)bounds.union(new THREE.Box3().setFromObject(p,true))})
 assert(light.getWorldPosition(new THREE.Vector3()).distanceTo(bounds.getCenter(new THREE.Vector3()))<1e-6)
 assert(group.userData.liveFlame,'Open fire uses existing animation controls')
 await mount({model:masterRenderModel({...open,objects:[{...open.objects[0],active:false}]},[])})
 assert(!instances.at(-1).scene.getObjectByProperty('isPointLight',true))
 const memory=masterRenderModel(open,[]);memory.entities[0].appearance.remembered=true;await mount({model:memory});assert(!instances.at(-1).scene.getObjectByProperty('isPointLight',true))
 const restricted={...masterRenderModel(open,[]),restricted:true};await mount({model:restricted});assert(!instances.at(-1).scene.getObjectByProperty('isPointLight',true))
})

test('Старая мебель с kind platform: прямой жест игрока создаёт только заявку, а память и постройки не показывают захват',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{createEnvironmentObject}=load('sceneEditorPlacement'),scene=createScene(emptyScenes(),'old-move','Старая мебель','top').scenes[0]
 const table=createEnvironmentObject('platform','expanded-object-table','old-table',{x:8,y:8,z:0});scene.objects=[table];const model={...masterRenderModel(scene,[]),restricted:true};let requests=[]
 await mount({model,selecting:true,onRequestMove:(s,p)=>{requests.push({s,p});return true},onMove:undefined,marker:null,route:undefined,snapStep:undefined})
 const r=instances.at(-1),group=r.scene.children.find(g=>g.userData.selection?.id===table.id),origin=group.position.clone(),from=screenPoint(r,8.2,8,.98),to={clientX:from.clientX+55,clientY:from.clientY+20}
 await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...from,bubbles:true})));assert.equal(r.domElement.style.cursor,'grab')
 await flush(()=>{for(const [type,p] of [['pointerdown',from],['pointermove',to],['pointerup',to]])r.domElement.dispatchEvent(new dom.window.MouseEvent(type,{...p,button:0,bubbles:true}))})
 assert.equal(requests.length,1);assert.equal(requests[0].s.id,table.id);assert(group.position.equals(origin));assert.deepEqual(scene.objects,[table])
 const remembered=structuredClone(model);remembered.entities[0].appearance.remembered=true;await mount({model:remembered});requests=[]
 let next=instances.at(-1);await flush(()=>next.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...screenPoint(next,8.2,8,.98),bubbles:true})));assert.equal(next.domElement.style.cursor,'default')
 const structure={...model,entities:[{...model.entities[0],geometry:{...model.entities[0].geometry,artwork:undefined}}]};await mount({model:structure});next=instances.at(-1)
 await flush(()=>next.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...screenPoint(next,8,8,.98),bubbles:true})));assert.equal(next.domElement.style.cursor,'default')
})

test('Личная схема: плоские полы под предметами, отдельные SVG-шаблоны и только раскрытые данные',async()=>{
 await flush(()=>root.render(null));props={}
 const {SvgPerceivedScene}=load('PerceivedScene'),{publicObject}=load('scenePerception'),{createTabletopObject}=load('tabletopCatalog'),{createEnvironmentObject}=load('sceneEditorPlacement')
 const floor={...publicObject(createTabletopObject('floor-stone','known-floor',{x:5,y:5,z:0})),visible:false},cabinet={...publicObject(createEnvironmentObject('platform','expanded-object-cabinet','known-cabinet',{x:5,y:5,z:0})),visible:true}
 const map={frame:{id:'player-old',view:'top',width:20,depth:20,groundZ:0,minZ:-2,maxZ:10,palette:'stone'},title:'Известная область',description:'',areas:[{id:'room',x:2,y:2,z:-2,width:8,depth:8,height:12,visible:true}],contacts:[],objects:[cabinet,floor]},before=structuredClone(map)
 await flush(()=>root.render(React.createElement(SvgPerceivedScene,{map,onObject:()=>{}})))
 const nodes=[...document.querySelectorAll('.gb-game-object')];assert.deepEqual(nodes.map(n=>n.getAttribute('aria-label')),['Объект: '+floor.name,'Объект: '+cabinet.name])
 const fill=nodes[0].querySelector('rect[fill]')?.getAttribute('fill');assert(fill?.startsWith('url(#floor-stone-'));assert(document.getElementById(fill.slice(5,-1)))
 assert.equal(nodes[0].querySelector('svg'),null);assert.equal(nodes[0].getAttribute('opacity'),'0.48');assert(nodes[0].parentNode.getAttribute('clip-path').startsWith('url(#'))
 assert.deepEqual(map,before)
})

test('3D UI: фокус из списка охватывает текущую группу без пересоздания GPU ресурсов',async()=>{
 const {createScene,emptyScenes,sceneObject}=load('scenes'),scene=createScene(emptyScenes(),'outliner-camera','Фокус списка','top').scenes[0]
 scene.objects=[{...sceneObject('crate','crate-a',{x:6,y:6,z:0}),width:1,depth:1,height:1},{...sceneObject('crate','crate-b',{x:11,y:8,z:0}),width:2,depth:1,height:1}]
 props={model:masterRenderModel(scene,[]),selection:{kind:'object',id:'crate-a'},selections:[{kind:'object',id:'crate-a'},{kind:'object',id:'crate-b'}],focusRequest:0}
 await mount();const r=instances.at(-1),original=r.camera.position.clone(),count=instances.length
 await mount({focusRequest:1});assert.equal(instances.length,count);assert.equal(instances.at(-1),r);assert(r.camera.position.distanceTo(original)>1)
 const bounds=new THREE.Box3();r.scene.children.filter(g=>g.userData.selection?.id==='crate-a'||g.userData.selection?.id==='crate-b').forEach(g=>bounds.union(new THREE.Box3().setFromObject(g)))
 const direction=bounds.getCenter(new THREE.Vector3()).sub(r.camera.position).normalize();assert(direction.angleTo(r.camera.getWorldDirection(new THREE.Vector3()))<.01,'Camera is aimed at the whole group')
 for(const object of scene.objects){const p=new THREE.Vector3(object.x,.5,object.y).project(r.camera);assert(Math.abs(p.x)<.95&&Math.abs(p.y)<.95,'Both members are visible')}
 await mount({editorHidden:['crate-a'],focusRequest:2});const visibleGroup=r.scene.children.find(g=>g.userData.selection?.id==='crate-b'),target=new THREE.Box3().setFromObject(visibleGroup).getCenter(new THREE.Vector3()).sub(r.camera.position).normalize()
 assert(target.angleTo(r.camera.getWorldDirection(new THREE.Vector3()))<.01,'A hidden primary member does not hide the remaining focused group')
 const position=r.camera.position.clone();await mount({editorHidden:['crate-a','crate-b'],focusRequest:3});assert(r.camera.position.equals(position),'An entirely hidden group does not change the camera');assert.equal(instances.at(-1),r)
})

test('3D UI: групповой призрак у края сообщает уже разрешённые координаты без повторной привязки',async()=>{
 const {createScene,emptyScenes}=load('scenes'),{createEnvironmentObject}=load('sceneEditorPlacement'),{captureSceneAssembly}=load('sceneAssemblies'),scene=createScene(emptyScenes(),'clipboard-edge','Край сцены','top').scenes[0]
 const object={...createEnvironmentObject('crate','expanded-object-jar','edge-jar',{x:4,y:4,z:0}),width:1.3,depth:.7,height:.9},assembly=captureSceneAssembly({...scene,objects:[object]},[{kind:'object',id:object.id}],'Копия','clipboard');let placed
 props={model:masterRenderModel(scene,[]),placement:{assembly,facing:0,elevation:0},selecting:false,snapStep:1,onPoint:(p,o)=>{placed={p,o}}};await mount();const r=instances.at(-1);await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Сверху').click())
 const point=screenPoint(r,29.99,19.99,0);await flush(()=>r.domElement.dispatchEvent(new dom.window.MouseEvent('pointermove',{...point,bubbles:true})));const ghost=r.scene.children.find(g=>g.userData.placementGhost)
 assert(ghost.visible);assert(Math.abs(ghost.position.x-29.35)<1e-8);assert(Math.abs(ghost.position.z-19.65)<1e-8);await clickAt(r,point)
 assert.deepEqual(placed,{p:{x:29.35,y:19.65,z:0},o:{surfaceId:null,resolved:true}});assert.equal(instances.at(-1),r)
})
test('Окружение 3D: смена дня и ночи сохраняет renderer; пещера и личная карта не получают наружную площадку',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),scene=createScene(emptyScenes(),'atmosphere-ui','Окружение','top').scenes[0]
 await mount({model:masterRenderModel(scene,[])})
 const r=instances.at(-1),backdrop=r.scene.getObjectByName('scene-backdrop'),sky=backdrop.getObjectByName('backdrop-sky')
 assert(backdrop.getObjectByName('backdrop-ground'));assert.equal(document.querySelector('.gb-scene-3d').dataset.environment,'surface')
 const select=document.querySelector('[aria-label="Освещение 3D"]')
 for(const mode of ['day','night']){
  await flush(()=>{select.value=mode;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  assert.equal(instances.at(-1),r);assert.equal(sky.material.uniforms.night.value,mode==='night'?1:0)
  assert.equal(document.querySelector('.gb-3d-canvas .gb-scene-atmosphere').dataset.cycle,mode)
 }
 const frames=r.frames;await flush();assert.equal(r.frames,frames,'Static clouds do not add an idle render loop')
 await mount({model:masterRenderModel({...scene,environment:'underground'},[])})
 const cave=instances.at(-1);assert(r.disposed);assert.equal(cave.scene.getObjectByName('backdrop-sky').material.uniforms.cavern.value,1)
 assert(cave.clearColor.r<.02&&cave.clearColor.g<.02&&cave.clearColor.b<.03);assert(!document.querySelector('.gb-3d-canvas [data-celestial]'))
 const restricted={...masterRenderModel({...scene,environment:'underground'},[]),restricted:true,areas:[]}
 await mount({model:restricted});const personal=instances.at(-1).scene.getObjectByName('scene-backdrop')
 assert(!personal.getObjectByName('backdrop-ground'));assert(!personal.getObjectByName('backdrop-earth'))
})

test('Окружение схемы: день, ночь и пещера меняют фон без изменения расстановки и без перехвата выбора',async()=>{
 await flush(()=>root.render(null));props={};window.localStorage.clear()
 const {SvgSceneViewport}=load('SceneViewport'),{createScene,emptyScenes}=load('scenes'),scene=createScene(emptyScenes(),'atmosphere-map','Окружение','top').scenes[0],before=structuredClone(scene)
 const render=scene=>root.render(React.createElement(SvgSceneViewport,{scene,actors:[],selection:null,onSelect:()=>{},onPoint:()=>{},selecting:true}))
 await flush(()=>render(scene));let atmosphere=document.querySelector('.gb-scene-atmosphere')
 assert.equal(atmosphere.dataset.environment,'surface');assert(atmosphere.querySelector('[data-celestial=sun]'));assert.equal(atmosphere.getAttribute('aria-hidden'),'true')
 const night=[...document.querySelectorAll('.gb-atmosphere-controls button')].find(b=>b.textContent==='Ночь');await flush(()=>night.click())
 atmosphere=document.querySelector('.gb-scene-atmosphere');assert.equal(atmosphere.dataset.cycle,'night');assert(atmosphere.querySelector('[data-celestial=moon]'));assert.equal(JSON.parse(window.localStorage.getItem('grani-bytiya:3d-lighting:v1')).mode,'night')
 await flush(()=>render({...scene,environment:'underground'}));atmosphere=document.querySelector('.gb-scene-atmosphere')
 assert.equal(atmosphere.dataset.environment,'underground');assert(!atmosphere.querySelector('[data-celestial]'));assert.equal(document.querySelectorAll('.gb-atmosphere-controls button').length,0);assert.deepEqual(scene,before)
})

test('Способности 3D: выпуск, прицел и отметка не пересоздают renderer; пауза останавливает кадры',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),{buildSceneAbilityAim}=load('sceneAbilityAim'),{playtestMap,playtestAbilities}=load('scenePlaytest')
 const scene=createScene(emptyScenes(),'vfx-live-ui','Эффекты','top').scenes[0];scene.tokens=[{actorId:'caster',x:4,y:4,z:0,diameter:.8,support:{kind:'ground'}}]
 const map=playtestMap(scene,[],'caster'),aim=buildSceneAbilityAim(map,playtestAbilities[0],{kind:'area',point:{x:12,y:8,z:0}}),model=masterRenderModel(scene,[])
 await mount({model,marker:null,route:[]});const r=instances.at(-1),position=r.camera.position.clone(),view=document.querySelector('[aria-label="Качество 3D"]')
 const visibility=Object.getOwnPropertyDescriptor(document,'visibilityState');Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})
 try{
  await mount({abilityAim:aim,marker:{x:12,y:8,z:0},route:[{x:4,y:4,z:0},{x:12,y:8,z:0}]});assert.equal(instances.at(-1),r);assert(r.scene.getObjectByName('ability-aim').children.length>0);assert(r.camera.position.equals(position))
  const beforeLines=r.scene.getObjectByName('ability-aim').children.length,impact={x:8,y:6,z:0},blocked={...aim,visual:{...aim.visual,end:impact},obstruction:{kind:'object',objectId:'wall',name:'Стена',point:impact,distanceM:Math.hypot(4,2)}}
  await mount({abilityAim:blocked});const warning=r.scene.getObjectByName('ability-aim');assert.equal(instances.at(-1),r);assert.equal(warning.children.length,beforeLines+3);assert(warning.children.every(line=>line.material.color.equals(new THREE.Color('#edbd79'))));assert.deepEqual(Array.from(warning.children[0].geometry.attributes.position.array).slice(3),[8,0,6])
  const visual={...aim.visual,id:'release-live',phase:'sequence',spec:{familyId:'fire',durationMs:1000}}
  await mount({model:{...model,visuals:[visual]}});assert.equal(instances.at(-1),r);const effect=r.scene.getObjectByName('ability-effect:release-live');assert(effect?.visible);assert.equal(effect.userData.familyId,'fire')
  await flush(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Пауза эффектов').click());await flush();const frames=r.frames
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,110))});assert.equal(r.frames,frames);assert.equal(instances.at(-1),r)
  const toggle=[...document.querySelectorAll('label')].find(l=>l.textContent===' Эффекты способностей').querySelector('input');await flush(()=>toggle.click());assert.equal(effect.visible,false)
  await mount({abilityAim:null,marker:null,route:[]});assert.equal(instances.at(-1),r);assert.equal(r.scene.getObjectByName('ability-aim').children.length,0);assert(view.isConnected)
 }finally{if(visibility)Object.defineProperty(document,'visibilityState',visibility);else delete document.visibilityState}
})
test('Способности 3D: эффект за границей раскрытия не рисуется, видимые части получают отсечение',async()=>{
 await flush(()=>root.render(null));props={}
 const frame={id:'vfx-known',width:20,depth:20,groundZ:0,minZ:-2,maxZ:10,view:'top',palette:'stone'},area={id:'seen',x:0,y:0,z:-2,width:6,depth:6,height:12,visible:true},v={id:'clipped-fire',spec:{familyId:'fire'},start:{x:1,y:1,z:0},end:{x:4,y:4,z:0},phase:'residue',shape:'sphere',radius:3,coneAngleDeg:45}
 const model={frame,title:'Личная карта',restricted:true,areas:[area],entities:[],visuals:[v]};await mount({model});let r=instances.at(-1),effect=r.scene.getObjectByName('ability-effect:clipped-fire');assert(effect)
 effect.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])assert.equal(m.clippingPlanes.length,6)})
 await mount({model:{...model,visuals:[{...v,id:'unseen-fire',end:{x:12,y:12,z:0}}]}});assert.equal(instances.at(-1),r);assert(!r.scene.getObjectByName('ability-effect:unseen-fire'));assert(!r.scene.getObjectByName('ability-effect:clipped-fire'))
})

test('Способности 3D: совместное изменение геометрии и выпуск не теряют запуск нового эффекта',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes,sceneObject}=load('scenes'),scene=createScene(emptyScenes(),'cast-and-open','Действия вместе','top').scenes[0]
 scene.objects=[sceneObject('door','door',{x:5,y:5,z:0})];await mount({model:masterRenderModel(scene,[])})
 const prior=instances.at(-1),visual={id:'new-batch-effect',spec:{familyId:'fire',durationMs:1800},start:{x:4,y:4,z:0},end:{x:8,y:8,z:0},phase:'sequence',shape:'sphere',radius:2,coneAngleDeg:45}
 const next=masterRenderModel({...scene,objects:[{...scene.objects[0],open:true}]},[],[visual]);await mount({model:next})
 const r=instances.at(-1);assert.notEqual(r,prior);assert(prior.disposed);assert(r.scene.getObjectByName('ability-effect:new-batch-effect').visible,'A newly confirmed spell starts even when the same confirmation changes a door mesh')
})

test('Просмотр 3D: внешний курсор задаёт фазу и позицию без пересоздания renderer и самостоятельного хода часов',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),scene=createScene(emptyScenes(),'controlled-vfx','Просмотр','top').scenes[0],visual={id:'cursor-fire',spec:{familyId:'fire',durationMs:1000},start:{x:4,y:4,z:0},end:{x:8,y:8,z:0},phase:'sequence',shape:'sphere',radius:2,coneAngleDeg:45},model=masterRenderModel(scene,[],[visual])
 await mount({model,effectTimeMs:475});const r=instances.at(-1),effect=r.scene.getObjectByName('ability-effect:cursor-fire');assert(effect.visible);assert(effect.position.distanceTo(new THREE.Vector3(6,0,6))<1e-6);assert(![...document.querySelectorAll('button')].some(b=>b.textContent==='Пауза эффектов'))
 await mount({effectTimeMs:700});assert.equal(instances.at(-1),r);assert.equal(r.scene.getObjectByName('ability-effect:cursor-fire'),effect);assert(effect.position.distanceTo(new THREE.Vector3(8,0,8))<1e-6)
 await flush();const frames=r.frames;await act(async()=>{await new Promise(resolve=>setTimeout(resolve,110))});assert.equal(r.frames,frames,'The external cursor owns the clock while paused')
 await mount({effectTimeMs:0});assert(effect.position.distanceTo(new THREE.Vector3(4,0,4))<1e-6);await mount({effectTimeMs:1000});assert(!effect.visible);assert.equal(instances.at(-1),r)
})
test('Просмотр SVG: тот же курсор даёт ту же фазу и положение, штатные кнопки повтора уступают общей шкале',async()=>{
 await flush(()=>root.render(null));props={}
 const {SvgPerceivedScene}=load('PerceivedScene'),{createScene,emptyScenes}=load('scenes'),{playtestMap}=load('scenePlaytest'),scene=createScene(emptyScenes(),'controlled-svg','Схема','top').scenes[0]
 scene.tokens=[{actorId:'caster',x:4,y:4,z:0,diameter:.8,support:{kind:'ground'}}]
 const v={id:'cursor-svg',spec:{familyId:'fire',durationMs:1000},start:{x:4,y:4,z:0},end:{x:8,y:8,z:0},phase:'sequence',shape:'sphere',radius:2,coneAngleDeg:45},map=playtestMap(scene,[],'caster',[v])
 const render=time=>root.render(React.createElement(SvgPerceivedScene,{map,effectTimeMs:time}))
 await flush(()=>render(475));assert(document.querySelector('[data-vfx-phase="travel"]'));assert(document.querySelector('.w6-vfx-paused'));const positions=[...document.querySelectorAll('.w6-vfx > g[transform]')].map(g=>g.getAttribute('transform').match(/translate\(([-\d.e]+) ([-\d.e]+)\)/)).filter(Boolean);assert(positions.some(p=>Math.abs(Number(p[1])-6)<1e-6&&Math.abs(Number(p[2])-6)<1e-6));assert.equal(document.querySelector('[aria-label="Визуальные эффекты сцены"]'),null)
 await flush(()=>render(700));assert(document.querySelector('[data-vfx-phase="impact"]'));await flush(()=>render(1000));assert.equal(document.querySelector('.w6-vfx'),null)
 await flush(()=>render(undefined));assert(document.querySelector('[aria-label="Визуальные эффекты сцены"]'))
})

test('Свет способностей: не более двух вспышек, без теней; экономный режим и личная карта не добавляют свет',async()=>{
 await flush(()=>root.render(null));props={}
 const {createScene,emptyScenes}=load('scenes'),scene=createScene(emptyScenes(),'vfx-light-budget','Свет эффектов','top').scenes[0]
 const visuals=Array.from({length:4},(_,i)=>({id:'flash-'+i,spec:{familyId:'fire'},start:{x:4+i,y:4,z:0},end:{x:8+i,y:8,z:0},phase:'preparation',shape:'sphere',radius:2,coneAngleDeg:45})),model=masterRenderModel(scene,[],visuals)
 await mount({model});let r=instances.at(-1),lights=[];r.scene.traverse(o=>{if(o.isPointLight)lights.push(o)});assert.equal(lights.length,2);assert(lights.every(l=>!l.castShadow&&l.intensity>0))
 const toggle=[...document.querySelectorAll('label')].find(l=>l.textContent===' Эффекты способностей').querySelector('input');await flush(()=>toggle.click());assert(lights.every(l=>!l.visible&&l.intensity===0))
 await flush(()=>{const select=document.querySelector('[aria-label="Качество 3D"]');select.value='low';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});r=instances.at(-1);assert(!r.scene.getObjectByProperty('isPointLight',true))
 await mount({model:{...model,restricted:true}});r=instances.at(-1);assert(!r.scene.getObjectByProperty('isPointLight',true))
})
