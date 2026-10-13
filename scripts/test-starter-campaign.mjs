import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'grani-starter-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src')){
 if(!file.endsWith('.ts'))continue
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const {createNightCrossing}=await module('starterCampaign')
const {isCampaign,copyCampaign}=await module('rpgSchema'),{isCharacterDraft}=await module('characterModel'),{sceneReferencesValid,isSceneState,copySceneState}=await module('scenes')
const {atlasReferencesValid,publicAtlas}=await module('campaignAtlas'),{tradeReferencesValid,publicTrade}=await module('campaignTrade'),{economyReferencesValid}=await module('campaignEconomy')
const {isStarterDraft,starterReady,STARTER_CREATE_PATH}=await module('starterCampaignDraft'),{calculateRound}=await module('roundExecution')
const {visualArtwork,isArtwork,artworkSource,portraitPresets,itemPresets,sceneBackgroundPresets,effectPresets}=await module('visualMedia')
test('Пример: три сцены, NPC, опора Z=3 и все ссылки принимаются действующим движком',()=>{
 const {world:w,npcIds}=createNightCrossing('copy-one'),ids=w.characters.map(a=>a.id)
 assert(isCampaign(w.campaign));assert(w.characters.every(isCharacterDraft));assert.deepEqual(npcIds,ids)
 assert(isSceneState(w.campaign.scenes));assert(sceneReferencesValid(w.campaign.scenes,ids));assert(atlasReferencesValid(w.campaign.atlas,ids,w.campaign.scenes.scenes.map(s=>s.id)))
 assert(tradeReferencesValid(w.campaign.trade,ids,w.campaign.atlas));assert(economyReferencesValid(w.campaign.economy,ids,w.campaign.trade));assert.equal(w.campaign.scenes.scenes.length,3)
 const side=w.campaign.scenes.scenes.find(s=>s.view==='side'),token=side.tokens[0],support=side.objects.find(o=>o.id===token.support.objectId)
 assert.equal(token.z,3);assert.equal(token.support.kind,'object');assert.equal(support.z+support.height,token.z);assert(support.canSupport)
 assert.equal(w.campaign.seconds,0);assert.equal(w.campaign.declarations,undefined);assert.equal(w.campaign.roundWork,undefined);assert(w.campaign.economy.rules.every(r=>!r.enabled))
 assert.deepEqual(w.campaign.perceptions,{version:1,heroes:[]})
})
test('Пример: свежие независимые копии; прежний сюжет не выдается за канон',()=>{
 const a=createNightCrossing('one'),same=createNightCrossing('one'),b=createNightCrossing('two'),before=structuredClone(same)
 a.world.characters[0].rpg.inventory[0].modelLength=2;a.world.campaign.scenes.scenes[0].objects[0].open=true;a.world.campaign.trade.merchants[0].stock[0].item.quantity=99
 assert.deepEqual(same,before);assert(b.npcIds.every(id=>!same.npcIds.includes(id)));assert.equal(b.world.campaign.trade.merchants[0].stock[0].item.quantity,6)
 assert.match(b.world.campaign.logs[0].details,/прежний сюжет P19 неизвестен/);assert.throws(()=>createNightCrossing('../unsafe'));assert.throws(()=>createNightCrossing('x'.repeat(81)))
 assert(!JSON.stringify(b).includes('Zed'));assert(!JSON.stringify(b).includes('Зед'))
})
test('Пример: копия кампании сохраняет пиксели, параметры 3D, галерею и секретные заметки',()=>{
 const w=createNightCrossing('backup').world,c=copyCampaign(JSON.parse(JSON.stringify(w.campaign)))
 assert.deepEqual(c,w.campaign);assert.deepEqual(copySceneState(c.scenes),c.scenes)
 const staff=c.items[0];assert.equal(staff.artwork,'pixel-staff');assert.deepEqual([staff.modelLength,staff.modelWidth,staff.modelDepth],[1.6,.12,.12]);assert.equal(c.abilities[0].preparation,8)
 c.scenes.scenes[0].objects[0].name='Моя сцена';c.items[0].name='Мой предмет';assert.notEqual(c.items[0].name,w.campaign.items[0].name)
})
test('Пример: открытые справочники не раскрывают идентификаторы NPC и заметки мастера',()=>{
 const w=createNightCrossing('privacy').world,p={atlas:publicAtlas(w.campaign.atlas),trade:publicTrade(w.campaign.trade,w.campaign.atlas)},json=JSON.stringify(p)
 for(const a of w.characters)assert(!json.includes(a.id))
 assert(!json.includes('Заметка мастера'));assert(!json.includes('Стартовые цены'));assert(!json.includes('guide-notes'));assert(!json.includes('supply-rule'))
 assert.equal(p.atlas.cities.length,1);assert.equal(p.trade.merchants[0].stock.length,1)
})
test('Пример: личный черновик и команда повтора имеют закрытую схему и фиксированную цель',()=>{
 const d={title:'Моя история',slots:'4',accepted:true,command:null};assert(isStarterDraft(d));assert(starterReady(d));assert(!starterReady({...d,accepted:false}));assert(isStarterDraft({...d,title:'',slots:''}))
 const b={exampleId:'night-crossing',version:1,title:d.title,slots:4,commandKey:'starter:abcdefgh'},command={path:STARTER_CREATE_PATH,body:JSON.stringify(b)}
 assert(isStarterDraft({...d,command}));for(const patch of [{command:{...command,path:'/lobbies/a/restore'}},{title:'Другая'},{accepted:false},{other:'world'}, {slots:'0'}, {command:{...command,body:JSON.stringify({...b,world:{}})}},{command:{...command,body:JSON.stringify({...b,version:2})}},{command:{...command,body:'oops'}}])assert(!isStarterDraft({...d,command,...patch}))
})
test('Пример: заряд переносится 5/8, завершается и отдельно выпускается на себя, Мана оплачивается один раз',()=>{
 const w=createNightCrossing('round').world,a=w.characters[0],scene=w.campaign.scenes.scenes[0],ability=a.rpg.abilities[0],before=structuredClone(w)
 const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
 const action=stage=>({kind:'ability',abilityId:ability.id,stage,target:{kind:stage==='prepare'?'none':'self'},note:''})
 const collection=(id,actions=[])=>({id,sceneId:scene.id,sceneName:scene.name,durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:[a.id],entries:actions.length?[{actorId:a.id,actorName:a.name,revision:1,status:'submitted',actions,resolved:[],submittedBy:'gm',submittedAt:'2026-10-12T00:00:00Z',note:''}]:[],history:[]})
 const rule=(key,charge='')=>({key,kind:'ability',confirmed:true,binding:'unbound',charge,input:fields})
 const input={timings:[{actorId:a.id,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:8000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[rule('new:'+a.id+':0')]}
 const first=calculateRound(w,collection('first',[action('prepare')]),input,'prepare').world;assert.deepEqual(w,before);assert.equal(first.campaign.seconds,5);assert.equal(first.characters[0].resources.mana.current,'9')
 const work=first.campaign.roundWork.entries[0];assert.deepEqual(work.amount.remaining,{numerator:'3000',denominator:'1'});assert.equal(first.characters[0].rpg.casts[0].status,'preparing')
 const second=calculateRound(first,collection('second'),{...input,timings:[],continuations:[{actorId:a.id,mode:'continue',budgetMs:5000}],rules:[rule(work.id)]},'finish').world
 assert.equal(second.campaign.roundWork.entries.length,0);assert.equal(second.characters[0].rpg.casts[0].status,'ready');assert.equal(second.characters[0].resources.mana.current,'9')
 const third=calculateRound(second,collection('third',[action('release')]),{...input,timings:[{actorId:a.id,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}],rules:[rule('new:'+a.id+':0','cast:'+second.characters[0].rpg.casts[0].id)]},'release').world
 assert.equal(third.characters[0].rpg.casts[0].status,'ended');assert.equal(third.characters[0].rpg.effects.length,1);assert.equal(third.characters[0].resources.mana.current,'9');assert.equal(third.campaign.seconds,15)
})
test('Материалы: новые SVG регистрируются безопасно; произвольные SVG и внешние URL не принимаются',async()=>{
 const keys=[...portraitPresets,...itemPresets,...sceneBackgroundPresets,...effectPresets].filter(k=>k.startsWith('pixel-'))
 assert.equal(new Set(keys).size,10)
 for(const k of new Set(keys)){assert(isArtwork(k));assert.equal(artworkSource(k),visualArtwork[k])}
 for(const value of ['data:image/svg+xml,<svg onload=alert(1)>','https://example.test/pic.svg','../assets/starter/portrait-guide.svg'])assert(!isArtwork(value))
 for(const file of (await readdir('src/assets/starter')).filter(f=>f.endsWith('.svg'))){const svg=await readFile('src/assets/starter/'+file,'utf8');assert(!/<script|<foreignObject|\bon\w+=|href=/i.test(svg));assert.match(svg,/shape-rendering="crispEdges"/)}
})
