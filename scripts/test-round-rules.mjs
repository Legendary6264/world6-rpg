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
const {calculateRound}=await module('roundExecution'),{createDefaultCharacter}=await module('characterModel')
const {emptyCampaign,emptyAbility,emptyItem,emptyConsumableEffect,copyItem,copyRpg,isRpg,isItem}=await module('rpgSchema'),{createScene,emptyScenes}=await module('scenes')
const {copyRoundWork,personalRoundWork,isRoundWork}=await module('roundWork'),{advanceWorld,interruptCast,consumeItemPlan,activeEffects}=await module('rpgEngine')
const inputFields={region:'torso',distanceM:999,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'PRIVATE-RULE'}
const action=(stage,target={kind:'self'})=>({kind:'ability',abilityId:'spell',stage,target,note:'PRIVATE-ACTION'})
const item=(operation)=>({kind:'item',itemId:'artifact',quantity:1,target:{kind:'self'},note:'',operation})
const entry=(actorId,actions)=>({actorId,actorName:actorId,revision:1,status:'submitted',actions,resolved:actions.flatMap((a,index)=>a.target?.kind==='contact'?[{index,actorId:'b'}]:[]),submittedBy:'gm',submittedAt:'2026-10-11T00:00:00Z',note:''})
const collection=(entries,id='collection')=>({id,sceneId:'scene',sceneName:'Scene',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:['a','b'],entries,history:[]})
function world(){
 const campaign={...emptyCampaign(),scenes:createScene(emptyScenes(),'scene','Scene','top')}
 campaign.scenes.scenes[0].tokens=[{actorId:'a',x:2,y:2,z:0,diameter:1,support:{kind:'ground'}},{actorId:'b',x:8,y:2,z:0,diameter:1,support:{kind:'ground'}}]
 const characters=['a','b'].map(id=>{const c={...createDefaultCharacter(),id,name:id};c.resources.mana={maximum:'50',current:'50'};c.statistics.energyRegeneration='0';c.rpg.formulas=[];Object.assign(c.body.parts.torso,{maximum:100,current:50});return c})
 characters[0].rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'template',approved:true,name:'Spell',mechanism:'effect',preparation:123,rangeM:10,cost:{mana:7,shadow:0,stamina:0},duration:30,modifiers:[{parameter:'movement',flat:3,percent:0}]}]
 characters[0].rpg.inventory=[{...emptyItem(),id:'artifact',templateId:'template-item',name:'Artifact',quantity:1,durability:100,equipped:false,slot:'right',artifactLevel:1,artifactCharge:10,energyReserve:10,activationCost:3,activationDuration:30,activationModifiers:[{parameter:'movement',flat:2,percent:0}]}]
 return {characters,campaign}
}
const timing=(actorId,costs,budgetMs=5000)=>({actorId,entryRevision:1,budgetMs,costs:costs.map((personalMs,index)=>({index,personalMs}))})
const rule=(key,stage='prepare',binding='unbound',charge='')=>({key,kind:'ability',confirmed:true,binding,charge,input:structuredClone(inputFields)})
const params=(timings,rules,missing=['b'])=>({timings,rules,continuations:[],interactionsConfirmed:false,missingDecisions:missing.map(actorId=>({actorId,reason:'Решение мастера'}))})
function prepare(cost=8000,binding='unbound',target={kind:'self'}){
 const w=world(),c=collection([entry('a',[action('prepare',target)])]),p=params([timing('a',[cost])],[rule('new:a:0','prepare',binding)])
 return calculateRound(w,c,p,'initial')
}
test('R03: начальный расход один раз, точный остаток и готовность независимо от старых часов',()=>{
 const w=world(),before=structuredClone(w),p=params([timing('a',[8000])],[rule('new:a:0')]),first=calculateRound(w,collection([entry('a',[action('prepare')])]),p,'initial')
 assert.deepEqual(w,before);assert.equal(first.world.characters[0].resources.mana.current,'43');assert.equal(first.world.characters[0].rpg.casts[0].status,'preparing')
 const work=first.world.campaign.roundWork.entries[0];assert.equal(work.amount.remaining.numerator,'3000');assert(work.ability);assert.equal(first.summary.rules[0].kind,'prepare')
 first.world.characters[0].rpg.abilities[0].cost.mana=49
 const next=params([], [rule(work.id)]);next.continuations=[{actorId:'a',mode:'continue',budgetMs:10000}]
 const second=calculateRound(first.world,collection([],'next'),next,'finish')
 assert.equal(second.world.characters[0].resources.mana.current,'43');assert.equal(second.world.characters[0].rpg.casts[0].status,'ready');assert.equal(second.world.characters[0].rpg.casts[0].readyAt,6.5)
 assert.equal(second.world.campaign.roundWork.entries.length,0);assert.equal(second.summary.events[1].kind,'ready');assert.equal(second.world.characters[0].rpg.effects.length,0)
})
test('R03: сохранённая подготовка не готовится при удержании или ручном продвижении часов',()=>{
 const first=prepare(),work=first.world.campaign.roundWork.entries[0]
 const held=params([],[],['a','b']);held.continuations=[{actorId:'a',mode:'hold',budgetMs:5000}]
 const after=calculateRound(first.world,collection([],'hold'),held,'held').world
 assert.deepEqual(after.campaign.roundWork,first.world.campaign.roundWork);assert.equal(after.characters[0].rpg.casts[0].status,'preparing');assert.equal(after.characters[0].resources.mana.current,'43')
 assert.equal(advanceWorld(after,1000,'manual-time').characters[0].rpg.casts[0].status,'preparing')
 const bad=structuredClone(first.world);delete bad.campaign.roundWork.entries[0].ability
 const next=params([], [rule(work.id)]);next.continuations=[{actorId:'a',mode:'continue',budgetMs:5000}]
 assert.throws(()=>calculateRound(bad,collection([],'bad'),next,'bad'),/начального расхода/)
})
test('R03: подготовка и выпуск в одной очереди, без второго расхода и автоматического эффекта',()=>{
 const w=world(),c=collection([entry('a',[action('prepare'),action('release')])]),p=params([timing('a',[1000,1000])],[rule('new:a:0'),rule('new:a:1','release','unbound','prepare:new:a:0')])
 const r=calculateRound(w,c,p,'two-stages');assert.equal(r.world.characters[0].resources.mana.current,'43');assert.equal(r.world.characters[0].rpg.casts[0].status,'ended');assert.equal(r.world.characters[0].rpg.effects.length,1);assert(r.summary.rules.at(-1).details.includes(String(r.world.characters[0].rpg.effects[0].modifiers[0].flat)));assert(r.summary.rules[0].details.includes('50 → 43'))
 assert.deepEqual(r.summary.rules.map(r=>r.kind),['prepare','ready','release']);assert.deepEqual(r.summary.events.map(e=>e.atMs.numerator),['0','1000','2000'])
})
test('R03: непривязанный заряд переживает исчезновение выбранной цели и выпускается в другую',()=>{
 const r=prepare(1000,'unbound',{kind:'contact',id:'known-b'}),w=r.world;w.characters=w.characters.filter(c=>c.id!=='b');w.campaign.scenes.scenes[0].tokens=w.campaign.scenes.scenes[0].tokens.filter(t=>t.actorId!=='b')
 const cast=w.characters[0].rpg.casts[0];assert.equal(cast.targetId,'')
 const c=collection([entry('a',[action('release')])],'release');c.participantIds=['a']
 const result=calculateRound(w,c,params([timing('a',[1000])],[rule('new:a:0','release','unbound','cast:'+cast.id)],[]),'retarget')
 assert.equal(result.world.characters[0].rpg.effects.length,1);assert.equal(result.world.characters[0].resources.mana.current,'43')
})
test('R03: привязанный заряд, чужой/прерванный заряд и второй выпуск блокируются атомарно',()=>{
 const first=prepare(1000,'bound',{kind:'contact',id:'known-b'}),w=first.world,cast=w.characters[0].rpg.casts[0]
 const p=params([timing('a',[1000])],[rule('new:a:0','release','bound','cast:'+cast.id)])
 assert.throws(()=>calculateRound(w,collection([entry('a',[action('release')])],'wrong-target'),p,'wrong-target'),/привязан/)
 const c=collection([entry('a',[action('release',{kind:'contact',id:'known-b'}),action('release',{kind:'contact',id:'known-b'})])],'duplicate')
 assert.throws(()=>calculateRound(w,c,params([timing('a',[1000,1000])],[rule('new:a:0','release','bound','cast:'+cast.id),rule('new:a:1','release','bound','cast:'+cast.id)]),'duplicate'),/готовый/)
 const interrupted=interruptCast(w,'a',cast.id,'interrupt');assert.throws(()=>calculateRound(interrupted,collection([entry('a',[action('release',{kind:'contact',id:'known-b'})])]),p,'interrupted'),/готовый/)
 assert.equal(w.characters[0].resources.mana.current,'43');assert.equal(w.characters[0].rpg.casts[0].status,'ready')
})
test('R03: выпуск проверяет актуальные XYZ после движения цели',()=>{
 const w=prepare(1000).world,cast=w.characters[0].rpg.casts[0]
 const move={kind:'move',route:[{x:20,y:2,z:0}],support:'ground',note:''},c=collection([entry('a',[action('release',{kind:'contact',id:'known-b'})]),entry('b',[move])],'range')
 const p=params([timing('a',[3000]),timing('b',[1000])],[rule('new:a:0','release','unbound','cast:'+cast.id)],[])
 p.movement={confirmed:true,bodies:[{actorId:'a',heightM:2},{actorId:'b',heightM:2}]}
 const before=structuredClone(w);assert.throws(()=>calculateRound(w,c,p,'range'),/дальности/);assert.deepEqual(w,before)
})
test('R03: явное согласование, ограничения типа цели и спорное одинаковое время',()=>{
 const w=world(),c=collection([entry('a',[action('prepare')])]),p=params([timing('a',[1000])],[rule('new:a:0')])
 assert.throws(()=>calculateRound(w,c,{...p,rules:[]},'no-rule'),/каждого/)
 p.rules[0].confirmed=false;assert.throws(()=>calculateRound(w,c,p,'unconfirmed'),/каждого/)
 const ready=prepare(1000).world,cast=ready.characters[0].rpg.casts[0]
 const collision=collection([entry('a',[action('release',{kind:'contact',id:'known-b'})]),entry('b',[{kind:'wait',seconds:1,note:''}])])
 assert.throws(()=>calculateRound(ready,collision,params([timing('a',[1000]),{actorId:'b',entryRevision:1,budgetMs:5000,costs:[]}],[rule('new:a:0','release','unbound','cast:'+cast.id)],[]),'same-time'),/Одновременные/)
 const point=collection([entry('a',[action('release',{kind:'point',point:{x:5,y:5,z:0}})])])
 assert.throws(()=>calculateRound(ready,point,params([timing('a',[1000])],[rule('new:a:0','release','unbound','cast:'+cast.id)]),'point'),/подтверждённая/)
})
test('R03: снаряжение и артефакт исполняются по порядку; заряд и количество не дублируются',()=>{
 const w=world(),before=structuredClone(w),c=collection([entry('a',[item('equip'),item('activate'),item('unequip')])])
 const rules=['equip','activate','unequip'].map((operation,index)=>({key:'new:a:'+index,kind:'item',operation,confirmed:true}))
 const r=calculateRound(w,c,params([timing('a',[1000,1000,1000])],rules),'artifact')
 assert.deepEqual(w,before);const owned=r.world.characters[0].rpg.inventory[0];assert.equal(owned.equipped,false);assert.equal(owned.artifactCharge,7);assert.equal(owned.quantity,1);assert.equal(r.world.characters[0].rpg.effects.length,1)
 const same=calculateRound(w,c,params([timing('a',[1000,1000,1000])],rules),'artifact');assert.deepEqual(same,r)
 rules[0].operation='unequip';assert.throws(()=>calculateRound(w,c,params([timing('a',[1000,1000,1000])],rules),'changed'),/совпадать/)
})
test('R03: предмет проверяет актуальную руку, рабочее состояние и собственную энергию',()=>{
 const w=world(),c=collection([entry('a',[item('activate')])]),p=params([timing('a',[1000])],[{key:'new:a:0',kind:'item',operation:'activate',confirmed:true}])
 assert.throws(()=>calculateRound(w,c,p,'unequipped'),/экипирован/)
 w.characters[0].rpg.inventory[0].equipped=true;w.characters[0].rpg.inventory[0].artifactCharge=2
 assert.throws(()=>calculateRound(w,c,p,'no-charge'),/энергии/)
 const disabled=world();Object.assign(disabled.characters[0].body.parts.rightHand,{maximum:100,current:0})
 assert.throws(()=>calculateRound(disabled,collection([entry('a',[item('equip')])]),params([timing('a',[1000])],[{key:'new:a:0',kind:'item',operation:'equip',confirmed:true}]),'hand'),/рука/)
})
test('R03: копии сохраняют расход/привязку, личная проекция скрывает цель и параметры',()=>{
 const r=prepare(),work=r.world.campaign.roundWork.entries[0];assert.deepEqual(copyRoundWork(r.world.campaign.roundWork),r.world.campaign.roundWork)
 assert.deepEqual(copyRpg(r.world.characters[0].rpg),r.world.characters[0].rpg)
 assert(isRpg(copyRpg(r.world.characters[0].rpg)));assert(isRoundWork(copyRoundWork(r.world.campaign.roundWork)))
 const privateView=JSON.stringify(personalRoundWork(r.world.campaign.roundWork,['a']));for(const x of ['\"ability\":','castId','targetActorId','PRIVATE'])assert(!privateView.includes(x))
 const bad=structuredClone(r.world.campaign.roundWork);bad.entries[0].ability.secret='PRIVATE';assert(!isRoundWork(bad))
 const cast=structuredClone(r.world.characters[0].rpg);cast.casts[0].roundPreparation.secret='PRIVATE';assert(!isRpg(cast))
 assert(work.ability.castId)
})


