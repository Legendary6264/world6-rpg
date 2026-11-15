const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{act}=React,{JSDOM}=require('jsdom')
const {pathToFileURL}=require('node:url')
const dom=new JSDOM('<div id="root"></div>',{url:'https://world6.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,location:dom.window.location,IS_REACT_ACT_ENVIRONMENT:true})
const media={matches:true,addEventListener(){},removeEventListener(){}};window.matchMedia=()=>media
const cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'');if(name.endsWith('.css'))return {};if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name);const mod={exports:{}};cache.set(name,mod)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.env',JSON.stringify({BASE_URL:'/'})).replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports
}
const Component=load('LobbyRoundResults').default,Context=load('onlineContext').OnlineContext,{roundPresentationFrame,isRoundPresentation}=load('roundPresentation'),{SceneAbilityPlayback}=load('sceneAbilityPlayback'),{sampleAbilityVisual}=load('abilityVisualTimeline')
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'))
const flush=async fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,10))}),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
async function click(text){const b=button(text);assert(b,'Missing '+text);assert(!b.disabled,'Disabled '+text);await flush(()=>b.click())}
const report=()=>({id:'turn:'+'a'.repeat(24),revision:8,appliedAt:'2026-11-15T12:00:00.000Z',coverage:'full',fromSeconds:0,toSeconds:5,note:'Исполненный ход',actions:[{id:'action:0',label:'Перемещение',status:'completed'}],resources:[]})
function recording(){
 const before={title:'Двор',description:'Известная герою сцена',frame:{id:'yard',width:20,depth:20,minZ:-5,maxZ:20,groundZ:0,view:'top',palette:'stone'},areas:[{id:'known',x:0,y:0,z:-5,width:20,depth:20,height:25,visible:true}],objects:[{id:'door',name:'Дверь',kind:'door',x:10,y:10,z:0,width:1,depth:.2,height:2,open:false,visible:true}],contacts:[{id:'self',kind:'self',label:'Герой',signs:'',x:2,y:2,z:0}]}
 const after=structuredClone(before);after.contacts[0].x=6
 return {version:1,id:report().id,generation:1,revision:8,appliedAt:report().appliedAt,coverage:'scene',fromSeconds:0,toSeconds:5,roundDurationMs:5000,durationMs:5000,before,after,events:[{id:'start',atMs:0,kind:'move',label:'Начало движения'},{id:'finish',atMs:5000,kind:'move',label:'Перемещение завершено'}],motions:[{startMs:0,endMs:5000,from:{x:2,y:2,z:0},to:{x:6,y:2,z:0}}],visuals:[]}
}
const play='Посмотреть исполнение раунда 0:00–0:05'
async function fixture(options={}){
 await flush(()=>root.render(null));media.matches=options.reduced??true
 let events=0,value={revision:9,generation:1,closed:false,reports:[report()],hasMore:false,...options.view},frame=null,activeRequest
 const calls=[],onReviewFrame=next=>{frame=next},request=async(url,init={})=>{calls.push({url,...init});if(url.endsWith('/playback'))return options.playback?options.playback(url,init):recording();if(options.readError)throw options.readError;return structuredClone(value)}
 activeRequest=request
 function render(){root.render(React.createElement(Context.Provider,{value:{request:activeRequest,events,user:{id:'gm'}}},React.createElement(Component,{lobbyId:options.lobbyId??'room',characterId:options.characterId??'hero',checkingAccess:!!options.checkingAccess,active:options.active!==false,onReviewFrame:options.inline?undefined:onReviewFrame})))}
 await flush(render);await flush()
 return {options,calls,get frame(){return frame},render:()=>flush(render),replace:async patch=>{value={...value,...patch};events++;await flush(render);await flush()},changeRequest:async next=>{activeRequest=next;await flush(render);await flush()},request,unmount:()=>flush(()=>root.render(null))}
}
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})

