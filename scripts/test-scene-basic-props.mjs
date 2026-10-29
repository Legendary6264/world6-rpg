import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {populateBasicProps} from '../src/scene3dBasicProps.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'
import {createSceneLighting} from '../src/scene3dLighting.ts'

function build(kind,w=2,d=1.2,h=2,flags={},low=false){
 const group=new THREE.Group(),resources=new Set(),materials=new Map(),entity={id:'basic:'+kind,geometry:{kind,width:w,depth:d,height:h,...flags},appearance:{color:'#98a38a',heightKnown:true,remembered:false},interaction:{kind:'object',id:kind}}
 populateBasicProps(entity,(geometry,color,x,y,z,surface={})=>{
  const key=JSON.stringify([color,surface]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,emissive:surface.emissive??'#000000',transparent:surface.opacity<1,opacity:surface.opacity??1,side:THREE.FrontSide});material.userData.lightEmitter=!!surface.emissive;material.userData.castsShadow=surface.castShadow!==false;materials.set(key,material)}
  const part=new THREE.Mesh(geometry,material);part.position.set(x,y,z);part.userData.surface=surface;resources.add(geometry);group.add(part);return part
 },low)
 group.updateMatrixWorld(true)
 return {group,entity,resources,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const parts=(model,name)=>model.group.children.filter(p=>p.geometry.name===name)
const ray=(model,origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(model.group,true)[0]

test('Базовая дверь: полноценная створка и фурнитура на петлях освобождают проём без сжатия геометрии',()=>{
 for(const low of [false,true]){
  const closed=build('door',2,.35,3.6,{},low),open=build('door',2,.35,3.6,{open:true},low)
  assert(ray(closed,[0,1.5,2],[0,0,-1]));assert.equal(ray(open,[0,1.5,2],[0,0,-1]),undefined)
  const a=parts(closed,'basic-door-leaf-board'),b=parts(open,'basic-door-leaf-board');assert(a.length>=4);assert.equal(a.length,b.length)
  for(let i=0;i<a.length;i++)assert.deepEqual(b[i].geometry.attributes.position.array,a[i].geometry.attributes.position.array,'The opened leaf retains the original boards')
  const bounds=new THREE.Box3();b.forEach(p=>bounds.union(new THREE.Box3().setFromObject(p,true)));assert(bounds.max.z-bounds.min.z>1.3,'The full leaf swings along depth rather than becoming a narrow strip')
  assert(parts(open,'basic-door-strap').every(p=>Math.abs(p.quaternion.y)>.6),'Straps rotate with the leaf')
  const plate=parts(closed,'basic-door-keyplate')[0],hole=new THREE.Raycaster(new THREE.Vector3(plate.position.x,plate.position.y-.125*3.6*.12,2),new THREE.Vector3(0,0,-1)).intersectObject(plate,true)
  assert.equal(hole.length,0,'The escutcheon has an actual keyhole')
  closed.dispose();open.dispose()
 }
 const locked=build('door',2,.35,3.6,{locked:true});assert.equal(parts(locked,'basic-padlock-body').length,1);locked.dispose()
})
test('Базовый контейнер: четыре стенки, реальное дно, полость и крышка прежнего размера в открытом состоянии',()=>{
 for(const low of [false,true]){
  const closed=build('crate',1.6,1.1,1.2,{},low),open=build('crate',1.6,1.1,1.2,{open:true},low)
  const top=ray(closed,[0,4,0],[0,-1,0]),bottom=ray(open,[0,4,0],[0,-1,0])
  assert(top.point.y>1.1);assert(bottom.point.y<.15,'An open container exposes the bottom, not an opaque inner cube');assert.equal(bottom.object.geometry.name,'basic-container-floor')
  assert(ray(open,[0,.5,0],[1,0,0]));assert(ray(open,[0,.5,0],[-1,0,0]));assert(ray(open,[0,.5,0],[0,0,1]));assert(ray(open,[0,.5,0],[0,0,-1]))
  const a=parts(closed,'basic-container-lid-board'),b=parts(open,'basic-container-lid-board');assert.equal(a.length,b.length)
  for(let i=0;i<a.length;i++)assert.deepEqual(a[i].geometry.attributes.position.array,b[i].geometry.attributes.position.array)
  assert(b.every(p=>Math.abs(p.quaternion.x)>.7),'Lid boards follow the hinge pose')
  closed.dispose();open.dispose()
 }
 const locked=build('crate',1.6,1.1,1.2,{locked:true});assert.equal(parts(locked,'basic-padlock-body').length,1);locked.dispose()
})
test('Базовый фонарь: горелка, стекло и огонь; погашенный источник не светится и не создаёт свет',()=>{
 for(const low of [false,true]){
  const lit=build('lamp',.65,.65,2.8,{},low),off=build('lamp',.65,.65,2.8,{active:false},low),panes=parts(lit,'basic-lantern-pane'),flame=parts(lit,'basic-lantern-flame')[0]
  assert.equal(panes.length,4);assert(panes.every(p=>p.material.transparent&&p.material.opacity<.2&&!p.userData.surface.castShadow))
  assert(flame);assert(parts(off,'basic-lantern-burner').length);assert(!off.group.children.some(p=>p.material.userData.lightEmitter))
  const view=createSceneLighting({id:'lamp',width:10,depth:10,groundZ:0,minZ:-2,maxZ:10},'night','balanced',false),anchor=new THREE.Group();view.addLamp(lit.entity,anchor)
  const point=anchor.children[0],flameBounds=new THREE.Box3().setFromObject(flame,true);assert(point.isPointLight);assert(point.position.y>=flameBounds.min.y&&point.position.y<=flameBounds.max.y,'The actual light sits inside the flame')
  const dark=new THREE.Group();view.addLamp(off.entity,dark);assert.equal(dark.children.length,0)
  batchEntityParts(lit.group,g=>{lit.resources.delete(g);g.dispose()},g=>{lit.resources.add(g);return g})
  assert(lit.group.children.filter(p=>p.material.transparent||p.material.userData.lightEmitter).every(p=>!p.castShadow),'Glass and flame cannot become opaque light blockers')
  view.dispose();lit.dispose();off.dispose()
 }
})
test('Базовые предметы: закрытые габариты, конечные нормали, состояния и материал сохраняются после batching',t=>{
 for(const kind of ['door','crate','lamp'])for(const low of [false,true])for(const [w,d,h] of [[2,1.2,2],[2,.35,3.6],[.3,.1,.2],[.1,2,.035]]){
  const model=build(kind,w,d,h,{},low),bounds=new THREE.Box3().setFromObject(model.group,true),epsilon=.002
  assert(bounds.min.x>=-w/2-epsilon&&bounds.max.x<=w/2+epsilon,kind+' width');assert(bounds.min.z>=-d/2-epsilon&&bounds.max.z<=d/2+epsilon,kind+' depth');assert(bounds.min.y>=-epsilon&&bounds.max.y<=Math.max(.035,h)+epsilon,kind+' height')
  let triangles=0;model.group.traverse(p=>{if(!p.isMesh)return;triangles+=(p.geometry.index?.count??p.geometry.attributes.position.count)/3;for(const key of ['position','normal'])assert(p.geometry.attributes[key].array.every(Number.isFinite))})
  assert(triangles<(low?7000:25000),kind+' geometry budget')
  batchEntityParts(model.group,g=>{model.resources.delete(g);g.dispose()},g=>{model.resources.add(g);return g})
  const after=new THREE.Box3().setFromObject(model.group,true);assert(bounds.min.distanceTo(after.min)<1e-6&&bounds.max.distanceTo(after.max)<1e-6)
  assert(model.group.children.length<=16,kind+' material budget')
  if(w===2&&d===1.2)t.diagnostic(`${kind} ${low?'low':'detailed'}: ${triangles} triangles / ${model.group.children.length} material batches`)
  model.dispose()
 }
 assert.equal(populateBasicProps({geometry:{kind:'tree'}},()=>{throw Error('not a prop')}),false)
})
