import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {populateCraftedEntity} from '../src/scene3dCrafted.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'
import {createSceneLighting,createLightingEnvironment} from '../src/scene3dLighting.ts'
import {populateFigure,populateWater} from '../src/scene3dOrganic.ts'
import {defaultLightTuning,normalizeLightTuning,lightDirection,readViewLightSettings,saveViewLightSettings} from '../src/scene3dViewSettings.ts'
import {reliefPlate,flutedColumn} from '../src/scene3dRelief.ts'
import {SceneContactPass,withContactGeometry} from '../src/scene3dContact.ts'

function build(kind,w,d,h,open=false){
 const group=new THREE.Group(),materials=new Map(),resources=new Set()
 const entity={id:'detail:'+kind,geometry:{kind,width:w,depth:d,height:h,open},appearance:{remembered:false,heightKnown:true,color:'#78baa5'}}
 const populate=kind==='actor'?populateFigure:kind==='water'?populateWater:populateCraftedEntity
 populate(entity,(geometry,color,x,y,z,options={})=>{
  const key=JSON.stringify([color,options]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,roughness:options.roughness??.85,metalness:options.metalness??0,transparent:options.opacity<1,opacity:options.opacity??1,side:THREE.DoubleSide});material.userData.lightEmitter=!!options.emissive;material.userData.castsShadow=options.castShadow!==false;materials.set(key,material)}
  resources.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh);return mesh
 })
 return {group,resources,dispose(){resources.forEach(r=>r.dispose());materials.forEach(m=>m.dispose())}}
}
test('Детальная геометрия: нормальные и узкие габариты, конечные вершины, открытая дверь',()=>{
 for(const kind of ['wall','door','crate','platform','lamp'])for(const [w,d,h] of [[2,2,2],[1.5,1.1,1.1],[2,.35,3.6],[.65,.65,2.8],[.3,.1,.2]]){
  const model=build(kind,w,d,h),bounds=new THREE.Box3().setFromObject(model.group,true),epsilon=.002
  assert(bounds.min.x>=-w/2-epsilon&&bounds.max.x<=w/2+epsilon,`${kind} ${w},${d},${h} width`)
  assert(bounds.min.z>=-d/2-epsilon&&bounds.max.z<=d/2+epsilon,`${kind} depth`)
  assert(bounds.min.y>=-epsilon&&bounds.max.y<=h+epsilon,`${kind} height`)
  model.group.traverse(p=>{if(p.isMesh)assert(p.geometry.getAttribute('position').array.every(Number.isFinite))})
  model.dispose()
 }
 for(const open of [false,true]){
  const door=build('door',2,.35,3.6,open);door.group.updateMatrixWorld(true)
  const ray=new THREE.Raycaster(new THREE.Vector3(0,1,2),new THREE.Vector3(0,0,-1))
  assert.equal(ray.intersectObject(door.group,true).length>0,!open,'The opened leaf clears the central opening')
  door.dispose()
 }
})
test('Объединение деталей сохраняет силуэт и материал, сокращает число мешей, стекло пропускает свет',()=>{
 for(const kind of ['wall','door','crate','platform','lamp','actor','water']){
  const model=build(kind,2,2,2),before=new THREE.Box3().setFromObject(model.group,true),parts=model.group.children.length
  const old=new Set(model.resources);let released=0
  old.forEach(g=>g.addEventListener('dispose',()=>released++))
  batchEntityParts(model.group,g=>{model.resources.delete(g);g.dispose()},g=>{model.resources.add(g);return g})
  const after=new THREE.Box3().setFromObject(model.group,true)
  assert(before.min.distanceTo(after.min)<.00001&&before.max.distanceTo(after.max)<.00001,kind+' silhouette')
  assert.equal(released,old.size);assert(model.group.children.length<=parts);if(kind!=='water')assert(model.group.children.length<parts);assert(model.group.children.length<=16,kind+' draw call budget')
  if(kind==='lamp')assert(model.group.children.filter(m=>m.material.transparent||m.material.userData.lightEmitter).every(m=>!m.castShadow),'Glass/emitter must not black out the point light')
  if(kind==='water')assert(model.group.children.every(m=>!m.castShadow),'The pool never casts an opaque shadow after batching')
  model.dispose()
 }
})

