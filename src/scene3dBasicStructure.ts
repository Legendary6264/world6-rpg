import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'

const stone:Surface={texture:'stone',roughness:.94}
const tones=['#a6a28f','#b5ae99','#979785','#c1b8a3']

// A closed ashlar with octagonal bevels and slightly hollow dressed faces on
// both sides. The relief is geometric and remains visible without a normal map.
function dressedStone(w:number,h:number,d:number,phase:number,low:boolean){
 const corners=[[-1,-.8],[-.82,-1],[.82,-1],[1,-.8],[1,.8],[.82,1],[-.82,1],[-1,.8]]
 const rings=low?[[-.5,.93],[-.39,1],[.39,1],[.5,.93]]:[[-.5,.9],[-.47,.96],[-.36,1],[0,1],[.36,1],[.47,.96],[.5,.9]]
 const positions:number[]=[],uv:number[]=[],indices:number[]=[],stride=corners.length
 for(const [z,scale] of rings)for(let j=0;j<stride;j++){
  const [x,y]=corners[j],chip=low?1:1-.025*(.5+.5*Math.sin(phase*13+j*7.37))
  positions.push(x*w*.5*scale*chip,y*h*.5*scale*chip,z*d);uv.push(x*.5+.5,y*.5+.5)
 }
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<stride;j++){
  const a=i*stride+j,b=i*stride+(j+1)%stride,c=a+stride,e=b+stride
  indices.push(a,b,c,b,e,c)
 }
 for(const side of [0,1]){
  const center=positions.length/3,offset=side?(rings.length-1)*stride:0
  positions.push(0,0,(side?.5:-.5)*d*(low?1:.94));uv.push(.5,.5)
  for(let j=0;j<stride;j++){const a=offset+j,b=offset+(j+1)%stride;side?indices.push(center,a,b):indices.push(center,b,a)}
 }
 const g=new THREE.BufferGeometry();g.name='basic-dressed-stone';g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
}

// Flat rectangular top and stepped edges. Unlike a rounded box, the complete
// saved support rectangle remains an uninterrupted horizontal standing plane.
function deckProfile(w:number,d:number,h:number,low:boolean){
 const levels=low?[[.88,.82],[1,.93],[1,1]]:[[.86,.8],[.86,.825],[.94,.86],[.94,.89],[1,.935],[1,.975],[1,1]]
 const positions:number[]=[],uv:number[]=[],indices:number[]=[]
 for(const [scale,y] of levels)for(const [x,z] of [[-1,-1],[-1,1],[1,1],[1,-1]]){
  positions.push(x*w*.5*scale,y*h,z*d*.5*scale);uv.push(x*.5+.5,z*.5+.5)
 }
 for(let i=0;i<levels.length-1;i++)for(let j=0;j<4;j++){
  const a=i*4+j,b=i*4+(j+1)%4,c=a+4,e=b+4;indices.push(a,c,b,b,c,e)
 }
 indices.push(0,1,2,0,2,3)
 const top=(levels.length-1)*4;indices.push(top,top+2,top+1,top,top+3,top+2)
 for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]]
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices)
 const flat=g.toNonIndexed();g.dispose();flat.name='basic-platform-deck';flat.computeVertexNormals();return flat
}

function archFacade(span:number,bottom:number,spring:number,rise:number,top:number,thick:number,low:boolean){
 const inner=span*.3,outer=span*.48,shape=new THREE.Shape()
 shape.moveTo(-outer,bottom);shape.lineTo(-inner,bottom);shape.lineTo(-inner,spring)
 const samples=low?8:24
 for(let i=1;i<=samples;i++){const angle=Math.PI*(1-i/samples);shape.lineTo(Math.cos(angle)*inner,spring+Math.sin(angle)*rise)}
 shape.lineTo(inner,bottom);shape.lineTo(outer,bottom);shape.lineTo(outer,top);shape.lineTo(-outer,top);shape.closePath()
 const g=new THREE.ExtrudeGeometry(shape,{depth:thick,bevelEnabled:false,steps:1,curveSegments:1});g.translate(0,0,-thick/2);g.name='basic-platform-arch';return g
}

function archStone(xRadius:number,innerRise:number,outerRise:number,spring:number,a:number,b:number,thick:number){
 const shape=new THREE.Shape(),innerX=xRadius,outerX=xRadius*1.21,samples=3
 for(let i=0;i<=samples;i++){const angle=a+(b-a)*i/samples,x=Math.cos(angle)*outerX,y=spring+Math.sin(angle)*outerRise;i?shape.lineTo(x,y):shape.moveTo(x,y)}
 for(let i=samples;i>=0;i--){const angle=a+(b-a)*i/samples;shape.lineTo(Math.cos(angle)*innerX,spring+Math.sin(angle)*innerRise)}shape.closePath()
 const g=new THREE.ExtrudeGeometry(shape,{depth:thick,bevelEnabled:false,steps:1});g.translate(0,0,-thick/2);g.name='basic-platform-voussoir';return g
}

