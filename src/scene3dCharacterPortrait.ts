import * as T from 'three'
import type {Surface} from './scene3dMeshes'
import type {CharacterModelId} from './characterAppearance'
import {characterLoft,characterPatch,characterSweep} from './scene3dCharacterGeometry.ts'
import type {Section,Point} from './scene3dCharacterGeometry.ts'

type Add=(geometry:T.BufferGeometry,color:string,surface:Surface)=>T.Mesh
const g=(a:number,b:number,s:number)=>Math.exp(-(((a-b)/s)**2))
const skinMat:Surface={texture:'skin',metalness:0,roughness:.68,normalStrength:.12}
const hairMat:Surface={metalness:0,roughness:.82}
const eyeMat:Surface={metalness:0,roughness:.25,clearcoat:.22}

/** Shared anatomical landmarks, with individually authored jaws, cheeks, nose
 * profiles and hair. Nose and orbital transitions belong to the head topology.
 */
export function populateCharacterPortrait(model:CharacterModelId,add:Add,low=false){
 const guard=model==='vanguard',mage=model==='arcanist',ranger=model==='ranger'
 const skin=guard?'#bd9578':ranger?'#b58a6e':mage?'#c5aa91':'#b1856b'
 const hair=guard?'#302b26':ranger?'#4f3826':mage?'#b9b7a7':'#392c24'
 const skinShade=guard?'#9e725b':ranger?'#956f58':mage?'#a18b79':'#946a54'
 const lip=guard?'#9c6c5c':ranger?'#a47668':mage?'#a98b7a':'#a57463'
 const jaw=guard?1.06:mage?.85:ranger?.92:1.02,cheek=guard?1.02:mage?.92:ranger?.94:1.04
 const nose=guard?1.06:mage?1.13:ranger?.89:.96
 const count=(n:number)=>Math.max(6,Math.round(n*(low?.38:1)))
 const sweep=(name:string,points:Point[],r:number|number[],color=skin,surface:Surface=skinMat,flatten=1)=>add(characterSweep(name,points,typeof r==='number'?[r,r]:r,low?5:8,count(points.length*4),flatten),color,surface)
 const patch=(name:string,point:(u:number,v:number)=>T.Vector3,color=skin,surface:Surface=skinMat,c=24,r=16,thickness=.0009)=>add(characterPatch(name,point,count(c),count(r),thickness),color,surface)
 const oval=(name:string,c:Point,r:Point,color=skin,surface:Surface=skinMat)=>{
  const rings=Array.from({length:11},(_,i)=>{const a=-Math.PI/2+i/10*Math.PI,k=Math.max(.003,Math.cos(a));return [c[1]+Math.sin(a)*r[1],r[0]*k,r[2]*k,c[0],c[2]] as Section})
  return add(characterLoft(name,rings,low?8:16,low?8:14),color,surface)
 }
 const sections:Section[]=[
  [.855,.012,.019,0,.005],[.862,.025*jaw,.028,0,.006],[.877,.036*jaw,.034,0,.005],
  [.893,.041*cheek,.037,0,.003],[.913,.045*cheek,.039,0,.001],[.931,.046*cheek,.04],
  [.949,.045*cheek,.039],[.967,.044*cheek,.038],[.982,.035,.033],[.991,.022,.023],[.995,.003,.004],
 ]
 const sculpt=(p:T.Vector3,a:number)=>{
  const f=Math.max(0,Math.cos(a)),x=p.x,y=p.y
  // Continuous nose: bridge, rounded tip, paired alar wings and columella.
  const bridge=.0085*nose*g(x,0,.0058)*g(y,.939,.017)
  const tip=.0092*nose*g(x,0,.0074)*g(y,.925,.0068)
  const wings=.0045*g(Math.abs(x),.0067*nose,.0035)*g(y,.922,.004)
  const cheekbone=.0047*g(Math.abs(x),.027*cheek,.011)*g(y,.920,.013)
  const orbit=-.0043*g(Math.abs(x),.019,.0095)*g(y,.940,.0065)
  const brow=.0038*g(Math.abs(x),.018,.013)*g(y,.950,.006)
  const muzzle=.0026*g(x,0,.019)*g(y,.903,.009),chin=.0037*g(x,0,.021)*g(y,.875,.009)
  const philtrum=-.0009*g(x,0,.0025)*g(y,.910,.004)
  const aged=mage?-.00075*(g(y,.960,.0009)+g(y,.966,.0009))*g(x,0,.031):0
  p.z+=f**4*(bridge+tip+wings+cheekbone+orbit+brow+muzzle+chin+philtrum+aged)
  // Slightly set-back temples and an angular mandibular corner for the guard.
  p.x*=1+(guard?.025:-.012)*g(y,.879,.012)*Math.abs(Math.sin(a))
 }
 const head=characterLoft('character-sculpted-head',sections,low?24:72,low?32:84,sculpt)
 add(head,skin,skinMat)
 // Evaluate the actual sculpt when seating beard, lashes and age creases.
 const headPoint=(y:number,a:number)=>{
  let i=1;while(i<sections.length-1&&sections[i][0]<y)i++
  const s=sections[i-1],q=sections[i],f=T.MathUtils.clamp((y-s[0])/(q[0]-s[0]),0,1)
  const p=new T.Vector3(Math.sin(a)*T.MathUtils.lerp(s[1],q[1],f),y,T.MathUtils.lerp(s[4]??0,q[4]??0,f)+Math.cos(a)*T.MathUtils.lerp(s[2],q[2],f))
  sculpt(p,a);return p
 }
 for(const side of [-1,1]){
  const ex=side*.0187,eyeY=mage?.9405:.941,slant=ranger?.0017:guard?-.0008:.0006
  const eyePoint=(u:number,v:number)=>{
   const q=u-.5,round=Math.sin(u*Math.PI),x=ex+q*.0205,rx=T.MathUtils.lerp(.046,.045,(eyeY-.931)/.018)*cheek
   const z=headPoint(eyeY,Math.asin(T.MathUtils.clamp(x/rx,-.99,.99))).z+.0005
   return new T.Vector3(x,eyeY+(v-.5)*(mage?.006:.0066)*round+side*q*slant,z+.0036*round*Math.sin(v*Math.PI))
  }
  const irisZ=eyePoint(.5,.5).z+.00025
  patch('character-eye-white',eyePoint,'#c9c6ae',eyeMat,20,10,.0007)
  const irisColor=guard?'#6b624b':ranger?'#557065':mage?'#748a91':'#78634c'
  oval('character-iris',[ex,eyeY,irisZ],[.003,.0031,.0006],irisColor,eyeMat)
  oval('character-pupil',[ex,eyeY,irisZ+.0006],[.00135,.0018,.00035],'#18201e',eyeMat)
  if(!low)oval('character-eye-catchlight',[ex-.0008,eyeY+.001,irisZ+.001],[.00045,.00045,.0002],'#ede9d8',eyeMat)
  for(const upper of [true,false])sweep('character-eyelid',Array.from({length:7},(_,i)=>{const p=eyePoint(i/6,upper?1:0);p.z+=.0005;return p.toArray() as Point}),upper?.00115:.0008)
  const browPoint=(u:number)=>{
   const q=u-.5,x=ex+q*.024,y=.9515+Math.sin(u*Math.PI)*(guard?.0005:.0017)-side*q*.0015
   const p=headPoint(y,Math.asin(T.MathUtils.clamp(x/(.045*cheek),-.99,.99)));p.x=x;p.z+=.001;return p
  }
  sweep('character-eyebrow',Array.from({length:7},(_,i)=>browPoint(i/6).toArray() as Point),[.0006,.0016,.0017,.00045],hair,hairMat,.65)
  if(!low){
   const crease=Array.from({length:7},(_,i)=>{const p=eyePoint(i/6,1);p.y+=.0022;p.z-=.0002;return p.toArray() as Point})
   sweep('character-upper-lid-crease',crease,.0003,skinShade,skinMat)
   if(mage)for(let i=0;i<2;i++)sweep('character-age-crease',[[side*.028,.938-i*.002],[side*.034,.937-i*.0025],[side*.037,.936-i*.003]].map(([x,y])=>{const p=headPoint(y,Math.asin(x/(.0458*cheek)));p.x=x;p.z+=.0004;return p.toArray() as Point}),[.00015,.00025,.0001],skinShade,skinMat)
  }
  const nx=side*.0059*nose,nostril=headPoint(.9215,Math.asin(nx/(.0456*cheek)))
  oval('character-nostril',[nx,.9215,nostril.z+.0003],[.0016,.0007,.00045],skinShade,skinMat)
  // A folded, recessed pinna rather than a flat disk attached to the temple.
  const ear=(u:number,v:number)=>{
   const a=u*Math.PI*2,r=.12+v*.88,helix=.0028*g(v,.83,.13)
   return new T.Vector3(side*(.044*cheek+.006*r+helix),.925+Math.sin(a)*.0145*r,.0005+Math.cos(a)*.0085*r)
  }
  patch('character-ear',ear,skin,skinMat,24,12,.001)
  oval('character-ear-tragus',[side*(.044*cheek+.002),.921,.006],[.002,.0032,.002])
 }
 // Vermilion volumes meet at a fine oral crease and blend into the philtrum.
 for(const upper of [true,false])patch(upper?'character-upper-lip':'character-lower-lip',(u,v)=>{
  const x=(u-.5)*.027,s=Math.sin(u*Math.PI),cupid=.0007*Math.cos((u-.5)*Math.PI*4)*s
  return new T.Vector3(x,.9018+cupid+(upper?1:-1)*v*(upper?.0023:.0032)*s,.041+(.0039+v*.0006)*s-Math.abs(x)*.16)
 },lip,skinMat,24,8,.00065)
 sweep('character-mouth',[[-.013,.9018,.0395],[-.006,.9021,.044],[0,.9014,.045],[.006,.9021,.044],[.013,.9018,.0395]],[.00025,.0004,.00025],'#704e44',skinMat)
 if(!low)for(const side of [-1,1])sweep('character-philtrum',[[side*.0022,.914,.045],[side*.002,.908,.0458],[side*.003,.905,.046]],[.0002,.00045,.00025])

 const hairPoint=(u:number,v:number)=>{
  const a=u*Math.PI*2,front=Math.max(0,Math.cos(a)),back=Math.max(0,-Math.cos(a))
  const hairline=guard?1.31+.12*Math.sin(a*3):mage?1.1+.15*Math.sin(a*2):ranger?1.38+.12*Math.sin(a*2):1.43+.23*Math.sin(a)+.10*Math.sin(a*3)
  const phi=v*(hairline+.74*back),wave=(guard?.0012:mage?.0018:.003)*Math.sin(a*6+phi*2.2)*Math.sin(phi)**2
  return new T.Vector3(Math.sin(a)*Math.sin(phi)*(.055+wave)+(guard?0:.0015*Math.sin(phi*2)),.953+Math.cos(phi)*.046+wave*.4+(guard?.0005:0)*front*Math.sin(phi),Math.cos(a)*Math.sin(phi)*(.050+wave)-.002)
 }
 patch('character-hair-cap',hairPoint,hair,hairMat,56,24,.0018)
 if(!low)for(let i=0;i<(guard?34:26);i++){
  const a=i/(guard?34:26)*Math.PI*2,swing=guard?.12:mage?-.08:.4
  const points=Array.from({length:7},(_,j)=>{const v=.13+j*.137,p=hairPoint((a+swing*(1-v)**1.3)/(Math.PI*2),v);p.x*=1.009;p.z*=1.012;return p.toArray() as Point})
  sweep('character-hair-lock',points,[.0003,.0016,.0017,.0003],i%7===0?(mage?'#d0cbb8':guard?'#433b30':'#6b4d33'):hair,hairMat,.4)
 }
 if(mage){
  const curtain=(u:number,v:number)=>{
   const a=1+u*(Math.PI*2-2),r=.050-.006*v+.003*Math.sin(u*39+v*4),tip=.010*Math.sin(u*19)**2
   return new T.Vector3(Math.sin(a)*r,.958-v*(.126+tip),Math.cos(a)*r-.012+.004*Math.sin(u*5)*v)
  }
  patch('character-layered-long-hair',curtain,hair,hairMat,44,32,.003)
  if(!low)for(let i=0;i<20;i++)sweep('character-long-hair',Array.from({length:7},(_,j)=>{const p=curtain((i+.4)/20,j/6);p.x*=1.018;p.z-=.0008;return p.toArray() as Point}),[.0018,.0023,.0015,.0002],i%5===0?'#d0cbb8':hair,hairMat,.55)
 }
 if(guard||model==='wayfarer'){
  const beardPoint=(u:number,v:number)=>{
   const a=(u-.5)*2.8,top=.894+.021*Math.abs(Math.sin(a))**1.4,bottom=.859+.014*Math.abs(Math.sin(a))**1.5
   const p=headPoint(T.MathUtils.lerp(top,bottom,v),a),offset=.0012+.0009*Math.sin(v*Math.PI)
   p.x+=Math.sin(a)*offset;p.z+=Math.cos(a)*offset;return p
  }
  patch('character-sculpted-beard',beardPoint,guard?hair:'#5a4333',hairMat,36,22,.0008)
  if(!low)for(let i=0;i<36;i++){
   const u=(i+.5)/36
   sweep('character-beard-lock',Array.from({length:5},(_,j)=>{const p=beardPoint(u,.08+j*.2);p.z+=.0007;return p.toArray() as Point}),[.0003,.0008,.0006,.0001],i%5===0?'#63503b':hair,hairMat,.6)
  }
  for(const side of [-1,1])sweep('character-moustache',[[side*.003,.911,.048],[side*.008,.9105,.047],[side*.014,.906,.0425]],[.0006,.0014,.0004],hair,hairMat,.5)
 }
 return {skin,skinSurface:skinMat}
}
