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
const {createTabletopObject,validTabletopAppearance}=load('tabletopCatalog'),{populateEntityModel}=load('scene3dMeshes')
function build(id,state={},low=false){
 const geometry={...createTabletopObject(id,'test',{x:0,y:0,z:0}),...state},group=new THREE.Group(),resources=[]
 let emitters=0
 populateEntityModel({id:'test',geometry,appearance:{color:'#999988',heightKnown:true}},(g,color,x,y,z,options={})=>{
  if(options.emissive)emitters++
  const material=new THREE.MeshStandardMaterial({color,side:options.doubleSided?THREE.DoubleSide:THREE.FrontSide}),part=new THREE.Mesh(g,material);part.position.set(x,y,z);group.add(part);resources.push(g,material);return part
 },low)
 group.updateMatrixWorld(true)
 return {group,geometry,emitters,dispose(){resources.forEach(r=>r.dispose())}}
}
test('Hinged trunk opens onto a hollow interior and both states remain within saved bounds',()=>{
 for(const low of [false,true]){
  const closed=build('chest',{open:false},low),opened=build('chest',{open:true},low)
  for(const m of [closed,opened]){
   const b=new THREE.Box3().setFromObject(m.group,true),g=m.geometry
   assert(b.min.x>=-g.width/2-.002&&b.max.x<=g.width/2+.002);assert(b.min.z>=-g.depth/2-.002&&b.max.z<=g.depth/2+.002);assert(b.min.y>=-.002&&b.max.y<=g.height+.002)
  }
  // At 30 degrees a full-depth rigid lid still projects over the middle.
  // Check the exposed front strip, to the side of the attached hasp.
  const ray=new THREE.Raycaster(new THREE.Vector3(closed.geometry.width*.12,2,closed.geometry.depth*.35),new THREE.Vector3(0,-1,0))
  const closedHit=ray.intersectObject(closed.group,true)[0],openHit=ray.intersectObject(opened.group,true)[0],topClosed=closedHit.point.y,topOpen=openHit.point.y
  assert.equal(closedHit.object.geometry.name,'storage-chest-lid-board');assert.equal(openHit.object.geometry.name,'storage-chest-interior-floor')
  assert(topClosed>.35);assert(topOpen<.1,'The opened leaf exposes the lined bottom, rather than another opaque box')
  closed.dispose();opened.dispose()
 }
})
test('Candle chandelier, mounted torch and fire vent remove all flame emitters when inactive',()=>{
 for(const id of ['torch','chandelier','trap-fire'])for(const low of [false,true]){
  const lit=build(id,{active:true},low),off=build(id,{active:false},low)
  assert(lit.emitters>0,id);assert.equal(off.emitters,0,id)
  assert(off.group.children.length<lit.group.children.length,id+' inactive geometry')
  lit.dispose();off.dispose()
 }
})
test('Locks are typed and add bounded hardware only to a closed door or chest',()=>{
 assert(validTabletopAppearance({kind:'door',asset:'timber-door',locked:true}));assert(!validTabletopAppearance({kind:'door',asset:'timber-door',locked:'true'}))
 for(const id of ['timber-door','chest']){
  const unlocked=build(id,{locked:false}),locked=build(id,{locked:true}),open=build(id,{locked:true,open:true})
  assert(locked.group.children.length>unlocked.group.children.length,id)
  for(const m of [locked,open]){
   const b=new THREE.Box3().setFromObject(m.group,true),g=m.geometry
   assert(b.min.x>=-g.width/2-.003&&b.max.x<=g.width/2+.003);assert(b.min.z>=-g.depth/2-.003&&b.max.z<=g.depth/2+.003);assert(b.max.y<=g.height+.003)
  }
  unlocked.dispose();locked.dispose();open.dispose()
 }
})

test('Roof tiles are closed solid shells with sky-facing outer normals on both slopes',()=>{
 const model=build('roof-tile'),tiles=model.group.children.filter(p=>['9d5e43','b47850'].includes(p.material.color.getHexString()))
 assert.equal(tiles.length,48)
 for(const tile of tiles){
  const p=tile.geometry.attributes.position,n=tile.geometry.attributes.normal,half=p.count/2
  let upper=0,lower=0
  for(let i=0;i<half;i++){upper+=n.getY(i);lower+=n.getY(i+half)}
  assert(upper/half>.2);assert(lower/half<-.2)
 }
 model.dispose()
})

test('Round tabletop has a real solid top and timber braces project from both plaster faces',()=>{
 for(const low of [false,true]){
  const table=build('round-table',{},low),ray=new THREE.Raycaster(new THREE.Vector3(.36,2,0),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(table.group,true)[0]
  assert(hit&&hit.point.y>table.geometry.height*.8,'The empty tabletop area must not fall through to the pedestal');table.dispose()
 }
 const wall=build('timber-wall'),x=.4,y=2.54-(x/.86)*(2.54-2.7*.38)
 for(const side of [-1,1]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,y,side),new THREE.Vector3(0,0,-side)),hit=ray.intersectObject(wall.group,true)[0]
  assert(hit&&Math.abs(hit.point.z)>.1,'Diagonal joinery must be in front of plaster on both faces')
 }
 wall.dispose()
})

