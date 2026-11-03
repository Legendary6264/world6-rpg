import * as T from 'three'
import type { RenderEntity } from './scene3dModel'
import { characterModelFor } from './characterAppearance.ts'
import type { CharacterAnimation } from './characterAppearance'
export type RigLandmarks = Record<string, T.Vector3>
const v=(x:number,y:number,z=0)=>new T.Vector3(x,y,z)

/** Landmarks belong to the presentation sculpt, never to gameplay anatomy. */
export function sceneCharacterLandmarks(e:RenderEntity):RigLandmarks {
  const {width:w,depth:d,height:h}=e.geometry, sx=Math.min(h,w/.48), sz=Math.min(h,d/.43)
  const model=characterModelFor(e.id,e.geometry.characterModel)
  const shoulder=model==='vanguard'?.91:model==='arcanist'?.77:model==='ranger'?.80:.88
  const points:RigLandmarks={root:v(0,0),hips:v(0,.53*h),spine:v(0,.64*h),chest:v(0,.76*h),neck:v(0,.835*h),head:v(0,.875*h)}
  for(const side of [-1,1]){
    const s=side>0?'left':'right',mageHand=model==='arcanist'&&side>0
    points[s+'Arm']=v(side*.126*sx*shoulder,.79*h)
    points[s+'Forearm']=v(side*.156*sx*(1-(1-shoulder)*.42)+(mageHand?.025*sx:0),(.64+(mageHand?.012:0))*h,.01*sz)
    points[s+'Hand']=v(side*.148*sx+(mageHand?.059*sx:0),(.51+(mageHand?.042:0))*h,.018*sz)
    points[s+'Thigh']=v(side*.052*sx,.50*h)
    points[s+'Shin']=v(side*.052*sx,.29*h,.006*sz)
    points[s+'Foot']=v(side*.052*sx,.10*h)
  }
  return points
}

const boneOrder=['root','hips','spine','chest','neck','head','leftArm','leftForearm','leftHand','rightArm','rightForearm','rightHand','leftThigh','leftShin','leftFoot','rightThigh','rightShin','rightFoot'] as const
const parentNames:Record<string,string>={hips:'root',spine:'hips',chest:'spine',neck:'chest',head:'neck'}
for(const side of ['left','right'])Object.assign(parentNames,{[side+'Arm']:'chest',[side+'Forearm']:side+'Arm',[side+'Hand']:side+'Forearm',[side+'Thigh']:'hips',[side+'Shin']:side+'Thigh',[side+'Foot']:side+'Shin'})

/** Bake each part's transform once, before palette batching. Attribute tuples
 * survive merging; no per-frame geometry allocation or CPU mesh rebuilding. */
