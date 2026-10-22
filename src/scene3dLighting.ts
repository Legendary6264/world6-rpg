import * as THREE from 'three'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'
import type {MapFrame} from './scenePerception'
import type {RenderEntity} from './scene3dModel'

export type LightingMode='studio'|'day'|'night'
export const lightingLabels:Record<LightingMode,string>={studio:'Рабочий',day:'День',night:'Ночь'}
const settings={
 studio:{sky:'#dce7ed',ground:'#8b8781',ambient:1.15,key:'#fff1dd',power:3.1,fill:.8,rim:1.15,environment:.55,exposure:1,background:'#27333a'},
 day:{sky:'#bed7ef',ground:'#6b6d4d',ambient:.8,key:'#fff0d2',power:3.8,fill:.28,rim:.3,environment:.42,exposure:1,background:'#657e8b'},
 night:{sky:'#8298c0',ground:'#222d38',ambient:.14,key:'#a9c8ff',power:.62,fill:.08,rim:.18,environment:.12,exposure:1.07,background:'#101a2b'},
} as const

export function createLightingEnvironment(mode:LightingMode){
 if(mode==='studio'){const room=new RoomEnvironment();return {scene:room,dispose:()=>room.dispose()}}
 // Sky/ground radiance for outdoor materials; the environment contains no
 // scene entities and therefore cannot reflect undisclosed world geometry.
 const night=mode==='night',scene=new THREE.Scene(),geometry=new THREE.SphereGeometry(24,24,12)
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,toneMapped:false,uniforms:{
  zenith:{value:new THREE.Color(night?'#101d3a':'#80a8cf')},horizon:{value:new THREE.Color(night?'#334566':'#dce0cf')},ground:{value:new THREE.Color(night?'#101b22':'#585d44')},
  sunColor:{value:new THREE.Color(night?'#a4bee6':'#ffe3ad')},sunDirection:{value:new THREE.Vector3(-.55,night?.72:.95,.6).normalize()},sunPower:{value:night?.6:5},
 },vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:'varying vec3 direction;uniform vec3 zenith,horizon,ground,sunColor,sunDirection;uniform float sunPower;void main(){vec3 d=normalize(direction);vec3 c=d.y>0.0?mix(horizon,zenith,pow(d.y,0.55)):mix(horizon,ground,pow(-d.y,0.22));float facing=max(dot(d,sunDirection),0.0);c+=sunColor*sunPower*(pow(facing,96.0)*0.18+pow(facing,1100.0));gl_FragColor=vec4(c,1.0);}'})
 scene.add(new THREE.Mesh(geometry,material));return {scene,dispose:()=>{geometry.dispose();material.dispose()}}
}

export function createSceneLighting(frame:MapFrame,mode:LightingMode,quality:string,restricted:boolean){
 const s=settings[mode],group=new THREE.Group(),span=Math.max(frame.width,frame.depth,5),center=new THREE.Vector3(frame.width/2,frame.groundZ,frame.depth/2)
 group.name='lighting:'+mode
 group.add(new THREE.HemisphereLight(s.sky,s.ground,s.ambient))
 const key=new THREE.DirectionalLight(s.key,s.power)
 const direction=new THREE.Vector3(-.55,mode==='night'?.72:.95,.6).normalize()
 key.position.copy(center).addScaledVector(direction,span*2);key.target.position.copy(center)
 key.castShadow=!restricted&&quality!=='low';key.shadow.mapSize.set(quality==='high'?2048:1024,quality==='high'?2048:1024)
 key.shadow.bias=-.00015;key.shadow.normalBias=.014;key.shadow.radius=3
 key.shadow.camera.near=.1;key.shadow.camera.far=span*6
 group.add(key,key.target)
 const fill=new THREE.DirectionalLight(mode==='night'?'#789ad2':'#bdceda',s.fill)
 fill.position.copy(center).add(new THREE.Vector3(span*.8,span*.4,-span*.4));fill.target.position.copy(center);group.add(fill,fill.target)
 const rim=new THREE.DirectionalLight(mode==='studio'?'#e8f2ff':'#c9d4d4',s.rim)
 rim.position.copy(center).add(new THREE.Vector3(-span*.2,span*.65,-span));rim.target.position.copy(center);group.add(rim,rim.target)
 const lamps:{light:THREE.PointLight;anchor:THREE.Object3D}[]=[]
 function addLamp(e:RenderEntity,anchor:THREE.Object3D){
  if(restricted||e.appearance.remembered||mode==='studio'||lamps.length>=8)return
  const light=new THREE.PointLight('#ffb75f',mode==='night'?38:8,Math.min(14,Math.max(5,e.geometry.height*3.8)),2)
  const head=Math.min(e.geometry.height*.39,Math.min(e.geometry.width,e.geometry.depth)*1.4)
  light.position.set(0,e.geometry.height-head*.58,0);light.shadow.mapSize.set(512,512)
  light.shadow.bias=-.0004;light.shadow.normalBias=.012;light.shadow.camera.near=.04;light.shadow.camera.far=light.distance
  anchor.add(light);lamps.push({light,anchor})
 }
 function update(camera:THREE.Camera,target:THREE.Vector3){
  // A camera-centred shadow volume preserves detail when focusing a small
  // object. Direction and illumination stay fixed while the volume follows.
  const distance=camera.position.distanceTo(target),radius=Math.min(span*.8,Math.max(3,distance*.65))
  key.target.position.copy(target);key.position.copy(target).addScaledVector(direction,span*2)
  const c=key.shadow.camera;c.left=c.bottom=-radius;c.right=c.top=radius;c.updateProjectionMatrix()
  const budget=quality==='high'?2:quality==='low'?0:1
  const sorted=[...lamps].sort((a,b)=>a.anchor.position.distanceToSquared(camera.position)-b.anchor.position.distanceToSquared(camera.position))
  sorted.forEach(({light},index)=>{light.castShadow=index<budget})
 }
 function dispose(){key.shadow.map?.dispose();lamps.forEach(({light})=>light.shadow.map?.dispose())}
 return {group,environmentIntensity:s.environment,exposure:s.exposure,background:s.background,addLamp,update,dispose}
}
