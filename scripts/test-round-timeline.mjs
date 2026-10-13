import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'grani-timeline-'))
const source = await readFile(new URL('../src/roundTimeline.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
const file = join(directory, 'timeline.mjs')
await writeFile(file, compiled)
const { previewRoundTimeline, MAX_TIMING_MS } = await import(pathToFileURL(file))
test.after(() => rm(directory, { recursive: true, force: true }))
const work = () => ({ kind: 'interact', target: { kind: 'self' }, operation: 'inspect', note: '' })
const wait = seconds => ({ kind: 'wait', seconds, note: '' })
const entry = (actorId, actions) => ({ actorId, actorName: actorId, revision: 1, status: 'submitted', actions, resolved: [], submittedBy: actorId, submittedAt: '', note: '' })
const collection = (entries, durationSeconds = 5) => ({ id: 'collection', sceneId: 'scene', sceneName: 'Сцена', phase: 'closed', epoch: 2,
  durationSeconds, allowReplace: true, entries, participantIds: entries.map(e => e.actorId), history: [] })
const timing = (actorId, budgetMs, costs = []) => ({ actorId, entryRevision: 1, budgetMs, costs: costs.map((personalMs, index) => ({ index, personalMs })) })

test('Разный личный бюджет переводится на мировую шкалу один раз', () => {
  const result = previewRoundTimeline(collection([entry('fast', [work()]), entry('slow', [work()])]), [timing('fast', 10000, [4000]), timing('slow', 5000, [4000])])
  assert.deepEqual(result.groups.map(g => [g.atMs, g.actions[0].actorId]), [[2000, 'fast'], [4000, 'slow']])
})

test('Медленное действие не завершается; последующие действия не получают прогресс', () => {
  const result = previewRoundTimeline(collection([entry('slow', [work(), work()])]), [timing('slow', 1000, [3000, 1000])])
  assert.equal(result.groups.length, 0)
  const [first, second] = result.actors[0].actions
  assert.equal(first.status, 'continues'); assert.equal(first.remainingPersonalMs, 2000)
  assert.equal(first.progressPercent, 33.333333)
  assert.equal(second.status, 'queued'); assert.equal(second.remainingPersonalMs, 1000); assert.equal(second.progressPercent, 0)
})

test('Последовательность тратит общий бюджет; граница раунда включена', () => {
  const result = previewRoundTimeline(collection([entry('a', [work(), work(), work()])]), [timing('a', 5000, [1000, 4000, 1])])
  assert.deepEqual(result.groups.map(g => g.atMs), [1000, 5000])
  assert.deepEqual(result.actors[0].actions.map(a => a.status), ['finishes', 'finishes', 'queued'])
})

test('Ожидание сохраняет мировую длительность при разном темпе', () => {
  const result = previewRoundTimeline(collection([entry('a', [wait(1), work()]), entry('b', [wait(1)])]), [
    { ...timing('a', 10000), costs: [{ index: 1, personalMs: 2000 }] }, timing('b', 1000),
  ])
  assert.equal(result.groups[0].atMs, 1000)
  assert.equal(result.groups[0].actions.length, 2)
  assert.equal(result.groups[1].atMs, 2000)
  assert.equal(result.actors[0].actions[0].personalCostMs, 2000)
  assert.equal(result.actors[1].actions[0].personalCostMs, 200)
})

test('Совпадения группируются точно; округление отображения не объединяет соседние события', () => {
  const exact = previewRoundTimeline(collection([entry('a', [work()]), entry('b', [wait(0.1)])], 0.3), [timing('a', 3, [1]), timing('b', 3)])
  assert.equal(exact.groups.length, 1); assert.equal(exact.groups[0].actions.length, 2)
  assert.deepEqual(exact.groups[0].exactTime, { numerator: '100', denominator: '1' })
  const near = previewRoundTimeline(collection([entry('a', [work()]), entry('b', [work()])], 0.001), [timing('a', MAX_TIMING_MS, [1]), timing('b', MAX_TIMING_MS, [2])])
  assert.equal(near.groups.length, 2)
  assert.equal(near.groups[0].atMs, near.groups[1].atMs, 'Rounded display may coincide, exact order may not')
  assert.notDeepEqual(near.groups[0].exactTime, near.groups[1].exactTime)
})

test('Отсутствующее/возвращённое заявление остаётся вопросом мастера', () => {
  const c = collection([entry('ready', [wait(1)]), { ...entry('returned', [wait(1)]), status: 'returned' }]); c.participantIds.push('absent')
  const result = previewRoundTimeline(c, [timing('ready', 1000)])
  assert.deepEqual(result.missingActorIds, ['returned', 'absent'])
  assert.deepEqual(result.actors.map(a => a.actorId), ['ready'])
})

test('Неполные, неверные или устаревшие ручные параметры не рассчитываются', () => {
  const c = collection([entry('a', [work()])]), good = timing('a', 1000, [500])
  for (const bad of [null, [], [good, good], [{ ...good, actorId: 'unknown' }], [{ ...good, entryRevision: 2 }],
    ...[0, -1, 1.5, NaN, Infinity, MAX_TIMING_MS + 1].map(budgetMs => [{ ...good, budgetMs }]),
    [{ ...good, costs: [] }], [{ ...good, costs: [{ index: 1, personalMs: 1 }] }], [{ ...good, costs: [{ index: 0, personalMs: 0 }] }],
    [{ ...good, costs: [{ index: 0, personalMs: 1 }, { index: 0, personalMs: 2 }] }]]) assert.throws(() => previewRoundTimeline(c, bad))
  assert.throws(() => previewRoundTimeline(collection([entry('a', [wait(1)])]), [good]), /кроме ожидания/)
})

test('Приём должен быть закрыт', () => {
  const c = collection([entry('a', [wait(1)])])
  for (const phase of ['open', 'cancelled']) assert.throws(() => previewRoundTimeline({ ...c, phase }, [timing('a', 1000)]), /закрой приём/)
})

test('Препросмотр детерминирован и не изменяет заявления или ручные параметры', () => {
  const c = collection([entry('a', [work(), wait(1)])]), input = [timing('a', 5000, [1500])]
  const before = JSON.stringify({ c, input }), first = previewRoundTimeline(c, input)
  assert.equal(JSON.stringify({ c, input }), before)
  assert.deepEqual(previewRoundTimeline(c, input), first)
  assert.doesNotThrow(() => JSON.stringify(first), 'Exact fractions must serialize without BigInt')
})
