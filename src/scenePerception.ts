import type { Scene, SceneObject, ScenePosition, SceneState } from './sceneTypes'
import { isArtwork } from './visualMedia'

// Limits protect saved data; they do not define perception distances or game rules.
export type KnownArea = ScenePosition & { id: string; width: number; depth: number; height: number; visible: boolean }
export type MapFrame = Pick<Scene, 'id' | 'width' | 'depth' | 'groundZ' | 'minZ' | 'maxZ' | 'view' | 'palette'>
export type ObservedObject = Pick<SceneObject, 'id' | 'name' | 'kind' | 'x' | 'y' | 'z' | 'width' | 'depth' | 'height' | 'open'>
export type ObjectDisclosure = { objectId: string; visible: boolean; snapshot: ObservedObject }
export type ContactDisclosure = { id: string; actorId: string; kind: 'identified' | 'silhouette' | 'sound'; label: string; signs: string; showHeight: boolean; point: ScenePosition; radius: number }
export type KnownScene = { sceneId: string; title: string; description: string; frame: MapFrame; areas: KnownArea[]; objects: ObjectDisclosure[]; contacts: ContactDisclosure[] }
export type HeroPerception = { actorId: string; activeSceneId: string | null; scenes: KnownScene[] }
export type ScenePerceptions = { version: 1; heroes: HeroPerception[] }
export type PerceptionDraft = { activeSceneId: string | null; scenes: (Omit<KnownScene, 'frame' | 'objects' | 'contacts'> & {
  objects: Pick<ObjectDisclosure, 'objectId' | 'visible'>[]; contacts: Omit<ContactDisclosure, 'id'>[] })[] }
export type VisibleContact = { id: string; kind: ContactDisclosure['kind'] | 'self'; label: string; signs: string; x: number; y: number; z?: number; flying?: boolean; support?: 'ground' | 'air' | 'object'; portrait?: string; radius?: number }
export type PerceivedMap = { title: string; description: string; frame: MapFrame; areas: KnownArea[]; objects: (ObservedObject & { visible: boolean })[]; contacts: VisibleContact[] }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(v)
const text = (v: unknown, n: number): v is string => typeof v === 'string' && v.length <= n
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6
const unique = (ids: string[]) => new Set(ids).size === ids.length
const kinds = ['wall', 'door', 'tree', 'rock', 'crate', 'platform', 'lamp', 'water']
const position = (v: unknown): v is ScenePosition & Record<string, unknown> => record(v) && number(v.x) && number(v.y) && number(v.z)
const frame = (v: unknown): v is MapFrame => record(v) && id(v.id) && number(v.width) && v.width > 0 && number(v.depth) && v.depth > 0 &&
  number(v.minZ) && number(v.maxZ) && number(v.groundZ) && v.minZ <= v.groundZ && v.groundZ < v.maxZ && typeof v.view === 'string' && ['top', 'side'].includes(v.view) && typeof v.palette === 'string' && ['forest', 'stone', 'neon'].includes(v.palette)
const area = (v: unknown): v is KnownArea => record(v) && position(v) && id(v.id) && number(v.width) && v.width > 0 && number(v.depth) && v.depth > 0 && number(v.height) && v.height > 0 && typeof v.visible === 'boolean'
const observedObject = (v: unknown): v is ObservedObject => record(v) && position(v) && id(v.id) && text(v.name, 120) && typeof v.kind === 'string' && kinds.includes(v.kind) &&
  number(v.width) && v.width > 0 && number(v.depth) && v.depth > 0 && number(v.height) && v.height >= 0 && typeof v.open === 'boolean'
const contact = (v: unknown): v is Omit<ContactDisclosure, 'id'> => record(v) && id(v.actorId) && typeof v.kind === 'string' && ['identified', 'silhouette', 'sound'].includes(v.kind) &&
  text(v.label, 120) && text(v.signs, 1000) && typeof v.showHeight === 'boolean' && position(v.point) && number(v.radius) && v.radius >= 0 && v.radius <= 1000
const sceneInput = (v: unknown): boolean => record(v) && id(v.sceneId) && text(v.title, 120) && text(v.description, 4000) &&
  Array.isArray(v.areas) && v.areas.length <= 40 && v.areas.every(area) && unique(v.areas.map(a => a.id)) &&
  Array.isArray(v.objects) && v.objects.length <= 250 && v.objects.every(o => record(o) && id(o.objectId) && typeof o.visible === 'boolean') && unique(v.objects.map(o => (o as ObjectDisclosure).objectId)) &&
  Array.isArray(v.contacts) && v.contacts.length <= 200 && v.contacts.every(contact) && unique(v.contacts.map(c => (c as ContactDisclosure).actorId))
