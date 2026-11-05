import * as THREE from 'three'
import type {AbilityVisualStyle} from './abilityVisualStyles'
import type {SceneAbilitySample} from './scene3dAbilityEffects'

// Crossed tapered sheets carry a dense head and a broad, feathered wake. Their
// buffers are retained; all positions can be reproduced from a single sample.
export function createAbilityStreamGeometry(style:AbilityVisualStyle,low:boolean){
 const segments=low?12:28,sheets=low?2:3,positions=new Float32Array(sheets*(segments+1)*6),uv=new Float32Array(sheets*(segments+1)*4),indices:number[]=[]
 for(let sheet=0;sheet<sheets;sheet++)for(let i=0;i<=segments;i++)for(let edge=0;edge<2;edge++){
  const n=(sheet*(segments+1)+i)*2+edge;uv[n*2]=edge;uv[n*2+1]=1-i/segments
  if(i<segments&&!edge){indices.push(n,n+1,n+2,n+1,n+3,n+2)}
 }
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)).setAttribute('uv',new THREE.BufferAttribute(uv,2)).setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(0),3)).setIndex(indices)
 const direction=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),point=new THREE.Vector3(),axis=new THREE.Vector3(),offset=new THREE.Vector3()
 const normal=geometry.getAttribute('normal');for(let i=0;i<normal.count;i++)normal.setXYZ(i,0,1,0)
 function update(sample:SceneAbilitySample,time:number,scale:number,start:THREE.Vector3,end:THREE.Vector3,anchor:THREE.Vector3,seed:number){
  direction.copy(end).sub(start);const length=direction.length();if(length>1e-8)direction.divideScalar(length);else direction.set(0,1,0)
  side.crossVectors(direction,Math.abs(direction.y)>.95?axis.set(1,0,0):axis.set(0,1,0)).normalize();up.crossVectors(side,direction).normalize()
  const reach=sample.phase==='travel'?sample.progress:1,continuous=style.archetype==='storm'||style.archetype==='fluid'||style.archetype==='vortex'||style.archetype==='renewal'
  const tail=continuous?length*reach:Math.min(length*reach,3.6*scale),tip=sample.phase==='travel'?start.clone().lerp(end,reach):end
  for(let sheet=0;sheet<sheets;sheet++)for(let i=0;i<=segments;i++){
   const t=i/segments,angle=sheet/sheets*Math.PI,span=Math.sin(t*Math.PI),wave=Math.sin(t*14-time*6+seed)*span*scale*.045
   point.copy(tip).addScaledVector(direction,-t*tail).sub(anchor).addScaledVector(side,wave).addScaledVector(up,Math.cos(t*11-time*4)*span*scale*.04)
   offset.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(up,Math.sin(angle))
   const width=scale*(style.archetype==='fluid'?.2:style.archetype==='flame'?.24:.11)*Math.pow(1-t,.7)*(.25+span*.75)
   for(let edge=0;edge<2;edge++){const n=((sheet*(segments+1)+i)*2+edge)*3,sign=edge?1:-1;positions[n]=point.x+offset.x*width*sign;positions[n+1]=point.y+offset.y*width*sign;positions[n+2]=point.z+offset.z*width*sign}
  }
  geometry.attributes.position.needsUpdate=true
 }
 return {geometry,update}
}

export function createAbilityBoltGeometry(low:boolean){
 const segments=low?14:26,branches=low?3:7,total=segments+branches*6,positions=new Float32Array(total*12),uv=new Float32Array(total*8),indices:number[]=[]
 for(let i=0;i<total;i++){const n=i*4;indices.push(n,n+1,n+2,n+1,n+3,n+2);uv.set([0,0,1,0,0,1,1,1],i*8)}
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)).setAttribute('uv',new THREE.BufferAttribute(uv,2)).setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(0),3)).setIndex(indices)
 const direction=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),origin=new THREE.Vector3(),offset=new THREE.Vector3(),normal=geometry.getAttribute('normal')
 for(let i=0;i<normal.count;i++)normal.setXYZ(i,0,1,0)
 const bend=(t:number,time:number,seed:number)=>Math.sin(t*57.3+Math.sin(time*6.1+seed)*2)*Math.sin(t*Math.PI)
 function update(sample:SceneAbilitySample,time:number,scale:number,start:THREE.Vector3,end:THREE.Vector3,anchor:THREE.Vector3,seed:number){
  direction.copy(end).sub(start);const length=direction.length();if(length>1e-8)direction.divideScalar(length);else direction.set(0,1,0)
  side.crossVectors(direction,Math.abs(direction.y)>.95?offset.set(1,0,0):offset.set(0,1,0)).normalize();up.crossVectors(side,direction).normalize()
  const reach=sample.phase==='travel'?sample.progress:sample.phase==='preparation'?.07:1
  const main=(t:number,out:THREE.Vector3)=>out.copy(start).addScaledVector(direction,t*length*reach).sub(anchor).addScaledVector(side,bend(t,time,seed)*scale*.24).addScaledVector(up,bend(t,time*.73,seed+2)*scale*.18)
  const quad=(index:number,p:THREE.Vector3,q:THREE.Vector3,width:number,turn:number)=>{
   offset.copy(side).multiplyScalar(Math.cos(turn)*width).addScaledVector(up,Math.sin(turn)*width)
   for(let i=0;i<4;i++){const source=i<2?p:q,sign=i%2?1:-1,n=index*12+i*3;positions[n]=source.x+offset.x*sign;positions[n+1]=source.y+offset.y*sign;positions[n+2]=source.z+offset.z*sign}
  }
  for(let i=0;i<segments;i++)quad(i,main(i/segments,a),main((i+1)/segments,b),scale*.025,i*.47)
  for(let branch=0;branch<branches;branch++){
   const root=(branch+1)/(branches+1),turn=branch*2.399+seed,span=scale*(.42+(branch%3)*.19)*Math.min(1,length*reach)
   main(root,origin)
   const branchPoint=(t:number,out:THREE.Vector3)=>out.copy(origin).addScaledVector(direction,t*span*.35).addScaledVector(side,Math.cos(turn)*t*span+Math.sin(t*24+time*5+branch)*t*span*.15).addScaledVector(up,Math.sin(turn)*t*span)
   for(let i=0;i<6;i++)quad(segments+branch*6+i,branchPoint(i/6,a),branchPoint((i+1)/6,b),scale*.014*(1-i/7),turn+1.2)
  }
  geometry.attributes.position.needsUpdate=true
 }
 return {geometry,update}
}
