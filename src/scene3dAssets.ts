import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import type {RenderEntity} from './scene3dModel'
import {legacyAsset} from './legacyAssets.ts'

const files={tree:'pine',rock:'rocks'} as const
type Asset=typeof files[keyof typeof files]
type Resource=THREE.BufferGeometry|THREE.Material|THREE.Texture
// Download cache is bounded by the two natural model bundles.
const downloads=new Map<Asset,Promise<ArrayBuffer>>()
function bytes(asset:Asset){
 let pending=downloads.get(asset)
 if(!pending){pending=fetch('/models/'+asset+'.glb').then(r=>{if(!r.ok)throw Error('Model download');return r.arrayBuffer()}).catch(error=>{downloads.delete(asset);throw error});downloads.set(asset,pending)}
 return pending
}
export function detailedAsset(e:RenderEntity):Asset|undefined{
 // A selected botanical/mineral artwork owns its actual silhouette. Loading
 // a generic pine or scanned boulder over it would erase that choice.
 return legacyAsset(e.geometry)?undefined:files[e.geometry.kind as keyof typeof files]
}
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
 async instantiate(e:RenderEntity,planes:THREE.Plane[],restricted:boolean,clay=false):Promise<THREE.Group|null>{
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
     material=this.keep(clay?new THREE.MeshStandardMaterial({color:'#b5b3a9',roughness:.68,transparent:source.transparent,opacity:source.opacity,alphaTest:0,side:source.side}):source.clone());material.clippingPlanes=planes;material.clipShadows=true
     if(e.appearance.remembered){material.transparent=true;material.opacity*=.4;material.depthWrite=false}
     materials.set(source,material)
    }
    return material
   }
   object.material=Array.isArray(object.material)?object.material.map(adapt):adapt(object.material)
   object.castShadow=!restricted;object.receiveShadow=true
  })
  // Uniform fitting preserves branches and scanned rock proportions. The
  // saved collision envelope remains the maximum occupied volume.
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),sourceOrigin=model.getWorldPosition(new THREE.Vector3())
  if(!Number.isFinite(size.length())||Math.min(size.x,size.y,size.z)<=0)throw Error('Invalid model bounds')
  const normalized=new THREE.Group(),offset=new THREE.Group()
  offset.position.set(-center.x,-bounds.min.y,-center.z);offset.add(root);normalized.add(offset)
  const height=Math.max(.035,e.geometry.height),scale=Math.min(e.geometry.width/size.x,height/size.y,e.geometry.depth/size.z)
  normalized.scale.setScalar(scale)
  normalized.userData.detailedModel=asset
  if(asset==='pine'){
   const tree=new THREE.Group();tree.add(normalized);tree.userData.detailedModel=asset
   const origin=sourceOrigin.sub(new THREE.Vector3(center.x,bounds.min.y,center.z)).multiplyScalar(scale)
   let bark:THREE.Material|undefined
   model.traverse(object=>{if(object instanceof THREE.Mesh&&!bark){const candidate=Array.isArray(object.material)?object.material[0]:object.material;if(/bark/i.test(candidate.name)||!bark)bark=candidate}})
   const width=e.geometry.width,depth=e.geometry.depth,rootHeight=Math.min(height*.1,size.y*scale*.11),radius=Math.min(width,depth)*.022
   const bound=(n:number,max:number)=>Math.max(-max*.45,Math.min(max*.45,n))
   for(let i=0;i<5;i++){
    const angle=i*Math.PI*2/5+(variant%31)*.1,x=bound(origin.x,width),z=bound(origin.z,depth)
    const path=new THREE.CatmullRomCurve3([new THREE.Vector3(x,rootHeight,z),new THREE.Vector3(bound(x+Math.cos(angle)*width*.12,width),rootHeight*.3,bound(z+Math.sin(angle)*depth*.12,depth)),new THREE.Vector3(bound(x+Math.cos(angle)*width*.27,width),radius*.2,bound(z+Math.sin(angle)*depth*.27,depth))])
    const geometry=new THREE.TubeGeometry(path,14,radius,8,false),position=geometry.getAttribute('position')
    for(let j=0;j<position.count;j++){
     const u=Math.floor(j/9)/14,centerline=path.getPointAt(u),v=new THREE.Vector3(position.getX(j),position.getY(j),position.getZ(j)).sub(centerline).multiplyScalar(1-u*.85).add(centerline)
     position.setXYZ(j,v.x,Math.max(0,v.y),v.z)
    }
    geometry.computeVertexNormals()
    const rootMesh=new THREE.Mesh(this.keep(geometry),bark);rootMesh.castShadow=!restricted;rootMesh.receiveShadow=true;tree.add(rootMesh)
   }
   return tree
  }
  return normalized
 }
 dispose(){this.disposed=true;releaseResources(this.resources);this.leases.forEach((shared,asset)=>relinquish(asset,shared));this.leases.clear()}
}
