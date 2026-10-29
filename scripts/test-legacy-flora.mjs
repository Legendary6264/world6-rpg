import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {legacyAssets} from '../src/legacyAssets.ts'
import {populateLegacyFlora} from '../src/scene3dLegacyFlora.ts'
import {batchEntityParts} from '../src/scene3dBatch.ts'

const owned=legacyAssets.filter(a=>a.group==='flora'&&!a.native)
function build(asset,low=false,dimensions=[2.4,1.7,3.2]){
 const [width,depth,height]=dimensions,group=new THREE.Group(),materials=new Map(),resources=new Set(),entity={id:asset.id,geometry:{kind:asset.kind,artwork:asset.id,width,depth,height,open:true,facing:90,locked:true,active:false},appearance:{color:'#426b45',remembered:false,heightKnown:true}},before=JSON.stringify(entity)
 const accepted=populateLegacyFlora(entity,(geometry,color,x,y,z,surface={})=>{
  const key=JSON.stringify([color,surface]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.FrontSide});material.userData.paletteBatch=JSON.stringify([surface,false,1]);materials.set(key,material)}
  const p=new THREE.Mesh(geometry,material);p.position.set(x,y,z);p.userData.surface=surface;group.add(p);resources.add(geometry);return p
 },low)
 assert(accepted,asset.id);assert.equal(JSON.stringify(entity),before,'Generating the old artwork does not rewrite saved flags or geometry')
 group.updateMatrixWorld(true)
 return {asset,low,group,materials,resources,dimensions,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const names=m=>m.group.children.map(p=>p.geometry.name)
const parts=(m,word)=>m.group.children.filter(p=>p.geometry.name.includes(word))
const triangles=m=>m.group.children.reduce((sum,p)=>sum+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)
const bounds=parts=>{const b=new THREE.Box3();parts.forEach(p=>b.union(new THREE.Box3().setFromObject(p,true)));return b}
const ray=(m,from,to)=>new THREE.Raycaster(new THREE.Vector3(...from),new THREE.Vector3(...to)).intersectObject(m.group,true)
function validateSolid(p){
 const g=p.geometry,pos=g.attributes.position,normal=g.attributes.normal,uv=g.attributes.uv,ix=g.index,count=ix?.count??pos.count,edges=new Map();let volume=0
 assert(g.name,'Every part retains a semantic mesh name')
 for(const a of [pos,normal,uv])assert(a&&Array.from(a.array).every(Number.isFinite),g.name+' has finite positions, normals and UVs')
 const key=v=>[v.x,v.y,v.z].map(v=>Math.round(v*1e6)).join(',')
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>ix?ix.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(pos,j)),face=b.clone().sub(a).cross(c.clone().sub(a))
  if(face.lengthSq()<1e-23)continue
  volume+=a.dot(b.clone().cross(c))/6
  const norm=new THREE.Vector3();ids.forEach(j=>norm.add(new THREE.Vector3().fromBufferAttribute(normal,j)))
  assert(face.dot(norm)>-1e-10,g.name+' normals follow face winding')
  const points=[a,b,c].map(key)
  for(let j=0;j<3;j++){const x=points[j],y=points[(j+1)%3];if(x===y)continue;const edge=x<y?x+'|'+y:y+'|'+x;edges.set(edge,(edges.get(edge)??0)+1)}
 }
 assert(volume>1e-12,g.name+' is an outward, positive-volume solid')
 assert([...edges.values()].every(n=>n===2),g.name+' has a closed boundary')
}
function validateEnvelope(m){
 const b=new THREE.Box3().setFromObject(m.group,true),[w,d,h]=m.dimensions,eps=2e-6
 assert(Math.abs(b.min.x+w/2)<eps&&Math.abs(b.max.x-w/2)<eps,m.asset.slug+' scales to the local saved width without rotating the assembly')
 assert(Math.abs(b.min.z+d/2)<eps&&Math.abs(b.max.z-d/2)<eps,m.asset.slug+' scales to the local saved depth')
 assert(Math.abs(b.min.y)<eps&&Math.abs(b.max.y-Math.max(.035,h))<eps,m.asset.slug+' sits on the ground and respects saved height')
}

test('All old flora IDs build finite closed solid models, bounded by their saved envelope, in both LODs',t=>{
 assert.equal(owned.length,52)
 let highTotal=0,lowTotal=0,maxHigh=0,maxLow=0
 for(const asset of owned){
  const high=build(asset),low=build(asset,true)
  for(const m of [high,low]){
   validateEnvelope(m);m.group.children.forEach(validateSolid)
   assert(triangles(m)<(m.low?6500:14000),asset.slug+' triangle budget')
   assert(new Set(m.group.children.map(p=>JSON.stringify(p.userData.surface))).size<=8,asset.slug+' palette-compatible surface option groups')
  }
  assert(triangles(low)<triangles(high)*.65,asset.slug+' lower-detail geometry is substantially cheaper')
  highTotal+=triangles(high);lowTotal+=triangles(low);maxHigh=Math.max(maxHigh,triangles(high));maxLow=Math.max(maxLow,triangles(low))
  high.dispose();low.dispose()
 }
 t.diagnostic(`${owned.length} profiles: ${highTotal} detailed / ${lowTotal} low triangles; maximum ${maxHigh} / ${maxLow}`)
})

