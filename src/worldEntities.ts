import type { Actor, World } from './rpgEngine'
import type { Scene, SceneObject, SceneToken } from './sceneTypes'
import { isCampaign } from './rpgSchema'
import { isCharacterDraft } from './characterModel'
import { isSceneState, sceneReferencesValid } from './scenes'

export type Component<T> = { version: 1; data: T }
type ActorComponents = {
  identity: Component<Pick<Actor, 'id' | 'name' | 'profile'>>
  attributes: Component<Actor['attributes']>
  resources: Component<Actor['resources']>
  progression: Component<Pick<Actor, 'statistics' | 'creation'>>
  knowledge: Component<Pick<Actor, 'journal' | 'knownEffects'>>
  anatomy: Component<Actor['body']>
  rules: Component<Actor['rpg']>
  position?: Component<{ sceneId: string; token: SceneToken }>
  extensions?: Component<Record<string, unknown>>
}
type SceneComponents = { scene: Component<Omit<Scene, 'objects' | 'tokens'>>;
  objectOrder: Component<string[]>; tokenOrder: Component<string[]> }
type ObjectComponents = {
  identity: Component<Pick<SceneObject, 'id' | 'name'>>
  position: Component<Pick<SceneObject, 'x' | 'y' | 'z'> & { sceneId: string }>
  geometry: Component<Pick<SceneObject, 'kind' | 'width' | 'depth' | 'height' | 'asset' | 'facing' | 'active' | 'locked'>>
  collision: Component<Pick<SceneObject, 'blocksMovement' | 'blocksSight' | 'canSupport' | 'open'>>
  appearance: Component<Pick<SceneObject, 'artwork'>>
  extensions?: Component<Record<string, unknown>>
}
export type GameEntity = { id: string; kind: 'actor'; components: ActorComponents } |
  { id: string; kind: 'scene'; components: SceneComponents } |
  { id: string; kind: 'object'; components: ObjectComponents }
export type EntitySnapshot = {
  version: 1; revision: number; campaign: Component<Omit<World['campaign'], 'scenes'>>
  actorOrder: string[]; sceneState: Component<{ version: 1; activeSceneId: string | null; sceneOrder: string[] }> | null
  entities: GameEntity[]
}
export type EntityChange = { entityId: string; kind: GameEntity['kind']; operation: 'created' | 'removed' | 'changed'; components: string[] }
export type EntityDelta = { version: 1; fromRevision: number; revision: number; campaignChanged: boolean; changes: EntityChange[] }
const component = <T,>(data: T): Component<T> => ({ version: 1, data: structuredClone(data) })
const actorFields = ['id', 'name', 'profile', 'attributes', 'resources', 'statistics', 'creation', 'journal', 'knownEffects', 'body', 'rpg']
const objectFields = ['id', 'name', 'kind', 'x', 'y', 'z', 'width', 'depth', 'height', 'blocksMovement', 'blocksSight', 'canSupport', 'open', 'artwork', 'asset', 'facing', 'active', 'locked']
function extra(value: object, known: string[]): { extensions?: Component<Record<string, unknown>> } {
  const entries = Object.entries(value).filter(([k]) => !known.includes(k))
  return entries.length ? { extensions: component(Object.fromEntries(entries)) } : {}
}
function extensions(value: Component<Record<string, unknown>> | undefined, known: string[]): Record<string, unknown> {
  if (!value) return {}
  const data = read(value)
  if (!record(data) || Object.keys(data).some(k => known.includes(k))) throw Error('Дополнительные данные подменяют типизированный компонент.')
  return data
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const unique = (values: unknown): values is string[] => Array.isArray(values) && values.every(v => typeof v === 'string') && new Set(values).size === values.length
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]))
  if (!record(a) || !record(b)) return false
  const names = Object.keys(a)
  return names.length === Object.keys(b).length && names.every(k => Object.hasOwn(b, k) && same(a[k], b[k]))
}
export const entityId = (kind: GameEntity['kind'], sourceId: string, sceneId?: string) => JSON.stringify(sceneId === undefined ? [kind, sourceId] : [kind, sceneId, sourceId])
function checkedVersion(value: unknown): void {
  if (!record(value) || value.version !== 1) throw Error('Неизвестная версия сущности или компонента. Требуется поддерживаемая миграция.')
}
function read<T>(value: Component<T>): T { checkedVersion(value); keys(value, ['version', 'data']); return structuredClone(value.data) }
function keys(value: object, expected: string[], optional: string[] = []): void {
  const actual = Object.keys(value)
  if (expected.some(k => !actual.includes(k)) || actual.some(k => !expected.includes(k) && !optional.includes(k))) throw Error('Неизвестный или отсутствующий компонент сущности.')
}
export function objectEntity(sceneId: string, o: SceneObject): Extract<GameEntity, {kind: 'object'}> {
  return { id: entityId('object', o.id, sceneId), kind: 'object', components: {
    identity: component({ id: o.id, name: o.name }), position: component({ sceneId, x: o.x, y: o.y, z: o.z }),
    geometry: component({ kind: o.kind, width: o.width, depth: o.depth, height: o.height, ...(o.asset!==undefined?{asset:o.asset}:{}),...(o.facing!==undefined?{facing:o.facing}:{}),...(o.active!==undefined?{active:o.active}:{}),...(o.locked!==undefined?{locked:o.locked}:{}) }),
    collision: component({ blocksMovement: o.blocksMovement, blocksSight: o.blocksSight, canSupport: o.canSupport, open: o.open }),
    appearance: component(o.artwork === undefined ? {} : { artwork: o.artwork }),
    ...extra(o, objectFields),
  } }
}

