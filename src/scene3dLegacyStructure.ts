import * as THREE from 'three'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'
import {legacyAsset} from './legacyAssets.ts'
import {legacyKit} from './scene3dLegacyKit.ts'

// Reserve the complete movement volume in authoring coordinates. The fixed
// frame, feet and glass then use the identical transform in every saved state.
// In particular a closed floor hatch occupies only the bottom of this volume;
// its reserved height is the clearance for the raised lid.
const motionEnvelopes:Record<string,[number[],number[]]>={
 'iron-door':[[-.5,0,-.11],[.5,1.01,.73]],
 'arched-door':[[-.5,0,-.115],[.5,1.05,.73]],
 gate:[[-.56,0,-.14],[.56,1.045,.41]],
 portcullis:[[-.515,0,-.125],[.515,1.98,.125]],
 'sluice-gate':[[-.515,0,-.154],[.515,1.51,.154]],
 shutters:[[-.5,.025,-.135],[.5,.985,.408]],
 'road-barrier':[[-.505,0,-.115],[.505,1.47,.115]],
 trapdoor:[[-.5,0,-.5],[.5,.835,.5]],
 'trap-grate':[[-.5,0,-.5],[.5,.835,.5]],
 'drawbridge-machine':[[-.626,0,-.42],[.5,.975,.502]],
 campfire:[[-.46,0,-.385],[.46,.623,.385]],
 torch:[[-.13,0,-.13],[.13,1.161,.13]],
 'street-lamp':[[-.13,0,-.13],[.13,1.252,.13]],
 'hanging-lantern':[[-.156,-.0225,-.156],[.156,.924,.156]],
 'signal-lantern':[[-.193,-.017,-.281],[.319,.941,.281]],
}

