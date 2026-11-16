import assert from 'node:assert/strict'
import {browserCheck} from './browser-check.mjs'

const html=`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Грани Бытия · проверка интерфейса</title></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import App from '/src/App.tsx';import SceneEditor from '/src/SceneEditor.tsx';import GameTable from '/src/LobbyGameTable.tsx';import InterfacePreferencesBridge from '/src/interfacePreferences.ts';import InterfaceAppearance from '/src/InterfaceAppearance.tsx';import {OnlineContext} from '/src/onlineContext.ts';import {createDefaultCharacter} from '/src/characterModel.ts';import {createScene,emptyScenes} from '/src/scenes.ts';import '/src/index.css';import '/src/uiSystem.css';import '/src/realmDesign.css';
const surface=new URLSearchParams(location.search).get('surface'),at='2026-11-16T12:00:00.000Z',actor={...createDefaultCharacter(),id:'qa-hero',name:'Следопыт'},hero={id:actor.id,name:actor.name,ownerId:'qa-host',approved:true,control:{controllerId:'qa-host',delegated:false,npc:false},profile:actor.profile,resources:actor.resources,abilities:[],charges:[],sensations:[],capabilities:[]};
const members=[{id:'qa-host',displayName:'Мастер',role:'PLAYER',disabled:false,lobbyRole:'GM',permissions:[]},{id:'qa-player',displayName:'Спутница',role:'PLAYER',disabled:false,lobbyRole:'PLAYER',permissions:[]}];
const cards=[{id:'qa-party',title:'Дорога к новым историям',description:'Небольшая партия для совместного приключения. Исследуем мир и принимаем решения вместе.',owner:'Мастер',owner_id:'qa-host',genre:'Приключение',slots:4,players:2,energy:'any',rank:'mortal',status:'open',visibility:'public',updated_at:at},{id:'qa-second',title:'Вечер за игровым столом',description:'Место для друзей, интересных героев и хорошей истории.',owner:'Ведущий',owner_id:'qa-other',genre:'Исследование',slots:5,players:3,energy:'mana',rank:'mortal',status:'open',visibility:'public',updated_at:at}];
const lobby={...cards[0],status:'playing',myRole:'GM',myPermissions:[],revision:9,members,creationConditions:{}};
const map={title:'У ворот',description:'Известная герою обстановка',frame:{id:'qa-scene',width:16,depth:12,minZ:0,maxZ:6,groundZ:0,view:'top',palette:'stone'},areas:[{id:'known',x:0,y:0,z:0,width:16,depth:12,height:6,visible:true}],objects:[],contacts:[{id:'self',kind:'self',label:actor.name,signs:'',x:6,y:4,z:0,characterModel:'vanguard',characterAnimation:'idle'}]};
const request=async url=>{
 if(url.includes('/perception'))return {revision:9,seconds:15,closed:false,hero,map,canWriteNotes:true,knowledge:{journal:[],knownEffects:[]},inventory:[],work:[]};
 if(url.includes('/round-results'))return {revision:9,generation:1,closed:false,reports:[],hasMore:false};
 if(url.endsWith('/play/session'))return {revision:9,generation:1,status:'playing',paused:false,seconds:15,phase:'ready',round:null,result:null,ready:[],canStart:false,participants:[],session:{version:1,status:'playing',objectives:[],startedAt:at,finishedAt:null,outcome:null,summary:''}};
 if(url.includes('/play/story'))return {revision:9,closed:false,paused:false,planVersion:0,totalMessages:0,beats:[],messages:[],pending:[],activeSceneId:'qa-scene',scenes:[{id:'qa-scene',name:'У ворот'}],npcs:[],heroes:[{id:actor.id,name:actor.name,sceneId:'qa-scene',submitted:false}]};
 if(url.endsWith('/story'))return {closed:false,paused:false,sceneId:'qa-scene',canAsk:true,canWithdraw:true,totalMessages:0,contacts:[],messages:[]};
 if(url.includes('/declarations'))return {collection:null,participating:false,canSubmit:false,controlStamp:'qa',entry:null,options:null,readiness:[]};
 if(url.includes('/quests'))return {closed:false,quests:[]};
 if(url==='/characters'||url==='/lobbies/mine')return [];
 if(url.startsWith('/lobbies?'))return {items:cards,hasMore:false};
 if(url.startsWith('/forum/categories'))return [{id:'talk',name:'Обсуждения'}];
 if(url.startsWith('/forum/topics?'))return {items:[{id:'qa-topic',title:'Как начать первую совместную историю',body:'Обсуждаем первые шаги игрока и мастера.',category:'talk',author:'Путешественник',author_id:'qa-member',locked:0,pinned:1,replies:6,created_at:at,updated_at:at}],hasMore:false};
 return {items:[],hasMore:false};
};
function Editor(){const [scene,setScene]=React.useState(()=>{const s=createScene(emptyScenes(),'qa-editor','Мастерская сцен','top');s.scenes[0].tokens=[{actorId:actor.id,x:5,y:5,z:0,diameter:1,support:{kind:'ground'}}];return s});return React.createElement('main',{className:'realm-qa-editor',style:{height:'100dvh',display:'flex',flexDirection:'column'}},React.createElement('div',{style:{padding:'12px',display:'flex',justifyContent:'flex-end',flex:'none'}},React.createElement(InterfaceAppearance)),React.createElement(SceneEditor,{value:scene,actors:[actor],mode:'build',workspace:true,onChange:next=>{setScene(next);return {ok:true,message:''}}}))}
const value={user:surface==='game'?members[0]:new URLSearchParams(location.search).has('account')?{...members[0],displayName:'ПутешественникСОченьДлиннымИменем'}:null,config:{authMode:'local',supabaseUrl:'',publishableKey:''},loading:false,error:'',connected:true,recovering:false,events:0,request,refresh(){},socket:null,supabase:null,login:async()=>'',register:async()=>'',logout:async()=>{},reloadUser:async()=>{},clearRecovery(){}};
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(InterfacePreferencesBridge),React.createElement(OnlineContext.Provider,{value},surface==='editor'?React.createElement(Editor):surface==='game'?React.createElement('main',{style:{maxWidth:'1450px',margin:'auto',padding:'18px'}},React.createElement(GameTable,{accountId:'qa-host',lobby,characters:[hero],checkingAccess:false,onHeroes(){},onRound(){},onEditor(){}})):React.createElement(App))));
</script></body></html>`
const result=await browserCheck(process.argv[2]??'.tmp/interface-design-browser',html,async({evaluate,until,capture,call,delay})=>{
 const wait=selector=>until(()=>evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),selector)
 const input=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 const navigate=async(query)=>{await evaluate(`(()=>{const u=new URL(location.href);u.search=${JSON.stringify(query)};location.href=u.href})()`);await delay(400)}
 const headerLayout=async()=>{
  const controls=await evaluate(`Array.from(document.querySelectorAll('.ui-brand,.ui-site-links>button,.ui-site-links>.ui-disclosure-menu>summary,.ui-account-navigation>button,.ui-account-navigation>.ui-disclosure-menu>summary,.ui-connection')).map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent.trim(),x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}).filter(r=>r.width&&r.height)`)
  for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert(!(a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1),'Header controls overlap: '+a.label+' / '+b.label)}
 }
 await wait('.realm-hero');await until(()=>evaluate(`Array.from(document.querySelectorAll('.realm-hero img')).every(i=>i.complete&&i.naturalWidth>0)`),'hero illustrations')
 const homeDesktop=await capture('home-desktop',1440,1000);await headerLayout()
 await evaluate(`document.querySelectorAll('.realm-portrait-picker button')[1].click()`);assert.equal(await evaluate(`document.querySelector('.realm-portrait figcaption strong').textContent`),'Мастерство')
 assert(await evaluate(`(()=>{const a=document.querySelector('.realm-portrait').getBoundingClientRect(),b=document.querySelector('.realm-portrait-picker').getBoundingClientRect();return b.top>=a.bottom})()`),'Portrait controls cover caption')
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate(`getComputedStyle(document.querySelector('.realm-portrait>img')).animationName`),'none')
 const homeMobile=await capture('home-mobile',390,844);await headerLayout()
 await evaluate(`document.querySelector('.realm-nav-search').click()`);await wait('[aria-label="Найти раздел сайта"]');await input('[aria-label="Найти раздел сайта"]','форум')
 await evaluate(`document.querySelector('[aria-label="Найти раздел сайта"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);await wait('.w6-topic-row')
 const forumMobile=await capture('forum-mobile',390,844)
 await evaluate(`document.querySelector('.realm-appearance>summary').click()`);await evaluate(`document.querySelector('.realm-appearance [data-accent="shadow"] input').click()`)
 await input('[aria-label="Размер текста интерфейса"]','large');await input('[aria-label="Плотность интерфейса"]','compact')
 const comfortMobile=await capture('comfort-mobile',390,844)
 await navigate('?page=account');await wait('.w6-auth-form');assert.equal(await evaluate('document.documentElement.dataset.uiAccent'),'shadow');assert.equal(await evaluate('document.documentElement.dataset.uiText'),'large')
 const accountMobile=await capture('account-mobile',390,844)
 await navigate('?page=character');await wait('#new-character-name');await input('#new-character-name','Элиан');await evaluate(`document.querySelector('.w6-create').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`)
 await wait('[aria-label="Разделы персонажа"]');const characterMobile=await capture('character-mobile',390,844),characterDesktop=await capture('character-desktop',1440,1000);await headerLayout()
 await wait('[aria-label="Поиск: Разделы персонажа"]');await input('[aria-label="Поиск: Разделы персонажа"]','анатом');assert.equal(await evaluate(`document.querySelectorAll('.ui-workspace-groups button').length`),1)
 await navigate('?page=lobbies');await wait('.w6-race-card');const lobbiesDesktop=await capture('lobbies-desktop',1440,1000),lobbiesMobile=await capture('lobbies-mobile',390,844)
 await navigate('?surface=editor');await wait('.gb-workspace-commandbar');await until(()=>evaluate(`!!document.querySelector('canvas')&&document.querySelector('canvas').width>0`),'editor canvas')
 const editorDesktop=await capture('editor-desktop',1440,1000),editorMobile=await capture('editor-mobile',390,844)
 assert(await evaluate(`(()=>{const panel=document.querySelector('.gb-workspace-placement').getBoundingClientRect();return Array.from(document.querySelectorAll('.gb-workspace-placement select,.gb-workspace-placement label')).every(e=>{const r=e.getBoundingClientRect();return r.left>=panel.left&&r.right<=panel.right+1&&r.bottom<=panel.bottom+1})})()`),'Editor placement controls clipped')
 assert(await evaluate(`document.querySelectorAll('.gb-workspace-tools button').length>0`));
 await navigate('?surface=game');await wait('[aria-label="Игровой стол"]');await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Открыть экран героя').click()`);await wait('.gb-player-screen canvas')
 const gameDesktop=await capture('game-desktop',1440,1000),gameMobile=await capture('game-mobile',390,844)
 await navigate('?account=long');await wait('.realm-hero');await evaluate(`document.querySelector('.realm-appearance>summary').click()`);await evaluate(`document.querySelector('.realm-setting-check input').click()`);await evaluate(`document.querySelector('.realm-appearance>summary').click()`)
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.realm-hero-art')).display`),'none');const calmMobile=await capture('home-calm-mobile',390,844);await headerLayout();assert(await evaluate(`document.querySelector('.ui-account-menu>summary').getBoundingClientRect().height<65`),'Long account name expands the toolbar')
 return {quickNavigation:true,illustrations:true,reducedMotion:true,headerLayout:true,preferencesPersist:true,workspaceSearch:true,editorCanvas:true,atmosphereToggle:true,homeDesktop,homeMobile,forumMobile,comfortMobile,accountMobile,characterMobile,characterDesktop,lobbiesDesktop,lobbiesMobile,editorDesktop,editorMobile,gameDesktop,gameMobile,calmMobile}
},{webgl:true});console.log(JSON.stringify(result,null,2))