// Compatibility adapter: it reads current saves without altering stored bytes,
// changing game time, granting control or exposing a snapshot to a player.
export function projectWorldEntities(world: World, revision: number): EntitySnapshot {
  if (!Number.isSafeInteger(revision) || revision < 0) throw Error('Некорректная версия мира.')
  if (!unique(world.characters.map(a => a.id)) || world.campaign.scenes && (!isSceneState(world.campaign.scenes) || !sceneReferencesValid(world.campaign.scenes, world.characters.map(a => a.id)))) throw Error('Некорректные связи исходного мира.')
  const entities: GameEntity[] = [], { scenes, ...campaign } = world.campaign
  for (const source of world.characters) {
    const actor = source
    const position = scenes?.scenes.flatMap(s => s.tokens.map(token => ({ sceneId: s.id, token }))).find(p => p.token.actorId === actor.id)
    entities.push({ id: entityId('actor', actor.id), kind: 'actor', components: {
      identity: component({ id: actor.id, name: actor.name, profile: actor.profile }), attributes: component(actor.attributes),
      resources: component(actor.resources), progression: component({ statistics: actor.statistics, creation: actor.creation }),
      knowledge: component({ journal: actor.journal, knownEffects: actor.knownEffects }), anatomy: component(actor.body),
      rules: component(actor.rpg), ...(position ? { position: component(position) } : {}), ...extra(actor, actorFields),
    } })
  }
  for (const scene of scenes?.scenes ?? []) {
    const { objects, tokens, ...settings } = scene
    entities.push({ id: entityId('scene', scene.id), kind: 'scene', components: { scene: component(settings),
      objectOrder: component(objects.map(o => o.id)), tokenOrder: component(tokens.map(t => t.actorId)) } })
    entities.push(...objects.map(o => objectEntity(scene.id, o)))
  }
  return { version: 1, revision, campaign: component(campaign), actorOrder: world.characters.map(a => a.id),
    sceneState: scenes ? component({ version: 1, activeSceneId: scenes.activeSceneId, sceneOrder: scenes.scenes.map(s => s.id) }) : null, entities }
}