test('Unusually edited dimensions and already-swapped local facing dimensions bake as one connected assembly',()=>{
 for(const asset of owned)for(const low of [false,true])for(const size of [[.15,3.5,.035],[4,.22,7]]){
  const m=build(asset,low,size);validateEnvelope(m)
  for(const p of m.group.children)assert(p.geometry.attributes.position.array.every(Number.isFinite))
  m.dispose()
 }
})

test('Trees retain species anatomy: open forks, canopy shelves, pendulous leaves, bottle trunk and pinnate fronds',()=>{
 const models=Object.fromEntries(['oak','pine','cedar','cypress','birch','willow','dead','baobab','palm','acacia','maple','hazel','juniper','elder','rose-bush','banana','coffee','cotton','hops','apple','cherry','root-tree'].map(s=>[s,build(owned.find(a=>a.slug===s))]))
 assert.equal(parts(models.pine,'needle-tier').length,5)
 assert.equal(parts(models.cedar,'horizontal-cedar-bough').length,30)
 assert.equal(parts(models.cypress,'upright-spray').length,6)
 assert.equal(parts(models.birch,'white-birch-trunk').length,3);assert(parts(models.birch,'dark-bark-scar').length>=15)
 assert.equal(parts(models.willow,'hanging-bough').length,13);assert(parts(models.willow,'pendulous-willow-leaf').length>=50)
 assert(parts(models.dead,'broken-fork').length>=7);assert(!names(models.dead).some(n=>/leaf|crown|spray/.test(n)))
 const oakTrunk=bounds(parts(models.oak,'rooted-trunk')).getSize(new THREE.Vector3()),baobabTrunk=bounds(parts(models.baobab,'bottle-trunk')).getSize(new THREE.Vector3())
 assert(baobabTrunk.x/baobabTrunk.y>oakTrunk.x/oakTrunk.y*1.45,'The baobab has a real thick bottle trunk')
 assert.equal(parts(models.palm,'coconut').length,3);assert(parts(models.palm,'pinnate-palm-leaflet').length>=100)
 assert(parts(models.acacia,'umbrella-canopy').every(p=>{const d=new THREE.Box3().setFromObject(p,true).getSize(new THREE.Vector3());return d.x/2.4>d.y/3.2*2.5}),'Acacia canopy forms flattened umbrellas')
 assert(parts(models.maple,'lobed-maple-leaf').length>=10)
 assert(parts(models.hazel,'multiple-cane').length>=5);assert(parts(models.hazel,'hazelnut-cluster').length>=10)
 assert(parts(models.juniper,'creeping-branch').length>=7);assert(parts(models.juniper,'juniper-berry').length>=20)
 assert(parts(models.elder,'flower-umbel').length>=30);assert(parts(models['rose-bush'],'rose-thorn').length>=15)
 assert(parts(models.banana,'broad-banana-leaf').length>=8);assert(parts(models.banana,'banana-fruit').length>=8)
 assert(parts(models.coffee,'coffee-cherry').length>=40);assert(parts(models.cotton,'cotton-boll').length>=15)
 assert.equal(parts(models.hops,'trellis-post').length,2);assert(parts(models.hops,'overlapping-hop-scale').length>=50)
 assert(parts(models.apple,'apple-fruit').length>=10);assert(parts(models.cherry,'cherry-blossom-petal').length>=50)
 assert(parts(models['root-tree'],'arching-root').length>=8)
 Object.values(models).forEach(m=>m.dispose())
})

test('Understory models carry botanical structure and cut faces rather than flat cards',()=>{
 const signatures={fern:'paired-fern-pinna',reeds:'reed-panicle',cattails:'velvet-seed-head','grass-tuft':'arching-grass-blade',lupine:'lupine-pea-floret',sunflower:'sunflower-seed-disc',thistle:'purple-thistle-floret','thorn-bush':'large-thorn','berry-bush':'berry-cluster',vine:'twining-vine','hanging-vine':'overhanging-woody-limb','red-mushroom':'stem-skirt','glow-mushroom':'mushroom-cap','giant-mushroom':'radial-gill','mushroom-cluster':'mushroom-stem',stump:'annual-growth-ring',log:'fallen-log-cut-face',woodpile:'stacked-log-cut-face','lily-pad':'notched-lily-leaf',lotus:'lotus-flower-petal',cactus:'ribbed-main-column',bamboo:'bamboo-node',agave:'pointed-agave-leaf',aloe:'tubular-aloe-flower','pumpkin-patch':'ribbed-pumpkin',cabbages:'cupped-cabbage-leaf','amber-root':'amber-inclusion',driftwood:'weathered-root-core','frozen-root':'solid-icicle',nest:'bird-egg'}
 for(const [s,feature] of Object.entries(signatures))for(const low of [false,true]){
  const m=build(owned.find(a=>a.slug===s),low);assert(parts(m,feature).length,s+' retains '+feature+' at both LODs');assert(m.group.children.every(p=>!p.userData.surface.doubleSided),'Solid flora does not require double-sided materials')
  if(s==='glow-mushroom')assert(parts(m,'mushroom-cap').some(p=>p.userData.surface.emissive))
  m.dispose()
 }
})

