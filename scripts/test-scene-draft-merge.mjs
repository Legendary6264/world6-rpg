import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeSceneDraft } from '../server/generated/sceneDraftMerge.mjs'
import { createScene, emptyScenes, deleteScene, placeSceneToken, isSceneState, copySceneState } from '../server/generated/scenes.mjs'
import { createTabletopObject } from '../server/generated/tabletopCatalog.mjs'
import { rotateTabletopObject } from '../server/generated/tabletopCommands.mjs'

function fixture() {
  const state = createScene(createScene(emptyScenes(), 'hall', 'Таверна', 'top'), 'forest', 'Лес', 'top')
  state.activeSceneId = 'hall'
  state.scenes[0].objects = [createTabletopObject('table', 'table', { x: 4, y: 5, z: 0 }), createTabletopObject('timber-door', 'door', { x: 10, y: 5, z: 0 })]
  state.scenes[0].tokens = [{ actorId: 'hero', x: 2, y: 2, z: 0, diameter: .8, support: { kind: 'ground' } }]
  return state
}
const copies = () => { const base = fixture(); return [base, structuredClone(base), structuredClone(base)] }
const merge = (b, l, r, choices = {}, ids = ['hero']) => mergeSceneDraft(b, l, r, ids, choices)
const hall = state => state.scenes.find(s => s.id === 'hall')
const obj = (state, id = 'table') => hall(state).objects.find(o => o.id === id)
const resolve = (result, side) => Object.fromEntries(result.conflicts.map(c => [c.id, side]))

