import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'grani-listening-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src'))if(file.endsWith('.ts')){
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a.replace(/\.ts$/,'')+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const {calculateRound,compatibleRoundExecutor}=await module('roundExecution'),{createDefaultCharacter}=await module('characterModel'),{emptyCampaign}=await module('rpgSchema')
const {createScene,emptyScenes}=await module('scenes'),{listeningRows,listeningFocusLabel}=await module('roundListening')
const {isDeclaredAction,copyDeclaredAction,actionKinds,actionSummary,actionTarget}=await module('actionDeclarations'),{isRoundWork}=await module('roundWork')
const plain=seconds=>({kind:'wait',seconds,note:''}),listen=(seconds=2,mode='eavesdrop',target={kind:'none'})=>({...plain(seconds),listening:{mode,target}})
function world(){const scenes=createScene(emptyScenes(),'hall','Hall','top');scenes.scenes[0].tokens=['listener','speaker'].map((actorId,i)=>({id:'token-'+actorId,actorId,x:2+i,y:5,z:0,diameter:1,support:{kind:'ground'}}));return {characters:['listener','speaker'].map(id=>({...createDefaultCharacter(),id,name:id})),campaign:{...emptyCampaign(),scenes}}}
const entry=(actorId,actions)=>({actorId,actorName:actorId,revision:1,status:'submitted',actions,resolved:[],submittedBy:'account-'+actorId,submittedAt:'2026-10-12T11:45:00Z',note:''})
const collection=(entries,id='collection')=>({id,sceneId:'hall',sceneName:'Hall',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:entries.map(e=>e.actorId),entries,history:[]})
const input=entries=>({timings:entries.map(e=>({actorId:e.actorId,entryRevision:1,budgetMs:5000,costs:e.actions.flatMap((a,index)=>a.kind==='wait'?[]:[{index,personalMs:1000}])})),continuations:[],missingDecisions:[],interactionsConfirmed:false})
const amount=ms=>({numerator:String(ms),denominator:'1'})

test('R08 listening: старое ожидание совместимо; режим и фокус копируются без ссылок и скрытых флагов',()=>{
 const old=plain(2);assert(isDeclaredAction(old));assert.deepEqual(copyDeclaredAction(old),old)
 const a=listen(1.25,'listen',{kind:'point',point:{x:3.1,y:4.2,z:5.3}}),copy=copyDeclaredAction(a);assert(isDeclaredAction(a));assert.deepEqual(copy,a);copy.listening.target.point.x=8;assert.equal(a.listening.target.point.x,3.1)
 assert.equal(actionTarget(a).point.z,5.3);assert.match(actionSummary(a),/Прислушиваться/);assert.equal(actionKinds.length,6)
 for(const wrong of [{...a,listening:{...a.listening,success:true}},{...a,listening:{...a.listening,mode:'auto'}},{...a,listening:{mode:'listen',target:{kind:'area',point:{x:1,y:2,z:3}}}},{kind:'listen',note:'',seconds:1},{kind:'speak',note:'',text:'Текст',volume:'normal',target:{kind:'none'},listening:a.listening}])assert(!isDeclaredAction(wrong))
})
test('R08 listening: заявленное внимание занимает ровно время ожидания и само не открывает знания',()=>{
 for(const mode of ['listen','eavesdrop']){const w=world(),before=structuredClone(w),entries=[entry('listener',[listen(1.25,mode)])],r=calculateRound(w,collection(entries),input(entries),'focus-'+mode)
 assert.deepEqual(w,before);assert.equal(r.world.campaign.seconds,5);assert.equal(r.summary.events[0].kind,'wait');assert.equal(r.summary.events[0].listening,mode);assert.deepEqual(r.summary.events[0].atMs,amount(1250));assert.deepEqual(r.summary.listeningWindows[0].fromMs,amount(0));assert.deepEqual(r.summary.listeningWindows[0].toMs,amount(1250));assert(r.summary.listeningWindows[0].completes);assert(r.world.characters.every(a=>a.journal.length===0));assert.deepEqual(r.world.characters[0].resources,w.characters[0].resources)}
})
test('R08 listening: перенос хранит режим, XYZ и остаток; завершение продолжения не начинается с нуля',()=>{
 const target={kind:'point',point:{x:8.5,y:9.25,z:3}},entries=[entry('listener',[listen(8,'eavesdrop',target)])],first=calculateRound(world(),collection(entries),input(entries),'long-listen'),saved=first.world.campaign.roundWork.entries[0]
 assert(isRoundWork(first.world.campaign.roundWork));assert.deepEqual(saved.action.listening,{mode:'eavesdrop',target});assert.deepEqual(saved.amount.remaining,amount(3000));assert(!first.summary.listeningWindows[0].completes)
 const c={...collection([],'next'),participantIds:['listener']},params={...input([]),continuations:[{actorId:'listener',mode:'continue',budgetMs:9000}]},next=calculateRound(first.world,c,params,'finish-listen')
 assert.deepEqual(next.summary.listeningWindows[0].toMs,amount(3000));assert.equal(next.summary.listeningWindows[0].key,saved.id);assert(next.summary.listeningWindows[0].completes);assert.equal(next.world.campaign.roundWork.entries.length,0);assert(next.world.characters.every(a=>a.journal.length===0))
})
test('R08 listening: удержанная работа не изображается активным подслушиванием',()=>{
 const entries=[entry('listener',[listen(8)])],first=calculateRound(world(),collection(entries),input(entries),'hold-start'),c={...collection([],'held'),participantIds:['listener']}
 const r=calculateRound(first.world,c,{...input([]),continuations:[{actorId:'listener',mode:'hold',budgetMs:5000}],missingDecisions:[{actorId:'listener',reason:'Сохранить внимание без продвижения'}]},'hold-end')
 assert.equal(r.summary.listeningWindows,undefined);assert.deepEqual(r.world.campaign.roundWork,first.world.campaign.roundWork)
})
test('R08 listening: внимание после длинной прежней работы начнётся только после её завершения',()=>{
 const entries=[entry('listener',[plain(8),listen(4)])],first=calculateRound(world(),collection(entries),input(entries),'queued')
 assert.equal(first.summary.listeningWindows,undefined);assert.equal(first.world.campaign.roundWork.entries.length,2)
 const next=calculateRound(first.world,{...collection([],'queued-next'),participantIds:['listener']},{...input([]),continuations:[{actorId:'listener',mode:'continue',budgetMs:5000}]},'queued-next')
 assert.deepEqual(next.summary.listeningWindows[0].fromMs,amount(3000));assert.deepEqual(next.summary.listeningWindows[0].toMs,amount(5000));assert(!next.summary.listeningWindows[0].completes);assert.deepEqual(next.world.campaign.roundWork.entries[0].amount.remaining,amount(2000))
})
test('R08 listening: выбранный фокус не выдаёт слова автоматически и не превращается в скрытность',()=>{
 const utterance={kind:'speak',volume:'whisper',target:{kind:'none'},text:'ПРИВАТНЫЙ ПАРОЛЬ',note:''},entries=[entry('listener',[listen(2)]),entry('speaker',[utterance])],params=input(entries)
 assert.throws(()=>calculateRound(world(),collection(entries),params,'no-auto-hearing'),/слышимости/)
 params.speech=[{key:'new:speaker:0',confirmed:true,reason:'Мастер решил, что шёпот не слышен',recordedAt:'2026-10-12T11:45:00.000Z',hearers:[]}]
 const no=calculateRound(world(),collection(entries),params,'no-hearer');assert.equal(no.world.characters[0].journal.length,0);assert.equal(no.summary.speech[0].heard.length,0)
 params.speech[0].hearers=[{actorId:'listener',clarity:'fragment',speaker:'Голос',fragment:'ПАРОЛЬ',signs:''}]
 const yes=calculateRound(world(),collection(entries),params,'explicit-hearer');assert(yes.world.characters[0].journal[0].text.includes('ПАРОЛЬ'));assert(!yes.world.characters[0].journal[0].text.includes('ПРИВАТНЫЙ'));assert(!yes.world.characters[1].journal[0].text.includes('listener'))
})
test('R08 listening: пассивная слышимость вне времени внимания остаётся решением мастера',()=>{
 const entries=[entry('listener',[listen(2)]),entry('speaker',[plain(2),{kind:'speak',volume:'normal',target:{kind:'none'},text:'ПОЗДНЯЯ РЕЧЬ',note:''}])],params=input(entries)
 params.speech=[{key:'new:speaker:1',confirmed:true,reason:'Речь слышна и после ожидания',recordedAt:'2026-10-12T11:45:00.000Z',hearers:[{actorId:'listener',clarity:'clear',speaker:'Голос',fragment:'',signs:''}]}]
 const r=calculateRound(world(),collection(entries),params,'passive');assert.deepEqual(r.summary.listeningWindows[0].toMs,amount(2000));assert.deepEqual(r.summary.speech[0].atMs,amount(3000));assert(r.world.characters[0].journal[0].text.includes('ПОЗДНЯЯ'))
})
test('R08 listening: мастер видит только выбранные новые/продолжаемые намерения, обычное ожидание не добавляет окно',()=>{
 const entries=[entry('listener',[plain(1),listen(2,'listen',{kind:'object',id:'door'})])],c=collection(entries),r=calculateRound(world(),c,input(entries),'plans'),rows=listeningRows(c,{version:1,entries:[]},[])
 assert.equal(rows.length,1);assert.equal(rows[0].key,'new:listener:1');assert.equal(listeningFocusLabel(rows[0],[{id:'door',name:'Дверь'}]),'Дверь');assert.deepEqual(r.summary.listeningWindows[0].fromMs,amount(1000));assert.deepEqual(r.summary.listeningWindows[0].toMs,amount(3000))
 const old=calculateRound(world(),collection([entry('listener',[plain(1)])]),input([entry('listener',[plain(1)])]),'old-wait');assert.equal(old.summary.listeningWindows,undefined);assert.equal(old.summary.events[0].listening,undefined);assert(compatibleRoundExecutor('r08-round-speech-v1'))
})
