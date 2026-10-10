import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import type { Lobby, PlayerCharacter } from './onlineTypes'
import { hasLobbyPermission } from './lobbyAccess'
import type { ControlEvent } from './lobbyAccess'

const eventLabels: Record<ControlEvent['action'], string> = { delegate: 'Владелец передал управление', return: 'Владелец вернул управление',
  assign: 'Главный ГМ назначил управляющего', fallback: 'Управление вернулось главному ГМ', 'transfer-chief': 'Сменился главный ГМ', 'restore-reset': 'Передача отменена при восстановлении владельцев' }
export default function LobbyCharacterControl({ lobby, character, revision, disabled }: { lobby: Lobby; character: PlayerCharacter; revision: number; disabled: boolean }) {
  const { user, request, refresh } = useOnline()
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [history, setHistory] = useState<ControlEvent[] | null>(null)
  const active = useRef(false), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  if (!user) return null
  const owner = character.ownerId === user.id, chief = lobby.myRole === 'GM'
  const control = character.control ?? { delegated: false, controllerId: character.ownerId }
  const controller = lobby.members.find(m => m.id === control.controllerId)
  const canSeeHistory = owner || chief || control.controllerId === user.id && hasLobbyPermission(lobby.myRole, lobby.myPermissions, 'controlDelegated')
  async function act(path: string, body?: object) {
    pending.current?.abort(); const abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<ControlEvent[]>('/lobbies/' + lobby.id + '/characters/' + character.id + '/' + path,
        { signal: abort.signal, ...(body ? { method: 'POST', body: JSON.stringify({ ...body, revision }) } : {}) })
      if (!active.current || abort.signal.aborted) return
      if (!body) setHistory(result)
      else { setHistory(null); setMessage('Управление обновлено. Лист, последствия и начатые применения сохранены.'); refresh() }
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) }
    finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  return <div className="w6-fieldset"><p>Управляет: <strong>{controller?.displayName ?? 'Владелец героя'}</strong>{control.delegated ? ' · передан мастеру' : ' · управление владельца'}</p>
    {owner && (control.delegated ? <button className="w6-button" disabled={busy || disabled} onClick={() => void act('control', { delegated: false })}>Вернуть себе управление</button> :
      !chief && <><p className="w6-copy">На время отсутствия герой остаётся твоим. Мастер сможет поручить его помощнику с нужным разрешением. Изменения в кампании сохраняются; вернуть управление можно в любой момент. Закрытие сайта само по себе управление не передаёт.</p>
        <button className="w6-button" disabled={busy || disabled || lobby.status === 'closed'} onClick={() => {
          if (window.confirm('Передать управление героем «' + character.name + '» мастеру до твоего возвращения? Последствия действий сохранятся.')) void act('control', { delegated: true })
        }}>Передать героя мастеру</button></>)}
    {chief && control.delegated && <label className="w6-field"><span>Управляющий героя {character.name}</span>
      <select aria-label={'Управляющий героя ' + character.name} value={control.controllerId} disabled={busy || disabled}
        onChange={e => void act('control-assignee', { userId: e.currentTarget.value })}>
        {lobby.members.filter(m => !m.disabled && (m.lobbyRole === 'GM' || m.lobbyRole === 'ASSISTANT' && m.permissions?.includes('controlDelegated'))).map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
      </select></label>}
    {canSeeHistory && <><button className="w6-button" disabled={busy || disabled} onClick={() => void act('control-history')}>История управления героем</button>
      {history && <div role="log" aria-label={'История управления ' + character.name}>{history.length ? history.map(e => <p key={e.id}>{eventLabels[e.action]} · {e.actor} · {new Date(e.createdAt).toLocaleString('ru-RU')} · управляющий: {lobby.members.find(m => m.id === e.controllerId)?.displayName ?? 'Прежний участник'}</p>) : <p>Передач управления ещё не было.</p>}</div>}</>}
    <p className="w6-notice" role="status">{message}</p>
  </div>
}
