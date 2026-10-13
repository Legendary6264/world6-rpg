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
const {isChargePolicy}=await module('abilityCharge'),{manageRoundCharges}=await module('roundCharges')
const {advanceWorld,interruptCast,releaseRoundPlan}=await module('rpgEngine')
const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'PRIVATE-CHARGE'}
const policy=(patch={})=>({maxHoldSeconds:100,holdCost:{mana:2,shadow:0,stamina:0},requireConditions:false,refundPreparingPercent:50,refundReadyPercent:25,...patch})
function world(p=policy()){
 const a={...createDefaultCharacter(),id:'a',name:'A'};a.rpg.formulas=[];a.resources.mana={maximum:'50',current:'50'};a.resources.shadow={maximum:'50',current:'50'};a.resources.stamina={maximum:'50',current:'50'};a.statistics.energyRegeneration='0'
 a.rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'template',name:'Charge',approved:true,chargePolicy:p,mechanism:'effect',cost:{mana:10,shadow:0,stamina:0},rangeM:10,duration:30,modifiers:[{parameter:'movement',flat:3,percent:0}]}]
 const campaign={...emptyCampaign(),scenes:createScene(emptyScenes(),'scene','Scene','top')};campaign.scenes.scenes[0].tokens=[{actorId:'a',x:2,y:2,z:0,diameter:1,support:{kind:'ground'}}];return {campaign,characters:[a]}
}
const action=stage=>({kind:'ability',abilityId:'spell',stage,target:{kind:stage==='prepare'?'none':'self'},note:''})
const collection=(actions=[],id='collection')=>({id,sceneId:'scene',sceneName:'Scene',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:['a'],entries:actions.length?[{actorId:'a',actorName:'A',revision:1,status:'submitted',actions,resolved:[],submittedBy:'gm',submittedAt:'2026-10-11T00:00:00Z',note:''}]:[],history:[]})
const rule=(key,charge='')=>({key,kind:'ability',confirmed:true,binding:'unbound',charge,input:structuredClone(fields)})
const input=(costs=[],rules=[])=>({timings:costs.length?[{actorId:'a',entryRevision:1,budgetMs:5000,costs:costs.map((personalMs,index)=>({index,personalMs}))}]:[],rules,continuations:[],interactionsConfirmed:false,missingDecisions:costs.length?[]:[{actorId:'a',reason:'Выбор мастера'}]})
const prepare=(w=world(),cost=1000)=>calculateRound(w,collection([action('prepare')]),input([cost],[rule('new:a:0')]),'charge-prep').world
const decision=(w,mode='keep',patch={})=>({actorId:'a',castId:w.characters[0].rpg.casts[0].id,mode,confirmed:true,reason:mode==='interrupt'?'Остановить заряд':'',conditionsConfirmed:true,canSpeak:true,...patch})
const next=(w,mode='keep',patch={})=>calculateRound(w,collection([],'next'),{...input(),charges:[decision(w,mode)],...patch},'charge-next-'+w.campaign.revision)
test('Заряд: настройки закрыты, сроки/доли/стоимости проверяются и копируются',()=>{
 assert(isChargePolicy(policy()));assert(isChargePolicy(policy({maxHoldSeconds:null})))
 for(const p of [policy({maxHoldSeconds:0}),policy({maxHoldSeconds:Infinity}),policy({refundReadyPercent:101}),policy({holdCost:{mana:1,shadow:0}}),{...policy(),secret:1}])assert.equal(isChargePolicy(p),false)
 const a=world().characters[0].rpg.abilities[0];assert(isAbility(a));const b=copyAbility(a);b.chargePolicy.holdCost.mana=9;assert.equal(a.chargePolicy.holdCost.mana,2)
})
test('Заряд: расход готовности учитывает часть первого раунда и каждую следующую секунду',()=>{
 const w=prepare();assert.equal(w.characters[0].resources.mana.current,'32');assert.equal(w.characters[0].rpg.casts[0].readyAt,1);assert.deepEqual(w.characters[0].rpg.casts[0].roundPreparation.paidCost,{mana:10,shadow:0,stamina:0})
 const before=structuredClone(w),r=next(w);assert.equal(r.world.characters[0].resources.mana.current,'22');assert.equal(r.world.campaign.seconds,10);assert.deepEqual(w,before)
})
test('Заряд: стоимость прекращается при завершении отдельного выпуска',()=>{
 const w=prepare(),p=input([1000],[rule('new:a:0','cast:'+w.characters[0].rpg.casts[0].id)]);p.charges=[decision(w)]
 const r=calculateRound(w,collection([action('release')],'release'),p,'charge-release');assert.equal(r.world.characters[0].resources.mana.current,'30');assert.equal(r.world.characters[0].rpg.casts[0].status,'ended');assert.equal(r.world.characters[0].rpg.effects.length,1)
 assert.equal(advanceWorld(r.world,5,'after-release').characters[0].resources.mana.current,'30')
})
test('Заряд: срок начинается с готовности; выпуск на границе разрешён, превышение атомарно блокируется',()=>{
 const w=prepare(world(policy({maxHoldSeconds:5}))),before=structuredClone(w)
 const plan=releaseRoundPlan(advanceWorld(w,1,'boundary'),'a',w.characters[0].rpg.casts[0].id,'a',fields,'release-at-boundary');assert(plan.ok)
 assert.throws(()=>advanceWorld(w,1.1,'too-late'),/срок удержания/);assert.throws(()=>next(w),/срок удержания/);assert.deepEqual(w,before)
 const ended=next(w,'interrupt').world;assert.equal(ended.characters[0].rpg.casts[0].status,'interrupted');assert.equal(ended.characters[0].resources.mana.current,'34.5')
})
test('Заряд: истощение не отменяет заряд и не допускает бесплатного удержания',()=>{
 const w=prepare();w.characters[0].resources.mana.current='1';const before=structuredClone(w)
 assert.throws(()=>advanceWorld(w,1,'depleted'),/Не хватает ресурса/);assert.deepEqual(w,before);assert.equal(next(w,'interrupt').world.characters[0].resources.mana.current,'3.5')
})
test('Заряд: регенерация, несколько запасов и несколько зарядов учитываются совместно',()=>{
 const w=prepare();w.characters[0].statistics.energyRegeneration='2';assert.equal(advanceWorld(w,5,'regeneration').characters[0].resources.mana.current,'32')
 const a=prepare(world(policy({holdCost:{mana:1,shadow:0,stamina:1}})));a.characters[0].resources.shadow={maximum:'50',current:'40'};a.characters[0].resources.stamina={maximum:'50',current:'40'};const b=structuredClone(a.characters[0].rpg.casts[0]);b.id='second-charge';a.characters[0].rpg.casts.push(b)
 const r=advanceWorld(a,2,'two-charges');assert.equal(r.characters[0].resources.mana.current,'32');assert.equal(r.characters[0].resources.shadow.current,'0');assert.equal(r.characters[0].resources.stamina.current,'36');const shadow=world(policy({holdCost:{mana:0,shadow:1,stamina:1}}));shadow.characters[0].profile.energy='shadow';shadow.characters[0].rpg.abilities[0].cost={mana:0,shadow:10,stamina:0};const held=advanceWorld(prepare(shadow),2,'shadow-hold');assert.equal(held.characters[0].resources.shadow.current,'34');assert.equal(held.characters[0].resources.mana.current,'0')
})
test('Заряд: требуется подтверждение мастера; чужие, повторные и неподтверждённые решения отвергаются',()=>{
 const w=prepare();assert.throws(()=>calculateRound(w,collection(),input(),'missing-confirm'),/Подтверди/)
 for(const ds of [[decision(w,'keep',{actorId:'unknown'})],[decision(w),decision(w)],[decision(w,'keep',{confirmed:false})],[decision(w,'interrupt',{reason:''})]])assert.throws(()=>manageRoundCharges(w,ds,'invalid'))
})
test('Заряд: условия удержания проверяются без привязки к исчезнувшей цели; урон не универсальное прерывание',()=>{
 const w=world(policy({requireConditions:true}));w.characters[0].rpg.abilities[0].condition='Сосредоточенность';const ready=prepare(w),before=structuredClone(ready)
 assert.throws(()=>manageRoundCharges(ready,[decision(ready,'keep',{conditionsConfirmed:false})],'condition'),/особое условие/);assert.deepEqual(ready,before)
 ready.characters[0].rpg.dead=true;assert.throws(()=>next(ready),/погибшим/);assert.equal(next(ready,'interrupt').world.characters[0].rpg.casts[0].status,'interrupted')
 const unrestricted=prepare();unrestricted.characters[0].rpg.dead=true;assert.equal(advanceWorld(unrestricted,1,'unconscious-hold').characters[0].rpg.casts[0].status,'ready')
})
test('Заряд: пауза сохраняет точный прогресс подготовки без оплаты готового удержания',()=>{
 const w=prepare(world(),8000),progress=structuredClone(w.campaign.roundWork),r=next(w,'keep',{continuations:[{actorId:'a',mode:'hold',budgetMs:5000}]})
 assert.deepEqual(r.world.campaign.roundWork,progress);assert.equal(r.world.characters[0].resources.mana.current,'40');assert.equal(r.world.characters[0].rpg.casts[0].status,'preparing')
})
test('Заряд: прерывание подготовки снимает зависимую очередь и возвращает долю единственного платежа',()=>{
 const p=input([8000,1000],[rule('new:a:0'),rule('new:a:1','prepare:new:a:0')]),w=calculateRound(world(),collection([action('prepare'),action('release')]),p,'pending').world,before=structuredClone(w)
 const r=next(w,'interrupt');assert.equal(r.world.campaign.roundWork.entries.length,0);assert.equal(r.summary.charges[0].removedWorkIds.length,2);assert.equal(r.world.characters[0].resources.mana.current,'45');assert.equal(r.world.characters[0].rpg.casts[0].status,'interrupted');assert.deepEqual(w,before)
 assert.throws(()=>interruptCast(r.world,'a',w.characters[0].rpg.casts[0].id,'another-refund'),/не найдено/)
})
test('Заряд: снимок правил и возврат по записанному платежу, без возврата удержания',()=>{
 const w=prepare();w.characters[0].rpg.abilities[0].chargePolicy=policy({refundReadyPercent:100,holdCost:{mana:0,shadow:0,stamina:0}})
 const r=next(w,'interrupt');assert.equal(r.world.characters[0].resources.mana.current,'34.5');assert.deepEqual(r.world.characters[0].rpg.casts[0].interruption.refunded,{mana:2.5,shadow:0,stamina:0})
})
test('Заряд: возврат ограничен максимумом; отсутствие платежа не создаёт ресурсы',()=>{
 const w=prepare();w.characters[0].resources.mana.current='49';assert.equal(next(w,'interrupt').world.characters[0].resources.mana.current,'50')
 delete w.characters[0].rpg.casts[0].roundPreparation.paidCost;assert.equal(next(w,'interrupt').world.characters[0].resources.mana.current,'49')
})
test('Заряд: старые способности сохраняют бесплатное удержание и нулевой возврат',()=>{
 const w=world();delete w.characters[0].rpg.abilities[0].chargePolicy;const ready=prepare(w);assert.equal(ready.characters[0].resources.mana.current,'40');assert.equal(advanceWorld(ready,100,'legacy-clock').characters[0].resources.mana.current,'40')
 const r=calculateRound(ready,collection(),input(),'legacy-no-decisions');assert.equal(r.world.characters[0].rpg.casts[0].status,'ready');assert.equal(interruptCast(ready,'a',ready.characters[0].rpg.casts[0].id,'legacy-interrupt').characters[0].resources.mana.current,'40')
})
test('Заряд: копии/читатели сохраняют платёж и прерывание, не перенося посторонние поля',()=>{
 const w=next(prepare(),'interrupt').world,r=copyRpg(w.characters[0].rpg);assert(isRpg(r));assert.deepEqual(r.casts,w.characters[0].rpg.casts);r.casts[0].interruption.refunded.mana=0;assert.equal(w.characters[0].rpg.casts[0].interruption.refunded.mana,2.5)
 const malformed=structuredClone(r);malformed.casts[0].roundPreparation.paidCost.extra=1;assert.equal(isRpg(malformed),false)
 const invalid=structuredClone(r);invalid.casts[0].interruption.phase='ended';assert.equal(isRpg(invalid),false)
})
test('Заряд: прерывание следующей подготовки сохраняет уже применённый эффект прошлого выпуска',()=>{
 const emitted=calculateRound(world(),collection([action('prepare'),action('release')]),input([1000,1000],[rule('new:a:0'),rule('new:a:1','prepare:new:a:0')]),'emitted').world
 const pending=prepare(emitted,8000),cast=pending.characters[0].rpg.casts.at(-1),effects=structuredClone(pending.characters[0].rpg.effects)
 const stopped=manageRoundCharges(pending,[{...decision(pending,'interrupt'),castId:cast.id}],'stop-next').world
 assert.deepEqual(stopped.characters[0].rpg.effects,effects);assert.equal(stopped.characters[0].rpg.casts[0].status,'ended');assert.equal(stopped.characters[0].rpg.casts.at(-1).status,'interrupted')
})
test('Заряд: платёж отражает фактическое списание с точностью прежнего движка',()=>{
 const w=world(policy({holdCost:{mana:0,shadow:0,stamina:0},refundReadyPercent:100}));w.characters[0].rpg.abilities[0].cost.mana=0.0000001
 const r=prepare(w);assert.equal(r.characters[0].resources.mana.current,'50');assert.equal(r.characters[0].rpg.casts[0].roundPreparation.paidCost.mana,0);assert.equal(next(r,'interrupt').world.characters[0].resources.mana.current,'50')
})
