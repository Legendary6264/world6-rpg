import { lazy, Suspense, useEffect, useState } from 'react'
import type { Lobby, PlayerCharacter } from './onlineTypes'
import { hasLobbyPermission } from './lobbyAccess'
import LobbyPlayerScreen from './LobbyPlayerScreen'
import './gameplay.css'
const LobbySceneLaunch=lazy(()=>import('./LobbySceneLaunch'))
export default function LobbyGameTable({accountId,lobby,characters,checkingAccess,onHeroes,onRound}:{accountId:string;lobby:Lobby;characters:PlayerCharacter[];checkingAccess:boolean;onHeroes:()=>void;onRound:()=>void}){
 const playable=characters.filter(c=>!c.npc&&(c.ownerId===accountId||c.control?.controllerId===accountId))
 const [chosen,setChosen]=useState(''),[expanded,setExpanded]=useState(false),[setup,setSetup]=useState(false)
 const selected=playable.find(c=>c.id===chosen)??playable[0]
 const canLeadRound=hasLobbyPermission(lobby.myRole,lobby.myPermissions,'rounds')&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'viewSecrets')
 const master=hasLobbyPermission(lobby.myRole,lobby.myPermissions,'scenes')&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'viewSecrets')
 useEffect(()=>{if(!expanded)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)};window.addEventListener('keydown',close);const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{window.removeEventListener('keydown',close);document.body.style.overflow=old}},[expanded])
 return <section className={'gb-game-table'+(expanded?' gb-game-fullscreen':'')} aria-label="Игровой стол">
  <header className="gb-game-header"><div><small>{master?'Мастер кампании':'Совместное приключение'}</small><h3>{lobby.title}</h3></div><div className="w6-buttons"><button className="w6-button" onClick={()=>setExpanded(!expanded)}>{expanded?'Выйти из игрового режима':'Развернуть игру'}</button>{canLeadRound&&<button className="w6-button" onClick={onRound}>Вести раунд</button>}<button className="w6-button" onClick={onHeroes}>Герои кампании</button></div></header>
  {master&&<><div className="w6-buttons"><button className="w6-button w6-primary" aria-expanded={setup} onClick={()=>setSetup(!setup)}>{setup?'Свернуть подготовку сцены':'Начать игру на сцене'}</button></div>{setup&&<Suspense fallback={<p>Загружаем подготовку…</p>}><LobbySceneLaunch key={lobby.id} accountId={accountId} lobbyId={lobby.id} disabled={checkingAccess}/></Suspense>}<p className="gb-game-help">Сначала прими героев, затем размести их на сцене. Игроки составляют ходы одновременно; последствия применяются во вкладке «Раунд».</p></>}
  {!!playable.length&&<><label className="w6-field"><span>Кем играть</span><select aria-label="Активный игровой герой" value={selected?.id??''} onChange={e=>setChosen(e.currentTarget.value)}>{playable.map(c=><option key={c.id} value={c.id}>{c.name}{c.approved?'':' · ожидает мастера'}</option>)}</select></label>
    {selected&&<LobbyPlayerScreen key={JSON.stringify([accountId,lobby.id,selected.id])} accountId={accountId} lobbyId={lobby.id} character={selected} checkingAccess={checkingAccess} members={lobby.members}/>}</>}
  {!playable.length&&<div className="gb-scene-empty"><h4>{master?'Подготовь приключение для игроков':'Выбери героя, чтобы начать'}</h4><p>{master?'Добавь или прими героев во вкладке «Герои», затем открой подготовку сцены.':'Добавь сохранённого персонажа в кампанию. После принятия мастером здесь появятся карта, действия и состояние героя.'}</p><button className="w6-button w6-primary" onClick={onHeroes}>Добавить или выбрать героя</button></div>}
 </section>
}