export function populateBasicStructure(e:RenderEntity,mesh:ModelMesh,low=false):boolean{
 const {kind,width:w,depth:d}=e.geometry,h=Math.max(.035,e.geometry.height)
 if(e.geometry.asset||!['wall','platform'].includes(kind))return false
 const part=(g:THREE.BufferGeometry,color:string,x:number,y:number,z:number)=>mesh(g,color,x,y,z,stone)
 const box=(a:number,b:number,c:number,x:number,y:number,z:number,color:string,bevel=.06)=>{
  const g=low||bevel===0?new THREE.BoxGeometry(a,b,c):new RoundedBoxGeometry(a,b,c,1,Math.min(a,b,c)*bevel)
  return part(g,color,x,y,z)
 }
 if(kind==='wall'){
  // Recessed mortar is a continuous, genuinely solid core. The dressed blocks
  // project from it on both sides, with staggered seams and chipped corners.
  box(w*.995,h*.96,d*.59,0,h*.48,0,'#66665a',0)
  const base=h*.055,cap=h*.075,rows=low?Math.min(4,Math.max(2,Math.ceil(h/.8))):Math.min(12,Math.max(2,Math.ceil(h/.45))),cols=low?Math.min(5,Math.max(2,Math.ceil(w/1.4))):Math.min(18,Math.max(2,Math.ceil(w/.7)))
  const rh=(h-base-cap)/rows,cw=w/cols,gap=Math.min(rh*.08,cw*.045,d*.055)
  for(let row=0;row<rows;row++)for(let col=0;col<cols+row%2;col++){
   const left=Math.max(-w/2,-w/2+(col-row%2*.5)*cw),right=Math.min(w/2,-w/2+(col+1-row%2*.5)*cw)
   const phase=row*17+col*29,depth=d*(.86+.1*(.5+.5*Math.sin(phase*1.7)))
   part(dressedStone(right-left-gap,rh-gap,depth,phase,low),tones[(row*3+col)%tones.length],(left+right)/2,base+(row+.5)*rh,0)
  }
  box(w*.98,base*.62,d*.94,0,base*.31,0,'#979785')
  box(w,base*.38,d,0,base*.81,0,'#b5ae99')
  const caps=low?Math.max(1,Math.min(5,Math.ceil(w/1.4))):Math.max(1,Math.min(16,Math.ceil(w/.8)))
  for(let i=0;i<caps;i++){
   const x=-w/2+(i+.5)*w/caps
   box(w/caps*.992,cap*.7,d,x,h-cap*.35,0,'#c1b8a3',.1)
   if(!low)box(w/caps*.98,cap*.3,d*.9,x,h-cap*.85,0,'#a6a28f',.09)
  }
 }else{
  const foot=h*.105,spring=h*.34,rise=h*.3,top=h*.815
  part(deckProfile(w,d,h,low),'#c1b8a3',0,0,0)
  box(w*.94,foot*.58,d*.94,0,foot*.29,0,'#979785',.12)
  box(w*.88,foot*.42,d*.88,0,foot*.79,0,'#b5ae99',.1)
  const arches=Math.max(1,Math.min(4,Math.round(w/(Math.max(h,.2)*1.8+d*.35)))),span=w*.91/arches
  for(const side of [-1,1])for(let i=0;i<arches;i++){
   const x=-w*.455+(i+.5)*span,z=side*d*.365
   part(archFacade(span,foot,spring,rise,top,d*.15,low),'#a6a28f',x,0,z)
   // The lower piers support the spring of the arch. Deep joints and a
   // separate base moulding articulate the load-bearing construction.
   for(const sign of [-1,1]){
    const px=x+sign*span*.39
    box(span*.18,h*.05,d*.2,px,foot+h*.025,z,'#c1b8a3')
    box(span*.18,h*.04,d*.19,px,spring-h*.02,z,'#b5ae99')
    if(!low)for(let row=0;row<2;row++)box(span*.16,(spring-foot)*.42,d*.175,px,foot+(row+.5)*(spring-foot)/2,z,tones[row],.11)
   }
   if(!low){
    const blocks=9
    for(let j=0;j<blocks;j++)part(archStone(span*.3,rise,rise+h*.13,spring,j/blocks*Math.PI+.008,(j+1)/blocks*Math.PI-.008,d*.045),tones[(j+i)%4],x,0,side*d*.4575)
   }
  }
  // Tie beams connect the two arcades under the continuous top slab.
  for(const x of [-w*.405,w*.405])box(w*.08,h*.115,d*.82,x,h*.755,0,'#979785',.08)
  if(!low){
   const dentils=Math.max(3,Math.min(18,Math.floor(w/.28)))
   for(const side of [-1,1])for(let i=0;i<dentils;i++)box(w/dentils*.38,h*.038,d*.05,-w*.46+(i+.5)*w*.92/dentils,h*.85,side*d*.453,'#b5ae99',.1)
  }
 }
 return true
}
