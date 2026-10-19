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
 setPixelRatio(value){this.ratio=value}setClearColor(){}
 setSize(w,h){this.domElement.width=w;this.domElement.height=h}
 render(scene,camera){this.scene=scene;this.camera=camera;scene.updateMatrixWorld();camera.updateMatrixWorld();this.frames++}
 dispose(){this.disposed=true}
}
const cache=new Map()
function load(name){
 if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name)
 const mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id==='three'?{...THREE,WebGLRenderer:Renderer}:id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports)
 return mod.exports
}
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'))
const Scene3D=load('Scene3D').default,{masterRenderModel,perceivedRenderModel}=load('scene3dModel')
const {create3DSandbox}=load('sandboxCampaign')
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
 const light=r.scene.children.find(n=>n.isDirectionalLight);assert(!light.castShadow)
 await flush(()=>r.domElement.dispatchEvent(new dom.window.Event('webglcontextlost',{cancelable:true})));assert.equal(unavailable,1)
 await flush(()=>root.render(null));assert(r.disposed);assert.equal(document.querySelectorAll('canvas,.gb-3d-label').length,0)
})
