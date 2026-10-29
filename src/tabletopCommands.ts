import type {Scene,ScenePosition,SceneState} from './sceneTypes'
import {replaceScene} from './scenes'
import {createTabletopObject,isFloorAsset} from './tabletopCatalog'
import {assertEditorObjectBounds} from './sceneEditorBounds'

export type TabletopBrush={asset:string|null;size:number;mode?:'floor'|'rectangle'|'wall'|'room'|'measure';facing?:number}
const TILE=2
// Interpolate a stroke on a fixed floor grid. Brush width changes coverage, not
// tile size, so repainting and erasing never leave overlapping floor layers.
export function tabletopStrokeCells(points:ScenePosition[],frame:Pick<Scene,'width'|'depth'|'groundZ'>,size=1):ScenePosition[]{
 const cells=new Map<string,ScenePosition>(),n=Math.max(1,Math.min(3,Math.round(size)))
 const visit=(x:number,y:number)=>{
  const col=Math.floor(x/TILE),row=Math.floor(y/TILE),offset=Math.floor((n-1)/2)
  for(let a=0;a<n;a++)for(let b=0;b<n;b++){
   const cx=(col+a-offset+.5)*TILE,cy=(row+b-offset+.5)*TILE
   if(cx<1||cy<1||cx+1>frame.width||cy+1>frame.depth)continue
   cells.set(`${cx}:${cy}`,{x:cx,y:cy,z:frame.groundZ})
   if(cells.size>250)throw Error('Один мазок может содержать не больше 250 плиток.')
  }
 }
 for(let i=0;i<points.length;i++){
  const p=points[i],before=points[i-1]??p
  if(![p.x,p.y].every(Number.isFinite))throw Error('Некорректная координата кисти.')
  const steps=Math.min(1000,Math.max(1,Math.ceil(Math.max(Math.abs(p.x-before.x),Math.abs(p.y-before.y))/.5)))
  for(let j=0;j<=steps;j++)visit(before.x+(p.x-before.x)*j/steps,before.y+(p.y-before.y)*j/steps)
 }
 return [...cells.values()]
}
export function paintTabletop(state:SceneState,cells:ScenePosition[],assetId:string|null,nextId:()=>string):SceneState{
 const scene=state.scenes.find(s=>s.id===state.activeSceneId)
 if(!scene)throw Error('Выбери сцену.')
 if(assetId!==null&&!isFloorAsset(assetId))throw Error('Кисть предназначена для напольных плиток.')
 const unique=[...new Map(cells.map(p=>{
  if(![p.x,p.y,p.z].every(Number.isFinite)||p.x%2!==1||p.y%2!==1||p.x<1||p.y<1||p.x+1>scene.width||p.y+1>scene.depth||p.z!==scene.groundZ)throw Error('Плитки должны лежать на сетке пола внутри сцены.')
  return [`${p.x}:${p.y}`,p] as const
 })).values()],keys=new Set(unique.map(p=>`${p.x}:${p.y}`))
 if(unique.length>250)throw Error('Один мазок может содержать не больше 250 плиток.')
 if(!unique.length)return state
 const floors=scene.objects.filter(o=>isFloorAsset(o.asset)&&o.z===scene.groundZ&&o.width===TILE&&o.depth===TILE)
 const existing=new Map(floors.map(o=>[`${o.x}:${o.y}`,o]))
 let changed=false
 const objects=scene.objects.filter(o=>{
  if(!floors.includes(o)||!keys.has(`${o.x}:${o.y}`))return true
  if(assetId!==null)return true
  changed=true;return false
 })
 if(assetId!==null)for(const p of unique){
  const before=existing.get(`${p.x}:${p.y}`)
  if(before?.asset===assetId)continue
  const value=createTabletopObject(assetId,before?.id??nextId(),p)
  if(before){const index=objects.findIndex(o=>o.id===before.id);objects[index]={...value,id:before.id}}
  else objects.push(value)
  changed=true
 }
 return changed?replaceScene(state,{...scene,objects}):state
}
export function rotateTabletopObject(state:SceneState,id:string,direction=1):SceneState{
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),before=scene?.objects.find(o=>o.id===id)
 if(!scene||!before)throw Error('Выбери объект для поворота.')
 const turn=direction<0?-1:1,round=(n:number)=>Math.round(n*1e6)/1e6
 const value={...before,width:before.depth,depth:before.width,facing:((before.facing??0)+turn*90+360)%360}
 assertEditorObjectBounds(scene,[value])
 const tokens=scene.tokens.map(t=>t.support.kind==='object'&&t.support.objectId===id?{...t,
  x:round(before.x-turn*(t.y-before.y)),y:round(before.y+turn*(t.x-before.x))}:t)
 return replaceScene(state,{...scene,objects:scene.objects.map(o=>o.id===id?value:o),tokens})
}
