import {useState} from 'react'
import type {ScenePosition} from './sceneTypes'

export default function SceneScaleControl({disabled,onScale}:{disabled:boolean;onScale:(factor:ScenePosition)=>boolean}){
 const [percent,setPercent]=useState({x:'100',y:'100',z:'100'}),[uniform,setUniform]=useState(true)
 function change(axis:keyof ScenePosition,value:string){setPercent(p=>uniform?{x:value,y:value,z:value}:{...p,[axis]:value})}
 return <details className="gb-scale-control"><summary>Масштаб объектов</summary><form aria-label="Масштаб объектов" onSubmit={e=>{e.preventDefault();if(onScale({x:Number(percent.x)/100,y:Number(percent.y)/100,z:Number(percent.z)/100}))setPercent({x:'100',y:'100',z:'100'})}}>
  <fieldset disabled={disabled}><label className="gb-scale-uniform"><input type="checkbox" checked={uniform} onChange={e=>{const enabled=e.currentTarget.checked;setUniform(enabled);if(enabled)setPercent(p=>({x:p.x,y:p.x,z:p.x}))}}/> Сохранять пропорции</label>
   <div>{(['x','y','z'] as const).map(axis=><label key={axis}>{axis.toUpperCase()}, %<input aria-label={'Масштаб '+axis.toUpperCase()+', %'} type="number" min="0.01" step="any" required value={percent[axis]} onChange={e=>change(axis,e.currentTarget.value)}/></label>)}</div>
   <button className="w6-button" type="submit">Применить масштаб</button></fieldset>
  <small>Центр выделения по X/Y, нижняя точка по Z. Герой на опоре сохраняет размер и положение относительно неё.</small>
 </form></details>
}