test('Chair has a genuinely pierced curved back and a dished seat rather than stacked flat boxes',()=>{
 const model=build('chair'),g=model.geometry,forward=new THREE.Vector3(0,0,-1)
 const hole=new THREE.Raycaster(new THREE.Vector3(0,g.height*.72,2),forward).intersectObject(model.group,true)
 assert.equal(hole.length,0,'The space between the two curved back splats is actually empty')
 const crown=new THREE.Raycaster(new THREE.Vector3(0,g.height*.94,2),forward).intersectObject(model.group,true)
 assert(crown.length>0,'The swept crest closes the top of the pierced back')
 const down=new THREE.Vector3(0,-1,0),center=new THREE.Raycaster(new THREE.Vector3(0,2,0),down).intersectObject(model.group,true)[0],edge=new THREE.Raycaster(new THREE.Vector3(g.width*.39,2,0),down).intersectObject(model.group,true)[0]
 assert(center&&edge&&edge.point.y-center.point.y>.007,'The sitting surface is carved lower at the centre')
 model.dispose()
})
test('Coopered barrel staves are solid closed shells and face outward at the broad belly',()=>{
 const model=build('barrel'),g=model.geometry,wood=model.group.children.filter(p=>['a88257','745039'].includes(p.material.color.getHexString()))
 const staves=wood.filter(p=>p.geometry.type==='BufferGeometry')
 assert.equal(staves.length,16)
 for(const stave of staves){
  const counts=new Map(),idx=stave.geometry.index
  for(let i=0;i<idx.count;i+=3)for(const [a,b] of [[idx.getX(i),idx.getX(i+1)],[idx.getX(i+1),idx.getX(i+2)],[idx.getX(i+2),idx.getX(i)]]){const key=a<b?a+':'+b:b+':'+a;counts.set(key,(counts.get(key)??0)+1)}
  assert([...counts.values()].every(n=>n===2),'Every stave edge belongs to two faces, including its thickness and end grain')
 }
 const ray=new THREE.Raycaster(new THREE.Vector3(2,g.height*.5,.025),new THREE.Vector3(-1,0,0)),hit=ray.intersectObject(model.group,true)[0]
 assert(hit&&hit.point.x>g.width*.43,'Front-face culling must retain the outer belly, not reveal an inverted inner surface')
 model.dispose()
})
test('Fireplace arch has a real recessed bore, stone crown and jambs even when its fire is off',()=>{
 const model=build('fireplace',{active:false}),g=model.geometry,forward=new THREE.Vector3(0,0,-1)
 const at=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,2),forward).intersectObject(model.group,true)[0]
 const bore=at(0,g.height*.43),crown=at(0,g.height*.565),jamb=at(g.width*.37,g.height*.2)
 assert(bore&&bore.point.z<-g.depth*.3,'The central opening reaches the dark, recessed firebox')
 assert(crown&&crown.point.z>g.depth*.3,'The stone voussoirs close the crown in front of the firebox')
 assert(jamb&&jamb.point.z>g.depth*.3,'The vertical supports continue down to the hearth')
 assert.equal(model.emitters,0)
 model.dispose()
})
test('Bed blanket contains physical folds and shelf mugs expose recessed interiors below their rims',()=>{
 const bed=build('bed'),b=bed.geometry,down=new THREE.Vector3(0,-1,0)
 const heights=Array.from({length:15},(_,i)=>new THREE.Raycaster(new THREE.Vector3((i/14-.5)*b.width*.76,2,b.depth*.22),down).intersectObject(bed.group,true)[0].point.y)
 assert(Math.max(...heights)-Math.min(...heights)>.012,'The duvet changes silhouette along its physical cloth folds')
 bed.dispose()
 const shelf=build('shelf'),cup=shelf.group.children.find(p=>p.geometry.name==='storage-shelf-cup');assert(cup)
 // Locate the actual completed cup after the adapter has baked its transform.
 const bounds=new THREE.Box3().setFromObject(cup,true),centre=bounds.getCenter(new THREE.Vector3()),r=(bounds.max.x-bounds.min.x)/2
 const sample=x=>new THREE.Raycaster(new THREE.Vector3(centre.x+x,bounds.max.y+.1,centre.z),down).intersectObject(cup,true)[0].point.y
 assert(sample(r*.94)-sample(0)>.01,'The cup centre is recessed behind its rolled ceramic rim')
 shelf.dispose()
})

