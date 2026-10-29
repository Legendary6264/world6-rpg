import * as THREE from 'three'
import {legacyAsset} from './legacyAssets.ts'
import {legacyKit} from './scene3dLegacyKit.ts'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'

// The old rock artwork includes geological specimens, monuments and coastal
// props. Each gets its own solid silhouette; colour never substitutes for a
// tunnel, eye, pore or bowl opening.
export function populateLegacyMinerals(e:RenderEntity,output:ModelMesh,low=false):boolean{
 const asset=legacyAsset(e.geometry)
 if(!asset||asset.group!=='mineral'||asset.native)return false
 const emitted:THREE.Mesh[]=[]
 const k=legacyKit(e,(...args)=>{const p=output(...args);emitted.push(p);return p},low),{mesh,box,ellipsoid,cylinder,beam,ring,extrude,tube,stone,iron,finish}=k
 const metal:Surface={metalness:.72,roughness:.4},crystalSurface:Surface={metalness:.12,roughness:.25,opacity:.96},bone:Surface={roughness:.86}
 const hash=(i:number,s=0)=>Math.sin(i*7.391+s*4.173)*.5+.5
 const data=(name:string,vertices:number[],indices:number[],color:string,surface:Surface,x=0,y=0,z=0)=>{
  // Every custom surface is capped and has one consistent outward winding.
  let volume=0
  for(let i=0;i<indices.length;i+=3){const a=new THREE.Vector3().fromArray(vertices,indices[i]*3),b=new THREE.Vector3().fromArray(vertices,indices[i+1]*3),c=new THREE.Vector3().fromArray(vertices,indices[i+2]*3);volume+=a.dot(b.cross(c))}
  if(volume<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]]
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(vertices.flatMap((_,i)=>i%3===0?[vertices[i],vertices[i+2]]:[]),2));g.setIndex(indices)
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();flat.name=name;return mesh(flat,color,x,y,z,surface)
 }
 const loft=(name:string,profile:number[][],n:number,x:number,y:number,z:number,color:string,surface:Surface=stone,seed=0,rough=.035)=>{
  const vertices:number[]=[],indices:number[]=[],rings:number[][]=[]
  for(let j=0;j<profile.length;j++){
   const [r,h]=profile[j],row:number[]=[]
   for(let i=0;i<(r? n:1);i++){
    const a=i/n*Math.PI*2,noise=1+rough*(hash(i+j*.3,seed)-.5)*2
    row.push(vertices.length/3);vertices.push(Math.cos(a)*r*noise,h+(r?rough*.12*(hash(i+9*j,seed)-.5):0),Math.sin(a)*r*noise)
   }
   rings.push(row)
  }
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){
   const a=rings[j][i%rings[j].length],b=rings[j][(i+1)%rings[j].length],c=rings[j+1][i%rings[j+1].length],d=rings[j+1][(i+1)%rings[j+1].length]
   if(a!==b)indices.push(a,c,b)
   if(c!==d)indices.push(b,c,d)
  }
  return data(name,vertices,indices,color,surface,x,y,z)
 }
 const lathe=(name:string,profile:number[][],x:number,y:number,z:number,color:string,surface:Surface=stone)=>loft(name,profile,low?8:18,x,y,z,color,surface,0,0)
 const rock=(name:string,rx:number,ry:number,rz:number,x:number,y:number,z:number,color='#777a78',seed=0,surface:Surface=stone)=>{
  const p=loft(name,[[0,-.9],[.58,-.88],[.91,-.48],[1,.08],[.77,.66],[.36,.88],[0,.91]],low?7:11,x,y,z,color,surface,seed,.18);p.scale.set(rx,ry,rz);p.rotation.y=seed*.33;return p
 }
 const shard=(name:string,r:number,h:number,x:number,y:number,z:number,color:string,tilt=0,seed=0,n=6,surface:Surface=crystalSurface)=>{
  const p=loft(name,[[0,0],[r*.8,.015],[r,h*.18],[r*.92,h*.72],[0,h]],n,x,y,z,color,surface,seed,.025);p.rotation.z=tilt;p.rotation.y=seed*.41;return p
 }
 const shaped=(name:string,points:number[][],holes:number[][][],depth:number,x:number,y:number,z:number,color:string,surface:Surface=stone,bevel=0)=>{
  const shape=new THREE.Shape();points.forEach(([u,v],i)=>i?shape.lineTo(u,v):shape.moveTo(u,v));shape.closePath()
  for(const polygon of holes){const points=THREE.ShapeUtils.isClockWise(polygon.map(([u,v])=>new THREE.Vector2(u,v)))?[...polygon].reverse():polygon,path=new THREE.Path();points.forEach(([u,v],i)=>i?path.lineTo(u,v):path.moveTo(u,v));path.closePath();shape.holes.push(path)}
  const g=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:!!bevel&&!low,bevelSegments:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:low?2:5});g.translate(0,0,-depth/2);g.name=name;return mesh(g,color,x,y,z,surface)
 }
 const circle=(x:number,y:number,r:number,n=low?7:12)=>Array.from({length:n},(_,i)=>[x+Math.cos(i/n*Math.PI*2)*r,y+Math.sin(i/n*Math.PI*2)*r])
 const archPoints=[[-.55,0],[-.56,.27],[-.49,.62],[-.32,.9],[-.11,.99],[.15,.98],[.34,.87],[.5,.65],[.57,.3],[.56,0],[.31,0],[.3,.26],[.24,.5],[.13,.66],[-.01,.71],[-.15,.65],[-.25,.47],[-.3,.24],[-.31,0]]
 const spike=(name:string,r:number,h:number,x:number,y:number,z:number,color:string,seed=0,down=false)=>{
  const p=loft(name,[[0,0],[r,0],[r*.84,h*.12],[r*.68,h*.3],[r*.57,h*.43],[r*.33,h*.67],[r*.19,h*.82],[0,h]],low?6:9,x,y,z,color,stone,seed,.14);if(down)p.rotation.z=Math.PI;return p
 }
 const cappedCurve=(name:string,points:THREE.Vector3[],radius:number,color:string,surface:Surface=bone,segments=low?24:52)=>{
  const curve=new THREE.CatmullRomCurve3(points),radial=low?5:7,g=new THREE.TubeGeometry(curve,segments,radius,radial,false),p=g.attributes.position,v=Array.from(p.array),uv=Array.from(g.attributes.uv.array),idx=Array.from(g.index!.array)
  for(let side=0;side<2;side++){
   const c=curve.getPointAt(side),normal=curve.getTangentAt(side).multiplyScalar(side?1:-1),start=side?segments*(radial+1):0,center=v.length/3;v.push(c.x,c.y,c.z);uv.push(.5,.5)
   for(let i=0;i<radial;i++){const a=start+i,b=a+1,va=new THREE.Vector3().fromArray(v,a*3).sub(c),vb=new THREE.Vector3().fromArray(v,b*3).sub(c);idx.push(...(va.cross(vb).dot(normal)>0?[center,a,b]:[center,b,a]))}
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();g.name=name;return mesh(g,color,0,0,0,surface)
 }
 const shell=(x:number,y:number,z:number,size:number,turn:number,color:string)=>{
  // A thick, domed scallop fan with alternating raised radial ribs.
  const n=low?12:24,rows=3,v:number[]=[],idx:number[]=[],top:number[][]=[],bottom:number[][]=[]
  for(let side=0;side<2;side++)for(let j=0;j<=rows;j++){
   const row:number[]=[],count=j?n+1:1,r=j/rows
   for(let i=0;i<count;i++){
    const a=(i/n*2-1)*1.32,edge=1+(j===rows?.035*Math.cos(i*Math.PI):0),h=.1*Math.sin(r*Math.PI*.85)+.012*(i%2?0:1)*Math.sin(r*Math.PI/2)
    row.push(v.length/3);v.push(Math.sin(a)*r*.25*edge,side?h-.026:h,Math.cos(a)*r*.31*edge)
   }
   ;(side?bottom:top).push(row)
  }
  for(let side=0;side<2;side++){const rowsForSide=side?bottom:top
   for(let j=0;j<rows;j++)for(let i=0;i<n;i++){
    const a=rowsForSide[j][j?i:0],b=rowsForSide[j][j?i+1:0],c=rowsForSide[j+1][i],d=rowsForSide[j+1][i+1],face=j?[a,c,b,b,c,d]:[a,c,d]
    if(side)for(let q=0;q<face.length;q+=3)[face[q+1],face[q+2]]=[face[q+2],face[q+1]]
    idx.push(...face)
   }
  }
  const connect=(a:number,b:number,c:number,d:number)=>idx.push(a,c,b,b,c,d)
  for(let i=0;i<n;i++)connect(top[rows][i],top[rows][i+1],bottom[rows][i],bottom[rows][i+1])
  for(let j=0;j<rows;j++){connect(top[j][0],top[j+1][0],bottom[j][0],bottom[j+1][0]);connect(top[j+1].at(-1)!,top[j].at(-1)!,bottom[j+1].at(-1)!,bottom[j].at(-1)!)}
  const p=data('mineral-scallop-shell',v,idx,color,bone,x,y,z);p.scale.setScalar(size);p.rotation.y=turn;return p
 }
 switch(asset.slug){
 case 'boulder':{
  rock('mineral-boulder-mass',.53,.5,.43,0,.46,0,'#7b8083',2)
  rock('mineral-boulder-sheared-face',.29,.29,.2,-.26,.26,.26,'#929594',8)
  rock('mineral-boulder-ground-chip',.12,.09,.15,.4,.07,-.17,'#656e72',11)
  break
 }
 case 'flat-rock':{
  rock('mineral-flat-lower-slab',.54,.12,.44,0,.11,0,'#71797c',4)
  rock('mineral-flat-upper-slab',.46,.105,.4,-.04,.27,-.015,'#929997',8)
  rock('mineral-flat-broken-corner',.15,.055,.14,.35,.19,.24,'#596466',12)
  break
 }
 case 'rock-pile':{
  const p=[[-.32,.15,-.18,.26,.18,.23],[.24,.16,-.21,.31,.21,.24],[-.3,.13,.24,.25,.17,.22],[.24,.14,.25,.3,.18,.26],[.02,.33,.02,.35,.28,.3],[-.19,.55,.02,.22,.19,.2],[.19,.52,-.04,.24,.22,.22],[.06,.73,.01,.19,.17,.18]]
  p.slice(0,low?6:8).forEach(([x,y,z,rx,ry,rz],i)=>rock('mineral-piled-stone-'+i,rx,ry,rz,x,y,z,['#6e7779','#8b918e','#646c71'][i%3],i+1));break
 }
 case 'ore-iron':{
  rock('mineral-iron-host',.5,.37,.4,0,.34,0,'#515659',5)
  for(let i=0;i<(low?4:7);i++){const a=i*2.4;rock('mineral-hematite-nodule',.12,.08+.025*(i%2),.1,Math.cos(a)*.33,.43+Math.sin(i)*.15,Math.sin(a)*.24,i%2?'#9d6651':'#805344',i+7,metal)}
  for(let i=0;i<3;i++)beam('mineral-iron-rust-vein',[-.3+i*.2,.28+i*.05,.33],[-.19+i*.18,.51+i*.05,.29],.017,'#b37c53',stone)
  break
 }
 case 'ore-copper':{
  rock('mineral-copper-host',.49,.34,.42,0,.31,0,'#53625c',9)
  for(let i=0;i<(low?4:8);i++){const a=i*2.25;shard('mineral-copper-crust',.075+.015*(i%3),.11,Math.cos(a)*.32,.43+Math.sin(i*.8)*.12,Math.sin(a)*.25,i%3?'#58a497':'#c58a59',i*.2,i,5,i%3?stone:metal)}
  tube('mineral-malachite-seam',[[-.36,.31,.27],[-.15,.42,.31],[.01,.37,.34],[.21,.5,.24],[.36,.46,.14]],.025,'#5aa899',stone)
  break
 }
 case 'ore-gold':{
  rock('mineral-gold-left-host',.29,.32,.37,-.22,.29,0,'#77736a',14)
  rock('mineral-gold-right-host',.3,.4,.35,.21,.37,-.03,'#686966',18)
  extrude('mineral-gold-jagged-lode',[[-.12,.02],[-.06,.23],[-.13,.37],[-.01,.48],[-.05,.66],[.06,.7],[.12,.55],[.04,.4],[.13,.23],[.07,.07]],.43,0,.04,.05,'#d8ab47',metal)
  for(let i=0;i<(low?3:5);i++)shard('mineral-exposed-gold-nugget',.065,.12,-.16+i*.075,.35+hash(i)*.29,.3,'#e9bd56',.2-i*.1,i,4,metal)
  break
 }
 case 'meteorite':{
  const n=low?14:26,rows=low?8:16,v:number[]=[],idx:number[]=[],loops:number[][]=[]
  const craters=[[.7,.7,.25,.21],[-.6,.65,.4,.18],[.1,.55,.85,.22],[.6,-.1,.7,.15],[-.8,.1,.35,.13]]
  for(let j=0;j<=rows;j++){
   const row:number[]=[],p=j/rows*Math.PI
   for(let i=0;i<(j===0||j===rows?1:n);i++){
    const a=i/n*Math.PI*2,dir=new THREE.Vector3(Math.sin(p)*Math.cos(a),Math.cos(p),Math.sin(p)*Math.sin(a));let r=1+.055*Math.sin(a*5+p*7)
    for(const [cx,cy,cz,depth] of craters){const q=new THREE.Vector3(cx,cy,cz).normalize(),dist=dir.distanceTo(q);r-=depth*Math.exp(-dist*dist/.035)}
    row.push(v.length/3);v.push(dir.x*r*.46,dir.y*r*.43,dir.z*r*.42)
   }loops.push(row)
  }
  for(let j=0;j<rows;j++)for(let i=0;i<n;i++){const a=loops[j][i%loops[j].length],b=loops[j][(i+1)%loops[j].length],c=loops[j+1][i%loops[j+1].length],d=loops[j+1][(i+1)%loops[j+1].length];if(a!==b)idx.push(a,c,b);if(c!==d)idx.push(b,c,d)}
  data('mineral-cratered-meteorite',v,idx,'#434b50',metal,0,.45,0)
  rock('mineral-meteorite-fusion-crust',.17,.1,.15,.27,.12,-.25,'#68605a',4,metal);break
 }
 case 'crystal-cluster':{
  rock('mineral-crystal-bed',.41,.1,.34,0,.08,0,'#696275',4)
  const p=[[0,.02,0,.14,.86,.08],[-.26,.05,.1,.11,.57,.3],[.23,.03,.07,.12,.65,-.32],[-.15,.04,-.2,.1,.7,.14],[.14,.06,-.21,.085,.48,-.18],[.03,.07,.25,.09,.42,-.15],[-.31,.05,-.16,.065,.35,.43]]
  p.slice(0,low?4:7).forEach(([x,y,z,r,h,t],i)=>shard('mineral-amethyst-prism',r,h,x,y,z,['#9986c3','#b8a2d8','#7966aa'][i%3],t,i));break
 }
 case 'ice-spire':{
  rock('mineral-ice-foot',.36,.12,.3,0,.1,0,'#b6d7df',3,crystalSurface)
  shard('mineral-ice-main-spire',.19,1.08,-.03,.03,0,'#b9e3ef',-.075,1,5)
  shard('mineral-ice-split-spire',.115,.74,.21,.04,-.04,'#83bfd5',-.24,3,5)
  shard('mineral-ice-front-spire',.11,.48,-.21,.06,.17,'#d5f0f3',.34,7,5)
  if(!low)shard('mineral-ice-broken-shard',.075,.35,.1,.08,.24,'#99cddf',-.44,9,5);break
 }
 case 'stalagmites':case 'stalactites':{
  const down=asset.slug==='stalactites',p=[[-.22,0,.12,.18,.87],[.13,0,-.1,.22,1.06],[.31,0,.2,.11,.57],[-.25,0,-.22,.13,.65],[.03,0,.27,.1,.47]]
  rock(down?'mineral-cave-ceiling':'mineral-cave-floor',.48,.07,.4,0,down?1.03:.04,0,'#78786d',3)
  p.slice(0,low?3:5).forEach(([x,,z,r,h],i)=>spike(down?'mineral-hanging-stalactite':'mineral-rising-stalagmite',r,h,x,down?1.02:.06,z,i%2?'#aaa78c':'#92907c',i+2,down));break
 }
 case 'geode':{
  lathe('mineral-geode-stone-bowl',[[0,0],[.3,.015],[.47,.12],[.56,.36],[.51,.59],[.43,.61],[.38,.48],[.29,.26],[0,.19]],0,0,0,'#696a71',stone)
  lathe('mineral-geode-amethyst-lining',[[0,.193],[.28,.263],[.37,.48],[.432,.601],[.411,.598],[.35,.48],[.265,.284],[0,.217]],0,0,0,'#8c6cba',crystalSurface)
  ring('mineral-geode-white-rind',.447,.026,0,.586,0,'#cbc6cf',stone)
  for(let i=0;i<(low?7:14);i++){const a=i/(low?7:14)*Math.PI*2,r=.36;shard('mineral-geode-inward-crystal',.045,.12+(i%3)*.035,Math.cos(a)*r,.37,Math.sin(a)*r,['#a68acb','#b9a1dc','#8062ab'][i%3],-Math.cos(a)*.4,i,5)}
  break
 }
 case 'fossil':{
  rock('mineral-fossil-split-slab',.53,.105,.43,0,.11,0,'#a49a7c',6)
  const pts=Array.from({length:low?35:75},(_,i)=>{const a=i/(low?34:74)*Math.PI*4.5,r=.025+i/(low?34:74)*.3;return new THREE.Vector3(Math.cos(a)*r,.22+Math.sin(i*.4)*.002,Math.sin(a)*r*.86)})
  cappedCurve('mineral-ammonite-fossil-coil',pts,.027,'#d5c7a4')
  for(let i=0;i<(low?9:18);i++){const a=i/(low?8:17)*Math.PI*3.1+2,r=.025+(a/(Math.PI*4.5))*.3;beam('mineral-ammonite-growth-rib',[Math.cos(a)*(r-.029),.231,Math.sin(a)*(r-.029)*.86],[Math.cos(a)*(r+.035),.231,Math.sin(a)*(r+.035)*.86],.008,'#8c7d60',bone)}
  break
 }
 case 'bones':{
  const ivory='#d2c8a9',dark='#b2a58a'
  const skull=shaped('mineral-skull-open-eye-sockets',[[-.12,-.1],[-.16,.02],[-.13,.13],[-.06,.18],[.07,.18],[.14,.12],[.15,.01],[.1,-.1],[.05,-.14],[-.05,-.14]],[circle(-.062,.04,.036),circle(.062,.04,.036),[[-.015,-.035],[0,.002],[.018,-.035]]],.11,0,.08,-.4,ivory,bone);skull.rotation.x=-Math.PI/2
  beam('mineral-skeleton-spine',[0,.09,-.25],[0,.1,.28],.025,ivory,bone)
  for(let i=0;i<(low?4:6);i++)for(const side of [-1,1])tube('mineral-curved-rib',[[0,.14,-.19+i*.06],[side*.13,.18,-.21+i*.06],[side*.2,.11,-.14+i*.06],[side*.12,.035,-.1+i*.06]],.015,ivory,bone)
  for(const s of [-1,1]){
   tube('mineral-pelvic-bone',[[0,.08,.23],[s*.13,.07,.22],[s*.16,.06,.33],[s*.07,.07,.35]],.028,dark,bone)
   beam('mineral-scattered-leg-bone',[s*.14,.06,.35],[s*.3,.04,.62],.027,ivory,bone)
   for(const [x,z] of [[s*.14,.35],[s*.3,.62]])ellipsoid('mineral-bone-joint',.043,.034,.036,x,.06,z,ivory,bone)
   beam('mineral-scattered-arm-bone',[s*.23,.04,-.17],[s*.39,.035,.06],.022,ivory,bone)
  }
  break
 }
 case 'lava-rock':{
  const hot:Surface={roughness:.72,emissive:'#ec5b14'}
  extrude('mineral-lava-exposed-fissure',[[-.4,0],[.38,0],[.29,.22],[.08,.31],[-.13,.24],[-.38,.27]],.54,0,.025,0,'#f07820',hot)
  rock('mineral-lava-crust-left',.29,.38,.33,-.24,.35,.03,'#3d3c3b',2)
  rock('mineral-lava-crust-right',.28,.35,.31,.25,.32,0,'#444340',8)
  rock('mineral-lava-crust-back',.25,.34,.23,.02,.39,-.25,'#55504a',13)
  tube('mineral-lava-glowing-crack',[[-.03,.25,.28],[-.08,.41,.22],[0,.53,.19],[.04,.66,.06]],.017,'#ffab35',hot);break
 }
 case 'rune-stone':{
  extrude('mineral-rune-menhir',[[-.34,0],[-.39,.16],[-.3,.7],[-.23,.96],[.01,1.04],[.22,.91],[.3,.6],[.33,.14],[.24,0]],.29,0,0,0,'#666f70',stone)
  rock('mineral-rune-foot-chip',.13,.08,.14,.27,.06,.1,'#7b8280',5)
  const glow:Surface={roughness:.75,emissive:'#426e9f'}
  const lines=[[[-.07,.35],[.08,.7]],[[-.07,.35],[-.15,.52]],[[.08,.7],[.16,.51]],[[-.13,.69],[.09,.58]],[[-.1,.83],[.11,.83]]]
  lines.forEach(([a,b])=>beam('mineral-raised-rune',a.concat(.155),b.concat(.155),.012,'#7babbf',glow));break
 }
 case 'broken-column':{
  cylinder('mineral-column-square-step',.39,.42,.1,0,.05,0,'#a4a49a',stone,4)
  cylinder('mineral-column-round-plinth',.31,.34,.13,0,.16,0,'#c2c0af',stone,low?10:18)
  const n=low?12:24,v:number[]=[],idx:number[]=[],rows:number[][]=[]
  for(let j=0;j<4;j++){const row:number[]=[];for(let i=0;i<n;i++){const a=i/n*Math.PI*2,r=(j===0?.27:.25)*(1+(i%2?.02:-.055));row.push(v.length/3);v.push(Math.cos(a)*r,j===3?.77+.09*Math.sin(a*2+1)+.04*Math.cos(a*5):[.22,.28,.67][j],Math.sin(a)*r)}rows.push(row)}
  v.push(0,.22,0,0,.77,0);const base=v.length/3-2,top=base+1
  for(let j=0;j<3;j++)for(let i=0;i<n;i++){const a=rows[j][i],b=rows[j][(i+1)%n],c=rows[j+1][i],d=rows[j+1][(i+1)%n];idx.push(a,c,b,b,c,d)}
  for(let i=0;i<n;i++)idx.push(base,rows[0][i],rows[0][(i+1)%n],top,rows[3][(i+1)%n],rows[3][i])
  data('mineral-fluted-fractured-shaft',v,idx,'#b6b6a6',stone)
  rock('mineral-column-fallen-chip',.16,.1,.13,.35,.085,.25,'#a7a897',9);break
 }
 case 'obelisk':{
  box('mineral-obelisk-plinth',.64,.1,.6,0,.05,0,'#707674',stone,.03)
  box('mineral-obelisk-upper-step',.43,.08,.4,0,.14,0,'#8b9088',stone,.02)
  const p=loft('mineral-obelisk-taper',[[0,.17],[.23,.17],[.17,.85],[0,1.07]],4,0,0,0,'#9b9e91',stone,0,0);p.rotation.y=Math.PI/4
  for(let i=0;i<4;i++){const y=.34+i*.105;beam('mineral-obelisk-carved-glyph',[-.045,y,.151],[.025,y+.04,.151],.007,'#626f6d',stone);if(!low)beam('mineral-obelisk-glyph-stem',[.025,y+.04,.151],[.025,y-.02,.151],.007,'#626f6d',stone)}
  break
 }
 case 'statue':{
  cylinder('mineral-statue-pedestal',.33,.37,.13,0,.065,0,'#777e79',stone,8)
  loft('mineral-statue-pleated-robe',[[0,.15],[.26,.15],[.2,.38],[.135,.68],[.17,.72],[0,.74]],low?8:16,0,0,0,'#a2a69c',stone,2,.07)
  ellipsoid('mineral-statue-shoulders',.23,.1,.125,0,.71,0,'#acafa3',stone)
  ellipsoid('mineral-statue-head',.11,.15,.105,0,.91,0,'#b8bbad',stone)
  extrude('mineral-statue-nose',[[-.018,0],[.02,0],[.012,.075]],.055,0,.865,.107,'#b0b5a9',stone)
  for(const s of [-1,1]){beam('mineral-statue-upper-arm',[s*.19,.72,0],[s*.25,.51,.05],.06,'#a7ab9e',stone);beam('mineral-statue-forearm',[s*.25,.51,.05],[s*.14,.57,.14],.048,'#b3b6a8',stone)}
  beam('mineral-statue-staff',[-.24,.16,.12],[-.24,.87,.12],.018,'#7d857d',stone)
  if(!low)for(let i=0;i<4;i++)beam('mineral-statue-robe-fold',[(-.15+i*.1),.2,.19],[(-.08+i*.05),.59,.12],.012,'#8c958c',stone)
  break
 }
 case 'gravestone':{
  rock('mineral-grave-footing',.43,.07,.25,0,.06,0,'#85897e',8)
  const points=[[-.29,.07],[-.29,.65],...Array.from({length:low?7:13},(_,i)=>{const a=Math.PI-i/(low?6:12)*Math.PI;return [Math.cos(a)*.29,.65+Math.sin(a)*.29]}),[.29,.07]]
  const cross=[[-.025,.63],[-.025,.74],[-.09,.74],[-.09,.79],[-.025,.79],[-.025,.87],[.025,.87],[.025,.79],[.09,.79],[.09,.74],[.025,.74],[.025,.63]]
  shaped('mineral-gravestone-cut-cross',points,[cross],.14,0,0,0,'#a5aaa0',stone,.012)
  for(let i=0;i<3;i++)box('mineral-grave-epitaph',.25-i*.035,.012,.008,0,.5-i*.065,.075,'#7a827b',stone,0)
  break
 }
 case 'cross-marker':{
  extrude('mineral-stone-cross',[[-.085,0],[-.08,.58],[-.3,.58],[-.3,.75],[-.08,.75],[-.08,.98],[.08,.98],[.08,.75],[.3,.75],[.3,.58],[.08,.58],[.085,0]],.15,0,.03,0,'#939d95',stone)
  ring('mineral-cross-halo',.22,.037,0,.665,0,'#a9b1a5',stone,'z')
  rock('mineral-cross-broken-foot',.25,.08,.21,0,.07,0,'#717c75',2);break
 }
 case 'coral-fan':{
  rock('mineral-fan-coral-root',.23,.1,.2,0,.08,0,'#8e766a',8)
  const coral:Surface={roughness:.9},n=low?7:11
  tube('mineral-coral-fan-trunk',[[0,.05,0],[0,.28,0],[.01,.49,0]],.035,'#bb6b6d',coral)
  for(let i=0;i<n;i++){
   const t=(i/(n-1)-.5)*2,x=t*.49,h=.88-Math.abs(t)*.2,z=Math.sin(i*1.7)*.028
   tube('mineral-coral-fan-ray',[[0,.19,0],[x*.45,.41,z],[x*.8,h*.78,z],[x,h,z]],.014,'#cb7c80',coral)
   if(i%2===0||!low)for(const side of [-1,1])beam('mineral-coral-fine-branch',[x*.76,h*.76,z],[x+side*.055,h+.075,z+.006],.008,'#e59b91',coral)
  }
  for(let row=0;row<3;row++){const y=.38+row*.145,span=.18+row*.115;tube('mineral-coral-lateral-web',[[-span,y,0],[-span*.4,y+.025,.01],[span*.4,y-.014,-.01],[span,y+.015,0]],.009,'#b96c77',coral)}
  break
 }
 case 'basalt-column':{
  const p=[[0,0,.13,.23,1.12],[-.3,0,0,.2,.82],[.29,0,0,.2,.93],[-.17,0,-.24,.19,.74],[.16,0,-.25,.18,.86],[-.2,0,.31,.16,.54],[.19,0,.31,.17,.65]]
  p.slice(0,low?5:7).forEach(([x,,z,r,h],i)=>{const c=loft('mineral-hexagonal-basalt-column',[[0,0],[r,0],[r*.99,h*.54],[r*.94,h],[0,h]],6,x,0,z,i%2?'#566268':'#6b7577',stone,i,.045);c.rotation.y=Math.PI/6})
  break
 }
 case 'sandstone-stack':{
  for(let i=0;i<6;i++){const p=rock('mineral-sandstone-layer-'+i,.49-i*.026,.09,.4-i*.018,Math.sin(i*1.4)*.035,.09+i*.145,Math.cos(i*2)*.025,['#b78c60','#cdab7b','#ad7e54'][i%3],i+11);p.rotation.y=i*.12}
  break
 }
 case 'balancing-rock':{
  loft('mineral-balancing-eroded-pedestal',[[0,0],[.3,0],[.25,.1],[.15,.35],[.1,.59],[.12,.66],[0,.68]],low?7:11,-.04,0,0,'#a79176',stone,5,.12)
  rock('mineral-balancing-wide-cap',.52,.22,.35,.07,.82,0,'#b9a58b',6)
  rock('mineral-balancing-foot-chip',.13,.06,.1,.3,.05,.16,'#917d65',4);break
 }
 case 'stone-arch-natural':{
  extrude('mineral-natural-arch-open-span',archPoints,.45,0,0,0,'#8d9187',stone)
  rock('mineral-natural-arch-left-buttress',.15,.25,.3,-.46,.22,.035,'#777f77',1)
  rock('mineral-natural-arch-right-toe',.16,.11,.28,.48,.08,.05,'#a2a293',8)
  if(!low){rock('mineral-natural-arch-crown-chip',.16,.065,.26,.02,.96,-.01,'#a6a89b',4);rock('mineral-natural-arch-outer-flake',.08,.12,.1,.47,.67,.21,'#b0b0a1',12)}
  break
 }
 case 'coral-rock':{
  shaped('mineral-perforated-reef-rock',[[-.48,.05],[-.54,.3],[-.44,.53],[-.2,.66],[.08,.64],[.3,.72],[.48,.52],[.52,.22],[.39,.03]], [circle(-.27,.34,.1),circle(.06,.43,.125),circle(.32,.28,.075)],.43,0,0,0,'#cfaa91',stone,.02)
  for(let i=0;i<(low?3:6);i++){const x=-.36+i*.14;tube('mineral-reef-coral-polyp',[[x,.55,.08],[x-.025,.68,.12],[x+.02,.74+hash(i)*.08,.11]],.025,'#d0877a',stone)}
  break
 }
 case 'pumice-boulder':{
  const holes=[[-.28,.25,.064],[-.05,.21,.08],[.23,.25,.073],[-.23,.47,.075],[.04,.49,.061],[.28,.48,.06],[-.04,.68,.055]]
  shaped('mineral-pumice-through-pores',[[-.47,.05],[-.53,.27],[-.45,.57],[-.27,.76],[.03,.84],[.3,.76],[.47,.55],[.5,.26],[.36,.04],[-.12,0]],holes.slice(0,low?5:7).map(([x,y,r])=>circle(x,y,r,low?7:10)),.57,0,0,0,'#a29b88',stone,.016)
  if(!low)rock('mineral-pumice-fractured-lower-edge',.17,.08,.24,.34,.045,.11,'#8c8779',2)
  break
 }
 case 'sulfur-rock':{
  rock('mineral-sulfur-host',.45,.25,.36,0,.23,0,'#9a9067',3)
  for(let i=0;i<(low?5:10);i++){const a=i*2.4;shard('mineral-sulfur-rhombic-crystal',.09+(i%3)*.018,.16+(i%4)*.045,Math.cos(a)*.29,.34,Math.sin(a)*.25,['#d6bf45','#ebd763','#bba331'][i%3],Math.cos(a)*.24,i,4,stone)}break
 }
 case 'quartz-vein':{
  rock('mineral-quartz-grey-matrix-left',.28,.31,.35,-.23,.29,0,'#6f777b',8)
  rock('mineral-quartz-grey-matrix-right',.31,.36,.35,.21,.34,0,'#858b89',14)
  extrude('mineral-quartz-zigzag-vein',[[-.15,.01],[-.05,.21],[-.13,.37],[0,.52],[-.04,.7],[.07,.75],[.13,.55],[.04,.35],[.13,.17],[.05,.02]],.43,0,.03,0,'#e0dfd4',crystalSurface)
  for(let i=0;i<(low?3:6);i++)shard('mineral-quartz-exposed-termination',.055,.15+(i%3)*.06,-.08+i*.034,.51+i*.02,.24,'#ecebe1',.18-i*.05,i,6)
  break
 }
 case 'magnetite':{
  rock('mineral-magnetite-matrix',.44,.12,.35,0,.11,0,'#62635e',4)
  for(let i=0;i<(low?3:6);i++){
   const a=i*2.45,g=new THREE.OctahedronGeometry(.19+(i%3)*.036);g.name='mineral-magnetite-octahedron';const p=mesh(g,i%2?'#535d61':'#3e494e',Math.cos(a)*.25,.26+(i%3)*.1,Math.sin(a)*.21,metal);p.rotation.set(.15+i*.12,.35+i*.3,.18)
  }break
 }
 case 'shell-mound':{
  rock('mineral-shell-mound-sand',.5,.09,.42,0,.08,0,'#a8977b',3)
  const p=[[-.3,.12,-.23,1,1.1],[.05,.13,-.3,.85,2.6],[.28,.12,-.14,.9,-1.1],[-.33,.12,.1,.8,.2],[.1,.15,.12,1.1,-.8],[-.07,.25,-.06,.9,2],[.31,.15,.22,.75,-2.2],[-.19,.24,.24,.75,.8],[.08,.32,.03,.7,1.2]]
  p.slice(0,low?6:9).forEach(([x,y,z,s,t],i)=>shell(x,y,z,s,t,['#d2bca0','#e2cbb1','#b99d86'][i%3]));break
 }
 case 'sand-burrow':{
  const points=[[-.53,0],[-.49,.22],[-.36,.43],[-.13,.56],[.12,.58],[.37,.43],[.52,.18],[.54,0],[.2,0],[.19,.18],[.12,.29],[0,.33],[-.12,.29],[-.19,.18],[-.2,0]]
  extrude('mineral-sand-burrow-open-tunnel',points,.67,0,0,0,'#baa17b',stone)
  for(let i=0;i<(low?3:6);i++){const s=i%2?1:-1;rock('mineral-burrow-spoils',.11,.045,.12,s*(.28+hash(i)*.16),.035,.3+hash(i+2)*.2,'#cbb28b',i+4)}
  break
 }
 case 'termite-mound':{
  shaped('mineral-termite-mound-tunnels',[[-.32,0],[-.35,.23],[-.25,.5],[-.18,.59],[-.17,.89],[-.08,1.02],[.04,.91],[.12,.65],[.23,.49],[.3,.21],[.34,0]],[circle(0,.22,.065),circle(-.075,.57,.035),circle(.12,.4,.025)],.4,0,0,0,'#a67e55',stone,.018)
  spike('mineral-termite-side-turret',.14,.62,-.25,0,-.13,'#bb9262',4)
  spike('mineral-termite-small-turret',.14,.44,.25,0,-.07,'#b28b5d',8)
  rock('mineral-termite-apron',.43,.05,.32,0,.04,0,'#a47d53',9);break
 }
 case 'mile-marker':{
  const pts=[[-.24,0],[-.24,.76],[-.19,.91],[-.1,.98],[.1,.98],[.2,.9],[.24,.76],[.24,0]]
  extrude('mineral-mile-marker-stone',pts,.27,0,0,0,'#a2a38f',stone)
  for(let i=0;i<3;i++)beam('mineral-mile-marker-distance-stroke',[-.09+i*.09,.65,.143],[-.09+i*.09,.83,.143],.011,'#5d685e',stone)
  box('mineral-mile-marker-number-top',.24,.014,.012,0,.83,.145,'#606b60',stone,0)
  box('mineral-mile-marker-number-bottom',.24,.014,.012,0,.65,.145,'#606b60',stone,0)
  for(let i=0;i<2;i++)box('mineral-mile-marker-lettering',.19-i*.04,.014,.009,0,.44-i*.07,.143,'#727b6e',stone,0)
  rock('mineral-mile-marker-base',.31,.07,.23,0,.055,0,'#858b7a',8);break
 }
 case 'bollard':{
  lathe('mineral-bollard-stone-post',[[0,0],[.3,0],[.32,.07],[.23,.16],[.18,.57],[.25,.6],[.27,.69],[.22,.77],[0,.8]],0,0,0,'#8f958c',stone)
  cylinder('mineral-bollard-iron-collar',.198,.204,.07,0,.48,0,'#515b58',iron,low?10:16)
  ring('mineral-bollard-mooring-eye',.105,.026,0,.46,.22,'#56615d',iron,'z')
  if(!low)for(const s of [-1,1])ellipsoid('mineral-bollard-collar-rivet',.022,.022,.015,s*.12,.48,.16,'#89908a',iron)
  break
 }
 case 'anchor':{
  ring('mineral-anchor-open-eye',.106,.027,0,.99,0,'#647276',metal,'z')
  beam('mineral-anchor-tapered-shank',[0,.18,0],[0,.89,0],.036,'#5e6d71',metal,.77)
  box('mineral-anchor-cross-stock',.78,.075,.105,0,.725,0,'#71604b',k.wood,.08)
  for(const x of [-.28,0,.28])box('mineral-anchor-stock-band',.042,.086,.115,x,.725,0,'#59696c',metal,.025)
  for(const s of [-1,1]){
   tube('mineral-anchor-curved-arm',[[0,.25,0],[s*.11,.16,0],[s*.28,.21,0],[s*.39,.39,0]],.037,'#637276',metal)
   extrude('mineral-anchor-pointed-fluke',[[s*.26,.4],[s*.45,.5],[s*.46,.28],[s*.36,.32]],.075,0,0,0,'#7a8889',metal)
  }
  ellipsoid('mineral-anchor-crown',.064,.06,.06,0,.2,0,'#526467',metal)
  break
 }
 case 'sundial':{
  lathe('mineral-sundial-carved-pedestal',[[0,0],[.29,0],[.31,.06],[.25,.12],[.14,.18],[.12,.43],[.19,.55],[.28,.6],[0,.6]],0,0,0,'#b1ae97',stone)
  cylinder('mineral-sundial-brass-dial',.4,.38,.05,0,.63,0,'#ac945b',metal,low?16:32)
  ring('mineral-sundial-dial-rim',.38,.014,0,.66,0,'#d0b978',metal)
  extrude('mineral-sundial-triangular-gnomon',[[-.16,0],[.16,0],[.16,.29]],.026,0,.66,0,'#6f795f',metal)
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;beam('mineral-sundial-hour-mark',[Math.cos(a)*.29,.66,Math.sin(a)*.29],[Math.cos(a)*.345,.66,Math.sin(a)*.345],.006,'#574e38',metal)}
  break
 }
 default:return false
 }
 // Separate face normals preserve stone facets and the sharp edges of cuts.
 for(const p of emitted){const g=p.geometry;if(g.index){const flat=g.toNonIndexed();flat.name=g.name;g.copy(flat);flat.dispose()}g.computeVertexNormals()}
 return finish()
}