test('R03: ручное попадание сохраняет броски и результат без неявной случайности',()=>{
 const w=world();w.characters[0].rpg.abilities[0].mechanism='manual'
 const c=collection([entry('a',[action('prepare'),action('release',{kind:'contact',id:'known-b'})])])
 const p=params([timing('a',[1000,1000])],[rule('new:a:0'),rule('new:a:1','release','unbound','prepare:new:a:0')]);p.rules[1].input.manualLocal=10;p.rules[1].input.criticalChance=50
 const random=Math.random;Math.random=()=>{throw Error('Неявная случайность')}
 try {const first=calculateRound(w,c,p,'saved-rolls'),second=calculateRound(w,c,p,'saved-rolls');assert.deepEqual(first,second);assert.equal(first.summary.rules.at(-1).rolls.length,2);assert(first.world.characters[1].body.parts.torso.current<50);assert.equal(w.characters[1].body.parts.torso.current,50)}finally{Math.random=random}
})
test('R03: лечение использует прежнее тело, а недоступная область/ресурс блокируют весь результат',()=>{
 const w=world();w.characters[0].rpg.abilities[0].mechanism='heal';w.characters[0].rpg.abilities[0].healAmount=10
 const c=collection([entry('a',[action('prepare'),action('release')])]),p=params([timing('a',[1000,1000])],[rule('new:a:0'),rule('new:a:1','release','unbound','prepare:new:a:0')])
 assert(calculateRound(w,c,p,'heal').world.characters[0].body.parts.torso.current>50)
 p.rules[1].input.region='missing';assert.throws(()=>calculateRound(w,c,p,'missing-area'),/здоровье области/)
 p.rules[1].input.region='torso';w.characters[0].resources.mana.current='6';const before=structuredClone(w)
 assert.throws(()=>calculateRound(w,c,p,'no-resource'),/Недостаточно ресурса/);assert.deepEqual(w,before)
})


