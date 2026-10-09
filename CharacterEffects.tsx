import { useState } from 'react'
import { effectKinds, emptyObservation, isEffectObservation } from './characterKnowledge'
import type { EffectEvent, EffectKind, EffectObservation, KnownEffect } from './characterKnowledge'

type Props = {
  characterId: string
  query?: string
  effects: KnownEffect[]
  onEvent: (event: EffectEvent) => { ok: boolean; message: string }
}

export default function CharacterEffects({ characterId, effects, onEvent, query = '' }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [observation, setObservation] = useState<EffectObservation>(emptyObservation)
  const [endGameTime, setEndGameTime] = useState('')
  const [showEnded, setShowEnded] = useState(false)
  const [message, setMessage] = useState('')
  const prefix = 'effects-' + characterId + '-'
  const editing = effects.find(effect => effect.id === editingId)
  const active = effects.filter(effect => effect.status === 'active')
  const needle = query.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')
  const visible = effects.filter(effect => (showEnded || effect.status === 'active') &&
    [effect.title, effect.description, effect.source, effect.duration, effect.gameTime].join(' ').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').includes(needle)).slice().reverse()

  function openForm(effect: KnownEffect | null) {
    setEditingId(effect?.id ?? null)
    setObservation(effect ? {
      title: effect.title, description: effect.description, perception: effect.perception,
      kind: effect.kind, source: effect.source, duration: effect.duration, gameTime: effect.gameTime,
    } : emptyObservation())
    setMessage('')
    setFormOpen(true)
  }

  function recordObservation() {
    if (!isEffectObservation(observation)) {
      setMessage('Укажи ощущение или известное название. Проверь длину полей.')
      return
    }
    const result = onEvent({
      type: editingId ? 'update' : 'record', eventId: crypto.randomUUID(),
      effectId: editingId ?? crypto.randomUUID(), at: new Date().toISOString(), observation,
    })
    setMessage(result.message)
    if (result.ok) setFormOpen(false)
  }

  function endObservation(effect: KnownEffect) {
    const result = onEvent({
      type: 'end', eventId: crypto.randomUUID(), effectId: effect.id,
      at: new Date().toISOString(), gameTime: endGameTime,
    })
    setMessage(result.message)
    if (result.ok && editingId === effect.id) setFormOpen(false)
  }

  return (
    <section>
      <h3>Известные эффекты</h3>
      <p className="w6-copy">Записывай ощущения и сведения, которые мастер сообщил герою.
        Пока известна только слабость — так и назови наблюдение. После распознавания уточни название.</p>
      <button className="w6-button" type="button" onClick={() => openForm(null)}>Записать наблюдение</button>
      {formOpen && <form className="w6-fieldset w6-form" onSubmit={event => {
        event.preventDefault()
        recordObservation()
      }}>
        <h4>{editingId ? 'Уточнить сведения' : 'Новое наблюдение'}</h4>
        <div className="w6-attribute-grid">
          <label className="w6-field" htmlFor={prefix + 'perception'}>
            <span>Что доступно герою</span>
            <select id={prefix + 'perception'} value={observation.perception}
              onChange={event => setObservation({ ...observation, perception: event.currentTarget.value as EffectObservation['perception'] })}>
              <option value="sensed" disabled={editing?.perception === 'identified'}>Ощущение; причина не распознана</option>
              <option value="identified">Природа воздействия известна</option>
            </select>
          </label>
          <label className="w6-field" htmlFor={prefix + 'kind'}>
            <span>Известный характер воздействия</span>
            <select id={prefix + 'kind'} value={observation.kind}
              onChange={event => setObservation({ ...observation, kind: event.currentTarget.value as EffectKind })}>
              {effectKinds.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <label className="w6-field" htmlFor={prefix + 'title'}>
          <span>{observation.perception === 'sensed' ? 'Какое ощущение' : 'Известное название'}</span>
          <input id={prefix + 'title'} required maxLength={120} value={observation.title}
            placeholder={observation.perception === 'sensed' ? 'Например: слабость и озноб' : 'Например: отравление'}
            onChange={event => setObservation({ ...observation, title: event.currentTarget.value })} />
        </label>
        <label className="w6-field" htmlFor={prefix + 'description'}>
          <span>Доступные подробности</span>
          <textarea id={prefix + 'description'} rows={4} maxLength={4000} value={observation.description}
            onChange={event => setObservation({ ...observation, description: event.currentTarget.value })} />
        </label>
        <label className="w6-field" htmlFor={prefix + 'source'}>
          <span>Откуда герой узнал</span>
          <input id={prefix + 'source'} maxLength={200} value={observation.source} placeholder="Например: осмотр лекаря"
            onChange={event => setObservation({ ...observation, source: event.currentTarget.value })} />
        </label>
        <div className="w6-attribute-grid">
          <label className="w6-field" htmlFor={prefix + 'time'}>
            <span>Когда в кампании</span>
            <input id={prefix + 'time'} maxLength={120} value={observation.gameTime}
              onChange={event => setObservation({ ...observation, gameTime: event.currentTarget.value })} />
          </label>
          <label className="w6-field" htmlFor={prefix + 'duration'}>
            <span>Длительность, если известна</span>
            <input id={prefix + 'duration'} maxLength={200} value={observation.duration} placeholder="Неизвестно"
              onChange={event => setObservation({ ...observation, duration: event.currentTarget.value })} />
          </label>
        </div>
        <div className="w6-buttons">
          <button className="w6-button w6-primary" type="submit">Добавить сведения в лист</button>
          <button className="w6-button" type="button" onClick={() => setFormOpen(false)}>Отмена</button>
        </div>
      </form>}
      <p className="w6-notice" role="status">{message}</p>
      <p className="w6-copy">Наблюдается сейчас: {active.length} · Всего случаев: {effects.length}</p>
      <label className="w6-check"><input type="checkbox" checked={showEnded}
        onChange={event => setShowEnded(event.currentTarget.checked)} />Показать завершённые наблюдения</label>
      {active.length > 0 && <label className="w6-field w6-spaced" htmlFor={prefix + 'end-time'}>
        <span>Время в кампании для завершения наблюдения</span>
        <input id={prefix + 'end-time'} maxLength={120} value={endGameTime} placeholder="Необязательно"
          onChange={event => setEndGameTime(event.currentTarget.value)} />
      </label>}
      <div className="w6-entry-list">
        {visible.map(effect => <article className="w6-entry" key={effect.id}>
          <div className="w6-entry-heading"><h4>{effect.title}</h4>
            <span className="w6-tag">{effect.status === 'ended' ? 'Больше не наблюдается' :
              effect.perception === 'sensed' ? 'Причина не распознана' : 'Распознан'}</span></div>
          <p className="w6-copy">{effectKinds.find(item => item.key === effect.kind)?.label}</p>
          {effect.description && <p className="w6-prose">{effect.description}</p>}
          {effect.source && <p className="w6-copy">Источник сведений: {effect.source}</p>}
          {effect.duration && <p className="w6-copy">Известная длительность: {effect.duration}</p>}
          {effect.gameTime && <p className="w6-copy">Когда замечено / уточнено: {effect.gameTime}</p>}
          {effect.status === 'active' && <div className="w6-buttons">
            <button className="w6-button" type="button" aria-label={'Уточнить сведения: ' + effect.title}
              onClick={() => openForm(effect)}>Уточнить сведения</button>
            <button className="w6-button" type="button" aria-label={'Завершить наблюдение: ' + effect.title}
              onClick={() => endObservation(effect)}>Больше не наблюдается</button>
          </div>}
        </article>)}
      </div>
      {visible.length === 0 && <p className="w6-copy">Известных наблюдений в этом списке пока нет.</p>}
      <p className="w6-copy">Каждое изменение создаёт запись в справочнике. Завершение сохраняет историю.
        Это учёт известных наблюдений; изменение ресурсов и лечение пока выполняются отдельно.</p>
    </section>
  )
}
