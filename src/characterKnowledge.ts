import { isArtwork } from './visualMedia'
// Здесь хранятся только сведения, уже доступные самому герою.
// Полной модели тайных эффектов мастера в этом модуле нет.
export const journalCategories = [
  { key: 'world', label: 'Мир' },
  { key: 'people', label: 'Люди и существа' },
  { key: 'places', label: 'Места' },
  { key: 'abilities', label: 'Способности' },
  { key: 'effects', label: 'Эффекты' },
  { key: 'other', label: 'Другое' },
] as const
export const certaintyOptions = [
  { key: 'observation', label: 'Личное наблюдение' },
  { key: 'reported', label: 'Со слов другого' },
  { key: 'hypothesis', label: 'Предположение' },
  { key: 'confirmed', label: 'Подтверждённое знание' },
] as const
export const effectKinds = [
  { key: 'unclear', label: 'Характер неизвестен' },
  { key: 'harmful', label: 'Вредоносный' },
  { key: 'helpful', label: 'Благотворный' },
  { key: 'neutral', label: 'Нейтральный' },
] as const

export type JournalCategory = (typeof journalCategories)[number]['key']
export type KnowledgeCertainty = (typeof certaintyOptions)[number]['key']
export type EffectKind = (typeof effectKinds)[number]['key']
export type JournalContent = {
  artwork?: string
  title: string
  text: string
  category: JournalCategory
  certainty: KnowledgeCertainty
  source: string
  gameTime: string
}
export type JournalEntry = JournalContent & {
  id: string
  origin: 'manual' | 'automatic'
  // У автоматической записи неизменяемое событие и отдельные заметки игрока.
  eventKey?: string
  annotation: string
  createdAt: string
  updatedAt: string
}
export type EffectObservation = {
  title: string
  description: string
  perception: 'sensed' | 'identified'
  kind: EffectKind
  source: string
  gameTime: string
  duration: string
}
export type KnownEffect = EffectObservation & {
  id: string
  status: 'active' | 'ended'
  createdAt: string
  updatedAt: string
}
export type KnowledgeState = { journal: JournalEntry[]; knownEffects: KnownEffect[] }
export type EffectEvent =
  | { type: 'record'; eventId: string; effectId: string; at: string; observation: EffectObservation }
  | { type: 'update'; eventId: string; effectId: string; at: string; observation: EffectObservation }
  | { type: 'end'; eventId: string; effectId: string; at: string; gameTime: string }
export type KnowledgeResult =
  | { ok: true; changed: boolean; state: KnowledgeState }
  | { ok: false; message: string }

export const MAX_JOURNAL_ENTRIES = 2000
export const MAX_KNOWN_EFFECTS = 200

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function textWithin(value: unknown, maximum: number, required = false): value is string {
  return typeof value === 'string' && value.length <= maximum &&
    (!required || value.trim().length > 0)
}
function isId(value: unknown): value is string {
  return textWithin(value, 160, true)
}
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value
}
export function isJournalContent(value: unknown): value is JournalContent {
  return record(value) && (value.artwork===undefined||isArtwork(value.artwork)) && textWithin(value.title, 120, true) &&
    textWithin(value.text, 8000, true) && textWithin(value.source, 200) &&
    textWithin(value.gameTime, 120) && journalCategories.some(item => item.key === value.category) &&
    certaintyOptions.some(item => item.key === value.certainty)
}
export function isJournalEntry(value: unknown): value is JournalEntry {
  if (!record(value) || !isJournalContent(value)) return false
  const entry = value as JournalEntry
  return isId(entry.id) && textWithin(entry.annotation, 4000) &&
    isTimestamp(entry.createdAt) && isTimestamp(entry.updatedAt) &&
    entry.updatedAt >= entry.createdAt &&
    ((entry.origin === 'manual' && entry.eventKey === undefined) ||
      (entry.origin === 'automatic' && isId(entry.eventKey)))
}
export function isJournal(value: unknown): value is JournalEntry[] {
  if (!Array.isArray(value) || value.length > MAX_JOURNAL_ENTRIES ||
      !value.every(isJournalEntry)) return false
  const entries: JournalEntry[] = value
  const events = entries.flatMap(entry => entry.eventKey ? [entry.eventKey] : [])
  return new Set(entries.map(entry => entry.id)).size === entries.length &&
    new Set(events).size === events.length
}
export function isEffectObservation(value: unknown): value is EffectObservation {
  return record(value) && (value.artwork===undefined||isArtwork(value.artwork)) && textWithin(value.title, 120, true) &&
    textWithin(value.description, 4000) && textWithin(value.source, 200) &&
    textWithin(value.gameTime, 120) && textWithin(value.duration, 200) &&
    (value.perception === 'sensed' || value.perception === 'identified') &&
    effectKinds.some(item => item.key === value.kind)
}
export function isKnownEffect(value: unknown): value is KnownEffect {
  if (!record(value) || !isEffectObservation(value)) return false
  const effect = value as KnownEffect
  return isId(effect.id) && (effect.status === 'active' || effect.status === 'ended') &&
    isTimestamp(effect.createdAt) && isTimestamp(effect.updatedAt) && effect.updatedAt >= effect.createdAt
}
export function isKnownEffects(value: unknown): value is KnownEffect[] {
  return Array.isArray(value) && value.length <= MAX_KNOWN_EFFECTS &&
    value.every(isKnownEffect) && new Set(value.map(item => item.id)).size === value.length
}

