import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { useRemote } from './onlineHooks'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
import { actionSummary } from './actionDeclarations'
import type { ActionDeclarations, DeclarationEntry } from './actionDeclarations'
type MasterView = { revision: number; declarations: ActionDeclarations; scenes: { id: string; name: string; objects: {id:string;name:string}[] }[]; actors: { id: string; name: string; approved: boolean; items: {id:string;name:string}[]; abilities: {id:string;name:string}[] }[] }
type Draft = { sceneId: string; duration: string; allowReplace: boolean; participantIds: string[]; revision?: number;
  returns: Record<string, { text: string; collectionId: string; epoch: number; baseVersion: number }> }
const valid = (v: unknown): v is Draft => !!v && typeof v === 'object' && (() => { const d = v as Draft; return typeof d.sceneId === 'string' && typeof d.duration === 'string' && d.duration.length <= 40 &&
  typeof d.allowReplace === 'boolean' && Array.isArray(d.participantIds) && d.participantIds.length <= 200 && d.participantIds.every(id => typeof id === 'string') &&
  (d.revision === undefined || Number.isSafeInteger(d.revision)) && !!d.returns && typeof d.returns === 'object' && Object.keys(d.returns).length <= 200 && Object.values(d.returns).every(r => r && typeof r.text === 'string' && r.text.length <= 2000 && typeof r.collectionId === 'string' && Number.isSafeInteger(r.epoch) && Number.isSafeInteger(r.baseVersion)) })()
