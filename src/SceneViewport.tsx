import SceneAbilityOverlay, { useVisualReplay } from './SceneAbilityOverlay'
import { sceneAbilityVisuals } from './sceneAbilityVisuals'
import type { SceneAbilityVisual, VisualActor } from './sceneAbilityVisuals'
import type { PointerEvent } from 'react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import SceneRenderMode from './SceneRenderMode'
import SceneAtmosphere from './SceneAtmosphere'
import {sceneEnvironment,sceneEnvironmentLabels} from './sceneEnvironment'
import {defaultLightTuning,readViewLightSettings,saveViewLightSettings} from './scene3dViewSettings'
import {selectionAllowed} from './scene3dModel'
import type {SelectionFilter} from './scene3dModel'
import { masterRenderModel } from './scene3dModel'
import type { Scene, SceneActor, ScenePosition } from './sceneTypes'
import { artworkSource, isTiledArtwork } from './visualMedia'
import type {TabletopBrush} from './tabletopCommands'
import type {ScenePlacement,ScenePointOptions} from './sceneAssemblies'
import type {PlacementSurface} from './sceneEditorPlacement'
import {isFloorAsset} from './tabletopCatalog'
import SceneFloorPatterns from './SceneFloorPatterns'
import SceneObjectGlyph from './SceneObjectGlyph'
import {schematicPickTargets} from './sceneEditorPicking'
import type {SceneContextClient} from './sceneEditorPicking'
import {useSchematicDrag} from './useSchematicDrag'
import {useSchematicCamera} from './useSchematicCamera'
import {useSchematicSelection} from './useSchematicSelection'
import {useSchematicAssemblyPreview} from './useSchematicAssemblyPreview'

type Selection = { kind: 'object'; id: string } | { kind: 'token'; id: string } | null
export type SceneSelection = Selection
type Props = { focusRequest?:number;selectionFilter?:SelectionFilter;scene: Scene; actors: (SceneActor & VisualActor)[]; visuals?:SceneAbilityVisual[]; selection: Selection;
  onMove?: (selection: NonNullable<Selection>, point: ScenePosition,options?:{surfaceId:string|null}) => boolean | void; snapStep?: number;moveSurfaces?:PlacementSurface[];
  placement?:ScenePlacement;editorHidden?:string[];editorProtected?:string[];gizmo?:boolean;onContext?:(selection:{kind:'object'|'token'|'contact';id:string}|null,point:ScenePosition|null,client:SceneContextClient)=>void;
  brush?:TabletopBrush;onPaintStroke?:(points:ScenePosition[])=>boolean|void;
  onPoint: (point: ScenePosition,options?:ScenePointOptions) => void; onSelect: (value: Selection,options?:{extend?:boolean}) => void;selections?:NonNullable<Selection>[];onSelectMany?:(items:NonNullable<Selection>[])=>void; selecting: boolean; marker?: ScenePosition }

export {default as SceneGlyph} from './SceneGlyph'

