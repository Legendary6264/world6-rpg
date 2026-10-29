import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh} from './scene3dMeshes'
import {reliefPlate,sculptedHair} from './scene3dRelief.ts'

type FigureRing=[y:number,width:number,depth:number,front?:number]

// Capped elliptical cross sections give the head, palm, clothes and footwear
// their own silhouette. End faces and the angular seam are part of the mesh.
function figureLoft(name:string,rings:FigureRing[],segments=28,deform?:(point:THREE.Vector3)=>void){
 const positions:number[]=[],uv:number[]=[],indices:number[]=[],stride=segments+1
 for(const [y,width,depth,front=0] of rings)for(let i=0;i<=segments;i++){
  const angle=i/segments*Math.PI*2,point=new THREE.Vector3(Math.cos(angle)*width,y,front+Math.sin(angle)*depth)
  deform?.(point);positions.push(point.x,point.y,point.z);uv.push(i/segments,y)
 }
 for(let row=0;row<rings.length-1;row++)for(let i=0;i<segments;i++){
  const a=row*stride+i,b=a+stride;indices.push(a,b,a+1,a+1,b,b+1)
 }
 for(const [row,top] of [[0,false],[rings.length-1,true]] as const){
  const centre=positions.length/3,[y,,,front=0]=rings[row];positions.push(0,y,front);uv.push(.5,.5)
  for(let i=0;i<segments;i++)indices.push(...(top?[centre,row*stride+i+1,row*stride+i]:[centre,row*stride+i,row*stride+i+1]))
 }
 const g=new THREE.BufferGeometry();g.name=name;g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals()
 const n=g.getAttribute('normal')
 for(let row=0;row<rings.length;row++){
  const a=row*stride,b=a+segments,normal=new THREE.Vector3().fromBufferAttribute(n,a).add(new THREE.Vector3().fromBufferAttribute(n,b)).normalize()
  n.setXYZ(a,normal.x,normal.y,normal.z);n.setXYZ(b,normal.x,normal.y,normal.z)
 }
 return g
}

function figureTube(points:THREE.Vector3[],radius:number,segments:number,radial=6){
 const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,radius,radial,false),p=Array.from(tube.getAttribute('position').array),uv=Array.from(tube.getAttribute('uv').array),indices=Array.from(tube.index!.array)
 for(const [ring,point,end] of [[0,points[0],false],[segments,points.at(-1)!,true]] as const){
  const centre=p.length/3;p.push(point.x,point.y,point.z);uv.push(.5,.5)
  for(let i=0;i<radial;i++){const a=ring*(radial+1)+i;indices.push(...(end?[centre,a+1,a]:[centre,a,a+1]))}
 }
 tube.setAttribute('position',new THREE.Float32BufferAttribute(p,3));tube.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));tube.setIndex(indices);tube.computeVertexNormals();return tube
}

function figureStrap(points:THREE.Vector3[],width:number,thickness:number){
 const curve=new THREE.CatmullRomCurve3(points),positions:number[]=[],uv:number[]=[],indices:number[]=[],steps=24
 for(let row=0;row<=steps;row++){
  const t=row/steps,point=curve.getPoint(t),tangent=curve.getTangent(t),across=new THREE.Vector3(-tangent.y,tangent.x,0).normalize().multiplyScalar(width/2)
  for(const [side,front] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
   const p=point.clone().addScaledVector(across,side);p.z+=front*thickness/2;positions.push(p.x,p.y,p.z);uv.push((side+1)/2,t)
  }
 }
 for(let row=0;row<steps;row++)for(let side=0;side<4;side++){
  const a=row*4+side,b=row*4+(side+1)%4;indices.push(a,b,a+4,b,b+4,a+4)
 }
 indices.push(0,2,1,0,3,2,steps*4,steps*4+1,steps*4+2,steps*4,steps*4+2,steps*4+3)
 const g=new THREE.BufferGeometry();g.name='figure-shoulder-strap';g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
}

