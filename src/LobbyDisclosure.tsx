import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import type { SceneState } from './sceneTypes'
import { isSceneState } from './scenes'
import { isPerceptionDraft } from './scenePerception'
import type { PerceptionDraft, PerceivedMap } from './scenePerception'
import PerceivedScene from './PerceivedScene'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
type AreaForm = Record<'x' | 'y' | 'z' | 'width' | 'depth' | 'height', string>
type SignalForm = Record<'actorId' | 'label' | 'signs' | 'x' | 'y' | 'z' | 'radius', string> & { kind: 'identified' | 'silhouette' | 'sound'; showHeight: boolean }
type Saved = { revision: number; draft: PerceptionDraft; scenes: SceneState; actors: { id: string; name: string }[]; areaForm: AreaForm; signalForm: SignalForm }
const emptyArea = (): AreaForm => ({ x: '0', y: '0', z: '0', width: '5', depth: '5', height: '5' })
const emptySignal = (): SignalForm => ({ actorId: '', kind: 'silhouette', label: '', signs: '', showHeight: false, x: '0', y: '0', z: '0', radius: '1' })
const valid = (v: unknown): v is Saved => {
  if (!v || typeof v !== 'object') return false
  const s = v as Saved
  return Number.isSafeInteger(s.revision) && isPerceptionDraft(s.draft) && isSceneState(s.scenes) && Array.isArray(s.actors) && s.actors.length <= 200 && s.actors.every(a => typeof a.id === 'string' && typeof a.name === 'string') &&
    !!s.areaForm && Object.values(s.areaForm).every(x => typeof x === 'string' && x.length <= 40) && !!s.signalForm && typeof s.signalForm.actorId === 'string' &&
    ['identified', 'silhouette', 'sound'].includes(s.signalForm.kind) && typeof s.signalForm.label === 'string' && typeof s.signalForm.signs === 'string' && typeof s.signalForm.showHeight === 'boolean' &&
    ['x', 'y', 'z', 'radius'].every(k => typeof s.signalForm[k as keyof SignalForm] === 'string')
}
export default function LobbyDisclosure({ accountId, lobbyId, characterId, characterName, revision, checkingAccess }: { accountId: string; lobbyId: string; characterId: string; characterName: string; revision: number; checkingAccess: boolean }) {
  const { request, refresh } = useOnline(), key = lobbyFormKey('disclosure', accountId, lobbyId, characterId)
  const [saved, setSaved] = useState(() => readLobbyForm(key, valid)), [selected, setSelected] = useState(''), [preview, setPreview] = useState<PerceivedMap | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [warning, setWarning] = useState('')
  const active = useRef(false), current = useRef(saved), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => pending.current?.abort(), [request])
  function remember(next: Saved) { current.current = next; setSaved(next); setWarning(writeLobbyForm(key, next) ? '' : 'Черновик раскрытия доступен до закрытия страницы: не удалось сохранить его на устройстве.') }
  async function load() {
    if (current.current && !window.confirm('Заменить черновик раскрытия актуальными сведениями сервера?')) return
    const abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<Omit<Saved, 'areaForm' | 'signalForm'> & { preview: PerceivedMap | null }>('/lobbies/' + lobbyId + '/characters/' + characterId + '/disclosure', { signal: abort.signal })
      if (active.current && !abort.signal.aborted) { remember({ revision: result.revision, draft: result.draft, scenes: result.scenes, actors: result.actors, areaForm: emptyArea(), signalForm: emptySignal() }); setSelected(result.draft.activeSceneId ?? ''); setPreview(result.preview) }
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) } finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  async function save() {
    const source = current.current; if (!source || checkingAccess || busy) return
    const abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<{ revision: number }>('/lobbies/' + lobbyId + '/characters/' + characterId + '/disclosure', { signal: abort.signal, method: 'PUT', body: JSON.stringify({ draft: source.draft, revision: source.revision }) })
      if (active.current && !abort.signal.aborted) { remember({ ...source, revision: result.revision }); setPreview(null); setMessage('Раскрытие сохранено только для выбранного героя.'); refresh() }
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) } finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  async function see() {
    const abort = new AbortController(); pending.current = abort; setBusy(true)
    try {
      const result = await request<{ map: PerceivedMap | null }>('/lobbies/' + lobbyId + '/characters/' + characterId + '/perception', { signal: abort.signal })
      if (active.current && !abort.signal.aborted) setPreview(result.map)
    } catch (e) { if (active.current && !abort.signal.aborted) setMessage((e as Error).message) } finally { if (active.current && pending.current === abort) setBusy(false) }
  }
  const scene = saved?.draft.scenes.find(s => s.sceneId === (selected || saved.draft.activeSceneId)), sourceScene = saved?.scenes.scenes.find(s => s.id === scene?.sceneId)
  function update(next: NonNullable<typeof scene>) { if (saved) remember({ ...saved, draft: { ...saved.draft, scenes: saved.draft.scenes.map(s => s.sceneId === next.sceneId ? next : s) } }) }
  function addArea() {
    if (!saved || !scene) return
    const a = Object.fromEntries(Object.entries(saved.areaForm).map(([k, v]) => [k, Number(v)])) as unknown as Omit<import('./scenePerception').KnownArea, 'id' | 'visible'>
    const next = { ...scene, areas: [...scene.areas, { ...a, id: crypto.randomUUID(), visible: true }] }
    if (!Object.values(saved.areaForm).every(v => v.trim() && Number.isFinite(Number(v))) || !isPerceptionDraft({ ...saved.draft, scenes: saved.draft.scenes.map(s => s.sceneId === scene.sceneId ? next : s) })) { setMessage('Проверь числовые границы области.'); return }
    update(next)
  }
  function addContact() {
    if (!saved || !scene) return
    const f = saved.signalForm
    if (!['x', 'y', 'z', 'radius'].every(k => f[k as 'x'].trim() && Number.isFinite(Number(f[k as 'x'])))) { setMessage('Проверь координаты и радиус отметки.'); return }
    const c = { actorId: f.actorId, kind: f.kind, label: f.label, signs: f.signs, showHeight: f.showHeight, point: { x: Number(f.x), y: Number(f.y), z: Number(f.z) }, radius: Number(f.radius) }
    const next = { ...scene, contacts: [...scene.contacts.filter(x => x.actorId !== c.actorId), c] }
    if (!isPerceptionDraft({ ...saved.draft, scenes: saved.draft.scenes.map(s => s.sceneId === scene.sceneId ? next : s) })) { setMessage('Выбери источник и проверь контакт.'); return }
    update(next)
  }
  return <section className="w6-fieldset"><h4>Раскрытие для героя {characterName}</h4><p className="w6-copy">Области и отдельные объекты раскрываются явно. Внутренние имена сцены и скрытые свойства в экран игрока не переносятся. Полный фон пока доступен только в конструкторе мастера.</p>
    <button className="w6-button" disabled={busy || checkingAccess} onClick={() => void load()}>{saved ? 'Загрузить свежее раскрытие' : 'Настроить видимость героя'}</button>
    {saved && <fieldset disabled={busy || checkingAccess}><p className="w6-copy">{saved.revision === revision ? 'Используется текущая версия.' : 'Кампания изменилась. Сохранение старого черновика потребует обновления.'}</p>
      <label className="w6-field"><span>Сцена раскрытия</span><select aria-label="Сцена раскрытия" value={selected || saved.draft.activeSceneId || ''} onChange={e => setSelected(e.currentTarget.value)}><option value="">Выбери сцену</option>{saved.scenes.scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <button className="w6-button" disabled={!selected} onClick={() => { if (!selected) return; remember({ ...saved, draft: { ...saved.draft, activeSceneId: selected, scenes: saved.draft.scenes.some(s => s.sceneId === selected) ? saved.draft.scenes : [...saved.draft.scenes, { sceneId: selected, title: 'Местность', description: '', areas: [], objects: [], contacts: [] }] } }) }}>Открыть выбранную сцену герою</button>
      <button className="w6-button" onClick={() => remember({ ...saved, draft: { ...saved.draft, activeSceneId: null } })}>Закрыть текущую сцену для героя</button>
      {scene && sourceScene && <><label className="w6-field"><span>Название сцены для героя</span><input aria-label="Название сцены для героя" maxLength={120} value={scene.title} onChange={e => update({ ...scene, title: e.currentTarget.value })}/></label>
        <label className="w6-field"><span>Описание сцены для героя</span><textarea aria-label="Описание сцены для героя" maxLength={4000} value={scene.description} onChange={e => update({ ...scene, description: e.currentTarget.value })}/></label>
        <h5>Местность</h5><button className="w6-button" onClick={() => update({ ...scene, areas: [{ id: crypto.randomUUID(), x: 0, y: 0, z: sourceScene.minZ, width: sourceScene.width, depth: sourceScene.depth, height: sourceScene.maxZ - sourceScene.minZ, visible: true }] })}>Раскрыть всю местность</button>
        <p className="w6-copy">Это раскрывает пространство, но не добавляет все объекты и существ автоматически.</p>
        {scene.areas.map(a => <div key={a.id}><label><input type="checkbox" checked={a.visible} onChange={e => update({ ...scene, areas: scene.areas.map(x => x.id === a.id ? { ...x, visible: e.currentTarget.checked } : x) })}/>Текущая видимость области ({a.x}; {a.y}; {a.z})</label><button className="w6-button" onClick={() => update({ ...scene, areas: scene.areas.filter(x => x.id !== a.id) })}>Скрыть область полностью</button></div>)}
        <div className="gb-properties">{Object.entries(saved.areaForm).map(([k, v]) => <label className="w6-field" key={k}><span>{({ x: 'X', y: 'Y', z: 'Z', width: 'Ширина', depth: 'Глубина', height: 'Высота' } as Record<string, string>)[k]} области, м</span><input aria-label={k + ' области'} inputMode="decimal" value={v} onChange={e => remember({ ...saved, areaForm: { ...saved.areaForm, [k]: e.currentTarget.value } })}/></label>)}</div>
        <button className="w6-button" onClick={addArea}>Добавить область видимости</button>
        <h5>Объекты</h5>{sourceScene.objects.map(o => { const grant = scene.objects.find(x => x.objectId === o.id); return <label className="w6-field" key={o.id}><span>{o.name}</span><select aria-label={'Раскрытие объекта ' + o.name} value={!grant ? 'hidden' : grant.visible ? 'visible' : 'known'} onChange={e => { const mode = e.currentTarget.value; update({ ...scene, objects: [...scene.objects.filter(x => x.objectId !== o.id), ...(mode === 'hidden' ? [] : [{ objectId: o.id, visible: mode === 'visible' }])] }) }}><option value="hidden">Неизвестен</option><option value="known">Последнее известное состояние</option><option value="visible">Виден сейчас</option></select></label> })}
        {scene.objects.filter(o => !sourceScene.objects.some(x => x.id === o.objectId)).map(o => <p key={o.objectId}>Запомненный объект, отсутствующий в текущей сцене.<button className="w6-button" onClick={() => update({ ...scene, objects: scene.objects.filter(x => x.objectId !== o.objectId) })}>Забыть запомненный объект</button></p>)}
        <h5>Контакты</h5>{scene.contacts.map(c => <p key={c.actorId}>{saved.actors.find(a => a.id === c.actorId)?.name} · {c.kind === 'identified' ? 'Узнан' : c.kind === 'sound' ? 'Звук' : 'Силуэт'}<button className="w6-button" onClick={() => update({ ...scene, contacts: scene.contacts.filter(x => x.actorId !== c.actorId) })}>Скрыть контакт</button></p>)}
        <label className="w6-field"><span>Источник контакта</span><select aria-label="Источник контакта" value={saved.signalForm.actorId} onChange={e => remember({ ...saved, signalForm: { ...saved.signalForm, actorId: e.currentTarget.value } })}><option value="">Выбери существо</option>{saved.actors.filter(a => a.id !== characterId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="w6-field"><span>Вид контакта</span><select aria-label="Вид контакта" value={saved.signalForm.kind} onChange={e => remember({ ...saved, signalForm: { ...saved.signalForm, kind: e.currentTarget.value as SignalForm['kind'] } })}><option value="silhouette">Неизвестный силуэт</option><option value="identified">Узнанное существо</option><option value="sound">Приблизительная отметка звука</option></select></label>
        <label><input type="checkbox" checked={saved.signalForm.showHeight} onChange={e => remember({ ...saved, signalForm: { ...saved.signalForm, showHeight: e.currentTarget.checked } })}/>Раскрыть высоту и наблюдаемый полёт</label>
        {(['label', 'signs', 'x', 'y', 'z', 'radius'] as const).map(k => <label className="w6-field" key={k}><span>{({ label: 'Подпись контакта (пустая — стандартная)', signs: 'Наблюдаемые признаки', x: 'X отметки звука', y: 'Y отметки звука', z: 'Z отметки звука', radius: 'Радиус приблизительной отметки, м' })[k]}</span><input aria-label={k + ' контакта'} maxLength={k === 'signs' ? 1000 : k === 'label' ? 120 : 40} value={saved.signalForm[k]} onChange={e => remember({ ...saved, signalForm: { ...saved.signalForm, [k]: e.currentTarget.value } })}/></label>)}
        <p className="w6-copy">Для звука используются введённая приблизительная точка и радиус. Силуэт/узнанный контакт показываются по текущей позиции только внутри видимой области. Скрытая высота не выдаётся.</p><button className="w6-button" onClick={addContact}>Добавить или заменить контакт</button>
      </>}
      <button className="w6-button w6-primary" onClick={() => void save()}>Сохранить раскрытие героя</button><button className="w6-button" onClick={() => void see()}>Посмотреть глазами героя</button>
    </fieldset>}
    {preview && <PerceivedScene map={preview}/>}{warning && <p role="alert">{warning}</p>}<p role="status">{message}</p>
  </section>
}
