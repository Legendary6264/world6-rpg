import { useState } from 'react'
import { useOnline } from './onlineContext'
import { lobbyPermissions, lobbyPermissionLabels } from './lobbyAccess'
import type { LobbyPermission } from './lobbyAccess'

type Props = { lobbyId: string; userId: string; displayName: string; permissions: LobbyPermission[]; revision: number; disabled: boolean }
export default function LobbyPermissionsPanel({ lobbyId, userId, displayName, permissions, revision, disabled }: Props) {
  const { request, refresh } = useOnline()
  const [selected, setSelected] = useState<LobbyPermission[]>(permissions), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function save() {
    setBusy(true)
    try {
      await request('/lobbies/' + lobbyId + '/members/' + userId + '/permissions', {
        method: 'PATCH', body: JSON.stringify({ permissions: selected, revision }),
      })
      setMessage('Разрешения сохранены в этом лобби.'); refresh()
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  return <details className="w6-fieldset"><summary>Разрешения: {displayName}</summary>
    <fieldset disabled={busy || disabled}><legend>Полномочия помощника в этой кампании</legend>
      {lobbyPermissions.map(p => <label className="w6-check" key={p}><input type="checkbox" checked={selected.includes(p)}
        onChange={e => { const checked = e.currentTarget.checked; setSelected(values => checked ? [...values, p] : values.filter(v => v !== p)) }}/>{lobbyPermissionLabels[p]}</label>)}
      <p className="w6-copy">Управление сценами открывает все схемы сцен и портреты, но не полные листы и каталог. Секретные материалы включают полную копию кампании. Общий редактор доступен при всех восьми разрешениях.</p>
      <p className="w6-copy">Отдельные инструменты NPC, экономики, новых раундов и переигровки появятся на следующих этапах.</p>
      <button type="button" className="w6-button" onClick={() => void save()}>Сохранить разрешения помощника</button>
    </fieldset><p className="w6-notice" role="status">{message}</p>
  </details>
}
