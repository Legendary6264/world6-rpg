import * as T from 'three'
import type { RenderEntity } from './scene3dModel'
import type { ModelMesh, Surface } from './scene3dMeshes'
import { characterModelFor } from './characterAppearance.ts'
import {populateCharacterPortrait} from './scene3dCharacterPortrait.ts'
import {finishCharacterSculpt} from './scene3dCharacterFinish.ts'
import { characterLoft, characterSweep, characterPatch } from './scene3dCharacterGeometry.ts'
import type { Point, Section, Sculpt } from './scene3dCharacterGeometry.ts'

const cloth:Surface={metalness:0,texture:'fabric',roughness:.92,normalStrength:.28}
const leather:Surface={metalness:0,texture:'leather',roughness:.74,normalStrength:.32}
const metal:Surface={texture:'steel',metalness:.82,roughness:.38,normalStrength:.18}
const skinSurface:Surface={metalness:0,texture:'skin',roughness:.73,normalStrength:.14}
const gauss=(a:number,b:number,s:number)=>Math.exp(-(((a-b)/s)**2))
type CharacterTemplatePart={geometry:T.BufferGeometry;color:string;surface?:Surface}
const characterTemplates=new Map<string,CharacterTemplatePart[]>()
export function clearCharacterModelCache(){for(const parts of characterTemplates.values())for(const p of parts)p.geometry.dispose();characterTemplates.clear()}

/** Four authored costume sculpts. All major surfaces are interpolated topology,
 * including the face, tailored limbs, articulated hands and thick folded cloth.
 * They share measured landmarks, not a pile of intersecting joint primitives.
 */
export function populateCharacter(e:RenderEntity,mesh:ModelMesh,low=false) {
  if(e.geometry.kind!=='actor'||!e.appearance.heightKnown)return false
  const g=e.geometry,key=JSON.stringify([characterModelFor(e.id??'figure',g.characterModel),g.width,g.depth,g.height,e.appearance.color,low])
  const cached=characterTemplates.get(key)
  if(cached){
    characterTemplates.delete(key);characterTemplates.set(key,cached)
    for(const p of cached)mesh(p.geometry.clone(),p.color,0,0,0,p.surface)
    return true
  }
  const original:{mesh:T.Mesh;color:string;surface?:Surface}[]=[]
  const result=buildCharacter(e,(geometry,color,x,y,z,surface)=>{const part=mesh(geometry,color,x,y,z,surface);original.push({mesh:part,color,surface});return part},low)
  if(result){
    characterTemplates.set(key,original.map(p=>{p.mesh.updateMatrix();return {geometry:p.mesh.geometry.clone().applyMatrix4(p.mesh.matrix),color:p.color,surface:p.surface}}))
    // Only immutable geometry lives in this bounded cache. Instances clone it,
    // so disposing a moved/hidden character never invalidates another instance.
    while(characterTemplates.size>12){const oldest=characterTemplates.keys().next().value!;for(const p of characterTemplates.get(oldest)!)p.geometry.dispose();characterTemplates.delete(oldest)}
  }
  return result
}

