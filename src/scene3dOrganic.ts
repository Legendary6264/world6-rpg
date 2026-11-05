import * as THREE from 'three'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh} from './scene3dMeshes'
export {populateCharacter as populateFigure} from './scene3dCharacters.ts'

export function populateWater(e:RenderEntity,mesh:ModelMesh){
 if(e.geometry.kind!=='water')return false
 const volumeHeight=e.geometry.height
 if(e.geometry.waterVolume&&volumeHeight>0){
  const {width,depth}=e.geometry
  mesh(new THREE.BoxGeometry(width,volumeHeight,depth),'#367f89',0,volumeHeight/2,0,
   {opacity:.67,roughness:.13,metalness:.08,clearcoat:1,castShadow:false})
  return true
 }
 const w=e.geometry.width,d=e.geometry.depth,h=Math.max(.035,e.geometry.height),sectors=72,rings=22,positions:number[]=[],uv:number[]=[],indices:number[]=[]
 const shoreline=(angle:number)=>.93+.025*Math.sin(angle*5)+.025*Math.sin(angle*9+1.2)
 for(let ring=0;ring<=rings;ring++)for(let sector=0;sector<=sectors;sector++){
  const a=sector/sectors*Math.PI*2,t=ring/rings,r=t*shoreline(a),x=Math.cos(a)*r*w*.5,z=Math.sin(a)*r*d*.5
  const waves=(Math.sin(x*7+z*4)+Math.sin(x*3-z*8))*.0025*Math.sin(t*Math.PI)
  positions.push(x,Math.min(h*.65,.014)+waves,z);uv.push(x/2,z/2)
 }
 for(let ring=0;ring<rings;ring++)for(let sector=0;sector<sectors;sector++){const a=ring*(sectors+1)+sector,b=a+sectors+1;indices.push(a,a+1,b,a+1,b+1,b)}
 const surface=new THREE.BufferGeometry();surface.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));surface.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));surface.setIndex(indices);surface.computeVertexNormals()
 mesh(surface,'#376d69',0,0,0,{opacity:.76,roughness:.14,metalness:.06,clearcoat:1,castShadow:false,doubleSided:true})
 const bed=surface.clone(),bedPosition=bed.getAttribute('position')
 for(let i=0;i<bedPosition.count;i++)bedPosition.setY(i,.002+.0006*Math.sin(bedPosition.getX(i)*11+bedPosition.getZ(i)*13))
 bed.computeVertexNormals();mesh(bed,'#787258',0,0,0,{texture:'stone',roughness:.98,castShadow:false})
 {
  const points=Array.from({length:72},(_,i)=>{const a=i/72*Math.PI*2,r=shoreline(a)*.985;return new THREE.Vector3(Math.cos(a)*r*w*.5,0,Math.sin(a)*r*d*.5)})
  const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),96,Math.min(w,d)*.006,6,true)
  // Flatten the shoreline cross section to keep a shallow pool shallow.
  geometry.scale(1,Math.min(1,.012/(Math.min(w,d)*.006)),1);geometry.translate(0,Math.min(h*.5,.015),0)
  mesh(geometry,'#a9beb0',0,0,0,{roughness:.9,opacity:.38,castShadow:false})
 }
 const count=Math.max(18,Math.min(48,Math.ceil((w+d)*3))),stoneRadius=Math.min(w,d)*.014
 for(let i=0;i<count;i++){
  const a=i/count*Math.PI*2,r=shoreline(a)*.975,jitter=.7+.3*Math.sin(i*7.31)**2
  const pebble=mesh(new THREE.IcosahedronGeometry(1,1),i%3?'#6c7460':'#a1a08b',Math.cos(a)*r*w*.5,.011,Math.sin(a)*r*d*.5,{roughness:.9,castShadow:false})
  pebble.scale.set(stoneRadius*jitter,.009*jitter,stoneRadius*(.65+.25*Math.cos(i*3.1)**2));pebble.rotation.y=a+i
 }
 return true
}
