import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {useRemote} from './onlineHooks'
import {useOnline} from './onlineContext'
import RoundFeedbackDetails from './RoundFeedbackDetails'
import RoundPlaybackControls from './RoundPlaybackControls'
import TableRoundPlaybackControls from './TableRoundPlaybackControls'
import useRoundPlayback from './useRoundPlayback'
import PerceivedScene from './PerceivedScene'
import {isRoundPresentation} from './roundPresentation'
import {isTableRoundPlayback,isTablePlaybackAck} from './tableRoundPlayback'
import {sceneEditorId} from './sceneEditorId'
import type {RoundPresentation,roundPresentationFrame} from './roundPresentation'
import type {PublicRoundFeedback,RoundFeedbackView} from './roundFeedback'
import type {TableClockSample,TablePlaybackCommand} from './tableRoundPlayback'
import './roundResults.css'

export type RoundReviewFrame=ReturnType<typeof roundPresentationFrame>
const clock=(seconds:number)=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0')
const matches=(value:unknown,report:PublicRoundFeedback,generation?:number):value is RoundPresentation=>isRoundPresentation(value,report.id)&&value.revision===report.revision&&value.appliedAt===report.appliedAt&&value.fromSeconds===report.fromSeconds&&value.toSeconds===report.toSeconds&&(generation===undefined||value.generation===generation)
function Result({report,onPlay,onTable,disabled}:{report:PublicRoundFeedback;onPlay:()=>void;onTable?:()=>void;disabled:boolean}){
 return <article className="gb-round-result"><header><strong>Время мира {clock(report.fromSeconds)} → {clock(report.toSeconds)}</strong><time dateTime={report.appliedAt}>{new Date(report.appliedAt).toLocaleString('ru-RU')}</time></header><RoundFeedbackDetails report={report}/><div className="w6-buttons"><button type="button" className="w6-button" disabled={disabled} onClick={onPlay}>Посмотреть исполнение раунда {clock(report.fromSeconds)}–{clock(report.toSeconds)}</button>{onTable&&<button type="button" className="w6-button" disabled={disabled} onClick={onTable}>Показать группе {clock(report.fromSeconds)}–{clock(report.toSeconds)}</button>}</div></article>
}
type Props={lobbyId:string;characterId:string;checkingAccess:boolean;active?:boolean;sharedEnabled?:boolean;onReviewFrame?:(frame:RoundReviewFrame|null)=>void}
export default function LobbyRoundResults({lobbyId,characterId,checkingAccess,active=true,sharedEnabled=false,onReviewFrame}:Props){
 const {request,refresh}=useOnline(),[limit,setLimit]=useState(5),path='/lobbies/'+lobbyId+'/characters/'+characterId+'/round-results'
 const remote=useRemote<RoundFeedbackView>(checkingAccess||!active?null:path+(limit===5?'':'?limit='+limit)),value=checkingAccess?null:remote.value,head=value?.reports[0]?.id??''
 const scope=useMemo(()=>({request,lobbyId,characterId}),[request,lobbyId,characterId])
 const rawTable=value?.tablePlayback,table=useMemo(()=>sharedEnabled&&isTableRoundPlayback(rawTable)?rawTable:null,[sharedEnabled,rawTable])
 const sample=useMemo<TableClockSample|null>(()=>table?{view:table,receivedAt:remote.receivedAt,latencyMs:remote.latencyMs}:null,[table,remote.receivedAt,remote.latencyMs])
 const sessionId=table?.session?.id??'',sharedReport=table?.report,reportKey=sharedReport?JSON.stringify(sharedReport):''
 const [autoFollow,setAutoFollow]=useState(()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
 useEffect(()=>{const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(!media)return;const change=()=>setAutoFollow(!media.matches);media.addEventListener?.('change',change);return()=>media.removeEventListener?.('change',change)},[])
 const [participation,setParticipation]=useState<{id:string;following:boolean}|null>(null),[retry,setRetry]=useState(0)
 const following=!!sessionId&&!!sharedReport&&(participation?.id===sessionId?participation.following:autoFollow)
 const [stored,setStored]=useState<{scope:typeof scope;head:string;recording:RoundPresentation}|null>(null),[loading,setLoading]=useState<typeof scope|null>(null),[failure,setFailure]=useState<{scope:typeof scope;text:string}|null>(null)
 const [sharedStored,setSharedStored]=useState<{scope:typeof scope;id:string;recording:RoundPresentation}|null>(null),[sharedFailure,setSharedFailure]=useState<{scope:typeof scope;id:string;text:string}|null>(null)
 const [tableBusy,setTableBusy]=useState<typeof scope|null>(null),[notice,setNotice]=useState<{scope:typeof scope;text:string}|null>(null)
 const pending=useRef<AbortController|null>(null),pendingTable=useRef<AbortController|null>(null),mounted=useRef(false),latest=useRef({scope,head,generation:value?.generation,checkingAccess,active,loading:remote.loading,table})
 useLayoutEffect(()=>{latest.current={scope,head,generation:value?.generation,checkingAccess,active,loading:remote.loading,table}})
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort();pendingTable.current?.abort()}},[])
 useEffect(()=>()=>{pending.current?.abort();pending.current=null;pendingTable.current?.abort();pendingTable.current=null},[scope])
 const localRecording=stored?.scope===scope&&stored.head===head&&(value?.generation===undefined||value.generation===stored.recording.generation)&&value?.reports.some(r=>r.id===stored.recording.id)?stored.recording:null
 const sharedRecording=sharedStored?.scope===scope&&sharedStored.id===sessionId&&sharedStored.recording.generation===table?.generation&&sharedStored.recording.id===sharedReport?.id?sharedStored.recording:null
 const recording=following?sharedRecording:localRecording,playback=useRoundPlayback(recording,active&&!checkingAccess&&!remote.loading,following?sample:null)
 useEffect(()=>{onReviewFrame?.(active&&!checkingAccess?playback.frame:null);return()=>onReviewFrame?.(null)},[onReviewFrame,playback.frame,active,checkingAccess])
 useEffect(()=>{
  if(!following||!reportKey||!active||checkingAccess)return
  const expected=JSON.parse(reportKey) as PublicRoundFeedback,abort=new AbortController(),generation=table?.generation
  void request<unknown>(path+'/'+encodeURIComponent(expected.id)+'/playback',{signal:abort.signal}).then(result=>{
   if(abort.signal.aborted)return
   if(!matches(result,expected,generation))throw Error('Сервер не подтвердил личную запись общего просмотра.')
   setSharedStored({scope,id:sessionId,recording:result});setStored(null);setSharedFailure(null)
  }).catch((error:Error)=>{if(!abort.signal.aborted)setSharedFailure({scope,id:sessionId,text:error.message})})
  return()=>abort.abort()
 },[following,reportKey,sessionId,table?.generation,scope,path,request,active,checkingAccess,retry])
 const busy=loading===scope,controlling=tableBusy===scope
 async function open(report:PublicRoundFeedback){
  const l=latest.current
  if(!mounted.current||pending.current||l.scope!==scope||l.head!==head||l.checkingAccess||l.loading||!l.active)return
  if(sessionId)setParticipation({id:sessionId,following:false})
  const abort=new AbortController();pending.current=abort;setLoading(scope);setFailure(null)
  try{
   const result=await request<unknown>(path+'/'+encodeURIComponent(report.id)+'/playback',{signal:abort.signal})
   const current=latest.current
   if(!mounted.current||abort.signal.aborted||pending.current!==abort||current.scope!==scope)return
   if(current.head!==head||current.generation!==l.generation||current.checkingAccess||!current.active)throw Error('Состояние игры изменилось. Открой результат заново.')
   if(!matches(result,report,l.generation))throw Error('Сервер не подтвердил запись выбранного раунда. Текстовый итог остаётся доступным.')
   setStored({scope,head,recording:result})
  }catch(error){if(mounted.current&&!abort.signal.aborted&&latest.current.scope===scope)setFailure({scope,text:(error as Error).message})}
  finally{if(pending.current===abort){pending.current=null;if(mounted.current)setLoading(null)}}
 }
 async function control(operation:TablePlaybackCommand['operation'],fields:Partial<TablePlaybackCommand>={}){
  const l=latest.current,t=l.table
  if(!mounted.current||pendingTable.current||!t?.canControl||l.scope!==scope||l.checkingAccess||l.loading||!l.active)return
  const command:TablePlaybackCommand={...fields,operation,generation:t.generation,version:t.version,commandKey:'table:'+sceneEditorId()},abort=new AbortController()
  pendingTable.current=abort;setTableBusy(scope);setNotice(null)
  try{
   const result=await request<unknown>('/lobbies/'+lobbyId+'/round-playback',{method:'POST',body:JSON.stringify(command),signal:abort.signal})
   if(!mounted.current||abort.signal.aborted||latest.current.scope!==scope)return
   if(!isTablePlaybackAck(result,command))throw Error('Ответ не подтвердил команду. Обновляем состояние общего просмотра.')
   setNotice({scope,text:operation==='stop'?'Общий просмотр завершён.':'Общий просмотр обновлён.'})
  }catch(error){if(mounted.current&&!abort.signal.aborted&&latest.current.scope===scope)setNotice({scope,text:(error as Error).message})}
  finally{if(pendingTable.current===abort){pendingTable.current=null;if(mounted.current){setTableBusy(null);if(latest.current.scope===scope)refresh()}}}
 }
 function close(){setStored(null);if(sessionId)setParticipation({id:sessionId,following:false})}
 function join(){setParticipation({id:sessionId,following:true});setSharedFailure(null);setRetry(n=>n+1)}
 const latestReport=value?.reports[0],sharedError=sharedFailure?.scope===scope&&sharedFailure.id===sessionId?sharedFailure.text:''
 const result=(report:PublicRoundFeedback)=><Result key={report.id} report={report} onPlay={()=>void open(report)} onTable={table?.canControl?()=>void control('start',{characterId,reportId:report.id}):undefined} disabled={busy||controlling||remote.loading||checkingAccess}/>
 return <section className="gb-round-results" aria-label="Итоги раундов героя">
  <h4>Итог моего раунда</h4>
  {(remote.loading||busy)&&<p role="status">{busy?'Загружаем исполнение раунда…':'Обновляем сохранённые итоги…'}</p>}
  {remote.error&&<p role="alert">{remote.error}</p>}{failure?.scope===scope&&<p role="alert">{failure.text}</p>}{notice?.scope===scope&&<p role="status">{notice.text}</p>}
  {sharedEnabled&&value?.tablePlayback!==undefined&&!table&&<p role="alert">Не удалось проверить состояние общего просмотра. Индивидуальные итоги доступны.</p>}
  {table?.session&&(!following||!sharedRecording||!!sharedError)&&<div className="gb-table-follow"><p>Мастер показывает сохранённый раунд группе.</p>{!sharedReport?<p>У этого героя нет личной записи выбранного раунда. Общий просмотр не раскрывает чужие сведения.</p>:!following?<button type="button" className="w6-button" onClick={join}>Смотреть вместе с группой</button>:<>{!sharedRecording&&!sharedError&&<p role="status">Загружаем твою запись общего просмотра…</p>}<button type="button" className="w6-button" onClick={close}>Выйти из общего просмотра</button></>}{sharedError&&<><p role="alert">{sharedError}</p><button type="button" className="w6-button" onClick={join}>Повторить загрузку общего просмотра</button></>}</div>}
  {sample&&table?.session&&table.canControl&&<TableRoundPlaybackControls sample={sample} active={active&&!checkingAccess} busy={controlling||remote.loading||checkingAccess} onChange={(positionMs,speed,playing)=>void control('change',{positionMs,speed,playing})} onStop={()=>void control('stop')}/>}
  {recording&&<RoundPlaybackControls recording={recording} playback={playback} shared={following} onClose={close}/>}
  {recording&&!onReviewFrame&&playback.frame?.map&&<PerceivedScene map={playback.frame.map} effectTimeMs={playback.frame.elapsedMs}/>}
  {latestReport?<>{result(latestReport)}<p className="gb-game-help">Текущее состояние показано в ресурсах героя. Подробности воздействий мастер раскрывает в журнале и диалогах.</p>{value!.reports.length>1&&<details><summary>Предыдущие результаты ({value!.reports.length-1})</summary>{value!.reports.slice(1).map(result)}</details>}</>:value&&<p className="w6-copy">Здесь появятся результаты применённых раундов текущего продолжения игры.</p>}
  {value?.hasMore&&limit<20&&<button type="button" className="w6-button" disabled={remote.loading} onClick={()=>setLimit(n=>Math.min(20,n+5))}>Показать больше результатов</button>}
 </section>
}
