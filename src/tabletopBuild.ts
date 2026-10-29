import type {Scene,SceneObject,ScenePosition,SceneState} from './sceneTypes'
import type {TabletopBrush} from './tabletopCommands'
import {tabletopStrokeCells,paintTabletop} from './tabletopCommands'
import {createTabletopObject,isFloorAsset} from './tabletopCatalog'
import {replaceScene} from './scenes'

export type BuildMark=ScenePosition&{facing?:number;asset?:string}
export function rectangleCells(start:ScenePosition,end:ScenePosition,frame:Pick<Scene,'width'|'depth'|'groundZ'>):BuildMark[]{
 if(frame.width<2||frame.depth<2)throw Error('Для модулей пола нужна область не меньше 2 × 2 м.')
 const cell=(n:number,max:number)=>Math.max(0,Math.min(Math.floor(max/2)-1,Math.floor(n/2)))
 const x1=cell(start.x,frame.width),x2=cell(end.x,frame.width),y1=cell(start.y,frame.depth),y2=cell(end.y,frame.depth),out:BuildMark[]=[]
 for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)for(let y=Math.min(y1,y2);y<=Math.max(y1,y2);y++){
  if(out.length===250)throw Error('Выделенная область превышает 250 модулей.')
  out.push({x:x*2+1,y:y*2+1,z:frame.groundZ})
 }
 return out
}
export function wallLine(start:ScenePosition,end:ScenePosition,frame:Pick<Scene,'width'|'depth'|'groundZ'>,asset='timber-wall',facing=0):BuildMark[]{
 const clamp=(n:number,max:number)=>Math.max(0,Math.min(Math.floor(max/2)*2,Math.round(n/2)*2))
 const a={x:clamp(start.x,frame.width),y:clamp(start.y,frame.depth)},b={x:clamp(end.x,frame.width),y:clamp(end.y,frame.depth)}
 const horizontal=Math.abs(b.x-a.x)>Math.abs(b.y-a.y)||b.x===a.x&&b.y===a.y&&facing%180===0
 const from=horizontal?a.x:a.y,to=horizontal?b.x:b.y,max=horizontal?frame.width:frame.depth
 const low=Math.min(from,to),count=Math.max(1,Math.abs(to-from)/2),marks:BuildMark[]=[]
 for(let i=0;i<count;i++){
  if(i===250)throw Error('Стена превышает 250 модулей.')
  const c=Math.min(max-1,Math.max(1,low+i*2+1))
  marks.push({x:horizontal?c:a.x,y:horizontal?a.y:c,z:frame.groundZ,facing:horizontal?0:90,asset})
 }
 return marks
}
export function buildStrokeMarks(brush:TabletopBrush,start:ScenePosition,end:ScenePosition,scene:Pick<Scene,'width'|'depth'|'groundZ'>):BuildMark[]{
 if(![start.x,start.y,end.x,end.y].every(Number.isFinite))throw Error('Некорректные координаты строительства.')
 if(brush.mode==='measure')return [start,end]
 if(brush.mode==='wall')return wallLine(start,end,scene,brush.asset??'timber-wall',brush.facing)
 if(brush.mode==='rectangle')return rectangleCells(start,end,scene)
 if(brush.mode!=='room')return tabletopStrokeCells([start,end],scene,brush.size)
 const floor=rectangleCells(start,end,scene),xs=floor.map(p=>p.x),ys=floor.map(p=>p.y),x1=Math.min(...xs)-1,x2=Math.max(...xs)+1,y1=Math.min(...ys)-1,y2=Math.max(...ys)+1
 const walls=[...wallLine({x:x1,y:y1,z:0},{x:x2,y:y1,z:0},scene),...wallLine({x:x1,y:y2,z:0},{x:x2,y:y2,z:0},scene),...wallLine({x:x1,y:y1,z:0},{x:x1,y:y2,z:0},scene,'timber-wall',90),...wallLine({x:x2,y:y1,z:0},{x:x2,y:y2,z:0},scene,'timber-wall',90)]
 const entry=walls.find(p=>p.y===y2&&Math.abs(p.x-(x1+x2)/2)<=1);if(entry)entry.asset='timber-door'
 if(floor.length+walls.length>250)throw Error('Комната превышает 250 модулей. Нарисуй меньшую область.')
 return [...floor.map(p=>({...p,asset:isFloorAsset(brush.asset??undefined)?brush.asset!:'floor-wood'})),...walls]
}
export function applyBuildStroke(state:SceneState,marks:BuildMark[],brush:TabletopBrush,id:()=>string):SceneState{
 if(brush.mode==='measure')return state
 if(brush.mode!=='wall'&&brush.mode!=='room')return paintTabletop(state,marks,brush.asset,id)
 const before=state.scenes.find(s=>s.id===state.activeSceneId);if(!before)throw Error('Выбери сцену.')
 if(marks.length>250)throw Error('Слишком много модулей в одном действии.')
 let next=state
 const floors=marks.filter(p=>isFloorAsset(p.asset))
 if(floors.length)next=paintTabletop(next,floors,isFloorAsset(brush.asset??undefined)?brush.asset!:'floor-wood',id)
 const scene=next.scenes.find(s=>s.id===next.activeSceneId)!,objects=[...scene.objects]
 let changed=next!==state
 for(const p of marks.filter(p=>!isFloorAsset(p.asset))){
  const value=createTabletopObject(p.asset??brush.asset??'timber-wall',id(),{x:p.x,y:p.y,z:p.z},p.facing??0)
  if(!['wall','door'].includes(value.kind))throw Error('Линия предназначена для стен и дверей.')
  const existing=objects.find(o=>(o.kind==='wall'||o.kind==='door')&&o.x===value.x&&o.y===value.y&&o.z===value.z&&(o.facing??0)%180===(value.facing??0)%180)
  if(existing)continue
  objects.push(value);changed=true
 }
 return changed?replaceScene(next,{...scene,objects}):state
}
export function replaceObjectState(state:SceneState,value:SceneObject):SceneState{
 const scene=state.scenes.find(s=>s.id===state.activeSceneId);if(!scene)throw Error('Выбери сцену.')
 return replaceScene(state,{...scene,objects:scene.objects.map(o=>o.id===value.id?value:o)})
}