export function SvgSceneViewport(props:Props) {
  const {actors,selection,onPoint,onSelect,selecting,visuals,marker,selections,selectionFilter,editorHidden,editorProtected,onContext}=props
  const drag=useSchematicDrag(props),scene=drag.preview??props.scene
  const svgRef=useRef<SVGSVGElement>(null),region=useSchematicSelection(props)
  const selected=selections?.length?selections:selection?[selection]:[]
  const camera=useSchematicCamera(svgRef,props.scene,selected,editorHidden,()=>drag.active()||region.active())
  const assemblyPreview=useSchematicAssemblyPreview(svgRef,scene,props.placement,props.snapStep,camera.view)
  // A request changes only the camera; selection and scene remain authoritative.
  useEffect(()=>{if(props.focusRequest)camera.focus()},[props.focusRequest])
  const effects=visuals??sceneAbilityVisuals(scene,actors),playback=useVisualReplay(effects.some(v=>v.phase==='sequence'))
  const vertical = scene.view === 'side' ? scene.maxZ - scene.minZ : scene.depth
  const displaySize = Math.max(scene.width, vertical) * 0.022
  const tiled=isTiledArtwork(scene.background),tileSize=scene.backgroundTileSizeM??4
  const environment=sceneEnvironment(scene)
  const [light,setLight]=useState(()=>readViewLightSettings(environment==='underground'?'night':'day'))
  const night=light.mode==='night'
  function changeDay(night:boolean){const mode=night?'night':'day',next={...light,mode,tuning:defaultLightTuning(mode)} as typeof light;setLight(next);saveViewLightSettings(next)}
  const groundY = scene.maxZ - scene.groundZ
  function point(event: PointerEvent<SVGSVGElement>) {
    if(camera.down(event)){assemblyPreview.clear();return}
    if(region.down(event))return
    if(event.button!==0)return
    const svg = event.currentTarget, matrix = svg.getScreenCTM()
    if (!matrix) return
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY
    const mapped = p.matrixTransform(matrix.inverse())
    const preview=assemblyPreview.resolve(event,mapped)
    if(preview){event.preventDefault();svg.focus({preventScroll:true});if(preview.valid)onPoint(preview.point,{surfaceId:null,resolved:true});return}
    if (mapped.x < 0 || mapped.x > scene.width || mapped.y < 0 || mapped.y > vertical) return
    const entity = (event.target as Element).closest?.('[data-scene-entity]')
    const protectedEntity=entity?.getAttribute('data-scene-entity')==='object'&&editorProtected?.includes(entity.getAttribute('data-scene-id')!)
    if (selecting && entity&&!protectedEntity&&selectionAllowed({kind:entity.getAttribute('data-scene-entity') as 'object'|'token',id:entity.getAttribute('data-scene-id')!},scene.objects.find(o=>o.id===entity.getAttribute('data-scene-id'))??'actor',selectionFilter)) {
      const picked={kind:entity.getAttribute('data-scene-entity') as 'object'|'token',id:entity.getAttribute('data-scene-id')!}
      drag.begin(event,picked,mapped);onSelect(picked,{extend:event.shiftKey||event.ctrlKey||event.metaKey})
      return
    }
    if(selecting){const behind=schematicPickTargets(scene,actors,mapped,{hidden:editorHidden,protected:editorProtected,filter:selectionFilter})[0];if(behind&&behind.selection.kind!=='contact'){const picked={kind:behind.selection.kind,id:behind.selection.id};drag.begin(event,picked,mapped);onSelect(picked,{extend:event.shiftKey||event.ctrlKey||event.metaKey});return}}
    onPoint({ x: mapped.x, y: scene.view === 'top' ? mapped.y : scene.depth / 2,
      z: scene.view === 'side' ? scene.maxZ - mapped.y : scene.groundZ })
  }
  return <div data-environment={environment} data-cycle={night?'night':'day'} className={'gb-scene-viewport gb-palette-' + scene.palette+(props.onMove?' gb-map-draggable':'')+(region.mode?' gb-map-selecting':'')+(camera.panning?' gb-map-panning':camera.space?' gb-map-pan-ready':'')}>
    <SceneAtmosphere environment={environment} night={night}/>
    <svg ref={svgRef} viewBox={`${camera.view.x} ${camera.view.y} ${camera.view.width} ${camera.view.height}`} role="group" tabIndex={0} aria-label={'Сцена «' + scene.name + '», ' + (scene.view === 'top' ? 'вид сверху' : 'вид сбоку')}
      onPointerMove={event=>{if(!camera.move(event)&&!region.move(event)){drag.handlers.onPointerMove(event);assemblyPreview.move(event)}}}
      onPointerLeave={assemblyPreview.clear}
      onPointerUp={event=>{if(camera.active())camera.end();else if(region.active())region.end();else drag.handlers.onPointerUp(event)}}
      onPointerCancel={()=>{camera.end();region.cancel();assemblyPreview.clear();drag.handlers.onPointerCancel()}}
      onLostPointerCapture={()=>{camera.end();region.cancel();drag.handlers.onLostPointerCapture()}}
      onKeyDown={event=>{if(!region.keydown(event)&&!camera.keydown(event))drag.handlers.onKeyDown(event)}}
      onPointerDown={point} onContextMenu={event=>{
        if(!onContext)return
        camera.end();region.cancel();assemblyPreview.clear();drag.handlers.onPointerCancel()
        event.preventDefault()
        const svg=event.currentTarget,matrix=svg.getScreenCTM();if(!matrix)return
        const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY
        const mapped=p.matrixTransform(matrix.inverse())
        if(mapped.x<0||mapped.y<0||mapped.x>scene.width||mapped.y>vertical)return
        const targets=schematicPickTargets(scene,actors,mapped,{hidden:editorHidden,protected:editorProtected,filter:selectionFilter});svg.focus({preventScroll:true})
        onContext(targets[0]?.selection??null,{x:mapped.x,y:scene.view==='top'?mapped.y:scene.depth/2,z:scene.view==='side'?scene.maxZ-mapped.y:scene.groundZ},{x:event.clientX,y:event.clientY,targets})
      }} className={selecting ? '' : 'gb-place-mode'}>
      <title>{scene.name}</title>
      <defs><pattern id={'ground-' + scene.id} width="3.7" height="2.9" patternUnits="userSpaceOnUse">
        <rect width="3.7" height="2.9" className="gb-ground"/><path d="M.4 .7H.8M2.7 1.8H3.1M1.2 2.4H1.5" className="gb-ground-marks" strokeWidth=".05"/>
      </pattern>{tiled&&<pattern id={'texture-'+scene.id} width={tileSize} height={tileSize} patternUnits="userSpaceOnUse"><image href={artworkSource(scene.background)} width={tileSize} height={tileSize} preserveAspectRatio="none"/></pattern>}
      <SceneFloorPatterns suffix={scene.id}/></defs>
      <rect width={scene.width} height={vertical} fill={'url(#ground-' + scene.id + ')'} />
      {tiled&&<rect width={scene.width} height={vertical} fill={'url(#texture-'+scene.id+')'}/>}
      {!tiled&&scene.background && scene.background !== 'auto' && <image href={artworkSource(scene.background, 'banner')} width={scene.width} height={vertical} preserveAspectRatio="none" opacity=".85"/>}
      {scene.view === 'side' && <><rect y={groundY} width={scene.width} height={scene.groundZ - scene.minZ} className="gb-underground"/><line x1="0" x2={scene.width} y1={groundY} y2={groundY} className="gb-ground-line"/></>}
      {scene.objects.filter(o=>!editorHidden?.includes(o.id)).sort((a, b) => a.z - b.z||Number(isFloorAsset(b.asset))-Number(isFloorAsset(a.asset))).map(o => {
        const y = scene.view === 'top' ? o.y - o.depth / 2 : scene.maxZ - o.z - Math.max(o.height, .2)
        const height = scene.view === 'top' ? o.depth : Math.max(o.height, .2)
        return <g key={o.id} data-scene-entity="object" data-scene-id={o.id}>
          <title>{o.name} · Z {o.z} м</title>
          {isFloorAsset(o.asset)?<rect x={o.x-o.width/2} y={y} width={o.width} height={height} fill={'url(#'+o.asset+'-'+scene.id+')'}/>:o.artwork && o.artwork !== 'auto' ? <image href={artworkSource(o.artwork)} x={o.x - o.width / 2} y={y} width={o.width} height={height} preserveAspectRatio="xMidYMid meet" opacity={o.kind === 'door' && o.open ? .45 : 1}/> : <svg x={o.x - o.width / 2} y={y} width={o.width} height={height} overflow="visible"><SceneObjectGlyph object={o} view={scene.view}/></svg>}
          <rect x={o.x - o.width / 2} y={y} width={o.width} height={height} className={selections?.some(s=>s.kind==='object'&&s.id===o.id)||selection?.kind === 'object' && selection.id === o.id ? 'gb-object-selected' : 'gb-object-hit'} vectorEffect="non-scaling-stroke"/>
        </g>
      })}
      {marker&&<g pointerEvents="none" aria-label="Выбранная точка входа"><circle cx={marker.x} cy={scene.view==='top'?marker.y:scene.maxZ-marker.z} r={displaySize} fill="#7ce4d044" stroke="#b7ffe8" strokeWidth="2" vectorEffect="non-scaling-stroke"/><text x={marker.x} y={(scene.view==='top'?marker.y:scene.maxZ-marker.z)-displaySize*1.5} className="gb-token-label" fontSize={displaySize}>Вход</text></g>}
      {scene.tokens.map(t => {
        const actor = actors.find(a => a.id === t.actorId), y = scene.view === 'top' ? t.y : scene.maxZ - t.z - displaySize
        const flying = t.support.kind === 'air', selected = selections?.some(s=>s.kind==='token'&&s.id===t.actorId)||selection?.kind === 'token' && selection.id === t.actorId
        return <g key={t.actorId} data-scene-entity="token" data-scene-id={t.actorId}>
          <title>{actor?.name || 'Без имени'} · X {t.x.toFixed(2)}, Y {t.y.toFixed(2)}, Z {t.z.toFixed(2)} м · {flying ? 'В воздухе' : 'На опоре'}</title>
          {scene.view === 'top' && <circle cx={t.x} cy={t.y} r={t.diameter / 2} className="gb-body-footprint" vectorEffect="non-scaling-stroke"/>}
          {flying && <><ellipse cx={t.x} cy={scene.view === 'top' ? t.y + displaySize : groundY} rx={displaySize * .8} ry={displaySize * .24} className="gb-token-shadow"/>{scene.view === 'side' && <line x1={t.x} x2={t.x} y1={y + displaySize} y2={groundY} className="gb-altitude-line" vectorEffect="non-scaling-stroke"/>}</>}
          <rect x={t.x - displaySize} y={y - displaySize} width={displaySize * 2} height={displaySize * 2} className={selected ? 'gb-token-frame gb-selected' : 'gb-token-frame'} vectorEffect="non-scaling-stroke"/>
          <image href={artworkSource(actor?.profile.portrait, 'portrait-traveler')} x={t.x - displaySize * .86} y={y - displaySize * .86} width={displaySize * 1.72} height={displaySize * 1.72} preserveAspectRatio="xMidYMid slice" pointerEvents="none"/>
          <text x={t.x} y={y + displaySize * 1.55} fontSize={displaySize * .58} className="gb-token-label">{actor?.name || 'Без имени'}</text>
          <text x={t.x} y={y - displaySize * 1.25} fontSize={displaySize * .52} className="gb-height-label">{flying ? '↑ ' : ''}Z {Number(t.z.toFixed(2))} м</text>
        </g>
      })}
      <SceneAbilityOverlay frame={scene} visuals={effects} replay={playback.replay} paused={playback.paused} enabled={playback.enabled}/>
      {assemblyPreview.preview&&<g className="gb-assembly-preview" data-placement-preview="true" data-valid={assemblyPreview.preview.valid} pointerEvents="none" role="img" aria-label={'Предпросмотр группы: '+assemblyPreview.preview.status}>{assemblyPreview.preview.objects.map(o=><rect key={o.id} x={o.x-o.width/2} y={scene.view==='top'?o.y-o.depth/2:scene.maxZ-o.z-Math.max(.2,o.height)} width={o.width} height={scene.view==='top'?o.depth:Math.max(.2,o.height)} vectorEffect="non-scaling-stroke"/>)} </g>}
      {region.rectangle&&<rect className="gb-schematic-marquee" {...region.rectangle} pointerEvents="none" vectorEffect="non-scaling-stroke"/>}
    </svg>
    <div className="gb-atmosphere-controls" role="group" aria-label="Окружение схемы"><span>{sceneEnvironmentLabels[environment]}</span>{environment==='surface'&&<><button type="button" aria-pressed={!night} onClick={()=>changeDay(false)}>День</button><button type="button" aria-pressed={night} onClick={()=>changeDay(true)}>Ночь</button></>}</div>
    {(assemblyPreview.preview?.status||drag.status)&&<div className="gb-schematic-readout" data-valid={assemblyPreview.preview?.valid??drag.valid} role="status">{assemblyPreview.preview?.status||drag.status}</div>}
    {effects.length>0&&playback.controls}
    <p className="gb-map-caption">{scene.view === 'top' ? 'X / Y' : 'X / Z'} · метры · {scene.width} × {scene.view === 'top' ? scene.depth : vertical} · высота земли {scene.groundZ} м</p>
    <div className="gb-schematic-camera" role="toolbar" aria-label="Навигация схемы">
      <button type="button" aria-label="Отдалить схему" title="Отдалить" disabled={camera.zoom<=50} onClick={()=>camera.zoomBy(1.25)}>−</button>
      <output aria-label="Масштаб схемы">{camera.zoom}%</output>
      <button type="button" aria-label="Приблизить схему" title="Приблизить" disabled={camera.zoom>=1200} onClick={()=>camera.zoomBy(.8)}>+</button>
      <i/>{props.onSelectMany&&<button type="button" aria-label="Выделить рамкой" aria-pressed={region.mode} title="Shift + перетаскивание" disabled={!selecting||!!props.placement||!!props.brush} onClick={region.toggle}>Рамка</button>}<button type="button" title="Home" onClick={camera.reset}>Вся сцена</button><button type="button" title="F" disabled={!selected.some(s=>s.kind==='token'||!editorHidden?.includes(s.id))} onClick={camera.focus}>К выделению</button>
    </div>
  </div>
}

