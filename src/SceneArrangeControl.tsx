import {useState} from 'react'
import type {SceneObject} from './sceneTypes'

type Axis='x'|'y'
type Alignment='min'|'center'|'max'|'distribute'
type Props={disabled:boolean;objectOnly:boolean;count:number;primary?:SceneObject;
 onArrange:(axis:Axis,mode:Alignment,referenceId?:string)=>boolean;
 onSpace:(axis:Axis,gap:number,referenceId?:string)=>boolean}

export default function SceneArrangeControl({disabled,objectOnly,count,primary,onArrange,onSpace}:Props){
 const [axis,setAxis]=useState<Axis>('x'),[reference,setReference]=useState<'selection'|'active'>('selection'),[gap,setGap]=useState('0.5')
 const referenceId=reference==='active'?primary?.id:undefined
 return <section className="gb-arrange-control" aria-label="Точная расстановка">
  <header><strong>Точная расстановка</strong><small>МЕТРЫ · КРАЯ ОБЪЕКТОВ</small></header>
  <fieldset disabled={disabled||!objectOnly}>
   <div className="gb-arrange-options"><label>Ось<select aria-label="Ось выравнивания" value={axis} onChange={e=>setAxis(e.currentTarget.value as Axis)}><option value="x">X</option><option value="y">Y</option></select></label>
    <label>Ориентир<select aria-label="Ориентир расстановки" value={reference} onChange={e=>setReference(e.currentTarget.value as 'selection'|'active')}><option value="selection">Границы выделения</option><option value="active" disabled={!primary}>Активный объект</option></select></label></div>
   {reference==='active'&&primary&&<p className="gb-arrange-reference">Остаётся на месте: <strong>{primary.name}</strong></p>}
   <div className="gb-arrange-buttons">{([['min','К началу'],['center','По центру'],['max','К концу']] as const).map(([mode,label])=><button className="w6-button" key={mode} type="button" onClick={()=>onArrange(axis,mode,referenceId)}>{label}</button>)}</div>
   <form aria-label="Промежуток между объектами" onSubmit={e=>{e.preventDefault();onSpace(axis,gap.trim()?Number(gap):NaN,referenceId)}}>
    <label>Промежуток, м<input aria-label="Промежуток, м" type="number" min="0" step="any" required value={gap} onChange={e=>setGap(e.currentTarget.value)}/></label>
    <button className="w6-button" type="submit">Задать промежуток</button>
   </form>
   <button className="w6-button gb-arrange-distribute" type="button" disabled={count<3} onClick={()=>onArrange(axis,'distribute')}>Равные промежутки</button>
  </fieldset>
  <p>{!objectOnly?'Выравнивание доступно для объектов без героев.':reference==='active'?'Выравнивание и заданный промежуток сохраняют активный объект. Равные промежутки сохраняют два крайних объекта.':'Заданный промежуток сохраняет первый объект по оси. Равные промежутки сохраняют два крайних объекта.'}</p>
 </section>
}
