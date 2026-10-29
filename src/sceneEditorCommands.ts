import type {Scene,SceneObject,ScenePosition,SceneState} from './sceneTypes'
import {moveSceneObject,placeSceneToken,removeSceneObject,replaceScene} from './scenes'
import {assertEditorObjectBounds} from './sceneEditorBounds'

export type EditorSelection={kind:'object'|'token';id:string}|null
export function translateEditorSelection(state:SceneState,selection:EditorSelection,delta:ScenePosition):SceneState {
 const scene=state.scenes.find(s=>s.id===state.activeSceneId)
 if(!scene||!selection)throw Error('Сначала выбери объект или персонажа.')
 const round=(n:number)=>Math.round(n*1e6)/1e6
 if(selection.kind==='object'){
  const o=scene.objects.find(o=>o.id===selection.id);if(!o)throw Error('Объект больше не существует.')
  const next={...o,x:round(o.x+delta.x),y:round(o.y+delta.y),z:round(o.z+delta.z)};if(delta.x||delta.y)assertEditorObjectBounds(scene,[next])
  return moveSceneObject(state,scene.id,next)
 }
 const t=scene.tokens.find(t=>t.actorId===selection.id);if(!t)throw Error('Персонаж больше не находится на сцене.')
 if(delta.z&&t.support.kind!=='air')throw Error('Высота персонажа определяется опорой. Сначала выбери другую опору или состояние «В воздухе».')
 return placeSceneToken(state,scene.id,{...t,x:round(t.x+delta.x),y:round(t.y+delta.y),z:round(t.z+delta.z)})
}
export function duplicateEditorObject(state:SceneState,objectId:string,newId:string,step=.5):SceneState {
 return duplicateEditorGroup(state,[{kind:'object',id:objectId}],()=>newId,step).state
}
export function removeEditorSelection(state:SceneState,selection:EditorSelection):SceneState {
 const scene=state.scenes.find(s=>s.id===state.activeSceneId)
 if(!scene||!selection)throw Error('Выбери объект или персонажа.')
 return selection.kind==='object'?removeSceneObject(state,scene.id,selection.id):replaceScene(state,{...scene,tokens:scene.tokens.filter(t=>t.actorId!==selection.id)})
}

