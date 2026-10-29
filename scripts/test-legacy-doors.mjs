import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'

const require=createRequire(import.meta.url),{load}=require('./generate-tabletop-thumbnails.cjs')
const {populateLegacyStructure}=load('scene3dLegacyStructure'),{legacyAssets}=load('legacyAssets')
const envelopes={
 'iron-door':[[-.5,0,-.11],[.5,1.01,.73]],
 'arched-door':[[-.5,0,-.115],[.5,1.05,.73]],
 trapdoor:[[-.5,0,-.5],[.5,.835,.5]],
 'trap-grate':[[-.5,0,-.5],[.5,.835,.5]],
}
const slugs=Object.keys(envelopes)
function build(slug,{low=false,open=false,locked=false,facing=0,dimensions=[1,1,1]}={}){
 const asset=legacyAssets.find(a=>a.slug===slug),geometry={kind:asset.kind,artwork:asset.id,width:dimensions[0],depth:dimensions[1],height:dimensions[2],open,locked,facing},group=new THREE.Group(),resources=new Set(),materials=new Map()
 populateLegacyStructure({geometry},(g,color,x,y,z,s={})=>{
  const key=JSON.stringify([color,s]);let material=materials.get(key)
  if(!material){material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide});materials.set(key,material)}
  const part=new THREE.Mesh(g,material);part.position.set(x,y,z);group.add(part);resources.add(g);return part
 },low)
 group.rotation.y=-facing*Math.PI/180;group.updateMatrixWorld(true)
 return {slug,geometry,group,resources,materials,dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const named=(m,name)=>m.group.children.filter(p=>p.geometry.name===name)
const triangles=m=>m.group.children.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)
function authored(m,p){
 const [lo,hi]=envelopes[m.slug],g=m.geometry,scale=[g.width/(hi[0]-lo[0]),g.height/(hi[1]-lo[1]),g.depth/(hi[2]-lo[2])]
 return new THREE.Vector3((p[0]-(lo[0]+hi[0])/2)*scale[0],(p[1]-lo[1])*scale[1],(p[2]-(lo[2]+hi[2])/2)*scale[2]).applyMatrix4(m.group.matrixWorld)
}
function ray(m,origin,direction,parts=m.group.children){
 const start=authored(m,origin),next=authored(m,origin.map((v,i)=>v+direction[i]))
 return new THREE.Raycaster(start,next.sub(start).normalize()).intersectObjects(parts)
}
function inside(part,point){
 const hits=new THREE.Raycaster(point,new THREE.Vector3(.713,.121,.691).normalize()).intersectObject(part)
 return hits.filter((h,i)=>!i||h.distance-hits[i-1].distance>1e-6).length%2===1
}
function connectedAt(m,a,b,p,label){
 const point=authored(m,p)
 assert(a.some(part=>inside(part,point)),label+' penetrates first real solid')
 assert(b.some(part=>inside(part,point)),label+' penetrates connected real solid')
}

test('Four old doors keep saved movement volumes, finite geometry and bounded detailed/low costs',()=>{
 const stats=[]
 for(const slug of slugs){
  const costs=[]
  for(const low of [false,true]){
   for(const open of [false,true])for(const facing of [0,90,180,270])for(const dimensions of [[1.4,.9,2.2],[.35,4.8,.14],[5.6,.12,3.8]]){
    const m=build(slug,{low,open,facing,dimensions}),g=m.geometry,bounds=new THREE.Box3()
    for(const part of m.group.children){
     part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox)
     for(const attr of ['position','normal','uv'])assert(part.geometry.attributes[attr]?.array.every(Number.isFinite),slug+' finite '+attr)
     assert(m.resources.has(part.geometry),slug+' output geometry resource identity retained')
    }
    assert(bounds.min.x>=-g.width/2-2e-6&&bounds.max.x<=g.width/2+2e-6,slug+' local width')
    assert(bounds.min.z>=-g.depth/2-2e-6&&bounds.max.z<=g.depth/2+2e-6,slug+' local depth')
    assert(bounds.min.y>=-2e-6&&bounds.max.y<=g.height+2e-6,slug+' local height')
    assert(Math.abs(bounds.min.y)<2e-6,slug+' grounded frame')
    assert(triangles(m)<(low?4000:15000),slug+' triangle ceiling');assert(m.materials.size<=9,slug+' palette ceiling')
    if(!open&&facing===0&&dimensions[0]===1.4){costs.push(triangles(m));stats.push({slug,low,triangles:triangles(m),parts:m.group.children.length})}
    m.dispose()
   }
  }
  assert(costs[1]<costs[0],slug+' low LOD retains cheaper physical construction')
 }
 console.log(JSON.stringify({legacyDoors:stats}))
})