test('Ray checks find real mushroom cap undersides, log ends, lily-pad notches and the open nest bowl',()=>{
 for(const low of [false,true]){
  const mushroom=build(owned.find(a=>a.slug==='giant-mushroom'),low),cap=parts(mushroom,'mushroom-cap')[0],cb=new THREE.Box3().setFromObject(cap,true),x=cb.getSize(new THREE.Vector3()).x*.32,z=cb.getCenter(new THREE.Vector3()).z
  const underside=ray(mushroom,[x,.05,z],[0,1,0]).find(h=>h.object===cap)
  assert(underside&&underside.face.normal.y<0,'The cap is capped underneath with outward normals')
  assert(ray(mushroom,[x,5,z],[0,-1,0]).some(h=>h.object===cap),'The cap has a distinct upper surface')
  mushroom.dispose()
  const log=build(owned.find(a=>a.slug==='log'),low),cuts=parts(log,'fallen-log-cut-face'),cut=cuts.sort((a,b)=>bounds([b]).max.x-bounds([a]).max.x)[0],cc=bounds([cut]).getCenter(new THREE.Vector3())
  assert(ray(log,[5,cc.y,cc.z],[-1,0,0]).some(h=>h.object===cut),'Cut heartwood closes the log end')
  log.dispose()
  const nest=build(owned.find(a=>a.slug==='nest'),low),bowl=parts(nest,'woven-nest-bowl')[0],b=bounds([bowl]),inside=new THREE.Raycaster(new THREE.Vector3(0,5,0),new THREE.Vector3(0,-1,0)).intersectObject(bowl)[0]
  assert(inside&&inside.point.y<b.max.y*.55,'The nest has a genuine bowl cavity below the rim')
  nest.dispose()
  const pad=build(owned.find(a=>a.slug==='lily-pad'),low),p=parts(pad,'notched-lily-leaf')[0],g=p.geometry,pos=g.attributes.position,v0=new THREE.Vector3().fromBufferAttribute(pos,0)
  // Closed extruded outlines retain a wedge in their projected footprint.
  const pb=bounds([p]),center=pb.getCenter(new THREE.Vector3()),w=pb.getSize(new THREE.Vector3()).x,d=pb.getSize(new THREE.Vector3()).z
  const hit=(px,pz)=>new THREE.Raycaster(new THREE.Vector3(px,5,pz),new THREE.Vector3(0,-1,0)).intersectObject(p).length
  assert(hit(center.x+w*.15,center.z-d*.32),'Solid pad beside the notch')
  assert.equal(hit(center.x,center.z-d*.36),0,'The lily leaf has an actual notch opening')
  assert(v0.toArray().every(Number.isFinite));pad.dispose()
 }
})

test('Palette batching preserves every profile envelope and lowers the number of render calls',()=>{
 for(const asset of owned)for(const low of [false,true]){
  const m=build(asset,low),before=new THREE.Box3().setFromObject(m.group,true),original=m.group.children.length
  batchEntityParts(m.group,g=>{m.resources.delete(g);g.dispose()},g=>{m.resources.add(g);return g})
  const after=new THREE.Box3().setFromObject(m.group,true)
  assert(before.min.distanceTo(after.min)<2e-6&&before.max.distanceTo(after.max)<2e-6,asset.slug+' keeps its exact saved envelope after batching')
  assert(m.group.children.length<original);assert(m.group.children.length<=8,asset.slug+' material option batch budget')
  assert(m.group.children.every(p=>p.material.vertexColors&&p.geometry.attributes.color));m.dispose()
 }
})

test('Other artwork, native profiles and mismatched kinds emit no flora meshes',()=>{
 for(const geometry of [{kind:'crate',artwork:'expanded-object-table'},{kind:'rock',artwork:'expanded-object-boulder'},{kind:'tree',artwork:'expanded-object-boulder'},{kind:'rock',artwork:'expanded-object-oak'},{kind:'tree',asset:'oak',artwork:'expanded-object-oak'},{kind:'tree'},{kind:'rock',artwork:'unknown'}]){
  let calls=0;assert.equal(populateLegacyFlora({geometry},()=>{calls++;throw Error('nonowned output')}),false);assert.equal(calls,0)
 }
})
