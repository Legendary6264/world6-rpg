import type {Scene,SceneObject,ScenePosition} from './sceneTypes'
import {createTabletopObject,isFloorAsset,tabletopAsset} from './tabletopCatalog.ts'
import {legacyAsset,legacyPlacementDefaults,presentationAssetId} from './legacyAssets.ts'
import {sceneObject} from './sceneObjectDefaults.ts'

export type PlacementFrame=Pick<Scene,'width'|'depth'|'groundZ'|'maxZ'>
export type PlacementSurface=Pick<SceneObject,'id'|'name'|'kind'|'asset'|'artwork'|'facing'|'x'|'y'|'z'|'width'|'depth'|'height'|'canSupport'|'open'>
export type PlacementOptions={surfaceSnap?:boolean;snapStep?:number;surfaceId?:string|null}
export type AssetPlacement=({asset:string}|{object:SceneObject})&{facing:number;surfaceSnap?:boolean;surfaces?:PlacementSurface[]}
export function createEnvironmentObject(kind:SceneObject['kind'],artwork:string,id:string,point:ScenePosition,facing=0):SceneObject{
 const object=sceneObject(kind,id,point),profile=legacyAsset({kind,artwork})
 if(profile){Object.assign(object,legacyPlacementDefaults(artwork));object.name=profile.label}
 if(artwork!=='auto')object.artwork=artwork
 object.facing=facing
 if(facing%180!==0)[object.width,object.depth]=[object.depth,object.width]
 return object
}
export function flatPlacementSurface(o:PlacementSurface){
 // A chest's saved height includes its opening arc; neither its curved lid
 // nor a bed's headboard is a flat plane at z + height.
 const legacy=legacyAsset(o),asset=presentationAssetId(o)
 if(legacy&&!['table','round-table','bench','stool','barrel','desk','workbench','platform'].includes(asset??''))return false
 return (isFloorAsset(o.asset)||o.canSupport)&&!['roof-tile','stairs','bed','chest'].includes(asset??'')&&!(o.open&&o.kind==='crate')
}
export function placementSurfaceFootprint(surface:Pick<PlacementSurface,'asset'|'facing'|'width'|'depth'>&Partial<Pick<PlacementSurface,'kind'|'artwork'>>){
 // Conservative flat tops, inside bevels and the low-detail circular polygon.
 // Collision dimensions include the outer rim, belly and splayed furniture legs.
 const asset=presentationAssetId({...surface,kind:surface.kind??''}),scale=asset==='round-table'?.92:asset==='stool'?.85:asset==='barrel'?.71:1
 const circular=scale!==1
 const inset=asset==='table'?[.97,.90]:['bar','bench'].includes(asset??'')?[.96,.90]:legacyAsset({...surface,kind:surface.kind??''})?asset==='desk'?[.92,.70]:asset==='workbench'?[.92,.80]:asset==='platform'?[.92,.88]:[1,1]:[1,1]
 const odd=(surface.facing??0)%180!==0
 return {width:surface.width*(circular?scale:inset[odd?1:0]),depth:surface.depth*(circular?scale:inset[odd?0:1]),shape:circular?'ellipse' as const:'rectangle' as const}
}
export function canPlaceOnSurface(object:Pick<SceneObject,'x'|'y'|'width'|'depth'>,surface:PlacementSurface){
 const dx=Math.abs(object.x-surface.x)+object.width/2,dy=Math.abs(object.y-surface.y)+object.depth/2,top=placementSurfaceFootprint(surface)
 if(top.shape==='ellipse')return (dx/(top.width/2))**2+(dy/(top.depth/2))**2<=1+1e-6
 return dx<=top.width/2+1e-6&&dy<=top.depth/2+1e-6
}
export function surfacePlacementAsset(id:string){const a=tabletopAsset(id);return !!a&&['crate','lamp'].includes(a.kind)&&!['fireplace','torch','chandelier','trap-fire','trap-spikes'].includes(id)}
export function surfacePlacementObject(object:Pick<SceneObject,'asset'|'artwork'|'kind'>){
 const legacy=legacyAsset(object)
 return object.asset?surfacePlacementAsset(object.asset):legacy?.native?surfacePlacementAsset(legacy.native):legacy?.group==='furniture'||['crate','lamp'].includes(object.kind)
}
// Resolve the actual footprint, retaining custom sizes, orientation and state.
// The same calculation drives both an existing object's preview and its commit.
export function resolveObjectPlacement<T extends PlacementSurface>(frame:PlacementFrame,surfaces:readonly PlacementSurface[],source:T,point:ScenePosition,options:PlacementOptions={}){
 const object={...source}
 if(![point.x,point.y,object.width,object.depth,object.height].every(Number.isFinite)||object.width<.1||object.depth<.1||object.height<0)throw Error('Проверь размеры и положение модели.')
 if(object.width>frame.width||object.depth>frame.depth)throw Error('Модель не помещается в границы сцены.')
 const step=options.snapStep,snap=(n:number)=>step&&Number.isFinite(step)&&step>0?Math.round(n/step)*step:n
 object.x=Math.max(object.width/2,Math.min(frame.width-object.width/2,snap(point.x)))
 object.y=Math.max(object.depth/2,Math.min(frame.depth-object.depth/2,snap(point.y)))
 let surface:PlacementSurface|undefined
 if(options.surfaceSnap&&surfacePlacementObject(object)){
  object.z=frame.groundZ
  const candidates=options.surfaceId===undefined?surfaces:surfaces.filter(o=>o.id===options.surfaceId)
  surface=candidates.filter(o=>o.id!==object.id&&flatPlacementSurface(o)&&o.z+o.height>=frame.groundZ-1e-6&&canPlaceOnSurface(object,o)).sort((a,b)=>(b.z+b.height)-(a.z+a.height)||a.id.localeCompare(b.id))[0]
  if(options.surfaceId!==undefined&&options.surfaceId!==null&&!surface)throw Error('Выбранная поверхность больше не подходит для модели.')
  if(surface)object.z=surface.z+surface.height
 }
 if(object.z+object.height>frame.maxZ+1e-6)throw Error('Над поверхностью недостаточно места для модели.')
 return {object,surfaceId:surface?.id??null,surfaceName:surface?.name??'Земля сцены'}
}
export function resolveAssetPlacement(frame:PlacementFrame,surfaces:readonly PlacementSurface[],asset:string,id:string,point:ScenePosition,facing:number,options:PlacementOptions={}){
 const elevation=asset==='timber-beam'?2.46:asset==='roof-tile'?2.7:asset==='chandelier'?1.8:0
 return resolveObjectPlacement(frame,surfaces,createTabletopObject(asset,id,{...point,z:frame.groundZ+elevation},facing),point,options)
}
