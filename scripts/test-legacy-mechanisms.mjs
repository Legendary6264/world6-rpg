import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as THREE from 'three'
const require=createRequire(import.meta.url),{load}=require('./generate-tabletop-thumbnails.cjs')
const {populateLegacyStructure}=load('scene3dLegacyStructure'),{legacyAssets}=load('legacyAssets')
const envelopes={gate:[[-.56,0,-.14],[.56,1.045,.41]],shutters:[[-.5,.025,-.135],[.5,.985,.408]],portcullis:[[-.515,0,-.125],[.515,1.98,.125]],'sluice-gate':[[-.515,0,-.154],[.515,1.51,.154]]}
const slugs=Object.keys(envelopes)
function build(slug,{low=false,open=false,facing=0,dimensions=[1,1,1]}={}){
 const asset=legacyAssets.find(a=>a.slug===slug),geometry={kind:asset.kind,artwork:asset.id,width:dimensions[0],depth:dimensions[1],height:dimensions[2],open,facing},group=new THREE.Group(),resources=new Set(),materials=new Map()
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
 const [lo,hi]=envelopes[m.slug],g=m.geometry
 return new THREE.Vector3((p[0]-(lo[0]+hi[0])/2)*g.width/(hi[0]-lo[0]),(p[1]-lo[1])*g.height/(hi[1]-lo[1]),(p[2]-(lo[2]+hi[2])/2)*g.depth/(hi[2]-lo[2])).applyMatrix4(m.group.matrixWorld)
}
function ray(m,origin,direction,parts=m.group.children){
 const start=authored(m,origin),end=authored(m,origin.map((v,i)=>v+direction[i]))
 return new THREE.Raycaster(start,end.sub(start).normalize()).intersectObjects(parts)
}
function inside(part,point){
 const hits=new THREE.Raycaster(point,new THREE.Vector3(.713,.121,.691).normalize()).intersectObject(part)
 return hits.filter((h,i)=>!i||h.distance-hits[i-1].distance>1e-6).length%2===1
}
function joined(m,a,b,p,label){const point=authored(m,p);assert(a.some(g=>inside(g,point)),label+' inside first real solid');assert(b.some(g=>inside(g,point)),label+' inside second real solid')}
function hinged(p,pivot,angle){return new THREE.Vector3(...p).sub(new THREE.Vector3(...pivot)).applyAxisAngle(new THREE.Vector3(0,1,0),angle).add(new THREE.Vector3(...pivot)).toArray()}

test('Four original mechanisms retain finite saved envelopes, output identities and bounded LOD costs',()=>{
 const stats=[]
 for(const slug of slugs){
  const costs=[]
  for(const low of [false,true])for(const open of [false,true])for(const facing of [0,90,180,270])for(const dimensions of [[1.4,.9,2.2],[.35,4.8,.14],[5.6,.12,3.8]]){
   const m=build(slug,{low,open,facing,dimensions}),b=new THREE.Box3(),g=m.geometry
   for(const part of m.group.children){
    part.geometry.computeBoundingBox();b.union(part.geometry.boundingBox)
    assert(m.resources.has(part.geometry),slug+' keeps output resource identity')
    for(const attr of ['position','normal','uv'])assert(part.geometry.attributes[attr]?.array.every(Number.isFinite),slug+' finite '+attr)
   }
   assert(b.min.x>=-g.width/2-2e-6&&b.max.x<=g.width/2+2e-6,slug+' saved width')
   assert(b.min.z>=-g.depth/2-2e-6&&b.max.z<=g.depth/2+2e-6,slug+' saved depth')
   assert(b.min.y>=-2e-6&&b.max.y<=g.height+2e-6,slug+' saved height');assert(b.min.y<g.height*.003,slug+' grounded frame')
   assert(triangles(m)<(low?4000:16000),slug+' triangle budget '+triangles(m));assert(m.materials.size<=9,slug+' palette budget')
   if(!open&&facing===0&&dimensions[0]===1.4){costs.push(triangles(m));stats.push({slug,low,triangles:triangles(m),parts:m.group.children.length})}
   m.dispose()
  }
  assert(costs[1]<costs[0],slug+' cheaper low LOD')
 }
 console.log(JSON.stringify({legacyMechanisms:stats}))
})

