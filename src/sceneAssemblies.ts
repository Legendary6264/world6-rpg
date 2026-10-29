import type {Scene,SceneObject,ScenePosition,SceneState} from './sceneTypes'
import type {EditorItem} from './sceneEditorCommands'
import type {AssetPlacement} from './sceneEditorPlacement'
import {copySceneState,isSceneState,MAX_SCENE_OBJECTS,replaceScene} from './scenes.ts'

export type SceneAssembly={version:1;id:string;name:string;width:number;depth:number;height:number;objects:SceneObject[]}
export type AssemblyPlacement={assembly:SceneAssembly;facing:number;elevation:number}
export type ScenePlacement=AssetPlacement|AssemblyPlacement
// Coordinates supplied by a visible placement preview have already been
// snapped and clamped. Commit revalidates them without a second grid round.
export type ScenePointOptions={surfaceId:string|null;resolved?:boolean}
const libraryFormat='grani-scene-assemblies',maxBytes=2*1024*1024
export const MAX_ASSEMBLIES=20,MAX_ASSEMBLY_OBJECTS=64
const round=(n:number)=>Math.round(n*1e6)/1e6
const extent=(n:number)=>Math.ceil((n-1e-9)*1e6)/1e6
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(v)
function assemblyScene(a:SceneAssembly):Scene{return {id:'assembly',name:'Сборка',description:'',view:'top',palette:'stone',groundZ:0,minZ:0,maxZ:Math.max(1,a.height+1),width:a.width,depth:a.depth,objects:a.objects,tokens:[]}}
function cleanAssembly(a:SceneAssembly):SceneAssembly{return {version:1,id:a.id,name:a.name,width:a.width,depth:a.depth,height:a.height,objects:copySceneState({version:1,activeSceneId:'assembly',scenes:[assemblyScene(a)]}).scenes[0].objects}}
export function isSceneAssembly(value:unknown):value is SceneAssembly{
 if(!value||typeof value!=='object')return false
 const a=value as SceneAssembly
 if(a.version!==1||!validId(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>80||![a.width,a.depth,a.height].every(n=>Number.isFinite(n)&&n>=0&&n<=1e6)||a.width<.1||a.depth<.1||!Array.isArray(a.objects)||!a.objects.length||a.objects.length>MAX_ASSEMBLY_OBJECTS)return false
 if(!isSceneState({version:1,activeSceneId:'assembly',scenes:[assemblyScene(a)]}))return false
 return a.objects.every(o=>o.x-o.width/2>=-1e-6&&o.y-o.depth/2>=-1e-6&&o.x+o.width/2<=a.width+1e-6&&o.y+o.depth/2<=a.depth+1e-6&&o.z+o.height<=a.height+1e-6)
}
export function captureSceneAssembly(scene:Scene,items:readonly EditorItem[],name:string,id:string):SceneAssembly{
 if(items.some(s=>s.kind!=='object'))throw Error('Для сборки выбери объекты без героев.')
 const ids=new Set(items.map(s=>s.id)),objects=scene.objects.filter(o=>ids.has(o.id))
 if(!objects.length||objects.length!==ids.size)throw Error('Сначала выбери существующие объекты сцены.')
 if(objects.length>MAX_ASSEMBLY_OBJECTS)throw Error('В одной сборке может быть до 64 объектов.')
 const x=Math.min(...objects.map(o=>o.x-o.width/2)),y=Math.min(...objects.map(o=>o.y-o.depth/2)),z=Math.min(...objects.map(o=>o.z))
 const assembly:SceneAssembly={version:1,id,name:name.trim(),width:extent(Math.max(...objects.map(o=>o.x+o.width/2))-x),depth:extent(Math.max(...objects.map(o=>o.y+o.depth/2))-y),height:Math.max(0,extent(Math.max(...objects.map(o=>o.z+o.height))-z)),
  objects:objects.map(o=>({...o,x:round(o.x-x),y:round(o.y-y),z:round(o.z-z)}))}
 if(!isSceneAssembly(assembly))throw Error('Проверь название и габариты сборки.')
 return cleanAssembly(assembly)
}
export function assemblyDimensions(a:SceneAssembly,facing:number){if(![0,90,180,270].includes(facing))throw Error('Поворот должен быть кратен 90°.');return {width:facing%180?a.depth:a.width,depth:facing%180?a.width:a.depth,height:a.height}}
export function assemblyLayout(a:SceneAssembly,at:ScenePosition,facing:number):SceneObject[]{
 assemblyDimensions(a,facing)
 return a.objects.map(o=>{
  const x=o.x-a.width/2,y=o.y-a.depth/2,rx=facing===0?x:facing===90?-y:facing===180?-x:y,ry=facing===0?y:facing===90?x:facing===180?-y:-x
  return {...o,x:round(at.x+rx),y:round(at.y+ry),z:round(at.z+o.z),width:facing%180?o.depth:o.width,depth:facing%180?o.width:o.depth,facing:((o.facing??0)+facing)%360}
 })
}
export function assemblyAnchor(frame:Pick<Scene,'width'|'depth'|'groundZ'>,a:SceneAssembly,point:ScenePosition,facing:number,elevation=0,step?:number):ScenePosition{
 const size=assemblyDimensions(a,facing)
 if(size.width>frame.width||size.depth>frame.depth)throw Error('Сборка не помещается в границы сцены.')
 if(![point.x,point.y,elevation].every(Number.isFinite))throw Error('Проверь координаты и высоту сборки.')
 const snap=(n:number)=>step&&Number.isFinite(step)&&step>0?Math.round(n/step)*step:n
 return {x:Math.max(size.width/2,Math.min(frame.width-size.width/2,snap(point.x))),y:Math.max(size.depth/2,Math.min(frame.depth-size.depth/2,snap(point.y))),z:round(frame.groundZ+elevation)}
}
export function stampSceneAssembly(state:SceneState,a:SceneAssembly,at:ScenePosition,facing:number,id:()=>string,elevation=0,step?:number){
 if(!isSceneAssembly(a))throw Error('Сборка повреждена.')
 const scene=state.scenes.find(s=>s.id===state.activeSceneId);if(!scene)throw Error('Выбери сцену.')
 if(scene.objects.length+a.objects.length>MAX_SCENE_OBJECTS)throw Error('Сборка превышает лимит 250 объектов сцены.')
 const anchor=assemblyAnchor(scene,a,at,facing,elevation,step),objects=assemblyLayout(a,anchor,facing).map(o=>({...o,id:id()}))
 return {state:replaceScene(state,{...scene,objects:[...scene.objects,...objects]}),items:objects.map(o=>({kind:'object' as const,id:o.id}))}
}
export function encodeAssemblyLibrary(assemblies:readonly SceneAssembly[]){
 if(assemblies.length>MAX_ASSEMBLIES||!assemblies.every(isSceneAssembly)||new Set(assemblies.map(a=>a.id)).size!==assemblies.length)throw Error('Библиотека может содержать до 20 корректных сборок.')
 const raw=JSON.stringify({format:libraryFormat,version:1,assemblies:assemblies.map(cleanAssembly)})
 if(raw.length*2>maxBytes)throw Error('Библиотека сборок превышает 2 МБ. Уменьши число сборок или изображений.')
 return raw
}
export function decodeAssemblyLibrary(raw:string):SceneAssembly[]{
 if(raw.length*2>maxBytes)throw Error('Файл сборок превышает 2 МБ.')
 const v=JSON.parse(raw)
 if(!v||v.format!==libraryFormat||v.version!==1||!Array.isArray(v.assemblies))throw Error('Некорректный файл сборок.')
 encodeAssemblyLibrary(v.assemblies)
 return v.assemblies.map(cleanAssembly)
}
export function mergeAssemblyLibraries(current:readonly SceneAssembly[],incoming:readonly SceneAssembly[],id:()=>string){
 const next=current.slice()
 for(const item of incoming){const found=next.find(a=>a.id===item.id);if(found&&JSON.stringify(found)===JSON.stringify(item))continue;next.push(found?{...item,id:id()}:item)}
 encodeAssemblyLibrary(next);return next
}
const storageKey=(scope:string)=>'grani-bytiya:assemblies:v1:'+encodeURIComponent(scope)
export function readAssemblyLibrary(scope?:string){try{return scope?decodeAssemblyLibrary(window.localStorage.getItem(storageKey(scope))??'{"format":"grani-scene-assemblies","version":1,"assemblies":[]}'):[]}catch{return []}}
export function writeAssemblyLibrary(scope:string|undefined,items:readonly SceneAssembly[]){const raw=encodeAssemblyLibrary(items);try{if(scope)window.localStorage.setItem(storageKey(scope),raw);return !!scope}catch{return false}}
