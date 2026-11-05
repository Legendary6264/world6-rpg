import * as THREE from 'three'
import type {AbilityVisualStyle} from './abilityVisualStyles'

export const abilityNoiseGLSL=`
float fxHash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.73));return fract(17.0*p.x*p.y*p.z*(p.x+p.y+p.z));}
float fxNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(fxHash(i),fxHash(i+vec3(1,0,0)),f.x),mix(fxHash(i+vec3(0,1,0)),fxHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(fxHash(i+vec3(0,0,1)),fxHash(i+vec3(1,0,1)),f.x),mix(fxHash(i+vec3(0,1,1)),fxHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fxCloud(vec3 p){return fxNoise(p)*.57+fxNoise(p*2.03)*.29+fxNoise(p*4.11)*.14;}
`

// Camera-facing quads keep a soft silhouette from every angle. The built-in
// project/clipping pipeline receives the final view position, including instances.
export function createAbilityAtmosphere(color:string,highlight:string,shade:string,style:AbilityVisualStyle,count:number,clippingPlanes:THREE.Plane[]=[]){
 const smoke=['flame','mineral','shadow'].includes(style.archetype),mist=['fluid','frost'].includes(style.archetype)
 const geometry=new THREE.PlaneGeometry(2,2),life=new Float32Array(count).fill(1)
 geometry.setAttribute('fxSeed',new THREE.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>((i*73+19)%101)/101),1))
 geometry.setAttribute('fxLife',new THREE.InstancedBufferAttribute(life,1))
 const material=new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,depthTest:true,toneMapped:true,side:THREE.DoubleSide,blending:smoke||mist?THREE.NormalBlending:THREE.AdditiveBlending,clippingPlanes})
 const uniforms={fxTime:{value:0},fxKind:{value:smoke?0:mist?1:2},fxHighlight:{value:new THREE.Color(highlight)},fxShade:{value:new THREE.Color(shade)},fxDark:{value:style.archetype==='shadow'?1:0}}
 material.userData.abilityEffect=true;material.userData.softAtmosphere=true;material.customProgramCacheKey=()=> 'world6-soft-atmosphere-v1'
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms)
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float fxSeed,fxLife;
varying vec2 vFxUv;
varying float vFxSeed,vFxLife;`).replace('#include <begin_vertex>',`#include <begin_vertex>
vFxUv=uv;vFxSeed=fxSeed;vFxLife=fxLife;`).replace('#include <project_vertex>',`
vec4 fxCenter=vec4(0.0,0.0,0.0,1.0);vec2 fxSize=vec2(1.0);
#ifdef USE_INSTANCING
fxCenter=instanceMatrix*fxCenter;fxSize=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
#endif
vec4 mvPosition=modelViewMatrix*fxCenter;
mvPosition.xy+=position.xy*fxSize;
gl_Position=projectionMatrix*mvPosition;`)
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vFxUv;varying float vFxSeed,vFxLife;
uniform float fxTime,fxKind,fxDark;uniform vec3 fxHighlight,fxShade;
${abilityNoiseGLSL}`).replace('#include <color_fragment>',`#include <color_fragment>
vec2 p=vFxUv*2.0-1.0;
float radial=max(0.0,1.0-dot(p,p));
float cloud=fxCloud(vec3(p*2.7+vFxSeed*13.0,-fxTime*.24+vFxSeed*7.0));
float alpha=pow(radial,1.8)*smoothstep(.16,.72,cloud);
if(fxKind<.5){diffuseColor.rgb=mix(fxShade*.28,diffuseColor.rgb*.35,cloud*.6);diffuseColor.rgb=mix(diffuseColor.rgb,fxShade*.12,fxDark*.8);}
else if(fxKind<1.5){diffuseColor.rgb=mix(diffuseColor.rgb*.65,fxHighlight,cloud*.65);alpha*=.7;}
else{float star=exp(-abs(p.x)*32.0)*exp(-abs(p.y)*3.0)+exp(-abs(p.y)*32.0)*exp(-abs(p.x)*3.0);diffuseColor.rgb=mix(diffuseColor.rgb,fxHighlight,radial*.5);alpha=radial*radial*.2+star*.55;}
diffuseColor.a*=clamp(alpha*vFxLife,0.0,1.0);`)
 }
 return {geometry,material,life,update(time:number){uniforms.fxTime.value=Number.isFinite(time)?time:0;(geometry.attributes.fxLife as THREE.InstancedBufferAttribute).needsUpdate=true}}
}

