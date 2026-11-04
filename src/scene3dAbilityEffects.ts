import * as THREE from 'three'
import {abilityVisualStyle,visualEaseOut} from './abilityVisualStyles.ts'
import {abilitySurfaceMaterial} from './sceneAbilityShaders.ts'
import {abilityCoreGeometry,abilityParticleGeometry,abilitySigilGeometry,createAbilityRibbonGeometry} from './sceneAbilityGeometry.ts'
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
 const style=abilityVisualStyle(visual.spec.familyId)
 group.userData.visualVersion=2;group.userData.archetype=style.archetype
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
 const surfaces:ReturnType<typeof abilitySurfaceMaterial>[]=[]
 const surface=(color:string,layer:Parameters<typeof abilitySurfaceMaterial>[4])=>{const entry=abilitySurfaceMaterial(color,palette.highlight,palette.shade,style,layer,options.clippingPlanes);surfaces.push(entry);materials.add(entry.material);return entry.material}
 const material=surface(palette.primary,'core'),particleMat=surface(palette.primary,'mote')
 const core=decorate(new THREE.Mesh(keep(abilityCoreGeometry(style,low)),material));core.name='ability-core:'+motif;group.add(core)
 const shellMat=low?null:surface(palette.primary,'envelope'),shell=shellMat?decorate(new THREE.Mesh(keep(new THREE.SphereGeometry(1,12,8)),shellMat)):null
 if(shell){shell.name='ability-envelope';group.add(shell)}
 const particleCount=Math.max(low?8:24,Math.min(low?20:68,Math.round((low?14:46)*Math.sqrt(intensity))))
 const particles=decorate(new THREE.InstancedMesh(keep(abilityParticleGeometry(family?.particle??'spark',style)),particleMat,particleCount));particles.name='ability-particles:'+motif;particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instances.push(particles);group.add(particles)
 const tint=new THREE.Color();for(let i=0;i<particleCount;i++)particles.setColorAt(i,tint.set(palette.primary).lerp(new THREE.Color(palette.highlight),(i%5)/5*.65))
 const accentMat=low?null:surface(palette.shade,'smoke'),accents=accentMat?decorate(new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1,0)),accentMat,16)):null
 if(accents){accents.name='ability-atmosphere';accents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instances.push(accents);group.add(accents);if(['flame','mineral','shadow'].includes(style.archetype))accentMat!.blending=THREE.NormalBlending}
 const ringMat=makeMaterial(palette.primary,.3),rings=decorate(new THREE.InstancedMesh(keep(new THREE.TorusGeometry(1,.012,3,low?18:36)),ringMat,low?2:3));rings.name='ability-rings:'+motif;rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instances.push(rings);group.add(rings)
 const ribbonGeometry=createAbilityRibbonGeometry(style,low),ribbonMat=surface(palette.primary,'ribbon'),ribbons=decorate(new THREE.Mesh(keep(ribbonGeometry.geometry),ribbonMat));ribbons.name='ability-ribbons:'+style.archetype;group.add(ribbons)
 const shockMat=makeMaterial(palette.primary,0),shockwaves=decorate(new THREE.InstancedMesh(keep(new THREE.RingGeometry(.87,1,low?24:40)),shockMat,low?1:3));shockwaves.name='ability-shockwaves';shockwaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instances.push(shockwaves);group.add(shockwaves)
 const sigilMat=low?null:lineMaterial(palette.highlight,.6),sigil=sigilMat?decorate(new THREE.LineSegments(keep(abilitySigilGeometry(style,false)),sigilMat)):null
 if(sigil){sigil.name='ability-sigil:'+style.archetype;group.add(sigil)}
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
 const contactRadius=visual.shape==='point'?.65*scale:Math.min(3,width)
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
 const fieldMat=!low&&visual.shape!=='point'?surface(palette.primary,'field'):null
 const fieldGeometry=fieldMat?keep(visual.shape==='sphere'?new THREE.SphereGeometry(width,16,10):visual.shape==='cone'?new THREE.ConeGeometry(length*Math.tan(clamp(visual.coneAngleDeg,45,.1,179)*Math.PI/360),Math.max(length,1e-6),24,1,true).rotateX(Math.PI):new THREE.CylinderGeometry(width,width,Math.max(length,1e-6),24,1,true)):null
 const field=fieldGeometry?decorate(new THREE.Mesh(fieldGeometry,fieldMat!)):null
 if(field){field.name='ability-field:'+visual.shape;if(visual.shape!=='sphere')field.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);group.add(field)}
 const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),euler=new THREE.Euler(),point=new THREE.Vector3(),size=new THREE.Vector3(),anchor=new THREE.Vector3(),side=new THREE.Vector3().crossVectors(direction,Math.abs(direction.y)>.95?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(side,direction).normalize()
 const amount=visual.spec.familyId==='none'?0:1
 function update(sample:SceneAbilitySample,seconds:number){
  if(disposed)return
  const p=clamp(sample.progress,0,0,1),time=finite(seconds),phase=sample.phase,impact=phase==='impact',residue=phase==='residue',travel=phase==='travel',preparing=phase==='preparation',release=phase==='release'
  group.visible=sample.visible&&amount>0
  if(!group.visible){if(flash){flash.intensity=0;flash.visible=false}if(contact)contact.visible=false;return}
  anchor.copy(preparing||release?start:travel?start.clone().lerp(end,p):end);group.position.copy(anchor)
  const fade=residue?1-p:impact?1-p*.65:1,burst=impact?.35+visualEaseOut(p)*1.65:residue?1+p*.3:preparing?.42+p*.25:.72
  surfaces.forEach(surface=>surface.update(time,1,intensity))
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
  const pulse=1+Math.sin(time*3+seed)*.045,baseSize=scale*(preparing?.28+p*.16:release?.4+p*.15:impact?.42+p*.24:.42)*pulse
  core.visible=!residue
  core.scale.set(baseSize*(style.archetype==='vortex'?1.1:1),baseSize*style.stretch,baseSize)
  if(style.archetype==='flame')core.rotation.set(.08*Math.sin(time*2),time*.35+seed,.08*Math.cos(time*2))
  else core.rotation.set(time*.2+seed,time*.45+seed,style.archetype==='frost'?.2:time*.15)
  material.opacity=Math.min(1,.88*fade*intensity);particleMat.opacity=Math.min(1,.9*fade*intensity)
  if(shell&&shellMat){shell.visible=!residue||style.archetype==='shadow';shell.scale.set(scale*.7,scale*.7*style.stretch,scale*.7);shellMat.opacity=Math.min(.55,(style.archetype==='shadow'?.4:.24)*fade*intensity);shell.rotation.set(time*.11,time*.2+seed,0)}
  for(let i=0;i<particleCount;i++){
   const f=(i+.5)/particleCount,a=i*2.399963+seed,life=(time*(style.flow==='fall'?.42:.26)+f)%1,expansion=impact?burst:residue?.8:preparing?.55:.75,r=Math.sqrt(f)*scale*style.spread*expansion
   if(travel){
    point.copy(direction).multiplyScalar(-life*Math.min(3.8,Math.max(.6,length*.4))*scale).addScaledVector(side,Math.cos(a+time)*r*.32).addScaledVector(up,Math.sin(a+time)*r*.32)
   }else if(style.flow==='inward'){
    const inward=1-life;point.set(Math.cos(a+time)*r*inward,(f-.5)*scale*style.stretch*inward,Math.sin(a+time)*r*inward)
   }else if(style.flow==='rise'||style.flow==='fall'){
    const h=style.flow==='fall'?1-life:life;point.set(Math.cos(a+time*.4)*r,(h-.25)*scale*style.stretch,Math.sin(a+time*.4)*r)
   }else if(style.flow==='coil'||style.flow==='orbit'){
    const turn=a+time*(style.archetype==='vortex'?2.2:.8);point.set(Math.cos(turn)*r,(f-.5)*scale*style.stretch,Math.sin(turn)*r)
   }else{point.set(Math.cos(a)*r,Math.sin(i*1.618+seed)*r*.8+(impact?Math.sin(p*Math.PI)*scale*.2:0),Math.sin(a)*r)}
   const particleSize=scale*(style.archetype==='mineral'||style.archetype==='frost'?.09:style.archetype==='fluid'?.045:.035)*(1+(i%4)*.22)*(residue?1-p*.65:1)*(impact?1-p*.45:1)
   size.set(particleSize,particleSize*(style.archetype==='flame'?2.5:style.archetype==='frost'?2.7:style.archetype==='storm'?2.2:1.4),particleSize)
   if(family?.particle==='leaf'||family?.particle==='petal')size.set(particleSize*1.8,particleSize,particleSize*1.8)
   euler.set(a+time*.3,a*.7+time*.5,time*.15);rotation.setFromEuler(euler);matrix.compose(point,rotation,size);particles.setMatrixAt(i,matrix)
  }
  particles.instanceMatrix.needsUpdate=true
  if(accents&&accentMat){
   accents.visible=!travel||style.archetype==='flame'||style.archetype==='shadow';accentMat.opacity=Math.min(.28,.16*fade*intensity)
   for(let i=0;i<accents.count;i++){const f=(i+.5)/accents.count,life=(f+time*.13)%1,a=i*2.399963+seed,r=scale*style.spread*(.5+life*.7)*(impact?burst:1);point.set(Math.cos(a+time*.15)*r,(life-.2)*scale*style.stretch,Math.sin(a+time*.15)*r);size.setScalar(scale*(.11+life*.16));rotation.setFromEuler(euler.set(time*.2+a,time*.1+a,0));matrix.compose(point,rotation,size);accents.setMatrixAt(i,matrix)}
   accents.instanceMatrix.needsUpdate=true
  }
  for(let i=0;i<rings.count;i++){
   const ringScale=scale*(.34+i*.22)*(impact?.6+visualEaseOut(p)*1.7:residue?1+p*.3:preparing?.65+p*.3:1)
   point.set(0,style.archetype==='vortex'||style.archetype==='renewal'?(i-1)*scale*.36:0,0)
   euler.set(Math.PI/2+(style.archetype==='radiance'||style.archetype==='shadow'?i*.8:style.archetype==='sigil'?i*.23:0),time*(i%2?-.3:.3),i*.7);rotation.setFromEuler(euler);size.set(ringScale,ringScale,ringScale);matrix.compose(point,rotation,size);rings.setMatrixAt(i,matrix)
  }
  rings.instanceMatrix.needsUpdate=true;ringMat.opacity=Math.min(.55,.32*fade*intensity);rings.visible=['vortex','sigil','shadow','resonance','fluid'].includes(style.archetype)&&(!travel||style.archetype==='vortex'||style.archetype==='shadow')||preparing
  ribbons.visible=style.archetype!=='mineral'||travel||preparing||release;ribbonMat.opacity=Math.min(.9,(style.archetype==='shadow'?.75:.65)*fade*intensity);ribbonGeometry.update(sample,time,scale,start,end,anchor,seed)
  shockwaves.visible=impact||release;shockMat.opacity=shockwaves.visible?Math.min(.45,(1-p)**1.4*.42*intensity):0
  for(let i=0;i<shockwaves.count;i++){const q=Math.max(0,Math.min(1,p-i*.11)),r=scale*(.16+visualEaseOut(q)*(1.6+i*.28));point.set(0,impact&&nearGround?groundZ!+.025-anchor.y:0,0);rotation.setFromUnitVectors(new THREE.Vector3(0,0,1),impact&&nearGround?new THREE.Vector3(0,1,0):direction);size.set(r,r,r);matrix.compose(point,rotation,size);shockwaves.setMatrixAt(i,matrix)}shockwaves.instanceMatrix.needsUpdate=true
  if(sigil&&sigilMat){sigil.visible=!travel&&['sigil','renewal','radiance','frost','shadow'].includes(style.archetype);sigil.scale.setScalar(scale*(preparing?.55+p*.25:impact?.7+visualEaseOut(p)*.55:1));sigil.rotation.y=time*(style.archetype==='shadow'?-.18:.18)+seed;sigilMat.opacity=Math.min(.8,.62*fade*intensity)}
  const values=trailGeometry.getAttribute('position') as THREE.BufferAttribute
  for(let i=0;i<trailSegments;i++)for(let j=0;j<2;j++){
   const t=(i+j)/trailSegments
   if(style.archetype==='storm'){
    const reach=travel?p:preparing||release?.08:1
    point.copy(start).lerp(end,t*reach).sub(anchor)
    const envelope=Math.sin(t*Math.PI)*scale*.3
    point.addScaledVector(side,Math.sin((i+j)*5.127+Math.floor(time*7)+seed)*envelope).addScaledVector(up,Math.cos((i+j)*3.91+Math.floor(time*6)+seed)*envelope)
   }else if(travel){
    point.copy(direction).multiplyScalar(-t*Math.min(length*.55,2.6)).addScaledVector(side,Math.sin(t*7+time*4)*Math.sin(t*Math.PI)*scale*.12)
   }else{
    const a=t*Math.PI*2,timeAngle=time*(motif==='wind'?1.3:.25),r=scale*(impact?.4+p*.8:residue?.9:.64)
    point.set(Math.cos(a+timeAngle)*r,motif==='wind'?Math.sin(a*3+time)*scale*.28:0,Math.sin(a+timeAngle)*r)
    if(motif==='sigil'&&i%3===0)point.multiplyScalar(.68)
   }
   values.setXYZ(i*2+j,point.x,point.y,point.z)
  }
  values.needsUpdate=true;trailMat.opacity=Math.min(1,(style.archetype==='storm'?.9:.45)*fade*intensity)
  trail.visible=style.archetype==='storm'||travel||style.archetype==='resonance'||style.archetype==='sigil'
  volume.visible=visual.shape!=='point'&&(impact||residue||(visual.shape==='beam'||visual.shape==='cone')&&travel)
  volume.position.copy(visual.shape==='sphere'?end:start).sub(anchor)
  ;(volume.material as THREE.LineBasicMaterial).opacity=(residue?.16*(1-p):.23)*intensity
  if(field&&fieldMat){field.visible=volume.visible;field.position.copy(visual.shape==='sphere'?end:start.clone().addScaledVector(delta,.5)).sub(anchor);fieldMat.opacity=Math.min(.16,(residue?.055:.095)*fade*intensity)}
 }
 update({phase:'preparation',progress:0,visible:false},0)
 function dispose(){if(disposed)return;disposed=true;group.removeFromParent();if(flash){flash.intensity=0;flash.visible=false;flash.shadow.dispose();flash.removeFromParent()}instances.forEach(mesh=>mesh.dispose());geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());geometries.clear();materials.clear();group.clear()}
 return {group,update,dispose}
}
