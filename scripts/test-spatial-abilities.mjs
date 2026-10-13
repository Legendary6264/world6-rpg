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
  const js = ts.transpileModule(await readFile('src/' + file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g, (_, a, b) => a + '.mjs' + b)
  await writeFile(join(directory, file.replace(/\.ts$/, '.mjs')), js)
}
const module = name => import(pathToFileURL(join(directory, name + '.mjs')))
const {calculateRound}=await module('roundExecution'),{createDefaultCharacter}=await module('characterModel')
const {emptyCampaign,emptyAbility,isAbility,copyAbility,copyRpg,isRpg}=await module('rpgSchema'),{createScene,emptyScenes}=await module('scenes')
const {spatialTargets,isAbilitySpatial}=await module('abilitySpatial'),{copyDeclaredAction,isDeclaredAction}=await module('actionDeclarations')
const {advanceWorld,releaseSpatialRoundPlan,interruptCast,makeActionPlan,releaseRoundPlan}=await module('rpgEngine')
const fields={region:'torso',structureId:'',distanceM:999,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:10,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'SPATIAL-PRIVATE'}
const point=(kind='area',x=8,y=2,z=0)=>({kind,point:{x,y,z}})
const sphere=(radiusM=1)=>({shape:'sphere',includeCaster:false,radiusM})
function world(spatial=sphere()){
 const campaign={...emptyCampaign(),scenes:createScene(emptyScenes(),'scene','Scene','top')}
 const characters=['a','b','c','d'].map(id=>{const c={...createDefaultCharacter(),id,name:id};c.rpg.formulas=[];c.resources.mana={maximum:'50',current:'50'};c.statistics.energyRegeneration='0';Object.assign(c.body.parts.torso,{maximum:100,current:50});return c})
 campaign.scenes.scenes[0].tokens=[{actorId:'a',x:2,y:2,z:0},{actorId:'b',x:8,y:2,z:0},{actorId:'c',x:9,y:2,z:0},{actorId:'d',x:8,y:2,z:3}].map(t=>({...t,diameter:1,support:{kind:t.z?'air':'ground'}}))
 characters[0].rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'template',name:'Spatial',approved:true,spatial,mechanism:'effect',cost:{mana:7,shadow:0,stamina:0},preparation:123,rangeM:10,duration:30,modifiers:[{parameter:'movement',flat:3,percent:0}]}]
 return {campaign,characters}
}
const action=(stage,target={kind:'none'})=>({kind:'ability',abilityId:'spell',stage,target,note:''})
const entry=(actorId,actions)=>({actorId,actorName:actorId,revision:1,status:'submitted',actions,resolved:[],submittedBy:'gm',submittedAt:'2026-10-11T00:00:00Z',note:''})
const collection=(actions,id='collection',entries)=>({id,sceneId:'scene',sceneName:'Scene',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:['a','b','c','d'],entries:entries??[entry('a',actions)],history:[]})
const rule=(key='new:a:0',charge='')=>({key,kind:'ability',confirmed:true,binding:'unbound',charge,input:structuredClone(fields),spatialConfirmed:!!charge})
const params=(costs,rules)=>({timings:[{actorId:'a',entryRevision:1,budgetMs:5000,costs:costs.map((personalMs,index)=>({index,personalMs}))}],rules,continuations:[],interactionsConfirmed:false,missingDecisions:['b','c','d'].map(actorId=>({actorId,reason:'Решение мастера'}))})
const prepare=(w=world(),cost=1000)=>calculateRound(w,collection([action('prepare')]),params([cost],[rule()]),'spatial-prepare')
const release=(w,target=point(),patch={})=>{const cast=w.characters[0].rpg.casts[0];return calculateRound(w,collection([action('release',target)],'release'),params([1000],[{...rule('new:a:0','cast:'+cast.id),...patch}]),'spatial-release-'+w.campaign.revision)}
const both=(w=world(),target=point(),patch={})=>calculateRound(w,collection([action('prepare'),action('release',target)]),params([1000,1000],[rule(),{...rule('new:a:1','prepare:new:a:0'),...patch}]),'spatial-both')
test('Переигровка области: прежние броски остаются у своих целей при исчезновении ранней цели',()=>{
 const w=world();w.characters[0].rpg.abilities[0].mechanism='manual'
 const ready=prepare(w).world,cast=ready.characters[0].rpg.casts[0],old=release(ready),groups=old.summary.rules[0].rollGroups
 assert.deepEqual(groups.map(g=>g.targetId),['b','c'])
 const c=collection([action('release',point('area',9.6))],'edited'),p=params([1000],[rule('new:a:0','cast:'+cast.id)])
 p.replay={sourceReceiptId:'old-receipt',selections:[{key:'new:a:0',mode:'preserve',sourceKey:'new:a:0',groups}]}
 const result=calculateRound(ready,c,p,'new-event-identities')
 assert.deepEqual(result.summary.rules[0].rollGroups,[groups.find(g=>g.targetId==='c')]);assert.deepEqual(result.summary.rules[0].rolls,groups.find(g=>g.targetId==='c').values)
 assert.equal(result.world.characters[0].resources.mana.current,'43');assert.equal(ready.characters[0].rpg.casts[0].status,'ready')
})
test('Переигровка области: новая цель требует новых бросков; неоконченный выпуск не теряет выбранные броски молча',()=>{
 const w=world();w.characters[0].rpg.abilities[0].mechanism='manual'
 const ready=prepare(w).world,old=release(ready),cast=ready.characters[0].rpg.casts[0],c=collection([action('release',point())],'edited'),p=params([1000],[rule('new:a:0','cast:'+cast.id)])
 p.replay={sourceReceiptId:'old-receipt',selections:[{key:'new:a:0',mode:'preserve',sourceKey:'new:a:0',groups:old.summary.rules[0].rollGroups}]}
 const changed=structuredClone(ready);changed.campaign.scenes.scenes[0].tokens.find(t=>t.actorId==='d').z=0
 assert.throws(()=>calculateRound(changed,c,p,'new-target'),/Для этой цели нет прежнего броска/)
 const slow=structuredClone(p);slow.timings[0].costs[0].personalMs=8000
 assert.throws(()=>calculateRound(ready,c,slow,'slow-release'),/должен завершиться/)
 const fresh=structuredClone(p);fresh.replay.selections=[{key:'new:a:0',mode:'new'}]
 const a=calculateRound(changed,c,fresh,'fresh-one'),b=calculateRound(changed,c,fresh,'fresh-two')
 assert.notDeepEqual(a.summary.rules[0].rolls,b.summary.rules[0].rolls);assert.equal(a.summary.rules[0].rollGroups.length,3)
 const invalid=structuredClone(p);invalid.replay.selections[0].groups[0].values[0]=1
 assert.throws(()=>calculateRound(ready,c,invalid,'invalid-roll'),/Некорректные сохранённые броски/)
})
test('Пространство: закрытая геометрия, ограничения размеров и явный выбор применяющего',()=>{
 for(const s of [{shape:'point',includeCaster:false},sphere(),{shape:'beam',includeCaster:true,lengthM:5,radiusM:1},{shape:'cone',includeCaster:false,lengthM:5,angleDeg:60}])assert(isAbilitySpatial(s))
 for(const s of [{shape:'point'},{...sphere(),secret:1},sphere(0),sphere(Infinity),{shape:'beam',includeCaster:false,lengthM:0,radiusM:1},{shape:'cone',includeCaster:false,lengthM:1,angleDeg:180}])assert.equal(isAbilitySpatial(s),false)
 const a=world().characters[0].rpg.abilities[0];assert.equal(isAbility({...a,spatial:{shape:'beam',includeCaster:false,lengthM:11,radiusM:1}}),false)
})
test('Пространство: сфера проверяет XYZ и границу, без размеров тела по умолчанию',()=>{
 const s=world().campaign.scenes.scenes[0];assert.deepEqual(spatialTargets(s,'a',sphere(),point(),10).actorIds,['b','c'])
 assert.deepEqual(spatialTargets(s,'a',sphere(3),point(),10).actorIds,['b','c','d'])
 assert.deepEqual(spatialTargets(s,'a',{shape:'point',includeCaster:false},point('point'),10).actorIds,['b'])
 assert.deepEqual(spatialTargets(s,'a',{shape:'point',includeCaster:true},point('point',2),10).actorIds,['a'])
 assert.deepEqual(spatialTargets(s,'a',{shape:'point',includeCaster:false},point('point',2),10).actorIds,[])
})
test('Пространство: луч ограничен осью/радиусом; конус использует полный угол',()=>{
 const s=world().campaign.scenes.scenes[0],beam={shape:'beam',includeCaster:false,lengthM:6,radiusM:1},cone={shape:'cone',includeCaster:false,lengthM:10,angleDeg:60}
 assert.deepEqual(spatialTargets(s,'a',beam,point('direction'),10).actorIds,['b'])
 assert.deepEqual(spatialTargets(s,'a',cone,point('direction'),10).actorIds,['b','c','d'])
 s.tokens.find(t=>t.actorId==='c').x=1;assert(!spatialTargets(s,'a',cone,point('direction'),10).actorIds.includes('c'))
 assert.throws(()=>spatialTargets(s,'a',beam,point('direction',2),10),/отличная/)
 assert.throws(()=>spatialTargets(s,'a',beam,point('area'),10),/совпадать/)
 assert.throws(()=>spatialTargets(s,'a',sphere(),point('area',20,20),10),/дальности/)
 assert.throws(()=>spatialTargets(s,'a',sphere(),point('area',s.width+1),30),/пределах/)
})
test('Пространство: новые цели сохраняются в заявлениях и отвергаются для других категорий',()=>{
 for(const kind of ['point','area','direction']){const a=action('release',point(kind));assert(isDeclaredAction(a));assert.deepEqual(copyDeclaredAction(a),a)}
 assert.equal(isDeclaredAction({kind:'item',itemId:'dose',quantity:1,target:point(),note:''}),false)
})
test('Пространство: подготовка/выпуск, много получателей и один начальный расход',()=>{
 const w=world(),before=structuredClone(w),result=both(w)
 assert.deepEqual(w,before);assert.equal(result.world.characters[0].resources.mana.current,'43');assert.equal(result.world.characters[0].rpg.casts[0].status,'ended')
 assert.equal(result.world.characters[0].rpg.effects.length,0);assert.equal(result.world.characters[1].rpg.effects.length,1);assert.equal(result.world.characters[2].rpg.effects.length,1);assert.equal(result.world.characters[3].rpg.effects.length,0)
 assert.deepEqual(result.summary.rules.at(-1).targets.map(t=>t.actorId),['b','c']);assert.equal(result.world.campaign.revision,1)
 const cast=result.world.characters[0].rpg.casts[0];assert.deepEqual(cast.spatialRelease.actorIds,['b','c']);assert.equal(cast.spatialRelease.inputs[0].input.distanceM,6)
 assert.equal(result.world.characters[1].rpg.effects[0].castId,cast.id);assert.equal(result.world.characters[2].rpg.effects[0].castId,cast.id)
})
test('Пространство: длинная подготовка переносит расход и снимок изменённого шаблона',()=>{
 const first=prepare(world(),8000),work=first.world.campaign.roundWork.entries[0];first.world.characters[0].rpg.abilities[0].spatial=sphere(9)
 const p=params([], [rule(work.id)]);p.timings=[];p.continuations=[{actorId:'a',mode:'continue',budgetMs:3000}]
 const ready=calculateRound(first.world,collection([],'next',[]),p,'finish-spatial').world,result=release(ready)
 assert.equal(result.world.characters[0].resources.mana.current,'43');assert.deepEqual(result.summary.rules[0].targets.map(t=>t.actorId),['b','c']);assert.equal(result.world.characters[0].rpg.casts[0].ability.spatial.radiusM,1)
})
test('Пространство: пустая точка выпускается после исчезновения существа, без автоматической зоны',()=>{
 const w=prepare(world({shape:'point',includeCaster:false})).world;w.characters=w.characters.filter(c=>c.id!=='b');w.campaign.scenes.scenes[0].tokens=w.campaign.scenes.scenes[0].tokens.filter(t=>t.actorId!=='b')
 const c=collection([action('release',point('point'))],'empty');c.participantIds=c.participantIds.filter(id=>id!=='b');const p=params([1000],[rule('new:a:0','cast:'+w.characters[0].rpg.casts[0].id)]);p.missingDecisions=p.missingDecisions.filter(d=>d.actorId!=='b')
 const result=calculateRound(w,c,p,'empty-spatial');assert.deepEqual(result.summary.rules[0].targets,[]);assert.equal(result.world.characters[0].rpg.casts[0].status,'ended');assert.equal(result.world.characters[0].resources.mana.current,'43');assert(result.world.characters.every(a=>a.rpg.effects.length===0))
})
test('Пространство: отдельные параметры попадания, сохранённые броски и независимость от порядка отметок',()=>{
 const w=world();w.characters[0].rpg.abilities[0].mechanism='manual'
 const patch={targetInputs:[{actorId:'c',input:{...fields,manualLocal:4}}]},random=Math.random;Math.random=()=>{throw Error('Неявная случайность')}
 try {const first=both(w,point(),patch),reordered=structuredClone(w);reordered.campaign.scenes.scenes[0].tokens.reverse();const second=both(reordered,point(),patch)
  assert.deepEqual(first.summary.rules.at(-1),second.summary.rules.at(-1));const ready=prepare(w).world;delete ready.characters[0].rpg.casts[0].ability.spatial;const cast=ready.characters[0].rpg.casts[0];const baselineB=releaseRoundPlan(ready,'a',cast.id,'b',{...fields,distanceM:6},'baseline-b',()=>0).plan.world,baselineC=releaseRoundPlan(ready,'a',cast.id,'c',{...fields,distanceM:7,manualLocal:4},'baseline-c',()=>0).plan.world;assert.equal(first.world.characters[1].body.parts.torso.current,baselineB.characters[1].body.parts.torso.current);assert.equal(first.world.characters[2].body.parts.torso.current,baselineC.characters[2].body.parts.torso.current);assert.equal(first.summary.rules.at(-1).rolls.length,4)
  assert.equal(first.world.characters[0].rpg.casts[0].spatialRelease.inputs[1].input.manualLocal,4)
 }finally{Math.random=random}
})
test('Пространство: фактические позиции после движения определяют получателей',()=>{
 const w=prepare().world,c=collection([], 'moving',[entry('a',[action('release',point())]),entry('b',[{kind:'move',route:[{x:8,y:5,z:0},{x:14,y:5,z:0}],support:'ground',note:''}])]),p=params([2000],[rule('new:a:0','cast:'+w.characters[0].rpg.casts[0].id)])
 p.timings.push({actorId:'b',entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]});p.missingDecisions=p.missingDecisions.filter(t=>t.actorId!=='b');p.movement={confirmed:true,bodies:w.campaign.scenes.scenes[0].tokens.map(t=>({actorId:t.actorId,heightM:2}))}
 const result=calculateRound(w,c,p,'moving-spatial');assert.deepEqual(result.summary.rules[0].targets.map(t=>t.actorId),['c']);assert.equal(result.world.characters[1].rpg.effects.length,0)
})
test('Пространство: ограничения подтверждения, снимка формы, привязки и поддержания',()=>{
 const w=prepare().world,before=structuredClone(w)
 assert.throws(()=>release(w,point(),{spatialConfirmed:false}),/подтверждённая/);assert.throws(()=>release(w,point('direction')),/совпадать/);assert.deepEqual(w,before)
 const p=params([1000],[{...rule(),binding:'bound'}]);assert.throws(()=>calculateRound(world(),collection([action('prepare',{kind:'self'})]),p,'bound-spatial'),/без привязки/)
 const upkeep=world();upkeep.characters[0].rpg.abilities[0].upkeep.mana=1;assert.throws(()=>prepare(upkeep),/Поддерживаемая/);assert.equal(upkeep.characters[0].resources.mana.current,'50');const ready=prepare().world;ready.characters[0].rpg.casts[0].ability.upkeep.mana=1;assert.throws(()=>release(ready),/Поддерживаемая/);assert.equal(ready.characters[0].rpg.casts[0].status,'ready')
 assert.equal(makeActionPlan(world(),'a','spell','b',fields,'legacy-spatial').ok,false)
})
test('Пространство: недопустимые параметры отдельной цели отменяют весь расчёт',()=>{
 const w=prepare().world,before=structuredClone(w)
 for(const override of [{actorId:'b',input:{...fields,accessible:false}},{actorId:'c',input:{...fields,region:'missing'}},{actorId:'outside',input:fields}]){
  const manual=structuredClone(w);manual.characters[0].rpg.casts[0].ability.mechanism='manual'
  assert.throws(()=>release(manual,point(),{targetInputs:[override]}));assert.equal(manual.characters[0].rpg.casts[0].status,'ready');assert.equal(manual.characters[1].body.parts.torso.current,50)
 }
 assert.deepEqual(w,before)
})
test('Пространство: один физический снаряд не получает полную энергию для нескольких целей',()=>{
 const w=world();w.characters[0].rpg.abilities[0].mechanism='stone';assert.throws(()=>both(w),/распределения энергии/)
 const ready=prepare(world({shape:'point',includeCaster:false})).world;ready.characters[0].rpg.casts[0].ability.mechanism='stone';assert.throws(()=>release(ready,point('point')),/калибровка/)
})
test('Пространство: одновременные события требуют порядка, готовый/прерванный заряд не дублируется',()=>{
 const w=prepare().world,c=collection([], 'same',[entry('a',[action('release',point())]),entry('b',[{kind:'wait',seconds:1,note:''}])]),p=params([1000],[rule('new:a:0','cast:'+w.characters[0].rpg.casts[0].id)])
 p.timings.push({actorId:'b',entryRevision:1,budgetMs:5000,costs:[]});p.missingDecisions=p.missingDecisions.filter(t=>t.actorId!=='b');assert.throws(()=>calculateRound(w,c,p,'same-spatial'),/Одновременный пространственный/)
 const result=release(w);assert.throws(()=>release(result.world),/готовый/)
 const interrupted=interruptCast(w,'a',w.characters[0].rpg.casts[0].id,'interrupt-spatial');assert.throws(()=>release(interrupted),/готовый/)
 const resultPlan=releaseSpatialRoundPlan(w,'a',w.characters[0].rpg.casts[0].id,'scene',point(),fields,'repeat-spatial',()=>0);assert(resultPlan.ok)
 assert.equal(releaseSpatialRoundPlan(resultPlan.plan.world,'a',w.characters[0].rpg.casts[0].id,'scene',point(),fields,'repeat-spatial',()=>0).ok,false)
})
test('Пространство: копии и сроки сохраняют все цели/параметры и допустимые ссылки на источник',()=>{
 const result=both(),actor=result.world.characters[0],copy=copyRpg(actor.rpg);assert(isRpg(copy));assert.deepEqual(copy.casts,actor.rpg.casts)
 copy.casts[0].spatialRelease.inputs[0].input.note='changed';assert.equal(actor.rpg.casts[0].spatialRelease.inputs[0].input.note,fields.note)
 const forged=structuredClone(actor.rpg);forged.casts[0].spatialRelease.inputs[0].actorId='other';assert.equal(isRpg(forged),false)
 assert(!JSON.stringify(copyAbility({...actor.rpg.abilities[0],spatial:{...sphere(),secret:1}})).includes('secret'))
 const expired=advanceWorld(result.world,30,'spatial-expiry');assert(expired.characters.every(a=>a.rpg.effects.length===0))
})
test('Пространство: выпуск луча и конуса применяет соответствующую форму снимка',()=>{
 for(const [spatial,ids] of [[{shape:'beam',includeCaster:false,lengthM:7,radiusM:1},['b','c']],[{shape:'cone',includeCaster:false,lengthM:10,angleDeg:60},['b','c','d']]]){
  const result=both(world(spatial),point('direction'));assert.deepEqual(result.summary.rules.at(-1).targets.map(t=>t.actorId),ids);assert.equal(result.world.characters[0].resources.mana.current,'43')
 }
})
test('Пространство: лечение использует отдельную область каждого получателя',()=>{
 const w=world();w.characters[0].rpg.abilities[0].mechanism='heal';w.characters[0].rpg.abilities[0].healAmount=10;Object.assign(w.characters[2].body.parts.rightArm,{maximum:100,current:50})
 const result=both(w,point(),{targetInputs:[{actorId:'c',input:{...fields,region:'rightArm'}}]})
 assert(result.world.characters[1].body.parts.torso.current>50);assert(result.world.characters[2].body.parts.rightArm.current>50);assert.equal(result.world.characters[2].body.parts.torso.current,50)
})
