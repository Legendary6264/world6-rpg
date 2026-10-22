import * as THREE from 'three'
export type SurfaceKind='stone'|'wood'|'paving'|'forest'

export class SceneSurfaceLibrary {
 private textures=new Map<string,THREE.Texture>()
 private disposed=false
 private changed:()=>void
 private anisotropy:number
 constructor(changed:()=>void,anisotropy=4){this.changed=changed;this.anisotropy=anisotropy}
 apply(material:THREE.MeshStandardMaterial,kind:SurfaceKind){
  const texture=(channel:string)=>{
   const key=kind+'-'+channel
   let map=this.textures.get(key)
   if(!map){
    map=new THREE.TextureLoader().load('/materials/'+key+'.jpg',loaded=>{if(this.disposed)loaded.dispose();else this.changed()},undefined,()=>this.changed())
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=this.anisotropy
    if(channel==='color')map.colorSpace=THREE.SRGBColorSpace
    this.textures.set(key,map)
   }
   return map
  }
  material.map=texture('color');material.normalMap=texture('normal')
  material.roughnessMap=material.aoMap=texture('arm')
  material.roughness=1;material.metalness=0;material.aoMapIntensity=.65;material.normalScale.set(.65,.65)
  // Retain the per-block timber/stone variation instead of flattening every
  // part to the same tint; maps supply the fine grain.
 }
 dispose(){this.disposed=true;this.textures.forEach(t=>t.dispose());this.textures.clear()}
}

// Metres rather than per-face 0..1 UVs: texture density stays constant when
// walls are resized, and separate disclosed floor areas join without seams.
export function surfaceUV(geometry:THREE.BufferGeometry,position:THREE.Vector3,scale=2){
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv')
 if(!p||!n||!uv)return
 for(let i=0;i<p.count;i++){
  const x=p.getX(i)+position.x,y=p.getY(i)+position.y,z=p.getZ(i)+position.z
  const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i))
  if(ny>=nx&&ny>=nz)uv.setXY(i,x/scale,z/scale)
  else if(nx>=nz)uv.setXY(i,z/scale,y/scale)
  else uv.setXY(i,x/scale,y/scale)
 }
 uv.needsUpdate=true
}
