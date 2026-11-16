const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{act}=React,{JSDOM}=require('jsdom')
const {pathToFileURL}=require('node:url')
const dom=new JSDOM('<div id="root"></div>',{url:'https://world6.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,location:dom.window.location,IS_REACT_ACT_ENVIRONMENT:true})
const cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'');if(name.endsWith('.css'))return {};if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name);const mod={exports:{}};cache.set(name,mod)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.env',JSON.stringify({BASE_URL:'/'})).replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports
}
const Editor=load('LobbyQuests').default,Journal=load('QuestJournal').default,Context=load('onlineContext').OnlineContext,{NetworkError}=load('onlineClient')
const {newQuest,publicQuests,isQuestPlayerView,isQuestLog}=load('questLog'),{emptyStory,isCampaignStory,copyStory}=load('campaignStory')
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'))
const flush=async fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,15))}),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text||b.textContent.startsWith(text)),field=label=>document.querySelector('[aria-label="'+label+'"]')
async function click(text){const b=button(text);assert(b,'Missing '+text);assert(!b.matches(':disabled'),'Disabled '+text);await flush(()=>b.click())}
async function input(label,value){await flush(()=>{const f=field(label);assert(f,label);const proto=f.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:f.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(f,value);f.dispatchEvent(new dom.window.Event('input',{bubbles:true}));f.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
const savedQuest=(patch={})=>({...newQuest('quest-1'),title:'Пройти через ворота',description:'Узнать условия прохода.',notes:'PRIVATE-NOTES',published:true,audience:['hero-a'],objectives:[{id:'ask',title:'Спросить стража',done:false}],updatedAt:'2026-11-16T12:00:00.000Z',...patch})
const ack=c=>({duplicate:false,receipt:{operation:'quest-save',commandKey:c.commandKey,id:c.quest.id,generation:c.generation,version:c.baseVersion+1,revision:8,appliedAt:'2026-11-16T12:00:00.000Z'}})
let serial=0
async function fixture(options={}){
 await flush(()=>root.render(null))
 const accountId=options.accountId??'quest-ui-'+(++serial),calls=[],navigation=[];let events=0,value=options.player?{closed:false,quests:[],...options.view}:{generation:1,version:0,closed:false,quests:[],heroes:[{id:'hero-a',name:'Герой А'},{id:'hero-b',name:'Герой Б'}],sources:[],...options.view},activeRequest
 const request=async(url,init={})=>{
  calls.push({url,...init})
  if(init.method==='POST'){
   const c=JSON.parse(init.body);if(options.save)return options.save(c)
   value={...value,version:c.baseVersion+1,quests:[...value.quests.filter(q=>q.id!==c.quest.id),{...c.quest,updatedAt:'2026-11-16T12:00:00.000Z'}]};return ack(c)
  }
  if(options.readError)throw options.readError
  return structuredClone(value)
 }
 activeRequest=request
 function render(){root.render(React.createElement(Context.Provider,{value:{request:activeRequest,events,user:{id:accountId},refresh:()=>{events++;render()}}},React.createElement(options.player?Journal:Editor,{accountId,lobbyId:options.lobbyId??'room',characterId:'hero-a',checkingAccess:!!options.checkingAccess,active:options.active!==false,onDialogue:()=>navigation.push('dialogue')})))}
 await flush(render);await flush()
 return {options,accountId,calls,navigation,render:()=>flush(render),replace:async patch=>{value={...value,...patch};events++;await flush(render);await flush()},changeRequest:async next=>{activeRequest=next;await flush(render);await flush()},request}
}
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})

test('Задания: старые истории читаются, копия сохраняет независимый прогресс, неверная схема отвергается',()=>{
 const story=emptyStory();assert(isCampaignStory(story));story.quests={version:1,entries:[savedQuest()]};assert(isCampaignStory(story));assert(isQuestLog(story.quests))
 const copy=copyStory(story);copy.quests.entries[0].objectives[0].done=true;assert.equal(story.quests.entries[0].objectives[0].done,false)
 for(const mutate of [q=>q.status='unknown',q=>q.notes=3,q=>q.status='completed',q=>q.audience=[],q=>q.objectives.push({...q.objectives[0]})]){const broken=structuredClone(story);mutate(broken.quests.entries[0]);assert(!isCampaignStory(broken))}
})
test('Задания: выдача фильтруется до отображения, чужой источник и заметки отсутствуют, публичная копия независима',()=>{
 const story={...emptyStory(),messages:[{id:'private-source',kind:'npc',speaker:'PRIVATE-SPEAKER',body:'PRIVATE-BODY',audience:['hero-a']}],quests:{version:2,entries:[savedQuest({audience:['hero-a','hero-b'],sourceMessageId:'private-source'}),savedQuest({id:'hidden',title:'PRIVATE-TITLE',published:false})]}}
 const own=publicQuests(story,'hero-a'),other=publicQuests(story,'hero-b');assert.equal(own[0].source.body,'PRIVATE-BODY');assert.equal(other[0].source,undefined)
 for(const secret of ['PRIVATE-NOTES','PRIVATE-TITLE','PRIVATE-BODY','PRIVATE-SPEAKER','private-source','audience','published'])assert(!JSON.stringify(other).includes(secret))
 own[0].objectives[0].done=true;assert.equal(story.quests.entries[0].objectives[0].done,false)
 assert(isQuestPlayerView({closed:false,quests:other}));assert(!isQuestPlayerView({closed:false,quests:[{...other[0],notes:'PRIVATE'}]}))
 assert(!isQuestPlayerView({closed:false,quests:[other[0],other[0]]}));assert(!isQuestPlayerView({closed:false,quests:[{...other[0],status:'completed'}]}))
})
test('Задания UI: несколько незавершённых черновиков переживают переключение и новое открытие',async()=>{
 const f=await fixture();await click('Новое задание');await input('Название задания','Задание А');await input('Секретные заметки задания','PRIVATE-A')
 await click('Новое задание');await input('Название задания','Задание Б');await input('Описание задания','Текст Б')
 await click('Задание А');assert.equal(field('Секретные заметки задания').value,'PRIVATE-A');await click('Задание Б')
 await fixture({accountId:f.accountId});assert.equal(field('Название задания').value,'Задание Б');assert.equal(field('Описание задания').value,'Текст Б')
 await click('Убрать новый черновик');assert.equal(field('Название задания').value,'Задание А');assert.equal(f.calls.filter(c=>c.method==='POST').length,0)
})
test('Задания UI: выдача требует получателя; завершение требует выполненных пунктов',async()=>{
 const f=await fixture();await click('Новое задание');await input('Название задания','Задача');await click('Добавить пункт');await input('Пункт задания 1','Поговорить со стражем')
 await flush(()=>field('Выдать задание героям').click());assert(button('Выдать или обновить задание').matches(':disabled'))
 await flush(()=>[...document.querySelectorAll('label')].find(l=>l.textContent==='Герой А').querySelector('input').click());await input('Состояние задания','completed');assert(button('Выдать или обновить задание').matches(':disabled'))
 await flush(()=>field('Выполнен пункт 1').click());await click('Выдать или обновить задание');await flush()
 const c=JSON.parse(f.calls.find(c=>c.method==='POST').body);assert.equal(c.quest.status,'completed');assert.deepEqual(c.quest.audience,['hero-a']);assert.equal(c.quest.objectives[0].done,true)
 assert(!button('Проверить сохранение задания'));assert(document.body.textContent.includes('Задание сохранено у выбранных героев'))
})
test('Задания UI: новый прогресс сохраняет местный текст и требует сверки до отправки',async()=>{
 const initial=savedQuest(),f=await fixture({view:{version:1,quests:[initial]}});await input('Описание задания','Местный текст')
 await f.replace({version:2,quests:[{...initial,notes:'Новые заметки мастера',objectives:[{...initial.objectives[0],done:true}]}]})
 assert.equal(field('Описание задания').value,'Местный текст');assert(button('Выдать или обновить задание').matches(':disabled'));assert(document.body.textContent.includes('Новые заметки мастера'))
 assert.equal(f.calls.filter(c=>c.method==='POST').length,0);await click('Черновик сверен с текущим журналом');await click('Выдать или обновить задание')
 assert.equal(JSON.parse(f.calls.find(c=>c.method==='POST').body).baseVersion,2)
})
test('Задания UI: потеря ответа сохраняет точную команду после открытия, неверное подтверждение допускает тот же повтор',async()=>{
 let attempts=0
 const handler=c=>{attempts++;if(attempts===1)throw new NetworkError(0,'Связь потеряна');if(attempts===2)return {duplicate:false};return ack(c)}
 let f=await fixture({save:handler});await click('Новое задание');await input('Название задания','Черновик');await click('Сохранить закрытый черновик')
 const body=f.calls.find(c=>c.method==='POST').body;assert(button('Проверить сохранение задания'))
 f=await fixture({accountId:f.accountId,save:handler});await click('Проверить сохранение задания');assert.equal(f.calls.find(c=>c.method==='POST').body,body);assert(button('Проверить сохранение задания'))
 await click('Проверить сохранение задания');assert.equal(f.calls.filter(c=>c.method==='POST').at(-1).body,body);assert(!button('Проверить сохранение задания'))
})
test('Задания UI: отказ локального хранилища не отправляет неподтверждаемую команду',async()=>{
 const f=await fixture();await click('Новое задание');await input('Название задания','Текст')
 const original=dom.window.Storage.prototype.setItem
 try{dom.window.Storage.prototype.setItem=()=>{throw Error('No storage')};await click('Сохранить закрытый черновик');assert.equal(f.calls.filter(c=>c.method==='POST').length,0);assert(!button('Проверить сохранение задания'))}finally{dom.window.Storage.prototype.setItem=original}
})
test('Задания UI: поздний ответ прежнего API отменён и не очищает черновик',async()=>{
 let resolve
 const f=await fixture({save:()=>new Promise(r=>resolve=r)});await click('Новое задание');await input('Название задания','Живой черновик');await click('Сохранить закрытый черновик')
 const sent=f.calls.find(c=>c.method==='POST');await f.changeRequest((url,init)=>f.request(url,init));assert(sent.signal.aborted)
 await flush(()=>resolve(ack(JSON.parse(sent.body))));assert.equal(field('Название задания').value,'Живой черновик');assert(button('Проверить сохранение задания'))
})
test('Задания UI: игрок видит прогресс и историю, открывает разговоры; изменения доступны только мастеру',async()=>{
 const story={...emptyStory(),quests:{version:1,entries:[savedQuest(),savedQuest({id:'old',title:'Завершённое дело',status:'completed',objectives:[]})]}}
 const f=await fixture({player:true,view:{closed:false,quests:publicQuests(story,'hero-a')}})
 assert(document.body.textContent.includes('Выполнено 0 из 1'));assert(!field('Секретные заметки задания'));assert(!document.querySelector('input[type="checkbox"]'))
 assert(!document.body.textContent.includes('Завершённое дело'));await click('История заданий');assert(document.body.textContent.includes('Завершённое дело'));assert(f.calls.every(c=>!c.method||c.method==='GET'))
 await f.replace({quests:[{...publicQuests(story,'hero-a')[0],source:{id:'source',speaker:'Страж',body:'Узнайте условия.'}}]});await click('В работе');await click('Открыть разговоры');assert.deepEqual(f.navigation,['dialogue'])
})
test('Задания UI: потеря доступа и неподтверждённый публичный ответ не показывают данные',async()=>{
 const q=publicQuests({...emptyStory(),quests:{version:1,entries:[savedQuest()]}},'hero-a')[0],f=await fixture({player:true,view:{closed:false,quests:[q]}})
 assert(document.body.textContent.includes(q.title));f.options.checkingAccess=true;await f.render();assert(!document.body.textContent.includes(q.title))
 f.options.checkingAccess=false;await f.render();await f.replace({quests:[{...q,notes:'PRIVATE-ACCIDENT'}]});assert(!document.body.textContent.includes('PRIVATE-ACCIDENT'));assert(!document.body.textContent.includes(q.title));assert(document.body.textContent.includes('Не удалось проверить журнал'))
})
