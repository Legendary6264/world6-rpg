import type {SceneAssembly,AssemblyPlacement} from './sceneAssemblies'
import {assemblyDimensions,assemblyLayout,isSceneAssembly,MAX_ASSEMBLY_OBJECTS} from './sceneAssemblies'

export type AssemblyRow={count:number;axis:'x'|'y';gap:number}
const round=(n:number)=>Math.round(n*1e6)/1e6
const extent=(n:number)=>Math.ceil((n-1e-9)*1e6)/1e6
export function maxAssemblyRowCopies(assembly:SceneAssembly){return Math.floor(MAX_ASSEMBLY_OBJECTS/assembly.objects.length)}

// Rotate each source composition first, then arrange on a world axis. A single
// resulting assembly shares one preview anchor, grid snap and atomic write;
// copies near an edge must not clamp separately and collapse their gaps.
export function buildAssemblyRow(source:SceneAssembly,facing:number,row:AssemblyRow):SceneAssembly{
 if(!isSceneAssembly(source))throw Error('Скопированная композиция повреждена.')
 if(maxAssemblyRowCopies(source)<2)throw Error('Для ряда нужна композиция не более чем из 32 объектов.')
 if(!Number.isInteger(row.count)||row.count<2||row.count>maxAssemblyRowCopies(source))throw Error('Для ряда укажи от 2 до '+maxAssemblyRowCopies(source)+' копий; суммарно — не более 64 объектов.')
 if(row.axis!=='x'&&row.axis!=='y')throw Error('Выбери ось ряда: X или Y.')
 if(!Number.isFinite(row.gap)||row.gap<0)throw Error('Промежуток между копиями должен быть числом не меньше нуля.')
 const size=assemblyDimensions(source,facing),stride=size[row.axis==='x'?'width':'depth']+row.gap
 const base=assemblyLayout(source,{x:size.width/2,y:size.depth/2,z:0},facing)
 const result:SceneAssembly={version:1,id:'clipboard-row',name:source.name.slice(0,55)+' · ряд из '+row.count,width:extent(row.axis==='x'?size.width+(row.count-1)*stride:size.width),depth:extent(row.axis==='y'?size.depth+(row.count-1)*stride:size.depth),height:source.height,
  objects:Array.from({length:row.count},(_,copy)=>base.map((o,index)=>({...o,id:'row-'+copy+'-'+index,[row.axis]:round(o[row.axis]+copy*stride)}))).flat()}
 if(!isSceneAssembly(result))throw Error('Ряд слишком велик. Уменьши количество копий или промежуток.')
 return result
}
export function resolvePasteShape(assembly:SceneAssembly,facing:number,elevation:number,row?:AssemblyRow):{placement?:AssemblyPlacement;error:string}{
 try{return {placement:row?{assembly:buildAssemblyRow(assembly,facing,row),facing:0,elevation}:{assembly,facing,elevation},error:''}}
 catch(error){return {error:(error as Error).message}}
}
