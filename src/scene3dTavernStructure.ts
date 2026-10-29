import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {RenderEntity} from './scene3dModel'
import type {ModelMesh,Surface} from './scene3dMeshes'
import {tabletopAsset} from './tabletopCatalog'

// Native-size, capped solids for the reference tavern.  The normal tabletop
// adapter applies the saved object's dimensions after all these transforms.
// The short edges of adjacent floor modules are flush; only individual board
// end joints are staggered, avoiding an outlined two-metre checkerboard.
export function populateTavernStructure(e:RenderEntity,mesh:ModelMesh,low:boolean):boolean{
 const asset=e.geometry.asset
 if(!['floor-wood','timber-wall','timber-window'].includes(asset??''))return false
 const native=tabletopAsset(asset)!
 const {width:w,depth:d,height:h}=native
 const wood:Surface={texture:'wood',roughness:.83,textureStrength:.24,normalStrength:.16}
 const frame:Surface={texture:'wood',roughness:.86,textureStrength:.33,normalStrength:.16}
 const plaster:Surface={roughness:.97},stone:Surface={roughness:.96}
 const oak='#71583d',warmOak='#856847',cream='#ded1ae',footing='#b2a486'
 const box=(width:number,height:number,depth:number,x:number,y:number,z:number,color:string,surface:Surface,bevel=.035)=>{
  const radius=Math.min(width,height,depth)*bevel
  const geometry=low||radius===0?new THREE.BoxGeometry(width,height,depth):new RoundedBoxGeometry(width,height,depth,1,radius)
  return mesh(geometry,color,x,y,z,surface)
 }
 const beam=(a:THREE.Vector3,b:THREE.Vector3,thickness:number,depth:number,color=oak)=>{
  const center=a.clone().add(b).multiplyScalar(.5)
  const part=box(thickness,a.distanceTo(b),depth,center.x,center.y,center.z,color,frame,.075)
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize())
  return part
 }
 if(asset==='floor-wood'){
  // A thin recessed backing closes every joint without adding a dark border.
  box(w,.014,d,0,.007,0,'#a18b62',{roughness:.95},0)
  const rows=low?5:9,rowDepth=d/rows,gap=low?.003:.004
  let seed=2166136261
  for(const character of e.id??'floor')seed=Math.imul(seed^character.charCodeAt(0),16777619)
  const colors=['#d5c18d','#dfcc9b','#c9b984']
  for(let row=0;row<rows;row++){
   const z=-d/2+(row+.5)*rowDepth
   const fraction=[.23,.61,.42,.79,.32][(row+(seed>>>0)%5)%5]
   const joint=-w/2+w*fraction
   // Leave the outside edge flush; the inset is confined to the joint itself.
   const ends=[-w/2,joint-gap/2,joint+gap/2,w/2]
   for(let half=0;half<2;half++){
    const start=ends[half*2],end=ends[half*2+1]
    box(end-start,.012,rowDepth-gap,(start+end)/2,.021,z,colors[(row+half+(seed>>>0)%3)%3],wood,.12)
   }
  }
  return true
 }
 const post=Math.min(.12,w*.06),rail=.09,sill=h*.36,head=h*.79,opening=w*.57
 if(asset==='timber-wall'){
  box(w-post*.6,h-.055,d*.72,0,(h-.055)/2,0,cream,plaster,.012)
 }else{
  // Four plaster fields surround a real opening. The frame and mullions do
  // not rely on transparency or a dark flat card to suggest a recessed window.
  box(w-post*.6,sill,d*.72,0,sill/2,0,cream,plaster,.012)
  box(w-post*.6,h-head-.035,d*.72,0,(h+head-.035)/2,0,cream,plaster,.012)
  const sideWidth=(w-opening)/2-post*.3
  for(const sign of [-1,1])box(sideWidth,head-sill,d*.72,sign*(opening/2+sideWidth/2),(sill+head)/2,0,cream,plaster,.012)
  for(const y of [sill,head])box(opening+.09,.065,d*.96,0,y,0,warmOak,frame,.09)
  for(const x of [-opening/2,0,opening/2])box(x===0?.026:.055,head-sill,d*.77,x,(head+sill)/2,0,oak,frame,.07)
  box(opening,.025,d*.77,0,(head+sill)/2,0,oak,frame,.08)
  // A chamfered sill and its underside brackets are visible from either side.
  for(const side of [-1,1]){
   box(opening+.13,.045,d*.13,0,sill-.045,side*d*.405,warmOak,frame,.1)
   if(!low)for(const x of [-opening*.36,opening*.36])beam(new THREE.Vector3(x,sill-.18,side*d*.26),new THREE.Vector3(x,sill-.065,side*d*.405),.025,.025,warmOak)
  }
 }
 for(const sign of [-1,1])box(post,h,d,sign*(w-post)/2,h/2,0,oak,frame,.045)
 // Every exposed wall edge is capped by a solid top rail; floor-level rails
 // align between modules and use the same restrained timber palette.
 for(const y of [.14,h*.33,h-rail/2])box(w,rail,d*.98,0,y,0,oak,frame,.06)
 if(asset==='timber-wall'){
  const lowY=h*.34+.035,highY=h-.16,end=w/2-post*.95,brace=low?.044:.052
  for(const side of [-1,1])for(const sign of [-1,1]){
   beam(new THREE.Vector3(sign*end,lowY,side*d*.414),new THREE.Vector3(0,highY,side*d*.414),brace,d*.14,warmOak)
   if(!low)beam(new THREE.Vector3(sign*end,h*.075,side*d*.414),new THREE.Vector3(sign*w*.20,h*.31,side*d*.414),brace*.83,d*.14,warmOak)
  }
 }
 // Light, low masonry grounds the wall without dominating the cream panels.
 const blocks=low?2:4,baseHeight=h*.047
 for(let i=0;i<blocks;i++)box(w/blocks-.008,baseHeight,d*.93,-w/2+(i+.5)*w/blocks,baseHeight/2,0,footing,stone,.07)
 return true
}
