const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const THREE=require('three'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{JSDOM}=require('jsdom'),cache=new Map()
const {pathToFileURL}=require('node:url')
function load(name){name=name.replace(/\.tsx?$/,'');if(name.endsWith('.css'))return {};if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name);const mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href)).replaceAll('import.meta.env',JSON.stringify({BASE_URL:'/'}))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports
}
const {buildSceneAbilityAim}=load('sceneAbilityAim'),{knownAimTargets,renderAimTargets}=load('sceneAimTargets'),{perceivedRenderModel}=load('scene3dModel'),{projectedAimSurface}=load('sceneAbilityAimPresentation'),{createSceneAbilityAim}=load('scene3dAbilityAim')
const frame={id:'aim-test',width:20,depth:20,groundZ:0,minZ:-5,maxZ:10,view:'top',palette:'stone'}
const contact=(id,x,y,z,kind='identified')=>({id,label:id,x,y,...(z===undefined?{}:{z}),kind,signs:''})
function fixture(){return {title:'Раскрытая карта',description:'',frame,areas:[{id:'seen',x:0,y:0,z:-2,width:10,depth:10,height:10,visible:true},{id:'memory',x:10,y:0,z:-2,width:10,depth:10,height:10,visible:false}],
 contacts:[contact('source',3,4,0,'self'),contact('other',5,4,0),contact('air',5,4,5),contact('flat',5,4,undefined,'silhouette'),contact('sound',5,4,0,'sound'),contact('dark',12,4,0)],
 objects:[{id:'lamp',name:'Светильник',x:5,y:4,z:0,width:.4,depth:.4,height:2,kind:'lamp',visible:true},{id:'memory-lamp',name:'Прежний предмет',x:5,y:4,z:0,width:.4,depth:.4,height:2,kind:'lamp',visible:false}]}}
const ability=(spatial={shape:'sphere',radiusM:3,includeCaster:false})=>({id:'spell',name:'Область',rangeM:20,spatial,visualEffect:{familyId:'water'}})
const aimFor=(map=fixture(),spatial)=>buildSceneAbilityAim(map,ability(spatial),{kind:'area',point:{x:5,y:4,z:0}})

test('Прицел: схема и 3D используют одни раскрытые центры; память, звук, неизвестная высота и тёмные области исключены',()=>{
 const map=fixture(),before=structuredClone(map),aim=aimFor(map)
 assert.equal(aim.casterId,'source');assert.deepEqual(knownAimTargets(map,aim).map(t=>t.id),['other','lamp'])
 assert.deepEqual(renderAimTargets(perceivedRenderModel(map),aim),knownAimTargets(map,aim));assert.deepEqual(map,before)
 const huge={...aim,visual:{...aim.visual,radius:100}}
 assert(!renderAimTargets(perceivedRenderModel(map),huge).some(t=>['dark','memory-lamp','flat','sound','source'].includes(t.id)))
})

test('Прицел: исключение источника не исключает другого игрока в той же точке; включение источника явно отмечено',()=>{
 const map=fixture();map.contacts.push(contact('same-place',3,4,0));const aim=aimFor(map)
 assert(knownAimTargets(map,aim).some(t=>t.id==='same-place'));assert(!knownAimTargets(map,aim).some(t=>t.isCaster))
 const own={...aim,includeCaster:true},targets=knownAimTargets(map,own)
 assert(targets.find(t=>t.id==='source').isCaster);assert.deepEqual(renderAimTargets(perceivedRenderModel(map),own),targets)
 for(const invalid of [{...aim,valid:false},{...aim,sceneId:'another-scene'}]){
  assert.deepEqual(knownAimTargets(map,invalid),[]);assert.deepEqual(renderAimTargets(perceivedRenderModel(map),invalid),[])
 }
})