// Reject unknown versions/fields and unresolved references rather than dropping
// data. Snapshot import is a server-internal operation, not a new write API.
export function restoreWorldEntities(snapshot: EntitySnapshot): World {
  checkedVersion(snapshot)
  keys(snapshot, ['version', 'revision', 'campaign', 'actorOrder', 'sceneState', 'entities'])
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || !unique(snapshot.actorOrder) || snapshot.actorOrder.length > 200 ||
    !Array.isArray(snapshot.entities) || snapshot.entities.length > 5220 || !unique(snapshot.entities.map(e => e?.id))) throw Error('Некорректный состав сущностей.')
  const byId = new Map(snapshot.entities.map(e => [e.id, e])), used = new Set<string>()
  function take<K extends GameEntity['kind']>(id: string, kind: K): Extract<GameEntity, {kind: K}> {
    const entity = byId.get(id)
    if (!entity || entity.kind !== kind || used.has(id)) throw Error('Нарушены связи или порядок сущностей.')
    keys(entity, ['id', 'kind', 'components']); used.add(id)
    if (!record(entity.components)) throw Error('Не заданы компоненты сущности.')
    for (const c of Object.values(entity.components)) { checkedVersion(c); keys(c, ['version', 'data']) }
    return entity as Extract<GameEntity, {kind: K}>
  }
  const campaign = read(snapshot.campaign)
  if (!record(campaign) || 'scenes' in campaign) throw Error('Сцены должны храниться отдельными сущностями.')
  const positions = new Map<string, { sceneId: string; token: SceneToken }>()
  const characters: Actor[] = snapshot.actorOrder.map(id => {
    const { components: c } = take(entityId('actor', id), 'actor')
    keys(c, ['identity', 'attributes', 'resources', 'progression', 'knowledge', 'anatomy', 'rules'], ['position', 'extensions'])
    const identity = read(c.identity), actor = { ...extensions(c.extensions, actorFields), ...identity, attributes: read(c.attributes), resources: read(c.resources),
      ...read(c.progression), ...read(c.knowledge), body: read(c.anatomy), rpg: read(c.rules) }
    if (actor.id !== id || !isCharacterDraft(actor)) throw Error('Некорректная сущность персонажа.')
    if (c.position) { const p = read(c.position); if (p.token.actorId !== id) throw Error('Позиция относится к другому персонажу.'); positions.set(id, p) }
    return actor
  })
  const world: World = { characters, campaign }
  if (snapshot.sceneState) {
    const state = read(snapshot.sceneState)
    if (state.version !== 1 || !unique(state.sceneOrder) || state.sceneOrder.length > 20) throw Error('Некорректный порядок сцен.')
    world.campaign.scenes = { version: 1, activeSceneId: state.activeSceneId, scenes: state.sceneOrder.map(sceneId => {
      const { components: c } = take(entityId('scene', sceneId), 'scene'); keys(c, ['scene', 'objectOrder', 'tokenOrder'])
      const settings = read(c.scene), objects = read(c.objectOrder), tokens = read(c.tokenOrder)
      if (settings.id !== sceneId || !unique(objects) || !unique(tokens) || 'objects' in settings || 'tokens' in settings) throw Error('Некорректная сущность сцены.')
      return { ...settings, objects: objects.map(id => {
        const { components: o } = take(entityId('object', id, sceneId), 'object'); keys(o, ['identity', 'position', 'geometry', 'collision', 'appearance'], ['extensions'])
        const identity = read(o.identity), { sceneId: location, ...at } = read(o.position)
        if (identity.id !== id || location !== sceneId) throw Error('Объект относится к другой сцене.')
        return { ...extensions(o.extensions, objectFields), ...identity, ...at, ...read(o.geometry), ...read(o.collision), ...read(o.appearance) }
      }), tokens: tokens.map(id => {
        const p = positions.get(id); if (!p || p.sceneId !== sceneId) throw Error('Нарушена связь позиции персонажа со сценой.')
        positions.delete(id); return p.token
      }) }
    }) }
    if (!isSceneState(world.campaign.scenes) || !sceneReferencesValid(world.campaign.scenes, characters.map(a => a.id))) throw Error('Некорректная геометрия или связи сцены.')
  }
  if (positions.size || used.size !== byId.size || !isCampaign(world.campaign)) throw Error('В снимке есть несвязанные сущности или некорректные правила кампании.')
  return world
}

export function diffEntitySnapshots(before: EntitySnapshot, after: EntitySnapshot): EntityDelta {
  const previous = new Map(before.entities.map(e => [e.id, e])), changes: EntityChange[] = []
  for (const entity of after.entities) {
    const old = previous.get(entity.id); previous.delete(entity.id)
    const current = entity.components as unknown as Record<string, unknown>, prior = old?.components as unknown as Record<string, unknown> | undefined
    const names = [...new Set([...Object.keys(current), ...Object.keys(prior ?? {})])]
    const changed = names.filter(name => !same(current[name], prior?.[name]))
    if (!old || changed.length) changes.push({ entityId: entity.id, kind: entity.kind, operation: old ? 'changed' : 'created', components: changed })
  }
  for (const entity of previous.values()) changes.push({ entityId: entity.id, kind: entity.kind, operation: 'removed', components: Object.keys(entity.components) })
  return { version: 1, fromRevision: before.revision, revision: after.revision,
    campaignChanged: !same(before.campaign, after.campaign) || !same(before.sceneState, after.sceneState) || !same(before.actorOrder, after.actorOrder), changes }
}
