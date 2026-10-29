import {createSceneAbilityEffect} from './scene3dAbilityEffects'
import {sampleAbilityVisual} from './abilityVisualTimeline'
import {sceneAbilityAimLines} from './sceneAbilityAim'
import type {SceneAbilityAim} from './sceneAbilityAim'
import type {SceneAbilityVisual} from './sceneAbilityVisuals'
import {editorKey} from './sceneEditorKeyboard'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js'
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js'
import {SceneContactPass} from './scene3dContact'
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { ScenePosition } from './sceneTypes'
import type { KnownArea } from './scenePerception'
import {selectionAllowed} from './scene3dModel'
import type {SelectionFilter} from './scene3dModel'
import { entityAreas } from './scene3dModel'
import {populateEntityModel} from './scene3dMeshes'
import type {Surface} from './scene3dMeshes'
import {SceneAssetLibrary,detailedAsset} from './scene3dAssets'
import {SceneSurfaceLibrary,surfaceUV} from './scene3dSurfaces'
import {batchEntityParts} from './scene3dBatch'
import {modelEmission} from './scene3dEmitters'
import {createSceneLighting,createLightingEnvironment,lightingLabels} from './scene3dLighting'
import {createSceneBackdrop} from './scene3dBackdrop'
import SceneAtmosphere from './SceneAtmosphere'
import {sceneEnvironment,sceneEnvironmentLabels} from './sceneEnvironment'
import {legacyAsset,presentationAssetId} from './legacyAssets'
import {legacyObjectBehavior,objectLightReachesRoom,objectRelocatable} from './legacyObjectBehavior'
import type {LightingMode} from './scene3dLighting'
import {defaultLightTuning,readViewLightSettings,saveViewLightSettings} from './scene3dViewSettings'
import type {LightTuning} from './scene3dViewSettings'
import type { RenderEntity, RenderSelection, SceneRenderModel } from './scene3dModel'
import {tabletopStrokeCells} from './tabletopCommands'
import {buildStrokeMarks} from './tabletopBuild'
import type {BuildMark} from './tabletopBuild'
import {createTabletopObject,tabletopAsset} from './tabletopCatalog'
import type {TabletopBrush} from './tabletopCommands'
import {flameAssets,bindFlameMaterial,setEmitterIntensity,updateFlameMaterials,readMotionPreference,saveMotionPreference} from './scene3dMotion'
import {flatPlacementSurface,placementSurfaceFootprint,resolveAssetPlacement,resolveObjectPlacement,surfacePlacementAsset,surfacePlacementObject} from './sceneEditorPlacement'
import type {PlacementSurface} from './sceneEditorPlacement'
import {assemblyDimensions,assemblyLayout,assemblyAnchor} from './sceneAssemblies'
import type {ScenePlacement,ScenePointOptions} from './sceneAssemblies'
import {MAX_SCENE_OBJECTS} from './scenes'
import {isVideoTavern,tavernReferenceShot} from './tavernReference'
import {nearCutawayWall} from './scene3dCutaway'
import {uniquePickTargets} from './sceneEditorPicking'
import type {SceneContextClient} from './sceneEditorPicking'

type Props = { effectTimeMs?:number;abilityAim?:SceneAbilityAim|null;focusRequest?:number;model: SceneRenderModel; selection?: RenderSelection | null; selecting?: boolean;
  onPoint?: (point: ScenePosition,options?:ScenePointOptions) => void; onSelect?: (selection: RenderSelection,options?:{extend?:boolean}) => void;
  selectionFilter?:SelectionFilter;selections?:RenderSelection[];onSelectMany?:(items:RenderSelection[])=>void;
  onMove?: (selection:RenderSelection,point:ScenePosition,options?:{surfaceId:string|null})=>boolean|void; snapStep?:number;moveSurfaces?:PlacementSurface[];
  brush?:TabletopBrush;onPaintStroke?:(points:ScenePosition[])=>boolean|void;
  placement?:ScenePlacement;editorHidden?:string[];editorProtected?:string[];gizmo?:boolean;
  onContext?:(selection:RenderSelection|null,point:ScenePosition|null,client:SceneContextClient)=>void;
  onRequestMove?:(selection:RenderSelection,point:ScenePosition)=>boolean|void;
  marker?: ScenePosition | null; route?: ScenePosition[]; onUnavailable?: () => void }
const vector = (p: ScenePosition) => new THREE.Vector3(p.x, p.z, p.y)
const clipping = (a: KnownArea) => [new THREE.Plane(new THREE.Vector3(1, 0, 0), -a.x),
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), a.x + a.width),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -a.y), new THREE.Plane(new THREE.Vector3(0, 0, -1), a.y + a.depth),
  new THREE.Plane(new THREE.Vector3(0, 1, 0), -a.z), new THREE.Plane(new THREE.Vector3(0, -1, 0), a.z + a.height)]