test('Фигурки и вода: размер, складки плаща, рельеф волн и нормали вверх',()=>{
 for(const kind of ['actor','water'])for(const [w,d,h] of [[2,2,2],[.8,.8,1.7],[2,.35,3.6],[.3,.1,.2],[6,4,0]]){
  if(kind==='actor'&&h===0)continue
  const model=build(kind,w,d,h),bounds=new THREE.Box3().setFromObject(model.group,true),epsilon=.002
  assert(bounds.min.x>=-w/2-epsilon&&bounds.max.x<=w/2+epsilon,`${kind} width ${w}`)
  assert(bounds.min.z>=-d/2-epsilon&&bounds.max.z<=d/2+epsilon,`${kind} depth ${d}`)
  assert(bounds.min.y>=-epsilon&&bounds.max.y<=Math.max(.035,h)+epsilon,`${kind} height ${h}`)
  model.group.traverse(p=>{if(p.isMesh)assert(p.geometry.getAttribute('position').array.every(Number.isFinite))})
  if(kind==='actor'){
   const cape=model.group.children.at(-1).geometry,p=cape.getAttribute('position')
   assert(p.count>400);assert(Math.max(...Array.from({length:25},(_,i)=>p.getZ(p.count-25+i)))-Math.min(...Array.from({length:25},(_,i)=>p.getZ(p.count-25+i)))>d*.02,'Cape is a curved folded surface')
  }else{
   const surface=model.group.children[0].geometry,p=surface.getAttribute('position'),n=surface.getAttribute('normal')
   assert(p.count>1500);const heights=Array.from({length:p.count},(_,i)=>p.getY(i));assert(Math.max(...heights)-Math.min(...heights)>.001,'Waves are real vertex relief')
   assert(Array.from({length:n.count},(_,i)=>n.getY(i)).filter(y=>y>.9).length>n.count*.95,'Water receives sky lighting from above')
  }
  model.dispose()
 }
 let called=false;assert.equal(populateFigure({geometry:{kind:'actor'},appearance:{heightKnown:false}},()=>{called=true}),false);assert(!called)
})

test('Свет: смена направления и мощности без замены источников; фонари возвращаются из рабочего режима',()=>{
 const view=createSceneLighting(frame,'studio','high',false),anchor=new THREE.Group(),camera=new THREE.PerspectiveCamera();camera.position.set(4,5,6)
 view.addLamp(lamp,anchor);const key=view.group.getObjectByProperty('isDirectionalLight',true),group=view.group
 const tuning={...defaultLightTuning('night'),azimuth:90,elevation:30,sun:.5,ambient:.4,lamps:1.5},target=new THREE.Vector3(2,0,3)
 view.configure('night',tuning);view.update(camera,target)
 assert.equal(view.group,group);assert.equal(view.group.getObjectByProperty('isDirectionalLight',true),key)
 assert(Math.abs(key.intensity-.31)<.00001);assert(Math.abs(view.environmentIntensity-.048)<.00001)
 const direction=key.position.clone().sub(key.target.position).normalize(),expected=lightDirection(tuning)
 assert(direction.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))<.00001)
 const point=anchor.children[0];assert.equal(point.intensity,57);assert(point.castShadow)
 let released=0;point.shadow.map={dispose(){released++}};view.configure('studio',defaultLightTuning('studio'))
 assert.equal(released,1);assert.equal(anchor.children.length,0);assert(!point.castShadow)
 view.configure('night',tuning);assert.equal(anchor.children[0],point,'Reuses the same local lamp')
 view.configure('night',{...tuning,lamps:0});assert.equal(anchor.children.length,0)
 const env=createLightingEnvironment('night',tuning),uniforms=env.scene.children[0].material.uniforms
 assert(uniforms.sunDirection.value.distanceTo(direction)<.00001);assert.equal(uniforms.sunPower.value,.3);env.dispose();view.dispose()
})

