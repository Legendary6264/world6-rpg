import {editorKey} from './sceneEditorKeyboard'
import {sceneEditorId} from './sceneEditorId'
import type { SceneAbilityVisual } from './sceneAbilityVisuals'
import { useEffect,useLayoutEffect,useRef,useState } from 'react'
import type { CSSProperties,FormEvent, KeyboardEvent,ReactNode } from 'react'
import type { Scene, SceneActor, SceneObject, SceneObjectKind, ScenePosition, SceneState, SceneSupport } from './sceneTypes'
import { addSceneObject, createScene, deleteScene, emptyScenes, MAX_SCENES, moveSceneObject,
  placeSceneToken, removeSceneObject, replaceScene, sceneObjectLabels } from './scenes'
import { sceneBackgroundPresets, objectPresets, artworkMetadata, artworkLabels, isTiledArtwork } from './visualMedia'
import { ArtworkPicker } from './VisualElements'
import SceneViewport from './SceneViewport'
import type { SceneSelection } from './SceneViewport'
import './sceneStyle.css'
import './tabletopWorkspace.css'
import './editorErgonomics.css'
import EditorIcon from './EditorIcon'
import {applyBuildStroke,buildStrokeMarks} from './tabletopBuild'
import type {BuildMark} from './tabletopBuild'
import type {TabletopBrush} from './tabletopCommands'
import {objectActions,operateSceneObject,supportsObjectOperation} from './tabletopInteractions'
import {objectOpenStateLabel} from './legacyObjectBehavior'
import type {ObjectOperation} from './tabletopInteractions'
import {isSceneState,sceneReferencesValid} from './scenes'
import {selectionAllowed} from './scene3dModel'
import type {SelectionFilter} from './scene3dModel'
import { snapScenePoint } from './scene3dModel'
import {duplicateEditorGroup,removeEditorGroup,translateEditorGroup,rotateEditorGroup,arrangeEditorObjects,spaceEditorObjects,scaleEditorObjects} from './sceneEditorCommands'
import {resolveAssetPlacement,resolveObjectPlacement,surfacePlacementObject,flatPlacementSurface,createEnvironmentObject} from './sceneEditorPlacement'
import {surfaceContents,surfaceContentsSelection} from './sceneEditorContents'
import SceneContentsActions from './SceneContentsActions'
import {legacyAssets} from './legacyAssets'
import TabletopLibrary from './TabletopLibrary'
import {isFloorAsset,tabletopAsset} from './tabletopCatalog'
import {rotateTabletopObject} from './tabletopCommands'
import SceneAssemblyLibrary,{useAssemblyLibrary} from './SceneAssemblyLibrary'
import {captureSceneAssembly,stampSceneAssembly} from './sceneAssemblies'
import {assertEditorLayerChange} from './sceneEditorLayers'
import type {EditorLayers} from './sceneEditorLayers'
import {useEditorWorkspace} from './sceneEditorWorkspace'
import type {EditorWorkspace} from './sceneEditorWorkspace'
import SceneScaleControl from './SceneScaleControl'
import SceneArrangeControl from './SceneArrangeControl'
import SceneGroupPosition from './SceneGroupPosition'
import {editorObjectBounds,positionEditorObjects} from './sceneEditorTransform'
import {assertEditorObjectBounds} from './sceneEditorBounds'
import SceneContextMenu from './SceneContextMenu'
import type {ScenePickTarget} from './sceneEditorPicking'
import WorkspaceDivider from './WorkspaceDivider'
import EditorControlsHelp from './EditorControlsHelp'
import SceneOutliner from './SceneOutliner'
import type {EditorItem} from './sceneEditorCommands'
import {captureEditorClipboard,editorObjectCount} from './sceneEditorClipboard'
import {lowerEditorObjects} from './sceneEditorLower'
import type {EditorClipboard} from './sceneEditorClipboard'
import ScenePasteControls from './ScenePasteControls'
import {maxAssemblyRowCopies,resolvePasteShape} from './sceneAssemblyRow'
import {visiblePasteBatches,pasteHistoryAvailable,finishPasteSelection} from './sceneEditorPaste'
import type {EditorPasteSession} from './sceneEditorPaste'
import type {ScenePointOptions} from './sceneAssemblies'
import {copyEditorScene} from './sceneEditorSceneCopy'
import SceneCopyControl from './SceneCopyControl'

type Props = { value?: SceneState; visuals?:Record<string,SceneAbilityVisual[]>; actors: SceneActor[]; disabled?: boolean;
  mode?:'play'|'build';workspace?:boolean;libraryScope?:string;
  onChange: (value: SceneState) => { ok: boolean; message: string } }
const environmentGroups=([['flora','Деревья и растения'],['mineral','Камни и минералы'],['furniture','Мебель и предметы'],['structure','Постройки и механизмы']] as const).map(([id,label])=>({id,label,keys:legacyAssets.filter(a=>a.group===id).map(a=>a.id)}))
const environmentThumbnails=Object.fromEntries(legacyAssets.map(a=>[a.id,import.meta.env.BASE_URL+'legacy-thumbnails/'+a.slug+'.png']))
type Tool = 'paste' | 'select' | 'move' | 'character' | 'catalog' | 'assembly' | 'paint' | 'erase' | 'wall-line' | 'room' | 'rectangle' | 'measure' | SceneObjectKind
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