test('Opening leaves all fixed masonry, guides, hoist and drive vertices byte-identical',()=>{
 const fixed={gate:['gate-stone-pier','gate-pier-cap','gate-frame-hinge-plate','gate-frame-hinge-knuckle','gate-frame-hinge-pin'],shutters:['shutter-window-jamb','shutter-window-sill','shutter-frame-hinge-plate','shutter-frame-hinge-knuckle','shutter-frame-hinge-pin'],portcullis:['portcullis-pier','portcullis-guide','portcullis-guide-channel-back','portcullis-crosshead','portcullis-upper-guide-tower','portcullis-hoist-crosshead','portcullis-hoist-axle','portcullis-hoist-bearing','portcullis-hoist-drum','portcullis-hoist-drum-flange','portcullis-crank-wheel'],'sluice-gate':['sluice-gate-pier','sluice-gate-guide','sluice-gate-guide-channel-back','sluice-gate-crosshead','sluice-gate-upper-crosshead','sluice-gate-lifting-screw','sluice-gate-screw-thread','sluice-gate-gearbox','sluice-gate-gearbox-mount','sluice-gate-handwheel']}
 for(const slug of slugs)for(const low of [false,true]){
  const closed=build(slug,{low}),open=build(slug,{low,open:true})
  for(const name of fixed[slug]){
   const a=named(closed,name),b=named(open,name);assert(a.length,name+' exists');assert.equal(a.length,b.length,name+' fixed count')
   a.forEach((part,i)=>assert.deepEqual(part.geometry.attributes.position.array,b[i].geometry.attributes.position.array,name+' fixed final coordinates'))
  }
  closed.dispose();open.dispose()
 }
})

test('Gate leaves expose an open passage and retain real hinge, wood/strap and two-sided pull contacts',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270])for(const open of [false,true]){
  const m=build('gate',{low,facing,open})
  assert.equal(!!ray(m,[.10,.40,2],[0,0,-1]).length,!open,'gate passage changes with leaf state')
  for(const side of [-1,1]){
   const pose=p=>open?hinged(p,[side*.395,0,0],side*Math.PI/2):p,hx=side*.075
   for(const y of [.22,.70]){
    joined(m,named(m,'gate-frame-hinge-plate'),named(m,'gate-frame-hinge-knuckle'),[side*.405,y+.029,0],'gate fixed hinge plate/backing')
    joined(m,named(m,'gate-frame-hinge-pin'),named(m,'gate-leaf-hinge-knuckle'),[side*.395,y,0],'gate common pintle axis')
    joined(m,named(m,'gate-leaf-hinge-knuckle'),named(m,'gate-leaf-hinge-tongue'),pose([side*.390,y,0]),'gate moving hinge tongue')
    joined(m,named(m,'gate-leaf-strap'),named(m,'gate-leaf-plank'),pose([side*.075,y,.022]),'gate strap backs into wood')
   }
   for(const face of [-1,1]){
    joined(m,named(m,'gate-leaf-handle-plate'),named(m,'gate-leaf-plank'),pose([hx,.45,face*.022]),'gate pull plate backing')
    joined(m,named(m,'gate-leaf-handle-plate'),named(m,'gate-leaf-handle-boss'),pose([hx,.459,face*.060]),'gate pull spindle seated in plate')
    joined(m,named(m,'gate-leaf-handle-boss'),named(m,'gate-leaf-handle'),pose([hx,.459,face*.075]),'gate ring retained on spindle')
   }
  }
  m.dispose()
 }
})

