import { Check, Field, ModifiersEditor, NumberField, TagsField, TextField } from './RpgControls'
import { emptyConsumableEffect } from './rpgSchema'
import type { ConsumableEffect, ItemDefinition } from './rpgTypes'

export default function ConsumableFields({value,onChange}:{value:ItemDefinition;onChange:(v:ItemDefinition)=>void}) {
  if(value.category!=='consumable')return null
  const effect=value.consumable
  const update=(patch:Partial<ConsumableEffect>)=>{if(effect)onChange({...value,consumable:{...effect,...patch}})}
  return <fieldset className="w6-fieldset"><legend>Эффект одной дозы расходника</legend>
    <p className="w6-copy">Значения задаёт мастер. Название и изображение не определяют эффект. В раунде одна заявленная доза применяется целиком, остаток стопки сохраняется.</p>
    <Check label="Задать эффект расходника" value={!!effect} onChange={enabled=>{
      if(enabled)onChange({...value,consumable:emptyConsumableEffect()})
      else {const next={...value};delete next.consumable;onChange(next)}
    }}/>
    {effect&&<>
      <Field label="Разрешённая цель расходника"><select aria-label="Разрешённая цель расходника" value={effect.targets} onChange={e=>update({targets:e.currentTarget.value as ConsumableEffect['targets']})}>
        <option value="self">Только на себя</option><option value="creature">На себя или раскрытое существо</option>
      </select></Field>
      <NumberField label="Дальность применения расходника (м)" value={effect.rangeM} onChange={rangeM=>update({rangeM})}/>
      <Check label="Для расходника нужна свободная рабочая рука" value={effect.requiresFreeHand} onChange={requiresFreeHand=>update({requiresFreeHand})}/>
      <Field label="Особое условие расходника"><textarea aria-label="Особое условие расходника" maxLength={1000} value={effect.condition} onChange={e=>update({condition:e.currentTarget.value})}/></Field>
      <div className="w6-attribute-grid">{(['mana','shadow','stamina'] as const).map(key=><NumberField key={key} label={'Восстановление: '+{mana:'Мана',shadow:'Тень',stamina:'Выносливость'}[key]} value={effect.restore[key]} onChange={amount=>update({restore:{...effect.restore,[key]:amount}})}/>)}</div>
      <p className="w6-copy">Ресурсы восстанавливаются до действующего максимума. Общий HP не изменяется.</p>
      <NumberField label="Локальное лечение одной дозой (целое HP)" value={effect.healAmount} onChange={healAmount=>update({healAmount})}/>
      <Check label="Остановить кровотечение выбранной области" value={effect.stopBleeding} onChange={stopBleeding=>update({stopBleeding})}/>
      <TagsField label="Снимаемые травмы выбранной области" value={effect.cureLabels} onChange={cureLabels=>update({cureLabels})}/>
      <p className="w6-copy">Область или внутреннюю структуру мастер выбирает при расчёте. Лечение не восстанавливает объём крови и не воскрешает.</p>
      <details><summary>Временные модификаторы расходника</summary>
        <NumberField label="Длительность эффекта расходника (с)" value={effect.duration} onChange={duration=>update({duration})}/>
        <NumberField label="Сила эффекта расходника для сравнения" value={effect.strength} onChange={strength=>update({strength})}/>
        <TextField label="Группа совместного эффекта расходника" value={effect.stackKey} max={120} onChange={stackKey=>update({stackKey})}/>
        <Field label="Повторное применение расходника"><select value={effect.stacking} onChange={e=>update({stacking:e.currentTarget.value as ConsumableEffect['stacking']})}>
          <option value="strongest">Действует сильнейший в группе</option><option value="add">Эффекты складываются</option><option value="refresh">Заменить эффект в группе и обновить срок</option>
        </select></Field>
        <ModifiersEditor value={effect.modifiers} onChange={modifiers=>update({modifiers})}/>
        <p className="w6-copy">Для модификаторов нужна положительная длительность. Пустая группа оставляет эффекты независимыми.</p>
      </details>
    </>}
  </fieldset>
}