function ToolButton({icon,label,onClick,disabled=false,pressed}:{icon:string;label:string;onClick:()=>void;disabled?:boolean;pressed?:boolean}){
 return <button className="gb-tool-button" type="button" title={label} aria-label={label} disabled={disabled} aria-pressed={pressed} onClick={onClick}><EditorIcon name={icon}/><span className="gb-sr-only">{label}</span></button>
}
export default function SceneEditor({ value, actors, disabled = false, onChange, visuals, mode='build',workspace=false,libraryScope }: Props) {
  const state = value ?? emptyScenes(), scene = state.scenes.find(s => s.id === state.activeSceneId)
  const [tool, setTool] = useState<Tool>('select'), [selection, setPrimary] = useState<SceneSelection>(null)
  const assemblyLibrary=useAssemblyLibrary(libraryScope)
  const workspaceSettings=useEditorWorkspace(libraryScope)
  const {libraryTab,layerMap,libraryOpen,gizmo,selectionFilter,surfaceSnap,snap,snapStep,panels}=workspaceSettings.value
  const setter=<K extends keyof EditorWorkspace>(key:K)=>(value:EditorWorkspace[K]|((previous:EditorWorkspace[K])=>EditorWorkspace[K]))=>workspaceSettings.setField(key,value)
  const setLibraryTab=setter('libraryTab'),setLibraryOpen=setter('libraryOpen'),setGizmo=setter('gizmo'),setSelectionFilter=setter('selectionFilter'),setSurfaceSnap=setter('surfaceSnap'),setSnap=setter('snap'),setSnapStep=setter('snapStep')
  const setPanels=setter('panels'),[controlsHelp,setControlsHelp]=useState(false)
  function setLayerMap(map:Record<string,EditorLayers>){workspaceSettings.setField('layerMap',Object.fromEntries(state.scenes.filter(s=>Object.hasOwn(map,s.id)).map(s=>{const ids=new Set(s.objects.map(o=>o.id));return [s.id,{hidden:map[s.id].hidden.filter(id=>ids.has(id)),protected:map[s.id].protected.filter(id=>ids.has(id))}]})))}
  const [assemblyId,setAssemblyId]=useState(''),[assemblyElevation,setAssemblyElevation]=useState(0)
  const selectedAssembly=assemblyLibrary.items.find(a=>a.id===assemblyId)
  const [copied,setCopied]=useState<{scope?:string;value:EditorClipboard}|null>(null)
  const clipboard=copied?.scope===libraryScope?copied?.value:undefined
  const [pasteSession,setPasteSession]=useState<EditorPasteSession|null>(null),currentPaste=useRef<EditorPasteSession|null>(null)
  function keepPaste(next:EditorPasteSession|null){currentPaste.current=next;setPasteSession(next)}
  const paste=tool==='paste'&&mode==='build'&&!disabled&&pasteSession?.scope===libraryScope&&pasteSession?.sceneId===scene?.id?pasteSession:null
  const layers=mode==='build'&&scene&&Object.hasOwn(layerMap,scene.id)?layerMap[scene.id]:{hidden:[],protected:[]}
  const visibleSurfaces=scene?.objects.filter(o=>!layers.hidden.includes(o.id))??[]
  const [groupSelection,setGroupSelection]=useState<NonNullable<SceneSelection>[]>([])
  const activeSelection=groupSelection.filter(item=>item.kind==='object'?scene?.objects.some(o=>o.id===item.id):scene?.tokens.some(t=>t.actorId===item.id))
  function setSelection(next:SceneSelection){setPrimary(next);setGroupSelection(next?[next]:[])}
  const [toolArtwork,setToolArtwork]=useState('auto')
  const [inspector,setInspector]=useState<'properties'|'layers'|'scene'>('properties')
  const [context,setContext]=useState<{x:number;y:number;targets:ScenePickTarget[]}|null>(null),fileInput=useRef<HTMLInputElement>(null)
  const [catalogId,setCatalogId]=useState('table'),[facing,setFacing]=useState(0),[brushSize,setBrushSize]=useState(1)
  const [actorId, setActorId] = useState(''), [message, setMessage] = useState('')
  const [expanded,setExpanded]=useState(false),[focusRequest,setFocusRequest]=useState(0)
  const [history,setHistory]=useState<{past:SceneState[];future:SceneState[]}>({past:[],future:[]})
  const expected=useRef(JSON.stringify(state)),expectedScope=useRef(libraryScope),stateJson=JSON.stringify(state),mounted=useRef(true)
  const liveEdit=useRef({disabled,scope:libraryScope,json:stateJson,onChange,actorIds:actors.map(a=>a.id),layerMap,mode,tool})
  useLayoutEffect(()=>{liveEdit.current={disabled,scope:libraryScope,json:stateJson,onChange,actorIds:actors.map(a=>a.id),layerMap,mode,tool}})
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false}},[])
  useEffect(()=>{
    if(expected.current===stateJson&&expectedScope.current===libraryScope)return
    const scopeChanged=expectedScope.current!==libraryScope;expectedScope.current=libraryScope
    expected.current=stateJson
    // oxlint-disable-next-line react/set-state-in-effect -- External draft replacement invalidates local undo history.
    setHistory({past:[],future:[]});setSelection(null);setContext(null)
    if(currentPaste.current){keepPaste(null);setTool('select');if(!scopeChanged)setMessage('Вставка остановлена: сцены заменены извне. Буфер сохранён.')}
    if(scopeChanged){setTool('select');setAssemblyId('');setCopied(null);setContext(null);setMessage('')}
  },[stateJson,libraryScope])
  useEffect(()=>{if(tool!=='paste'){if(currentPaste.current)keepPaste(null);return}if(disabled||mode!=='build'){keepPaste(null);setTool('select')}},[disabled,mode,tool])
  const pasteShape=paste?resolvePasteShape(paste.clipboard.assembly,paste.facing,paste.elevation,paste.row):{error:''}
  const pasteCount=visiblePasteBatches(scene,paste?.batches??[]).length
  const pasteCanUndo=!!paste&&pasteHistoryAvailable(paste,state,history.past.at(-1)),pasteCanRedo=!!paste&&pasteHistoryAvailable(paste,state,history.future.at(-1),true)
  const placementFacing=paste?.facing??facing
  const selectedObject = selection?.kind === 'object' ? scene?.objects.find(o => o.id === selection.id) : undefined
  const contentsAvailable=!!selectedObject&&mode==='build'&&flatPlacementSurface(selectedObject)&&!isFloorAsset(selectedObject.asset)
  const contentsItems=scene&&contentsAvailable?surfaceContents(scene,activeSelection):[]
  const contentsBlocked=contentsItems.some(i=>i.kind==='object'&&(layers.hidden.includes(i.id)||layers.protected.includes(i.id)))
  const selectionBlocked=activeSelection.some(s=>s.kind==='object'&&(layers.hidden.includes(s.id)||layers.protected.includes(s.id)))
  const selectedToken = selection?.kind === 'token' ? scene?.tokens.find(t => t.actorId === selection.id) : undefined
  function checkLayers(next:SceneState){if(liveEdit.current.mode==='build')for(const [sceneId,blocked] of Object.entries(liveEdit.current.layerMap))assertEditorLayerChange(state,next,sceneId,[...blocked.hidden,...blocked.protected])}
  function perform(operation: () => SceneState): boolean {
    if (!mounted.current||disabled||liveEdit.current.disabled||liveEdit.current.scope!==libraryScope||liveEdit.current.json!==stateJson||expectedScope.current!==libraryScope) return false
    try {
      const next=operation();checkLayers(next);const json=JSON.stringify(next)
      if(json===stateJson){setMessage('Изменений нет.');return true}
      const r=liveEdit.current.onChange(next);setMessage(r.message)
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
    if(!mounted.current||disabled||liveEdit.current.disabled||liveEdit.current.scope!==libraryScope||liveEdit.current.json!==stateJson||expected.current!==stateJson)return
    const source=redo?history.future:history.past,next=source.at(-1)
    if(tool==='paste'&&(!pasteReady()||!pasteHistoryAvailable(pasteSession,state,next,redo)))return
    if(!next)return
    try{checkLayers(next);const r=liveEdit.current.onChange(structuredClone(next));if(!r.ok){setMessage(r.message);return}
      expected.current=JSON.stringify(next)
      setHistory(redo?{past:[...history.past,structuredClone(state)],future:history.future.slice(0,-1)}:{past:history.past.slice(0,-1),future:[...history.future,structuredClone(state)]})
      setMessage(redo?'Изменение возвращено.':'Последнее изменение отменено.')
    }catch(e){setMessage((e as Error).message)}
  }
  function copyItems(items:readonly EditorItem[]){
    if(!scene||!mounted.current||mode!=='build'||liveEdit.current.mode!=='build'||liveEdit.current.scope!==libraryScope||liveEdit.current.json!==stateJson||expected.current!==stateJson)return
    try{const value=captureEditorClipboard(scene,items);setCopied({scope:libraryScope,value});setMessage(`В буфере: ${editorObjectCount(value.assembly.objects.length)}. Ctrl+V — выбрать место вставки.`+(value.skippedActors?' Персонажи остаются в исходной сцене.':''));setContext(null)}catch(error){setMessage((error as Error).message)}
  }
  function copySelection(){copyItems(activeSelection)}
  function getContents(){
    if(!scene||!mounted.current||mode!=='build'||liveEdit.current.mode!=='build'||liveEdit.current.scope!==libraryScope||liveEdit.current.json!==stateJson||expected.current!==stateJson)throw Error('Сцена или режим изменились. Выбери опору заново.')
    if(!selectedObject||!flatPlacementSurface(selectedObject)||isFloorAsset(selectedObject.asset))throw Error('Выбери опору с плоской поверхностью.')
    const latest=liveEdit.current.layerMap[scene.id]
    return surfaceContentsSelection(scene,activeSelection,[...(latest?.hidden??[]),...(latest?.protected??[])])
  }
  function copyContents(){try{copyItems(getContents().all)}catch(error){setMessage((error as Error).message)}}
  function pasteReady(){
    return !!pasteSession&&mounted.current&&currentPaste.current===pasteSession&&!disabled&&!liveEdit.current.disabled&&mode==='build'&&liveEdit.current.mode==='build'&&liveEdit.current.tool==='paste'&&liveEdit.current.scope===libraryScope&&pasteSession.scope===libraryScope&&pasteSession.sceneId===scene?.id&&liveEdit.current.json===stateJson&&expected.current===stateJson
  }
  function changePaste(patch:Partial<Pick<EditorPasteSession,'repeat'|'facing'|'elevation'|'row'>>){if(pasteReady())keepPaste({...pasteSession!,...patch})}
  function beginPaste(){
    if(!mounted.current||disabled||liveEdit.current.disabled||mode!=='build'||liveEdit.current.mode!=='build'||liveEdit.current.scope!==libraryScope||liveEdit.current.json!==stateJson||expected.current!==stateJson)return
    if(!clipboard){setMessage('Буфер редактора пуст. Выдели объекты и нажми Ctrl+C.');return}
    if(!scene){setMessage('Выбери сцену для вставки.');return}
    if(pasteReady()){setMessage('Вставка уже открыта. Выбери место на сцене; Esc — завершить.');return}
    keepPaste({scope:libraryScope,sceneId:scene.id,clipboard,originalItems:activeSelection,primary:selection,repeat:false,facing:0,elevation:clipboard.elevation,batches:[]})
    setSelection(null);setTool('paste');setContext(null);setMessage('Выбери место вставки. R — поворот, Esc — отмена.')
  }
  function cancelPaste(){
    if(!pasteReady()||!scene)return
    const result=finishPasteSelection(pasteSession!,scene)
    setGroupSelection(result.items);setPrimary(result.primary);keepPaste(null)
    setTool('select');setContext(null);setInspector('properties');setMessage(result.count?'Вставка завершена. Последняя вставка выделена; буфер сохранён.':'Вставка отменена. Скопированная группа сохранена в буфере.')
  }
  function duplicateItems(items:readonly EditorItem[],withActors=0){
    let copies:EditorItem[]=[]
    if(perform(()=>{const result=duplicateEditorGroup(state,items,()=>sceneEditorId(),snap?snapStep:.5);copies=result.items;return result.state})){
      setPrimary(copies.at(-1)??null);setGroupSelection(copies);setTool('select')
      setMessage(`Продублировано: ${editorObjectCount(copies.length)}.`+(withActors?' Герои остались на исходных опорах.':''))
    }
  }
  function duplicate(){duplicateItems(activeSelection)}
  function duplicateContents(){try{const contents=getContents();duplicateItems(contents.items,contents.actorCount);setContext(null)}catch(error){setMessage((error as Error).message)}}
  function remove(){if(activeSelection.length&&perform(()=>removeEditorGroup(state,activeSelection)))setSelection(null)}
  function copyCurrentScene(name:string){
    if(!scene||mode!=='build'||liveEdit.current.mode!=='build'||expected.current!==stateJson)return
    if(perform(()=>copyEditorScene(state,scene.id,name,()=>sceneEditorId()))){
      setSelection(null);setTool('select');keepPaste(null);setContext(null);setInspector('scene')
      setMessage('Создана сцена «'+name.trim()+'»: '+editorObjectCount(scene.objects.length)+'. Герои остались в исходных сценах.')
    }
  }
  function lower(groundOnly=false){
    if(mode!=='build'||liveEdit.current.mode!=='build')return
    let result:ReturnType<typeof lowerEditorObjects>|undefined
    if(perform(()=>{const hidden=scene?liveEdit.current.layerMap[scene.id]?.hidden:undefined;result=lowerEditorObjects(state,activeSelection,{groundOnly,hidden});return result.state})&&result){
      setMessage(result.distance?`${editorObjectCount(result.objectCount)} · опущено на ${result.distance.toLocaleString('ru-RU',{maximumFractionDigits:6})} м · ${result.surfaceName}.`:('Группа уже стоит на опоре: '+result.surfaceName+'.'));setContext(null)
    }
  }
  const environmentTool=(Object.keys(sceneObjectLabels) as string[]).includes(tool)
  function rotate(){if(tool==='paste'){if(pasteSession)changePaste({facing:(pasteSession.facing+90)%360})}else if(tool==='catalog'||tool==='assembly'||environmentTool)setFacing(v=>(v+90)%360);else if(activeSelection.length>1)perform(()=>rotateEditorGroup(state,activeSelection));else if(selectedObject)perform(()=>rotateTabletopObject(state,selectedObject.id))}
  const brush:TabletopBrush|undefined=tool==='measure'?{asset:null,size:1,mode:'measure'}:['paint','erase','wall-line','room','rectangle'].includes(tool)?{asset:tool==='erase'?null:tool==='wall-line'&&!['wall','door'].includes(tabletopAsset(catalogId)?.kind??'')?'timber-wall':catalogId,size:brushSize,mode:tool==='wall-line'?'wall':tool==='room'?'room':tool==='rectangle'?'rectangle':'floor',facing}:undefined
  function paint(points:ScenePosition[]){return !!brush&&perform(()=>applyBuildStroke(state,points as BuildMark[],brush,()=>sceneEditorId()))}
  function interact(operation:ObjectOperation){if(scene&&selectedObject)perform(()=>moveSceneObject(state,scene.id,operateSceneObject(selectedObject,operation)))}
  function chooseTool(next:Tool){if(tool==='paste'&&next==='select'){cancelPaste();return}setTool(next);setContext(null);if(next==='wall-line'&&!['wall','door'].includes(tabletopAsset(catalogId)?.kind??''))setCatalogId('timber-wall');if(['paint','rectangle','room'].includes(next)&&!isFloorAsset(catalogId))setCatalogId('floor-wood')}
  function exportScene(){if(!scene)return;const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,activeSceneId:scene.id,scenes:[scene]},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=scene.name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g,'_')+'.grani-scene.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  async function importScenes(file:File){
    const importBase=expected.current,scopeAtStart=libraryScope
    try{
      if(disabled||liveEdit.current.disabled)return
      if(file.size>10*1024*1024)throw Error('Файл сцены превышает 10 МБ.')
      const raw=await file.text()
      if(!mounted.current||liveEdit.current.scope!==scopeAtStart)return
      if(liveEdit.current.disabled){setMessage('Импорт отменён: редактор доступен только для чтения.');return}
      if(expected.current!==importBase||liveEdit.current.json!==importBase)throw Error('Сцена изменилась во время чтения файла. Повтори импорт.')
      const candidate:unknown=JSON.parse(raw)
      if(!isSceneState(candidate)||!sceneReferencesValid(candidate,liveEdit.current.actorIds))throw Error('Некорректная сцена или неизвестные персонажи.')
      const ids=new Set(candidate.scenes.map(s=>s.id))
      if(state.scenes.some(s=>ids.has(s.id))&&!window.confirm('Заменить сцены с совпадающими идентификаторами содержимым файла?'))return
      const moving=new Set(candidate.scenes.flatMap(s=>s.tokens.map(t=>t.actorId)))
      perform(()=>{
        const next:SceneState={...state,activeSceneId:candidate.activeSceneId,scenes:[...state.scenes.filter(s=>!ids.has(s.id)).map(s=>({...s,tokens:s.tokens.filter(t=>!moving.has(t.actorId))})),...candidate.scenes]}
        if(!isSceneState(next)||!sceneReferencesValid(next,liveEdit.current.actorIds))throw Error('Импорт превышает лимиты сцен или содержит несовместимые связи.')
        return next
      })
    }catch(e){if(mounted.current&&liveEdit.current.scope===scopeAtStart)setMessage((e as Error).message)}
  }
  function keydown(event:KeyboardEvent<HTMLElement>){
    if((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]'))return
    const key=editorKey(event),command=event.ctrlKey||event.metaKey
    if(command&&mode==='build'&&(key==='c'||key==='v')){event.preventDefault();if(!event.repeat){if(key==='c')copySelection();else beginPaste()}return}
    if(tool==='paste'&&(command&&['z','y','a','d'].includes(key)||!command&&['delete','backspace','e','end','arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown'].includes(key))){event.preventDefault();if(command&&(key==='z'||key==='y')){if(pasteSession?.batches.length)undo(key==='y'||event.shiftKey);else if(key==='z'&&!event.shiftKey)cancelPaste()}return}
    if(command&&key==='z'){event.preventDefault();undo(event.shiftKey);return}
    if(command&&key==='y'){event.preventDefault();undo(true);return}
    if(command&&key==='a'&&scene){event.preventDefault();const all=[...scene.objects.map(o=>({kind:'object' as const,id:o.id})),...scene.tokens.map(t=>({kind:'token' as const,id:t.actorId}))];const filtered=all.filter(s=>!(s.kind==='object'&&(layers.hidden.includes(s.id)||layers.protected.includes(s.id)))&&selectionAllowed(s,s.kind==='token'?'actor':scene.objects.find(o=>o.id===s.id)??'',mode==='build'?selectionFilter:'all'));setPrimary(filtered.at(-1)??null);setGroupSelection(filtered);return}
    if(command&&key==='d'){event.preventDefault();duplicate();return}
    if(command||event.repeat&&['delete','backspace'].includes(key))return
    if(key==='?'||key==='f1'){event.preventDefault();setControlsHelp(v=>!v);return}
    if(key==='end'&&mode==='build'){event.preventDefault();if(!event.repeat)lower(event.shiftKey);return}
    if(key==='o'){event.preventDefault();setInspector('layers');setPanels(p=>({...p,inspectorOpen:true}));return}
    if(key==='i'){event.preventDefault();setPanels(p=>({...p,inspectorOpen:!p.inspectorOpen}));return}
    if(key==='escape'){event.preventDefault();if(tool==='paste'){cancelPaste();return}setSelection(null);setContext(null);setTool('select');return}
    if(key==='v'){event.preventDefault();if(tool==='paste')cancelPaste();else setTool('select');return}
    if(key==='g'&&event.shiftKey&&selectedObject&&mode==='build'){event.preventDefault();selectContents();return}
    if(key==='g'&&selection){event.preventDefault();setTool('move');return}
    if(key==='delete'){event.preventDefault();remove();return}
    if(key==='m'){event.preventDefault();chooseTool('measure');return}
    if(key==='b'){event.preventDefault();setLibraryOpen(v=>!v);return}
    if(key==='x'){event.preventDefault();setGizmo(v=>!v);return}
    if(key==='q'){event.preventDefault();chooseTool('room');return}
    if(key==='p'){event.preventDefault();chooseTool('paint');return}
    if(key==='w'){event.preventDefault();chooseTool('wall-line');return}
    if(key==='e'&&selectedObject){event.preventDefault();const action=objectActions(selectedObject).find(a=>!a.disabled);if(action)interact(action.operation);return}
    if(key==='r'){event.preventDefault();rotate();return}
    const directions:Record<string,ScenePosition>={arrowleft:{x:-1,y:0,z:0},arrowright:{x:1,y:0,z:0},arrowup:{x:0,y:-1,z:0},arrowdown:{x:0,y:1,z:0},pageup:{x:0,y:0,z:1},pagedown:{x:0,y:0,z:-1}}
    if(selection&&directions[key]){event.preventDefault();event.stopPropagation();const d=directions[key],step=(snap?snapStep:.25)*(event.shiftKey?10:event.altKey?.1:1);perform(()=>translateEditorGroup(state,activeSelection,{x:d.x*step,y:d.y*step,z:d.z*step}))}
  }
  function select(next:SceneSelection,options?:{extend?:boolean}){
    if(!next){setSelection(null);return}
    const contains=activeSelection.some(v=>v.kind===next.kind&&v.id===next.id)
    const items=options?.extend?(contains?activeSelection.filter(v=>v.kind!==next.kind||v.id!==next.id):[...activeSelection,next]):contains?activeSelection:[next]
    setPrimary(items.some(v=>v.kind===next.kind&&v.id===next.id)?next:items.at(-1)??null);setGroupSelection(items);setContext(null);setInspector('properties');if(tool!=='move')setTool('select')
  }
  function selectMany(items:NonNullable<SceneSelection>[]){setPrimary(items.at(-1)??null);setGroupSelection(items);setContext(null);setInspector('properties');setTool('select')}
  function selectContents(){
    try{
      const contents=getContents()
      setGroupSelection(contents.items);setTool('select');setInspector('properties');setContext(null)
      setMessage(`Выделено: ${editorObjectCount(contents.objectCount)}.`+(contents.items.some(i=>i.kind==='token')?' Явно выбранные герои остались в группе. Для масштаба и сборки сними их выделение.':(contents.actorCount?' Герои на опорах переместятся автоматически.':'')+' Можно перенести, повернуть, масштабировать или сохранить в сборку.'))
      return true
    }catch(error){setMessage((error as Error).message);return false}
  }
  function moveContents(){if(selectContents()){setTool('move');setMessage('Выбери новое место композиции на сцене. Взаимное положение и высоты предметов сохранятся.')}}
  function setObjectLayers(ids:string[],flag:keyof EditorLayers,value:boolean){
    if(!scene||disabled||liveEdit.current.disabled||liveEdit.current.scope!==libraryScope)return
    const valid=new Set(scene.objects.filter(o=>ids.includes(o.id)).map(o=>o.id)),current=Object.hasOwn(layerMap,scene.id)?layerMap[scene.id]:{hidden:[],protected:[]}
    setLayerMap({...layerMap,[scene.id]:{...current,[flag]:value?[...new Set([...current[flag],...valid])]:current[flag].filter(id=>!valid.has(id))}})
    if(flag==='hidden'&&value){const rest=activeSelection.filter(s=>s.kind!=='object'||!valid.has(s.id));setGroupSelection(rest);if(selection?.kind==='object'&&valid.has(selection.id))setPrimary(rest.at(-1)??null)}
  }
  function toggleLayer(id:string,flag:keyof EditorLayers){setObjectLayers([id],flag,!layers[flag].includes(id))}
  function selectInOutliner(items:EditorItem[],primary:EditorItem|null){
    setPrimary(primary?.kind==='object'?{kind:'object',id:primary.id}:primary?{kind:'token',id:primary.id}:null)
    setGroupSelection(items.map(i=>i.kind==='object'?{kind:'object',id:i.id}:{kind:'token',id:i.id}));setContext(null);setTool('select')
  }
  function moveSelection(picked:NonNullable<SceneSelection>,at:ScenePosition,options?:{surfaceId:string|null}){
    if(!scene)return false
    const source=picked.kind==='object'?scene.objects.find(o=>o.id===picked.id):scene.tokens.find(t=>t.actorId===picked.id)
    if(!source)return false
    const items=activeSelection.some(v=>v.kind===picked.kind&&v.id===picked.id)?activeSelection:[picked]
    return perform(()=>{
      const target=options&&mode==='build'&&surfaceSnap&&picked.kind==='object'&&items.length===1
        ?resolveObjectPlacement(scene,visibleSurfaces,source as SceneObject,at,{surfaceSnap:true,...options}).object:at
      return translateEditorGroup(state,items,{x:target.x-source.x,y:target.y-source.y,z:target.z-source.z})
    })
  }
  function place(point: ScenePosition,options?:ScenePointOptions) {
    if (!scene || disabled) return
    if(mode==='play'){setSelection(null);return}
    const placementStep=options?.resolved?undefined:snap?snapStep:undefined
    if(!options?.resolved&&tool!=='assembly'&&tool!=='paste')point = snapScenePoint(point, snap, snapStep, scene)
    if (tool === 'select') { setSelection(null); return }
    if(brush){if(brush.mode!=='measure')paint(buildStrokeMarks(brush,point,point,scene));return}
    if(tool==='paste'){
      if(!pasteReady())return
      const session=pasteSession!,shape=resolvePasteShape(session.clipboard.assembly,session.facing,session.elevation,session.row)
      if(!shape.placement){setMessage(shape.error);return}
      const placement=shape.placement
      let items:EditorItem[]=[]
      if(perform(()=>{const result=stampSceneAssembly(state,placement.assembly,point,placement.facing,()=>sceneEditorId(),placement.elevation,placementStep);items=result.items;return result.state})){
        if(session.repeat){keepPaste({...session,batches:[...visiblePasteBatches(scene,session.batches),items]});setMessage(`Вставлено: ${editorObjectCount(items.length)}. Выбери следующее место; Esc — завершить.`)}
        else{setPrimary(items.at(-1)??null);setGroupSelection(items);setTool('select');keepPaste(null);setInspector('properties');setMessage(`Вставлено: ${editorObjectCount(items.length)}. Ctrl+Z — отменить вставку.`)}
      }
      return
    }
    if(tool==='assembly'){
      if(!selectedAssembly){setMessage('Выбери сборку в библиотеке.');return}
      let items:NonNullable<SceneSelection>[]=[]
      if(perform(()=>{const result=stampSceneAssembly(state,selectedAssembly,point,facing,()=>sceneEditorId(),assemblyElevation,placementStep);items=result.items;return result.state})){setPrimary(items.at(-1)??null);setGroupSelection(items)}
      return
    }
    if(tool==='catalog'){
      const objectId=sceneEditorId()
      if(perform(()=>{const {object}=resolveAssetPlacement(scene,visibleSurfaces,catalogId,objectId,point,facing,{surfaceSnap,snapStep:placementStep,...options});return addSceneObject(state,scene.id,object)}))setSelection({kind:'object',id:objectId})
      return
    }
    if (tool === 'move') {
      if (selectedObject) {
        if(mode==='build'&&surfaceSnap&&scene.view==='top'&&activeSelection.length===1&&surfacePlacementObject(selectedObject))perform(()=>{const {object}=resolveObjectPlacement(scene,visibleSurfaces,selectedObject,point,{surfaceSnap:true,snapStep:snap?snapStep:undefined});return translateEditorGroup(state,activeSelection,{x:object.x-selectedObject.x,y:object.y-selectedObject.y,z:object.z-selectedObject.z})})
        else moveSelection({kind:'object',id:selectedObject.id},{...point,y:scene.view==='side'?selectedObject.y:point.y,z:scene.view==='top'?selectedObject.z:point.z})
      }
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
    const objectId = sceneEditorId()
    if(perform(()=>{const source=createEnvironmentObject(tool as SceneObjectKind,toolArtwork,objectId,{...point,z:scene.groundZ},facing)
      if(toolArtwork!=='auto')source.name=artworkLabels[toolArtwork]??source.name
      const {object}=resolveObjectPlacement(scene,visibleSurfaces,source,point,{surfaceSnap,snapStep:placementStep,...options})
      return addSceneObject(state,scene.id,object)}))setSelection({kind:'object',id:objectId})
  }
  function saveScene(event: FormEvent<HTMLFormElement>, current: Scene) {
    const d = formData(event), groundZ = num(d, 'groundZ')
    const next = { ...current, name: str(d, 'name').trim(), description: str(d, 'description'),
      width: num(d, 'width'), depth: num(d, 'depth'), groundZ, minZ: num(d, 'minZ'), maxZ: num(d, 'maxZ'),
      view: str(d, 'view') as Scene['view'], palette: str(d, 'palette') as Scene['palette'], environment:(str(d,'environment')==='auto'?undefined:str(d,'environment')) as Scene['environment'], ...(d.has('backgroundTileSizeM')?{backgroundTileSizeM:num(d,'backgroundTileSizeM')}:{ }),
      tokens: current.tokens.map(t => t.support.kind === 'ground' ? { ...t, z: groundZ } : t) }
    perform(() => {if(next.width!==current.width||next.depth!==current.depth)assertEditorObjectBounds(next,next.objects);return replaceScene(state,next)})
  }
  function saveObject(event: FormEvent<HTMLFormElement>, current: SceneObject) {
    if (!scene) return
    const d = formData(event)
    perform(() => {const next={ ...current, ...coords(d), name: str(d, 'name').trim(),
      width: num(d, 'width'), depth: num(d, 'depth'), height: num(d, 'height'),
      blocksMovement: d.has('blocksMovement'), blocksSight: d.has('blocksSight'), canSupport: d.has('canSupport'), open: supportsObjectOperation(current,'open')?d.has('open'):current.open }
      if(next.x!==current.x||next.y!==current.y||next.width!==current.width||next.depth!==current.depth)assertEditorObjectBounds(scene,[next])
      return moveSceneObject(state,scene.id,next)
    })
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
  return <section className={'gb-scene-editor gb-tabletop-workspace'+(workspace?' gb-workspace-full':'')+(expanded?' gb-editor-expanded':'')+(mode==='play'?' gb-workspace-play':'')} aria-label="Конструктор сцен мастера" tabIndex={-1} onKeyDownCapture={event=>{if(tool==='paste'&&event.key==='Escape'&&!(event.target as HTMLElement).closest('[role=dialog],[role=menu]')){event.preventDefault();event.stopPropagation();cancelPaste()}}} onKeyDown={keydown} onPointerDown={()=>{if(context)setContext(null)}}>
    <header className="gb-workspace-commandbar">
      <div className="gb-workspace-scene"><EditorIcon name="layers"/><label><span className="gb-sr-only">Открытая сцена</span><select aria-label="Открытая сцена" value={state.activeSceneId??''} disabled={disabled} onChange={e=>{if(perform(()=>({...state,activeSceneId:e.currentTarget.value||null}))){setSelection(null);setTool('select')}}}><option value="">Выбери сцену</option>{state.scenes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
      <div className="gb-workspace-history" role="toolbar" aria-label="Команды редактора">{<ToolButton icon={'undo'} label={'↶ Отменить'} onClick={()=>undo()} disabled={disabled||(tool==='paste'?!pasteCanUndo:!history.past.length)}/>}{<ToolButton icon={'redo'} label={'↷ Вернуть'} onClick={()=>undo(true)} disabled={disabled||(tool==='paste'?!pasteCanRedo:!history.future.length)}/>}<i/>{mode==='build'&&<><ToolButton icon="copy" label="Копировать · Ctrl+C" onClick={copySelection} disabled={!activeSelection.some(i=>i.kind==='object')}/><ToolButton icon="clipboard" label="Вставить · Ctrl+V" onClick={beginPaste} disabled={disabled||!clipboard||!scene}/></>}{<ToolButton icon={'copy'} label={'Дублировать'} onClick={duplicate} disabled={disabled||!activeSelection.some(v=>v.kind==='object')}/>}{<ToolButton icon={'rotate'} label={'Повернуть на 90°'} onClick={rotate} disabled={disabled||selectionBlocked||activeSelection.length<2&&!selectedObject&&tool!=='catalog'&&tool!=='assembly'&&tool!=='paste'&&!environmentTool}/>}{mode==='build'&&<ToolButton icon="lower" label="Опустить на поверхность · End" onClick={()=>lower()} disabled={disabled||selectionBlocked||!activeSelection.length||activeSelection.some(i=>i.kind!=='object')}/>}{<ToolButton icon={'trash'} label={'Удалить выбранное'} onClick={remove} disabled={disabled||selectionBlocked||!activeSelection.length}/>}</div>
      <div className="gb-workspace-command-end"><span className="gb-workspace-mode">{mode==='play'?'Игровой стол':'Строительство'}</span>{<ToolButton icon={'download'} label={'Экспорт сцены'} onClick={exportScene} disabled={!scene}/>}{<ToolButton icon={'upload'} label={'Импорт сцены'} onClick={()=>fileInput.current?.click()} disabled={disabled}/>}{<ToolButton icon={'settings'} label={'Параметры сцены'} onClick={()=>{setInspector('scene');setPanels(p=>({...p,inspectorOpen:true}))}}/>}{<ToolButton icon={'panel'} label={'Инспектор · I'} pressed={panels.inspectorOpen} onClick={()=>setPanels(p=>({...p,inspectorOpen:!p.inspectorOpen}))}/>}{<ToolButton icon={'help'} label={'Управление · ?'} pressed={controlsHelp} onClick={()=>setControlsHelp(true)}/>}{<ToolButton icon={'eye'} label={expanded?'Свернуть рабочее поле':'Развернуть рабочее поле'} onClick={()=>setExpanded(v=>!v)}/>}</div>
      <input hidden ref={fileInput} type="file" accept=".json,application/json" onChange={e=>{const f=e.currentTarget.files?.[0];if(f)void importScenes(f);e.currentTarget.value=''}}/>
    </header>
    {scene?<div style={{'--gb-library-width':panels.libraryWidth+'px','--gb-inspector-width':panels.inspectorWidth+'px'} as CSSProperties} className={'gb-workspace-body'+(libraryOpen&&mode==='build'?'':' gb-library-closed')+(panels.inspectorOpen?'':' gb-inspector-closed')}>
      {mode==='build'&&<nav className="gb-workspace-tools" aria-label="Инструменты строительства">
        {<ToolButton icon={'select'} label={'Выбрать · V'} onClick={()=>chooseTool('select')} disabled={false} pressed={tool==='select'}/>}{<ToolButton icon={'cube'} label={'Библиотека моделей · B'} onClick={()=>setLibraryOpen(v=>!v)} disabled={false} pressed={libraryOpen}/>}<i/>
        {<ToolButton icon={'wall'} label={'Стена линией · W'} onClick={()=>chooseTool('wall-line')} disabled={disabled} pressed={tool==='wall-line'}/>}{<ToolButton icon={'room'} label={'Комната прямоугольником · Q'} onClick={()=>chooseTool('room')} disabled={disabled} pressed={tool==='room'}/>}{<ToolButton icon={'floor'} label={'Кисть пола · P'} onClick={()=>chooseTool('paint')} disabled={disabled} pressed={tool==='paint'}/>}{<ToolButton icon={'grid'} label={'Пол прямоугольником'} onClick={()=>chooseTool('rectangle')} disabled={disabled} pressed={tool==='rectangle'}/>}
        {<ToolButton icon={'person'} label={'Разместить героя'} onClick={()=>{chooseTool('character');setLibraryTab('models');setLibraryOpen(true)}} disabled={disabled} pressed={tool==='character'}/>}{<ToolButton icon={'measure'} label={'Измерить · M'} onClick={()=>chooseTool('measure')} disabled={false} pressed={tool==='measure'}/>}<i/>{<ToolButton icon={'move'} label={'Оси XYZ · X'} onClick={()=>{chooseTool('select');setGizmo(v=>!v)}} disabled={disabled} pressed={gizmo}/>}
      </nav>}
      {mode==='build'&&libraryOpen&&<aside className="gb-workspace-library">
        <nav className="gb-library-tabs" aria-label="Разделы библиотеки"><button aria-pressed={libraryTab==='models'} onClick={()=>{setLibraryTab('models');if(tool==='assembly')setTool('select')}}>Модели</button><button aria-pressed={libraryTab==='assemblies'} onClick={()=>setLibraryTab('assemblies')}>Мои сборки</button></nav>
        {libraryTab==='assemblies'?<SceneAssemblyLibrary key={libraryScope??'session'} library={assemblyLibrary} scope={libraryScope} selected={assemblyId} disabled={disabled} selectionCount={activeSelection.every(s=>s.kind==='object')?activeSelection.length:0} onCapture={name=>{if(!scene||disabled)throw Error('Редактор недоступен.');return captureSceneAssembly(scene,activeSelection,name,sceneEditorId())}} onPick={id=>{setAssemblyId(id);setFacing(0);setTool('assembly');setSelection(null)}} facing={facing} elevation={assemblyElevation} onRotate={()=>setFacing(v=>(v+90)%360)} onElevation={setAssemblyElevation}/>:<>
        <details className="gb-scene-details" open={tool!=='catalog'&&tool!=='assembly'&&tool!=='character'&&!brush}><summary>Окружение · прежняя библиотека</summary><ArtworkPicker thumbnails={environmentThumbnails} filterGroups={environmentGroups} label="Объект для размещения" value={toolArtwork} presets={objectPresets} disabled={disabled} onChange={key=>{setToolArtwork(key);setTool(artworkMetadata[key]?.objectKind??'crate');setSelection(null)}}/><details className="gb-scene-details"><summary>Базовые формы · 8</summary><div className="gb-scene-assets" aria-label="Ассеты окружения">{(Object.keys(sceneObjectLabels) as SceneObjectKind[]).map(kind=><button type="button" className="w6-button" key={kind} disabled={disabled} aria-pressed={tool===kind} onClick={()=>{setTool(kind);setToolArtwork('auto');setSelection(null)}}><img src={import.meta.env.BASE_URL+'basic-thumbnails/'+kind+'.png'} alt="" loading="lazy"/><span>{sceneObjectLabels[kind]}</span></button>)}</div></details></details>
        <details className="gb-scene-details" open={tool==='catalog'||tool==='character'||!!brush}><summary>Модульная таверна и подземелье</summary>{tool==='character'?<section className="gb-hero-library"><small>ГЕРОИ КАМПАНИИ</small><h3>Объёмные фигурки</h3>{actors.map(a=><button className="w6-button" key={a.id} aria-pressed={actorId===a.id} onClick={()=>{setActorId(a.id);setTool('character')}}><EditorIcon name="person"/>{a.name||'Без имени'}</button>)}</section>:<TabletopLibrary selected={catalogId} disabled={disabled} onPick={id=>{setCatalogId(id);setTool(isFloorAsset(id)?'paint':'catalog');setSelection(null)}} size={brushSize} onSize={setBrushSize} erasing={tool==='erase'} onErase={()=>setTool(tool==='erase'?'paint':'erase')} facing={facing} onRotate={()=>setFacing(v=>(v+90)%360)}/>}</details>
        <div className="gb-library-footnote"><EditorIcon name="cube" size={16}/><span>Модель → место на сцене<br/>R — поворот · V — выбор</span></div>{scene&&!['select','move','measure'].includes(tool)&&<button className="w6-button gb-place-center" disabled={disabled} onClick={()=>place({x:scene.width/2,y:scene.depth/2,z:scene.groundZ})}>Разместить в центре</button>}
      </>}</aside>}
      {mode==='build'&&libraryOpen&&<WorkspaceDivider side="library" width={panels.libraryWidth} otherWidth={panels.inspectorOpen?panels.inspectorWidth:0} onResize={libraryWidth=>setPanels(p=>({...p,libraryWidth}))}/>}
      <main className="gb-workspace-viewport">
        <SceneViewport focusRequest={focusRequest} scene={scene} actors={actors} visuals={visuals?.[scene.id]} selection={selection} selections={activeSelection} editorHidden={layers.hidden} editorProtected={layers.protected} selectionFilter={mode==='build'?selectionFilter:'all'} onSelect={select} onSelectMany={mode==='build'?selectMany:undefined} onPoint={place} selecting={tool==='select'||tool==='move'||mode==='play'}
          brush={mode==='build'&&!disabled?brush:undefined} onPaintStroke={mode==='build'&&!disabled?paint:undefined} placement={mode==='build'&&!disabled?(paste?pasteShape.placement:tool==='catalog'?{asset:catalogId,facing,surfaceSnap,surfaces:visibleSurfaces}:tool==='assembly'&&selectedAssembly?{assembly:selectedAssembly,facing,elevation:assemblyElevation}:(Object.keys(sceneObjectLabels) as string[]).includes(tool)?{object:createEnvironmentObject(tool as SceneObjectKind,toolArtwork,'placement:environment',{x:0,y:0,z:scene.groundZ},facing),facing,surfaceSnap,surfaces:visibleSurfaces}:undefined):undefined} gizmo={gizmo&&mode==='build'}
          onContext={(next,point,client)=>{if(next?.kind==='contact')return;const picked:SceneSelection=next?next.kind==='object'?{kind:'object',id:next.id}:{kind:'token',id:next.id}:null;select(picked);setContext({x:client.x,y:client.y,targets:(client.targets??[]).filter(t=>t.selection.kind!=='contact')});if(point)setMessage(`X ${point.x.toFixed(2)} · Y ${point.y.toFixed(2)} · Z ${point.z.toFixed(2)} м`)}}
          onMove={(tool==='select'||tool==='move'||mode==='play')&&!disabled?moveSelection:undefined} moveSurfaces={mode==='build'&&surfaceSnap?visibleSurfaces:undefined} snapStep={snap?snapStep:undefined}/>
        {mode==='build'&&<div className="gb-workspace-placement"><select aria-label="Выбор на сцене" value={selectionFilter} onChange={e=>setSelectionFilter(e.currentTarget.value as SelectionFilter)}><option value="all">Всё</option><option value="props">Мебель и свет</option><option value="structure">Окружение</option><option value="tokens">Герои</option></select><label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.currentTarget.checked)}/> Сетка</label><label title="Размещение и свободный перенос одного предмета на поверхность. Для групп и осей сохраняется точный сдвиг."><input type="checkbox" aria-label="Размещение на поверхностях" checked={surfaceSnap} onChange={e=>setSurfaceSnap(e.currentTarget.checked)}/> Поверхности</label><select aria-label="Шаг привязки к сетке" value={snapStep} onChange={e=>setSnapStep(Number(e.currentTarget.value))}>{[.25,.5,1,2].map(n=><option key={n} value={n}>{n} м</option>)}</select>{brush&&brush.mode!=='measure'&&<strong>{brush.mode==='wall'?'Стена':brush.mode==='room'?'Комната':brush.mode==='rectangle'?'Прямоугольник':tool==='erase'?'Ластик':'Кисть'}</strong>}{(tool==='catalog'||tool==='assembly'||tool==='paste'||environmentTool)&&<span>{tool==='paste'?pasteShape.placement?.assembly.name??paste?.clipboard.assembly.name:tool==='assembly'?selectedAssembly?.name:environmentTool?artworkLabels[toolArtwork]??sceneObjectLabels[tool as SceneObjectKind]:tabletopAsset(catalogId)?.name} · {placementFacing}°</span>}</div>}
        {!selection&&mode==='play'&&<div className="gb-workspace-welcome"><small>ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</small><strong>{scene.name}</strong><span>Выбери героя, передвинь мебель или зажги камин.</span></div>}
        {paste&&<ScenePasteControls row={paste.row} maxCopies={maxAssemblyRowCopies(paste.clipboard.assembly)} error={pasteShape.error} size={paste.row?pasteShape.placement?.assembly:undefined} onRow={row=>changePaste({row})} objectCount={pasteShape.placement?.assembly.objects.length??paste.clipboard.assembly.objects.length} facing={paste.facing} elevation={paste.elevation} repeat={paste.repeat} count={pasteCount} canUndo={pasteCanUndo} canRedo={pasteCanRedo} onRepeat={repeat=>changePaste({repeat})} onElevation={elevation=>changePaste({elevation})} onRotate={rotate} onFinish={cancelPaste} onUndo={()=>undo()} onRedo={()=>undo(true)}/>}
      </main>
      {panels.inspectorOpen&&<WorkspaceDivider side="inspector" width={panels.inspectorWidth} otherWidth={mode==='build'&&libraryOpen?panels.libraryWidth:0} onResize={inspectorWidth=>setPanels(p=>({...p,inspectorWidth}))}/>}
      <aside className="gb-workspace-inspector" hidden={!panels.inspectorOpen}><nav className="gb-inspector-tabs" aria-label="Панели редактора">{([['properties','Свойства'],['layers','Объекты'],['scene','Сцена']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={inspector===id} onClick={()=>setInspector(id)}>{label}</button>)}</nav><div className="gb-inspector-scroll">
        {inspector==='properties'&&activeSelection.length>1&&<section className="gb-group-inspector" aria-label="Групповое выделение"><small>ВЫДЕЛЕНИЕ</small><strong>{activeSelection.length} элементов</strong><p>Перетаскивай за любой выбранный объект. Shift + клик — добавить или убрать. Shift + рамка — выбрать область.</p>
          <SceneGroupPosition key={scene.id+':'+activeSelection.map(s=>s.kind+':'+s.id).sort().join(',')} bounds={mode==='build'?editorObjectBounds(scene,activeSelection):undefined} disabled={disabled||selectionBlocked} onOffset={at=>perform(()=>translateEditorGroup(state,activeSelection,at))} onPosition={at=>perform(()=>positionEditorObjects(state,activeSelection,at))}/>
          {mode==='build'&&inspector==='properties'&&activeSelection.every(s=>s.kind==='object')&&<SceneScaleControl key={activeSelection.map(s=>s.id).join(':')} disabled={disabled||selectionBlocked} onScale={factor=>perform(()=>scaleEditorObjects(state,activeSelection,factor))}/>}{mode==='build'&&<SceneArrangeControl key={scene.id+':'+activeSelection.map(s=>s.kind+':'+s.id).sort().join(',')+':'+(selection?.id??'')} disabled={disabled||selectionBlocked} objectOnly={activeSelection.every(s=>s.kind==='object')} count={activeSelection.length} primary={selectedObject} onArrange={(axis,mode,referenceId)=>perform(()=>arrangeEditorObjects(state,activeSelection,axis,mode,referenceId))} onSpace={(axis,gap,referenceId)=>perform(()=>spaceEditorObjects(state,activeSelection,axis,gap,referenceId))}/>}
          <div><button className="w6-button" disabled={disabled||!activeSelection.some(v=>v.kind==='object')} onClick={duplicate}>Дублировать объекты</button><button className="w6-button" disabled={disabled} onClick={()=>perform(()=>rotateEditorGroup(state,activeSelection))}>Повернуть группу</button><button className="w6-button w6-danger" disabled={disabled} onClick={remove}>Удалить выделение</button></div><button className="w6-button" disabled={disabled||activeSelection.some(s=>s.kind!=='object')} onClick={()=>{setLibraryTab('assemblies');setLibraryOpen(true)}}>Сохранить в сборку</button><button className="gb-group-clear" onClick={()=>setSelection(null)}>Снять выделение</button></section>}{inspector==='properties'&&<>{selectedObject&&selectionBlocked&&<div className="gb-layer-notice"><strong>Защита редактора</strong><span>Покажи объект и сними защиту перед изменением.</span>{layers.hidden.includes(selectedObject.id)&&<button className="w6-button" disabled={disabled} onClick={()=>toggleLayer(selectedObject.id,'hidden')}>Показать объект</button>}{layers.protected.includes(selectedObject.id)&&<button className="w6-button" disabled={disabled} onClick={()=>toggleLayer(selectedObject.id,'protected')}>Снять защиту объекта</button>}</div>}{selectedObject && <details className="gb-scene-details" open={activeSelection.length<2}><summary>{activeSelection.length>1?'Активный объект: ':'Объект: '}{selectedObject.name}</summary>{contentsAvailable&&<SceneContentsActions objectCount={contentsItems.filter(i=>i.kind==='object').length} actorCount={contentsItems.filter(i=>i.kind==='token').length} blocked={contentsBlocked} disabled={disabled} onSelect={()=>{selectContents()}} onMove={moveContents} onCopy={copyContents} onDuplicate={duplicateContents}/>}<div className="gb-object-actions">{objectActions(selectedObject).map(a=><button className="w6-button" key={a.operation} disabled={disabled||selectionBlocked||a.disabled} onClick={()=>interact(a.operation)}>{a.label}</button>)}<button className="w6-button" disabled={disabled} onClick={()=>perform(()=>rotateTabletopObject(state,selectedObject.id))}>Повернуть · {selectedObject.facing??0}°</button></div>{mode==='build'&&activeSelection.length===1&&<SceneScaleControl key={selectedObject.id} disabled={disabled||selectionBlocked} onScale={factor=>perform(()=>scaleEditorObjects(state,activeSelection,factor))}/>}<form key={JSON.stringify(selectedObject)} className="gb-properties" onSubmit={e => saveObject(e, selectedObject)}>
        <Label label="Название объекта" wide><input name="name" required maxLength={120} defaultValue={selectedObject.name}/></Label><fieldset className="gb-transform-fields"><legend>ПОЛОЖЕНИЕ</legend>{positionFields(selectedObject)}</fieldset>
        <fieldset className="gb-transform-fields"><legend>РАЗМЕРЫ</legend><Numeric name="width" label="Ширина (м)" value={selectedObject.width} min={.1} max={scene.width}/><Numeric name="depth" label="Глубина (м)" value={selectedObject.depth} min={.1} max={scene.depth}/><Numeric name="height" label="Высота объекта (м)" value={selectedObject.height} min={0}/></fieldset>
        {(['blocksMovement', 'blocksSight', 'canSupport', ...(supportsObjectOperation(selectedObject,'open') ? ['open'] : [])] as const).map(k => <label className="w6-check" key={k}><input type="checkbox" name={k} defaultChecked={selectedObject[k as keyof SceneObject] === true}/>{({ blocksMovement: 'Препятствие движению', blocksSight: 'Закрывает обзор', canSupport: 'Можно стоять сверху', open: objectOpenStateLabel(selectedObject) } as Record<string, string>)[k]}</label>)}
        <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" disabled={disabled||selectionBlocked}>Сохранить параметры объекта</button><button className="w6-button w6-danger" type="button" disabled={disabled} onClick={() => { if (perform(() => removeSceneObject(state, scene.id, selectedObject.id))) setSelection(null) }}>Убрать объект</button></div>
      </form><ArtworkPicker label={selectedObject.asset?"Изображение на схеме":"Модель объекта"} thumbnails={selectedObject.asset?undefined:environmentThumbnails} value={selectedObject.artwork} presets={objectPresets.filter(key=>artworkMetadata[key]?.objectKind===selectedObject.kind)} disabled={disabled} onChange={artwork=>perform(()=>moveSceneObject(state,scene.id,{...selectedObject,artwork}))}/></details>}{selectedToken && <details className="gb-scene-details" open={activeSelection.length<2}><summary>Положение персонажа</summary><form key={JSON.stringify(selectedToken)} className="gb-properties" onSubmit={saveToken}>
        {positionFields(selectedToken)}<Numeric name="diameter" label="Занимаемый диаметр (м)" value={selectedToken.diameter} min={.1} max={100}/>
        <Label label="Опора персонажа"><select name="support" defaultValue={selectedToken.support.kind === 'object' ? 'object:' + selectedToken.support.objectId : selectedToken.support.kind}>
          <option value="ground">Земля сцены</option><option value="air">В воздухе</option>{scene.objects.filter(o => o.canSupport).map(o => <option key={o.id} value={'object:' + o.id}>{o.name} · верх {o.z + o.height} м</option>)}</select></Label>
        <p className="w6-copy gb-wide">При опоре на землю или объект Z вычисляется по поверхности. Для объекта X/Y должны лежать на нём. Диаметр задаёт пространство тела, а не размер портрета. Состояние «В воздухе» назначает мастер; оно не выдаёт способность полёта.</p>
        <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" disabled={disabled}>Сохранить положение</button><button className="w6-button" type="button" disabled={disabled} onClick={() => {
          if (perform(() => replaceScene(state, { ...scene, tokens: scene.tokens.filter(t => t.actorId !== selectedToken.actorId) }))) setSelection(null)
        }}>Убрать со сцены</button></div>
      </form></details>}{!selectedObject&&!selectedToken&&<div className="gb-inspector-empty"><EditorIcon name="select" size={36}/><h3>Выбери объект</h3><p>Нажми на модель в сцене. Здесь появятся её свойства и доступные действия.</p><button className="w6-button" onClick={()=>setInspector('layers')}>Объекты сцены</button></div>}</>}
        {inspector==='layers'&&<>{mode==='build'&&libraryScope&&<p className="gb-workspace-local">Видимость и защита сохраняются в этом браузере для текущего проекта.</p>}
          <SceneOutliner key={(libraryScope??'session')+':'+scene.id} scene={scene} actors={actors} items={activeSelection} primary={selection} layers={layers} build={mode==='build'} disabled={disabled} onSelect={selectInOutliner} onInspect={()=>setInspector('properties')} onFocus={()=>setFocusRequest(v=>v+1)} onLayer={setObjectLayers}/>
          {mode==='build'&&<div className="gb-layer-actions"><button className="w6-button" disabled={disabled||!layers.hidden.length} onClick={()=>setObjectLayers(layers.hidden,'hidden',false)}>Показать всё</button><button className="w6-button" disabled={disabled||!layers.protected.length} onClick={()=>setObjectLayers(layers.protected,'protected',false)}>Снять защиту</button></div>}
        </>}
        {inspector==='scene'&&<><details className="gb-scene-details"><summary>Параметры сцены и фон</summary><form key={JSON.stringify([scene.id, scene.name, scene.view, scene.width, scene.depth, scene.groundZ, scene.minZ, scene.maxZ, scene.palette, scene.description,scene.backgroundTileSizeM,scene.environment])} className="gb-properties" onSubmit={e => saveScene(e, scene)}>
        <Label label="Название сцены" wide><input name="name" required maxLength={120} defaultValue={scene.name}/></Label>
        <Label label="Описание сцены" wide><textarea name="description" maxLength={4000} defaultValue={scene.description}/></Label>
        <Numeric name="width" label="Размер X (м)" value={scene.width} min={.1}/><Numeric name="depth" label="Размер Y (м)" value={scene.depth} min={.1}/>
        <Label label="Вид сцены"><select name="view" defaultValue={scene.view}><option value="top">Сверху</option><option value="side">Сбоку</option></select></Label>
        <Numeric name="groundZ" label="Земля Z (м)" value={scene.groundZ}/><Numeric name="minZ" label="Нижняя граница Z (м)" value={scene.minZ}/><Numeric name="maxZ" label="Верхняя граница Z (м)" value={scene.maxZ}/>
        <Label label="Окружение сцены"><select name="environment" aria-label="Окружение сцены" defaultValue={scene.environment??'auto'}><option value="auto">Автоматически</option><option value="surface">Поверхность · трава и небо</option><option value="underground">Под землёй · камень и темнота</option></select></Label>
        <Label label="Оформление окружения"><select name="palette" defaultValue={scene.palette}><option value="forest">Природа</option><option value="stone">Камень</option><option value="neon">Неон и металл</option></select></Label>
        {isTiledArtwork(scene.background)&&<Numeric name="backgroundTileSizeM" label="Размер повторения поверхности (м)" value={scene.backgroundTileSizeM??4} min={.1} max={1000}/>}
        <div className="gb-wide"><button className="w6-button w6-primary" disabled={disabled}>Сохранить параметры сцены</button></div>
      </form><p className="w6-copy">Параметры формы применяются кнопкой сохранения. Расстановка и сохранённые параметры входят в черновик кампании. Уменьшение сцены не перемещает объекты автоматически.</p>
      {!disabled && <ArtworkPicker key={scene.id} label="Фон сцены" value={scene.background} presets={sceneBackgroundPresets} onChange={background => perform(() => replaceScene(state, { ...scene, background }))}/>}</details><details className="gb-scene-details"><summary>Создать новую сцену</summary><form className="gb-properties" onSubmit={e=>{const form=e.currentTarget,d=formData(e),id=sceneEditorId();if(perform(()=>createScene(state,id,str(d,'sceneName'),str(d,'sceneView') as Scene['view']))){setSelection(null);setTool('select');form.reset()}}}><Label label="Название новой сцены"><input name="sceneName" required maxLength={120}/></Label><select name="sceneView"><option value="top">Сверху</option><option value="side">Сбоку</option></select><button className="w6-button" disabled={disabled||state.scenes.length>=MAX_SCENES}>Создать сцену</button></form></details>{mode==='build'&&<SceneCopyControl key={(libraryScope??'session')+':'+scene.id} scene={scene} scenes={state.scenes} disabled={disabled} onCopy={copyCurrentScene}/>}<button className="w6-button w6-danger" disabled={disabled} onClick={()=>{if(window.confirm('Удалить сцену «'+scene.name+'»?'))perform(()=>deleteScene(state,scene.id))}}>Удалить сцену</button></>}
      </div></aside>
    </div>:<div className="gb-scene-empty"><h3>Создай первую сцену</h3><p>Задай название, затем наполни её модулями из библиотеки.</p><form className="gb-properties" onSubmit={e=>{const d=formData(e);perform(()=>createScene(state,sceneEditorId(),str(d,'sceneName'),str(d,'sceneView') as Scene['view']))}}><Label label="Название новой сцены"><input name="sceneName" required maxLength={120} defaultValue="Новая сцена"/></Label><Label label="Вид сцены"><select name="sceneView" defaultValue="top"><option value="top">Сверху</option><option value="side">Сбоку</option></select></Label><button className="w6-button w6-primary" disabled={disabled}>Создать сцену</button></form></div>}
    <footer className="gb-workspace-status"><span role="status">{[message,workspaceSettings.notice].filter(Boolean).join(' · ')||'Готово к работе'}</span><span>{activeSelection.length>1?activeSelection.length+' выбрано · ':''}{scene?.objects.length??0} объектов · {scene?.tokens.length??0} героев</span><button type="button" className="gb-status-help" onClick={()=>setControlsHelp(true)}>Управление <kbd>?</kbd></button></footer>
    {controlsHelp&&<EditorControlsHelp onClose={()=>setControlsHelp(false)}/>}
    {context&&<SceneContextMenu {...context} title={selectedObject?.name??(selectedToken?actors.find(a=>a.id===selectedToken.actorId)?.name??'Герой':'Сцена')} onClose={()=>setContext(null)} onPick={target=>{if(target.selection.kind!=='contact')select({kind:target.selection.kind,id:target.selection.id})}}>
      {mode==='build'&&<><button role="menuitem" disabled={disabled||selectionBlocked||!activeSelection.length||activeSelection.some(i=>i.kind!=='object')} onClick={()=>lower()}>Опустить на поверхность <kbd>End</kbd></button><button role="menuitem" disabled={disabled||selectionBlocked||!activeSelection.length||activeSelection.some(i=>i.kind!=='object')} onClick={()=>lower(true)}>Опустить на землю <kbd>Shift+End</kbd></button><button role="menuitem" disabled={!activeSelection.some(i=>i.kind==='object')} onClick={copySelection}>Копировать объекты <kbd>Ctrl+C</kbd></button><button role="menuitem" disabled={disabled||!clipboard} onClick={beginPaste}>Вставить из буфера <kbd>Ctrl+V</kbd></button></>}
      {selectedObject&&objectActions(selectedObject).map(a=><button role="menuitem" key={a.operation} disabled={disabled||selectionBlocked||a.disabled} onClick={()=>{interact(a.operation);setContext(null)}}>{a.label}</button>)}
      {selectedObject&&<>{contentsAvailable&&<><button role="menuitem" disabled={contentsBlocked} onClick={selectContents}>Выделить с содержимым <kbd>Shift+G</kbd></button><button role="menuitem" disabled={disabled||contentsBlocked} onClick={moveContents}>Перенести с содержимым</button><button role="menuitem" disabled={contentsBlocked} onClick={copyContents}>Копировать с содержимым</button><button role="menuitem" disabled={disabled||contentsBlocked} onClick={duplicateContents}>Дублировать с содержимым</button></>}<button role="menuitem" disabled={disabled||selectionBlocked} onClick={()=>{duplicate();setContext(null)}}>Дублировать <kbd>Ctrl+D</kbd></button><button role="menuitem" disabled={disabled||selectionBlocked} onClick={()=>{rotate();setContext(null)}}>Повернуть <kbd>R</kbd></button><button role="menuitem" disabled={disabled||selectionBlocked} onClick={()=>{remove();setContext(null)}}>Удалить <kbd>Del</kbd></button></>}
    </SceneContextMenu>}
  </section>
}
