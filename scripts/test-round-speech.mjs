import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'grani-speech-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src'))if(file.endsWith('.ts')){
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const {calculateRound,compatibleRoundExecutor}=await module('roundExecution'),{createDefaultCharacter}=await module('characterModel'),{emptyCampaign}=await module('rpgSchema')
const {createScene,emptyScenes}=await module('scenes'),{speechDistance,isSpeechJournalEntry,finishRoundSpeech}=await module('roundSpeech'),{isJournal,MAX_JOURNAL_ENTRIES}=await module('characterKnowledge')
function world(){const scenes=createScene(emptyScenes(),'hall','PRIVATE-SCENE','top');scenes.scenes[0].tokens=['speaker','clear','part','sound','silent'].map((actorId,index)=>({id:'token-'+actorId,actorId,x:index+2,y:5,z:0,diameter:1,support:{kind:'ground'}}));return {characters:['speaker','clear','part','sound','silent'].map(id=>({...createDefaultCharacter(),id,name:'PRIVATE-'+id})),campaign:{...emptyCampaign(),scenes}}}
const speech=(volume='whisper')=>({kind:'speak',target:{kind:'none'},volume,text:'Встречаемся у северных ворот. Пароль: ЛУНА.',note:'PRIVATE-PLAYER-NOTE'})
function collection(action=speech()){return {id:'collection',sceneId:'hall',sceneName:'PRIVATE-SCENE',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:['speaker'],entries:[{actorId:'speaker',actorName:'PRIVATE-speaker',revision:1,status:'submitted',actions:[action],resolved:[],submittedBy:'account-speaker',submittedAt:'2026-10-12T00:00:00Z',note:''}],history:[]}}
const hearer=(actorId,clarity='clear',fragment='')=>({actorId,clarity,speaker:'Незнакомый голос',fragment,signs:''})
const decision=(patch={})=>({key:'new:speaker:0',confirmed:true,reason:'PRIVATE-GM-REASON: стены и ветер проверены',recordedAt:'2026-10-12T11:20:00.000Z',hearers:[hearer('clear'),hearer('part','fragment','у северных ворот'),hearer('sound','sound')],...patch})
const input=(patch={})=>({timings:[{actorId:'speaker',entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,speech:[decision()],...patch})
const journal=(w,id)=>w.characters.find(c=>c.id===id).journal

test('R08: полная реплика, фрагмент, неразборчивый голос и молчание получают разные знания',()=>{
 const w=world(),before=structuredClone(w),result=calculateRound(w,collection(),input(),'heard')
 assert.deepEqual(w,before);assert.equal(result.world.campaign.seconds,5);assert.equal(result.summary.events[0].kind,'speak');assert.deepEqual(result.summary.events[0].atMs,{numerator:'1000',denominator:'1'})
 assert(journal(result.world,'speaker')[0].text.includes('Пароль: ЛУНА'));assert(journal(result.world,'clear')[0].text.includes('Пароль: ЛУНА'))
 assert(journal(result.world,'part')[0].text.includes('у северных ворот'));assert(!journal(result.world,'part')[0].text.includes('ЛУНА'))
 assert(!journal(result.world,'sound')[0].text.includes('северных'));assert.equal(journal(result.world,'silent').length,0)
 for(const id of ['clear','part','sound']){const text=JSON.stringify(journal(result.world,id));for(const secret of ['PRIVATE-speaker','PRIVATE-GM-REASON','PRIVATE-PLAYER-NOTE','PRIVATE-SCENE','account-speaker'])assert(!text.includes(secret),secret);assert(isJournal(journal(result.world,id)));assert(isSpeechJournalEntry(journal(result.world,id)[0]));assert.equal(journal(result.world,id)[0].gameTime,'1 с')}
 assert.equal(result.summary.speech[0].heard.length,3)
})
test('R08: решение мастера обязательно; дубль, чужой ключ, самослушатель и подмена фрагмента блокируются атомарно',()=>{
 const w=world(),before=structuredClone(w)
 const bad=[undefined,[],[decision({confirmed:false})],[decision({reason:''})],[decision({recordedAt:''})],[decision({key:'new:silent:0'})],
  [decision({hearers:[hearer('speaker')]})],[decision({hearers:[hearer('part','fragment','ЧУЖИЕ СЛОВА')]})],
  [decision({hearers:[hearer('clear'),hearer('clear')]})],[decision({hearers:[{...hearer('clear'),privateId:'secret'}]})],
  [decision({hearers:[{...hearer('sound','sound'),fragment:'Пароль: ЛУНА.'}]})]]
 for(const value of bad){assert.throws(()=>calculateRound(w,collection(),input({speech:value}),'invalid'),/слышимости/);assert.deepEqual(w,before)}
})
test('R08: чужая сцена, исчезнувший и недееспособный слушатель, отсутствующая отметка говорящего блокируются',()=>{
 for(const kind of ['foreign','removed','unconscious','dead','speaker']){const w=world();if(kind==='foreign')w.campaign.scenes.scenes[0].tokens=w.campaign.scenes.scenes[0].tokens.filter(t=>t.actorId!=='clear');if(kind==='removed')w.characters=w.characters.filter(c=>c.id!=='clear');if(kind==='unconscious')w.characters.find(c=>c.id==='clear').body.consciousness='unconscious';if(kind==='dead')w.characters.find(c=>c.id==='clear').rpg.dead=true;if(kind==='speaker')w.campaign.scenes.scenes[0].tokens=w.campaign.scenes.scenes[0].tokens.filter(t=>t.actorId!=='speaker');const before=structuredClone(w);assert.throws(()=>['dead','unconscious'].includes(kind)?finishRoundSpeech(w,{id:'direct',actorId:'speaker',sceneId:'hall',action:speech()},'new:speaker:0',decision()):calculateRound(w,collection(),input(),'scene-check'),/сцене|сознании/);assert.deepEqual(w,before)}
})
test('R08: незавершённая реплика переносится без раскрытия; следующий раунд требует нового решения',()=>{
 const w=world(),first=calculateRound(w,collection(),input({timings:[{actorId:'speaker',entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:8000}]}]}),'carry')
 for(const a of first.world.characters)assert.equal(a.journal.length,0)
 assert.equal(first.summary.speech,undefined);assert.equal(first.world.campaign.roundWork.entries[0].amount.remaining.numerator,'3000')
 const next={...collection(),id:'next',entries:[]},continued={timings:[],continuations:[{actorId:'speaker',mode:'continue',budgetMs:5000}],missingDecisions:[],interactionsConfirmed:false}
 assert.throws(()=>calculateRound(first.world,next,continued,'next'),/слышимости/)
 const workId=first.world.campaign.roundWork.entries[0].id,second=calculateRound(first.world,next,{...continued,speech:[decision({key:workId,hearers:[hearer('silent')]})]},'next')
 assert.equal(journal(second.world,'clear').length,0);assert.equal(journal(second.world,'silent').length,1);assert.equal(journal(second.world,'speaker').length,1);assert.equal(second.world.campaign.roundWork.entries.length,0);assert.equal(second.summary.speech[0].key,workId)
})
test('R08: сохранение без продвижения не раздаёт реплики и не требует решения для удержанной работы',()=>{
 const first=calculateRound(world(),collection(),input({timings:[{actorId:'speaker',entryRevision:1,budgetMs:1000,costs:[{index:0,personalMs:8000}]}]}),'hold-first')
 const next={...collection(),id:'hold',entries:[]},held=calculateRound(first.world,next,{timings:[],continuations:[{actorId:'speaker',mode:'hold',budgetMs:5000}],missingDecisions:[{actorId:'speaker',reason:'Мастер сохраняет работу'}],interactionsConfirmed:false},'held')
 assert.deepEqual(held.world.campaign.roundWork,first.world.campaign.roundWork);assert(held.world.characters.every(c=>c.journal.length===0))
})
test('R08: шёпот, речь и крик расходуют заданное время; ноль слушателей не даёт автоматический штраф',()=>{
 for(const volume of ['whisper','normal','shout']){const w=world(),result=calculateRound(w,collection(speech(volume)),input({speech:[decision({hearers:[]})]}),'volume-'+volume);assert.equal(result.summary.speech[0].volume,volume);assert.equal(result.summary.speech[0].heard.length,0);assert.equal(result.world.campaign.seconds,5);assert.equal(journal(result.world,'speaker').length,1);assert.equal(result.world.characters[0].resources.mana.current,w.characters[0].resources.mana.current)}
})
test('R08: подсказка дальности учитывает Z и не задаёт радиус слышимости',()=>{
 const locations=[{sceneId:'s',actorId:'a',x:0,y:0,z:0},{sceneId:'s',actorId:'b',x:3,y:4,z:12},{sceneId:'other',actorId:'c',x:0,y:0,z:0}]
 assert.equal(speechDistance(locations,'s','a','b'),13);assert.equal(speechDistance(locations,'s','a','c'),null);assert.equal(speechDistance([{sceneId:'s',actorId:'a'}],'s','a','b'),null)
 const w=world();w.campaign.scenes.scenes[0].tokens.find(t=>t.actorId==='clear').x=25;assert.equal(calculateRound(w,collection(),input(),'manual-range').summary.speech[0].heard.length,3,'No unapproved automatic range')
})
test('R08: заполненный журнал и повтор события не удаляют записи и блокируют весь расчёт',()=>{
 const w=world(),sample={id:'note',origin:'manual',title:'Заметка',text:'Сохранить',category:'other',certainty:'hypothesis',source:'Я',gameTime:'0 с',annotation:'',createdAt:'2026-10-12T00:00:00.000Z',updatedAt:'2026-10-12T00:00:00.000Z'}
 w.characters.find(c=>c.id==='clear').journal=Array.from({length:MAX_JOURNAL_ENTRIES},(_,i)=>({...sample,id:'note-'+i}));const before=structuredClone(w)
 assert.throws(()=>calculateRound(w,collection(),input(),'full'),/журнал/);assert.deepEqual(w,before)
 const r=calculateRound(world(),collection(),input(),'same-seed');assert.throws(()=>finishRoundSpeech(r.world,{id:r.summary.events[0].workId,actorId:'speaker',sceneId:'hall',action:speech()},'new:speaker:0',decision()),/уже есть/)
})
test('R08: одинаковые параметры воспроизводят слова и журнал; старые исполненные раунды совместимы',()=>{
 const w=world(),c=collection(),params=input();assert.deepEqual(calculateRound(w,c,params,'repeat'),calculateRound(w,c,params,'repeat'))
 assert(compatibleRoundExecutor('r04-round-history-v8'));assert(compatibleRoundExecutor('r04-round-history-v7'));assert(!compatibleRoundExecutor('unrelated'))
})
