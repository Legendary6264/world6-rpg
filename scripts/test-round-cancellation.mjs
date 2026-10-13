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
const {calculateRound}=await module('roundExecution'),{createDefaultCharacter}=await module('characterModel'),{createScene,emptyScenes}=await module('scenes')
const {emptyCampaign,emptyAbility,isCampaign}=await module('rpgSchema'),{cancelPendingActions}=await module('roundCancellation'),{isRoundWork}=await module('roundWork')
function fixture(){
 const a={...createDefaultCharacter(),id:'a',name:'A'};a.rpg.formulas=[];a.statistics.energyRegeneration='0';a.resources.mana={maximum:'50',current:'50'}
 a.rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'template',name:'Charge',approved:true,mechanism:'effect',cost:{mana:10,shadow:0,stamina:0},chargePolicy:{maxHoldSeconds:100,holdCost:{mana:0,shadow:0,stamina:0},requireConditions:false,refundPreparingPercent:50,refundReadyPercent:25}}]
 const campaign={...emptyCampaign(),scenes:createScene(emptyScenes(),'scene','Scene','top')};campaign.scenes.scenes[0].tokens=[{actorId:'a',x:2,y:2,z:0,diameter:1,support:{kind:'ground'}}]
 const action={kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:'original'},entry={actorId:'a',actorName:'A',revision:1,status:'submitted',actions:[action],resolved:[],submittedBy:'player',submittedAt:'2026-10-12T00:00:00Z',note:''}
 const c={id:'collection',sceneId:'scene',sceneName:'Scene',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:['a'],entries:[entry],history:[]};campaign.declarations={version:1,active:c,archive:[]}
 const input={timings:[{actorId:'a',entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:8000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[{key:'new:a:0',kind:'ability',confirmed:true,binding:'unbound',charge:'',input:{region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}}]}
 return calculateRound({campaign,characters:[a]},c,input,'cancel-prepare').world
}
const cancel=(w,workIds=[],actorIds=[],executed=false)=>cancelPendingActions(w,{workIds,actorIds,reason:'Решение мастера'},'cancel-event','master','2026-10-12T00:00:00Z',executed)
function future(work,id,index,actorId='a'){
 const e=structuredClone(work);delete e.ability;e.id=id;e.actorId=actorId;e.origin.actionIndex=index;e.action={kind:'wait',seconds:10,note:''};e.amount={unit:'world-ms',total:{numerator:'10000',denominator:'1'},remaining:{numerator:'10000',denominator:'1'}};return e
}
test('Отмена: незавершённая подготовка прерывается с возвратом, время и исходник сохраняются',()=>{
 const w=fixture(),before=structuredClone(w),r=cancel(w,[w.campaign.roundWork.entries[0].id]);assert.deepEqual(w,before);assert.equal(r.world.campaign.seconds,5);assert.equal(r.world.characters[0].resources.mana.current,'45');assert.equal(r.world.characters[0].rpg.casts[0].status,'interrupted');assert.equal(r.world.campaign.roundWork.entries.length,0);assert.equal(r.summary.refunds[0].cost.mana,5);assert(isCampaign(r.world.campaign))
})
test('Отмена: снимается зависимый хвост героя, очередь другого героя сохраняется',()=>{
 const w=fixture(),first=w.campaign.roundWork.entries[0];w.characters.push({...createDefaultCharacter(),id:'b',name:'B'});w.campaign.roundWork.entries.push(future(first,'future-a',1),future(first,'other-b',1,'b'));const r=cancel(w,[first.id],[],true)
 assert.deepEqual(r.summary.removedWork.map(e=>e.id),[first.id,'future-a']);assert.deepEqual(r.world.campaign.roundWork.entries.map(e=>e.id),['other-b']);assert.equal(r.world.campaign.declarations.active.entries[0].status,'submitted');assert(isRoundWork(r.world.campaign.roundWork))
})
test('Отмена: выбор будущего действия сохраняет предшествующую подготовку и платёж',()=>{
 const w=fixture(),first=w.campaign.roundWork.entries[0];w.campaign.roundWork.entries.push(future(first,'future-a',1));const r=cancel(w,['future-a'],[],true)
 assert.equal(r.world.campaign.roundWork.entries.length,1);assert.equal(r.world.characters[0].rpg.casts[0].status,'preparing');assert.equal(r.world.characters[0].resources.mana.current,'40');assert.equal(r.summary.refunds.length,0)
})
test('Отмена: движение останавливается в текущей позиции, готовый заряд не уничтожается',()=>{
 const w=fixture(),first=w.campaign.roundWork.entries[0];delete first.ability;first.action={kind:'move',route:[{x:12,y:2,z:3}],support:'air',note:''};w.characters[0].rpg.casts[0].status='ready';w.campaign.scenes.scenes[0].tokens[0].x=8
 const r=cancel(w,[first.id],[],true);assert.equal(r.world.campaign.scenes.scenes[0].tokens[0].x,8);assert.equal(r.world.characters[0].rpg.casts[0].status,'ready');assert.equal(r.world.characters[0].resources.mana.current,'40')
})
test('Отмена: новый зависимый план возвращается с автором и действиями, версии меняются',()=>{
 const w=fixture(),r=cancel(w,[w.campaign.roundWork.entries[0].id]),entry=r.world.campaign.declarations.active.entries[0]
 assert.equal(entry.status,'returned');assert.equal(entry.submittedBy,'player');assert.deepEqual(entry.actions,w.campaign.declarations.active.entries[0].actions);assert.equal(entry.revision,2);assert.equal(r.world.campaign.declarations.active.epoch,3);assert.equal(r.world.campaign.declarations.active.history[0].authorId,'master')
})
test('Отмена: отдельный возврат плана сохраняет уже начатую переносимую работу',()=>{
 const w=fixture(),r=cancel(w,[],['a']);assert.equal(r.world.campaign.roundWork.entries.length,1);assert.equal(r.world.characters[0].rpg.casts[0].status,'preparing');assert.equal(r.world.characters[0].resources.mana.current,'40')
})
test('Отмена: неверные/повторные ID, пустая причина и исполненный план отклоняются без изменений',()=>{
 const w=fixture(),before=structuredClone(w),id=w.campaign.roundWork.entries[0].id
 for(const v of [{workIds:[],actorIds:[],reason:'X'},{workIds:['missing'],actorIds:[],reason:'X'},{workIds:[id,id],actorIds:[],reason:'X'},{workIds:[id],actorIds:[],reason:'  '},{workIds:[],actorIds:['missing'],reason:'X'}])assert.throws(()=>cancelPendingActions(w,v,'event','master','2026-10-12T00:00:00Z'))
 assert.throws(()=>cancel(w,[],['a'],true));assert.deepEqual(w,before)
})
