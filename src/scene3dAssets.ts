import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import type {RenderEntity} from './scene3dModel'

const files={tree:'pine',rock:'rocks',crate:'crate',lamp:'lantern'} as const
type Asset=typeof files[keyof typeof files]
type Resource=THREE.BufferGeometry|THREE.Material|THREE.Texture
// Download cache is bounded by the four bundled files.
const downloads=new Map<Asset,Promise<ArrayBuffer>>()
function bytes(asset:Asset){
 let pending=downloads.get(asset)
 if(!pending){pending=fetch('/models/'+asset+'.glb').then(r=>{if(!r.ok)throw Error('Model download');return r.arrayBuffer()}).catch(error=>{downloads.delete(asset);throw error});downloads.set(asset,pending)}
 return pending
}
export function detailedAsset(e:RenderEntity):Asset|undefined{return files[e.geometry.kind as keyof typeof files]}
function hash(id:string){let n=2166136261;for(const c of id)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0}

type Shared={promise:Promise<THREE.Group>;references:number;timer?:ReturnType<typeof setTimeout>}
const templates=new Map<Asset,Shared>()
function releaseResources(resources:Set<Resource>){
 const images=new Set<ImageBitmap>()
 for(const resource of resources){
  if(resource instanceof THREE.Texture&&typeof ImageBitmap!=='undefined'&&resource.image instanceof ImageBitmap)images.add(resource.image)
  resource.dispose()
 }
 images.forEach(image=>image.close());resources.clear()
}
function acquire(asset:Asset,anisotropy:number){
 let shared=templates.get(asset)
 if(!shared){
  const promise=bytes(asset).then(data=>new GLTFLoader().parseAsync(data,'')).then(gltf=>{
   gltf.scene.traverse(object=>{
    if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){
     for(const value of Object.values(material))if(value instanceof THREE.Texture)value.anisotropy=anisotropy
    }
   });return gltf.scene
  })
  shared={promise,references:0};templates.set(asset,shared)
 }
 if(shared.timer)clearTimeout(shared.timer)
 shared.references++;return shared
}
function relinquish(asset:Asset,shared:Shared){
 if(--shared.references)return
 // Keep a short lease across scene rebuilds (move, undo, quality). Materials
 // with visibility/clipping remain private to each renderer and instance.
 shared.timer=setTimeout(()=>{
  if(shared.references||templates.get(asset)!==shared)return
  templates.delete(asset)
  void shared.promise.then(root=>{
   const resources=new Set<Resource>()
   root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return
    resources.add(object.geometry)
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
     resources.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)resources.add(value)
    }
   });releaseResources(resources)
  }).catch(()=>{})
 },2000)
}

export class SceneAssetLibrary {
 private resources=new Set<Resource>()
 private leases=new Map<Asset,Shared>()
 private disposed=false
 private anisotropy:number
 constructor(anisotropy=4){this.anisotropy=anisotropy}
 private keep<T extends Resource>(v:T):T{this.resources.add(v);return v}
 private template(asset:Asset){
  let shared=this.leases.get(asset)
  if(!shared){shared=acquire(asset,this.anisotropy);this.leases.set(asset,shared)}
  return shared.promise
 }
 async instantiate(e:RenderEntity,planes:THREE.Plane[],restricted:boolean):Promise<THREE.Group|null>{
  const asset=detailedAsset(e)
  if(!asset||this.disposed)return null
  const template=await this.template(asset)
  if(this.disposed)return null
  const variant=hash(e.id),root=new THREE.Group()
  // The source rock and pine files contain six and three separate variants.
  const source=asset==='rocks'||asset==='pine'?template.children[variant%template.children.length]:template
  const model=source.clone(true);root.add(model)
  if(asset==='rocks'||asset==='pine')root.rotation.y=(variant%360)*Math.PI/180
  const materials=new Map<THREE.Material,THREE.Material>()
  model.traverse(object=>{
   if(!(object instanceof THREE.Mesh))return
   const adapt=(source:THREE.Material)=>{
    let material=materials.get(source)
    if(!material){
     material=this.keep(source.clone());material.clippingPlanes=planes;material.clipShadows=true
     if(e.appearance.remembered){material.transparent=true;material.opacity*=.4;material.depthWrite=false}
     materials.set(source,material)
    }
    return material
   }
   object.material=Array.isArray(object.material)?object.material.map(adapt):adapt(object.material)
   object.castShadow=!restricted;object.receiveShadow=true
  })
  // Normalize the complete rotated silhouette into the saved dimensions. No
  // source origin/scale/variant may move or enlarge a gameplay obstruction.
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3())
  if(!Number.isFinite(size.length())||Math.min(size.x,size.y,size.z)<=0)throw Error('Invalid model bounds')
  const normalized=new THREE.Group(),offset=new THREE.Group()
  offset.position.set(-center.x,-bounds.min.y,-center.z);offset.add(root);normalized.add(offset)
  const height=Math.max(.035,e.geometry.height),headHeight=asset==='lantern'&&height>1.2?Math.min(height*.4,Math.min(e.geometry.width,e.geometry.depth)*2):height
  normalized.scale.set(e.geometry.width/size.x,headHeight/size.y,e.geometry.depth/size.z)
  normalized.userData.detailedModel=asset
  if(headHeight===height)return normalized
  const lamp=new THREE.Group(),postHeight=height-headHeight,radius=Math.min(e.geometry.width,e.geometry.depth)*.065
  normalized.position.y=postHeight;lamp.add(normalized);lamp.userData.detailedModel=asset
  const metal=this.keep(new THREE.MeshStandardMaterial({color:'#403c34',metalness:.8,roughness:.38,clippingPlanes:planes,clipShadows:true,transparent:e.appearance.remembered,opacity:e.appearance.remembered?.4:1}))
  for(const [r1,r2,h,y] of [[radius,radius*1.25,postHeight,postHeight/2],[radius*2.4,radius*3.2,height*.035,height*.0175]]){
   const pole=new THREE.Mesh(this.keep(new THREE.CylinderGeometry(r1,r2,h,16)),metal)
   pole.position.y=y;pole.castShadow=!restricted;pole.receiveShadow=true;lamp.add(pole)
  }
  return lamp
 }
 dispose(){this.disposed=true;releaseResources(this.resources);this.leases.forEach((shared,asset)=>relinquish(asset,shared));this.leases.clear()}
}