test('Проекция сферы: заливка не включает направляющую к источнику и не зависит от масштаба изображения',()=>{
 const aim=aimFor(),patch={...aim,visual:{...aim.visual,start:{x:0,y:4,z:0},end:{x:15,y:4,z:0},radius:2}},points=projectedAimSurface(patch,frame)
 assert.equal(Math.min(...points.map(p=>p.x)),13);assert.equal(Math.max(...points.map(p=>p.x)),17)
 assert.equal(Math.min(...points.map(p=>p.y)),2);assert.equal(Math.max(...points.map(p=>p.y)),6)
 assert.deepEqual(projectedAimSurface({...patch,visual:{...patch.visual,spec:{familyId:'fire',scale:4}}},frame),points)
 assert.deepEqual(projectedAimSurface({...patch,visual:{...patch.visual,shape:'point'}},frame),[])
})

test('Вертикальный луч и конус: проекция сверху сохраняет радиус, сбоку — длину оси',()=>{
 const base=aimFor(),v={...base.visual,start:{x:5,y:4,z:0},end:{x:5,y:4,z:6},radius:2,shape:'beam'}
 const top=projectedAimSurface({...base,visual:v},frame),side=projectedAimSurface({...base,visual:v},{...frame,view:'side'})
 assert.equal(Math.min(...top.map(p=>p.x)),3);assert.equal(Math.max(...top.map(p=>p.x)),7)
 assert.equal(Math.min(...side.map(p=>p.y)),4);assert.equal(Math.max(...side.map(p=>p.y)),10)
 const cone=projectedAimSurface({...base,visual:{...v,shape:'cone',coneAngleDeg:60}},{...frame,view:'side'})
 assert(Math.abs(Math.min(...cone.map(p=>p.x))-(5-6*Math.tan(Math.PI/6)))<1e-8)
 assert(cone.some(p=>p.x===5&&p.y===10));assert(cone.every(p=>Object.values(p).every(Number.isFinite)))
})

test('Точечная область: подсветка не превращает размер значка в игровой радиус',()=>{
 const map=fixture();map.contacts.push(contact('nearby',5.01,4,0));const aim=aimFor(map,{shape:'point',includeCaster:false})
 assert.deepEqual(knownAimTargets(map,aim).map(t=>t.id),['other']);assert.deepEqual(renderAimTargets(perceivedRenderModel(map),aim),knownAimTargets(map,aim))
})

test('3D-прицел: замкнутые поверхности совпадают с XYZ и не добавляют объём точке',()=>{
 const base=aimFor(),p={x:2,y:3,z:1},q={x:2,y:3,z:7}
 for(const shape of ['sphere','beam','cone','point']){
  const aim={...base,visual:{...base.visual,shape,start:p,end:q,radius:2,coneAngleDeg:60}},entry=createSceneAbilityAim(aim,[]),surface=entry.group.getObjectByName('ability-aim-surface:'+shape)
  if(shape==='point')assert.equal(surface,undefined)
  else{
   entry.group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(surface),size=bounds.getSize(new THREE.Vector3())
   if(shape==='sphere')assert(bounds.getCenter(new THREE.Vector3()).distanceTo(new THREE.Vector3(2,7,3))<1e-8)
   else{assert(Math.abs(bounds.min.y-1)<1e-6);assert(Math.abs(bounds.max.y-7)<1e-6)}
   const diameter=shape==='cone'?12*Math.tan(Math.PI/6):4;assert(Math.abs(size.x-diameter)<1e-5);assert(Math.abs(size.z-diameter)<1e-5)
   if(shape!=='sphere')assert.equal(surface.geometry.parameters.openEnded,false);assert(surface.material.depthTest&&!surface.material.depthWrite)
  }
  entry.dispose()
 }
})