export type EditorItem=NonNullable<EditorSelection>
function selectionSet(items:readonly EditorItem[]){return new Set(items.map(s=>s.kind+':'+s.id))}
export function translateEditorGroup(state:SceneState,items:readonly EditorItem[],delta:ScenePosition):SceneState{
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),selected=selectionSet(items)
 if(!scene||!selected.size)throw Error('Сначала выбери объекты или персонажей.')
 if(!Object.values(delta).every(Number.isFinite))throw Error('Проверь величину перемещения.')
 const movedObjects=new Set(scene.objects.filter(o=>selected.has('object:'+o.id)).map(o=>o.id))
 const known=new Set([...scene.objects.map(o=>'object:'+o.id),...scene.tokens.map(t=>'token:'+t.actorId)])
 if([...selected].some(key=>!known.has(key)))throw Error('Часть выделения больше не находится на сцене.')
 const round=(n:number)=>Math.round(n*1e6)/1e6
 const move=<T extends ScenePosition>(p:T):T=>({...p,x:round(p.x+delta.x),y:round(p.y+delta.y),z:round(p.z+delta.z)})
 // A carried token is translated once, even when it and its support are selected.
 const objects=scene.objects.map(o=>movedObjects.has(o.id)?move(o):o)
 if(delta.x||delta.y)assertEditorObjectBounds(scene,objects.filter(o=>movedObjects.has(o.id)))
 const tokens=scene.tokens.map(t=>{
  if(t.support.kind==='object'&&movedObjects.has(t.support.objectId))return move(t)
  if(!selected.has('token:'+t.actorId))return t
  if(delta.z&&t.support.kind!=='air')throw Error('Высота персонажа определяется опорой. Сначала выбери другую опору или состояние «В воздухе».')
  return move(t)
 })
 return replaceScene(state,{...scene,objects,tokens})
}
export function removeEditorGroup(state:SceneState,items:readonly EditorItem[]):SceneState{
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),selected=selectionSet(items)
 if(!scene||!selected.size)throw Error('Сначала выбери объекты или персонажей.')
 const tokens=scene.tokens.filter(t=>!selected.has('token:'+t.actorId))
 if(tokens.some(t=>t.support.kind==='object'&&selected.has('object:'+t.support.objectId)))throw Error('На выбранной опоре стоит персонаж. Сначала включи его в выделение или перемести на другую опору.')
 return replaceScene(state,{...scene,objects:scene.objects.filter(o=>!selected.has('object:'+o.id)),tokens})
}
export function duplicateEditorGroup(state:SceneState,items:readonly EditorItem[],id:()=>string,step=.5):{state:SceneState;items:EditorItem[]}{
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),selected=selectionSet(items)
 const objects=scene?.objects.filter(o=>selected.has('object:'+o.id))??[]
 if(!scene||!objects.length)throw Error('Для копирования выбери объекты сцены.')
 if(!Number.isFinite(step)||step<0)throw Error('Проверь шаг копирования.')
 // Use one offset for the whole arrangement, including near scene boundaries.
 const offset=(axis:'x'|'y',dimension:'width'|'depth',limit:number)=>{
  const min=Math.min(...objects.map(o=>o[axis]-o[dimension]/2)),max=Math.max(...objects.map(o=>o[axis]+o[dimension]/2))
  if(max-min>limit+1e-6)return undefined
  return [step,-step,0].find(delta=>min+delta>=-1e-6&&max+delta<=limit+1e-6)??Math.max(-min,Math.min(limit-max,step))
 }
 const dx=offset('x','width',scene.width),dy=offset('y','depth',scene.depth)
 if(dx===undefined||dy===undefined)throw Error('Копия целиком должна помещаться в границы сцены.')
 const copies=objects.map(o=>({...o,id:id(),name:o.name.slice(0,110)+' · копия',x:o.x+dx,y:o.y+dy}))
 return {state:replaceScene(state,{...scene,objects:[...scene.objects,...copies]}),items:copies.map(o=>({kind:'object',id:o.id}))}
}
export function rotateEditorGroup(state:SceneState,items:readonly EditorItem[]):SceneState{
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),selected=selectionSet(items)
 if(!scene||!selected.size)throw Error('Сначала выбери объекты или персонажей.')
 const all=[...scene.objects.filter(o=>selected.has('object:'+o.id)),...scene.tokens.filter(t=>selected.has('token:'+t.actorId))]
 if(all.length!==selected.size)throw Error('Часть выделения больше не находится на сцене.')
 // Use the same full footprint pivot as scaling. Small objects on a table
 // must not move its rotation centre away from the table itself.
 const width=(p:typeof all[number])=>'width' in p?p.width:p.diameter,depth=(p:typeof all[number])=>'depth' in p?p.depth:p.diameter
 const cx=(Math.min(...all.map(p=>p.x-width(p)/2))+Math.max(...all.map(p=>p.x+width(p)/2)))/2,cy=(Math.min(...all.map(p=>p.y-depth(p)/2))+Math.max(...all.map(p=>p.y+depth(p)/2)))/2
 const round=(n:number)=>Math.round(n*1e6)/1e6,turn=<T extends ScenePosition>(p:T):T=>({...p,x:round(cx-(p.y-cy)),y:round(cy+(p.x-cx))})
 const objects=scene.objects.map(o=>selected.has('object:'+o.id)?{...turn(o),width:o.depth,depth:o.width,facing:((o.facing??0)+90)%360}:o)
 assertEditorObjectBounds(scene,objects.filter(o=>selected.has('object:'+o.id)))
 const tokens=scene.tokens.map(t=>selected.has('token:'+t.actorId)||t.support.kind==='object'&&selected.has('object:'+t.support.objectId)?turn(t):t)
 return replaceScene(state,{...scene,objects,tokens})
}

function arrangementSelection(state:SceneState,items:readonly EditorItem[],axis:'x'|'y',referenceId?:string){
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),selected=selectionSet(items)
 const objects=scene?.objects.filter(o=>selected.has('object:'+o.id))??[]
 if(!scene||objects.length!==selected.size||objects.length<2)throw Error('Для выравнивания выбери несколько объектов без героев.')
 if(axis!=='x'&&axis!=='y')throw Error('Выбери ось X или Y.')
 const reference=referenceId===undefined?undefined:objects.find(o=>o.id===referenceId)
 if(referenceId!==undefined&&!reference)throw Error('Опорный объект больше не входит в выделение.')
 const dimension=axis==='x'?'width':'depth',ordered=objects.slice().sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id))
 return {scene,objects,reference,dimension,ordered} as const
}
function applyArrangement(state:SceneState,scene:Scene,objects:SceneObject[],axis:'x'|'y',positions:Map<string,number>):SceneState{
 const round=(n:number)=>Math.round(n*1e6)/1e6
 const moved=new Map(objects.flatMap(o=>{
  const target=positions.get(o.id)!
  if(!Number.isFinite(target))throw Error('Проверь параметры расстановки.')
  // Keep the reference and already aligned objects exactly where they were.
  return Math.abs(target-o[axis])<1e-6?[]:[[o.id,{...o,[axis]:round(target)}] as const]
 }))
 if(!moved.size)return state
 assertEditorObjectBounds(scene,[...moved.values()])
 const delta=new Map(objects.filter(o=>moved.has(o.id)).map(o=>[o.id,moved.get(o.id)![axis]-o[axis]]))
 return replaceScene(state,{...scene,objects:scene.objects.map(o=>moved.get(o.id)??o),
  tokens:scene.tokens.map(t=>t.support.kind==='object'&&delta.has(t.support.objectId)?{...t,[axis]:round(t[axis]+delta.get(t.support.objectId)!)}:t)})
}
export function arrangeEditorObjects(state:SceneState,items:readonly EditorItem[],axis:'x'|'y',mode:'min'|'center'|'max'|'distribute',referenceId?:string):SceneState{
 const {scene,objects,reference,dimension,ordered}=arrangementSelection(state,items,axis,referenceId)
 if(mode==='distribute'&&objects.length<3)throw Error('Для равных промежутков нужны хотя бы три объекта.')
 const min=reference?reference[axis]-reference[dimension]/2:Math.min(...objects.map(o=>o[axis]-o[dimension]/2)),max=reference?reference[axis]+reference[dimension]/2:Math.max(...objects.map(o=>o[axis]+o[dimension]/2))
 const positions=new Map<string,number>()
 if(mode==='distribute'){
  const first=ordered[0],last=ordered.at(-1)!,left=first[axis]-first[dimension]/2,right=last[axis]+last[dimension]/2
  const gap=(right-left-ordered.reduce((n,o)=>n+o[dimension],0))/(ordered.length-1)
  if(gap< -1e-6)throw Error('Для равных промежутков раздвинь крайние объекты.')
  let cursor=left
  ordered.forEach(o=>{positions.set(o.id,cursor+o[dimension]/2);cursor+=o[dimension]+gap})
 }else for(const o of objects)positions.set(o.id,mode==='min'?min+o[dimension]/2:mode==='max'?max-o[dimension]/2:(min+max)/2)
 return applyArrangement(state,scene,objects,axis,positions)
}

