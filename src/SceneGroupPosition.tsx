import {useState} from 'react'
import type {ScenePosition} from './sceneTypes'
import type {EditorObjectBounds} from './sceneEditorTransform'

type Props={bounds?:EditorObjectBounds;disabled:boolean;onOffset:(value:ScenePosition)=>boolean;onPosition:(value:ScenePosition)=>boolean}
const format=(value:number)=>value.toLocaleString('ru-RU',{maximumFractionDigits:3})
export default function SceneGroupPosition({bounds,disabled,onOffset,onPosition}:Props){
 const [choice,setChoice]=useState<'offset'|'position'>('offset'),mode=bounds?choice:'offset'
 const initial=mode==='position'&&bounds?bounds.anchor:{x:0,y:0,z:0}
 return <section className="gb-group-position" aria-label="Положение и габариты группы">
  {bounds&&<dl aria-label="Габариты выделения">{([['x','Ширина'],['y','Глубина'],['z','Высота']] as const).map(([axis,label])=><div key={axis}><dt>{label}</dt><dd>{format(bounds.size[axis])}<small> м</small></dd></div>)}</dl>}
  <div className="gb-group-position-mode" role="group" aria-label="Режим перемещения группы"><button type="button" aria-pressed={mode==='offset'} onClick={()=>setChoice('offset')}>Сдвиг</button><button type="button" aria-pressed={mode==='position'} disabled={!bounds} onClick={()=>setChoice('position')}>Положение</button></div>
  <form className="gb-group-offset" key={mode+':'+(mode==='position'?JSON.stringify(bounds):'offset')} aria-label={mode==='position'?'Точное положение группы':'Точный сдвиг группы'} onSubmit={e=>{
   e.preventDefault();const form=e.currentTarget,data=new FormData(form),read=(name:string)=>{const value=String(data.get(name)??'').trim();return value?Number(value):NaN},value={x:read('x'),y:read('y'),z:read('z')}
   if((mode==='position'?onPosition:onOffset)(value)&&mode==='offset')form.reset()
  }}>
   <fieldset disabled={disabled}>{(['x','y','z'] as const).map(axis=><label className="w6-field" key={axis}><span>{mode==='offset'?'Сдвиг '+axis.toUpperCase():axis==='z'?'Нижний Z':'Центр '+axis.toUpperCase()}, м</span><input name={axis} type="number" step="any" required defaultValue={initial[axis]}/></label>)}<button className="w6-button" type="submit">{mode==='position'?'Установить положение':'Переместить группу'}</button></fieldset>
  </form>
  <p>{mode==='position'?'X/Y — центр полных габаритов, Z — нижняя точка. Размеры и расположение предметов внутри группы сохраняются.':bounds?'Сдвиг прибавляется к текущим координатам. Для координат сцены выбери «Положение».':'Сдвиг применяется к объектам и героям. Абсолютное положение доступно для группы объектов.'}</p>
 </section>
}
