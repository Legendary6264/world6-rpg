import type { ParameterTrace } from './rpgParameters'
const n=(v:number)=>Number(v.toFixed(6))
export default function FormulaExplanation({trace}:{trace:ParameterTrace}){
 return <div className="w6-fieldset w6-calculation" data-testid="formula-explanation">
  <h4>Пошаговый расчёт</h4>
  <p>{trace.mode==='manual'?'Ручное значение: '+(trace.raw||'не задано'):'Базовая величина: '+trace.base}{trace.fallback?' · используется стандартная формула для пустого поля':''}.</p>
  {trace.terms.length>0&&<div className="w6-table-scroll"><table className="w6-table"><thead><tr><th>Атрибут</th><th>База + развитие, тренировка, раса</th><th>Коэффициент</th><th>Вклад</th></tr></thead><tbody>{trace.terms.map(t=><tr key={t.label}><td>{t.label}</td><td>{t.raw} + {t.bonus} = {t.value}</td><td>{t.weight}</td><td>{n(t.contribution)}</td></tr>)}</tbody></table></div>}
  {trace.mode==='adjusted'&&<p>Индивидуальная поправка: {trace.adjustment}.</p>}
  <p>Основа после атрибутов и поправки: <strong>{trace.basis===null?'не задана':n(trace.basis)}</strong>.</p>
  {trace.modifiers.length>0?<ul>{trace.modifiers.map((m,i)=><li key={i}>{m.source}: прибавка {n(m.flat)}, изменение {n(m.percent)}%.</li>)}</ul>:<p>Активных изменений этого параметра нет.</p>}
  {trace.beforeLimit!==null&&<p>({n(trace.basis!)} + {n(trace.flat)}) × (1 + {n(trace.percent)} / 100) = {n(trace.beforeLimit)}.</p>}
  {trace.limits.map(limit=><p key={limit}>{limit}.</p>)}
  <p>Итог: <strong data-testid="formula-result">{trace.result||'Не задано'}</strong>.</p>
 </div>
}