// These are presentation models for the original artwork IDs. All parts are
// constructed in one local frame; the kit bakes the complete assembly to the
// saved dimensions once, including unusual older saves and open hinge poses.
export function populateLegacyStructure(e:RenderEntity,output:ModelMesh,low=false):boolean{
 const asset=legacyAsset(e.geometry)
 if(!asset||asset.group!=='structure'||asset.native)return false
 const parts:THREE.Mesh[]=[],k=legacyKit(e,(...args)=>{const p=output(...args);parts.push(p);return p},low)
 const {mesh,box,cylinder,beam,ring,lathe,extrude,tube,ellipsoid,wood,stone,iron,finish}=k
 const oak='#8b6343',lightWood='#ac8155',darkWood='#594534',rock='#78817c',lightStone='#a8aaa0',darkStone='#555f5a',metal='#545c5b',brass='#b39a60',rope='#b3a480'
 const cloth:Surface={roughness:.94},water:Surface={roughness:.2,metalness:.25,opacity:.86,castShadow:false},glass:Surface={roughness:.2,metalness:.12,opacity:.32,castShadow:false}
 const flameSurface:Surface={roughness:.65,castShadow:false,...(e.geometry.active!==false?{emissive:'#ffad45'}:{})}
 const open=!!e.geometry.open,lit=e.geometry.active!==false
 const pose=(make:()=>void,pivot:number[],axis:'x'|'y'|'z',angle:number)=>{
  const first=parts.length;make();const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0),angle),v=new THREE.Vector3(...pivot)
  for(const p of parts.slice(first)){p.position.sub(v).applyQuaternion(q).add(v);p.quaternion.premultiply(q)}
 }
 const bolt=(x:number,y:number,z:number)=>{const p=cylinder('legacy-iron-rivet',.012,.012,.015,x,y,z,brass,iron,low?5:8);p.rotation.x=Math.PI/2}
 const post=(name:string,x:number,z:number,h=1)=>{
  box(name,.075,h,.075,x,h/2,z,oak);box(name+'-cap',.1,.035,.1,x,h+.012,z,lightWood)
 }
 const wedge=(name:string,ri:number,ro:number,a:number,b:number,depth:number,y:number,color=rock)=>{
  const n=low?1:3,points:number[][]=[]
  for(let i=0;i<=n;i++){const t=a+(b-a)*i/n;points.push([Math.cos(t)*ro,Math.sin(t)*ro+y])}
  for(let i=n;i>=0;i--){const t=a+(b-a)*i/n;points.push([Math.cos(t)*ri,Math.sin(t)*ri+y])}
  return extrude(name,points,depth,0,0,0,color,stone)
 }
 const arch=(name:string)=>{
  for(const side of [-1,1])for(let row=0;row<4;row++)box(name+'-pier-course',.13,.137,.23,side*.435,.0685+row*.14,0,row%2?rock:lightStone,stone,.045)
  const n=low?7:11
  for(let i=0;i<n;i++)wedge(name+'-voussoir',.37,.5,i*Math.PI/n+.008,(i+1)*Math.PI/n-.008,.23,.55,i===Math.floor(n/2)?lightStone:rock)
 }
 const roundBasin=(name:string,x:number,y:number,z:number,r=.43,h=.24,color=rock,surface:Surface=stone)=>{
  // The continuous cross section travels along the underside, outer wall,
  // lip, inner wall and floor. Its centre is an actual open bowl.
  lathe(name,[[0,0],[r*.72,0],[r*.92,h*.13],[r,h*.87],[r,h],[r*.84,h],[r*.79,h*.42],[0,h*.38]],x,y,z,color,surface)
 }
 const liquid=(name:string,x:number,y:number,z:number,r:number,color='#467d87')=>cylinder(name,r,r,.008,x,y,z,color,water,low?12:24)
 const lantern=(name:string,x:number,y:number,z:number,scale=1,signal=false)=>{
  const b=(s:number)=>s*scale
  box(name+'-base',b(.26),b(.045),b(.23),x,y,z,metal,iron)
  box(name+'-base-moulding',b(.272),b(.018),b(.242),x,y+b(.029),z,metal,iron)
  box(name+'-cap',b(.30),b(.045),b(.27),x,y+b(.34),z,metal,iron)
  // A closed thin shell retains the familiar square silhouette without
  // filling the roof with metal. The inner roof and glass leave a real cavity.
  const hoodGeometry=new THREE.LatheGeometry([[.22,0],[.035,.14],[.025,.14],[.205,.012],[.22,0]].map(([r,h])=>new THREE.Vector2(b(r),b(h))),4);hoodGeometry.name=name+'-hood'
  const hood=mesh(hoodGeometry,metal,x,y+b(.355),z,iron);hood.rotation.y=Math.PI/4
  lathe(name+'-vent-chimney',[[0,0],[b(.028),0],[b(.028),b(.014)],[b(.019),b(.02)],[b(.019),b(.036)],[0,b(.036)]],x,y+b(.493),z,brass,iron)
  for(const dx of [-1,1])for(const dz of [-1,1])box(name+'-mullion',b(.022),b(.31),b(.022),x+dx*b(.105),y+b(.175),z+dz*b(.09),brass,iron)
  for(const side of [-1,1]){
   box(name+'-glass',b(.19),b(.27),b(.004),x,y+b(.17),z+side*b(.083),lit?'#e9c487':'#7f9993',glass,0)
   box(name+'-glass',b(.004),b(.27),b(.16),x+side*b(.098),y+b(.17),z,lit?'#e9c487':'#7f9993',glass,0)
   for(const lift of [.041,.306])box(name+'-glazing-rail',b(.206),b(.014),b(.017),x,y+b(lift),z+side*b(.088),brass,iron)
  }
  lathe(name+'-burner',[[0,0],[b(.052),0],[b(.060),b(.014)],[b(.057),b(.030)],[b(.039),b(.041)],[b(.023),b(.046)],[0,b(.046)]],x,y+b(.042),z,brass,iron)
  cylinder(name+'-wick-collar',b(.018),b(.024),b(.017),x,y+b(.096),z,metal,iron)
  if(!low){
   for(const lift of [.103,.263])cylinder(name+'-door-hinge',b(.012),b(.012),b(.035),x-b(.105),y+b(lift),z+b(.102),metal,iron,8)
   box(name+'-door-latch',b(.032),b(.043),b(.013),x+b(.096),y+b(.183),z+b(.106),metal,iron)
   ring(name+'-latch-pull',b(.013),b(.004),x+b(.096),y+b(.183),z+b(.118),brass,iron,'z')
  }
  if(lit){const p=ellipsoid(name+'-flame',b(.035),b(.085),b(.035),x,y+b(.18),z,signal?'#f37d3d':'#ffd486',flameSurface);p.geometry.name=name+'-optical-emitter'}
  else box(name+'-wick',b(.02),b(.018),b(.02),x,y+b(.098),z,'#292d2b',cloth)
  ring(name+'-handle',b(.08),b(.012),x,y+b(.54),z,metal,iron,'z')
  if(signal)for(const side of [-1,1]){
   const flap=box(name+'-shutter',b(.09),b(.28),b(.018),x+side*b(.16),y+b(.18),z+b(.12),metal,iron);flap.rotation.y=side*.6
  }
 }
 const fire=(name:string,x:number,y:number,z:number,scale=1)=>{
  if(!lit)return
  for(let i=0;i<(low?2:4);i++){
   const a=i*2.4,p=ellipsoid(name+'-flame',scale*(i?.08:.12),scale*(i?.15:.24),scale*.08,x+Math.sin(a)*scale*.085,y+scale*(i?.14:.19),z+Math.cos(a)*scale*.07,i%2?'#ffd788':'#ed8e42',flameSurface)
   p.rotation.z=Math.sin(a)*.26
  }
 }
 // This leaf helper belongs only to the original two-leaf gate.
 const doorLeaf=(name:string,x0:number,x1:number,height:number)=>{
  const w=x1-x0,center=(x0+x1)/2,n=low?3:5
  for(const x of [x0+.016,x1-.016])box(name+'-stile',.032,height-.04,.062,x,(height+.04)/2,0,oak)
  for(const y of [.061,height-.022])box(name+'-rail',w-.040,.045,.064,center,y,0,darkWood)
  for(let i=0;i<n;i++)box(name+'-plank',(w-.040)/n-.0015,height-.115,.052,x0+.020+(i+.5)*(w-.040)/n,(height+.04)/2,0,i%3===0?lightWood:oak)
  for(const side of [-1,1])for(const y of [.22,.70]){
   box(name+'-strap',w*.94,.034,.026,center,y,side*.029,metal,iron)
   if(!low)for(const x of [x0+.045,center,x1-.045])bolt(x,y,side*.043)
  }
  const hx=center<0?x1-.070:x0+.070
  for(const side of [-1,1]){
   box(name+'-handle-plate',.046,.10,.044,hx,.45,side*.040,metal,iron)
   const boss=cylinder(name+'-handle-boss',.012,.014,.030,hx,.459,side*.067,brass,iron,low?6:10);boss.rotation.x=Math.PI/2
   ring(name+'-handle',.028,.007,hx,.432,side*.075,brass,iron,'z')
  }
 }
 // Detailed leaves are kept separate from the gate helper above: the four
 // original door/hatch IDs retain their own hardware and movement envelopes.
 const curvedBand=(name:string,ri:number,ro:number,depth:number,y:number,z:number,color:string,surface:Surface)=>{
  const n=low?12:28,points:number[][]=[]
  for(let i=0;i<=n;i++){const a=i*Math.PI/n;points.push([Math.cos(a)*ro,y+Math.sin(a)*ro])}
  for(let i=n;i>=0;i--){const a=i*Math.PI/n;points.push([Math.cos(a)*ri,y+Math.sin(a)*ri])}
  return extrude(name,points,depth,0,0,z,color,surface)
 }
 const faceRivet=(name:string,x:number,y:number,z:number,r=.009)=>{
  const p=cylinder(name,r,r*.9,.012,x,y,z,brass,iron,low?5:8);p.rotation.x=Math.PI/2
 }
 const detailedDoor=(name:string,arched:boolean)=>{
  if(arched){
   arch('arched-door-frame')
   // A projecting archivolt has real depth around the individually cut stones.
   for(const side of [-1,1]){
    curvedBand(name+'-frame-archivolt',.475,.497,.024,.55,side*.102,lightStone,stone)
    for(const x of [-.486,.486])box(name+'-frame-moulding',.025,.55,.024,x,.275,side*.102,lightStone,stone)
   }
  }else{
   for(const x of [-.435,.435])for(let row=0;row<5;row++)box('iron-door-jamb',.13,.198,.22,x,.1+row*.20,0,row%2?rock:lightStone,stone,.045)
   for(let i=0;i<5;i++)box('iron-door-lintel',.198,.10,.22,-.4+i*.2,.96,0,i===2?lightStone:rock,stone,.045)
   for(const x of [-.378,.378])box(name+'-frame-rebate',.016,.88,.17,x,.46,-.018,metal,iron)
  }
  box(name+'-frame-threshold',.74,.03,.20,0,.015,0,darkStone,stone)
  for(const y of [.20,.69]){
   // Jamb plates and outer knuckles remain stationary; the centre knuckle
   // belongs to the leaf and shares this exact vertical pintle axis.
   box(name+'-frame-hinge-plate',.075,.085,.032,-.399,y,0,metal,iron)
   for(const dy of [-.031,.031])cylinder(name+'-frame-hinge-knuckle',.022,.022,.029,-.365,y+dy,0,metal,iron,low?7:12)
   cylinder(name+'-frame-hinge-pin',.011,.011,.10,-.365,y,0,brass,iron,low?6:10)
  }
  pose(()=>{
   if(arched){
    const n=low?5:7,w=.716/n,r=.358
    for(let i=0;i<n;i++){
     const left=-.358+i*w+.001,right=left+w-.002,points=[[left,.035],[right,.035]],segments=low?4:6
     // Sample the actual circular top of every plank; adjacent planks follow
     // the same arch rather than ending in horizontal stair steps.
     for(let j=0;j<=segments;j++){const x=right+(left-right)*j/segments;points.push([x,.55+Math.sqrt(Math.max(0,r*r-x*x))])}
     extrude(name+'-plank',points,.055,0,0,0,i%3===0?lightWood:oak,wood)
    }
    for(const side of [-1,1])curvedBand(name+'-leaf-arch-band',.335,.353,.014,.55,side*.034,metal,iron)
    for(const side of [-1,1])for(const y of [.20,.49])box(name+'-leaf-strap',.704,.041,.018,-.009,y,side*.034,metal,iron)
    if(!low){
     beam(name+'-back-diagonal',[-.31,.10,-.040],[.28,.47,-.040],.019,darkWood)
     for(const x of [-.295,-.11,.10,.29])for(const y of [.20,.49])for(const side of [-1,1])faceRivet(name+'-strap-rivet',x,y,side*.048)
    }
   }else{
    // The core is continuous; overlapping rolled plates create seams without
    // turning the metal door into a collection of disconnected thin sheets.
    box(name+'-leaf-core',.73,.865,.040,0,.4675,0,darkStone,iron)
    const cols=low?2:3,rows=3
    for(const side of [-1,1])for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)box(name+'-face-plate',.72/cols-.006,.852/rows-.006,.021,-.36+(col+.5)*.72/cols,.041+(row+.5)*.852/rows,side*.029,((row+col)%3===0?metal:'#606968'),iron)
    for(const side of [-1,1]){
     for(const x of [-.351,.351])box(name+'-leaf-edge-rail',.022,.86,.018,x,.4675,side*.047,metal,iron)
     for(const y of [.055,.88,.20,.69])box(name+'-leaf-strap',.72,.027,.018,0,y,side*.047,metal,iron)
    }
    if(!low)for(const side of [-1,1])for(const x of [-.32,0,.32])for(const y of [.055,.20,.69,.88])faceRivet(name+'-plate-rivet',x,y,side*.061)
   }
   for(const y of [.20,.69]){
    cylinder(name+'-leaf-hinge-knuckle',.021,.021,.031,-.365,y,0,metal,iron,low?7:12)
    box(name+'-leaf-hinge-tongue',.11,.037,.044,-.319,y,0,metal,iron)
   }
   // Both sides have a physical escutcheon, spindle and hanging ring pull.
   for(const side of [-1,1]){
    const z=side*(arched?.043:.061)
    // Keep the exposed face in place while the plate embeds into the leaf.
    box(name+'-handle-plate',.057,.105,arched?.036:.040,.25,.405,side*(arched?.033:.049),metal,iron)
    const boss=cylinder(name+'-handle-boss',.015,.018,.026,.25,.419,z+side*.014,brass,iron,low?6:10);boss.rotation.x=Math.PI/2
    ring(name+'-handle',.032,.008,.25,.39,z+side*.022,brass,iron,'z')
   }
   box(name+'-lock-case',.064,.082,.022,.25,.30,arched?.033:.047,metal,iron)
   if(e.geometry.locked)box('door-lock',.065,.08,.018,.25,.30,arched?.050:.064,brass,iron)
  },[-.365,0,0],'y',open?-Math.PI/2:0)
 }
 const hatchFrame=(name:string)=>{
  for(const x of [-1,1])for(let i=0;i<3;i++)box(name+'-side',.11,.09,.331,x*.445,.045,-.333+i*.333,rock,stone)
  for(const z of [-1,1])for(let i=0;i<3;i++)box(name+'-end',.258,.09,.11,-.26+i*.26,.045,z*.445,i===1?lightStone:rock,stone)
  // Thin iron angles provide a real seating ledge beneath the closed lid.
  for(const x of [-.382,.382])box(name+'-seat',.036,.018,.78,x,.042,0,metal,iron)
  for(const z of [-.382,.382])box(name+'-seat',.728,.018,.036,0,.042,z,metal,iron)
 }
 const hatchLeaf=(name:string,grate=false)=>{
  for(const x of [-.26,.26]){
   box(name+'-frame-hinge-plate',.11,.017,.116,x,.080,-.438,metal,iron)
   for(const dx of [-.037,.037]){
    const p=cylinder(name+'-hinge',.022,.022,.036,x+dx,.075,-.38,metal,iron,low?7:12);p.rotation.z=Math.PI/2
   }
   const pin=cylinder(name+'-frame-hinge-pin',.010,.010,.12,x,.075,-.38,brass,iron,low?6:10);pin.rotation.z=Math.PI/2
  }
  pose(()=>{
   if(grate){
    for(const x of [-.364,.364])box(name+'-rim',.032,.043,.76,x,.077,0,metal,iron)
    for(const z of [-.364,.364])box(name+'-rim',.72,.043,.032,0,.077,z,metal,iron)
    for(let i=0;i<7;i++)box(name+'-bar',.025,.038,.736,(i-3)*.115,.078,0,metal,iron)
    for(let i=0;i<5;i++)box(name+'-crossbar',.736,.028,.025,0,.071,(i-2)*.18,metal,iron)
    if(!low)for(const x of [-.345,0,.345])for(const z of [-.36,0,.36]){
     const p=cylinder(name+'-grid-rivet',.009,.009,.012,x,.101,z,brass,iron,8)
     p.geometry.name=name+'-grid-rivet'
    }
   }else{
    for(const x of [-.354,.354])box(name+'-edge-rail',.052,.058,.76,x,.075,0,darkWood)
    for(const z of [-.355,.355])box(name+'-end-rail',.672,.058,.05,0,.075,z,darkWood)
    const n=low?5:7
    for(let i=0;i<n;i++)box(name+'-board',.656/n-.002,.058,.666,-.328+(i+.5)*.656/n,.075,0,i%3===0?lightWood:oak)
    for(const x of [-.26,.26]){
     box(name+'-strap',.04,.016,.72,x,.108,0,metal,iron)
     box(name+'-underside-brace',.055,.020,.70,x,.044,0,darkWood)
    }
    if(!low)for(const x of [-.26,.26])for(const z of [-.30,-.09,.13,.30])cylinder(name+'-strap-bolt',.009,.009,.012,x,.121,z,brass,iron,8)
   }
   for(const x of [-.26,.26]){
    const knuckle=cylinder(name+'-leaf-hinge-knuckle',.021,.021,.035,x,.075,-.38,metal,iron,low?7:12);knuckle.rotation.z=Math.PI/2
    beam(name+'-hinge-tongue',[x,.075,-.38],[x,.109,-.31],.015,metal,iron)
   }
   box(name+'-pull-plate',.10,.014,.09,0,.103,.25,metal,iron)
   for(const x of [-.033,.033])cylinder(name+'-pull-eye',.013,.013,.024,x,.121,.25,brass,iron,low?6:10)
   ring(name+'-pull-ring',.041,.008,0,.125,.25,brass,iron,'y')
  },[0,.075,-.38],'x',open?-Math.PI/2:0)
 }
 switch(asset.slug){
  case 'brick-wall':
  case 'broken-wall':{
   const broken=asset.slug==='broken-wall',rows=broken?6:7,cols=low?5:7
   for(let row=0;row<rows;row++){
    const step=1/cols,offset=row%2?step/2:0
    for(let col=-1;col<=cols;col++){
     const left=Math.max(-.5,-.5+col*step+offset),right=Math.min(.5,left+step-.008)
     if(right-left<.02)continue
     const center=(left+right)/2
     if(broken&&row>1+Math.floor(Math.abs(center)*9))continue
     box(broken?'broken-wall-course':'brick-wall-course',right-left,1/rows-.01,.20,center,(row+.5)/rows,0,broken?(row%2?rock:darkStone):(['#95664d','#aa7957','#8a5e49'][(col+row+12)%3]),stone,.045)
    }
   }
   if(broken)for(let i=0;i<(low?3:6);i++){const p=box('broken-wall-fallen-block',.13,.09,.13,(i-2.5)*.14,.045,.18+Math.sin(i*3)*.06,i%2?rock:darkStone,stone);p.rotation.y=i*.8}
   break
  }
  case 'palisade':{
   const n=low?7:11
   for(let i=0;i<n;i++){
    const x=-.45+i*.9/(n-1),h=.86+(i%3)*.045
    cylinder('palisade-log',.043,.052,h,x,h/2,0,i%2?oak:lightWood)
    cylinder('palisade-point',0,.043,.14,x,h+.07,0,lightWood,wood,low?6:10)
    if(!low)for(const y of [.25,.64])ring('palisade-binding',.052,.007,x,y,0,rope,cloth,'y')
   }
   for(const y of [.24,.64])box('palisade-cross-rail',1,.055,.06,0,y,-.055,darkWood)
   break
  }
  case 'iron-fence':{
   for(const x of [-.48,.48]){box('iron-fence-post',.055,.94,.055,x,.47,0,metal,iron);ellipsoid('iron-fence-finial',.05,.06,.05,x,.98,0,brass,iron)}
   for(const y of [.22,.7])box('iron-fence-rail',.94,.035,.038,0,y,0,metal,iron)
   for(let i=0;i<(low?7:11);i++){const n=low?7:11,x=-.42+i*.84/(n-1);box('iron-fence-upright',.022,.78,.025,x,.51,0,metal,iron);const p=cylinder('iron-fence-spear',0,.04,.12,x,.96,0,metal,iron,4);p.rotation.y=Math.PI/4}
   if(!low)for(const x of [-.24,0,.24])for(const s of [-1,1]){const p=ring('iron-fence-scroll',.085,.009,x+s*.065,.48,0,metal,iron,'z');p.scale.y=1.3}
   break
  }
  case 'iron-door':
  case 'arched-door':detailedDoor(asset.slug,asset.slug==='arched-door');break
  case 'portcullis':{
   const lift=open?.72:0
   for(const x of [-.46,.46]){
    for(let row=0;row<5;row++)box('portcullis-pier',.11,.218,.23,x,.11+row*.22,0,row%2?rock:lightStone,stone,.04)
    for(let row=0;row<4;row++)box('portcullis-upper-guide-tower',.07,.203,.18,x,1.2025+row*.205,0,rock,stone,.04)
    for(const z of [-.049,.049])box('portcullis-guide',.052,1.53,.035,Math.sign(x)*.408,.815,z,metal,iron)
    box('portcullis-guide-channel-back',.021,1.53,.132,Math.sign(x)*.421,.815,0,metal,iron)
   }
   // Two head beams leave a real slot through which the grille can rise.
   for(const z of [-.110,.110])box('portcullis-crosshead',1,.10,.030,0,1.06,z,lightStone,stone)
   box('portcullis-hoist-crosshead',.99,.08,.22,0,1.94,0,lightStone,stone)
   for(const x of [-.385,.385])box('portcullis-edge-stile',.032,.83,.056,x,.45+lift,0,metal,iron)
   box('portcullis-bottom-rail',.79,.036,.056,0,.095+lift,0,metal,iron)
   box('portcullis-top-rail',.80,.060,.070,0,.86+lift,0,metal,iron)
   for(let i=0;i<9;i++){
    const x=(i-4)*.085
    box('portcullis-upright',.028,.82,.042,x,.45+lift,0,metal,iron)
    const p=cylinder('portcullis-spike',0,.025,.09,x,.055+lift,0,metal,iron,4);p.rotation.z=Math.PI
   }
   for(let i=0;i<4;i++){
    const y=.17+i*.21+lift
    box('portcullis-crossbar',.79,.035,.054,0,y,0,metal,iron)
    if(!low)for(let j=0;j<9;j++)faceRivet('portcullis-grid-rivet',(j-4)*.085,y,.029,.008)
   }
   beam('portcullis-hoist-axle',[-.40,1.84,0],[.48,1.84,0],.025,metal,iron)
   for(const x of [-.33,.33])box('portcullis-hoist-bearing',.09,.12,.13,x,1.875,0,metal,iron)
   for(const x of [-.235,.235]){
    const drum=cylinder('portcullis-hoist-drum',.075,.075,.095,x,1.84,0,darkWood,wood,low?8:14);drum.rotation.z=Math.PI/2
    for(const dx of [-.052,.052]){const flange=cylinder('portcullis-hoist-drum-flange',.085,.085,.014,x+dx,1.84,0,metal,iron,low?8:14);flange.rotation.z=Math.PI/2}
    box('portcullis-hoist-clevis',.065,.044,.112,x,.875+lift,.026,metal,iron)
    ring('portcullis-hoist-eye',.022,.007,x,.895+lift,.073,metal,iron,'z')
    // Alternating small solid links remain interlocked in both LODs. The
    // endpoint is inside the winding drum; the clevis backs the lower eye.
    const start=.927+lift,end=1.824,count=Math.max(2,Math.floor((end-start)/.029)+1)
    for(let i=0;i<count;i++){
     const g=new THREE.TorusGeometry(.018,.005,low?3:4,low?6:8);g.name='portcullis-hoist-chain'
     const p=mesh(g,metal,x,start+(end-start)*i/(count-1),.073,iron);if(i%2===0)p.rotation.y=Math.PI/2
    }
   }
   ring('portcullis-crank-wheel',.075,.009,.48,1.84,0,metal,iron,'x')
   for(let i=0;i<4;i++){const a=i*Math.PI/2;beam('portcullis-crank-spoke',[.48,1.84,0],[.48,1.84+Math.cos(a)*.075,Math.sin(a)*.075],.008,metal,iron)}
   const grip=cylinder('portcullis-crank-grip',.012,.012,.030,.485,1.90,0,darkWood,wood,low?6:10);grip.rotation.z=Math.PI/2
   break
  }
  case 'sluice-gate':{
   const lift=open?.72:0
   for(const x of [-.46,.46]){
    box('sluice-gate-pier',.11,1.10,.23,x,.55,0,oak)
    box('sluice-gate-post-shoe',.110,.13,.25,x,.065,0,metal,iron)
    box('sluice-gate-upper-guide',.075,.39,.17,x,1.295,0,darkWood)
    for(const z of [-.072,.072])box('sluice-gate-guide',.042,1.43,.028,Math.sign(x)*.395,.765,z,metal,iron)
    box('sluice-gate-guide-channel-back',.022,1.43,.16,Math.sign(x)*.417,.765,0,metal,iron)
    if(!low)for(const y of [.16,.62,1.04,1.40])for(const z of [-.091,.091])faceRivet('sluice-gate-guide-bolt',Math.sign(x)*.411,y,z,.008)
   }
   box('sluice-gate-crosshead',1,.10,.040,0,1.06,.105,lightWood)
   // The rear crosshead is forked around the travelling screw/yoke.
   for(const x of [-.285,.285])box('sluice-gate-crosshead',.430,.10,.040,x,1.06,-.105,lightWood)
   for(const z of [-.128,.128])box('sluice-gate-upper-crosshead',.98,.055,.036,0,1.475,z,darkWood)
   for(let i=0;i<5;i++)box('sluice-gate-board',.740,.153,.090,0,.1135+i*.147+lift,0,i%2?lightWood:oak)
   for(const x of [-.365,.365])box('sluice-gate-leaf-stile',.042,.740,.100,x,.410+lift,0,metal,iron)
   for(const y of [.061,.768])box('sluice-gate-leaf-rail',.778,y<.1?.048:.044,.090,0,y+lift,0,metal,iron)
   for(const x of [-.25,.25]){
    box('sluice-gate-brace',.052,.740,.036,x,.410+lift,.052,metal,iron)
    if(!low)for(let i=0;i<5;i++)faceRivet('sluice-gate-brace-bolt',x,.1135+i*.147+lift,.070,.008)
   }
   beam('sluice-gate-back-brace',[-.31,.14+lift,-.052],[.31,.68+lift,-.052],.012,darkWood)
   // A non-rising screw stays behind the blade. Its travelling nut attaches
   // at the blade's middle, so it stays below the fixed gearbox when raised.
   cylinder('sluice-gate-lifting-screw',.014,.014,.965,0,.9125,-.100,metal,iron,low?8:14)
   const points=[] as THREE.Vector3[],turns=17
   for(let i=0;i<=turns*10;i++){const a=i*Math.PI/5;points.push(new THREE.Vector3(Math.cos(a)*.016,.45+i/(turns*10)*.85,-.100+Math.sin(a)*.016))}
   const curve=new THREE.CatmullRomCurve3(points),segments=low?136:170,radial=low?3:5,g=new THREE.TubeGeometry(curve,segments,.006,radial,false),positions=Array.from(g.attributes.position.array),uv=Array.from(g.attributes.uv.array),indices=Array.from(g.index!.array)
   for(let side=0;side<2;side++){
    const center=curve.getPointAt(side),normal=curve.getTangentAt(side).multiplyScalar(side?1:-1),offset=side?segments*(radial+1):0,index=positions.length/3
    positions.push(center.x,center.y,center.z);uv.push(.5,.5)
    for(let i=0;i<radial;i++){const a=offset+i,b=a+1,va=new THREE.Vector3().fromArray(positions,a*3).sub(center),vb=new THREE.Vector3().fromArray(positions,b*3).sub(center);indices.push(...(va.cross(vb).dot(normal)>0?[index,a,b]:[index,b,a]))}
   }
   g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.name='sluice-gate-screw-thread';mesh(g,metal,0,0,0,iron)
   ring('sluice-gate-travelling-nut',.025,.012,0,.49+lift,-.100,brass,iron,'y')
   for(const x of [-.036,.036])box('sluice-gate-travelling-yoke',.030,.050,.120,x,.49+lift,-.060,metal,iron)
   box('sluice-gate-travelling-yoke-front',.102,.050,.050,0,.49+lift,-.0125,metal,iron)
   box('sluice-gate-gearbox',.090,.090,.070,0,1.36,-.100,metal,iron)
   for(const x of [-.045,.045])box('sluice-gate-gearbox-mount',.030,.130,.050,x,1.42,-.125,metal,iron)
   const spindle=cylinder('sluice-gate-wheel-spindle',.015,.015,.070,0,1.36,-.117,brass,iron,low?6:10);spindle.rotation.x=Math.PI/2
   ring('sluice-gate-handwheel',.110,.008,0,1.36,-.140,metal,iron,'z')
   for(let i=0;i<4;i++){const a=i*Math.PI/2;beam('sluice-gate-handwheel-spoke',[0,1.36,-.140],[Math.cos(a)*.110,1.36+Math.sin(a)*.110,-.140],.007,metal,iron)}
   break
  }
  case 'gate':{
   for(const x of [-.47,.47]){
    for(let row=0;row<5;row++)box('gate-stone-pier',.13,.198,.24,x,.10+row*.20,0,row%2?rock:lightStone,stone,.04)
    box('gate-pier-cap',.18,.07,.28,x,1.01,0,lightStone,stone)
    for(const y of [.22,.70]){
     box('gate-frame-hinge-plate',.080,.080,.036,Math.sign(x)*.43,y,0,metal,iron)
     for(const dy of [-.029,.029])cylinder('gate-frame-hinge-knuckle',.019,.019,.027,Math.sign(x)*.395,y+dy,0,metal,iron,low?6:10)
     cylinder('gate-frame-hinge-pin',.009,.009,.110,Math.sign(x)*.395,y,0,brass,iron,low?6:10)
    }
   }
   for(const side of [-1,1])pose(()=>{
    const left=side<0?-.395:.005,right=side<0?-.005:.395
    doorLeaf('gate-leaf',left,right,.88)
    beam('gate-diagonal-brace',[left+.04,.12,-.035],[right-.04,.76,-.035],.018,darkWood)
    for(const y of [.22,.70]){
     cylinder('gate-leaf-hinge-knuckle',.018,.018,.031,side*.395,y,0,metal,iron,low?6:10)
     box('gate-leaf-hinge-tongue',.090,.038,.058,side*.357,y,0,metal,iron)
    }
   },[side*.395,0,0],'y',open?side*Math.PI/2:0)
   break
  }
  case 'shutters':{
   for(const x of [-.45,.45])box('shutter-window-jamb',.1,.94,.18,x,.5,0,rock,stone)
   for(const y of [.07,.94])box('shutter-window-sill',1,.09,.27,0,y,0,lightStone,stone)
   for(const side of [-1,1]){
    for(const y of [.22,.80]){
     box('shutter-frame-hinge-plate',.055,.075,.032,side*.423,y,.015,metal,iron)
     for(const dy of [-.025,.025])cylinder('shutter-frame-hinge-knuckle',.014,.014,.024,side*.400,y+dy,.015,metal,iron,low?6:10)
     cylinder('shutter-frame-hinge-pin',.007,.007,.095,side*.400,y,.015,brass,iron,low?6:10)
    }
    pose(()=>{
     const left=side<0?-.392:.008,right=side<0?-.008:.392,w=right-left
     for(const x of [left+.0175,right-.0175])box('shutter-stile',.035,.790,.054,x,.505,.015,oak)
     for(const y of [.128,.450,.882])box('shutter-rail',w-.040,.036,.060,(left+right)/2,y,.015,darkWood)
     const n=low?2:4
     for(let i=0;i<n;i++)box('shutter-panel',(w-.050)/n-.0015,.300,.030,left+.025+(i+.5)*(w-.050)/n,.290,.015,i%2?oak:lightWood)
     // The slats overlap in frontal projection but have real angled gaps
     // between their surfaces; there is no opaque slab behind them.
     for(let i=0;i<10;i++){
      const slat=box('shutter-louvre',w-.040,.025,.066,(left+right)/2,.493+i*.040,.015,lightWood);slat.rotation.x=.60
     }
     for(const y of [.22,.80])box('shutter-strap',w*.95,.026,.028,(left+right)/2,y,.036,metal,iron)
     const hx=side*.055
     box('shutter-pull-plate',.047,.080,.038,hx,.365,.044,metal,iron)
     const boss=cylinder('shutter-pull-boss',.012,.013,.027,hx,.360,.060,brass,iron,low?6:10);boss.rotation.x=Math.PI/2
     ring('shutter-pull-ring',.022,.006,hx,.340,.068,brass,iron,'z')
     for(const y of [.22,.80]){
      cylinder('shutter-leaf-hinge-knuckle',.0135,.0135,.026,side*.400,y,.015,metal,iron,low?6:10)
      box('shutter-leaf-hinge-tongue',.065,.030,.038,side*.374,y,.015,metal,iron)
     }
     if(!low)for(const y of [.22,.80])for(const x of [left+.022,right-.022])faceRivet('shutter-strap-rivet',x,y,.051,.007)
    },[side*.40,0,.015],'y',open?side*Math.PI/2:0)
   }
   break
  }
  case 'ladder':{
   const railZ=(y:number)=>.14-y*.28
   for(const x of [-.4,.4]){
    beam('ladder-side-rail',[x,0,railZ(0)],[x,1,railZ(1)],.047,oak)
    // End ferrules overlap the rails rather than floating in front of them.
    for(const y of [0,.91])beam('ladder-end-ferrule',[x,y,railZ(y)],[x,y+.09,railZ(y+.09)],.052,metal,iron)
   }
   // Both LODs retain the same climbable rhythm and mortised joints.
   for(let i=0;i<10;i++){
    const y=(i+.65)/10,z=railZ(y)
    beam('ladder-rung',[-.407,y,z],[.407,y,z],.027,lightWood)
    if(!low)for(const x of [-.4,.4])beam('ladder-mortise-pin',[x,y,z-.049],[x,y,z+.049],.007,darkWood)
   }
   break
  }
  case 'bridge':
  case 'rope-bridge':{
   const ropeBridge=asset.slug==='rope-bridge'
   // A closed strip can follow a changing profile without gaps between
   // horizontal boxes, detached supports or coincident top-face overlays.
   const strip=(name:string,points:number[][],thickness:number,depth:number,z:number,color:string,surface:Surface=wood)=>extrude(name,[...points,...points.toReversed().map(([x,y])=>[x,y-thickness])],depth,0,0,z,color,surface)
   if(!ropeBridge){
    const n=low?8:14,deckY=(x:number)=>.27+.085*Math.cos(x*Math.PI),profile=Array.from({length:n+1},(_,i)=>{const x=-.5+i/n;return [x,deckY(x)]})
    for(let i=0;i<n;i++)strip('bridge-deck-plank',[profile[i],profile[i+1]],.055,.74,0,i%3===0?lightWood:oak)
    for(const z of [-.31,.31])strip('bridge-longitudinal-beam',profile.map(([x,y])=>[x,y-.055]),.11,.07,z,darkWood)
    for(const x of [-.46,.46]){
     box('bridge-end-bent',.08,.085,.9,x,deckY(x)-.10,0,darkWood)
     for(const z of [-.31,.31])box('bridge-bearing-foot',.14,.075,.16,x,.0375,z,rock,stone)
    }
    for(const z of [-.41,.41]){
     for(const x of [-.46,0,.46]){
      post('bridge-railing-post',x,z,deckY(x)+.52)
      if(!low)for(const lift of [.24,.52])beam('bridge-rail-peg',[x,deckY(x)+lift,z-.03],[x,deckY(x)+lift,z+.03],.008,darkWood)
     }
     for(const lift of [.24,.52])strip('bridge-railing',profile.map(([x,y])=>[x,y+lift]),.035,.045,z,oak)
     for(const x of [-.46,.46])beam('bridge-knee-brace',[x,deckY(x)-.095,z],[x-Math.sign(x)*.13,deckY(x)+.24-.035,z],.021,darkWood)
    }
   }else{
    const n=low?12:24,radial=low?4:6
    const lowerCurve=(z:number,lift=0)=>new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.5,.305+lift,z),new THREE.Vector3(0,.045+lift,z),new THREE.Vector3(.5,.305+lift,z))
    // The deck, ropes and hanger attachments share the same sampled
    // centreline. A hanger ends at an actual tube ring in both LODs.
    const center=lowerCurve(0),profile=Array.from({length:n+1},(_,i)=>{const p=center.getPointAt(i/n);return [p.x,p.y]})
    const suspensionRope=(name:string,curve:THREE.Curve<THREE.Vector3>,radius:number)=>{
     const g=new THREE.TubeGeometry(curve,n,radius,radial,false),p=g.attributes.position,positions=Array.from(p.array),uv=Array.from(g.attributes.uv.array),indices=Array.from(g.index!.array)
     for(const side of [0,1]){
      const c=curve.getPointAt(side),normal=curve.getTangentAt(side).multiplyScalar(side?1:-1),offset=side?n*(radial+1):0,index=positions.length/3
      positions.push(c.x,c.y,c.z);uv.push(.5,.5)
      for(let i=0;i<radial;i++){
       const a=offset+i,b=a+1,va=new THREE.Vector3().fromArray(positions,a*3).sub(c),vb=new THREE.Vector3().fromArray(positions,b*3).sub(c)
       indices.push(...(va.cross(vb).dot(normal)>0?[index,a,b]:[index,b,a]))
      }
     }
     g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.name=name;mesh(g,rope,0,0,0,cloth)
    }
    for(let i=0;i<n;i++){
     const a=profile[i],b=profile[i+1],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2
     strip('bridge-deck-plank',[[a[0],a[1]+.065],[b[0],b[1]+.065]],.045,.74,0,i%3===0?lightWood:oak)
     const bearer=cylinder('rope-bridge-deck-bearer',.022,.022,.89,x,y,0,darkWood,wood,low?8:12);bearer.rotation.x=Math.PI/2
    }
    for(const x of [-.5,.5])for(const z of [-.43,.43]){
     post('rope-bridge-post',x,z,.93)
     for(const y of [.305,.84])ring('rope-bridge-anchor-lashing',.048,.008,x,y,z,rope,cloth,'y')
    }
    for(const z of [-.43,.43]){
     const lower=lowerCurve(z),upper=lowerCurve(z,.535)
     suspensionRope('rope-bridge-lower-rope',lower,.014)
     suspensionRope('rope-bridge-handrail',upper,.018)
     for(let i=2;i<n;i+=2){
      const a=lower.getPointAt(i/n),b=upper.getPointAt(i/n)
      beam('rope-bridge-rope-hanger',a.toArray(),b.toArray(),.01,rope,cloth)
     }
    }
   }
   break
  }
  case 'platform':{
   // Closed backing carries a continuous deck. Plank joints are visible on
   // the fascia below it, leaving every accepted top point at saved height.
   box('platform-top-deck',1,.055,.92,0,.94,0,lightWood,wood,0)
   box('platform-deck-backing',.94,.028,.86,0,.8985,0,oak)
   for(const z of [-.45,.45])box('platform-edge-joinery',.94,.035,.018,0,.887,z,darkWood)
   if(!low)for(let i=1;i<9;i++)for(const z of [-.461,.461])box('platform-fascia-plank-joint',.003,.038,.002,-.5+i/9,.94,z,darkWood,wood,0)
   for(const x of [-.41,.41])for(const z of [-.37,.37])box('platform-leg',.11,.9,.11,x,.45,z,darkWood)
   for(const z of [-.37,.37]){box('platform-side-apron',.92,.15,.07,0,.83,z,oak);beam('platform-cross-brace',[-.4,.12,z],[.4,.80,z],.026,oak)}
   for(const x of [-.41,.41])box('platform-end-apron',.07,.15,.8,x,.83,0,oak)
   break
  }
  case 'trapdoor':hatchFrame('trapdoor-frame');hatchLeaf('trapdoor');break
  case 'trap-grate':hatchFrame('trap-grate-frame');hatchLeaf('trap-grate',true);break
  case 'well':{
   // Continuous mortar-backed throat and separately cut courses retain a real
   // opening. Coping overlaps both lining and facing rather than floating.
   lathe('well-foundation',[[.305,0],[.455,0],[.465,.035],[.445,.075],[.305,.075],[.305,0]],0,0,0,darkStone,stone)
   lathe('well-throat-lining',[[.305,.055],[.408,.055],[.408,.45],[.305,.45],[.305,.055]],0,0,0,darkStone,stone)
   for(let row=0;row<3;row++)for(let i=0;i<(low?10:16);i++){
    const n=low?10:16,a=(i+(row%2)*.5)*Math.PI*2/n,p=wedge('well-masonry-course',.31,.44,a+.007,a+Math.PI*2/n-.007,.124,0,i%3?rock:lightStone)
    p.rotation.x=Math.PI/2;p.position.y=.125+row*.126
   }
   lathe('well-coping',[[.294,.432],[.454,.432],[.467,.452],[.465,.495],[.445,.512],[.294,.512],[.294,.432]],0,0,0,lightStone,stone)
   // The water disc fits inside the low-LOD octagonal throat, too.
   liquid('well-recessed-water',0,.12,0,.265)
   for(const x of [-.44,.44]){
    box('well-post-shoe',.12,.06,.12,x,.03,0,metal,iron)
    box('well-roof-post',.085,1,.085,x,.5,0,oak)
    box('well-post-cap',.13,.06,.13,x,1.01,0,lightWood)
    box('well-bearing-seat',.13,.115,.14,x,.655,0,darkWood)
    ring('well-windlass-bearing',.053,.014,x,.705,0,metal,iron,'x')
    beam('well-knee-brace',[x,.86,0],[Math.sign(x)*.22,1.015,0],.024,lightWood)
    if(!low)for(const y of [.11,.64,.91])bolt(x,y,.05)
   }
   beam('well-windlass',[-.525,.705,0],[.525,.705,0],.043,darkWood)
   for(let i=0;i<(low?3:5);i++)ring('well-wound-rope',.052,.009,(i-(low?2:4)/2)*.021,.705,0,rope,cloth,'x')
   beam('well-bucket-rope',[0,.705,-.060],[0,.400,-.060],.009,rope,cloth)
   lathe('well-hollow-bucket',[[0,0],[.075,0],[.097,.125],[.1,.135],[.084,.135],[.076,.035],[0,.035]],0,.18,-.06,lightWood,wood)
   for(const y of [.218,.292])ring('well-bucket-band',y<.25?.082:.095,.008,0,y,-.06,metal,iron,'y')
   tube('well-bucket-bail',[[-.09,.303,-.06],[-.081,.355,-.06],[0,.40,-.06],[.081,.355,-.06],[.09,.303,-.06]],.008,metal,iron)
   beam('well-crank-boss',[-.515,.705,0],[-.56,.705,0],.055,metal,iron)
   beam('well-crank',[-.55,.705,0],[-.55,.55,.12],.019,metal,iron)
   beam('well-crank-grip',[-.55,.55,.12],[-.68,.55,.12],.026,lightWood)
   box('well-roof-tie',.92,.08,.12,0,1.015,0,darkWood)
   box('well-king-post',.07,.325,.07,0,1.183,0,oak)
   const roofY=(x:number)=>1.37-Math.abs(x)/.55*.34
   for(const side of [-1,1]){
    extrude('well-roof-slope',[[0,1.37],[side*.55,1.03],[side*.55,.99],[0,1.33]],.79,0,0,0,darkWood,wood)
    for(const z of [-.335,.335])beam('well-roof-rafter',[0,1.337,z],[side*.555,.995,z],.024,oak)
    const rows=low?2:3,cols=low?3:5
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
     const x0=side*(row*.55/rows),x1=side*((row+1)*.55/rows+.008),z=-.395+(col+.5)*.79/cols
     extrude('well-roof-shingle',[[x0,roofY(x0)+.014],[x1,roofY(x1)+.014],[x1,roofY(x1)-.008],[x0,roofY(x0)-.008]],.79/cols-.002,0,0,z,(row+col)%3?oak:lightWood,wood)
    }
    beam('well-eave-fascia',[side*.552,1.007,-.42],[side*.552,1.007,.42],.024,lightWood)
   }
   beam('well-roof-ridge',[0,1.377,-.43],[0,1.377,.43],.024,darkWood)
   break
  }
  case 'fountain':{
   // Joined turned masonry contains actual bowl floors, inner walls and lips.
   lathe('fountain-lower-bowl',[[0,0],[.40,0],[.45,.025],[.45,.07],[.40,.09],[.39,.105],[.46,.12],[.49,.24],[.50,.27],[.50,.30],[.455,.315],[.425,.315],[.415,.285],[.39,.18],[0,.16]],0,0,0,rock,stone)
   ring('fountain-base-moulding',.445,.012,0,.055,0,lightStone,stone,'y')
   ring('fountain-lower-rim-moulding',.477,.012,0,.288,0,lightStone,stone,'y')
   liquid('fountain-lower-water',0,.255,0,.36)
   lathe('fountain-carved-pedestal',[[0,0],[.17,0],[.19,.035],[.16,.07],[.12,.10],[.10,.35],[.12,.38],[.17,.405],[.18,.44],[0,.44]],0,.155,0,lightStone,stone)
   if(!low)for(let i=0;i<10;i++){
    const a=i*Math.PI/5
    beam('fountain-pedestal-flute',[Math.cos(a)*.111,.26,Math.sin(a)*.111],[Math.cos(a)*.097,.50,Math.sin(a)*.097],.008,rock,stone)
   }
   const profile=[[0,0],[.14,0],[.20,.025],[.25,.08],[.295,.145],[.30,.17],[.295,.19],[.255,.19],[.25,.165],[.21,.095],[0,.075]]
   const upper=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),low?24:48),position=upper.attributes.position
   // Three carved spill notches are part of the closed bowl geometry, so
   // the descending streams have actual channels through its upper lip.
   for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i),a=Math.atan2(z,x),d=Math.abs(Math.atan2(Math.sin(a*3),Math.cos(a*3)))/3
    if(Math.hypot(x,z)>.225&&y>.09&&d<.23)position.setY(i,y-(y-.09)*.5*(1-d/.23))
   }
   upper.computeVertexNormals();upper.name='fountain-upper-bowl';mesh(upper,lightStone,0,.585,0,stone)
   liquid('fountain-upper-water',0,.757,0,.23)
   lathe('fountain-jet-nozzle',[[.02,0],[.034,.02],[.032,.14],[.025,.17],[.016,.17],[.016,.025],[.02,0]],0,.65,0,brass,iron)
   tube('fountain-central-water-jet',[[0,.817,0],[0,1.025,0],[.075,1.04,0],[.15,.88,0],[.16,.757,0]],low?.010:.012,'#78aeb6',water)
   for(const a of [0,Math.PI*2/3,Math.PI*4/3]){
    const point=(r:number,y:number)=>[Math.cos(a)*r,y,Math.sin(a)*r]
    tube('fountain-falling-stream',[point(.225,.757),point(.27,.752),point(.306,.722),point(.35,.54),point(.37,.255)],low?.009:.011,'#78aeb6',water)
   }
   if(!low)for(let i=0;i<16;i++){
    const a=i*Math.PI/8
    beam('fountain-bowl-flute',[Math.cos(a)*.445,.118,Math.sin(a)*.445],[Math.cos(a)*.487,.234,Math.sin(a)*.487],.007,darkStone,stone)
   }
   break
  }
  case 'column':{
   box('column-square-plinth',.65,.1,.65,0,.05,0,darkStone,stone)
   lathe('column-base-moulding',[[0,0],[.3,0],[.3,.04],[.25,.08],[.23,.14],[0,.14]],0,.1,0,lightStone,stone)
   cylinder('column-shaft',.19,.22,.68,0,.55,0,rock,stone,low?10:20)
   if(!low)for(let i=0;i<12;i++){const a=i*Math.PI/6;beam('column-flute-ridge',[Math.cos(a)*.205,.25,Math.sin(a)*.205],[Math.cos(a)*.178,.87,Math.sin(a)*.178],.012,lightStone,stone)}
   lathe('column-capital',[[0,0],[.19,0],[.24,.05],[.29,.08],[.3,.14],[0,.14]],0,.88,0,lightStone,stone)
   box('column-abacus',.65,.07,.65,0,1.055,0,rock,stone)
   break
  }
  case 'archway':arch('archway');break
  case 'signpost':{
   post('signpost-post',0,0,1)
   for(const [i,side] of [[0,1],[1,-1],[2,1]]){
    const y=.84-i*.22,points=[[-.05,-.075],[.34,-.075],[.44,0],[.34,.075],[-.05,.075]].map(([x,v])=>[x*side,v])
    extrude('signpost-direction-board',points,.065,0,y,.04,i%2?oak:lightWood)
    if(!low)for(let j=0;j<3;j++)box('signpost-carved-mark',.055,.009,.008,side*(.08+j*.08),y,.078,darkWood)
    bolt(0,y,.085)
   }
   break
  }
  case 'tent':{
   // Separate, thick roof wings and rear canvas leave a walkable doorway.
   for(const side of [-1,1]){const p=box('tent-canvas-roof',.72,.025,.92,side*.25,.55,0,side>0?'#b39c73':'#967d59',cloth);p.rotation.z=-side*.91}
   extrude('tent-rear-canvas',[[-.49,.25],[0,.94],[.49,.25]],.021,0,0,-.45,'#9e875f',cloth)
   for(const side of [-1,1])extrude('tent-door-flap',[[side*.49,.25],[side*.09,.25],[side*.16,.68],[0,.94]],.022,0,0,.45,side>0?'#b39c73':'#967d59',cloth)
   for(const z of [-.47,.47])beam('tent-ridge-pole',[0,.03,z],[0,.96,z],.018,oak)
   beam('tent-roof-ridge',[0,.96,-.5],[0,.96,.5],.019,oak)
   for(const side of [-1,1])for(const z of [-.4,.4]){beam('tent-guy-rope',[side*.37,.41,z],[side*.65,.025,z],.008,rope,cloth);beam('tent-ground-peg',[side*.65,0,z],[side*.67,.10,z],.013,oak)}
   break
  }
  case 'awning':{
   for(const x of [-.46,.46])for(const z of [-.37,.37])post('awning-post',x,z,z<0?1:.83)
   for(const x of [-.46,.46])beam('awning-side-rafter',[x,1,-.4],[x,.83,.4],.025,oak)
   for(let i=0;i<(low?5:9);i++){
    const n=low?5:9,p=box('awning-canvas-stripe',1/n-.002,.025,.86,-.5+(i+.5)/n,.94,0,i%2?'#9e7754':'#d0bf92',cloth);p.rotation.x=.21
    extrude('awning-scalloped-valance',[[-.5/n,0],[.5/n,0],[.5/n,-.055],[0,-.095],[-.5/n,-.055]],.022,-.5+(i+.5)/n,.86,.42,i%2?'#9e7754':'#d0bf92',cloth)
   }
   break
  }
  case 'campfire':{
   const fireRock=(name:string,seed:number,x:number,y:number,z:number,rx:number,ry:number,rz:number,color:string)=>{
    const g=new THREE.IcosahedronGeometry(1,low?0:1),p=g.attributes.position
    for(let i=0;i<p.count;i++){const a=p.getX(i),b=p.getY(i),c=p.getZ(i),r=.955+.045*Math.sin(a*7+b*4+c*5+seed);p.setXYZ(i,a*r,b*r,c*r)}
    g.computeBoundingBox();const bottom=g.boundingBox!.min.y,span=g.boundingBox!.max.y-bottom
    for(let i=0;i<p.count;i++)p.setY(i,2*(p.getY(i)-bottom)/span-1)
    g.computeVertexNormals();g.name=name;const part=mesh(g,color,x,y,z,stone);part.scale.set(rx,ry,rz)
   }
   for(let i=0;i<(low?8:12);i++){const a=i*Math.PI*2/(low?8:12);fireRock('campfire-stone-ring',i*2.4,Math.cos(a)*.37,.065,Math.sin(a)*.31,.09,.065,.075,i%2?rock:darkStone)}
   for(let i=0;i<4;i++){
    const a=i*Math.PI/2,from=new THREE.Vector3(Math.cos(a)*-.25,.10,Math.sin(a)*-.25),to=new THREE.Vector3(Math.cos(a)*.25,.16,Math.sin(a)*.25),axis=to.clone().sub(from).normalize()
    beam('campfire-log',from.toArray(),to.toArray(),.055,i%2?darkWood:oak)
    for(const [j,end] of [from,to].entries()){
     const face=cylinder('campfire-log-cut-end',.048,.048,.006,0,0,0,lightWood,wood,low?8:12);face.position.copy(end).addScaledVector(axis,j?.002:-.002);face.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis)
     if(!low){const knot=ring('campfire-cut-growth-ring',.025,.003,0,0,0,darkWood,wood,'y');knot.position.copy(end).addScaledVector(axis,j?.006:-.006);knot.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),axis)}
    }
    if(!low)for(const side of [-1,1])beam('campfire-charred-grain',from.clone().lerp(to,.15).add(new THREE.Vector3(Math.sin(a)*side*.04,.035,-Math.cos(a)*side*.04)).toArray(),from.clone().lerp(to,.85).add(new THREE.Vector3(Math.sin(a)*side*.04,.035,-Math.cos(a)*side*.04)).toArray(),.004,'#32352f',stone)
   }
   cylinder('campfire-charcoal-bed',.25,.29,.025,0,.027,0,'#32352f',stone)
   for(let i=0;i<(low?5:9);i++){const a=i*2.4,r=.09+(i%3)*.045;fireRock('campfire-charcoal',a,Math.cos(a)*r,.059,Math.sin(a)*r,.037,.022,.031,'#32352f')}
   fire('campfire',0,.15,0,1.1)
   break
  }
  case 'torch':{
   box('torch-foot',.26,.07,.26,0,.035,0,darkWood)
   cylinder('torch-shaft',.035,.055,.77,0,.43,0,oak)
   for(const y of [.10,.67,.77])ring('torch-shaft-ferrule',y===.10?.052:.038,.009,0,y,0,metal,iron)
   // The old opaque cone swallowed its own light. This low fuel bowl and
   // separate prongs form an actual open basket around the exposed flame.
   lathe('torch-iron-basket',[[0,0],[.052,0],[.073,.028],[.073,.038],[.060,.038],[.049,.012],[0,.012]],0,.782,0,metal,iron)
   for(const [y,r] of [[.819,.064],[.920,.093]])ring('torch-basket-band',r,.009,0,y,0,metal,iron)
   for(let i=0;i<6;i++){const a=i*Math.PI/3;beam('torch-basket-prong',[Math.cos(a)*.054,.80,Math.sin(a)*.054],[Math.cos(a)*.108,.98,Math.sin(a)*.108],.008,metal,iron)}
   for(let i=0;i<3;i++){const a=i*Math.PI*2/3;beam('torch-charred-fuel',[Math.cos(a)*.021,.805,Math.sin(a)*.021],[Math.cos(a)*.037,.945,Math.sin(a)*.037],.013,darkWood)}
   if(!low)for(const side of [-1,1])box('torch-foot-strap',.018,.025,.245,side*.083,.071,0,metal,iron)
   fire('torch',0,.92,0,.56)
   break
  }
  case 'street-lamp':{
   lathe('street-lamp-foot',[[0,0],[.13,0],[.13,.04],[.09,.09],[.07,.16],[.045,.19],[0,.19]],0,0,0,metal,iron)
   cylinder('street-lamp-column',.027,.044,.70,0,.51,0,metal,iron)
   for(const y of [.2,.72,.83])ring('street-lamp-collar',.043,.008,0,y,0,brass,iron)
   lathe('street-lamp-neck-moulding',[[0,0],[.035,0],[.035,.025],[.052,.045],[.052,.058],[.070,.075],[0,.075]],0,.783,0,metal,iron)
   if(!low){
    for(let i=0;i<6;i++){const a=i*Math.PI/3;beam('street-lamp-shaft-flute',[Math.cos(a)*.040,.24,Math.sin(a)*.040],[Math.cos(a)*.027,.70,Math.sin(a)*.027],.004,brass,iron)}
    for(const side of [-1,1])tube('street-lamp-scroll-brace',[[0,.77,0],[side*.072,.80,0],[side*.066,.845,0],[side*.032,.845,0]],.008,metal,iron)
    for(const x of [-.079,.079])for(const z of [-.079,.079])cylinder('street-lamp-anchor-bolt',.009,.009,.017,x,.063,z,brass,iron,6)
   }
   lantern('street-lamp',0,.86,0,.62)
   break
  }
  case 'hanging-lantern':{
   lantern('hanging-lantern',0,0,0,1)
   for(let i=0;i<5;i++){const p=ring('hanging-lantern-chain',.027,.006,0,.62+i*.047,0,metal,iron,i%2?'x':'z');p.scale.y=1.3}
   ring('hanging-lantern-ceiling-eye',.045,.009,0,.87,0,metal,iron,'z')
   break
  }
  case 'signal-lantern':{
   box('signal-lantern-tripod-hub',.12,.08,.12,0,.31,0,metal,iron)
   for(let i=0;i<3;i++){const a=i*Math.PI*2/3;beam('signal-lantern-tripod-leg',[0,.34,0],[Math.cos(a)*.30,0,Math.sin(a)*.30],.025,oak)}
   for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3,b=(i+1)*Math.PI*2/3
    beam('signal-lantern-tripod-spreader',[Math.cos(a)*.174,.143,Math.sin(a)*.174],[Math.cos(b)*.174,.143,Math.sin(b)*.174],.011,metal,iron)
    if(!low)beam('signal-lantern-foot-ferrule',[Math.cos(a)*.272,.033,Math.sin(a)*.272],[Math.cos(a)*.298,.003,Math.sin(a)*.298],.026,metal,iron)
   }
   lantern('signal-lantern',0,.34,0,.95,true)
   break
  }
  case 'bell':{
   for(const x of [-.41,.41])post('bell-frame-post',x,0,.97)
   box('bell-frame-yoke',.94,.08,.11,0,.92,0,darkWood)
   beam('bell-axle',[-.28,.83,0],[.28,.83,0],.033,metal,iron)
   lathe('bell-hollow-bronze-body',[[.30,0],[.31,.035],[.28,.07],[.23,.13],[.18,.30],[.11,.37],[0,.39],[0,.35],[.075,.33],[.145,.27],[.19,.10],[.27,.035],[.30,0]],0,.40,0,brass,iron)
   beam('bell-clapper-stem',[0,.71,0],[0,.38,0],.016,metal,iron)
   ellipsoid('bell-clapper',.045,.055,.045,0,.38,0,metal,iron)
   tube('bell-pull-rope',[[.19,.82,0],[.29,.67,0],[.28,.39,.02],[.29,.04,0]],.009,rope,cloth)
   break
  }
  case 'waterwheel':{
   for(const z of [-.14,.14]){
    ring('waterwheel-rim',.43,.032,0,.48,z,oak,wood,'z')
    for(let i=0;i<(low?8:12);i++){const a=i*Math.PI*2/(low?8:12);beam('waterwheel-spoke',[0,.48,z],[Math.cos(a)*.43,.48+Math.sin(a)*.43,z],.022,i%2?oak:lightWood)}
   }
   for(let i=0;i<(low?10:16);i++){const a=i*Math.PI*2/(low?10:16),p=box('waterwheel-paddle',.15,.055,.36,Math.cos(a)*.44,.48+Math.sin(a)*.44,0,lightWood);p.rotation.z=a}
   const axle=cylinder('waterwheel-axle',.055,.055,.65,0,.48,0,metal,iron);axle.rotation.x=Math.PI/2
   for(const z of [-.28,.28]){post('waterwheel-bearing-post',0,z,.48);ring('waterwheel-bearing',.079,.018,0,.48,z,metal,iron,'z')}
   break
  }
  case 'boat':{
   // Five connected contour rings form a watertight shell with a recessed
   // inner floor and genuine open seating space between the gunwales.
   const n=low?16:28,positions:number[]=[],uv:number[]=[],indices:number[]=[],levels=[[.64,.03,.55],[1,.27,1],[.91,.27,.80],[.61,.09,.47]],centerOffset=levels.length*n
   for(let l=0;l<levels.length;l++)for(let i=0;i<n;i++){
    const a=i*Math.PI*2/n,[sx,y,sz]=levels[l],s=Math.sin(a)
    positions.push(Math.cos(a)*.5*sx,y,s*Math.pow(Math.abs(s),.35)*.27*sz);uv.push(i/n,l/(levels.length-1))
   }
   positions.push(0,.03,0,0,.09,0);uv.push(.5,.5,.5,.5)
   for(let l=0;l<levels.length-1;l++)for(let i=0;i<n;i++){const j=(i+1)%n,a=l*n+i,b=l*n+j,c=(l+1)*n+i,d=(l+1)*n+j;indices.push(a,c,b,b,c,d)}
   for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(centerOffset,j,i,centerOffset+1,3*n+i,3*n+j)}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.name='boat-hollow-hull';mesh(g,oak,0,0,0,wood)
   for(const x of [-.20,.16])box('boat-seat-thwart',.075,.027,.37,x,.225,0,lightWood)
   for(const side of [-1,1])tube('boat-gunwale',[[-.49,.275,0],[-.28,.275,side*.23],[0,.275,side*.267],[.28,.275,side*.23],[.49,.275,0]],.013,darkWood)
   beam('boat-oar-shaft',[-.2,.29,-.35],[.32,.31,.24],.012,lightWood)
   const paddle=box('boat-oar-blade',.075,.018,.16,-.25,.29,-.40,lightWood);paddle.rotation.y=-.7
   ring('boat-bow-rope-eye',.025,.006,.49,.24,0,metal,iron,'x')
   break
  }
  case 'target':{
   for(const x of [-.3,.3])beam('target-splayed-leg',[x,0,.17],[0,.71,0],.034,oak)
   beam('target-rear-prop',[0,0,-.30],[0,.70,0],.033,darkWood)
   for(const [r,z,color] of [[.35,0,'#b5a374'],[.27,.012,'#8c4840'],[.19,.023,'#c9b884'],[.11,.034,'#8c4840'],[.047,.044,'#d4bb72']] as [number,number,string][]){const p=cylinder('target-concentric-ring',r,r,.026,0,.68,z,color,cloth,low?12:24);p.rotation.x=Math.PI/2}
   break
  }
  case 'scarecrow':{
   post('scarecrow-stake',0,0,.91)
   beam('scarecrow-crossbar',[-.43,.67,0],[.43,.67,0],.024,oak)
   extrude('scarecrow-coat',[[-.15,.83],[-.4,.71],[-.38,.60],[-.17,.63],[-.18,.32],[.21,.32],[.16,.64],[.38,.60],[.41,.71],[.13,.83]],.09,0,0,0,'#8f7551',cloth)
   for(const x of [-.1,.11]){const p=box('scarecrow-trouser-leg',.11,.24,.08,x,.26,0,'#65746d',cloth);p.rotation.z=-x*.8}
   ellipsoid('scarecrow-straw-head',.10,.12,.095,0,.93,0,'#b5a376',cloth)
   cylinder('scarecrow-hat-brim',.16,.16,.025,0,1.03,0,darkWood,cloth)
   cylinder('scarecrow-hat-crown',.09,.105,.11,0,1.09,0,oak,cloth)
   if(!low)for(const side of [-1,1])for(let i=0;i<4;i++)beam('scarecrow-straw-fingers',[side*.35,.66,0],[side*(.45+i*.008),.62+i*.022,.015],.006,rope,cloth)
   for(const x of [-.035,.035])ellipsoid('scarecrow-button-eye',.012,.012,.008,x,.95,.09,metal,iron)
   break
  }
  case 'chain':{
   const n=low?9:16
   for(let i=0;i<n;i++){const p=ring('chain-interlocked-link',.07,.015,Math.sin(i*.4)*.025,.08+i*.103,0,metal,iron,i%2?'x':'z');p.scale.y=1.25}
   ring('chain-top-anchor-eye',.09,.022,0,n*.103+.06,0,metal,iron,'z')
   break
  }
  case 'banner':{
   box('banner-foot',.28,.065,.26,-.29,.032,0,darkStone,stone)
   cylinder('banner-pole',.019,.027,1.05,-.29,.56,0,darkWood)
   cylinder('banner-finial',0,.045,.11,-.29,1.12,0,brass,iron)
   extrude('banner-thick-cloth',[[-.27,.99],[.34,.99],[.33,.49],[.14,.57],[-.06,.46],[-.27,.52]],.018,0,0,.015,'#863f44',cloth)
   beam('banner-top-hem',[-.26,.985,.032],[.34,.985,.032],.01,'#c1a46b',cloth)
   extrude('banner-heraldic-device',[[0,.70],[.08,.78],[.16,.70],[.08,.60]],.005,0,0,.027,brass,cloth)
   break
  }
  case 'notice-board':{
   for(const x of [-.39,.39])post('notice-board-leg',x,0,.91)
   for(let i=0;i<6;i++)box('notice-board-backing-plank',.86,.105,.055,0,.39+i*.106,0,i%2?oak:lightWood)
   for(const x of [-.44,.44])box('notice-board-frame',.055,.70,.085,x,.66,.02,darkWood)
   for(const y of [.32,.99])box('notice-board-frame',.93,.05,.085,0,y,.02,darkWood)
   for(let i=0;i<4;i++){
    const x=(i%2?1:-1)*(.16+(i===2?.03:0)),y=.49+Math.floor(i/2)*.27,p=box('notice-board-paper',.25,.21,.009,x,y,.051,i%2?'#c3b28b':'#d9c79c',cloth);p.rotation.z=(i%2?.08:-.06)
    bolt(x,y+.09,.064)
    if(!low)for(let j=0;j<3;j++)box('notice-board-ink-line',.15-j*.02,.009,.003,x,y+.035-j*.035,.058,'#6f6758',cloth)
   }
   for(const side of [-1,1]){const p=box('notice-board-roof',.53,.045,.27,side*.24,1.05,0,oak);p.rotation.z=-side*.24}
   break
  }
  case 'dye-vat':
  case 'brewing-vat':{
   const brew=asset.slug==='brewing-vat',y=brew?.22:0,r=.41
   roundBasin(asset.slug+'-hollow-body',0,y,0,r,.64,brew?'#a57f50':oak,brew?iron:wood)
   liquid(asset.slug+'-liquid',0,y+.45,0,.33,brew?'#a68a45':'#685674')
   for(const h of [.13,.53])ring(asset.slug+'-hoop',r*.96,.019,0,y+h,0,brew?brass:metal,iron)
   if(brew){for(let i=0;i<3;i++){const a=i*Math.PI*2/3;beam('brewing-vat-tripod-leg',[Math.cos(a)*.29,0,Math.sin(a)*.29],[Math.cos(a)*.31,.36,Math.sin(a)*.31],.035,metal,iron)}
    tube('brewing-vat-tap',[[.31,.46,0],[.49,.46,0],[.49,.34,0]],.027,brass,iron)
    beam('brewing-vat-tap-handle',[.43,.49,-.04],[.43,.49,.04],.012,metal,iron)
   }else{for(let i=0;i<(low?10:16);i++){const a=i*Math.PI*2/(low?10:16);beam('dye-vat-stave-seam',[Math.cos(a)*.39,.10,Math.sin(a)*.39],[Math.cos(a)*.403,.57,Math.sin(a)*.403],.004,darkWood)}
    beam('dye-vat-stirring-pole',[-.24,.26,0],[.18,.92,.05],.018,lightWood)
    const drape=box('dye-vat-draped-cloth',.22,.32,.018,-.10,.56,.40,'#7b587d',cloth);drape.rotation.x=-.18
   }
   break
  }
  case 'sandbags':{
   for(let row=0;row<3;row++)for(let i=0;i<4-row%2;i++){
    const x=(i-(3-row%2)/2)*.24,z=row%2?-.025:.01,p=ellipsoid('sandbag-staggered-bag',.14,.095,.13,x,.095+row*.16,z,i%2?'#9b926f':'#b0a57e',cloth)
    p.rotation.y=(i%2?1:-1)*.09
    if(!low){tube('sandbag-sewn-seam',[[x-.11,.095+row*.16,z+.08],[x,.13+row*.16,z+.13],[x+.11,.095+row*.16,z+.08]],.004,'#7c775d',cloth);beam('sandbag-tied-neck',[x+.12,.10+row*.16,z],[x+.16,.105+row*.16,z],.018,'#b0a57e',cloth)}
   }
   break
  }
  case 'public-pump':{
   box('public-pump-paving',.70,.06,.66,0,.03,0,rock,stone)
   lathe('public-pump-cast-body',[[0,0],[.15,0],[.15,.07],[.08,.12],[.075,.64],[.13,.69],[.13,.74],[0,.78]],0,.06,0,metal,iron)
   tube('public-pump-spout',[[.06,.64,0],[.24,.64,0],[.29,.58,0],[.29,.53,0]],.028,metal,iron)
   tube('public-pump-handle',[[-.07,.78,0],[-.2,.79,0],[-.28,.62,0],[-.27,.43,0]],.019,metal,iron)
   beam('public-pump-handle-grip',[-.27,.43,-.06],[-.27,.43,.06],.023,oak)
   roundBasin('public-pump-catch-basin',.20,.065,0,.19,.13)
   liquid('public-pump-basin-water',.20,.15,0,.15)
   if(lit)beam('public-pump-water-stream',[.29,.52,0],[.29,.16,0],.009,'#7aadb4',water)
   break
  }
  case 'drinking-basin':{
   extrude('drinking-basin-carved-back',[[-.37,0],[-.37,.66],[-.24,.9],[0,1],[.24,.9],[.37,.66],[.37,0]],.12,0,0,-.20,rock,stone)
   roundBasin('drinking-basin-hollow-bowl',0,.08,.035,.43,.30,lightStone)
   liquid('drinking-basin-water',0,.30,.035,.35)
   ring('drinking-basin-spout-rosette',.08,.015,0,.65,-.125,brass,iron,'z')
   tube('drinking-basin-spout',[[0,.65,-.11],[0,.65,.02],[0,.59,.07]],.023,brass,iron)
   tube('drinking-basin-stream',[[0,.59,.07],[0,.44,.09],[0,.305,.09]],.008,'#78aeb6',water)
   break
  }
  case 'wash-line':{
   for(const x of [-.49,.49])post('wash-line-post',x,0,1)
   tube('wash-line-rope',[[-.49,.96,0],[-.25,.89,0],[0,.86,0],[.25,.89,0],[.49,.96,0]],.009,rope,cloth)
   for(let i=0;i<4;i++){
    const x=-.34+i*.225,y=.88+.06*Math.abs(x),points=i%2?[[-.09,0],[.09,0],[.085,-.35],[-.085,-.35]]:[[-.08,0],[.08,0],[.14,-.08],[.1,-.14],[.065,-.12],[.065,-.33],[-.065,-.33],[-.065,-.12],[-.1,-.14],[-.14,-.08]]
    extrude('wash-line-thick-garment',points,.018,x,y,.013,i%2?'#bcb59b':'#6b8b92',cloth)
    for(const side of [-1,1])box('wash-line-clothespin',.018,.055,.026,x+side*.058,y,.018,lightWood)
   }
   break
  }
  case 'hitching-post':{
   for(const x of [-.4,.4])post('hitching-post-upright',x,0,.86)
   beam('hitching-post-crossbar',[-.5,.71,0],[.5,.71,0],.048,oak)
   for(const x of [-.28,0,.28]){ring('hitching-post-tie-ring',.045,.009,x,.64,.052,metal,iron,'z');beam('hitching-post-ring-staple',[x,.66,0],[x,.66,.06],.009,metal,iron)}
   break
  }
  case 'road-barrier':{
   for(const x of [-.43,.43]){box('road-barrier-pier',.11,.62,.19,x,.31,0,rock,stone);box('road-barrier-cap',.15,.045,.23,x,.64,0,lightStone,stone)}
   pose(()=>{
    box('road-barrier-arm',.90,.085,.08,0,.59,0,'#c6b78f')
    for(let i=0;i<6;i++){const stripe=box('road-barrier-painted-stripe',.065,.087,.006,-.36+i*.14,.59,.044,'#954d42',cloth);stripe.rotation.z=-.30}
   },[-.43,.59,0],'z',open?Math.PI/2:0)
   const pivot=cylinder('road-barrier-pivot',.045,.045,.14,-.43,.59,0,metal,iron);pivot.rotation.x=Math.PI/2
   break
  }
  case 'lifebuoy':{
   post('lifebuoy-mounting-post',0,0,.94)
   const buoy=ring('lifebuoy-hollow-ring',.32,.085,0,.62,.11,'#cbbd92',cloth,'z')
   buoy.scale.z=.72
   for(let i=0;i<4;i++){
    const a=i*Math.PI/2,p=box('lifebuoy-colour-band',.14,.10,.14,Math.cos(a)*.32,.62+Math.sin(a)*.32,.11,'#a34e40',cloth);p.rotation.z=a
   }
   ring('lifebuoy-perimeter-rope',.43,.012,0,.62,.11,rope,cloth,'z')
   for(let i=0;i<4;i++){const a=i*Math.PI/2;beam('lifebuoy-rope-tether',[Math.cos(a)*.38,.62+Math.sin(a)*.38,.11],[Math.cos(a)*.43,.62+Math.sin(a)*.43,.11],.009,rope,cloth)}
   break
  }
  case 'fishing-net':{
   for(const x of [-.47,.47])post('fishing-net-frame-post',x,0,1)
   beam('fishing-net-upper-frame',[-.5,.96,0],[.5,.96,0],.027,oak)
   const n=low?6:10
   for(let i=0;i<=n;i++){
    const t=i/n,x=-.43+t*.86
    tube('fishing-net-hanging-cord',[[x,.94,0],[x*.94,.56,.035*Math.sin(t*Math.PI)],[x*.9,.20+.08*Math.abs(x),0]],.005,rope,cloth)
    const y=.22+i*.7/n;tube('fishing-net-cross-cord',[[-.43,y+.03,0],[0,y-.04,.025],[.43,y+.03,0]],.005,rope,cloth)
   }
   for(let i=0;i<6;i++)ellipsoid('fishing-net-lead-weight',.018,.025,.018,-.39+i*.156,.21,0,metal,iron)
   break
  }
  case 'street-clock':{
   lathe('street-clock-pedestal',[[0,0],[.15,0],[.15,.05],[.08,.12],[.05,.16],[0,.16]],0,0,0,metal,iron)
   cylinder('street-clock-post',.033,.055,.58,0,.42,0,metal,iron)
   const body=cylinder('street-clock-case',.29,.29,.11,0,.94,0,metal,iron,low?16:32);body.rotation.x=Math.PI/2
   for(const side of [-1,1]){
    const face=cylinder('street-clock-dial',.258,.258,.009,0,.94,side*.061,'#d5c9a9',cloth,low?16:32);face.rotation.x=Math.PI/2
    ring('street-clock-bezel',.27,.018,0,.94,side*.065,brass,iron,'z')
    for(let i=0;i<12;i++){const a=i*Math.PI/6,p=box('street-clock-hour-marker',.015,i%3===0?.045:.025,.008,Math.sin(a)*.22,.94+Math.cos(a)*.22,side*.073,metal,iron);p.rotation.z=-a}
    beam('street-clock-hour-hand',[0,.94,side*.083],[.10,1.00,side*.083],.009,metal,iron)
    beam('street-clock-minute-hand',[0,.94,side*.087],[-.045,1.13,side*.087],.007,metal,iron)
    ellipsoid('street-clock-hand-pin',.017,.017,.008,0,.94,side*.091,brass,iron)
   }
   cylinder('street-clock-finial',0,.055,.11,0,1.29,0,brass,iron)
   break
  }
  case 'gargoyle':{
   box('gargoyle-stone-plinth',.82,.14,.48,0,.07,0,darkStone,stone)
   ellipsoid('gargoyle-hunched-body',.30,.28,.24,0,.37,-.08,rock,stone)
   ellipsoid('gargoyle-carved-head',.25,.24,.21,0,.65,.09,rock,stone)
   for(const side of [-1,1]){
    extrude('gargoyle-pointed-ear',[[side*.16,.76],[side*.37,.92],[side*.29,.55]],.11,0,0,.01,darkStone,stone)
    ellipsoid('gargoyle-brow',.10,.045,.065,side*.11,.72,.27,lightStone,stone).rotation.z=-side*.16
    ellipsoid('gargoyle-deep-eye',.039,.025,.018,side*.105,.68,.306,'#303c37',stone)
    beam('gargoyle-foreleg',[side*.22,.35,.03],[side*.28,.16,.22],.07,rock,stone)
    ellipsoid('gargoyle-clawed-foot',.09,.045,.12,side*.28,.17,.25,rock,stone)
   }
   // The projecting muzzle is built around a rectangular drain passage.
   for(const x of [-.11,.11])box('gargoyle-drain-cheek',.07,.14,.24,x,.49,.30,lightStone,stone)
   for(const y of [.42,.56])box('gargoyle-drain-lip',.28,.045,.24,0,y,.30,lightStone,stone)
   if(!low)for(const x of [-.075,0,.075])cylinder('gargoyle-stone-tooth',0,.015,.04,x,.53,.40,rock,stone,5)
   tube('gargoyle-water-drip',[[0,.43,.42],[0,.29,.47],[0,.15,.49]],.011,'#78aeb6',water)
   break
  }
  case 'birdhouse':{
   post('birdhouse-pole',0,0,.61)
   box('birdhouse-floor',.49,.045,.37,0,.61,0,lightWood)
   for(const x of [-.21,.21])box('birdhouse-side',.035,.32,.31,x,.79,0,oak)
   box('birdhouse-back',.42,.32,.025,0,.79,-.153,oak)
   const shape=new THREE.Shape();shape.moveTo(-.21,.63);shape.lineTo(.21,.63);shape.lineTo(.21,.94);shape.lineTo(0,1.08);shape.lineTo(-.21,.94);shape.closePath()
   const hole=new THREE.Path();hole.absarc(0,.82,.07,0,Math.PI*2,true);shape.holes.push(hole)
   const g=new THREE.ExtrudeGeometry(shape,{depth:.03,bevelEnabled:false,curveSegments:low?4:8});g.name='birdhouse-front-with-open-entry';mesh(g,lightWood,0,0,.14,wood)
   for(const side of [-1,1]){const p=box('birdhouse-roof-wing',.31,.04,.43,side*.12,1.005,0,side>0?oak:darkWood);p.rotation.z=-side*.57}
   beam('birdhouse-perch',[0,.70,.15],[0,.70,.30],.014,oak)
   break
  }
  case 'water-screw':{
   const from=new THREE.Vector3(-.40,.16,0),to=new THREE.Vector3(.40,.90,0),axis=to.clone().sub(from).normalize(),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis),length=from.distanceTo(to)
   beam('water-screw-shaft',from.toArray(),to.toArray(),.035,metal,iron)
   // A closed helical ribbon: outer and inner radial sides, both faces and
   // end caps. The open turns reveal the actual screw instead of a cylinder.
   const turns=4,n=low?48:112,positions:number[]=[],uv:number[]=[],indices:number[]=[]
   for(let i=0;i<=n;i++){
    const t=i/n,a=t*Math.PI*2*turns
    for(const [r,dy] of [[.045,-.012],[.16,-.012],[.045,.012],[.16,.012]]){const v=new THREE.Vector3(Math.cos(a)*r,t*length+dy,Math.sin(a)*r).applyQuaternion(q).add(from);positions.push(v.x,v.y,v.z);uv.push(t,r/.16)}
   }
   for(let i=0;i<n;i++){
    const a=i*4,b=(i+1)*4
    indices.push(a,a+1,b,a+1,b+1,b,a+2,b+2,a+3,a+3,b+2,b+3,a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1)
   }
   indices.push(0,2,1,1,2,3,n*4,n*4+1,n*4+2,n*4+1,n*4+3,n*4+2)
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.name='water-screw-solid-helical-flight';mesh(g,brass,0,0,0,iron)
   for(const x of [-.40,.40]){box('water-screw-support',.12,x>0?.81:.10,.34,x,x>0?.405:.05,0,oak);box('water-screw-bearing',.17,.07,.22,x,x>0?.83:.12,0,metal,iron)}
   for(const x of [-.45,.45]){box('water-screw-trough-floor',.23,.035,.44,x,x>0?.78:.035,0,darkWood);for(const z of [-.22,.22])box('water-screw-trough-wall',.23,.15,.025,x,(x>0?.78:.035)+.07,z,oak);box('water-screw-trough-water',.22,.008,.39,x,(x>0?.78:.035)+.025,0,'#467d87',water)}
   break
  }
  case 'rail-switch':{
   for(let i=0;i<(low?6:10);i++){const n=low?6:10;box('rail-switch-tie',1,.055,.065,0,.027,-.47+i*.94/(n-1),i%2?oak:darkWood)}
   for(const x of [-.23,.23]){
    box('rail-switch-running-rail',.035,.055,1,x,.083,0,metal,iron)
    box('rail-switch-rail-foot',.08,.018,1,x,.058,0,metal,iron)
   }
   tube('rail-switch-diverging-rail',[[-.23,.082,-.5],[-.19,.082,-.12],[-.03,.082,.20],[.24,.082,.5]],.018,metal,iron)
   tube('rail-switch-diverging-rail',[[.23,.082,-.5],[.27,.082,-.12],[.40,.082,.20],[.57,.082,.5]],.018,metal,iron)
   beam('rail-switch-throwbar',[-.25,.09,-.15],[.45,.09,-.15],.018,metal,iron)
   box('rail-switch-lever-base',.16,.08,.19,.43,.07,-.15,rock,stone)
   beam('rail-switch-lever',[.43,.10,-.15],[.54,.39,-.15],.018,metal,iron)
   ellipsoid('rail-switch-lever-grip',.037,.037,.037,.54,.39,-.15,brass,iron)
   if(!low)for(const x of [-.23,.23])for(const z of [-.4,-.2,0,.2,.4])bolt(x,.094,z)
   break
  }
  case 'drawbridge-machine':{
   for(const z of [-.37,.37]){post('drawbridge-winch-post',-.43,z,.87);box('drawbridge-ground-sill',1,.07,.10,0,.035,z,darkWood)}
   beam('drawbridge-winch-drum',[-.43,.72,-.42],[-.43,.72,.42],.065,oak)
   for(const z of [-.38,.38])ring('drawbridge-drum-flange',.12,.018,-.43,.72,z,metal,iron,'z')
   const crank=ring('drawbridge-crank-wheel',.18,.016,-.43,.72,.49,metal,iron,'z')
   crank.scale.z=.6
   for(let i=0;i<5;i++){const a=i*Math.PI*2/5;beam('drawbridge-crank-spoke',[-.43,.72,.49],[-.43+Math.cos(a)*.18,.72+Math.sin(a)*.18,.49],.012,metal,iron)}
   pose(()=>{
    for(let i=0;i<(low?6:10);i++){const n=low?6:10;box('drawbridge-hinged-deck',.84/n-.004,.055,.61,-.42+(i+.5)*.84/n,.135,0,i%2?oak:lightWood)}
    for(const z of [-.25,.25])box('drawbridge-deck-stringer',.84,.07,.055,0,.09,z,darkWood)
   },[-.42,.135,0],'z',open?Math.PI/2:0)
   for(const z of [-.30,.30])tube('drawbridge-hoist-rope',[[-.43,.75,z],[-.17,open?.67:.45,z],[open?-.42:.4,open?.91:.15,z]],.012,rope,cloth)
   break
  }
  case 'rotating-platform':{
   cylinder('rotating-platform-foundation',.49,.5,.10,0,.05,0,darkStone,stone,low?16:32)
   ring('rotating-platform-running-race',.41,.025,0,.15,0,metal,iron,'y')
   for(let i=0;i<(low?6:10);i++){const a=i*Math.PI*2/(low?6:10),p=cylinder('rotating-platform-roller',.045,.045,.08,Math.cos(a)*.40,.14,Math.sin(a)*.40,metal,iron,low?6:10);p.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-Math.sin(a),0,Math.cos(a)))}
   cylinder('rotating-platform-deck',.48,.48,.06,0,.23,0,oak,wood,low?16:32)
   for(let i=0;i<(low?7:11);i++){const n=low?7:11,z=-.44+(i+.5)*.88/n,w=Math.sqrt(Math.max(.001,.46**2-z*z))*2;box('rotating-platform-top-plank',w,.025,.88/n-.005,0,.273,z,i%2?lightWood:oak)}
   cylinder('rotating-platform-centre-hub',.07,.07,.045,0,.28,0,metal,iron)
   for(const x of [-.20,.20])box('rotating-platform-rail',.025,.04,.84,x,.31,0,metal,iron)
   break
  }
  default:return false
 }
 const envelope=motionEnvelopes[asset.slug],result=finish(envelope?new THREE.Box3(new THREE.Vector3(...envelope[0]),new THREE.Vector3(...envelope[1])):undefined)
 // Extreme saved proportions can make a smooth analytic torus normal point
 // behind one of its stretched polygon faces. Preserve outward face normals
 // for those rare parts without changing their solid geometry or UVs.
 for(const part of parts){
  const g=part.geometry,p=g.attributes.position,n=g.attributes.normal,index=g.index,count=index?.count??p.count
  let foldedNormal=false
  for(let i=0;i<count&&!foldedNormal;i+=3){
   const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),[a,b,c]=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),normal=b.clone().sub(a).cross(c.clone().sub(a)),average=new THREE.Vector3()
   ids.forEach(j=>average.add(new THREE.Vector3().fromBufferAttribute(n,j)))
   foldedNormal=normal.dot(average)<-1e-12
  }
  if(foldedNormal&&index){const name=g.name,flat=g.toNonIndexed();g.copy(flat);g.name=name;flat.dispose();g.computeVertexNormals()}
 }
 return result
}
