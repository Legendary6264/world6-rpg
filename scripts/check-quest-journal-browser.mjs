import assert from 'node:assert/strict'
import {browserCheck} from './browser-check.mjs'

const html=`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Журнал заданий</title></head><body><main id="root" style="max-width:1100px;margin:auto;padding:12px"></main><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {OnlineContext} from '/src/onlineContext.ts';import Editor from '/src/LobbyQuests.tsx';import Journal from '/src/QuestJournal.tsx';import {publicQuests} from '/src/questLog.ts';import '/src/index.css';import '/src/world6.css';import '/src/brandStyle.css';
const listeners=new Set(),story={version:1,planVersion:0,beats:[],messages:[{id:'source',kind:'npc',speaker:'Страж у ворот',body:'Узнайте, кто ждёт караван, и возвращайтесь с ответом.',audience:['hero-a']}],quests:{version:1,entries:[{id:'browser-quest',title:'Договориться о проходе',description:'Страж готов обсудить проход каравана. Выясните, кому предназначен груз, и передайте ответ у ворот.',notes:'PRIVATE-BROWSER-NOTES',status:'active',published:false,audience:['hero-a'],sourceMessageId:'source',objectives:[{id:'talk',title:'Поговорить со стражем',done:true},{id:'answer',title:'Вернуться с ответом',done:false}],updatedAt:'2026-11-16T12:00:00.000Z'}]}};
function Panel({role}){
 const [events,setEvents]=React.useState(0),refresh=React.useCallback(()=>setEvents(n=>n+1),[]);React.useEffect(()=>{listeners.add(refresh);return()=>listeners.delete(refresh)},[refresh]);
 const request=React.useMemo(()=>async(url,init={})=>{
  if(init.method==='POST'){const c=JSON.parse(init.body);story.quests={version:c.baseVersion+1,entries:[{...c.quest,updatedAt:new Date().toISOString()}]};for(const listener of listeners)listener();return {duplicate:false,receipt:{operation:'quest-save',commandKey:c.commandKey,id:c.quest.id,generation:1,version:c.baseVersion+1,revision:10,appliedAt:new Date().toISOString()}};}
  return structuredClone(role==='master'?{generation:1,version:story.quests.version,closed:false,quests:story.quests.entries,heroes:[{id:'hero-a',name:'Следопыт'},{id:'hero-b',name:'Спутница'}],sources:story.messages.map(m=>({id:m.id,speaker:m.speaker,body:m.body}))}:{closed:false,quests:publicQuests(story,'hero-a')});
 },[role]);
 return React.createElement('section',{'data-check':role},React.createElement('h2',null,role==='master'?'Стол мастера':'Журнал героя'),React.createElement(OnlineContext.Provider,{value:{request,events,user:{id:role},refresh}},React.createElement(role==='master'?Editor:Journal,{accountId:'quest-browser-check',lobbyId:'browser-room',characterId:'hero-a',checkingAccess:false})));
}
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(Panel,{role:'master'}),React.createElement(Panel,{role:'player'})));
</script></body></html>`
const result=await browserCheck(process.argv[2]??'.tmp/quest-browser',html,async({evaluate,until,capture})=>{
 await until(()=>evaluate(`!!document.querySelector('[aria-label="Название задания"]')`),'quest editor')
 assert(!(await evaluate(`document.querySelector('[data-check="player"]').textContent`)).includes('Договориться о проходе'))
 await evaluate(`document.querySelector('[aria-label="Выдать задание героям"]').click()`)
 await evaluate(`Array.from(document.querySelectorAll('[data-check="master"] button')).find(b=>b.textContent==='Выдать или обновить задание').click()`)
 await until(()=>evaluate(`!!document.querySelector('[data-check="player"] .gb-quest-card')`),'published personal quest')
 const player=await evaluate(`document.querySelector('[data-check="player"]').textContent`);assert(player.includes('Выполнено 1 из 2'));assert(player.includes('Страж у ворот'));assert(!player.includes('PRIVATE-BROWSER-NOTES'))
 assert.equal(await evaluate(`document.querySelectorAll('[data-check="player"] input').length`),0)
 const desktop=await capture('desktop',1280,1000),mobile=await capture('mobile',390,844)
 await evaluate(`document.querySelector('[aria-label="Выполнен пункт 2"]').click();const s=document.querySelector('[aria-label="Состояние задания"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'completed');s.dispatchEvent(new Event('change',{bubbles:true}))`)
 await evaluate(`Array.from(document.querySelectorAll('[data-check="master"] button')).find(b=>b.textContent==='Выдать или обновить задание').click()`)
 await until(()=>evaluate(`!!Array.from(document.querySelectorAll('[data-check="player"] button')).find(b=>b.textContent==='История заданий (1)')`),'completed quest')
 await evaluate(`Array.from(document.querySelectorAll('[data-check="player"] button')).find(b=>b.textContent==='История заданий (1)').click()`)
 assert((await evaluate(`document.querySelector('[data-check="player"]').textContent`)).includes('Выполнено 2 из 2'))
 const completed=await capture('completed',390,844)
 return {published:true,personalSource:true,privateNotesHidden:true,playerReadOnly:true,completed:true,desktop,mobile,completedImage:completed}
});console.log(JSON.stringify(result,null,2))