function buildCharacter(e:RenderEntity,mesh:ModelMesh,low=false) {
  if(e.geometry.kind!=='actor'||!e.appearance.heightKnown)return false
  const model=characterModelFor(e.id??'figure',e.geometry.characterModel),guard=model==='vanguard',mage=model==='arcanist',ranger=model==='ranger'
  const h=e.geometry.height,w=e.geometry.width,d=e.geometry.depth
  if(!(h>0&&w>0&&d>0))return false
  // A narrow gameplay footprint compresses the sculpt, never its collision data.
  const sx=Math.min(h,w/.48),sz=Math.min(h,d/.43),sy=h
  const tint=guard?'#364b61':ranger?'#405b43':mage?'#514464':'#695344'
  const lining=guard?'#4b292d':ranger?'#8b7958':mage?'#302d46':'#3b4f54'
  const skin=guard?'#bd9578':ranger?'#b58a6e':mage?'#c5aa91':'#b1856b'
  const hide='#4c3628',iron=guard?'#6f7f88':'#8c8e86',gold='#b29b62',dark='#242a30',stitch='#b6a383'
  const detail=low?.28:.85,radial=low?12:32
  const parts:T.Mesh[]=[]
  const add=(g:T.BufferGeometry,color:string,surface:Surface=cloth)=>{g.scale(sx,sy,sz);const part=mesh(g,color,0,0,0,surface);parts.push(part);return part}
  const loft=(name:string,sections:Section[],color:string,surface:Surface=cloth,sculpt?:Sculpt,steps=40)=>add(characterLoft(name,sections,radial,Math.max(8,Math.round(steps*detail)),sculpt),color,surface)
  const sweep=(name:string,points:Point[],radius:number|number[],color:string,surface:Surface=leather,flatten=1)=>add(characterSweep(name,points,typeof radius==='number'?[radius,radius]:radius,low?5:8,Math.max(5,Math.round((points.length*5)*detail)),flatten),color,surface)
  const patch=(name:string,point:(u:number,v:number)=>T.Vector3,color:string,surface:Surface=cloth,cols=28,rows=28,thickness=.0015)=>add(characterPatch(name,point,Math.max(8,Math.round(cols*detail)),Math.max(8,Math.round(rows*detail)),thickness),color,surface)
  const oval=(name:string,c:Point,r:Point,color:string,surface:Surface=leather)=>{
    const sections=Array.from({length:13},(_,i)=>{const phi=-Math.PI/2+i/12*Math.PI,k=Math.max(.005,Math.cos(phi));return [c[1]+Math.sin(phi)*r[1],r[0]*k,r[2]*k,c[0],c[2]] as Section})
    return add(characterLoft(name,sections,low?8:16,low?8:14),color,surface)
  }
  const ring=(name:string,c:Point,rx:number,rz:number,r:number,color=gold,surface=metal)=>sweep(name,Array.from({length:17},(_,i)=>[c[0]+Math.sin(i/16*Math.PI*2)*rx,c[1],c[2]+Math.cos(i/16*Math.PI*2)*rz] as Point),r,color,surface)
  const seam=(name:string,points:Point[],color=stitch,r=.0009)=>sweep(name,points,r,color,cloth)
  const folds:Sculpt=(p,a,t)=>{
    const amplitude=.0019*(.35+.65*gauss(t,.13,.2)),f=Math.cos(a*12+t*1.8)*amplitude+Math.sin(a*21-t*3)*.00065
    p.x+=Math.sin(a)*f;p.z+=Math.cos(a)*f
  }
  const baseH=Math.min(.014,.02/h)
  const base=mesh(new T.CylinderGeometry(w*.455,w*.465,baseH*h,low?24:64),dark,0,baseH*h/2,0,{metalness:.25,roughness:.63});base.scale.z=d/w
  const edge=mesh(new T.TorusGeometry(1,.009,6,low?24:64),e.appearance.color,0,baseH*h*.7,0,metal);edge.rotation.x=Math.PI/2;edge.scale.set(w*.45,d*.45,h*.08)
  // The waist, rib cage, clavicles and shoulder line are one tailored surface.
  loft('character-tailored-tunic',[[.475,.105,.069],[.49,.111,.070],[.53,.098,.065],[.565,.083,.051],[.61,.087,.055],[.66,.103,.061],[.715,.116,.065],[.755,.125,.061],[.785,.122,.053],[.806,.105,.044],[.828,.057,.034]],tint,cloth,folds)
  loft('character-neck',[[.809,.034,.031],[.831,.03,.03],[.855,.027,.027],[.879,.031,.03]],skin,skinSurface,undefined,18)
  loft('character-fitted-collar',[[.815,.047,.041],[.833,.043,.037],[.849,.035,.032],[.855,.031,.029]],guard?iron:mage?lining:ranger?lining:hide,guard?metal:mage||ranger?cloth:leather,(p,a,t)=>{
   const crease=Math.sin(a*9+t*2)*.0012*(1-t);p.x+=Math.sin(a)*crease;p.z+=Math.cos(a)*crease
  },22)
  ring('character-collar',[0,.851,0],.033,.031,.0018,guard||mage?gold:hide,guard||mage?metal:leather)
  // Lightly asymmetric legs and soft transitions at hip, patella and ankle.
  for(const side of [-1,1]) {
    const cx=side*.052,z=side===1?.009:-.004
    loft('character-trouser-leg',[[.095,.020,.022,cx,z],[.16,.024,.026,cx,z-.004],[.215,.028,.029,cx,z-.006],[.23,.031,.031,cx,z-.006],[.285,.034,.036,cx,z],[.315,.034,.038,cx,z+.004],[.37,.041,.044,cx,z-.002],[.43,.047,.048,cx,z-.006],[.49,.049,.052,cx,z-.002],[.52,.043,.045,cx,z]],dark,cloth,(p,a,t)=>{
      const crease=(gauss(p.y,.29,.035)*.0035*Math.sin(a*5+p.y*155)+gauss(p.y,.39,.1)*.0012*Math.cos(a*9+t*5));p.z+=Math.cos(a)*crease;p.x+=Math.sin(a)*crease
    })
    const boot=side===1?.008:-.004
    loft('character-boot',[[baseH+.011,.033,.07,cx,.03+boot],[.035,.035,.073,cx,.032+boot],[.05,.033,.064,cx,.028+boot],[.065,.029,.047,cx,.016+boot],[.09,.024,.031,cx,boot],[.14,.027,.032,cx,boot],[.195,.032,.036,cx,boot],[.225,.032,.035,cx,boot]],hide,leather,(p,a)=>{p.z+=gauss(p.y,.1,.045)*Math.cos(a*5+p.y*120)*.0016})
    loft('character-boot-welt',[[baseH+.004,.033,.072,cx,.032+boot],[baseH+.008,.037,.075,cx,.032+boot],[baseH+.014,.035,.074,cx,.032+boot]],'#282622',leather,undefined,10)
    loft('character-boot-heel',[[baseH,.028,.023,cx,-.015+boot],[baseH+.01,.029,.025,cx,-.015+boot]],dark,leather,undefined,8)
    ring('character-boot-cuff',[cx,.224,boot],.033,.036,.0028,hide,leather)
    for(const y of [.153,.202]){
      ring('character-boot-strap',[cx,y,boot],.03,.035,.003,hide,leather)
      oval('character-boot-buckle',[cx+side*.03,y,.008+boot],[.003,.006,.006],gold,metal)
    }
    seam('character-boot-seam',[[cx-side*.024,.05,.073+boot],[cx-side*.019,.09,.027+boot],[cx-side*.024,.145,.027+boot],[cx-side*.028,.22,.028+boot]],stitch,.00075)
    if(!low)for(let i=0;i<5;i++){
      const y=.071+i*.012,zf=.052-i*.004
      seam('character-boot-laces',[[cx-.012,y,zf+boot],[cx+.012,y+.007,zf-.002+boot]],'#a99574',.0011)
    }
    const armX=(y:number)=>side*(.142+Math.sin((.805-y)/.32*Math.PI)*.017)
    loft('character-tailored-sleeve',[[.521,.024,.026,armX(.521),.014],[.56,.029,.03,armX(.56),.012],[.61,.032,.034,armX(.61),.008],[.639,.03,.033,armX(.639),.004],[.67,.038,.038,armX(.67),0],[.72,.04,.043,armX(.72),-.002],[.765,.043,.042,armX(.765),-.003],[.8,.031,.031,side*.126,-.005]],mage?lining:tint,cloth,(p,a)=>{const f=.002*gauss(p.y,.63,.035)*Math.cos(a*6+p.y*152);p.z+=Math.cos(a)*f;p.x+=Math.sin(a)*f})
    loft('character-bracer',[[.504,.024,.028,armX(.521),.018],[.514,.027,.031,armX(.53),.016],[.54,.029,.032,armX(.54),.014],[.575,.031,.034,armX(.575),.011],[.584,.029,.032,armX(.584),.01]],guard?iron:hide,guard?metal:leather,undefined,20)
    for(const y of [.516,.571])ring('character-bracer-rim',[armX(y),y,.014],.029,.033,.002,guard?gold:hide,guard?metal:leather)
    // Palm, knuckle plane, independently tapered three-joint fingers and thumb.
    const hx=side*.148,hy=.497
    loft('character-hand-palm',[[hy-.027,.017,.009,hx,.02],[hy-.019,.02,.012,hx,.021],[hy+.002,.019,.013,hx,.018],[hy+.017,.013,.011,hx,.017]],skin,skinSurface,(p,a)=>{p.z+=Math.max(0,Math.cos(a))*.001*gauss(p.y,hy-.015,.008)},20)
    for(let i=0;i<4;i++){
      const x=hx+(i-1.5)*.0101,length=[.034,.044,.041,.031][i],start=hy-.019
      sweep('character-finger',[[x,start,.022],[x,start-.011,.025],[x+side*.001,start-length*.7,.03],[x+side*.0015,start-length,.032]],[.0047,.0046,.0038,.0026],skin,skinSurface)
      if(!low){
        oval('character-fingernail',[x+side*.0014,start-length+.004,.035],[.0028,.004,.00065],'#d6b7a0',skinSurface)
        seam('character-knuckle-crease',[[x-.003,start-.015,.029],[x,start-.016,.03],[x+.003,start-.015,.029]],'#9b6f58',.0004)
      }
    }
    sweep('character-thumb',[[hx-side*.014,hy+.002,.019],[hx-side*.028,hy-.008,.024],[hx-side*.031,hy-.023,.032],[hx-side*.025,hy-.034,.034]],[.0075,.006,.005,.0036],skin,skinSurface)
  }
  populateCharacterPortrait(model,add,low)
  // Real wrapping belt, an open rectangular buckle and separately sewn pouches.
  const beltProfile:Section[]=[[.525,.113,.084],[.532,.106,.079],[.549,.096,.064],[.554,.094,.061]]
  const beltFront=(x:number,y:number)=>{
    let i=1;while(i<beltProfile.length-1&&beltProfile[i][0]<y)i++
    const a=beltProfile[i-1],b=beltProfile[i],t=T.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1),rx=T.MathUtils.lerp(a[1],b[1],t),rz=T.MathUtils.lerp(a[2],b[2],t)
    return Math.sqrt(Math.max(0,1-(x/rx)**2))*rz+.002
  }
  loft('character-leather-belt',beltProfile,hide,leather,undefined,18)
  const buckle:Point[]=[[-.014,.531],[-.014,.551],[.014,.551],[.014,.531],[-.014,.531]].map(([x,y])=>[x,y,beltFront(x,y)])
  sweep('character-belt-buckle',buckle,.0022,gold,metal)
  sweep('character-buckle-tongue',[[0,.534,beltFront(0,.534)],[0,.543,beltFront(0,.543)+.001],[0,.549,beltFront(0,.549)]],.0012,gold,metal)
  for(const side of [-1,1]) {
    const px=side*.091
    loft('character-sewn-pouch',[[.464,.014,.013,px,.032],[.47,.026,.021,px,.033],[.495,.028,.022,px,.034],[.52,.024,.018,px,.033],[.529,.017,.015,px,.031]],hide,leather,undefined,20)
    patch('character-pouch-flap',(u,v)=>new T.Vector3(px+(u-.5)*.052,.524-v*.029,.043+.014*Math.sin(v*Math.PI*.7)*Math.sin(u*Math.PI)),hide,leather,16,12)
    oval('character-pouch-clasp',[px,.504,.058],[.003,.004,.0015],gold,metal)
    if(!low)seam('character-pouch-stitch',[[px-.022,.496,.051],[px-.019,.472,.049],[px+.019,.472,.049],[px+.022,.496,.051]],stitch,.00065)
  }
  if(guard) {
    // Convex shaped cuirass with ridge, rolled rim and overlapping fauld plates.
    const chest=(u:number,v:number)=>{
      const x=(u-.5)*2,y=.573+v*.225-.013*(1-x*x)*v**5,rx=.086+.028*Math.sin(v*Math.PI*.82)-.01*gauss(v,1,.18)
      return new T.Vector3(x*rx,y,.023+Math.sqrt(Math.max(0,1-x*x))*(.039+.006*Math.sin(v*Math.PI))+.006*gauss(x,0,.16))
    }
    patch('character-forged-cuirass',chest,iron,metal,36,36,.0035)
    if(!low){
      const inlay=(points:Point[])=>points.map(([x,y])=>{const v=T.MathUtils.clamp((y-.573)/.225,0,1),rx=.086+.028*Math.sin(v*Math.PI*.82)-.01*gauss(v,1,.18),p=chest(.5+x/(rx*2),v);p.z+=.0009;return p.toArray() as Point})
      for(const side of [-1,1])for(let i=0;i<3;i++)sweep('character-cuirass-engraving',inlay([[side*.008,.674+i*.017,0],[side*(.028+i*.005),.687+i*.018,0],[side*(.045+i*.006),.678+i*.019,0]]),[.0004,.00065,.00025],gold,metal)
      sweep('character-cuirass-heraldry',inlay([[0,.657,0],[0,.71,0],[0,.746,0]]),[.0008,.001,.0005],gold,metal)
    }
    for(const u of [0,1])sweep('character-cuirass-rolled-edge',Array.from({length:10},(_,i)=>chest(u,i/9).toArray() as Point),.0021,gold,metal)
    sweep('character-cuirass-neck-edge',Array.from({length:15},(_,i)=>chest(i/14,1).toArray() as Point),.0024,gold,metal)
    for(let i=0;i<3;i++)patch('character-articulated-fauld',(u,v)=>{
      const x=(u-.5)*2,a=x*1.35;return new T.Vector3(Math.sin(a)*(.099+i*.003),.572-i*.023-v*.021,.005+Math.cos(a)*(.064+i*.002))
    },iron,metal,30,8,.002)
    for(const side of [-1,1])for(let i=0;i<3;i++) {
      const point=(u:number,v:number)=>{const a=u*Math.PI*2,phi=(i===0?.03:.85)+v*(i===0?1.56:.75),r=.056-i*.002;return new T.Vector3(side*(.132+i*.002+Math.sin(phi)*Math.cos(a)*r),.77-i*.016+Math.cos(phi)*.052-.002*Math.cos(a*2)*Math.sin(phi),Math.sin(a)*Math.sin(phi)*(.05-i*.001))}
      patch('character-lamellar-pauldron',point,iron,metal,24,12,.002)
      sweep('character-pauldron-edging',Array.from({length:13},(_,j)=>point(j/12,1).toArray() as Point),.0018,gold,metal)
    }
    for(const side of [-1,1]){
      patch('character-kneecap',(u,v)=>{const a=(u-.5)*2.2,b=(v-.5)*2.5;return new T.Vector3(side*.052+Math.sin(a)*.035,.296+Math.sin(b)*.033,.043+Math.cos(a)*Math.cos(b)*.022)},iron,metal,20,16,.002)
      if(!low)for(let i=0;i<4;i++)oval('character-cuirass-rivet',[(i-1.5)*.045,.788,.051-Math.abs(i-1.5)*.009],[.0018,.0018,.0013],gold,metal)
    }
  } else {
    // The front vest is tailored to the same rib cage, with an actual V opening.
    for(const side of [-1,1])patch('character-tailored-vest',(u,v)=>{
      const edge=.018+.022*v,outer=.093+.019*Math.sin(v*Math.PI*.8),x=side*(edge+u*(outer-edge)),y=.556+v*.24
      return new T.Vector3(x,y,.026+Math.sqrt(Math.max(0,1-(x/(outer+.004))**2))*.039)
    },mage?lining:hide,mage?cloth:leather,20,28,.0025)
    for(let i=0;i<6;i++){
      const y=.592+i*.026,z=.069-i*.0003
      sweep('character-vest-lacing',[[-.022,y,z],[.023,y+.013,z],[.024,y+.016,z-.001]],.0012,stitch,leather)
    }
    // Convincing wrist/collar fabric folds and separated hanging coat panels.
    for(const side of [-1,1])patch('character-coat-skirt',(u,v)=>{
      const a=side*(.15+u*1.9),y=.529-v*(mage?.39:.14),r=(mage?.105:.108)+v*(mage?.035:.018),f=Math.cos(u*18+v)*.004*v
      return new T.Vector3(Math.sin(a)*(r+f),y+Math.sin(u*8)*.004*v,Math.cos(a)*(r*(mage?.74:.73)+f))
    },mage?tint:hide,mage?cloth:leather,24,mage?36:18,.002)
  }
  if(mage) {
    // A split robe leaves the feet legible and does not merge into a cone.
    loft('character-pleated-robe',[[.095,.106,.063,0,-.003],[.14,.123,.074,0,-.008],[.24,.120,.075,0,-.007],[.35,.118,.075],[.46,.122,.077],[.526,.104,.066]],tint,cloth,(p,a,t)=>{
      const fold=(.0045*Math.cos(a*14+t*.8)+.0015*Math.sin(a*27))*(1-t*.55);p.x+=Math.sin(a)*fold;p.z+=Math.cos(a)*fold
      if(Math.cos(a)>.92&&p.y<.38)p.y+=gauss(a,0,.35)*(.38-p.y)*.55
    },60)
    for(const side of [-1,1])sweep('character-robe-brocade',[[side*.045,.12,.057],[side*.04,.24,.063],[side*.035,.38,.064],[side*.03,.52,.061]],.0025,gold,metal)
    const staffX=.206
    sweep('character-carved-staff',[[staffX,.018,.015],[staffX-.004,.28,.009],[staffX+.004,.54,.01],[staffX,.8,.009],[staffX,.918,.01]],[.007,.006,.007,.005],hide,leather)
    for(const y of [.085,.57,.605,.86,.895])ring('character-staff-ferrule',[staffX,y,.01],.008,.008,.0018,gold,metal)
    const crystal=new T.OctahedronGeometry(.021,0);crystal.scale(.7,1.5,.7);crystal.translate(staffX,.952,.01);crystal.name='character-staff-crystal';add(crystal,'#739ca3',{metalness:.25,roughness:.23,clearcoat:.8})
    for(const side of [-1,1])sweep('character-staff-prong',[[staffX+side*.007,.898,.01],[staffX+side*.022,.929,.01],[staffX+side*.019,.963,.01],[staffX+side*.007,.979,.01]],[.003,.0028,.001],gold,metal)
  } else if(guard) {
    // A fully sheathed sidearm: the preset is cosmetic, not an inventory item.
    const sword:Point[]=[[-.117,.215,-.005],[-.125,.36,-.004],[-.139,.535,-.003]]
    sweep('character-sword-scabbard',sword,[.007,.01,.011],hide,leather,.48)
    sweep('character-sword-grip',[[-.139,.535,-.003],[-.148,.605,-.003]],[.006,.005],dark,leather)
    sweep('character-sword-guard',[[-.165,.537,-.003],[-.14,.542,-.003],[-.115,.539,-.003]],.003,gold,metal)
    oval('character-sword-pommel',[-.149,.607,-.003],[.008,.007,.006],gold,metal)
    if(!low)for(let i=0;i<7;i++)ring('character-sword-grip-wrap',[-.14-i*.0011,.546+i*.007,-.003],.006,.004,.0008,stitch,leather)
  } else {
    sweep('character-shoulder-strap',[[-.09,.795,.036],[-.06,.74,.067],[-.005,.646,.067],[.062,.55,.064],[.085,.51,.055]],[.006,.006],hide,leather,.24)
    for(const x of [-.006,.006])seam('character-strap-stitch',[[-.09+x,.793,.039],[-.06+x,.74,.07],[-.005+x,.646,.07],[.062+x,.55,.067]],stitch,.00065)
    if(!ranger){
      loft('character-satchel',[[.41,.028,.016,.113,-.026],[.42,.041,.025,.113,-.026],[.481,.041,.025,.113,-.026],[.5,.032,.019,.113,-.026]],hide,leather,undefined,24)
      ring('character-satchel-fastener',[.113,.476,-.002],.008,.003,.0015,gold,metal)
    } else {
      // Rolled bedroll with the visible fabric spiral and two binding straps.
      const roll=loft('character-bedroll',[[0,.026,.026],[.055,.028,.028],[.13,.028,.028],[.18,.025,.025]],lining,cloth,folds,20)
      // Geometry was authored upright; rotate in local normalized coordinates.
      roll.geometry.scale(1/sx,1/sy,1/sz);roll.geometry.rotateZ(Math.PI/2);roll.geometry.translate(.09,.72,-.091);roll.geometry.scale(sx,sy,sz)
      for(const x of [-.055,.055])sweep('character-bedroll-binding',Array.from({length:17},(_,i)=>[x,.72+Math.sin(i/16*Math.PI*2)*.029,-.091+Math.cos(i/16*Math.PI*2)*.029] as Point),.003,hide,leather)
      if(!low)sweep('character-bedroll-spiral',Array.from({length:30},(_,i)=>{const a=i/29*Math.PI*5,r=.025*(1-i/33);return [.092,.72+Math.sin(a)*r,-.091+Math.cos(a)*r]}),.0013,stitch,cloth)
    }
  }
  // Drape across the clavicles, then a broad weighty cape with a lining, folded
  // hem and individually modelled embroidered seams. Last mesh is the cape.
  const capePoint=(u:number,v:number)=>{
    const a=(u-.5)*(ranger?3.8:3.5),radius=.12+v*(mage?.043:.045),fold=Math.cos(u*Math.PI*12+.35+v*.7)*(.0015+v*.006)+.0018*Math.sin(u*31-v*3)*v
    const asym=(ranger?.027:mage?.006:.016)*Math.sin(a+.35)*v,scallop=.009*Math.cos(u*Math.PI*6)*v*v
    return new T.Vector3(Math.sin(a)*(radius+fold),.79-v*(ranger?.37:mage?.61:.5)+asym+scallop,-Math.cos(a)*(.059+v*.042+fold)-.014)
  }
  for(const side of [-1,1]){
    const c=side<0?0:1
    sweep('character-cape-piped-edge',Array.from({length:16},(_,i)=>capePoint(c,i/15).toArray() as Point),.0019,mage?gold:stitch,mage?metal:cloth)
  }
  sweep('character-cape-weighted-hem',Array.from({length:31},(_,i)=>capePoint(i/30,1).toArray() as Point),.002,mage?gold:lining,mage?metal:cloth)
  const mantlePoint=(u:number,v:number)=>{
    const a=guard?Math.PI+(u-.5)*3.4:ranger?.3+u*(Math.PI*2-.6):.10+u*(Math.PI*2-.2)
    const fold=Math.cos(a*9+.4)*.0035*v+.0012*Math.sin(a*15)*(1-v),r=(guard?.038:.045)+v*(guard?.125:.17)+fold
    const sag=.087+(ranger?.023:mage?.008:.016)*Math.sin(a+.4)-.014*Math.cos(a*2)
    return new T.Vector3(Math.sin(a)*(r+.002*v),.842-v*sag+fold*.3,Math.cos(a)*(.051+v*.070+fold))
  }
  patch('character-shoulder-mantle',mantlePoint,mage?lining:tint,cloth,40,20,.002)
  sweep('character-mantle-hem',Array.from({length:29},(_,i)=>mantlePoint(i/28,1).toArray() as Point),.0015,mage?gold:lining,mage?metal:cloth)
  if(ranger){
    // An open, lined hood has a different silhouette from the other costumes.
    const hood=(u:number,v:number)=>{const a=.82+u*(Math.PI*2-1.64),phi=.12+v*2.07,fold=Math.cos(a*9)*.0012*v;return new T.Vector3(Math.sin(a)*Math.sin(phi)*(.061+fold),.926+Math.cos(phi)*.072,Math.cos(a)*Math.sin(phi)*.058-.005)}
    patch('character-ranger-hood',hood,tint,cloth,36,28,.003)
    for(const u of [0,1])sweep('character-hood-edging',Array.from({length:15},(_,i)=>hood(u,i/14).toArray() as Point),.002,lining,cloth)
  }
  oval('character-cape-brooch',[-.051,.794,.059],[.008,.009,.0025],gold,metal)
  if(!low)for(let i=0;i<20;i++){
    const p=capePoint((i+.3)/20,.974),q=capePoint((i+.65)/20,.974);p.z-=.0015;q.z-=.0015
    seam('character-cape-embroidery',[p.toArray() as Point,q.toArray() as Point],mage?gold:stitch,.0007)
  }
  patch('character-lined-cape',capePoint,guard?lining:tint,cloth,40,44,.003)
  finishCharacterSculpt(parts,model,{sx,sy,sz})
  return true
}
