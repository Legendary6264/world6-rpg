import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Scene, SceneActor, SceneObject, SceneObjectKind, ScenePosition, SceneState, SceneSupport } from './sceneTypes'
import { addSceneObject, createScene, deleteScene, emptyScenes, MAX_SCENES, moveSceneObject,
  placeSceneToken, removeSceneObject, replaceScene, sceneObject, sceneObjectLabels } from './scenes'
import { ArtworkPicker } from './VisualElements'
import SceneViewport, { SceneGlyph } from './SceneViewport'
import type { SceneSelection } from './SceneViewport'
import './sceneStyle.css'

type Props = { value?: SceneState; actors: SceneActor[]; disabled?: boolean;
  onChange: (value: SceneState) => { ok: boolean; message: string } }
type Tool = 'select' | 'move' | 'character' | SceneObjectKind
function Label({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={'w6-field' + (wide ? ' gb-wide' : '')}><span>{label}</span>{children}</label>
}
function Numeric({ name, label, value, min, max }: { name: string; label: string; value: number; min?: number; max?: number }) {
  return <Label label={label}><input name={name} type="number" step="any" required defaultValue={value} min={min} max={max}/></Label>
}
const formData = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); return new FormData(event.currentTarget) }
const str = (data: FormData, key: string) => String(data.get(key) ?? '')
const num = (data: FormData, key: string) => { const v = str(data, key); return v.trim() ? Number(v) : NaN }
const coords = (data: FormData): ScenePosition => ({ x: num(data, 'x'), y: num(data, 'y'), z: num(data, 'z') })

