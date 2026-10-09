import { effectiveBodySpeed } from './characterBody'
import { useState } from 'react'
import {
  attributeFields, isValidAmount, isValidAttribute, isValidResource, resourceFields,
} from './characterModel'
import { calculateDistance, getStatisticDisplay, parseDecimalNumber } from './characterStatistics'
import type {
  ReadyCharacterDraft, ResourceActionResult, ResourceDirection, ResourceKey,
} from './characterModel'

type CharacterPlaySheetProps = {
  characterId: string
  draft: ReadyCharacterDraft
  onCurrentChange: (key: ResourceKey, value: string) => void
  onResourceAction: (key: ResourceKey, amount: string, direction: ResourceDirection) => ResourceActionResult
}

type ActionMessage = { text: string; current: string; maximum: string }

function CharacterPlaySheet({
  characterId, draft, onCurrentChange, onResourceAction,
}: CharacterPlaySheetProps) {
  const [amounts, setAmounts] = useState<Record<ResourceKey, string>>({
    health: '1', mana: '1', shadow: '1', stamina: '1',
  })
  const [messages, setMessages] = useState<Record<ResourceKey, ActionMessage | undefined>>({
    health: undefined, mana: undefined, shadow: undefined, stamina: undefined,
  })
  const [movementSeconds, setMovementSeconds] = useState('1')
  const movementDistance = calculateDistance('movement', effectiveBodySpeed(draft.body, draft.statistics.movement), movementSeconds)
  const sprintDistance = calculateDistance('sprint', effectiveBodySpeed(draft.body, draft.statistics.sprint, true), movementSeconds)
  const movementTime = parseDecimalNumber(movementSeconds)
  const isTimeValid = movementSeconds.trim() !== '' &&
    Number.isFinite(movementTime) && movementTime >= 0 &&
    movementTime <= Number.MAX_SAFE_INTEGER

  function clearMessage(key: ResourceKey) {
    setMessages(previous => ({ ...previous, [key]: undefined }))
  }

  function applyAction(key: ResourceKey, direction: ResourceDirection) {
    const result = onResourceAction(key, amounts[key], direction)
    const resource = result.ok ? result.resource : draft.resources[key]
    setMessages(previous => ({
      ...previous,
      [key]: { text: result.message, current: resource.current, maximum: resource.maximum },
    }))
  }

  return (
    <section>
      <h3>Текущее состояние</h3>
      <p className="w6-copy">Максимумы задаются в редакторе. Здесь можно изменить
        текущий запас и учесть расход или восстановление. Состояние тела показано через ощущения и доступные диагнозы.</p>
      <div className="w6-resource-grid">
        {resourceFields.filter(f=>f.key!=='health'&&(f.key==='stamina'||f.key===(draft.profile.energy??'mana'))).map(field => {
          const resource = draft.resources[field.key]
          const valid = isValidResource(resource)
          const amountValid = isValidAmount(amounts[field.key])
          const currentId = 'current-' + characterId + '-' + field.key
          const resourceErrorId = currentId + '-error'
          const amountId = 'amount-' + characterId + '-' + field.key
          const amountErrorId = amountId + '-error'
          const message = messages[field.key]
          const visibleMessage = message && message.current === resource.current &&
            message.maximum === resource.maximum ? message.text : ''

          return (
            <section className="w6-resource-card" key={field.key}>
              <h4>{field.label}</h4>
              <p className="w6-resource-total">{resource.current || '—'} / {resource.maximum || '—'}</p>
              <label className="w6-field" htmlFor={currentId}>
                <span>Текущее значение</span>
                <input id={currentId} type="number" min={0} step="any"
                  value={resource.current} aria-invalid={!valid}
                  aria-describedby={!valid ? resourceErrorId : undefined}
                  onChange={event => {
                    onCurrentChange(field.key, event.currentTarget.value)
                    clearMessage(field.key)
                  }} />
              </label>
              {!valid && <p id={resourceErrorId} className="w6-error">
                Нужны неотрицательные значения. Запас не должен превышать
                максимум; максимум можно исправить в редакторе.
              </p>}
              <div className="w6-resource-actions">
                <label className="w6-field" htmlFor={amountId}>
                  <span>Количество</span>
                  <input id={amountId} type="number" min={1} step="any"
                    value={amounts[field.key]} aria-invalid={!amountValid}
                    aria-describedby={!amountValid ? amountErrorId : undefined}
                    onChange={event => {
                      const value = event.currentTarget.value
                      setAmounts(previous => ({ ...previous, [field.key]: value }))
                      clearMessage(field.key)
                    }} />
                </label>
                {!amountValid && <p id={amountErrorId} className="w6-error">
                  Введи положительное количество.
                </p>}
                <div className="w6-buttons">
                  <button type="button" className="w6-button w6-danger"
                    disabled={!valid || !amountValid}
                    onClick={() => applyAction(field.key, 'decrease')}>
                    Потратить
                  </button>
                  <button type="button" className="w6-button w6-restore"
                    disabled={!valid || !amountValid}
                    onClick={() => applyAction(field.key, 'increase')}>
                    Восстановить
                  </button>
                </div>
                <p className="w6-notice" role="status">{visibleMessage}</p>
              </div>
            </section>
          )
        })}
      </div>

      <div className="w6-attribute-summary">
        <h3>Параметры персонажа</h3>
        <dl className="w6-stat-list">
          {getStatisticDisplay(draft.statistics, draft.resources.health.maximum,
            draft.resources.stamina.maximum).map(statistic => (
            <div key={statistic.key}>
              <dt>{statistic.label}</dt>
              <dd>{statistic.text}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="w6-attribute-summary">
        <h3>Дистанция при постоянной скорости</h3>
        <p className="w6-copy">Оценка для движения с заданной скоростью по свободному участку.
          Дистанция = скорость × время; здесь учитываются ограничения тела.</p>
        <label className="w6-field" htmlFor={'movement-time-' + characterId}>
          <span>Время (с)</span>
          <input id={'movement-time-' + characterId} type="text" inputMode="decimal"
            value={movementSeconds} aria-invalid={!isTimeValid}
            aria-describedby={!isTimeValid ? 'movement-time-error-' + characterId : undefined}
            onChange={event => setMovementSeconds(event.currentTarget.value)} />
          {!isTimeValid && <small className="w6-error" id={'movement-time-error-' + characterId}>
            Введи неотрицательное время в секундах.
          </small>}
        </label>
        <dl className="w6-stat-list">
          <div><dt>Движение</dt><dd>{movementDistance.ok
            ? new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 8 }).format(movementDistance.metres) + ' м'
            : movementDistance.message}</dd></div>
          <div><dt>Спринт</dt><dd>{sprintDistance.ok
            ? new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 8 }).format(sprintDistance.metres) + ' м'
            : sprintDistance.message}</dd></div>
        </dl>
      </div>

      <div className="w6-attribute-summary">
        <h3>Основные атрибуты</h3>
        <dl className="w6-stat-list">
          {attributeFields.map(field => (
            <div key={field.key}>
              <dt>{field.label}</dt>
              <dd>{isValidAttribute(draft.attributes[field.key])
                ? Number(draft.attributes[field.key]) : '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

export default CharacterPlaySheet
