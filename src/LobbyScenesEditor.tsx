import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import type { Request } from './onlineContext'
import SceneEditor from './SceneEditor'
import SceneDraftReview from './SceneDraftReview'
import { assertSceneDraftSize, isSceneSnapshot, readSceneDraft, writeSceneDraft } from './lobbySceneDraftStorage'
import type { SceneDraft, SceneSnapshot } from './lobbySceneDraftStorage'
import type { SceneState } from './sceneTypes'
import { copySceneState, isSceneState, sceneReferencesValid } from './scenes'
import { addLobbyTavern } from './lobbySceneTemplates'
import { sceneEditorId } from './sceneEditorId'

type Props = { accountId: string; lobbyId: string; revision?: number; checkingAccess: boolean; onPlay?: () => void }
type Operation = 'load' | 'manual' | 'live' | 'compare' | null
type Review = { id: string; source: SceneDraft; remote: SceneSnapshot; request: Request }
type MergeUndo = { before: SceneDraft; afterJson: string; revision: number }

export default function LobbyScenesEditor(props: Props) {
  return <ScenesWorkspace key={JSON.stringify([props.accountId, props.lobbyId])} {...props}/>
}

function ScenesWorkspace({ accountId, lobbyId, revision, checkingAccess, onPlay }: Props) {
  const { request, refresh } = useOnline()
  const [draft, setDraft] = useState(() => readSceneDraft(accountId, lobbyId))
  const [operationState, setOperation] = useState<{ kind: Operation; request: typeof request } | null>(null)
  const operation = operationState?.request === request ? operationState.kind : null
  const [published, setPublished] = useState<string | null>(() => draft?.baseScenes ? JSON.stringify(draft.baseScenes) : null)
  const [review, setReview] = useState<Review | null>(null), [mergeUndo, setMergeUndo] = useState<MergeUndo | null>(null)
  const [message, setMessage] = useState(''), [warning, setWarning] = useState(''), [live, setLive] = useState(false)
  const current = useRef(draft), active = useRef(false), pending = useRef<AbortController | null>(null), running = useRef<Operation>(null)
  const acknowledged = useRef(published), context = useRef({ checkingAccess, revision, refresh, request }), currentReview = useRef<Review | null>(null)
  useLayoutEffect(() => { context.current = { checkingAccess, revision, refresh, request } }, [checkingAccess, revision, refresh, request])
  const stale = !!draft && revision !== undefined && revision > draft.revision
  const dirty = !!draft && JSON.stringify(draft.scenes) !== published
  const reviewExpired = !!review && (review.request !== request || review.source.revision !== draft?.revision ||
    JSON.stringify(review.source.scenes) !== JSON.stringify(draft?.scenes) || revision !== undefined && revision > review.remote.revision)

  const remember = useCallback((next: SceneDraft) => {
    assertSceneDraftSize(next)
    current.current = next
    setDraft(next)
    setWarning(writeSceneDraft(next) ? '' : 'Черновик доступен до закрытия страницы: на устройстве не хватает места. Сохрани изменения на сервер перед выходом.')
  }, [])

  const markOperation = useCallback((value: Operation) => { running.current = value; setOperation(value ? { kind: value, request } : null) }, [request])

  useEffect(() => {
    active.current = true
    if (current.current) remember(current.current)
    return () => { active.current = false; pending.current?.abort(); pending.current = null }
  }, [remember])
  useEffect(() => () => { pending.current?.abort(); pending.current = null; running.current = null; currentReview.current = null }, [request])

  function closeReview() { currentReview.current = null; setReview(null) }

  async function load() {
    if (!active.current || context.current.checkingAccess || pending.current) return
    if (current.current && !window.confirm('Загрузить свежие сцены и заменить черновик сцен?')) return
    setLive(false); closeReview(); setMergeUndo(null)
    const abort = new AbortController(); pending.current = abort; markOperation('load')
    try {
      const result = await request<SceneSnapshot>('/lobbies/' + lobbyId + '/scenes', { signal: abort.signal })
      if (!active.current || abort.signal.aborted || pending.current !== abort || context.current.checkingAccess) return
      if (!isSceneSnapshot(result)) throw Error('Сервер вернул некорректные сцены. Черновик сохранён.')
      const scenes = copySceneState(result.scenes)
      const next = { ...result, scenes, baseScenes: copySceneState(scenes), accountId, lobbyId }
      assertSceneDraftSize(next)
      acknowledged.current = JSON.stringify(scenes)
      setPublished(acknowledged.current)
      remember(next)
      setMessage('Сцены загружены в отдельный черновик.')
    } catch (e) {
      if (active.current && !abort.signal.aborted && pending.current === abort) setMessage((e as Error).message)
    } finally {
      if (active.current && pending.current === abort) { pending.current = null; markOperation(null) }
    }
  }

  function change(scenes: SceneState) {
    if (!active.current || !current.current || context.current.checkingAccess || running.current === 'load' || running.current === 'manual') return { ok: false, message: 'Дождись подтверждения доступа.' }
    const next = { ...current.current, scenes }
    try { assertSceneDraftSize(next); remember(next); setMergeUndo(null); return { ok: true, message: 'Сцены сохранены в черновик.' } }
    catch (e) { return { ok: false, message: (e as Error).message } }
  }

  const publish = useCallback(async (automatic = false) => {
    const source = current.current, access = context.current
    if (!active.current || !source || access.checkingAccess || pending.current) return
    if (access.revision !== undefined && access.revision > source.revision) {
      setLive(false); setMessage('Кампания изменилась. Сверь черновик с сервером перед передачей игрокам.'); return
    }
    const snapshot = JSON.stringify(source.scenes)
    if (snapshot === acknowledged.current) return
    currentReview.current = null; setReview(null); setMergeUndo(null)
    const abort = new AbortController(); pending.current = abort; markOperation(automatic ? 'live' : 'manual')
    try {
      const result = await request<{ revision: number }>('/lobbies/' + lobbyId + '/scenes', {
        signal: abort.signal, method: 'PUT', body: JSON.stringify({ scenes: source.scenes, revision: source.revision }),
      })
      if (!active.current || abort.signal.aborted || pending.current !== abort) return
      const latest = current.current
      if (latest?.revision === source.revision) {
        // Acknowledging one snapshot must retain newer edits made during its PUT.
        acknowledged.current = snapshot
        setPublished(snapshot)
        remember({ ...latest, revision: result.revision, baseScenes: JSON.parse(snapshot) as SceneState })
        setMessage(automatic ? 'Изменения переданы за игровой стол.' : 'Сцены сохранены на сервер.')
        context.current.refresh()
      }
    } catch (e) {
      if (active.current && !abort.signal.aborted && pending.current === abort) {
        setLive(false)
        setMessage((automatic ? 'Прямая передача приостановлена. Черновик сохранён. ' : '') + (e as Error).message)
      }
    } finally {
      if (active.current && pending.current === abort) { pending.current = null; markOperation(null) }
    }
  }, [request, lobbyId, remember, markOperation])

  useEffect(() => {
    if (!live || !draft || operation || checkingAccess || stale || !dirty) return
    const timer = setTimeout(() => void publish(true), 450)
    return () => clearTimeout(timer)
  }, [live, draft, operation, checkingAccess, stale, dirty, publish])

  async function compare() {
    if (!active.current || !current.current || context.current.checkingAccess || pending.current) return
    setLive(false); closeReview()
    const abort = new AbortController(); pending.current = abort; markOperation('compare')
    try {
      const remote = await request<SceneSnapshot>('/lobbies/' + lobbyId + '/scenes', { signal: abort.signal })
      if (!active.current || abort.signal.aborted || pending.current !== abort || context.current.checkingAccess) return
      const source = current.current
      if (!source || !isSceneSnapshot(remote)) throw Error('Не удалось получить корректные сцены для сверки. Черновик сохранён.')
      if (remote.revision < source.revision) throw Error('Получена устаревшая серверная версия. Повтори сверку.')
      assertSceneDraftSize({ ...remote, accountId, lobbyId })
      const snapshot: SceneSnapshot = { revision: remote.revision, scenes: copySceneState(remote.scenes), actors: structuredClone(remote.actors), ...(remote.visuals === undefined ? {} : { visuals: structuredClone(remote.visuals) }) }
      const next = { id: sceneEditorId(), source: structuredClone(source), remote: snapshot, request }
      currentReview.current = next; setReview(next); setMessage('Сверка готова. Проверь спорные изменения перед применением к черновику.')
    } catch (e) {
      if (active.current && !abort.signal.aborted && pending.current === abort) setMessage((e as Error).message)
    } finally {
      if (active.current && pending.current === abort) { pending.current = null; markOperation(null) }
    }
  }

  function applyReview(value: SceneState, source: Review) {
    const latest = current.current, access = context.current
    if (!active.current || !latest || pending.current || access.checkingAccess || source !== currentReview.current || source.request !== access.request ||
      source.source.revision !== latest.revision || JSON.stringify(source.source.scenes) !== JSON.stringify(latest.scenes) || access.revision !== undefined && access.revision > source.remote.revision) {
      setMessage('Сцены или доступ изменились после сверки. Повтори её перед применением.'); return
    }
    if (!isSceneState(value) || !sceneReferencesValid(value, source.remote.actors.map(a => a.id))) { setMessage('Выбранные сцены несовместимы с текущей кампанией. Проверь размеры и опоры.'); return }
    try {
      const scenes = copySceneState(value), next = { ...latest, ...source.remote, scenes, baseScenes: copySceneState(source.remote.scenes) }
      assertSceneDraftSize(next)
      acknowledged.current = JSON.stringify(next.baseScenes); setPublished(acknowledged.current)
      setLive(false); remember(next); setMergeUndo({ before: structuredClone(latest), afterJson: JSON.stringify(scenes), revision: next.revision }); closeReview()
      setMessage('Изменения согласованы в черновике. Сохранение на сервер выполняется отдельно; прямая передача выключена.')
    } catch (e) { setMessage((e as Error).message) }
  }

  function undoMerge() {
    const latest = current.current
    if (!active.current || !latest || !mergeUndo || pending.current || context.current.checkingAccess || latest.revision !== mergeUndo.revision || JSON.stringify(latest.scenes) !== mergeUndo.afterJson) return
    acknowledged.current = mergeUndo.before.baseScenes ? JSON.stringify(mergeUndo.before.baseScenes) : null
    setPublished(acknowledged.current); setLive(false); remember(structuredClone(mergeUndo.before)); setMergeUndo(null); closeReview()
    setMessage('Согласование отменено. Восстановлен прежний черновик; сервер не менялся.')
  }

  function addTavern() {
    if (!current.current || operation || context.current.checkingAccess) return
    try {
      const result = change(addLobbyTavern(current.current.scenes, sceneEditorId()))
      setMessage(result.ok ? 'Таверна добавлена в черновик. Сохрани сцены, затем размести принятых героев через подготовку игры.' : result.message)
    } catch (e) { setMessage((e as Error).message) }
  }

  return <section className="w6-fieldset" aria-label="Редактор сцен кампании">
    <h3>Сцены кампании</h3>
    <p className="w6-copy">Создай обстановку, сохрани её и открой игрокам через подготовку игры. Черновик хранится отдельно для твоего аккаунта и этого лобби.</p>
    <button className="w6-button" disabled={!!operation || checkingAccess} onClick={() => void load()}>{operation === 'load' ? 'Загружаем сцены…' : draft ? 'Загрузить свежие сцены' : 'Открыть сцены в редакторе'}</button>
    {draft && <>
      <p role={stale ? 'alert' : 'status'}>{stale ? 'На сервере новая версия кампании. Черновик сохранён; сверь изменения перед передачей игрокам.' : dirty ? 'В черновике есть изменения для сохранения на сервер.' : 'Все изменения сцен сохранены на сервер.'}</p>
      <div className="w6-buttons">
        <button className="w6-button" disabled={!!operation || checkingAccess} onClick={() => void compare()}>{operation === 'compare' ? 'Сверяем изменения…' : 'Сверить с сервером'}</button>
        <button className="w6-button" disabled={!!operation || checkingAccess || draft.scenes.scenes.length >= 20} onClick={addTavern}>Добавить таверну из примера</button>
        <button className="w6-button w6-primary" disabled={!!operation || checkingAccess || stale || !dirty} onClick={() => void publish()}>Сохранить сцены на сервер</button>
        {onPlay && <button className="w6-button" disabled={!!operation || checkingAccess || stale || dirty || !draft.scenes.scenes.length} onClick={onPlay}>Перейти к игровому столу</button>}
      </div>
      {review && <SceneDraftReview key={review.id} base={review.source.baseScenes} local={review.source.scenes} remote={review.remote.scenes} actors={review.remote.actors} previousActors={review.source.actors} revision={review.remote.revision} disabled={!!operation || checkingAccess} expired={reviewExpired} onApply={value => applyReview(value, review)} onCancel={closeReview}/>}
      {mergeUndo && <button className="w6-button" disabled={!!operation || checkingAccess} onClick={undoMerge}>Отменить согласование черновика</button>}
      <label className="w6-check"><input type="checkbox" checked={live && !stale} disabled={!!operation || checkingAccess || stale} onChange={e => setLive(e.currentTarget.checked)}/> Показывать изменения игрокам сразу</label>
      <p className="w6-copy">При прямой передаче завершённые изменения сохраняются на сервер и появляются в пределах открытого героям обзора.</p>
      <SceneEditor libraryScope={'lobby:' + accountId + ':' + lobbyId} value={draft.scenes} actors={draft.actors} visuals={draft.visuals} disabled={operation === 'load' || operation === 'manual' || checkingAccess} onChange={change}/>
    </>}
    {warning && <p role="alert">{warning}</p>}
    <p className="w6-notice" role="status">{message}</p>
  </section>
}
