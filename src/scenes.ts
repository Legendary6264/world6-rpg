import {isCharacterModel,isCharacterAnimation} from './characterAppearance'
import { isArtwork } from './visualMedia'
import {validTabletopAppearance} from './tabletopCatalog'
import type { Scene, SceneObject, SceneState, SceneToken } from './sceneTypes'
import {sceneObjectLabels} from './sceneObjectDefaults'
import {validSceneEnvironment} from './sceneEnvironment'
import {copyPhysicsBody,copyPhysicsEnvironment,isPhysicsBody,isPhysicsEnvironment} from './physicsState'
import { copyWaterComposition, isWaterComposition, MAX_FLOW_CELLS, MIN_WATER_HEIGHT_M, supportsSceneTokens, WATER_EDGE_TOLERANCE_M } from './waterPhysics'
import { objectBounds, overlapLength } from './sceneGeometry'
export {sceneObject,sceneObjectLabels} from './sceneObjectDefaults'

// Storage/rendering limits, not game rules. Coordinates and dimensions are metres.
export const MAX_SCENES = 20
export const MAX_SCENE_OBJECTS = 250
export const MAX_SCENE_TOKENS = 200
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(v)
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6
const size = (v: unknown): v is number => finite(v) && v >= 0.1
const sameHeight = (a: number, b: number) => Math.abs(a - b) < 1e-6
const unique = (values: string[]) => new Set(values).size === values.length
function position(v: Record<string, unknown>, scene: Record<string, unknown>) {
  return finite(v.x) && finite(v.y) && finite(v.z) && v.x >= 0 && v.x <= Number(scene.width) &&
    v.y >= 0 && v.y <= Number(scene.depth) && v.z >= Number(scene.minZ) && v.z <= Number(scene.maxZ)
}
function validScene(v: unknown): v is Scene {
  if (!object(v) || !id(v.id) || !text(v.name, 120) || !v.name.trim() || !text(v.description, 4000) ||
      typeof v.view !== 'string' || !['top', 'side'].includes(v.view) ||
      typeof v.palette !== 'string' || !['forest', 'stone', 'neon'].includes(v.palette) ||
      (v.environment !== undefined && !validSceneEnvironment(v.environment)) ||
      (v.physics !== undefined && v.physics !== null && !isPhysicsEnvironment(v.physics)) ||
      !size(v.width) || !size(v.depth) || !finite(v.groundZ) || !finite(v.minZ) || !finite(v.maxZ) ||
      v.minZ > v.groundZ || v.groundZ >= v.maxZ ||
      (v.roundDurationSeconds!==undefined&&(typeof v.roundDurationSeconds!=='number'||!Number.isFinite(v.roundDurationSeconds)||v.roundDurationSeconds<=0||v.roundDurationSeconds>86400)) ||
      (v.background !== undefined && !isArtwork(v.background)) || (v.backgroundTileSizeM!==undefined&&(!finite(v.backgroundTileSizeM)||v.backgroundTileSizeM<.1||v.backgroundTileSizeM>1000)) ||
      !Array.isArray(v.objects) || v.objects.length > MAX_SCENE_OBJECTS ||
      !Array.isArray(v.tokens) || v.tokens.length > MAX_SCENE_TOKENS) return false
  if (!v.objects.every(o => object(o) && id(o.id) && text(o.name, 120) && !!o.name.trim() &&
      typeof o.kind === 'string' && Object.hasOwn(sceneObjectLabels, o.kind) && validTabletopAppearance(o) && position(o, v) && (o.artwork === undefined || isArtwork(o.artwork)) &&
      (o.physics === undefined || o.physics === null || isPhysicsBody(o.physics)) &&
      size(o.width) && size(o.depth) && finite(o.height) && o.height >= 0 && Number(o.z) + o.height <= Number(v.maxZ) &&
      (o.water === undefined || o.kind === 'water' && (o.water === null || isWaterComposition(o.water) &&
        (o.water.flow ? o.height > 0 || o.water.saltKg === 0 && o.water.sedimentKg === 0 : o.height >= MIN_WATER_HEIGHT_M))) &&
      o.width <= Number(v.width) && o.depth <= Number(v.depth) &&
      ['blocksMovement', 'blocksSight', 'canSupport', 'open'].every(k => typeof o[k] === 'boolean'))) return false
  const objects = v.objects as SceneObject[]
  if (!unique(objects.map(o => o.id))) return false
  const cells = objects.filter(o => o.water?.flow).map(objectBounds), tolerance = WATER_EDGE_TOLERANCE_M
  if (cells.length > MAX_FLOW_CELLS || cells.some(({ min, max }) =>
    min.x < -tolerance || min.y < -tolerance || max.x > Number(v.width) + tolerance || max.y > Number(v.depth) + tolerance)) return false
  for (const [i, a] of cells.entries()) {
    if (cells.slice(0, i).some(b => overlapLength(a.min.x, a.max.x, b.min.x, b.max.x) > tolerance &&
      overlapLength(a.min.y, a.max.y, b.min.y, b.max.y) > tolerance)) return false
  }
  return v.tokens.every(t => {
    if (!object(t) || !id(t.actorId) || !position(t, v) || !size(t.diameter) || t.diameter > 100 || !object(t.support) || t.characterModel!==undefined&&!isCharacterModel(t.characterModel) || t.facing!==undefined&&(!finite(t.facing)||t.facing<0||t.facing>=360) || t.characterAnimation!==undefined&&!isCharacterAnimation(t.characterAnimation)) return false
    if (t.support.kind === 'ground') return sameHeight(Number(t.z), Number(v.groundZ))
    if (t.support.kind === 'air') return true
    if (t.support.kind !== 'object' || !id(t.support.objectId)) return false
    const objectId = t.support.objectId
    const surface = objects.find(o => o.id === objectId && supportsSceneTokens(o))
    return !!surface && Math.abs(Number(t.x) - surface.x) <= surface.width / 2 &&
      Math.abs(Number(t.y) - surface.y) <= surface.depth / 2 && sameHeight(Number(t.z), surface.z + surface.height)
  })
}
export function isSceneState(v: unknown): v is SceneState {
  if (!object(v) || v.version !== 1 || !Array.isArray(v.scenes) || v.scenes.length > MAX_SCENES ||
      !v.scenes.every(validScene)) return false
  const scenes = v.scenes as Scene[]
  return unique(scenes.map(s => s.id)) &&
    (v.activeSceneId === null || id(v.activeSceneId) && scenes.some(s => s.id === v.activeSceneId)) &&
    unique(scenes.flatMap(s => s.tokens.map(t => t.actorId)))
}
export const emptyScenes = (): SceneState => ({ version: 1, activeSceneId: null, scenes: [] })
export function sceneReferencesValid(state: SceneState | undefined, actorIds: string[]): boolean {
  const ids = new Set(actorIds)
  return !state || state.scenes.every(s => s.tokens.every(t => ids.has(t.actorId)))
}
export function copySceneState(state: SceneState): SceneState {
  return { version: 1, activeSceneId: state.activeSceneId, scenes: state.scenes.map(s => ({
    id: s.id, name: s.name, description: s.description, view: s.view, width: s.width, depth: s.depth,
    groundZ: s.groundZ, minZ: s.minZ, maxZ: s.maxZ, palette: s.palette,
    ...(s.environment !== undefined ? {environment:s.environment} : {}),
    ...(s.physics !== undefined ? {physics:copyPhysicsEnvironment(s.physics)} : {}),
    ...(s.roundDurationSeconds!==undefined?{roundDurationSeconds:s.roundDurationSeconds}:{}),
    ...(s.background !== undefined ? { background: s.background } : {}), ...(s.backgroundTileSizeM!==undefined?{backgroundTileSizeM:s.backgroundTileSizeM}:{}),
    objects: s.objects.map(o => ({ id: o.id, name: o.name, kind: o.kind, x: o.x, y: o.y, z: o.z,
      width: o.width, depth: o.depth, height: o.height, blocksMovement: o.blocksMovement,
      blocksSight: o.blocksSight, canSupport: o.canSupport, open: o.open, ...(o.artwork !== undefined ? { artwork: o.artwork } : {}),
      ...(o.physics !== undefined ? {physics:copyPhysicsBody(o.physics)} : {}),
      ...(o.water !== undefined ? {water:copyWaterComposition(o.water)} : {}),
      ...(o.asset!==undefined?{asset:o.asset}:{}),...(o.facing!==undefined?{facing:o.facing}:{}),...(o.active!==undefined?{active:o.active}:{}),...(o.locked!==undefined?{locked:o.locked}:{}) })),
    tokens: s.tokens.map(t => ({ actorId: t.actorId, x: t.x, y: t.y, z: t.z, diameter: t.diameter,
      ...(t.characterModel!==undefined?{characterModel:t.characterModel}:{}),...(t.facing!==undefined?{facing:t.facing}:{}),...(t.characterAnimation!==undefined?{characterAnimation:t.characterAnimation}:{}),
      support: t.support.kind === 'object' ? { kind: 'object', objectId: t.support.objectId } : { kind: t.support.kind } })),
  })) }
}
function checked(state: SceneState): SceneState {
  if (!isSceneState(state)) throw new Error('Проверь размеры, высоты и опоры сцены. Координаты должны находиться в её пределах.')
  return state
}
export function createScene(state: SceneState, sceneId: string, name: string, view: Scene['view']): SceneState {
  if (state.scenes.length >= MAX_SCENES) throw new Error('Максимум 20 сцен в кампании.')
  // Editor defaults only; they do not set a canonical world size or gameplay formula.
  const scene: Scene = { id: sceneId, name: name.trim(), description: '', view, width: 30, depth: 20,
    groundZ: 0, minZ: -5, maxZ: 20, palette: 'forest', objects: [], tokens: [] }
  const next = copySceneState(state)
  next.scenes.push(scene); next.activeSceneId = sceneId
  return checked(next)
}
export function replaceScene(state: SceneState, scene: Scene): SceneState {
  if (!state.scenes.some(s => s.id === scene.id)) throw new Error('Сцена больше не существует.')
  return checked(copySceneState({ ...state, scenes: state.scenes.map(s => s.id === scene.id ? scene : s) }))
}
export function deleteScene(state: SceneState, sceneId: string): SceneState {
  const next = copySceneState(state)
  next.scenes = next.scenes.filter(s => s.id !== sceneId)
  if (next.activeSceneId === sceneId) next.activeSceneId = next.scenes[0]?.id ?? null
  return checked(next)
}
export function pruneSceneActors(state: SceneState, actorIds: string[]): SceneState {
  const next = copySceneState(state), ids = new Set(actorIds)
  next.scenes.forEach(s => { s.tokens = s.tokens.filter(t => ids.has(t.actorId)) })
  return next
}
export function addSceneObject(state: SceneState, sceneId: string, value: SceneObject): SceneState {
  const scene = state.scenes.find(s => s.id === sceneId)
  if (!scene) throw new Error('Выбери сцену.')
  if (scene.objects.length >= MAX_SCENE_OBJECTS) throw new Error('Максимум 250 объектов на сцене.')
  return replaceScene(state, { ...scene, objects: [...scene.objects, value] })
}
export function placeSceneToken(state: SceneState, sceneId: string, token: SceneToken): SceneState {
  if (!state.scenes.some(s => s.id === sceneId)) throw new Error('Выбери сцену.')
  // A character has one current position, including when the GM changes presentation.
  const next = copySceneState(state)
  for (const s of next.scenes) s.tokens = s.tokens.filter(t => t.actorId !== token.actorId)
  next.scenes.find(s => s.id === sceneId)!.tokens.push(token)
  return checked(next)
}
export function removeSceneObject(state: SceneState, sceneId: string, objectId: string): SceneState {
  const scene = state.scenes.find(s => s.id === sceneId)
  if (!scene) throw new Error('Выбери сцену.')
  if (scene.tokens.some(t => t.support.kind === 'object' && t.support.objectId === objectId)) {
    throw new Error('На объекте стоит персонаж. Сначала измени его опору; автоматическое падение не назначается.')
  }
  return replaceScene(state, { ...scene, objects: scene.objects.filter(o => o.id !== objectId) })
}
export function moveSceneObject(state: SceneState, sceneId: string, value: SceneObject): SceneState {
  const scene = state.scenes.find(s => s.id === sceneId), before = scene?.objects.find(o => o.id === value.id)
  if (!scene || !before) throw new Error('Объект больше не существует.')
  const tokens = scene.tokens.map(t => t.support.kind === 'object' && t.support.objectId === value.id ?
    { ...t, x: t.x + value.x - before.x, y: t.y + value.y - before.y, z: value.z + value.height } : t)
  return replaceScene(state, { ...scene, objects: scene.objects.map(o => o.id === value.id ? value : o), tokens })
}