export default function Scene3D(props: Props) {
  const { model, selection, marker, route } = props
  const guidesJSON=JSON.stringify({marker,route}),applyGuides=useRef<((point:ScenePosition|null,route:ScenePosition[])=>void)|null>(null)
  const structuralJSON=useMemo(()=>JSON.stringify({...model,visuals:[],entities:model.entities.map(e=>model.restricted?e:{...e,transform:{position:{x:0,y:0,z:0}}})}),[model])
  const constructionModel=useMemo(()=>JSON.parse(structuralJSON) as SceneRenderModel,[structuralJSON])
  const applyPositions=useRef<((next:SceneRenderModel)=>void)|null>(null),applyPlacement=useRef<((next:Props['placement'])=>void)|null>(null)
  const seenEffects=useRef({frame:model.frame.id,ids:new Set(model.visuals.map(v=>v.id))})
  const [effectsEnabled,setEffectsEnabled]=useState(true),[effectsPaused,setEffectsPaused]=useState(false),[effectReplay,setEffectReplay]=useState(0)
  const effectSettings=useRef({enabled:effectsEnabled,paused:effectsPaused,replay:effectReplay}),applyEffects=useRef<((visuals:SceneAbilityVisual[],replay?:boolean)=>void)|null>(null),applyAim=useRef<((aim:SceneAbilityAim|null)=>void)|null>(null)
  const [measurement,setMeasurement]=useState(''),[animated,setAnimated]=useState(readMotionPreference)
  const animationValue=useRef(animated),applyMotion=useRef<(()=>void)|null>(null)
  const host = useRef<HTMLDivElement>(null), latest = useRef(props), reset = useRef<(() => void) | null>(null)
  const cameraAction=useRef<((action:'top'|'front'|'iso'|'focus'|'reference')=>void)|null>(null),restoreFocus=useRef(false)
  const capture=useRef<(()=>void)|null>(null),[captureNotice,setCaptureNotice]=useState('')
  const updateSelection=useRef<((selection:RenderSelection|null)=>void)|null>(null)
  const environmentKind=sceneEnvironment(model.frame)
  const tabletop=model.entities.some(e=>!!e.geometry.asset)
  const videoReference=isVideoTavern(model.frame.id)&&!model.restricted
  const [quality, setQuality] = useState('balanced'), [grid, setGrid] = useState(!tabletop), [labels, setLabels] = useState(!tabletop)
  const [orthographic,setOrthographic]=useState(tabletop),[cutaway,setCutaway]=useState(true)
  const cutawayValue=useRef(cutaway),applyCutaway=useRef<(()=>void)|null>(null)
  const [failure, setFailure] = useState(''), [hover, setHover] = useState('')
  const [assetStatus,setAssetStatus]=useState('')
  const [initialLight]=useState(()=>readViewLightSettings(environmentKind==='underground'?'night':model.title.startsWith('Полигон ·')?'day':tabletop?'tavern':'day'))
  const [lightingMode,setLightingMode]=useState<LightingMode>(initialLight.mode),[tuning,setTuning]=useState(initialLight.tuning),[clay,setClay]=useState(false),[exposure,setExposure]=useState(initialLight.exposure)
  const exposureValue=useRef(exposure),applyExposure=useRef<((value:number)=>void)|null>(null)
  const lightingState=useRef({mode:lightingMode,tuning}),applyLighting=useRef<((mode:LightingMode,tuning:LightTuning)=>void)|null>(null)
  const changeTuning=(key:keyof LightTuning,value:number)=>setTuning(t=>({...t,[key]:value}))
  const cameraState = useRef<{ id: string; position: THREE.Vector3; target: THREE.Vector3;zoom:number } | null>(null)
  useEffect(() => { latest.current = props })
  useEffect(() => {
    const element = host.current
    if (!element) return
    const model=constructionModel,f = model.frame
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' }) }
    catch {
      // oxlint-disable-next-line react/set-state-in-effect -- Reports an external WebGL initialization failure.
      setFailure('Не удалось запустить 3D. Переключись на схему или включи аппаратное ускорение браузера.'); latest.current.onUnavailable?.(); return }
    // oxlint-disable-next-line react/set-state-in-effect -- Reports external WebGL initialization state.
    setFailure('')
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : quality === 'high' ? 2 : 1.5))
    renderer.localClippingEnabled = true
    renderer.shadowMap.enabled = quality !== 'low' && !model.restricted
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true
    renderer.toneMapping=THREE.ACESFilmicToneMapping
    renderer.domElement.setAttribute('aria-label', model.title + ' · трёхмерная сцена')
    renderer.domElement.setAttribute('role', 'img')
    renderer.domElement.tabIndex = 0
    element.appendChild(renderer.domElement)
    if(restoreFocus.current)renderer.domElement.focus({preventScroll:true})
    const far=Math.max(500,f.width*8,f.depth*8,(f.maxZ-f.minZ)*8)
    const scene = new THREE.Scene(), camera = orthographic?new THREE.OrthographicCamera(-1,1,1,-1,.05,far):new THREE.PerspectiveCamera(46,1,.05,far)
    const span = Math.max(f.width, f.depth, 5), center = new THREE.Vector3(f.width / 2, f.groundZ, f.depth / 2)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN
    controls.maxPolarAngle = Math.PI / 2 - .02; controls.minDistance = .5; controls.maxDistance = span * 4
    controls.minZoom=.2;controls.maxZoom=40
    controls.enableDamping = false
    const referenceView=(close=true)=>{
      controls.target.fromArray(tavernReferenceShot.target)
      camera.position.copy(controls.target).add(new THREE.Vector3().fromArray(tavernReferenceShot.offset))
      camera.zoom=close?tavernReferenceShot.zoom:1;camera.updateProjectionMatrix();controls.update()
    }
    const home = () => {if(videoReference){referenceView(false);return}controls.target.copy(center); camera.zoom=1;camera.updateProjectionMatrix();camera.position.set(center.x + span * .65, center.y + span * .62, center.z + span * .85); controls.update() }
    const saved = cameraState.current
    if (saved?.id === f.id) { camera.position.copy(saved.position);camera.zoom=saved.zoom;camera.updateProjectionMatrix(); controls.target.copy(saved.target); controls.update() } else if(videoReference)referenceView();else home()
    reset.current = home
    cameraAction.current=action=>{
      if(action==='reference'){referenceView();return}
      if(action==='focus'){
        const selected=latest.current.selection,items=latest.current.selections?.length?latest.current.selections:selected?[selected]:[],hidden=new Set(latest.current.editorHidden)
        const targets=items.flatMap(s=>{if(s.kind==='object'&&hidden.has(s.id))return [];const g=anchors.get(s.kind+':'+s.id);return g?[g]:[]})
        if(!targets.length)return
        const bounds=new THREE.Box3();targets.forEach(g=>bounds.union(new THREE.Box3().setFromObject(g)));const target=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3())
        const direction=camera.position.clone().sub(controls.target).normalize(),distance=Math.max(2,Math.max(size.x,size.y,size.z)*2.8)
        controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,distance)
        if(camera instanceof THREE.OrthographicCamera){camera.zoom=Math.min(40,span*1.16/Math.max(2,Math.max(size.x,size.y,size.z)*2.2));camera.updateProjectionMatrix()}
      }else{
        controls.target.copy(center)
        if(action==='top')camera.position.set(center.x+.001,center.y+span*1.25,center.z+.001)
        else if(action==='front')camera.position.set(center.x,center.y+span*.04,center.z+span*1.5)
        else{home();return}
      }
      controls.update()
    }
    const lighting=createSceneLighting(f,lightingState.current.mode,quality,model.restricted,lightingState.current.tuning,environmentKind)
    const backdrop=createSceneBackdrop(f,environmentKind,lightingState.current.mode,lightingState.current.tuning,model.restricted,quality)
    scene.add(lighting.group,backdrop.group);renderer.setClearColor(backdrop.background)
    if(!model.restricted&&!videoReference)scene.fog=new THREE.FogExp2(backdrop.fogColor,environmentKind==='underground'?.009:.005)
    renderer.toneMappingExposure=lighting.exposure*exposureValue.current
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
    const keep = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture,>(v: T): T => { resources.add(v); return v }
    let pending=0,disposed=false,environment:THREE.WebGLRenderTarget|undefined,environmentTimer:ReturnType<typeof setTimeout>|undefined
    const generator=quality!=='low'&&renderer.capabilities?.maxTextures?new THREE.PMREMGenerator(renderer):undefined
    const radianceKey=()=>{const {mode,tuning:t}=lightingState.current;return [mode,t.azimuth,t.elevation,t.sun].join(':')}
    let environmentKey=radianceKey()
    const refreshEnvironment=()=>{
      if(disposed||!generator)return
      const {mode,tuning:t}=lightingState.current,source=createLightingEnvironment(mode,t,environmentKind)
      try{const next=generator.fromScene(source.scene,.06);scene.environment=next.texture;environment?.dispose();environment=next}
      finally{source.dispose()}
    }
    refreshEnvironment();scene.environmentIntensity=lighting.environmentIntensity
    const assetLibrary=new SceneAssetLibrary(Math.min(quality==='high'?8:4,renderer.capabilities?.getMaxAnisotropy()??4))
    const surfaceLibrary=new SceneSurfaceLibrary(()=>requestDraw(),Math.min(quality==='high'?8:4,renderer.capabilities?.getMaxAnisotropy()??4))
    let composer:EffectComposer|undefined,contactShadows:SceneContactPass|undefined
    const passes:{dispose:()=>void}[]=[]
    if(quality!=='low'&&!model.restricted&&renderer.capabilities?.maxTextures){
      // Offscreen post-processing targets need their own MSAA; canvas
      // antialiasing alone does not smooth the geometry rendered into them.
      const samples=Math.min(quality==='high'?4:2,renderer.capabilities.maxSamples??0)
      composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples}))
      const beauty=new RenderPass(scene,camera),output=new OutputPass()
      contactShadows=new SceneContactPass(scene,camera,512,512)
      contactShadows.updateGtaoMaterial({radius:.28,thickness:.16,distanceExponent:1.5,distanceFallOff:1,samples:quality==='high'?12:6,screenSpaceRadius:false})
      contactShadows.updatePdMaterial({radius:quality==='high'?6:4,samples:quality==='high'?16:8,rings:2})
      contactShadows.blendIntensity=lightingState.current.tuning.contact;contactShadows.enabled=contactShadows.blendIntensity>0
      const bloom=new UnrealBloomPass(new THREE.Vector2(512,512),.16,.32,1.05)
      composer.addPass(beauty);composer.addPass(contactShadows);composer.addPass(bloom);composer.addPass(output);passes.push(beauty,contactShadows,bloom,output)
    }
    let assetsPending=0,assetsFailed=0,liveEmitters=0
    const assetNotice=()=>{if(!disposed)setAssetStatus(quality==='low'?'Упрощённые модели':assetsPending?'Загрузка детальной геометрии…':assetsFailed?'Часть моделей недоступна · показаны упрощённые':clay?'Геометрия без текстур':'Детальные модели')}
    const material = (color: string, opacity = 1, planes: THREE.Plane[] = []) => keep(new THREE.MeshStandardMaterial({ color,
      roughness: .85, metalness: .08, transparent: opacity < 1, opacity, clippingPlanes: planes, side: THREE.DoubleSide }))
    const floorColor = videoReference?'#21192e':f.palette === 'forest' ? '#304f42' : f.palette === 'stone' ? '#454c5b' : '#2e3e55'
    const outlines:{helper:THREE.BoxHelper;target:THREE.Object3D}[]=[],anchors=new Map<string,THREE.Object3D>()
    const pickables: THREE.Object3D[] = [], groundMeshes: THREE.Mesh[] = [], labelElements: { node: HTMLSpanElement; position: THREE.Vector3; anchor?:THREE.Object3D; offset:number }[] = []
    function floor(a: KnownArea) {
      if (f.groundZ < a.z || f.groundZ > a.z + a.height) return
      const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(a.width, a.depth)), material(a.visible ? floorColor : '#292e3d'))
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(a.x + a.width / 2, f.groundZ, a.y + a.depth / 2)
      if(quality!=='low'&&!clay&&!videoReference){
        const uv=mesh.geometry.getAttribute('uv'),p=mesh.geometry.getAttribute('position')
        for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+mesh.position.x)/3,(-p.getY(i)+mesh.position.z)/3)
        surfaceLibrary.apply(mesh.material as THREE.MeshStandardMaterial,f.palette==='forest'?'forest':'paving')
        ;(mesh.material as THREE.MeshStandardMaterial).color.set(a.visible?'#d5d2c7':'#555b65')
      }
      if(clay)(mesh.material as THREE.MeshStandardMaterial).color.set(a.visible?'#858882':'#434b4c')
      mesh.receiveShadow = true; mesh.userData.area = a; scene.add(mesh); groundMeshes.push(mesh)
      if (grid||videoReference) {
        // Bound line count even for imported million-metre scenes.
        const step = Math.max(1, Math.ceil(Math.max(f.width, f.depth) / 100)), points: number[] = []
        const gridZ=f.groundZ+(videoReference&&!grid?.002:tabletop?.033:.008)
        for (let x = Math.ceil(a.x / step) * step; x <= a.x + a.width; x += step) points.push(x, gridZ, a.y, x, gridZ, a.y + a.depth)
        for (let y = Math.ceil(a.y / step) * step; y <= a.y + a.depth; y += step) points.push(a.x, gridZ, y, a.x + a.width, gridZ, y)
        scene.add(new THREE.LineSegments(keep(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))), keep(new THREE.LineBasicMaterial({ color: videoReference?'#94819e':'#78938c', transparent: true, opacity: videoReference&&!grid?.16:.18 }))))
      }
    }
    if(!model.restricted){const base=new THREE.Mesh(keep(new THREE.BoxGeometry(f.width,.32,f.depth)),keep(new THREE.MeshStandardMaterial({color:videoReference?'#35283b':'#3c493c',roughness:1})));base.position.set(f.width/2,f.groundZ-.175,f.depth/2);base.receiveShadow=true;scene.add(base)}
    model.areas.forEach(floor)
    function entityMesh(e: RenderEntity, planes: THREE.Plane[]) {
      const group = new THREE.Group(), p = e.transform.position
      group.position.copy(vector(latest.current.model.entities.find(v=>v.id===e.id&&v.interaction.kind===e.interaction.kind)?.transform.position??p));group.rotation.y=-(e.geometry.facing??0)*Math.PI/180
      group.userData.cutawayWall=legacyAsset(e.geometry)?.wallLike??(!!e.geometry.asset&&e.geometry.kind==='wall'&&!['timber-pillar','timber-beam','timber-railing'].includes(e.geometry.asset))
      group.userData.wallFacing=e.geometry.facing??0
      group.userData.roof=e.geometry.asset==='roof-tile'
      group.userData.requestMovable=!e.appearance.remembered&&objectRelocatable(e.geometry)
      group.userData.selection = { ...e.interaction }; group.userData.label = e.identity.label
      const opacity = e.appearance.remembered ? .4 : 1, surfaces=new Map<string,THREE.Material>()
      populateEntityModel(e,(geometry,color,x,y,z,options:Surface={})=>{
        const key=JSON.stringify([color,options]),alpha=opacity*(options.opacity??1),emissive=e.geometry.active!==false?options.emissive:undefined
        let mat=surfaces.get(key)
        if(!mat){
          const parameters={color:clay?'#b5b3a9':color,roughness:clay?.68:options.roughness??.82,metalness:clay?0:options.metalness??.08,transparent:alpha<1,opacity:alpha,depthWrite:alpha>=.99,clippingPlanes:planes,clipShadows:true,side:options.doubleSided?THREE.DoubleSide:THREE.FrontSide,...(!clay&&emissive?{emissive,emissiveIntensity:(lightingState.current.mode==='night'?3:1.3)*lightingState.current.tuning.lamps}:{})}
          const standard=keep(options.clearcoat&&!clay?new THREE.MeshPhysicalMaterial({...parameters,clearcoat:options.clearcoat,clearcoatRoughness:.18}):new THREE.MeshStandardMaterial(parameters))
          standard.userData.lightEmitter=!!emissive;standard.userData.castsShadow=options.castShadow!==false
          if(alpha>=.99&&!emissive)standard.userData.paletteBatch=JSON.stringify([options,clay,alpha])
          if(options.texture&&quality!=='low'&&!clay)surfaceLibrary.apply(standard,options.texture,options.textureStrength,options.normalStrength)
          mat=standard;surfaces.set(key,mat)
        }
        const part=new THREE.Mesh(keep(geometry),mat);part.position.set(x,y,z);part.userData.surfaceTexture=options.texture;part.castShadow=!model.restricted&&options.castShadow!==false;part.receiveShadow=true;group.add(part);return part
      },quality==='low')
      const source=objectLightReachesRoom(e.geometry),emission=source?modelEmission(group,legacyObjectBehavior(e.geometry)?.emitter):undefined
      // Native tabletop modules bake their final editable scale only after the
      // model callback returns. Project UVs from those completed dimensions.
      for(const part of group.children)if(part instanceof THREE.Mesh&&part.userData.surfaceTexture){part.updateMatrix();surfaceUV(part.geometry,new THREE.Vector3(),2,part.matrix)}
      if(legacyAsset(e.geometry)||quality!=='low'&&['wall','door','crate','platform','lamp','actor','water'].includes(e.geometry.kind)){
        batchEntityParts(group,g=>{resources.delete(g);g.dispose()},keep)
        group.traverse(part=>{if(part instanceof THREE.Mesh)part.castShadow=part.castShadow&&!model.restricted})
      }
      if(source&&!clay&&quality!=='low'&&flameAssets.has(presentationAssetId(e.geometry)??'')&&!e.appearance.remembered){
        const flames=new Map<THREE.MeshStandardMaterial,THREE.Box3>()
        group.traverse(part=>{if(!(part instanceof THREE.Mesh))return;const mats=Array.isArray(part.material)?part.material:[part.material];for(const m of mats){if(!(m instanceof THREE.MeshStandardMaterial)||!m.userData.lightEmitter)continue;part.updateMatrix();part.geometry.computeBoundingBox();const box=part.geometry.boundingBox?.clone().applyMatrix4(part.matrix);if(box)flames.set(m,flames.get(m)?.union(box)??box)}})
        group.userData.liveFlame=flames.size>0;for(const [m,box] of flames){bindFlameMaterial(m,box,e.id);liveEmitters++}
      }
      if(source&&e.geometry.active!==false)lighting.addLamp(e,group,emission)
      scene.add(group); pickables.push(group);anchors.set(e.interaction.kind+':'+e.interaction.id,group)
      if(quality!=='low'&&detailedAsset(e)){
        assetsPending++
        const localEntity=(e.geometry.facing??0)%180!==0?{...e,geometry:{...e.geometry,width:e.geometry.depth,depth:e.geometry.width}}:e
        void assetLibrary.instantiate(localEntity,planes,model.restricted,clay).then(detailed=>{
          if(disposed||!detailed)return
          const old=new Set<THREE.BufferGeometry|THREE.Material>()
          group.traverse(part=>{if(part instanceof THREE.Mesh){old.add(part.geometry);for(const mat of Array.isArray(part.material)?part.material:[part.material])old.add(mat)}})
          group.clear();old.forEach(resource=>{resources.delete(resource);resource.dispose()})
          group.add(detailed);requestDraw()
        }).catch(()=>{assetsFailed++}).finally(()=>{assetsPending--;assetNotice()})
      }
    }
    for (const entity of structuredClone(model.entities)) {
      if (model.restricted && entity.interaction.kind === 'object') {
        for (const area of entityAreas(entity, model)) entityMesh(entity, clipping(area))
      } else entityMesh(entity, [])
      if (labels&&anchors.has(entity.interaction.kind+':'+entity.interaction.id)) {
        const node = document.createElement('span'); node.className = 'gb-3d-label'; node.textContent = entity.identity.label
        element.appendChild(node); labelElements.push({ node, anchor:anchors.get(entity.interaction.kind+':'+entity.interaction.id),offset:entity.geometry.height+.45,position: vector({ ...entity.transform.position, z: entity.transform.position.z + entity.geometry.height + .45 }) })
      }
    }
    const markerMesh=new THREE.Mesh(keep(new THREE.TorusGeometry(.45,.045,6,24)),material('#c1ffe9'));markerMesh.rotation.x=Math.PI/2;markerMesh.visible=false;markerMesh.raycast=()=>{};scene.add(markerMesh)
    const routeLine=new THREE.Line(keep(new THREE.BufferGeometry()),keep(new THREE.LineBasicMaterial({color:'#82fff0'})));routeLine.raycast=()=>{};routeLine.visible=false;scene.add(routeLine)
    applyGuides.current=(point,points)=>{
      markerMesh.visible=!!point;if(point){markerMesh.position.copy(vector(point));markerMesh.position.y+=.06}
      resources.delete(routeLine.geometry);routeLine.geometry.dispose();routeLine.geometry=keep(new THREE.BufferGeometry().setFromPoints(points.map(p=>vector({...p,z:p.z+.06}))));routeLine.visible=points.length>1;requestDraw(false)
    }
    const reducedMotion=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let vfx:ReturnType<typeof createSceneAbilityEffect>[]=[],vfxVisuals:SceneAbilityVisual[]=[],vfxElapsed=0,vfxLast:number|undefined,vfxPlaying=false
    const vfxDuration=()=>Math.max(0,...vfxVisuals.filter(v=>v.phase==='sequence').map(v=>Math.max(500,Math.min(10000,v.spec.durationMs??1800))))
    const controlledVfx=()=>latest.current.effectTimeMs!==undefined&&Number.isFinite(latest.current.effectTimeMs)
    const vfxNeedsMotion=()=>!controlledVfx()&&effectSettings.current.enabled&&!effectSettings.current.paused&&!reducedMotion&&vfxPlaying&&vfxElapsed<vfxDuration()
    const visibleAreas=model.areas.filter(a=>a.visible)
    function setEffects(visuals:SceneAbilityVisual[],replay=false){
      const previous=seenEffects.current,fresh=previous.frame===f.id&&visuals.some(v=>v.phase==='sequence'&&!previous.ids.has(v.id));seenEffects.current={frame:f.id,ids:new Set(visuals.map(v=>v.id))}
      vfx.forEach(e=>e.dispose());vfx=[];vfxVisuals=[]
      let budget=quality==='low'?8:24,lightBudget=quality==='low'||model.restricted?0:2
      for(const effect of visuals.slice(-(quality==='low'?4:8))){
        if(effect.spec.familyId==='none')continue
        const allowed=(p:ScenePosition)=>!model.restricted||visibleAreas.some(a=>p.x>=a.x&&p.x<=a.x+a.width&&p.y>=a.y&&p.y<=a.y+a.depth&&p.z>=a.z&&p.z<=a.z+a.height)
        if(!allowed(effect.start)||!allowed(effect.end))continue
        for(const planes of model.restricted?visibleAreas.map(clipping):[[]]){
          if(budget--<=0)break
          const entry=createSceneAbilityEffect(effect,{low:quality==='low',clippingPlanes:planes,groundZ:f.groundZ,light:lightBudget>0});if(entry.group.getObjectByName('ability-flash'))lightBudget--;entry.group.userData.editorOverlay=true;scene.add(entry.group);vfx.push(entry);vfxVisuals.push(effect)
        }
      }
      if(fresh||replay){vfxElapsed=0;vfxPlaying=true}
      vfxLast=undefined;applyMotion.current?.();requestDraw(false)
    }
    applyEffects.current=setEffects
    const aimGroup=new THREE.Group();aimGroup.name='ability-aim';aimGroup.userData.editorOverlay=true;scene.add(aimGroup)
    const clearAim=()=>{for(const child of [...aimGroup.children]){const line=child as THREE.Line;line.geometry.dispose();const materials=Array.isArray(line.material)?line.material:[line.material];materials.forEach(m=>m.dispose());aimGroup.remove(child)}}
    applyAim.current=aim=>{
      clearAim();if(!aim||aim.sceneId!==f.id){requestDraw(false);return}
      for(const planes of model.restricted?visibleAreas.map(clipping):[[]])for(const points of sceneAbilityAimLines(aim)){
        const geometry=new THREE.BufferGeometry().setFromPoints(points.map(vector)),material=new THREE.LineDashedMaterial({color:aim.valid?aim.obstruction?'#edbd79':'#a9e7bf':'#ed936f',transparent:true,opacity:.85,depthWrite:false,depthTest:false,dashSize:.18,gapSize:.12,clippingPlanes:planes}),line=new THREE.Line(geometry,material)
        line.raycast=()=>{};line.renderOrder=60;line.computeLineDistances();aimGroup.add(line)
      }
      requestDraw(false)
    }
    const axes=new THREE.Group();axes.userData.editorOverlay=true;axes.visible=false;axes.renderOrder=50
    const axisDirections=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0)]
    axisDirections.forEach((axis,index)=>{const arrow=new THREE.ArrowHelper(axis,new THREE.Vector3(),1,[0xea8d7a,0xabc984,0x83b9ee][index],.22,.13);arrow.userData.axis=index;arrow.traverse(part=>{if(part instanceof THREE.Line||part instanceof THREE.Mesh){keep(part.geometry);const mats=Array.isArray(part.material)?part.material:[part.material];mats.forEach(m=>{m.depthTest=false;m.depthWrite=false;keep(m)});part.renderOrder=50}});axes.add(arrow)})
    if(!model.restricted)scene.add(axes)
    function updateAxes(){const selected=latest.current.selection,target=selected?anchors.get(selected.kind+':'+selected.id):undefined;axes.visible=!!target&&!!latest.current.gizmo&&!model.restricted;if(target?.userData.selection?.kind==='object'&&(latest.current.editorHidden?.includes(target.userData.selection.id)||latest.current.editorProtected?.includes(target.userData.selection.id)))axes.visible=false;if(!target)return;axes.position.copy(target.position).add(new THREE.Vector3(0,.08,0));const size=camera instanceof THREE.OrthographicCamera?(camera.top-camera.bottom)/camera.zoom*.12:camera.position.distanceTo(target.position)*.12;axes.scale.setScalar(Math.max(.3,size));axes.updateMatrixWorld(true)}
    queueMicrotask(assetNotice)
    const draw = () => {
      pending = 0; if (disposed) return
      if(!model.restricted){
        const direction=camera.position.clone().sub(controls.target);direction.y=0;direction.normalize()
        for(const group of pickables){const hidden=group.userData.selection?.kind==='object'&&latest.current.editorHidden?.includes(group.userData.selection.id);group.visible=!hidden;if(hidden)continue;if(group.userData.roof){group.visible=!cutawayValue.current;continue}if(!group.userData.cutawayWall)continue
          const near=nearCutawayWall(group.position,controls.target,direction,group.userData.wallFacing),scale=cutawayValue.current&&near?.18:1
          if(group.scale.y!==scale){group.scale.y=scale;group.updateMatrixWorld(true)}
        }
      }
      updateAxes()
      for(const outline of outlines)outline.helper.setFromObject(outline.target)
      const vfxNow=performance.now()
      if(vfxNeedsMotion()&&document.visibilityState==='visible'){if(vfxLast!==undefined)vfxElapsed+=Math.min(100,Math.max(0,vfxNow-vfxLast));vfxLast=vfxNow;if(vfxElapsed>=vfxDuration())vfxPlaying=false}else vfxLast=undefined
      const elapsed=controlledVfx()?Math.max(0,latest.current.effectTimeMs!):vfxElapsed
      vfx.forEach((entry,i)=>{const sample=sampleAbilityVisual(vfxVisuals[i],elapsed,controlledVfx()||vfxPlaying,reducedMotion);entry.update({...sample,visible:sample.visible&&effectSettings.current.enabled},elapsed/1000)})
      backdrop.update(camera)
      lighting.update(camera,controls.target)
      const moving=animationValue.current&&document.visibilityState==='visible',visualTime=performance.now()/1000
      updateFlameMaterials(resources,visualTime,moving);lighting.animate(moving?visualTime:null)
      if(composer)composer.render(0);else renderer.render(scene,camera)
      const box = element.getBoundingClientRect()
      for (const label of labelElements) {
        const p = (label.anchor?label.anchor.position.clone().add(new THREE.Vector3(0,label.offset,0)):label.position.clone()).project(camera), visible = label.anchor?.visible!==false&&p.z > -1 && p.z < 1 && Math.abs(p.x) < .98 && Math.abs(p.y) < .98
        label.node.hidden = !visible; label.node.style.transform = `translate(-50%, -100%) translate(${(p.x + 1) * box.width / 2}px,${(1 - p.y) * box.height / 2}px)`
      }
    }
    const requestDraw = (cause?:unknown) => {if(cause!==false){renderer.shadowMap.needsUpdate=true;if(contactShadows)contactShadows.needsUpdate=true}if (!pending && !disposed) pending = requestAnimationFrame(draw) }
    capture.current=()=>{
      try{
        // Read immediately after rendering; no persistent drawing buffer or
        // extra render loop is needed during normal editing.
        if(pending){cancelAnimationFrame(pending);pending=0}draw()
        renderer.domElement.toBlob(blob=>{
          if(disposed)return
          if(!blob){setCaptureNotice('Не удалось сохранить снимок.');return}
          const url=URL.createObjectURL(blob),link=document.createElement('a')
          link.href=url;link.download='grani-bytiya-scene.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
          setCaptureNotice('Снимок сцены сохранён в PNG.')
        },'image/png')
      }catch{setCaptureNotice('Не удалось сохранить снимок. Попробуй после загрузки материалов.')}
    }
    applyCutaway.current=requestDraw
    applyPositions.current=next=>{for(const e of next.entities){const group=anchors.get(e.interaction.kind+':'+e.interaction.id);if(group){group.position.copy(vector(e.transform.position));group.updateMatrixWorld(true)}}requestDraw()}
    applyExposure.current=value=>{renderer.toneMappingExposure=value*lighting.exposure;requestDraw()}
    applyLighting.current=(mode,t)=>{
      lighting.configure(mode,t);backdrop.configure(mode,t);renderer.setClearColor(backdrop.background);if(scene.fog)scene.fog.color.set(backdrop.fogColor)
      renderer.toneMappingExposure=exposureValue.current*lighting.exposure;scene.environmentIntensity=lighting.environmentIntensity
      if(contactShadows){contactShadows.blendIntensity=t.contact;contactShadows.enabled=t.contact>0}
      resources.forEach(resource=>{if(resource instanceof THREE.MeshStandardMaterial&&resource.userData.lightEmitter)setEmitterIntensity(resource,(mode==='night'?3:1.3)*t.lamps)})
      // Key/fill respond immediately. Regenerate the reflection map once the
      // direction slider settles, without reallocating scene meshes or canvas.
      const nextKey=radianceKey()
      if(generator&&nextKey!==environmentKey){
        environmentKey=nextKey;clearTimeout(environmentTimer)
        environmentTimer=setTimeout(()=>{refreshEnvironment();requestDraw()},150)
      }
      requestDraw()
    }
    // Selection is an overlay update. It must never dispose the canvas, meshes
    // or pointer capture while a user is starting a drag on an unselected object.
    updateSelection.current=selected=>{
      const items=selected&&!model.restricted?(latest.current.selections?.some(s=>s.kind===selected.kind&&s.id===selected.id)?latest.current.selections:[selected]):[]
      const targets=items.flatMap(s=>{const g=anchors.get(s.kind+':'+s.id);return g&&!latest.current.editorHidden?.includes(s.kind==='object'?s.id:'')?[g]:[]})
      if(targets.length===outlines.length&&targets.every((g,i)=>outlines[i].target===g)){requestDraw();return}
      for(const {helper} of outlines.splice(0)){scene.remove(helper);resources.delete(helper.geometry);resources.delete(helper.material);helper.geometry.dispose();helper.material.dispose()}
      for(const target of targets){target.updateMatrixWorld(true);const helper=new THREE.BoxHelper(target,target.userData.selection?.id===selected?.id?'#89fff0':'#d5ce93');helper.userData.editorOverlay=true;keep(helper.geometry);keep(helper.material);scene.add(helper);outlines.push({helper,target})}
      requestDraw()
    }
    updateSelection.current(latest.current.selection??null)
    controls.addEventListener('change', requestDraw)
    const resize = () => { const width = element.clientWidth, height = element.clientHeight; if (!width || !height){applyMotion.current?.();return;} if(camera instanceof THREE.OrthographicCamera){camera.left=-span*.58*width/height;camera.right=-camera.left;camera.top=span*.58;camera.bottom=-camera.top}else camera.aspect=width/height; camera.updateProjectionMatrix(); renderer.setSize(width, height);composer?.setSize(width,height);const scale=quality==='high'?.5:.35;contactShadows?.setSize(Math.max(1,Math.round(renderer.domElement.width*scale)),Math.max(1,Math.round(renderer.domElement.height*scale)));requestDraw();applyMotion.current?.() }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    const raycaster = new THREE.Raycaster(), cursor = new THREE.Vector2()
    function hits(event: Pick<PointerEvent,'clientX'|'clientY'>) {
      const rect = renderer.domElement.getBoundingClientRect(); cursor.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      raycaster.setFromCamera(cursor, camera)
    }
    function identify(object: THREE.Object3D): { selection: RenderSelection; label: string } | null {
      for (let current: THREE.Object3D | null = object; current; current = current.parent) if (current.userData.selection) return current.userData as { selection: RenderSelection; label: string }
      return null
    }
    function pickHits(){return raycaster.intersectObjects(pickables,true).filter(hit=>{
      for(let p:THREE.Object3D|null=hit.object;p;p=p.parent)if(!p.visible)return false
      return !model.restricted||model.areas.some(a=>hit.point.x>=a.x&&hit.point.x<=a.x+a.width&&hit.point.z>=a.y&&hit.point.z<=a.y+a.depth&&hit.point.y>=a.z&&hit.point.y<=a.z+a.height)
    })}
    function selectionHits(){return pickHits().filter(hit=>{const picked=identify(hit.object)?.selection;if(!picked||!model.restricted&&picked.kind==='object'&&latest.current.editorProtected?.includes(picked.id))return false;const entity=latest.current.model.entities.find(e=>e.interaction.kind===picked.kind&&e.interaction.id===picked.id);return !!entity&&selectionAllowed(picked,entity.geometry,latest.current.selectionFilter)})}
    const down = { x: 0, y: 0, button: -1 }
    const paintPreview=new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1,1,1)),keep(new THREE.MeshBasicMaterial({color:'#8ce7c7',transparent:true,opacity:.3,depthWrite:false})),250)
    paintPreview.count=0;paintPreview.frustumCulled=false;paintPreview.renderOrder=3;paintPreview.userData.editorOverlay=true
    const ruler=new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()])),keep(new THREE.LineBasicMaterial({color:'#f7d896',depthTest:false})))
    ruler.visible=false;ruler.renderOrder=30;ruler.userData.editorOverlay=true
    const ghost=new THREE.Group();ghost.visible=false;ghost.userData.editorOverlay=true;ghost.userData.placementGhost=true
    const guideGeometry=keep(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(32*3),3))),guideMaterial=keep(new THREE.LineBasicMaterial({color:'#a6ebd0',transparent:true,opacity:.9,depthTest:false,depthWrite:false}))
    const supportGuide=new THREE.LineLoop(guideGeometry,guideMaterial);supportGuide.visible=false;supportGuide.frustumCulled=false;supportGuide.renderOrder=31;supportGuide.userData.editorOverlay=true;supportGuide.userData.placementSurface=true
    if(!model.restricted)scene.add(paintPreview,ruler,ghost,supportGuide)
    function showSupportGuide(surface?:PlacementSurface,valid=true){
      supportGuide.visible=!!surface&&!model.restricted&&flatPlacementSurface(surface)
      if(!supportGuide.visible||!surface)return
      const top=placementSurfaceFootprint(surface),count=top.shape==='ellipse'?32:4,positions=guideGeometry.getAttribute('position')
      for(let i=0;i<count;i++){
        const angle=i/count*Math.PI*2,x=top.shape==='ellipse'?Math.cos(angle)/2:[-.5,.5,.5,-.5][i],z=top.shape==='ellipse'?Math.sin(angle)/2:[-.5,-.5,.5,.5][i]
        positions.setXYZ(i,x*top.width,0,z*top.depth)
      }
      positions.needsUpdate=true;guideGeometry.setDrawRange(0,count);guideMaterial.color.set(valid?'#a6ebd0':'#ef8f7b')
      supportGuide.position.set(surface.x,surface.z+surface.height+.004,surface.y);supportGuide.userData.surfaceId=surface.id;supportGuide.userData.valid=valid
    }
    function showPlacementGuide(surfaceId:string|null,valid:boolean){const placement=latest.current.placement;showSupportGuide(placement&&'surfaces' in placement?placement.surfaces?.find(s=>s.id===surfaceId):undefined,valid)}
    const disposeGhost=()=>{const used=new Set<THREE.BufferGeometry|THREE.Material>();ghost.traverse(p=>{if(p instanceof THREE.Mesh){used.add(p.geometry);for(const m of Array.isArray(p.material)?p.material:[p.material])used.add(m)}});for(const resource of used){resources.delete(resource);resource.dispose()}ghost.clear()}
    applyPlacement.current=placement=>{
      const wasVisible=ghost.visible;disposeGhost();ghost.visible=false;showSupportGuide();ghost.rotation.set(0,0,0);if(!placement||model.restricted){requestDraw(false);return}
      const previewMaterial=keep(new THREE.MeshBasicMaterial({color:'#a6ebd0',transparent:true,opacity:.32,depthWrite:false}))
      const addObject=(o:ReturnType<typeof createTabletopObject>)=>{
        const group=new THREE.Group();group.position.copy(vector(o));group.rotation.y=-(o.facing??0)*Math.PI/180;ghost.add(group)
        populateEntityModel({id:o.id,geometry:o,transform:{position:o},identity:{label:o.name},interaction:{kind:'object',id:o.id},appearance:{color:'#9ee9cc',remembered:false,heightKnown:true}},(geometry,_color,x,y,z)=>{const mesh=new THREE.Mesh(keep(geometry),previewMaterial);mesh.position.set(x,y,z);group.add(mesh);return mesh},true)
      }
      if('assembly' in placement){
        const size=assemblyDimensions(placement.assembly,placement.facing);ghost.userData.elevation=placement.elevation;ghost.userData.width=size.width;ghost.userData.depth=size.depth
        assemblyLayout(placement.assembly,{x:0,y:0,z:0},placement.facing).forEach(addObject)
      }else if('object' in placement){
        const o={...placement.object,x:0,y:0,z:0}
        ghost.userData.width=o.width;ghost.userData.depth=o.depth;ghost.userData.elevation=0;addObject(o)
      }else{
        const a=tabletopAsset(placement.asset);if(!a){resources.delete(previewMaterial);previewMaterial.dispose();return}
        const o=createTabletopObject(a.id,'placement:preview',{x:0,y:0,z:0},placement.facing)
        ghost.userData.width=o.width;ghost.userData.depth=o.depth;ghost.userData.elevation=a.id==='timber-beam'?2.46:a.id==='roof-tile'?2.7:a.id==='chandelier'?1.8:0
        addObject(o)
      }
      if(wasVisible){const placed=placementHit();if(placed){ghost.position.copy(vector(placed.point));ghost.visible=true;previewMaterial.color.set(placed.valid?'#a6ebd0':'#ef8f7b');showPlacementGuide(placed.surfaceId,placed.valid)}}
      requestDraw(false)
    }
    applyPlacement.current(latest.current.placement)
    function placementHit(){
      const placement=latest.current.placement
      if(!placement||model.restricted)return null
      const candidates:{point:ScenePosition;surfaceId:string|null;surfaceName:string;distance:number;valid:boolean}[]=[]
      const plane=new THREE.Plane(new THREE.Vector3(0,1,0)),hit=new THREE.Vector3()
      if('assembly' in placement){
        plane.constant=-(f.groundZ+placement.elevation)
        if(!raycaster.ray.intersectPlane(plane,hit))return null
        try{const point=assemblyAnchor(f,placement.assembly,{x:hit.x,y:hit.z,z:hit.y},placement.facing,placement.elevation,latest.current.snapStep)
          return {point,surfaceId:null,surfaceName:placement.assembly.name,distance:raycaster.ray.origin.distanceTo(hit),valid:point.z>=f.minZ&&point.z+placement.assembly.height<=f.maxZ+1e-6&&latest.current.model.entities.filter(e=>e.interaction.kind==='object').length+placement.assembly.objects.length<=MAX_SCENE_OBJECTS}
        }catch{return null}
      }
      const surfaces=placement.surfaces??[]
      const sample=(height:number,surfaceId:string|null)=>{
        plane.constant=-height
        if(!raycaster.ray.intersectPlane(plane,hit))return
        try{
          const point={x:hit.x,y:hit.z,z:height},options={surfaceSnap:placement.surfaceSnap,snapStep:latest.current.snapStep,surfaceId}
          const result='object' in placement?resolveObjectPlacement({...f,maxZ:Number.MAX_SAFE_INTEGER},surfaces,placement.object,point,options):resolveAssetPlacement({...f,maxZ:Number.MAX_SAFE_INTEGER},surfaces,placement.asset,'placement:preview',point,placement.facing,options)
          candidates.push({point:{x:result.object.x,y:result.object.y,z:result.object.z},surfaceId:result.surfaceId,surfaceName:result.surfaceName,distance:raycaster.ray.origin.distanceTo(hit),valid:result.object.z+result.object.height<=f.maxZ+1e-6})
        }catch{/* The entire footprint must fit this surface after grid snapping. */}
      }
      if(placement.surfaceSnap&&('object' in placement?surfacePlacementObject(placement.object):surfacePlacementAsset(placement.asset)))for(const surface of surfaces)if(flatPlacementSurface(surface)&&surface.z+surface.height>=f.groundZ-1e-6)sample(surface.z+surface.height,surface.id)
      sample(f.groundZ+(ghost.userData.elevation??0),null)
      return candidates.sort((a,b)=>a.distance-b.distance)[0]??null
    }
    type Stroke={pointerId:number;first:ScenePosition;last:ScenePosition;brush:TabletopBrush;cells:Map<string,BuildMark>;invalid?:boolean}
    let stroke:Stroke|null=null
    const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-f.groundZ),paintPoint=new THREE.Vector3(),paintMatrix=new THREE.Matrix4()
    const setRuler=(a:ScenePosition,b:ScenePosition)=>{const p=ruler.geometry.getAttribute('position') as THREE.BufferAttribute;p.setXYZ(0,a.x,a.z+.06,a.y);p.setXYZ(1,b.x,b.z+.06,b.y);p.needsUpdate=true;ruler.visible=true;ruler.geometry.computeBoundingSphere();setMeasurement(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z).toFixed(2)+' м');requestDraw()}
    const addPaintPoint=(point:ScenePosition)=>{
      if(!stroke||stroke.invalid)return
      if(stroke.brush.mode==='measure'){stroke.last=point;setRuler(stroke.first,point);return}
      try{
        const mode=stroke.brush.mode,continuous=!mode||mode==='floor'
        const marks:BuildMark[]=continuous?tabletopStrokeCells([stroke.last,point],f,stroke.brush.size):buildStrokeMarks(stroke.brush,stroke.first,point,f)
        if(!continuous)stroke.cells.clear()
        for(const p of marks){const key=`${p.x}:${p.y}:${p.facing??0}:${p.asset??''}`;if(stroke.cells.size>=250&&!stroke.cells.has(key))throw Error('Мазок ограничен 250 модулями.');stroke.cells.set(key,p)}
        stroke.last=point
        let i=0
        for(const p of stroke.cells.values()){
          const a=tabletopAsset(p.asset??stroke.brush.asset??undefined),wall=mode==='wall'||mode==='room'&&a?.category!=='Полы',odd=(p.facing??0)%180!==0
          const width=wall?(odd?a?.depth:a?.width)??2:1.96,depth=wall?(odd?a?.width:a?.depth)??.24:1.96,height=wall?a?.height??2.7:.025
          paintMatrix.makeScale(width,height,depth);paintMatrix.setPosition(p.x,p.z+(wall?height/2:.045),p.y);paintPreview.setMatrixAt(i++,paintMatrix)
        }
        paintPreview.count=i;paintPreview.instanceMatrix.needsUpdate=true;requestDraw()
      }catch(e){stroke.invalid=true;paintPreview.count=0;setHover((e as Error).message);requestDraw()}
    }
    const endPaint=(commit:boolean)=>{
      if(!stroke)return
      const active=stroke;stroke=null;controls.enabled=true;paintPreview.count=0
      if(active.brush.mode==='measure'){if(!commit){ruler.visible=false;setMeasurement('')}}
      else if(commit&&!active.invalid&&active.cells.size)latest.current.onPaintStroke?.([...active.cells.values()])
      if(canvas.hasPointerCapture?.(active.pointerId))canvas.releasePointerCapture(active.pointerId)
      requestDraw()
    }
    const paintDown=(event:PointerEvent)=>{
      const brush=latest.current.brush
      if(stroke){event.stopImmediatePropagation();return true}
      if(event.button!==0||event.altKey||model.restricted||!brush||brush.mode!=='measure'&&!latest.current.onPaintStroke)return false
      hits(event);if(!raycaster.ray.intersectPlane(groundPlane,paintPoint))return false
      if(brush.mode==='measure'){const hit=pickHits()[0];if(hit)paintPoint.copy(hit.point)}
      event.stopImmediatePropagation();event.preventDefault();down.button=-1;canvas.focus({preventScroll:true});controls.enabled=false;ghost.visible=false
      ;(paintPreview.material as THREE.MeshBasicMaterial).color.set(brush.asset===null?'#ec9879':'#8ce7c7')
      const point={x:paintPoint.x,y:paintPoint.z,z:paintPoint.y}
      stroke={pointerId:event.pointerId,first:point,last:point,brush:{...brush},cells:new Map()}
      addPaintPoint(point);canvas.setPointerCapture?.(event.pointerId);return true
    }
    const pointerDown = (event: PointerEvent) => { down.x = event.clientX; down.y = event.clientY; down.button = event.button }
    const pointerUp = (event: PointerEvent) => {
      if (down.button !== 0 || event.button !== 0 || event.altKey || Math.hypot(down.x - event.clientX, down.y - event.clientY) > 5) return
      hits(event)
      // Raycaster does not apply material clipping: only pick intersections inside disclosure bounds.
      const hit = selectionHits()[0]
      const entity = hit && identify(hit.object), current = latest.current
      if(current.placement&&!model.restricted){const placed=placementHit();if(placed)current.onPoint?.(placed.point,{surfaceId:placed.surfaceId,resolved:true});return}
      if (entity && current.selecting !== false && current.onSelect) { current.onSelect(entity.selection,{extend:event.shiftKey||event.ctrlKey||event.metaKey}); return }
      const ground = raycaster.intersectObjects(groundMeshes)[0]
      if (ground) current.onPoint?.({ x: Math.round(ground.point.x * 1000) / 1000, y: Math.round(ground.point.z * 1000) / 1000, z: f.groundZ })
    }
    type Drag={pointerId:number;group:THREE.Object3D;selection:RenderSelection;origin:THREE.Vector3;start:THREE.Vector3;plane:THREE.Plane;moved:boolean;clientX:number;clientY:number;lastX:number;lastY:number;cursorX:number;cursorY:number;axis?:THREE.Vector3;request:boolean;surfaceObject?:PlacementSurface;surfaceId?:string|null;valid:boolean;members:{group:THREE.Object3D;origin:THREE.Vector3;height:number;width:number;depth:number}[]}
    let drag:Drag|null=null
    const dragPoint=new THREE.Vector3()
    const transformReadout=document.createElement('div');transformReadout.className='gb-transform-readout';transformReadout.hidden=true;transformReadout.setAttribute('role','status');transformReadout.setAttribute('aria-live','off');element.appendChild(transformReadout)
    const reportDrag=(fine:boolean,surface?:string)=>{
      if(!drag)return
      const p=drag.group.position,d=p.clone().sub(drag.origin),fmt=(n:number)=>(Math.abs(n)<.0005?0:n).toFixed(3)
      transformReadout.hidden=false;transformReadout.dataset.valid=String(drag.valid)
      transformReadout.textContent=`${fine?'Точно · ':''}${surface?surface+' · ':''}X ${fmt(p.x)} · Y ${fmt(p.z)} · Z ${fmt(p.y)} м | Δ ${fmt(d.x)} / ${fmt(d.z)} / ${fmt(d.y)} м · Esc — отмена`
    }
    const endDrag=(commit:boolean)=>{
      if(!drag)return
      const active=drag;drag=null;controls.enabled=true;transformReadout.hidden=true;showSupportGuide()
      const p=active.group.position,point={x:p.x,y:p.z,z:p.y}
      let accepted=false
      if(commit&&active.moved&&active.valid)try{
        if(active.request){const visible=model.areas.some(a=>a.visible&&point.x>=a.x&&point.x<=a.x+a.width&&point.y>=a.y&&point.y<=a.y+a.depth&&point.z>=a.z&&point.z<=a.z+a.height);if(visible)latest.current.onRequestMove?.(active.selection,point)}
        else if(latest.current.onMove)accepted=latest.current.onMove(active.selection,point,active.surfaceObject?{surfaceId:active.surfaceId??null}:undefined)!==false
      }catch{setHover('Перемещение не применено.')}
      if(!accepted)active.members.forEach(member=>member.group.position.copy(member.origin))
      for(const {helper,target} of outlines)(helper.material as THREE.LineBasicMaterial).color.set(target.userData.selection?.id===latest.current.selection?.id?'#89fff0':'#d5ce93')
      if(commit&&active.moved&&!active.valid)setHover('Перемещение отменено: над поверхностью недостаточно места.')
      canvas.style.cursor='grab'
      if(canvas.hasPointerCapture?.(active.pointerId))canvas.releasePointerCapture(active.pointerId)
      requestDraw()
    }
    const dragDown=(event:PointerEvent)=>{
      canvas.focus({preventScroll:true})
      if(drag){event.stopImmediatePropagation();return}
      if(event.button!==0||event.altKey||event.shiftKey||event.ctrlKey||event.metaKey||(!latest.current.onMove&&!latest.current.onRequestMove))return
      hits(event);updateAxes()
      raycaster.params.Line.threshold=axes.visible?axes.scale.x*.075:.1
      const handle=axes.visible?raycaster.intersectObject(axes,true)[0]:undefined
      let axis:THREE.Vector3|undefined
      if(handle){for(let p:THREE.Object3D|null=handle.object;p&&p!==axes;p=p.parent)if(typeof p.userData.axis==='number')axis=axisDirections[p.userData.axis]}
      const hit=selectionHits()[0],entity=axis&&latest.current.selection?{selection:latest.current.selection}:hit&&identify(hit.object)
      if(!entity||entity.selection.kind==='contact')return
      const group=anchors.get(entity.selection.kind+':'+entity.selection.id)
      if(!group||model.restricted&&(!group.userData.requestMovable||!latest.current.onRequestMove||!hit||!model.areas.some(a=>a.visible&&hit.point.x>=a.x&&hit.point.x<=a.x+a.width&&hit.point.z>=a.y&&hit.point.z<=a.y+a.depth&&hit.point.y>=a.z&&hit.point.y<=a.z+a.height)))return
      // An axis plane contains the axis and faces the camera. Ordinary grabs
      // retain the cursor-to-pivot offset on the grabbed horizontal surface.
      const normal=axis?camera.getWorldDirection(new THREE.Vector3()).addScaledVector(axis,-camera.getWorldDirection(new THREE.Vector3()).dot(axis)):new THREE.Vector3(0,1,0)
      if(normal.lengthSq()<.001)return
      const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(),axis?group.position:hit!.point)
      if(!raycaster.ray.intersectPlane(plane,dragPoint))return
      event.stopImmediatePropagation();event.preventDefault();controls.enabled=false
      const selected=!model.restricted&&latest.current.selections?.some(s=>s.kind===entity.selection.kind&&s.id===entity.selection.id)?latest.current.selections:[entity.selection]
      const keys=new Set(selected.map(s=>s.kind+':'+s.id));for(const e of latest.current.model.entities)if(e.supportObjectId&&keys.has('object:'+e.supportObjectId))keys.add(e.interaction.kind+':'+e.interaction.id)
      const members=[...keys].flatMap(key=>{const target=anchors.get(key),e=latest.current.model.entities.find(e=>e.interaction.kind+':'+e.interaction.id===key);return target?[{group:target,origin:target.position.clone(),height:e?.geometry.height??0,width:e?.geometry.width??0,depth:e?.geometry.depth??0}]:[]})
      const source=!axis&&!model.restricted&&selected.length===1&&entity.selection.kind==='object'?latest.current.moveSurfaces?.find(o=>o.id===entity.selection.id):undefined
      drag={pointerId:event.pointerId,group,selection:entity.selection,origin:group.position.clone(),start:dragPoint.clone(),plane,moved:false,clientX:event.clientX,clientY:event.clientY,lastX:event.clientX,lastY:event.clientY,cursorX:event.clientX,cursorY:event.clientY,axis,request:model.restricted,members,valid:true,surfaceObject:source&&surfacePlacementObject(source)?{...source}:undefined}
      canvas.style.cursor='grabbing'
      canvas.setPointerCapture?.(event.pointerId)
      updateSelection.current?.(entity.selection)
      latest.current.onSelect?.(entity.selection)
    }
    const dragMove=(event:PointerEvent)=>{
      if(!drag||drag.pointerId!==event.pointerId)return
      event.stopImmediatePropagation()
      const rate=event.shiftKey?.1:1
      drag.cursorX+=(event.clientX-drag.lastX)*rate;drag.cursorY+=(event.clientY-drag.lastY)*rate;drag.lastX=event.clientX;drag.lastY=event.clientY
      hits({clientX:drag.cursorX,clientY:drag.cursorY})
      if(!raycaster.ray.intersectPlane(drag.plane,dragPoint))return
      if(Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<5&&!drag.moved)return
      if(drag.surfaceObject){
        const source=drag.surfaceObject,surfaces=latest.current.moveSurfaces??[],grab=drag.start.clone().sub(drag.origin)
        const candidates:{object:PlacementSurface;surfaceId:string|null;surfaceName:string;distance:number}[]=[],plane=new THREE.Plane(new THREE.Vector3(0,1,0)),hit=new THREE.Vector3()
        const sample=(height:number,surfaceId:string|null)=>{
          plane.constant=-(height+grab.y)
          if(!raycaster.ray.intersectPlane(plane,hit))return
          try{const result=resolveObjectPlacement({...f,maxZ:Number.MAX_SAFE_INTEGER},surfaces,source,{x:hit.x-grab.x,y:hit.z-grab.z,z:height},{surfaceSnap:true,surfaceId,snapStep:event.shiftKey?undefined:latest.current.snapStep});candidates.push({...result,distance:raycaster.ray.origin.distanceTo(hit)})}catch{/* A surface must hold the complete current footprint. */}
        }
        for(const surface of surfaces)if(surface.id!==source.id&&flatPlacementSurface(surface)&&surface.z+surface.height>=f.groundZ-1e-6)sample(surface.z+surface.height,surface.id)
        sample(f.groundZ,null)
        const placed=candidates.sort((a,b)=>a.distance-b.distance)[0]
        if(!placed){drag.valid=false;showSupportGuide();requestDraw(false);return}
        const offset=vector(placed.object).sub(drag.origin)
        drag.valid=placed.object.z+placed.object.height<=f.maxZ+1e-6&&drag.members.every(m=>m.origin.y+offset.y+m.height<=f.maxZ+1e-6)
        drag.surfaceId=placed.surfaceId;drag.moved=true
        for(const member of drag.members)member.group.position.copy(member.origin).add(offset)
        for(const {helper} of outlines)(helper.material as THREE.LineBasicMaterial).color.set(drag.valid?'#89fff0':'#ef8f7b')
        showSupportGuide(surfaces.find(s=>s.id===placed.surfaceId),drag.valid)
        setHover(drag.valid?placed.surfaceName+' · Z '+placed.object.z.toFixed(2)+' м':'Нет места над поверхностью · отпусти для отмены')
        reportDrag(event.shiftKey,drag.valid?placed.surfaceName:'Нет места над поверхностью');requestDraw();return
      }
      const step=event.shiftKey?undefined:latest.current.snapStep,snap=(n:number,max:number)=>Math.max(0,Math.min(max,step?Math.round(n/step)*step:n))
      const delta=dragPoint.clone().sub(drag.start);if(drag.axis){const distance=delta.dot(drag.axis);delta.copy(drag.axis).multiplyScalar(distance)}
      const next=drag.origin.clone().add(delta),height=latest.current.model.entities.find(e=>e.interaction.kind===drag!.selection.kind&&e.interaction.id===drag!.selection.id)?.geometry.height??0
      const target=new THREE.Vector3(drag.axis&&!drag.axis.x?drag.origin.x:snap(next.x,f.width),drag.axis?.y?Math.max(f.minZ,Math.min(f.maxZ-height,step?Math.round(next.y/step)*step:next.y)):drag.origin.y,drag.axis&&!drag.axis.z?drag.origin.z:snap(next.z,f.depth)),offset=target.sub(drag.origin)
      const members=drag.members
      if(!drag.axis||drag.axis.x)offset.x=Math.max(-Math.min(...members.map(m=>m.origin.x-m.width/2)),Math.min(f.width-Math.max(...members.map(m=>m.origin.x+m.width/2)),offset.x))
      if(!drag.axis||drag.axis.z)offset.z=Math.max(-Math.min(...members.map(m=>m.origin.z-m.depth/2)),Math.min(f.depth-Math.max(...members.map(m=>m.origin.z+m.depth/2)),offset.z))
      if(drag.axis?.y)offset.y=Math.max(f.minZ-Math.min(...members.map(m=>m.origin.y)),Math.min(f.maxZ-Math.max(...members.map(m=>m.origin.y+m.height)),offset.y))
      for(const member of members)member.group.position.copy(member.origin).add(offset)
      drag.moved=true;reportDrag(event.shiftKey);requestDraw()
    }
    const selectionBox=document.createElement('div');selectionBox.className='gb-selection-marquee';selectionBox.hidden=true;element.appendChild(selectionBox)
    let marquee:{pointerId:number;x:number;y:number;endX:number;endY:number;moved:boolean}|null=null
    const endMarquee=(commit:boolean)=>{
      if(!marquee)return
      const active=marquee;marquee=null;selectionBox.hidden=true;controls.enabled=true
      if(commit){
        if(active.moved){
          const rect=canvas.getBoundingClientRect(),left=Math.min(active.x,active.endX),right=Math.max(active.x,active.endX),top=Math.min(active.y,active.endY),bottom=Math.max(active.y,active.endY)
          const selected=new Map((latest.current.selections??[]).map(s=>[s.kind+':'+s.id,s]))
          for(const group of pickables){const s=group.userData.selection as RenderSelection,e=latest.current.model.entities.find(e=>e.interaction.kind===s.kind&&e.interaction.id===s.id);if(!group.visible||s.kind==='object'&&latest.current.editorProtected?.includes(s.id)||!e||!selectionAllowed(s,e.geometry,latest.current.selectionFilter))continue;const p=new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3()).project(camera),x=rect.left+(p.x+1)*rect.width/2,y=rect.top+(1-p.y)*rect.height/2
            if(p.z>-1&&p.z<1&&x>=left-.5&&x<=right+.5&&y>=top-.5&&y<=bottom+.5){const s=group.userData.selection as RenderSelection;selected.set(s.kind+':'+s.id,s)}
          }
          latest.current.onSelectMany?.([...selected.values()])
        }else{const hit=selectionHits()[0],picked=hit&&identify(hit.object);if(picked)latest.current.onSelect?.(picked.selection,{extend:true})}
      }
      if(canvas.hasPointerCapture?.(active.pointerId))canvas.releasePointerCapture(active.pointerId)
      requestDraw()
    }
    const marqueeDown=(event:PointerEvent)=>{
      if(event.button!==0||!event.shiftKey||event.altKey||model.restricted||!latest.current.onSelectMany||latest.current.brush||latest.current.placement)return false
      event.stopImmediatePropagation();event.preventDefault();canvas.focus({preventScroll:true});controls.enabled=false;hits(event);down.button=-1
      marquee={pointerId:event.pointerId,x:event.clientX,y:event.clientY,endX:event.clientX,endY:event.clientY,moved:false};canvas.setPointerCapture?.(event.pointerId);return true
    }
    const captureMove=(event:PointerEvent)=>{if(marquee&&marquee.pointerId===event.pointerId){event.stopImmediatePropagation();hits(event);marquee.endX=event.clientX;marquee.endY=event.clientY;marquee.moved=Math.hypot(marquee.x-event.clientX,marquee.y-event.clientY)>5;if(marquee.moved){const rect=element.getBoundingClientRect();selectionBox.hidden=false;selectionBox.style.left=Math.min(marquee.x,event.clientX)-rect.left+'px';selectionBox.style.top=Math.min(marquee.y,event.clientY)-rect.top+'px';selectionBox.style.width=Math.abs(marquee.x-event.clientX)+'px';selectionBox.style.height=Math.abs(marquee.y-event.clientY)+'px'}}else if(stroke&&stroke.pointerId===event.pointerId){event.stopImmediatePropagation();hits(event);if(raycaster.ray.intersectPlane(groundPlane,paintPoint)){if(stroke.brush.mode==='measure'){const h=pickHits()[0];if(h)paintPoint.copy(h.point)}addPaintPoint({x:paintPoint.x,y:paintPoint.z,z:paintPoint.y})}}else dragMove(event)}
    const dragUp=(event:PointerEvent)=>{if(marquee&&marquee.pointerId===event.pointerId){event.stopImmediatePropagation();endMarquee(true)}else if(stroke&&stroke.pointerId===event.pointerId){event.stopImmediatePropagation();endPaint(true)}else if(drag&&drag.pointerId===event.pointerId){event.stopImmediatePropagation();endDrag(true)}}
    const dragCancel=(event:PointerEvent)=>{if(marquee?.pointerId===event.pointerId)endMarquee(false);if(stroke&&stroke.pointerId===event.pointerId)endPaint(false);if(drag?.pointerId===event.pointerId)endDrag(false)}
    const blur=()=>{endMarquee(false);endPaint(false);endDrag(false);ghost.visible=false;showSupportGuide();requestDraw(false)}
    const keyboard=(event:globalThis.KeyboardEvent)=>{
      if(event.key==='Escape'&&marquee){event.preventDefault();event.stopPropagation();endMarquee(false);return}
      if(event.key==='Escape'&&stroke){event.preventDefault();event.stopPropagation();endPaint(false);return}
      if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();endDrag(false);return}
      if(drag){event.preventDefault();event.stopPropagation();return}
      if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return
      const action=editorKey(event)==='f'?'focus':event.key==='1'?'top':event.key==='2'?'front':event.key==='3'?'iso':null
      if(action){event.preventDefault();cameraAction.current?.(action)}
    }
    const clickUp=(event:PointerEvent)=>pointerUp(event)
    const pointerMove = (event: PointerEvent) => {
      if(latest.current.placement&&!event.altKey&&!stroke){
        hits(event);const placed=placementHit();ghost.visible=!!placed
        if(placed){ghost.position.copy(vector(placed.point));ghost.traverse(part=>{if(part instanceof THREE.Mesh)(part.material as THREE.MeshBasicMaterial).color.set(placed.valid?'#a6ebd0':'#ef8f7b')});showPlacementGuide(placed.surfaceId,placed.valid);setHover(placed.valid?`${placed.surfaceName} · Z ${placed.point.z.toFixed(2)} м`:'Недостаточно места по высоте');requestDraw(false)}
        else{showSupportGuide();setHover('Нет подходящего места для модели');requestDraw(false)}
        canvas.style.cursor=placed?.valid?'copy':'not-allowed';return
      }
      const previewVisible=ghost.visible||supportGuide.visible;ghost.visible=false;showSupportGuide();if(previewVisible)requestDraw(false);if(latest.current.brush&&!event.altKey){canvas.style.cursor='crosshair';return}hits(event);const hit=selectionHits()[0],picked=hit&&identify(hit.object),entity=picked&&latest.current.model.entities.find(e=>e.interaction.kind===picked.selection.kind&&e.interaction.id===picked.selection.id)
      const requestAllowed=!!entity&&!entity.appearance.remembered&&objectRelocatable(entity.geometry)&&model.areas.some(a=>a.visible&&hit.point.x>=a.x&&hit.point.x<=a.x+a.width&&hit.point.z>=a.y&&hit.point.z<=a.y+a.depth&&hit.point.y>=a.z&&hit.point.y<=a.z+a.height)
      canvas.style.cursor=hit&&(latest.current.onMove&&!model.restricted||latest.current.onRequestMove&&model.restricted&&requestAllowed)&&!event.altKey?'grab':'default';setHover(picked?.label??'')
    }
    const pointerLeave=()=>{if(drag||stroke||marquee)return;ghost.visible=false;showSupportGuide();setHover('');requestDraw(false)}
    const context=(event:MouseEvent)=>{
      event.preventDefault();if(!latest.current.onContext||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return
      hits(event as PointerEvent)
      const targets=uniquePickTargets(selectionHits().flatMap(hit=>{const picked=identify(hit.object);return picked?[picked]:[]})),p=raycaster.ray.intersectPlane(groundPlane,paintPoint)
      latest.current.onContext(targets[0]?.selection??null,p?{x:p.x,y:p.z,z:p.y}:null,{x:event.clientX,y:event.clientY,targets})
    }
    const lost = (event: Event) => { event.preventDefault(); setFailure('3D-контекст потерян. Переключись на схему; изменения кампании сохраняются отдельно.'); latest.current.onUnavailable?.() }
    const canvas = renderer.domElement
    const captureDown=(event:PointerEvent)=>{pointerDown(event);if(!marqueeDown(event)&&!paintDown(event))dragDown(event)}
    canvas.addEventListener('pointerdown',captureDown,true);canvas.addEventListener('pointermove',captureMove,true);canvas.addEventListener('pointerup',dragUp,true);canvas.addEventListener('pointercancel',dragCancel);canvas.addEventListener('lostpointercapture',dragCancel);canvas.addEventListener('keydown',keyboard)
    window.addEventListener('blur',blur)
    canvas.addEventListener('contextmenu',context);canvas.addEventListener('pointerup', clickUp); canvas.addEventListener('pointermove', pointerMove);canvas.addEventListener('pointerleave',pointerLeave);canvas.addEventListener('webglcontextlost', lost)
    let motionTimer:ReturnType<typeof setTimeout>|undefined
    const visibleMotionSource=()=>pickables.some(group=>group.userData.liveFlame&&(model.restricted||!latest.current.editorHidden?.includes(group.userData.selection?.id)))
    const wantsMotion=()=>vfxNeedsMotion()||!!liveEmitters&&visibleMotionSource()&&animationValue.current
    const motionTick=()=>{motionTimer=undefined;if(disposed||!wantsMotion()||document.visibilityState!=='visible'||!element.clientWidth||!element.clientHeight)return;requestDraw(false);motionTimer=setTimeout(motionTick,50)}
    const syncMotion=()=>{clearTimeout(motionTimer);motionTimer=undefined;vfxLast=undefined;if(!disposed&&wantsMotion()&&document.visibilityState==='visible'&&element.clientWidth&&element.clientHeight)motionTimer=setTimeout(motionTick,50);requestDraw(false)}
    applyMotion.current=syncMotion;document.addEventListener('visibilitychange',syncMotion);syncMotion()
    setEffects(latest.current.model.visuals);applyAim.current?.(latest.current.abilityAim??null);applyGuides.current?.(latest.current.marker??null,latest.current.route??[])
    requestDraw()
    return () => {
      restoreFocus.current=document.activeElement===canvas
      cameraState.current = { id: f.id, position: camera.position.clone(), target: controls.target.clone(),zoom:camera.zoom }
      applyGuides.current=null;applyEffects.current=null;applyAim.current=null;vfx.forEach(e=>e.dispose());clearAim()
      reset.current = null;cameraAction.current=null;capture.current=null;updateSelection.current=null;applyExposure.current=null;applyLighting.current=null;applyCutaway.current=null;applyPositions.current=null;applyPlacement.current=null;applyMotion.current=null;disposed = true;clearTimeout(motionTimer);document.removeEventListener('visibilitychange',syncMotion);clearTimeout(environmentTimer);endMarquee(false);selectionBox.remove();endPaint(false);endDrag(false);transformReadout.remove();cancelAnimationFrame(pending);observer.disconnect();controls.dispose()
      canvas.removeEventListener('pointerdown',captureDown,true);canvas.removeEventListener('pointermove',captureMove,true);canvas.removeEventListener('pointerup',dragUp,true);canvas.removeEventListener('pointercancel',dragCancel);canvas.removeEventListener('lostpointercapture',dragCancel);canvas.removeEventListener('keydown',keyboard)
      canvas.removeEventListener('contextmenu',context);canvas.removeEventListener('pointerup', clickUp); canvas.removeEventListener('pointermove', pointerMove);canvas.removeEventListener('pointerleave',pointerLeave);canvas.removeEventListener('webglcontextlost', lost)
      window.removeEventListener('blur',blur)
      passes.forEach(pass=>pass.dispose());composer?.dispose();lighting.dispose();backdrop.dispose();assetLibrary.dispose();surfaceLibrary.dispose();environment?.dispose();generator?.dispose();resources.forEach(v => v.dispose());renderer.dispose();canvas.remove();labelElements.forEach(v => v.node.remove())
    }
    // Changing a callback alone must not rebuild GPU resources or reset the camera.
  }, [constructionModel, quality, grid, labels,clay,orthographic,tabletop,videoReference,environmentKind])
  useEffect(()=>{applyGuides.current?.(marker??null,route??[])},[guidesJSON])
  useEffect(()=>{applyEffects.current?.(model.visuals)},[model.visuals])
  useEffect(()=>{applyAim.current?.(props.abilityAim??null)},[props.abilityAim])
  useEffect(()=>{applyMotion.current?.()},[props.effectTimeMs])
  useEffect(()=>{const replay=effectSettings.current.replay!==effectReplay;effectSettings.current={enabled:effectsEnabled,paused:effectsPaused,replay:effectReplay};if(replay)applyEffects.current?.(model.visuals,true);applyMotion.current?.()},[effectsEnabled,effectsPaused,effectReplay,model.visuals])
  useEffect(()=>{animationValue.current=animated;saveMotionPreference(animated);applyMotion.current?.()},[animated])
  useEffect(()=>{applyPositions.current?.(model)},[model])
  useEffect(()=>{applyPlacement.current?.(props.placement)},[props.placement])
  useEffect(()=>{cutawayValue.current=cutaway;applyCutaway.current?.()},[cutaway])
  useEffect(()=>{exposureValue.current=exposure;applyExposure.current?.(exposure)},[exposure])
  useEffect(()=>{lightingState.current={mode:lightingMode,tuning};applyLighting.current?.(lightingMode,tuning)},[lightingMode,tuning])
  useEffect(()=>{saveViewLightSettings({version:1,mode:lightingMode,tuning,exposure})},[lightingMode,tuning,exposure])
  useEffect(()=>{updateSelection.current?.(selection??null);applyCutaway.current?.()},[selection,props.selections,props.gizmo,props.editorHidden,props.editorProtected])
  useEffect(()=>{applyMotion.current?.()},[props.editorHidden])
  useEffect(()=>{if(props.focusRequest)cameraAction.current?.('focus')},[props.focusRequest])
  return <div className="gb-scene-3d" data-environment={environmentKind}>
    <details className="gb-view-controls"><summary>Камера и отображение</summary><div className="gb-render-toolbar"><button className="w6-button" type="button" onClick={() => reset.current?.()}>Вся сцена</button>
      <button className="w6-button" type="button" onClick={()=>cameraAction.current?.('top')} title="1">Сверху</button>
      <button className="w6-button" type="button" onClick={()=>cameraAction.current?.('front')} title="2">Спереди</button>
      <button className="w6-button" type="button" onClick={()=>cameraAction.current?.('iso')} title="3">{orthographic?'Изометрия':'Перспектива'}</button>
      {videoReference&&<button className="w6-button" type="button" onClick={()=>{cameraAction.current?.('reference');setOrthographic(true);setCutaway(true);setGrid(false);setLabels(false);setLightingMode('tavern');setTuning(defaultLightTuning('tavern'));setExposure(1)}}>Ракурс из ролика</button>}
      <button className="w6-button" type="button" disabled={!selection} onClick={()=>cameraAction.current?.('focus')} title="F">К выбранному</button>
      <button className="w6-button" type="button" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen?.().catch(()=>{});else void host.current?.requestFullscreen?.().catch(()=>{})}}>Во весь экран</button>
      <button className="w6-button" type="button" disabled={!!failure} onClick={()=>capture.current?.()}>Снимок сцены</button>
      <label><input type="checkbox" checked={grid} onChange={e => setGrid(e.currentTarget.checked)}/> Сетка</label>
      <label><input type="checkbox" checked={labels} onChange={e => setLabels(e.currentTarget.checked)}/> Подписи</label>
      <label><input type="checkbox" checked={orthographic} onChange={e=>setOrthographic(e.currentTarget.checked)}/> Ортографическая камера</label>
      {tabletop&&!model.restricted&&<label><input type="checkbox" checked={cutaway} onChange={e=>setCutaway(e.currentTarget.checked)}/> Обзор интерьера</label>}
      <label>Качество <select aria-label="Качество 3D" value={quality} onChange={e => setQuality(e.currentTarget.value)}><option value="low">Экономное</option><option value="balanced">Сбалансированное</option><option value="high">Высокое</option></select></label>
      <label>Свет <select aria-label="Освещение 3D" value={lightingMode} onChange={e=>{const mode=e.currentTarget.value as LightingMode;setLightingMode(mode);setTuning(defaultLightTuning(mode))}}>{(Object.keys(lightingLabels) as LightingMode[]).map(mode=><option key={mode} value={mode}>{lightingLabels[mode]}</option>)}</select></label>
      <label>Экспозиция <input aria-label="Экспозиция 3D" type="range" min="0.5" max="1.6" step="0.05" value={exposure} onChange={e=>setExposure(Number(e.currentTarget.value))}/></label>
      {tabletop&&<label><input type="checkbox" checked={animated} onChange={e=>setAnimated(e.currentTarget.checked)}/> Живой огонь</label>}
      <label><input type="checkbox" checked={effectsEnabled} onChange={e=>setEffectsEnabled(e.currentTarget.checked)}/> Эффекты способностей</label>
      {props.effectTimeMs===undefined&&<><button className="w6-button" type="button" disabled={!effectsEnabled||!model.visuals.length} onClick={()=>setEffectsPaused(v=>!v)}>{effectsPaused?'Продолжить эффекты':'Пауза эффектов'}</button>
      <button className="w6-button" type="button" disabled={!effectsEnabled||!model.visuals.some(v=>v.phase==='sequence')} onClick={()=>{setEffectsPaused(false);setEffectReplay(n=>n+1)}}>Повторить эффект</button></>}
      <label><input type="checkbox" checked={clay} onChange={e=>setClay(e.currentTarget.checked)}/> Без текстур</label>
      <span className="gb-model-status">{sceneEnvironmentLabels[environmentKind]}</span><span className="gb-model-status" role="status">{assetStatus}</span>
      {captureNotice&&<span className="gb-model-status" role="status">{captureNotice}</span>}
    </div>
    </details><details className="gb-light-panel"><summary>Настройка света</summary><nav className="gb-light-presets" aria-label="Световые пресеты">{(['day','tavern','night'] as const).map(mode=><button type="button" key={mode} aria-pressed={lightingMode===mode} onClick={()=>{setLightingMode(mode);setTuning(defaultLightTuning(mode))}}>{lightingLabels[mode]}</button>)}</nav><div className="gb-light-controls">
      <label>Направление <output>{tuning.azimuth}°</output><input aria-label="Азимут света" type="range" min="0" max="360" step="5" value={tuning.azimuth} onChange={e=>changeTuning('azimuth',Number(e.currentTarget.value))}/></label>
      <label>Высота <output>{tuning.elevation}°</output><input aria-label="Высота света" type="range" min="5" max="85" step="1" value={tuning.elevation} onChange={e=>changeTuning('elevation',Number(e.currentTarget.value))}/></label>
      <label>Основной свет <output>{Math.round(tuning.sun*100)}%</output><input aria-label="Яркость основного света" type="range" min="0" max="2" step="0.05" value={tuning.sun} onChange={e=>changeTuning('sun',Number(e.currentTarget.value))}/></label>
      <label>Заполняющий свет <output>{Math.round(tuning.ambient*100)}%</output><input aria-label="Заполняющий свет" type="range" min="0" max="2" step="0.05" value={tuning.ambient} onChange={e=>changeTuning('ambient',Number(e.currentTarget.value))}/></label>
      <label>Фонари <output>{Math.round(tuning.lamps*100)}%</output><input aria-label="Яркость фонарей" type="range" min="0" max="3" step="0.1" value={tuning.lamps} onChange={e=>changeTuning('lamps',Number(e.currentTarget.value))}/></label>
      <label>Мягкость теней <output>{tuning.softness.toFixed(2)}×</output><input aria-label="Мягкость теней" type="range" min="0.25" max="3" step="0.05" value={tuning.softness} onChange={e=>changeTuning('softness',Number(e.currentTarget.value))}/></label>
      <label>Контактные тени <output>{Math.round(tuning.contact*100)}%</output><input aria-label="Контактные тени" type="range" min="0" max="1" step="0.05" disabled={quality==='low'||model.restricted} value={tuning.contact} onChange={e=>changeTuning('contact',Number(e.currentTarget.value))}/></label>
      <button className="w6-button" type="button" onClick={()=>{setTuning(defaultLightTuning(lightingMode));setExposure(1)}}>Сбросить свет</button>
    </div><p>Настройки сохраняются в этом браузере и меняют только вид сцены.</p></details>
    <div className="gb-3d-canvas" data-environment={environmentKind} ref={host}><SceneAtmosphere environment={environmentKind} night={lightingMode==='night'}/></div>{measurement&&<output className="gb-ruler-readout">↔ {measurement}</output>}
    {failure && <p role="alert" className="gb-scene-state">{failure}</p>}
    <p className="gb-map-caption">{props.brush?`${props.brush.mode==='measure'?'ЛКМ и тяни — измерить расстояние':props.brush.mode==='wall'?'ЛКМ и тяни — построить стену':props.brush.mode==='room'?'ЛКМ и тяни — построить комнату':props.brush.mode==='rectangle'?'ЛКМ и тяни — заполнить прямоугольник':'Зажми ЛКМ — рисовать пол'} · Esc — отмена · Alt+ЛКМ — камера`:props.onMove?'ЛКМ — перенос · Shift во время переноса — точно, без сетки · Esc — отмена · Alt+ЛКМ — камера':'ЛКМ — выбор · перетаскивание — поворот'} · ПКМ/СКМ — сдвиг · колесо — масштаб · F — к выбранному · 1/2/3 — виды. XYZ в метрах. {hover}</p>
  </div>
}