test('Просмотр раунда: маршрут проходит через сохранённый поворот; перемотка не меняет запись',()=>{
 const r=recording();r.motions=[{startMs:0,endMs:1000,from:{x:2,y:2,z:0},to:{x:4,y:2,z:0}},{startMs:1000,endMs:2000,from:{x:4,y:2,z:0},to:{x:4,y:4,z:0}}];r.after.contacts[0]={...r.after.contacts[0],x:4,y:4}
 const original=structuredClone(r),at=t=>roundPresentationFrame(r,t).map.contacts[0]
 assert.deepEqual([at(500).x,at(500).y],[3,2]);assert.deepEqual([at(1500).x,at(1500).y],[4,3]);assert.equal(at(5000).y,4)
 at(500);at(4900);at(0);assert.deepEqual(r,original)
})
test('Просмотр раунда: прыжок использует сохранённую дугу, неизвестная высота чужого контакта не добавляется',()=>{
 const r=recording();r.motions[0].arcM=2;r.before.contacts.push({id:'unknown',kind:'silhouette',label:'Силуэт',signs:'',x:8,y:8})
 const frame=roundPresentationFrame(r,2500,true);assert.equal(frame.map.contacts[0].z,2);assert.equal(frame.map.contacts[0].characterAnimation,'idle');assert.equal(frame.map.contacts[1].z,undefined)
})
test('Просмотр раунда: открытие и закрытие двери показаны в свои моменты; обратная перемотка восстанавливает состояние',()=>{
 const r=recording();r.events=[{id:'open',kind:'interact',atMs:1000,label:'Открытие',object:{id:'door',open:true}},{id:'close',kind:'interact',atMs:2000,label:'Закрытие',object:{id:'door',open:false}}]
 assert.equal(roundPresentationFrame(r,1500).map.objects[0].open,true);assert.equal(roundPresentationFrame(r,2500).map.objects[0].open,false);assert.equal(roundPresentationFrame(r,500).map.objects[0].open,false)
})
test('Просмотр раунда: параллельные эффекты используют собственное время выпуска на общей шкале',()=>{
 const v={id:'one',spec:{familyId:'light',durationMs:2000},start:{x:1,y:1,z:0},end:{x:2,y:2,z:0},phase:'sequence',shape:'point',radius:1,coneAngleDeg:45},second={...v,id:'two',presentationOffsetMs:1000},clock=new SceneAbilityPlayback('yard',[v,second])
 assert.deepEqual(clock.sample(second,false,1500),sampleAbilityVisual(second,500,true,false));assert.deepEqual(clock.sample(v,false,1500),sampleAbilityVisual(v,1500,true,false));assert.notDeepEqual(clock.sample(v,false,1500),clock.sample(second,false,1500))
})
test('Просмотр раунда: два последовательных выпуска сохраняют оба эффекта, скрытый источник не раскрывается',()=>{
 const {buildRoundPresentation}=load('roundPresentation'),{emptyCampaign,emptyAbility}=load('rpgSchema'),{createDefaultCharacter}=load('characterModel'),{createScene,emptyScenes}=load('scenes'),{exactAmount}=load('exactWork')
 const scene=createScene(emptyScenes(),'yard','PRIVATE-SCENE','top'),actor={...createDefaultCharacter(),id:'own-actor',name:'Герой'},other={...createDefaultCharacter(),id:'hidden-actor',name:'PRIVATE-ACTOR'}
 scene.scenes[0].tokens=[{actorId:actor.id,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}},{actorId:other.id,x:8,y:8,z:0,diameter:1,support:{kind:'ground'}}]
 const visible=recording().before,known={sceneId:'yard',title:'Двор',description:'',frame:{...visible.frame,width:scene.scenes[0].width,depth:scene.scenes[0].depth},areas:visible.areas,objects:[],contacts:[{id:'unknown',actorId:other.id,kind:'silhouette',label:'Силуэт',signs:'',showHeight:false,showVisuals:false,point:{x:8,y:8,z:0},radius:0}]}
 const before={characters:[actor,other],campaign:{...emptyCampaign(),scenes:scene,perceptions:{version:1,heroes:[{actorId:actor.id,activeSceneId:'yard',scenes:[known]}]}}},after=structuredClone(before)
 const cast=id=>({id,status:'ended',targetId:actor.id,endsAt:null,ability:{...emptyAbility(),name:'PRIVATE-ABILITY',visualEffect:{familyId:'light',durationMs:1000}},visualRelease:{sceneId:'yard',releasedAt:id==='first'?1:2.5,start:{x:2,y:2,z:0},end:{x:2,y:2,z:0}}})
 after.characters[0].rpg.casts=[cast('first'),cast('second')];after.characters[1].rpg.casts=[cast('hidden-cast')];after.campaign.seconds=5
 const event=(kind,castId,ms,index=0,actorId=actor.id)=>({kind,castId,actorId,actionIndex:index,workId:'work-'+castId,atMs:exactAmount(BigInt(ms))})
 const summary={durationSeconds:5,carried:[],events:[event('prepare','first',0),event('release','first',1000),event('prepare','second',1500,1),event('release','second',2500,1),event('release','hidden-cast',2000,0,other.id)]}
 const result=buildRoundPresentation(before,after,summary,actor.id,report(),1)
 assert.equal(result.visuals.filter(v=>v.visual.phase==='sequence').length,2);assert.deepEqual(result.visuals.filter(v=>v.visual.phase==='sequence').map(v=>v.atMs),[1000,2500])
 assert(!JSON.stringify(result).includes('hidden-actor'));assert(!JSON.stringify(result).includes('hidden-cast'));assert(!JSON.stringify(result).includes('PRIVATE-ABILITY'));assert(!result.events.some(e=>e.kind==='effect'))
 assert(isRoundPresentation(result,report().id))
})
test('Просмотр раунда: повреждённая схема, событие, движение и эффект не принимаются',()=>{
 assert(isRoundPresentation(recording(),report().id))
 for(const mutate of [r=>r.id='wrong',r=>r.generation=0,r=>r.before.contacts={},r=>r.events[0].status='invented',r=>r.motions[0].from.x=NaN,r=>r.durationMs=Infinity,r=>r.visuals=[{atMs:0,untilMs:5,visual:{}}]]){const r=recording();mutate(r);assert(!isRoundPresentation(r,report().id))}
})
test('Просмотр раунда: погрешность дробных мировых секунд не теряет последнее событие',()=>{
 const {buildRoundPresentation}=load('roundPresentation'),{emptyCampaign}=load('rpgSchema'),{exactAmount}=load('exactWork'),before={characters:[],campaign:{...emptyCampaign(),seconds:.1}},after={characters:[],campaign:{...emptyCampaign(),seconds:.3}}
 const r=buildRoundPresentation(before,after,{durationSeconds:.2,events:[{actorId:'hero',actionIndex:0,workId:'release',kind:'release',atMs:exactAmount(200n)}],carried:[]},'hero',{...report(),fromSeconds:.1,toSeconds:.3},1)
 assert.equal(r.events[0].kind,'release');assert.equal(r.events[0].atMs,r.roundDurationMs);assert(isRoundPresentation(r,report().id))
})
test('Просмотр раунда UI: открытие, выбор события, возврат и кадры выполняют только GET',async()=>{
 const f=await fixture();await click(play);assert(document.querySelector('[aria-label="Просмотр исполненного раунда"]'));assert.equal(f.frame.map.contacts[0].x,2)
 await click('Следующее событие');assert.equal(f.frame.map.contacts[0].x,6);assert.equal(f.frame.worldSeconds,5)
 await click('Предыдущее событие');assert.equal(f.frame.map.contacts[0].x,2);await click('Вернуться к текущей сцене');assert.equal(f.frame,null)
 assert(f.calls.every(c=>c.method===undefined||c.method==='GET'));assert.equal(f.calls.filter(c=>c.url.endsWith('/playback')).length,1)
})
test('Просмотр раунда UI: новый раунд и смена поколения возвращают текущую сцену',async()=>{
 const f=await fixture();await click(play);await f.replace({generation:2});assert.equal(f.frame,null);assert(!document.querySelector('[aria-label="Просмотр исполненного раунда"]'))
 await f.replace({generation:1});await click(play);await f.replace({reports:[{...report(),id:'turn:'+'b'.repeat(24)}]});assert.equal(f.frame,null)
})
test('Просмотр раунда UI: отдельный просмотр мастера показывает карту героя без игровых действий',async()=>{
 const f=await fixture({inline:true});await click(play);await flush()
 assert(document.querySelector('[aria-label="Просмотр исполненного раунда"]'));assert(document.body.textContent.includes('Двор'))
 assert(!document.querySelector('.gb-game-actionbar'));assert(f.calls.every(call=>!call.method||call.method==='GET'))
 await click('Вернуться к текущей сцене');assert(!document.querySelector('[aria-label="Просмотр исполненного раунда"]'))
})
test('Просмотр раунда UI: поздний ответ после смены API отменён; повтор доступен через новый запрос',async()=>{
 let release
 const f=await fixture({playback:()=>new Promise(r=>release=r)});await click(play);const first=f.calls.find(c=>c.url.endsWith('/playback'))
 f.options.playback=()=>recording();await f.changeRequest((url,init)=>f.request(url,init));assert(first.signal.aborted)
 await flush(()=>release(recording()));assert.equal(f.frame,null);assert(!button(play).disabled);await click(play);assert(f.frame)
})
test('Просмотр раунда UI: скрытая секция и отказ доступа убирают исторический кадр',async()=>{
 const f=await fixture();await click(play);f.options.active=false;await f.render();assert.equal(f.frame,null)
 f.options.active=true;await f.render();await flush();await click(play);f.options.checkingAccess=true;await f.render();assert.equal(f.frame,null)
})
test('Просмотр раунда UI: несовместимая запись оставляет итог доступным и допускает повтор загрузки',async()=>{
 const f=await fixture({playback:()=>({ok:true})});await click(play);assert.equal(f.frame,null);assert(document.body.textContent.includes('не подтвердил запись'))
 assert(document.body.textContent.includes('Исполненный ход'));f.options.playback=()=>recording();await click(play);assert(f.frame)
})

