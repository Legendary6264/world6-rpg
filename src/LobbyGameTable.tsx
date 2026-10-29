import LobbyGameSession from './LobbyGameSession'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Lobby, PlayerCharacter } from './onlineTypes'
import { hasLobbyPermission } from './lobbyAccess'
import LobbyPlayerScreen from './LobbyPlayerScreen'
import './gameplay.css'
const LobbySceneLaunch=lazy(()=>import('./LobbySceneLaunch'))
export default function LobbyGameTable({accountId,lobby,characters,checkingAccess,onHeroes,onRound,onEditor,onMembers,onCopies,active=true}:{accountId:string;lobby:Lobby;characters:PlayerCharacter[];checkingAccess:boolean;onHeroes:()=>void;onRound:()=>void;onEditor?:()=>void;onMembers?:()=>void;onCopies?:()=>void;active?:boolean}){
 const playable=characters.filter(c=>!c.npc&&(c.ownerId===accountId||c.control?.controllerId===accountId))
 const [chosen,setChosen]=useState(''),[fullScreen,setExpanded]=useState(false),[setup,setSetup]=useState(false),root=useRef<HTMLElement>(null)
 const expanded=active&&fullScreen
 if(!active&&fullScreen)setExpanded(false)
 const selected=playable.find(c=>c.id===chosen)??playable[0]
 const canLeadRound=hasLobbyPermission(lobby.myRole,lobby.myPermissions,'rounds')&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'viewSecrets')
 const master=hasLobbyPermission(lobby.myRole,lobby.myPermissions,'scenes')&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'viewSecrets')
 useEffect(()=>{
  if(!expanded)return
  const opener=document.activeElement as HTMLElement|null,old=document.body.style.overflow
  document.body.style.overflow='hidden';root.current?.querySelector<HTMLButtonElement>('[data-game-close]')?.focus()
  const close=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();setExpanded(false);return}
   if(e.key!=='Tab')return
   const fields=Array.from(root.current?.querySelectorAll<HTMLElement>('button,input,select,textarea,summary,[tabindex="0"]')??[]).filter(el=>!el.closest('[hidden]')&&!el.matches(':disabled')&&(!el.closest('details:not([open])')||el.tagName==='SUMMARY'))
   const first=fields[0],last=fields.at(-1)
   if(!first){e.preventDefault();root.current?.focus();return}
   if(e.shiftKey&&(document.activeElement===first||!root.current?.contains(document.activeElement))){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&(document.activeElement===last||!root.current?.contains(document.activeElement))){e.preventDefault();first.focus()}
  }
  window.addEventListener('keydown',close)
  return()=>{window.removeEventListener('keydown',close);document.body.style.overflow=old;if(opener?.isConnected)opener.focus()}
 },[expanded])
 function leave(callback:()=>void){setExpanded(false);callback()}
 return <section ref={root} tabIndex={-1} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} className={'gb-game-table'+(expanded?' gb-game-fullscreen':'')} aria-label="Игровой стол">
  <header className="gb-game-header"><div><small>{master?'Мастер кампании':'Совместное приключение'}</small><h3>{lobby.title}</h3></div><div className="w6-buttons"><button data-game-close className="w6-button" onClick={()=>setExpanded(!expanded)}>{expanded?'Выйти из игрового режима':'Развернуть игру'}</button>{canLeadRound&&<button className="w6-button" onClick={()=>leave(onRound)}>Вести раунд</button>}{onEditor&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'scenes')&&<button className="w6-button" onClick={()=>leave(onEditor)}>Открыть редактор сцены</button>}<button className="w6-button" onClick={()=>leave(onHeroes)}>Герои кампании</button></div></header>
  <LobbyGameSession key={JSON.stringify([accountId,lobby.id])} accountId={accountId} lobby={lobby} disabled={checkingAccess} onHeroes={()=>leave(onHeroes)} onRound={()=>leave(onRound)} onSetup={()=>setSetup(true)} onMembers={()=>leave(onMembers??onHeroes)} onCopies={()=>leave(onCopies??onRound)}/>
  {master&&lobby.status!=='closed'&&<><div className="w6-buttons"><button className="w6-button w6-primary" aria-expanded={setup} onClick={()=>setSetup(!setup)}>{setup?'Свернуть подготовку сцены':'Начать игру на сцене'}</button></div>{setup&&<Suspense fallback={<p>Загружаем подготовку…</p>}><LobbySceneLaunch key={lobby.id} accountId={accountId} lobbyId={lobby.id} disabled={checkingAccess}/></Suspense>}<p className="gb-game-help">Сначала прими героев, затем размести их на сцене. Игроки составляют ходы одновременно; последствия применяются во вкладке «Раунд».</p></>}
  {!!playable.length&&<><label className="w6-field"><span>Кем играть</span><select aria-label="Активный игровой герой" value={selected?.id??''} onChange={e=>setChosen(e.currentTarget.value)}>{playable.map(c=><option key={c.id} value={c.id}>{c.name}{c.approved?'':' · ожидает мастера'}</option>)}</select></label>
    {selected&&<LobbyPlayerScreen key={JSON.stringify([accountId,lobby.id,selected.id])} accountId={accountId} lobbyId={lobby.id} character={selected} checkingAccess={checkingAccess} members={lobby.members}/>}</>}
  {!playable.length&&<div className="gb-scene-empty"><h4>{master?'Подготовь приключение для игроков':'Выбери героя, чтобы начать'}</h4><p>{master?'Добавь или прими героев во вкладке «Герои», затем открой подготовку сцены.':'Добавь сохранённого персонажа в кампанию. После принятия мастером здесь появятся карта, действия и состояние героя.'}</p><button className="w6-button w6-primary" onClick={()=>leave(onHeroes)}>Добавить или выбрать героя</button></div>}
 </section>
}