const Scene3D = lazy(() => import('./Scene3D'))
export default function SceneViewport(props: Props) {
  const [mode, setMode] = useState<'3d' | 'map'>('3d')
  const [unavailable, setUnavailable] = useState(false)
  const model = useMemo(() => masterRenderModel(props.scene, props.actors, props.visuals ?? sceneAbilityVisuals(props.scene, props.actors)), [props.scene, props.actors, props.visuals])
  return <div className="gb-viewport-shell"><SceneRenderMode mode={mode} onChange={next => { setUnavailable(false); setMode(next) }}/>{unavailable && <p role="status">3D недоступно: открыта схема. Проверь аппаратное ускорение браузера, чтобы включить 3D.</p>}{mode === 'map' ? <SvgSceneViewport {...props}/> :
    <Suspense fallback={<p role="status">Загружаем 3D-сцену…</p>}><Scene3D focusRequest={props.focusRequest} model={model} selection={props.selection} selections={props.selections} editorHidden={props.editorHidden} editorProtected={props.editorProtected} selectionFilter={props.selectionFilter} onSelectMany={props.onSelectMany?items=>props.onSelectMany?.(items.filter(s=>s.kind!=='contact').map(s=>({kind:s.kind as 'object'|'token',id:s.id}))):undefined} marker={props.marker}
      selecting={props.selecting} placement={props.placement} gizmo={props.gizmo} onContext={props.onContext} brush={props.brush} onPaintStroke={props.onPaintStroke} onPoint={props.onPoint} onMove={props.onMove?(s,p,options)=>s.kind==='contact'?false:props.onMove?.({kind:s.kind,id:s.id},p,options):undefined} moveSurfaces={props.moveSurfaces} snapStep={props.snapStep} onUnavailable={() => { setUnavailable(true); setMode('map') }} onSelect={(s,options) => { if (s.kind !== 'contact') props.onSelect({ kind: s.kind, id: s.id },options) }}/></Suspense>}</div>
}
