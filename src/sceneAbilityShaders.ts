import * as THREE from 'three'
import type {AbilityVisualStyle} from './abilityVisualStyles'

export type AbilitySurface='core'|'envelope'|'ribbon'|'mote'|'field'|'smoke'
// Built-in Three materials retain their complete clipping, instancing and
// color-space pipeline. Procedural detail adds no textures or remote assets.
export function abilitySurfaceMaterial(color:string,highlight:string,shade:string,style:AbilityVisualStyle,layer:AbilitySurface,clippingPlanes:THREE.Plane[]=[]){
  const dark=style.archetype==='shadow',solid=style.archetype==='mineral'||style.archetype==='frost'
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,depthWrite:false,depthTest:true,toneMapped:true,side:THREE.DoubleSide,
    blending:dark||solid&&layer==='core'?THREE.NormalBlending:THREE.AdditiveBlending,clippingPlanes})
  const uniforms={fxTime:{value:0},fxOpacity:{value:1},fxPower:{value:1},fxHighlight:{value:new THREE.Color(highlight)},fxShade:{value:new THREE.Color(shade)},
    fxStyle:{value:['flame','fluid','storm','vortex','mineral','frost','growth','renewal','radiance','shadow','sigil','resonance'].indexOf(style.archetype)},
    fxGlow:{value:style.glow},fxVariant:{value:style.variant},fxLayer:{value:['core','envelope','ribbon','mote','field','smoke'].indexOf(layer)}}
  material.userData.abilityEffect=true;material.userData.lightEmitter=true;material.userData.proceduralSurface=layer
  material.customProgramCacheKey=()=> 'world6-ability-surface-v2'
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms)
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
varying vec3 vFxPosition;
varying vec3 vFxNormal;
varying vec3 vFxView;
varying vec2 vFxUv;
uniform float fxTime, fxStyle, fxLayer, fxVariant;`).replace('#include <begin_vertex>',`#include <begin_vertex>
if(fxLayer<.5&&fxStyle<.5){transformed.x+=sin(position.y*5.0-fxTime*3.0+fxVariant)*max(0.0,position.y)*.09;transformed.z+=cos(position.y*4.0-fxTime*2.5)*max(0.0,position.y)*.08;}
if(fxLayer<.5&&fxStyle>.5&&fxStyle<1.5)transformed+=normal*.04*sin(position.y*6.0+fxTime*2.0);
vFxPosition = position;
vFxUv = uv;
vec3 fxNormal = normal;
#ifdef USE_INSTANCING
  fxNormal = mat3(instanceMatrix) * fxNormal;
#endif
vFxNormal = normalize(normalMatrix * fxNormal);`).replace('#include <project_vertex>',`#include <project_vertex>
vFxView = -mvPosition.xyz;`)
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vFxPosition;
varying vec3 vFxNormal;
varying vec3 vFxView;
varying vec2 vFxUv;
uniform float fxTime, fxOpacity, fxPower, fxStyle, fxGlow, fxVariant, fxLayer;
uniform vec3 fxHighlight, fxShade;
float fxHash(vec3 p) { p = fract(p * .3183099 + vec3(.17,.31,.73)); return fract(17.0 * p.x * p.y * p.z * (p.x+p.y+p.z)); }
float fxNoise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(fxHash(i),fxHash(i+vec3(1,0,0)),f.x),mix(fxHash(i+vec3(0,1,0)),fxHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(fxHash(i+vec3(0,0,1)),fxHash(i+vec3(1,0,1)),f.x),mix(fxHash(i+vec3(0,1,1)),fxHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}`).replace('#include <color_fragment>',`#include <color_fragment>
vec3 q=vFxPosition*3.2+vec3(fxVariant*.71,-fxTime*.7,fxTime*.18);
float n=fxNoise(q)*.65+fxNoise(q*2.13)*.35;
float rim=pow(1.0-abs(dot(normalize(vFxNormal),normalize(vFxView))),2.3);
float veins=pow(.5+.5*sin(vFxPosition.y*17.0+vFxPosition.x*6.0+n*7.0-fxTime*2.0),5.0);
float hot=clamp(rim*.6+veins*.3,0.0,1.0);
float alpha=1.0;
if(fxStyle<.5) { hot=pow(clamp((1.0-vFxUv.y)*.6+n*.25+rim*.15,0.0,1.0),3.0)*.85; alpha=smoothstep(.12,.48,n+.5*(1.0-vFxUv.y)); }
else if(fxStyle<1.5) { hot=rim*.85+veins*.35; alpha=.35+rim*.65; }
else if(fxStyle<3.5) { hot=rim*.65+veins*.6; alpha=.45+n*.55; }
else if(fxStyle<5.5) { hot=rim*.6+step(.78,n)*.45; diffuseColor.rgb*=.45+.55*abs(normalize(vFxNormal).y); }
else if(fxStyle>8.5&&fxStyle<9.5) { diffuseColor.rgb=mix(fxShade*.2,diffuseColor.rgb,rim*.8+veins*.2); hot=rim*.6; alpha=.6+rim*.4; }
else { hot=rim*.65+veins*.4; }
if(fxLayer>.5&&fxLayer<1.5) alpha*=pow(rim,1.1)*(.3+n*.7);
if(fxLayer>1.5&&fxLayer<2.5) alpha*=pow(max(0.0,1.0-abs(vFxUv.x*2.0-1.0)),.7);
if(fxLayer>3.5&&fxLayer<4.5) alpha*=rim*.5+veins*.22;
if(fxLayer>4.5){alpha*=pow(1.0-rim,1.6)*(.4+n*.6);hot*=.12;}
diffuseColor.rgb=mix(diffuseColor.rgb,fxHighlight,clamp(hot,0.0,.88))*(1.0+fxGlow*.75*fxPower);
diffuseColor.a*=clamp(alpha*fxOpacity,0.0,1.0);`)
  }
  return {material,update:(seconds:number,opacity:number,power:number)=>{uniforms.fxTime.value=Number.isFinite(seconds)?seconds:0;uniforms.fxOpacity.value=THREE.MathUtils.clamp(opacity,0,1);uniforms.fxPower.value=THREE.MathUtils.clamp(power,0,2)}}
}
