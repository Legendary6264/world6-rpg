import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'grani-tutorial-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src')){
 if(!file.endsWith('.ts'))continue
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const tutorial=await module('tutorialWorld'),progress=await module('tutorialProgress')
const {isCampaign}=await module('rpgSchema'),{isCharacterDraft}=await module('characterModel'),{isSceneState,sceneReferencesValid}=await module('scenes'),{perceptionReferencesValid}=await module('scenePerception')
const create=(path='player')=>tutorial.createTutorialSession(path)
const hero=s=>tutorial.tutorialHero(s),scene=s=>tutorial.tutorialScene(s)
const declared=(s,action)=>tutorial.declareTutorial(s,{kind:'action',action})
const execute=(s,action)=>{const d=declared(s,action);return tutorial.applyTutorial(d,tutorial.calculateTutorial(d))}
const spell=(s,stage)=>({kind:'ability',note:'',abilityId:hero(s).rpg.abilities[0].id,stage,target:{kind:stage==='prepare'?'none':'self'}})
const prepare=s=>execute(s,spell(s,'prepare'))
test('Обучение: независимые исходники, один герой, нативная схема и никакого аккаунта',()=>{
 const a=create(),b=create(),before=structuredClone(b);assert.notEqual(a.id,b.id);assert.equal(a.world.characters.filter(x=>x.id===a.heroId).length,1)
 assert(isCampaign(a.world.campaign));assert(a.world.characters.every(isCharacterDraft));assert(isSceneState(a.world.campaign.scenes));assert(sceneReferencesValid(a.world.campaign.scenes,a.world.characters.map(x=>x.id)));assert(perceptionReferencesValid(a.world.campaign.perceptions,a.world.campaign.scenes,a.world.characters.map(x=>x.id)))
 assert.equal(a.world.campaign.trade,undefined);assert.equal(a.world.campaign.atlas,undefined);assert.equal(a.world.campaign.economy,undefined);assert.deepEqual(a.world.campaign.logs,[])
 a.world.characters[0].name='Другой';a.world.campaign.scenes.scenes[0].objects[0].name='Правка';assert.deepEqual(b,before)
 for(const field of ['accountId','ownerId','permissions','token','lobbyId'])assert.equal(a[field],undefined)
})
test('Обучение: три сцены, расстановка, индивидуальное раскрытие, опора и Z=3',()=>{
 let s=create('master');assert(!tutorial.tutorialMap(s).contacts.some(c=>c.kind==='identified'))
 for(const next of s.world.campaign.scenes.scenes){const before=structuredClone(s);s=tutorial.openTutorialScene(s,next.id);assert.equal(s.world.campaign.seconds,0);assert.deepEqual(before.world.campaign.seconds,0);assert.equal(scene(s).id,next.id);assert.equal(tutorial.tutorialMap(s).frame.id,next.id)}
 s=tutorial.placeTutorialGuide(s,{x:7,y:2,z:0});assert(!tutorial.tutorialMap(s).contacts.some(c=>c.kind==='identified'));const hidden=structuredClone(s)
 s=tutorial.discloseTutorialGuide(s,true);assert(tutorial.tutorialMap(s).contacts.some(c=>c.label==='Учебный проводник'));assert(!tutorial.tutorialMap(hidden).contacts.some(c=>c.kind==='identified'))
 s=tutorial.discloseTutorialGuide(s,false);assert(!tutorial.tutorialMap(s).contacts.some(c=>c.kind==='identified'));assert(scene(s).tokens.some(t=>t.actorId===s.guideId))
 const support=scene(s).objects.find(o=>o.canSupport),point={x:15,y:2,z:3};s=tutorial.placeTutorialHero(s,point,{kind:'object',objectId:support.id})
 const self=tutorial.tutorialMap(s).contacts.find(c=>c.kind==='self');assert.equal(self.z,3);assert.equal(self.support,'object');assert(!self.flying)
 assert.throws(()=>tutorial.placeTutorialHero(s,{x:15,y:2,z:2},{kind:'object',objectId:support.id}));assert.equal(tutorial.tutorialMap(s).contacts.find(c=>c.kind==='self').z,3)
})
test('Обучение: заявление и повтор расчёта не меняют мир; применение отдельно, движение свободное',()=>{
 const initial=create(),before=structuredClone(initial),p={x:7.125,y:6.375,z:0},s=declared(initial,{kind:'move',note:'',route:[p],support:'ground'}),preview=tutorial.calculateTutorial(s),again=tutorial.calculateTutorial(s)
 assert.deepEqual(initial,before);assert.deepEqual(s.world,initial.world);assert.deepEqual(preview,again);assert.equal(s.world.campaign.seconds,0)
 const after=tutorial.applyTutorial(s,preview);assert.equal(after.world.campaign.seconds,5);assert.equal(after.statement,null);assert.deepEqual(scene(after).tokens.find(t=>t.actorId===after.heroId),{actorId:after.heroId,...p,diameter:.8,support:{kind:'ground'}})
 assert.throws(()=>tutorial.applyTutorial(after,preview),/устарел/);assert.deepEqual(initial,before)
})
test('Обучение: открытие/закрытие и снаряжение используют обычный исполнитель и сохраняют 3D',()=>{
 let s=create();const door=scene(s).objects.find(o=>o.kind==='door'),staff=hero(s).rpg.inventory[0],sizes=[staff.modelLength,staff.modelWidth,staff.modelDepth]
 s=execute(s,{kind:'interact',note:'',operation:'open',target:{kind:'object',id:door.id}});assert(scene(s).objects.find(o=>o.id===door.id).open)
 s=execute(s,{kind:'interact',note:'',operation:'close',target:{kind:'object',id:door.id}});assert(!scene(s).objects.find(o=>o.id===door.id).open)
 s=execute(s,{kind:'item',note:'',itemId:staff.id,quantity:1,operation:'equip',target:{kind:'self'}});assert(hero(s).rpg.inventory[0].equipped);assert.deepEqual([hero(s).rpg.inventory[0].modelLength,hero(s).rpg.inventory[0].modelWidth,hero(s).rpg.inventory[0].modelDepth],sizes)
 assert.equal(s.world.campaign.seconds,15)
})
test('Обучение: осмотр и своя реплика имеют явный ручной результат, без нового знания и слушателей',()=>{
 let s=create(),perception=structuredClone(s.world.campaign.perceptions),a=declared(s,{kind:'speak',note:'',target:{kind:'none'},volume:'whisper',text:'Учебный шёпот'}),p=tutorial.calculateTutorial(a)
 assert.match(p.manualResult,/без слушателей/);assert.equal(a.journal.length,0);s=tutorial.applyTutorial(a,p);assert.match(s.journal[0],/Учебный шёпот/);assert.deepEqual(s.world.campaign.perceptions,perception)
 const door=scene(s).objects.find(o=>o.kind==='door');a=declared(s,{kind:'interact',note:'',operation:'inspect',target:{kind:'object',id:door.id}});p=tutorial.calculateTutorial(a);assert.match(p.manualResult,/скрытых находок/);s=tutorial.applyTutorial(a,p);assert.deepEqual(s.world.campaign.perceptions,perception)
 assert.throws(()=>declared(s,{kind:'speak',note:'',target:{kind:'self'},volume:'shout',text:'Не передавать'}),/без слушателей/)
})
test('Обучение: 5/8, пауза, продолжение, отдельный выпуск и однократная Мана',()=>{
 let s=prepare(create());assert.equal(s.world.campaign.seconds,5);assert.equal(hero(s).resources.mana.current,'9');assert.equal(hero(s).rpg.casts[0].status,'preparing')
 assert.deepEqual(s.world.campaign.roundWork.entries[0].amount.remaining,{numerator:'3000',denominator:'1'})
 assert.throws(()=>declared(s,{kind:'wait',note:'',seconds:1}),/прежней работы/);assert.throws(()=>tutorial.openTutorialScene(s,s.world.campaign.scenes.scenes[1].id),/прежней сцене/)
 const d=tutorial.declareTutorial(s,{kind:'continue'}),p=tutorial.calculateTutorial(d),paused=tutorial.pauseTutorial(d,true),before=structuredClone(paused.world)
 assert.throws(()=>tutorial.calculateTutorial(paused),/Пауза/);assert.throws(()=>tutorial.applyTutorial(paused,p),/устарел/);assert.deepEqual(paused.world,before)
 const resumed=tutorial.pauseTutorial(paused,false);assert.throws(()=>tutorial.applyTutorial(resumed,p),/устарел/);s=tutorial.applyTutorial(resumed,tutorial.calculateTutorial(resumed))
 assert.equal(s.world.campaign.seconds,10);assert.equal(hero(s).rpg.casts[0].status,'ready');assert.equal(s.world.campaign.roundWork.entries.length,0)
 s=execute(s,spell(s,'release'));assert.equal(s.world.campaign.seconds,15);assert.equal(hero(s).resources.mana.current,'9');assert.equal(hero(s).rpg.casts[0].status,'ended');assert.equal(hero(s).rpg.effects.length,1)
})
test('Обучение: чужая копия, изменённый мир/заявление/пауза и подменённые последствия отклоняются',()=>{
 const d=declared(create(),{kind:'wait',note:'',seconds:2}),p=tutorial.calculateTutorial(d)
 for(const changed of [tutorial.clearTutorialStatement(d),declared(d,{kind:'wait',note:'',seconds:3}),tutorial.pauseTutorial(d,true),{...d,world:{...d.world,campaign:{...d.world.campaign,seconds:1}}},declared(create(),{kind:'wait',note:'',seconds:2})])assert.throws(()=>tutorial.applyTutorial(changed,p),/устарел/)
 const bad=structuredClone(p);bad.world.characters[0].resources.mana.current='0';assert.throws(()=>tutorial.applyTutorial(d,bad),/изменились/)
 const other=structuredClone(p);other.manualResult='Выдать награду';assert.throws(()=>tutorial.applyTutorial(d,other),/изменились/)
})
test('Обучение: точка, зависимость отката и переигровка не сохраняют мир вне памяти',()=>{
 let s=tutorial.checkpointTutorial(create()),before=structuredClone(s.world)
 s=execute(s,{kind:'wait',note:'',seconds:2});const after=structuredClone(s.world);s=tutorial.undoTutorial(s);assert.deepEqual(s.world,before);assert(s.statement)
 s=tutorial.applyTutorial(s,tutorial.calculateTutorial(s));assert.equal(s.world.campaign.seconds,after.campaign.seconds)
 const changed=tutorial.openTutorialScene(s,s.world.campaign.scenes.scenes[1].id);assert.throws(()=>tutorial.undoTutorial(changed),/мир изменился/)
 const restored=tutorial.restoreTutorial(changed);assert.deepEqual(restored.world,before);assert.equal(restored.round,0);assert.equal(restored.statement,null);assert.equal(restored.lastRound,null)
 const fresh=create();assert.equal(fresh.checkpoint,null);assert.equal(fresh.world.campaign.seconds,0);assert.equal(fresh.world.campaign.roundWork,undefined)
})
test('Обучение: строгие отметки по версии, гостю, аккаунту и пути; только известные поля',()=>{
 const p=progress.emptyTutorialProgress();assert(progress.isTutorialProgress(p));assert.equal(progress.tutorialScope(),'guest');assert.notEqual(progress.tutorialProgressKey('guest'),progress.tutorialProgressKey(progress.tutorialScope('account-a')))
 for(const patch of [{version:2},{playerSteps:[0,0]},{masterSteps:[5]},{preferred:'ADMIN'},{introSeen:1},{world:{}},{role:'GM'},{token:'secret'}])assert(!progress.isTutorialProgress({...p,...patch}))
 const marked=progress.markTutorialStep(p,'player',2);assert.deepEqual(marked.playerSteps,[2]);assert.deepEqual(p.playerSteps,[]);assert.deepEqual(marked.masterSteps,[]);assert.throws(()=>progress.markTutorialStep(p,'master',8))
 const rows=new Map(),storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v)},scope='account:test-'+crypto.randomUUID()
 assert(progress.writeTutorialProgress(scope,marked,storage));assert.deepEqual(progress.readTutorialProgress(scope,storage).progress,marked)
 assert.deepEqual(progress.readTutorialProgress('other-'+crypto.randomUUID(),storage).progress,p)
 const raw=JSON.parse([...rows.values()][0]);assert.deepEqual(Object.keys(raw).sort(),Object.keys(p).sort());assert(!JSON.stringify(raw).includes('tutorial_'))
})
test('Обучение: повреждённая запись и недоступное хранилище не ломают маршрут',()=>{
 const scope='broken-'+crypto.randomUUID(),empty=progress.emptyTutorialProgress(),marked=progress.markTutorialStep(empty,'master',1)
 assert.deepEqual(progress.readTutorialProgress(scope,{getItem:()=>'{broken',setItem:()=>{}}).progress,empty)
 assert.deepEqual(progress.readTutorialProgress('huge-'+scope,{getItem:()=> 'x'.repeat(2001),setItem:()=>{}}).progress,empty)
 const blocked={getItem:()=>{throw Error('Blocked')},setItem:()=>{throw Error('Full')}};assert(progress.readTutorialProgress(scope,blocked).memoryOnly);assert(!progress.writeTutorialProgress(scope,marked,blocked))
 const r=progress.readTutorialProgress(scope,blocked);assert(r.memoryOnly);assert.deepEqual(r.progress,marked);r.progress.masterSteps.push(4);assert.deepEqual(progress.readTutorialProgress(scope,blocked).progress.masterSteps,[1])
 assert(!progress.writeTutorialProgress(scope,{...marked,role:'GM'},blocked));assert.deepEqual(progress.readTutorialProgress(scope,blocked).progress,marked)
})
