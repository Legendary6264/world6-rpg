import * as THREE from 'three'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'
import {RectAreaLightUniformsLib} from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import type {MapFrame} from './scenePerception'
import type {RenderEntity} from './scene3dModel'
import {defaultLightTuning,normalizeLightTuning,lightDirection} from './scene3dViewSettings.ts'
import {flameAssets,flamePulse,visualSeed} from './scene3dMotion.ts'
import type {LightPreset,LightTuning} from './scene3dViewSettings'
import type {SceneEmission} from './scene3dEmitters'
import type {SceneEnvironment} from './sceneEnvironment'
import {presentationAssetId} from './legacyAssets.ts'

export type LightingMode=LightPreset
export const lightingLabels:Record<LightingMode,string>={studio:'Рабочий',day:'День',night:'Ночь',tavern:'Тёплый интерьер'}
let areaLightsReady=false
const settings={
 tavern:{sky:'#eee4cd',ground:'#8a7659',ambient:.9,key:'#fff0cf',power:2.4,fill:.38,rim:.22,environment:.55,exposure:1,background:'#211a2e'},
 studio:{sky:'#dce7ed',ground:'#8b8781',ambient:.65,key:'#fff1dd',power:3.1,fill:.25,rim:.35,environment:.55,exposure:1,background:'#27333a'},
 day:{sky:'#bed7ef',ground:'#6b6d4d',ambient:.8,key:'#fff0d2',power:3.8,fill:.28,rim:.3,environment:.42,exposure:1,background:'#657e8b'},
 night:{sky:'#8298c0',ground:'#222d38',ambient:.14,key:'#a9c8ff',power:.62,fill:.08,rim:.18,environment:.12,exposure:1.07,background:'#101a2b'},
} as const

export function createLightingEnvironment(mode:LightingMode,tuning:LightTuning=defaultLightTuning(mode),environment:SceneEnvironment='surface'){
 if(mode==='studio'&&environment!=='underground'){const room=new RoomEnvironment();return {scene:room,dispose:()=>room.dispose()}}
 // Sky/ground radiance for outdoor materials; the environment contains no
 // scene entities and therefore cannot reflect undisclosed world geometry.
 const underground=environment==='underground',night=mode==='night',interior=mode==='tavern',scene=new THREE.Scene(),geometry=new THREE.SphereGeometry(24,24,12)
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,toneMapped:false,uniforms:{
  zenith:{value:new THREE.Color(underground?'#11191e':night?'#101d3a':interior?'#d7c5a1':'#80a8cf')},horizon:{value:new THREE.Color(underground?'#273139':night?'#334566':interior?'#ede2c5':'#dce0cf')},ground:{value:new THREE.Color(underground?'#171d20':night?'#101b22':interior?'#765b41':'#585d44')},
  sunColor:{value:new THREE.Color(night?'#a4bee6':interior?'#fff0cc':'#ffe3ad')},sunDirection:{value:new THREE.Vector3().copy(lightDirection(tuning))},sunPower:{value:underground?0:(night?.6:interior?2:5)*tuning.sun},
 },vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:'varying vec3 direction;uniform vec3 zenith,horizon,ground,sunColor,sunDirection;uniform float sunPower;void main(){vec3 d=normalize(direction);vec3 c=d.y>0.0?mix(horizon,zenith,pow(d.y,0.55)):mix(horizon,ground,pow(-d.y,0.22));float facing=max(dot(d,sunDirection),0.0);c+=sunColor*sunPower*(pow(facing,96.0)*0.18+pow(facing,1100.0));gl_FragColor=vec4(c,1.0);}'})
 scene.add(new THREE.Mesh(geometry,material));return {scene,dispose:()=>{geometry.dispose();material.dispose()}}
}

