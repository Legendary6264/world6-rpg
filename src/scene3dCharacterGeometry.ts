import * as T from 'three'

export type Point = [number, number, number]
// y, half-width, half-depth, centre-x, centre-z; authored in fractions of height.
export type Section = [number, number, number, number?, number?]
export type Sculpt = (p: T.Vector3, angle: number, t: number) => void
const cubic = (a: number, b: number, c: number, d: number, t: number) =>
  .5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t)

/** Interpolated cross sections, welded shading seam, real end caps. */
export function characterLoft(name: string, sections: Section[], radial = 40, steps = 44, sculpt?: Sculpt) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [], stride = radial+1
  for (let j=0;j<=steps;j++) {
    const t=j/steps, cursor=t*(sections.length-1), row=Math.min(sections.length-2,Math.floor(cursor)), f=cursor-row
    const at=(col:number)=>cubic(sections[Math.max(0,row-1)][col]??0,sections[row][col]??0,sections[row+1][col]??0,sections[Math.min(sections.length-1,row+2)][col]??0,f)
    const y=at(0),rx=Math.max(.0001,at(1)),rz=Math.max(.0001,at(2)),cx=at(3),cz=at(4)
    for(let i=0;i<=radial;i++) {
      const angle=i/radial*Math.PI*2,p=new T.Vector3(cx+Math.sin(angle)*rx,y,cz+Math.cos(angle)*rz)
      sculpt?.(p,angle,t);positions.push(p.x,p.y,p.z);uv.push(i/radial,t)
    }
  }
  for(let j=0;j<steps;j++)for(let i=0;i<radial;i++) {
    const a=j*stride+i,b=a+stride;indices.push(a,a+1,b,a+1,b+1,b)
  }
  for(const [row,top] of [[0,false],[steps,true]] as const) {
    const centre=positions.length/3,section=top?sections.at(-1)!:sections[0]
    positions.push(section[3]??0,section[0],section[4]??0);uv.push(.5,top?1:0)
    for(let i=0;i<radial;i++){const a=row*stride+i;indices.push(...(top?[centre,a,a+1]:[centre,a+1,a]))}
  }
  const g=new T.BufferGeometry();g.name=name;g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals()
  const n=g.getAttribute('normal')
  for(let row=0;row<=steps;row++) {
    const a=row*stride,b=a+radial,v=new T.Vector3().fromBufferAttribute(n,a).add(new T.Vector3().fromBufferAttribute(n,b)).normalize()
    n.setXYZ(a,v.x,v.y,v.z);n.setXYZ(b,v.x,v.y,v.z)
  }
  return g
}

/** A variable-section sweep for fingers, hair locks, welts and engraved piping. */
export function characterSweep(name:string, points:Point[], radii:number[], radial=8, steps=20, flatten=1) {
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),frames=curve.computeFrenetFrames(steps,false)
  const p:number[]=[],uv:number[]=[],indices:number[]=[],stride=radial+1
  for(let j=0;j<=steps;j++) {
    const t=j/steps,c=curve.getPoint(t),k=t*(radii.length-1),i=Math.min(radii.length-2,Math.floor(k)),r=T.MathUtils.lerp(radii[i],radii[i+1],k-i)
    for(let a=0;a<=radial;a++) {
      const angle=a/radial*Math.PI*2,v=c.clone().addScaledVector(frames.normals[j],Math.cos(angle)*r).addScaledVector(frames.binormals[j],Math.sin(angle)*r*flatten)
      p.push(v.x,v.y,v.z);uv.push(a/radial,t)
    }
  }
  for(let j=0;j<steps;j++)for(let i=0;i<radial;i++){const a=j*stride+i,b=a+stride;indices.push(a,b,a+1,a+1,b,b+1)}
  for(const [j,end] of [[0,false],[steps,true]] as const){const index=p.length/3,v=curve.getPoint(end?1:0);p.push(v.x,v.y,v.z);uv.push(.5,.5);for(let i=0;i<radial;i++){const a=j*stride+i;indices.push(...(end?[index,a+1,a]:[index,a,a+1]))}}
  // Frenet normal/binormal order makes increasing t the opposite winding to
  // the vertical loft. Reverse every face, including both caps, consistently.
  for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]]
  const g=new T.BufferGeometry();g.name=name;g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
}

/** Two authored surfaces joined at their entire rim, so cloth has real thickness. */
export function characterPatch(name:string, point:(u:number,v:number)=>T.Vector3, cols=28, rows=28, thickness=.0016) {
  const positions:number[]=[],uv:number[]=[],indices:number[]=[],stride=cols+1,layer=stride*(rows+1)
  for(let side=0;side<2;side++)for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++) {
    const u=i/cols,v=j/rows,p=point(u,v),du=point(Math.min(1,u+.0001),v).sub(point(Math.max(0,u-.0001),v)),dv=point(u,Math.min(1,v+.0001)).sub(point(u,Math.max(0,v-.0001))),n=du.cross(dv).normalize()
    p.addScaledVector(n,(side===0?1:-1)*thickness/2);positions.push(p.x,p.y,p.z);uv.push(u,v)
  }
  const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,b,c,b,d,c)
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++) {
    const a=j*stride+i,b=a+stride;quad(a,a+1,b,b+1);quad(a+layer,b+layer,a+1+layer,b+1+layer)
  }
  for(let i=0;i<cols;i++){quad(i+1,i,i+1+layer,i+layer);const a=rows*stride+i;quad(a,a+1,a+layer,a+1+layer)}
  for(let j=0;j<rows;j++){const a=j*stride,b=a+cols;quad(a,a+stride,a+layer,a+stride+layer);quad(b+stride,b,b+stride+layer,b+layer)}
  const g=new T.BufferGeometry();g.name=name;g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
}