test('Сверка: локальная мебель, серверная дверь и ход героя объединяются, источники неизменны', () => {
  const [base, local, remote] = copies(); obj(local).x = 8; obj(remote, 'door').open = true; hall(remote).tokens[0].x = 6
  const originals = structuredClone([base, local, remote]), result = merge(base, local, remote)
  assert.equal(result.unresolved, 0); assert.equal(result.issue, ''); assert(isSceneState(result.state))
  assert.equal(obj(result.state).x, 8); assert.equal(obj(result.state, 'door').open, true); assert.equal(hall(result.state).tokens[0].x, 6)
  assert.deepEqual([base, local, remote], originals)
})
test('Сверка: положение и состояние одной двери объединяются независимо', () => {
  const [base, local, remote] = copies(); obj(local, 'door').x = 12; obj(remote, 'door').open = true; obj(remote, 'door').locked = false
  const result = merge(base, local, remote); assert.equal(result.unresolved, 0); assert.equal(result.issue, '')
  assert.equal(obj(result.state, 'door').x, 12); assert(obj(result.state, 'door').open)
})
test('Сверка: поворот и изменённый габарит не превращаются в смешанную геометрию', () => {
  const [base, , remote] = copies(), local = rotateTabletopObject(base, 'table'); obj(remote).width *= 1.5
  const review = merge(base, local, remote); assert.equal(review.conflicts.length, 1); assert.equal(review.unresolved, 1)
  assert.match(review.conflicts[0].label, /Положение и размеры/)
  const mine = merge(base, local, remote, resolve(review, 'local')), theirs = merge(base, local, remote, resolve(review, 'remote'))
  assert.equal(mine.unresolved, 0); assert.equal(theirs.unresolved, 0)
  for (const field of ['width', 'depth', 'height', 'facing', 'x', 'y', 'z']) {
    assert.equal(obj(mine.state)[field], obj(local)[field]); assert.equal(obj(theirs.state)[field], obj(remote)[field])
  }
})
test('Сверка: замок и открытие являются одним спорным состоянием', () => {
  const [base, local, remote] = copies(); obj(local, 'door').locked = true; obj(remote, 'door').open = true
  const result = merge(base, local, remote); assert.equal(result.unresolved, 1)
  const chosen = merge(base, local, remote, resolve(result, 'remote'))
  assert(obj(chosen.state, 'door').open); assert.equal(obj(chosen.state, 'door').locked, obj(remote, 'door').locked)
})
test('Сверка: одинаковые изменения не спорят; порядок JSON-полей не является правкой', () => {
  const [base, local, remote] = copies(); obj(local).name = 'Общий стол'; obj(remote).name = 'Общий стол'
  remote.scenes[0].objects = remote.scenes[0].objects.map(o => Object.fromEntries(Object.entries(o).reverse()))
  const result = merge(base, local, remote); assert.equal(result.unresolved, 0); assert.equal(obj(result.state).name, 'Общий стол')
  assert.deepEqual(merge(base, base, base).state, copySceneState(base))
})
test('Сверка: удаление неизменённого объекта принимается, редактирование удалённого требует выбора', () => {
  const [base, local, remote] = copies(); hall(local).objects = hall(local).objects.filter(o => o.id !== 'table')
  assert.equal(obj(merge(base, local, remote).state), undefined)
  obj(remote).height += .1
  const review = merge(base, local, remote); assert.equal(review.unresolved, 1)
  assert.equal(obj(merge(base, local, remote, resolve(review, 'local')).state), undefined)
  assert.equal(obj(merge(base, local, remote, resolve(review, 'remote')).state).height, obj(remote).height)
})
test('Сверка: сохранение изменённой сцены отменяет удаление её неизменённых предметов и героев', () => {
  const [base, , remote] = copies(), local = deleteScene(base, 'hall'); hall(remote).name = 'Обновлённая таверна'
  local.scenes[0].description = 'Моя правка леса'
  const review = merge(base, local, remote); assert.equal(review.unresolved, 1)
  const kept = merge(base, local, remote, resolve(review, 'remote'))
  assert.equal(kept.issue, ''); assert.equal(hall(kept.state).objects.length, 2); assert.equal(hall(kept.state).tokens.length, 1)
  assert.equal(kept.state.scenes.find(s => s.id === 'forest').description, 'Моя правка леса')
  assert.equal(hall(merge(base, local, remote, resolve(review, 'local')).state), undefined)
})
test('Сверка: перенос героя из удаляемой сцены можно сохранить отдельно от её удаления', () => {
  const base = fixture(), local = deleteScene(base, 'hall'), remote = placeSceneToken(base, 'forest', { ...hall(base).tokens[0], x: 4 })
  const first = merge(base, local, remote), choices = resolve(first, 'local'), second = merge(base, local, remote, choices)
  assert(second.conflicts.some(c => c.label.includes('Положение героя')))
  for (const conflict of second.conflicts) if (conflict.label.includes('Положение героя')) choices[conflict.id] = 'remote'
  const result = merge(base, local, remote, choices)
  assert.equal(result.unresolved, 0); assert.equal(result.issue, ''); assert.equal(hall(result.state), undefined)
  assert.equal(result.state.scenes[0].tokens[0].actorId, 'hero')
})
test('Сверка: два переноса одного героя между сценами разрешаются одной позицией', () => {
  const base = createScene(fixture(), 'crypt', 'Подземелье', 'top'), token = hall(base).tokens[0]
  const local = placeSceneToken(base, 'forest', { ...token, x: 4 }), remote = placeSceneToken(base, 'crypt', { ...token, x: 8 })
  const review = merge(base, local, remote); assert.equal(review.unresolved, 1)
  for (const side of ['local', 'remote']) {
    const result = merge(base, local, remote, resolve(review, side)), tokens = result.state.scenes.flatMap(s => s.tokens)
    assert.equal(result.issue, ''); assert.equal(tokens.length, 1); assert.equal(tokens[0].x, side === 'local' ? 4 : 8)
  }
})
test('Сверка: идентификаторы предметов из разных сцен не смешиваются', () => {
  const [base, local, remote] = copies()
  for (const state of [base, local, remote]) state.scenes[1].objects.push({ ...obj(state), x: 9 })
  obj(local).x = 8; remote.scenes[1].objects[0].height += .1
  const result = merge(base, local, remote); assert.equal(result.unresolved, 0)
  assert.equal(obj(result.state).x, 8); assert.equal(result.state.scenes[1].objects[0].x, 9)
  assert.equal(result.state.scenes[1].objects[0].height, remote.scenes[1].objects[0].height)
})
test('Сверка: исключённый герой не возвращается автоматически из локального черновика', () => {
  const [base, local, remote] = copies(); hall(local).tokens[0].x = 7; hall(remote).tokens = []
  const review = merge(base, local, remote, {}, []); assert.equal(review.unresolved, 1)
  assert.equal(merge(base, local, remote, resolve(review, 'remote'), []).issue, '')
  assert.match(merge(base, local, remote, resolve(review, 'local'), []).issue, /больше нет/)
})
test('Сверка: объединение размеров сцены и свежей позиции проверяет итоговую геометрию', () => {
  const [base, local, remote] = copies(); hall(local).width = 12; hall(remote).tokens[0].x = 20
  assert(isSceneState(local)); assert(isSceneState(remote))
  const result = merge(base, local, remote); assert.equal(result.unresolved, 0); assert.match(result.issue, /несовместимы/)
  assert.equal(hall(local).tokens[0].x, 2); assert.equal(hall(remote).width, 30)
})
test('Сверка: новые сцены не теряются; общий предел проверяется после объединения', () => {
  let base = fixture(); for (let i = 2; i < 19; i++) base = createScene(base, 'scene-' + i, 'Сцена ' + i, 'top')
  const local = createScene(base, 'local-added', 'Моя новая сцена', 'top'), remote = createScene(base, 'remote-added', 'Новая серверная сцена', 'top')
  const review = merge(base, local, remote), result = merge(base, local, remote, resolve(review, 'local'))
  assert.match(result.issue, /больше 20/); assert.equal(local.scenes.length, 20); assert.equal(remote.scenes.length, 20)
})
test('Сверка: старый черновик без исходника требует явного выбора целого варианта', () => {
  const [, local, remote] = copies(); obj(local).x = 9; obj(remote, 'door').open = true
  const review = merge(undefined, local, remote); assert.equal(review.unresolved, 1)
  assert.deepEqual(merge(undefined, local, remote, resolve(review, 'local')).state, copySceneState(local))
  assert.deepEqual(merge(undefined, local, remote, resolve(review, 'remote')).state, copySceneState(remote))
  assert.equal(merge(undefined, remote, remote).unresolved, 0)
})
test('Сверка: явное отсутствие выбранной сцены и удаление необязательного свойства сохраняются', () => {
  const [base, local, remote] = copies()
  for (const state of [base, local, remote]) hall(state).backgroundTileSizeM = 2
  delete hall(local).backgroundTileSizeM; local.activeSceneId = null; hall(remote).description = 'Свежий текст'
  const result = merge(base, local, remote)
  assert.equal(result.unresolved, 0); assert.equal(result.state.activeSceneId, null)
  assert(!Object.hasOwn(hall(result.state), 'backgroundTileSizeM')); assert.equal(hall(result.state).description, 'Свежий текст')
})
test('Сверка: унаследованное решение не принимается, специальные идентификаторы безопасны', () => {
  const [base, local, remote] = copies(); obj(local).x = 7; obj(remote).x = 8
  const review = merge(base, local, remote), inherited = Object.create(resolve(review, 'local'))
  const result = merge(base, local, remote, inherited); assert.equal(result.unresolved, 1); assert.equal(obj(result.state).x, 8)
  const special = createScene(emptyScenes(), '__proto__', 'Безопасная сцена', 'top')
  assert.equal(merge(special, special, special, {}, []).state.scenes[0].id, '__proto__')
})
