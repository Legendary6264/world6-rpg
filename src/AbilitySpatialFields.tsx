import { Check, Field, NumberField } from './RpgControls'
import type { AbilityDefinition, AbilitySpatial } from './rpgTypes'
export default function AbilitySpatialFields({value,onChange}:{value:AbilityDefinition;onChange:(v:AbilityDefinition)=>void}) {
  const s=value.spatial
  const shape=(kind:string)=>{
    if(kind==='none'){const next={...value};delete next.spatial;onChange(next);return}
    const common={includeCaster:s?.includeCaster??false}
    const spatial:AbilitySpatial=kind==='point'?{shape:'point',...common}:kind==='sphere'?{shape:'sphere',...common,radiusM:0}:kind==='beam'?{shape:'beam',...common,lengthM:0,radiusM:0}:{shape:'cone',...common,lengthM:0,angleDeg:0}
    onChange({...value,spatial})
  }
  return <fieldset className="w6-fieldset"><legend>Пространственная форма способности</legend>
    <Field label="Форма пространственного выпуска"><select aria-label="Форма пространственного выпуска" value={s?.shape??'none'} onChange={e=>shape(e.currentTarget.value)}>
      <option value="none">Одна цель: себя или существо</option><option value="point">Точка</option><option value="sphere">Сфера вокруг выбранного центра</option><option value="beam">Луч в выбранном направлении</option><option value="cone">Конус в выбранном направлении</option>
    </select></Field>
    {s&&<>
      {'radiusM' in s&&<NumberField label="Радиус пространственного эффекта (м)" value={s.radiusM} max={1e6} onChange={radiusM=>onChange({...value,spatial:{...s,radiusM}})}/>}
      {'lengthM' in s&&<NumberField label="Длина по оси эффекта (м)" value={s.lengthM} max={value.rangeM} onChange={lengthM=>onChange({...value,spatial:{...s,lengthM}})}/>}
      {s.shape==='cone'&&<NumberField label="Полный угол конуса (градусы, меньше 180)" value={s.angleDeg} max={179.999} onChange={angleDeg=>onChange({...value,spatial:{...s,angleDeg}})}/>}
      <Check label="Эффект может затронуть применяющего" value={s.includeCaster} onChange={includeCaster=>onChange({...value,spatial:{...s,includeCaster}})}/>
      <p className="w6-copy">Мастер задаёт размеры. Выпуск выполняется в раунде из свободного заряда. Сфера использует выбранный центр, луч и конус — направление от применяющего к выбранной точке. Длина по оси не больше дальности.</p>
      <p className="w6-copy">Отбор использует XYZ отметок, включая высоту. Стены, укрытие, область тела и исключения мастер проверяет до применения результата. Постоянная зона и поддержание области пока не подключены; физический снаряд рассчитан только для одной однозначной точки.</p>
    </>}
  </fieldset>
}
