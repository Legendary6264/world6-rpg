import type { Scene, SceneObject, SceneState, SceneToken } from './sceneTypes'
import { copySceneState, isSceneState, sceneReferencesValid, MAX_SCENES, MAX_SCENE_OBJECTS } from './scenes'

export type SceneMergeChoice = 'local' | 'remote'
export type SceneMergeChoices = Readonly<Record<string, SceneMergeChoice>>
export type SceneMergeConflict = { id: string; label: string; local: string; remote: string }
export type SceneMergeResult = { state: SceneState; conflicts: SceneMergeConflict[]; unresolved: number; issue: string }
type RecordValue = Record<string, unknown>
type Placement = { sceneId: string; token: SceneToken }

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const left = Object.keys(a), right = Object.keys(b)
  return left.length === right.length && left.every(key => Object.hasOwn(b, key) && same((a as RecordValue)[key], (b as RecordValue)[key]))
}

const names: Record<string, string> = {
  x: 'X', y: 'Y', z: 'Z', width: 'ширина', depth: 'глубина', height: 'высота', facing: 'поворот',
  groundZ: 'земля Z', minZ: 'низ Z', maxZ: 'верх Z', name: 'название', description: 'описание', view: 'вид',
  roundDurationSeconds: 'длительность раунда', palette: 'палитра', environment: 'окружение',
  background: 'фон', backgroundTileSizeM: 'размер рисунка фона', artwork: 'изображение', asset: 'модель', kind: 'тип',
  open: 'открыт', locked: 'заперт', active: 'включён', blocksMovement: 'преграда движению', blocksSight: 'преграда обзору', canSupport: 'опора',
}
function summary(value: unknown): string {
  if (value === undefined) return 'Удалено / не задано'
  if (value === null) return 'Не выбрано'
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  if (typeof value !== 'object') return String(value)
  return Object.entries(value).map(([key, item]) => (names[key] ?? key) + ': ' + summary(item)).join('; ')
}
const sceneSummary = (value: Scene | undefined) => value ? `${value.name} · объектов: ${value.objects.length} · героев: ${value.tokens.length}` : 'Сцена удалена'
const stateSummary = (value: SceneState) => `Сцен: ${value.scenes.length} · объектов: ${value.scenes.reduce((n, s) => n + s.objects.length, 0)} · героев: ${value.scenes.reduce((n, s) => n + s.tokens.length, 0)}`
const key = (...parts: string[]) => JSON.stringify(parts)
const orderedIds = <T>(base: readonly T[], local: readonly T[], remote: readonly T[], id: (item: T) => string) => [...new Set([...remote, ...local, ...base].map(id))]
const index = <T>(values: readonly T[], id: (item: T) => string) => new Map(values.map(value => [id(value), value]))
const header = ({ objects: _objects, tokens: _tokens, ...value }: Scene): RecordValue => value
const pick = (value: RecordValue, fields: readonly string[]) => Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]))

// Coordinates/dimensions and mechanism state are atomic groups: a quarter turn
// cannot be combined with another version's unrotated footprint, nor an open
// door with a competing lock operation. Other fields can merge independently.
const objectGroups = [
  { id: 'transform', label: 'Положение и размеры', fields: ['x', 'y', 'z', 'width', 'depth', 'height', 'facing'] },
  { id: 'model', label: 'Модель', fields: ['kind', 'asset', 'artwork'] },
  { id: 'behavior', label: 'Состояние и свойства', fields: ['open', 'locked', 'active', 'blocksMovement', 'blocksSight', 'canSupport'] },
]
const sceneGroups = [{ id: 'bounds', label: 'Размеры и высоты сцены', fields: ['width', 'depth', 'groundZ', 'minZ', 'maxZ'] }]

