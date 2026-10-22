import type { Scene, SceneActor, ScenePosition } from './sceneTypes'
import type { KnownArea, MapFrame, PerceivedMap } from './scenePerception'
import type { SceneAbilityVisual } from './sceneAbilityVisuals'
import { objectEntity } from './worldEntities'

// Render components are an adapter over existing version-1 saves. They do not
// migrate authoritative entities or infer information absent from a disclosure.
export type RenderSelection = { kind: 'object' | 'token' | 'contact'; id: string }
export type RenderEntity = {
  id: string
  transform: { position: ScenePosition }
  geometry: { kind: Scene['objects'][number]['kind'] | 'actor' | 'sound'; width: number; depth: number; height: number; open?: boolean }
  appearance: { color: string; remembered: boolean; heightKnown: boolean }
  identity: { label: string }
  interaction: RenderSelection
}
export type SceneRenderModel = {
  frame: MapFrame; title: string; restricted: boolean
  areas: KnownArea[]; entities: RenderEntity[]; visuals: SceneAbilityVisual[]
}
const colors = { wall: '#69748c', door: '#b38b63', tree: '#3d806c', rock: '#8b93a7',
  crate: '#a47a54', platform: '#667c91', lamp: '#87e5e2', water: '#2c7493' }
export function masterRenderModel(scene: Scene, actors: SceneActor[], visuals: SceneAbilityVisual[] = []): SceneRenderModel {
  return { frame: scene, title: scene.name, restricted: false,
    areas: [{ id: 'ground', x: 0, y: 0, z: scene.minZ, width: scene.width, depth: scene.depth,
      height: scene.maxZ - scene.minZ, visible: true }],
    entities: [...scene.objects.map(o => {
      const c = objectEntity(scene.id, o).components, p = c.position.data, g = c.geometry.data
      return { id: c.identity.data.id, transform: { position: { x: p.x, y: p.y, z: p.z } },
        geometry: { ...g, open: c.collision.data.open },
        appearance: { color: colors[g.kind], remembered: false, heightKnown: true }, identity: { label: c.identity.data.name },
        interaction: { kind: 'object' as const, id: c.identity.data.id } }
    }),
    ...scene.tokens.map(t => ({ id: t.actorId, transform: { position: { x: t.x, y: t.y, z: t.z } },
      geometry: { kind: 'actor' as const, width: t.diameter, depth: t.diameter, height: 1.7 },
      appearance: { color: ['#78baa5','#9d92c9','#bd9567','#7d9fb7'][[...t.actorId].reduce((n,c)=>n+c.charCodeAt(0),0)%4], remembered: false, heightKnown: true },
      identity: { label: actors.find(a => a.id === t.actorId)?.name || 'Без имени' },
      interaction: { kind: 'token' as const, id: t.actorId } }))], visuals }
}
export function perceivedRenderModel(map: PerceivedMap): SceneRenderModel {
  return { frame: { ...map.frame }, title: map.title, restricted: true,
    areas: map.areas.map(a => ({ ...a })),
    entities: [...map.objects.map(o => ({ id: o.id, transform: { position: { x: o.x, y: o.y, z: o.z } },
      geometry: { kind: o.kind, width: o.width, depth: o.depth, height: o.height, open: o.open },
      appearance: { color: colors[o.kind], remembered: !o.visible, heightKnown: true }, identity: { label: o.name },
      interaction: { kind: 'object' as const, id: o.id } })),
    ...map.contacts.map(c => ({ id: c.id, transform: { position: { x: c.x, y: c.y, z: c.z ?? map.frame.groundZ } },
      geometry: { kind: c.kind === 'sound' ? 'sound' as const : 'actor' as const,
        width: c.kind === 'sound' ? Math.max(.3, (c.radius ?? 1) * 2) : .8,
        depth: .8, height: c.z === undefined ? .12 : 1.7 },
      appearance: { color: c.kind === 'self' ? '#81e6da' : c.kind === 'identified' ? '#b8b0f5' : '#d3a7ee',
        remembered: false, heightKnown: c.z !== undefined },
      identity: { label: c.label + (c.z === undefined ? ' · высота не раскрыта' : '') },
      interaction: { kind: 'contact' as const, id: c.id } }))], visuals: map.visuals ?? [] }
}
export function snapScenePoint(point: ScenePosition, enabled: boolean, step: number, frame: Pick<Scene, 'width' | 'depth'>): ScenePosition {
  if (!enabled || !Number.isFinite(step) || step <= 0) return { ...point }
  const snap = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n / step) * step))
  return { x: snap(point.x, frame.width), y: snap(point.y, frame.depth), z: point.z }
}
export function entityAreas(entity: RenderEntity, model: SceneRenderModel): KnownArea[] {
  const p = entity.transform.position, g = entity.geometry
  return model.areas.filter(a => p.x + g.width / 2 >= a.x && p.x - g.width / 2 <= a.x + a.width &&
    p.y + g.depth / 2 >= a.y && p.y - g.depth / 2 <= a.y + a.depth)
}
