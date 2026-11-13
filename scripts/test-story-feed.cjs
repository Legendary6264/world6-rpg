const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const React=require('react'),{JSDOM}=require('jsdom'),{act}=React
const dom=new JSDOM('<div id="root"></div>',{url:'https://world6.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=require('react-dom/client')
const cache=new Map()
function load(name){
 if(cache.has(name))return cache.get(name).exports
 const file=['.ts','.tsx'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync),module={exports:{}};assert(file,name);cache.set(name,module)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),module,module.exports)
 return module.exports
}
const Feed=load('StoryFeed').default,read=load('storyReadState')
const flush=async(fn=()=>{})=>act(async()=>{fn();await new Promise(resolve=>setTimeout(resolve,5))})
const entry=(id,index=0)=>({id,kind:'npc',speaker:'Страж',body:'Реплика '+id,seconds:0,createdAt:new Date(Date.UTC(2026,10,13,12,0,index)).toISOString(),resolved:true,targetLabel:''})
async function fixture(patch={}){
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})
 const root=createRoot(document.getElementById('root')),counts=[],state={messages:[],active:false,readKey:'story-read:'+crypto.randomUUID(),total:0,loading:false,locked:false,onOlder:()=>{},onUnreadChange:n=>counts.push(n),...patch}
 const render=()=>root.render(React.createElement(Feed,state));await flush(render)
 return {state,counts,render:async patch=>{Object.assign(state,patch);await flush(render)},close:()=>flush(()=>root.unmount())}
}
test.after(()=>dom.window.close())
test('Диалог в игре: скрытая секция и скрытый документ не читают реплики, открытие прокручивает к новым',async()=>{
 const f=await fixture({messages:[entry('one',1),entry('two',2)]})
 try{
  assert.equal(f.counts.at(-1),2)
  const feed=document.querySelector('[role="log"]');Object.defineProperties(feed,{scrollHeight:{configurable:true,value:1000},clientHeight:{configurable:true,value:200}})
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'})
  await f.render({active:true});assert.equal(f.counts.at(-1),2);assert.equal(feed.getAttribute('aria-live'),'off')
  await flush(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new dom.window.Event('visibilitychange'))})
  assert.equal(f.counts.at(-1),0);assert.equal(feed.scrollTop,1000);assert.equal(feed.getAttribute('aria-live'),'polite')
  assert(!localStorage.getItem(f.state.readKey).includes('Реплика'))
 }finally{await f.close()}
})
test('Диалог в игре: новая реплика не сбивает чтение раннего текста, кнопка возвращает к последней',async()=>{
 const f=await fixture({messages:[entry('first',1)],active:true})
 try{
  const feed=document.querySelector('[role="log"]');Object.defineProperties(feed,{scrollHeight:{configurable:true,value:1000},clientHeight:{configurable:true,value:200}})
  await flush(()=>{feed.scrollTop=100;feed.dispatchEvent(new dom.window.Event('scroll',{bubbles:true}))})
  await f.render({messages:[entry('first',1),entry('second',2)]})
  assert.equal(feed.scrollTop,100);assert.equal(f.counts.at(-1),1)
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Новые реплики: 1'));assert(button)
  await flush(()=>button.click());assert.equal(feed.scrollTop,1000);assert.equal(f.counts.at(-1),0)
 }finally{await f.close()}
})
test('Диалог в игре: загрузка ранних сообщений сохраняет отметку чтения и не создаёт старых уведомлений',async()=>{
 const newer=Array.from({length:100},(_,i)=>entry('new-'+i,1)),older=Array.from({length:100},(_,i)=>entry('old-'+i,1)),f=await fixture({messages:newer,total:200,active:true})
 try{
  let requested=0;f.state.onOlder=()=>{requested++}
  await f.render({});const more=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Показать ранние реплики'));assert(more)
  await flush(()=>more.click());assert.equal(requested,1)
  await f.render({messages:[...older,...newer]});assert.equal(f.counts.at(-1),0);assert.equal(document.querySelectorAll('article').length,200)
  assert(!document.body.textContent.includes('Показать ранние реплики'))
 }finally{await f.close()}
})
test('Диалог в игре: одинаковые временные метки различаются, закрытие вопроса уведомляет, снятие не уведомляет',()=>{
 const key='story-read:'+crypto.randomUUID(),a=entry('a',5),b=entry('b',5)
 read.markStoryRead(key,read.incomingStoryMessages([a]))
 assert.equal(read.unreadStoryCount(read.storyReadSnapshot(key),read.incomingStoryMessages([a,b,entry('older',4)])),1)
 const question={...entry('question',1),kind:'request',resolution:{kind:'dismissed',at:entry('at',6).createdAt,note:'Вернёмся позже'}}
 assert.equal(read.unreadStoryCount(read.storyReadSnapshot(key),read.incomingStoryMessages([question])),1)
 question.resolution.kind='withdrawn';assert.equal(read.incomingStoryMessages([question]).length,0)
})
test('Диалог в игре: прочтение синхронизируется между экранами и вкладками, другой аккаунт изолирован',async()=>{
 const key='story-read:'+crypto.randomUUID(),messages=[entry('shared',1)],f=await fixture({readKey:key,messages})
 try{
  const otherKey='story-read:'+crypto.randomUUID(),incoming=read.incomingStoryMessages(messages)
  await flush(()=>read.markStoryRead(otherKey,incoming));assert.equal(f.counts.at(-1),1)
  await flush(()=>read.markStoryRead(key,incoming));assert.equal(f.counts.at(-1),0)
  await f.render({messages:[...messages,entry('across-tab',2)]});assert.equal(f.counts.at(-1),1)
  const next=JSON.stringify({at:Date.parse(entry('time',2).createdAt),keys:['across-tab']})
  await flush(()=>window.dispatchEvent(new dom.window.StorageEvent('storage',{key,newValue:next})));assert.equal(f.counts.at(-1),0)
  await flush(()=>window.dispatchEvent(new dom.window.StorageEvent('storage',{key,newValue:JSON.stringify({at:Date.parse(entry('time',1).createdAt),keys:['shared']})})));assert.equal(f.counts.at(-1),0)
  await flush(()=>window.dispatchEvent(new dom.window.StorageEvent('storage',{key,newValue:'{broken'})));assert.equal(f.counts.at(-1),0)
 }finally{await f.close()}
})
test('Диалог в игре: запоздавшая вкладка не перезаписывает более новую общую отметку чтения',()=>{
 const key='story-read:'+crypto.randomUUID(),old=entry('old',1),latest=entry('latest',2)
 read.storyReadSnapshot(key)
 localStorage.setItem(key,JSON.stringify({at:Date.parse(latest.createdAt),keys:[latest.id]}))
 read.markStoryRead(key,read.incomingStoryMessages([old]))
 assert.equal(JSON.parse(localStorage.getItem(key)).at,Date.parse(latest.createdAt))
 assert.equal(read.unreadStoryCount(read.storyReadSnapshot(key),read.incomingStoryMessages([latest])),0)
})
