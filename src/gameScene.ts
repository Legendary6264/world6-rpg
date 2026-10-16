import type { World } from './rpgEngine'
import type { ScenePosition, SceneToken } from './sceneTypes'
import { placeSceneToken } from './scenes'
import { emptyPerception, perceptionDraft, preparePerception } from './scenePerception'

export type GameSceneSetup = { sceneId: string; actorIds: string[]; objectIds: string[]; contactIds: string[];
  title: string; description: string; anchor: ScenePosition; revealTerrain: boolean }
const ids = (v: unknown, max = 200): v is string[] => Array.isArray(v) && v.length <= max && v.every(x => typeof x === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(x)) && new Set(v).size === v.length
export function isGameSceneSetup(v: unknown): v is GameSceneSetup {
  if (!v || typeof v !== 'object') return false
  const s = v as GameSceneSetup
  return typeof s.sceneId === 'string' && ids(s.actorIds) && s.actorIds.length > 0 && ids(s.objectIds, 250) && ids(s.contactIds) &&
    typeof s.title === 'string' && !!s.title.trim() && s.title.length <= 120 && typeof s.description === 'string' && s.description.length <= 4000 &&
    s.revealTerrain === true && !!s.anchor && ['x','y','z'].every(k => typeof s.anchor[k as keyof ScenePosition] === 'number' && Number.isFinite(s.anchor[k as keyof ScenePosition]))
}

// Preparation is an explicit GM placement/disclosure command. It never advances time or resolves actions.
export function prepareGameScene(world: World, setup: GameSceneSetup): World {
  if (!isGameSceneSetup(setup)) throw Error('Выбери героев, точку входа и явно подтверди раскрытие местности.')
  const next = structuredClone(world), scene = next.campaign.scenes?.scenes.find(s => s.id === setup.sceneId)
  if (!scene || !setup.actorIds.every(id => next.characters.some(a => a.id === id))) throw Error('Сцена или герои больше не доступны.')
  if (next.campaign.declarations?.active) throw Error('Сначала заверши и сохрани текущий сбор заявлений в истории.')
  if (next.campaign.roundWork?.entries.some(w => setup.actorIds.includes(w.actorId))) throw Error('У выбранных героев есть незавершённые действия. Сначала разреши их судьбу.')
  if (setup.anchor.z !== scene.groundZ || setup.anchor.x < 0 || setup.anchor.x > scene.width || setup.anchor.y < 0 || setup.anchor.y > scene.depth) throw Error('Точка входа должна находиться на земле внутри выбранной сцены.')
  if (!setup.objectIds.every(id => scene.objects.some(o => o.id === id)) || !setup.contactIds.every(id => scene.tokens.some(t => t.actorId === id) || setup.actorIds.includes(id))) throw Error('Обнови список раскрываемых объектов и существ.')
  let scenes = next.campaign.scenes!
  for (const actorId of setup.actorIds) {
    const existing = scenes.scenes.find(s => s.id === scene.id)!.tokens.find(t => t.actorId === actorId)
    if (existing) continue
    const old = scenes.scenes.flatMap(s => s.tokens).find(t => t.actorId === actorId), diameter = old?.diameter ?? .8
    const r = diameter / 2, candidates: ScenePosition[] = []
    // Deterministic positions close to the GM's selected entry, without overlapping scenery or tokens.
    for (let ring = 0; ring <= 35; ring++) for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
      candidates.push({ x: setup.anchor.x + dx * (diameter + .5), y: setup.anchor.y + dy * (diameter + .5), z: scene.groundZ })
    }
    const current = scenes.scenes.find(s => s.id === scene.id)!
    const point = candidates.find(p => p.x >= r && p.y >= r && p.x <= scene.width - r && p.y <= scene.depth - r &&
      !current.tokens.some(t => Math.hypot(t.x - p.x, t.y - p.y) < (t.diameter + diameter) / 2 + .05) &&
      !scene.objects.some(o => o.blocksMovement && !(o.kind === 'door' && o.open) && Math.abs(p.x-o.x) < o.width/2+r && Math.abs(p.y-o.y) < o.depth/2+r))
    if (!point) throw Error('Около точки входа не хватает свободного места. Выбери другую точку или размести героев вручную.')
    scenes = placeSceneToken(scenes, scene.id, { actorId, ...point, diameter, support: { kind: 'ground' } } satisfies SceneToken)
  }
  scenes.activeSceneId = scene.id; next.campaign.scenes = scenes
  const perceptions = next.campaign.perceptions ?? { version: 1 as const, heroes: [] }
  for (const actorId of setup.actorIds) {
    const previous = perceptions.heroes.find(h => h.actorId === actorId) ?? emptyPerception(actorId)
    const draft = perceptionDraft(previous), current = scenes.scenes.find(s => s.id === scene.id)!
    draft.activeSceneId = scene.id
    draft.scenes = [...draft.scenes.filter(s => s.sceneId !== scene.id), { sceneId: scene.id, title: setup.title.trim(), description: setup.description,
      areas: [{ id: 'game-terrain', x: 0, y: 0, z: scene.minZ, width: scene.width, depth: scene.depth, height: scene.maxZ-scene.minZ, visible: true }],
      objects: setup.objectIds.map(objectId => ({ objectId, visible: true })),
      contacts: setup.contactIds.filter(id => id !== actorId).map(id => { const token = current.tokens.find(t => t.actorId === id)!
        return { actorId: id, kind: 'identified' as const, label: '', signs: '', showHeight: true, showVisuals: false, point: {x:token.x,y:token.y,z:token.z}, radius: 0 } }) }]
    const prepared = preparePerception(draft, previous, scenes, next.characters.map(a => a.id))
    perceptions.heroes = [...perceptions.heroes.filter(h => h.actorId !== actorId), prepared]
  }
  next.campaign.perceptions = perceptions
  return next
}