test('Запись раунда: сжатые изменения переживают порядок ключей архива и связаны с исходным миром',async()=>{
 const {captureRoundPresentation,restoreRoundPresentation}=await import('../server/round-presentation-storage.mjs'),{world:validateWorld}=await import('../server/validation.mjs'),{createDefaultCharacter}=load('characterModel'),{emptyCampaign}=load('rpgSchema'),{createScene,emptyScenes}=load('scenes')
 const hero={...createDefaultCharacter(),id:'stored-hero',name:'Герой'};hero.resources.mana={maximum:'10',current:'10'};const before=validateWorld({characters:[hero],campaign:{...emptyCampaign(),scenes:createScene(emptyScenes(),'test-scene','Тест','top')}}),after=structuredClone(before);after.characters[0].resources.mana.current='4';after.campaign.seconds=5
 const source=captureRoundPresentation(JSON.stringify(before),JSON.stringify(after),8);assert(source)
 const reordered=JSON.stringify(before,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v)
 assert.deepEqual(restoreRoundPresentation(reordered,source,8),after)
 const changed=structuredClone(before);changed.characters[0].name='Другой герой';assert.throws(()=>restoreRoundPresentation(JSON.stringify(changed),source,8));assert.throws(()=>restoreRoundPresentation(JSON.stringify(before),{...source,data:'AAAA'},8))
})