test('3D-прицел: все материалы отсечены, нет перехвата выбора, ресурсы освобождаются ровно один раз',()=>{
 const map=fixture(),aim=aimFor(map),targets=knownAimTargets(map,aim),before=structuredClone(aim),planes=[new THREE.Plane(new THREE.Vector3(1,0,0),-1)],entry=createSceneAbilityAim(aim,targets,planes),disposed=new Map()
 entry.group.traverse(o=>{if(o.geometry){disposed.set(o.geometry,0);o.geometry.addEventListener('dispose',()=>disposed.set(o.geometry,disposed.get(o.geometry)+1));assert(Object.values(o.geometry.attributes).every(a=>a.array.every(Number.isFinite)))}if(o.material){assert.equal(o.material.clippingPlanes,planes);disposed.set(o.material,0);o.material.addEventListener('dispose',()=>disposed.set(o.material,disposed.get(o.material)+1))}assert(!o.isLight&&!o.userData.selection)})
 assert(entry.group.getObjectByName('ability-aim-target:contact:other'));assert(entry.group.getObjectByName('ability-aim-target:object:lamp'))
 entry.group.updateMatrixWorld(true);assert.equal(new THREE.Raycaster(new THREE.Vector3(5,10,4),new THREE.Vector3(0,-1,0)).intersectObject(entry.group,true).length,0)
 entry.dispose();entry.dispose();assert([...disposed.values()].every(n=>n===1));assert.equal(entry.group.children.length,0);assert.deepEqual(aim,before)
})

test('Мастерская: точные размеры всех форм и отдельный масштаб оформления; большая область меняет кадрирование',()=>{
 const {abilityVisualPreviewModel,abilityPreviewAim,abilityPreviewFraming}=load('abilityVisualPreview')
 for(const spatial of [{shape:'point',includeCaster:false},{shape:'sphere',radiusM:9,includeCaster:true},{shape:'beam',radiusM:.75,lengthM:12,includeCaster:false},{shape:'cone',lengthM:12,angleDeg:120,includeCaster:false}]){
  const before=structuredClone(spatial),a=abilityVisualPreviewModel({familyId:'fire',scale:.25},spatial.shape,spatial,20),b=abilityVisualPreviewModel({familyId:'water',scale:4},spatial.shape,spatial,20),v=a.visuals[0]
  assert.equal(v.shape,spatial.shape);assert.deepEqual({...v,spec:{}},{...b.visuals[0],id:v.id,spec:{}});assert.deepEqual(spatial,before)
  if('radiusM' in spatial)assert.equal(v.radius,spatial.radiusM)
  if('lengthM' in spatial)assert(Math.abs(v.end.x-v.start.x-spatial.lengthM)<1e-8)
  if(spatial.shape==='cone')assert.equal(v.coneAngleDeg,120)
  assert.equal(a.entities[0].transform.position.x,v.start.x);assert.equal(a.entities[1].transform.position.x,v.end.x)
  const aim=abilityPreviewAim(a,spatial,20),targets=renderAimTargets(a,aim);assert(targets.some(t=>t.id==='preview-target'))
  if(spatial.shape==='sphere'){assert(targets.some(t=>t.isCaster));assert(abilityPreviewFraming(a).scale>1)}
 }
})

test('Схема и сводка: подсветка пассивна, числа соответствуют раскрытым отметкам и источник выделен отдельно',()=>{
 const aim={...aimFor(),includeCaster:true},targets=knownAimTargets(fixture(),aim),Overlay=load('SceneAbilityAimOverlay').default,Summary=load('SceneAbilityAimSummary').default
 const markup=renderToStaticMarkup(React.createElement('div',null,React.createElement('svg',null,React.createElement(Overlay,{aim,targets,frame})),React.createElement(Summary,{aim,targets}))),dom=new JSDOM(markup),doc=dom.window.document
 try{
  assert.equal(doc.querySelectorAll('[data-aim-target]').length,3);assert(doc.querySelector('.gb-aim-surface'));assert.equal(doc.querySelector('[aria-label="Область прицеливания"]').getAttribute('pointer-events'),'none')
  assert(doc.querySelector('.gb-aim-caster').textContent.includes('Источник'));assert(doc.querySelector('.gb-aim-dimensions').textContent.includes('радиус 3 м'));assert.equal(doc.querySelectorAll('.gb-aim-contents li').length,targets.length)
  assert(!markup.includes('Прежний предмет'));assert(!doc.querySelector('[data-aim-target="contact:sound"]'))
 }finally{dom.window.close()}
})
