import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { useRemote } from './onlineHooks'
import type { PlayerCharacter } from './onlineTypes'
import type { PerceivedMap } from './scenePerception'
import type { JournalEntry, KnownEffect } from './characterKnowledge'
import { journalCategories, certaintyOptions } from './characterKnowledge'
import PerceivedScene from './PerceivedScene'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
type PlayerView = { revision: number; hero: PlayerCharacter; map: PerceivedMap | null; canWriteNotes: boolean;
  knowledge: { journal: Omit<JournalEntry, 'artwork' | 'eventKey'>[]; knownEffects: Omit<KnownEffect, 'createdAt' | 'updatedAt' | 'artwork'>[] }; inventory: { id: string; name: string; description: string; quantity: number }[] }
type Note = { title: string; text: string; revision?: number }
const valid = (v: unknown): v is Note => !!v && typeof v === 'object' && typeof (v as Note).title === 'string' && (v as Note).title.length <= 120 && typeof (v as Note).text === 'string' && (v as Note).text.length <= 8000 && ((v as Note).revision === undefined || Number.isSafeInteger((v as Note).revision))
export default function LobbyPlayerScreen({ accountId, lobbyId, character, checkingAccess }: { accountId: string; lobbyId: string; character: PlayerCharacter; checkingAccess: boolean }) {
  const { request, refresh } = useOnline(), key = lobbyFormKey('player-note', accountId, lobbyId, character.id)
  const [opened, setOpened] = useState(false), [note, setNote] = useState(() => readLobbyForm(key, valid) ?? { title: '', text: '' }), [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [warning, setWarning] = useState(''), [query, setQuery] = useState('')
  const active = useRef(false), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  const path = '/lobbies/' + lobbyId + '/characters/' + character.id, remote = useRemote<PlayerView>(opened ? path + '/perception' : null)
  function remember(next: Note) { setNote(next); setWarning(writeLobbyForm(key, next) ? '' : 'Заметка доступна до закрытия страницы: не удалось сохранить её на устройстве.') }
  async function save() {
    const source = note, abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<{ revision: number }>(path + '/knowledge', { signal: abort.signal, method: 'POST', body: JSON.stringify({ ...source, revision: source.revision ?? remote.value?.revision }) })
      if (!active.current || abort.signal.aborted) return
      const next = { title: '', text: '', revision: result.revision }; writeLobbyForm(key, next); setNote(next); setMessage('Личная заметка записана.'); refresh()
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) } finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  const value = remote.value, unavailable = checkingAccess || remote.loading || busy, stale = value && note.revision !== undefined && note.revision !== value.revision
  const entries = value?.knowledge.journal.filter(e => (e.title + ' ' + e.text + ' ' + e.annotation).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))) ?? []
  return <section className="w6-fieldset gb-player-screen"><h4>Экран героя</h4><button className="w6-button" disabled={checkingAccess || busy} onClick={() => setOpened(!opened)}>{opened ? 'Свернуть экран героя' : 'Открыть экран героя'}</button>
    {opened && <><p role="status">{remote.loading ? 'Загружаем доступные герою сведения…' : remote.error}</p>{value && <>
      <p className="w6-copy">Сведения героя индивидуальны. Мастер управляет раскрытием; выбор отметки не перемещает героя и не тратит время.</p>
      {value.map ? <PerceivedScene map={value.map} selected={selected} onSelect={setSelected}/> : <p className="gb-scene-empty">Мастер ещё не открыл этому герою сцену.</p>}
      <div className="gb-player-tabs"><details open><summary>Состояние и возможности</summary>
        {value.hero.resources && <p>{Object.entries(value.hero.resources).map(([k, r]) => <span key={k}>{k === 'mana' ? 'Мана' : k === 'shadow' ? 'Тень' : 'Выносливость'}: {r.current} / {r.maximum} · </span>)}</p>}
        {value.hero.sensations?.map((s, i) => <div key={i}><strong>{s.label}</strong>{s.symptoms.map(x => <p key={x}>{x}</p>)}{s.diagnoses.map(x => <p key={x}>Известный диагноз: {x}</p>)}</div>)}
        {value.hero.capabilities?.map(x => <p key={x}>{x}</p>)}
      </details><details><summary>Инвентарь</summary>{value.inventory.length ? value.inventory.map(i => <p key={i.id}>{i.name} × {i.quantity} · {i.description}</p>) : <p>Инвентарь пуст.</p>}</details>
      <details><summary>Известные способности</summary>{value.hero.abilities?.length ? value.hero.abilities.map(a => <p key={a.id}><strong>{a.name}</strong> · {a.description}</p>) : <p>Нет утверждённых способностей.</p>}</details>
      <details open><summary>Знания и журнал</summary><label className="w6-field"><span>Поиск в журнале героя</span><input aria-label="Поиск в журнале героя" value={query} onChange={e => setQuery(e.currentTarget.value)}/></label>
        <p className="w6-copy">Показаны последние {Math.min(20, entries.length)} из {entries.length} подходящих записей.</p>
        {entries.slice(-20).reverse().map(e => <article className="gb-journal-entry" key={e.id}><h4>{e.title}</h4><small>{journalCategories.find(c => c.key === e.category)?.label} · {certaintyOptions.find(c => c.key === e.certainty)?.label} · {e.source} · {e.gameTime}</small><p className="w6-prose">{e.text}</p>{e.annotation && <p className="w6-prose">Примечание: {e.annotation}</p>}</article>)}
        {value.knowledge.knownEffects.map(e => <article key={e.id}><strong>{e.title}</strong><p>{e.description}</p><small>{e.perception === 'identified' ? 'Распознанное воздействие' : 'Ощущение без точного диагноза'} · {e.status === 'ended' ? 'Завершено' : 'Наблюдается'}</small></article>)}
        {value.canWriteNotes ? <fieldset disabled={unavailable}><legend>Личная заметка</legend><label className="w6-field"><span>Заголовок заметки</span><input aria-label="Заголовок заметки" maxLength={120} value={note.title} onChange={e => remember({ ...note, title: e.currentTarget.value, revision: note.revision ?? value.revision })}/></label>
          <label className="w6-field"><span>Текст личной заметки</span><textarea aria-label="Текст личной заметки" rows={4} maxLength={8000} value={note.text} onChange={e => remember({ ...note, text: e.currentTarget.value, revision: note.revision ?? value.revision })}/></label>
          <p className="w6-copy">Личная запись помечается как предположение и не меняет факты мастера.</p>
          {stale && <><p role="alert">Кампания изменилась. Проверь заметку перед отправкой.</p><button className="w6-button" onClick={() => remember({ ...note, revision: value.revision })}>Заметка проверена с текущей версией</button></>}
          <button className="w6-button" disabled={!note.title.trim() || !note.text.trim() || !!stale} onClick={() => void save()}>Записать личную заметку</button>
        </fieldset> : <p className="w6-copy">Управление передано: сведения доступны для чтения, заметки записывает действующий управляющий.</p>}
      </details></div>
    </>}{warning && <p role="alert">{warning}</p>}<p role="status">{message}</p></>}
  </section>
}
