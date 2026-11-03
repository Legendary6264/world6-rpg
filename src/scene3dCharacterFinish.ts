import * as T from 'three'
import type {CharacterModelId} from './characterAppearance'

const clamp=T.MathUtils.clamp
const isArm=(name:string)=>/sleeve|bracer|hand-palm|finger|thumb|knuckle/.test(name)

/** Costume, anatomy and attachment meshes are deformed together. This keeps
 * seams, buckles and embroidery attached when adjusting build and relaxed pose.
 * These are static sculpt poses and do not introduce an animation skeleton.
 */
export function finishCharacterSculpt(parts:T.Mesh[],model:CharacterModelId,scale:{sx:number;sy:number;sz:number}){
 const guard=model==='vanguard',mage=model==='arcanist',ranger=model==='ranger'
 const shoulder=guard?.91:mage?.77:ranger?.80:.88
 const lean=guard?0:mage?-.004:ranger?.005:.003
 const yaw=guard?0:mage?-.025:ranger?.025:-.012
 const {sx,sy,sz}=scale
 for(const mesh of parts){
  const geometry=mesh.geometry,name=geometry.name,p=geometry.getAttribute('position')
  if(name.includes('staff'))continue
  const portrait=/head|eye|iris|pupil|ear|nose|nostril|mouth|lip|philtrum|hair|beard|moustache|age-crease/.test(name)
  for(let i=0;i<p.count;i++){
   let x=p.getX(i)/sx,y=p.getY(i)/sy,z=p.getZ(i)/sz
   const originalX=x,originalY=y
   if(!portrait){
    const upper=clamp((y-.54)/.24,0,1),smooth=upper*upper*(3-2*upper)
    x*=1-(1-shoulder)*smooth
    // Cloth sleeves fit the biceps instead of forming identical broad balloons.
    if(name==='character-tailored-sleeve'){
     const centre=Math.sign(originalX)*(.142+Math.sin((.805-y)/.32*Math.PI)*.017)*(1-(1-shoulder)*smooth)
     const fit=guard?.97:mage?.79:ranger?.86:.91
     x=centre+(x-centre)*fit;z*=fit
    }
    if(isArm(name)){
     const t=clamp((.79-y)/.29,0,1)
     z+=.006*Math.sin(t*Math.PI)
     // The arcanist's raised hand curls around the staff rather than hanging
     // next to an unattached prop. All its cuff and finger surfaces move with it.
     if(mage&&originalX>.095){
      if(/finger|thumb/.test(name)){
       const curl=clamp((.475-y)/.038,0,1)
       z-=.029*curl;x=T.MathUtils.lerp(x,.148,curl*.32)
      }
      x+=.059*t**1.4;y+=.042*t*t
     }
    }
   }
   const t=clamp((originalY-.54)/.30,0,1),angle=yaw*t
   const rx=x*Math.cos(angle)+z*Math.sin(angle),rz=z*Math.cos(angle)-x*Math.sin(angle)
   x=rx+lean*clamp((originalY-.12)/.76,0,1);z=rz
   // A small head inclination makes each pose readable while keeping the
   // portrait and neck attached. The guard stays neutral for combat legibility.
   if(portrait&&!guard){
    const a=(mage?-.018:ranger?.018:.012),dy=y-.856
    y=.856+dy*Math.cos(a)-x*Math.sin(a);x=x*Math.cos(a)+dy*Math.sin(a)
   }
   p.setXYZ(i,x*sx,y*sy,z*sz)
  }
  p.needsUpdate=true;geometry.computeVertexNormals()
  // Re-weld shading at UV seams after nonlinear deformation. Retain independent
  // UV vertices so the texture atlas and closed caps remain intact.
  const n=geometry.getAttribute('normal'),normals=new Map<string,{v:T.Vector3;indices:number[]}>()
  for(let i=0;i<p.count;i++){
   const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',')
   let entry=normals.get(key)
   if(!entry){entry={v:new T.Vector3(),indices:[]};normals.set(key,entry)}
   entry.v.x+=n.getX(i);entry.v.y+=n.getY(i);entry.v.z+=n.getZ(i);entry.indices.push(i)
  }
  for(const {v,indices} of normals.values())if(indices.length>1){v.normalize();for(const i of indices)n.setXYZ(i,v.x,v.y,v.z)}
  n.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere()
 }
}
