import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {bindFlameMaterial,updateFlameMaterials,setEmitterIntensity,flamePulse,visualSeed,readMotionPreference,saveMotionPreference} from '../src/scene3dMotion.ts'

test('Огонь: стабильные фазы, ограниченное мерцание, пауза и новые регуляторы без изменения геометрии',()=>{
 const material=new THREE.MeshStandardMaterial({emissive:'#ff9e4a',emissiveIntensity:2}),bounds=new THREE.Box3(new THREE.Vector3(-.1,.8,-.08),new THREE.Vector3(.1,1.2,.08)),geometry=new THREE.BoxGeometry(.2,.4,.16),before=geometry.attributes.position.array.slice()
 bindFlameMaterial(material,bounds,'candle:17');const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>'};material.onBeforeCompile(shader,{})
 assert(shader.vertexShader.includes('gbFlameMask'));assert(shader.uniforms.gbFlameSpan.value>0);assert.equal(visualSeed('a'),visualSeed('a'));assert.notEqual(visualSeed('a'),visualSeed('b'))
 for(let t=0;t<30;t+=.03)assert(flamePulse(t,1)>.91&&flamePulse(t,1)<1.09)
 const key=material.customProgramCacheKey();updateFlameMaterials([material],3.7,true);assert.equal(shader.uniforms.gbFlameEnabled.value,1);assert.equal(shader.uniforms.gbFlameTime.value,3.7);assert.notEqual(material.emissiveIntensity,2)
 setEmitterIntensity(material,4);updateFlameMaterials([material],4.3,true);assert(material.emissiveIntensity>3.6&&material.emissiveIntensity<4.4)
 updateFlameMaterials([material],5,false);assert.equal(shader.uniforms.gbFlameEnabled.value,0);assert.equal(material.emissiveIntensity,4);assert.equal(material.customProgramCacheKey(),key);assert.deepEqual(geometry.attributes.position.array,before)
 geometry.dispose();material.dispose()
})
test('Движение: системное уменьшение анимации, сохранённый выбор и отказ хранилища',()=>{
 const previous=globalThis.window;let saved=null
 try{
  globalThis.window={matchMedia:()=>({matches:true}),localStorage:{getItem:()=>saved,setItem:(_,value)=>saved=value}}
  assert.equal(readMotionPreference(),false);saveMotionPreference(true);assert.equal(readMotionPreference(),true);saveMotionPreference(false);assert.equal(readMotionPreference(),false)
  window.localStorage.getItem=()=>{throw Error('blocked')};assert.equal(readMotionPreference(),false);window.localStorage.setItem=()=>{throw Error('blocked')};assert.doesNotThrow(()=>saveMotionPreference(true))
 }finally{globalThis.window=previous}
})