test('Dungeon portal keeps an empty bore, thick inner reveals and a closing arched leaf in both quality modes',()=>{
 for(const low of [false,true]){
  const opened=build('dungeon-arch',{open:true},low),closed=build('dungeon-arch',{open:false},low),g=opened.geometry
  const forward=new THREE.Vector3(0,0,-1),at=(model,x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,2),forward).intersectObject(model.group,true)[0]
  assert.equal(at(opened,0,g.height*.45),undefined,'The open portal must not retain a rectangular wall or door card across its bore')
  assert(at(closed,0,g.height*.45),'The closed timber leaf blocks the same passage')
  const crown=at(opened,0,g.height*.91)
  assert(crown&&crown.point.z>g.depth*.4&&crown.face.normal.z>.8,'Radial masonry closes the curved crown with outward-facing front faces')
  const reveal=new THREE.Raycaster(new THREE.Vector3(0,g.height*.41,0),new THREE.Vector3(1,0,0)).intersectObject(opened.group,true)[0]
  assert(reveal&&reveal.point.x>g.width*.32&&reveal.point.x<g.width*.35&&reveal.face.normal.x<-.8,'The jamb has an actual inward-facing reveal, not a pair of disconnected facade cards')
  opened.dispose();closed.dispose()
 }
 const unlocked=build('dungeon-arch',{open:false,locked:false}),locked=build('dungeon-arch',{open:false,locked:true})
 assert(locked.group.children.length>unlocked.group.children.length,'A closed locked portal retains visible lock hardware')
 unlocked.dispose();locked.dispose()
})
test('Stone wall joints are recessed behind actual ashlar faces on both sides',()=>{
 for(const low of [false,true]){
  const model=build('stone-wall',{},low),g=model.geometry
  for(const side of [-1,1]){
   const hits=Array.from({length:65},(_,i)=>new THREE.Raycaster(new THREE.Vector3((i/64-.5)*g.width*.8,g.height*.149,side*2),new THREE.Vector3(0,0,-side)).intersectObject(model.group,true)[0])
   assert(hits.every(Boolean),'Recessed joints retain a closed masonry core')
   const depths=hits.map(hit=>side*hit.point.z)
   assert(Math.max(...depths)-Math.min(...depths)>g.depth*.07,'The mortar lies physically behind the dressed stone faces')
   assert(hits.filter(hit=>hit.face.normal.z*side>.8).length>hits.length*.6,'Most dressed faces retain outward normals; bevel and chipped edges may legitimately turn away')
   assert(model.group.children.every(part=>part.material.side===THREE.FrontSide),'The masonry must render correctly without double-sided fallback materials')
  }
  model.dispose()
 }
})
test('Stone steps rise evenly and their curved nosings overhang the recessed risers',()=>{
 for(const low of [false,true]){
  const model=build('stairs',{},low),g=model.geometry,n=low?4:7,down=new THREE.Vector3(0,-1,0),run=g.depth/n,rise=g.height/n
  const levels=Array.from({length:n},(_,i)=>new THREE.Raycaster(new THREE.Vector3(0,2,g.depth/2-(i+.5)*run),down).intersectObject(model.group,true)[0].point.y)
  levels.forEach((y,i)=>assert(Math.abs(y-(i+1)*rise)<.00001,'Each visible tread stays at its intended physical height'))
  if(!low){
   const forward=new THREE.Vector3(0,0,-1),front=y=>new THREE.Raycaster(new THREE.Vector3(0,y,2),forward).intersectObject(model.group,true)[0].point.z
   assert(front(rise-rise*.22*.5)-front(rise-rise*.22*1.5)>run*.04,'The lip projects ahead of the lower riser rather than being a painted line')
  }
  model.dispose()
 }
})
test('Forged brazier has a hollow bowl; curved metalwork is capped and inactive flames leave no emitters',()=>{
 const brazier=build('brazier',{active:false}),g=brazier.geometry,down=new THREE.Vector3(0,-1,0),bowl=brazier.group.children.find(part=>part.geometry.type==='LatheGeometry'&&new THREE.Box3().setFromObject(part).max.y>g.height*.74),at=x=>new THREE.Raycaster(new THREE.Vector3(x,2,0),down).intersectObject(bowl,true)[0].point.y
 assert(at(g.width*.42)-at(0)>g.height*.1,'The bowl interior is recessed below its forged rim')
 assert.equal(brazier.emitters,0)
 const candle=build('candle',{active:false});assert.equal(candle.emitters,0)
 const tubes=[...brazier.group.children,...candle.group.children].filter(m=>m.geometry.type==='TubeGeometry')
 assert.equal(tubes.length,5)
 for(const tube of tubes){
  const p=tube.geometry.attributes.position,idx=tube.geometry.index,counts=new Map(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(',')
  for(let i=0;i<idx.count;i+=3)for(const [a,b] of [[idx.getX(i),idx.getX(i+1)],[idx.getX(i+1),idx.getX(i+2)],[idx.getX(i+2),idx.getX(i)]]){const ka=key(a),kb=key(b),edge=ka<kb?ka+'|'+kb:kb+'|'+ka;counts.set(edge,(counts.get(edge)??0)+1)}
  assert([...counts.values()].every(count=>count===2),'The swept ironwork closes its seam and both end caps')
 }
 brazier.dispose();candle.dispose()
})
