import * as THREE from 'three'

// Presentation time is deliberately separate from campaign time and physics.
export const flameAssets=new Set(['candle','torch','chandelier','fireplace','brazier','trap-fire','campfire','hanging-lantern','street-lamp','signal-lantern','forge','kiln','bread-oven'])
export function visualSeed(id:string){let seed=0;for(const c of id)seed=(seed*31+c.charCodeAt(0))>>>0;return seed/0xffffffff*Math.PI*2}
export function flamePulse(time:number,phase=0){return 1+.045*Math.sin(time*4.7+phase)+.025*Math.sin(time*11.3+phase*2.1)+.015*Math.sin(time*19.1+phase*.7)}
type FlameVisual={time:{value:number};enabled:{value:number};phase:number;baseIntensity:number}
export function bindFlameMaterial(material:THREE.MeshStandardMaterial,bounds:THREE.Box3,id:string){
 const time={value:0},enabled={value:0},phase=visualSeed(id),height=Math.max(.001,bounds.max.y-bounds.min.y),size=bounds.getSize(new THREE.Vector3())
 const visual:FlameVisual={time,enabled,phase,baseIntensity:material.emissiveIntensity};material.userData.flameVisual=visual
 const base={value:bounds.min.y},span={value:height},bend={value:Math.max(0,Math.min(height*.07,size.x*.04,size.z*.04))},seed={value:phase}
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{gbFlameTime:time,gbFlameEnabled:enabled,gbFlameBase:base,gbFlameSpan:span,gbFlameBend:bend,gbFlameSeed:seed})
  shader.vertexShader='uniform float gbFlameTime, gbFlameEnabled, gbFlameBase, gbFlameSpan, gbFlameBend, gbFlameSeed;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float gbFlameMask=clamp((transformed.y-gbFlameBase)/gbFlameSpan,0.0,1.0);
    float gbFlameWave=sin(gbFlameTime*4.3+gbFlameSeed+gbFlameMask*3.1);
    transformed.x+=gbFlameWave*gbFlameBend*gbFlameMask*gbFlameMask*gbFlameEnabled;
    transformed.z+=cos(gbFlameTime*3.7+gbFlameSeed+gbFlameMask*2.0)*gbFlameBend*0.6*gbFlameMask*gbFlameEnabled;
    transformed.y-=gbFlameSpan*0.035*(0.5+0.5*gbFlameWave)*gbFlameMask*gbFlameMask*gbFlameEnabled;`)
 }
 material.customProgramCacheKey=()=> 'grani-flame-motion-v1'
}
export function setEmitterIntensity(material:THREE.MeshStandardMaterial,intensity:number){
 material.emissiveIntensity=intensity
 const visual=material.userData.flameVisual as FlameVisual|undefined;if(visual)visual.baseIntensity=intensity
}
export function updateFlameMaterials(resources:Iterable<unknown>,seconds:number,enabled:boolean){
 for(const resource of resources){
  if(!(resource instanceof THREE.MeshStandardMaterial))continue
  const visual=resource.userData.flameVisual as FlameVisual|undefined;if(!visual)continue
  visual.enabled.value=enabled?1:0;visual.time.value=seconds%4096
  resource.emissiveIntensity=visual.baseIntensity*(enabled?flamePulse(seconds,visual.phase):1)
 }
}
const motionKey='grani-bytiya:3d-motion:v1'
export function readMotionPreference(){
 try{if(typeof window==='undefined')return false;const saved=window.localStorage.getItem(motionKey);if(saved==='0'||saved==='1')return saved==='1';return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}catch{return false}
}
export function saveMotionPreference(enabled:boolean){try{window.localStorage.setItem(motionKey,enabled?'1':'0')}catch{/* Editing remains available without storage. */}}