test('Настройки света: повреждённые данные, ограничения и недоступное хранилище',()=>{
 const oldWindow=globalThis.window;let raw='invalid'
 try{
  globalThis.window={localStorage:{getItem:()=>raw,setItem:(key,value)=>{raw=value}}}
  assert.equal(readViewLightSettings().mode,'day')
  raw=JSON.stringify({version:1,mode:'night',tuning:{azimuth:-25,elevation:900,sun:'3',ambient:1.2,lamps:40},exposure:8})
  const restored=readViewLightSettings();assert.deepEqual(restored.tuning,{azimuth:0,elevation:85,sun:1,ambient:1.2,lamps:3,softness:1,contact:.55});assert.equal(restored.exposure,1.6)
  assert.equal(normalizeLightTuning({softness:90,contact:-1},'day').softness,3);assert.equal(normalizeLightTuning({softness:0,contact:-1},'day').contact,0)
  assert.deepEqual(normalizeLightTuning({sun:Infinity,ambient:NaN},'studio'),defaultLightTuning('studio'))
  saveViewLightSettings({...restored,exposure:1.15});assert.equal(readViewLightSettings().exposure,1.15)
  globalThis.window={get localStorage(){throw Error('blocked')}};assert.doesNotThrow(()=>saveViewLightSettings(restored));assert.equal(readViewLightSettings().exposure,1)
 }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow}
})

test('Тени: привязка к текселям, точность вблизи, мягкость и освобождение неиспользуемых карт',()=>{
 const tuning=defaultLightTuning('day'),view=createSceneLighting({...frame,minZ:-2,maxZ:12},'day','high',false,tuning)
 const camera=new THREE.PerspectiveCamera(),target=new THREE.Vector3(7,0,6),offset=new THREE.Vector3(4,3,4)
 camera.position.copy(target).add(offset);view.update(camera,target)
 const key=view.group.getObjectByProperty('isDirectionalLight',true),c=key.shadow.camera,texel=(c.right-c.left)/key.shadow.mapSize.x
 const direction=key.position.clone().sub(key.target.position).normalize(),right=new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP,direction).normalize(),start=key.target.position.clone()
 const pan=start.clone().addScaledVector(right,texel*.2);camera.position.copy(pan).add(offset);view.update(camera,pan)
 assert(key.target.position.distanceTo(start)<1e-8,'A sub-texel camera pan does not slide the shadow projection')
 const moved=start.clone().addScaledVector(right,texel*3);camera.position.copy(moved).add(offset);view.update(camera,moved)
 assert(Math.abs(key.target.position.clone().sub(start).dot(right)/texel-3)<1e-7)
 const nearBias=key.shadow.normalBias;assert(nearBias<.006);assert(c.near>0&&c.far>c.near)
 camera.position.set(100,80,100);view.update(camera,target);assert(key.shadow.normalBias>=nearBias)
 const radius=key.shadow.radius;view.configure('day',{...tuning,softness:2});assert.equal(key.shadow.radius,radius*2)
 let disposed=0;key.shadow.map={dispose(){disposed++}};view.configure('day',{...tuning,sun:0});assert(!key.castShadow);assert.equal(disposed,1)
 view.dispose()
 const night=createSceneLighting(frame,'night','balanced',false),anchors=[new THREE.Group(),new THREE.Group()]
 anchors[1].position.x=30;anchors.forEach(g=>night.addLamp(lamp,g));camera.position.set(0,2,0);night.update(camera,new THREE.Vector3())
 const first=anchors[0].children[0];assert(first.castShadow);first.shadow.map={dispose(){disposed++}}
 camera.position.set(30,2,0);night.update(camera,new THREE.Vector3());assert(!first.castShadow);assert(anchors[1].children[0].castShadow);assert.equal(disposed,2);night.dispose()
})