export function isPerceptionDraft(v: unknown): v is PerceptionDraft {
  return record(v) && Array.isArray(v.scenes) && v.scenes.length <= 20 && v.scenes.every(sceneInput) && unique(v.scenes.map(s => s.sceneId)) &&
    (v.activeSceneId === null || id(v.activeSceneId) && v.scenes.some(s => s.sceneId === v.activeSceneId))
}
export function isScenePerceptions(v: unknown): v is ScenePerceptions {
  return record(v) && v.version === 1 && Array.isArray(v.heroes) && v.heroes.length <= 200 && unique(v.heroes.map(h => h?.actorId)) && v.heroes.every(h => {
    if (!record(h) || !id(h.actorId) || !isPerceptionDraft(h)) return false
    return h.scenes.every(value => {
      const s = value as unknown as KnownScene
      return !!s.title.trim() && frame(s.frame) && s.frame.id === s.sceneId && s.areas.every(a => areaInside(a, s.frame)) &&
        s.objects.every(o => observedObject(o.snapshot) && o.snapshot.id === o.objectId) && s.contacts.every(c => id(c.id)) && unique(s.contacts.map(c => c.id))
    })
  })
}
export const emptyPerception = (actorId: string): HeroPerception => ({ actorId, activeSceneId: null, scenes: [] })
export function perceptionDraft(value: HeroPerception): PerceptionDraft {
  return { activeSceneId: value.activeSceneId, scenes: value.scenes.map(s => ({ sceneId: s.sceneId, title: s.title, description: s.description,
    areas: s.areas.map(copyArea), objects: s.objects.map(o => ({ objectId: o.objectId, visible: o.visible })),
    contacts: s.contacts.map(c => ({ actorId: c.actorId, kind: c.kind, label: c.label, signs: c.signs, showHeight: c.showHeight, point: { ...c.point }, radius: c.radius })) })) }
}
const copyArea = (a: KnownArea): KnownArea => ({ id: a.id, x: a.x, y: a.y, z: a.z, width: a.width, depth: a.depth, height: a.height, visible: a.visible })
export const mapFrame = (s: MapFrame): MapFrame => ({ id: s.id, width: s.width, depth: s.depth, groundZ: s.groundZ, minZ: s.minZ, maxZ: s.maxZ, view: s.view, palette: s.palette })
export const publicObject = (o: SceneObject | ObservedObject): ObservedObject => ({ id: o.id, name: o.name, kind: o.kind, x: o.x, y: o.y, z: o.z, width: o.width, depth: o.depth, height: o.height, open: o.open })
function areaInside(a: KnownArea, f: MapFrame) { return a.x >= 0 && a.y >= 0 && a.z >= f.minZ && a.x + a.width <= f.width && a.y + a.depth <= f.depth && a.z + a.height <= f.maxZ }
export function withinArea(p: ScenePosition, a: KnownArea) { return p.x >= a.x && p.x <= a.x + a.width && p.y >= a.y && p.y <= a.y + a.depth && p.z >= a.z && p.z <= a.z + a.height }
export function preparePerception(draft: PerceptionDraft, previous: HeroPerception, scenes: SceneState, actorIds: string[]): HeroPerception {
  if (!isPerceptionDraft(draft)) throw Error('Проверь области, объекты и контакты раскрытия.')
  const next: HeroPerception = { actorId: previous.actorId, activeSceneId: draft.activeSceneId, scenes: draft.scenes.map(s => {
    const current = scenes.scenes.find(c => c.id === s.sceneId), old = previous.scenes.find(c => c.sceneId === s.sceneId)
    if (!s.title.trim()) throw Error('Укажи название сцены для героя.')
    if (!current || !s.areas.every(a => areaInside(a, current))) throw Error('Области должны находиться в существующей сцене.')
    const objects = s.objects.map(o => {
      const live = current.objects.find(c => c.id === o.objectId), before = old?.objects.find(c => c.objectId === o.objectId)
      if (o.visible && !live || !live && !before) throw Error('Объект больше не существует. Обнови раскрытие.')
      const snapshot = !o.visible && before && !before.visible ? before.snapshot : live ?? before!.snapshot
      return { objectId: o.objectId, visible: o.visible, snapshot: publicObject(snapshot) }
    })
    const contacts = s.contacts.map(c => {
      if (!actorIds.includes(c.actorId) || (c.point.x < 0 || c.point.x > current.width || c.point.y < 0 || c.point.y > current.depth || c.point.z < current.minZ || c.point.z > current.maxZ)) throw Error('Проверь источник контакта и точку внутри сцены.')
      const before = old?.contacts.find(x => x.actorId === c.actorId)
      return { id: before?.id ?? crypto.randomUUID(), actorId: c.actorId, kind: c.kind, label: c.label.trim(), signs: c.signs.trim(), showHeight: c.showHeight,
        point: { x: c.point.x, y: c.point.y, z: c.point.z }, radius: c.radius }
    })
    return { sceneId: s.sceneId, title: s.title.trim(), description: s.description.trim(), frame: mapFrame(current), areas: s.areas.map(copyArea), objects, contacts }
  }) }
  if (!isScenePerceptions({ version: 1, heroes: [next] })) throw Error('Не удалось проверить раскрытие сцены.')
  return next
}
export function copyPerceptions(value: ScenePerceptions): ScenePerceptions {
  return { version: 1, heroes: value.heroes.map(h => ({ actorId: h.actorId, activeSceneId: h.activeSceneId, scenes: h.scenes.map(s => ({
    sceneId: s.sceneId, title: s.title, description: s.description, frame: mapFrame(s.frame), areas: s.areas.map(copyArea),
    objects: s.objects.map(o => ({ objectId: o.objectId, visible: o.visible, snapshot: publicObject(o.snapshot) })),
    contacts: s.contacts.map(c => ({ id: c.id, actorId: c.actorId, kind: c.kind, label: c.label, signs: c.signs, showHeight: c.showHeight, point: { x: c.point.x, y: c.point.y, z: c.point.z }, radius: c.radius })),
  })) })) }
}
export function perceptionReferencesValid(value: ScenePerceptions | undefined, scenes: SceneState | undefined, actorIds: string[]) {
  return !value || value.heroes.every(h => actorIds.includes(h.actorId) && h.scenes.every(s => !!scenes?.scenes.some(x => x.id === s.sceneId) && s.contacts.every(c => actorIds.includes(c.actorId))))
}
export function prunePerceptions(value: ScenePerceptions, scenes: SceneState | undefined, actorIds: string[]): ScenePerceptions {
  const next = copyPerceptions(value)
  next.heroes = next.heroes.filter(h => actorIds.includes(h.actorId)).map(h => {
    const kept = h.scenes.filter(s => scenes?.scenes.some(c => c.id === s.sceneId)).map(s => ({ ...s, contacts: s.contacts.filter(c => actorIds.includes(c.actorId)) }))
    return { ...h, scenes: kept, activeSceneId: kept.some(s => s.sceneId === h.activeSceneId) ? h.activeSceneId : null }
  }); return next
}
export function perceivedMap(value: HeroPerception, scenes: SceneState | undefined, actors: { id: string; name: string; profile: { portrait?: string } }[]): PerceivedMap | null {
  const knowledge = value.scenes.find(s => s.sceneId === value.activeSceneId), live = scenes?.scenes.find(s => s.id === value.activeSceneId)
  if (!knowledge || !live) return null
  const inArea = (p: ScenePosition, visible: boolean) => knowledge.areas.some(a => (!visible || a.visible) && withinArea(p, a))
  const objects = knowledge.objects.flatMap(o => {
    const current = o.visible ? live.objects.find(c => c.id === o.objectId) : o.snapshot
    return current && inArea(current, o.visible) ? [{ ...publicObject(current), visible: o.visible }] : []
  })
  const contacts: VisibleContact[] = knowledge.contacts.flatMap(c => {
    const token = live.tokens.find(t => t.actorId === c.actorId), actor = actors.find(a => a.id === c.actorId)
    const point = c.kind === 'sound' ? c.point : token
    if (!point || !inArea(point, true) || c.actorId === value.actorId) return []
    const identity = c.kind === 'identified' && actor
    return [{ id: c.id, kind: c.kind, label: c.label || (identity ? actor.name : c.kind === 'sound' ? 'Источник звука' : 'Неизвестный силуэт'), signs: c.signs, x: point.x, y: point.y,
      ...(c.showHeight ? { z: point.z, ...(token && c.kind !== 'sound' ? { flying: token.support.kind === 'air' } : {}) } : {}),
      ...(identity && actor.profile.portrait && isArtwork(actor.profile.portrait) ? { portrait: actor.profile.portrait } : {}), ...(c.kind === 'sound' ? { radius: c.radius } : {}) }]
  })
  const self = live.tokens.find(t => t.actorId === value.actorId), actor = actors.find(a => a.id === value.actorId)
  if (self && actor) contacts.push({ id: 'self', kind: 'self', label: actor.name, signs: '', x: self.x, y: self.y, z: self.z, flying: self.support.kind === 'air', support: self.support.kind, ...(actor.profile.portrait ? { portrait: actor.profile.portrait } : {}) })
  return { title: knowledge.title, description: knowledge.description, frame: mapFrame(knowledge.frame), areas: knowledge.areas.map(copyArea), objects, contacts }
}
