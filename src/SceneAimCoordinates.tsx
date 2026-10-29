import {useEffect,useRef,useState} from 'react'
import type {ScenePosition} from './sceneTypes'
const fields=(point:ScenePosition|null,groundZ:number)=>point?{x:String(point.x),y:String(point.y),z:String(point.z)}:{x:'',y:'',z:String(groundZ)}
export default function SceneAimCoordinates({point,groundZ,onChange}:{point:ScenePosition|null;groundZ:number;onChange:(point:ScenePosition|null)=>void}){
 const [draft,setDraft]=useState(()=>fields(point,groundZ)),last=useRef({point,groundZ})
 useEffect(()=>{if(point!==last.current.point||groundZ!==last.current.groundZ){last.current={point,groundZ};setDraft(fields(point,groundZ))}},[point,groundZ])
 function edit(axis:keyof ScenePosition,value:string){
  const next={...draft,[axis]:value};setDraft(next)
  const number=(text:string)=>text.trim()?Number(text.replace(',','.')):NaN,p={x:number(next.x),y:number(next.y),z:number(next.z)},valid=Object.values(p).every(Number.isFinite)?p:null
  last.current={point:valid,groundZ};onChange(valid)
 }
 return <fieldset className="gb-aim-coordinates"><legend>Точка или направление</legend>{(['x','y','z'] as const).map(axis=><label key={axis}>{axis.toUpperCase()}<input aria-label={'Прицел '+axis.toUpperCase()} type="text" inputMode="decimal" autoComplete="off" value={draft[axis]} onChange={e=>edit(axis,e.currentTarget.value)}/></label>)}</fieldset>
}