test('Рабочий свет: два широких софтбокса, сохранение источников и отсутствие в ограниченном обзоре',()=>{
 const view=createSceneLighting(frame,'studio','high',false),lights=view.group.children.filter(o=>o.isRectAreaLight)
 assert.equal(lights.length,2);assert(lights.every(l=>l.visible&&l.width>5&&l.height>5&&!l.castShadow))
 const uniforms=THREE.UniformsLib.LTC_HALF_1,second=createSceneLighting(frame,'studio','balanced',false)
 assert.equal(THREE.UniformsLib.LTC_HALF_1,uniforms,'Shared area-light textures are initialized once')
 view.configure('day',defaultLightTuning('day'));assert(lights.every(l=>!l.visible))
 view.configure('studio',{...defaultLightTuning('studio'),ambient:.5});assert.equal(lights[0].intensity,.9)
 for(const [quality,restricted] of [['low',false],['high',true]]){
  const safe=createSceneLighting(frame,'studio',quality,restricted);assert(!safe.group.children.some(l=>l.isRectAreaLight));safe.dispose()
 }
 view.dispose();second.dispose()
})

test('Рельеф: изогнутая замкнутая пластина и профилированная колонна с каннелюрами',()=>{
 const plate=reliefPlate(.44,.5,.08),p=plate.getAttribute('position'),cols=25,rows=19
 assert(p.count>=900);assert(p.getZ(12)>p.getZ(0)+.04,'The breastplate has a raised curved front')
 assert(p.getZ(12)-p.getZ(cols*rows+12)>.01,'The plate has actual wall thickness')
 const column=flutedColumn(.1,1),q=column.getAttribute('position'),mid=7*65,radii=Array.from({length:65},(_,i)=>Math.hypot(q.getX(mid+i),q.getZ(mid+i)))
 assert(Math.max(...radii)-Math.min(...radii)>.005,'Flutes change the shaft silhouette')
 for(const geometry of [plate,column]){assert(geometry.getAttribute('position').array.every(Number.isFinite));assert(geometry.getAttribute('normal').array.every(Number.isFinite));geometry.dispose()}
})

test('Фигурка: глаза открыты, ткань не выступает сквозь нагрудник',()=>{
 const w=.85,h=1.7,bw=Math.min(w,h*.52),bd=Math.min(w,h*.34),model=build('actor',w,w,h);model.group.updateMatrixWorld(true)
 const materialAt=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,bd*.45),new THREE.Vector3(0,0,-1)).intersectObject(model.group,true)[0]?.object.material.color.getHexString()
 for(const side of [-1,1]){
  assert.equal(materialAt(side*bw*.048,h*.905),'393932','The iris is in front of skin and below the hairline')
  assert.equal(materialAt(side*bw*.045,h*.735),'89958e','The chestplate is in front of the underlying tunic')
 }
 model.dispose()
})

