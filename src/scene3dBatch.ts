import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Preserve the exact constructed silhouette while batching hundreds of small
// fasteners into one mesh per material. Parent/picking pivot never changes.
export function batchEntityParts(group:THREE.Group,release:(geometry:THREE.BufferGeometry)=>void,keep:(geometry:THREE.BufferGeometry)=>THREE.BufferGeometry){
 const batches=new Map<THREE.Material|string,{material:THREE.Material;parts:THREE.BufferGeometry[];palette:boolean}>()
 for(const child of [...group.children]){
  if(!(child instanceof THREE.Mesh)||Array.isArray(child.material))continue
  child.updateMatrix()
  const geometry=(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone()).applyMatrix4(child.matrix)
  const material=child.material,palette=material instanceof THREE.MeshStandardMaterial&&typeof material.userData.paletteBatch==='string'
  for(const attribute of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(attribute))geometry.deleteAttribute(attribute)
  if(palette){
   // Compatible tints share one draw. Store their linear RGB on the actual
   // vertices, preserving plank/wood variation without another material call.
   const colors=new Float32Array(geometry.getAttribute('position').count*3),color=(material as THREE.MeshStandardMaterial).color
   for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b}
   geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3))
  }
  if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2))
  const key=palette?'palette:'+material.userData.paletteBatch:material
  const batch:{material:THREE.Material;parts:THREE.BufferGeometry[];palette:boolean}=batches.get(key)??{material,parts:[],palette}
  batch.parts.push(geometry);batches.set(key,batch)
  release(child.geometry);group.remove(child)
 }
 for(const {material,parts,palette} of batches.values()){
  const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose())
  if(!geometry)throw Error('Model parts cannot be batched')
  if(palette){const standard=material as THREE.MeshStandardMaterial;standard.color.set('#ffffff');standard.vertexColors=true;standard.needsUpdate=true}
  const mesh=new THREE.Mesh(keep(geometry),material)
  mesh.castShadow=material.userData.castsShadow!==false&&!material.userData.lightEmitter&&(!material.transparent||material.opacity>.6);mesh.receiveShadow=true;group.add(mesh)
 }
}