// Generic presentation figures, not inferred character anatomy/equipment.
// Every component fits the stored footprint; unknown height stays a flat token.
export function populateFigure(e:RenderEntity,mesh:ModelMesh){
 if(e.geometry.kind!=='actor'||!e.appearance.heightKnown)return false
 const w=e.geometry.width,d=e.geometry.depth,h=e.geometry.height,bw=Math.min(w,h*.52),bd=Math.min(d,h*.34),colour=e.appearance.color
 const cloth='#293945',leather='#493e31',steel='#89958e',skin='#bda58c'
 const metalSurface={metalness:.65,roughness:.42},skinSurface={roughness:.9},leatherSurface={roughness:.86}
 const box=(a:number,b:number,c:number,x:number,y:number,z:number,color:string,metal=false)=>mesh(new RoundedBoxGeometry(a,b,c,2,Math.min(a,b,c)*.12),color,x,y,z,metal?metalSurface:leatherSurface)
 const form=(name:string,rings:FigureRing[],color:string,x=0,y=0,z=0,deform?:(point:THREE.Vector3)=>void)=>{
  const geometry=figureLoft(name,rings,28,deform);geometry.scale(bw,h,bd);return mesh(geometry,color,x*bw,y*h,z*bd,color===skin?skinSurface:color===leather?leatherSurface:{roughness:.88})
 }
 const anatomy=(name:string,points:number[][],radius:number,color=skin,segments=12)=>{
  const geometry=figureTube(points.map(p=>new THREE.Vector3(...p as [number,number,number])),radius,segments,8);geometry.name=name;geometry.scale(bw,h,bd)
  return mesh(geometry,color,0,0,0,color===skin?skinSurface:color===steel||color==='#b49b63'?metalSurface:leatherSurface)
 }
 const limb=(from:THREE.Vector3,to:THREE.Vector3,radius:number,color:string)=>{
  const mid=from.clone().add(to).multiplyScalar(.5),geometry=new THREE.CapsuleGeometry(radius,Math.max(.001,from.distanceTo(to)-radius*2),6,12)
  const m=mesh(geometry,color,mid.x,mid.y,mid.z,color===leather?leatherSurface:{roughness:.85});m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());m.scale.z=bd/bw;return m
 }
 const seam=(points:THREE.Vector3[],color=leather,radius=Math.min(bw,bd)*.006,metal=false)=>mesh(figureTube(points,radius,Math.min(32,Math.max(4,points.length*3))),color,0,0,0,metal?metalSurface:leatherSurface)
 const baseHeight=Math.min(.035,h*.03),baseTop=baseHeight+.00025
 const base=mesh(new THREE.CylinderGeometry(w*.48,w*.49,baseHeight,32),colour,0,baseHeight/2+.00025,0,{metalness:.35,roughness:.55});base.scale.z=d/w
 form('figure-tunic',[[.46,.18,.18],[.475,.195,.195],[.5,.185,.185],[.54,.17,.17],[.6,.18,.18],[.66,.211,.211],[.71,.235,.235],[.75,.218,.218],[.8,.17,.17],[.825,.11,.11]],colour,0,0,0,p=>{
  const fold=(.5+.5*Math.cos(Math.atan2(p.z,p.x)*10))*.009*Math.max(0,1-Math.abs(p.y-.505)/.065),length=Math.hypot(p.x,p.z)
  if(length){p.x*=1+fold/length;p.z*=1+fold/length}
 })
 mesh(reliefPlate(bw*.44,h*.25,bd*.08),steel,0,h*.515,bd*.17,metalSurface)
 seam([new THREE.Vector3(0,h*.53,bd*.252),new THREE.Vector3(0,h*.64,bd*.254),new THREE.Vector3(0,h*.755,bd*.252)],'#b49b63',Math.min(bw,bd)*.005,true)
 const neck=mesh(new THREE.CylinderGeometry(bw*.055,bw*.065,h*.05,20),skin,0,h*.832,0,skinSurface);neck.scale.z=bd/bw
 const collar=mesh(new THREE.TorusGeometry(1,.13,8,32),leather,0,h*.815,0,leatherSurface);collar.rotation.x=Math.PI/2;collar.scale.set(bw*.115,bd*.1,h*.11)
 for(const side of [-1,1]){
  limb(new THREE.Vector3(side*bw*.13,h*.47,0),new THREE.Vector3(side*bw*.13,h*.32,0),bw*.075,cloth)
  limb(new THREE.Vector3(side*bw*.13,h*.31,0),new THREE.Vector3(side*bw*.13,h*.12,0),bw*.062,leather)
  // A rounded toe rolls into the instep and the shaft; the heel and forefoot
  // have separate ground contact, leaving a real arch below the waist.
  form('figure-boot-upper',[[.018,.098,.204,.065],[.028,.102,.204,.065],[.04,.099,.192,.065],[.055,.094,.167,.052],[.073,.087,.13,.025],[.098,.072,.098,0],[.122,.069,.086,-.006],[.134,.075,.09,-.006]],leather,side*.13,baseTop/h)
  form('figure-boot-welt',[[.012,.105,.211,.065],[.018,.108,.215,.065],[.024,.104,.21,.065]],leather,side*.13,baseTop/h)
  form('figure-boot-forefoot',[[.001,.095,.115,.158],[.005,.102,.12,.158],[.014,.103,.121,.158]],leather,side*.13,baseTop/h)
  form('figure-boot-heel',[[.001,.077,.059,-.083],[.005,.082,.065,-.083],[.016,.084,.066,-.083]],leather,side*.13,baseTop/h)
  anatomy('figure-boot-toecap',[[side*.13-.08,baseTop/h+.04,.164],[side*.13,baseTop/h+.047,.192],[side*.13+.08,baseTop/h+.04,.164]],.0035,leather)
  for(let lace=0;lace<4;lace++){
   const y=baseTop/h+.106-lace*.014,z=.097+lace*.026
   anatomy('figure-boot-lacing',[[side*.13-.052,y,z],[side*.13,y-.006,z+.012],[side*.13+.052,y,z]],.0025,'#b49b63',8)
  }
  const bootLip=mesh(new THREE.TorusGeometry(1,.08,6,28),leather,side*bw*.13,baseTop+h*.133,-bd*.006,leatherSurface);bootLip.rotation.x=Math.PI/2;bootLip.scale.set(bw*.071,bd*.086,h*.03)
  const knee=mesh(new THREE.SphereGeometry(bw*.082,16,10),steel,side*bw*.13,h*.315,bd*.065,metalSurface);knee.scale.set(1,.8,bd/bw*.65)
  for(const level of [.352,.379])anatomy('figure-knee-fold',[[side*.13-.052,level-.005,.034],[side*.13,level,.066],[side*.13+.052,level-.006,.034]],.003,cloth)
  limb(new THREE.Vector3(side*bw*.27,h*.75,0),new THREE.Vector3(side*bw*.31,h*.62,bd*.04),bw*.065,colour)
  limb(new THREE.Vector3(side*bw*.31,h*.62,bd*.04),new THREE.Vector3(side*bw*.29,h*.49,bd*.1),bw*.058,cloth)
  const shoulder=mesh(new THREE.SphereGeometry(bw*.105,20,12),steel,side*bw*.265,h*.755,0,metalSurface);shoulder.scale.set(1,.67,bd/bw)
  for(let plate=0;plate<3;plate++){
   const guard=mesh(new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI*.58),steel,side*bw*(.27+plate*.009),h*(.745-plate*.026),0,metalSurface)
   guard.scale.set(bw*(.11-plate*.012),h*.026,bd*(.11-plate*.012));guard.rotation.z=side*.15
  }
  for(const level of [.588,.611])anatomy('figure-elbow-fold',[[side*.26,level-.009,.06],[side*.309,level,.092],[side*.351,level-.006,.056]],.0035,cloth)
  form('figure-bracer',[[.509,.061,.083,.08],[.516,.07,.098,.08],[.535,.067,.094,.08],[.56,.07,.097,.08],[.566,.064,.089,.08]],leather,side*.295)
  form('figure-hand-palm',[[.466,.03,.026,.11],[.475,.043,.035,.109],[.493,.042,.036,.104],[.509,.028,.026,.099],[.516,.024,.023,.098]],skin,side*.29)
  for(let finger=0;finger<4;finger++){
   const x=side*.29+(finger-1.5)*.021,length=[.03,.039,.037,.029][finger]
   anatomy('figure-finger',[[x,.474,.11],[x,.459,.124],[x+side*.001,.474-length,.142]],.008,skin)
   const knuckle=mesh(new THREE.SphereGeometry(1,10,8),skin,x*bw,h*.474,bd*.136,skinSurface);knuckle.scale.set(bw*.009,h*.007,bd*.009)
  }
  anatomy('figure-thumb',[[side*.258,.5,.102],[side*.241,.482,.122],[side*.25,.463,.146]],.012,skin)
  for(const y of [.522,.558]){
   const band=mesh(new THREE.TorusGeometry(1,.065,6,28),steel,side*bw*.295,h*y,bd*.08,metalSurface);band.rotation.x=Math.PI/2;band.scale.set(bw*.068,bd*.096,h*.035)
  }
  // The pinna is a concave bowl with a rolled helix, a back and a small tragus.
  const earGeometry=new THREE.LatheGeometry([[0,.134],[.008,.135],[.016,.147],[.021,.157],[.024,.15],[.025,.14],[.021,.126],[0,.123]].map(([r,x])=>new THREE.Vector2(r,x)).reverse(),24)
  earGeometry.name='figure-ear';earGeometry.rotateZ(-side*Math.PI/2);earGeometry.scale(bw,h,bd*.035/.024)
  mesh(earGeometry,skin,0,h*.89,bd*.015,skinSurface)
  const tragus=mesh(new THREE.SphereGeometry(1,10,8),skin,side*bw*.148,h*.887,bd*.036,skinSurface);tragus.scale.set(bw*.009,h*.009,bd*.012)
 }
 box(bw*.4,h*.035,bd*.43,0,h*.5,0,leather)
 mesh(figureStrap([new THREE.Vector3(-bw*.145,h*.79,bd*.192),new THREE.Vector3(-bw*.1,h*.744,bd*.263),new THREE.Vector3(bw*.01,h*.625,bd*.273),new THREE.Vector3(bw*.12,h*.515,bd*.263)],bw*.035,bd*.012),leather,0,0,0,leatherSurface)
 const strapBuckle=mesh(new THREE.TorusGeometry(1,.16,6,20),'#b49b63',-bw*.055,h*.696,bd*.282,metalSurface);strapBuckle.scale.set(bw*.025,h*.012,bd*.018);strapBuckle.rotation.z=-.47
 const buckle=mesh(new THREE.TorusGeometry(1,.2,6,24),'#b49b63',0,h*.5,bd*.237,metalSurface);buckle.scale.set(bw*.034,h*.013,bd*.025)
 anatomy('figure-buckle-tongue',[[-.026,.5,.243],[0,.5,.25],[.024,.5,.243]],.003,'#b49b63',6)
 for(let stud=0;stud<7;stud++){
  if(stud===3)continue
  const rivet=mesh(new THREE.SphereGeometry(1,10,6),'#b49b63',(stud-3)*bw*.047,h*.5,bd*.221,metalSurface);rivet.scale.set(bw*.008,h*.006,bd*.008)
 }
 form('figure-belt-pouch',[[.431,.047,.034],[.439,.068,.054],[.472,.073,.056],[.493,.059,.044]],leather,-.166,0,.17)
 mesh(reliefPlate(bw*.14,h*.044,bd*.024),leather,-bw*.166,h*.455,bd*.216,leatherSurface)
 const clasp=mesh(new THREE.SphereGeometry(1,10,8),'#b49b63',-bw*.166,h*.468,bd*.24,metalSurface);clasp.scale.set(bw*.009,h*.006,bd*.007)
 form('figure-head',[[.83,.04,.047,.032],[.839,.068,.072,.042],[.85,.091,.092,.043],[.862,.109,.112,.038],[.879,.122,.124,.024],[.894,.125,.126,.022],[.908,.125,.123,.014],[.923,.118,.119,.008],[.94,.098,.1],[.951,.063,.07],[.957,.018,.023]],skin,0,0,0,p=>{
  const front=Math.max(0,(p.z-.02)/.12),side=Math.abs(p.x)/.125
  p.z+=front**3*(.008*Math.exp(-(((p.y-.883)/.013)**2))*Math.exp(-(((side-.55)/.26)**2))-.009*Math.exp(-(((p.y-.906)/.009)**2))*Math.exp(-(((side-.38)/.24)**2)))
 })
 const hair=mesh(sculptedHair(),leather,0,h*.918,bd*.013,{roughness:.94});hair.scale.set(bw*.14,h*.067,bd*.145)
 form('figure-nose',[[.87,.012,.006,.158],[.876,.025,.016,.176],[.884,.027,.025,.18],[.892,.018,.023,.178],[.904,.013,.013,.158],[.916,.009,.006,.146]],skin)
 for(const side of [-1,1]){
  const eye=mesh(new THREE.SphereGeometry(1,16,10),'#393932',side*bw*.048,h*.905,bd*.144,skinSurface);eye.scale.set(bw*.014,h*.0055,bd*.011)
  for(const upper of [true,false])anatomy('figure-eyelid',[[side*.048-.019,.905,.14],[side*.048-.009,upper?.91:.9005,.151],[side*.048+.009,upper?.91:.9005,.151],[side*.048+.019,.905,.14]],.0022,skin)
  anatomy('figure-eyebrow',[[side*.048-.024,.917,.141],[side*.048,.922,.143],[side*.048+.024,.917,.135]],.0032,leather)
  const nostril=mesh(new THREE.SphereGeometry(1,10,8),leather,side*bw*.016,h*.877,bd*.191,leatherSurface);nostril.scale.set(bw*.0045,h*.0018,bd*.0028)
 }
 anatomy('figure-mouth',[[-.038,.865,.142],[-.014,.866,.154],[0,.864,.158],[.014,.866,.154],[.038,.865,.142]],.0018,leather)
 anatomy('figure-lower-lip',[[-.03,.861,.145],[0,.86,.157],[.03,.861,.145]],.0025,skin)
 // A folded, curved cloth surface; its thickness comes from the rim and folds.
 const columns=24,rows=18,positions:number[]=[],uv:number[]=[],indices:number[]=[]
 const clothPoint=(u:number,v:number)=>{const angle=(u-.5)*2.5,radius=bw*(.22+v*.22),fold=Math.cos(u*Math.PI*14)*v*.018;return new THREE.Vector3(Math.sin(angle)*radius,h*(.745-v*.5)+Math.cos(u*Math.PI*6)*v*h*.009,-Math.cos(angle)*bd*(.22+v*.16)-fold*bd)}
 for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
  const v=row/rows,u=col/columns,point=clothPoint(u,v)
  positions.push(point.x,point.y,point.z)
  uv.push(u,v)
 }
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const a=row*(columns+1)+col,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1)}
 const cape=new THREE.BufferGeometry();cape.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));cape.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));cape.setIndex(indices);cape.computeVertexNormals()
 for(const side of [0,1])seam(Array.from({length:19},(_,i)=>clothPoint(side,i/18)))
 seam(Array.from({length:33},(_,i)=>clothPoint(i/32,1)),'#b49b63',Math.min(bw,bd)*.007,true)
 // Short, separated stitches keep the edging from reading as a smooth tube.
 for(let i=0;i<24;i++)seam([clothPoint((i+.25)/24,.965),clothPoint((i+.65)/24,.965)],'#b49b63',Math.min(bw,bd)*.003,true)
 mesh(cape,colour,0,0,0,{roughness:1,doubleSided:true})
 return true
}

