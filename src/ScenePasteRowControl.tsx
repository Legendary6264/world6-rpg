import type {AssemblyRow} from './sceneAssemblyRow'

type Props={row?:AssemblyRow;maxCopies:number;error:string;size?:{width:number;depth:number};onChange:(row:AssemblyRow|undefined)=>void}
export default function ScenePasteRowControl({row,maxCopies,error,size,onChange}:Props){
 return <div className="gb-paste-row">
  <label className="gb-paste-repeat"><input type="checkbox" aria-label="Создать ряд" checked={!!row} disabled={maxCopies<2} onChange={e=>onChange(e.currentTarget.checked?{count:Math.min(3,maxCopies),axis:'x',gap:.5}:undefined)}/>Создать ряд</label>
  {row&&<fieldset aria-label="Параметры ряда"><label>Копий в ряду<input type="number" min="2" max={maxCopies} step="1" aria-label="Количество копий в ряду" value={Number.isFinite(row.count)?row.count:''} onChange={e=>onChange({...row,count:e.currentTarget.valueAsNumber})}/></label>
   <label>Ось сцены<select aria-label="Ось ряда" value={row.axis} onChange={e=>onChange({...row,axis:e.currentTarget.value as AssemblyRow['axis']})}><option value="x">X</option><option value="y">Y</option></select></label>
   <label>Промежуток, м<input type="number" min="0" step="any" aria-label="Промежуток между копиями, м" value={Number.isFinite(row.gap)?row.gap:''} onChange={e=>onChange({...row,gap:e.currentTarget.valueAsNumber})}/></label>
   <small>Между краями композиций. R поворачивает каждую копию; ось ряда сохраняется.</small>
   {size&&<small className="gb-paste-row-size">Ряд: {size.width.toLocaleString('ru-RU')} × {size.depth.toLocaleString('ru-RU')} м · одна отмена</small>}
  </fieldset>}
  {row?<small>До {maxCopies} копий · не более 64 объектов в ряду.</small>:maxCopies<2?<small>Для ряда нужна композиция до 32 объектов.</small>:null}
  {error&&<p className="gb-paste-error" role="alert">{error}</p>}
 </div>
}
