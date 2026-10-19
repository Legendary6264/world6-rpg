import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ScenePosition } from './sceneTypes'
import type { KnownArea } from './scenePerception'
import { entityAreas } from './scene3dModel'
import {populateEntityModel} from './scene3dMeshes'
import type {Surface} from './scene3dMeshes'
import {SceneAssetLibrary,detailedAsset} from './scene3dAssets'
import {SceneSurfaceLibrary,surfaceUV} from './scene3dSurfaces'
import type { RenderEntity, RenderSelection, SceneRenderModel } from './scene3dModel'

type Props = { model: SceneRenderModel; selection?: RenderSelection | null; selecting?: boolean;
  onPoint?: (point: ScenePosition) => void; onSelect?: (selection: RenderSelection) => void;
  onMove?: (selection:RenderSelection,point:ScenePosition)=>boolean|void; snapStep?:number;
  marker?: ScenePosition | null; route?: ScenePosition[]; onUnavailable?: () => void }
const vector = (p: ScenePosition) => new THREE.Vector3(p.x, p.z, p.y)
const clipping = (a: KnownArea) => [new THREE.Plane(new THREE.Vector3(1, 0, 0), -a.x),
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), a.x + a.width),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -a.y), new THREE.Plane(new THREE.Vector3(0, 0, -1), a.y + a.depth),
  new THREE.Plane(new THREE.Vector3(0, 1, 0), -a.z), new THREE.Plane(new THREE.Vector3(0, -1, 0), a.z + a.height)]

