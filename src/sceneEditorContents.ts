import type {Scene} from './sceneTypes'
import type {EditorItem} from './sceneEditorCommands'
import {canPlaceOnSurface,flatPlacementSurface,surfacePlacementObject} from './sceneEditorPlacement.ts'
import {isFloorAsset} from './tabletopCatalog.ts'

// Deliberate editor selection, not a persistent parenting rule. Hidden and
// protected contents are reported as a whole so an arrangement is never
// silently selected only in part. The caller applies its current layer policy.
export function surfaceContents(scene:Pick<Scene,'objects'|'tokens'>,roots:readonly EditorItem[]):EditorItem[]{
 const items=new Map(roots.map(s=>[s.kind+':'+s.id,s])),queue=scene.objects.filter(o=>items.has('object:'+o.id))
 for(let i=0;i<queue.length;i++){
  const support=queue[i]
  if(!flatPlacementSurface(support)||isFloorAsset(support.asset)||support.height<=1e-6)continue
  for(const object of scene.objects){
   const key='object:'+object.id
   if(items.has(key)||!surfacePlacementObject(object)||Math.abs(object.z-support.z-support.height)>1e-4||!canPlaceOnSurface(object,support))continue
   items.set(key,{kind:'object',id:object.id});queue.push(object)
  }
 }
 for(const token of scene.tokens)if(token.support.kind==='object'&&items.has('object:'+token.support.objectId))items.set('token:'+token.actorId,{kind:'token',id:token.actorId})
 return [...items.values()]
}

// Attached actors are carried by the existing object transforms. Do not turn
// them into an explicit selection: that would disable object scaling/assembly
// capture or make Del remove a hero merely because it stands on the furniture.
export function surfaceContentsSelection(scene:Pick<Scene,'objects'|'tokens'>,roots:readonly EditorItem[],blocked:readonly string[]=[]){
 const known=new Set([...scene.objects.map(o=>'object:'+o.id),...scene.tokens.map(t=>'token:'+t.actorId)])
 if(!roots.some(i=>i.kind==='object')||roots.some(i=>!known.has(i.kind+':'+i.id)))throw Error('Выбери существующую опору или группу объектов.')
 const all=surfaceContents(scene,roots),protectedIds=new Set(blocked)
 if(all.some(i=>i.kind==='object'&&protectedIds.has(i.id)))throw Error('На опоре есть скрытые или защищённые предметы. Покажи их и сними защиту перед действием с содержимым.')
 const explicitActors=new Set(roots.filter(i=>i.kind==='token').map(i=>i.id))
 return {all,items:all.filter(i=>i.kind==='object'||explicitActors.has(i.id)),objectCount:all.filter(i=>i.kind==='object').length,actorCount:all.filter(i=>i.kind==='token').length}
}
