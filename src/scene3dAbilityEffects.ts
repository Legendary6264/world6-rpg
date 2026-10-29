import * as THREE from 'three'
import {abilityVisualFamilyById} from './abilityVisuals.ts'
import type {AbilityVisualPhase} from './abilityVisuals'
import type {SceneAbilityVisual} from './sceneAbilityVisuals'

export type SceneAbilitySample={phase:AbilityVisualPhase;progress:number;visible:boolean}
export type SceneAbilityEffectOptions={low:boolean;clippingPlanes?:THREE.Plane[];light?:boolean;groundZ?:number}
const finite=(value:number,fallback=0)=>Number.isFinite(value)?value:fallback
const clamp=(value:number|undefined,fallback:number,min:number,max:number)=>Math.max(min,Math.min(max,finite(value??fallback,fallback)))
const position=(p:SceneAbilityVisual['start'])=>new THREE.Vector3(finite(p.x),finite(p.z),finite(p.y))
const noRaycast=()=>{}
function motifFor(id:string){
 if(['fire','embers','heatwave'].includes(id))return 'fire'
 if(['water','rain','tide','mist','blood','pulse','poisons'].includes(id))return 'water'
 if(['electricity','forging'].includes(id))return 'electricity'
 if(['wind','gale','cyclone','resonance','echoes'].includes(id))return 'wind'
 if(['earth','metal','crystal','frost','rockfall','sand','dust','blades','shield','reflection','space','magnetism','decay'].includes(id))return 'shards'
 if(['vegetation','roots','thorns','blossom','vines','healing'].includes(id))return 'growth'
 return 'sigil'
}

/** Procedural presentation assets. Nothing here writes to a campaign, infers
 * recipients, emits game light/sound, or installs an animation loop. */
