const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{act}=React,{JSDOM}=require('jsdom')
const dom=new JSDOM('<div id="root"></div>',{url:'https://world6.example.test/?lobby=room-a'});Object.assign(global,{window:dom.window,document:dom.window.document,location:dom.window.location,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root')),cache=new Map()
function load(name){name=name.replace(/\.tsx?$/,'');if(name.endsWith('.css'))return {};if(cache.has(name))return cache.get(name).exports;const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name);const mod={exports:{}};cache.set(name,mod);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.env',JSON.stringify({BASE_URL:'/'}));vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports}
const Component=load('LobbyGameSession').default,Context=load('onlineContext').OnlineContext,{NetworkError}=load('onlineClient')
const flush=async fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,10))}),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text),field=label=>document.querySelector('[aria-label="'+label+'"]')
async function input(label,value){await flush(()=>{const f=field(label),prototype=f.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(f,value);f.dispatchEvent(new dom.window.Event('input',{bubbles:true}));f.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
async function click(text){const b=button(text);assert(b,'Missing '+text);assert(!b.disabled,'Disabled '+text);await flush(()=>b.click())}
async function fixture(options={}){
 await flush(()=>root.render(null));const id=options.lobbyId??'session-'+crypto.randomUUID(),lobby={id,title:'Переход друзей',myRole:options.role??'GM',status:'playing',members:[]},calls=[],navigation=[]
 let events=0,value={revision:7,status:'playing',paused:false,seconds:10,phase:'applied',round:{phase:'applied',received:2,total:2},result:null,ready:[],canStart:false,pendingWork:0,finishBlockers:[],...options.view}
 const request=async(url,init={})=>{const method=init.method??'GET';if(method==='GET')return structuredClone(value);const body=JSON.parse(init.body);calls.push({url,body,signal:init.signal});if(options.send)return options.send(url,body,init);if(url.endsWith('/finish'))value={...value,revision:8,status:'closed',phase:'finished',result:{id:'final',title:body.title,summary:body.summary,sourceRevision:body.revision,finishedAt:'2026-10-28T12:00:00.000Z'}};return {ok:true}}
 let activeRequest=request
 function render(){root.render(React.createElement(Context.Provider,{value:{request:activeRequest,events,refresh:()=>{events++;render()},user:{id:'gm'}}},React.createElement(Component,{key:options.key??id,accountId:options.accountId??'gm',lobby,disabled:!!options.disabled,onHeroes:()=>navigation.push('heroes'),onRound:()=>navigation.push('round'),onSetup:()=>navigation.push('scene'),onMembers:()=>navigation.push('members'),onCopies:()=>navigation.push('copies')})))}
 await flush(render);await flush();return {options,lobby,calls,navigation,render:()=>flush(render),replace:async patch=>{value={...value,...patch};events++;await flush(render);await flush()},changeRequest:async next=>{activeRequest=next;await flush(render);await flush()},request,unmount:()=>flush(()=>root.render(null))}
}
async function ending(){await click('Завершить игру');await input('Общий итог игры','Друзья открыли ворота.');await flush(()=>field('Подтвердить общий итог и завершение').click())}
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})

test('Игра: подготовка показывает проверяемые шаги, переходы и блокировку старта',async()=>{
 const h=await fixture({view:{status:'open',phase:'preparing',ready:[{id:'friends',label:'Друг вошёл',done:false,section:'setup'},{id:'heroes',label:'Герой принят',done:false,section:'heroes'},{id:'scene',label:'Сцена открыта',done:false,section:'game'}]}})
 assert(button('Начать совместную игру').disabled);const actions=[...document.querySelectorAll('[aria-label="Готовность к совместной игре"] button')];for(const a of actions)await flush(()=>a.click());assert.deepEqual(h.navigation,['members','heroes','scene']);assert.equal(h.calls.length,0)
 await h.replace({canStart:true,ready:[]});await click('Начать совместную игру');assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].body,{revision:7});assert(h.calls[0].url.endsWith('/start'))
})
test('Игра: явный общий итог, один запрос, общий экран результата и переход к снимку',async()=>{
 const h=await fixture();await click('Завершить игру');assert(button('Сохранить итог и завершить').disabled);await input('Общий итог игры','Герои добрались до переправы.');assert(button('Сохранить итог и завершить').disabled);await flush(()=>field('Подтвердить общий итог и завершение').click());assert(!button('Сохранить итог и завершить').disabled)
 const form=field('Завершение совместной игры');await flush(()=>{form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});await flush()
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.revision,7);assert.equal(h.calls[0].body.summary,'Герои добрались до переправы.');assert(field('Итог совместной игры'));assert(document.body.textContent.includes('Герои добрались до переправы.'));assert(!button('Сохранить итог и завершить'));await click('Копии и финальный снимок');assert.deepEqual(h.navigation,['copies'])
})
test('Игра: смена версии и редактирование требуют повторной сверки; незавершённые действия и раунд видны',async()=>{
 const h=await fixture({view:{pendingWork:1,finishBlockers:['Текущий раунд не разрешён']}});await ending();assert(button('Сохранить итог и завершить').disabled);await click('Разрешить текущий раунд');assert.deepEqual(h.navigation,['round'])
 await h.replace({finishBlockers:[]});assert(button('Сохранить итог и завершить').disabled);await flush(()=>field('Сохранить незавершённые действия').click());assert(!field('Подтвердить общий итог и завершение').checked);await flush(()=>field('Подтвердить общий итог и завершение').click());assert(!button('Сохранить итог и завершить').disabled)
 await h.replace({revision:8});assert(button('Сохранить итог и завершить').disabled);await click('Итог проверен с текущей версией');assert(!field('Подтвердить общий итог и завершение').checked);await flush(()=>field('Подтвердить общий итог и завершение').click());await input('Общий итог игры','Уточнённый итог');assert(!field('Подтвердить общий итог и завершение').checked);assert.equal(h.calls.length,0)
})
test('Игра: потеря ответа сохраняет точную команду; повтор использует тот же ключ и исходную версию',async()=>{
 let fail=true;const h=await fixture({send:()=>{if(fail)throw new NetworkError(0,'Связь прервана');return {duplicate:true}}});await ending();await click('Сохранить итог и завершить');assert.equal(h.calls.length,1);assert(field('Общий итог игры').matches(':disabled'));assert(button('Повторить сохранение итога'))
 fail=false;await click('Повторить сохранение итога');assert.equal(h.calls.length,2);assert.deepEqual(h.calls[1].body,h.calls[0].body);assert(!field('Завершение совместной игры'));assert(document.body.textContent.includes('Финальный снимок и общий итог сохранены'))
})
test('Игра: конфликт сервера сохраняет текст, снимает подтверждение и требует свежую версию',async()=>{
 const h=await fixture({send:()=>{throw new NetworkError(409,'Свежий раунд')}});await ending();await click('Сохранить итог и завершить');assert.equal(field('Общий итог игры').value,'Друзья открыли ворота.');assert(!field('Подтвердить общий итог и завершение').checked);assert(!button('Повторить сохранение итога'));assert(document.body.textContent.includes('Свежий раунд'));await h.replace({revision:8});assert(button('Итог проверен с текущей версией'));assert.equal(h.calls.length,1)
})
test('Игра: черновик переживает перемонтирование; другой аккаунт и лобби не получают чужой итог',async()=>{
 const options={lobbyId:'persistent-'+crypto.randomUUID()};await fixture(options);await click('Завершить игру');await input('Общий итог игры','Личный черновик мастера');await fixture(options);await click('Завершить игру');assert.equal(field('Общий итог игры').value,'Личный черновик мастера');await fixture({...options,accountId:'other'});await click('Завершить игру');assert.equal(field('Общий итог игры').value,'');await fixture();await click('Завершить игру');assert.equal(field('Общий итог игры').value,'')
})
test('Игра: игрок и помощник не получают управление, завершённая игра доступна для чтения',async()=>{
 for(const role of ['PLAYER','ASSISTANT']){await fixture({role});assert(!button('Завершить игру'));assert(!button('Начать совместную игру'));assert(!button('Пауза в игре'));assert.equal(field('Готовность к совместной игре'),null)}
 await fixture({role:'PLAYER',view:{status:'closed',phase:'finished',result:{id:'final',title:'Победа у ворот',summary:'Общий финал',finishedAt:'2026-10-28T12:00:00Z',sourceRevision:7}}});assert(field('Итог совместной игры'));assert(document.body.textContent.includes('Общий финал'));assert(!button('Копии и финальный снимок'))
})
test('Игра: read-only, устаревший обработчик, смена API и размонтирование не отправляют финал',async()=>{
 const h=await fixture();await ending();const form=field('Завершение совместной игры'),stale=form[Object.keys(form).find(k=>k.startsWith('__reactProps'))].onSubmit;await h.replace({revision:8});await flush(()=>stale({preventDefault(){}}));assert.equal(h.calls.length,0)
 h.options.disabled=true;await h.render();assert(button('Сохранить итог и завершить').disabled);await flush(()=>stale({preventDefault(){}}));assert.equal(h.calls.length,0)
 await h.unmount();await flush(()=>stale({preventDefault(){}}));assert.equal(h.calls.length,0)
 let release;const waiting=new Promise(r=>release=r),pending=await fixture({send:()=>waiting});await ending();await click('Сохранить итог и завершить');assert.equal(pending.calls.length,1);await pending.unmount();assert(pending.calls[0].signal.aborted);await flush(()=>release({ok:true}));assert(!document.body.textContent.includes('Игра завершена'))
})
test('Игра: пауза и продолжение используют текущую версию, не публикуют итог',async()=>{
 const h=await fixture();await input('Причина перерыва или продолжения','Перерыв');await click('Пауза в игре');assert.equal(h.calls.length,1);assert(h.calls[0].url.endsWith('/rounds/pause'));assert.equal(h.calls[0].body.paused,true);await h.replace({paused:true,phase:'paused',revision:8});await click('Продолжить игру');assert.equal(h.calls[1].body.paused,false);assert.equal(h.calls[1].body.revision,8)
})
test('Игра: смена API во время записи снимает старую занятость, отменяет запрос и сохраняет точный повтор',async()=>{
 let resolve;const h=await fixture({send:()=>new Promise(r=>resolve=r)});await ending();await click('Сохранить итог и завершить');assert.equal(h.calls.length,1)
 const replacement=async(url,options={})=>h.request(url,options)
 await h.changeRequest(replacement);assert(h.calls[0].signal.aborted);assert(button('Повторить сохранение итога'));assert(!button('Повторить сохранение итога').disabled)
 await flush(()=>resolve({ok:true}));assert(!document.body.textContent.includes('Финальный снимок и общий итог сохранены'));assert(field('Завершение совместной игры'))
})
test('Игра: несовместимый ответ API не ломает страницу и не разрешает запись',async()=>{
 const h=await fixture({view:{seconds:undefined}});assert(document.body.textContent.includes('несовместимое состояние игры'));assert(!button('Завершить игру'));assert(button('Обновить состояние игры'));assert.equal(h.calls.length,0)
 const {isGameSessionView}=load('gameSession');assert(!isGameSessionView({revision:1,campaign:{seconds:0}}));assert(!isGameSessionView({revision:1,status:'playing',paused:false,seconds:0,phase:'ready',round:null,result:{summary:'x'}}))
})
test('Навигация: возвращение в свою кампанию, отдельные аккаунты и приглашение без прежнего lobby',()=>{
 const {readOpenLobby,rememberOpenLobby,lobbyInviteUrl}=load('lobbyNavigation');window.sessionStorage.clear();window.history.replaceState(null,'','/');assert.equal(readOpenLobby('a'),'');rememberOpenLobby('a','room-a');assert.equal(readOpenLobby('a'),'room-a');const invite=new URL(lobbyInviteUrl('new-code'));assert.equal(invite.searchParams.get('invite'),'new-code');assert.equal(invite.searchParams.get('lobby'),null)
 window.history.replaceState(null,'','/?lobby=room-a&code=PRIVATE-LOGIN-CODE#access_token=PRIVATE-TOKEN');const clean=new URL(lobbyInviteUrl('new-code'));assert.equal(clean.search,'?invite=new-code');assert.equal(clean.hash,'');assert(!clean.href.includes('PRIVATE'))
 window.history.replaceState(null,'','/');assert.equal(readOpenLobby('b'),'');assert.equal(readOpenLobby('a'),'room-a');window.history.replaceState(null,'','/?invite=new-code');assert.equal(readOpenLobby('a'),'');window.history.replaceState(null,'','/?lobby=%3Cscript%3E');assert.equal(readOpenLobby('b'),'');rememberOpenLobby('a','');assert.equal(readOpenLobby('a'),'')
})