test('Opening or locking a leaf leaves all frame, seating and stationary hinge vertices unchanged',()=>{
 for(const slug of slugs)for(const low of [false,true]){
  const closed=build(slug,{low}),opened=build(slug,{low,open:true,locked:true})
  const fixed=closed.group.children.filter(p=>p.geometry.name.includes('-frame-')||p.geometry.name===slug+'-jamb'||p.geometry.name===slug+'-lintel'||p.geometry.name===slug+'-hinge')
  assert(fixed.length>8,slug+' complete stationary hardware')
  for(const a of fixed){
   const peers=named(opened,a.geometry.name),b=peers[named(closed,a.geometry.name).indexOf(a)]
   assert(b,a.geometry.name+' retained');assert.deepEqual(a.geometry.attributes.position.array,b.geometry.attributes.position.array,a.geometry.name+' fixed coordinates')
  }
  closed.dispose();opened.dispose()
 }
})

test('Door leaves have closed passages, continuous curved planks, connected face plates and two attached pulls',()=>{
 for(const slug of ['iron-door','arched-door'])for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build(slug,{low,facing,locked:true}),opened=build(slug,{low,facing,open:true})
  assert(ray(m,[.085,.40,2],[0,0,-1]).length,slug+' closed passage')
  assert.equal(ray(opened,[.085,.40,2],[0,0,-1]).length,0,slug+' opened passage')
  if(slug==='arched-door'){
   const planks=named(m,slug+'-plank'),w=.716/planks.length
   for(let i=0;i<planks.length;i++){
    const x=-.358+(i+.5)*w,top=.55+Math.sqrt(.358**2-x*x)
    assert(ray(m,[x,top-.003,.3],[0,0,-1],planks).length,'true curved plank reaches the circular top')
    assert.equal(ray(m,[x,top+.003,.3],[0,0,-1],planks).length,0,'curved plank does not overshoot arch')
    connectedAt(m,planks,named(m,slug+'-leaf-strap'),[x,.49,.0265],'strap fastens each wooden plank')
   }
  }else{
   const cols=low?2:3
   for(let i=0;i<cols;i++)for(let row=0;row<3;row++)connectedAt(m,named(m,slug+'-leaf-core'),named(m,slug+'-face-plate'),[-.36+(i+.5)*.72/cols,.041+(row+.5)*.852/3,.0195],'metal plate overlaps continuous core')
  }
  for(const y of [.20,.69]){
   connectedAt(m,named(m,slug+'-frame-hinge-plate'),named(m,slug+'-frame-hinge-knuckle'),[-.382,y+.031,0],'frame hinge connection')
   connectedAt(m,named(m,slug+'-leaf-hinge-knuckle'),named(m,slug+'-leaf-hinge-tongue'),[-.352,y,0],'leaf hinge connection')
  }
  for(const side of [-1,1]){
   const z=side*(slug==='arched-door'?.043:.061)
   const body=named(m,slug+(slug==='arched-door'?'-plank':'-face-plate'))
   connectedAt(m,named(m,slug+'-handle-plate'),body,[.25,.405,side*(slug==='arched-door'?.020:.034)],'handle plate embeds into the actual door body')
   connectedAt(m,named(m,slug+'-handle-plate'),named(m,slug+'-handle-boss'),[.25,.419,z+side*.007],'handle spindle seats in escutcheon')
   connectedAt(m,named(m,slug+'-handle'),named(m,slug+'-handle-boss'),[.25,.422,z+side*.022],'ring pull attaches to spindle')
  }
  connectedAt(m,named(m,slug+'-lock-case'),named(m,slug+(slug==='arched-door'?'-plank':'-face-plate')),[.25,.30,slug==='arched-door'?.025:.038],'lock case has real backing')
  connectedAt(m,named(m,'door-lock'),named(m,slug+'-lock-case'),[.25,.30,slug==='arched-door'?.0425:.0565],'lock cover is fastened to its case')
  m.dispose();opened.dispose()
 }
})

