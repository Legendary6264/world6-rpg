import * as THREE from 'three'
import {legacyAsset} from './legacyAssets.ts'
import {legacyKit} from './scene3dLegacyKit.ts'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'

// Existing artwork IDs keep their saved collision envelope. All botanical parts
// below are closed solids; the last bake also scales unusually edited saves as
// one assembly, so roots, twigs and leaves keep their joints.
export function populateLegacyFlora(e:RenderEntity,output:ModelMesh,low=false):boolean{
 const asset=legacyAsset(e.geometry)
 if(!asset||asset.native||asset.group!=='flora')return false
 // Caps and tightly bent small stems use face normals, so anisotropic saved
 // dimensions cannot smooth a cap normal through the opposite tube wall.
 const k=legacyKit(e,(geometry,...args)=>{
  if(geometry.type==='TubeGeometry'||geometry.type==='TorusGeometry'||geometry.name.endsWith('woven-nest-bowl')){const original=geometry;geometry=original.toNonIndexed();geometry.name=original.name;geometry.computeVertexNormals();original.dispose()}
  return output(geometry,...args)
 },low),{beam,cylinder,lathe,tube,ellipsoid,box,mesh,wood,leaf}=k,s=asset.slug
 const bark='#72533c',barkLight='#96714d',green='#426d3c',light='#63884a',dark='#2d5035',cream='#e2cba2',pink='#dc7c9b'
 const n=(a:number,b:number)=>low?b:a,polar=(r:number,a:number,y:number)=>[Math.cos(a)*r,y,Math.sin(a)*r]
 const orb=(name:string,x:number,y:number,z:number,rx:number,ry=rx,rz=rx,color=green,detail=false,surface:Surface=leaf)=>{
  const g=new THREE.IcosahedronGeometry(1,!low&&detail?1:0);g.name=`${s}-${name}`;const p=mesh(g,color,x,y,z,surface);p.scale.set(rx,ry,rz);return p
 }
 const branch=(name:string,a:number[],b:number[],r:number,color=bark,taper=.5)=>beam(`${s}-${name}`,a,b,r,color,wood,taper)
 // A curved lens swept between pointed ends. The elliptical cross sections
 // give leaves real thickness, a raised midrib and a visible back face.
 const blade=(name:string,a:number[],b:number[],width:number,color=green,bend=.04,thickness=width*.13)=>{
  const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),axis=B.clone().sub(A).normalize(),reference=Math.abs(axis.y)<.92?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1),side=new THREE.Vector3().crossVectors(axis,reference).normalize(),normal=new THREE.Vector3().crossVectors(side,axis).normalize(),radial=low?4:6,steps=low?3:4,positions:number[]=[],uv:number[]=[],indices:number[]=[]
  const add=(v:THREE.Vector3,u:number,t:number)=>{positions.push(v.x,v.y,v.z);uv.push(u,t)}
  add(A,0.5,0)
  for(let i=1;i<=steps;i++){
   const t=i/(steps+1),center=A.clone().lerp(B,t).addScaledVector(normal,bend*Math.sin(t*Math.PI)),w=width*Math.pow(Math.sin(t*Math.PI),.8)*(1-.18*t)
   for(let j=0;j<radial;j++){const angle=j/radial*Math.PI*2;add(center.clone().addScaledVector(side,Math.cos(angle)*w).addScaledVector(normal,Math.sin(angle)*thickness*Math.sin(t*Math.PI)),j/radial,t)}
  }
  const tip=positions.length/3;add(B,.5,1)
  for(let j=0;j<radial;j++)indices.push(0,1+(j+1)%radial,1+j)
  for(let i=0;i<steps-1;i++)for(let j=0;j<radial;j++){const a=1+i*radial+j,b=1+i*radial+(j+1)%radial,c=a+radial,d=b+radial;indices.push(a,b,c,b,d,c)}
  const end=1+(steps-1)*radial
  for(let j=0;j<radial;j++)indices.push(end+j,end+(j+1)%radial,tip)
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];g.setIndex(indices);const solid=g.toNonIndexed();g.dispose();solid.computeVertexNormals();solid.name=`${s}-${name}`;return mesh(solid,color,0,0,0,leaf)
 }
 const crown=(name:string,x:number,y:number,z:number,rx:number,ry:number,rz:number,color=green,seed=0)=>{
  const g=new THREE.IcosahedronGeometry(1,low?0:2),p=g.attributes.position
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i),a=Math.atan2(v.z,v.x),r=1+.075*Math.sin(a*5+seed)+.045*Math.cos(v.y*9+seed*3);p.setXYZ(i,v.x*r,v.y*(1+.055*Math.cos(a*3+seed)),v.z*r)}
  g.computeVertexNormals();g.name=`${s}-${name}`;const part=mesh(g,color,x,y,z,leaf);part.scale.set(rx,ry,rz);return part
 }
 const rootBase=(radius=.11,height=.61,count=5,color=bark)=>{
  lathe(`${s}-rooted-trunk`,[[0,0],[radius*1.55,0],[radius*1.3,.08],[radius,.24],[radius*.76,height],[0,height]],0,0,0,color,wood)
  for(let i=0;i<n(count,3);i++){const a=i*Math.PI*2/n(count,3)+.2;branch('buttress-root',[Math.cos(a)*radius*.5,.16,Math.sin(a)*radius*.5],polar(radius*2.8,a,.015),radius*.46,color,.12)}
 }
 const bough=(a:number[],b:number[],r=.045,color=bark)=>branch('branch',a,b,r,color,.36)
 const roundTree=(kind:string)=>{
  rootBase(kind==='root-tree'?.14:.095,kind==='apple'?.52:.65,kind==='root-tree'?7:5)
  const count=n(kind==='oak'?9:7,4)
  for(let i=0;i<count;i++){
   const angle=i*2.399+.3,r=i===0?0:.26+(i%2)*.08,y=.68+(i%3)*.1,end=polar(r,angle,y)
   bough([0,.33+(i%3)*.08,0],end,.04+(i%3)*.007)
   if(!low)bough(end,polar(r+.1,angle+.25,y+.13),.018)
   crown(kind==='cherry'?'blossom-crown':'leaf-crown',end[0],y,end[2],i===0?.29:.25,.17+(i%2)*.04,.22,kind==='cherry'?(i%2?'#de90b0':'#e9acbc'):kind==='maple'?(i%2?'#aa4f35':'#ce823d'):i%3?green:light,i)
  }
  if(kind==='oak')for(let i=0;i<n(8,3);i++){const a=i*2.3;orb('acorn',Math.cos(a)*.33,.64+(i%3)*.08,Math.sin(a)*.33,.018,.027,.018,'#b59a55');orb('acorn-cup',Math.cos(a)*.33,.659+(i%3)*.08,Math.sin(a)*.33,.023,.011,.023,bark)}
  if(kind==='root-tree')for(let i=0;i<n(8,4);i++){const a=i*.86;tube(`${s}-arching-root`,[[0,.24,0],polar(.25,a,.15),polar(.43,a+.18,.015)],.027,bark,wood)}
  if(kind==='apple')for(let i=0;i<n(13,6);i++){const a=i*2.4,r=.23+(i%3)*.07,y=.66+(i%3)*.09;orb('apple-fruit',Math.cos(a)*r,y,Math.sin(a)*r,.037,.04,.037,i%4?'#b94b34':'#d2ae4f',true);branch('fruit-stalk',[Math.cos(a)*r,y+.035,Math.sin(a)*r],[Math.cos(a)*r,y+.065,Math.sin(a)*r],.004)}
  if(kind==='cherry')for(let i=0;i<n(14,5);i++){const a=i*2.4,p=polar(.32+(i%2)*.06,a,.71+(i%3)*.09);flower('cherry-blossom',p[0],p[1],p[2],.035,'#f5d6da',5)}
  if(kind==='maple')for(let i=0;i<n(12,4);i++){
   const a=i*2.4,r=.37,x=Math.cos(a)*r,z=Math.sin(a)*r,points=[[0,0],[-.025,.025],[-.05,.014],[-.04,.055],[-.065,.075],[-.025,.075],[0,.12],[.025,.075],[.065,.075],[.04,.055],[.05,.014],[.025,.025]],p=k.extrude(`${s}-lobed-maple-leaf`,points,.007,x,.63+(i%4)*.065,z,i%2?'#d99042':'#a54c32',leaf);p.rotation.y=-a;p.rotation.x=.35
  }
 }
 const flower=(name:string,x:number,y:number,z:number,r:number,color:string,count=6)=>{
  orb(`${name}-heart`,x,y,z,r*.31,r*.2,r*.31,'#d5b466')
  for(let j=0;j<n(count,Math.max(3,Math.floor(count*.6)));j++){const a=j*Math.PI*2/n(count,Math.max(3,Math.floor(count*.6)));blade(`${name}-petal`,[x,y,z],[x+Math.cos(a)*r,y+r*.25,z+Math.sin(a)*r],r*.34,color,r*.15,r*.08)}
 }
 const leavesOnStem=(a:number[],b:number[],pairs=4,width=.045,color=green)=>{
  for(let j=1;j<=pairs;j++)for(const sign of [-1,1]){const t=j/(pairs+1),p=a.map((v,i)=>v+(b[i]-v)*t),angle=j*1.7;blade('paired-leaf',p,[p[0]+Math.cos(angle)*sign*width*3,p[1]+width,p[2]+Math.sin(angle)*sign*width*3],width,color,.012)}
 }
 const growthRing=(name:string,r:number,x:number,y:number,z:number,axis:'x'|'y'='y',color='#aa8250')=>{
  const g=new THREE.TorusGeometry(r,.005,low?3:4,low?10:18);g.name=`${s}-${name}`;const p=mesh(g,color,x,y,z,wood);p.rotation[axis==='x'?'y':'x']=Math.PI/2;return p
 }
 const fallenLog=(name:string,x:number,y:number,z:number,length:number,r:number,color=bark)=>{
  branch(`${name}-bark`,[x-length/2,y,z],[x+length/2,y,z],r,color,.92)
  for(const sign of [-1,1]){
   const p=cylinder(`${s}-${name}-cut-face`,r*.87,r*.87,.008,x+sign*length*.5,y,z,cream,wood,low?8:14);p.rotation.z=Math.PI/2
   for(let i=1;i<=n(3,1);i++)growthRing(`${name}-growth-ring`,r*i/(n(3,1)+1),x+sign*(length*.5+.005),y,z,'x')
  }
  for(let i=0;i<n(8,4);i++){const a=i*Math.PI*2/n(8,4);branch(`${name}-bark-ridge`,[x-length*.44,y+Math.cos(a)*r,z+Math.sin(a)*r],[x+length*.43,y+Math.cos(a)*r*.93,z+Math.sin(a)*r*.93],r*.045,i%2?barkLight:color,.65)}
 }
 const mushroom=(x:number,y:number,z:number,scale:number,color:string,glow=false)=>{
  const surface:Surface=glow?{roughness:.7,emissive:'#397f77'}:leaf
  lathe(`${s}-mushroom-stem`,[[0,0],[.075,0],[.085,.10],[.048,.35],[.065,.65],[0,.65]].map(([r,h])=>[r*scale,h*scale]),x,y,z,glow?'#b8ded0':cream,leaf)
  lathe(`${s}-mushroom-cap`,[[0,.61],[.22,.60],[.45,.63],[.49,.69],[.44,.80],[.28,.94],[0,1]].map(([r,h])=>[r*scale,h*scale]),x,y,z,color,surface)
  for(let i=0;i<n(16,6);i++){const a=i*Math.PI*2/n(16,6);beam(`${s}-radial-gill`,[x+Math.cos(a)*.07*scale,y+.607*scale,z+Math.sin(a)*.07*scale],[x+Math.cos(a)*.42*scale,y+.625*scale,z+Math.sin(a)*.42*scale],scale*.006,glow?'#a3e0cd':'#c3ac81',leaf,.8)}
  if(s==='red-mushroom'||s==='giant-mushroom'){
   lathe(`${s}-stem-skirt`,[[0,.37],[.05,.37],[.125,.45],[.09,.48],[.06,.47],[0,.47]].map(([r,h])=>[r*scale,h*scale]),x,y,z,cream,leaf)
   for(let i=0;i<n(12,5);i++){const a=i*2.4,r=.1+(i%3)*.11,yy=.987-.63*r;orb('cap-wart',x+Math.cos(a)*r*scale,y+yy*scale,z+Math.sin(a)*r*scale,.032*scale,.014*scale,.032*scale,cream)}
  }
 }
 if(['oak','apple','root-tree','cherry','maple'].includes(s))roundTree(s)
 else if(s==='pine'||s==='cedar'||s==='cypress'){
  rootBase(s==='cypress'?.07:.075,.97,4)
  if(s==='cypress'){
   for(let i=0;i<n(6,3);i++){const y=.24+i*.12,r=.17*Math.sin((i+1)/7*Math.PI)*(.95-i*.06);crown('upright-spray',Math.sin(i*2)*.025,y+.2,Math.cos(i*2)*.022,r,.23,r*.84,i%2?green:dark,i)}
   for(let i=0;i<n(7,3);i++){const a=i*2.4;branch('vertical-furrow',polar(.055,a,.04),polar(.041,a+.15,.66),.006,barkLight,.6)}
  }else for(let tier=0;tier<n(5,3);tier++){
   const y=.30+tier*.14,r=.4-tier*.073,count=n(6,3)
   for(let j=0;j<count;j++){
    const a=j*Math.PI*2/count+tier*.6,end=polar(r*.86,a,y+.025);bough([0,y+.04,0],end,.018)
    if(s==='cedar')crown('horizontal-cedar-bough',end[0]*.66,y+.065,end[2]*.66,r*.64,.055,r*.48,j%2?light:green,j+tier)
   }
   if(s==='pine')lathe(`${s}-needle-tier`,[[0,0],[r*.75,.005],[r,.04],[r*.70,.12],[r*.20,.28],[0,.32]],0,y-.025,0,tier%2?green:dark,leaf)
   if(s==='pine'&&!low)for(let j=0;j<5;j++){const a=j*1.256+tier;const p=polar(r*.83,a,y+.05);blade('needle-tip',p,[p[0]*1.12,p[1]+.10,p[2]*1.12],.018,light,.005)}
  }
 }
 else if(s==='birch'){
  for(let t=0;t<n(3,2);t++){
   const x=(t-1)*.11,z=Math.sin(t*3)*.07,end=[x+(t-1)*.055,.83+(t%2)*.13,z]
   branch('white-birch-trunk',[x,0,z],end,.038,'#d9d8bd',.55)
   for(let j=0;j<n(7,4);j++){const p=j*.1+.12;branch('dark-bark-scar',[x-.025,p,z+.025],[x+.026,p+.009,z+.025],.005,'#554f43',.8)}
   for(let j=0;j<n(4,2);j++){const a=j*2.4+t,r=.20,y=.50+j*.12,p=polar(r,a,y);p[0]+=x;p[2]+=z;bough([x,y-.14,z],p,.014,'#aaa486');crown('airy-birch-leaves',p[0],p[1]+.08,p[2],.18,.15,.16,j%2?'#80a052':'#aac164',j+t)}
  }
 }
 else if(s==='willow'){
  rootBase(.105,.68,6)
  for(let i=0;i<n(6,3);i++){const a=i*2.4,p=polar(.3,a,.77);bough([0,.37,0],p,.04);crown('willow-upper-crown',p[0],p[1],p[2],.23,.15,.20,i%2?light:green,i)}
  for(let i=0;i<n(13,6);i++){
   const a=i*2.399,r=.32+(i%3)*.04,top=polar(r*.78,a,.81),mid=polar(r*1.17,a+.08,.57),end=polar(r*1.18,a+.12,.12+(i%3)*.06)
   tube(`${s}-hanging-bough`,[top,mid,end],.007,barkLight,wood)
   for(let j=0;j<n(5,3);j++){const t=(j+1)/(n(5,3)+1),p=mid.map((v,q)=>v+(end[q]-v)*t);blade('pendulous-willow-leaf',p,[p[0]+Math.cos(a+.5)*.055,p[1]-.13,p[2]+Math.sin(a+.5)*.055],.016,j%2?light:green,.008)}
  }
 }
 else if(s==='dead'){
  rootBase(.105,.72,6,'#796e59')
  for(let i=0;i<n(7,4);i++){
   const a=i*2.35,start=[0,.24+(i%4)*.105,0],joint=polar(.22,a,.58+(i%3)*.10),tip=polar(.38,a+.15,.75+(i%3)*.08)
   bough(start,joint,.035,'#796e59');bough(joint,tip,.018,'#92846a');branch('broken-fork',joint,polar(.26,a-.45,.84+(i%2)*.12),.012,'#92846a',.1)
   if(!low)branch('bare-twig',tip,polar(.44,a+.3,.86+(i%3)*.04),.006,'#92846a',0)
  }
  orb('trunk-knot',.05,.32,.055,.029,.043,.017,'#403b30')
 }
 else if(s==='baobab'){
  lathe(`${s}-bottle-trunk`,[[0,0],[.22,0],[.27,.12],[.25,.36],[.16,.63],[.12,.76],[0,.76]],0,0,0,'#9b8369',wood)
  for(let i=0;i<n(7,4);i++){const a=i*2.4,p=polar(.31,a,.87+(i%2)*.08);bough([Math.cos(a)*.09,.55,Math.sin(a)*.09],p,.066,'#9b8369');crown('baobab-crown',p[0],p[1],p[2],.21,.11,.18,i%2?light:green,i);branch('radial-root',polar(.14,a,.13),polar(.34,a,.01),.06,'#9b8369',.1)}
  if(!low)for(let i=0;i<8;i++){const a=i*.785;branch('trunk-channel',polar(.25,a,.12),polar(.155,a+.05,.6),.008,'#78654f',.5)}
 }
 else if(s==='palm'){
  tube(`${s}-curved-palm-trunk`,[[0,0,0],[-.04,.4,0],[.04,.78,.01]],.055,barkLight,wood)
  for(let i=0;i<n(12,6);i++)growthRing('palm-trunk-scar',.055,-.02+Math.max(0,i-5)*.008,.055+i*.058,0,'y',bark)
  for(let i=0;i<n(8,5);i++){
   const a=i*Math.PI*2/n(8,5),start=[.04,.79,.01],mid=polar(.23,a,.92),end=polar(.5,a,.70)
   tube(`${s}-frond-rib`,[start,mid,end],.006,light,wood)
   for(let j=1;j<=n(7,4);j++)for(const sign of [-1,1]){const t=j/(n(7,4)+1),p=start.map((value,q)=>value+(end[q]-value)*t);p[1]=.79+.13*Math.sin(t*Math.PI)-.09*t;const spread=.14*Math.sin(t*Math.PI);blade('pinnate-palm-leaflet',p,[p[0]+Math.cos(a+sign*.85)*spread,p[1]-.07,p[2]+Math.sin(a+sign*.85)*spread],.019,green,.01)}
  }
  for(let i=0;i<3;i++)orb('coconut',.04+Math.cos(i*2.1)*.065,.75,Math.sin(i*2.1)*.065,.041,.049,.041,'#9a7445',true)
 }
 else if(s==='acacia'){
  rootBase(.075,.6,5)
  for(let i=0;i<n(7,4);i++){const a=i*2.4,p=polar(.31+(i%2)*.08,a,.76+(i%3)*.04),joint=polar(.12,a,.5);bough([0,.27,0],joint,.04);bough(joint,p,.027);crown('umbrella-canopy',p[0],p[1],p[2],.27,.055,.22,i%2?'#7c8d46':'#667e3c',i)}
  if(!low)for(let i=0;i<6;i++){const a=i*2.4,p=polar(.31,a,.69);blade('hanging-seed-pod',p,[p[0]+.02,p[1]-.12,p[2]],.015,'#715536',.018)}
 }
 else if(['hazel','juniper','elder','rose-bush','coffee','cotton'].includes(s)){
  const count=n(s==='juniper'?7:5,3)
  for(let i=0;i<count;i++){
   const a=i*2.4,r=s==='juniper'?.4:.25,p=polar(r,a,s==='juniper'?.22:.63+(i%3)*.13),base=polar(.08,a,.01)
   tube(`${s}-${s==='juniper'?'creeping-branch':'multiple-cane'}`,[base,polar(r*.5,a+.2,p[1]*.65),p],s==='hazel'?.022:.015,bark,wood)
   if(s==='juniper'){
    crown('prostrate-juniper-spray',p[0]*.8,p[1],p[2]*.8,.22,.14,.16,i%2?'#637e70':'#395b4b',i)
    for(let j=0;j<n(4,2);j++)orb('juniper-berry',p[0]+Math.cos(j*2)*.08,p[1]+.07,p[2]+Math.sin(j*2)*.08,.017,.017,.017,'#678197')
   }else if(s==='cotton'){
    leavesOnStem(base,p,n(3,2),.06)
    for(let j=0;j<3;j++){const aa=j*2.1;orb('cotton-boll',p[0]+Math.cos(aa)*.035,p[1]+.02,p[2]+Math.sin(aa)*.035,.051,.05,.047,'#e7e1c8',true);blade('dry-boll-bract',p,[p[0]+Math.cos(aa)*.065,p[1]-.05,p[2]+Math.sin(aa)*.065],.023,barkLight,.015)}
   }else if(s==='coffee'){
    leavesOnStem(base,p,n(5,3),.068,'#355e35')
    for(let j=1;j<=n(5,3);j++){const t=j/6,q=base.map((v,ii)=>v+(p[ii]-v)*t);for(const sign of [-1,1])orb('coffee-cherry',q[0]+sign*.025,q[1],q[2],.022,.027,.022,j%3?'#ad3e30':'#d1a257')}
   }else if(s==='rose-bush'){
    leavesOnStem(base,p,n(4,2),.04)
    for(let j=1;j<=n(4,2);j++){const t=j/5,q=base.map((v,ii)=>v+(p[ii]-v)*t);branch('rose-thorn',q,[q[0]+.034,q[1]-.018,q[2]+.018],.009,barkLight,0)}
    flower('rose-outer-petal',p[0],p[1],p[2],.09,'#bd4b65',7);flower('rose-inner-petal',p[0],p[1]+.024,p[2],.049,'#e57d91',5)
   }else{
    crown(s==='hazel'?'rounded-hazel-crown':'elder-compound-foliage',p[0],p[1],p[2],.23,.22,.20,i%2?light:green,i);leavesOnStem(base,p,n(3,1),.055)
    if(s==='hazel')for(let j=0;j<n(3,1);j++)orb('hazelnut-cluster',p[0]+j*.027,p[1]-.13,p[2]+.11,.024,.03,.022,'#ac8349')
    if(s==='elder'){for(let j=0;j<n(7,4);j++){const aa=j*2.4;orb('elder-flower-umbel',p[0]+Math.cos(aa)*.09,p[1]+.19,p[2]+Math.sin(aa)*.09,.042,.025,.04,'#dcd9b0')}}
   }
  }
 }
 else if(s==='banana'){
  for(let i=0;i<n(3,2);i++){const x=(i-1)*.11;branch('layered-pseudostem',[x,0,0],[x,.74-i*.11,0],.047,'#9aab55',.64)}
  for(let i=0;i<n(8,5);i++){
   const a=i*2.4,y=.65+(i%3)*.055,start=[0,y,0],end=polar(.47,a,.57+(i%3)*.15)
   blade('broad-banana-leaf',start,end,.108,i%2?light:'#4f873e',.18,.012);branch('banana-leaf-midrib',start,end,.007,'#94a755',.2)
  }
  tube(`${s}-fruit-stalk`,[[.02,.72,.02],[.1,.65,.10],[.12,.4,.12]],.012,'#6e8b3e',wood)
  for(let i=0;i<n(9,4);i++){const a=i*2.4,p=[.12+Math.cos(a)*.04,.51-(i%3)*.045,.12+Math.sin(a)*.04];tube(`${s}-banana-fruit`,[p,[p[0]+.04,p[1]-.02,p[2]],[p[0]+.06,p[1]+.035,p[2]]],.013,'#d4bd56',leaf)}
 }
 else if(s==='fern'){
  orb('fern-root-crown',0,.06,0,.12,.06,.12,bark)
  for(let i=0;i<n(8,4);i++){
   const a=i*2.399,start=[0,.04,0],end=polar(.46,a,.18+(i%3)*.07),mid=polar(.24,a,.54)
   tube(`${s}-arching-fern-rachis`,[start,mid,end],.006,light,wood)
   for(let j=1;j<=n(7,4);j++)for(const sign of [-1,1]){const t=j/(n(7,4)+1),r=.46*t,y=.04+.47*Math.sin(t*Math.PI)*.9+.18*t,p=polar(r,a,y),len=.13*Math.sin(t*Math.PI);blade('paired-fern-pinna',p,[p[0]+Math.cos(a+sign*1.0)*len,p[1]-.015,p[2]+Math.sin(a+sign*1.0)*len],len*.27,j%2?light:green,.015)}
  }
 }
 else if(['reeds','cattails','grass-tuft','lupine','sunflower','thistle'].includes(s)){
  const count=s==='sunflower'?n(2,1):n(9,5)
  for(let i=0;i<count;i++){
   const a=i*2.4,r=s==='sunflower'?.12:.27*(i%3)/2,x=Math.cos(a)*r,z=Math.sin(a)*r,h=.60+(i%4)*.10,p=[x,h,z]
   if(s==='grass-tuft'){blade('arching-grass-blade',[x*.3,0,z*.3],[x+Math.cos(a)*.16,h,z+Math.sin(a)*.16],.024,i%2?light:green,.15,.004);continue}
   branch('upright-stem',[x,0,z],p,s==='sunflower'?.017:.007,green,.7)
   if(s==='reeds'||s==='cattails'){
    for(let j=0;j<n(3,2);j++){const aa=a+j*2.1;blade('strap-leaf',[x,h*.2+j*.1,z],[x+Math.cos(aa)*.17,h*.75,z+Math.sin(aa)*.17],.021,light,.08)}
    if(s==='cattails'){lathe(`${s}-velvet-seed-head`,[[0,0],[.025,.015],[.031,.05],[.031,.22],[.019,.25],[0,.255]],x,h-.07,z,'#715033',leaf);branch('cattail-spike',[x,h+.15,z],[x,h+.28,z],.004,barkLight,.1)}
    else for(let j=0;j<n(5,3);j++){const aa=j*2.4,end=[x+Math.cos(aa)*.065,h+.10+j*.017,z+Math.sin(aa)*.065];branch('reed-panicle',[x,h-.07,z],end,.003,'#b9a473',.15);orb('reed-seed',end[0],end[1],end[2],.017,.033,.017,'#b4a278')}
   }else if(s==='lupine'){
    for(let j=0;j<n(7,4);j++)for(let q=0;q<n(4,3);q++){const aa=q*1.57+j*.5,rr=.057*(1-j*.07);orb('lupine-pea-floret',x+Math.cos(aa)*rr,h-.1+j*.04,z+Math.sin(aa)*rr,.026*(1-j*.06),.025,.020,j%2?'#8266b5':'#a18dc9')}
    if(i<3)for(let j=0;j<n(7,4);j++){const aa=j*.9;blade('palmate-lupine-leaf',[x,h*.3,z],[x+Math.cos(aa)*.14,h*.39,z+Math.sin(aa)*.14],.024,green,.02)}
   }else if(s==='sunflower'){
    for(let j=0;j<n(4,2);j++){const sign=j%2?1:-1;blade('heart-shaped-sunflower-leaf',[x,h*.2+j*.12,z],[x+sign*.20,h*.28+j*.12,z+.06],.078,green,.06)}
    const disk=cylinder(`${s}-sunflower-seed-disc`,.12,.12,.035,x,h+.02,z,'#61482c',leaf,low?10:20);disk.rotation.x=Math.PI/2
    for(let j=0;j<n(16,9);j++){const aa=j*Math.PI*2/n(16,9);blade('yellow-ray-petal',[x+Math.cos(aa)*.10,h+.02+Math.sin(aa)*.10,z],[x+Math.cos(aa)*.235,h+.02+Math.sin(aa)*.235,z+.008],.028,'#e2b941',.014)}
    if(!low)for(let j=0;j<19;j++){const aa=j*2.4,rr=.023*Math.sqrt(j);orb('sunflower-seed',x+Math.cos(aa)*rr,h+.02+Math.sin(aa)*rr,z+.023,.012,.012,.006,'#917c43')}
   }else{
    for(let j=0;j<n(4,2);j++){const sign=j%2?1:-1;blade('serrated-thistle-leaf',[x,h*.15+j*.12,z],[x+sign*.15,h*.18+j*.12,z+.03],.039,green,.02);branch('leaf-spine',[x+sign*.12,h*.18+j*.12,z+.03],[x+sign*.19,h*.17+j*.12,z+.03],.004,cream,0)}
    orb('thistle-involucre',x,h,z,.055,.065,.055,'#617948',true)
    for(let j=0;j<n(8,4);j++){const aa=j*2.4;branch('thistle-bract-spine',[x+Math.cos(aa)*.045,h,z+Math.sin(aa)*.045],[x+Math.cos(aa)*.08,h+.015,z+Math.sin(aa)*.08],.004,cream,0);orb('purple-thistle-floret',x+Math.cos(aa)*.024,h+.07,z+Math.sin(aa)*.024,.014,.047,.014,'#ad76b4')}
   }
  }
 }
 else if(s==='thorn-bush'||s==='berry-bush'){
  for(let i=0;i<n(7,4);i++){
   const a=i*2.4,end=polar(.40,a,.36+(i%3)*.12),mid=polar(.2,a,.65);tube(`${s}-arched-cane`,[[0,0,0],mid,end],.014,bark,wood)
   for(let j=1;j<=n(5,3);j++){const t=j/6,p=mid.map((v,q)=>v+(end[q]-v)*t);if(s==='thorn-bush')branch('large-thorn',p,[p[0]+Math.cos(a+.8)*.07,p[1]+.04,p[2]+Math.sin(a+.8)*.07],.009,cream,0);else{blade('berry-leaf',p,[p[0]+Math.cos(a+.8)*.12,p[1]+.03,p[2]+Math.sin(a+.8)*.12],.043,green,.02);for(let b=0;b<3;b++)orb('berry-cluster',p[0]+Math.cos(b*2.1)*.021,p[1]-.015,p[2]+Math.sin(b*2.1)*.021,.024,.023,.024,'#8a3d4b')}}
  }
 }
 else if(s==='vine'||s==='hanging-vine'||s==='hops'){
  if(s==='hops'){
   for(const x of [-.36,.36])branch('trellis-post',[x,0,0],[x,1,0],.025,barkLight,.85)
   for(const y of [.3,.64,.96])box(`${s}-trellis-rail`,.79,.025,.027,0,y,0,barkLight,wood,0)
   for(let i=0;i<3;i++)branch('trellis-upright',[(i-1)*.18,.03,0],[(i-1)*.18,.97,0],.007,barkLight,1)
  }
  if(s==='hanging-vine')branch('overhanging-woody-limb',[-.45,.96,0],[.45,.91,0],.026,barkLight,.7)
  for(let i=0;i<n(s==='hops'?4:5,3);i++){
   const x=(i-(n(s==='hops'?4:5,3)-1)/2)*.17,points:number[][]=[]
   for(let j=0;j<6;j++){const t=j/5,y=s==='hanging-vine'?.95-t*(.67+(i%2)*.2):t*(.8+(i%2)*.16);points.push([x+Math.sin(t*Math.PI*3+i)*.045,y,Math.cos(t*Math.PI*3+i)*.045])}
   tube(`${s}-twining-vine`,points,.008,green,wood)
   for(let j=1;j<=n(7,4);j++){
    const t=j/(n(7,4)+1),y=s==='hanging-vine'?.95-t*(.67+(i%2)*.2):t*(.8+(i%2)*.16),xx=x+Math.sin(t*Math.PI*3+i)*.045,zz=Math.cos(t*Math.PI*3+i)*.045,a=j*2.4+i
    blade(s==='hops'?'lobed-hop-leaf':'vine-leaf',[xx,y,zz],[xx+Math.cos(a)*.13,y+.035,zz+Math.sin(a)*.13],.055,green,.025)
    if(s==='hops'&&j%2){const p=[xx+.06,y-.055,zz+.025];orb('hop-cone-core',p[0],p[1],p[2],.038,.067,.038,light);for(let q=0;q<n(7,3);q++){const aa=q*2.4;blade('overlapping-hop-scale',[p[0],p[1]+.04-(q%3)*.025,p[2]],[p[0]+Math.cos(aa)*.04,p[1]-.01-(q%3)*.02,p[2]+Math.sin(aa)*.04],.022,'#92a54d',.01)}}
   }
  }
 }
 else if(/mushroom/.test(s)){
  if(s==='mushroom-cluster')for(let i=0;i<n(6,3);i++){const a=i*2.4,rr=i? .28:0;mushroom(Math.cos(a)*rr,0,Math.sin(a)*rr,.55+(i%3)*.15,i%2?'#ad956c':'#a9774c')}
  else{mushroom(0,0,0,1,s==='glow-mushroom'?'#6cb9a7':s==='giant-mushroom'?'#b96f67':'#c44c3e',s==='glow-mushroom');if(!low&&s!=='giant-mushroom')mushroom(.35,0,.15,.34,s==='glow-mushroom'?'#88cdbb':'#c44c3e',s==='glow-mushroom')}
 }
 else if(s==='stump'){
  rootBase(.27,.70,7)
  cylinder(`${s}-cut-heartwood`,.235,.235,.015,0,.71,0,cream,wood,low?9:18)
  for(let i=1;i<=n(5,2);i++)growthRing('annual-growth-ring',i*.039,0,.72,0)
  for(let i=0;i<n(9,4);i++){const a=i*2.4;branch('ragged-bark-ridge',polar(.265,a,.03),polar(.218,a+.05,.67+(i%3)*.035),.018,barkLight,.5)}
  branch('broken-side-branch',[.17,.32,0],[.37,.48,.035],.057,bark,.6)
 }
 else if(s==='log'||s==='woodpile'){
  if(s==='log'){fallenLog('fallen-log',0,.16,0,.96,.15);branch('broken-limb',[.04,.21,0],[.12,.40,.06],.046,bark,.35)}
  else for(let layer=0;layer<3;layer++)for(let j=0;j<3-layer;j++){if(low&&layer===2)continue;fallenLog('stacked-log',Math.sin(j*2+layer)*.025,.10+layer*.177,(j-(2-layer)/2)*.205,.80+(j%2)*.1,.102)}
 }
 else if(s==='lily-pad'||s==='lotus'){
  for(let i=0;i<n(s==='lotus'?3:2,1);i++){
   const x=(i-.6)*.25,z=Math.sin(i*3)*.19,r=.27,points:number[][]=[]
   // A real V-shaped notch, bounded by thick side walls, reveals the petiole.
   points.push([0,0]);for(let j=0;j<=n(18,10);j++){const a=.22+j*(Math.PI*2-.44)/n(18,10);points.push([Math.sin(a)*r,Math.cos(a)*r])}
   const p=k.extrude(`${s}-notched-lily-leaf`,points,.018,x,.03,z,green,leaf);p.rotation.x=-Math.PI/2
   if(!low)for(let j=0;j<6;j++){const a=.4+j;branch('radial-pad-vein',[x,.041,z],[x+Math.sin(a)*r*.88,.041,z+Math.cos(a)*r*.88],.003,light,.25)}
  }
  const y=s==='lotus'?.26:.13;branch('flower-petiole',[0,0,0],[0,y,0],.011,green,.8)
  for(let tier=0;tier<n(3,2);tier++)for(let i=0;i<n(8,5);i++){const a=i*Math.PI*2/n(8,5)+tier*.3,r=.19-tier*.04;blade('lotus-flower-petal',[0,y,0],[Math.cos(a)*r,y+.04+tier*.07,Math.sin(a)*r],.055,s==='lotus'?pink:'#efe4d4',.035,.008)}
  orb('flower-seed-pod',0,y+.035,0,.044,.029,.044,'#d7be60')
 }
 else if(s==='cactus'){
  const column=(name:string,x:number,y:number,z:number,r:number,h:number)=>{
   const g=new THREE.LatheGeometry([[0,0],[r,0],[r,h*.75],[r*.92,h*.9],[r*.6,h*.98],[0,h]].map(([a,b])=>new THREE.Vector2(a,b)),low?12:24),p=g.attributes.position
   for(let i=0;i<p.count;i++){const xx=p.getX(i),zz=p.getZ(i),a=Math.atan2(zz,xx),factor=1+.105*Math.cos(a*8);p.setXYZ(i,xx*factor,p.getY(i),zz*factor)}
   g.computeVertexNormals();g.name=`${s}-${name}`;mesh(g,'#66874a',x,y,z,leaf)
  }
  column('ribbed-main-column',0,0,0,.115,.95)
  for(const sign of [-1,1]){const y=sign<0?.44:.3;beam(`${s}-cactus-arm`,[sign*.05,y,0],[sign*.25,y,0],.065,'#66874a',leaf,.9);column('raised-cactus-arm',sign*.25,y-.025,0,.065,sign<0?.34:.46)}
  for(let i=0;i<n(35,12);i++){const a=i%7*Math.PI*2/7,y=.12+Math.floor(i/7)*.155;beam(`${s}-cactus-spine`,polar(.115,a,y),polar(.145,a+.02,y+.018),.003,cream,leaf,0)}
  flower('cactus-flower',0,.956,0,.055,'#dc8c9d',6)
 }
 else if(s==='bamboo'){
  for(let i=0;i<n(5,3);i++){
   const a=i*2.4,x=Math.cos(a)*.18,z=Math.sin(a)*.18,h=.72+(i%3)*.13
   for(let j=0;j<5;j++){const y=j*h/5;branch('hollow-looking-solid-culm',[x,y,z],[x,y+h/5,z],.024,'#82954f',.96);cylinder(`${s}-bamboo-node`,.028,.028,.014,x,y+.006,z,'#c0b978',leaf,low?6:10)}
   for(let j=1;j<n(4,3);j++){const y=j*h/4,sign=j%2?1:-1,end=[x+sign*.17,y+.12,z+.08];branch('bamboo-side-shoot',[x,y,z],end,.005,green,.2);for(let q=0;q<n(4,2);q++){const t=q/4,p=[x+(end[0]-x)*t,y+.12*t,z+.08*t];blade('bamboo-lanceolate-leaf',p,[p[0]+sign*.13,p[1]+.03,p[2]+(q%2?.05:-.05)],.020,green,.015)}}
  }
 }
 else if(s==='agave'||s==='aloe'){
  for(let tier=0;tier<2;tier++)for(let i=0;i<n(9,5);i++){
   const a=i*Math.PI*2/n(9,5)+tier*.35,r=.46-tier*.18,end=polar(r,a,.17+tier*.28),base=[0,.025,0]
   blade(s==='agave'?'pointed-agave-leaf':'fleshy-aloe-leaf',base,end,s==='agave'?.06:.075,s==='agave'?'#668a79':'#6c985d',tier?.04:.12,.022)
   if(!low)for(let j=1;j<=3;j++)for(const sign of [-1,1]){const t=j/4,p=polar(r*t,a,.025+(end[1]-.025)*t),angle=a+sign*1.57;branch('leaf-edge-tooth',[p[0]+Math.cos(angle)*.05,p[1],p[2]+Math.sin(angle)*.05],[p[0]+Math.cos(angle)*.065,p[1]+.012,p[2]+Math.sin(angle)*.065],.004,cream,0)}
  }
  if(s==='aloe'){
   branch('aloe-flower-stalk',[0,0,0],[.025,.94,0],.012,green,.5)
   for(let i=0;i<n(15,7);i++){const a=i*2.4,y=.61+i*.021;orb('tubular-aloe-flower',.025+Math.cos(a)*.045,y,Math.sin(a)*.045,.017,.039,.017,'#d39749')}
  }
 }
 else if(s==='pumpkin-patch'){
  tube(`${s}-trailing-pumpkin-vine`,[[-.45,.035,-.1],[-.19,.04,.18],[.15,.035,-.15],[.43,.04,.1]],.01,green,wood)
  for(let i=0;i<n(4,3);i++){
   const x=(i-1.5)*.22,z=Math.sin(i*2.4)*.18,r=.11+(i%2)*.045,g=new THREE.SphereGeometry(1,low?12:24,low?7:12),p=g.attributes.position
   for(let j=0;j<p.count;j++){const xx=p.getX(j),zz=p.getZ(j),a=Math.atan2(zz,xx),rr=1+.075*Math.cos(a*10);p.setXYZ(j,xx*rr,p.getY(j)*.72,zz*rr)}
   g.computeVertexNormals();g.name=`${s}-ribbed-pumpkin`;const part=mesh(g,i%2?'#bd7835':'#dc9b43',x,r*.74,z,leaf);part.scale.setScalar(r)
   tube(`${s}-pumpkin-stem`,[[x,r*1.39,z],[x+.015,r*1.65,z],[x+.045,r*1.67,z+.01]],.012,barkLight,wood)
  }
  for(let i=0;i<n(7,4);i++){const a=i*2.4,x=Math.cos(a)*.32,z=Math.sin(a)*.25;blade('broad-vine-leaf',[x*.6,.04,z*.6],[x,.10,z],.085,green,.035)}
 }
 else if(s==='cabbages'){
  for(let i=0;i<n(4,3);i++){
   const x=(i%2-.5)*.45,z=(Math.floor(i/2)-.5)*.42;orb('cabbage-heart',x,.14,z,.12,.14,.12,'#a0b96f',true)
   for(let j=0;j<n(9,5);j++){const a=j*2.4,r=.19-(j%3)*.022;blade('cupped-cabbage-leaf',[x,.04,z],[x+Math.cos(a)*r,.12+(j%3)*.038,z+Math.sin(a)*r],.105,j%2?'#84a66a':'#aac47e',.09,.012)}
  }
 }
 else if(s==='amber-root'||s==='driftwood'||s==='frozen-root'){
  const color=s==='driftwood'?'#c0b79c':s==='frozen-root'?'#8f9f9e':'#82623d'
  tube(`${s}-weathered-root-core`,[[-.44,.10,-.04],[-.19,.16,.03],[.08,.12,-.02],[.38,.21,.05]],.075,color,wood)
  for(let i=0;i<n(7,4);i++){
   const a=i*2.4,start=[(i%4-.5)*.13,.14,0],mid=polar(.29,a,.08+(i%3)*.1),end=polar(.46,a+.2,.025+(i%2)*.15)
   tube(`${s}-forked-root`,[start,mid,end],.026,color,wood);branch('root-tip',end,polar(.53,a+.28,.01+(i%2)*.11),.025,color,.02)
   if(!low)branch('weathered-grain',start,mid,.006,s==='driftwood'?'#8e8875':'#655844',.2)
  }
  if(s==='amber-root')for(let i=0;i<n(6,3);i++)orb('amber-inclusion',-.3+i*.11,.15+(i%2)*.045,.06,.046,.032,.025,'#d69a39',true)
  if(s==='frozen-root')for(let i=0;i<n(11,5);i++){const x=-.37+i*.069;orb('ice-crust',x,.19,Math.sin(i*2.4)*.06,.075,.025,.046,'#b3d9d7');const h=.04+(i%3)*.035;cylinder(`${s}-solid-icicle`,0,.014,h,x,.15-h*.5,.075,'#b3d9d7',leaf,low?4:6)}
 }
 else if(s==='nest'){
  lathe(`${s}-woven-nest-bowl`,[[0,.015],[.29,.015],[.43,.10],[.46,.24],[.42,.27],[.33,.18],[.24,.11],[0,.11]],0,0,0,'#8e784c',wood)
  for(let i=0;i<n(5,3);i++)growthRing('woven-twig-ring',.30+i*.029,0,.13+i*.025,0,'y',i%2?'#ac9463':'#6d593b')
  for(let i=0;i<n(20,9);i++){const a=i*2.4;branch('crosswoven-twig',polar(.25,a,.14),polar(.45,a+.55,.23),.008,i%2?barkLight:'#b19968',.65)}
  for(let i=0;i<3;i++){const a=i*2.1;ellipsoid(`${s}-bird-egg`,.073,.10,.073,Math.cos(a)*.1,.20,Math.sin(a)*.09,'#c4d2bc',leaf)}
 }
 else return false
 return k.finish()
}
