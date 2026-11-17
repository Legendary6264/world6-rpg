import LobbyGameSession from './LobbyGameSession'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Lobby, PlayerCharacter } from './onlineTypes'
import { hasLobbyPermission } from './lobbyAccess'
import LobbyPlayerScreen from './LobbyPlayerScreen'
import LobbyWorkbench from './LobbyWorkbench'
import type {LobbySection} from './LobbyWorkbench'
import DisclosureMenu from './DisclosureMenu'
import './gameplay.css'
const LobbySceneLaunch=lazy(()=>import('./LobbySceneLaunch'))
const LobbyStory=lazy(()=>import('./LobbyStory'))
const LobbyRoundResults=lazy(()=>import('./LobbyRoundResults'))
export default function LobbyGameTable({accountId,lobby,characters,checkingAccess,onHeroes,onRound,onEditor,onMembers,onCopies,onWorld,active=true}:{accountId:string;lobby:Lobby;characters:PlayerCharacter[];checkingAccess:boolean;onHeroes:()=>void;onRound:()=>void;onEditor?:()=>void;onMembers?:()=>void;onCopies?:()=>void;onWorld?:()=>void;active?:boolean}){
 const playable=characters.filter(c=>!c.npc&&(c.ownerId===accountId||c.control?.controllerId===accountId))
 const [chosen,setChosen]=useState(''),[fullScreen,setExpanded]=useState(false),[setup,setSetup]=useState(false),[watched,setWatched]=useState(''),root=useRef<HTMLElement>(null)
 const [masterPane,setMasterPane]=useState('story'),[deskOpen,setDeskOpen]=useState(false),desk=useRef<HTMLDetailsElement>(null)
 const watchable=characters.filter(c=>!c.npc&&c.approved),watchedHero=watchable.find(c=>c.id===watched)??watchable[0]
 const expanded=active&&fullScreen
 if(!active&&fullScreen)setExpanded(false)
 const selected=playable.find(c=>c.id===chosen)??playable[0]
 const canLeadRound=hasLobbyPermission(lobby.myRole,lobby.myPermissions,'rounds')&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'viewSecrets')
 const master=hasLobbyPermission(lobby.myRole,lobby.myPermissions,'scenes')&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'viewSecrets')
 const canTellStory=hasLobbyPermission(lobby.myRole,lobby.myPermissions,'npcs')&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'viewSecrets')
 const masterPanes=[...(canTellStory?['story']:[]),...(master&&lobby.status!=='closed'?['scene']:[]),...(master&&watchedHero?['review']:[])]
 const currentMasterPane=masterPanes.includes(masterPane)?masterPane:masterPanes[0]
 useEffect(()=>{
  if(!expanded)return
  const opener=document.activeElement as HTMLElement|null,old=document.body.style.overflow
  document.body.style.overflow='hidden';root.current?.querySelector<HTMLButtonElement>('[data-game-close]')?.focus()
  const close=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();setExpanded(false);return}
   if(e.key!=='Tab')return
   const fields=Array.from(root.current?.querySelectorAll<HTMLElement>('button,input,select,textarea,summary,[tabindex="0"]')??[]).filter(el=>{
    if(el.closest('[hidden]')||el.matches(':disabled'))return false
    for(let closed=el.closest('details:not([open])');closed;closed=closed.parentElement?.closest('details:not([open])')??null)if(el.tagName!=='SUMMARY'||el.parentElement!==closed)return false
    return true
   })
   const first=fields[0],last=fields.at(-1)
   if(!first){e.preventDefault();root.current?.focus();return}
   if(e.shiftKey&&(document.activeElement===first||!root.current?.contains(document.activeElement))){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&(document.activeElement===last||!root.current?.contains(document.activeElement))){e.preventDefault();first.focus()}
  }
  window.addEventListener('keydown',close)
  return()=>{window.removeEventListener('keydown',close);document.body.style.overflow=old;if(opener?.isConnected)opener.focus()}
 },[expanded])
 function leave(callback:()=>void){setExpanded(false);callback()}
 function openSetup(){setSetup(true);setMasterPane('scene');setDeskOpen(true);desk.current?.scrollIntoView?.({block:'nearest'})}
 const masterSections:LobbySection[]=[]
 if(canTellStory)masterSections.push({id:'story',label:'Диалоги и задания',content:<Suspense fallback={<p>Открываем стол ведущего…</p>}><LobbyStory key={JSON.stringify([accountId,lobby.id,'story'])} accountId={accountId} lobbyId={lobby.id} checkingAccess={checkingAccess} onRound={()=>leave(onRound)} onNpcs={onWorld?()=>leave(onWorld):undefined}/></Suspense>})
 if(master&&lobby.status!=='closed')masterSections.push({id:'scene',label:'Подготовка сцены',content:<><h4>Подготовь место встречи</h4><p className="gb-game-help">Сначала прими героев, затем размести их на сцене. Игроки составляют ходы одновременно; последствия применяются во вкладке «Раунд».</p><div className="w6-buttons"><button className="w6-button w6-primary" aria-expanded={setup} onClick={()=>setSetup(!setup)}>{setup?'Свернуть подготовку сцены':'Начать игру на сцене'}</button><button className="w6-button" onClick={()=>leave(onHeroes)}>Открыть героев кампании</button></div>{setup&&<Suspense fallback={<p>Загружаем подготовку…</p>}><LobbySceneLaunch key={lobby.id} accountId={accountId} lobbyId={lobby.id} disabled={checkingAccess} onEditor={onEditor?()=>leave(onEditor):undefined} onHeroes={()=>leave(onHeroes)}/></Suspense>}</>})
 if(master&&watchedHero)masterSections.push({id:'review',label:'Просмотр раундов',content:<div className="realm-master-review"><h4>Просмотр исполненных раундов глазами героев</h4><p className="w6-copy">Выбери героя, чтобы проверить доступную ему сцену и события сохранённого раунда.</p><label className="w6-field"><span>Герой для просмотра</span><select aria-label="Герой для просмотра раунда" value={watchedHero.id} onChange={e=>setWatched(e.currentTarget.value)}>{watchable.map(hero=><option key={hero.id} value={hero.id}>{hero.name}</option>)}</select></label><Suspense fallback={<p>Загружаем просмотр раундов…</p>}><LobbyRoundResults sharedEnabled key={JSON.stringify([accountId,lobby.id,watchedHero.id,'master'])} lobbyId={lobby.id} characterId={watchedHero.id} checkingAccess={checkingAccess} active={active&&deskOpen&&currentMasterPane==='review'}/></Suspense></div>})
 return <section ref={root} tabIndex={-1} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} className={'gb-game-table'+(expanded?' gb-game-fullscreen':'')} aria-label="Игровой стол">
  <header className="gb-game-header"><div><small>{master?'Мастер кампании':masterSections.length?'Помощник ведущего':'Совместное приключение'}</small><h3>{lobby.title}</h3><div className="realm-game-state"><strong>{lobby.status==='closed'?'Архив сессии':lobby.status==='playing'?'Игра идёт':'Подготовка партии'}</strong><span>Участников: {lobby.members.length}</span></div></div><div className="w6-buttons"><button data-game-close className="w6-button" onClick={()=>setExpanded(!expanded)}>{expanded?'Выйти из игрового режима':'Развернуть игру'}</button>{canLeadRound&&<button className="w6-button w6-primary" onClick={()=>leave(onRound)}>Вести раунд</button>}<DisclosureMenu label="Инструменты">{onEditor&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'scenes')&&<button className="w6-button" onClick={()=>leave(onEditor)}>Открыть редактор сцены</button>}<button className="w6-button" onClick={()=>leave(onHeroes)}>Герои кампании</button></DisclosureMenu></div></header>
  <LobbyGameSession key={JSON.stringify([accountId,lobby.id])} accountId={accountId} lobby={lobby} disabled={checkingAccess} onHeroes={()=>leave(onHeroes)} onRound={()=>leave(onRound)} onSetup={openSetup} onMembers={()=>leave(onMembers??onHeroes)} onCopies={()=>leave(onCopies??onRound)}/>
  {!!masterSections.length&&<details ref={desk} className="realm-master-desk" open={deskOpen} onToggle={e=>setDeskOpen(e.currentTarget.open)}><summary><span><strong>Пульт ведущего</strong><small>Диалоги, подготовка и сохранённые раунды</small></span><span aria-hidden="true">⌄</span></summary><LobbyWorkbench label="Инструменты ведущего" selectedId={currentMasterPane} onSelectSection={setMasterPane} sections={masterSections}/></details>}
  {!!playable.length&&<><label className="w6-field"><span>Кем играть</span><select aria-label="Активный игровой герой" value={selected?.id??''} onChange={e=>setChosen(e.currentTarget.value)}>{playable.map(c=><option key={c.id} value={c.id}>{c.name}{c.approved?'':' · ожидает мастера'}</option>)}</select></label>
    {selected&&<LobbyPlayerScreen key={JSON.stringify([accountId,lobby.id,selected.id])} accountId={accountId} lobbyId={lobby.id} character={selected} checkingAccess={checkingAccess} members={lobby.members} active={active}/>}</>}
  {!playable.length&&<div className="gb-scene-empty"><h4>{master?'Подготовь приключение для игроков':'Выбери героя, чтобы начать'}</h4><p>{master?'Добавь или прими героев во вкладке «Герои», затем открой подготовку сцены.':'Добавь сохранённого персонажа в кампанию. После принятия мастером здесь появятся карта, действия и состояние героя.'}</p><button className="w6-button w6-primary" onClick={()=>leave(onHeroes)}>Добавить или выбрать героя</button></div>}
 </section>
}