test('Grate holes and perimeter joints remain real at low LOD and after four rotations',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('trap-grate',{low,facing}),opened=build('trap-grate',{low,facing,open:true}),rim=named(m,'trap-grate-rim'),bars=named(m,'trap-grate-bar'),cross=named(m,'trap-grate-crossbar')
  assert.equal(bars.length,7);assert.equal(cross.length,5)
  assert.equal(ray(m,[.0575,2,.09],[0,-1,0]).length,0,'empty hole between actual grate bars')
  assert(ray(m,[.115,2,0],[0,-1,0]).length,'actual bar intercepts a closed grate')
  assert.equal(ray(opened,[.115,2,0],[0,-1,0]).length,0,'raised grate leaves vertical passage clear')
  for(let i=0;i<7;i++){
   const x=(i-3)*.115
   connectedAt(m,[bars[i]],rim,[x,.078,.36],'each grate bar enters perimeter')
   for(let j=0;j<5;j++)connectedAt(m,[bars[i]],[cross[j]],[x,.077,(j-2)*.18],'grid intersection is joined')
  }
  for(const x of [-.354,.354])for(const z of [-.354,.354])assert(rim.filter(p=>inside(p,authored(m,[x,.077,z]))).length>=2,'perimeter corners overlap rather than touch edges')
  m.dispose();opened.dispose()
 }
})

test('Wooden hatch construction, pull plates and both hinge assemblies remain physically connected',()=>{
 for(const slug of ['trapdoor','trap-grate'])for(const low of [false,true]){
  const m=build(slug,{low}),opened=build(slug,{low,open:true})
  for(const x of [-.26,.26]){
   connectedAt(m,named(m,slug+'-frame-hinge-plate'),named(m,slug+'-hinge'),[x-.037,.083,-.399],'hatch jamb knuckles reach fixed plates')
   connectedAt(m,named(m,slug+'-leaf-hinge-knuckle'),named(m,slug+'-hinge-tongue'),[x,.078,-.374],'hatch hinge tongue joins barrel')
  }
  if(slug==='trapdoor'){
   const boards=named(m,slug+'-board'),n=boards.length
   for(let i=0;i<n;i++)connectedAt(m,[boards[i]],named(m,slug+'-end-rail'),[-.328+(i+.5)*.656/n,.075,.331],'boards enter end rail')
   for(const x of [-.332,.332])for(const z of [-.355,.355])connectedAt(m,named(m,slug+'-edge-rail'),named(m,slug+'-end-rail'),[x,.075,z],'wooden perimeter joints overlap')
   assert(ray(m,[.115,2,0],[0,-1,0]).length,'wooden lid intercepts passage')
   assert.equal(ray(opened,[.115,2,0],[0,-1,0]).length,0,'wooden lid opens clear')
  }
  connectedAt(m,named(m,slug+'-pull-plate'),named(m,slug+(slug==='trapdoor'?'-board':'-bar')),[0,.0965,.25],'pull plate has real backing')
  for(const x of [-.041,.041])connectedAt(m,named(m,slug+'-pull-eye'),named(m,slug+'-pull-ring'),[x,.125,.25],'pull eyes retain actual ring')
  m.dispose();opened.dispose()
 }
})
