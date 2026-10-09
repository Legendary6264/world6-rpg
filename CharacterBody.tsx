import { useState } from 'react'
import { bodyRegions, bodyConsequences, partCondition, conditionLabels, isBodyPart } from './characterBody'
import type { BodyAction, BodyPart, BodyRegion, BodyState } from './characterBody'

type Props = {
  body: BodyState; characterId: string; editor?: boolean
  onPart: (key: BodyRegion, part: BodyPart) => void
  onAction: (action: BodyAction, gameTime: string) => { ok: boolean; message: string }
}
export default function CharacterBody({ body, characterId, editor = false, onPart, onAction }: Props) {
  const [selected, setSelected] = useState<BodyRegion>('torso')
  const [local, setLocal] = useState('0'), [systemic, setSystemic] = useState('0')
  const [bleeding, setBleeding] = useState('0'), [wound, setWound] = useState('')
  const [heal, setHeal] = useState('0'), [stop, setStop] = useState(true)
  const [gameTime, setGameTime] = useState(''), [message, setMessage] = useState('')
  const [configuration, setConfiguration] = useState<BodyPart | null>(null)
  const [configKey, setConfigKey] = useState<BodyRegion | null>(null)
  const [historyCount, setHistoryCount] = useState(20)
  const c = bodyConsequences(body), part = body.parts[selected]
  const prefix = (editor ? 'body-editor-' : 'body-play-') + characterId + '-'
  function act(action: BodyAction) { const result = onAction(action, gameTime); setMessage(result.message) }
  function numberField(label: string, value: string, change: (v: string) => void, key: string) {
    return <label className="w6-field" htmlFor={prefix + key}><span>{label}</span>
      <input id={prefix + key} type="number" min={0} step={1} value={value} required
        onChange={e => change(e.currentTarget.value)} /></label>
  }
  function commitConfiguration() {
    if (!configuration || !configKey || !isBodyPart(configuration)) { setMessage('Проверь значения: целые числа от нуля; текущее не выше максимума, штрафы до 100%.'); return }
    onPart(configKey, configuration); setConfiguration(null); setMessage('Настройки области применены. Сохрани персонажа.')
  }
  const amount = (v: string) => v.trim() ? Number(v) : NaN
  return <section className="w6-body">
    <h3>{editor ? 'Устройство и правила тела' : 'Тело и ранения'}</h3>
    <p className="w6-copy">{editor ? 'Задай максимумы областей тела и штрафы скорости для своей кампании. 0 / 0 означает «не настроено». Общий запас здоровья задаётся отдельно.' : 'Выбери поражённую область. Вводится урон после защиты; общий урон и кровотечение учитываются отдельно.'}</p>
    <div className="w6-body-grid" aria-label="Состояние областей тела">
      {bodyRegions.map(r => { const p = body.parts[r.key], state = partCondition(p); return <button key={r.key} type="button"
        className={'w6-body-part w6-condition-' + state + (selected === r.key ? ' w6-body-selected' : '')}
        aria-pressed={selected === r.key} onClick={() => { setSelected(r.key); setConfiguration(null); setMessage('') }}>
        <strong>{r.label}</strong><span>{conditionLabels[state]}</span><span>{p.present ? p.current + ' / ' + p.maximum : '—'}</span>
        {p.present && p.maximum > 0 && <progress value={p.current} max={p.maximum} aria-label={'Здоровье: ' + r.label} />}
        {p.bleeding > 0 && <span className="w6-error">Кровотечение: {p.bleeding} HP/шаг</span>}
      </button> })}
    </div>
    <h4>{bodyRegions.find(r => r.key === selected)!.label}</h4>
    {part.wound && <p className="w6-prose">{part.wound}</p>}
    {editor ? <>
      <button className="w6-button" type="button" onClick={() => { setConfigKey(selected); setConfiguration({ ...part }) }}>Настроить область</button>
      {configuration && <form className="w6-fieldset w6-form" onSubmit={e => { e.preventDefault(); commitConfiguration() }}>
        <h4>Настройка: {bodyRegions.find(r => r.key === configKey)!.label}</h4>
        <label className="w6-check"><input type="checkbox" checked={configuration.present} onChange={e => setConfiguration({ ...configuration, present: e.currentTarget.checked, ...(!e.currentTarget.checked ? { current: 0, bleeding: 0 } : {}) })} />Область присутствует</label>
        <div className="w6-attribute-grid">
          {(['maximum', 'current', 'damagedSlowdown', 'disabledSlowdown'] as const).map(key => <label className="w6-field" key={key} htmlFor={prefix + 'config-' + key}>
            <span>{{ maximum: 'Максимум локального здоровья', current: 'Текущее локальное здоровье', damagedSlowdown: 'Потеря скорости при повреждении (%)', disabledSlowdown: 'Потеря скорости при недееспособности (%)' }[key]}</span>
            <input id={prefix + 'config-' + key} type="number" min={0} step={1} max={key.includes('Slowdown') ? 100 : undefined} required
              disabled={!configuration.present && key === 'current'} value={Number.isNaN(configuration[key]) ? '' : configuration[key]}
              onChange={e => setConfiguration({ ...configuration, [key]: e.currentTarget.value === '' ? NaN : Number(e.currentTarget.value) })} />
          </label>)}
        </div>
        <p className="w6-copy">Штрафы применяются к ногам и стопам. Для одной стороны берётся больший штраф, для двух сторон они складываются до 100%. Численные значения задаёт мастер.</p>
        <div className="w6-buttons"><button className="w6-button w6-primary" type="submit">Применить настройки</button>
          <button className="w6-button" type="button" onClick={() => setConfiguration(null)}>Отмена</button></div>
      </form>}
    </> : <>
      <label className="w6-field" htmlFor={prefix + 'time'}><span>Когда в кампании</span><input id={prefix + 'time'} maxLength={120} value={gameTime} onChange={e => setGameTime(e.currentTarget.value)} /></label>
      <div className="w6-body-actions">
        <form className="w6-fieldset w6-form" onSubmit={e => { e.preventDefault(); act({ type: 'damage', region: selected, localDamage: amount(local), systemicDamage: amount(systemic), bleeding: amount(bleeding), wound }) }}>
          <h4>Учесть попадание</h4>
          {numberField('Локальный урон', local, setLocal, 'local')}
          {numberField('Отдельный урон общему здоровью', systemic, setSystemic, 'systemic')}
          {numberField('Кровотечение этой области (HP/шаг)', bleeding, setBleeding, 'bleeding')}
          <label className="w6-field" htmlFor={prefix + 'wound'}><span>Описание раны</span><textarea id={prefix + 'wound'} value={wound} rows={3} maxLength={2000} onChange={e => setWound(e.currentTarget.value)} /></label>
          <p className="w6-copy">Новый удар не останавливает старое кровотечение. Указанная скорость повышает его, если она больше текущей.</p>
          <button className="w6-button w6-danger" disabled={!part.present || !part.maximum} type="submit">Применить попадание</button>
        </form>
        <form className="w6-fieldset w6-form" onSubmit={e => { e.preventDefault(); act({ type: 'heal', region: selected, amount: amount(heal), stopBleeding: stop }) }}>
          <h4>Лечение области</h4>
          {numberField('Восстановить локальное здоровье', heal, setHeal, 'heal')}
          <label className="w6-check"><input type="checkbox" checked={stop} onChange={e => setStop(e.currentTarget.checked)} />Остановить кровотечение этой области</label>
          <p className="w6-copy">Общее здоровье восстанавливается отдельно в ресурсах. При полном восстановлении и остановленном кровотечении описание раны очищается; история остаётся.</p>
          <button className="w6-button w6-restore" disabled={!part.present || !part.maximum} type="submit">Применить лечение</button>
        </form>
      </div>
      <div className="w6-entry">
        <h4>Функциональное состояние</h4>
        <dl className="w6-stat-list">
          <div><dt>Сознание</dt><dd>{body.consciousness === 'awake' ? 'В сознании' : 'Без сознания'}</dd></div>
          <div><dt>Левая / правая рука</dt><dd>{c.leftHand ? 'Доступна' : 'Недоступна'} / {c.rightHand ? 'Доступна' : 'Недоступна'}</dd></div>
          <div><dt>Действия двумя руками</dt><dd>{c.twoHands ? 'Доступны' : 'Недоступны'}</dd></div>
          <div><dt>Спринт</dt><dd>{c.canSprint ? 'Доступен' : 'Недоступен'}</dd></div>
        </dl>
        {c.notices.length > 0 && <ul>{c.notices.map(t => <li key={t}>{t}</li>)}</ul>}
        <p className="w6-copy">Кровотечение суммарно: {c.bleeding} HP за один явно учтённый шаг. Шаг не запускается по часам и не продвигает другие эффекты.</p>
        <div className="w6-buttons"><button className="w6-button w6-danger" type="button" disabled={!c.bleeding} onClick={() => act({ type: 'step' })}>Учесть один шаг кровотечения</button>
          <button className="w6-button" type="button" onClick={() => act({ type: 'consciousness', value: body.consciousness === 'awake' ? 'unconscious' : 'awake' })}>{body.consciousness === 'awake' ? 'Установить потерю сознания' : 'Восстановить сознание'}</button></div>
      </div>
      <details className="w6-fieldset"><summary>История ранений и лечения ({body.history.length})</summary>
        {!body.history.length && <p className="w6-copy">Пока нет событий.</p>}
        {body.history.slice().reverse().slice(0, historyCount).map(e => <article className="w6-entry" key={e.id}><p className="w6-prose">{e.text}</p><p className="w6-copy">{e.gameTime || 'Время в кампании не указано'} · {new Date(e.at).toLocaleString('ru-RU')}</p></article>)}
        {body.history.length > historyCount && <button className="w6-button" type="button" onClick={() => setHistoryCount(v => v + 20)}>Показать ещё</button>}
        <p className="w6-copy">Сохраняются последние 200 событий.</p>
      </details>
    </>}
    <p className="w6-notice" role="status">{message}</p>
  </section>
}
