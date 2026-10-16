import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { blockedLoad, readCharacters } from './characterStorage'
import type { CloudCharacter } from './onlineTypes'
import { RemoteStatus } from './NetworkCommon'

function localHeroes() {
  try { return readCharacters(window.localStorage) } catch { return blockedLoad() }
}

export default function LobbyCharacterPicker({ accountId, lobbyId, revision, cloud, loading, error, disabled }: {
  accountId: string; lobbyId: string; revision: number; cloud: CloudCharacter[] | null;
  loading: boolean; error: string; disabled: boolean;
}) {
  const { request, refresh } = useOnline()
  const [local, setLocal] = useState(localHeroes), [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const uploaded = useRef(new Map<string, number>()), pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    const reload = () => setLocal(localHeroes())
    window.addEventListener('focus', reload); window.addEventListener('storage', reload)
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('storage', reload) }
  }, [])
  const localOnly = local.characters.filter(c => !cloud?.some(r => r.id === c.id))
  const source = cloud?.find(c => c.id === selectedId), localSource = localOnly.find(c => c.id === selectedId)
  const locked = busy || disabled || loading || cloud === null || !!error
  async function add() {
    if (locked || (!source && !localSource) || pending.current) return
    const abort = new AbortController(); pending.current = abort; setBusy(true); setMessage('')
    let changed = false
    try {
      let sourceRevision = source?.revision ?? uploaded.current.get(selectedId)
      if (sourceRevision === undefined && localSource) {
        const result = await request<{ revision: number }>('/characters/' + localSource.id, {
          method: 'PUT', signal: abort.signal, body: JSON.stringify({ character: localSource, revision: -1 }),
        })
        uploaded.current.set(localSource.id, result.revision); sourceRevision = result.revision; changed = true
        // Version tracking is only a convenience; a storage failure must not undo a successful upload.
        try {
          const key = 'world6.cloud-versions.' + accountId
          const versions = JSON.parse(localStorage.getItem(key) || '{}')
          localStorage.setItem(key, JSON.stringify({ ...versions, [localSource.id]: result.revision }))
        } catch { /* The server copy is already saved. */ }
      }
      if (abort.signal.aborted) return
      await request('/lobbies/' + lobbyId + '/characters', {
        method: 'POST', signal: abort.signal, body: JSON.stringify({ characterId: selectedId, revision, sourceRevision }),
      })
      changed = true
      if (!abort.signal.aborted) { setSelectedId(''); setMessage('Герой добавлен как отдельная копия для проверки мастером.') }
    } catch (e) {
      if (!abort.signal.aborted) setMessage((uploaded.current.has(selectedId) ? 'Герой сохранён в аккаунте. ' : '') + (e as Error).message)
    } finally {
      if (!abort.signal.aborted) { pending.current = null; setBusy(false); if (changed) refresh() }
    }
  }
  return <form className="w6-form w6-fieldset" onSubmit={e => { e.preventDefault(); void add() }}>
    <label className="w6-field"><span>Герой для кампании</span>
      <select aria-label="Герой для кампании" required value={selectedId} disabled={locked} onChange={e => setSelectedId(e.currentTarget.value)}>
        <option value="">Выбери героя</option>
        {!!cloud?.length && <optgroup label="В аккаунте">{cloud.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
        {!!localOnly.length && <optgroup label="На этом устройстве">{localOnly.map(c => <option key={c.id} value={c.id}>{c.name} · на устройстве</option>)}</optgroup>}
      </select>
    </label>
    <RemoteStatus error={error} loading={loading}/>
    {local.blocked && <p role="alert">{local.message}</p>}
    {!loading && cloud !== null && !error && !cloud.length && !localOnly.length && <p className="w6-copy">Сохранённых героев пока нет. Создай и сохрани героя в разделе «Персонажи», затем вернись в лобби.</p>}
    <p className="w6-copy">{localSource ? 'Выбранный герой с этого устройства будет сохранён в твой аккаунт и отправлен мастеру на проверку.' : 'Выбери героя из аккаунта или сохранённого на этом устройстве. Для героя из аккаунта используется его сохранённая версия.'}</p>
    <div className="w6-buttons"><button className="w6-button w6-primary" disabled={locked || (!source && !localSource)}>{localSource ? 'Сохранить в аккаунт и добавить' : 'Добавить героя в кампанию'}</button>
      <button type="button" className="w6-button" disabled={busy} onClick={() => { setLocal(localHeroes()); refresh() }}>Обновить список героев</button></div>
    <p className="w6-notice" role="status">{message}</p>
  </form>
}