test('R03: подготовка в очереди на границе не создаёт заряд и не платит до своего начала',()=>{
 const w=world(),c=collection([entry('a',[{kind:'wait',seconds:5,note:''},action('prepare')])]),p=params([{actorId:'a',entryRevision:1,budgetMs:5000,costs:[{index:1,personalMs:8000}]}],[rule('new:a:1')])
 const first=calculateRound(w,c,p,'queued');assert.equal(first.world.characters[0].rpg.casts.length,0);assert.equal(first.world.characters[0].resources.mana.current,'50')
 const work=first.world.campaign.roundWork.entries[0];assert(!work.ability)
 const next=params([], [rule(work.id)]);next.continuations=[{actorId:'a',mode:'continue',budgetMs:5000}]
 const started=calculateRound(first.world,collection([],'start'),next,'started').world;assert.equal(started.characters[0].resources.mana.current,'43');assert.equal(started.characters[0].rpg.casts.length,1);assert.equal(started.campaign.roundWork.entries[0].amount.remaining.numerator,'3000')
})

function doseWorld(patch={}) {
 const w=world();w.characters[0].resources.mana.current='40'
 w.characters[0].rpg.inventory=[{...emptyItem(),id:'dose',templateId:'dose-template',name:'Доза',category:'consumable',quantity:2,durability:100,equipped:false,
  consumable:{...emptyConsumableEffect(),targets:'creature',rangeM:10,restore:{mana:7,shadow:0,stamina:0},...patch}}]
 return w
}
const dose=(target={kind:'self'})=>({kind:'item',itemId:'dose',quantity:1,operation:'consume',target,note:''})
const doseRule=(key='new:a:0')=>({key,kind:'item',confirmed:true,operation:'consume',input:structuredClone(inputFields)})
const consume=(w=doseWorld(),target={kind:'self'},cost=1000)=>calculateRound(w,collection([entry('a',[dose(target)])]),params([timing('a',[cost])],[doseRule()]),'dose-use')
test('R03 расходники: две отдельные дозы, предел ресурса и удаление последнего экземпляра',()=>{
 const w=doseWorld(),before=structuredClone(w),c=collection([entry('a',[dose(),dose()])]),p=params([timing('a',[1000,1000])],[doseRule(),doseRule('new:a:1')])
 const result=calculateRound(w,c,p,'doses');assert.deepEqual(w,before);assert.equal(result.world.characters[0].resources.mana.current,'50');assert.equal(result.world.characters[0].rpg.inventory.length,0)
 assert.equal(result.summary.rules.length,2);assert.match(result.summary.rules[0].details,/40 → 47/);assert.match(result.summary.rules[1].details,/47 → 50/)
 assert.deepEqual(calculateRound(w,c,p,'doses'),result);assert.equal(result.world.campaign.revision,1)
})
test('R03 расходники: перенос сохраняет дозу и серверную цель; применение только в конце',()=>{
 const w=doseWorld();w.characters[1].resources.mana.current='40'
 const first=consume(w,{kind:'contact',id:'contact-b'},8000),saved=first.world.campaign.roundWork.entries[0]
 assert.equal(first.world.characters[0].rpg.inventory[0].quantity,2);assert.equal(first.world.characters[1].resources.mana.current,'40');assert.equal(saved.targetActorId,'b');assert(isRoundWork(first.world.campaign.roundWork))
 assert.deepEqual(copyRoundWork(first.world.campaign.roundWork),first.world.campaign.roundWork);assert(!JSON.stringify(personalRoundWork(first.world.campaign.roundWork,['a'])).includes('targetActorId'))
 const p=params([], [doseRule(saved.id)]);p.continuations=[{actorId:'a',mode:'continue',budgetMs:3000}]
 const result=calculateRound(first.world,collection([],'dose-next'),p,'dose-end')
 assert.equal(result.world.characters[0].rpg.inventory[0].quantity,1);assert.equal(result.world.characters[0].resources.mana.current,'40');assert.equal(result.world.characters[1].resources.mana.current,'47')
 assert.equal(result.world.campaign.roundWork.entries.length,0)
})
test('R03 расходники: реальная дальность XYZ, исчезновение и неподтверждённый контакт',()=>{
 const w=doseWorld({rangeM:6.1});w.characters[1].resources.mana.current='40';w.campaign.scenes.scenes[0].tokens[1].z=8;w.campaign.scenes.scenes[0].tokens[1].support={kind:'air'}
 const before=structuredClone(w);assert.throws(()=>consume(w,{kind:'contact',id:'contact-b'}),/дальности/);assert.deepEqual(w,before)
 const lost=doseWorld();lost.characters.pop();assert.throws(()=>consume(lost,{kind:'contact',id:'contact-b'}),/исчезла/)
 const c=collection([entry('a',[dose({kind:'contact',id:'b'})])]);c.entries[0].resolved=[]
 assert.throws(()=>calculateRound(doseWorld(),c,params([timing('a',[1000])],[doseRule()]),'no-contact'),/раскрытое существо/)
})
test('R03 расходники: дальность пересчитывается после движения цели в этом раунде',()=>{
 const w=doseWorld(),c=collection([entry('a',[dose({kind:'contact',id:'contact-b'})]),entry('b',[{kind:'move',route:[{x:20,y:2,z:0}],support:'ground',note:''}])])
 const p=params([timing('a',[2000]),timing('b',[1000])],[doseRule()],[]);p.movement={confirmed:true,bodies:[{actorId:'a',heightM:2},{actorId:'b',heightM:2}]}
 const before=structuredClone(w);assert.throws(()=>calculateRound(w,c,p,'moving-target'),/дальности/);assert.deepEqual(w,before)
})
test('R03 расходники: недопустимые цель, операция, количество и чужой инвентарь блокируются',()=>{
 assert.throws(()=>consume(doseWorld({targets:'self'}),{kind:'contact',id:'contact-b'}),/только на себя/)
 assert.throws(()=>consume(doseWorld(),{kind:'point',point:{x:8,y:2,z:0}}),/одна доза/)
 for(const patch of [{quantity:2},{operation:'activate'},{itemId:'foreign'}]){
  const w=doseWorld(),c=collection([entry('a',[{...dose(),...patch}])]),before=structuredClone(w)
  assert.throws(()=>calculateRound(w,c,params([timing('a',[1000])],[doseRule()]),'bad-dose'));assert.deepEqual(w,before)
 }
})
test('R03 расходники: условия, доступность и свободная рабочая рука проверяются явно',()=>{
 const w=doseWorld({requiresFreeHand:true,condition:'Подготовленная доза'}),input={...inputFields,distanceM:0}
 input.conditionsConfirmed=false;assert.match(consumeItemPlan(w,'a','dose','a',input,'condition').message,/условие/)
 input.conditionsConfirmed=true;input.accessible=false;assert.match(consumeItemPlan(w,'a','dose','a',input,'access').message,/недоступна/)
 input.accessible=true;input.distanceM=0
 w.characters[0].rpg.inventory.push({...emptyItem(),id:'busy',templateId:'',name:'Заняты руки',slot:'both',quantity:1,durability:100,equipped:true})
 assert.match(consumeItemPlan(w,'a','dose','a',input,'busy').message,/свободная рука/)
 w.characters[0].rpg.inventory.pop();w.characters[0].body.parts.leftHand.current=0;w.characters[0].body.parts.rightHand.current=0
 assert.match(consumeItemPlan(w,'a','dose','a',input,'hands').message,/свободная рука/)
})
test('R03 расходники: локальное лечение и кровь независимы; снятие только указанных травм',()=>{
 const w=doseWorld({healAmount:70,stopBleeding:true,cureLabels:['Лечимая']}),target=w.characters[1]
 target.rpg.physiology.normalMl=5000;target.rpg.physiology.currentMl=4000
 Object.assign(target.body.parts.torso,{bleeding:1,bleedingMlPerSecond:0,injuries:[{id:'one',label:'Лечимая',blocksUse:false,slowdown:0},{id:'two',label:'Остаётся',blocksUse:false,slowdown:0}]})
 const result=consumeItemPlan(w,'a','dose','b',{...inputFields,distanceM:6},'heal-dose');assert.equal(result.ok,true)
 const healed=result.plan.world.characters[1];assert.equal(healed.body.parts.torso.current,100);assert.equal(healed.body.parts.torso.bleeding,0);assert.equal(healed.body.parts.torso.bleedingMlPerSecond,0)
 assert.deepEqual(healed.body.parts.torso.injuries.map(i=>i.label),['Остаётся']);assert.equal(healed.rpg.physiology.currentMl,4000);assert.deepEqual(healed.resources.health,target.resources.health)
 const bad={...inputFields,distanceM:0,structureId:'foreign-structure'};assert.match(consumeItemPlan(w,'a','dose','a',bad,'bad-structure').message,/Структура/)
 const missing={...inputFields,distanceM:0,region:'missing'};assert.match(consumeItemPlan(w,'a','dose','a',missing,'missing-region').message,/локальное здоровье/)
})
test('R03 расходники: явный эффект обязателен; поломка, экипировка и смерть не списывают дозу',()=>{
 for(const patch of [{consumable:undefined},{consumable:emptyConsumableEffect()},{durability:0},{equipped:true,quantity:1,slot:'right'},{category:'tool'}]){
  const w=doseWorld();Object.assign(w.characters[0].rpg.inventory[0],patch);const before=structuredClone(w)
  assert.equal(consumeItemPlan(w,'a','dose','a',{...inputFields,distanceM:0},'invalid-dose').ok,false);assert.deepEqual(w,before)
 }
 const w=doseWorld();w.characters[1].rpg.dead=true;assert.match(consumeItemPlan(w,'a','dose','b',{...inputFields,distanceM:6},'dead-target').message,/не воскрешает/)
})
test('R03 расходники: временные эффекты имеют срок, прежнее складывание и независимый источник',()=>{
 const modifiers=[{parameter:'movement',flat:2,percent:0}]
 const w=doseWorld({restore:{mana:0,shadow:0,stamina:0},modifiers,duration:2,stackKey:'dose-group',stacking:'refresh'})
 const result=consumeItemPlan(w,'a','dose','a',{...inputFields,distanceM:0},'first-dose');assert(result.ok)
 const first=result.plan.world,second=consumeItemPlan(first,'a','dose','a',{...inputFields,distanceM:0},'second-dose');assert(second.ok)
 assert.equal(second.plan.world.characters[0].rpg.effects.length,1);assert.equal(second.plan.world.characters[0].rpg.effects[0].ownerId,'');assert.equal(second.plan.world.characters[0].rpg.inventory.length,0)
 assert.equal(advanceWorld(second.plan.world,2,'expire-dose').characters[0].rpg.effects.length,0)
 const bad=doseWorld({modifiers,duration:0});assert.match(consumeItemPlan(bad,'a','dose','a',{...inputFields,distanceM:0},'no-duration').message,/длительность/)
 for(const stacking of ['strongest','add']){
  const a=doseWorld({modifiers,duration:10,stackKey:'group',stacking}),one=consumeItemPlan(a,'a','dose','a',{...inputFields,distanceM:0},'one').plan.world,two=consumeItemPlan(one,'a','dose','a',{...inputFields,distanceM:0},'two').plan.world
  assert.equal(activeEffects(two.characters[0].rpg,0).length,stacking==='strongest'?1:2)
 }
})
test('R03 расходники: повтор события и одновременное воздействие на общую цель не назначают новый порядок',()=>{
 const w=doseWorld(),result=consumeItemPlan(w,'a','dose','a',{...inputFields,distanceM:0},'duplicate');assert(result.ok)
 assert.match(consumeItemPlan(result.plan.world,'a','dose','a',{...inputFields,distanceM:0},'duplicate').message,/уже учтено/)
 const c=collection([entry('a',[dose({kind:'contact',id:'contact-b'})]),entry('b',[{kind:'wait',seconds:1,note:''}])]),p=params([timing('a',[1000]),timing('b',[])],[doseRule()],[])
 assert.throws(()=>calculateRound(w,c,p,'simultaneous-dose'),/Одновременные/)
})
test('R03 расходники: копии/импорт сохраняют определение и не переносят неизвестные поля',()=>{
 const w=doseWorld({healAmount:3,modifiers:[{parameter:'movement',flat:2,percent:0}],duration:10}),i=w.characters[0].rpg.inventory[0]
 const copy=copyItem({...i,consumable:{...i.consumable,secret:'discarded',restore:{...i.consumable.restore,secret:1}}})
 assert.deepEqual(copy.consumable,i.consumable);assert(!JSON.stringify(copy).includes('secret'));copy.consumable.modifiers[0].flat=99;assert.equal(i.consumable.modifiers[0].flat,2)
 assert.deepEqual(copyRpg(w.characters[0].rpg).inventory[0].consumable,i.consumable);assert(isRpg(w.characters[0].rpg))
 for(const patch of [{healAmount:1.5},{rangeM:-1},{duration:Infinity},{targets:'hidden'},{restore:{mana:-1,shadow:0,stamina:0}}])assert.equal(isItem({...i,consumable:{...i.consumable,...patch}}),false)
})
