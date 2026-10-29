import * as THREE from 'three'

export type SceneEmission={position:THREE.Vector3;color:THREE.Color;radius:number}

// Work in the completed model's local coordinates. Root placement, facing and
// scale are applied later by its light anchor, exactly once. Glass and painted
// surfaces never determine the source merely because their colour is bright.
export function modelEmission(root:THREE.Object3D,preferredPart?:string):SceneEmission|undefined{
 if(!root.visible)return
 const bounds=new THREE.Box3(),colour=new THREE.Color(0,0,0)
 let weight=0
 root.traverse(part=>{
  if(!(part instanceof THREE.Mesh))return
  if(preferredPart&&part.geometry.name!==preferredPart)return
  for(let object:THREE.Object3D|null=part;object&&object!==root;object=object.parent)if(!object.visible)return
  const emitters=(Array.isArray(part.material)?part.material:[part.material]).filter((m):m is THREE.MeshStandardMaterial=>m instanceof THREE.MeshStandardMaterial&&m.userData.lightEmitter)
  if(!emitters.length)return
  part.geometry.computeBoundingBox();if(!part.geometry.boundingBox||part.geometry.boundingBox.isEmpty())return
  part.updateMatrix();const local=part.matrix.clone()
  for(let parent=part.parent;parent&&parent!==root;parent=parent.parent){parent.updateMatrix();local.premultiply(parent.matrix)}
  const box=part.geometry.boundingBox.clone().applyMatrix4(local),size=box.getSize(new THREE.Vector3()),volume=Math.max(1e-9,size.x*size.y*size.z)
  bounds.union(box)
  for(const material of emitters){
   const power=volume*Math.max(0,material.emissiveIntensity)
   colour.add(material.emissive.clone().multiplyScalar(power));weight+=power
  }
 })
 if(bounds.isEmpty())return
 if(weight>0&&Math.max(colour.r,colour.g,colour.b)>0)colour.multiplyScalar(1/weight)
 else colour.set('#ffb75f')
 // Preserve chromaticity without changing the existing lamp-power controls.
 colour.multiplyScalar(1/Math.max(colour.r,colour.g,colour.b,1e-6))
 return {position:bounds.getCenter(new THREE.Vector3()),color:colour,radius:bounds.getSize(new THREE.Vector3()).length()/2}
}
