import type { SceneAbilityVisual } from './sceneAbilityVisuals'
import { useEffect,useRef,useState } from 'react'
import type { FormEvent, KeyboardEvent,ReactNode } from 'react'
import type { Scene, SceneActor, SceneObject, SceneObjectKind, ScenePosition, SceneState, SceneSupport } from './sceneTypes'
import { addSceneObject, createScene, deleteScene, emptyScenes, MAX_SCENES, moveSceneObject,
  placeSceneToken, removeSceneObject, replaceScene, sceneObject, sceneObjectLabels } from './scenes'
import { sceneBackgroundPresets, objectPresets, artworkMetadata, artworkLabels, isTiledArtwork } from './visualMedia'
import { ArtworkPicker } from './VisualElements'
import SceneViewport, { SceneGlyph } from './SceneViewport'
import type { SceneSelection } from './SceneViewport'
import './sceneStyle.css'
import { snapScenePoint } from './scene3dModel'
import {duplicateEditorObject,removeEditorSelection,translateEditorSelection} from './sceneEditorCommands'

type Props = { value?: SceneState; visuals?:Record<string,SceneAbilityVisual[]>; actors: SceneActor[]; disabled?: boolean;
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

export default function SceneEditor({ value, actors, disabled = false, onChange, visuals }: Props) {
  const state = value ?? emptyScenes(), scene = state.scenes.find(s => s.id === state.activeSceneId)
  const [tool, setTool] = useState<Tool>('select'), [selection, setSelection] = useState<SceneSelection>(null)
  const [toolArtwork,setToolArtwork]=useState('auto')
  const [snap, setSnap] = useState(false), [snapStep, setSnapStep] = useState(1)
  const [actorId, setActorId] = useState(''), [message, setMessage] = useState('')
  const [search,setSearch]=useState(''),[expanded,setExpanded]=useState(false)
  const [history,setHistory]=useState<{past:SceneState[];future:SceneState[]}>({past:[],future:[]})
  const expected=useRef(JSON.stringify(state)),stateJson=JSON.stringify(state)
  useEffect(()=>{
    if(expected.current===stateJson)return
    expected.current=stateJson
    // oxlint-disable-next-line react/set-state-in-effect -- External draft replacement invalidates local undo history.
    setHistory({past:[],future:[]});setSelection(null)
  },[stateJson])
  const selectedObject = selection?.kind === 'object' ? scene?.objects.find(o => o.id === selection.id) : undefined
  const selectedToken = selection?.kind === 'token' ? scene?.tokens.find(t => t.actorId === selection.id) : undefined
  function perform(operation: () => SceneState): boolean {
    if (disabled) return false
    try {
      const next=operation(),json=JSON.stringify(next)
      if(json===stateJson)return true
      const r=onChange(next);setMessage(r.message)
      if(r.ok){expected.current=json;setHistory(h=>{
        const past=[...h.past,structuredClone(state)].slice(-30)
        let bytes=past.reduce((n,s)=>n+JSON.stringify(s).length*2,0)
        while(bytes>8*1024*1024&&past.length>1)bytes-=JSON.stringify(past.shift()).length*2
        return {past,future:[]}
      })}
      return r.ok
    }
    catch (e) { setMessage((e as Error).message); return false }
  }
  function undo(redo=false){
    if(disabled)return
    const source=redo?history.future:history.past,next=source.at(-1)
    if(!next)return
    try{const r=onChange(structuredClone(next));if(!r.ok){setMessage(r.message);return}
      expected.current=JSON.stringify(next)
      setHistory(redo?{past:[...history.past,structuredClone(state)],future:history.future.slice(0,-1)}:{past:history.past.slice(0,-1),future:[...history.future,structuredClone(state)]})
      setMessage(redo?'Изменение возвращено.':'Последнее изменение отменено.')
    }catch(e){setMessage((e as Error).message)}
  }
  function duplicate(){if(selectedObject){const id=crypto.randomUUID();if(perform(()=>duplicateEditorObject(state,selectedObject.id,id,snap?snapStep:.5)))setSelection({kind:'object',id})}}
  function remove(){if(selection&&perform(()=>removeEditorSelection(state,selection)))setSelection(null)}
  function keydown(event:KeyboardEvent<HTMLElement>){
    if((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]'))return
    const key=event.key.toLowerCase(),command=event.ctrlKey||event.metaKey
    if(command&&key==='z'){event.preventDefault();undo(event.shiftKey);return}
    if(command&&key==='y'){event.preventDefault();undo(true);return}
    if(command&&key==='d'){event.preventDefault();duplicate();return}
    if(command||event.repeat&&['delete','backspace'].includes(key))return
    if(key==='escape'){event.preventDefault();setSelection(null);setTool('select');return}
    if(key==='v'){event.preventDefault();setTool('select');return}
    if(key==='g'&&selection){event.preventDefault();setTool('move');return}
    if(key==='delete'){event.preventDefault();remove();return}
    const directions:Record<string,ScenePosition>={arrowleft:{x:-1,y:0,z:0},arrowright:{x:1,y:0,z:0},arrowup:{x:0,y:-1,z:0},arrowdown:{x:0,y:1,z:0},pageup:{x:0,y:0,z:1},pagedown:{x:0,y:0,z:-1}}
    if(selection&&directions[key]){event.preventDefault();event.stopPropagation();const d=directions[key],step=(snap?snapStep:.25)*(event.shiftKey?10:event.altKey?.1:1);perform(()=>translateEditorSelection(state,selection,{x:d.x*step,y:d.y*step,z:d.z*step}))}
  }
  function select(next: SceneSelection) { setSelection(next); setTool('select') }
  function place(point: ScenePosition) {
    if (!scene || disabled) return
    point = snapScenePoint(point, snap, snapStep, scene)
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
    if(toolArtwork!=='auto'){asset.artwork=toolArtwork;asset.name=artworkLabels[toolArtwork]??asset.name}
    asset.width = Math.min(asset.width, scene.width); asset.depth = Math.min(asset.depth, scene.depth)
    if (perform(() => addSceneObject(state, scene.id, asset))) setSelection({ kind: 'object', id: objectId })
  }
  function saveScene(event: FormEvent<HTMLFormElement>, current: Scene) {
    const d = formData(event), groundZ = num(d, 'groundZ')
    const next = { ...current, name: str(d, 'name').trim(), description: str(d, 'description'),
      width: num(d, 'width'), depth: num(d, 'depth'), groundZ, minZ: num(d, 'minZ'), maxZ: num(d, 'maxZ'),
      view: str(d, 'view') as Scene['view'], palette: str(d, 'palette') as Scene['palette'], ...(d.has('backgroundTileSizeM')?{backgroundTileSizeM:num(d,'backgroundTileSizeM')}:{ }),
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
  return <section className={'gb-scene-editor'+(expanded?' gb-editor-expanded':'')} aria-label="Конструктор сцен мастера" tabIndex={-1} onKeyDown={keydown}>
    <header className="gb-scene-heading"><div><p className="w6-eyebrow">Грани Бытия · сцены</p><h2>Стол мастера</h2></div><span>{state.scenes.length} / {MAX_SCENES} сцен</span></header>
    <div className="gb-editor-commandbar" role="toolbar" aria-label="Команды редактора">
      <button className="w6-button" type="button" disabled={disabled||!history.past.length} onClick={()=>undo()} title="Ctrl+Z">↶ Отменить</button>
      <button className="w6-button" type="button" disabled={disabled||!history.future.length} onClick={()=>undo(true)} title="Ctrl+Shift+Z">↷ Вернуть</button>
      <button className="w6-button" type="button" disabled={disabled||!selectedObject} onClick={duplicate} title="Ctrl+D">Дублировать</button>
      <button className="w6-button" type="button" disabled={disabled||!selection} onClick={remove} title="Delete">Удалить выбранное</button>
      <button className="w6-button" type="button" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Свернуть рабочее поле':'Развернуть рабочее поле'}</button>
      <span>{selectedObject?.name??(selectedToken?actors.find(a=>a.id===selectedToken.actorId)?.name:'Выбери объект')}</span>
    </div>
    <p className="w6-copy">Расстановка мастера: координаты и опоры задаются вручную. Игровое движение и затраты способностей остаются в действующей системе правил. Сцены пока доступны только редакторам кампании.</p>
    <details className="gb-scene-details"><summary>Создать новую сцену</summary><form className="gb-scene-setup" onSubmit={e => { const form = e.currentTarget, d = formData(e), sceneId = crypto.randomUUID();
      if (perform(() => createScene(state, sceneId, str(d, 'sceneName'), str(d, 'sceneView') as Scene['view']))) { setSelection(null); setTool('select'); form.reset() } }}>
      <Label label="Название новой сцены"><input name="sceneName" required maxLength={120} placeholder="Например, площадь у ворот"/></Label>
      <Label label="Вид новой сцены"><select name="sceneView"><option value="top">Сверху</option><option value="side">Сбоку</option></select></Label>
      <button className="w6-button w6-primary" disabled={disabled || state.scenes.length >= MAX_SCENES}>Создать сцену</button>
    </form></details>
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
        <label><input type="checkbox" checked={snap} onChange={e => setSnap(e.currentTarget.checked)}/> Привязка к сетке</label>
        <label>Шаг (м) <select aria-label="Шаг привязки к сетке" value={snapStep} onChange={e => setSnapStep(Number(e.currentTarget.value))}>{[.25, .5, 1, 2].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <button className={'w6-button' + (tool === 'select' ? ' w6-active' : '')} type="button" onClick={() => setTool('select')}>Выбрать</button>
        <button className={'w6-button' + (tool === 'move' ? ' w6-active' : '')} type="button" disabled={disabled || !selectedObject && !selectedToken} onClick={() => setTool('move')}>Передвинуть по клику</button>
        <Label label="Персонаж для размещения"><select aria-label="Персонаж для размещения" value={actorId} onChange={e => setActorId(e.currentTarget.value)}>
          <option value="">Выбери персонажа</option>{actors.map(a => <option key={a.id} value={a.id}>{a.name || 'Без имени'}</option>)}</select></Label>
        <button className={'w6-button' + (tool === 'character' ? ' w6-active' : '')} type="button" disabled={disabled || !actorId} onClick={() => setTool('character')}>Поставить персонажа</button>
      </div>
      <div className="gb-scene-assets" aria-label="Ассеты окружения">{(Object.keys(sceneObjectLabels) as SceneObjectKind[]).map(kind => <button
        key={kind} type="button" className={'w6-button' + (tool === kind ? ' w6-active' : '')} disabled={disabled} onClick={() => {setTool(kind);setToolArtwork('auto')}}><SceneGlyph kind={kind}/>{sceneObjectLabels[kind]}</button>)}</div>
      <details className="gb-scene-details"><summary>Библиотека окружения · {objectPresets.length} изображений</summary><ArtworkPicker label="Объект для размещения" value={toolArtwork} presets={objectPresets} disabled={disabled} onChange={key=>{setToolArtwork(key);setTool(artworkMetadata[key]?.objectKind??'crate')}}/><p className="w6-copy">Выбери изображение и нажми на сцену. Размеры и свойства объекта доступны после размещения.</p></details>
      {tool !== 'select' && <button type="button" className="w6-button" disabled={disabled} onClick={() => place({x:scene.width/2,y:scene.depth/2,z:scene.groundZ})}>Разместить в центре</button>}
      <p className="w6-copy">{tool === 'select' ? 'Выбери объект на карте или в списке. Координаты и размеры доступны в панели справа.' : tool === 'move' ? 'Нажми на карту, чтобы передвинуть выбранный объект. В боковом виде глубина Y сохраняется.' : tool === 'character' ? 'Нажми на карту. Персонаж будет перенесён сюда из прежней сцены и поставлен на землю.' : 'Нажми на карту, чтобы разместить: ' + (toolArtwork==='auto'?sceneObjectLabels[tool]:artworkLabels[toolArtwork]) + '.'}</p>
      <p className="gb-editor-shortcuts">V — выбрать · G — перемещать · стрелки — шаг XY · Page Up/Down — высота · Shift — ×10 · Alt — ×0,1 · Ctrl+D — копия · Delete — убрать · Ctrl+Z — отмена · Esc — снять выбор</p>
      <div className="gb-scene-layout"><SceneViewport scene={scene} actors={actors} visuals={visuals?.[scene.id]} selection={selection} onSelect={next=>{setSelection(next);if(tool!=='move')setTool('select')}} onPoint={place} selecting={tool === 'select'||tool==='move'}
        onMove={tool==='move'&&!disabled?(picked,at)=>{const source=picked.kind==='object'?scene.objects.find(o=>o.id===picked.id):scene.tokens.find(t=>t.actorId===picked.id);return source?perform(()=>translateEditorSelection(state,picked,{x:at.x-source.x,y:at.y-source.y,z:0})):false}:undefined}
        snapStep={snap?snapStep:undefined}/>
        <aside className="gb-scene-sidebar">      {selectedObject && <details className="gb-scene-details" open><summary>Объект: {selectedObject.name}</summary><form key={JSON.stringify(selectedObject)} className="gb-properties" onSubmit={e => saveObject(e, selectedObject)}>
        <Label label="Название объекта" wide><input name="name" required maxLength={120} defaultValue={selectedObject.name}/></Label>{positionFields(selectedObject)}
        <Numeric name="width" label="Ширина (м)" value={selectedObject.width} min={.1} max={scene.width}/><Numeric name="depth" label="Глубина (м)" value={selectedObject.depth} min={.1} max={scene.depth}/><Numeric name="height" label="Высота объекта (м)" value={selectedObject.height} min={0}/>
        {(['blocksMovement', 'blocksSight', 'canSupport', ...(selectedObject.kind === 'door' ? ['open'] : [])] as const).map(k => <label className="w6-check" key={k}><input type="checkbox" name={k} defaultChecked={selectedObject[k as keyof SceneObject] === true}/>{({ blocksMovement: 'Препятствие движению', blocksSight: 'Закрывает обзор', canSupport: 'Можно стоять сверху', open: 'Дверь открыта' } as Record<string, string>)[k]}</label>)}
        <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" disabled={disabled}>Сохранить параметры объекта</button><button className="w6-button w6-danger" type="button" disabled={disabled} onClick={() => { if (perform(() => removeSceneObject(state, scene.id, selectedObject.id))) setSelection(null) }}>Убрать объект</button></div>
      </form><ArtworkPicker label="Изображение объекта" value={selectedObject.artwork} presets={objectPresets} disabled={disabled} onChange={artwork=>perform(()=>moveSceneObject(state,scene.id,{...selectedObject,artwork}))}/></details>}
      {selectedToken && <details className="gb-scene-details" open><summary>Положение персонажа</summary><form key={JSON.stringify(selectedToken)} className="gb-properties" onSubmit={saveToken}>
        {positionFields(selectedToken)}<Numeric name="diameter" label="Занимаемый диаметр (м)" value={selectedToken.diameter} min={.1} max={100}/>
        <Label label="Опора персонажа"><select name="support" defaultValue={selectedToken.support.kind === 'object' ? 'object:' + selectedToken.support.objectId : selectedToken.support.kind}>
          <option value="ground">Земля сцены</option><option value="air">В воздухе</option>{scene.objects.filter(o => o.canSupport).map(o => <option key={o.id} value={'object:' + o.id}>{o.name} · верх {o.z + o.height} м</option>)}</select></Label>
        <p className="w6-copy gb-wide">При опоре на землю или объект Z вычисляется по поверхности. Для объекта X/Y должны лежать на нём. Диаметр задаёт пространство тела, а не размер портрета. Состояние «В воздухе» назначает мастер; оно не выдаёт способность полёта.</p>
        <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" disabled={disabled}>Сохранить положение</button><button className="w6-button" type="button" disabled={disabled} onClick={() => {
          if (perform(() => replaceScene(state, { ...scene, tokens: scene.tokens.filter(t => t.actorId !== selectedToken.actorId) }))) setSelection(null)
        }}>Убрать со сцены</button></div>
      </form></details>}
<h3>Расстановка</h3><p>{scene.objects.length} объектов · {scene.tokens.length} персонажей</p>
          <label className="w6-field"><span>Поиск по расстановке</span><input type="search" value={search} onChange={e=>setSearch(e.currentTarget.value)} placeholder="Название или тип…"/></label>
          <div className="gb-scene-entities">{scene.tokens.filter(t=>(actors.find(a=>a.id===t.actorId)?.name??'').toLowerCase().includes(search.toLowerCase())).map(t => <button type="button" className={'w6-button' + (selection?.kind === 'token' && selection.id === t.actorId ? ' w6-active' : '')} key={t.actorId} onClick={() => select({ kind: 'token', id: t.actorId })}>{actors.find(a => a.id === t.actorId)?.name || 'Без имени'}<small>{t.support.kind === 'air' ? '↑ В воздухе' : 'На опоре'} · Z {t.z} м</small></button>)}</div>
          <div className="gb-scene-entities">{scene.objects.filter(o=>(o.name+' '+sceneObjectLabels[o.kind]).toLowerCase().includes(search.toLowerCase())).map(o => <button type="button" className={'w6-button' + (selection?.kind === 'object' && selection.id === o.id ? ' w6-active' : '')} key={o.id} onClick={() => select({ kind: 'object', id: o.id })}>{o.name}<small>{sceneObjectLabels[o.kind]} · Z {o.z} м</small></button>)}</div>
        </aside></div>
      <details className="gb-scene-details"><summary>Параметры сцены и фон</summary><form key={JSON.stringify([scene.id, scene.name, scene.view, scene.width, scene.depth, scene.groundZ, scene.minZ, scene.maxZ, scene.palette, scene.description,scene.backgroundTileSizeM])} className="gb-properties" onSubmit={e => saveScene(e, scene)}>
        <Label label="Название сцены" wide><input name="name" required maxLength={120} defaultValue={scene.name}/></Label>
        <Label label="Описание сцены" wide><textarea name="description" maxLength={4000} defaultValue={scene.description}/></Label>
        <Numeric name="width" label="Размер X (м)" value={scene.width} min={.1}/><Numeric name="depth" label="Размер Y (м)" value={scene.depth} min={.1}/>
        <Label label="Вид сцены"><select name="view" defaultValue={scene.view}><option value="top">Сверху</option><option value="side">Сбоку</option></select></Label>
        <Numeric name="groundZ" label="Земля Z (м)" value={scene.groundZ}/><Numeric name="minZ" label="Нижняя граница Z (м)" value={scene.minZ}/><Numeric name="maxZ" label="Верхняя граница Z (м)" value={scene.maxZ}/>
        <Label label="Оформление окружения"><select name="palette" defaultValue={scene.palette}><option value="forest">Природа</option><option value="stone">Камень</option><option value="neon">Неон и металл</option></select></Label>
        {isTiledArtwork(scene.background)&&<Numeric name="backgroundTileSizeM" label="Размер повторения поверхности (м)" value={scene.backgroundTileSizeM??4} min={.1} max={1000}/>}
        <div className="gb-wide"><button className="w6-button w6-primary" disabled={disabled}>Сохранить параметры сцены</button></div>
      </form><p className="w6-copy">Параметры формы применяются кнопкой сохранения. Расстановка и сохранённые параметры входят в черновик кампании. Уменьшение сцены не перемещает объекты автоматически.</p>
      {!disabled && <ArtworkPicker key={scene.id} label="Фон сцены" value={scene.background} presets={sceneBackgroundPresets} onChange={background => perform(() => replaceScene(state, { ...scene, background }))}/>}</details>
    </> : <div className="gb-scene-empty"><h3>Начни с первой сцены</h3><p>Создай место, размести окружение и добавь портреты персонажей.</p></div>}
    {message && <p className="gb-scene-state" role="status">{message}</p>}
  </section>
}
