import * as T from 'three'
type Solid={type:'oval';center:T.Vector3;r:T.Vector3;region:string}|{type:'limb';from:T.Vector3;to:T.Vector3;profile:[number,number][];region:string;depth:number}|{type:'torso';profile:[number,number][];region:string;depth:number}
const radius=(profile:[number,number][],t:number)=>{for(let i=1;i<profile.length;i++)if(t<=profile[i][0]){const p=profile[i-1],q=profile[i],f=T.MathUtils.clamp((t-p[0])/(q[0]-p[0]),0,1);return p[1]+(q[1]-p[1])*f}return profile.at(-1)![1]}
function distance(s:Solid,x:number,y:number,z:number){
 if(s.type==='oval'){const px=x-s.center.x,py=y-s.center.y,pz=z-s.center.z,k=Math.hypot(px/s.r.x,py/s.r.y,pz/s.r.z);return (k-1)*Math.min(s.r.x,s.r.y,s.r.z)}
 if(s.type==='torso'){const lo=s.profile[0][0],hi=s.profile.at(-1)![0],cy=T.MathUtils.clamp(y,lo,hi),r=radius(s.profile,cy);return Math.hypot(Math.max(0,Math.hypot(x,z/s.depth)-r),y-cy)+Math.min(0,Math.max(Math.hypot(x,z/s.depth)-r,lo-y,y-hi))}
 const ax=s.to.x-s.from.x,ay=s.to.y-s.from.y,az=s.to.z-s.from.z,px=x-s.from.x,py=y-s.from.y,pz=z-s.from.z,length2=ax*ax+ay*ay+az*az,t=T.MathUtils.clamp((px*ax+py*ay+pz*az)/length2,0,1),r=radius(s.profile,t)
 return Math.hypot(px-ax*t,py-ay*t,(pz-az*t)/s.depth)-r
}
// Поверхность из гладкого объединения объёмов: никаких отдельных шаров на суставах.
export function smoothBodyMesh(root:T.Group,material:T.Material){
 const solids:Solid[]=[],replaced:T.Mesh[]=[]
 root.traverse(o=>{if(o instanceof T.Mesh&&o.material===material&&o.userData.solid){solids.push(o.userData.solid as Solid);replaced.push(o)}})
 if(!solids.length)return
 const box=new T.Box3();for(const mesh of replaced)box.expandByObject(mesh);box.expandByScalar(.025)
 const step=.017,nx=Math.ceil((box.max.x-box.min.x)/step)+1,ny=Math.ceil((box.max.y-box.min.y)/step)+1,nz=Math.ceil((box.max.z-box.min.z)/step)+1,values=new Float32Array(nx*ny*nz),owners=new Uint16Array(values.length),index=(x:number,y:number,z:number)=>x+nx*(y+ny*z)
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const px=box.min.x+x*step,py=box.min.y+y*step,pz=box.min.z+z*step;let d=1e4,owner=0;for(let i=0;i<solids.length;i++){const next=distance(solids[i],px,py,pz),blend=.018;if(next<d)owner=i;const h=Math.max(blend-Math.abs(d-next),0)/blend;d=Math.min(d,next)-h*h*blend*.25}const n=index(x,y,z);values[n]=d;owners[n]=owner}
 const vertices:number[]=[],normals:number[]=[],regions:string[]=[],corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]]
 const gradient=(x:number,y:number,z:number)=>{const xm=Math.max(0,x-1),xp=Math.min(nx-1,x+1),ym=Math.max(0,y-1),yp=Math.min(ny-1,y+1),zm=Math.max(0,z-1),zp=Math.min(nz-1,z+1);return new T.Vector3(values[index(xp,y,z)]-values[index(xm,y,z)],values[index(x,yp,z)]-values[index(x,ym,z)],values[index(x,y,zp)]-values[index(x,y,zm)]).normalize()}
 for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
  const ids=corners.map(([cx,cy,cz])=>index(x+cx,y+cy,z+cz)),ds=ids.map(id=>values[id]);if(ds.every(d=>d>0)||ds.every(d=>d<=0))continue
  const point=(a:number,b:number)=>{const ca=corners[a],cb=corners[b],f=ds[a]/(ds[a]-ds[b]),p=new T.Vector3(box.min.x+(x+ca[0]+(cb[0]-ca[0])*f)*step,box.min.y+(y+ca[1]+(cb[1]-ca[1])*f)*step,box.min.z+(z+ca[2]+(cb[2]-ca[2])*f)*step),normal=gradient(x+ca[0],y+ca[1],z+ca[2]).lerp(gradient(x+cb[0],y+cb[1],z+cb[2]),f).normalize();return {p,normal}}
  for(const t of tetrahedra){const inside=t.filter(c=>ds[c]<=0),outside=t.filter(c=>ds[c]>0);if(!inside.length||!outside.length)continue;let triangles:ReturnType<typeof point>[][]=[]
   if(inside.length===1)triangles=[[point(inside[0],outside[0]),point(inside[0],outside[1]),point(inside[0],outside[2])]]
   else if(inside.length===3)triangles=[[point(outside[0],inside[0]),point(outside[0],inside[1]),point(outside[0],inside[2])]]
   else {const a=point(inside[0],outside[0]),b=point(inside[0],outside[1]),c=point(inside[1],outside[0]),d=point(inside[1],outside[1]);triangles=[[a,b,c],[b,d,c]]}
   for(const triangle of triangles){const faceNormal=triangle[1].p.clone().sub(triangle[0].p).cross(triangle[2].p.clone().sub(triangle[0].p)),average=triangle.reduce((sum,v)=>sum.add(v.normal),new T.Vector3());if(faceNormal.dot(average)<0)[triangle[1],triangle[2]]=[triangle[2],triangle[1]];for(const v of triangle){vertices.push(v.p.x,v.p.y,v.p.z);normals.push(v.normal.x,v.normal.y,v.normal.z)}regions.push(solids[owners[ids[inside[0]]]].region)}
  }
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.computeBoundingSphere();const skin=new T.Mesh(geometry,material);skin.castShadow=true;skin.receiveShadow=true;skin.userData.region='torso';skin.userData.faceRegions=regions;root.add(skin)
 for(const mesh of replaced){root.remove(mesh);mesh.geometry.dispose()}
}