test('Фигурка: раздельные пальцы, открытые глазницы, вогнутая ушная раковина и свод обуви',()=>{
 const w=.85,h=1.7,bw=Math.min(w,h*.52),bd=Math.min(w,h*.34),baseTop=Math.min(.035,h*.03)+.00025,model=build('actor',w,w,h)
 model.group.updateMatrixWorld(true)
 const frontHit=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,bd*.45),new THREE.Vector3(0,0,-1)).intersectObject(model.group,true)[0]
 for(const side of [-1,1]){
  for(let finger=0;finger<4;finger++)assert.equal(frontHit(bw*(side*.29+(finger-1.5)*.021),h*.456)?.object.material.color.getHexString(),'bda58c','Four fingers each have a visible independent surface')
  for(let gap=0;gap<3;gap++)assert.notEqual(frontHit(bw*(side*.29+(gap-1)*.021),h*.456)?.object.material.color.getHexString(),'bda58c','Light can pass between fingers below the palm')
  const ear=model.group.children.find(p=>p.geometry.name==='figure-ear'&&Math.sign(new THREE.Box3().setFromObject(p).getCenter(new THREE.Vector3()).x)===side)
  const earX=y=>new THREE.Raycaster(new THREE.Vector3(side*bw*.2,h*y,bd*.015),new THREE.Vector3(-side,0,0)).intersectObject(ear)[0]?.point.x*side
  assert(earX(.909)>earX(.89)+bw*.012,'The rolled ear rim stands proud of its recessed concha')
  const underside=z=>new THREE.Raycaster(new THREE.Vector3(side*bw*.13,baseTop+h*.0005,bd*z),new THREE.Vector3(0,1,0),0,h*.03).intersectObject(model.group,true)[0]?.point.y-baseTop
  assert(underside(.01)>underside(.158)+h*.008,'The waist of the sole is above its forefoot contact')
  assert(underside(.01)>underside(-.083)+h*.008,'The heel is a separate solid contact below the arch')
 }
 assert(frontHit(0,h*.891).point.z>bd*.19,'The nose has a projecting bridge and tip rather than a painted mark')
 model.dispose()
})

test('Фигурка: новые объёмные формы замкнуты, имеют наружные нормали и укладываются в бюджет',()=>{
 const model=build('actor',.85,.85,1.7),closed=new Set(['figure-tunic','figure-boot-upper','figure-boot-welt','figure-boot-forefoot','figure-boot-heel','figure-bracer','figure-hand-palm','figure-finger','figure-thumb','figure-ear','figure-belt-pouch','figure-head','figure-nose','figure-shoulder-strap'])
 let triangles=0
 for(const part of model.group.children){
  const g=part.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),index=g.index,count=index?.count??p.count
  triangles+=count/3
  assert(n.array.every(Number.isFinite),'All figure normals remain finite')
  if(!closed.has(g.name))continue
  const edgeCounts=new Map(),directions=new Map(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(','),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let volume=0
  for(let i=0;i<count;i+=3){
   const ia=index?index.getX(i):i,ib=index?index.getX(i+1):i+1,ic=index?index.getX(i+2):i+2
   a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic)
   if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()<1e-20)continue
   volume+=a.dot(b.clone().cross(c))/6
   for(const [from,to] of [[ia,ib],[ib,ic],[ic,ia]]){
    const edge=[key(from),key(to)].sort().join('|');edgeCounts.set(edge,(edgeCounts.get(edge)??0)+1);directions.set(edge,(directions.get(edge)??0)+(key(from)<key(to)?1:-1))
   }
  }
  assert([...edgeCounts.values()].every(v=>v===2),g.name+' is a closed two-manifold after welding its UV seam')
  assert([...directions.values()].every(v=>v===0),g.name+' closes each boundary with consistent face winding')
  assert(volume>1e-10,g.name+' has outward winding and positive enclosed volume')
 }
 assert(triangles<38000,'Detailed hands and face stay within 38k triangles per figure')
 batchEntityParts(model.group,g=>{model.resources.delete(g);g.dispose()},g=>{model.resources.add(g);return g})
 assert(model.group.children.length<=12,'Repeated skin, leather and trim reuse material batches')
 model.dispose()
})

