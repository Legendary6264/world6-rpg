import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { parameterFields } from './rpgSchema'
import type { Modifier } from './rpgTypes'
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="w6-field"><span>{label}</span>{children}</label>}
export function NumberField({label,value,onChange,min=0,max}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number}){return <Field label={label}><input type="number" step="any" min={min} max={max} required value={Number.isFinite(value)?value:''} onChange={e=>onChange(e.currentTarget.value===''?NaN:Number(e.currentTarget.value))}/></Field>}
export function TextField({label,value,onChange,max=120}:{label:string;value:string;onChange:(v:string)=>void;max?:number}){return <Field label={label}><input value={value} maxLength={max} onChange={e=>onChange(e.currentTarget.value)}/></Field>}
export function Check({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return <label className="w6-check"><input type="checkbox" checked={value} onChange={e=>onChange(e.currentTarget.checked)}/>{label}</label>}
export function TagsField({label,value,onChange}:{label:string;value:string[];onChange:(v:string[])=>void}){
  const [raw,setRaw]=useState(value.join(', '))
  useEffect(()=>{if(raw.split(',').map(s=>s.trim()).filter(Boolean).join(', ')!==value.join(', '))setRaw(value.join(', '))},[value,raw])
  return <TextField label={label+' (через запятую)'} value={raw} max={1000} onChange={v=>{setRaw(v);onChange(v.split(',').map(s=>s.trim()).filter(Boolean))}}/>
}
export function ModifiersEditor({value,onChange,allowResourceMaximum=true}:{value:Modifier[];onChange:(v:Modifier[])=>void;allowResourceMaximum?:boolean}){return <div className="w6-fieldset"><h4>Изменения параметров</h4>{value.map((m,index)=><div className="w6-modifier-row" key={index}>
  <Field label="Параметр"><select value={m.parameter} onChange={e=>onChange(value.map((x,j)=>j===index?{...x,parameter:e.currentTarget.value as Modifier['parameter']}:x))}>{parameterFields.filter(p=>allowResourceMaximum||!p.key.startsWith('maximum')).map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
  <NumberField label="Прибавка" min={-1e12} value={m.flat} onChange={n=>onChange(value.map((x,j)=>j===index?{...x,flat:n}:x))}/>
  <NumberField label="Изменение (%)" min={-1e12} value={m.percent} onChange={n=>onChange(value.map((x,j)=>j===index?{...x,percent:n}:x))}/>
  <button className="w6-button" type="button" onClick={()=>onChange(value.filter((_,j)=>j!==index))}>Убрать</button>
</div>)}<button type="button" className="w6-button" disabled={value.length>=50} onClick={()=>onChange([...value,{parameter:'movement',flat:0,percent:0}])}>Добавить изменение</button></div>}
