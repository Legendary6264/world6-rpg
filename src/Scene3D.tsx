import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ScenePosition } from './sceneTypes'
import type { KnownArea } from './scenePerception'
import { entityAreas } from './scene3dModel'
import type { RenderEntity, RenderSelection, SceneRenderModel } from './scene3dModel'

type Props = { model: SceneRenderModel; selection?: RenderSelection | null; selecting?: boolean;
  onPoint?: (point: ScenePosition) => void; onSelect?: (selection: RenderSelection) => void;
  marker?: ScenePosition | null; route?: ScenePosition[]; onUnavailable?: () => void }
const vector = (p: ScenePosition) => new THREE.Vector3(p.x, p.z, p.y)
const clipping = (a: KnownArea) => [new THREE.Plane(new THREE.Vector3(1, 0, 0), -a.x),
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), a.x + a.width),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -a.y), new THREE.Plane(new THREE.Vector3(0, 0, -1), a.y + a.depth),
  new THREE.Plane(new THREE.Vector3(0, 1, 0), -a.z), new THREE.Plane(new THREE.Vector3(0, -1, 0), a.z + a.height)]

export default function Scene3D(props: Props) {
  const { model, selection, marker, route } = props
  const host = useRef<HTMLDivElement>(null), latest = useRef(props), reset = useRef<(() => void) | null>(null)
  const [quality, setQuality] = useState('balanced'), [grid, setGrid] = useState(true), [labels, setLabels] = useState(true)
  const [failure, setFailure] = useState(''), [hover, setHover] = useState('')
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
    renderer.shadowMap.enabled = quality === 'high'
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor('#101725')
    renderer.domElement.setAttribute('aria-label', model.title + ' · трёхмерная сцена')
    renderer.domElement.setAttribute('role', 'img')
    renderer.domElement.tabIndex = 0
    element.appendChild(renderer.domElement)
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(46, 1, .05, Math.max(500, f.width * 8, f.depth * 8, (f.maxZ - f.minZ) * 8))
    const span = Math.max(f.width, f.depth, 5), center = new THREE.Vector3(f.width / 2, f.groundZ, f.depth / 2)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.maxPolarAngle = Math.PI / 2 - .02; controls.minDistance = .5; controls.maxDistance = span * 4
    controls.enableDamping = false
    const home = () => { controls.target.copy(center); camera.position.set(center.x + span * .65, center.y + span * .9, center.z + span * .85); controls.update() }
    const saved = cameraState.current
    if (saved?.id === f.id) { camera.position.copy(saved.position); controls.target.copy(saved.target); controls.update() } else home()
    reset.current = home
    scene.add(new THREE.HemisphereLight('#c2dcec', '#25202e', 2.2))
    const sun = new THREE.DirectionalLight('#ffe4bf', 2.5)
    sun.position.set(center.x - span * .5, f.groundZ + span, center.z + span * .3); sun.target.position.copy(center)
    sun.castShadow = !model.restricted && quality === 'high'; sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = sun.shadow.camera.bottom = -span; sun.shadow.camera.right = sun.shadow.camera.top = span
    sun.shadow.camera.far = span * 4; sun.shadow.normalBias = .05; scene.add(sun, sun.target)
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
    const keep = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture,>(v: T): T => { resources.add(v); return v }
    const material = (color: string, opacity = 1, planes: THREE.Plane[] = []) => keep(new THREE.MeshStandardMaterial({ color,
      roughness: .85, metalness: .08, transparent: opacity < 1, opacity, clippingPlanes: planes, side: THREE.DoubleSide }))
    const floorColor = f.palette === 'forest' ? '#304f42' : f.palette === 'stone' ? '#454c5b' : '#2e3e55'
    const pickables: THREE.Object3D[] = [], groundMeshes: THREE.Mesh[] = [], labelElements: { node: HTMLSpanElement; position: THREE.Vector3 }[] = []
    function floor(a: KnownArea) {
      if (f.groundZ < a.z || f.groundZ > a.z + a.height) return
      const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(a.width, a.depth)), material(a.visible ? floorColor : '#292e3d'))
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(a.x + a.width / 2, f.groundZ, a.y + a.depth / 2)
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
      const group = new THREE.Group(), g = e.geometry, p = e.transform.position
      group.position.copy(vector(p)); group.userData.selection = { ...e.interaction }; group.userData.label = e.identity.label
      const opacity = e.appearance.remembered ? .4 : 1, main = material(e.appearance.color, opacity, planes)
      function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
        const result = new THREE.Mesh(keep(geometry), mat); result.position.set(x, y, z)
        result.castShadow = !model.restricted; result.receiveShadow = true; group.add(result); return result
      }
      const h = Math.max(g.height, .035)
      if (g.kind === 'actor') {
        const r = Math.max(.12, g.width / 2)
        mesh(new THREE.CylinderGeometry(r, r, .08, 16), main, 0, .04, 0)
        if (e.appearance.heightKnown) {
          mesh(new THREE.CapsuleGeometry(r * .45, Math.max(.1, h - r * 1.8), 3, 8), main, 0, h * .5, 0)
          mesh(new THREE.SphereGeometry(r * .45, 10, 8), main, 0, h * .95, 0)
        }
      } else if (g.kind === 'sound') {
        const ring = mesh(new THREE.TorusGeometry(g.width / 2, .035, 4, 32), main, 0, .08, 0); ring.rotation.x = Math.PI / 2
      } else if (g.kind === 'tree') {
        mesh(new THREE.CylinderGeometry(g.width * .09, g.width * .14, h * .55, 7), material('#735641', opacity, planes), 0, h * .275, 0)
        const canopy = mesh(new THREE.IcosahedronGeometry(1, 1), main, 0, h * .68, 0); canopy.scale.set(g.width / 2, h * .32, g.depth / 2)
      } else if (g.kind === 'rock') {
        const rock = mesh(new THREE.DodecahedronGeometry(1, 0), main, 0, h / 2, 0); rock.scale.set(g.width / 2, h / 2, g.depth / 2)
      } else if (g.kind === 'lamp') {
        mesh(new THREE.CylinderGeometry(.055, .09, h * .85, 6), material('#737a90', opacity, planes), 0, h * .425, 0)
        mesh(new THREE.BoxGeometry(g.width * .3, h * .15, g.depth * .3), keep(new THREE.MeshStandardMaterial({ color: '#b5fff2', emissive: '#53aab3', emissiveIntensity: 1.5, clippingPlanes: planes })), 0, h * .9, 0)
      } else {
        if (g.kind === 'door' && g.open) {
          mesh(new THREE.BoxGeometry(Math.min(.15, g.width), h, g.depth), main, -g.width / 2 + Math.min(.15, g.width) / 2, h / 2, 0)
        } else mesh(new THREE.BoxGeometry(g.width, h, g.depth), main, 0, h / 2, 0)
        if (g.kind === 'crate') {
          const edges = new THREE.LineSegments(keep(new THREE.EdgesGeometry(keep(new THREE.BoxGeometry(g.width * 1.005, h * 1.005, g.depth * 1.005)))), keep(new THREE.LineBasicMaterial({ color: '#d9bc8b', clippingPlanes: planes })))
          edges.position.y = h / 2; group.add(edges)
        }
      }
      if (!model.restricted && selection?.id === e.interaction.id && selection.kind === e.interaction.kind) {
        group.updateMatrixWorld(true)
        const outline = new THREE.BoxHelper(group, '#89fff0'); keep(outline.geometry); keep(outline.material); scene.add(outline)
      }
      scene.add(group); pickables.push(group)
    }
    for (const entity of structuredClone(model.entities)) {
      if (model.restricted && entity.interaction.kind === 'object') {
        for (const area of entityAreas(entity, model)) entityMesh(entity, clipping(area))
      } else entityMesh(entity, [])
      if (labels) {
        const node = document.createElement('span'); node.className = 'gb-3d-label'; node.textContent = entity.identity.label
        element.appendChild(node); labelElements.push({ node, position: vector({ ...entity.transform.position, z: entity.transform.position.z + entity.geometry.height + .45 }) })
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
    const draw = () => {
      pending = 0; if (disposed) return
      renderer.render(scene, camera)
      const box = element.getBoundingClientRect()
      for (const label of labelElements) {
        const p = label.position.clone().project(camera), visible = p.z > -1 && p.z < 1 && Math.abs(p.x) < .98 && Math.abs(p.y) < .98
        label.node.hidden = !visible; label.node.style.transform = `translate(-50%, -100%) translate(${(p.x + 1) * box.width / 2}px,${(1 - p.y) * box.height / 2}px)`
      }
    }
    const requestDraw = () => { if (!pending && !disposed) pending = requestAnimationFrame(draw) }
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
      if (down.button !== 0 || event.button !== 0 || Math.hypot(down.x - event.clientX, down.y - event.clientY) > 5) return
      hits(event)
      // Raycaster does not apply material clipping: only pick intersections inside disclosure bounds.
      const hit = raycaster.intersectObjects(pickables, true).find(h => !model.restricted || model.areas.some(a => h.point.x >= a.x && h.point.x <= a.x + a.width && h.point.z >= a.y && h.point.z <= a.y + a.depth && h.point.y >= a.z && h.point.y <= a.z + a.height))
      const entity = hit && identify(hit.object), current = latest.current
      if (entity && current.selecting !== false && current.onSelect) { current.onSelect(entity.selection); return }
      const ground = raycaster.intersectObjects(groundMeshes)[0]
      if (ground) current.onPoint?.({ x: Math.round(ground.point.x * 1000) / 1000, y: Math.round(ground.point.z * 1000) / 1000, z: f.groundZ })
    }
    const pointerMove = (event: PointerEvent) => { hits(event); const hit = raycaster.intersectObjects(pickables, true)[0]; setHover(hit ? identify(hit.object)?.label ?? '' : '') }
    const lost = (event: Event) => { event.preventDefault(); setFailure('3D-контекст потерян. Переключись на схему; изменения кампании сохраняются отдельно.'); latest.current.onUnavailable?.() }
    const canvas = renderer.domElement
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('webglcontextlost', lost)
    requestDraw()
    return () => {
      cameraState.current = { id: f.id, position: camera.position.clone(), target: controls.target.clone() }
      reset.current = null; disposed = true; cancelAnimationFrame(pending); observer.disconnect(); controls.dispose()
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('webglcontextlost', lost)
      resources.forEach(v => v.dispose()); sun.shadow.map?.dispose(); renderer.dispose(); canvas.remove(); labelElements.forEach(v => v.node.remove())
    }
    // Changing a callback alone must not rebuild GPU resources or reset the camera.
  }, [model, selection, marker, route, quality, grid, labels])
  return <div className="gb-scene-3d">
    <div className="gb-render-toolbar"><button className="w6-button" type="button" onClick={() => reset.current?.()}>Вся сцена</button>
      <label><input type="checkbox" checked={grid} onChange={e => setGrid(e.currentTarget.checked)}/> Сетка</label>
      <label><input type="checkbox" checked={labels} onChange={e => setLabels(e.currentTarget.checked)}/> Подписи</label>
      <label>Качество <select aria-label="Качество 3D" value={quality} onChange={e => setQuality(e.currentTarget.value)}><option value="low">Экономное</option><option value="balanced">Сбалансированное</option><option value="high">Высокое</option></select></label>
    </div>
    <div className="gb-3d-canvas" ref={host}/>
    {failure && <p role="alert" className="gb-scene-state">{failure}</p>}
    <p className="gb-map-caption">ЛКМ — выбор или точка · перетаскивание — поворот · ПКМ — сдвиг · колесо — масштаб. XYZ в метрах. {hover}</p>
  </div>
}
