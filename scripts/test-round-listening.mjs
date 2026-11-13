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
const {createScene,emptyScenes,sceneObject,copySceneState,isSceneState}=await module('scenes'),{listeningRows,listeningFocusLabel}=await module('roundListening')
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

const point=(x,y=5,z=0)=>({x,y,z})
const open={kind:'interact',operation:'open',target:{kind:'object',id:'door'},note:''}
const stampedAt='2026-11-10T00:00:00.000Z'
const doorEntry=()=>({...entry('speaker',[open]),resolved:[{index:0,objectId:'door'}]})
const move=(x,support='ground')=>({kind:'move',support,route:[point(x)],note:''})
const actualInput=entries=>({...input(entries),interactionsConfirmed:true,soundRecordedAt:stampedAt})
const moveBodies={confirmed:true,bodies:['listener','speaker'].map(actorId=>({actorId,heightM:1.8}))}
const airSpeed=Math.sqrt(1.4*287.05*293.15)
const closeTo=(actual,expected)=>assert(Math.abs(actual-expected)<.0001,`${actual} ≈ ${expected}`)
function travelWorld(backgroundNoiseDb=34){
  const w=world(), scene=w.campaign.scenes.scenes[0]
  scene.width=80;scene.physics={version:1,gravityMs2:9.81,ambientTemperatureK:293.15,backgroundNoiseDb,eventSounds:true,soundTravel:true}
  scene.objects=[{...sceneObject('door','door',point(4)),width:.2,depth:1.2,height:3}]
  scene.tokens[0].x=34;scene.tokens[1].x=2
  return {w,scene}
}
const doorReport=r=>r.summary.sounds.find(s=>s.kind==='door')

test('Слышимость проверяет окно внимания по времени прихода волны',()=>{
  const {w}=travelWorld()
  const entries=[doorEntry(),entry('listener',[plain(1.04),listen(.12,'listen',{kind:'point',point:point(4)})])]
  const before=structuredClone(w)
  const heard=calculateRound(w,collection(entries),actualInput(entries),'wave-focus-after')
  const cue=doorReport(heard).heard.find(h=>h.actorId==='listener')
  assert.equal(cue.focused,true)
  closeTo(cue.arrivalMs,30/airSpeed*1000);closeTo(cue.receivedAtMs,1000+30/airSpeed*1000)
  closeTo(Number.parseFloat(heard.world.characters[0].journal[0].gameTime),1+30/airSpeed)
  assert.deepEqual(w,before)
  entries[1].actions=[listen(1.04,'listen')]
  const missed=calculateRound(w,collection(entries),actualInput(entries),'wave-focus-before')
  assert(!doorReport(missed).heard.some(h=>h.actorId==='listener'))
  assert.equal(missed.world.characters[0].journal.length,0)
})

test('Волна встречает идущего слушателя по пути, с поправкой к задержке',()=>{
  const {w}=travelWorld(25)
  const entries=[doorEntry(),entry('listener',[plain(.95),move(20)])]
  const r=calculateRound(w,collection(entries),{...actualInput(entries),movement:moveBodies},'wave-moving-ear')
  const cue=doorReport(r).heard.find(h=>h.actorId==='listener')
  closeTo(cue.arrivalMs,29.3/(airSpeed+14)*1000)
  assert.equal(cue.direction,'с запада')
  assert(r.summary.sounds.some(s=>s.kind==='footstep'&&s.actorId==='listener'))
  assert(r.summary.sounds.filter(s=>s.kind==='footstep').every(s=>!s.heard.some(h=>h.actorId==='listener')))
})

test('Пересечение волны находится внутри отрезка при быстром пролёте и на точной границе раунда',async()=>{
  const {waveCrossing}=await module('soundArrival')
  const origin=point(0), track=[{start:0,end:1,a:point(10),b:point(-20)}]
  closeTo(waveCrossing(track,origin,0,1000,0,0,10,()=>{}),2.5)
  const still=[{start:0,end:1,a:origin,b:origin}]
  assert.equal(waveCrossing(still,origin,0,1000,5000,5000,5000,()=>{}),5000)
})

test('Стена ослабляет прямой звук, а слышимый сигнал приходит через проём позже',async()=>{
  const {w,scene}=travelWorld(32)
  const {roundWaveSound}=await module('roundWaveSound')
  scene.tokens[0].x=11;scene.tokens[0].y=3
  scene.objects=[
    {...sceneObject('wall','wall',point(8,2.2)),width:.2,depth:4.4,height:3,blocksSight:true},
    {...sceneObject('door','passage',point(8)),name:'Проём',width:.2,depth:1.2,height:3,blocksSight:true,open:true},
  ]
  const waves=roundWaveSound('portal-wave',stampedAt,[],0)
  waves.emit(scene,amount(1000),{kind:'ability',point:point(5,3,1.5),levelDbAt1m:53})
  waves.advance(w,scene,0,1100,new Map(),new Set(['speaker','listener']),[])
  const cue=waves.sounds[0].heard.find(h=>h.actorId==='listener')
  assert.equal(cue.viaDoor,'Проём')
  closeTo(cue.arrivalMs,2*Math.hypot(3,2)/airSpeed*1000)
  assert.equal(waves.finish().length,0)
})