export function populateWater(e:RenderEntity,mesh:ModelMesh){
 if(e.geometry.kind!=='water')return false
 const w=e.geometry.width,d=e.geometry.depth,h=Math.max(.035,e.geometry.height),sectors=72,rings=22,positions:number[]=[],uv:number[]=[],indices:number[]=[]
 const shoreline=(angle:number)=>.93+.025*Math.sin(angle*5)+.025*Math.sin(angle*9+1.2)
 for(let ring=0;ring<=rings;ring++)for(let sector=0;sector<=sectors;sector++){
  const a=sector/sectors*Math.PI*2,t=ring/rings,r=t*shoreline(a),x=Math.cos(a)*r*w*.5,z=Math.sin(a)*r*d*.5
  const waves=(Math.sin(x*7+z*4)+Math.sin(x*3-z*8))*.0025*Math.sin(t*Math.PI)
  positions.push(x,Math.min(h*.65,.014)+waves,z);uv.push(x/2,z/2)
 }
 for(let ring=0;ring<rings;ring++)for(let sector=0;sector<sectors;sector++){const a=ring*(sectors+1)+sector,b=a+sectors+1;indices.push(a,a+1,b,a+1,b+1,b)}
 const surface=new THREE.BufferGeometry();surface.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));surface.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));surface.setIndex(indices);surface.computeVertexNormals()
 mesh(surface,'#376d69',0,0,0,{opacity:.76,roughness:.14,metalness:.06,clearcoat:1,castShadow:false,doubleSided:true})
 const bed=surface.clone(),bedPosition=bed.getAttribute('position')
 for(let i=0;i<bedPosition.count;i++)bedPosition.setY(i,.002+.0006*Math.sin(bedPosition.getX(i)*11+bedPosition.getZ(i)*13))
 bed.computeVertexNormals();mesh(bed,'#787258',0,0,0,{texture:'stone',roughness:.98,castShadow:false})
 {
  const points=Array.from({length:72},(_,i)=>{const a=i/72*Math.PI*2,r=shoreline(a)*.985;return new THREE.Vector3(Math.cos(a)*r*w*.5,0,Math.sin(a)*r*d*.5)})
  const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),96,Math.min(w,d)*.006,6,true)
  // Flatten the shoreline cross section to keep a shallow pool shallow.
  geometry.scale(1,Math.min(1,.012/(Math.min(w,d)*.006)),1);geometry.translate(0,Math.min(h*.5,.015),0)
  mesh(geometry,'#a9beb0',0,0,0,{roughness:.9,opacity:.38,castShadow:false})
 }
 const count=Math.max(18,Math.min(48,Math.ceil((w+d)*3))),stoneRadius=Math.min(w,d)*.014
 for(let i=0;i<count;i++){
  const a=i/count*Math.PI*2,r=shoreline(a)*.975,jitter=.7+.3*Math.sin(i*7.31)**2
  const pebble=mesh(new THREE.IcosahedronGeometry(1,1),i%3?'#6c7460':'#a1a08b',Math.cos(a)*r*w*.5,.011,Math.sin(a)*r*d*.5,{roughness:.9,castShadow:false})
  pebble.scale.set(stoneRadius*jitter,.009*jitter,stoneRadius*(.65+.25*Math.cos(i*3.1)**2));pebble.rotation.y=a+i
 }
 return true
}
