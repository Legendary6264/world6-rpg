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
const { physicsMaterialPreset } = await module('physicsMaterials')
const { advanceWaterFlow } = await module('waterFlow')
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
const terrainInput = ms => motionInput([timing('a',[ms],10000)])
test('Запись исполнения сохраняет поворот фактического маршрута и не меняет движение или источник',()=>{
 const w=motionWorld(),before=structuredClone(w),c=collection([entry('a',[move([location(4,2),location(4,4)])])])
 const result=calculateRound(w,c,motionInput([timing('a',[4000],10000)]),'presentation-route')
 assert.deepEqual(w,before);assert.equal(result.world.campaign.seconds,10)
 assert.deepEqual(['x','y','z'].map(k=>ownToken(result.world)[k]),[4,4,0])
 const traces=result.summary.presentationMotions;assert(traces.length>=2)
 assert(traces.every(t=>t.actorId==='a'&&t.endMs>t.startMs));assert(traces.some(t=>t.to.x===4&&t.to.y===2))
 assert(traces.some(t=>t.from.x===4&&t.from.y===2&&t.to.y===4))
})
const terrainRound = action => collection([entry('a',[action])])
const terrainBody = (extra={}) => ({
  version:1,material:physicsMaterialPreset('steel'),massKg:40,temperatureK:293.15,wetnessFraction:0,...extra,
})
const terrainEnvironment = (extra={}) => ({version:1,gravityMs2:10,ambientTemperatureK:293.15,...extra})
const basin = (id='pool',x=6,width=6,height=3) => ({
  ...scenes.sceneObject('water',id,location(x,4)),width,depth:4,height,blocksMovement:false,canSupport:false,
  water:{version:1,base:'pure',saltKg:0,sedimentKg:0},
})
function aquaticWorld(from=location(2,4),breathSeconds=4) {
  const w=motionWorld(from), scene=w.campaign.scenes.scenes[0]
  scene.physics=terrainEnvironment({aquatics:{version:1,swimSpeedMs:1.25,breathSeconds}})
  scene.objects=[basin()]
  return {w,scene}
}
const inWater=(w,objectId='pool')=>{ownToken(w).support={kind:'water',objectId,heightM:2}}
const waitRound=(w,seconds,seed)=>calculateRound(w,{...terrainRound(wait(seconds)),id:seed,durationSeconds:seconds},input([timing('a')],['b']),seed)
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-5,`${actual} ≈ ${expected}`)

test('Плавание с берега, задержка дыхания между раундами, всплытие и выход',()=>{
  const {w}=aquaticWorld(), route=terrainRound(move([location(5,4)],'swim')), p=terrainInput(3000)
  const before=structuredClone(w), dive=calculateRound(w,route,p,'dive-entry'), actor=dive.world.characters[0]
  assert.deepEqual(w,before)
  assert.deepEqual(ownToken(dive.world).support,{kind:'water',objectId:'pool',heightM:2})
  assert(scenes.isSceneState(dive.world.campaign.scenes))
  assert.equal(dive.summary.movements[0].terrain.kind,'swim')
  near(dive.summary.breathing[0].underwaterSeconds,9)
  near(actor.body.breathUsedSeconds,4);near(actor.body.exposure.oxygen,2)
  const parked=waitRound(dive.world,4,'wait-underwater')
  near(parked.summary.breathing[0].underwaterSeconds,4);near(parked.world.characters[0].body.exposure.oxygen,3.6)
  const rise=calculateRound(parked.world,{...terrainRound(move([location(5,4,2)],'swim')),id:'rise'},terrainInput(2500),'rise')
  near(rise.summary.breathing[0].underwaterSeconds,1.55)
  assert.equal(rise.world.characters[0].body.breathUsedSeconds,null)
  assert.equal(ownToken(rise.world).support.kind,'water')
  const exit=calculateRound(rise.world,{...terrainRound(move([location(5,4),location(2,4)],'swim')),id:'shore'},terrainInput(7500),'shore')
  assert.deepEqual(ownToken(exit.world).support,{kind:'ground'})
  assert.equal(ownToken(exit.world).x,2)
  assert.throws(()=>calculateRound(w,terrainRound(move([location(5,4)])),p,'walk-deep'),/слишком глубоко/)
})

