import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {ModelMesh,Surface} from './scene3dMeshes'
import type {RenderEntity} from './scene3dModel'
import {tabletopAsset} from './tabletopCatalog.ts'

// Storage models are authored at catalog dimensions. The shared adapter bakes
// every rigid part before applying the object's editable dimensions and facing.
export function populateStorageFurniture(e:RenderEntity,mesh:ModelMesh,low=false):boolean{
 const asset=tabletopAsset(e.geometry.asset)
 if(!asset||!['shelf','chest'].includes(asset.id))return false
 const {width:w,depth:d,height:h}=asset
 const wood:Surface={texture:'wood',roughness:.82,textureStrength:.32,normalStrength:.18}
 const iron:Surface={metalness:.72,roughness:.48},brass:Surface={metalness:.68,roughness:.38}
 const ceramic:Surface={roughness:.76},glaze:Surface={roughness:.29,clearcoat:.18}
 const oak='#87583b',edge='#64432f',board='#b08054',endgrain='#ba9467',metal='#5e5e4f',cream='#c9b386'
 const boxGeometry=(name:string,x:number,y:number,z:number)=>{
  const g=low?new THREE.BoxGeometry(x,y,z):new RoundedBoxGeometry(x,y,z,1,Math.min(x,y,z)*.085);g.name=name;return g
 }
 const box=(name:string,sx:number,sy:number,sz:number,x:number,y:number,z:number,c=oak,s:Surface=wood)=>mesh(boxGeometry(name,sx,sy,sz),c,x,y,z,s)
 const cylinderGeometry=(name:string,r:number,length:number,axis:'x'|'y'|'z'='y')=>{
  const g=new THREE.CylinderGeometry(r,r,length,low?8:16);g.name=name
  if(axis==='x')g.rotateZ(Math.PI/2)
  if(axis==='z')g.rotateX(Math.PI/2)
  return g
 }
 const cylinder=(name:string,r:number,length:number,x:number,y:number,z:number,c=metal,s:Surface=iron,axis:'x'|'y'|'z'='y')=>mesh(cylinderGeometry(name,r,length,axis),c,x,y,z,s)
 const turned=(name:string,profile:number[][],x:number,y:number,z:number,c=cream,s:Surface=ceramic,segments=low?8:18)=>{
  const g=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),segments);g.normalizeNormals();g.name=name;return mesh(g,c,x,y,z,s)
 }
 const ring=(name:string,r:number,t:number,x:number,y:number,z:number,c=metal,s:Surface=iron,axis:'x'|'z'='z')=>{
  const g=new THREE.TorusGeometry(r,t,low?4:6,low?10:18);g.name=name
  if(axis==='x')g.rotateY(Math.PI/2)
  return mesh(g,c,x,y,z,s)
 }
 if(asset.id==='shelf'){
  const post=w*.06,bodyTop=h*.96,levels=[h*.08,h*.36,h*.64,h*.92],slab=h*.021
  for(const side of [-1,1]){
   box('storage-shelf-post',post,bodyTop,d*.92,side*w*.45,bodyTop/2,0,edge)
   const foot=box('storage-shelf-foot',post*1.25,h*.052,d*.95,side*w*.45,h*.026,0,oak)
   foot.geometry.computeBoundingBox();foot.position.y=-foot.geometry.boundingBox!.min.y
   box('storage-shelf-capital',post*1.22,h*.04,d*.96,side*w*.45,bodyTop-h*.02,0,board)
  }
  // Individual back boards have actual narrow gaps, including in the low LOD.
  const backN=low?5:9,backW=w*.88
  for(let i=0;i<backN;i++)box('storage-shelf-back-board',backW/backN*.955,h*.87,d*.043,-backW/2+(i+.5)*backW/backN,h*.47,-d*.447,i%3?oak:edge)
  for(const y of [h*.11,h*.49,h*.86])box('storage-shelf-back-rail',w*.89,h*.032,d*.055,0,y,-d*.448,edge)
  for(const [level,y] of levels.entries()){
   box('storage-shelf-board',w*.93,slab,d*.90,0,y-slab/2,0,board)
   box('storage-shelf-front-edge',w*.93,h*.025,d*.045,0,y-h*.023,d*.435,oak)
   if(level<3)for(const side of [-1,1]){
    const bracketH=Math.min(h*.085,y-slab-.005),bracket=new THREE.Shape();bracket.moveTo(-d*.31,0);bracket.lineTo(d*.30,0);bracket.lineTo(d*.30,-bracketH*.294)
    bracket.quadraticCurveTo(-d*.10,-bracketH*.424,-d*.31,-bracketH);bracket.closePath()
    const g=new THREE.ExtrudeGeometry(bracket,{depth:w*.035,bevelEnabled:false,curveSegments:low?2:5,steps:1});g.name='storage-shelf-bracket';g.rotateY(Math.PI/2)
    mesh(g,edge,side*w*.415-w*.0175,y-slab,0,wood)
   }
   if(!low)for(const side of [-1,1])cylinder('storage-shelf-dowel',d*.018,d*.012,side*w*.45,y-slab*.5,d*.467,endgrain,wood,'z')
  }
  // Layered cornice has a solid sloped profile rather than a picture plane.
  box('storage-shelf-cornice',w-.006,h*.024,d-.008,0,h-h*.017,0,board)
  const molding=new THREE.Shape();molding.moveTo(-d*.026,0);molding.lineTo(d*.026,0);molding.lineTo(d*.026,h*.013);molding.lineTo(d*.010,h*.024);molding.lineTo(-d*.026,h*.025);molding.closePath()
  const cornice=new THREE.ExtrudeGeometry(molding,{depth:w*.97,bevelEnabled:false,steps:1});cornice.name='storage-shelf-cornice-profile';cornice.rotateY(Math.PI/2);cornice.translate(-w*.485,0,0)
  mesh(cornice,oak,0,h*.945,d*.455,wood)
  const cup=(x:number,y:number,z:number,r:number)=>{
   turned('storage-shelf-cup',[[0,0],[r*.67,0],[r*.84,r*.13],[r,r*1.48],[r*.96,r*1.58],[r*.78,r*1.58],[r*.75,r*.22],[0,r*.22]],x,y,z,cream)
   ring('storage-shelf-cup-handle',r*.45,r*.12,x+r*.99,y+r*.83,z,cream,ceramic)
  }
  const plate=(x:number,y:number,z:number,r:number)=>turned('storage-shelf-dish',[[0,0],[r*.59,0],[r*.74,r*.035],[r,r*.15],[r*.98,r*.19],[r*.88,r*.19],[r*.65,r*.075],[0,r*.075]],x,y,z,cream,ceramic,low?8:20)
  const bottle=(x:number,y:number,z:number,r:number,tint:string)=>{
   turned('storage-shelf-bottle',[[0,0],[r*.72,0],[r*.95,r*.12],[r,r*.65],[r,r*2.45],[r*.9,r*2.75],[r*.43,r*3.15],[r*.36,r*3.35],[r*.36,r*4.1],[r*.46,r*4.15],[r*.46,r*4.3],[0,r*4.3]],x,y,z,tint,glaze,low?8:16)
   cylinder('storage-shelf-bottle-stopper',r*.33,r*.27,x,y+r*4.4,z,endgrain,wood)
  }
  const jug=(x:number,y:number,z:number,r:number)=>{
   const j=r*3.2
   turned('storage-shelf-jug',[[0,0],[r*.55,0],[r*.86,j*.08],[r,j*.32],[r*.9,j*.55],[r*.5,j*.7],[r*.42,j*.94],[r*.53,j*.98],[r*.52,j],[r*.30,j],[r*.31,j*.76],[r*.73,j*.5],[r*.82,j*.3],[r*.66,j*.15],[0,j*.15]],x,y,z,'#ac865a',ceramic,low?8:18)
   ring('storage-shelf-jug-handle',r*.74,r*.14,x+r*.75,y+j*.53,z,'#ac865a',ceramic)
   // An annular spout has an actual bore and closed wall thickness.
   const g=new THREE.LatheGeometry([[r*.24,0],[r*.22,j*.35],[r*.14,j*.35],[r*.15,0],[r*.24,0]].map(([a,b])=>new THREE.Vector2(a,b)),low?8:12);g.normalizeNormals();g.name='storage-shelf-jug-spout'
   const part=mesh(g,'#ac865a',x-r*.64,y+j*.53,z,ceramic);part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-.65,.76,0).normalize())
  }
  for(let row=0;row<3;row++){
   const columns=low?3:4
   for(let col=0;col<columns;col++){
    const x=(col-(columns-1)/2)*w*.205,y=levels[row],z=col%2?d*.04:-d*.035,kind=(row+col)%4,r=Math.min(d*.14,.061)
    if(kind===0)cup(x,y,z,r)
    else if(kind===1)jug(x,y,z,r*.94)
    else if(kind===2)bottle(x,y,z,r*.83,(row+col)%2?'#64816b':'#77684f')
    else for(let i=0;i<(low?2:3);i++)plate(x,y+i*r*.24,z,r*1.3)
   }
  }
  return true
 }
 // A complete opening arc is reserved inside the saved closed dimensions.
 // The lid covers the inner rim when shut and is a rigid 30-degree rotation.
 const bodyW=w*.94,bodyD=d*.88,wall=Math.min(w,d)*.052,floor=h*.075,bodyTop=h*.56,lidSpan=d*.80,lidW=w*.96,thickness=h*.025,arch=h*.14
 const hinge=new THREE.Vector3(0,bodyTop+thickness,-lidSpan/2),angle=e.geometry.open?-Math.PI/6:0,rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),angle)
 const lidSolid=(g:THREE.BufferGeometry,c:string,x=0,y=0,z=0,s:Surface=wood)=>{
  const position=new THREE.Vector3(x,y,z).applyQuaternion(rotation).add(hinge),part=mesh(g,c,position.x,position.y,position.z,s);part.quaternion.copy(rotation);return part
 }
 const floorPart=box('storage-chest-floor',bodyW,floor,bodyD,0,floor/2,0,edge)
 floorPart.geometry.computeBoundingBox();floorPart.position.y=-floorPart.geometry.boundingBox!.min.y
 for(const side of [-1,1]){
  box('storage-chest-long-wall',bodyW,bodyTop-floor,wall,0,(bodyTop+floor)/2,side*(bodyD-wall)/2,oak)
  box('storage-chest-end-wall',wall,bodyTop-floor,bodyD-wall*2,side*(bodyW-wall)/2,(bodyTop+floor)/2,0,oak)
  const liner=Math.min(w,d)*.006
  box('storage-chest-inner-wall',bodyW-wall*2,bodyTop-floor-h*.018,liner,0,(bodyTop+floor-h*.018)/2,side*(bodyD/2-wall-liner/2),'#514332')
  box('storage-chest-inner-end',liner,bodyTop-floor-h*.018,bodyD-wall*2,side*(bodyW/2-wall-liner/2),(bodyTop+floor-h*.018)/2,0,'#514332')
  for(const y of [floor+h*.025,bodyTop-h*.026])box('storage-chest-body-band',bodyW*.99,h*.033,d*.016,0,y,side*(bodyD/2+d*.006),metal,iron)
  for(const x of [-w*.31,w*.31]){
   box('storage-chest-body-strap',w*.043,bodyTop-floor,d*.016,x,(bodyTop+floor)/2,side*(bodyD/2+d*.006),metal,iron)
   if(!low)for(const y of [floor+h*.04,bodyTop-h*.045])cylinder('storage-chest-body-rivet',w*.006,d*.008,x,y,side*(bodyD/2+d*.017),endgrain,iron,'z')
  }
  if(!low){
   const count=6,visibleHeight=bodyTop-floor-h*.045
   for(let i=0;i<count;i++)box('storage-chest-face-board',bodyW/count*.978,visibleHeight,d*.008,-bodyW/2+(i+.5)*bodyW/count,(bodyTop+floor)/2,side*(bodyD/2+d*.003),i%2?board:oak)
  }
  for(const z of [-bodyD*.38,bodyD*.38])box('storage-chest-corner-iron',w*.022,bodyTop-floor,d*.045,side*(bodyW/2+w*.005),(bodyTop+floor)/2,z,metal,iron)
  ring('storage-chest-side-handle',h*.073,h*.011,side*(bodyW/2+w*.006),bodyTop*.56,0,metal,iron,'x')
  for(const z of [-h*.072,h*.072])cylinder('storage-chest-handle-pin',h*.017,w*.012,side*(bodyW/2+w*.006),bodyTop*.56,z,endgrain,iron,'x')
 }
 box('storage-chest-interior-floor',bodyW-wall*2,floor*.15,bodyD-wall*2,0,floor+floor*.075,0,'#423b2d')
 const lidProfile=(name:string,width:number,lift=0,skin=thickness)=>{
  const steps=low?6:18,shape=new THREE.Shape();shape.moveTo(0,lift)
  for(let i=1;i<=steps;i++){const u=i/steps;shape.lineTo(lidSpan*u,lift+arch*Math.sin(u*Math.PI))}
  for(let i=steps;i>=0;i--){const u=i/steps;shape.lineTo(lidSpan*u,lift+arch*Math.sin(u*Math.PI)-skin)}shape.closePath()
  const g=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,steps:1});g.name=name;g.rotateY(-Math.PI/2);g.translate(width/2,0,0);return g
 }
 const boards=low?3:7
 for(let i=0;i<boards;i++)lidSolid(lidProfile('storage-chest-lid-board',lidW/boards*.992),i%2?board:oak,-lidW/2+(i+.5)*lidW/boards)
 for(const x of [-w*.31,w*.31]){
  lidSolid(lidProfile('storage-chest-lid-strap',w*.043,h*.006,h*.010),metal,x,0,0,iron)
  cylinder('storage-chest-hinge-pin',h*.016,w*.105,x,hinge.y,hinge.z,metal,iron,'x')
  if(!low)for(const u of [.08,.35,.65,.92]){
   const slope=arch*Math.PI/lidSpan*Math.cos(u*Math.PI),normal=new THREE.Vector3(0,1,-slope).normalize(),g=cylinderGeometry('storage-chest-lid-rivet',w*.006,d*.006)
   g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal))
   lidSolid(g,endgrain,x,arch*Math.sin(u*Math.PI)+h*.008+normal.y*d*.003,lidSpan*u+normal.z*d*.003,iron)
  }
 }
 // The hasp follows the lid; the keeper and optional padlock remain on the body.
 lidSolid(boxGeometry('storage-chest-lid-hasp',w*.075,h*.115,d*.016),metal,0,-h*.048,lidSpan+d*.005,iron)
 box('storage-chest-lock-keeper',w*.10,h*.13,d*.015,0,bodyTop-h*.07,bodyD/2+d*.008,metal,iron)
 if(e.geometry.locked&&!e.geometry.open){
  const size=w*.075,shape=new THREE.Shape(),r=size*.12,half=size*.5,hh=size*.46
  shape.moveTo(-half+r,-hh);shape.lineTo(half-r,-hh);shape.quadraticCurveTo(half,-hh,half,-hh+r);shape.lineTo(half,hh-r);shape.quadraticCurveTo(half,hh,half-r,hh);shape.lineTo(-half+r,hh);shape.quadraticCurveTo(-half,hh,-half,hh-r);shape.lineTo(-half,-hh+r);shape.quadraticCurveTo(-half,-hh,-half+r,-hh);shape.closePath()
  const hole=new THREE.Path(),key=size*.10;hole.moveTo(key*.5,-key*2)
  hole.lineTo(key*.5,-key*Math.sqrt(.75))
  for(let i=0;i<=18;i++){const a=-Math.PI/3+i/18*Math.PI*5/3;hole.lineTo(Math.cos(a)*key,Math.sin(a)*key)}
  hole.lineTo(-key*.5,-key*2);hole.closePath();shape.holes.push(hole)
  const g=new THREE.ExtrudeGeometry(shape,{depth:d*.028,bevelEnabled:false,curveSegments:low?3:6,steps:1});g.name='storage-chest-padlock'
  const y=bodyTop-h*.13,z=bodyD/2+d*.010
  mesh(g,'#b3985f',0,y,z,brass)
  ring('storage-chest-padlock-shackle',size*.32,size*.065,0,y+size*.57,z+d*.011,'#b3985f',brass)
 }
 return true
}
