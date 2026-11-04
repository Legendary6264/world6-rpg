import * as THREE from 'three'
import type {AbilityVisualParticle} from './abilityVisuals'
import type {AbilityVisualStyle} from './abilityVisualStyles'
import type {SceneAbilitySample} from './scene3dAbilityEffects'
import {visualEaseOut} from './abilityVisualStyles.ts'

export function abilityCoreGeometry(style:AbilityVisualStyle,low:boolean):THREE.BufferGeometry {
  if(style.archetype==='flame')return new THREE.LatheGeometry([[0,-.5],[.28,-.4],[.46,-.15],[.34,.2],[.22,.55],[.12,.9],[0,1.4]].map(([x,y])=>new THREE.Vector2(x,y)),low?8:14)
  if(style.archetype==='mineral')return new THREE.DodecahedronGeometry(.8,0)
  if(style.archetype==='frost')return new THREE.ConeGeometry(.46,1.9,6)
  if(style.archetype==='vortex'||style.archetype==='resonance')return new THREE.TorusGeometry(.65,.13,low?4:6,low?16:28)
  if(style.archetype==='growth')return new THREE.ConeGeometry(.36,1.3,5)
  if(style.archetype==='radiance'||style.archetype==='sigil'||style.archetype==='storm')return new THREE.OctahedronGeometry(.7,0)
  return new THREE.SphereGeometry(.7,low?8:14,low?6:10)
}
export function abilityParticleGeometry(kind:AbilityVisualParticle,style:AbilityVisualStyle):THREE.BufferGeometry {
  if(kind==='leaf'||kind==='petal'||kind==='feather'){
    const shape=new THREE.Shape();shape.moveTo(0,-1);shape.bezierCurveTo(-.8,-.1,-.75,.55,0,1);shape.bezierCurveTo(.75,.55,.8,-.1,0,-1)
    const geometry=new THREE.ShapeGeometry(shape,3);geometry.rotateX(-Math.PI/2);return geometry
  }
  if(kind==='plus'){
    const shape=new THREE.Shape(),points=[[-.25,-1],[.25,-1],[.25,-.25],[1,-.25],[1,.25],[.25,.25],[.25,1],[-.25,1],[-.25,.25],[-1,.25],[-1,-.25],[-.25,-.25]]
    points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();return new THREE.ShapeGeometry(shape)
  }
  if(kind==='star'){
    const shape=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5,r=i%2?.38:1,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i)shape.lineTo(x,y);else shape.moveTo(x,y)}shape.closePath();return new THREE.ShapeGeometry(shape)
  }
  if(kind==='shard'||kind==='claw')return style.archetype==='frost'?new THREE.ConeGeometry(.5,2,5):new THREE.OctahedronGeometry(1,0)
  if(kind==='square'||kind==='rune')return new THREE.BoxGeometry(.8,.8,.12)
  if(kind==='spark'||kind==='dash'||kind==='wisp')return new THREE.PlaneGeometry(.18,1.8)
  if(kind==='flame')return new THREE.ConeGeometry(.7,2,5)
  return new THREE.IcosahedronGeometry(1,0)
}

export function abilitySigilGeometry(style:AbilityVisualStyle,low:boolean):THREE.BufferGeometry {
  const points:number[]=[],nodes=style.archetype==='frost'?6:style.archetype==='radiance'?8:6+style.variant%4,steps=low?24:48
  const add=(ax:number,az:number,bx:number,bz:number)=>points.push(ax,.025,az,bx,.025,bz)
  for(let i=0;i<steps;i++){const a=i/steps*Math.PI*2,b=(i+1)/steps*Math.PI*2;if(i%4!==3)add(Math.cos(a),Math.sin(a),Math.cos(b),Math.sin(b))}
  for(let i=0;i<nodes;i++){
    const a=i/nodes*Math.PI*2,b=(i+2)/nodes*Math.PI*2,r=.72
    add(Math.cos(a)*r,Math.sin(a)*r,Math.cos(b)*r,Math.sin(b)*r)
    const x=Math.cos(a),z=Math.sin(a),tx=-z,tz=x
    add(x*.85,z*.85,x*1.12,z*1.12);add(x+tx*.07,z+tz*.07,x*1.08-tx*.07,z*1.08-tz*.07)
  }
  return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3))
}

