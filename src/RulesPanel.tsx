import { standardFormulas } from './creationRules'
import { useState } from 'react'
import type { Actor } from './rpgEngine'
import { parameterCalculation } from './rpgParameters'
import { attrKeys, parameterFields, isFormula } from './rpgSchema'
import type { Formula, ParameterKey } from './rpgTypes'
import type { AttributeKey } from './attributes'
import { attributeFields } from './characterModel'
import { effectiveBodySpeed } from './characterBody'
import { Check, Field, NumberField } from './RpgControls'
import FormulaExplanation from './FormulaExplanation'
type Props={actor:Actor;seconds:number;onChange:(a:Actor)=>void}
export default function RulesPanel({actor,seconds,onChange}:Props){
 const [form,setForm]=useState<Formula|null>(null),[selected,setSelected]=useState<ParameterKey>('maximumMana'),[message,setMessage]=useState('')
 const [scenario,setScenario]=useState(false),[overrides,setOverrides]=useState<Partial<Record<AttributeKey,number>>>({}),[scenarioAttr,setScenarioAttr]=useState<AttributeKey>('energyCapacity'),[gear,setGear]=useState(true),[effects,setEffects]=useState(true)
 let result:ReturnType<typeof parameterCalculation>|null=null,preview:ReturnType<typeof parameterCalculation>|null=null,error='',previewError=''
 try{result=parameterCalculation(actor,seconds)}catch(e){error=(e as Error).message}
 const candidate:Actor={...actor,attributes:scenario?{...actor.attributes,...Object.fromEntries(Object.entries(overrides).map(([k,v])=>[k,String(v)]))}:actor.attributes,rpg:{...actor.rpg,inventory:scenario&&!gear?[]:actor.rpg.inventory,effects:scenario&&!effects?[]:actor.rpg.effects,formulas:form?[...actor.rpg.formulas.filter(f=>f.parameter!==form.parameter),form]:actor.rpg.formulas}}
 try{if(form&&!isFormula(form))throw new Error('Введи конечные числа в пределах ±10¹².');preview=parameterCalculation(candidate,seconds)}catch(e){previewError=(e as Error).message}
 function open(){setForm(actor.rpg.formulas.find(f=>f.parameter===selected)??standardFormulas().find(f=>f.parameter===selected)??{parameter:selected,mode:'formula',base:0,weights:Object.fromEntries(attrKeys.map(k=>[k,0])) as Formula['weights'],adjustment:0})}
 return <section><h3>Формулы и итоговые параметры</h3><p className="w6-copy">Формула заменяет основу параметра. Затем применяются экипировка, действующие эффекты, боль и дефицит жизненного носителя. Ниже можно проверить расчёт и попробовать другой набор атрибутов.</p>
 <Field label="Настраиваемый параметр"><select aria-label="Настраиваемый параметр" value={selected} onChange={e=>{setSelected(e.currentTarget.value as ParameterKey);setForm(null)}}>{parameterFields.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
 <div className="w6-buttons w6-spaced"><button className="w6-button" type="button" onClick={open}>Настроить формулу</button><button className="w6-button" type="button" onClick={()=>{if(window.confirm('Заменить индивидуальные формулы стандартными?')){onChange({...actor,rpg:{...actor.rpg,formulas:standardFormulas()}});setForm(null)}}}>Сбросить формулы</button></div>
 {form&&<form className="w6-fieldset w6-form" onSubmit={e=>{e.preventDefault();if(!isFormula(form)||previewError){setMessage(previewError||'Проверь коэффициенты.');return}onChange({...actor,rpg:{...actor.rpg,formulas:[...actor.rpg.formulas.filter(f=>f.parameter!==form.parameter),structuredClone(form)]}});setForm(null);setMessage('Формула применена к листу. Сохрани изменения.')}}>
  <h4>{parameterFields.find(p=>p.key===form.parameter)?.label}</h4><Field label="Режим"><select aria-label="Режим формулы" value={form.mode} onChange={e=>setForm({...form,mode:e.currentTarget.value as Formula['mode']})}><option value="manual">Ручное значение</option><option value="formula">По формуле</option><option value="adjusted">По формуле с индивидуальной поправкой</option></select></Field>
  {form.mode!=='manual'&&<div className="w6-attribute-grid"><NumberField min={-1e12} max={1e12} label="Базовая величина" value={form.base} onChange={base=>setForm({...form,base})}/>{attributeFields.map(a=><NumberField min={-1e12} max={1e12} key={a.key} label={'Коэффициент: '+a.label} value={form.weights[a.key]} onChange={v=>setForm({...form,weights:{...form.weights,[a.key]:v}})}/>)}{form.mode==='adjusted'&&<NumberField min={-1e12} max={1e12} label="Индивидуальная поправка" value={form.adjustment} onChange={adjustment=>setForm({...form,adjustment})}/>}</div>}
  <p className="w6-copy">Основа = база + сумма (атрибут × коэффициент) + индивидуальная поправка. Предпросмотр обновляется до применения формулы.</p><div className="w6-buttons"><button type="submit" className="w6-button w6-primary" disabled={!!previewError}>Применить формулу</button><button className="w6-button" type="button" onClick={()=>setForm(null)}>Отмена</button></div>
 </form>}
 <div className="w6-fieldset"><Check label="Проверить сценарий без изменения персонажа" value={scenario} onChange={setScenario}/>{scenario&&<>
  <div className="w6-attribute-grid"><Field label="Атрибут сценария"><select aria-label="Атрибут сценария" value={scenarioAttr} onChange={e=>setScenarioAttr(e.currentTarget.value as AttributeKey)}>{attributeFields.map(a=><option value={a.key} key={a.key}>{a.label}</option>)}</select></Field><NumberField label="Базовое значение в сценарии" min={0} max={1e6} value={overrides[scenarioAttr]??Number(actor.attributes[scenarioAttr])} onChange={v=>setOverrides({...overrides,[scenarioAttr]:Math.max(0,Math.min(1e6,v))})}/></div>
  <p className="w6-copy">Развитие, расовые бонусы и тренировка сохраняются. Изменённые базы: {Object.entries(overrides).map(([k,v])=>attributeFields.find(a=>a.key===k)?.label+' '+v).join('; ')||'нет'}.</p>
  <Check label="Учитывать экипировку в сценарии" value={gear} onChange={setGear}/><Check label="Учитывать активные эффекты в сценарии" value={effects} onChange={setEffects}/><button className="w6-button" type="button" onClick={()=>{setOverrides({});setGear(true);setEffects(true)}}>Сбросить сценарий</button>
  <p className="w6-copy">Сценарий не сохраняет атрибуты и не меняет запасы. «Применить формулу» сохраняет только само правило.</p>
 </>}</div>
 {(form||scenario)&&<p className="w6-notice">Предпросмотр {scenario?'сценария':'формулы'}. Текущий результат в листе: {result?.values[selected]||'Не задано'}.</p>}
 {previewError?<p className="w6-error">{previewError}</p>:preview&&<FormulaExplanation trace={preview.traces[selected]}/>}
 {(selected==='movement'||selected==='sprint')&&preview&&<p className="w6-copy">Скорость с учётом работоспособности ног: {effectiveBodySpeed(actor.body,preview.values[selected],selected==='sprint')||'Не задано'}. Полёт проверяется по крыльям отдельно.</p>}
 <p className="w6-copy">Итог = (основа + сумма прибавок) × (1 + сумма процентов / 100). Шансы ограничены 0–100%; ресурсы и скорости неотрицательны. Общего HP нет, невыбранная энергия отключена.</p>
 {error&&<p className="w6-error">{error}</p>}
 <div className="w6-table-scroll"><table className="w6-table"><thead><tr><th>Параметр</th><th>Режим основы</th><th>Итог в листе</th></tr></thead><tbody>{parameterFields.map(p=><tr key={p.key}><td><button className="w6-button" type="button" onClick={()=>{setSelected(p.key);setForm(null)}}>{p.label}</button></td><td>{result?.traces[p.key].fallback?'Стандартная формула':{manual:'Вручную',formula:'Формула',adjusted:'Формула + поправка'}[result?.traces[p.key].mode??'manual']}</td><td>{result?.values[p.key]||'Не задано'}</td></tr>)}</tbody></table></div>
 <p className="w6-copy">Изменение максимума не наполняет запас. Избыток текущего ресурса снимается при сохранении или подтверждении действия; обратное увеличение его не возвращает.</p><p role="status" className="w6-notice">{message}</p></section>
}
