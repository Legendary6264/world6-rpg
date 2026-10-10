import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { downloadJson, MAX_IMPORT_BYTES } from './characterTransfer'
import { parseLobbyBackup } from './lobbyBackup'
import type { LobbyBackupPreview, OwnerBinding } from './lobbyBackup'
import type { World } from './rpgEngine'

type Member = { id: string; displayName: string; disabled?: boolean }
type Props = { lobbyId: string; revision?: number; checkingAccess: boolean; members: Member[]; allowRestore?: boolean;
  onRestored: (result: { world: World; revision: number }) => void }

export default function LobbyBackupPanel({ lobbyId, revision, checkingAccess, members, onRestored, allowRestore = true }: Props) {
  const { request, refresh } = useOnline()
  const [preview, setPreview] = useState<LobbyBackupPreview | null>(null)
  const [bindings, setBindings] = useState<OwnerBinding[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const active = useRef(false), readId = useRef(0), pending = useRef<AbortController | null>(null)
  const cancelPending = useCallback(() => { active.current = false; readId.current++; pending.current?.abort() }, [])
  useEffect(() => { active.current = true; return cancelPending }, [cancelPending])

  async function read(file?: File) {
    const id = ++readId.current
    setPreview(null); setBindings([]); setMessage('')
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) { setMessage('Копия больше 10 МиБ.'); return }
    try {
      const parsed = parseLobbyBackup(await file.text())
      if (!active.current || readId.current !== id) return
      setPreview(parsed)
      setBindings(parsed.world.characters.map(c => {
        const previous = parsed.bindings?.find(b => b.characterId === c.id)
        return { characterId: c.id,
          ownerId: members.some(m => m.id === previous?.ownerId && !m.disabled) ? previous!.ownerId : '',
          approved: previous?.approved ?? true }
      }))
      setMessage(parsed.bindings ? 'Проверь владельцев перед восстановлением.' : 'В прежней копии нет владельцев. Назначь их явно для каждого героя.')
    } catch (error) {
      if (active.current && readId.current === id) setMessage((error as Error).message)
    }
  }

  async function act(fn: (signal: AbortSignal) => Promise<void>) {
    pending.current?.abort()
    const abort = new AbortController(); pending.current = abort; setBusy(true)
    try { await fn(abort.signal) }
    catch (error) { if (active.current && !abort.signal.aborted) setMessage((error as Error).message) }
    finally { if (active.current && pending.current === abort) setBusy(false) }
  }

  async function backup(signal: AbortSignal) {
    const value = await request('/lobbies/' + lobbyId + '/backup', { signal })
    if (!active.current || signal.aborted) return
    downloadJson(JSON.stringify(value), 'world6-lobby-' + new Date().toISOString().slice(0,10) + '.json')
    setMessage('Копия опубликованного мира и владельцев героев подготовлена.')
  }
  async function restore(signal: AbortSignal) {
    if (!preview || revision === undefined) return
    const result = await request<{ world: World; revision: number }>('/lobbies/' + lobbyId + '/restore', {
      method: 'POST', signal, body: JSON.stringify({ world: preview.world, bindings, revision }),
    })
    if (!active.current || signal.aborted) return
    onRestored(result); setPreview(null); setBindings([]); setMessage('Мир и владельцы героев восстановлены в этом лобби.'); refresh()
  }
  const validOwners = bindings.every(b => members.some(m => m.id === b.ownerId && !m.disabled))
  return <details className="w6-fieldset">
    <summary>{allowRestore?'Копия лобби и восстановление владельцев':'Секретные материалы: копия кампании'}</summary>
    <p className="w6-copy">Копия включает опубликованные листы, каталог, сцены, часы и владельцев героев. Перед восстановлением добавь нужных участников в целевое лобби.</p>
    <button className="w6-button" disabled={busy || checkingAccess} onClick={() => void act(backup)}>Скачать копию лобби с владельцами</button>
    {allowRestore && <label className="w6-field"><span>Копия лобби или прежняя копия кампании</span>
      <input type="file" accept=".json,application/json" disabled={busy || checkingAccess} onChange={e => void read(e.currentTarget.files?.[0])} />
    </label>}
    {allowRestore && preview && <div className="w6-entry">
      <p>Героев: {preview.world.characters.length}; время: {preview.world.campaign.seconds} с.</p>
      {preview.world.characters.map(c => {
        const original = preview.bindings?.find(b => b.characterId === c.id)
        return <div className="w6-field" key={c.id}><strong>{c.name}</strong>
          {original && <small>В копии: {preview.owners.find(o => o.id === original.ownerId)?.displayName ?? original.ownerId}</small>}
          <label><span>Владелец героя {c.name}</span><select aria-label={'Владелец героя ' + c.name} disabled={busy}
            value={bindings.find(b => b.characterId === c.id)?.ownerId ?? ''}
            onChange={e => { const ownerId = e.currentTarget.value; setBindings(values => values.map(b => b.characterId === c.id ? { ...b, ownerId } : b)) }}>
            <option value="">Выбери участника</option>{members.filter(m => !m.disabled).map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select></label>
        </div>
      })}
      <button className="w6-button w6-danger" disabled={busy || checkingAccess || revision === undefined || !validOwners}
        onClick={() => { if (window.confirm('Заменить опубликованный мир и владельцев героев этого лобби? Текущий черновик также заменится. Сначала сохрани нужные копии.')) void act(restore) }}>Восстановить мир и владельцев в этом лобби</button>
    </div>}
    <p className="w6-notice" role="status">{message}</p>
  </details>
}