test('Плавание: соседние ячейки, непрерывная глубина и точный перенос незаконченного маршрута',()=>{
  const {w,scene}=aquaticWorld(location(4.5,4,1),30)
  scene.objects=[basin('left',5,2),basin('right',7,2)];inWater(w,'left')
  const route=terrainRound(move([location(7.5,4,1)],'swim')), p=terrainInput(12000)
  const first=calculateRound(w,route,p,'swim-partial')
  assert.equal(first.summary.movements[0].completed,false)
  near(ownToken(first.world).x,7);assert.equal(ownToken(first.world).support.objectId,'right')
  const copied=scenes.copySceneState(first.world.campaign.scenes)
  assert.deepEqual(copied,first.world.campaign.scenes)
  const continuation={...motionInput([],['b']),continuations:[{actorId:'a',mode:'continue',budgetMs:10000}]}
  const next={...collection([]),id:'swim-next'}
  const resumed=calculateRound(first.world,next,continuation,'swim-next')
  assert.equal(ownToken(resumed.world).x,7.5);assert.equal(resumed.world.campaign.roundWork.entries.length,0)
  const changed=structuredClone(continuation);changed.movement.bodies[0].heightM=1.9
  assert.throws(()=>calculateRound(first.world,next,changed,'swim-height'),/Высота тела изменилась/)
  scene.objects[1].x=8
  const before=structuredClone(w)
  assert.throws(()=>calculateRound(w,route,p,'swim-gap'),/участок без воды/);assert.deepEqual(w,before)
})

test('Два пловца сталкиваются на одной глубине и расходятся на разных уровнях',()=>{
  const {w,scene}=aquaticWorld(location(4,4),30);inWater(w)
  const other=scene.tokens[1]
  Object.assign(other,location(8,4),{support:{kind:'water',objectId:'pool',heightM:2}})
  const round=collection([entry('a',[move([location(8,4)],'swim')]),entry('b',[move([location(4,4)],'swim')])])
  const p=motionInput([timing('a',[5000],10000),timing('b',[5000],10000)],[])
  const before=structuredClone(w)
  assert.throws(()=>calculateRound(w,round,p,'swimmer-collision'),/пересекаются в одно время/)
  assert.deepEqual(w,before)
  other.z=2;round.entries[1].actions[0].route[0].z=2
  const pass=calculateRound(w,round,p,'different-depths')
  assert.equal(ownToken(pass.world).x,8)
  assert.equal(pass.summary.breathing.length,1)
  assert.throws(()=>scenes.replaceScene(w.campaign.scenes,{...scene,physics:{...scene.physics,aquatics:null}}),/Перед отключением плавания/)
})

test('Плавание проверяет тело, скорость и ледяную преграду',async()=>{
  const {w,scene}=aquaticWorld(location(5,4));inWater(w)
  for(const key of ['leftLeg','rightLeg']) Object.assign(w.characters[0].body.parts[key],{maximum:10,current:0})
  const route=terrainRound(move([location(5.5,4)],'swim'))
  assert.throws(()=>calculateRound(w,route,terrainInput(200),'swim-too-fast'),/Доступная скорость плавания/)
  assert.doesNotThrow(()=>calculateRound(w,route,terrainInput(2000),'swim-arms-only'))
  assert.throws(()=>calculateRound(w,terrainRound(move([location(2,4)],'swim')),terrainInput(6000),'disabled-shore'),/для выхода на сушу/)
  const {FUSION_J_KG}=await module('waterPhysics')
  scene.objects[0].water.enthalpyJKg=FUSION_J_KG
  assert.doesNotThrow(()=>calculateRound(w,route,terrainInput(2000),'liquid-check'))
  const frozen=aquaticWorld();frozen.scene.objects[0].water.enthalpyJKg=0
  assert.throws(()=>calculateRound(frozen.w,terrainRound(move([location(5,4)],'swim')),terrainInput(6000),'swim-ice'),/воде достаточной глубины/)
  assert.throws(()=>calculateRound(frozen.w,terrainRound(move([location(5,4)])),terrainInput(6000),'walk-into-ice'),/препятствие/)
})

test('При выходе из воды тонкий лёд на берегу ограничивает сцепление',()=>{
  const {w,scene}=aquaticWorld(location(5,4),30);inWater(w)
  const actor=w.characters[0]
  actor.statistics.movement='1.5';actor.rpg.formulas=actor.rpg.formulas.filter(f=>f.parameter!=='movement')
  scene.physics.traction={version:1,waterFactor:.6,iceFactor:.1}
  const film=basin('icy-shore',2,.8,.03);film.water.enthalpyJKg=0;scene.objects.push(film)
  const route=terrainRound(move([location(2,4)],'swim'))
  assert.throws(()=>calculateRound(w,route,terrainInput(4000),'fast-icy-shore'),/Сцепление/)
  const safe=calculateRound(w,route,terrainInput(8000),'safe-icy-shore')
  assert.equal(ownToken(safe.world).support.kind,'ground')
  assert(safe.summary.traction.walks.some(t=>t.objectId==='icy-shore'&&t.kind==='ice'))
})

