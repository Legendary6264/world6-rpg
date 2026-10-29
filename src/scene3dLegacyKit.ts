import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'

// Old artwork models are authored in a normalized envelope. Baking the full
// assembly, rather than changing primitive radii independently, preserves joints
// when an existing saved object has unusual editable dimensions.
export function legacyKit(e:RenderEntity,output:ModelMesh,low:boolean){
 const parts:THREE.Mesh[]=[],wood:Surface={texture:'wood',roughness:.86,textureStrength:.35,normalStrength:.22},stone:Surface={texture:'stone',roughness:.94,textureStrength:.35,normalStrength:.25},iron:Surface={metalness:.72,roughness:.48},leaf:Surface={roughness:.9}
 const mesh:ModelMesh=(...args)=>{const part=output(...args);parts.push(part);return part}
 const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,color='#8b6442',surface:Surface=wood,bevel=.07)=>{
  const g=low||!bevel?new THREE.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,1,Math.min(w,h,d)*bevel);g.name=name;return mesh(g,color,x,y,z,surface)
 }
 const ellipsoid=(name:string,rx:number,ry:number,rz:number,x:number,y:number,z:number,color:string,surface:Surface=leaf)=>{const g=new THREE.SphereGeometry(1,low?8:14,low?6:10);g.name=name;const part=mesh(g,color,x,y,z,surface);part.scale.set(rx,ry,rz);return part}
 const cylinder=(name:string,rt:number,rb:number,h:number,x:number,y:number,z:number,color='#8b6442',surface:Surface=wood,segments=low?7:14)=>{const g=new THREE.CylinderGeometry(rt,rb,h,segments);g.name=name;return mesh(g,color,x,y,z,surface)}
 const beam=(name:string,a:number[],b:number[],radius:number,color='#8b6442',surface:Surface=wood,taper=1)=>{const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),center=from.clone().add(to).multiplyScalar(.5),part=cylinder(name,radius*taper,radius,from.distanceTo(to),center.x,center.y,center.z,color,surface);part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return part}
 const ring=(name:string,r:number,t:number,x:number,y:number,z:number,color='#625d51',surface:Surface=iron,axis:'x'|'y'|'z'='y')=>{const g=new THREE.TorusGeometry(r,t,low?4:7,low?12:24);g.name=name;const part=mesh(g,color,x,y,z,surface);if(axis==='y')part.rotation.x=Math.PI/2;if(axis==='x')part.rotation.y=Math.PI/2;return part}
 const lathe=(name:string,profile:number[][],x:number,y:number,z:number,color:string,surface:Surface=wood)=>{const g=new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),low?8:18);g.name=name;return mesh(g,color,x,y,z,surface)}
 const extrude=(name:string,points:number[][],depth:number,x:number,y:number,z:number,color:string,surface:Surface=wood)=>{const shape=new THREE.Shape();points.forEach(([u,v],i)=>i?shape.lineTo(u,v):shape.moveTo(u,v));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:low?2:5,steps:1});g.translate(0,0,-depth/2);g.name=name;return mesh(g,color,x,y,z,surface)}
 const tube=(name:string,points:number[][],radius:number,color:string,surface:Surface=wood)=>{
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments=low?6:14,radial=low?5:8,g=new THREE.TubeGeometry(curve,segments,radius,radial,false),p=g.attributes.position,positions=Array.from(p.array),uv=Array.from(g.attributes.uv.array),indices=Array.from(g.index!.array)
  for(let side=0;side<2;side++){
   const center=curve.getPointAt(side),normal=curve.getTangentAt(side).multiplyScalar(side?1:-1),offset=side?segments*(radial+1):0,index=positions.length/3
   positions.push(center.x,center.y,center.z);uv.push(.5,.5)
   for(let i=0;i<radial;i++){const a=offset+i,b=a+1,va=new THREE.Vector3().fromArray(positions,a*3).sub(center),vb=new THREE.Vector3().fromArray(positions,b*3).sub(center);indices.push(...(va.cross(vb).dot(normal)>0?[index,a,b]:[index,b,a]))}
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.name=name;return mesh(g,color,0,0,0,surface)
 }
 const finish=(motionEnvelope?:THREE.Box3)=>{
  const bounds=new THREE.Box3()
  for(const part of parts){part.updateMatrix();part.geometry.applyMatrix4(part.matrix);part.position.set(0,0,0);part.rotation.set(0,0,0);part.scale.set(1,1,1);part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox!)}
  if(motionEnvelope)bounds.copy(motionEnvelope)
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),g=e.geometry,sx=g.width/Math.max(.001,size.x),sy=Math.max(.035,g.height)/Math.max(.001,size.y),sz=g.depth/Math.max(.001,size.z),transform=new THREE.Matrix4().makeScale(sx,sy,sz)
  transform.setPosition(-center.x*sx,-bounds.min.y*sy,-center.z*sz)
  for(const part of parts){part.geometry.applyMatrix4(transform);part.geometry.computeBoundingBox();part.geometry.computeBoundingSphere();part.updateMatrix()}
  return true
 }
 return {mesh,box,ellipsoid,cylinder,beam,ring,lathe,extrude,tube,finish,wood,stone,iron,leaf,low}
}
