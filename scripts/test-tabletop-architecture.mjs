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
const {createTabletopObject}=load('tabletopCatalog'),{populateEntityModel}=load('scene3dMeshes'),{batchEntityParts}=load('scene3dBatch')
function build(id,low=false,size={}){
 const geometry={...createTabletopObject(id,'test',{x:0,y:0,z:0}),...size},group=new THREE.Group(),resources=new Set(),materials=new Map()
 populateEntityModel({id:'test',geometry,appearance:{color:'#999988',heightKnown:true}},(g,color,x,y,z,options={})=>{
  const key=JSON.stringify([color,options]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:options.doubleSided?THREE.DoubleSide:THREE.FrontSide});material.userData.castsShadow=options.castShadow!==false;materials.set(key,material)}
  resources.add(g);const part=new THREE.Mesh(g,material);part.position.set(x,y,z);group.add(part);return part
 },low)
 group.updateMatrixWorld(true)
 return {group,geometry,resources,dispose(){resources.forEach(r=>r.dispose());materials.forEach(r=>r.dispose())}}
}
function assertClosedSolid(g){
 const p=g.getAttribute('position'),idx=g.index,count=idx?.count??p.count,edges=new Map(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3()
 const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');let volume=0
 for(let i=0;i<count;i+=3){
  const ia=idx?idx.getX(i):i,ib=idx?idx.getX(i+1):i+1,ic=idx?idx.getX(i+2):i+2
  a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic)
  if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()<1e-20)continue
  volume+=a.dot(b.clone().cross(c))/6
  for(const [from,to] of [[ia,ib],[ib,ic],[ic,ia]]){
   const ka=key(from),kb=key(to),edge=ka<kb?ka+'|'+kb:kb+'|'+ka,value=edges.get(edge)??[0,0]
   value[0]++;value[1]+=ka<kb?1:-1;edges.set(edge,value)
  }
 }
 assert([...edges.values()].every(([count,direction])=>count===2&&direction===0),g.name+' closes every welded edge with consistent winding')
 assert(volume>1e-8,g.name+' encloses positive volume with outward faces')
}

test('Резной столб: продольные каннелюры меняют силуэт, стержень и обе торцевые крышки замкнуты',()=>{
 const model=build('timber-pillar'),g=model.geometry,shaft=model.group.children.find(m=>m.geometry.name==='timber-carved-shaft')
 assertClosedSolid(shaft.geometry)
 const radii=Array.from({length:128},(_,i)=>{
  const angle=i/128*Math.PI*2,direction=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)),origin=direction.clone().multiplyScalar(g.width).setY(g.height*.49)
  const hit=new THREE.Raycaster(origin,direction.clone().negate()).intersectObject(shaft,true)[0]
  assert(hit,'The column retains an outward-facing wood surface at every sampled angle')
  return Math.hypot(hit.point.x,hit.point.z)
 })
 assert(Math.max(...radii)-Math.min(...radii)>g.width*.02,'Carved recesses are physical cuts, rather than texture stripes')
 const leaves=model.group.children.filter(m=>m.geometry.name==='timber-capital-leaf')
 assert.equal(leaves.length,8);assert(leaves.every(m=>new THREE.Box3().setFromObject(m).max.y<g.height*.95))
 model.dispose()
})

test('Черепичная крыша: ряды перекрываются физически, наружные грани и торцы имеют толщину',()=>{
 for(const low of [false,true]){
  const model=build('roof-tile',low),tiles=model.group.children.filter(m=>m.geometry.name==='clay-overlap-tile'),ridge=model.group.children.filter(m=>m.geometry.name==='clay-ridge-shell')
  for(const part of [...tiles,...ridge]){
   assertClosedSolid(part.geometry)
   assert.equal(part.material.side,THREE.FrontSide,'Closed roof solids must light correctly without a double-sided fallback')
  }
  const crown=new THREE.Raycaster(new THREE.Vector3(0,2,.1),new THREE.Vector3(0,-1,0)).intersectObjects(ridge,true)[0]
  assert(crown&&crown.face.normal.y>.8,'The top of the ridge faces the sky')
  if(!low){
   const ray=new THREE.Raycaster(new THREE.Vector3(model.geometry.width*.47*.25+.018,2,.1),new THREE.Vector3(0,-1,0)),hits=new Map()
   for(const hit of ray.intersectObjects(tiles,true))if(!hits.has(hit.object))hits.set(hit.object,hit.point.y)
   assert(hits.size>=2,'An upper course must actually lap over the lower course')
   const levels=[...hits.values()];assert(Math.max(...levels)-Math.min(...levels)>.015,'Overlapping tiles retain separate visible top surfaces')
   const rafters=model.group.children.filter(m=>m.geometry.name==='roof-rafter'),under=new THREE.Raycaster(new THREE.Vector3(model.geometry.width*.235,0,0),new THREE.Vector3(0,1,0)).intersectObjects(rafters,true)[0]
   assert(under&&under.point.y<Math.min(...levels),'Rafters are real solid members beneath the roof skin')
  }
  model.dispose()
 }
})

test('Архитектурные модели: редактируемые габариты, конечные нормали и ограниченные геометрические бюджеты',t=>{
 for(const id of ['timber-pillar','roof-tile'])for(const low of [false,true]){
  for(const size of [{},{width:.22,depth:.16,height:.35},{width:3.4,depth:1.1,height:4.2}]){
   const model=build(id,low,size),g=model.geometry,bounds=new THREE.Box3().setFromObject(model.group,true)
   assert(bounds.min.x>=-g.width/2-.002&&bounds.max.x<=g.width/2+.002,id+' width')
   assert(bounds.min.z>=-g.depth/2-.002&&bounds.max.z<=g.depth/2+.002,id+' depth')
   assert(bounds.min.y>=-.002&&bounds.max.y<=g.height+.002,id+' height')
   let triangles=0
   for(const part of model.group.children){
    triangles+=(part.geometry.index?.count??part.geometry.getAttribute('position').count)/3
    for(const name of ['position','normal'])assert(part.geometry.getAttribute(name).array.every(Number.isFinite))
   }
   const budget=id==='roof-tile'?(low?1800:19000):(low?1200:6500)
   assert(triangles<budget,id+' stays within '+budget+' triangles')
   batchEntityParts(model.group,geo=>{model.resources.delete(geo);geo.dispose()},geo=>{model.resources.add(geo);return geo})
   const after=new THREE.Box3().setFromObject(model.group,true)
   assert(bounds.min.distanceTo(after.min)<1e-6&&bounds.max.distanceTo(after.max)<1e-6,'Batching preserves the constructed silhouette')
   assert(model.group.children.length<=(id==='roof-tile'?6:5),'Small carvings and roof members reuse material batches')
   if(Object.keys(size).length===0)t.diagnostic(`${id}, ${low?'low':'detailed'}: ${triangles} triangles / ${model.group.children.length} batches`)
   model.dispose()
  }
 }
})
