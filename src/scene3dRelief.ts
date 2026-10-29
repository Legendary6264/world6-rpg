import * as THREE from 'three'

// Closed, curved plate with a raised centre and a real thin edge. A regular
// grid retains the curved highlight, rather than bending a two-triangle face.
export function reliefPlate(width:number,height:number,depth:number){
 const cols=24,rows=18,positions:number[]=[],uv:number[]=[],indices:number[]=[],layer=(cols+1)*(rows+1)
 for(let back=0;back<2;back++)for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
  const u=col/cols,v=row/rows,shape=.7+.3*Math.sin(v*Math.PI)
  positions.push((u-.5)*width*shape,v*height,depth*(.35+.65*Math.sin(u*Math.PI)-back*.22))
  uv.push(u,v)
 }
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const a=row*(cols+1)+col,b=a+cols+1
  indices.push(a,a+1,b,a+1,b+1,b,a+layer,b+layer,a+1+layer,a+1+layer,b+layer,b+1+layer)
 }
 const rim=(a:number,b:number)=>indices.push(a,b,a+layer,b,b+layer,a+layer)
 for(let i=0;i<cols;i++){rim(i+1,i);rim(rows*(cols+1)+i,rows*(cols+1)+i+1)}
 for(let i=0;i<rows;i++){rim(i*(cols+1),(i+1)*(cols+1));rim((i+1)*(cols+1)+cols,i*(cols+1)+cols)}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals()
 return geometry
}

export function flutedColumn(radius:number,height:number){
 const profile=[[1.18,0],[1.18,.025],[1.1,.05],[.98,.075],[.91,.1],[.9,.16],[.91,.3],[.92,.48],[.88,.67],[.83,.84],[.85,.9],[.99,.94],[1.12,.965],[1.12,1]]
 const geometry=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r*radius,y*height)),64),p=geometry.getAttribute('position')
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),v=y/height,angle=Math.atan2(z,x)
  const fade=Math.min(1,Math.max(0,(v-.08)*18),Math.max(0,(.93-v)*18)),flute=1-.11*(.5+.5*Math.cos(angle*12))*fade
  p.setXYZ(i,x*flute,y,z*flute)
 }
 geometry.computeVertexNormals()
 const n=geometry.getAttribute('normal')
 for(let row=0;row<profile.length;row++){
  const first=row*65,last=first+64,normal=new THREE.Vector3(n.getX(first)+n.getX(last),n.getY(first)+n.getY(last),n.getZ(first)+n.getZ(last)).normalize()
  n.setXYZ(first,normal.x,normal.y,normal.z);n.setXYZ(last,normal.x,normal.y,normal.z)
 }
 return geometry
}

// A shaped hairline: higher above the eyes, lower at the sides and nape.
// The old uniform spherical cap covered the eye and brow geometry.
export function sculptedHair(){
 const cols=48,rows=20,positions:number[]=[],uv:number[]=[],indices:number[]=[]
 for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
  const u=col/cols,v=row/rows,phi=u*Math.PI*2,front=Math.max(0,Math.sin(phi)),theta=v*Math.PI*(.67-.24*front**2)
  const r=Math.sin(theta)*(1+.025*Math.cos(phi*18+v*3)*Math.sin(theta))
  positions.push(Math.cos(phi)*r,Math.cos(theta),Math.sin(phi)*r);uv.push(u,v)
 }
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const a=row*(cols+1)+col,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b)}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals()
 return geometry
}
