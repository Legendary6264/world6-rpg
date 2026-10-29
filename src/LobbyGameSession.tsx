import LobbySessionPreparation from './LobbySessionPreparation'
import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {useRemote} from './onlineHooks'
import {NetworkError} from './onlineClient'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import {sceneEditorId} from './sceneEditorId'
import {gameSessionLabels,isGameSessionView} from './gameSession'
import type {FinishGameCommand,GameSessionView} from './gameSession'
import type {Lobby} from './onlineTypes'

type Draft={title:string;summary:string;confirmed:boolean;keepPending:boolean;revision?:number;command?:FinishGameCommand}
const valid=(v:unknown):v is Draft=>{
 if(!v||typeof v!=='object')return false
 const d=v as Draft,c=d.command
 return typeof d.title==='string'&&d.title.length<=80&&typeof d.summary==='string'&&d.summary.length<=4000&&typeof d.confirmed==='boolean'&&typeof d.keepPending==='boolean'&&(d.revision===undefined||Number.isSafeInteger(d.revision))&&(!c||Number.isSafeInteger(c.revision)&&typeof c.title==='string'&&c.title.length<=80&&typeof c.summary==='string'&&c.summary.length<=4000&&typeof c.keepPending==='boolean'&&typeof c.commandKey==='string'&&/^[a-zA-Z0-9_-]{8,160}$/.test(c.commandKey))
}
type Props={accountId:string;lobby:Lobby;disabled:boolean;onHeroes:()=>void;onRound:()=>void;onSetup:()=>void;onMembers:()=>void;onCopies:()=>void}
export default function LobbyGameSession({accountId,lobby,disabled,onHeroes,onRound,onSetup,onMembers,onCopies}:Props){
 const {request,refresh}=useOnline(),path='/lobbies/'+lobby.id+'/play/session',remote=useRemote<GameSessionView>(path),value=isGameSessionView(remote.value)?remote.value:null,invalid=remote.value!==null&&!value,chief=lobby.myRole==='GM'
 const key=lobbyFormKey('game-finish',accountId,lobby.id),[draft,setDraft]=useState<Draft>(()=>readLobbyForm(key,valid)??{title:('Итог · '+lobby.title).slice(0,80),summary:'',confirmed:false,keepPending:false})
 const [busySource,setBusySource]=useState<{request:typeof request}|null>(null),[message,setMessage]=useState(''),[warning,setWarning]=useState(''),[reason,setReason]=useState(''),[ending,setEnding]=useState(false)
 const pending=useRef<AbortController|null>(null),mounted=useRef(true),latest=useRef({request,accountId,lobbyId:lobby.id,disabled,revision:value?.revision,loading:remote.loading,chief})
 useLayoutEffect(()=>{latest.current={request,accountId,lobbyId:lobby.id,disabled,revision:value?.revision,loading:remote.loading,chief}})
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort()}},[])
 useEffect(()=>()=>{pending.current?.abort();pending.current=null},[request,accountId,lobby.id])
 const busy=busySource?.request===request
 const unavailable=disabled||busy||remote.loading||!value,stale=draft.revision!==undefined&&draft.revision!==value?.revision
 const acknowledged=!!draft.command&&!!value?.result&&value.result.sourceRevision===draft.command.revision&&value.result.title===draft.command.title.trim()&&value.result.summary===draft.command.summary.trim()
 useEffect(()=>{if(!acknowledged)return;const next={...draft,command:undefined,confirmed:false,revision:undefined};writeLobbyForm(key,next);
  // oxlint-disable-next-line react/set-state-in-effect -- A fetched durable result acknowledges a command whose HTTP response was lost.
  setDraft(next)
 },[acknowledged,draft,key])
 function remember(next:Draft){setDraft(next);setWarning(writeLobbyForm(key,next)?'':'Черновик итога сохранён только в памяти. Не закрывай страницу.')}
 function edit(patch:Partial<Draft>){remember({...draft,...patch,confirmed:false,revision:draft.revision??value?.revision})}
 function current(){const l=latest.current;return mounted.current&&!pending.current&&!disabled&&!l.disabled&&chief&&l.chief&&l.request===request&&l.accountId===accountId&&l.lobbyId===lobby.id&&!remote.loading&&!l.loading&&value?.revision===l.revision}
 async function send(kind:'start'|'pause'|'finish'){
  if(!value||!current())return
  let command=draft.command
  if(kind==='finish'){
   if(!command){
    if(stale||!draft.confirmed||!draft.title.trim()||!draft.summary.trim()||value.finishBlockers?.length||(!!value.pendingWork&&!draft.keepPending))return
    command={revision:value.revision,title:draft.title,summary:draft.summary,keepPending:draft.keepPending,commandKey:sceneEditorId()};remember({...draft,command})
   }
  }else if(kind==='start'?!value.canStart:!reason.trim())return
  const abort=new AbortController();pending.current=abort;setBusySource({request});setMessage('')
  try{
   await request(kind==='pause'?'/lobbies/'+lobby.id+'/rounds/pause':path+'/'+kind,{method:'POST',signal:abort.signal,body:JSON.stringify(kind==='finish'?command:kind==='start'?{revision:value.revision}:{revision:value.revision,paused:!value.paused,reason,commandKey:sceneEditorId()})})
   if(!mounted.current||abort.signal.aborted||pending.current!==abort)return
   if(kind==='finish'){remember({...draft,confirmed:false,command:undefined,revision:undefined});setEnding(false)}
   if(kind==='start')remember({...draft,confirmed:false,command:undefined,revision:undefined})
   setMessage(kind==='finish'?'Игра завершена. Финальный снимок и общий итог сохранены.':kind==='start'?'Игра начата. Открой раунд, чтобы принять ходы игроков.':value.paused?'Игра продолжена.':'Игра на паузе. Позиции и черновики сохранены.');refresh()
  }catch(e){
   if(!mounted.current||abort.signal.aborted)return
   if(kind==='finish'&&e instanceof NetworkError&&[400,403,404,409,413].includes(e.status))remember({...draft,command:undefined,confirmed:false})
   setMessage((e as Error).message)
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
    {chief&&value.status==='open'&&<><ol className="gb-session-ready" aria-label="Готовность к совместной игре">{value.ready?.map(r=><li key={r.id} data-done={r.done}><span aria-label={r.done?'Готово':'Нужно подготовить'}>{r.done?'✓':'○'}</span><span>{r.label}</span>{!r.done&&<button type="button" className="w6-button" onClick={r.section==='heroes'?onHeroes:r.section==='game'?onSetup:onMembers}>Открыть</button>}</li>)}</ol><p>Перед началом пригласи участников: набор закроется после старта.</p><button className="w6-button w6-primary" disabled={unavailable||!value.canStart} onClick={()=>void send('start')}>Начать совместную игру</button></>}
    {chief&&<div className="w6-buttons gb-session-actions"><button className="w6-button" onClick={onRound}>{value.phase==='applied'?'Следующий раунд':'Открыть раунд'}</button><button className="w6-button" aria-expanded={ending} onClick={()=>setEnding(!ending)}>{ending?'Скрыть завершение':'Завершить игру'}</button></div>}
    {!chief&&<p className="gb-game-help">{value.paused?'Мастер поставил игру на паузу. Твой план сохранён.':value.phase==='planning'?'Составь ход на карте и нажми «Отправить заявление».':value.phase==='applied'?'Проверь результат на сцене и в журнале. Следующий раунд откроет мастер.':'Выбери принятого героя ниже. Мастер открывает сцену и приём ходов.'}</p>}
    {chief&&<details className="gb-session-pause"><summary>Перерыв и продолжение</summary><label className="w6-field"><span>Причина {value.paused?'продолжения':'паузы'}</span><input aria-label="Причина перерыва или продолжения" maxLength={1000} value={reason} onChange={e=>setReason(e.currentTarget.value)}/></label><button className="w6-button" disabled={unavailable||!reason.trim()} onClick={()=>void send('pause')}>{value.paused?'Продолжить игру':'Пауза в игре'}</button></details>}
    {chief&&ending&&<form className="gb-session-ending" aria-label="Завершение совместной игры" onSubmit={e=>{e.preventDefault();void send('finish')}}>
     <h4>Итог, который увидят все участники</h4>
     <fieldset disabled={unavailable||!!draft.command}>
      <label className="w6-field"><span>Название итога</span><input aria-label="Название итога игры" maxLength={80} required value={draft.title} onChange={e=>edit({title:e.currentTarget.value})}/></label>
      <label className="w6-field"><span>Чем закончилась игра</span><textarea aria-label="Общий итог игры" maxLength={4000} required rows={4} value={draft.summary} onChange={e=>edit({summary:e.currentTarget.value})}/></label>
      {!!value.pendingWork&&<label><input aria-label="Сохранить незавершённые действия" type="checkbox" checked={draft.keepPending} onChange={e=>edit({keepPending:e.currentTarget.checked})}/> Сохранить незавершённые действия и заряды ({value.pendingWork}) в финальном снимке</label>}
      <p>Будет сохранена контрольная точка; общий итог появится у участников и в чате. Лобби закроется. Игровое время и ресурсы не изменятся.</p>
      {stale&&<><p role="alert">Кампания изменилась. Проверь итог и состояние раунда.</p><button type="button" className="w6-button" onClick={()=>remember({...draft,revision:value.revision,confirmed:false})}>Итог проверен с текущей версией</button></>}
      <label><input aria-label="Подтвердить общий итог и завершение" type="checkbox" checked={draft.confirmed} onChange={e=>remember({...draft,confirmed:e.currentTarget.checked,revision:draft.revision??value.revision})}/> Общий итог проверен. Сохранить снимок и завершить игру.</label>
     </fieldset>
     {!!value.finishBlockers?.length&&<div role="alert">{value.finishBlockers.map(b=><p key={b}>{b}</p>)}<button type="button" className="w6-button" onClick={onRound}>Разрешить текущий раунд</button></div>}
     {draft.command&&<p role="status">Подтверждение не получено. Повтори ту же команду: второй итог или снимок не создастся.</p>}
     <button className="w6-button w6-primary" disabled={unavailable||!draft.command&&(stale||!draft.confirmed||!draft.title.trim()||!draft.summary.trim()||!!value.finishBlockers?.length||!!value.pendingWork&&!draft.keepPending)}>{draft.command?'Повторить сохранение итога':'Сохранить итог и завершить'}</button>
    </form>}
   </>}
  </>}
  {value&&'session' in value&&<LobbySessionPreparation accountId={accountId} lobbyId={lobby.id} disabled={unavailable} onHeroes={onHeroes} onScene={onSetup}/>}
  <p role="status">{message}</p>{warning&&<p role="alert">{warning}</p>}
  {(remote.error||invalid)&&<button className="w6-button" disabled={busy} onClick={refresh}>Обновить состояние игры</button>}
 </section>
}