test('Контактный проход: прозрачность, листва и подсветка не становятся сплошными заслонками; состояние восстанавливается',()=>{
 const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),materials=[new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial({transparent:true,opacity:.2}),new THREE.MeshStandardMaterial({alphaTest:.5}),new THREE.MeshStandardMaterial()]
 materials[3].userData.lightEmitter=true
 const objects=materials.map(m=>new THREE.Mesh(geometry,m));objects.forEach(o=>scene.add(o))
 const line=new THREE.Line(geometry,new THREE.LineBasicMaterial());scene.add(line)
 const hidden=new THREE.Mesh(geometry,materials[0]);hidden.visible=false;scene.add(hidden)
 assert.throws(()=>withContactGeometry(scene,()=>{assert(objects[0].visible);assert(objects.slice(1).every(o=>!o.visible));assert(!line.visible);throw Error('render failed')}),/render failed/)
 assert(objects.every(o=>o.visible));assert(line.visible);assert(!hidden.visible)
 let geometryPasses=0,quadPasses=0
 const pass=new SceneContactPass(scene,new THREE.PerspectiveCamera(),32,32),read=new THREE.WebGLRenderTarget(32,32),write=read.clone(),clearColor=new THREE.Color(),renderer={
  autoClear:true,shadowMap:{autoUpdate:true,needsUpdate:true},getClearColor:color=>color.copy(clearColor),getClearAlpha:()=>1,setClearColor:color=>clearColor.set(color),setClearAlpha(){},setRenderTarget(){},clear(){},
  render(subject){assert.equal(this.shadowMap.autoUpdate,false);assert.equal(this.shadowMap.needsUpdate,false);if(subject===scene){geometryPasses++;assert(objects[0].visible);assert(!objects[1].visible);assert(!line.visible)}else quadPasses++}
 }
 pass.render(renderer,write,read,0,false);assert(objects.every(o=>o.visible));assert(line.visible);assert(renderer.shadowMap.autoUpdate&&renderer.shadowMap.needsUpdate);assert.equal(scene.overrideMaterial,null)
 assert.equal(geometryPasses,1);const beforeQuads=quadPasses
 pass.render(renderer,write,read,0,false);assert.equal(geometryPasses,1,'Static geometry reuses the filtered AO map');assert.equal(quadPasses-beforeQuads,2,'Fresh beauty is blended with cached contact shadow')
 pass.camera.position.x=1;pass.render(renderer,write,read,0,false);assert.equal(geometryPasses,2,'Camera movement invalidates the map even without an explicit flag')
 pass.needsUpdate=true;pass.render(renderer,write,read,0,false);assert.equal(geometryPasses,3,'Object changes invalidate the contact map')
 pass.setSize(24,24);pass.render(renderer,write,read,0,false);assert.equal(geometryPasses,4,'Resize discards the previous map')
 assert(renderer.autoClear&&renderer.shadowMap.autoUpdate&&renderer.shadowMap.needsUpdate)
 let freed=0;pass.gtaoMaterial.addEventListener('dispose',()=>freed++);pass.blendMaterial.addEventListener('dispose',()=>freed++);pass.dispose();assert.equal(freed,2)
 geometry.dispose();materials.forEach(m=>m.dispose());line.material.dispose();read.dispose();write.dispose()
})
const frame={width:14,depth:12,groundZ:0},lamp={geometry:{width:.65,depth:.65,height:2.8},appearance:{remembered:false}}
test('Освещение: ночные локальные источники, бюджет теней, движение фонаря и приватность',()=>{
 const night=createSceneLighting(frame,'night','balanced',false),camera=new THREE.PerspectiveCamera();camera.position.set(7,4,11)
 const anchors=Array.from({length:4},(_,i)=>{const g=new THREE.Group();g.position.x=i*4;night.addLamp(lamp,g);return g})
 night.update(camera,new THREE.Vector3(7,1,5))
 const lamps=anchors.flatMap(g=>g.children.filter(c=>c.isPointLight))
 assert.equal(lamps.length,4);assert.equal(lamps.filter(l=>l.castShadow).length,1)
 const first=lamps[0].getWorldPosition(new THREE.Vector3());anchors[0].position.x+=2
 assert.equal(lamps[0].getWorldPosition(new THREE.Vector3()).x,first.x+2)
 const hidden=createSceneLighting(frame,'night','high',true),anchor=new THREE.Group();hidden.addLamp(lamp,anchor)
 assert.equal(anchor.children.length,0);hidden.group.traverse(o=>{if(o.isLight)assert(!o.castShadow)})
 const remembered=new THREE.Group();night.addLamp({...lamp,appearance:{remembered:true}},remembered);assert.equal(remembered.children.length,0)
 const studio=createSceneLighting(frame,'studio','high',false),neutral=new THREE.Group();studio.addLamp(lamp,neutral);assert.equal(neutral.children.length,0)
 night.dispose();hidden.dispose();studio.dispose()
 for(const mode of ['day','night','studio']){const env=createLightingEnvironment(mode);assert(env.scene.isScene);env.dispose()}
})