// An explicit edge-to-edge gap can expand or contract a row. Preserve the
// current left-to-right order and grow it in both directions from a reference.
export function spaceEditorObjects(state:SceneState,items:readonly EditorItem[],axis:'x'|'y',gap:number,referenceId?:string):SceneState{
 const {scene,objects,reference,dimension,ordered}=arrangementSelection(state,items,axis,referenceId)
 if(!Number.isFinite(gap)||gap<0)throw Error('Промежуток должен быть числом не меньше нуля.')
 const pivot=reference?ordered.indexOf(reference):0,positions=new Map<string,number>([[ordered[pivot].id,ordered[pivot][axis]]])
 for(let i=pivot+1;i<ordered.length;i++)positions.set(ordered[i].id,positions.get(ordered[i-1].id)!+ordered[i-1][dimension]/2+gap+ordered[i][dimension]/2)
 for(let i=pivot-1;i>=0;i--)positions.set(ordered[i].id,positions.get(ordered[i+1].id)!-ordered[i+1][dimension]/2-gap-ordered[i][dimension]/2)
 return applyArrangement(state,scene,objects,axis,positions)
}

export function scaleEditorObjects(state:SceneState,items:readonly EditorItem[],factor:ScenePosition):SceneState{
 const scene=state.scenes.find(s=>s.id===state.activeSceneId),selected=selectionSet(items)
 const objects=scene?.objects.filter(o=>selected.has('object:'+o.id))??[]
 if(!scene||!objects.length||objects.length!==selected.size)throw Error('Для масштаба выбери объекты без героев. Персонаж на выбранной опоре переместится вместе с ней.')
 if(![factor.x,factor.y,factor.z].every(n=>Number.isFinite(n)&&n>0))throw Error('Масштаб по каждой оси должен быть больше нуля.')
 if(factor.x===1&&factor.y===1&&factor.z===1)return state
 const pivot={x:(Math.min(...objects.map(o=>o.x-o.width/2))+Math.max(...objects.map(o=>o.x+o.width/2)))/2,
  y:(Math.min(...objects.map(o=>o.y-o.depth/2))+Math.max(...objects.map(o=>o.y+o.depth/2)))/2,z:Math.min(...objects.map(o=>o.z))}
 const round=(n:number)=>Math.round(n*1e6)/1e6
 const scaled=new Map(objects.map(o=>{const next={...o,x:round(pivot.x+(o.x-pivot.x)*factor.x),y:round(pivot.y+(o.y-pivot.y)*factor.y),z:round(pivot.z+(o.z-pivot.z)*factor.z),width:round(o.width*factor.x),depth:round(o.depth*factor.y),height:round(o.height*factor.z)}
  if(next.width<.1||next.depth<.1||next.x-next.width/2< -1e-6||next.x+next.width/2>scene.width+1e-6||next.y-next.depth/2< -1e-6||next.y+next.depth/2>scene.depth+1e-6)throw Error('После масштаба объекты должны помещаться в сцену; минимальная ширина и глубина — 0,1 м.')
  return [o.id,next] as const
 }))
 const original=new Map(objects.map(o=>[o.id,o]))
 return replaceScene(state,{...scene,objects:scene.objects.map(o=>scaled.get(o.id)??o),tokens:scene.tokens.map(t=>{
  if(t.support.kind!=='object')return t
  const next=scaled.get(t.support.objectId),old=original.get(t.support.objectId)
  return next&&old?{...t,x:round(next.x+(t.x-old.x)*factor.x),y:round(next.y+(t.y-old.y)*factor.y),z:round(next.z+next.height)}:t
 })})
}