export function createSceneLighting(frame:MapFrame,initialMode:LightingMode,quality:string,restricted:boolean,initialTuning:LightTuning=defaultLightTuning(initialMode),environment:SceneEnvironment='surface'){
 let mode=initialMode,tuning=normalizeLightTuning(initialTuning,mode)
 const group=new THREE.Group(),span=Math.max(frame.width,frame.depth,5),center=new THREE.Vector3(frame.width/2,frame.groundZ,frame.depth/2)
 const hemisphere=new THREE.HemisphereLight(),key=new THREE.DirectionalLight(),direction=new THREE.Vector3().copy(lightDirection(tuning))
 group.add(hemisphere)
 key.position.copy(center).addScaledVector(direction,span*2);key.target.position.copy(center)
 key.castShadow=!restricted&&quality!=='low';key.shadow.mapSize.set(quality==='high'?2048:1024,quality==='high'?2048:1024)
 key.shadow.bias=-.00003;key.shadow.normalBias=.003
 group.add(key,key.target)
 const fill=new THREE.DirectionalLight()
 fill.position.copy(center).add(new THREE.Vector3(span*.8,span*.4,-span*.4));fill.target.position.copy(center);group.add(fill,fill.target)
 const rim=new THREE.DirectionalLight()
 rim.position.copy(center).add(new THREE.Vector3(-span*.2,span*.65,-span));rim.target.position.copy(center);group.add(rim,rim.target)
 const softboxes:THREE.RectAreaLight[]=[]
 if(!restricted&&quality!=='low'){
  if(!areaLightsReady){RectAreaLightUniformsLib.init();areaLightsReady=true}
  for(const side of [-1,1]){
   const box=new THREE.RectAreaLight(side===-1?'#ffe8ce':'#d8e8ff',1,span*.65,span*.45)
   box.position.copy(center).add(new THREE.Vector3(side*span*.65,span*.65,side*span*.3));box.lookAt(center)
   group.add(box);softboxes.push(box)
  }
 }
 const releaseMap=(light:THREE.DirectionalLight|THREE.PointLight)=>{light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapPass?.dispose();light.shadow.mapPass=null}
 const lamps:{light:THREE.PointLight|null;anchor:THREE.Object3D;entity:RenderEntity;position:THREE.Vector3;color:THREE.Color;near:number;selected:boolean;baseIntensity:number;phase:number}[]=[]
 const lampRange=(e:RenderEntity)=>presentationAssetId(e.geometry)==='candle'?4.5:presentationAssetId(e.geometry)==='fireplace'?8:presentationAssetId(e.geometry)==='brazier'?7.5:Math.min(14,Math.max(5,e.geometry.height*3.8))
 const lampPower=(e:RenderEntity)=>presentationAssetId(e.geometry)==='candle'?.18:presentationAssetId(e.geometry)==='brazier'?.75:1
 const lampHeight=(e:RenderEntity)=>e.geometry.asset==='fireplace'?e.geometry.height*.3:e.geometry.asset==='brazier'?e.geometry.height*.84:e.geometry.height-Math.min(e.geometry.height*.39,Math.min(e.geometry.width,e.geometry.depth)*1.4)*.58
 function configureLamp(entry:typeof lamps[number]){
  let {light}=entry
  if(!entry.selected||mode==='studio'&&!presentationAssetId(entry.entity.geometry)||tuning.lamps===0){
   if(light){light.removeFromParent();light.castShadow=false;releaseMap(light)}
   return
  }
  if(!light){
   const e=entry.entity
   light=new THREE.PointLight(entry.color,1,lampRange(e),2)
   light.position.copy(entry.position);light.shadow.mapSize.set(512,512)
   light.shadow.bias=-.0001;light.shadow.normalBias=Math.min(.004,Math.max(.0008,e.geometry.height*.001));light.shadow.camera.near=entry.near;light.shadow.camera.far=light.distance
   entry.light=light
  }
  entry.baseIntensity=(mode==='night'?38:mode==='tavern'?15:8)*lampPower(entry.entity)*tuning.lamps
  light.intensity=entry.baseIntensity
  light.shadow.radius=2*tuning.softness
  if(light.parent!==entry.anchor)entry.anchor.add(light)
 }
 function configure(nextMode:LightingMode,nextTuning:LightTuning){
  mode=nextMode;tuning=normalizeLightTuning(nextTuning,mode)
  const s=settings[mode];group.name='lighting:'+mode
  hemisphere.color.set(s.sky);hemisphere.groundColor.set(s.ground);hemisphere.intensity=s.ambient*tuning.ambient*(environment==='underground'?.32:1)
  key.color.set(s.key);key.intensity=s.power*tuning.sun*(environment==='underground'?.14:1);direction.copy(lightDirection(tuning))
  key.castShadow=!restricted&&quality!=='low'&&tuning.sun>0
  if(!key.castShadow)releaseMap(key)
  key.shadow.radius=(mode==='studio'?3.5:mode==='day'?1.6:2.4)*tuning.softness
  fill.color.set(mode==='night'?'#789ad2':mode==='tavern'?'#eee0be':'#bdceda');fill.intensity=s.fill*tuning.ambient*(environment==='underground'?.22:1)
  rim.color.set(mode==='studio'?'#e8f2ff':mode==='tavern'?'#e9d4b4':'#c9d4d4');rim.intensity=s.rim*tuning.ambient*(environment==='underground'?.3:1)
  softboxes.forEach((box,index)=>{box.visible=mode==='studio'&&environment!=='underground';box.intensity=(index===0?1.8:1.1)*tuning.ambient})
  lamps.forEach(configureLamp)
 }
 configure(mode,tuning)
 function addLamp(e:RenderEntity,anchor:THREE.Object3D,emission?:SceneEmission){
  if(restricted||e.appearance.remembered||e.geometry.active===false||lamps.length>=64)return
  const entry={light:null,anchor,entity:e,position:emission?.position.clone()??new THREE.Vector3(0,lampHeight(e),0),color:emission?.color.clone()??new THREE.Color('#ffb75f'),near:emission?Math.max(.004,Math.min(.04,emission.radius*.08)):.04,selected:lamps.length<8,baseIntensity:0,phase:visualSeed(e.id??e.interaction?.id??String(lamps.length))};lamps.push(entry);configureLamp(entry)
 }
 function update(camera:THREE.Camera,target:THREE.Vector3){
  // Quantize the coverage and snap its centre in the light's basis, so small
  // camera pans don't drag the shadow map's texels across stationary objects.
  const distance=camera.position.distanceTo(target),coverage=camera instanceof THREE.OrthographicCamera?Math.max(camera.right-camera.left,camera.top-camera.bottom)/camera.zoom*.65:distance*.58
  const radius=Math.ceil(Math.min(span,Math.max(1.5,coverage))*4)/4
  const texel=radius*2/key.shadow.mapSize.x,right=new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right)
  const snapped=target.clone().addScaledVector(right,Math.round(target.dot(right)/texel)*texel-target.dot(right)).addScaledVector(up,Math.round(target.dot(up)/texel)*texel-target.dot(up))
  key.target.position.copy(snapped);key.position.copy(snapped).addScaledVector(direction,span*2)
  const extent=radius+Math.max(2,Math.min(span*2,(frame.maxZ-frame.minZ)||span)),c=key.shadow.camera
  c.left=c.bottom=-radius;c.right=c.top=radius;c.near=Math.max(.1,span*2-extent);c.far=span*2+extent;c.updateProjectionMatrix()
  key.shadow.normalBias=Math.max(.0007,Math.min(.012,texel*.5));key.shadow.bias=-Math.min(.00008,texel*.1/(c.far-c.near))
  const visibleAnchor=(anchor:THREE.Object3D)=>{for(let p:THREE.Object3D|null=anchor;p;p=p.parent)if(!p.visible)return false;return true}
  // Evaluate each position once. Smooth range weighting keeps a distant large
  // source from taking a slot where its light cannot reach, while candle-sized
  // sources do not outrank the fireplace simply because they are a little nearer.
  const rank=lamps.filter(e=>visibleAnchor(e.anchor)).map(entry=>{
   const position=entry.anchor.localToWorld(entry.position.clone()),distance=position.distanceToSquared(target),range=lampRange(entry.entity)
   return {entry,position,score:(distance+4)*(1+distance/(range*range))/(lampPower(entry.entity)*(entry.selected?1.15:1))}
  }).sort((a,b)=>a.score-b.score||a.entry.phase-b.entry.phase)
  const visible=new Set(rank.slice(0,quality==='low'?4:8).map(r=>r.entry));for(const entry of lamps){const selected=visible.has(entry);if(selected!==entry.selected){entry.selected=selected;configureLamp(entry)}}
  const budget=quality==='high'?2:quality==='low'?0:1
  const active=rank.flatMap(({entry,position})=>entry.light?.parent===entry.anchor?[{light:entry.light,phase:entry.phase,score:(1+.8*position.distanceToSquared(camera.position)+.2*position.distanceToSquared(target))/(lampPower(entry.entity)*Math.sqrt(lampRange(entry.entity)))*(entry.light.castShadow?.8:1)}]:[]).sort((a,b)=>a.score-b.score||a.phase-b.phase)
  active.forEach(({light},index)=>{const enabled=index<budget;if(light.castShadow&&!enabled)releaseMap(light);light.castShadow=enabled})
 }
 function animate(seconds:number|null){for(const {light,anchor,entity,baseIntensity,phase} of lamps)if(light?.parent===anchor)light.intensity=baseIntensity*(seconds!==null&&flameAssets.has(presentationAssetId(entity.geometry)??'')?flamePulse(seconds,phase):1)}
 function dispose(){key.shadow.dispose();lamps.forEach(({light})=>{light?.removeFromParent();light?.shadow.dispose()})}
 return {group,get environmentIntensity(){return settings[mode].environment*tuning.ambient*(environment==='underground'?.23:1)},get exposure(){return settings[mode].exposure},get background(){return environment==='underground'?'#10181d':settings[mode].background},configure,addLamp,update,animate,dispose}
}
