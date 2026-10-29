import * as THREE from 'three'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'
import {legacyAsset} from './legacyAssets.ts'
import {legacyKit} from './scene3dLegacyKit.ts'

// Motion clearances are shared by all states and both LODs. The body must not
// shrink or recenter when a lid, drawer, door, lock, or flame changes its bounds.
const motionBounds:Record<string,number[]>={
 desk:[-.5,0,-.51,.5,.966,.51],
 cabinet:[-.58,0,-.32,.58,1.315,.7],
 wardrobe:[-.58,0,-.32,.58,1.615,.7],
 crate:[-.47,.0175,-.518,.47,1.612,.443],
 sack:[-.42,0,-.42,.42,.95,.42],
 cage:[-.465,0,-.385,.465,1.216,.814],
 kiln:[-.5,0,-.512,.5,1.49,.895],
 'bread-oven':[-.51,0,-.54,.51,1.45,.895],
 smokehouse:[-.57,.0525,-.45,.52,1.695,.977],
 'chicken-coop':[-.57,0,-.45,.52,1.34,1.095],
 carriage:[-.63,.01,-1.07,.78,1.55,.77],
}

// These constructions replace the old flat artwork at its existing saved size.
// Every opening is made from separate solids or a closed, thick-walled profile.
export function populateLegacyFurniture(e:RenderEntity,output:ModelMesh,low=false):boolean{
 const asset=legacyAsset(e.geometry)
 if(!asset||asset.group!=='furniture'||asset.native)return false
 const id=asset.slug,k=legacyKit(e,output,low),{wood,stone,iron}=k,parts:THREE.Mesh[]=[]
 const oak='#87603f',dark='#51402f',board='#b58c5e',metal='#656355',brass='#b69c5f',cream='#c9b58d',red='#864b3e',green='#627849'
 const cloth:Surface={roughness:.96},ceramic:Surface={roughness:.74},glass:Surface={metalness:.84,roughness:.16},fire:Surface={roughness:.72,emissive:'#d45d25',castShadow:false}
 const keep=(p:THREE.Mesh)=>{parts.push(p);return p}
 const b=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,c=oak,s:Surface=wood,bevel=.065)=>keep(k.box(id+'-'+name,w,h,d,x,y,z,c,s,bevel))
 const c=(name:string,rt:number,rb:number,h:number,x:number,y:number,z:number,col=oak,s:Surface=wood,axis:'x'|'y'|'z'='y',segments=low?8:16)=>{const p=keep(k.cylinder(id+'-'+name,rt,rb,h,x,y,z,col,s,segments));if(axis==='x')p.rotation.z=Math.PI/2;if(axis==='z')p.rotation.x=Math.PI/2;return p}
 const beam=(name:string,a:number[],q:number[],r:number,col=oak,s:Surface=wood,taper=1)=>keep(k.beam(id+'-'+name,a,q,r,col,s,taper))
 const ring=(name:string,r:number,t:number,x:number,y:number,z:number,col=metal,s:Surface=iron,axis:'x'|'y'|'z'='y')=>keep(k.ring(id+'-'+name,r,t,x,y,z,col,s,axis))
 const lathe=(name:string,profile:number[][],x:number,y:number,z:number,col=oak,s:Surface=wood)=>keep(k.lathe(id+'-'+name,profile,x,y,z,col,s))
 const ell=(name:string,rx:number,ry:number,rz:number,x:number,y:number,z:number,col:string,s:Surface=cloth)=>keep(k.ellipsoid(id+'-'+name,rx,ry,rz,x,y,z,col,s))
 const smallEll=(name:string,rx:number,ry:number,rz:number,x:number,y:number,z:number,col:string,s:Surface=cloth)=>{const g=new THREE.SphereGeometry(1,low?6:10,low?4:6);g.name=id+'-'+name;const p=keep(k.mesh(g,col,x,y,z,s));p.scale.set(rx,ry,rz);return p}
 const ex=(name:string,p:number[][],d:number,x:number,y:number,z:number,col=oak,s:Surface=wood)=>keep(k.extrude(id+'-'+name,p,d,x,y,z,col,s))
 const tube=(name:string,p:number[][],r:number,col=oak,s:Surface=wood)=>{
  const curve=new THREE.CatmullRomCurve3(p.map(v=>new THREE.Vector3(...v))),segments=low?6:14,radial=low?5:8,g=new THREE.TubeGeometry(curve,segments,r,radial,false),a=g.attributes.position,positions=Array.from(a.array),normals=Array.from(g.attributes.normal.array),uv=Array.from(g.attributes.uv.array),indices=Array.from(g.index!.array)
  // Caps have their own perimeter vertices: sharing a smoothed rim normal with
  // the tube wall can turn it inward after a very unequal saved-size scale.
  for(let side=0;side<2;side++){
   const center=curve.getPointAt(side),normal=curve.getTangentAt(side).multiplyScalar(side?1:-1).normalize(),offset=side?segments*(radial+1):0,base=positions.length/3
   positions.push(center.x,center.y,center.z);normals.push(normal.x,normal.y,normal.z);uv.push(.5,.5)
   for(let i=0;i<=radial;i++){const point=new THREE.Vector3().fromBufferAttribute(a,offset+i);positions.push(point.x,point.y,point.z);normals.push(normal.x,normal.y,normal.z);uv.push(.5+Math.cos(i/radial*Math.PI*2)*.5,.5+Math.sin(i/radial*Math.PI*2)*.5)}
   for(let i=0;i<radial;i++){const aa=base+1+i,bb=aa+1,va=new THREE.Vector3().fromArray(positions,aa*3).sub(center),vb=new THREE.Vector3().fromArray(positions,bb*3).sub(center);indices.push(...(va.cross(vb).dot(normal)>0?[base,aa,bb]:[base,bb,aa]))}
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.name=id+'-'+name
  return keep(k.mesh(g,col,0,0,0,s))
 }
 const closedTube=(name:string,p:number[][],r:number,col=oak,s:Surface=wood)=>{const curve=new THREE.CatmullRomCurve3(p.map(v=>new THREE.Vector3(...v)),true),g=new THREE.TubeGeometry(curve,low?16:32,r,low?5:8,true);g.name=id+'-'+name;return keep(k.mesh(g,col,0,0,0,s))}
 const hinge=(make:()=>void,p:number[],angle:number,axis:'x'|'y'|'z'='y')=>{
  const start=parts.length;make();const pivot=new THREE.Vector3(...p),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0),angle)
  for(const part of parts.slice(start)){part.position.sub(pivot).applyQuaternion(q).add(pivot);part.quaternion.premultiply(q)}
 }
 const pin=(x:number,y:number,z:number,r=.012)=>c('peg',r,r,.014,x,y,z,brass,iron,'z',low?6:10)
 const lock=(x:number,y:number,z:number)=>{
  if(!e.geometry.locked||e.geometry.open)return
  b('lock-body',.08,.095,.038,x,y,z,brass,iron)
  ring('lock-shackle',.028,.007,x,y+.061,z,metal,iron,'z')
  b('lock-key-slot',.011,.027,.003,x,y-.006,z+.021,dark,iron,0)
 }
 const legs=(top=.72,w=.76,d=.6,r=.047)=>{
  for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])b('leg',r*2,top,r*2,x,top/2,z,dark)
  for(const z of [-d/2,d/2])b('apron',w+.06,.12,.055,0,top-.09,z,oak)
  for(const x of [-w/2,w/2])b('end-apron',.055,.12,d,x,top-.09,0,oak)
 }
 const top=(y:number,w=.98,d=.78,n=low?3:7)=>{for(let i=0;i<n;i++)b('top-board',w/n*.99,.075,d,-w/2+(i+.5)*w/n,y-.0375,0,i%3===0?board:oak)}
 const plankFloor=(y:number,w=.88,d=.72)=>{const n=low?3:6;for(let i=0;i<n;i++)b('floor-board',w/n*.985,.055,d,-w/2+(i+.5)*w/n,y,0,i%2?board:oak)}
 const frame=(w=.9,h=.9,d=.6,y=0)=>{
  for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])b('frame-post',.065,h,.065,x,y+h/2,z,dark)
  for(const yy of [y+.055,y+h-.035])for(const z of [-d/2,d/2])b('frame-rail',w,.06,.065,0,yy,z,oak)
  for(const yy of [y+.055,y+h-.035])for(const x of [-w/2,w/2])b('frame-end',.065,.06,d,x,yy,0,oak)
 }
 const plankedWall=(x:number,y:number,z:number,w:number,h:number,d:number,n=low?3:6)=>{for(let i=0;i<n;i++)b('wall-board',w/n*.985,h,d,x-w/2+(i+.5)*w/n,y,z,i%2?oak:board)}
 const vessel=(name:string,x:number,y:number,z:number,r:number,h:number,col=cream,s:Surface=ceramic,neck=.57)=>lathe(name,[[0,0],[r*.58,0],[r*.86,h*.075],[r,h*.34],[r*.91,h*.64],[r*neck,h*.82],[r*neck,h*.94],[r*(neck+.09),h*.97],[r*(neck+.09),h],[r*(neck-.1),h],[r*(neck-.12),h*.84],[r*.73,h*.61],[r*.82,h*.34],[r*.67,h*.13],[0,h*.13]],x,y,z,col,s)
 const wheel=(x:number,y:number,z:number,r=.26,axis:'x'|'z'='x',spokes=low?6:10)=>{
  ring('wheel-rim',r*.88,r*.11,x,y,z,dark,wood,axis)
  ring('wheel-iron-tyre',r*.965,r*.035,x,y,z,metal,iron,axis)
  c('wheel-hub',r*.18,r*.18,r*.45,x,y,z,board,wood,axis)
  for(let i=0;i<spokes;i++){const a=i/spokes*Math.PI*2,p=axis==='x'?[x,y+Math.sin(a)*r*.84,z+Math.cos(a)*r*.84]:[x+Math.cos(a)*r*.84,y+Math.sin(a)*r*.84,z];beam('wheel-spoke',[x,y,z],p,r*.045,board)}
 }
 const roof=(y=.86,w=1,d=.85,rise=.3)=>{
  for(const side of [-1,1]){
   const n=low?3:6
   for(let i=0;i<n;i++){const zz=-d/2+(i+.5)*d/n;ex('roof-board',[[0,y+rise],[-side*w/2,y],[-side*w/2,y-.045],[0,y+rise-.045]],d/n*.985,0,0,zz,i%2?oak:board)}
   for(const zz of [-d*.44,d*.44])beam('roof-rafter',[side*w*.48,y-.04,zz],[0,y+rise-.04,zz],.027,dark)
  }
 }
 const aFrame=(h=.9,w=.8,d=.6)=>{
  for(const z of [-d/2,d/2]){beam('trestle-leg',[-w/2,.025,z],[0,h,z],.046,dark);beam('trestle-leg',[w/2,.025,z],[0,h,z],.046,dark);b('trestle-tie',w*.75,.06,.065,0,h*.25,z,oak)}
  b('ridge-beam',.095,.1,d+.12,0,h,0,board)
 }
 const firebox=(w=.85,h=.65,d=.68)=>{
  b('hearth',w+.1,.1,d+.12,0,.05,0,'#827a68',stone)
  for(const side of [-1,1])b('masonry-pier',w*.2,h,d,side*w*.4,.1+h/2,0,'#827a68',stone)
  b('firebox-back',w*.6,h,d*.12,0,.1+h/2,-d*.44,'#6d6a5d',stone)
  // Wedge-shaped voussoirs leave a real arch, with no dark filler plane.
  const n=low?7:11,r=w*.3,th=w*.14,cy=.1+h*.62
  for(let i=0;i<n;i++){const aa=i/n*Math.PI,bb=(i+1)/n*Math.PI;ex('arch-stone',[[Math.cos(aa)*r,cy+Math.sin(aa)*r],[Math.cos(aa)*(r+th),cy+Math.sin(aa)*(r+th)],[Math.cos(bb)*(r+th),cy+Math.sin(bb)*(r+th)],[Math.cos(bb)*r,cy+Math.sin(bb)*r]],d,0,0,0,i%2?'#8f8571':'#a09781',stone)}
  for(const x of [-.18,.18])beam('fuel-log',[x,.17,-d*.26],[x,.17,d*.25],.054,dark)
  if(e.geometry.active!==false){for(const x of [-.16,0,.15])ell('ember',.1,.035,.09,x,.17,.02,'#d56c31',fire);if(!low)ell('flame',.065,.16,.06,0,.31,.02,'#ed9b43',fire)}
 }
 const gears=(x:number,y:number,z:number,r:number,axis:'x'|'y'|'z'='z')=>{
  ring('gear-web',r*.68,r*.11,x,y,z,metal,iron,axis);c('gear-hub',r*.19,r*.19,.105,x,y,z,dark,iron,axis)
  const n=low?10:16
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2,xx=axis==='x'?x:x+Math.cos(a)*r*.91,yy=axis==='y'?y:y+Math.sin(a)*r*.91,zz=axis==='z'?z:z+(axis==='x'?Math.cos(a):Math.sin(a))*r*.91
   const p=b('gear-tooth',r*.24,r*.22,.09,xx,yy,zz,metal,iron,.02);if(axis==='z')p.rotation.z=a;if(axis==='y'){p.rotation.x=Math.PI/2;p.rotation.z=a}if(axis==='x'){p.rotation.y=Math.PI/2;p.rotation.z=a}}
  for(let i=0;i<4;i++){const a=i*Math.PI/2;beam('gear-spoke',[x,y,z],axis==='z'?[x+Math.cos(a)*r*.62,y+Math.sin(a)*r*.62,z]:axis==='x'?[x,y+Math.sin(a)*r*.62,z+Math.cos(a)*r*.62]:[x+Math.cos(a)*r*.62,y,z+Math.sin(a)*r*.62],r*.055,metal,iron)}
 }
 if(id==='chair'||id==='throne'){
  legs(.44,.66,.61,.053);top(.5,.85,.78)
  for(const x of [-.35,.35]){
   b('back-upright',.1,.92,.1,x,.67,-.31,dark);c('finial',.065,.075,.12,x,1.17,-.31,brass,iron)
   b('arm-post',.075,.27,.075,x,.625,.26,oak);b('armrest',.13,.065,.78,x,.79,-.02,board)
  }
  ex('back-crest',[[-.37,.87],[-.36,1.03],[0,1.18],[.36,1.03],[.37,.87]],.075,0,0,-.31,board)
  b('upholstered-seat',.64,.08,.6,0,.54,.025,red,cloth)
  b('back-cushion',.54,.46,.09,0,.85,-.25,red,cloth)
  for(const x of [-.2,0,.2])pin(x,.91,-.195,.015)
  if(!low)for(const x of [-.35,.35])for(const yy of [.19,.4,.68,.98])pin(x,yy,-.248)
 }else if(id==='desk'||id==='workbench'){
  legs(.9,.78,.6)
  if(id==='desk'){
   // A true fitted insert replaces the old floating inlay and gapped planks.
   // Its surrounding solid has an actual opening, so no horizontal faces
   // overlap. Both surfaces finish at the reserved saved-height plane.
   const shape=new THREE.Shape(),hole=new THREE.Path()
   shape.moveTo(-.5,-.395);shape.lineTo(.5,-.395);shape.lineTo(.5,.395);shape.lineTo(-.5,.395);shape.closePath()
   hole.moveTo(-.21,-.265);hole.lineTo(-.21,.285);hole.lineTo(.21,.285);hole.lineTo(.21,-.265);hole.closePath();shape.holes.push(hole)
   const panel=(name:string,outline:THREE.Shape,color:string,surface:Surface)=>{
    const g=new THREE.ExtrudeGeometry(outline,{depth:.075,bevelEnabled:false,steps:1});g.rotateX(Math.PI/2);g.name='desk-'+name
    keep(k.mesh(g,color,0,.966,0,surface))
   }
   panel('tabletop-surround',shape,board,wood)
   panel('writing-inlay',new THREE.Shape(hole.getPoints()),'#715742',cloth)
   for(const x of [-.32,.32]){
    for(const side of [-1,1])b('drawer-case-side',.025,.25,.6,x+side*.115,.72,-.01,dark)
    b('drawer-case-back',.255,.25,.025,x,.72,-.3,dark)
    for(const y of [.6,.725,.845])b('drawer-case-divider',.23,.025,.6,x,y,-.01,dark)
    for(const y of [.66,.79]){
     const z=.325+(e.geometry.open?.12:0)
     b('drawer-floor',.205,.018,.5,x,y-.043,z-.25,board)
     for(const side of [-1,1])b('drawer-side',.018,.08,.5,x+side*.098,y-.005,z-.25,oak)
     b('drawer-back',.205,.08,.018,x,y-.005,z-.5,oak)
     b('drawer-front',.25,.11,.042,x,y,z,board)
     ring('drawer-pull',.026,.006,x,y,z+.032,metal,iron,'z')
    }
   }
  }else{
   // The vise occupies the front clearance below this uninterrupted slab.
   // Its broader depth leaves a centered, level support area after fitting.
   b('work-surface',1,.075,1.04,0,.9285,0,board,wood,0)
   b('lower-tool-shelf',.78,.055,.58,0,.22,0,board)
   const viceX=.39;b('vice-fixed-jaw',.15,.13,.15,viceX,.85,.37,metal,iron);b('vice-moving-jaw',.15,.11,.07,viceX,.82,.52,metal,iron)
   c('vice-screw',.025,.025,.3,viceX,.8,.43,metal,iron,'z');beam('vice-toggle',[viceX-.09,.8,.59],[viceX+.09,.8,.59],.016,board)
  }
  if(!low)for(const x of [-.39,.39])for(const y of [.76,.36])pin(x,y,.35)
 }else if(id==='altar'){
  b('plinth',.96,.12,.76,0,.06,0,'#807c70',stone)
  for(const x of [-.31,.31]){c('column-base',.17,.19,.09,x,.165,0,'#b1a68c',stone);c('altar-column',.115,.145,.54,x,.46,0,'#a49983',stone);c('column-capital',.19,.14,.12,x,.79,0,'#c0b196',stone)}
  b('altar-mensa',1,.14,.8,0,.91,0,'#b7ab91',stone)
  b('altar-cloth',.51,.015,.76,0,.989,0,cream,cloth)
  b('hanging-cloth',.51,.38,.018,0,.8,.405,cream,cloth)
  b('embroidered-stem',.025,.16,.006,0,.81,.417,brass,cloth,0);b('embroidered-arms',.1,.025,.006,0,.84,.417,brass,cloth,0)
 }else if(id==='cot'){
  for(const z of [-.42,.42]){beam('folding-leg',[-.43,.025,z],[.32,.48,z],.042,dark);beam('folding-leg',[.43,.025,z],[-.32,.48,z],.042,dark);pin(0,.285,z+.03,.022)}
  for(const x of [-.36,.36])b('cot-side-rail',.075,.08,1.05,x,.48,0,board)
  b('stretched-canvas',.68,.04,.98,0,.51,0,cream,cloth)
  ell('pillow',.26,.075,.15,0,.585,-.29,'#bcae91',cloth)
  for(const z of (low?[-.3,0,.3]:[-.4,-.24,-.08,.08,.24,.4]))for(const x of [-.37,.37])ring('canvas-lacing',.025,.007,x,.5,z,cream,cloth,'z')
 }else if(id==='bedroll'){
  b('sleeping-pad',.72,.1,1.1,0,.05,.02,'#9b8964',cloth)
  b('folded-blanket',.74,.12,.69,0,.15,.18,'#6c7559',cloth)
  const p=c('rolled-end',.17,.17,.71,0,.2,-.43,cream,cloth,'x');p.rotation.x=.03
  for(const x of [-.24,.24])ring('bedroll-straps',.175,.018,x,.2,-.43,dark,cloth,'x')
  if(!low)for(const z of [-.08,.05,.18,.31,.44])b('quilt-seam',.7,.008,.008,0,.215,z,'#889174',cloth,0)
 }else if(id==='hammock'){
  for(const side of [-1,1]){b('support-foot',.24,.08,.65,side*.75,.04,0,dark);beam('hammock-post',[side*.75,.08,0],[side*.64,.98,0],.05,oak);beam('post-brace',[side*.61,.2,.26],[side*.66,.69,0],.025,board)}
  // Longitudinal fabric strips follow the sag and retain real thickness.
  const n=low?5:11
  for(let i=0;i<n;i++){const zz=(i-(n-1)/2)*.038;for(let j=0;j<(low?5:9);j++){const aa=-.56+j/(low?5:9)*1.12,bb=-.56+(j+1)/(low?5:9)*1.12,ya=.38+.43*(aa/.56)**2,yb=.38+.43*(bb/.56)**2;ex('hammock-canvas',[[aa,ya],[bb,yb],[bb,yb-.025],[aa,ya-.025]],.038,0,0,zz,i%2?cream:'#a79775',cloth)}}
  for(const side of [-1,1]){beam('suspension-rope',[side*.64,.97,0],[side*.56,.81,0],.013,cream,cloth);for(const z of [-.21,0,.21])beam('hammock-end-cord',[side*.56,.81,z],[side*.64,.94,0],.008,cream,cloth)}
 }else if(id==='bookcase'||id==='cabinet'||id==='wardrobe'){
  const h=id==='wardrobe'?1.5:1.2,w=.88,d=.56
  for(const x of [-w/2,w/2])b('case-side',.07,h,d,x,h/2+.04,0,dark)
  b('case-back',w,h,.045,0,h/2+.04,-d/2,oak)
  for(const y of [.09,h+.065])b('case-cornice',w+.15,.1,d+.08,0,y,0,board)
  for(const x of [-.35,.35])for(const z of [-.2,.2])b('case-foot',.12,.11,.12,x,.055,z,dark)
  const shelfY=id==='wardrobe'?[.2]:[.16,.46,.76,1.06]
  for(const y of shelfY)b('shelf',w-.05,.045,d-.03,0,y,.005,board)
  if(id==='bookcase'){
   for(let row=0;row<3;row++){const n=low?5:8;for(let i=0;i<n;i++){const xx=-.34+i/(n-1)*.68,hh=.17+((i+row*3)%4)*.024;const book=b('book',.058,hh,.32,xx,shelfY[row]+.025+hh/2,.06,[red,green,dark,'#8d734a'][(i+row)%4],cloth,.025);if(i===n-1)book.rotation.z=-.13;if(!low)for(const yy of [-.28,.28])b('book-spine-band',.058,.009,.008,xx,shelfY[row]+.025+hh*(.5+yy),.225,brass,cloth,0)}}
  }else{
   if(id==='wardrobe'){c('clothes-rail',.018,.018,w-.11,0,1.24,0,metal,iron,'x');for(const x of [-.23,0,.23]){beam('hanger-arm',[x,1.23,0],[x-.11,1.12,0],.01,board);beam('hanger-bar',[x-.11,1.12,0],[x+.11,1.12,0],.01,board);beam('hanger-arm',[x+.11,1.12,0],[x,1.23,0],.01,board);ex('hanging-coat',[[-.1,0],[-.15,-.12],[-.09,-.14],[-.08,-.56],[.1,-.56],[.1,-.12],[.15,-.1],[.08,0]],.075,x,1.11,0,x===0?red:green,cloth)}}
   else{vessel('stored-jug',-.2,.49,0,.1,.22,cream);for(const x of [.09,.24])b('folded-linen',.12,.09,.28,x,.53,.05,cream,cloth)}
   for(const side of [-1,1]){const px=side*w*.47;hinge(()=>{
    b('door-panel',w*.435,h-.13,.055,side*w*.235,h/2+.07,.302,oak)
    for(const y of [.18,h-.08])b('door-crossrail',w*.43,.065,.026,side*w*.235,y,.343,board)
    for(const xx of [side*w*.055,side*w*.415])b('door-stile',.055,h-.15,.026,xx,h/2+.07,.343,board)
    ring('door-pull',.029,.007,side*.065,h*.52,.36,metal,iron,'z')
   },[px,0,.29],e.geometry.open?side*Math.PI*.57:0)
   for(const y of [.26,h-.18])b('hinge-strap',.11,.026,.03,side*w*.425,y,.35,metal,iron)}
   lock(.07,h*.52,.37)
  }
 }else if(id==='weapon-rack'){
  frame(.92,1.1,.48);for(const y of [.28,.85])b('weapon-rest',.92,.09,.14,0,y,0,board)
  for(const x of [-.32,0,.32]){
   beam('spear-shaft',[x,.11,.09],[x,1.27,-.025],.018,dark)
   ex('spear-head',[[-.045,0],[0,.18],[.045,0],[0,.025]],.018,x,1.23,-.025,'#a6a79b',iron)
   if(!low)ring('rack-hook',.035,.009,x,.88,.09,metal,iron,'x')
  }
  const blade=ex('sword-blade',[[-.033,0],[-.028,.53],[0,.65],[.028,.53],[.033,0]],.016,.2,.23,.15,'#b0afa1',iron);blade.rotation.z=-.22
  b('sword-guard',.19,.023,.035,.2,.23,.15,brass,iron);b('sword-grip',.036,.16,.04,.2,.14,.15,dark,cloth)
 }else if(id==='crate'){
  plankFloor(.045,.9,.76)
  for(const z of [-.36,.36])plankedWall(0,.42,z,.9,.7,.055)
  for(const x of [-.43,.43]){b('crate-end',.055,.7,.68,x,.42,0,oak);for(const z of [-.3,.3])b('corner-cleat',.055,.78,.06,x,.42,z,dark)}
  for(const z of [-.395,.395])for(const y of [.14,.69])b('crate-cross-cleat',.93,.065,.035,0,y,z,board)
  hinge(()=>{top(.85,.94,.8);for(const x of [-.32,.32])b('lid-cleat',.06,.035,.78,x,.91,0,dark)},[0,.81,-.4],e.geometry.open?-Math.PI*.48:0,'x')
  for(const x of [-.27,.27])b('lid-hinge',.09,.025,.12,x,.83,-.37,metal,iron)
  if(!low)for(const x of [-.36,.36])for(const y of [.14,.69])for(const z of [-.417,.417])pin(x,y,z)
  lock(0,.69,.42)
 }else if(id==='sack'){
  // The lower bag stays rigidly in place; only the gathered mouth changes.
  const outer=[[.2,0],[.29,.035],[.35,.095],[.389,.19],[.399,.29],[.394,.42],[.367,.565],[.31,.67],[.25,.72],[.25,.75]]
  const radius=(y:number)=>{const i=Math.max(1,outer.findIndex(p=>p[1]>=y));const a=outer[i-1],q=outer[i];return a[0]+(q[0]-a[0])*(y-a[1])/Math.max(.001,q[1]-a[1])}
  const fold=(y:number,a:number)=>1+.036*Math.sin(y/.75*Math.PI)*Math.cos(a*6+y*7)+.012*Math.sin(y/.75*Math.PI)*Math.cos(a*11-y*4)
  const profile=[[0,0],...outer,[.225,.75],[.225,.72],[.286,.67],[.332,.565],[.353,.42],[.352,.29],[.328,.19],[.285,.12],[0,.12]]
  const bag=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),low?12:36),position=bag.attributes.position
  for(let i=0;i<position.count;i++){const x=position.getX(i),y=position.getY(i),z=position.getZ(i),f=fold(y,Math.atan2(x,z));position.setXYZ(i,x*f,y,z*f)}
  // Fabric folds keep their own face normals: very flat old saved dimensions
  // must not pull a smoothed lip normal through the opposite side of a fold.
  const foldedBag=bag.toNonIndexed();bag.dispose();foldedBag.computeVertexNormals();foldedBag.name=id+'-sack-body';keep(k.mesh(foldedBag,'#af986b',0,0,0,cloth))
  if(e.geometry.open){
   lathe('open-cuff',[[.25,0],[.282,.018],[.296,.047],[.292,.076],[.275,.096],[.251,.084],[.235,.051],[.225,.018],[.225,0],[.25,0]],0,.75,0,'#bca374',cloth)
   for(let i=0;i<(low?8:18);i++){const a=i*2.4,r=.205*Math.sqrt(i/(low?8:18));smallEll('grain',.036,.023,.028,Math.cos(a)*r,.655+Math.sin(i)*.012,Math.sin(a)*r,'#d0b576',cloth)}
  }else{
   const neck=new THREE.LatheGeometry([[.25,0],[.18,.035],[.11,.072],[.115,.10],[.149,.143],[.126,.176],[.07,.2],[0,.183],[0,.15],[.064,.116],[.076,.064],[.225,0],[.25,0]].map(([r,y])=>new THREE.Vector2(r,y)),low?12:36),p=neck.attributes.position
   for(let i=0;i<p.count;i++){const a=Math.atan2(p.getX(i),p.getZ(i)),f=1+.1*Math.sin(a*7)*Math.sin(p.getY(i)/.2*Math.PI);p.setXYZ(i,p.getX(i)*f,p.getY(i),p.getZ(i)*f)}
   const gathered=neck.toNonIndexed();neck.dispose();gathered.computeVertexNormals();gathered.name=id+'-gathered-neck';keep(k.mesh(gathered,'#af986b',0,.75,0,cloth))
   ring('sack-tie',.112,.017,0,.824,0,dark,cloth)
   smallEll('tie-knot',.034,.026,.029,.105,.823,.041,dark,cloth)
   tube('sack-tie-tail',[[.1,.824,.04],[.172,.784,.062],[.19,.68,.1]],.011,dark,cloth)
   tube('sack-tie-tail',[[.1,.824,.04],[.16,.77,-.015],[.178,.714,-.04]],.01,dark,cloth)
  }
  for(const a of [Math.PI/4,Math.PI*1.25]){
   const ys=[.04,.12,.25,.42,.58,.69,.738],path=ys.map(y=>{const r=radius(y)*fold(y,a)+.001;return [Math.sin(a)*r,y,Math.cos(a)*r]})
   tube('sack-seam',path,.006,'#8e7950',cloth)
   if(!low)for(let i=0;i<15;i++){
    const y=.075+i*.043,r=radius(y)*fold(y,a)+.002,da=.021
    beam('sack-stitch',[Math.sin(a-da)*r,y-.006,Math.cos(a-da)*r],[Math.sin(a+da)*r,y+.006,Math.cos(a+da)*r],.0035,cream,cloth)
   }
  }
 }else if(id==='basket'){
  c('basket-bottom',.28,.246,.065,0,.0325,0,'#a48b54',wood)
  ring('basket-bottom-binding',.255,.013,0,.021,0,dark,wood)
  const n=low?12:20,rows=low?6:10,radius=(y:number)=>.265+(y-.055)/.55*.125
  const weave=(name:string,points:number[][],r:number,color:string)=>{
   const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),true),n*4,r,low?4:5,true);g.name=id+'-'+name;keep(k.mesh(g,color,0,0,0,wood))
  }
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2;beam('basket-stake',[Math.cos(a)*.265,.055,Math.sin(a)*.265],[Math.cos(a)*.39,.605,Math.sin(a)*.39],.014,board)}
  for(let j=0;j<rows;j++){
   const y=.078+j/(rows-1)*.506,points=Array.from({length:n*4},(_,i)=>{const a=i/(n*4)*Math.PI*2,r=radius(y)+.011*Math.cos(a*n/2+j*Math.PI);return [Math.cos(a)*r,y,Math.sin(a)*r]})
   weave('woven-hoop',points,low?.021:.017,j%2?oak:board)
  }
  // The paired rim strands and the handle ends overlap the stake tips.
  for(const phase of [0,Math.PI]){
   const points=Array.from({length:n*4},(_,i)=>{const a=i/(n*4)*Math.PI*2,r=.39+.008*Math.sin(a*n/2+phase);return [Math.cos(a)*r,.61+.01*Math.cos(a*n/2+phase),Math.sin(a)*r]})
   weave('basket-braided-rim',points,.017,dark)
  }
  const handle=[[-.39,.605,0],[-.34,.87,0],[0,1.04,0],[.34,.87,0],[.39,.605,0]]
  tube('basket-handle',handle,.026,dark)
  if(!low)for(const z of [-.021,.021])tube('handle-reinforcement',handle.map(p=>[p[0],p[1],z]),.007,board)
 }else if(id==='jar'||id==='amphora'){
  const amph=id==='amphora',clay=amph?'#ab6949':'#a28159'
  const outer=amph?[[.155,0],[.174,.028],[.165,.065],[.17,.105],[.22,.18],[.28,.34],[.30,.51],[.285,.69],[.245,.82],[.17,.93],[.126,.98],[.121,1.04],[.134,1.074],[.143,1.1],[.142,1.125],[.13,1.14]]:[[.22,0],[.23,.018],[.24,.045],[.24,.065],[.29,.11],[.365,.24],[.395,.38],[.397,.49],[.376,.61],[.365,.635],[.37,.645],[.364,.657],[.352,.669],[.334,.69],[.305,.74],[.305,.785],[.324,.803],[.329,.825],[.322,.85]]
  const inner=amph?[[.086,1.14],[.083,1.124],[.087,1.1],[.09,1.075],[.086,1.05],[.089,1.006],[.103,.975],[.141,.929],[.211,.802],[.25,.68],[.265,.51],[.248,.35],[.19,.2],[.13,.15],[0,.15]]:[[.275,.85],[.268,.835],[.27,.811],[.275,.80],[.274,.765],[.276,.744],[.305,.68],[.343,.60],[.36,.48],[.356,.38],[.331,.255],[.269,.14],[.205,.11],[0,.11]]
  const turned=(name:string,profile:number[][],color=clay)=>{const g=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),low?12:32);g.name=id+'-'+name;return keep(k.mesh(g,color,0,0,0,ceramic))}
  turned('hollow-pot',[[0,0],...outer,...inner])
  const radius=(y:number)=>{const i=outer.findIndex(p=>p[1]>=y),a=outer[Math.max(0,i-1)],q=outer[Math.max(1,i)];return a[0]+(q[0]-a[0])*(y-a[1])/Math.max(.001,q[1]-a[1])}
  for(const [y,h] of amph?[[.72,.027],[1.015,.018]]:[[.565,.024],[.222,.018]]){
   const lo=y-h/2,hi=y+h/2,a=radius(lo),q=radius(hi)
   turned('pot-shoulder-band',[[a-.004,lo],[a+.004,lo],[q+.004,hi],[q-.004,hi],[a-.004,lo]],'#6f4934')
  }
  const upper=amph?1.035:.73,lower=amph?.655:.26
  for(const side of [-1,1]){
   const top=radius(upper)-.009,bottom=radius(lower)-.009
   const points=amph?[[side*top,upper,0],[side*.29,1.035,0],[side*.397,.91,0],[side*.385,.755,0],[side*bottom,lower,0]]:[[side*top,upper,0],[side*.475,.745,0],[side*.552,.61,0],[side*.5,.385,0],[side*bottom,lower,0]]
   tube('pot-handle',points,amph?.029:.031,clay,ceramic)
   if(!low)for(const y of [upper,lower])smallEll('handle-attachment',.036,.034,.037,side*(radius(y)-.006),y,0,clay,ceramic)
  }
 }else if(id==='screen'){
  for(const panel of [-1,0,1])hinge(()=>{
   const xx=panel*.39;for(const x of [xx-.18,xx+.18])b('screen-stile',.035,1.08,.045,x,.54,0,dark)
   for(const y of [.1,1.02])b('screen-rail',.38,.045,.045,xx,y,0,board)
   b('screen-fabric',.325,.86,.018,xx,.56,0,'#9a8a64',cloth)
   if(!low)for(const yy of [.22,.4,.58,.76,.94]){b('screen-lattice',.32,.009,.025,xx,yy,.015,board);beam('screen-diagonal',[xx-.13,yy-.07,.016],[xx+.13,yy+.07,.016],.005,dark)}
  },[panel===-1?-.2:panel===1?.2:0,0,0],panel===0?0:panel*.44)
  for(const x of [-.2,.2])for(const y of [.24,.83])c('screen-hinge',.018,.018,.09,x,y,0,metal,iron)
 }else if(id==='mirror'){
  for(const x of [-.3,.3]){b('mirror-foot',.12,.07,.47,x,.035,0,dark);b('mirror-upright',.06,.99,.06,x,.55,0,oak);c('mirror-pivot',.028,.028,.12,x,.7,0,brass,iron,'x')}
  const p=ell('mirror-glass',.275,.47,.027,0,.76,.014,'#bcc9c2',glass)
  p.rotation.x=-.08
  const hoop=ring('oval-mirror-frame',.33,.035,0,.76,0,brass,iron,'z');hoop.scale.y=1.53
  b('mirror-stretcher',.66,.06,.075,0,.22,0,board)
 }else if(id==='bathtub'){
  const tub=lathe('hollow-tub',[[0,0],[.36,0],[.4,.07],[.5,.72],[.51,.76],[.47,.8],[.43,.77],[.42,.7],[.33,.13],[0,.13]],0,.07,0,'#9d7a51',wood);tub.scale.set(1.25,1,.77)
  for(const y of [.2,.63]){const hoop=ring('tub-hoop',.39+y*.14,.022,0,y+.07,0,metal,iron);hoop.scale.set(1.25,1,.77)}
  for(const x of [-.34,.34])b('tub-foot',.15,.12,.62,x,.06,0,dark)
  if(!low){for(let i=0;i<18;i++){const a=i/18*Math.PI*2;beam('stave-seam',[Math.sin(a)*.49,.15,Math.cos(a)*.3],[Math.sin(a)*.619,.8,Math.cos(a)*.381],.004,dark)}c('drain-plug',.025,.025,.014,.19,.211,0,dark,iron)}
 }else if(id==='anvil'){
  lathe('anvil-stump',[[0,0],[.35,0],[.405,.055],[.4,.16],[.365,.39],[.345,.55],[0,.55]],0,0,0,dark)
  for(const y of [.14,.43])ring('stump-binding',y<.2?.393:.358,.018,0,y,0,metal,iron)
  ex('anvil-body',[[-.34,.548],[-.38,.59],[-.28,.65],[-.14,.69],[-.13,.83],[-.24,.89],[-.24,.963],[.28,.963],[.28,.89],[.13,.83],[.15,.69],[.29,.65],[.35,.59],[.31,.548]],.29,0,0,0,metal,iron)
  // Both heel tools go through real closed holes, including the face plate.
  const face=(name:string,left:number,right:number,y:number,h:number)=>{
   const shape=new THREE.Shape();shape.moveTo(left,-.16);shape.lineTo(right,-.16);shape.lineTo(right,.16);shape.lineTo(left,.16);shape.closePath()
   const hardy=new THREE.Path();hardy.moveTo(-.442,-.037);hardy.lineTo(-.442,.037);hardy.lineTo(-.368,.037);hardy.lineTo(-.368,-.037);hardy.closePath();shape.holes.push(hardy)
   const pritchel=new THREE.Path();pritchel.absarc(-.301,-.062,.025,0,Math.PI*2,true);shape.holes.push(pritchel)
   const g=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:low?3:8,steps:1});g.rotateX(-Math.PI/2);g.name=id+'-'+name;return keep(k.mesh(g,name==='anvil-face'?'#a7a79c':metal,0,y,0,iron))
  }
  face('anvil-heel',-.49,-.242,.89,.068);face('anvil-face',-.49,.28,.958,.042)
  const horn=lathe('anvil-horn',[[0,0],[.118,0],[.119,.065],[.099,.2],[.069,.33],[.034,.43],[.006,.49],[0,.49]],.235,.875,0,'#939387',iron);horn.rotation.z=-Math.PI/2
  for(const x of [-.26,.26])for(const side of [-1,1]){
   b('anvil-holdfast',.055,.15,.05,x,.58,side*.159,metal,iron,.03)
   b('anvil-clamp-toe',.075,.035,.085,x,.65,side*.142,metal,iron,.025)
   c('holdfast-bolt',.017,.017,.025,x,.672,side*.164,brass,iron,'y',low?6:10)
  }
  if(!low){
   for(let i=0;i<9;i++){const a=i/9*Math.PI*2;beam('stump-check',[Math.cos(a)*.393,.06,Math.sin(a)*.393],[Math.cos(a)*.35,.45,Math.sin(a)*.35],.003,'#342c25',wood)}
   for(const side of [-1,1])for(const y of [.59,.77,.91])b('forging-edge',.035,.016,.004,side*.18,y,.147,'#7b7a6b',iron,0)
  }
 }else if(id==='forge'){
  firebox(.85,.58,.66);b('forge-table',1,.1,.82,0,.82,0,'#817665',stone)
  // Fire bowl is recessed into a solid ring rather than a black disk.
  lathe('forge-fire-bowl',[[.2,0],[.34,.08],[.35,.15],[.29,.18],[.25,.12],[.19,.04],[.2,0]],0,.81,0,metal,iron)
  for(const x of [-.17,0,.17])ell('forge-coal',.1,.05,.09,x,.89,0,'#3e3c35',stone)
  if(e.geometry.active!==false)ell('forge-glow',.1,.07,.09,0,.94,0,'#e58533',fire)
  b('hood-flue',.3,.56,.29,0,1.14,-.26,'#706d5f',stone)
  ex('forge-hood',[[-.43,0],[.43,0],[.15,.26],[-.15,.26]],.5,0,.94,-.18,'#7b786b',stone)
 }else if(id==='loom'){
  frame(.95,1.12,.68);for(const y of [.22,1.01])c('cloth-roller',.06,.06,.91,0,y,0,board,wood,'x')
  const n=low?9:19
  for(let i=0;i<n;i++){const x=-.36+i/(n-1)*.72;beam('warp-thread',[x,.23,0],[x,1.01,-.035],.0055,cream,cloth)}
  b('woven-cloth',.74,.4,.026,0,.43,.015,'#9f6851',cloth)
  for(const x of [-.36,.36])beam('beater-arm',[x,1.02,.02],[x,.63,.27],.021,dark)
  b('beater-bar',.84,.065,.065,0,.64,.27,board)
  b('treadle',.63,.035,.14,0,.105,.26,oak);beam('treadle-link',[.29,.11,.26],[.29,.67,.05],.011,cream,cloth)
  if(!low)for(let i=0;i<7;i++)b('woven-stripe',.74,.014,.004,0,.28+i*.045,.031,cream,cloth,0)
 }else if(id==='spinning-wheel'){
  for(const x of [-.34,.34])b('spinning-foot',.12,.09,.62,x,.045,0,dark)
  b('spinning-bed',.86,.1,.22,0,.24,0,board)
  for(const x of [-.3,.3])b('spinning-post',.065,.63,.075,x,.51,0,oak)
  wheel(-.17,.65,0,.36,'z');c('drive-axle',.025,.025,.26,-.17,.65,0,metal,iron,'z')
  c('spindle',.025,.025,.38,.32,.83,0,metal,iron,'z');c('bobbin',.065,.065,.16,.32,.83,.05,cream,cloth,'z')
  closedTube('drive-band',[[-.17,.99,.1],[.32,.9,.1],[.39,.83,.1],[.32,.76,.1],[-.17,.32,.1],[-.49,.62,.1]],.009,cream,cloth)
  b('treadle',.29,.035,.35,.17,.13,.17,oak);beam('treadle-pitman',[-.21,.4,.11],[.17,.13,.22],.016,board)
  beam('distaff',[.38,.3,-.15],[.4,1.15,-.14],.018,oak);ell('wool',.09,.17,.08,.4,1.04,-.14,cream,cloth)
 }else if(id==='cart'||id==='wheelbarrow'||id==='mine-cart'){
  const mine=id==='mine-cart',barrow=id==='wheelbarrow',transportStart=parts.length
  // Transport wheels have thick tyres and real hubs. Keep this local: the
  // carriage and spinning-wheel retain their existing construction and bounds.
  const turned=(name:string,profile:number[][],x:number,y:number,z:number,col:string,surface:Surface)=>{
   const p=lathe(name,profile,x,y,z,col,surface),flat=p.geometry.toNonIndexed();flat.computeVertexNormals();p.geometry.copy(flat);p.geometry.name=id+'-'+name;flat.dispose();p.rotation.z=Math.PI/2;return p
  }
  const transportWheel=(x:number,y:number,z:number,r:number,steel=false)=>{
   if(steel){
    turned('wheel-iron-tyre',[[.028,-.065],[r*1.11,-.065],[r*1.11,-.039],[r,-.025],[r,.042],[r*.81,.055],[.028,.055],[.028,-.065]],x,y,z,metal,iron)
   }else{
    turned('wheel-rim',[[r*.75,-.043],[r*.95,-.043],[r*.95,.043],[r*.75,.043],[r*.75,-.043]],x,y,z,oak,wood)
    turned('wheel-iron-tyre',[[r*.91,-.052],[r,-.052],[r,.052],[r*.91,.052],[r*.91,-.052]],x,y,z,metal,iron)
    for(let i=0;i<(low?6:10);i++){
     const a=i/(low?6:10)*Math.PI*2
     beam('wheel-spoke',[x,y,z],[x,y+Math.sin(a)*r*.85,z+Math.cos(a)*r*.85],r*.052,board)
    }
   }
   turned('wheel-hub',[[.027,-.09],[.069,-.09],[.075,-.065],[.069,.09],[.027,.09],[.027,-.09]],x,y,z,steel?metal:dark,steel?iron:wood)
   const side=x===0?1:Math.sign(x)
   c('axle-cap',.043,.045,.025,x+side*.098,y,z,brass,iron,'x',low?6:10)
   if(!low)for(let i=0;i<4;i++){const a=i*Math.PI/2;c('hub-fastener',.009,.009,.014,x+side*.104,y+Math.sin(a)*.053,z+Math.cos(a)*.053,metal,iron,'x',6)}
  }
  // Four-sided, thick-walled hopper: outside, rim, inside and the two bottom
  // faces are distinct closed faces, with no slab filling the open mouth.
  const tray=(name:string,bw:number,bd:number,tw:number,td:number,bottom:number,top:number,cz:number,thick:number,col:string,surface:Surface)=>{
   const corners=(w:number,d:number,y:number)=>[[-w/2,y,cz-d/2],[-w/2,y,cz+d/2],[w/2,y,cz+d/2],[w/2,y,cz-d/2]]
   const ob=corners(bw,bd,bottom),ot=corners(tw,td,top),it=corners(tw-thick*2,td-thick*2,top),ib=corners(bw-thick*2,bd-thick*2,bottom+.055),positions:number[]=[],uv:number[]=[]
   const face=(a:number[],b:number[],c:number[],d:number[])=>{for(const p of [a,b,c,a,c,d]){positions.push(...p);uv.push(p[0],p[2]+p[1])}}
   for(let i=0;i<4;i++){const j=(i+1)%4;face(ob[i],ob[j],ot[j],ot[i]);face(ot[i],ot[j],it[j],it[i]);face(ib[i],it[i],it[j],ib[j])}
   face(ib[0],ib[1],ib[2],ib[3]);face(ob[3],ob[2],ob[1],ob[0])
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.name=id+'-'+name;keep(k.mesh(g,col,0,0,0,surface))
  }
  b('chassis-crossmember',barrow?.62:.82,.09,.12,0,barrow?.37:.385,barrow?.12:0,mine?metal:dark,mine?iron:wood)
  if(barrow){
   const wheelZ=-.61
   c('cart-axle',.031,.031,.64,0,.25,wheelZ,metal,iron,'x')
   transportWheel(0,.25,wheelZ,.25)
   for(const side of [-1,1]){
    beam('barrow-handle',[side*.22,.31,-.65],[side*.22,.59,1.05],.035,oak)
    beam('barrow-handgrip',[side*.22,.57,.93],[side*.22,.61,1.13],.041,dark)
    b('axle-bearing-seat',.09,.095,.14,side*.22,.284,wheelZ,metal,iron,.025)
    beam('barrow-leg',[side*.25,.475,.35],[side*.28,.02,.64],.031,dark)
    b('barrow-foot',.10,.035,.14,side*.28,.018,.64,metal,iron,.025)
    beam('tray-stay',[side*.22,.36,.12],[side*.27,.445,.13],.025,board)
    for(const z of [-.19,.30])beam('tray-cleat',[side*.30,.46,z*.65],[side*.423,.815,z],.017,dark)
   }
   beam('barrow-leg-tie',[-.27,.20,.53],[.27,.20,.53],.024,board)
   tray('barrow-tray',.60,.66,.84,.96,.43,.83,.08,.035,oak,wood)
   for(const side of [-1,1])b('tray-top-rail',.055,.05,1.0,side*.413,.827,.08,board)
   for(const z of [-.396,.556])b('tray-end-rail',.86,.05,.055,0,.827,z,board)
   const n=low?3:5;for(let i=0;i<n;i++)b('tray-floor-board',.52/n*.99,.022,.58,-.26+(i+.5)*.52/n,.496,.08,i%2?board:oak,wood,.02)
   if(!low)for(const side of [-1,1])for(const z of [-.19,.30])c('tray-rivet',.010,.010,.019,side*.431,.806,z,brass,iron,'x',8)
  }else{
   const axleY=mine?.23:.29,axles=mine?[-.36,.36]:[-.02],wheelX=mine?.49:.59
   for(const side of [-1,1])b('chassis-longitudinal',.105,.10,mine?1.3:1.18,side*.33,.38,0,mine?metal:dark,mine?iron:wood)
   for(const z of axles){
    c('cart-axle',.032,.032,mine?1.18:1.4,0,axleY,z,metal,iron,'x')
    for(const side of [-1,1]){
     b('axle-bearing-seat',.14,mine?.14:.125,.15,side*.33,mine?.28:.315,z,metal,iron,.025)
     transportWheel(side*wheelX,axleY,z,mine?.205:.29,mine)
     if(!low)c('bearing-pin',.015,.015,.023,side*.33,mine?.357:.385,z,brass,iron,'y',8)
    }
   }
   if(mine){
    tray('steel-hopper',.82,1.0,1.08,1.26,.42,.94,0,.045,metal,iron)
    for(const side of [-1,1]){
     b('hopper-side-rim',.06,.065,1.31,side*.526,.935,0,metal,iron,.025)
     b('hopper-end-rim',1.10,.065,.06,0,.935,side*.616,metal,iron,.025)
     b('buffer-crossmember',.86,.09,.12,0,.35,side*.65,metal,iron,.025)
     c('buffer',.07,.07,.16,0,.35,side*.71,metal,iron,'z')
     ring('coupling',.06,.012,0,.33,side*.845,metal,iron,'y')
     for(const z of [-.42,.42])beam('hopper-stiffener',[side*.405,.45,z*.8],[side*.539,.93,z],.022,dark,iron)
     if(!low)for(const z of [-.45,0,.45])for(const y of [.53,.84])c('hopper-rivet',.012,.012,.018,side*(.41+(y-.42)/.52*.13),y,z,brass,iron,'x',8)
    }
    for(let i=0;i<(low?4:8);i++){
     const g=new THREE.DodecahedronGeometry(.145+(i%3)*.016,0);g.name=id+'-ore-load';const p=keep(k.mesh(g,i%3===0?'#a47d52':'#56564a',Math.sin(i*3)*.27,.71+(i%3)*.045,Math.cos(i*4)*.34,stone));p.scale.set(1,.72,1.12);p.rotation.set(i*.3,i*.8,i*.17)
    }
   }else{
    b('floor-backing',.94,.027,1.12,0,.414,0,dark)
    const n=low?3:6;for(let i=0;i<n;i++)b('floor-board',.94/n*.99,.060,1.12,-.47+(i+.5)*.94/n,.445,0,i%2?board:oak)
    for(const side of [-1,1]){
     for(let row=0;row<3;row++){
      b('cart-side-board',.05,.116,1.12,side*.475,.53+row*.12,0,row%2?board:oak)
      b('cart-end-board',1,.116,.05,0,.53+row*.12,side*.56,row%2?oak:board)
     }
     for(const z of [-.535,0,.535])b('corner-stake',.07,.49,.07,side*.479,.66,z,dark)
     b('cart-top-rail',.075,.06,1.23,side*.479,.888,0,board)
     b('cart-end-top-rail',1.03,.06,.075,0,.888,side*.56,board)
     beam('cart-shaft',[side*.32,.395,-.38],[side*.38,.49,-1.30],.034,oak)
     b('shaft-clamp',.115,.035,.13,side*.32,.434,-.38,metal,iron,.025)
     for(const z of [-.535,.535])b('corner-strap',.02,.40,.065,side*.521,.66,z,metal,iron,.025)
     if(!low)for(const z of [-.535,.535])for(const y of [.51,.66,.81])c('cart-rivet',.012,.012,.018,side*.536,y,z,brass,iron,'x',8)
    }
   }
  }
  // Old saved envelopes put the long chassis along X. Fit the whole joined
  // construction in that direction so handles and wheelbases retain their
  // proportions; the caller's saved facing is still applied normally.
  const transportTurn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2)
  for(const part of parts.slice(transportStart)){part.position.applyQuaternion(transportTurn);part.quaternion.premultiply(transportTurn)}
 }else if(id==='cage'){
  b('cage-tray',.93,.09,.77,0,.045,0,metal,iron)
  const n=low?5:8
  for(const z of [-.35,.35])for(let i=0;i<n;i++){const xx=-.42+i/(n-1)*.84;if(z>0&&Math.abs(xx)<.24)continue;b('cage-bar',.018,.94,.018,xx,.56,z,metal,iron)}
  for(const x of [-.42,.42])for(let i=0;i<n;i++)b('cage-end-bar',.018,.94,.018,x,.56,-.35+i/(n-1)*.7,metal,iron)
  for(const y of [.14,.99]){for(const z of [-.35,.35])b('cage-rail',.87,.035,.032,0,y,z,metal,iron);for(const x of [-.42,.42])b('cage-end-rail',.032,.035,.7,x,y,0,metal,iron)}
  for(let i=0;i<(low?5:9);i++)b('cage-roof-bar',.018,.018,.73,-.41+i/(low?4:8)*.82,1.025,0,metal,iron)
  hinge(()=>{for(const x of [-.22,.22])b('gate-stile',.025,.8,.025,x,.56,.36,metal,iron);for(const y of [.17,.94])b('gate-rail',.45,.025,.025,0,y,.36,metal,iron);for(const x of [-.11,0,.11])b('gate-bar',.016,.77,.016,x,.555,.36,metal,iron)},[-.22,0,.36],e.geometry.open?-Math.PI*.62:0)
  lock(.19,.57,.39);ring('carrying-ring',.09,.016,0,1.11,0,metal,iron,'z')
 }else if(id==='rope-coil'){
  const n=low?5:9
  for(let i=0;i<n;i++){const t=i/(n-1),rr=.25+.06*Math.sin(t*Math.PI),p=ring('rope-loop',rr,.025,0,.032+i*.032,0,cream,cloth);p.scale.x=1.35;p.rotation.z=Math.sin(i)*.025}
  tube('rope-free-end',[[.32,.055,0],[.52,.04,.08],[.58,.03,.28],[.44,.03,.4]],.025,cream,cloth)
  if(!low)for(const x of [-.26,.26])tube('coil-binding',[[x,.02,-.16],[x,.17,-.19],[x,.31,0],[x,.18,.19],[x,.02,.16]],.013,dark,cloth)
 }else if(id==='potters-wheel'){
  legs(.65,.66,.58,.043);b('potter-bed',.84,.07,.74,0,.65,0,board)
  c('wheel-spindle',.037,.037,.68,0,.4,0,metal,iron);c('flywheel',.32,.32,.075,0,.2,0,dark);c('throwing-wheel',.31,.31,.045,0,.72,0,board)
  vessel('wet-pot',0,.745,0,.15,.27,'#b77b5d',ceramic,.72)
  beam('kick-rod',[.29,.23,0],[.3,.09,.27],.018,oak);b('kick-pedal',.23,.035,.27,.3,.08,.28,oak)
 }else if(id==='kiln'||id==='bread-oven'){
  const kiln=id==='kiln';firebox(.9,.6,.75)
  if(kiln){
   lathe('kiln-dome',[[.37,0],[.48,.07],[.48,.47],[.4,.59],[.22,.72],[.13,.76],[.13,.87],[.08,.87],[.08,.73],[.17,.67],[.34,.52],[.39,.36],[.39,.08],[.37,0]],0,.62,-.02,'#ac7959',ceramic)
   for(const y of [.72,1.03])ring('kiln-binding',.475-(y-.72)*.06,.016,0,y,-.02,metal,iron)
   if(!low)for(const y of [.8,.96])for(const side of [-1,1])b('kiln-brick-joint',.005,.13,.025,side*.29,y,.36,'#674f3e',stone,0)
  }else{
   lathe('oven-dome',[[0,0],[.51,0],[.51,.09],[.48,.3],[.37,.47],[.19,.57],[0,.61],[0,.53],[.15,.5],[.31,.41],[.41,.26],[.43,.08],[0,.08]],0,.65,-.03,'#a18f73',stone)
   b('oven-chimney',.2,.38,.21,-.26,1.26,-.17,'#8d7c63',stone)
   for(const x of [-.18,0,.18])ell('bread-loaf',.075,.045,.15,x,.21,.03,'#b98a4f',cloth)
   beam('baker-peel-shaft',[.43,.07,.65],[.4,.59,.18],.016,board);b('baker-peel-blade',.19,.025,.23,.4,.6,.1,board)
  }
  hinge(()=>{ex('fire-door',[[-.235,0],[.235,0],[.235,.2],[.16,.3],[0,.35],[-.16,.3],[-.235,.2]],.035,0,.14,.421,metal,iron);ring('oven-pull',.035,.009,.11,.32,.45,brass,iron,'z')},[-.235,.14,.421],e.geometry.open?-Math.PI*.65:0)
 }else if(id==='grindstone'){
  for(const x of [-.31,.31]){
   for(const side of [-1,1])beam('trestle-leg',[x,.035,side*.3],[x,.65,side*.025],.05,dark)
   b('trestle-cross-tie',.085,.07,.51,x,.22,0,oak)
   b('bearing-seat',.14,.115,.18,x,.595,0,board)
   const bearing=lathe('axle-bearing',[[.034,-.04],[.07,-.04],[.082,-.025],[.082,.025],[.07,.04],[.034,.04],[.034,-.04]],x,.7,0,metal,iron);bearing.rotation.z=-Math.PI/2
   for(const z of [-.06,.06])c('bearing-fastener',.013,.013,.021,x,.658,z,brass,iron,'y',low?6:10)
  }
  for(const z of [-.24,.24])b('frame-longitudinal-tie',.68,.06,.07,0,.25,z,oak)
  c('grindstone-axle',.031,.031,1.02,.04,.7,0,metal,iron,'x')
  const disc=lathe('grinding-stone',[[.039,-.115],[.296,-.115],[.326,-.1],[.345,-.072],[.35,0],[.345,.072],[.326,.1],[.296,.115],[.039,.115],[.039,-.115]],0,.7,0,'#a5a08d',stone);disc.rotation.z=-Math.PI/2
  for(const x of [-.131,.131]){
   const washer=lathe('grindstone-hub',[[.031,-.018],[.079,-.018],[.087,-.008],[.087,.008],[.079,.018],[.031,.018],[.031,-.018]],x,.7,0,metal,iron);washer.rotation.z=-Math.PI/2
   if(!low)for(let i=0;i<4;i++){const a=i/4*Math.PI*2;c('hub-rivet',.009,.009,.018,x+Math.sign(x)*.018,.7+Math.cos(a)*.06,Math.sin(a)*.06,brass,iron,'x',8)}
  }
  b('trough-bottom',.45,.045,.64,0,.225,0,dark)
  for(const side of [-1,1]){b('trough-side',.04,.19,.64,side*.213,.3375,0,oak);b('trough-end',.4,.19,.04,0,.3375,side*.3,oak)}
  b('trough-water',.38,.005,.55,0,.382,0,'#596b62',{roughness:.38},0)
  b('tool-rest',.27,.035,.085,0,.755,.405,metal,iron,.02)
  for(const x of [-.12,.12]){beam('tool-rest-stay',[Math.sign(x)*.31,.35,.22],[x,.742,.405],.019,metal,iron);c('tool-rest-bolt',.014,.014,.025,x,.778,.405,brass,iron,'y',low?6:10)}
  c('crank-boss',.065,.065,.06,.49,.7,0,metal,iron,'x')
  beam('crank-arm',[.49,.7,0],[.49,.7,.18],.023,metal,iron)
  c('crank-spindle',.016,.016,.19,.565,.7,.18,metal,iron,'x')
  c('crank-grip',.032,.027,.15,.575,.7,.18,board,wood,'x')
  if(!low)for(const x of [-.31,.31])for(const z of [-.24,.24])c('frame-pin',.015,.015,.018,x,.25,z+Math.sign(z)*.038,brass,iron,'z',8)
 }else if(id==='sawhorse'){
  aFrame(.65,.78,.75)
  b('sawhorse-back',.13,.1,1.02,0,.72,0,board)
  for(const z of [-.35,.35])b('joint-wedge',.035,.15,.07,.095,.6,z,board)
  if(!low)for(const z of [-.35,.35])for(const x of [-.18,.18])pin(x,.35,z+.04)
 }else if(id==='carpenter-clamp'){
  b('clamp-spine',.1,.77,.12,-.34,.43,0,metal,iron)
  b('fixed-jaw',.64,.1,.18,-.07,.83,0,metal,iron);b('sliding-jaw',.55,.09,.17,-.11,.27,0,metal,iron)
  c('clamp-screw',.026,.026,.47,.14,.48,0,metal,iron)
  c('swivel-pad',.085,.065,.035,.14,.7,0,metal,iron)
  c('screw-handle',.047,.047,.19,.14,.15,0,board)
  beam('cross-handle',[.02,.09,0],[.26,.09,0],.014,dark)
  if(!low)for(let i=0;i<9;i++)ring('screw-thread',.029,.005,.14,.3+i*.04,0,brass,iron)
 }else if(id==='tanning-frame'){
  frame(.92,1.16,.21)
  ex('stretched-hide',[[-.23,.98],[-.34,.82],[-.27,.65],[-.34,.36],[-.19,.22],[0,.28],[.22,.2],[.32,.39],[.25,.65],[.33,.85],[.21,1.02],[0,.95]],.025,0,0,0,'#bc996a',cloth)
  for(const side of [-1,1])for(const y of [.32,.57,.82,1.02])beam('hide-lacing',[side*.28,y,0],[side*.45,y+.025,0],.009,cream,cloth)
  for(const x of [-.17,.1]){beam('hide-top-lace',[x,.98,0],[x,1.13,0],.009,cream,cloth);beam('hide-bottom-lace',[x,.25,0],[x,.08,0],.009,cream,cloth)}
  for(const side of [-1,1])b('tanning-foot',.13,.07,.52,side*.46,.035,0,dark)
 }else if(id==='cheese-press'||id==='oil-press'){
  const oil=id==='oil-press';frame(.88,1.2,.66);plankFloor(.12,.9,.72)
  c('press-screw',.035,.035,.74,0,.93,0,board);b('press-crossbeam',1.01,.14,.19,0,1.18,0,dark)
  c('press-platen',oil?.26:.3,oil?.26:.3,.065,0,.64,0,board)
  beam('screw-turning-bar',[-.29,1.37,0],[.29,1.37,0],.025,dark)
  if(oil){
   const n=low?12:20;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;beam('press-basket-stave',[Math.cos(a)*.28,.21,Math.sin(a)*.28],[Math.cos(a)*.28,.59,Math.sin(a)*.28],.022,oak)}
   for(const y of [.25,.53])ring('press-basket-hoop',.29,.016,0,y,0,metal,iron)
   b('oil-tray',.72,.06,.68,0,.18,0,dark);tube('oil-spout',[[.22,.18,.29],[.22,.13,.43],[.22,.1,.49]],.027,board)
   vessel('oil-collecting-pot',.22,0,.53,.11,.17,'#947858',ceramic)
  }else{c('cheese-mould',.3,.3,.32,0,.36,0,cream,wood);for(const y of [.26,.45])ring('cheese-mould-band',.303,.012,0,y,0,dark,wood);c('cheese-wheel',.255,.255,.08,0,.565,0,'#c4ad64',cloth)}
  if(!low)for(let i=0;i<10;i++)ring('press-screw-thread',.04,.007,0,.73+i*.055,0,dark,wood)
 }else if(id==='grain-mill'){
  legs(.48,.66,.6,.052);b('mill-bed',.92,.1,.83,0,.52,0,dark)
  c('lower-quern',.38,.38,.12,0,.63,0,'#898573',stone);c('upper-quern',.35,.35,.17,0,.775,0,'#aaa18c',stone)
  // Four hopper sides leave an actual mouth and narrow throat.
  for(const side of [-1,1]){const p=b('hopper-side',.05,.38,.48,side*.18,1.02,0,board);p.rotation.z=side*.27;const q=b('hopper-end',.43,.38,.05,0,1.02,side*.18,oak);q.rotation.x=-side*.27}
  beam('mill-crank',[.26,.86,0],[.46,.86,0],.022,metal,iron);c('mill-crank-grip',.028,.028,.16,.46,.94,0,board)
  b('flour-chute',.19,.065,.34,0,.59,.45,board);vessel('flour-bucket',0,0,.56,.15,.3,cream,wood,.9)
 }else if(id==='still'){
  for(const x of [-.34,.34])for(const z of [-.2,.2])beam('still-leg',[x,.02,z],[x*.8,.35,z*.8],.031,dark)
  lathe('copper-boiler',[[0,0],[.22,0],[.34,.12],[.38,.35],[.3,.52],[.1,.62],[.09,.72],[0,.72]],-.2,.26,0,'#a97946',iron)
  ring('boiler-seam',.3,.013,-.2,.76,0,'#c09958',iron)
  tube('swan-neck',[[-.2,.97,0],[-.18,1.2,0],[.19,1.15,0],[.38,.93,0]],.033,'#ba8c50',iron)
  vessel('cooling-tub',.38,.08,0,.24,.59,dark,wood,.91)
  const n=low?3:5;for(let i=0;i<n;i++)ring('condenser-coil',.15,.015,.38,.32+i*.065,0,'#c09958',iron)
  tube('distillate-spout',[[.52,.3,0],[.7,.27,.08],[.7,.17,.13]],.018,'#c09958',iron)
  vessel('spirit-bottle',.7,0,.16,.075,.19,'#71816a',ceramic,.35)
 }else if(id==='fish-rack'||id==='herb-rack'){
  frame(.93,1.09,.36);for(const y of [.44,.95])b('hanging-rail',1,.05,.07,0,y,0,board)
  const n=low?4:7
  for(let i=0;i<n;i++){const x=-.37+i/(n-1)*.74,yy=i%2?.95:.44;beam('hanging-twine',[x,yy,0],[x,yy-.12,0],.007,cream,cloth)
   if(id==='fish-rack'){ell('drying-fish',.048,.14,.03,x,yy-.25,0,i%2?'#8d9882':'#a4aa96',cloth);ex('fish-tail',[[-.045,0],[.045,0],[.025,.07],[0,.04],[-.025,.07]],.025,x,yy-.39,0,'#8c927c',cloth);pin(x+.02,yy-.17,.03,.006)}
   else{for(let j=0;j<(low?3:5);j++){const dx=(j-2)*.025;beam('herb-stem',[x,yy-.13,0],[x+dx,yy-.34,.015*j],.004,green,cloth);smallEll('herb-leaf',.04,.065,.018,x+dx,yy-.29,.015*j,j%2?green:'#7f8950',cloth)}}
  }
  for(const side of [-1,1])b('drying-rack-foot',.15,.07,.65,side*.46,.035,0,dark)
 }else if(id==='smokehouse'||id==='chicken-coop'){
  const smoke=id==='smokehouse',floorY=smoke?.08:.38,w=.85,d=.74,h=smoke?1.1:.7
  if(!smoke)legs(.35,.72,.61,.035)
  plankFloor(floorY,w,d)
  for(const side of [-1,1])b('house-side',.055,h,d,side*w/2,floorY+h/2,0,oak)
  plankedWall(0,floorY+h/2,-d/2,w,h,.05)
  for(const x of [-.36,.36])b('front-door-jamb',.13,h,.06,x,floorY+h/2,d/2,dark)
  b('door-lintel',w,.15,.07,0,floorY+h-.04,d/2,board)
  roof(floorY+h,w+.16,d+.16,.26)
  if(smoke){
   for(const yy of [.44,.8])b('smoking-rail',.72,.04,.04,0,yy,0,board)
   for(const x of [-.23,0,.23]){beam('smoke-hook',[x,.8,0],[x,.67,0],.008,metal,iron);ell('smoking-ham',.07,.12,.065,x,.57,0,'#80523a',cloth)}
   b('smoke-flue',.16,.25,.17,0,1.53,-.16,dark);b('flue-cap',.24,.05,.24,0,1.67,-.16,metal,iron)
  }else{b('roost',.68,.04,.045,0,.67,-.05,board);b('nest-box-floor',.25,.04,.27,.19,.43,-.13,board);ring('straw-nest',.095,.026,.19,.47,-.13,'#bd9a59',cloth);ell('egg',.022,.031,.022,.18,.495,-.13,cream,ceramic);const ramp=b('coop-ramp',.29,.045,.85,0,.21,.69,board);ramp.rotation.x=.38;for(let i=0;i<(low?4:7);i++)b('ramp-cleat',.3,.025,.025,0,.37-i*.043,.39+i*.1,dark)}
  hinge(()=>{plankedWall(0,floorY+h*.46,d/2+.035,.57,h*.85,.045);for(const y of [floorY+.14,floorY+h*.73])b('house-door-strap',.51,.045,.018,0,y,d/2+.07,metal,iron);ring('house-latch',.025,.006,.19,floorY+h*.43,d/2+.08,metal,iron,'z')},[-.285,0,d/2+.035],e.geometry.open?-Math.PI*.65:0)
  lock(.2,floorY+h*.44,d/2+.09)
 }else if(id==='beehive'){
  // A coiled straw skep with a real arched entrance in its lower wall.
  lathe('skep-upper',[[.36,0],[.4,.08],[.36,.34],[.26,.59],[.12,.76],[0,.81],[0,.75],[.08,.7],[.2,.53],[.3,.3],[.33,.08],[.31,0],[.36,0]],0,.18,0,'#b69b5e',cloth)
  const n=low?12:20
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2;if(Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))<.32)continue;beam('skep-base-coil',[Math.sin(a)*.36,.06,Math.cos(a)*.36],[Math.sin(a)*.36,.22,Math.cos(a)*.36],.043,'#ac8e4f',cloth)}
  for(let i=0;i<(low?5:9);i++){const yy=.22+i/(low?4:8)*.64,rr=.385*Math.sqrt(Math.max(.025,1-Math.max(0,(yy-.23)/.76)**1.3));ring('straw-coil',rr,.018,0,yy,0,i%2?'#d0b170':'#ae9254',cloth)}
  b('hive-base-board',.93,.05,.8,0,.025,0,dark)
  b('landing-board',.25,.035,.3,0,.06,.43,board)
 }else if(id==='feed-trough'||id==='flower-planter'||id==='coal-bin'){
  const planter=id==='flower-planter',coal=id==='coal-bin',w=coal?.9:1.05,d=coal?.75:.48,h=coal?.63:.42
  plankFloor(.13,w,d)
  for(const side of [-1,1]){const p=b('trough-side',.045,h,w,0,.15+h/2,side*d/2,oak);p.rotation.y=Math.PI/2;p.rotation.x=side*.14;b('trough-end',.045,h,d,side*w/2,.15+h/2,0,board)}
  for(const x of [-w*.34,w*.34])b('trough-foot',.13,.14,d+.13,x,.07,0,dark)
  if(planter){b('planter-soil',w*.87,.06,d*.84,0,.47,0,'#66513b',stone)
   for(let i=0;i<(low?4:7);i++){const xx=-.41+i/(low?3:6)*.82,yy=.7+(i%3)*.1;beam('flower-stem',[xx,.48,0],[xx,yy,0],.007,green,cloth);for(let j=0;j<(low?4:6);j++){const a=j/(low?4:6)*Math.PI*2;smallEll('flower-petal',.045,.024,.035,xx+Math.cos(a)*.045,yy+Math.sin(a)*.045,0,i%2?'#be9364':'#a56b75',cloth)}smallEll('flower-centre',.025,.025,.027,xx,yy,.012,brass,cloth);smallEll('flower-leaf',.065,.025,.023,xx+.045,yy-.1,0,green,cloth)}
  }else if(coal){for(let i=0;i<(low?10:19);i++)ell('coal-lump',.11,.07,.09,Math.sin(i*3.6)*.31,.5+Math.sin(i)*.07,Math.cos(i*2.7)*.23,i%3?'#3a3a33':'#514c3e',stone)}
  else{b('trough-grain',w*.85,.025,d*.7,0,.31,0,'#b59b62',cloth);if(!low)for(let i=0;i<10;i++)ell('feed-grain',.016,.011,.026,Math.sin(i*4)*.4,.33,Math.cos(i*3)*.13,cream,cloth)}
 }else if(id==='hay-bale'){
  b('compressed-hay',.98,.63,.72,0,.335,0,'#b19a5c',cloth,.14)
  for(const x of [-.31,.31]){b('bale-top-twine',.017,.018,.74,x,.66,0,dark,cloth);for(const z of [-.365,.365])b('bale-side-twine',.017,.61,.014,x,.345,z,dark,cloth);b('bale-bottom-twine',.017,.016,.72,x,.027,0,dark,cloth)}
  if(!low)for(let i=0;i<21;i++){const yy=.075+(i%7)*.084,xx=Math.sin(i*4.5)*.42;beam('hay-fibre',[xx-.06,yy,.369],[xx+.08,yy+.012,.369],.003,'#d2bc79',cloth)}
 }else if(id==='wine-rack'||id==='bolt-rack'){
  const wine=id==='wine-rack';frame(.92,1.09,.61)
  for(const y of [.16,.46,.76,1.06])b('rack-shelf',.92,.045,.6,0,y,0,board)
  if(wine){
   for(let row=0;row<3;row++)for(let col=0;col<3;col++){const x=(col-1)*.27,y=.27+row*.3;for(const side of [-1,1])b('bottle-cradle',.026,.09,.51,x+side*.087,y-.07,0,dark);const bottle=lathe('wine-bottle',[[0,0],[.062,0],[.078,.03],[.078,.3],[.045,.36],[.03,.4],[.03,.5],[0,.5]],x,y,-.2,(row+col)%2?'#5d7355':'#7f674c',ceramic);bottle.rotation.x=Math.PI/2;c('bottle-cork',.024,.024,.025,x,y,.315,board,wood,'z')}
  }else{
   for(let row=0;row<3;row++)for(let i=0;i<(low?3:5);i++){const x=(i-(low?1:2))*(low?.25:.17),yy=.235+row*.3;c('cloth-bolt',.075,.075,.47,x,yy,0,[red,green,cream,'#8d7a92','#8e7950'][(row+i)%5],cloth,'z');c('bolt-core',.018,.018,.52,x,yy,0,board,wood,'z')}
  }
 }else if(id==='market-scale'){
  b('scale-base',.73,.09,.48,0,.045,0,dark);c('scale-column',.045,.075,.78,0,.48,0,brass,iron)
  beam('scale-balance',[-.48,.88,0],[.48,.88,0],.027,brass,iron);ring('scale-pivot',.06,.014,0,.92,0,brass,iron,'z')
  for(const side of [-1,1]){
   const x=side*.43;for(const z of [-.12,.12])beam('scale-chain',[x,.88,0],[x,.4,z],.0065,metal,iron)
   lathe('scale-pan',[[0,0],[.12,0],[.23,.05],[.225,.075],[.19,.065],[.11,.025],[0,.025]],x,.35,0,brass,iron)
  }
  c('scale-weight',.06,.07,.1,.43,.43,0,metal,iron);ring('weight-handle',.025,.006,.43,.51,0,metal,iron,'z')
 }else if(id==='fruit-stall'||id==='fish-stall'){
  legs(.59,.85,.61,.04);top(.67,1.12,.78)
  for(const x of [-.48,.48])for(const z of [-.3,.3])b('awning-post',.045,1.2,.045,x,.61,z,dark)
  for(const side of [-1,1]){const n=low?4:8;for(let i=0;i<n;i++){const xx=-.59+(i+.5)*1.18/n;ex('awning-stripe',[[0,1.27],[side*.48,1.1],[side*.48,1.065],[0,1.235]],1.18/n*.996,0,0,0,(i%2)?cream:id==='fruit-stall'?red:'#607c7c',cloth).rotation.y=Math.PI/2;const part=parts[parts.length-1];part.position.x=xx}}
  for(let tray=0;tray<3;tray++){const x=(tray-1)*.34;b('display-tray',.31,.035,.58,x,.706,0,board);for(const side of [-1,1])b('tray-edge',.025,.085,.58,x+side*.15,.75,0,dark)
   if(id==='fruit-stall')for(let i=0;i<(low?4:7);i++)ell('market-fruit',.055,.052,.055,x+Math.sin(i*3.8)*.08,.786+Math.sin(i)*.02,Math.cos(i*2.3)*.2,tray===0?red:tray===1?'#9d9d4c':'#bb9249',cloth)
   else for(let i=0;i<(low?2:3);i++){ell('market-fish',.045,.03,.19,x+(i-1)*.085,.769,0,'#9aa89a',cloth);ex('fish-tail',[[-.05,0],[0,.06],[.05,0],[0,.02]],.016,x+(i-1)*.085,.77,-.21,'#7b8b7e',cloth).rotation.x=Math.PI/2}
  }
 }else if(id==='carriage'){
  for(const x of [-.52,.52])for(const z of [-.48,.48])wheel(x,.3,z,.29,'x')
  for(const z of [-.48,.48])c('carriage-axle',.031,.031,1.15,0,.3,z,metal,iron,'x')
  b('carriage-chassis',.9,.09,1.26,0,.41,0,dark)
  b('coach-floor',.89,.08,1.04,0,.54,0,oak)
  for(const x of [-.43,.43]){b('coach-lower-panel',.055,.33,.98,x,.735,0,red);for(const z of [-.47,.47])b('coach-pillar',.05,.77,.055,x,.98,z,dark);b('coach-window-rail',.06,.045,.98,x,1.05,0,board)}
  for(const z of [-.48,.48]){b('coach-end-panel',.86,.48,.045,0,.81,z,red);b('coach-end-window-frame',.86,.06,.055,0,1.24,z,board)}
  for(const z of [-.32,.3]){b('coach-seat',.74,.09,.26,0,.76,z,cream,cloth);b('coach-seat-back',.74,.26,.05,0,.9,z*1.25,red,cloth)}
  const canopy=lathe('coach-roof',[[0,0],[.49,0],[.5,.04],[.4,.13],[0,.19],[0,0]],0,1.36,0,dark);canopy.scale.z=1.29
  for(const side of [-1,1]){b('coach-step',.18,.04,.36,side*.54,.38,.02,metal,iron);beam('carriage-shaft',[side*.34,.43,-.58],[side*.35,.48,-1.06],.025,board)}
  if(e.geometry.open)hinge(()=>b('coach-door',.045,.44,.38,.465,.79,0,red),[.465,0,-.19],.9)
  else b('coach-door',.045,.44,.38,.465,.79,0,red)
  lock(.5,.84,.14)
 }else if(id==='windmill-frame'){
  for(const x of [-.33,.33])for(const z of [-.29,.29])beam('tower-leg',[x,.025,z],[x*.42,1.26,z*.42],.045,dark)
  for(const y of [.22,.72,1.18]){const f=1-y*.42;for(const z of [-.29,.29])b('tower-crossrail',.66*f,.055,.055,0,y,z*f,board)}
  for(const z of [-.24,.24]){beam('tower-cross-brace',[-.3,.15,z],[.18,1.1,z*.58],.023,oak);beam('tower-cross-brace',[.3,.15,z],[-.18,1.1,z*.58],.023,oak)}
  c('windshaft',.055,.055,.47,0,1.15,.05,metal,iron,'z')
  for(let i=0;i<4;i++){const a=i*Math.PI/2+.2,dx=Math.cos(a),dy=Math.sin(a);beam('sail-spar',[0,1.15,.33],[dx*.75,1.15+dy*.75,.33],.027,board)
   const sail=b('sail-lattice',.18,.5,.025,dx*.47-dy*.06,1.15+dy*.47+dx*.06,.34,cream,cloth);sail.rotation.z=a-Math.PI/2
   if(!low)for(let j=1;j<5;j++)beam('sail-batten',[dx*(.2+j*.09)-dy*.11,1.15+dy*(.2+j*.09)+dx*.11,.36],[dx*(.2+j*.09)+dy*.11,1.15+dy*(.2+j*.09)-dx*.11,.36],.006,dark)}
  ring('sail-hub',.09,.025,0,1.15,.38,metal,iron,'z')
 }else if(id==='crane'||id==='pulley-rig'){
  const crane=id==='crane';for(const x of [-.39,.39])b('hoist-foot',.15,.08,.77,x,.04,0,dark)
  if(crane){b('crane-mast',.13,1.45,.13,-.22,.76,0,dark);beam('crane-jib',[-.29,1.3,0],[.65,1.58,0],.055,board);beam('jib-brace',[-.23,.67,0],[.48,1.52,0],.034,oak);ring('mast-collar',.092,.02,-.22,.85,0,metal,iron)}
  else{for(const x of [-.43,.43])b('gantry-upright',.1,1.4,.1,x,.74,0,dark);b('gantry-top',1.12,.13,.16,0,1.44,0,board);for(const x of [-.43,.43])beam('gantry-brace',[x,.95,0],[x-Math.sign(x)*.28,1.4,0],.026,oak)}
  const hx=crane?.58:0,hy=crane?1.55:1.35
  for(const z of [-.055,.055])b('pulley-cheek',.15,.23,.025,hx,hy-.08,z,metal,iron)
  ring('pulley-sheave',.065,.016,hx,hy-.08,0,brass,iron,'z')
  tube('hoist-rope',[[crane?-.22:-.32,.45,.02],[crane?-.22:-.32,hy-.05,.02],[hx,hy+.01,.02],[hx,.59,.02]],.012,cream,cloth)
  ring('lower-block-wheel',.062,.016,hx,.53,.02,brass,iron,'z')
  tube('load-hook',[[hx,.47,.02],[hx,.37,.02],[hx+.07,.34,.02],[hx+.09,.41,.02]],.017,metal,iron)
  c('rope-drum',.1,.1,.3,-.23,.4,0,oak,wood,'z');beam('winch-handle',[-.23,.4,.18],[-.38,.4,.18],.019,metal,iron)
 }else if(id==='winch'){
  for(const x of [-.4,.4])b('winch-foot',.14,.1,.69,x,.05,0,dark)
  for(const x of [-.3,.3])b('drum-bearing',.1,.57,.13,x,.36,0,oak)
  c('winch-axle',.04,.04,.93,0,.5,0,metal,iron,'x');c('winch-drum',.15,.15,.46,0,.5,0,oak,wood,'x')
  for(const x of [-.25,.25])c('drum-flange',.23,.23,.05,x,.5,0,metal,iron,'x')
  for(let i=0;i<(low?5:10);i++)ring('wound-rope',.168,.018,-.2+i/(low?4:9)*.4,.5,0,cream,cloth,'x')
  gears(-.33,.5,0,.24,'x');beam('winch-crank',[-.48,.5,0],[-.48,.79,0],.023,metal,iron);c('crank-grip',.032,.032,.18,-.55,.79,0,board,wood,'x')
  tube('rope-end',[[0,.33,.03],[0,.25,.34],[0,.06,.57]],.018,cream,cloth)
 }else if(id==='gear-pair'){
  b('gear-pedestal',1.04,.09,.53,0,.045,0,dark)
  for(const x of [-.25,.28]){b('axle-bearing',.1,.4,.15,x,.28,-.12,oak);c('gear-shaft',.032,.032,.39,x,.49,0,metal,iron,'z')}
  gears(-.25,.49,.12,.3);gears(.28,.49,.12,.23)
  ring('shaft-washer',.06,.013,-.25,.49,.23,brass,iron,'z')
 }else if(id==='bellows'){
  const outline=[[-.25,-.38],[-.36,-.22],[-.36,.05],[-.26,.25],[-.12,.44],[0,.54],[.12,.44],[.26,.25],[.36,.05],[.36,-.22],[.25,-.38],[0,-.41]]
  const slope=.18
  const plate=(name:string,y:number,tilt:number)=>{
   const shape=new THREE.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath()
   if(!tilt){const inlet=new THREE.Path();inlet.absarc(0,.14,.057,0,Math.PI*2,true);shape.holes.push(inlet)}
   const g=new THREE.ExtrudeGeometry(shape,{depth:.05,bevelEnabled:false,curveSegments:low?3:8,steps:1});g.rotateX(-Math.PI/2)
   const shear=new THREE.Matrix4().set(1,0,0,0,0,1,-tilt,0,0,0,1,0,0,0,0,1);g.applyMatrix4(shear);g.name=id+'-'+name;keep(k.mesh(g,board,0,y-.025,0,wood))
   const grip=b('bellows-handle',.13,.045,.43,0,y+tilt*.555,-.555,dark,wood,.04)
   grip.geometry.applyMatrix4(shear)
  }
  plate('bellows-board',.055,0);plate('bellows-board',.212,slope)
  // Compact timber skid frame seats into the underside of the lower board.
  for(const x of [-.22,.22])b('skid-rail',.06,.036,.62,x,.018,-.06,dark,wood,.035)
  for(const z of [-.18,.16])b('skid-cross-tie',.53,.036,.07,0,.018,z,oak,wood,.035)
  // A single thick folded leather side wall encloses an empty air chamber.
  // Inner and outer corrugations share sealed top and bottom annular hems.
  const rings=low?5:9,n=outline.length,positions:number[]=[],uv:number[]=[],indices:number[]=[]
  for(let inner=0;inner<2;inner++)for(let j=0;j<rings;j++){
   const f=j/(rings-1),scale=(j===0||j===rings-1?.955:j%2?.89:.985)-(inner?.025:0)
   for(const [xx,zz] of outline){const x=xx*scale,z=zz*scale,top=.19-slope*z;positions.push(x,.077+(top-.077)*f,z);uv.push((x+.36)/.72,f)}
  }
  const index=(side:number,j:number,i:number)=>(side*rings+j)*n+(i+n)%n
  for(let j=0;j<rings-1;j++)for(let i=0;i<n;i++)for(let side=0;side<2;side++){
   const a=index(side,j,i),b=index(side,j,i+1),c=index(side,j+1,i+1),d=index(side,j+1,i)
   indices.push(...(side?[a,c,b,a,d,c]:[a,b,c,a,c,d]))
  }
  for(const j of [0,rings-1])for(let i=0;i<n;i++){
   const a=index(0,j,i),b=index(0,j,i+1),c=index(1,j,i+1),d=index(1,j,i)
   indices.push(...(j?[a,b,c,a,c,d]:[a,c,b,a,d,c]))
  }
  let volume=0
  for(let i=0;i<indices.length;i+=3){const a=new THREE.Vector3().fromArray(positions,indices[i]*3),b=new THREE.Vector3().fromArray(positions,indices[i+1]*3),c=new THREE.Vector3().fromArray(positions,indices[i+2]*3);volume+=a.dot(b.cross(c))}
  if(volume<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]]
  const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shell.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));shell.setIndex(indices);const flat=shell.toNonIndexed();shell.dispose();flat.computeVertexNormals();flat.name=id+'-leather-gusset';keep(k.mesh(flat,'#66503c',0,0,0,cloth))
  const nozzle=lathe('bellows-nozzle',[[.07,0],[.075,.025],[.055,.13],[.028,.34],[.02,.34],[.044,.13],[.059,.025],[.057,0],[.07,0]],0,.095,.45,metal,iron);nozzle.rotation.x=Math.PI/2
  const nozzleFlat=nozzle.geometry.toNonIndexed();nozzleFlat.computeVertexNormals();nozzle.geometry.copy(nozzleFlat);nozzle.geometry.name=id+'-bellows-nozzle';nozzleFlat.dispose()
  ring('nozzle-collar',.068,.01,0,.095,.475,brass,iron,'z')
  for(const x of [-.055,.055]){b('handle-strap',.028,.018,.24,x,.085,-.48,metal,iron,.02);const strap=b('handle-strap',.028,.018,.24,x,.212+slope*.48+.03,-.48,metal,iron,.02);strap.geometry.applyMatrix4(new THREE.Matrix4().set(1,0,0,0,0,1,-slope,0,0,0,1,0,0,0,0,1))}
  for(let i=0;i<outline.length;i+=(low?2:1)){
   const x=outline[i][0]*.91,z=outline[i][1]*.91
   c('bellows-stud',.009,.009,.014,x,.212-slope*z+.027,z,brass,iron,'y',low?6:8)
   c('bellows-stud',.009,.009,.014,x,.084,z,brass,iron,'y',low?6:8)
  }
 }else return false
 const limits=motionBounds[id]
 const result=k.finish(limits?new THREE.Box3(new THREE.Vector3(...limits.slice(0,3)),new THREE.Vector3(...limits.slice(3))):undefined)
 if(['sack','basket','jar','amphora','cart','wheelbarrow','mine-cart'].includes(id))for(const part of parts){
  // A severely flattened old save can pull a lip or oblique beam's
  // interpolated normal through its own face. Split only affected triangle corners after
  // the final scale, preserving the ordinary smooth finish everywhere else.
  const g=part.geometry,p=g.attributes.position,n=g.attributes.normal,index=g.index,bad:number[]=[]
  for(let i=0;i<(index?.count??p.count);i+=3){
   const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2
   const ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a),vx=p.getX(c)-p.getX(a),vy=p.getY(c)-p.getY(a),vz=p.getZ(c)-p.getZ(a)
   const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx
   const dot=x*(n.getX(a)+n.getX(b)+n.getX(c))+y*(n.getY(a)+n.getY(b)+n.getY(c))+z*(n.getZ(a)+n.getZ(b)+n.getZ(c))
   if(x*x+y*y+z*z>1e-24&&dot< -1e-12)bad.push(i)
  }
  if(!bad.length)continue
  if(index){const name=g.name,split=g.toNonIndexed();g.copy(split);g.name=name;split.dispose()}
  const positions=g.attributes.position,normals=g.attributes.normal
  for(const i of bad){
   const a=new THREE.Vector3().fromBufferAttribute(positions,i),b=new THREE.Vector3().fromBufferAttribute(positions,i+1),c=new THREE.Vector3().fromBufferAttribute(positions,i+2),normal=b.sub(a).cross(c.sub(a)).normalize()
   for(let j=0;j<3;j++)normals.setXYZ(i+j,normal.x,normal.y,normal.z)
  }
  normals.needsUpdate=true
  g.computeBoundingBox();g.computeBoundingSphere()
 }
 return result
}
