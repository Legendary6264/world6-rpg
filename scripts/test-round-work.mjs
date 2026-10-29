import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const directory = await mkdtemp(join(tmpdir(), 'grani-work-'))
test.after(() => rm(directory, { recursive: true, force: true }))
for (const file of await readdir('src')) {
  if (!file.endsWith('.ts')) continue
  const js = ts.transpileModule(await readFile('src/' + file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g, (_, a, b) => a.replace(/\.ts$/, '') + '.mjs' + b)
  await writeFile(join(directory, file.replace(/\.ts$/, '.mjs')), js)
}
const module = name => import(pathToFileURL(join(directory, name + '.mjs')))
const exact = await module('exactWork'), work = await module('roundWork'), schema = await module('rpgSchema'), scenes = await module('scenes')
const backup = await module('lobbyBackup'), model = await module('characterModel'), transfer = await module('characterTransfer'), engine = await module('rpgEngine'), storage = await module('characterStorage')
const amount = n => exact.exactAmount(BigInt(n))
const entry = () => ({ id: 'work', actorId: 'hero', sceneId: 'scene', origin: { collectionId: 'collection', epoch: 2, entryRevision: 1, actionIndex: 0 },
  action: { kind: 'interact', target: { kind: 'self' }, operation: 'inspect', note: 'Личное действие' }, amount: { unit: 'personal-ms', total: amount(8000), remaining: amount(8000) } })
const state = () => ({ version: 1, entries: [entry()] })
const world = () => ({ characters: [{ ...model.createDefaultCharacter(), id: 'hero', name: 'Герой' }], campaign: { ...schema.emptyCampaign(),
  scenes: scenes.createScene(scenes.emptyScenes(), 'scene', 'Сцена', 'top'), roundWork: state() } })

test('Точные остатки принимают только ограниченные канонические дроби', () => {
  assert.deepEqual(exact.exactAmount(6n, 9n), { numerator: '2', denominator: '3' })
  assert.deepEqual(exact.exactAmount(0n, 27n), amount(0))
  for (const bad of [null, 1, { numerator: '2', denominator: '4' }, { numerator: '0', denominator: '2' },
    { numerator: '01', denominator: '1' }, { numerator: '-1', denominator: '1' }, { numerator: '1', denominator: '0' },
    { numerator: '1e3', denominator: '1' }, { numerator: '1'.repeat(97), denominator: '1' }, { ...amount(1), secret: true }]) {
    assert.equal(exact.isExactAmount(bad), false)
  }
  assert.throws(() => exact.exactAmount(-1n)); assert.throws(() => exact.exactAmount(1n, 0n))
  assert.throws(() => exact.exactAmount(1n, 10n ** 97n)); assert.throws(() => exact.amountFromNumber(Infinity))
})
test('Дробная арифметика не теряет работу и не округляет техническое переполнение', () => {
  const third = exact.exactAmount(1n, 3n)
  assert.deepEqual(exact.subtractAmounts(amount(1), third), exact.exactAmount(2n, 3n))
  assert.deepEqual(exact.scaleAmount(third, amount(3)), amount(1))
  assert.deepEqual(exact.amountFromNumber(0.1), exact.exactAmount(1n, 10n))
  assert.throws(() => exact.scaleAmount(third, amount(1), amount(0)))
  assert.throws(() => exact.subtractAmounts(third, amount(1)))
  assert.throws(() => exact.scaleAmount(exact.exactAmount(1n, 10n ** 95n), exact.exactAmount(1n, 101n)))
})
test('Две итерации работы сохраняют ID, точный остаток и учитывают новый бюджет только для остатка', () => {
  const initial = entry(), before = JSON.stringify(initial), duration = amount(5000)
  const first = work.projectWorkProgress(initial, duration, 5000, duration)
  assert.deepEqual(first.amount.remaining, amount(3000)); assert.equal(first.id, initial.id)
  assert.deepEqual(work.remainingWorldTime(first, 10000, duration), amount(1500))
  const second = work.projectWorkProgress(first, amount(1500), 10000, duration)
  assert.deepEqual(second.amount.remaining, amount(0)); assert.deepEqual(second.origin, initial.origin)
  assert.equal(JSON.stringify(initial), before)
  assert.deepEqual(work.projectWorkProgress(initial, duration, 5000, duration), first, 'Projection is not accumulated by repeated previews')
})
test('Ожидание сохраняет мировой остаток при изменении личного темпа', () => {
  const e = entry(); e.action = { kind: 'wait', seconds: 7, note: '' }; e.amount = { unit: 'world-ms', total: amount(7000), remaining: amount(7000) }
  assert(work.isRoundWorkEntry(e))
  const first = work.projectWorkProgress(e, amount(5000), 1, amount(5000))
  assert.deepEqual(first.amount.remaining, amount(2000))
  assert.deepEqual(work.remainingWorldTime(first, 1e12, amount(5000)), amount(2000))
  assert.deepEqual(work.projectWorkProgress(first, amount(2000), 1e12, amount(5000)).amount.remaining, amount(0))
})
test('Последовательные доли сохраняются без округления процентов', () => {
  const e = entry(); e.amount = { unit: 'personal-ms', total: amount(1), remaining: amount(1) }
  const first = work.projectWorkProgress(e, amount(1), 1, amount(3))
  const second = work.projectWorkProgress(first, amount(1), 1, amount(3))
  assert.deepEqual(first.amount.remaining, exact.exactAmount(2n, 3n))
  assert.deepEqual(second.amount.remaining, exact.exactAmount(1n, 3n))
  assert.deepEqual(work.projectWorkProgress(second, amount(1), 1, amount(3)).amount.remaining, amount(0))
  assert.deepEqual(work.projectWorkProgress(e, amount(0), 1, amount(3)), e)
})
test('Неверные интервалы, бюджеты и стоимость отвергаются до изменения данных', () => {
  const e = entry(), before = JSON.stringify(e)
  for (const budget of [0, -1, 0.5, NaN, Infinity, 1e12 + 1]) assert.throws(() => work.projectWorkProgress(e, amount(1), budget, amount(5)))
  assert.throws(() => work.projectWorkProgress(e, amount(6), 1, amount(5)))
  assert.throws(() => work.remainingWorldTime(e, 1, amount(0)))
  assert.throws(() => work.remainingWorldTime(e, 1, amount(86400001)))
  assert.equal(JSON.stringify(e), before)
})
test('Закрытая схема отклоняет неизвестные поля, неверные стадии происхождения и дубли', () => {
  assert(work.isRoundWork(state()))
  for (const patch of [e => e.origin.epoch = 0, e => e.origin.actionIndex = 20, e => e.amount.remaining = amount(9000),
    e => e.amount.total = amount(0), e => e.amount.total = amount(1e12 + 1), e => e.amount.unit = 'world-ms',
    e => e.secret = 'leak', e => e.action.target.hiddenActorId = 'secret', e => e.origin.token = 'secret']) {
    const e = entry(); patch(e); assert.equal(work.isRoundWorkEntry(e), false)
  }
  assert.equal(work.isRoundWork({ ...state(), version: 2 }), false)
  assert.equal(work.isRoundWork({ ...state(), token: 'secret' }), false)
  assert.equal(work.isRoundWork({ version: 1, entries: [entry(), entry()] }), false)
  assert.equal(work.isRoundWork({ version: 1, entries: [entry(), { ...entry(), id: 'other' }] }), false)
  assert.equal(work.isRoundWork({ version: 1, entries: Array.from({ length: 201 }, entry) }), false)
})
test('Неверная цена ожидания и неподдерживаемая точность не бросают исключение из валидатора', () => {
  const e = entry(); e.action = { kind: 'wait', seconds: 1, note: '' }; e.amount = { unit: 'world-ms', total: amount(1001), remaining: amount(1001) }
  assert.equal(work.isRoundWorkEntry(e), false)
  e.action.seconds = 5e-324
  assert.doesNotThrow(() => assert.equal(work.isRoundWorkEntry(e), false))
})
test('Ссылки на владельца работы и сцену обязательны; исчезновение прежней цели не стирает снимок', () => {
  const w = world()
  assert(work.roundWorkReferencesValid(w.campaign.roundWork, w.campaign.scenes, ['hero']))
  assert.equal(work.roundWorkReferencesValid(w.campaign.roundWork, undefined, ['hero']), false)
  assert.equal(work.roundWorkReferencesValid(w.campaign.roundWork, w.campaign.scenes, []), false)
  w.campaign.roundWork.entries[0].action = { kind: 'ability', abilityId: 'ability', stage: 'prepare', target: { kind: 'object', id: 'gone' }, note: '' }
  assert(work.roundWorkReferencesValid(w.campaign.roundWork, w.campaign.scenes, ['hero']))
})
test('Старая кампания совместима, копирование новых данных независимое и не меняет 3D/листы', () => {
  const legacy = schema.emptyCampaign(); assert(schema.isCampaign(legacy)); assert(!Object.hasOwn(schema.copyCampaign(legacy), 'roundWork'))
  const w = world(), before = JSON.stringify(w), copied = schema.copyCampaign(w.campaign)
  assert(schema.isCampaign(copied)); assert.deepEqual(copied.roundWork, w.campaign.roundWork)
  copied.roundWork.entries[0].action.note = 'new'; copied.roundWork.entries[0].amount.remaining.numerator = '0'
  assert.equal(JSON.stringify(w), before)
  const advanced = engine.advanceWorld(w, 1, 'clock-check')
  assert.deepEqual(advanced.campaign.roundWork, w.campaign.roundWork, 'Legacy clock does not independently progress new work')
})
test('Личная проекция исключает чужие планы, цели, заметки и происхождение', () => {
  const v = state(), e = entry(); e.id = 'secret-work'; e.actorId = 'other'; v.entries.push(e)
  const visible = work.personalRoundWork(v, ['hero'])
  assert.equal(visible.length, 1); assert.equal(visible[0].actorId, 'hero')
  const text = JSON.stringify(visible)
  for (const forbidden of ['secret-work', 'other', 'Личное действие', 'collection', 'scene', 'target', 'origin']) assert(!text.includes(forbidden))
  visible[0].amount.remaining.numerator = '0'; assert.equal(v.entries[0].amount.remaining.numerator, '8000')
  assert.deepEqual(work.personalRoundWork(v, []), [])
})
test('Полная копия сохраняет точный остаток; неизвестный герой/сцена отвергается без записи', () => {
  const w = world(), binding = [{ characterId: 'hero', ownerId: 'owner', approved: true }]
  const text = backup.serializeLobbyBackup(w, binding, [{ id: 'owner', displayName: 'Владелец' }])
  assert.deepEqual(backup.parseLobbyBackup(text).world.campaign.roundWork, w.campaign.roundWork)
  const legacy = { ...w, campaign: { ...w.campaign } }; delete legacy.campaign.roundWork
  assert(!Object.hasOwn(backup.parseLobbyBackup(backup.serializeLobbyBackup(legacy, binding, [])).world.campaign, 'roundWork'))
  const bad = JSON.parse(text); bad.world.campaign.roundWork.entries[0].actorId = 'missing'
  assert.throws(() => backup.parseLobbyBackup(JSON.stringify(bad)), /работа/)
  bad.world.campaign.roundWork.entries[0].actorId = 'hero'; bad.world.campaign.roundWork.entries[0].sceneId = 'missing'
  assert.throws(() => backup.parseLobbyBackup(JSON.stringify(bad)), /работа/)
  assert.throws(() => backup.serializeLobbyBackup({ ...w, characters: [] }, [], []), /работы/)
})
test('Архив персонажей сохраняет работу только при полном наборе связанных героев', () => {
  const w = world(), at = '2026-10-11T17:00:00.000Z', text = transfer.createCharacterArchive(w.characters, at, w.campaign)
  const result = transfer.parseCharacterArchive(text)
  assert.equal(result.ok, true); assert.deepEqual(result.preview.campaign.roundWork, w.campaign.roundWork)
  const bad = JSON.parse(text); bad.campaign.roundWork.entries[0].actorId = 'missing'
  assert.equal(transfer.parseCharacterArchive(JSON.stringify(bad)).ok, false)
  assert.throws(() => transfer.createCharacterArchive([{ ...w.characters[0], id: 'other' }], at, w.campaign), /работа/)
})
test('Локальное сохранение возвращает точную работу, повреждённые связи блокируют запись без потери исходного файла', () => {
  const values = new Map(), local = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }, w = world()
  storage.writeCharacters(local, w.characters, w.campaign)
  assert.deepEqual(storage.readCharacters(local).campaign.roundWork, w.campaign.roundWork)
  const before = local.getItem(storage.STORAGE_KEY)
  assert.throws(() => storage.writeCharacters(local, [], w.campaign), /работы/)
  assert.equal(local.getItem(storage.STORAGE_KEY), before)
  const bad = JSON.parse(before); bad.campaign.roundWork.entries[0].sceneId = 'missing'
  const damaged = JSON.stringify(bad); local.setItem(storage.STORAGE_KEY, damaged)
  assert.equal(storage.readCharacters(local).blocked, true)
  assert.equal(local.getItem(storage.STORAGE_KEY), damaged)
})
