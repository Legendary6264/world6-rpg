import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const directory = await mkdtemp(join(tmpdir(), 'grani-execution-'))
test.after(() => rm(directory, { recursive: true, force: true }))
for (const file of await readdir('src')) {
  if (!file.endsWith('.ts')) continue
  const js = ts.transpileModule(await readFile('src/' + file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g, (_, a, b) => a.replace(/\.ts$/, '') + '.mjs' + b)
  await writeFile(join(directory, file.replace(/\.ts$/, '.mjs')), js)
}
const module = name => import(pathToFileURL(join(directory, name + '.mjs')))
const { calculateRound } = await module('roundExecution'), { createDefaultCharacter } = await module('characterModel')
const { emptyCampaign } = await module('rpgSchema'), scenes = await module('scenes'), exact = await module('exactWork')
const amount = n => exact.exactAmount(BigInt(n))
const wait = seconds => ({ kind: 'wait', seconds, note: '' })
const door = operation => ({ kind: 'interact', operation, target: { kind: 'object', id: 'door' }, note: '' })
const entry = (actorId, actions) => ({ actorId, actorName: actorId, revision: 1, status: 'submitted', actions,
  resolved: actions.flatMap((a, index) => a.kind === 'interact' ? [{ index, objectId: 'door' }] : []), submittedBy: 'gm', submittedAt: '2026-10-11T00:00:00Z', note: '' })
const collection = entries => ({ id: 'collection', sceneId: 'scene', sceneName: 'Scene', durationSeconds: 10, allowReplace: true, phase: 'closed', epoch: 2,
  participantIds: ['a', 'b'], entries, history: [] })
function world() {
  const state = scenes.createScene(scenes.emptyScenes(), 'scene', 'Scene', 'top')
  state.scenes[0].objects.push(scenes.sceneObject('door', 'door', { x: 1, y: 2, z: 3 }))
  return { characters: ['a', 'b'].map(id => ({ ...createDefaultCharacter(), id, name: id })), campaign: { ...emptyCampaign(), scenes: state } }
}
const timing = (actorId, costs = [], budgetMs = 1000) => ({ actorId, entryRevision: 1, budgetMs, costs: costs.map((personalMs, index) => ({ index, personalMs })) })
const input = (timings, missing = []) => ({ timings, continuations: [], missingDecisions: missing.map(actorId => ({ actorId, reason: 'Решение мастера: продолжить без действия' })), interactionsConfirmed: true })

test('Ожидание нескольких героев продвигает общие часы ровно один раунд; расчёт не меняет источник', () => {
  const w = world(), original = structuredClone(w), c = collection([entry('a', [wait(3)]), entry('b', [wait(3)])])
  const r = calculateRound(w, c, input([timing('a'), timing('b', [], 999999)]), 'wait-seed')
  assert.deepEqual(w, original); assert.equal(r.world.campaign.seconds, 10); assert.equal(r.world.campaign.revision, 1)
  assert.equal(r.summary.events.length, 2); assert.deepEqual(r.summary.events.map(e => e.atMs), [amount(3000), amount(3000)])
})
test('Дверь изменяется в порядке точного времени, а координаты и свойства препятствия сохраняются', () => {
  const w = world(), c = collection([entry('b', [door('close')]), entry('a', [door('open')])])
  const r = calculateRound(w, c, input([timing('a', [200]), timing('b', [600])]), 'door-seed')
  assert.deepEqual(r.summary.events.map(e => [e.actorId, e.kind, e.atMs]), [['a', 'open', amount(2000)], ['b', 'close', amount(6000)]])
  assert.deepEqual(r.world.campaign.scenes.scenes[0].objects[0], w.campaign.scenes.scenes[0].objects[0]); assert.equal(r.world.campaign.seconds, 10)
})
test('Окончание ровно на границе исполняется; совпавшие взаимодействия блокируются без изменения', () => {
  const w = world(), c = collection([entry('a', [door('open')])])
  const r = calculateRound(w, c, input([timing('a', [1000])], ['b']), 'boundary')
  assert.equal(r.world.campaign.scenes.scenes[0].objects[0].open, true); assert.equal(r.summary.carried.length, 0)
  const conflict = collection([entry('a', [door('open')]), entry('b', [door('close')])]), before = structuredClone(w)
  assert.throws(() => calculateRound(w, conflict, input([timing('a', [100]), timing('b', [100])]), 'tie'), /Одновременные/); assert.deepEqual(w, before)
})
test('Длинное действие и очередь сохраняются; следующий бюджет расходует только прежний остаток', () => {
  const w = world(), c = collection([entry('a', [door('open'), wait(2)])]), first = calculateRound(w, c, input([timing('a', [7000], 3000)], ['b']), 'first')
  assert.equal(first.world.campaign.scenes.scenes[0].objects[0].open, false)
  const saved = first.world.campaign.roundWork.entries
  assert.deepEqual(saved.map(e => e.amount.remaining), [amount(4000), amount(2000)])
  const next = { ...collection([]), id: 'next' }, controls = { ...input([], ['b']), continuations: [{ actorId: 'a', mode: 'continue', budgetMs: 2000 }] }
  const second = calculateRound(first.world, next, controls, 'second')
  assert.deepEqual(second.world.campaign.roundWork.entries[0].amount.remaining, amount(2000))
  assert.equal(second.world.campaign.roundWork.entries[0].id, saved[0].id)
  controls.continuations[0].budgetMs = 4000
  const third = calculateRound(second.world, { ...next, id: 'third' }, controls, 'third')
  assert.equal(third.world.campaign.scenes.scenes[0].objects[0].open, true); assert.equal(third.summary.events[0].kind, 'open')
  assert.deepEqual(third.summary.events.map(e => e.atMs), [amount(5000), amount(7000)]); assert.equal(third.world.campaign.roundWork.entries.length, 0)
})
test('Длинное ожидание остаётся мировым временем при смене скорости', () => {
  const first = calculateRound(world(), collection([entry('a', [wait(15)])]), input([timing('a', [], 1)], ['b']), 'long-wait')
  assert.deepEqual(first.world.campaign.roundWork.entries[0].amount.remaining, amount(5000))
  const second = calculateRound(first.world, { ...collection([]), id: 'next' }, { ...input([], ['b']), continuations: [{ actorId: 'a', mode: 'continue', budgetMs: 1000000000 }] }, 'finish-wait')
  assert.deepEqual(second.summary.events[0].atMs, amount(5000)); assert.equal(second.world.campaign.seconds, 20)
})
test('Необъявленные действия требуют решения мастера; неподдержанные и неверные цели блокируют весь раунд', () => {
  const w = world(), original = structuredClone(w)
  assert.throws(() => calculateRound(w, collection([]), input([]), 'missing'), /мастер должен/)
  for (const action of [{ ...door('open'), operation: 'take' }]) {
    assert.throws(() => calculateRound(w, collection([entry('a', [action])]), input([timing('a', [100])], ['b']), 'unsupported'), /пока не исполняется/)
  }
  const c = collection([entry('a', [door('open')])]), p = input([timing('a', [100])], ['b'])
  assert.throws(() => calculateRound(w, c, { ...p, interactionsConfirmed: false }, 'unconfirmed'), /проверить доступность/)
  w.campaign.scenes.scenes[0].objects = []; assert.throws(() => calculateRound(w, c, p, 'lost-target'), /Цель исчезла/)
  w.campaign.scenes = original.campaign.scenes; c.entries[0].resolved = []
  assert.throws(() => calculateRound(w, c, p, 'unresolved'), /не подтверждён/); assert.deepEqual(w, original)
})
test('Прежняя работа не продолжается автоматически и не исчезает при удержании', () => {
  const first = calculateRound(world(), collection([entry('a', [wait(15)])]), input([timing('a')], ['b']), 'held-work'), c = { ...collection([]), id: 'next' }
  assert.throws(() => calculateRound(first.world, c, input([], ['a', 'b']), 'without-choice'), /прежней работы/)
  const held = calculateRound(first.world, c, { ...input([], ['a', 'b']), continuations: [{ actorId: 'a', mode: 'hold', budgetMs: 1000 }] }, 'held')
  assert.deepEqual(held.world.campaign.roundWork, first.world.campaign.roundWork); assert.equal(held.world.campaign.seconds, 20)
  const newPlan = collection([entry('a', [wait(1)])])
  assert.throws(() => calculateRound(first.world, newPlan, { ...input([timing('a')], ['b']), continuations: [{ actorId: 'a', mode: 'hold', budgetMs: 1000 }] }, 'skip-queue'), /перед новыми/)
})
test('Точные дроби определяют порядок без округления остатков', () => {
  const c = collection([entry('a', [door('open')])]), first = calculateRound(world(), c, input([timing('a', [3], 1)], ['b']), 'fraction-first')
  const second = calculateRound(first.world, { ...collection([]), id: 'next' }, { ...input([], ['b']), continuations: [{ actorId: 'a', mode: 'continue', budgetMs: 3 }] }, 'fraction-second')
  assert.deepEqual(second.summary.events[0].atMs, exact.exactAmount(20000n, 3n)); assert.equal(second.world.campaign.seconds, 20)
})
test('Непредставимое числовыми часами время и потеря способности действовать не дают частичного результата', () => {
  const w = world(), c = collection([entry('a', [wait(1e-9)])]), before = structuredClone(w)
  assert.throws(() => calculateRound(w, c, input([timing('a')], ['b']), 'tiny'), /Интервал слишком мал/); assert.deepEqual(w, before)
  w.characters[0].rpg.dead = true
  assert.throws(() => calculateRound(w, collection([entry('a', [wait(1)])]), input([timing('a')], ['b']), 'dead'), /жив и в сознании/)
})

const move = (route, support = 'ground') => ({ kind: 'move', route, support, note: 'Личный маршрут' })
const location = (x,y,z=0) => ({x,y,z})
function motionWorld(a = location(2,2), b = location(25,18)) {
  const w=world(), s=w.campaign.scenes.scenes[0];s.objects=[]
  s.tokens=[{actorId:'a',...a,diameter:1,support:{kind:a.z?'air':'ground'}},{actorId:'b',...b,diameter:1,support:{kind:b.z?'air':'ground'}}]
  return w
}
const motionInput = (timings,missing=['b']) => ({...input(timings,missing),movement:{confirmed:true,bodies:[{actorId:'a',heightM:2,flightReason:'Мастер подтвердил действующую левитацию и её условия'},{actorId:'b',heightM:2,flightReason:'Мастер подтвердил действующую левитацию и её условия'}]}})
const ownToken = w => w.campaign.scenes.scenes[0].tokens.find(t=>t.actorId==='a')
test('Движение: свободные XYZ и порядок маршрута; расчёт не изменяет источник',()=>{
  const w=motionWorld(),before=structuredClone(w),c=collection([entry('a',[move([location(7,2),location(7,7)])])])
  const r=calculateRound(w,c,motionInput([timing('a',[500])]),'walk')
  assert.deepEqual(w,before);assert.deepEqual(ownToken(r.world),{actorId:'a',...location(7,7),diameter:1,support:{kind:'ground'}})
  assert.equal(r.summary.events[0].kind,'move');assert.deepEqual(r.summary.movements[0].from,location(2,2));assert.equal(r.world.campaign.seconds,10)
})
test('Движение: частичная позиция определяется пройденной длиной, а остаток переносится точно',()=>{
  const w=motionWorld(),c=collection([entry('a',[move([location(6,2),location(6,8)])])])
  const first=calculateRound(w,c,motionInput([timing('a',[2500])]),'partial-path')
  assert.deepEqual(location(ownToken(first.world).x,ownToken(first.world).y),location(6,2))
  const work=first.world.campaign.roundWork.entries[0];assert.deepEqual(work.movement,{start:location(2,2),diameter:1});assert.deepEqual(work.amount.remaining,amount(1500))
  const next={...motionInput([],['b']),continuations:[{actorId:'a',mode:'continue',budgetMs:3000}]}
  const second=calculateRound(first.world,{...collection([]),id:'next'},next,'partial-finish')
  assert.deepEqual(second.summary.movements[0].from,location(6,2));assert.deepEqual(second.summary.movements[0].to,location(6,8));assert.deepEqual(second.summary.events[0].atMs,amount(5000))
  assert.equal(second.world.campaign.roundWork.entries.length,0);assert.equal(second.world.campaign.seconds,20)
})
test('Движение: ожидающая очередь не телепортирует и не переводит героя в воздух на границе',()=>{
  const w=motionWorld(),c=collection([entry('a',[wait(10),move([location(6,2,4)],'air')])])
  const r=calculateRound(w,c,{...motionInput([ {actorId:'a',entryRevision:1,budgetMs:1000,costs:[{index:1,personalMs:1000}]} ])},'queued-flight')
  assert.deepEqual(ownToken(r.world),ownToken(w));assert(!r.world.campaign.roundWork.entries[0].movement);assert(!r.summary.movements)
  const next=calculateRound(r.world,{...collection([]),id:'next'},{...motionInput([],['b']),continuations:[{actorId:'a',mode:'continue',budgetMs:1000}]},'start-flight')
  assert.equal(ownToken(next.world).z,4);assert.equal(ownToken(next.world).support.kind,'air')
})
test('Движение: отсутствие отметки, подтверждения, размеров и изменение прежней позиции блокируют расчёт',()=>{
  const w=motionWorld(),c=collection([entry('a',[move([location(6,2)])])]),p=motionInput([timing('a',[2000])]),before=structuredClone(w)
  for(const data of [{...p,movement:undefined},{...p,movement:{...p.movement,confirmed:false}},{...p,movement:{confirmed:true,bodies:[{actorId:'a',heightM:2}]}},{...p,movement:{confirmed:true,bodies:[{actorId:'a',heightM:0},{actorId:'b',heightM:2}]}}]) assert.throws(()=>calculateRound(w,c,data,'bad-move'),/Мастер должен/)
  w.campaign.scenes.scenes[0].tokens=w.campaign.scenes.scenes[0].tokens.filter(t=>t.actorId!=='a')
  assert.throws(()=>calculateRound(w,c,{...p,movement:{confirmed:true,bodies:[{actorId:'b',heightM:2}]}},'no-token'),/размести героя/)
  const first=calculateRound(before,c,p,'stored-move'),next={...motionInput([],['b']),continuations:[{actorId:'a',mode:'continue',budgetMs:1000}]}
  ownToken(first.world).x+=1;assert.throws(()=>calculateRound(first.world,{...collection([]),id:'next'},next,'relocated'),/Позиция или диаметр/)
  ownToken(first.world).x-=1;ownToken(first.world).diameter=2;assert.throws(()=>calculateRound(first.world,{...collection([]),id:'next'},next,'resized'),/Позиция или диаметр/)
})
test('Движение: стена проверяется по всему пути и диаметру, включая скруглённые углы',()=>{
  const w=motionWorld(location(2,5)),s=w.campaign.scenes.scenes[0];s.objects.push({...scenes.sceneObject('wall','wall',location(5,5)),width:1,depth:2,height:3})
  const before=structuredClone(w),c=collection([entry('a',[move([location(8,5)])])]),p=motionInput([timing('a',[1000])])
  assert.throws(()=>calculateRound(w,c,p,'through-wall'),/препятствие/);assert.deepEqual(w,before)
  ownToken(w).y=6.25;c.entries[0].actions[0].route=[location(8,6.25)]
  assert.throws(()=>calculateRound(w,c,p,'body-radius'),/препятствие/)
  // Near a box corner, the circle fits although a square inflation would block it.
  s.objects=[{...scenes.sceneObject('wall','corner',location(5,5)),width:1,depth:1,height:3}]
  ownToken(w).x=4.1;ownToken(w).y=4.1;c.entries[0].actions[0].route=[location(4.14,4.14)]
  assert.doesNotThrow(()=>calculateRound(w,c,p,'round-corner'))
})
test('Движение: высота тела проверяет пролёт над препятствием и под потолком',()=>{
  const w=motionWorld(location(2,5,4)),s=w.campaign.scenes.scenes[0];s.objects.push({...scenes.sceneObject('wall','low-wall',location(5,5)),width:1,depth:2,height:3})
  const c=collection([entry('a',[move([location(8,5,4)],'air')])]),p=motionInput([timing('a',[1000])])
  const over=calculateRound(w,c,p,'over-wall');assert.equal(ownToken(over.world).z,4);assert.equal(ownToken(over.world).support.kind,'air')
  s.objects=[{...scenes.sceneObject('platform','ceiling',location(5,5,5)),width:5,depth:4,height:1,blocksMovement:true}]
  assert.throws(()=>calculateRound(w,c,p,'head-hit'),/препятствие/)
  p.movement.bodies[0].heightM=0.8;assert.doesNotThrow(()=>calculateRound(w,c,p,'under-ceiling'))
})
test('Движение: ходьба сохраняет платформу, а разрыв опоры и автоматический подъём блокируются',()=>{
  const w=motionWorld(location(2,5,2)),s=w.campaign.scenes.scenes[0];s.objects=[{...scenes.sceneObject('platform','support',location(5,5)),width:8,depth:4,height:2,blocksMovement:true}]
  ownToken(w).support={kind:'object',objectId:'support'}
  const c=collection([entry('a',[move([location(8,5,2)])])]),p=motionInput([timing('a',[1000])])
  assert.deepEqual(ownToken(calculateRound(w,c,p,'platform').world).support,{kind:'object',objectId:'support'})
  s.objects[0].width=3;ownToken(w).x=4;c.entries[0].actions[0].route=[location(8,5,2)]
  assert.throws(()=>calculateRound(w,c,p,'unsupported-edge'),/опор/)
  c.entries[0].actions[0].route=[location(8,5,0)];assert.throws(()=>calculateRound(w,c,p,'jump-not-guessed'),/на одной высоте/)
})
test('Движение: промежуточный разрыв между платформами не скрывается корректными конечными точками',()=>{
  const w=motionWorld(location(2,5,2)),s=w.campaign.scenes.scenes[0]
  s.objects=[{...scenes.sceneObject('platform','left',location(2,5)),width:2,depth:4,height:2,blocksMovement:true},{...scenes.sceneObject('platform','right',location(8,5)),width:2,depth:4,height:2,blocksMovement:true}]
  ownToken(w).support={kind:'object',objectId:'left'}
  assert.throws(()=>calculateRound(w,collection([entry('a',[move([location(8,5,2)])])]),motionInput([timing('a',[1000])]),'platform-gap'),/без опоры/)
})
test('Движение: тела пересекаются по общему времени; разное время и высота допускаются',()=>{
  const w=motionWorld(location(2,5),location(5,2)),c=collection([entry('a',[move([location(8,5)])]),entry('b',[move([location(5,8)])])]),p=motionInput([timing('a',[1000]),timing('b',[1000])],[])
  assert.throws(()=>calculateRound(w,c,p,'crossing'),/пересекаются в одно время/)
  p.timings[1].costs[0].personalMs=250;assert.doesNotThrow(()=>calculateRound(w,c,p,'different-times'))
  p.timings[1].costs[0].personalMs=1000;w.campaign.scenes.scenes[0].tokens[1].z=4;w.campaign.scenes.scenes[0].tokens[1].support={kind:'air'};c.entries[1].actions[0]=move([location(5,8,4)],'air')
  assert.doesNotThrow(()=>calculateRound(w,c,p,'different-heights'))
})
test('Движение: стоящий персонаж и обмен местами не разрешают прохождение сквозь тело',()=>{
  const w=motionWorld(location(2,5),location(5,5)),c=collection([entry('a',[move([location(8,5)])])]),p=motionInput([timing('a',[1000])])
  assert.throws(()=>calculateRound(w,c,p,'stationary-body'),/пересекаются в одно время/)
  c.entries.push(entry('b',[move([location(2,5)])]));c.entries[0].actions[0].route=[location(5,5)];p.timings.push(timing('b',[1000]));p.missingDecisions=[]
  assert.throws(()=>calculateRound(w,c,p,'swap-bodies'),/пересекаются в одно время/)
})
test('Движение: дверь учитывает момент открытия; закрытие на теле блокируется',()=>{
  const w=motionWorld(location(2,5)),s=w.campaign.scenes.scenes[0];s.objects=[{...scenes.sceneObject('door','door',location(5,5)),width:1,depth:2,height:3}]
  const c=collection([entry('a',[door('open'),move([location(8,5)])])]),p=motionInput([{actorId:'a',entryRevision:1,budgetMs:1000,costs:[{index:0,personalMs:100},{index:1,personalMs:500}]}])
  assert.doesNotThrow(()=>calculateRound(w,c,p,'open-before-walk'))
  c.entries[0].actions=[move([location(8,5)]),door('open')];c.entries[0].resolved=[{index:1,objectId:'door'}];p.timings[0].costs=[{index:0,personalMs:500},{index:1,personalMs:100}]
  assert.throws(()=>calculateRound(w,c,p,'open-too-late'),/препятствие/)
  s.objects[0].open=true;c.entries[0].actions=[move([location(5,5)]),door('close')]
  assert.throws(()=>calculateRound(w,c,p,'close-on-body'),/Закрытие двери/)
})
test('Движение: готовое движение не теряет метаданные в копии/архиве и не раскрывает их игроку',async()=>{
  const w=motionWorld(),r=calculateRound(w,collection([entry('a',[move([location(8,2)])])]),motionInput([timing('a',[2000])]),'copy-motion')
  const work=await module('roundWork'),backup=await module('lobbyBackup'),schema=await module('rpgSchema')
  const saved=r.world.campaign.roundWork;assert(work.isRoundWork(saved))
  const copy=schema.copyCampaign(r.world.campaign);assert.deepEqual(copy.roundWork,saved);copy.roundWork.entries[0].movement.start.x=15;assert.equal(saved.entries[0].movement.start.x,2)
  const privateView=JSON.stringify(work.personalRoundWork(saved,['a']));assert(!privateView.includes('movement'));assert(!privateView.includes('Личный маршрут'));assert(!privateView.includes('route'))
  const text=backup.serializeLobbyBackup(r.world,[{characterId:'a',ownerId:'gm',approved:true},{characterId:'b',ownerId:'gm',approved:true}],[{id:'gm',displayName:'Мастер'}])
  assert(text.includes('movement'))
})
test('Движение: неизвестные поля и старый частичный маршрут без исходной позиции не угадываются',async()=>{
  const w=motionWorld(),r=calculateRound(w,collection([entry('a',[move([location(8,2)])])]),motionInput([timing('a',[2000])]),'bad-snapshot'),work=await module('roundWork')
  const saved=r.world.campaign.roundWork.entries[0]
  for(const mutate of [e=>e.movement.start.secret='hidden',e=>e.movement.diameter=0,e=>e.movement.start.x=Infinity,e=>e.movement.extra=true,e=>e.action=wait(1)]) {
    const e=structuredClone(saved);mutate(e);assert.equal(work.isRoundWorkEntry(e),false)
  }
  delete saved.movement
  assert.throws(()=>calculateRound(r.world,{...collection([]),id:'next'},{...motionInput([],['b']),continuations:[{actorId:'a',mode:'continue',budgetMs:1000}]},'legacy-incomplete'),/нет начальной позиции/)
})


test('Движение: существующие ограничения ног и скорости блокируют ходьбу без изменения источника',()=>{
  const c=collection([entry('a',[move([location(8,2)])])]),p=motionInput([timing('a',[1000])])
  const w=motionWorld()
  for(const part of ['leftLeg','rightLeg']) Object.assign(w.characters[0].body.parts[part],{maximum:100,current:0})
  const before=structuredClone(w)
  assert.throws(()=>calculateRound(w,c,p,'disabled-legs'),/не позволяют ходьбу/);assert.deepEqual(w,before)
  const slow=motionWorld();slow.characters[0].statistics.movement='0';slow.characters[0].rpg.formulas=slow.characters[0].rpg.formulas.filter(f=>f.parameter!=='movement')
  assert.throws(()=>calculateRound(slow,c,p,'zero-speed'),/не позволяют ходьбу/)
})
test('Движение: полёт без крыльев требует основания; здоровые крылья используют прежние правила',async()=>{
  const w=motionWorld(),c=collection([entry('a',[move([location(8,2,4)],'air')])]),p=motionInput([timing('a',[1000])])
  delete p.movement.bodies[0].flightReason
  assert.throws(()=>calculateRound(w,c,p,'no-flight'),/явное основание/)
  for(const invalid of [123,'x'.repeat(2001)]) {p.movement.bodies[0].flightReason=invalid;assert.throws(()=>calculateRound(w,c,p,'bad-reason'),/подтвердить возможность/)}
  p.movement.bodies[0].flightReason='Подтверждённый магический полёт'
  assert.deepEqual(calculateRound(w,c,p,'magic-flight').summary.movementApprovals,[{actorId:'a',reason:p.movement.bodies[0].flightReason}])
  delete p.movement.bodies[0].flightReason
  const {createDetailedAnatomy}=await module('anatomyModel'),{bodyConsequences}=await module('characterBody'),body=w.characters[0].body
  for(const key of ['leftWing','rightWing']) body.parts[key]={...structuredClone(body.parts.leftArm),maximum:100,current:100}
  body.anatomy=createDetailedAnatomy('winged',Object.keys(body.parts))
  assert.equal(bodyConsequences(body).canFly,true)
  assert.equal(ownToken(calculateRound(w,c,p,'wings-flight').world).z,4)
  body.parts.leftWing.current=0
  assert.throws(()=>calculateRound(w,c,p,'broken-flight'),/явное основание/)
})

test('Состояния настольных объектов: замок, открытие, свет и ловушки исполняются в точном порядке и атомарно',async()=>{
 const {createTabletopObject}=await module('tabletopCatalog')
 const w=world();w.campaign.scenes.scenes[0].objects=[createTabletopObject('timber-door','door',{x:3,y:3,z:0})]
 w.campaign.scenes.scenes[0].objects[0].locked=true
 const before=structuredClone(w),unlockThenOpen=collection([entry('a',[door('unlock')]),entry('b',[door('open')])])
 const opened=calculateRound(w,unlockThenOpen,input([timing('a',[100]),timing('b',[200])]),'unlock-open')
 assert.equal(opened.world.campaign.scenes.scenes[0].objects[0].open,true);assert.equal(opened.world.campaign.scenes.scenes[0].objects[0].locked,false)
 assert.deepEqual(opened.summary.events.map(e=>[e.kind,e.atMs]),[['unlock',amount(1000)],['open',amount(2000)]])
 assert.deepEqual(w,before)
 assert.throws(()=>calculateRound(w,collection([entry('a',[door('open')])]),input([timing('a',[100])],['b']),'locked'),/заперт/)
 for(const [asset,operation,expected] of [['candle','extinguish',false],['candle','ignite',true],['trap-fire','activate',true],['trap-spikes','deactivate',false],['chest','open',true]]){
  w.campaign.scenes.scenes[0].objects=[createTabletopObject(asset,'door',{x:3,y:3,z:0})]
  const result=calculateRound(w,collection([entry('a',[door(operation)])]),input([timing('a',[100])],['b']),'operation-'+asset)
  assert.equal(result.world.campaign.scenes.scenes[0].objects[0][operation==='open'?'open':'active'],expected)
  assert.equal(result.summary.events[0].kind,operation);assert.equal(result.world.campaign.seconds,10)
 }
 w.campaign.scenes.scenes[0].objects=[createTabletopObject('table','door',{x:3,y:3,z:0})]
 assert.throws(()=>calculateRound(w,collection([entry('a',[door('open')])]),input([timing('a',[100])],['b']),'table-open'),/не поддерживает/)
})
test('Перенос мебели: цель копируется, частичная работа не телепортирует, завершение переносит опору и соблюдает границы',async()=>{
 const {createTabletopObject}=await module('tabletopCatalog'),{isDeclaredAction,copyDeclaredAction}=await module('actionDeclarations')
 const w=world(),s=w.campaign.scenes.scenes[0],table=createTabletopObject('table','door',{x:4,y:4,z:0});s.objects=[table]
 s.tokens=[{actorId:'b',x:4,y:4,z:table.height,diameter:.5,support:{kind:'object',objectId:table.id}}]
 const action={...door('relocate'),destination:{x:7,y:6,z:0}},copy=copyDeclaredAction(action)
 assert(isDeclaredAction(action));action.destination.x=8;assert.equal(copy.destination.x,7)
 assert(!isDeclaredAction({...action,destination:{x:Infinity,y:0,z:0}}));assert(!isDeclaredAction({...door('open'),destination:{x:1,y:1,z:0}}))
 const before=structuredClone(w),c=collection([entry('a',[copy])]),first=calculateRound(w,c,input([timing('a',[2000])],['b']),'furniture-part')
 assert.deepEqual(w,before);assert.equal(first.world.campaign.scenes.scenes[0].objects[0].x,4)
 const second=calculateRound(first.world,{...collection([]),id:'finish'},{...input([],['b']),continuations:[{actorId:'a',mode:'continue',budgetMs:1000}]},'furniture-finish')
 const moved=second.world.campaign.scenes.scenes[0];assert.equal(moved.objects[0].x,7);assert.equal(moved.tokens[0].x,7);assert.equal(moved.tokens[0].y,6);assert.equal(moved.tokens[0].z,table.height)
 assert.equal(second.summary.events[0].kind,'relocate')
 const bad={...copy,destination:{x:1e7,y:6,z:0}}
 assert.throws(()=>calculateRound(w,collection([entry('a',[bad])]),input([timing('a',[100])],['b']),'outside'));assert.deepEqual(w,before)
})