test('Shutters have separate framed panels and real slats with angled ventilation, attached hinges and pulls',()=>{
 for(const low of [false,true])for(const facing of [0,90,180,270]){
  const m=build('shutters',{low,facing}),open=build('shutters',{low,facing,open:true}),slats=named(m,'shutter-louvre')
  assert.equal(slats.length,20);assert.equal(ray(m,[.18,.60,2],[0,0,-1],named(m,'shutter-panel')).length,0,'upper louvres have no opaque backing slab')
  for(let i=0;i<10;i++)joined(m,slats,named(m,'shutter-stile'),[.030,.493+i*.040,.015],'slat end enters structural stile')
  for(const y of [.48,.51,.56,.60,.66,.72,.79,.85])assert(ray(m,[.18,y,2],[0,0,-1]).length,'closed front view remains screened')
  const d=[0,-Math.sin(.60),Math.cos(.60)],gap=[.18,.513,.015],start=gap.map((v,i)=>v-d[i]*.5)
  assert.equal(ray(m,start,d,slats).length,0,'there is an actual angled air gap between the louvres')
  assert.equal(ray(open,[.18,.60,2],[0,0,-1]).length,0,'opened leaves clear the window')
  for(const side of [-1,1]){
   for(const y of [.22,.80]){
    joined(m,named(m,'shutter-frame-hinge-plate'),named(m,'shutter-frame-hinge-knuckle'),[side*.405,y+.025,.015],'shutter fixed hinge plate')
    joined(m,named(m,'shutter-leaf-hinge-knuckle'),named(m,'shutter-leaf-hinge-tongue'),[side*.398,y,.015],'shutter moving hinge tongue')
   }
   joined(m,named(m,'shutter-pull-plate'),named(m,'shutter-panel'),[side*.055,.365,.0275],'shutter pull backing')
   joined(m,named(m,'shutter-pull-boss'),named(m,'shutter-pull-ring'),[side*.055,.362,.068],'shutter pull retained in spindle')
  }
  m.dispose();open.dispose()
 }
})

test('Portcullis lattice, hoist links, bearing blocks and winding drums remain physically connected',()=>{
 for(const low of [false,true])for(const open of [false,true])for(const facing of [0,90,180,270]){
  const m=build('portcullis',{low,open,facing}),lift=open?.72:0
  assert.equal(!!ray(m,[.085,.35,2],[0,0,-1]).length,!open,'raised grille clears the lower passage')
  assert.equal(ray(m,[.0425,.26+lift,2],[0,0,-1],named(m,'portcullis-upright')).length,0,'iron grid retains real holes')
  assert.equal(ray(m,[.235,.90,.080],[0,1,0],named(m,'portcullis-crosshead')).length,0,'clevis and chain have clearance through the fixed head slot')
  for(let i=0;i<9;i++)for(let j=0;j<4;j++)joined(m,named(m,'portcullis-upright'),named(m,'portcullis-crossbar'),[(i-4)*.085,.17+j*.21+lift,0],'portcullis crossing joint')
  for(const x of [-.385,.385])joined(m,named(m,'portcullis-edge-stile'),named(m,'portcullis-crossbar'),[x,.38+lift,0],'portcullis perimeter')
  for(const x of [-.33,.33]){
   joined(m,named(m,'portcullis-hoist-bearing'),named(m,'portcullis-hoist-axle'),[x,1.84,0],'hoist axle seats in bearing')
   joined(m,named(m,'portcullis-hoist-bearing'),named(m,'portcullis-hoist-crosshead'),[x,1.92,0],'bearing hangs from masonry beam')
  }
  const chains=named(m,'portcullis-hoist-chain'),perChain=chains.length/2
  for(let side=0;side<2;side++){
   const x=side? .235:-.235,parts=chains.slice(side*perChain,(side+1)*perChain),start=.927+lift,end=1.824
   joined(m,named(m,'portcullis-hoist-eye'),named(m,'portcullis-hoist-clevis'),[x,.875+lift,.073],'hoist eye has clevis backing')
   joined(m,[parts[0]],named(m,'portcullis-hoist-eye'),[x,.913+lift,.073],'chain catches lower eye')
   for(let i=0;i<parts.length-1;i++)joined(m,[parts[i]],[parts[i+1]],[x,start+(end-start)*(i+.5)/(parts.length-1),.073],'alternating links interlock '+[low,open,facing,i])
   assert([[x+.008,1.84,.073],[x,1.84,.065]].some(p=>{const point=authored(m,p);return inside(parts.at(-1),point)&&named(m,'portcullis-hoist-drum').some(d=>inside(d,point))}),'chain joins the actual winding drum')
   joined(m,named(m,'portcullis-hoist-drum'),named(m,'portcullis-hoist-drum-flange'),[x+.046,1.84,.06],'drum flange joins barrel')
  }
  m.dispose()
 }
})