test('Погружение учитывает рабочие жабры и не раскрывает несостоявшуюся реплику',async()=>{
  const {w}=aquaticWorld(location(5,4));inWater(w)
  const {applyRace}=await module('characterPresets'), {breathesUnderwater}=await module('characterBody')
  const sea={...applyRace(w.characters[0],'marine'),id:'a'}
  assert(breathesUnderwater(sea.body))
  const aquatic={...w,characters:[sea,w.characters[1]]}
  const held=waitRound(aquatic,10,'gills')
  near(held.summary.breathing[0].underwaterSeconds,10);assert.equal(held.world.characters[0].body.breathUsedSeconds,undefined)
  for(const organ of sea.body.anatomy.structures.filter(s=>s.functionGroup==='waterBreathing')) organ.current=0
  assert(!breathesUnderwater(sea.body))
  assert.equal(waitRound(aquatic,10,'damaged-gills').world.characters[0].body.breathUsedSeconds,4)
  const speech={kind:'speak',text:'СЕКРЕТНАЯ РЕПЛИКА',volume:'normal',target:{kind:'none'},note:''}
  const inputWithSpeech={...input([timing('a',[1000],10000)],['b']),speech:[{
    key:'new:a:0',confirmed:true,reason:'Герой находится рядом',recordedAt:'2026-11-10T00:00:00.000Z',
    hearers:[{actorId:'b',clarity:'clear',speaker:'Голос',fragment:'',signs:''}],
  }]}
  const outcome=calculateRound(w,terrainRound(speech),inputWithSpeech,'speech-underwater')
  assert.equal(outcome.summary.speech[0].interruption,'underwater')
  assert.deepEqual(outcome.summary.speech[0].heard,[])
  assert(!JSON.stringify(outcome.world.characters[1].journal).includes(speech.text))
})

