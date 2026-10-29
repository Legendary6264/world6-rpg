import * as THREE from 'three'
export type SurfaceKind='stone'|'wood'|'paving'|'forest'

export class SceneSurfaceLibrary {
 private textures=new Map<string,THREE.Texture>()
 private disposed=false
 private changed:()=>void
 private anisotropy:number
 constructor(changed:()=>void,anisotropy=4){this.changed=changed;this.anisotropy=anisotropy}
 apply(material:THREE.MeshStandardMaterial,kind:SurfaceKind,strength=1,normalStrength=.65){
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
  const amount=Math.max(0,Math.min(1,strength)),normal=Math.max(0,Math.min(1,normalStrength))
  material.roughness=1;material.metalness=0;material.aoMapIntensity=.65*amount;material.normalScale.set(normal,normal)
  if(amount<1){
   // Preserve the authored palette while retaining fine albedo grain. A dark
   // photographic map must not turn every blonde plank into dark walnut.
   material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec4 authoredDiffuse = diffuseColor;\n#include <map_fragment>\ndiffuseColor.rgb = mix(authoredDiffuse.rgb, diffuseColor.rgb, ${amount.toFixed(4)});`)}
   material.customProgramCacheKey=()=>`surface-albedo:${amount.toFixed(4)}`
  }
  // Retain the per-block timber/stone variation instead of flattening every
  // part to the same tint; maps supply the fine grain.
 }
 dispose(){this.disposed=true;this.textures.forEach(t=>t.dispose());this.textures.clear()}
}

// Metres rather than per-face 0..1 UVs: texture density stays constant when
// walls are resized, and separate disclosed floor areas join without seams.
export function surfaceUV(geometry:THREE.BufferGeometry,position:THREE.Vector3,scale=2,transform?:THREE.Matrix4){
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv')
 if(!p||!n||!uv)return
 const point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=transform?new THREE.Matrix3().getNormalMatrix(transform):undefined
 for(let i=0;i<p.count;i++){
  point.fromBufferAttribute(p,i);normal.fromBufferAttribute(n,i)
  if(transform){point.applyMatrix4(transform);normal.applyMatrix3(normalMatrix!).normalize()}
  const x=point.x+position.x,y=point.y+position.y,z=point.z+position.z
  const nx=Math.abs(normal.x),ny=Math.abs(normal.y),nz=Math.abs(normal.z)
  if(ny>=nx&&ny>=nz)uv.setXY(i,x/scale,z/scale)
  else if(nx>=nz)uv.setXY(i,z/scale,y/scale)
  else uv.setXY(i,x/scale,y/scale)
 }
 uv.needsUpdate=true
}
