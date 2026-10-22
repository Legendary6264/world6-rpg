import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Preserve the exact constructed silhouette while batching hundreds of small
// fasteners into one mesh per material. Parent/picking pivot never changes.
export function batchEntityParts(group:THREE.Group,release:(geometry:THREE.BufferGeometry)=>void,keep:(geometry:THREE.BufferGeometry)=>THREE.BufferGeometry){
 const batches=new Map<THREE.Material,THREE.BufferGeometry[]>()
 for(const child of [...group.children]){
  if(!(child instanceof THREE.Mesh)||Array.isArray(child.material))continue
  child.updateMatrix()
  const geometry=(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone()).applyMatrix4(child.matrix)
  for(const attribute of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(attribute))geometry.deleteAttribute(attribute)
  if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2))
  const list=batches.get(child.material)??[];list.push(geometry);batches.set(child.material,list)
  release(child.geometry);group.remove(child)
 }
 for(const [material,parts] of batches){
  const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose())
  if(!geometry)throw Error('Model parts cannot be batched')
  const mesh=new THREE.Mesh(keep(geometry),material)
  mesh.castShadow=!material.userData.lightEmitter&&(!material.transparent||material.opacity>.6);mesh.receiveShadow=true;group.add(mesh)
 }
}
