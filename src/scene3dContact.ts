import * as THREE from 'three'
import {GTAOPass} from 'three/examples/jsm/postprocessing/GTAOPass.js'
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js'

// The beauty pass has already rendered. Glass, water and emitters must not
// become opaque blockers in the contact pass's replacement normal material.
// Cutout foliage keeps its real shadow; its rectangular card is omitted from
// this coarse normal pass, which cannot reproduce per-material alpha tests.
export function withContactGeometry<T>(scene:THREE.Scene,draw:()=>T):T {
 const hidden:THREE.Object3D[]=[]
 scene.traverse(object=>{
  if(!object.visible)return
  if(object.userData.editorOverlay||object.userData.skyBackground){object.visible=false;hidden.push(object);return}
  if(object instanceof THREE.Line||object instanceof THREE.Points){object.visible=false;hidden.push(object);return}
  if(!(object instanceof THREE.Mesh))return
  const materials=Array.isArray(object.material)?object.material:[object.material]
  if(materials.every(m=>m.userData.lightEmitter||(m.transparent&&m.opacity<.9)||m.alphaTest>0)){object.visible=false;hidden.push(object)}
 })
 try{return draw()}finally{hidden.forEach(object=>{object.visible=true})}
}

export class SceneContactPass extends GTAOPass {
 needsUpdate=true
 private cached=false
 private composite=new FullScreenQuad()
 private viewMatrix=new THREE.Matrix4()
 private projectionMatrix=new THREE.Matrix4()
 override setSize(width:number,height:number){super.setSize(width,height);this.needsUpdate=true;this.cached=false}
 override render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget,delta:number,mask:boolean){
  const {autoUpdate,needsUpdate}=renderer.shadowMap,override=this.scene.overrideMaterial
  // The beauty pass has updated light shadows. Do not render them a second
  // time against the temporary, filtered normal/depth scene.
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false
  try{
   this.camera.updateMatrixWorld()
   const cameraChanged=!this.viewMatrix.equals(this.camera.matrixWorld)||!this.projectionMatrix.equals(this.camera.projectionMatrix)
   if(this.cached&&!this.needsUpdate&&!cameraChanged&&this.output===GTAOPass.OUTPUT.Default){
    const autoClear=renderer.autoClear
    try{
     renderer.autoClear=false;renderer.setRenderTarget(this.renderToScreen?null:write)
     this.copyMaterial.uniforms.tDiffuse.value=read.texture;this.copyMaterial.blending=THREE.NoBlending
     this.composite.material=this.copyMaterial;this.composite.render(renderer)
     this.blendMaterial.uniforms.intensity.value=this.blendIntensity;this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture
     this.composite.material=this.blendMaterial;this.composite.render(renderer)
    }finally{renderer.autoClear=autoClear}
   }else{
    withContactGeometry(this.scene,()=>super.render(renderer,write,read,delta,mask))
    this.viewMatrix.copy(this.camera.matrixWorld);this.projectionMatrix.copy(this.camera.projectionMatrix)
    this.cached=true;this.needsUpdate=false
   }
  }
  finally{renderer.shadowMap.autoUpdate=autoUpdate;renderer.shadowMap.needsUpdate=needsUpdate;this.scene.overrideMaterial=override}
 }
 override dispose(){this.composite.dispose();super.dispose();this.gtaoMaterial.dispose();this.blendMaterial.dispose()}
}