export default function LobbyDeclarationsMaster({ accountId, lobbyId, checkingAccess, members }: { accountId: string; lobbyId: string; checkingAccess: boolean; members: {id:string;displayName:string}[] }) {
  const { request, refresh } = useOnline(), path = '/lobbies/' + lobbyId + '/declarations', key = lobbyFormKey('declarations-master', accountId, lobbyId)
  const [opened, setOpened] = useState(false), remote = useRemote<MasterView>(opened ? path : null)
  const [draft, setDraft] = useState(() => readLobbyForm(key, valid) ?? { sceneId: '', duration: '', allowReplace: true, participantIds: [], returns: {} })
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [warning, setWarning] = useState(''), active = useRef(false), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  const value = remote.value, c = value?.declarations.active, disabled = busy || checkingAccess || remote.loading, duration = Number(draft.duration.replace(',', '.'))
  function remember(next: Draft) { const stored = { ...next, revision: next.revision ?? value?.revision }; setDraft(stored); setWarning(writeLobbyForm(key, stored) ? '' : 'Черновик не сохранён на устройстве. Не закрывай страницу.') }
  async function send(target: string, method: string, body: object, success: string) {
    const abort = new AbortController(); pending.current = abort; setBusy(true)
    try { await request(target, { method, signal: abort.signal, body: JSON.stringify(body) }); if (!active.current || abort.signal.aborted) return
      setMessage(success); refresh()
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) } finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  function phase(operation: string) { if (c) void send(path, 'PATCH', { collectionId: c.id, epoch: c.epoch, operation }, operation === 'close' ? 'Приём закрыт. Ничьи действия ещё не исполнены.' : operation === 'reopen' ? 'Приём открыт повторно.' : 'Сбор сохранён в истории; игровые часы не изменились.') }
  const stale = value && draft.revision !== undefined && draft.revision !== value.revision
  const name = (id: string) => value?.actors.find(a => a.id === id)?.name ?? 'Удалённый герой'
  const authorName = (id: string) => members.find(m => m.id === id)?.displayName ?? 'Бывший участник'
  const objectName = (id: string) => value?.scenes.find(s => s.id === c?.sceneId)?.objects.find(o => o.id === id)?.name ?? 'Прежний объект'
  function returnDraft(e: DeclarationEntry, text: string) { if (!c) return; const old = draft.returns[e.actorId]; remember({ ...draft, returns: { ...draft.returns, [e.actorId]: { text, collectionId: old?.collectionId ?? c.id, epoch: old?.epoch ?? c.epoch, baseVersion: old?.baseVersion ?? e.revision } } }) }
  return <section className="w6-fieldset"><h3>Приём заявлений</h3><button className="w6-button" disabled={disabled} onClick={() => setOpened(!opened)}>{opened ? 'Свернуть приём заявлений' : 'Открыть инструменты заявлений'}</button>
    {opened && <><p role="status">{remote.loading ? 'Проверяем заявления и права…' : remote.error}</p><p className="w6-copy">Этот этап собирает планы. Расчёт темпа, расход ресурсов и применение последствий ещё не выполняются. Отсутствие заявления не назначает герою штраф или пропуск.</p>
      {value && <>{c ? <><h4>{c.sceneName} · {c.phase === 'open' ? 'приём открыт' : c.phase === 'closed' ? 'приём закрыт' : 'сцена удалена'}</h4><p>Длительность раунда: {c.durationSeconds} с · {c.allowReplace ? 'Игроки могут заменять планы до закрытия.' : 'Изменение после возврата мастером.'}</p>
        <div className="w6-buttons">{c.phase === 'open' ? <button className="w6-button" disabled={disabled} onClick={() => phase('close')}>Закрыть приём заявлений</button> : <>{c.phase === 'closed' && <button className="w6-button" disabled={disabled} onClick={() => phase('reopen')}>Открыть приём повторно</button>}<button className="w6-button" disabled={disabled} onClick={() => { if (window.confirm('Сохранить этот сбор в истории? Это не исполнит действия и не продвинет время.')) phase('archive') }}>Сохранить сбор в истории</button></>}</div>
        {c.participantIds.map(id => { const e = c.entries.find(e => e.actorId === id), r = draft.returns[id], old = r && (r.collectionId !== c.id || r.epoch !== c.epoch || r.baseVersion !== e?.revision)
          return <article className="gb-journal-entry" key={id}><h4>{name(id)} · {e?.status === 'submitted' ? 'заявление получено' : e?.status === 'returned' ? 'возвращено' : 'заявления нет'}</h4>
            {e?.actions.map((a, i) => <p key={i}>{i + 1}. {actionSummary(a)}{'target' in a && (a.target.kind === 'contact' ? ' · контакт героя' : a.target.kind === 'object' ? ' · ' + objectName(a.target.id) : a.target.kind === 'point' ? ` · точка (${a.target.point.x}; ${a.target.point.y}; ${a.target.point.z})` : a.target.kind === 'self' ? ' · на себя' : ' · без конкретной цели')}{a.kind === 'item' ? ' · ' + (value.actors.find(x => x.id === id)?.items.find(x => x.id === a.itemId)?.name ?? 'Прежний предмет') : a.kind === 'ability' ? ' · ' + (value.actors.find(x => x.id === id)?.abilities.find(x => x.id === a.abilityId)?.name ?? 'Прежняя способность') : ''}{e.resolved.find(x => x.index === i)?.actorId && ' · персонаж: ' + name(e.resolved.find(x => x.index === i)!.actorId!)}{a.note && ' · ' + a.note}</p>)}
            {e && <small>Инициатор: {authorName(e.submittedBy)} · версия {e.revision}</small>}{e?.note && <p>Замечание: {e.note}</p>}
            {c.phase === 'open' && e?.status === 'submitted' && <fieldset disabled={disabled}><legend>Возврат плана</legend><textarea aria-label={'Замечание к заявлению ' + name(id)} maxLength={2000} value={r?.text ?? ''} onChange={event => returnDraft(e, event.currentTarget.value)}/>
              {old && <><p role="alert">Заявление или приём изменились. Проверь замечание.</p><button className="w6-button" onClick={() => remember({ ...draft, returns: { ...draft.returns, [id]: { ...r, collectionId: c.id, epoch: c.epoch, baseVersion: e.revision } } })}>Замечание к плану проверено</button></>}
              <button className="w6-button" disabled={!r?.text.trim() || !!old} onClick={() => void send('/lobbies/' + lobbyId + '/characters/' + id + '/declarations/return', 'POST', { ...r, note: r.text }, 'Заявление возвращено для исправления.')}>Вернуть заявление {name(id)}</button>
            </fieldset>}</article> })}
        <details><summary>История сбора ({c.history.length})</summary>{c.history.slice(-30).reverse().map(e => <p key={e.id}>{e.at} · {({ open: 'приём открыт', close: 'приём закрыт', reopen: 'приём открыт повторно', submit: 'заявление', withdraw: 'заявление снято', return: 'возврат' }[e.kind])} · {authorName(e.authorId)}{e.entry && <span> · {e.entry.actorName}: {e.entry.actions.map(actionSummary).join('; ')}</span>}</p>)}</details>
      </> : <fieldset disabled={disabled}><legend>Новый сбор</legend><label className="w6-field"><span>Сцена приёма</span><select aria-label="Сцена приёма" value={draft.sceneId} onChange={e => remember({ ...draft, sceneId: e.currentTarget.value })}><option value="">Выбери сцену</option>{value.scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="w6-field"><span>Длительность раунда, с</span><input aria-label="Длительность раунда, с" inputMode="decimal" value={draft.duration} onChange={e => remember({ ...draft, duration: e.currentTarget.value })}/></label><p className="w6-copy">Задаёт мастер; автоматической формулы темпа пока нет. Длительность сохраняется для следующих сборов этой сцены.</p>
        <label><input type="checkbox" aria-label="Разрешить замену заявления" checked={draft.allowReplace} onChange={e => remember({ ...draft, allowReplace: e.currentTarget.checked })}/> Разрешить замену плана до закрытия приёма</label>
        <fieldset><legend>Участники сбора</legend>{value.actors.filter(a => a.approved).map(a => <label key={a.id} className="gb-disclosure-row"><input type="checkbox" aria-label={'Участник сбора ' + a.name} checked={draft.participantIds.includes(a.id)} onChange={e => remember({ ...draft, participantIds: e.currentTarget.checked ? [...draft.participantIds, a.id] : draft.participantIds.filter(id => id !== a.id) })}/>{a.name}</label>)}</fieldset>
        {stale && <><p role="alert">Кампания изменилась. Проверь участников и настройки.</p><button className="w6-button" onClick={() => remember({ ...draft, revision: value.revision })}>Настройки приёма проверены</button></>}
        <button className="w6-button" disabled={!draft.sceneId || !draft.participantIds.length || !Number.isFinite(duration) || duration <= 0 || duration > 86400 || !!stale} onClick={() => void send(path, 'POST', { revision: draft.revision ?? value.revision, sceneId: draft.sceneId, participantIds: draft.participantIds, durationSeconds: duration, allowReplace: draft.allowReplace }, 'Приём открыт. Игроки готовят планы одновременно.')}>Начать приём заявлений</button>
      </fieldset>}
      {!!value.declarations.archive.length && <details><summary>Предыдущие сборы ({value.declarations.archive.length})</summary>{value.declarations.archive.map(a => <article key={a.id}><h4>{a.sceneName} · {a.entries.filter(e => e.status === 'submitted').length} заявлений</h4>{a.entries.map(e => <p key={e.actorId}>{e.actorName}: {e.actions.map(actionSummary).join('; ')}</p>)}</article>)}</details>}
      </>}{warning && <p role="alert">{warning}</p>}<p role="status">{message}</p></>}
  </section>
}
