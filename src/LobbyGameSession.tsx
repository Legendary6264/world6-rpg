import LobbySessionPreparation from './LobbySessionPreparation'
import SessionStartGuide from './SessionStartGuide'
import PartyInvitation from './PartyInvitation'
import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {useRemote} from './onlineHooks'
import {NetworkError} from './onlineClient'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import {sceneEditorId} from './sceneEditorId'
import {gameSessionLabels,isGameSessionView,isGameFinishAck,isGameFinishState,isGameStartAck,isGamePauseAck} from './gameSession'
import type {FinishGameCommand,GameSessionView,StartGameCommand,PauseGameCommand} from './gameSession'
import type {Lobby} from './onlineTypes'

type Control={kind:'start';command:StartGameCommand}|{kind:'pause';command:PauseGameCommand}
type Draft={title:string;summary:string;confirmed:boolean;keepPending:boolean;revision?:number;command?:FinishGameCommand;pauseReason?:string;control?:Control}
const number=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0
const commandKey=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,160}$/.test(v)
const valid=(v:unknown):v is Draft=>{
 if(!v||typeof v!=='object')return false
 const d=v as Draft,c=d.command,p=d.control
 return typeof d.title==='string'&&d.title.length<=80&&typeof d.summary==='string'&&d.summary.length<=4000&&typeof d.confirmed==='boolean'&&typeof d.keepPending==='boolean'&&(d.revision===undefined||number(d.revision))&&
  (d.pauseReason===undefined||typeof d.pauseReason==='string'&&d.pauseReason.length<=1000)&&!(c&&p)&&
  (!c||number(c.revision)&&typeof c.title==='string'&&c.title.length<=80&&typeof c.summary==='string'&&c.summary.length<=4000&&typeof c.keepPending==='boolean'&&commandKey(c.commandKey)&&(c.generation===undefined||number(c.generation)&&c.generation>0))&&
  (!p||!!p.command&&number(p.command.revision)&&number(p.command.generation)&&Number(p.command.generation)>0&&commandKey(p.command.commandKey)&&(p.kind==='start'||p.kind==='pause'&&typeof p.command.paused==='boolean'&&typeof p.command.reason==='string'&&!!p.command.reason.trim()&&p.command.reason.length<=1000))
}
type Props={accountId:string;lobby:Lobby;disabled:boolean;onHeroes:()=>void;onRound:()=>void;onSetup:()=>void;onMembers:()=>void;onCopies:()=>void}
export default function LobbyGameSession(props:Props){
 return <GameSessionPanel key={JSON.stringify([props.accountId,props.lobby.id])} {...props}/>
}
function GameSessionPanel({accountId,lobby,disabled,onHeroes,onRound,onSetup,onMembers,onCopies}:Props){
 const {request,refresh}=useOnline(),path='/lobbies/'+lobby.id+'/play/session',remote=useRemote<GameSessionView>(path),value=isGameSessionView(remote.value)?remote.value:null,invalid=remote.value!==null&&!value,chief=lobby.myRole==='GM'
 const key=lobbyFormKey('game-finish',accountId,lobby.id),[draft,setDraft]=useState<Draft>(()=>readLobbyForm(key,valid)??{title:('Итог · '+lobby.title).slice(0,80),summary:'',confirmed:false,keepPending:false})
 const [busySource,setBusySource]=useState<{request:typeof request}|null>(null),[message,setMessage]=useState(''),[warning,setWarning]=useState(''),[ending,setEnding]=useState(false)
 const pending=useRef<AbortController|null>(null),mounted=useRef(true),preparation=useRef<HTMLDivElement>(null),latest=useRef({request,disabled,revision:value?.revision,loading:remote.loading,chief,draft})
 useLayoutEffect(()=>{latest.current={request,disabled,revision:value?.revision,loading:remote.loading,chief,draft}})
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort()}},[])
 useEffect(()=>()=>{pending.current?.abort();pending.current=null},[request,accountId,lobby.id])
 const busy=busySource?.request===request
 const unavailable=disabled||busy||remote.loading||!value,stale=draft.revision!==undefined&&draft.revision!==value?.revision,hasCommand=!!(draft.command||draft.control),reason=draft.pauseReason??''
 const acknowledged=!!draft.command&&!!value&&isGameFinishState(value,draft.command)
 useEffect(()=>{if(!acknowledged)return;const next={...draft,command:undefined,confirmed:false,revision:undefined};writeLobbyForm(key,next);
  // oxlint-disable-next-line react/set-state-in-effect -- A fetched durable result acknowledges a command whose HTTP response was lost.
  setDraft(next);setEnding(false);setBusySource(null);setMessage('Игра завершена. Общий итог подтверждён сохранённым состоянием кампании.')
  pending.current?.abort();pending.current=null
 },[acknowledged,draft,key])
 function remember(next:Draft){setDraft(next);const saved=writeLobbyForm(key,next);setWarning(saved?'':'Черновик сохранён только в памяти. Не закрывай страницу.');return saved}
 function edit(patch:Partial<Draft>){remember({...draft,...patch,confirmed:false,revision:draft.revision??value?.revision})}
 function current(){const l=latest.current;return mounted.current&&!pending.current&&!disabled&&!l.disabled&&chief&&l.chief&&l.request===request&&l.draft===draft&&!remote.loading&&!l.loading&&value?.revision===l.revision}
 async function send(kind:'start'|'pause'|'finish'){
  if(!value||!current())return
  if(draft.command&&kind!=='finish'||draft.control&&kind!==draft.control.kind)return
  let command=draft.command,control=draft.control
  if(!hasCommand&&!value.generation){setMessage('Обнови сайт и API: сервер не передал версию продолжения кампании.');refresh();return}
  if(kind==='finish'){
   if(!command){
    if(value.status==='closed'||stale||!draft.confirmed||!draft.title.trim()||!draft.summary.trim()||value.finishBlockers?.length||(!!value.pendingWork&&!draft.keepPending))return
    command={revision:value.revision,generation:value.generation,title:draft.title,summary:draft.summary,keepPending:draft.keepPending,commandKey:sceneEditorId()}
   }
  }else if(!control){
   if(value.status==='closed'||(kind==='start'?!value.canStart:!reason.trim()))return
   const base={revision:value.revision,generation:value.generation!,commandKey:sceneEditorId()}
   control=kind==='start'?{kind,command:base}:{kind:'pause',command:{...base,paused:!value.paused,reason}}
  }
  if(!remember({...draft,command,control})){
   // Restore the memory cache too: an unsent command must not become pending
   // after remounting if the browser refused its durable local copy.
   writeLobbyForm(key,draft);setDraft(draft);setWarning('Команда не отправлена: не удалось сохранить её на устройстве. Освободи место в хранилище браузера и повтори.');return
  }
  const abort=new AbortController();pending.current=abort;setBusySource({request});setMessage('')
  const body=kind==='finish'?command!:control!.command
  try{
   const reply=await request<unknown>(kind==='pause'?'/lobbies/'+lobby.id+'/rounds/pause':path+'/'+kind,{method:'POST',signal:abort.signal,body:JSON.stringify(body)})
   if(!mounted.current||abort.signal.aborted||pending.current!==abort||latest.current.request!==request)return
   if(!(kind==='finish'?isGameFinishAck(reply,command!):control?.kind==='start'?isGameStartAck(reply,control.command):control?.kind==='pause'&&isGamePauseAck(reply,control.command)))throw Error('Сервер не подтвердил изменение игры. Проверяем сохранённое состояние; при необходимости повтори отправку.')
   remember({...draft,confirmed:false,command:undefined,control:undefined,revision:undefined});if(kind==='finish')setEnding(false)
   const duplicate=(reply as {duplicate:boolean}).duplicate
   setMessage(kind==='finish'?(duplicate?'Финальный снимок и общий итог сохранены. Подтверждена ранее отправленная команда; обновляем текущее состояние игры.':'Игра завершена. Финальный снимок и общий итог сохранены.'):
    duplicate?'Ранее отправленная команда подтверждена. Обновляем текущее состояние игры.':kind==='start'?'Игра начата. Открой раунд, чтобы принять ходы игроков.':control?.kind==='pause'&&control.command.paused?'Игра на паузе. Позиции и черновики сохранены.':'Игра продолжена.');refresh()
  }catch(e){
   if(!mounted.current||abort.signal.aborted||latest.current.request!==request)return
   if(e instanceof NetworkError&&[400,409,413].includes(e.status))remember({...draft,command:undefined,control:undefined,confirmed:false})
   setMessage((e as Error).message);refresh()
  }finally{if(mounted.current&&pending.current===abort){pending.current=null;setBusySource(null)}}
 }
 return <section className="gb-game-session" aria-label="Совместная игра">
  <header><div><small>Совместная игра</small><h4>{value?gameSessionLabels[value.phase]:'Проверяем состояние игры…'}</h4></div>{value&&<span className="gb-session-time">Время мира: {value.seconds.toLocaleString('ru-RU')} с</span>}</header>
  {(remote.error||invalid)&&<p role="alert">{remote.error||'Сервер вернул несовместимое состояние игры. Обнови состояние или проверь, что сайт и API одной версии.'}</p>}
  {value&&<>
   {value.round&&value.status!=='closed'&&<p role="status">Ходов игроков: {value.round.received} / {value.round.total}. {value.phase==='planning'?'Каждый отправляет свой план.':value.phase==='applied'?'Результат уже сохранён. Можно начать следующий раунд или завершить игру.':value.phase==='paused'?'Ходы и исполнение продолжатся после паузы.':'Действия изменят мир после применения мастером.'}</p>}
   {value.status==='closed'?<div className="gb-session-result" aria-label="Итог совместной игры">
    {value.result?<><h4>{value.result.title}</h4><p className="w6-prose">{value.result.summary}</p><small>Сохранено: {new Date(value.result.finishedAt).toLocaleString('ru-RU')}</small></>:<p>Лобби закрыто. Сохранённые сцены и журнал доступны для чтения.</p>}
    <p>Герои и их знания сохранены в кампании. Новые ходы закрыты.</p>
    {chief&&<button className="w6-button" onClick={onCopies}>Копии и финальный снимок</button>}
   </div>:<>
    {chief&&value.status==='open'&&<>{!disabled&&!remote.loading&&!!lobby.inviteCode&&<PartyInvitation key={lobby.inviteCode} code={lobby.inviteCode}/>}<SessionStartGuide ready={value.ready} disabled={unavailable||hasCommand} paused={value.paused} onMembers={onMembers} onHeroes={onHeroes} onScene={onSetup} onReadiness={()=>{if(preparation.current){preparation.current.scrollIntoView?.({block:'nearest'});preparation.current.focus({preventScroll:true})}else onSetup()}}/><p>Перед началом пригласи участников: набор закроется после старта.</p><button className="w6-button w6-primary" disabled={unavailable||hasCommand||!value.canStart} onClick={()=>void send('start')}>Начать совместную игру</button></>}
    {chief&&<div className="w6-buttons gb-session-actions"><button className="w6-button" onClick={onRound}>{value.phase==='applied'?'Следующий раунд':'Открыть раунд'}</button><button className="w6-button" aria-expanded={ending} onClick={()=>setEnding(!ending)}>{ending?'Скрыть завершение':'Завершить игру'}</button></div>}
    {!chief&&<p className="gb-game-help">{value.paused?'Мастер поставил игру на паузу. Твой план сохранён.':value.phase==='planning'?'Составь ход на карте и нажми «Отправить заявление».':value.phase==='applied'?'Проверь результат на сцене и в журнале. Следующий раунд откроет мастер.':'Выбери принятого героя ниже. Мастер открывает сцену и приём ходов.'}</p>}
    {chief&&<details className="gb-session-pause"><summary>Перерыв и продолжение</summary><label className="w6-field"><span>Причина {value.paused?'продолжения':'паузы'}</span><input aria-label="Причина перерыва или продолжения" maxLength={1000} value={reason} disabled={unavailable||hasCommand} onChange={e=>remember({...draft,pauseReason:e.currentTarget.value})}/></label><button className="w6-button" disabled={unavailable||hasCommand||!reason.trim()} onClick={()=>void send('pause')}>{value.paused?'Продолжить игру':'Пауза в игре'}</button></details>}
    {chief&&ending&&<form className="gb-session-ending" aria-label="Завершение совместной игры" onSubmit={e=>{e.preventDefault();void send('finish')}}>
     <h4>Итог, который увидят все участники</h4>
     <fieldset disabled={unavailable||hasCommand}>
      <label className="w6-field"><span>Название итога</span><input aria-label="Название итога игры" maxLength={80} required value={draft.title} onChange={e=>edit({title:e.currentTarget.value})}/></label>
      <label className="w6-field"><span>Чем закончилась игра</span><textarea aria-label="Общий итог игры" maxLength={4000} required rows={4} value={draft.summary} onChange={e=>edit({summary:e.currentTarget.value})}/></label>
      {!!value.pendingWork&&<label><input aria-label="Сохранить незавершённые действия" type="checkbox" checked={draft.keepPending} onChange={e=>edit({keepPending:e.currentTarget.checked})}/> Сохранить незавершённые действия и заряды ({value.pendingWork}) в финальном снимке</label>}
      <p>Будет сохранена контрольная точка; общий итог появится у участников и в чате. Лобби закроется. Игровое время и ресурсы не изменятся.</p>
      {stale&&<><p role="alert">Кампания изменилась. Проверь итог и состояние раунда.</p><button type="button" className="w6-button" onClick={()=>remember({...draft,revision:value.revision,confirmed:false})}>Итог проверен с текущей версией</button></>}
      <label><input aria-label="Подтвердить общий итог и завершение" type="checkbox" checked={draft.confirmed} onChange={e=>remember({...draft,confirmed:e.currentTarget.checked,revision:draft.revision??value.revision})}/> Общий итог проверен. Сохранить снимок и завершить игру.</label>
     </fieldset>
     {!!value.finishBlockers?.length&&<div role="alert">{value.finishBlockers.map(b=><p key={b}>{b}</p>)}<button type="button" className="w6-button" onClick={onRound}>Разрешить текущий раунд</button></div>}
     {!draft.command&&<button className="w6-button w6-primary" disabled={unavailable||hasCommand||stale||!draft.confirmed||!draft.title.trim()||!draft.summary.trim()||!!value.finishBlockers?.length||!!value.pendingWork&&!draft.keepPending}>Сохранить итог и завершить</button>}
    </form>}
   </>}
  </>}
  {chief&&hasCommand&&<div className="gb-session-pending" role="status"><p>Ожидается подтверждение {draft.command?'завершения игры':draft.control?.kind==='start'?'начала игры':draft.control?.command.paused?'паузы':'продолжения'}. Повтор отправит сохранённую команду с прежним ключом и версией кампании.</p><button type="button" className="w6-button w6-primary" disabled={unavailable} onClick={()=>void send(draft.command?'finish':draft.control!.kind)}>{draft.command?'Повторить сохранение итога':draft.control?.kind==='start'?'Повторить начало игры':draft.control?.command.paused?'Подтвердить прежнюю паузу':'Подтвердить прежнее продолжение'}</button></div>}
  {value&&'session' in value&&<div ref={preparation} tabIndex={-1} role="region" className="realm-party-preparation" aria-label="Подготовка участников"><LobbySessionPreparation accountId={accountId} lobbyId={lobby.id} disabled={unavailable||hasCommand} onHeroes={onHeroes} onScene={onSetup} showEnding={!value.result}/></div>}
  <p role="status">{message}</p>{warning&&<p role="alert">{warning}</p>}
  {(remote.error||invalid)&&<button className="w6-button" disabled={busy} onClick={refresh}>Обновить состояние игры</button>}
 </section>
}