// This is a painted contact on an explicitly supplied floor, never an inferred
// collision, damage zone or persistent edit of the terrain.
export function abilityGroundMaterial(color:string,highlight:string,shade:string,style:AbilityVisualStyle,clippingPlanes:THREE.Plane[]=[]){
 const material=new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,depthTest:true,toneMapped:true,side:THREE.DoubleSide,clippingPlanes})
 const styles=['flame','fluid','storm','vortex','mineral','frost','growth','renewal','radiance','shadow','sigil','resonance']
 const uniforms={fxTime:{value:0},fxProgress:{value:0},fxStyle:{value:styles.indexOf(style.archetype)},fxHighlight:{value:new THREE.Color(highlight)},fxShade:{value:new THREE.Color(shade)}}
 material.userData.abilityEffect=true;material.userData.elementalContact=style.archetype;material.customProgramCacheKey=()=> 'world6-elemental-contact-v1'
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms)
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vFxUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFxUv=uv;')
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vFxUv;uniform float fxTime,fxProgress,fxStyle;uniform vec3 fxHighlight,fxShade;
${abilityNoiseGLSL}`).replace('#include <color_fragment>',`#include <color_fragment>
vec2 p=vFxUv*2.0-1.0;float r=length(p),a=atan(p.y,p.x),n=fxCloud(vec3(p*5.5,1.0));
float edge=1.0-smoothstep(.78,1.0,r),mask=0.0,hot=0.0;
float rings=pow(max(0.0,.5+.5*cos(r*37.0-fxTime*2.2)),15.0);
if(fxStyle<.5){mask=edge*smoothstep(.1,.55,n)*(.3+.7*(1.0-r));hot=pow(max(0.0,.5+.5*sin(a*11.0+r*17.0+n*8.0)),24.0)*(1.0-smoothstep(.1,1.5,fxProgress));diffuseColor.rgb=fxShade*.12;}
else if(fxStyle<1.5){mask=edge*(.14+rings*.75);hot=rings*.65;diffuseColor.rgb*=.35;}
else if(fxStyle<2.5){float branch=abs(sin(a*9.0+r*4.0+sin(r*24.0)*.4));mask=edge*pow(max(0.0,1.0-branch),32.0);hot=mask;}
else if(fxStyle<3.5){mask=edge*pow(max(0.0,.5+.5*cos(a*3.0+r*16.0-fxTime)),12.0);hot=mask*.7;}
else if(fxStyle<4.5){float cracks=pow(max(0.0,1.0-abs(sin(a*7.0+n*3.0+r*4.0))),30.0);mask=edge*(cracks*.9+n*.13);diffuseColor.rgb=fxShade*.25;hot=cracks*.25;}
else if(fxStyle<5.5){float crystal=pow(max(0.0,cos(a*6.0)),36.0);float twigs=pow(max(0.0,cos(a*6.0+r*28.0)),22.0);mask=edge*(crystal+twigs*.35)*(1.0-r*.5);hot=mask*.9;}
else if(fxStyle<6.5){float roots=pow(max(0.0,cos(a*7.0+sin(r*12.0)*.7)),18.0);mask=edge*(roots*.8+n*.12);hot=roots*.2;}
else if(fxStyle<7.5){float petal=pow(max(0.0,cos(a*5.0+r*9.0)),14.0);mask=edge*(petal*.65+rings*.25);hot=mask*.75;}
else if(fxStyle<8.5){mask=edge*pow(max(0.0,cos(a*12.0)),40.0);hot=mask;}
else if(fxStyle<9.5){mask=edge*smoothstep(.1,.62,n+sin(a*3.0+r*11.0-fxTime*.4)*.1);diffuseColor.rgb=fxShade*.12;hot=pow(max(0.0,1.0-abs(r-.74)*15.0),3.0)*.25;}
else if(fxStyle<10.5){float seal=pow(max(0.0,1.0-abs(r-.74)*28.0),2.0)+pow(max(0.0,cos(a*8.0)),28.0)*step(.55,r)*step(r,.88);mask=edge*seal;hot=seal*.8;}
else{mask=edge*rings;hot=rings*.65;}
diffuseColor.rgb=mix(diffuseColor.rgb,fxHighlight,clamp(hot,0.0,.9));
diffuseColor.a*=clamp(mask*edge,0.0,1.0);`)
 }
 return {material,update(time:number,progress:number){uniforms.fxTime.value=Number.isFinite(time)?time:0;uniforms.fxProgress.value=Math.max(0,Math.min(2,Number.isFinite(progress)?progress:0))}}
}
