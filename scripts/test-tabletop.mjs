import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const require=createRequire(import.meta.url),THREE=require('three'),cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'');if(cache.has(name))return cache.get(name).exports
 const file=path.resolve('src',name+'.ts'),mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports)
 return mod.exports
}
const {tabletopAssets,createTabletopObject}=load('tabletopCatalog'),{createTavernScene}=load('tabletopShowcase')
const {isSceneState,copySceneState,emptyScenes,createScene}=load('scenes')
const {paintTabletop,tabletopStrokeCells,rotateTabletopObject}=load('tabletopCommands')
const {populateEntityModel}=load('scene3dMeshes'),{batchEntityParts}=load('scene3dBatch')
const {masterRenderModel,perceivedRenderModel}=load('scene3dModel')
const stateFor=scene=>({version:1,activeSceneId:scene.id,scenes:[scene]})
function build(o,low=false){
 const group=new THREE.Group(),materials=new Map(),resources=new Set()
 const e={id:o.id,geometry:o,appearance:{color:'#999988',remembered:false,heightKnown:true}}
 group.rotation.y=-(o.facing??0)*Math.PI/180
 populateEntityModel(e,(g,color,x,y,z,s={})=>{
  let material=materials.get(JSON.stringify([color,s]));if(!material){material=new THREE.MeshStandardMaterial({color});materials.set(JSON.stringify([color,s]),material)}
  const part=new THREE.Mesh(g,material);resources.add(g);part.position.set(x,y,z);group.add(part);return part
 },low)
 return {group,resources,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
test('Модульная геометрия: все модели, 4 поворота, изменение размеров и низкое качество укладываются в физические габариты',()=>{
 for(const a of tabletopAssets)for(const low of [false,true])for(const facing of [0,90,180,270])for(const scale of [1,.2]){
  const o=createTabletopObject(a.id,'asset:test',{x:0,y:0,z:0},facing)
  o.width*=scale;o.depth*=scale;o.height*=scale
  const model=build(o,low),b=new THREE.Box3().setFromObject(model.group,true),eps=.003,label=`${a.id}/${facing}/${scale}/${low}`
  assert(b.min.x>=-o.width/2-eps&&b.max.x<=o.width/2+eps,label+' width')
  assert(b.min.z>=-o.depth/2-eps&&b.max.z<=o.depth/2+eps,label+' depth')
  assert(b.min.y>=-eps&&b.max.y<=Math.max(.035,o.height)+eps,label+' height')
  model.group.traverse(p=>{if(p.isMesh){assert(p.geometry.attributes.position.array.every(Number.isFinite),label);assert(p.geometry.attributes.normal.array.every(Number.isFinite),label)}})
  if(!low){const before=b.clone();batchEntityParts(model.group,g=>{model.resources.delete(g);g.dispose()},g=>{model.resources.add(g);return g});const after=new THREE.Box3().setFromObject(model.group,true);assert(before.min.distanceTo(after.min)<.00001&&before.max.distanceTo(after.max)<.00001);assert(model.group.children.length<=14,label+' materials')}
  model.dispose()
 }
})
test('Дверь освобождает проём, окно имеет сквозное отверстие, погашенный огонь не создаёт эмиссию',()=>{
 for(const open of [false,true]){
  const o={...createTabletopObject('timber-door','door',{x:0,y:0,z:0}),open},m=build(o);m.group.updateMatrixWorld(true)
  const ray=new THREE.Raycaster(new THREE.Vector3(0,1.3,2),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(m.group,true).length>0,!open);m.dispose()
 }
 const window=build(createTabletopObject('timber-window','window',{x:0,y:0,z:0}));window.group.updateMatrixWorld(true)
 assert.equal(new THREE.Raycaster(new THREE.Vector3(.25,1.6,2),new THREE.Vector3(0,0,-1)).intersectObject(window.group,true).length,0);window.dispose()
 for(const id of ['candle','fireplace','brazier']){
  let emitters=0
  load('scene3dTabletop').populateTabletopEntity({geometry:{...createTabletopObject(id,'light',{x:0,y:0,z:0}),active:false}},(g,c,x,y,z,s={})=>{if(s.emissive)emitters++;const p=new THREE.Mesh(g);p.position.set(x,y,z);g.dispose();return p})
  assert.equal(emitters,0,id)
 }
})
test('Таверна: цельная редактируемая сцена, четыре фигуры, бюджет геометрии и прежние версии сохранений',()=>{
 const scene=createTavernScene(['a','b','c','d']),state=stateFor(scene),before=structuredClone(state)
 assert(isSceneState(state));assert.equal(scene.tokens.length,4);assert(scene.objects.length<210)
 assert.deepEqual(copySceneState(state),state);assert.deepEqual(state,before)
 let triangles=0,calls=0
 for(const o of scene.objects){const m=build(o);batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g});for(const p of m.group.children){triangles+=(p.geometry.index?.count??p.geometry.attributes.position.count)/3;calls++}m.dispose()}
 assert(triangles<600000,`triangle budget: ${triangles}`);assert(calls<800,`draw-call budget before natural GLBs: ${calls}`)
 const old=createScene(emptyScenes(),'old','Прежняя сцена','top');assert(isSceneState(old));assert.deepEqual(copySceneState(old),old)
 for(const [key,value] of [['asset','untrusted-model'],['facing',45],['facing','90'],['active','true'],['asset','table']]){
  const bad=structuredClone(state);bad.scenes[0].objects[0][key]=value;assert(!isSceneState(bad),`${key}: ${value}`)
 }
})
test('Кисть: непрерывный мазок, замена слоя, повтор без записи, ластик сохраняет мебель и атомарный лимит',()=>{
 let state=createScene(emptyScenes(),'paint','Пол','top'),i=0;const id=()=>`paint:${i++}`
 const cells=tabletopStrokeCells([{x:.1,y:.1,z:0},{x:9.8,y:.1,z:0}],state.scenes[0]);assert.equal(cells.length,5)
 const original=structuredClone(state);state=paintTabletop(state,cells,'floor-wood',id);assert.deepEqual(original.scenes[0].objects,[])
 const before=structuredClone(state),ids=state.scenes[0].objects.map(o=>o.id)
 assert.equal(paintTabletop(state,cells,'floor-wood',id),state)
 state=paintTabletop(state,cells,'floor-stone',id);assert.deepEqual(state.scenes[0].objects.map(o=>o.id),ids);assert.deepEqual(before.scenes[0].objects.map(o=>o.asset),Array(5).fill('floor-wood'))
 const chair=createTabletopObject('chair','chair',{x:1,y:1,z:0});state.scenes[0].objects.push(chair)
 const erased=paintTabletop(state,[cells[0]],null,id);assert.deepEqual(erased.scenes[0].objects.find(o=>o.id==='chair'),chair);assert.equal(erased.scenes[0].objects.length,state.scenes[0].objects.length-1)
 const width=tabletopStrokeCells([{x:5,y:5,z:0}],state.scenes[0],3);assert.equal(width.length,9)
 assert.throws(()=>paintTabletop(state,[{x:1.2,y:1,z:0}],'floor-wood',id));assert.throws(()=>paintTabletop(state,cells,'table',id))
 const full=structuredClone(state);while(full.scenes[0].objects.length<250)full.scenes[0].objects.push(createTabletopObject('chair',id(),{x:15,y:10,z:0}))
 const json=JSON.stringify(full);assert.throws(()=>paintTabletop(full,[{x:11,y:1,z:0}],'floor-wood',id));assert.equal(JSON.stringify(full),json)
})
test('Поворот переносит стоящего на опоре персонажа, сохраняет прямоугольную коллизию и отменяется без потерь',()=>{
 const scene=createTavernScene(),table=scene.objects.find(o=>o.asset==='table');scene.tokens=[{actorId:'a',x:table.x+.4,y:table.y+.1,z:table.height,diameter:.5,support:{kind:'object',objectId:table.id}}]
 const state=stateFor(scene),before=structuredClone(state),next=rotateTabletopObject(state,table.id),turned=next.scenes[0].objects.find(o=>o.id===table.id),token=next.scenes[0].tokens[0]
 assert.equal(turned.width,table.depth);assert.equal(turned.depth,table.width);assert.equal(turned.facing,90);assert.equal(token.x,table.x-.1);assert.equal(token.y,table.y+.4);assert(isSceneState(next));assert.deepEqual(state,before)
 let restored=next;for(let i=0;i<3;i++)restored=rotateTabletopObject(restored,table.id)
 assert.deepEqual(restored.scenes[0].objects,state.scenes[0].objects);assert(Math.abs(restored.scenes[0].tokens[0].y-scene.tokens[0].y)<1e-6);assert(Math.abs(restored.scenes[0].tokens[0].x-scene.tokens[0].x)<1e-6)
})
test('Компоненты и раскрытие сохраняют модель и состояния; запомненная лампа не получает новую информацию',()=>{
 const {create3DSandbox}=load('sandboxCampaign'),{emptyCampaign}=load('rpgSchema'),{projectWorldEntities,restoreWorldEntities}=load('worldEntities')
 const characters=create3DSandbox('tabletop-storage').world.characters,scene=createTavernScene(characters.map(a=>a.id)),state=stateFor(scene),world={characters,campaign:{...emptyCampaign(),scenes:state}}
 const snap=projectWorldEntities(world,4);assert.deepEqual(restoreWorldEntities(snap),world)
 assert(snap.entities.filter(e=>e.kind==='object').some(e=>e.components.geometry.data.asset==='candle'))
 const {publicObject,perceivedMap,isScenePerceptions}=load('scenePerception'),lamp=scene.objects.find(o=>o.asset==='candle'),observed=publicObject(lamp)
 const knowledge={actorId:'observer',activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Раскрытая таверна',description:'',frame:scene,areas:[{id:'known',x:0,y:0,z:0,width:28,depth:24,height:12,visible:true}],objects:[{objectId:lamp.id,visible:false,snapshot:observed}],contacts:[]}]}
 lamp.active=false;lamp.facing=90
 assert(isScenePerceptions({version:1,heroes:[knowledge]}))
 let map=perceivedMap(knowledge,state,characters),entity=perceivedRenderModel(map).entities.find(e=>e.id===lamp.id)
 assert.equal(entity.geometry.active,true);assert.equal(entity.geometry.facing,0);assert(entity.appearance.remembered)
 knowledge.scenes[0].objects[0].visible=true;map=perceivedMap(knowledge,state,characters);entity=perceivedRenderModel(map).entities.find(e=>e.id===lamp.id)
 assert.equal(entity.geometry.active,false);assert.equal(entity.geometry.facing,90)
 assert.equal(masterRenderModel(scene,characters).entities.find(e=>e.id===lamp.id).geometry.asset,'candle')
})

test('Строительство: прямоугольник, стены и комната — одна атомарная команда без дублей',()=>{
 const {rectangleCells,wallLine,buildStrokeMarks,applyBuildStroke}=load('tabletopBuild')
 let state=createScene(emptyScenes(),'room','Комната','top'),i=0;const id=()=>`build-${i++}`,s=state.scenes[0]
 assert.deepEqual(rectangleCells({x:7,y:7,z:0},{x:1,y:1,z:0},s).map(p=>[p.x,p.y]),rectangleCells({x:1,y:1,z:0},{x:7,y:7,z:0},s).map(p=>[p.x,p.y]))
 const line=wallLine({x:2,y:2,z:0},{x:2,y:8,z:0},s);assert.equal(line.length,3);assert(line.every(p=>p.facing===90&&p.x===2))
 const brush={asset:'floor-wood',size:1,mode:'room'},marks=buildStrokeMarks(brush,{x:4,y:4,z:0},{x:8,y:8,z:0},s),original=structuredClone(state)
 state=applyBuildStroke(state,marks,brush,id);assert.deepEqual(original.scenes[0].objects,[]);assert(isSceneState(state))
 assert.equal(state.scenes[0].objects.filter(o=>o.asset==='floor-wood').length,9)
 assert.equal(state.scenes[0].objects.filter(o=>o.kind==='door').length,1)
 assert.equal(state.scenes[0].objects.filter(o=>o.kind==='wall'||o.kind==='door').length,12)
 assert.equal(applyBuildStroke(state,marks,brush,id),state,'Repeating the same room leaves existing modules and the doorway intact')
 const full=structuredClone(state);while(full.scenes[0].objects.length<250)full.scenes[0].objects.push(createTabletopObject('stool',id(),{x:20,y:15,z:0}))
 const before=JSON.stringify(full),other=buildStrokeMarks(brush,{x:12,y:12,z:0},{x:16,y:16,z:0},s)
 assert.throws(()=>applyBuildStroke(full,other,brush,id));assert.equal(JSON.stringify(full),before,'No floor or perimeter may be saved partially')
 assert.throws(()=>buildStrokeMarks(brush,{x:NaN,y:0,z:0},{x:2,y:2,z:0},s))
 assert.throws(()=>rectangleCells({x:0,y:0,z:0},{x:100,y:100,z:0},{width:100,depth:100,groundZ:0}))
})
test('Новая таверна: 4 героя, полный набор модулей, геометрия и копирование состояний',()=>{
 const {createReferenceTavernScene}=load('tabletopShowcase'),{operateSceneObject}=load('tabletopInteractions')
 const scene=createReferenceTavernScene(['a','b','c','d']),state=stateFor(scene)
 assert(isSceneState(state));assert.equal(scene.tokens.length,4);assert(scene.objects.length<230)
 for(const id of ['round-table','timber-pillar','timber-railing','timber-beam','roof-tile','chandelier','torch','trap-fire'])assert(scene.objects.some(o=>o.asset===id),id)
 const door=scene.objects.find(o=>o.kind==='door');Object.assign(door,operateSceneObject(door,'lock'))
 const copied=copySceneState(state),render=masterRenderModel(scene,[]);assert.deepEqual(copied,state);assert.equal(render.entities.find(e=>e.id===door.id).geometry.locked,true)
 assert.throws(()=>operateSceneObject(door,'open'),/заперт/)
 assert.equal(operateSceneObject(operateSceneObject(door,'unlock'),'open').open,true)
 const trap=scene.objects.find(o=>o.asset==='trap-spikes');assert.equal(operateSceneObject(trap,'activate').blocksMovement,true);assert.equal(operateSceneObject(trap,'deactivate').blocksMovement,false)
 let triangles=0,calls=0
 for(const o of scene.objects){const m=build(o);batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g});for(const p of m.group.children){triangles+=(p.geometry.index?.count??p.geometry.attributes.position.count)/3;calls++}m.dispose()}
 assert(triangles<750000,`Triangle budget ${triangles}`);assert(calls<1000,`Material batch budget ${calls}`)
})