export function createSceneAbilityEffect(visual:SceneAbilityVisual,options:SceneAbilityEffectOptions){
 const group=new THREE.Group();group.name='ability-effect:'+visual.id
 group.userData.abilityEffect=true;group.userData.familyId=visual.spec.familyId
 const family=abilityVisualFamilyById(visual.spec.familyId),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),instances:THREE.InstancedMesh[]=[]
 let disposed=false
 const keep=<T extends THREE.BufferGeometry>(geometry:T):T=>{geometries.add(geometry);return geometry}
 const start=position(visual.start),end=position(visual.end),delta=end.clone().sub(start),length=delta.length(),direction=length>1e-8?delta.clone().divideScalar(length):new THREE.Vector3(0,1,0)
 const width=clamp(visual.radius,.65,.001,1e6),scale=clamp(visual.spec.scale,1,.25,4),intensity=clamp(visual.spec.intensity,1,.25,2),low=options.low
 const palette=family??{primary:'#b9c9d2',highlight:'#f3f6eb',shade:'#61778b'},motif=motifFor(visual.spec.familyId),seed=[...visual.id].reduce((n,c)=>((n*31+c.charCodeAt(0))>>>0),0)*.0001
 const makeMaterial=(color:string,opacity:number,additive=true)=>{
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:true,toneMapped:false,side:THREE.DoubleSide,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,clippingPlanes:options.clippingPlanes??[]})
  material.userData.lightEmitter=true;material.userData.abilityEffect=true;materials.add(material);return material
 }
 const lineMaterial=(color:string,opacity:number)=>{
  const material=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,clippingPlanes:options.clippingPlanes??[]})
  material.userData.abilityEffect=true;materials.add(material);return material
 }
 const decorate=<T extends THREE.Object3D>(object:T):T=>{object.raycast=noRaycast;object.userData.abilityEffect=true;object.renderOrder=4;object.frustumCulled=false;return object}
 const material=makeMaterial(palette.primary,.78),highlight=makeMaterial(palette.highlight,.82),soft=makeMaterial(palette.shade,.34,false)
 const coreGeometry=keep(motif==='shards'?new THREE.OctahedronGeometry(1,0):new THREE.IcosahedronGeometry(1,low?0:1))
 const core=decorate(new THREE.Mesh(coreGeometry,material));core.name='ability-core:'+motif;group.add(core)
 const inner=decorate(new THREE.Mesh(coreGeometry,highlight));inner.name='ability-hotspot';if(!low)group.add(inner)
 const particleCount=low?10:28
 const particleGeometry=keep(motif==='fire'?new THREE.ConeGeometry(1,2,5):motif==='shards'||motif==='growth'?new THREE.OctahedronGeometry(1,0):new THREE.IcosahedronGeometry(1,0))
 const particles=decorate(new THREE.InstancedMesh(particleGeometry,motif==='water'?soft:material,particleCount));particles.name='ability-particles:'+motif;particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instances.push(particles);group.add(particles)
 const rings=decorate(new THREE.InstancedMesh(keep(new THREE.TorusGeometry(1,.018,3,low?20:44)),highlight,low?2:3));rings.name='ability-rings:'+motif;rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instances.push(rings);group.add(rings)
 const trailSegments=low?12:30,trailGeometry=keep(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(trailSegments*6),3))),trailMat=lineMaterial(palette.highlight,.7)
 const trail=decorate(new THREE.LineSegments(trailGeometry,trailMat));trail.name='ability-trail:'+motif;group.add(trail)
 const volumePoints:number[]=[]
 const volume=decorate(new THREE.LineSegments(keep(new THREE.BufferGeometry()),lineMaterial(palette.primary,.24)));volume.name='ability-volume:'+visual.shape;group.add(volume)
 // The owner opts into and budgets real illumination. It is presentation
 // radiance only: no emitted world light, perception or shadow state changes.
 const luminous=['fire','embers','heatwave','electricity','forging','light','healing','runes','soul','spirits'].includes(visual.spec.familyId)
 const flash=options.light===true&&!low&&luminous&&!options.clippingPlanes?.length?new THREE.PointLight(palette.primary,0,Math.min(8,3+scale+Math.min(width,3)*.5),2):null
 if(flash){flash.name='ability-flash';flash.castShadow=false;flash.visible=false;flash.position.y=.32*scale;flash.userData.abilityEffect=true;group.add(flash)}
 // A contact mark belongs to an actual nearby ground plane. In particular,
 // aiming at a raised object or into the air never projects a floating decal.
 const groundZ=options.groundZ,nearGround=groundZ!==undefined&&Number.isFinite(groundZ)&&Math.abs(end.y-groundZ)<=.08
 const contactMaterial=!low&&nearGround?makeMaterial(palette.primary,0):null
 const contact=contactMaterial?decorate(new THREE.Mesh(keep(new THREE.RingGeometry(.79,1,48)),contactMaterial)):null
 const contactRadius=visual.shape==='point'?.45:Math.min(3,width)
 if(contact){contact.name='ability-ground-contact';contact.rotation.x=-Math.PI/2;contact.visible=false;group.add(contact)}
 const segment=(a:THREE.Vector3,b:THREE.Vector3)=>volumePoints.push(...a.toArray(),...b.toArray())
 const circle=(radius:number,center:THREE.Vector3,normal:THREE.Vector3)=>{
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal),count=low?24:48
  const point=(a:number)=>new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius).applyQuaternion(rotation).add(center)
  for(let i=0;i<count;i++)segment(point(i/count*Math.PI*2),point((i+1)/count*Math.PI*2))
 }
 // Shape dimensions are game-space dimensions, independent of visual scale.
 // A cone's end is its axis endpoint; coneAngleDeg is its full aperture.
 if(visual.shape==='sphere'){
  for(const normal of [new THREE.Vector3(0,1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)])circle(width,new THREE.Vector3(),normal)
 }else if(visual.shape==='beam'||visual.shape==='cone'){
  const cone=visual.shape==='cone',radius=cone?length*Math.tan(clamp(visual.coneAngleDeg,45,.1,179)*Math.PI/360):width
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction)
  if(!cone)circle(radius,new THREE.Vector3(),direction)
  circle(radius,delta,direction)
  for(let i=0;i<4;i++){
   const offset=new THREE.Vector3(Math.cos(i*Math.PI/2)*radius,0,Math.sin(i*Math.PI/2)*radius).applyQuaternion(rotation)
   segment(cone?new THREE.Vector3():offset,delta.clone().add(offset))
  }
 }
 volume.geometry.setAttribute('position',new THREE.Float32BufferAttribute(volumePoints,3));volume.geometry.computeBoundingSphere()
 const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),euler=new THREE.Euler(),point=new THREE.Vector3(),size=new THREE.Vector3(),anchor=new THREE.Vector3(),side=new THREE.Vector3().crossVectors(direction,Math.abs(direction.y)>.95?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(side,direction).normalize()
 const amount=visual.spec.familyId==='none'?0:1
 function update(sample:SceneAbilitySample,seconds:number){
  if(disposed)return
  const p=clamp(sample.progress,0,0,1),time=finite(seconds),phase=sample.phase,impact=phase==='impact',residue=phase==='residue',travel=phase==='travel',preparing=phase==='preparation',release=phase==='release'
  group.visible=sample.visible&&amount>0
  if(!group.visible){if(flash){flash.intensity=0;flash.visible=false}if(contact)contact.visible=false;return}
  anchor.copy(preparing||release?start:travel?start.clone().lerp(end,p):end);group.position.copy(anchor)
  const fade=residue?1-p:impact?1-p*.65:1,burst=impact?.35+p*1.65:residue?1+p*.3:preparing?.42+p*.25:.72
  if(flash){
   const power=preparing?.2+p*.35:release?.55+Math.sin(p*Math.PI)*.65:travel?.65:impact?.45+1.75*(1-p)**2:.45*(1-p)**2
   flash.intensity=6*intensity*power;flash.visible=flash.intensity>1e-6
  }
  if(contact&&contactMaterial){
   contact.visible=(impact||residue)&&p<1
   contact.position.set(end.x-anchor.x,groundZ!+.015-anchor.y,end.z-anchor.z)
   contact.scale.setScalar(contactRadius*(impact?.3+p*.7:1+p*.1))
   contactMaterial.opacity=(impact?.18*(1-p*.55):residue?.081*(1-p):0)*Math.min(1.5,intensity)
  }
  const pulse=1+Math.sin(time*5+seed)*.07,motifScale=scale*(motif==='shards'?.19:.2)*pulse
  const stretch=motif==='fire'?new THREE.Vector3(.78,1.6,.78):motif==='water'?new THREE.Vector3(.85,1.25,.85):motif==='growth'?new THREE.Vector3(.5,1.75,.5):motif==='wind'?new THREE.Vector3(1,.6,1):new THREE.Vector3(1,1,1)
  core.visible=!residue;inner.visible=core.visible;core.scale.copy(stretch).multiplyScalar(motifScale*(impact?1+p*.5:1));inner.scale.copy(core.scale).multiplyScalar(.52)
  core.rotation.set(time*.3+seed,time*.7+seed,time*.2);inner.rotation.copy(core.rotation)
  material.opacity=Math.min(1,.77*fade*intensity);highlight.opacity=Math.min(1,.88*fade*intensity);soft.opacity=Math.min(.7,.42*fade*intensity)
  for(let i=0;i<particleCount;i++){
   const f=(i+.5)/particleCount,a=i*2.399963+seed,timeOffset=(time*.22+f)%1,r=Math.sqrt(f)*scale*(impact?burst:residue?.7+p*.7:preparing?.44:.52)
   if(travel){
    point.copy(direction).multiplyScalar(-timeOffset*Math.min(2.3,Math.max(.4,length*.32))).addScaledVector(side,Math.cos(a+time)*r*.27).addScaledVector(up,Math.sin(a+time)*r*.27)
   }else if(motif==='growth')point.set(Math.cos(a)*r,(timeOffset-.3)*scale*.9,Math.sin(a)*r)
   else if(motif==='wind')point.set(Math.cos(a+time*1.7)*r,(f-.5)*scale*.85,Math.sin(a+time*1.7)*r)
   else if(motif==='fire')point.set(Math.cos(a)*r*.65,(timeOffset-.2)*scale*(impact?burst:1),Math.sin(a)*r*.65)
   else point.set(Math.cos(a)*r,Math.sin(i*1.618+seed)*r*.7,Math.sin(a)*r)
   const particleSize=scale*(motif==='shards'?.065:.025)*(1+(i%4)*.25)*(residue?1-p*.7:1)
   size.set(particleSize,motif==='fire'?particleSize*2.3:motif==='shards'?particleSize*1.8:motif==='water'?particleSize*1.7:particleSize,particleSize)
   if(motif==='growth')size.set(particleSize*1.7,particleSize*.28,particleSize*.8)
   euler.set(a+time*.4,a*.7+time*.6,time*.1);rotation.setFromEuler(euler);matrix.compose(point,rotation,size);particles.setMatrixAt(i,matrix)
  }
  particles.instanceMatrix.needsUpdate=true
  for(let i=0;i<rings.count;i++){
   const ringScale=scale*(.34+i*.2)*(impact?1+p*1.8:residue?1+p*.6:preparing?.7+p*.3:1),tilt=motif==='wind'||motif==='sigil'?Math.PI/2+i*.48:Math.PI/2
   point.set(0,motif==='growth'?(i-.5)*scale*.35:0,0);euler.set(tilt,0,((motif==='sigil'?1:-1)*time*.25+i)*Math.PI/3);rotation.setFromEuler(euler);size.set(ringScale,ringScale,ringScale);matrix.compose(point,rotation,size);rings.setMatrixAt(i,matrix)
  }
  rings.instanceMatrix.needsUpdate=true;rings.visible=!travel||motif==='wind'||motif==='sigil'||motif==='growth'
  const values=trailGeometry.getAttribute('position') as THREE.BufferAttribute
  for(let i=0;i<trailSegments;i++)for(let j=0;j<2;j++){
   const t=(i+j)/trailSegments
   if(motif==='electricity'){
    const reach=travel?p:preparing||release?.08:1
    point.copy(start).lerp(end,t*reach).sub(anchor)
    const envelope=Math.sin(t*Math.PI)*scale*.3
    point.addScaledVector(side,Math.sin((i+j)*5.127+Math.floor(time*16)+seed)*envelope).addScaledVector(up,Math.cos((i+j)*3.91+Math.floor(time*13)+seed)*envelope)
   }else if(travel){
    point.copy(direction).multiplyScalar(-t*Math.min(length*.55,2.6)).addScaledVector(side,Math.sin(t*7+time*4)*Math.sin(t*Math.PI)*scale*.12)
   }else{
    const a=t*Math.PI*2,timeAngle=time*(motif==='wind'?1.3:.25),r=scale*(impact?.4+p*.8:residue?.9:.64)
    point.set(Math.cos(a+timeAngle)*r,motif==='wind'?Math.sin(a*3+time)*scale*.28:0,Math.sin(a+timeAngle)*r)
    if(motif==='sigil'&&i%3===0)point.multiplyScalar(.68)
   }
   values.setXYZ(i*2+j,point.x,point.y,point.z)
  }
  values.needsUpdate=true;trailMat.opacity=Math.min(1,(motif==='electricity'?.9:.55)*fade*intensity)
  trail.visible=motif==='electricity'||travel||motif==='wind'||motif==='sigil'||motif==='growth'
  volume.visible=visual.shape!=='point'&&(impact||residue||(visual.shape==='beam'||visual.shape==='cone')&&travel)
  volume.position.copy(visual.shape==='sphere'?end:start).sub(anchor)
  ;(volume.material as THREE.LineBasicMaterial).opacity=(residue?.16*(1-p):.23)*intensity
 }
 update({phase:'preparation',progress:0,visible:false},0)
 function dispose(){if(disposed)return;disposed=true;group.removeFromParent();if(flash){flash.intensity=0;flash.visible=false;flash.shadow.dispose();flash.removeFromParent()}instances.forEach(mesh=>mesh.dispose());geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());geometries.clear();materials.clear();group.clear()}
 return {group,update,dispose}
}
