import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { readLobbyDraft, writeLobbyDraft } from './lobbyDraftStorage'
import type { LobbyDraft } from './lobbyDraftStorage'
import type { World } from './rpgEngine'
import { assertCampaignSize } from './campaignLimits'
import LobbyBackupPanel from './LobbyBackupPanel'

const CharacterManager = lazy(() => import('./CharacterManager'))
type Props = { accountId: string; lobbyId: string; remoteRevision?: number; checkingAccess: boolean;
  members: { id: string; displayName: string; disabled?: boolean }[] }

// The parent mounts this component only with confirmed GM/ASSISTANT access and keys
// it by account and lobby. An async continuation can never target a different room.
export default function LobbyCampaignEditor({ accountId, lobbyId, remoteRevision, checkingAccess, members }: Props) {
  const { request, refresh } = useOnline()
  const [draft, setDraft] = useState<LobbyDraft | null>(() => readLobbyDraft(accountId, lobbyId))
  const current = useRef(draft)
  const active = useRef(false)
  const loadingRequest = useRef<AbortController | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')
  const [storageWarning, setStorageWarning] = useState('')

  useEffect(() => {
    active.current = true
    if (current.current && !writeLobbyDraft(current.current)) {
      setStorageWarning('Не удалось сохранить черновик на устройстве. Он доступен до закрытия страницы; экспортируй кампанию перед выходом.')
    }
    return () => {
      active.current = false
      loadingRequest.current?.abort()
    }
  }, [])

  // Token refresh cancels a request made with the old credentials, preserving the draft.
  useEffect(() => () => loadingRequest.current?.abort(), [request])

  const remember = useCallback((next: LobbyDraft) => {
    current.current = next
    setDraft(next)
    setStorageWarning(writeLobbyDraft(next) ? '' :
      'Не удалось сохранить черновик на устройстве. Он доступен до закрытия страницы; экспортируй кампанию перед выходом.')
  }, [])

  const keepWorld = useCallback((world: World) => {
    const previous = current.current
    if (!active.current || !previous) return
    remember({ ...previous, world })
  }, [remember])

  async function loadEditor() {
    if (draft && !window.confirm('Загрузить свежую кампанию? Текущий черновик редактора будет заменён.')) return
    loadingRequest.current?.abort()
    const abort = new AbortController()
    loadingRequest.current = abort
    setLoading(true)
    try {
      const world = await request<World & { revision: number }>('/lobbies/' + lobbyId + '/world', { signal: abort.signal })
      if (!active.current || abort.signal.aborted || loadingRequest.current !== abort) return
      remember({ accountId, lobbyId, revision: world.revision,
        world: { characters: world.characters, campaign: world.campaign } })
      setEditorKey(key => key + 1)
      setMessage('Свежая кампания загружена в черновик мастера.')
    } catch (error) {
      if (active.current && !abort.signal.aborted) setMessage((error as Error).message)
    } finally {
      if (active.current && loadingRequest.current === abort) setLoading(false)
    }
  }

  async function publish(world: World) {
    const source = current.current
    if (!active.current || checkingAccess || !source || source.accountId !== accountId || source.lobbyId !== lobbyId) {
      throw new Error('Сначала подтверди доступ к исходному лобби и открой его редактор.')
    }
    assertCampaignSize(world)
    setPublishing(true)
    try {
      const result = await request<{ revision: number }>('/lobbies/' + source.lobbyId + '/world', {
        method: 'PUT', body: JSON.stringify({ world, revision: source.revision }),
      })
      // Leaving during publication cannot install its response in another editor.
      // Preserve edits made while awaiting the server, updating only the base revision.
      const latest = active.current ? current.current : readLobbyDraft(source.accountId, source.lobbyId)
      if (latest && latest.revision === source.revision) {
        const next = { ...latest, revision: result.revision }
        if (active.current) remember(next)
        else writeLobbyDraft(next)
      }
      refresh()
      return 'Изменения кампании опубликованы участникам.'
    } finally {
      if (active.current) setPublishing(false)
    }
  }

  return <div className="w6-fieldset">
    <h3>Общий редактор ГМ</h3>
    <p className="w6-copy">Черновик сохраняется на этом устройстве отдельно для твоего аккаунта и этого лобби. Участники увидят изменения после публикации.</p>
    <button className="w6-button" disabled={loading || publishing || checkingAccess} onClick={() => void loadEditor()}>
      {loading ? 'Загружаем кампанию…' : draft ? 'Загрузить свежую кампанию' : 'Открыть кампанию в редакторе'}
    </button>
    {storageWarning && <p className="w6-notice" role="alert">{storageWarning}</p>}
    {message && <p className="w6-notice" role="status">{message}</p>}
    <LobbyBackupPanel lobbyId={lobbyId} revision={remoteRevision} checkingAccess={checkingAccess || loading || publishing}
      members={members} onRestored={result => {
        remember({ accountId, lobbyId, revision: result.revision, world: result.world }); setEditorKey(key => key + 1)
      }} />
    {draft && <>
      <p className={remoteRevision !== undefined && draft.revision !== remoteRevision ? 'w6-notice' : 'w6-copy'}>
        {remoteRevision === undefined ? 'Проверяем текущую версию кампании. Черновик сохранён.' :
          draft.revision !== remoteRevision ? 'На сервере появилась новая версия. Перед публикацией обнови черновик или разреши конфликт.' :
            'Черновик использует текущую версию кампании.'}
      </p>
      <Suspense fallback={<p>Загружаем редактор…</p>}>
        <CharacterManager key={editorKey} initialWorld={draft.world} onDraftChange={keepWorld}
          onRemotePublish={publish} remotePublishDisabled={checkingAccess || loading} />
      </Suspense>
    </>}
  </div>
}