test('Волна у границы сохраняется до следующего раунда и расходуется один раз',async()=>{
  const {w}=travelWorld(), entries=[doorEntry()], late=actualInput(entries)
  late.timings[0].costs[0].personalMs=5000
  const sent=calculateRound(w,collection(entries,'late-door'),late,'wave-late')
  assert.equal(doorReport(sent).heard.length,0);assert.equal(doorReport(sent).pending,2)
  assert(sent.world.characters.every(a=>a.journal.length===0))
  const {projectWorldEntities,restoreWorldEntities}=await module('worldEntities')
  const saved=restoreWorldEntities(projectWorldEntities(sent.world,1))
  assert.deepEqual(copySceneState(saved.campaign.scenes),copySceneState(sent.world.campaign.scenes));assert(isSceneState(saved.campaign.scenes))
  const invalid=structuredClone(saved.campaign.scenes)
  invalid.scenes[0].soundWaves[0].speedMs=0
  assert.equal(isSceneState(invalid),false)
  const next=[entry('listener',[listen(.2,'listen')])]
  const r=calculateRound(saved,collection(next,'hear-door'),actualInput(next),'wave-hear')
  const cue=r.summary.earlierSoundArrivals.find(h=>h.actorId==='listener')
  assert.equal(cue.focused,true);closeTo(cue.receivedAtMs,30/airSpeed*1000)
  assert.equal(r.world.campaign.scenes.scenes[0].soundWaves,undefined)
  assert.equal(r.world.characters[0].journal.length,1)
  const again=calculateRound(r.world,collection(next,'no-repeat'),actualInput(next),'wave-no-repeat')
  assert.equal(again.world.characters[0].journal.length,1)
  saved.campaign.seconds=20
  const elapsed=calculateRound(saved,collection(next,'time-elsewhere'),actualInput(next),'wave-expired')
  assert.equal(elapsed.world.characters[0].journal.length,0)
})

test('Тихий шаг учитывает навык, скорость и мокрое покрытие',()=>{
  const {w,scene}=travelWorld(35)
  scene.tokens[0].x=5;scene.objects=[]
  const actor=w.characters[1]
  actor.statistics.movement='1.5';actor.rpg.formulas=actor.rpg.formulas.filter(f=>f.parameter!=='movement')
  const run=(mode,ms,seed)=>{
    const entries=[entry('speaker',[move(3.5,mode)])], p={...actualInput(entries),movement:moveBodies}
    p.timings[0].costs[0].personalMs=ms
    return calculateRound(w,collection(entries,seed),p,seed)
  }
  const ordinary=run('ground',2000,'ordinary-step'), quiet=run('sneak',2000,'quiet-step')
  assert.equal(ordinary.summary.sounds.length,2)
  assert(ordinary.world.characters[0].journal.length>0)
  assert.equal(quiet.world.characters[0].journal.length,0)
  assert.throws(()=>run('sneak',1000,'fast-sneak'),/больше времени/)
  actor.creation.skills.stealth=60
  const skilled=run('sneak',2000,'skilled-sneak')
  assert(skilled.summary.sounds[0].levelDbAt1m<quiet.summary.sounds[0].levelDbAt1m)
  scene.objects=[{...sceneObject('water','puddle',point(3)),width:2,depth:1,height:.02,
    water:{version:1,base:'pure',saltKg:0,sedimentKg:0}}]
  const wet=run('sneak',2000,'wet-sneak')
  assert.equal(wet.summary.sounds[0].levelDbAt1m-skilled.summary.sounds[0].levelDbAt1m,6)
})

test('Шаги незавершённого маршрута не повторяются при продолжении',()=>{
  const {w,scene}=travelWorld(20);scene.objects=[]
  const entries=[entry('speaker',[move(3.5,'sneak')])],p={...actualInput(entries),movement:moveBodies}
  p.timings[0].costs[0].personalMs=9000
  const first=calculateRound(w,collection(entries,'long-quiet'),p,'quiet-first')
  assert.equal(first.summary.sounds.length,1)
  closeTo(Number(first.summary.sounds[0].atMs.numerator)/Number(first.summary.sounds[0].atMs.denominator),2250)
  const next={...collection([],'continue-quiet'),participantIds:['speaker']}
  const resumed=calculateRound(first.world,next,{...actualInput([]),movement:moveBodies,
    continuations:[{actorId:'speaker',mode:'continue',budgetMs:5000}]},'quiet-second')
  assert.equal(resumed.summary.sounds.length,1)
  closeTo(Number(resumed.summary.sounds[0].atMs.numerator)/Number(resumed.summary.sounds[0].atMs.denominator),1750)
})