export function mergeSceneDraft(baseValue: SceneState | undefined, localValue: SceneState, remoteValue: SceneState,
  actorIds: readonly string[], choices: SceneMergeChoices = {}, actorNames: ReadonlyMap<string, string> = new Map()): SceneMergeResult {
  for (const value of [baseValue, localValue, remoteValue]) if (value !== undefined && !isSceneState(value)) throw Error('Сверка требует корректных сцен.')
  const base = baseValue && copySceneState(baseValue), local = copySceneState(localValue), remote = copySceneState(remoteValue)
  const conflicts: SceneMergeConflict[] = [], unresolved = new Set<string>()
  const selection = (id: string) => Object.hasOwn(choices, id) && ['local', 'remote'].includes(choices[id]) ? choices[id] : undefined
  function atom<T>(id: string, label: string, before: T, mine: T, theirs: T, describe: (v: T) => string = summary): T {
    if (same(mine, theirs)) return mine
    if (same(before, mine)) return theirs
    if (same(before, theirs)) return mine
    conflicts.push({ id, label, local: describe(mine), remote: describe(theirs) })
    if (!selection(id)) unresolved.add(id)
    return selection(id) === 'local' ? mine : theirs
  }
  function record(id: string, label: string, before: RecordValue | undefined, mine: RecordValue, theirs: RecordValue,
    groups: readonly { id: string; label: string; fields: readonly string[] }[]): RecordValue {
    const grouped = new Set(groups.flatMap(group => [...group.fields])), entries: [string, unknown][] = []
    for (const group of groups) {
      const merged = atom(key(id, group.id), label + ' · ' + group.label, before && pick(before, group.fields), pick(mine, group.fields), pick(theirs, group.fields))
      if (merged) entries.push(...Object.entries(merged))
    }
    for (const field of new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(before ?? {})])) {
      if (grouped.has(field)) continue
      const value = atom(key(id, field), label + ' · ' + (names[field] ?? field), before?.[field], mine[field], theirs[field])
      if (value !== undefined) entries.push([field, value])
    }
    return Object.fromEntries(entries)
  }
  function finish(state: SceneState): SceneMergeResult {
    const issue = state.scenes.length > MAX_SCENES ? 'После объединения получается больше 20 сцен. Выбери целый вариант или освободи место перед сверкой.' :
      state.scenes.some(s => s.objects.length > MAX_SCENE_OBJECTS) ? 'После объединения в одной из сцен больше 250 объектов. Выбери целый вариант или освободи место перед сверкой.' :
      !sceneReferencesValid(state, [...actorIds]) ? 'В выбранном варианте есть герои, которых больше нет в кампании. Выбери их серверное положение или серверный вариант сцен.' :
      !isSceneState(state) ? 'Выбранные изменения несовместимы: проверь размеры, высоты и опоры героев. Можно выбрать целиком свой или серверный вариант сцен.' : ''
    return { state: isSceneState(state) ? copySceneState(state) : state, conflicts, unresolved: unresolved.size, issue }
  }
  // Old drafts remain usable, but without an ancestor there is no safe way to
  // infer which missing scene was newly created and which one was deleted.
  if (!base) {
    if (same(local, remote)) return finish(local)
    const id = key('whole-state')
    conflicts.push({ id, label: 'У этого черновика нет исходного снимка. Выбери целый вариант сцен.', local: stateSummary(local), remote: stateSummary(remote) })
    if (!selection(id)) unresolved.add(id)
    return finish(selection(id) === 'local' ? local : remote)
  }

  const baseScenes = index(base.scenes, s => s.id), localScenes = index(local.scenes, s => s.id), remoteScenes = index(remote.scenes, s => s.id)
  const kept: Scene[] = [], restoredLocal: Scene[] = [], restoredRemote: Scene[] = []
  for (const id of orderedIds(base.scenes, local.scenes, remote.scenes, s => s.id)) {
    const before = baseScenes.get(id), mine = localScenes.get(id), theirs = remoteScenes.get(id)
    if (!mine || !theirs) {
      const selected = atom(key('scene', id, 'existence'), 'Удаление сцены · ' + (mine ?? theirs ?? before)?.name, before, mine, theirs, sceneSummary)
      if (selected) {
        kept.push({ ...selected, objects: selected.objects.map(o => ({ ...o })), tokens: [] })
        if (before && !mine) restoredLocal.push(before)
        if (before && !theirs) restoredRemote.push(before)
      }
      continue
    }
    const label = 'Сцена «' + mine.name + '»'
    const value = record(key('scene', id), label, before && header(before), header(mine), header(theirs), sceneGroups)
    const objects: SceneObject[] = [], old = index(before?.objects ?? [], o => o.id), left = index(mine.objects, o => o.id), right = index(theirs.objects, o => o.id)
    for (const objectId of orderedIds(before?.objects ?? [], mine.objects, theirs.objects, o => o.id)) {
      const b = old.get(objectId), l = left.get(objectId), r = right.get(objectId), name = (l ?? r ?? b)?.name
      const path = key('object', id, objectId), objectLabel = mine.name + ' · «' + name + '»'
      const object = l && r ? record(path, objectLabel, b as unknown as RecordValue | undefined, l as unknown as RecordValue, r as unknown as RecordValue, objectGroups) as unknown as SceneObject :
        atom(path, objectLabel, b, l, r)
      if (object) objects.push(object)
    }
    kept.push({ ...value, objects, tokens: [] } as unknown as Scene)
  }

  // Placement is global per actor, even across scenes. Otherwise two concurrent
  // moves out of one scene would create duplicate copies in different scenes.
  const placements = (state: SceneState, restored: Scene[] = []) => {
    const result = new Map<string, Placement>()
    for (const scene of state.scenes) for (const token of scene.tokens) result.set(token.actorId, { sceneId: scene.id, token })
    for (const scene of restored) for (const token of scene.tokens) if (!result.has(token.actorId)) result.set(token.actorId, { sceneId: scene.id, token })
    return result
  }
  const old = placements(base), left = placements(local, restoredLocal), right = placements(remote, restoredRemote), destinations = index(kept, s => s.id), actors = new Set(actorIds)
  const title = (v: Placement | undefined): string => {
    if (!v) return 'Герой убран со сцены'
    const scene = localScenes.get(v.sceneId) ?? remoteScenes.get(v.sceneId), support = v.token.support
    const surface = support.kind === 'object' ? scene?.objects.find(o => o.id === support.objectId)?.name : undefined
    return `${scene?.name ?? v.sceneId} · X ${v.token.x}; Y ${v.token.y}; Z ${v.token.z} · ${support.kind === 'object' ? 'на опоре «' + (surface ?? 'недоступна') + '»' : support.kind === 'ground' ? 'на земле' : 'в воздухе'}`
  }
  for (const actorId of new Set([...right.keys(), ...left.keys(), ...old.keys()])) {
    const before = old.get(actorId), mine = left.get(actorId), theirs = right.get(actorId), id = key('actor', actorId)
    let selected: Placement | undefined
    if (!actors.has(actorId) && mine) {
      conflicts.push({ id, label: 'Герой больше не доступен в кампании · ' + (actorNames.get(actorId) ?? actorId), local: title(mine), remote: 'Убрать отсутствующего героя со сцены' })
      if (!selection(id)) unresolved.add(id)
      selected = selection(id) === 'local' ? mine : undefined
    } else selected = atom(id, 'Положение героя · ' + (actorNames.get(actorId) ?? actorId), before, mine, theirs, title)
    // Removing a scene explicitly also removes placements inside it. A move to
    // a surviving scene still needs the normal actor conflict decision.
    const candidates = [mine, theirs].filter((v): v is Placement => !!v)
    if (candidates.every(v => !destinations.has(v.sceneId))) {
      unresolved.delete(id)
      const conflict = conflicts.findIndex(c => c.id === id); if (conflict >= 0) conflicts.splice(conflict, 1)
    }
    if (selected && destinations.has(selected.sceneId)) destinations.get(selected.sceneId)!.tokens.push(selected.token)
  }
  const activeSceneId = atom(key('active-scene'), 'Выбранная сцена', base.activeSceneId, local.activeSceneId, remote.activeSceneId,
    id => id === null ? 'Не выбрана' : (localScenes.get(id) ?? remoteScenes.get(id) ?? baseScenes.get(id))?.name ?? id)
  return finish({ version: 1, activeSceneId: activeSceneId === null ? null : destinations.has(activeSceneId) ? activeSceneId : kept[0]?.id ?? null, scenes: kept })
}