export default function SceneEditor({ value, actors, disabled = false, onChange }: Props) {
  const state = value ?? emptyScenes(), scene = state.scenes.find(s => s.id === state.activeSceneId)
  const [tool, setTool] = useState<Tool>('select'), [selection, setSelection] = useState<SceneSelection>(null)
  const [actorId, setActorId] = useState(''), [message, setMessage] = useState('')
  const selectedObject = selection?.kind === 'object' ? scene?.objects.find(o => o.id === selection.id) : undefined
  const selectedToken = selection?.kind === 'token' ? scene?.tokens.find(t => t.actorId === selection.id) : undefined
  function perform(operation: () => SceneState): boolean {
    if (disabled) return false
    try { const r = onChange(operation()); setMessage(r.message); return r.ok }
    catch (e) { setMessage((e as Error).message); return false }
  }
  function select(next: SceneSelection) { setSelection(next); setTool('select') }
  function place(point: ScenePosition) {
    if (!scene || disabled) return
    if (tool === 'select') { setSelection(null); return }
    if (tool === 'move') {
      if (selectedObject) perform(() => moveSceneObject(state, scene.id, { ...selectedObject, ...point,
        y: scene.view === 'side' ? selectedObject.y : point.y, z: scene.view === 'top' ? selectedObject.z : point.z }))
      else if (selectedToken) {
        const token = { ...selectedToken, x: point.x, y: scene.view === 'side' ? selectedToken.y : point.y,
          z: scene.view === 'side' ? point.z : selectedToken.z }
        if (token.support.kind === 'ground') token.z = scene.groundZ
        perform(() => placeSceneToken(state, scene.id, token))
      } else setMessage('Сначала выбери объект или персонажа в списке, затем нажми «Передвинуть».')
      return
    }
    if (tool === 'character') {
      if (!actors.some(a => a.id === actorId)) { setMessage('Выбери персонажа для размещения.'); return }
      if (perform(() => placeSceneToken(state, scene.id, { actorId, x: point.x, y: point.y,
        z: scene.groundZ, diameter: 1, support: { kind: 'ground' } }))) setSelection({ kind: 'token', id: actorId })
      return
    }
    const objectId = crypto.randomUUID(), asset = sceneObject(tool, objectId, point)
    asset.width = Math.min(asset.width, scene.width); asset.depth = Math.min(asset.depth, scene.depth)
    if (perform(() => addSceneObject(state, scene.id, asset))) setSelection({ kind: 'object', id: objectId })
  }
  function saveScene(event: FormEvent<HTMLFormElement>, current: Scene) {
    const d = formData(event), groundZ = num(d, 'groundZ')
    const next = { ...current, name: str(d, 'name').trim(), description: str(d, 'description'),
      width: num(d, 'width'), depth: num(d, 'depth'), groundZ, minZ: num(d, 'minZ'), maxZ: num(d, 'maxZ'),
      view: str(d, 'view') as Scene['view'], palette: str(d, 'palette') as Scene['palette'],
      tokens: current.tokens.map(t => t.support.kind === 'ground' ? { ...t, z: groundZ } : t) }
    perform(() => replaceScene(state, next))
  }
  function saveObject(event: FormEvent<HTMLFormElement>, current: SceneObject) {
    if (!scene) return
    const d = formData(event)
    perform(() => moveSceneObject(state, scene.id, { ...current, ...coords(d), name: str(d, 'name').trim(),
      width: num(d, 'width'), depth: num(d, 'depth'), height: num(d, 'height'),
      blocksMovement: d.has('blocksMovement'), blocksSight: d.has('blocksSight'), canSupport: d.has('canSupport'), open: d.has('open') }))
  }
  function saveToken(event: FormEvent<HTMLFormElement>) {
    if (!scene || !selectedToken) return
    const d = formData(event), supportKey = str(d, 'support'), at = coords(d)
    const support: SceneSupport = supportKey === 'ground' ? { kind: 'ground' } : supportKey === 'air' ? { kind: 'air' } : { kind: 'object', objectId: supportKey.slice(7) }
    if (support.kind === 'ground') at.z = scene.groundZ
    else if (support.kind === 'object') { const o = scene.objects.find(o => o.id === support.objectId); if (o) at.z = o.z + o.height }
    perform(() => placeSceneToken(state, scene.id, { ...selectedToken, ...at, support, diameter: num(d, 'diameter') }))
  }
  const positionFields = (at: ScenePosition) => <><Numeric name="x" label="X (м)" value={at.x} min={0} max={scene?.width}/><Numeric name="y" label="Y (м)" value={at.y} min={0} max={scene?.depth}/><Numeric name="z" label="Z — высота (м)" value={at.z} min={scene?.minZ} max={scene?.maxZ}/></>
  return <section className="gb-scene-editor" aria-label="Конструктор сцен мастера">
    <header className="gb-scene-heading"><div><p className="w6-eyebrow">Грани Бытия · сцены</p><h2>Стол мастера</h2></div><span>{state.scenes.length} / {MAX_SCENES} сцен</span></header>
    <p className="w6-copy">Расстановка мастера: координаты и опоры задаются вручную. Игровое движение и затраты способностей остаются в действующей системе правил. Сцены пока доступны только редакторам кампании.</p>
    <form className="gb-scene-setup" onSubmit={e => { const form = e.currentTarget, d = formData(e), sceneId = crypto.randomUUID();
      if (perform(() => createScene(state, sceneId, str(d, 'sceneName'), str(d, 'sceneView') as Scene['view']))) { setSelection(null); setTool('select'); form.reset() } }}>
      <Label label="Название новой сцены"><input name="sceneName" required maxLength={120} placeholder="Например, площадь у ворот"/></Label>
      <Label label="Вид новой сцены"><select name="sceneView"><option value="top">Сверху</option><option value="side">Сбоку</option></select></Label>
      <button className="w6-button w6-primary" disabled={disabled || state.scenes.length >= MAX_SCENES}>Создать сцену</button>
    </form>
    <div className="gb-scene-toolbar"><Label label="Открытая сцена"><select aria-label="Открытая сцена" value={state.activeSceneId ?? ''} disabled={disabled}
      onChange={e => { const sceneId = e.currentTarget.value; if (perform(() => ({ ...state, activeSceneId: sceneId || null }))) { setSelection(null); setTool('select') } }}>
      <option value="">Не открыта</option>{state.scenes.map(s => <option value={s.id} key={s.id}>{s.name} · {s.view === 'top' ? 'сверху' : 'сбоку'}</option>)}</select></Label>
      {scene && <button type="button" className="w6-button w6-danger" disabled={disabled} onClick={() => {
        if (window.confirm('Удалить сцену «' + scene.name + '» и её расстановку? Листы персонажей останутся.')) {
          if (perform(() => deleteScene(state, scene.id))) setSelection(null)
        }
      }}>Удалить сцену</button>}
    </div>
    {scene ? <>
      <div className="gb-scene-tools">
        <button className={'w6-button' + (tool === 'select' ? ' w6-active' : '')} type="button" onClick={() => setTool('select')}>Выбрать</button>
        <button className={'w6-button' + (tool === 'move' ? ' w6-active' : '')} type="button" disabled={disabled || !selectedObject && !selectedToken} onClick={() => setTool('move')}>Передвинуть по клику</button>
        <Label label="Персонаж для размещения"><select aria-label="Персонаж для размещения" value={actorId} onChange={e => setActorId(e.currentTarget.value)}>
          <option value="">Выбери персонажа</option>{actors.map(a => <option key={a.id} value={a.id}>{a.name || 'Без имени'}</option>)}</select></Label>
        <button className={'w6-button' + (tool === 'character' ? ' w6-active' : '')} type="button" disabled={disabled || !actorId} onClick={() => setTool('character')}>Поставить персонажа</button>
      </div>
      <div className="gb-scene-assets" aria-label="Ассеты окружения">{(Object.keys(sceneObjectLabels) as SceneObjectKind[]).map(kind => <button
        key={kind} type="button" className={'w6-button' + (tool === kind ? ' w6-active' : '')} disabled={disabled} onClick={() => setTool(kind)}><SceneGlyph kind={kind}/>{sceneObjectLabels[kind]}</button>)}</div>
      {tool !== 'select' && <button type="button" className="w6-button" disabled={disabled} onClick={() => place({x:scene.width/2,y:scene.depth/2,z:scene.groundZ})}>Разместить в центре</button>}
      <p className="w6-copy">{tool === 'select' ? 'Выбери объект на карте или в списке. Точные координаты доступны ниже.' : tool === 'move' ? 'Нажми на карту, чтобы передвинуть выбранный объект. В боковом виде глубина Y сохраняется.' : tool === 'character' ? 'Нажми на карту. Персонаж будет перенесён сюда из прежней сцены и поставлен на землю.' : 'Нажми на карту, чтобы разместить: ' + sceneObjectLabels[tool] + '.'}</p>
      <div className="gb-scene-layout"><SceneViewport scene={scene} actors={actors} selection={selection} onSelect={select} onPoint={place} selecting={tool === 'select'}/>
        <aside className="gb-scene-sidebar"><h3>Расстановка</h3><p>{scene.objects.length} объектов · {scene.tokens.length} персонажей</p>
          <div className="gb-scene-entities">{scene.tokens.map(t => <button type="button" className={'w6-button' + (selection?.kind === 'token' && selection.id === t.actorId ? ' w6-active' : '')} key={t.actorId} onClick={() => select({ kind: 'token', id: t.actorId })}>{actors.find(a => a.id === t.actorId)?.name || 'Без имени'}<small>{t.support.kind === 'air' ? '↑ В воздухе' : 'На опоре'} · Z {t.z} м</small></button>)}</div>
          <div className="gb-scene-entities">{scene.objects.map(o => <button type="button" className={'w6-button' + (selection?.kind === 'object' && selection.id === o.id ? ' w6-active' : '')} key={o.id} onClick={() => select({ kind: 'object', id: o.id })}>{o.name}<small>{sceneObjectLabels[o.kind]} · Z {o.z} м</small></button>)}</div>
        </aside></div>
      {selectedObject && <details className="gb-scene-details" open><summary>Объект: {selectedObject.name}</summary><form key={JSON.stringify(selectedObject)} className="gb-properties" onSubmit={e => saveObject(e, selectedObject)}>
        <Label label="Название объекта" wide><input name="name" required maxLength={120} defaultValue={selectedObject.name}/></Label>{positionFields(selectedObject)}
        <Numeric name="width" label="Ширина (м)" value={selectedObject.width} min={.1} max={scene.width}/><Numeric name="depth" label="Глубина (м)" value={selectedObject.depth} min={.1} max={scene.depth}/><Numeric name="height" label="Высота объекта (м)" value={selectedObject.height} min={0}/>
        {(['blocksMovement', 'blocksSight', 'canSupport', ...(selectedObject.kind === 'door' ? ['open'] : [])] as const).map(k => <label className="w6-check" key={k}><input type="checkbox" name={k} defaultChecked={selectedObject[k as keyof SceneObject] === true}/>{({ blocksMovement: 'Препятствие движению', blocksSight: 'Закрывает обзор', canSupport: 'Можно стоять сверху', open: 'Дверь открыта' } as Record<string, string>)[k]}</label>)}
        <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" disabled={disabled}>Сохранить параметры объекта</button><button className="w6-button w6-danger" type="button" disabled={disabled} onClick={() => { if (perform(() => removeSceneObject(state, scene.id, selectedObject.id))) setSelection(null) }}>Убрать объект</button></div>
      </form></details>}
      {selectedToken && <details className="gb-scene-details" open><summary>Положение персонажа</summary><form key={JSON.stringify(selectedToken)} className="gb-properties" onSubmit={saveToken}>
        {positionFields(selectedToken)}<Numeric name="diameter" label="Занимаемый диаметр (м)" value={selectedToken.diameter} min={.1} max={100}/>
        <Label label="Опора персонажа"><select name="support" defaultValue={selectedToken.support.kind === 'object' ? 'object:' + selectedToken.support.objectId : selectedToken.support.kind}>
          <option value="ground">Земля сцены</option><option value="air">В воздухе</option>{scene.objects.filter(o => o.canSupport).map(o => <option key={o.id} value={'object:' + o.id}>{o.name} · верх {o.z + o.height} м</option>)}</select></Label>
        <p className="w6-copy gb-wide">При опоре на землю или объект Z вычисляется по поверхности. Для объекта X/Y должны лежать на нём. Диаметр задаёт пространство тела, а не размер портрета. Состояние «В воздухе» назначает мастер; оно не выдаёт способность полёта.</p>
        <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" disabled={disabled}>Сохранить положение</button><button className="w6-button" type="button" disabled={disabled} onClick={() => {
          if (perform(() => replaceScene(state, { ...scene, tokens: scene.tokens.filter(t => t.actorId !== selectedToken.actorId) }))) setSelection(null)
        }}>Убрать со сцены</button></div>
      </form></details>}
      <details className="gb-scene-details"><summary>Параметры сцены и фон</summary><form key={JSON.stringify([scene.id, scene.name, scene.view, scene.width, scene.depth, scene.groundZ, scene.minZ, scene.maxZ, scene.palette, scene.description])} className="gb-properties" onSubmit={e => saveScene(e, scene)}>
        <Label label="Название сцены" wide><input name="name" required maxLength={120} defaultValue={scene.name}/></Label>
        <Label label="Описание сцены" wide><textarea name="description" maxLength={4000} defaultValue={scene.description}/></Label>
        <Numeric name="width" label="Размер X (м)" value={scene.width} min={.1}/><Numeric name="depth" label="Размер Y (м)" value={scene.depth} min={.1}/>
        <Label label="Вид сцены"><select name="view" defaultValue={scene.view}><option value="top">Сверху</option><option value="side">Сбоку</option></select></Label>
        <Numeric name="groundZ" label="Земля Z (м)" value={scene.groundZ}/><Numeric name="minZ" label="Нижняя граница Z (м)" value={scene.minZ}/><Numeric name="maxZ" label="Верхняя граница Z (м)" value={scene.maxZ}/>
        <Label label="Оформление окружения"><select name="palette" defaultValue={scene.palette}><option value="forest">Природа</option><option value="stone">Камень</option><option value="neon">Неон и металл</option></select></Label>
        <div className="gb-wide"><button className="w6-button w6-primary" disabled={disabled}>Сохранить параметры сцены</button></div>
      </form><p className="w6-copy">Параметры формы применяются кнопкой сохранения. Расстановка и сохранённые параметры входят в черновик кампании. Уменьшение сцены не перемещает объекты автоматически.</p>
      {!disabled && <ArtworkPicker key={scene.id} label="Фон сцены" value={scene.background} presets={[]} onChange={background => perform(() => replaceScene(state, { ...scene, background }))}/>}</details>
    </> : <div className="gb-scene-empty"><h3>Начни с первой сцены</h3><p>Создай место, размести окружение и добавь портреты персонажей.</p></div>}
    {message && <p className="gb-scene-state" role="status">{message}</p>}
  </section>
}