export function emptyJournalContent(): JournalContent {
  return { title: '', text: '', category: 'other', certainty: 'observation', source: '', gameTime: '' }
}
export function emptyObservation(): EffectObservation {
  return { title: '', description: '', perception: 'sensed', kind: 'unclear', source: '', gameTime: '', duration: '' }
}

export function filterJournal(
  entries: JournalEntry[], query: string, category: JournalCategory | '',
): JournalEntry[] {
  const needle = query.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')
  return entries.filter(entry => (!category || entry.category === category) &&
    [entry.title, entry.text, entry.source, entry.gameTime, entry.annotation].join('\n')
      .toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').includes(needle))
    .slice().reverse()
}

export function applyEffectEvent(state: KnowledgeState, event: EffectEvent): KnowledgeResult {
  if (!isJournal(state.journal) || !isKnownEffects(state.knownEffects) ||
      !isId(event.eventId) || !isId(event.effectId) || !isTimestamp(event.at)) {
    return { ok: false, message: 'Не удалось проверить сведения об эффекте.' }
  }
  // Один и тот же открытый факт не записывается повторно при повторной доставке.
  if (state.journal.some(entry => entry.eventKey === event.eventId)) {
    return { ok: true, changed: false, state }
  }
  const previous = state.knownEffects.find(effect => effect.id === event.effectId)
  if (event.type === 'record' && previous) return { ok: true, changed: false, state }
  if (event.type !== 'record' && !previous) {
    return { ok: false, message: 'Эффект не найден.' }
  }
  if (previous?.status === 'ended') {
    return event.type === 'end' ? { ok: true, changed: false, state } :
      { ok: false, message: 'Это наблюдение уже завершено. Для нового случая создай отдельное.' }
  }
  if (previous && event.at < previous.updatedAt) {
    return { ok: false, message: 'Время компьютера раньше последней записи. Проверь часы.' }
  }
  if (event.type !== 'end' && !isEffectObservation(event.observation)) {
    return { ok: false, message: 'Укажи ощущение или известное название эффекта; проверь длину полей.' }
  }
  if (event.type === 'end' && !textWithin(event.gameTime, 120)) {
    return { ok: false, message: 'Время в кампании: не более 120 символов.' }
  }
  if (event.type === 'update' && previous) {
    if (previous.perception === 'identified' && event.observation.perception === 'sensed') {
      return { ok: false, message: 'Распознанное воздействие уже известно герою.' }
    }
    const keys = Object.keys(emptyObservation()) as (keyof EffectObservation)[]
    if (keys.every(key => previous[key] === event.observation[key])) {
      return { ok: true, changed: false, state }
    }
  }
  if (state.journal.length >= MAX_JOURNAL_ENTRIES) {
    return { ok: false, message: 'Справочник заполнен. Экспортируй героя и освободи место в ручных записях.' }
  }
  if (event.type === 'record' && state.knownEffects.length >= MAX_KNOWN_EFFECTS) {
    return { ok: false, message: 'Достигнут предел в 200 наблюдений эффектов у одного героя.' }
  }
  if (state.journal.some(entry => entry.id === 'event:' + event.eventId)) {
    return { ok: false, message: 'Идентификатор записи занят. Повтори действие.' }
  }

  let nextEffect: KnownEffect
  let action: string
  if (event.type === 'end' && previous) {
    nextEffect = { ...previous, status: 'ended', updatedAt: event.at }
    action = 'Действие больше не наблюдается'
  } else if (event.type !== 'end') {
    // Перечисление полей не переносит неизвестные/скрытые свойства из события.
    const observation = event.observation
    nextEffect = {
      id: event.effectId, title: observation.title.trim(), description: observation.description.trim(),
      perception: observation.perception, kind: observation.kind, source: observation.source.trim(),
      gameTime: observation.gameTime.trim(), duration: observation.duration.trim(),
      status: 'active', createdAt: previous?.createdAt ?? event.at, updatedAt: event.at,
    }
    action = previous ? (previous.perception === 'sensed' && nextEffect.perception === 'identified'
      ? 'Воздействие распознано' : 'Сведения уточнены') :
      (nextEffect.perception === 'sensed' ? 'Замечено ощущение' : 'Записан известный эффект')
  } else {
    return { ok: false, message: 'Эффект не найден.' }
  }
  const eventText = [action + ': ' + nextEffect.title + '.', nextEffect.description,
    'Характер: ' + effectKinds.find(item => item.key === nextEffect.kind)!.label + '.',
    nextEffect.duration ? 'Известная длительность: ' + nextEffect.duration : '',
  ].filter(Boolean).join('\n')
  const entry: JournalEntry = {
    id: 'event:' + event.eventId, eventKey: event.eventId, origin: 'automatic',
    title: action, text: eventText, category: 'effects', certainty: 'observation',
    source: nextEffect.source, gameTime: event.type === 'end' ? event.gameTime.trim() : nextEffect.gameTime,
    annotation: '', createdAt: event.at, updatedAt: event.at,
  }
  if (!isJournalEntry(entry)) return { ok: false, message: 'Не удалось сформировать запись события.' }
  return {
    ok: true, changed: true,
    state: {
      journal: [...state.journal, entry],
      knownEffects: previous ? state.knownEffects.map(effect => effect.id === previous.id ? nextEffect : effect) :
        [...state.knownEffects, nextEffect],
    },
  }
}
