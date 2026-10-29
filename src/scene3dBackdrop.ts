import * as THREE from 'three'
import type {MapFrame} from './scenePerception'
import {lightDirection,normalizeLightTuning} from './scene3dViewSettings.ts'
import type {LightPreset,LightTuning} from './scene3dViewSettings'

// Presentation scenery only. This never enters the scene's entity, support,
// collision, disclosure or picking lists.
export function createSceneBackdrop(frame:MapFrame,environment:'surface'|'underground',initialMode:LightPreset,initialTuning:LightTuning,restricted:boolean,quality:string){
 const underground=environment==='underground',span=Math.max(frame.width,frame.depth,5)
 const group=new THREE.Group();group.name='scene-backdrop'
 const resources=new Set<THREE.BufferGeometry|THREE.Material>()
 const keep=<T extends THREE.BufferGeometry|THREE.Material>(value:T):T=>{resources.add(value);return value}
 const decorate=(mesh:THREE.Mesh)=>{mesh.raycast=()=>{};mesh.userData.backdrop=true;group.add(mesh);return mesh}
 let mode=initialMode,background='',fogColor='',disposed=false
 const skyUniforms={
  zenith:{value:new THREE.Color()},horizon:{value:new THREE.Color()},nadir:{value:new THREE.Color()},
  cloudColor:{value:new THREE.Color()},celestialColor:{value:new THREE.Color()},
  celestialDirection:{value:new THREE.Vector3()},night:{value:0},cavern:{value:underground?1:0},
  celestialPower:{value:1},detail:{value:quality==='low'?0:1},
 }
 const skyMaterial=keep(new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,toneMapped:false,fog:false,uniforms:skyUniforms,
  vertexShader:`varying vec3 direction;
   void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`varying vec3 direction;
   uniform vec3 zenith,horizon,nadir,cloudColor,celestialColor,celestialDirection;
   uniform float night,cavern,celestialPower,detail;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}
   void main(){
    vec3 d=normalize(direction);
    vec3 c=d.y>=0.0?mix(horizon,zenith,pow(clamp(d.y,0.0,1.0),0.56)):mix(horizon,nadir,pow(clamp(-d.y,0.0,1.0),0.3));
    if(cavern>0.5){
     vec2 rock=vec2(atan(d.z,d.x)*3.0,d.y*3.0);
     float strata=noise(rock*2.0)*0.6+noise(rock*6.0)*0.25;
     float rim=smoothstep(-0.22,0.17,d.y+(strata-0.5)*0.42);
     c=mix(c,c*0.48,rim);c+=vec3(0.008,0.012,0.014)*strata;
    }else{
     float above=smoothstep(0.015,0.15,d.y);
     vec2 p=d.xz/max(0.23,d.y+0.25);
     float cloud=noise(p*2.7+vec2(3.7,1.8))*0.64+noise(p*5.4+vec2(2.1,7.2))*0.25;
     if(detail>0.5)cloud+=noise(p*10.8)*0.11;
     float cover=smoothstep(0.54,0.76,cloud)*above;
     float facing=max(dot(d,normalize(celestialDirection)),0.0);
     float disc=smoothstep(0.99945,0.9997,facing);
     float glow=pow(facing,night>0.5?180.0:90.0)*(night>0.5?0.06:0.16);
     if(night>0.5){
      vec3 tangent=normalize(cross(normalize(celestialDirection),vec3(0.0,1.0,0.0)));
      vec3 moonShade=normalize(celestialDirection+tangent*0.014+vec3(0.0,0.009,0.0));
      disc*=1.0-smoothstep(0.99945,0.9997,dot(d,moonShade))*0.88;
      vec2 stars=vec2(atan(d.z,d.x)*75.0,asin(clamp(d.y,-1.0,1.0))*75.0);
      vec2 cell=floor(stars),f=fract(stars)-0.5;
      float star=(1.0-smoothstep(0.0,0.095,length(f)))*step(0.987,hash(cell));
      c+=vec3(0.46,0.58,0.73)*star*above*(1.0-cover);
     }
     c+=celestialColor*(disc+glow)*celestialPower*above;
     c=mix(c,cloudColor,cover*(night>0.5?0.38:0.66));
    }
    gl_FragColor=vec4(c,1.0);
    #include <colorspace_fragment>
   }`,
 }))
 const sky=decorate(new THREE.Mesh(keep(new THREE.SphereGeometry(1,quality==='low'?16:28,quality==='low'?8:16)),skyMaterial))
 sky.name='backdrop-sky';sky.userData.skyBackground=true;sky.frustumCulled=false;sky.renderOrder=-10000

 let groundMaterial:THREE.MeshStandardMaterial|undefined,earthMaterial:THREE.MeshStandardMaterial|undefined
 // In a personal map, even anonymous ground would turn undisclosed territory
 // into visible terrain. Only the surrounding atmosphere is safe there.
 if(!restricted){
  const padding=Math.max(3,span*.35),width=frame.width+padding*2,depth=frame.depth+padding*2,thickness=Math.max(.3,Math.min(1.5,span*.025))
  earthMaterial=keep(new THREE.MeshStandardMaterial({color:underground?'#29343a':'#493e2c',roughness:1,metalness:0}))
  const earth=decorate(new THREE.Mesh(keep(new THREE.BoxGeometry(width,thickness,depth)),earthMaterial))
  earth.name='backdrop-earth';earth.position.set(frame.width/2,frame.groundZ-.055-thickness/2,frame.depth/2);earth.receiveShadow=true
  groundMaterial=keep(new THREE.MeshStandardMaterial({color:underground?'#48545a':'#71844a',roughness:1,metalness:0}))
  groundMaterial.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 backdropGround;').replace('#include <begin_vertex>','#include <begin_vertex>\nbackdropGround=(modelMatrix*vec4(transformed,1.0)).xz;')
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec2 backdropGround;
    float backdropHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float backdropNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(backdropHash(i),backdropHash(i+vec2(1.0,0.0)),f.x),mix(backdropHash(i+vec2(0.0,1.0)),backdropHash(i+vec2(1.0,1.0)),f.x),f.y);}`)
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float largeGrain=backdropNoise(backdropGround*${underground?'1.7':'0.24'});
    float fineGrain=backdropNoise(backdropGround*${quality==='low'?'2.4':'14.0'});
    diffuseColor.rgb*=0.76+largeGrain*0.31+fineGrain*0.13;`)
  }
  groundMaterial.customProgramCacheKey=()=>`scene-backdrop:${environment}:${quality==='low'?'low':'full'}`
  const ground=decorate(new THREE.Mesh(keep(new THREE.PlaneGeometry(width,depth)),groundMaterial))
  ground.name='backdrop-ground';ground.rotation.x=-Math.PI/2;ground.position.set(frame.width/2,frame.groundZ-.04,frame.depth/2);ground.receiveShadow=true
 }
 function configure(nextMode:LightPreset,nextTuning:LightTuning){
  mode=nextMode
  const night=mode==='night',tuning=normalizeLightTuning(nextTuning,mode)
  background=underground?'#10191f':night?'#111d35':'#789ca8'
  fogColor=underground?'#18252b':night?'#192b38':'#8ca7a6'
  skyUniforms.zenith.value.set(underground?'#0d131b':night?'#0c142b':'#497d9b')
  skyUniforms.horizon.value.set(underground?'#26353c':night?'#243548':'#a2b8b3')
  skyUniforms.nadir.value.set(underground?'#10191d':night?'#12241f':'#536745')
  skyUniforms.cloudColor.value.set(night?'#52647b':'#d5daca')
  skyUniforms.celestialColor.value.set(night?'#a6c6e2':'#ffe4a0')
  skyUniforms.celestialDirection.value.copy(lightDirection(tuning));skyUniforms.night.value=night?1:0;skyUniforms.celestialPower.value=tuning.sun
  groundMaterial?.color.set(underground?'#48545a':'#71844a')
  earthMaterial?.color.set(underground?'#29343a':'#493e2c')
 }
 configure(mode,initialTuning)
 function update(camera:THREE.Camera){
  // Follow translation only: the sky keeps its world compass and light
  // direction. Keeping it inside the camera's far plane also supports the
  // editor's extreme zoom-out without introducing a white clipping boundary.
  const far='far' in camera&&typeof camera.far==='number'?camera.far:Math.max(500,span*8)
  sky.position.copy(camera.position);sky.scale.setScalar(far*.92);sky.updateMatrixWorld(true)
 }
 function dispose(){if(disposed)return;disposed=true;group.removeFromParent();resources.forEach(value=>value.dispose());resources.clear()}
 return {group,get background(){return background},get fogColor(){return fogColor},configure,update,dispose}
}
