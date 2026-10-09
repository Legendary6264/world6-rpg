import { evaluatedParameters } from './rpgParameters'
import { attributeCap, effectiveAttribute } from './creationRules'
import { attributeFields, isValidAttribute, isValidResource, resourceFields } from './characterModel'
import type { AttributeKey, ReadyCharacterDraft, ResourceKey } from './characterModel'
import { isValidStatistic, statisticError, statisticFields } from './characterStatistics'
import type { StatisticKey } from './characterStatistics'

type CharacterSheetProps = {
  characterId: string
  draft: ReadyCharacterDraft
  onNameChange: (value: string) => void
  onAttributeChange: (key: AttributeKey, value: string) => void
  onMaximumChange: (key: ResourceKey, value: string) => void
  onStatisticChange: (key: StatisticKey, value: string) => void
}

function CharacterSheet({
  characterId, draft, onNameChange, onAttributeChange, onMaximumChange, onStatisticChange,
}: CharacterSheetProps) {
  let calculated:ReturnType<typeof evaluatedParameters>|undefined
  try{calculated=evaluatedParameters(draft,0)}catch{ /* Незавершённые значения редактируются без потери листа. */ }
  const isNameValid = draft.name.trim().length > 0 && draft.name.length <= 40
  const nameErrorId = 'name-error-' + characterId

  return (
    <section>
      <h3>Основа персонажа</h3>
      <label className="w6-field" htmlFor={'character-name-' + characterId}>
        <span>Имя персонажа</span>
        <input id={'character-name-' + characterId} type="text" maxLength={40}
          value={draft.name} placeholder="Введи имя" aria-invalid={!isNameValid}
          aria-describedby={!isNameValid ? nameErrorId : undefined}
          onChange={event => onNameChange(event.currentTarget.value)} />
        {!isNameValid && <small id={nameErrorId} className="w6-error">
          Укажи имя: от 1 до 40 символов.
        </small>}
      </label>

      <fieldset className="w6-fieldset">
        <legend>24 базовых атрибута</legend><p className="w6-copy">Четыре группы: тело, восприятие, разум и энергия. Итог включает рост ранга, тренировки и специализацию.</p>
        <div className="w6-attribute-grid">
          {attributeFields.map(field => {
            const value = draft.attributes[field.key]
            const valid = isValidAttribute(value)
            const inputId = 'attribute-' + characterId + '-' + field.key
            const errorId = inputId + '-error'
            return (
              <label className="w6-field" key={field.key} htmlFor={inputId}>
                <span><small>{field.group} · </small>{field.label}</span>
                <input id={inputId} type="number" min={0} max={attributeCap(draft.profile)} step={1} value={value}
                  aria-invalid={!valid} aria-describedby={!valid ? errorId : undefined}
                  onChange={event => onAttributeChange(field.key, event.currentTarget.value)} />
                <small className={effectiveAttribute(draft,field.key)>attributeCap(draft.profile)?'w6-error':'w6-copy'}>Итог {effectiveAttribute(draft,field.key)} / предел {attributeCap(draft.profile)}</small>
                {!valid && <small id={errorId} className="w6-error">
                  Введи целое неотрицательное число.
                </small>}
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="w6-fieldset">
        <legend>Производные характеристики</legend>
        <p className="w6-copy">Значения по формулам обновляются автоматически. Для индивидуального правила открой «Формулы». Старые ручные значения сохраняются. Расчётные параметры зависят от атрибутов, экипировки и эффектов.</p>
        <div className="w6-attribute-grid">
          {statisticFields.map(field => {
            const value = draft.statistics[field.key]
            const valid = isValidStatistic(field.key, value)
            const inputId = 'statistic-' + characterId + '-' + field.key
            const errorId = inputId + '-error'
            return (
              <label className="w6-field" key={field.key} htmlFor={inputId}>
                <span>{field.label} ({field.unit})</span>
                <input id={inputId} type="text" inputMode="decimal"
                  value={draft.rpg.formulas.some(f=>f.parameter===field.key&&f.mode!=='manual')?calculated?.[field.key]??value:value} disabled={draft.rpg.formulas.some(f=>f.parameter===field.key&&f.mode!=='manual')} placeholder="Не задано" aria-invalid={!valid}
                  aria-describedby={!valid ? errorId : undefined}
                  onChange={event => onStatisticChange(field.key, event.currentTarget.value)} />
                {!valid && <small id={errorId} className="w6-error">
                  {statisticError(field.key)}
                </small>}
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="w6-fieldset">
        <legend>Максимальные ресурсы</legend>
        <p className="w6-copy">Текущие значения изменяются в игровом листе.</p>
        <div className="w6-resource-grid">
          {resourceFields.filter(f=>f.key!=='health'&&(f.key==='stamina'||f.key===(draft.profile.energy??'mana'))).map(field => {
            const resource = draft.resources[field.key]
            const valid = isValidResource({current:'0',maximum:resource.maximum})
            const inputId = 'maximum-' + characterId + '-' + field.key
            const errorId = inputId + '-error'
            return (
              <section className="w6-resource-card" key={field.key}>
                <h4>{field.label}</h4>
                <label className="w6-field" htmlFor={inputId}>
                  <span>Максимум</span>
                  <input id={inputId} type="number" min={0} step="any"
                    value={calculated?.[('maximum'+field.key[0].toUpperCase()+field.key.slice(1)) as keyof typeof calculated]??resource.maximum} disabled={draft.rpg.formulas.some(f=>f.parameter===('maximum'+field.key[0].toUpperCase()+field.key.slice(1))&&f.mode!=='manual')} aria-invalid={!valid}
                    aria-describedby={!valid ? errorId : undefined}
                    onChange={event => onMaximumChange(field.key, event.currentTarget.value)} />
                </label>
                <p className="w6-copy">Текущее: {resource.current || '—'}</p>
                {!valid && <p id={errorId} className="w6-error">
                  Ручной максимум — неотрицательное число. Действующий максимум с формулами показан в игровом листе. Если он ниже текущего
                  запаса, исправь запас в игровом листе или увеличь максимум.
                </p>}
              </section>
            )
          })}
        </div>
      </fieldset>
    </section>
  )
}

export default CharacterSheet