// Surface ribbons have actual width in world space. Their UV feathering works
// with both perspective and orthographic cameras and the usual disclosure clip.
export function createAbilityRibbonGeometry(style:AbilityVisualStyle,low:boolean){
  const count=low?2:style.ribbons,segments=low?16:32,vertices=count*(segments+1)*2,positions=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),normals=new Float32Array(vertices*3),indices:number[]=[]
  for(let strand=0;strand<count;strand++)for(let i=0;i<=segments;i++)for(let edge=0;edge<2;edge++){
    const index=(strand*(segments+1)+i)*2+edge;uv[index*2]=edge;uv[index*2+1]=i/segments;normals[index*3+1]=1
    if(i<segments&&edge===0){const a=index,b=a+1,c=a+2,d=a+3;indices.push(a,b,c,b,d,c)}
  }
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)).setAttribute('uv',new THREE.BufferAttribute(uv,2)).setAttribute('normal',new THREE.BufferAttribute(normals,3)).setIndex(indices)
  const center=new THREE.Vector3(),offset=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),vertical=new THREE.Vector3(0,1,0)
  function update(sample:SceneAbilitySample,time:number,scale:number,start:THREE.Vector3,end:THREE.Vector3,anchor:THREE.Vector3,seed:number){
    const direction=end.clone().sub(start),length=direction.length();if(length>1e-8)direction.divideScalar(length);else direction.set(0,1,0)
    side.crossVectors(direction,Math.abs(direction.y)>.95?new THREE.Vector3(1,0,0):vertical).normalize();up.crossVectors(side,direction).normalize()
    const travel=sample.phase==='travel',impact=sample.phase==='impact',p=sample.progress,burst=visualEaseOut(p),phaseScale=sample.phase==='preparation'?.45+p*.35:sample.phase==='release'?.7+p*.4:1
    for(let strand=0;strand<count;strand++)for(let i=0;i<=segments;i++){
      const t=i/segments,angle=strand/count*Math.PI*2+t*style.turns*Math.PI*2-time*(style.flow==='inward'?-1:1)*1.2+seed,span=Math.sin(Math.PI*t),r=scale*style.spread*(.32+.32*span)*phaseScale
      if(style.archetype==='storm'){
        const reach=travel?p:sample.phase==='preparation'?.06:1,jitter=Math.sin((i+strand)*6.19+Math.floor(time*7))*style.turbulence*scale*.2*span
        center.copy(start).lerp(end,t*reach).sub(anchor).addScaledVector(side,jitter+strand*.018*scale).addScaledVector(up,Math.cos(i*3.83+strand+time*5)*jitter)
        offset.copy(up)
      }else if(travel){
        const tail=Math.min(Math.max(.7,length*.48),3.8)*scale
        center.copy(direction).multiplyScalar(-t*tail).addScaledVector(side,Math.cos(angle)*r*span*.65).addScaledVector(up,Math.sin(angle)*r*span*.65)
        offset.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(up,Math.sin(angle))
      }else if(impact&&['mineral','frost','radiance','flame'].includes(style.archetype)){
        const a=strand/count*Math.PI*2+seed,reach=scale*(.3+burst*1.7)*t
        center.set(Math.cos(a)*reach,Math.sin(t*Math.PI)*scale*(style.archetype==='flame'?1:.4)*(1-p),Math.sin(a)*reach)
        offset.set(-Math.sin(a),.25,Math.cos(a)).normalize()
      }else{
        const h=scale*style.stretch*(style.flow==='fall'?1-t:t)-scale*.4,inward=style.flow==='inward'?1-t*.8:1
        center.set(Math.cos(angle)*r*inward,h,Math.sin(angle)*r*inward)
        if(style.archetype==='resonance'){center.y=Math.sin(t*Math.PI*4-time)*scale*.15;center.multiplyScalar(1+p*.25)}
        if(style.archetype==='growth'&&style.flow==='burst'){center.y=Math.sin(t*Math.PI)*scale*.18;center.x*=1+t;center.z*=1+t}
        offset.set(Math.cos(angle),.1,Math.sin(angle)).normalize()
      }
      const thickness=scale*(style.archetype==='storm'?.013:style.archetype==='fluid'?.08:.045)*(.12+span*.88)*(impact?1-p*.6:1)
      for(let edge=0;edge<2;edge++){const index=((strand*(segments+1)+i)*2+edge)*3,sign=edge?1:-1;positions[index]=center.x+offset.x*thickness*sign;positions[index+1]=center.y+offset.y*thickness*sign;positions[index+2]=center.z+offset.z*thickness*sign}
    }
    geometry.attributes.position.needsUpdate=true
  }
  return {geometry,update}
}