export function prepareCharacterSkin(group:T.Group,points:RigLandmarks){
  const index=(name:string)=>boneOrder.indexOf(name as typeof boneOrder[number])
  const height=points.head.y/.875
  const pair=(a:string,b:string,y:number,joint:number,span=height*.026):[number,number,number]=>{
    const f=T.MathUtils.smoothstep(y,joint-span,joint+span)
    return [index(a),index(b),f]
  }
  for(const part of group.children){
    if(!(part instanceof T.Mesh))continue
    part.updateMatrix();part.geometry.applyMatrix4(part.matrix)
    part.position.set(0,0,0);part.quaternion.identity();part.scale.set(1,1,1);part.updateMatrix()
    const geometry=part.geometry,p=geometry.getAttribute('position'),name=geometry.name
    const indices=new Uint16Array(p.count*4),weights=new Float32Array(p.count*4)
    geometry.computeBoundingBox()
    const side=(geometry.boundingBox!.getCenter(new T.Vector3()).x>=0?'left':'right')
    const portrait=/head|eye|iris|pupil|ear|nose|nostril|mouth|lip|philtrum|hair|beard|moustache|age-crease|hood/.test(name)
    const arm=/sleeve|bracer|hand|finger|thumb|knuckle|pauldron/.test(name)
    const leg=/trouser|boot|kneecap/.test(name)
    for(let i=0;i<p.count;i++){
      const y=p.getY(i)
      const region=(part.userData.faceRegions?.[Math.floor(i/3)]??part.userData.region??'') as string
      const regionSide=region.startsWith('left')?'left':'right'
      let a=index('hips'),b=a,f=0
      if(region==='head'||region.endsWith('Horn')){a=b=index('head')}
      else if(/^(left|right)Hand$/.test(region)){a=b=index(regionSide+'Hand')}
      else if(/^(left|right)Foot$/.test(region)){a=b=index(regionSide+'Foot')}
      else if(/^(left|right)Arm$/.test(region))[a,b,f]=pair(regionSide+'Forearm',regionSide+'Arm',y,points[regionSide+'Forearm'].y)
      else if(/^(left|right)Leg$/.test(region))[a,b,f]=pair(regionSide+'Shin',regionSide+'Thigh',y,points[regionSide+'Shin'].y)
      else if(!name&&!region||/base|token/.test(name)){a=b=index('root')}
      else if(portrait){a=b=index('head')}
      else if(name.includes('staff')){a=b=index('leftHand')}
      else if(arm){
        if(/hand|finger|thumb|knuckle/.test(name)){a=b=index(side+'Hand')}
        else if(/bracer/.test(name)){a=b=index(side+'Forearm')}
        else [a,b,f]=pair(side+'Forearm',side+'Arm',y,points[side+'Forearm'].y)
      }else if(leg){
        if(name.includes('boot')){a=b=index(side+'Foot')}
        else if(y<points[side+'Shin'].y+height*.026)[a,b,f]=pair(side+'Shin',side+'Thigh',y,points[side+'Shin'].y)
        else {a=b=index(side+'Thigh')}
      }else if(/cuirass|mantle|bedroll/.test(name)){a=b=index('chest')}
      else if(y>points.neck.y-height*.026)[a,b,f]=pair('chest','head',y,points.neck.y)
      else if(y>points.chest.y-height*.026)[a,b,f]=pair('spine','chest',y,points.chest.y)
      else [a,b,f]=pair('hips','spine',y,points.spine.y,height*.065)
      indices[i*4]=a;indices[i*4+1]=b;weights[i*4]=1-f;weights[i*4+1]=f
    }
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4))
    geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4))
  }
}

function animationClips(){
  const clip=(name:string,duration:number,rotations:Record<string,[number,number,number][]>)=>{
    const tracks=Object.entries(rotations).map(([bone,poses])=>{
      const times=poses.map((_,i)=>i/(poses.length-1)*duration)
      const values=poses.flatMap(([x,y,z])=>new T.Quaternion().setFromEuler(new T.Euler(x,y,z)).toArray())
      return new T.QuaternionKeyframeTrack('gb_'+bone+'.quaternion',times,values)
    })
    return new T.AnimationClip(name,duration,tracks)
  }
  return {
    idle:clip('idle',4,{chest:[[0,0,0],[.012,0,0],[0,0,0],[-.006,0,0],[0,0,0]],head:[[0,0,0],[0,.014,0],[0,0,0],[0,-.014,0],[0,0,0]],leftArm:[[0,0,0],[-.009,0,-.006],[0,0,0],[.009,0,.006],[0,0,0]],rightArm:[[0,0,0],[.009,0,.006],[0,0,0],[-.009,0,-.006],[0,0,0]]}),
    walk:clip('walk',1.2,{leftThigh:[[.28,0,0],[0,0,0],[-.28,0,0],[0,0,0],[.28,0,0]],rightThigh:[[-.28,0,0],[0,0,0],[.28,0,0],[0,0,0],[-.28,0,0]],leftShin:[[0,0,0],[.42,0,0],[0,0,0],[0,0,0],[0,0,0]],rightShin:[[0,0,0],[0,0,0],[0,0,0],[.42,0,0],[0,0,0]],leftArm:[[-.18,0,0],[0,0,0],[.18,0,0],[0,0,0],[-.18,0,0]],rightArm:[[.18,0,0],[0,0,0],[-.18,0,0],[0,0,0],[.18,0,0]],chest:[[0,.015,0],[0,0,0],[0,-.015,0],[0,0,0],[0,.015,0]]}),
  }
}
const clips=animationClips()