test('Под водой голосовая способность проверяет возможность речи при подготовке',async()=>{
  const {w}=aquaticWorld(location(5,4));inWater(w)
  const {emptyAbility}=await module('rpgSchema')
  w.characters[0].rpg.abilities.push({...emptyAbility(),id:'voice',templateId:'voice-test',name:'Голос',speech:true,approved:true})
  const action={kind:'ability',stage:'prepare',abilityId:'voice',target:{kind:'none'},note:''}
  const d={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',
    gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
  const p={...input([timing('a',[1000],10000)],['b']),rules:[{key:'new:a:0',kind:'ability',confirmed:true,binding:'unbound',charge:'',input:d}]}
  const before=structuredClone(w)
  assert.throws(()=>calculateRound(w,terrainRound(action),p,'voice-underwater'),/голосовой способности/)
  assert.deepEqual(w,before)
  ownToken(w).z=2
  assert(calculateRound(w,terrainRound(action),p,'voice-above-water').summary.events.some(e=>e.kind==='ready'))
})

test('При нырянии жидкость касается погружённых областей тела',async()=>{
  const {w,scene}=aquaticWorld(location(5,4,2));inWater(w)
  const {defaultContactHazards}=await module('contactProfiles')
  scene.physics.contactHazards={...defaultContactHazards,acidMolarSecondsPerHp:.0001}
  scene.objects[0].water.reagentMol=10
  for(const key of ['head','torso','leftFoot','leftHand']) Object.assign(w.characters[0].body.parts[key],{maximum:20,current:20})
  const shallow=waitRound(w,1,'surface-contact')
  assert(shallow.summary.contacts.some(c=>c.region==='leftFoot'&&c.kind==='acid'&&c.damage>0))
  assert(!shallow.summary.contacts.some(c=>['head','torso'].includes(c.region)))
  ownToken(w).z=0
  const deep=waitRound(w,1,'submerged-contact')
  assert(deep.summary.contacts.some(c=>c.region==='head'&&c.kind==='acid'&&c.damage>0))
})

test('После снижения уровня воды персонаж теряет водную опору и приземляется в следующем интервале',()=>{
  const {w,scene}=aquaticWorld(location(4,4,.2));inWater(w,'upstream')
  scene.objects=[basin('upstream',4,2,1),basin('downstream',6,2,0)]
  for(const object of scene.objects) object.water.flow=true
  const drain=waitRound(w,10,'flow-releases-swimmer')
  assert(drain.summary.water.supports.some(s=>s.actorId==='a'&&s.lostSupport))
  assert.equal(ownToken(drain.world).support.kind,'air')
  assert.equal(ownToken(drain.world).fall.sourceId,'upstream')
  const landed=waitRound(drain.world,2,'swimmer-landing')
  assert.equal(ownToken(landed.world).support.kind,'ground')
  assert(scenes.isSceneState(landed.world.campaign.scenes))
})

test('Прыжок над препятствием использует дугу, точное время, удар о землю и звук',()=>{
  const w = motionWorld(location(2,4)), s = w.campaign.scenes.scenes[0]
  s.physics = terrainEnvironment({eventSounds:true})
  s.objects = [{...scenes.sceneObject('wall','curb',location(2.75,4)),width:.1,depth:1,height:.12}]
  ownToken(w).landing = {massKg:60,region:'leftFoot',contactCm2:100}
  w.characters[0].rpg.impact.leftFoot = {thresholdJ:1,joulesPerHp:100,referenceCm2:100}
  const plan = terrainRound(move([location(3.5,4)],'jump')), p = terrainInput(600), before = structuredClone(w)
  p.soundRecordedAt='2026-11-10T00:00:00.000Z'
  delete p.movement.bodies[0].flightReason
  const result = calculateRound(w,plan,p,'jump-curb')
  const [route] = result.summary.movements, [landing] = result.summary.falls.landings
  assert.equal(route.terrain.kind,'jump')
  assert(Math.abs(route.terrain.apexZ-.45)<1e-10)
  assert.deepEqual(landing.atMs,amount(600));assert.equal(landing.cause,'jump')
  assert(Math.abs(landing.speedMs-3)<1e-10);assert(Math.abs(landing.impact.energyJ-270)<1e-9)
  assert.equal(landing.impact.status,'applied');assert(landing.impact.damage>0)
  assert(result.summary.sounds.some(sound=>sound.kind==='landing' && sound.atMs.numerator==='600'))
  assert.deepEqual(route.support,{kind:'ground'});assert.equal(ownToken(result.world).x,3.5)
  assert.deepEqual(w,before)
  assert.throws(()=>calculateRound(w,terrainRound(move([location(3.5,4)])),p,'walk-curb'),/препятствие/)
  // The curve enters an overhead slab even though the straight chord misses it.
  s.objects.push({...scenes.sceneObject('wall','ceiling',location(2.75,4,2.25)),width:.18,depth:2,height:.15})
  assert.throws(()=>calculateRound(w,plan,p,'jump-ceiling'),/препятствие/)
})

test('Прыжок учитывает текущую высоту другого героя и столкновение двух дуг',()=>{
  const w = motionWorld(location(2,4),location(2.75,4)), [a,b] = w.campaign.scenes.scenes[0].tokens
  a.diameter=.3;b.diameter=.3
  const plan = terrainRound(move([location(3.5,4)],'jump')), p = terrainInput(600)
  p.movement.bodies[1].heightM=.3
  assert.equal(ownToken(calculateRound(w,plan,p,'clear-small-body').world).x,3.5)
  p.movement.bodies[1].heightM=.5
  assert.throws(()=>calculateRound(w,plan,p,'hit-small-body'),/пересекаются в одно время/)
  b.x=3.5
  plan.entries.push(entry('b',[wait(.2),move([location(2,4)],'jump')]))
  p.timings.push({actorId:'b',entryRevision:1,budgetMs:10000,costs:[{index:1,personalMs:600}]})
  p.missingDecisions=[]
  assert.throws(()=>calculateRound(w,plan,p,'crossing-arcs'),/пересекаются в одно время/)
})

test('Прыжок пересекается с уже падающим персонажем до его приземления',()=>{
  const w=motionWorld(location(2,4),location(2.75,4,2)),s=w.campaign.scenes.scenes[0]
  s.physics=terrainEnvironment()
  const [jumper,falling]=s.tokens
  jumper.diameter=.3;falling.diameter=.3;falling.fall={sourceId:'removed',fromZ:2,speedMs:4}
  const p=terrainInput(600),plan=terrainRound(move([location(3.5,4)],'jump'))
  p.movement.bodies[0].heightM=1;p.movement.bodies[1].heightM=.35
  const before=structuredClone(w)
  assert.throws(()=>calculateRound(w,plan,p,'hit-falling-actor'),/пересекаются в одно время/)
  assert.deepEqual(w,before)
  falling.y=4.5
  const clear=calculateRound(w,plan,p,'beside-falling-actor')
  assert.equal(clear.summary.falls.landings.length,2)
})

test('Прыжок между опорами проверяет гравитацию, ноги, время и точку приземления',()=>{
  const w = motionWorld(location(2,4,1)), s = w.campaign.scenes.scenes[0]
  const platform=(id,x)=>({...scenes.sceneObject('platform',id,location(x,4)),width:.75,depth:1.2,height:1,canSupport:true,blocksMovement:true})
  s.objects=[platform('start',2),platform('goal',3.8)]
  s.physics=terrainEnvironment()
  Object.assign(ownToken(w),{diameter:.35,support:{kind:'object',objectId:'start'}})
  const plan=terrainRound(move([location(3.8,4,1)],'jump')), p=terrainInput(650)
  const result=calculateRound(w,plan,p,'gap')
  assert.deepEqual(ownToken(result.world).support,{kind:'object',objectId:'goal'})
  assert.throws(()=>calculateRound(w,terrainRound(move([location(3.8,4,1)])),p,'no-bridge'),/без опоры/)
  assert.throws(()=>calculateRound(w,plan,terrainInput(11000),'jump-over-round'),/целиком помещаться/)
  const wounded=structuredClone(w);Object.assign(wounded.characters[0].body.parts.leftLeg,{maximum:100,current:0})
  assert.throws(()=>calculateRound(wounded,plan,p,'one-leg'),/не позволяют оттолкнуться/)
  s.physics.gravityMs2=0
  assert.throws(()=>calculateRound(w,plan,p,'zero-gravity'),/не дают дугу/)
  s.physics.gravityMs2=10;s.objects.pop()
  assert.throws(()=>calculateRound(w,plan,p,'no-landing'),/нет опоры/)
})

test('Прыжок вниз: падение даёт большую скорость удара, а вода ограничивает отрыв и приземление',()=>{
  const w=motionWorld(location(2,4,.4)),s=w.campaign.scenes.scenes[0]
  w.characters[0].statistics.movement='1.5'
  w.characters[0].rpg.formulas=w.characters[0].rpg.formulas.filter(f=>f.parameter!=='movement')
  const pad={...scenes.sceneObject('platform','pad',location(2,4)),width:.8,depth:2,height:.4,canSupport:true,blocksMovement:true,physics:terrainBody()}
  s.objects=[pad];s.physics=terrainEnvironment({traction:{version:1,waterFactor:.25,iceFactor:.15}})
  Object.assign(ownToken(w),{diameter:.35,support:{kind:'object',objectId:'pad'}})
  const plan=terrainRound(move([location(3.6,4)],'jump')), p=terrainInput(700)
  const [landing]=calculateRound(w,plan,p,'downward-jump').summary.falls.landings
  assert(landing.speedMs>4)
  pad.physics.wetnessFraction=1
  assert.throws(()=>calculateRound(w,plan,p,'slippery-takeoff'),/сцепления для такого отрыва/)
  pad.physics.wetnessFraction=0
  s.objects.push({...scenes.sceneObject('water','wet-floor',location(3.6,4)),width:.6,depth:1,height:.03,
    water:{version:1,base:'pure',saltKg:0,sedimentKg:0}})
  assert.throws(()=>calculateRound(w,plan,p,'slippery-landing'),/сцепления для устойчивого приземления/)
})

test('Подъём и спуск используют разрешённую грань, две руки и скорость с учётом мокрой поверхности',async()=>{
  const w=motionWorld(location(2.45,4)),s=w.campaign.scenes.scenes[0]
  const {defaultContactHazards} = await module('contactProfiles')
  const start=location(2.45,4), top=location(3.15,4,1.2)
  const ledge={...scenes.sceneObject('platform','ledge',location(4,4)),width:2,depth:2,height:1.2,canSupport:true,blocksMovement:true,
    physics:terrainBody({climbable:true})}
  s.objects=[ledge];s.physics=terrainEnvironment({traction:{version:1,waterFactor:.25,iceFactor:.15},
    contactHazards:{...defaultContactHazards,burnAboveK:320,heatKelvinSecondsPerHp:10}})
  const p=terrainInput(3000), plan=terrainRound(move([top],'climb'))
  const up=calculateRound(w,plan,p,'climb-up')
  assert.deepEqual(up.summary.movements[0].terrain,{kind:'climb',objectId:'ledge'})
  assert.deepEqual(ownToken(up.world).support,{kind:'object',objectId:'ledge'})
  const down=calculateRound(up.world,{...terrainRound(move([start],'climb')),id:'down'},p,'climb-down')
  assert.deepEqual(ownToken(down.world).support,{kind:'ground'});assert.equal(ownToken(down.world).x,start.x)
  const injured=structuredClone(w);Object.assign(injured.characters[0].body.parts.leftHand,{maximum:100,current:0})
  assert.throws(()=>calculateRound(injured,plan,p,'no-grip'),/две работающие руки/)
  assert.throws(()=>calculateRound(w,terrainRound(move([location(3.15,4.2,1.2)],'climb')),p,'wrong-face'),/той же гранью/)
  ledge.physics.wetnessFraction=1
  assert.throws(()=>calculateRound(w,plan,p,'wet-climb'),/больше времени/)
  ledge.physics.wetnessFraction=0;ledge.physics.temperatureK=326
  const hot=calculateRound(w,plan,p,'hot-climb')
  assert(hot.summary.contacts.filter(row=>row.region.endsWith('Hand')).every(row=>row.kind==='heat'&&row.damage===1))
  assert.equal(hot.summary.contacts.filter(row=>row.region.endsWith('Hand')).length,2)
  ledge.physics.climbable=null
  assert.throws(()=>calculateRound(w,plan,p,'no-anchor'),/разрешён подъём/)
})
function slidingBox(x, friction) {
  return { ...scenes.sceneObject('crate','sliding-box',location(x,5)),name:'Скользящий ящик',width:1,depth:1,height:1,
    physics:{version:1,material:physicsMaterialPreset('wood'),massKg:10,temperatureK:293.15,wetnessFraction:0,
      sliding:{dryFriction:friction,wetFriction:null,impactTransfer:1,vxMs:3,vyMs:0}} }
}
test('Скольжение и ходьба: пересекающийся маршрут блокирует расчёт, соседний проходит',()=>{
  const w=motionWorld(location(6,2)),scene=w.campaign.scenes.scenes[0]
  scene.physics={version:1,gravityMs2:10,ambientTemperatureK:293.15}
  scene.objects=[slidingBox(4,.2)]
  const plan=target=>collection([entry('a',[move([target])])])
  const p=motionInput([timing('a',[200])]),before=structuredClone(w)
  assert.throws(()=>calculateRound(w,plan(location(6,8)),p,'cross-slide'),/препятствие «Скользящий ящик»/)
  assert.deepEqual(w,before)
  ownToken(w).x=9
  const beside=calculateRound(w,plan(location(9,8)),p,'beside-slide')
  assert.deepEqual({x:ownToken(beside.world).x,y:ownToken(beside.world).y},{x:9,y:8})
  assert.equal(beside.summary.slides.stops[0].point.x,6.25)
})
test('Скольжение и вода: разрушенная преграда пропускает поток с момента удара',()=>{
  const w=motionWorld(),scene=w.campaign.scenes.scenes[0],crate=slidingBox(3,0)
  const cell=(id,x,height)=>({...scenes.sceneObject('water',id,location(x,5)),width:2,depth:2,height,
    water:{version:1,base:'pure',saltKg:0,sedimentKg:0,flow:true}})
  const barrier={...scenes.sceneObject('wall','barrier',location(6,5)),width:.2,depth:2,height:2,
    physics:{version:1,material:physicsMaterialPreset('wood'),massKg:4,temperatureK:293.15,wetnessFraction:0,structure:{failureJ:1,absorbedJ:0}}}
  scene.objects=[crate,barrier,cell('source',5,.2),cell('sink',7,0)]
  const round={...collection([entry('a',[wait(1)])]),durationSeconds:1}
  const result=calculateRound(w,round,input([timing('a')],['b']),'slide-flow')
  const [stop]=result.summary.slides.stops,hitSeconds=Number(stop.atMs.numerator)/Number(stop.atMs.denominator)/1000
  assert(stop.impact.collapsed);assert(Math.abs(hitSeconds-.8)<2e-6)
  const reference=structuredClone(scene)
  reference.objects=reference.objects.filter(o=>o.id!=='barrier')
  reference.objects[0].x=stop.point.x
  advanceWaterFlow(reference,1-hitSeconds)
  const actual=result.world.campaign.scenes.scenes[0].objects.find(o=>o.id==='sink').height
  assert(actual>0);assert(Math.abs(actual-reference.objects.find(o=>o.id==='sink').height)<1e-10)
})
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