export default function Scene3D(props: Props) {
  const { model, selection, marker, route } = props
  const host = useRef<HTMLDivElement>(null), latest = useRef(props), reset = useRef<(() => void) | null>(null)
  const cameraAction=useRef<((action:'top'|'front'|'iso'|'focus')=>void)|null>(null),restoreFocus=useRef(false)
  const updateSelection=useRef<((selection:RenderSelection|null)=>void)|null>(null)
  const [quality, setQuality] = useState('balanced'), [grid, setGrid] = useState(true), [labels, setLabels] = useState(true)
  const [failure, setFailure] = useState(''), [hover, setHover] = useState('')
  const [assetStatus,setAssetStatus]=useState('')
  const cameraState = useRef<{ id: string; position: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  useEffect(() => { latest.current = props })
  useEffect(() => {
    const element = host.current
    if (!element) return
    const f = model.frame
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor('#101725')
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15
    renderer.domElement.setAttribute('aria-label', model.title + ' · трёхмерная сцена')
    renderer.domElement.setAttribute('role', 'img')
    renderer.domElement.tabIndex = 0
    element.appendChild(renderer.domElement)
    if(restoreFocus.current)renderer.domElement.focus({preventScroll:true})
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(46, 1, .05, Math.max(500, f.width * 8, f.depth * 8, (f.maxZ - f.minZ) * 8))
    const span = Math.max(f.width, f.depth, 5), center = new THREE.Vector3(f.width / 2, f.groundZ, f.depth / 2)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN
    controls.maxPolarAngle = Math.PI / 2 - .02; controls.minDistance = .5; controls.maxDistance = span * 4
    controls.enableDamping = false
    const home = () => { controls.target.copy(center); camera.position.set(center.x + span * .65, center.y + span * .9, center.z + span * .85); controls.update() }
    const saved = cameraState.current
    if (saved?.id === f.id) { camera.position.copy(saved.position); controls.target.copy(saved.target); controls.update() } else home()
    reset.current = home
    cameraAction.current=action=>{
      if(action==='focus'){
        const selected=latest.current.selection,entity=pickables.find(g=>g.userData.selection?.id===selected?.id&&g.userData.selection?.kind===selected?.kind)
        if(!entity)return
        const bounds=new THREE.Box3().setFromObject(entity),target=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3())
        const direction=camera.position.clone().sub(controls.target).normalize(),distance=Math.max(2,Math.max(size.x,size.y,size.z)*2.8)
        controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,distance)
      }else{
        controls.target.copy(center)
        if(action==='top')camera.position.set(center.x+.001,center.y+span*1.25,center.z+.001)
        else if(action==='front')camera.position.set(center.x,center.y+span*.04,center.z+span*1.5)
        else{home();return}
      }
      controls.update()
    }
    scene.add(new THREE.HemisphereLight('#c2dcec', '#343c2b', 1.5))
    const sun = new THREE.DirectionalLight('#ffe4bf', 3)
    sun.position.set(center.x - span * .5, f.groundZ + span, center.z + span * .3); sun.target.position.copy(center)
    sun.castShadow = !model.restricted && quality !== 'low'; sun.shadow.mapSize.set(quality==='high'?2048:1024,quality==='high'?2048:1024)
    sun.shadow.camera.left = sun.shadow.camera.bottom = -span; sun.shadow.camera.right = sun.shadow.camera.top = span
    sun.shadow.camera.far = span * 4; sun.shadow.normalBias = .05; scene.add(sun, sun.target)
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
    const keep = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture,>(v: T): T => { resources.add(v); return v }
    let environment:THREE.WebGLRenderTarget|undefined
    if(quality!=='low'&&renderer.capabilities?.maxTextures){
      const room=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer)
      environment=generator.fromScene(room,.06);scene.environment=environment.texture;scene.environmentIntensity=.45
      room.dispose();generator.dispose()
    }
    const assetLibrary=new SceneAssetLibrary(Math.min(quality==='high'?8:4,renderer.capabilities?.getMaxAnisotropy()??4))
    const surfaceLibrary=new SceneSurfaceLibrary(()=>requestDraw(),Math.min(quality==='high'?8:4,renderer.capabilities?.getMaxAnisotropy()??4))
    let assetsPending=0,assetsFailed=0
    const assetNotice=()=>{if(!disposed)setAssetStatus(quality==='low'?'Упрощённые модели':assetsPending?'Загрузка детальных моделей…':assetsFailed?'Часть моделей недоступна · показаны упрощённые':'Детальные модели · PBR')}
    const material = (color: string, opacity = 1, planes: THREE.Plane[] = []) => keep(new THREE.MeshStandardMaterial({ color,
      roughness: .85, metalness: .08, transparent: opacity < 1, opacity, clippingPlanes: planes, side: THREE.DoubleSide }))
    const floorColor = f.palette === 'forest' ? '#304f42' : f.palette === 'stone' ? '#454c5b' : '#2e3e55'
    const outlines:{helper:THREE.BoxHelper;target:THREE.Object3D}[]=[],anchors=new Map<string,THREE.Object3D>()
    const pickables: THREE.Object3D[] = [], groundMeshes: THREE.Mesh[] = [], labelElements: { node: HTMLSpanElement; position: THREE.Vector3; anchor?:THREE.Object3D; offset:number }[] = []
    function floor(a: KnownArea) {
      if (f.groundZ < a.z || f.groundZ > a.z + a.height) return
      const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(a.width, a.depth)), material(a.visible ? floorColor : '#292e3d'))
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(a.x + a.width / 2, f.groundZ, a.y + a.depth / 2)
      if(quality!=='low'){
        const uv=mesh.geometry.getAttribute('uv'),p=mesh.geometry.getAttribute('position')
        for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+mesh.position.x)/3,(-p.getY(i)+mesh.position.z)/3)
        surfaceLibrary.apply(mesh.material as THREE.MeshStandardMaterial,f.palette==='forest'?'forest':'paving')
        if(!a.visible)(mesh.material as THREE.MeshStandardMaterial).color.set('#555b65')
      }
      mesh.receiveShadow = true; mesh.userData.area = a; scene.add(mesh); groundMeshes.push(mesh)
      if (grid) {
        // Bound line count even for imported million-metre scenes.
        const step = Math.max(1, Math.ceil(Math.max(f.width, f.depth) / 100)), points: number[] = []
        for (let x = Math.ceil(a.x / step) * step; x <= a.x + a.width; x += step) points.push(x, f.groundZ + .008, a.y, x, f.groundZ + .008, a.y + a.depth)
        for (let y = Math.ceil(a.y / step) * step; y <= a.y + a.depth; y += step) points.push(a.x, f.groundZ + .008, y, a.x + a.width, f.groundZ + .008, y)
        scene.add(new THREE.LineSegments(keep(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))), keep(new THREE.LineBasicMaterial({ color: '#78938c', transparent: true, opacity: .18 }))))
      }
    }
    model.areas.forEach(floor)
    function entityMesh(e: RenderEntity, planes: THREE.Plane[]) {
      const group = new THREE.Group(), p = e.transform.position
      group.position.copy(vector(p)); group.userData.selection = { ...e.interaction }; group.userData.label = e.identity.label
      const opacity = e.appearance.remembered ? .4 : 1, surfaces=new Map<string,THREE.Material>()
      populateEntityModel(e,(geometry,color,x,y,z,options:Surface={})=>{
        const key=JSON.stringify([color,options]),alpha=opacity*(options.opacity??1)
        let mat=surfaces.get(key)
        if(!mat){const standard=keep(new THREE.MeshStandardMaterial({color,roughness:options.roughness??.82,metalness:options.metalness??.08,transparent:alpha<1,opacity:alpha,clippingPlanes:planes,side:THREE.DoubleSide,...(options.emissive?{emissive:options.emissive,emissiveIntensity:1.8}:{})}));if(options.texture&&quality!=='low')surfaceLibrary.apply(standard,options.texture);mat=standard;surfaces.set(key,mat)}
        if(options.texture)surfaceUV(geometry,new THREE.Vector3(x,y,z))
        const part=new THREE.Mesh(keep(geometry),mat);part.position.set(x,y,z);part.castShadow=!model.restricted;part.receiveShadow=true;group.add(part);return part
      },quality==='low')
      scene.add(group); pickables.push(group);anchors.set(e.interaction.kind+':'+e.interaction.id,group)
      if(quality!=='low'&&detailedAsset(e)){
        assetsPending++
        void assetLibrary.instantiate(e,planes,model.restricted).then(detailed=>{
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
    function line(points: ScenePosition[], color: string, planes: THREE.Plane[] = []) {
      if (points.length < 2) return
      scene.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(points.map(p => vector({ ...p, z: p.z + .06 })))), keep(new THREE.LineBasicMaterial({ color, clippingPlanes: planes }))))
    }
    if (route) line(route, '#82fff0')
    if (marker) {
      const markerMesh = new THREE.Mesh(keep(new THREE.TorusGeometry(.45, .045, 6, 24)), material('#c1ffe9'))
      markerMesh.rotation.x = Math.PI / 2; markerMesh.position.copy(vector(marker)); markerMesh.position.y += .06; scene.add(markerMesh)
    }
    // Show static disclosed VFX only. Effects never tick the authoritative game clock.
    for (const effect of model.visuals) {
      const allowed = (p: ScenePosition) => !model.restricted || model.areas.some(a => a.visible && p.x >= a.x && p.x <= a.x + a.width && p.y >= a.y && p.y <= a.y + a.depth && p.z >= a.z && p.z <= a.z + a.height)
      if (!allowed(effect.start) || !allowed(effect.end)) continue
      const clips = model.restricted ? model.areas.filter(a => a.visible).map(clipping) : [[]]
      for (const planes of clips) {
        if (effect.shape === 'beam') line([effect.start, effect.end], '#b4a7ff', planes)
        else {
          const ring = new THREE.Mesh(keep(new THREE.SphereGeometry(Math.max(.1, Math.min(effect.radius, 100)), 16, 10)), keep(new THREE.MeshBasicMaterial({ color: '#aa98f0', wireframe: true, transparent: true, opacity: .45, clippingPlanes: planes })))
          ring.position.copy(vector(effect.end)); scene.add(ring)
        }
      }
    }
    let pending = 0, disposed = false
    queueMicrotask(assetNotice)
    const draw = () => {
      pending = 0; if (disposed) return
      for(const outline of outlines)outline.helper.setFromObject(outline.target)
      renderer.render(scene, camera)
      const box = element.getBoundingClientRect()
      for (const label of labelElements) {
        const p = (label.anchor?label.anchor.position.clone().add(new THREE.Vector3(0,label.offset,0)):label.position.clone()).project(camera), visible = p.z > -1 && p.z < 1 && Math.abs(p.x) < .98 && Math.abs(p.y) < .98
        label.node.hidden = !visible; label.node.style.transform = `translate(-50%, -100%) translate(${(p.x + 1) * box.width / 2}px,${(1 - p.y) * box.height / 2}px)`
      }
    }
    const requestDraw = () => { if (!pending && !disposed) pending = requestAnimationFrame(draw) }
    // Selection is an overlay update. It must never dispose the canvas, meshes
    // or pointer capture while a user is starting a drag on an unselected object.
    updateSelection.current=selected=>{
      const target=selected&&!model.restricted?anchors.get(selected.kind+':'+selected.id):undefined
      if(target&&outlines[0]?.target===target)return
      for(const {helper} of outlines.splice(0)){scene.remove(helper);resources.delete(helper.geometry);resources.delete(helper.material);helper.geometry.dispose();helper.material.dispose()}
      if(target){target.updateMatrixWorld(true);const helper=new THREE.BoxHelper(target,'#89fff0');keep(helper.geometry);keep(helper.material);scene.add(helper);outlines.push({helper,target})}
      requestDraw()
    }
    updateSelection.current(latest.current.selection??null)
    controls.addEventListener('change', requestDraw)
    const resize = () => { const width = element.clientWidth, height = element.clientHeight; if (!width || !height) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); requestDraw() }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    const raycaster = new THREE.Raycaster(), cursor = new THREE.Vector2()
    function hits(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect(); cursor.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      raycaster.setFromCamera(cursor, camera)
    }
    function identify(object: THREE.Object3D): { selection: RenderSelection; label: string } | null {
      for (let current: THREE.Object3D | null = object; current; current = current.parent) if (current.userData.selection) return current.userData as { selection: RenderSelection; label: string }
      return null
    }
    const down = { x: 0, y: 0, button: -1 }
    const pointerDown = (event: PointerEvent) => { down.x = event.clientX; down.y = event.clientY; down.button = event.button }
    const pointerUp = (event: PointerEvent) => {
      if (down.button !== 0 || event.button !== 0 || event.altKey || Math.hypot(down.x - event.clientX, down.y - event.clientY) > 5) return
      hits(event)
      // Raycaster does not apply material clipping: only pick intersections inside disclosure bounds.
      const hit = raycaster.intersectObjects(pickables, true).find(h => !model.restricted || model.areas.some(a => h.point.x >= a.x && h.point.x <= a.x + a.width && h.point.z >= a.y && h.point.z <= a.y + a.depth && h.point.y >= a.z && h.point.y <= a.z + a.height))
      const entity = hit && identify(hit.object), current = latest.current
      if (entity && current.selecting !== false && current.onSelect) { current.onSelect(entity.selection); return }
      const ground = raycaster.intersectObjects(groundMeshes)[0]
      if (ground) current.onPoint?.({ x: Math.round(ground.point.x * 1000) / 1000, y: Math.round(ground.point.z * 1000) / 1000, z: f.groundZ })
    }
    type Drag={pointerId:number;group:THREE.Object3D;selection:RenderSelection;origin:THREE.Vector3;start:THREE.Vector3;plane:THREE.Plane;moved:boolean;clientX:number;clientY:number}
    let drag:Drag|null=null
    const dragPoint=new THREE.Vector3()
    const endDrag=(commit:boolean)=>{
      if(!drag)return
      const active=drag;drag=null;controls.enabled=true
      const p=active.group.position,point={x:p.x,y:p.z,z:p.y}
      let accepted=false
      if(commit&&active.moved&&latest.current.onMove)try{accepted=latest.current.onMove(active.selection,point)!==false}catch{setHover('Перемещение не применено.')}
      if(!accepted)active.group.position.copy(active.origin)
      canvas.style.cursor='grab'
      if(canvas.hasPointerCapture?.(active.pointerId))canvas.releasePointerCapture(active.pointerId)
      requestDraw()
    }
    const dragDown=(event:PointerEvent)=>{
      canvas.focus({preventScroll:true})
      if(drag){event.stopImmediatePropagation();return}
      if(event.button!==0||event.altKey||model.restricted||!latest.current.onMove)return
      hits(event)
      const hit=raycaster.intersectObjects(pickables,true)[0],entity=hit&&identify(hit.object)
      if(!entity||entity.selection.kind==='contact')return
      const group=anchors.get(entity.selection.kind+':'+entity.selection.id)
      if(!group)return
      // Work through the grabbed surface, retaining the cursor-to-pivot offset.
      const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-hit.point.y)
      if(!raycaster.ray.intersectPlane(plane,dragPoint))return
      event.stopImmediatePropagation();event.preventDefault();controls.enabled=false
      drag={pointerId:event.pointerId,group,selection:entity.selection,origin:group.position.clone(),start:dragPoint.clone(),plane,moved:false,clientX:event.clientX,clientY:event.clientY}
      canvas.style.cursor='grabbing'
      canvas.setPointerCapture?.(event.pointerId)
      updateSelection.current?.(entity.selection)
      latest.current.onSelect?.(entity.selection)
    }
    const dragMove=(event:PointerEvent)=>{
      if(!drag||drag.pointerId!==event.pointerId)return
      event.stopImmediatePropagation();hits(event)
      if(!raycaster.ray.intersectPlane(drag.plane,dragPoint))return
      if(Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<5&&!drag.moved)return
      const step=latest.current.snapStep,snap=(n:number,max:number)=>Math.max(0,Math.min(max,step?Math.round(n/step)*step:n))
      drag.group.position.set(snap(drag.origin.x+dragPoint.x-drag.start.x,f.width),drag.origin.y,snap(drag.origin.z+dragPoint.z-drag.start.z,f.depth))
      drag.moved=true;requestDraw()
    }
    const dragUp=(event:PointerEvent)=>{if(drag&&drag.pointerId===event.pointerId){event.stopImmediatePropagation();endDrag(true)}}
    const dragCancel=(event:PointerEvent)=>{if(drag?.pointerId===event.pointerId)endDrag(false)}
    const blur=()=>endDrag(false)
    const keyboard=(event:globalThis.KeyboardEvent)=>{
      if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();endDrag(false);return}
      if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return
      const action=event.key.toLowerCase()==='f'?'focus':event.key==='1'?'top':event.key==='2'?'front':event.key==='3'?'iso':null
      if(action){event.preventDefault();cameraAction.current?.(action)}
    }
    const clickUp=(event:PointerEvent)=>pointerUp(event)
    const pointerMove = (event: PointerEvent) => { hits(event); const hit = raycaster.intersectObjects(pickables, true)[0];canvas.style.cursor=hit&&latest.current.onMove&&!model.restricted&&!event.altKey?'grab':'default';setHover(hit ? identify(hit.object)?.label ?? '' : '') }
    const lost = (event: Event) => { event.preventDefault(); setFailure('3D-контекст потерян. Переключись на схему; изменения кампании сохраняются отдельно.'); latest.current.onUnavailable?.() }
    const canvas = renderer.domElement
    const captureDown=(event:PointerEvent)=>{pointerDown(event);dragDown(event)}
    canvas.addEventListener('pointerdown',captureDown,true);canvas.addEventListener('pointermove',dragMove,true);canvas.addEventListener('pointerup',dragUp,true);canvas.addEventListener('pointercancel',dragCancel);canvas.addEventListener('lostpointercapture',dragCancel);canvas.addEventListener('keydown',keyboard)
    window.addEventListener('blur',blur)
    canvas.addEventListener('pointerup', clickUp); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('webglcontextlost', lost)
    requestDraw()
    return () => {
      restoreFocus.current=document.activeElement===canvas
      cameraState.current = { id: f.id, position: camera.position.clone(), target: controls.target.clone() }
      reset.current = null;cameraAction.current=null;updateSelection.current=null;disposed = true;endDrag(false);cancelAnimationFrame(pending);observer.disconnect();controls.dispose()
      canvas.removeEventListener('pointerdown',captureDown,true);canvas.removeEventListener('pointermove',dragMove,true);canvas.removeEventListener('pointerup',dragUp,true);canvas.removeEventListener('pointercancel',dragCancel);canvas.removeEventListener('lostpointercapture',dragCancel);canvas.removeEventListener('keydown',keyboard)
      canvas.removeEventListener('pointerup', clickUp); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('webglcontextlost', lost)
      window.removeEventListener('blur',blur)
      assetLibrary.dispose();surfaceLibrary.dispose();environment?.dispose();resources.forEach(v => v.dispose()); sun.shadow.map?.dispose(); renderer.dispose(); canvas.remove(); labelElements.forEach(v => v.node.remove())
    }
    // Changing a callback alone must not rebuild GPU resources or reset the camera.
  }, [model, marker, route, quality, grid, labels])
  useEffect(()=>{updateSelection.current?.(selection??null)},[selection])
  return <div className="gb-scene-3d">
    <div className="gb-render-toolbar"><button className="w6-button" type="button" onClick={() => reset.current?.()}>Вся сцена</button>
      <button className="w6-button" type="button" onClick={()=>cameraAction.current?.('top')} title="1">Сверху</button>
      <button className="w6-button" type="button" onClick={()=>cameraAction.current?.('front')} title="2">Спереди</button>
      <button className="w6-button" type="button" onClick={()=>cameraAction.current?.('iso')} title="3">Перспектива</button>
      <button className="w6-button" type="button" disabled={!selection} onClick={()=>cameraAction.current?.('focus')} title="F">К выбранному</button>
      <button className="w6-button" type="button" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen?.().catch(()=>{});else void host.current?.requestFullscreen?.().catch(()=>{})}}>Во весь экран</button>
      <label><input type="checkbox" checked={grid} onChange={e => setGrid(e.currentTarget.checked)}/> Сетка</label>
      <label><input type="checkbox" checked={labels} onChange={e => setLabels(e.currentTarget.checked)}/> Подписи</label>
      <label>Качество <select aria-label="Качество 3D" value={quality} onChange={e => setQuality(e.currentTarget.value)}><option value="low">Экономное</option><option value="balanced">Сбалансированное</option><option value="high">Высокое</option></select></label>
      <span className="gb-model-status" role="status">{assetStatus}</span>
    </div>
    <div className="gb-3d-canvas" ref={host}/>
    {failure && <p role="alert" className="gb-scene-state">{failure}</p>}
    <p className="gb-map-caption">{props.onMove?'Зажми объект ЛКМ и тяни · Esc — отмена · Alt+ЛКМ или пустое место — вращение камеры':'ЛКМ — выбор · перетаскивание — поворот'} · ПКМ/СКМ — сдвиг · колесо — масштаб · F — к выбранному · 1/2/3 — виды. XYZ в метрах. {hover}</p>
  </div>
}