test('Sluice drive and travelling nut attach behind a connected blade without blocking its raised opening',()=>{
 for(const low of [false,true])for(const open of [false,true])for(const facing of [0,90,180,270]){
  const m=build('sluice-gate',{low,open,facing}),lift=open?.72:0
  assert.equal(!!ray(m,[.10,.34,2],[0,0,-1]).length,!open,'sluice leaf opens the waterway')
  assert.equal(ray(m,[.036,.70,-.100],[0,1,0],named(m,'sluice-gate-crosshead')).length,0,'travelling yoke passes the forked crosshead without hitting a fixed beam')
  for(const x of [-.25,.25])for(let i=0;i<5;i++)joined(m,named(m,'sluice-gate-board'),named(m,'sluice-gate-brace'),[x,.1135+i*.147+lift,.040],'sluice brace backs onto every plank')
  for(const x of [-.360,.360])joined(m,named(m,'sluice-gate-board'),named(m,'sluice-gate-leaf-stile'),[x,.40+lift,0],'sluice side stile joins infill')
  joined(m,named(m,'sluice-gate-lifting-screw'),named(m,'sluice-gate-screw-thread'),[.0135,.65,-.100],'helical thread penetrates its shaft')
  const nutY=.49+lift,threadAngle=(nutY-.45)/.05*Math.PI*2
  joined(m,named(m,'sluice-gate-screw-thread'),named(m,'sluice-gate-travelling-nut'),[Math.cos(threadAngle)*.016,nutY,-.100+Math.sin(threadAngle)*.016],'travelling nut grips the actual helix '+[low,open,facing])
  joined(m,named(m,'sluice-gate-travelling-nut'),named(m,'sluice-gate-travelling-yoke'),[.025,.49+lift,-.100],'nut mounts in actual side yoke')
  joined(m,named(m,'sluice-gate-travelling-yoke'),named(m,'sluice-gate-board'),[.036,.49+lift,-.025],'travelling yoke bolts into blade')
  joined(m,named(m,'sluice-gate-gearbox'),named(m,'sluice-gate-lifting-screw'),[0,1.34,-.100],'stem enters gearbox')
  joined(m,named(m,'sluice-gate-gearbox'),named(m,'sluice-gate-gearbox-mount'),[.040,1.38,-.120],'gearbox support bracket')
  joined(m,named(m,'sluice-gate-upper-crosshead'),named(m,'sluice-gate-gearbox-mount'),[.040,1.47,-.125],'gearbox hangs from fixed crosshead')
  joined(m,named(m,'sluice-gate-wheel-spindle'),named(m,'sluice-gate-gearbox'),[0,1.36,-.110],'wheel spindle enters gearbox')
  joined(m,named(m,'sluice-gate-wheel-spindle'),named(m,'sluice-gate-handwheel-spoke'),[0,1.36,-.140],'spokes meet the actual spindle')
  joined(m,named(m,'sluice-gate-handwheel'),named(m,'sluice-gate-handwheel-spoke'),[.108,1.36,-.140],'spokes reach handwheel rim')
  m.dispose()
 }
})
