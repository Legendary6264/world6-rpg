import type {Scene,SceneActor} from './sceneTypes'
import {selectionAllowed} from './scene3dModel'
import type {RenderSelection,SelectionFilter} from './scene3dModel'
import {isFloorAsset} from './tabletopCatalog'
import type {EditorItem} from './sceneEditorCommands'

export type ScenePickTarget={selection:RenderSelection;label:string}
export type SceneContextClient={x:number;y:number;targets?:ScenePickTarget[]}

// Match the actual SVG hit rectangles and reverse its painter order. A master
// can reach a small object behind scenery without hiding or moving that scenery.
export function schematicPickTargets(scene:Scene,actors:SceneActor[],point:{x:number;y:number},options:{hidden?:string[];protected?:string[];filter?:SelectionFilter}={}):ScenePickTarget[]{
 const targets:ScenePickTarget[]=[],size=Math.max(scene.width,scene.view==='side'?scene.maxZ-scene.minZ:scene.depth)*.022
 const contains=(x:number,y:number,w:number,h:number)=>point.x>=x-w/2&&point.x<=x+w/2&&point.y>=y-h/2&&point.y<=y+h/2
 for(const t of [...scene.tokens].reverse()){
  const selection={kind:'token' as const,id:t.actorId},y=scene.view==='top'?t.y:scene.maxZ-t.z-size
  if(contains(t.x,y,size*2,size*2)&&selectionAllowed(selection,'actor',options.filter))targets.push({selection,label:actors.find(a=>a.id===t.actorId)?.name??'Без имени'})
 }
 const objects=[...scene.objects].sort((a,b)=>a.z-b.z||Number(isFloorAsset(b.asset))-Number(isFloorAsset(a.asset)))
 for(const o of objects.reverse()){
  if(options.hidden?.includes(o.id)||options.protected?.includes(o.id))continue
  const selection={kind:'object' as const,id:o.id},h=scene.view==='top'?o.depth:Math.max(o.height,.2),y=scene.view==='top'?o.y:scene.maxZ-o.z-h/2
  if(contains(o.x,y,o.width,h)&&selectionAllowed(selection,o,options.filter))targets.push({selection,label:o.name})
 }
 return targets
}

// A ray may cross dozens of triangles of one tree. Each entity appears once,
// retaining the nearest intersection's order and its disclosed identity only.
export function uniquePickTargets(targets:ScenePickTarget[]){
 const seen=new Set<string>()
 return targets.filter(t=>{const key=t.selection.kind+':'+t.selection.id;if(seen.has(key))return false;seen.add(key);return true})
}

// The same centre rule as the 3D marquee, in schematic coordinates.
export function schematicRegionTargets(scene:Scene,a:{x:number;y:number},b:{x:number;y:number},options:{hidden?:string[];protected?:string[];filter?:SelectionFilter}={}):EditorItem[]{
 const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y),size=Math.max(scene.width,scene.view==='side'?scene.maxZ-scene.minZ:scene.depth)*.022
 const inside=(x:number,y:number)=>x>=left&&x<=right&&y>=top&&y<=bottom,items:EditorItem[]=[]
 for(const o of scene.objects){const s={kind:'object' as const,id:o.id},y=scene.view==='top'?o.y:scene.maxZ-o.z-Math.max(.2,o.height)/2;if(!options.hidden?.includes(o.id)&&!options.protected?.includes(o.id)&&inside(o.x,y)&&selectionAllowed(s,o,options.filter))items.push(s)}
 for(const t of scene.tokens){const s={kind:'token' as const,id:t.actorId},y=scene.view==='top'?t.y:scene.maxZ-t.z-size;if(inside(t.x,y)&&selectionAllowed(s,'actor',options.filter))items.push(s)}
 return items
}
