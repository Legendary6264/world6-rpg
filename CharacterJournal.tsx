import { ArtworkPicker, Illustration } from './VisualElements'
import type { ArtworkKey } from './visualMedia'
import type { MechanicalEffect } from './rpgTypes'
import CharacterEffects from './CharacterEffects'
import type { EffectEvent, KnownEffect } from './characterKnowledge'
import { useState } from 'react'
import {
  certaintyOptions, emptyJournalContent, filterJournal, isJournalEntry,
  journalCategories, MAX_JOURNAL_ENTRIES,
} from './characterKnowledge'
import type {
  JournalCategory, JournalContent, JournalEntry, KnowledgeCertainty,
} from './characterKnowledge'

type Props = { mechanicalEffects:MechanicalEffect[]; seconds:number; onRemoveMechanical:(id:string)=>{ok:boolean;message:string};  characterId: string; entries: JournalEntry[]; onChange: (entries: JournalEntry[]) => void; effects: KnownEffect[]; onEffectEvent: (event: EffectEvent) => { ok: boolean; message: string } }

export default function CharacterJournal({ characterId, entries, onChange, effects, onEffectEvent, mechanicalEffects, seconds, onRemoveMechanical }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<JournalCategory | ''>('')
  const [visibleCount, setVisibleCount] = useState(50)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<JournalEntry | null>(null)
  const [content, setContent] = useState<JournalContent>(emptyJournalContent)
  const [annotation, setAnnotation] = useState('')
  const [message, setMessage] = useState('')
  const automatic = editing?.origin === 'automatic'
  const found = filterJournal(entries, query, category)
  const prefix = 'journal-' + characterId + '-'

  function openForm(entry: JournalEntry | null) {
    setEditing(entry)
    setContent(entry ? {
      artwork:entry.artwork,title: entry.title, text: entry.text, category: entry.category,
      certainty: entry.certainty, source: entry.source, gameTime: entry.gameTime,
    } : emptyJournalContent())
    setAnnotation(entry?.annotation ?? '')
    setFormOpen(true)
    setMessage('')
  }

  function commitEntry() {
    const at = new Date(Math.max(Date.now(), Date.parse(editing?.updatedAt ?? '') || 0)).toISOString()
    const base: JournalEntry = editing ?? {
      ...emptyJournalContent(), id: crypto.randomUUID(), origin: 'manual',
      annotation: '', createdAt: at, updatedAt: at,
    }
    const next: JournalEntry = automatic ? { ...base, annotation: annotation.trim(), updatedAt: at } : {
      ...base, ...content, title: content.title.trim(), text: content.text.trim(),
      source: content.source.trim(), gameTime: content.gameTime.trim(),
      annotation: annotation.trim(), updatedAt: at,
    }
    if (!isJournalEntry(next)) {
      setMessage('Заполни заголовок и текст. Проверь длину полей.')
      return
    }
    if (!editing && entries.length >= MAX_JOURNAL_ENTRIES) {
      setMessage('Справочник заполнен. Экспортируй героя и освободи место в ручных записях.')
      return
    }
    if (editing && !entries.some(entry => entry.id === editing.id)) {
      setMessage('Запись не найдена. Открой её заново.')
      return
    }
    onChange(editing ? entries.map(entry => entry.id === editing.id ? next : entry) : [...entries, next])
    if (!editing) { setQuery(''); setCategory(''); setVisibleCount(50) }
    setFormOpen(false)
    setMessage('Запись добавлена в лист. Нажми «Сохранить персонажа» внизу страницы.')
  }

  function removeEntry(entry: JournalEntry) {
    if (entry.origin !== 'manual') return
    if (!window.confirm('Удалить запись «' + entry.title + '»?')) return
    onChange(entries.filter(item => item.id !== entry.id))
    if (editing?.id === entry.id) setFormOpen(false)
    setMessage('Запись удалена из листа. Сохрани персонажа.')
  }

  return (
    <section>
      <h3>Личный справочник</h3><div className="w6-category-gallery"><figure><Illustration fallback="banner"/><figcaption>Мир и места</figcaption></figure><figure><Illustration fallback="portrait-elf"/><figcaption>Люди и существа</figcaption></figure><figure><Illustration fallback="artifact"/><figcaption>Способности и эффекты</figcaption></figure></div>
      <p className="w6-copy">Записывай то, что узнал именно этот герой.
        Слухи и предположения можно помечать отдельно. Наблюдения эффектов добавляются автоматически.</p>
      <nav className="w6-modes" aria-label="Категории справочника">
        <button type="button" className={'w6-button' + (!category ? ' w6-active' : '')} aria-pressed={!category} onClick={() => { setCategory(''); setVisibleCount(50) }}>Все категории</button>
        {journalCategories.map(item => <button type="button" key={item.key} className={'w6-button' + (category === item.key ? ' w6-active' : '')} aria-pressed={category === item.key} onClick={() => { setCategory(item.key); setVisibleCount(50) }}>{item.label}</button>)}
      </nav>
      <div hidden={category !== 'effects'}>
        <CharacterEffects characterId={characterId} effects={effects} onEvent={onEffectEvent} query={query} />
        <h3>Действующие механические эффекты</h3>
        {mechanicalEffects.map(e=><article className="w6-entry" key={e.id}><h4>{e.name}</h4><p>{e.expiresAt===null?'До снятия':'Осталось '+Math.max(0,e.expiresAt-seconds)+' с'} · Сила {e.strength}</p><p>Восстановление крови {e.bloodMlPerSecond} мл/с; замещение {e.substituteMl} мл.</p><button className="w6-button" type="button" onClick={()=>setMessage(onRemoveMechanical(e.id).message)}>Снять по решению мастера</button></article>)}
        <h3>Записи и история эффектов</h3>
      </div>
      <div className="w6-attribute-grid">
        <label className="w6-field" htmlFor={prefix + 'search'}>
          <span>Поиск в записях</span>
          <input id={prefix + 'search'} type="search" value={query}
            onChange={event => { setQuery(event.currentTarget.value); setVisibleCount(50) }} />
        </label>
        <label className="w6-field" htmlFor={prefix + 'filter'}>
          <span>Категория</span>
          <select id={prefix + 'filter'} value={category}
            onChange={event => { setCategory(event.currentTarget.value as JournalCategory | ''); setVisibleCount(50) }}>
            <option value="">Все категории</option>
            {journalCategories.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <button className="w6-button w6-spaced" type="button" onClick={() => openForm(null)}>
        Новая запись
      </button>

      {formOpen && <form className="w6-fieldset w6-form" onSubmit={event => {
        event.preventDefault()
        commitEntry()
      }}>
        <h4>{automatic ? 'Дополнить наблюдение' : editing ? 'Изменить запись' : 'Новая запись'}</h4>
        {!automatic && <><ArtworkPicker label="Иллюстрация записи" value={content.artwork} presets={['banner','portrait-traveler','portrait-mage','portrait-elf','weapons','armor','artifact','supplies']} onChange={artwork=>setContent({...content,artwork})}/>
          <label className="w6-field" htmlFor={prefix + 'title'}>
            <span>Заголовок</span>
            <input id={prefix + 'title'} required maxLength={120} value={content.title}
              onChange={event => setContent({ ...content, title: event.currentTarget.value })} />
          </label>
          <label className="w6-field" htmlFor={prefix + 'text'}>
            <span>Что герой узнал</span>
            <textarea id={prefix + 'text'} required rows={5} maxLength={8000} value={content.text}
              onChange={event => setContent({ ...content, text: event.currentTarget.value })} />
          </label>
          <div className="w6-attribute-grid">
            <label className="w6-field" htmlFor={prefix + 'category'}>
              <span>Категория записи</span>
              <select id={prefix + 'category'} value={content.category}
                onChange={event => setContent({ ...content, category: event.currentTarget.value as JournalCategory })}>
                {journalCategories.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label className="w6-field" htmlFor={prefix + 'certainty'}>
              <span>Основание знания</span>
              <select id={prefix + 'certainty'} value={content.certainty}
                onChange={event => setContent({ ...content, certainty: event.currentTarget.value as KnowledgeCertainty })}>
                {certaintyOptions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <label className="w6-field" htmlFor={prefix + 'source'}>
            <span>Источник сведений</span>
            <input id={prefix + 'source'} maxLength={200} value={content.source} placeholder="Например: слова лекаря"
              onChange={event => setContent({ ...content, source: event.currentTarget.value })} />
          </label>
          <label className="w6-field" htmlFor={prefix + 'time'}>
            <span>Когда в кампании</span>
            <input id={prefix + 'time'} maxLength={120} value={content.gameTime} placeholder="Например: день 3, после привала"
              onChange={event => setContent({ ...content, gameTime: event.currentTarget.value })} />
          </label>
        </>}
        {automatic && <p className="w6-copy">Исходное наблюдение сохраняется в истории.
          Ниже можно добавить свою трактовку или исправление.</p>}
        <label className="w6-field" htmlFor={prefix + 'annotation'}>
          <span>Личные дополнения</span>
          <textarea id={prefix + 'annotation'} rows={3} maxLength={4000} value={annotation}
            onChange={event => setAnnotation(event.currentTarget.value)} />
        </label>
        <div className="w6-buttons">
          <button className="w6-button w6-primary" type="submit">{editing ? 'Применить изменения' : 'Добавить в справочник'}</button>
          <button className="w6-button" type="button" onClick={() => setFormOpen(false)}>Отмена</button>
        </div>
      </form>}
      <p className="w6-notice" role="status">{message}</p>
      <p className="w6-copy">Найдено: {found.length} · Всего записей: {entries.length}</p>
      {found.length === 0 && <p className="w6-copy">{entries.length ? 'По этому запросу записей нет.' : 'Справочник пока пуст.'}</p>}
      <div className="w6-entry-list">
        {found.slice(0, visibleCount).map(entry => <article className="w6-entry" key={entry.id}>
          <Illustration value={entry.artwork} fallback={({world:'banner',places:'banner',people:'portrait-elf',abilities:'artifact',effects:'supplies',other:'artifact'} as Record<string,ArtworkKey>)[entry.category]} className="w6-entry-art"/><div className="w6-entry-heading"><h4>{entry.title}</h4>
            <span className="w6-tag">{entry.origin === 'automatic' ? 'Автоматическая' : 'Ручная'}</span></div>
          <p className="w6-copy">{journalCategories.find(item => item.key === entry.category)?.label}
            {' · '}{certaintyOptions.find(item => item.key === entry.certainty)?.label}</p>
          <p className="w6-prose">{entry.text}</p>
          {entry.source && <p className="w6-copy">Источник: {entry.source}</p>}
          {entry.gameTime && <p className="w6-copy">Время в кампании: {entry.gameTime}</p>}
          {entry.annotation && <div className="w6-annotation"><strong>Личные дополнения</strong>
            <p className="w6-prose">{entry.annotation}</p></div>}
          <div className="w6-buttons">
            <button className="w6-button" type="button" aria-label={'Изменить запись ' + entry.title}
              onClick={() => openForm(entry)}>{entry.origin === 'automatic' ? 'Дополнить' : 'Редактировать'}</button>
            {entry.origin === 'manual' && <button className="w6-button w6-danger" type="button"
              aria-label={'Удалить запись ' + entry.title} onClick={() => removeEntry(entry)}>Удалить</button>}
          </div>
        </article>)}
      </div>
      {found.length > visibleCount && <button className="w6-button w6-spaced" type="button"
        onClick={() => setVisibleCount(value => value + 50)}>Показать ещё</button>}
    </section>
  )
}