/** One skeleton per token, shared by its material batches. No root motion:
 * a preview animation cannot move a token or spend campaign resources. */
export function bindCharacterRig(group:T.Group,points:RigLandmarks){
  const bones=boneOrder.map(name=>{const bone=new T.Bone();bone.name='gb_'+name;return bone})
  const byName=Object.fromEntries(boneOrder.map((n,i)=>[n,bones[i]]))
  for(const name of boneOrder){
    const parent=parentNames[name]
    byName[name].position.copy(points[name])
    if(parent){byName[name].position.sub(points[parent]);byName[parent].add(byName[name])}
  }
  group.add(byName.root);group.updateMatrixWorld(true)
  const skeleton=new T.Skeleton(bones),meshes:T.SkinnedMesh[]=[],envelopes=new Map<T.SkinnedMesh,Map<number,T.Box3>>()
  skeleton.calculateInverses()
  for(const part of [...group.children]){
    if(!(part instanceof T.Mesh)||!part.geometry.hasAttribute('skinWeight'))continue
    const mesh=new T.SkinnedMesh(part.geometry,part.material)
    mesh.name=part.name;mesh.userData=part.userData;mesh.castShadow=part.castShadow;mesh.receiveShadow=part.receiveShadow
    group.remove(part);group.add(mesh);group.updateMatrixWorld(true)
    mesh.bind(skeleton,mesh.matrixWorld)
    // Bone envelopes bound the convex blend of all influenced vertices. Update
    // eighteen small boxes instead of skinning 180k triangles on the CPU.
    const boxes=new Map<number,T.Box3>(),p=mesh.geometry.getAttribute('position'),ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),point=new T.Vector3()
    for(let i=0;i<p.count;i++)for(let j=0;j<4;j++)if(weights.getComponent(i,j)>0){const id=ids.getComponent(i,j),box=boxes.get(id)??new T.Box3();box.expandByPoint(point.fromBufferAttribute(p,i));boxes.set(id,box)}
    envelopes.set(mesh,boxes)
    mesh.computeBoundingBox()
    mesh.boundingSphere=mesh.boundingBox!.getBoundingSphere(new T.Sphere())
    meshes.push(mesh)
  }
  const mixer=new T.AnimationMixer(group)
  const rest=bones.map(b=>({position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone()}))
  let current:CharacterAnimation='rest',disposed=false
  return {skeleton,meshes,mixer,
    sample(seconds:number,animation:CharacterAnimation='idle',enabled=true){
      if(disposed)return
      const next=enabled&&Number.isFinite(seconds)?animation:'rest'
      if(next!==current){
        mixer.stopAllAction()
        // Skeleton.pose() assumes root bones have no transformed scene parent.
        // Restore local bind transforms so moved/elevated tokens stay in place.
        bones.forEach((bone,i)=>{bone.position.copy(rest[i].position);bone.quaternion.copy(rest[i].quaternion);bone.scale.copy(rest[i].scale)})
        current=next;if(next!=='rest')mixer.clipAction(clips[next]).reset().play()
      }
      if(next!=='rest')mixer.setTime(Math.max(0,seconds))
      group.updateMatrixWorld(true);skeleton.update()
      const matrix=new T.Matrix4(),box=new T.Box3()
      for(const mesh of meshes){
        mesh.boundingBox!.makeEmpty()
        for(const [id,rest] of envelopes.get(mesh)!){matrix.copy(mesh.bindMatrixInverse).multiply(bones[id].matrixWorld).multiply(skeleton.boneInverses[id]).multiply(mesh.bindMatrix);mesh.boundingBox!.union(box.copy(rest).applyMatrix4(matrix))}
        mesh.boundingBox!.getBoundingSphere(mesh.boundingSphere!)
      }
    },
    dispose(){if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(group);skeleton.dispose()},
  }
}