test('Таверна: восемь ближайших источников из большого набора, два теневых бюджета и смена области обзора',()=>{
 const lighting=createSceneLighting(frame,'tavern','balanced',false,defaultLightTuning('tavern'))
 const entries=Array.from({length:24},(_,i)=>{const anchor=new THREE.Group();anchor.position.set(i*2,0,0);lighting.addLamp({...lamp,geometry:{...lamp.geometry,asset:i===22?'chandelier':'candle'}},anchor);return anchor})
 const camera=new THREE.PerspectiveCamera();camera.position.set(44,4,3);lighting.update(camera,new THREE.Vector3(44,0,0))
 let active=entries.flatMap(g=>g.children.filter(p=>p.isPointLight));assert.equal(active.length,8);assert(entries[22].children.some(p=>p.isPointLight));assert.equal(active.filter(p=>p.castShadow).length,1)
 assert.equal(entries[0].children.length,0,'Far lamps release their active slots')
 lighting.update(camera,new THREE.Vector3());active=entries.flatMap(g=>g.children.filter(p=>p.isPointLight));assert.equal(active.length,8);assert(entries[0].children.some(p=>p.isPointLight));assert.equal(entries[23].children.length,0)
 entries[0].visible=false;lighting.update(camera,new THREE.Vector3());assert.equal(entries[0].children.length,0,'Hidden editor lights release active slots');assert.equal(entries.flatMap(g=>g.children.filter(p=>p.isPointLight)).length,8);
 lighting.configure('night',{...defaultLightTuning('night'),lamps:0});assert(entries.every(g=>g.children.length===0));lighting.dispose()
})
test('Тени интерьера: камин важнее ближайшей свечи, скрытый родитель освобождает карту и колебания камеры не меняют выбор',()=>{
 const lighting=createSceneLighting(frame,'tavern','balanced',false),camera=new THREE.PerspectiveCamera();camera.position.set(0,4,8)
 const candle=new THREE.Group(),fireplace=new THREE.Group(),parent=new THREE.Group();candle.position.set(0,0,4);fireplace.position.set(3,0,0);parent.add(fireplace)
 lighting.addLamp({...lamp,geometry:{asset:'candle',width:.42,depth:.42,height:.62}},candle)
 lighting.addLamp({...lamp,geometry:{asset:'fireplace',width:1.8,depth:.8,height:2.3}},fireplace)
 const target=new THREE.Vector3();lighting.update(camera,target)
 const small=candle.children.find(l=>l.isPointLight),main=fireplace.children.find(l=>l.isPointLight)
 assert(main.castShadow);assert(!small.castShadow);let released=0;main.shadow.map={dispose(){released++}}
 for(let i=0;i<10;i++){camera.position.x=i%2?.02:-.02;lighting.update(camera,target);assert(main.castShadow);assert.equal(released,0)}
 parent.visible=false;lighting.update(camera,target);assert(!main.parent);assert(small.castShadow);assert.equal(released,1)
 parent.visible=true;lighting.update(camera,target);assert(main.parent===fireplace);assert(main.castShadow);assert(!small.castShadow)
 lighting.dispose()
})
