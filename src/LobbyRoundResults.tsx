import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {useRemote} from './onlineHooks'
import {useOnline} from './onlineContext'
import RoundFeedbackDetails from './RoundFeedbackDetails'
import RoundPlaybackControls from './RoundPlaybackControls'
import useRoundPlayback from './useRoundPlayback'
import PerceivedScene from './PerceivedScene'
import {isRoundPresentation} from './roundPresentation'
import type {RoundPresentation,roundPresentationFrame} from './roundPresentation'
import type {PublicRoundFeedback,RoundFeedbackView} from './roundFeedback'
import './roundResults.css'

export type RoundReviewFrame=ReturnType<typeof roundPresentationFrame>
const clock=(seconds:number)=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0')
function Result({report,onPlay,disabled}:{report:PublicRoundFeedback;onPlay:()=>void;disabled:boolean}){
 return <article className="gb-round-result"><header><strong>Время мира {clock(report.fromSeconds)} → {clock(report.toSeconds)}</strong><time dateTime={report.appliedAt}>{new Date(report.appliedAt).toLocaleString('ru-RU')}</time></header><RoundFeedbackDetails report={report}/><button type="button" className="w6-button" disabled={disabled} onClick={onPlay}>Посмотреть исполнение раунда {clock(report.fromSeconds)}–{clock(report.toSeconds)}</button></article>
}
export default function LobbyRoundResults({lobbyId,characterId,checkingAccess,active=true,onReviewFrame}:{lobbyId:string;characterId:string;checkingAccess:boolean;active?:boolean;onReviewFrame?:(frame:RoundReviewFrame|null)=>void}){
 const {request}=useOnline(),[limit,setLimit]=useState(5),path='/lobbies/'+lobbyId+'/characters/'+characterId+'/round-results'
 const remote=useRemote<RoundFeedbackView>(checkingAccess||!active?null:path+(limit===5?'':'?limit='+limit)),value=checkingAccess?null:remote.value,head=value?.reports[0]?.id??''
 const scope=useMemo(()=>({request,lobbyId,characterId}),[request,lobbyId,characterId])
 const [stored,setStored]=useState<{scope:typeof scope;head:string;recording:RoundPresentation}|null>(null),[loading,setLoading]=useState<typeof scope|null>(null),[failure,setFailure]=useState<{scope:typeof scope;text:string}|null>(null)
 const pending=useRef<AbortController|null>(null),mounted=useRef(false),latest=useRef({scope,head,generation:value?.generation,checkingAccess,active,loading:remote.loading})
 useLayoutEffect(()=>{latest.current={scope,head,generation:value?.generation,checkingAccess,active,loading:remote.loading}})
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort()}},[])
 useEffect(()=>()=>{pending.current?.abort();pending.current=null},[scope])
 const recording=stored?.scope===scope&&stored.head===head&&(value?.generation===undefined||value.generation===stored.recording.generation)&&value?.reports.some(r=>r.id===stored.recording.id)?stored.recording:null
 const playback=useRoundPlayback(recording,active&&!checkingAccess&&!remote.loading)
 useEffect(()=>{onReviewFrame?.(active&&!checkingAccess?playback.frame:null);return()=>onReviewFrame?.(null)},[onReviewFrame,playback.frame,active,checkingAccess])
 const busy=loading===scope
 async function open(report:PublicRoundFeedback){
  const l=latest.current
  if(!mounted.current||pending.current||l.scope!==scope||l.head!==head||l.checkingAccess||l.loading||!l.active)return
  const abort=new AbortController();pending.current=abort;setLoading(scope);setFailure(null)
  try{
   const result=await request<unknown>(path+'/'+encodeURIComponent(report.id)+'/playback',{signal:abort.signal})
   const current=latest.current
   if(!mounted.current||abort.signal.aborted||pending.current!==abort||current.scope!==scope)return
   if(current.head!==head||current.generation!==l.generation||current.checkingAccess||!current.active)throw Error('Состояние игры изменилось. Открой результат заново.')
   if(!isRoundPresentation(result,report.id)||result.revision!==report.revision||result.appliedAt!==report.appliedAt||result.fromSeconds!==report.fromSeconds||result.toSeconds!==report.toSeconds||l.generation!==undefined&&result.generation!==l.generation)throw Error('Сервер не подтвердил запись выбранного раунда. Текстовый итог остаётся доступным.')
   setStored({scope,head,recording:result})
  }catch(error){if(mounted.current&&!abort.signal.aborted&&latest.current.scope===scope)setFailure({scope,text:(error as Error).message})}
  finally{if(pending.current===abort){pending.current=null;if(mounted.current)setLoading(null)}}
 }
 const latestReport=value?.reports[0]
 return <section className="gb-round-results" aria-label="Итоги раундов героя">
  <h4>Итог моего раунда</h4>
  {(remote.loading||busy)&&<p role="status">{busy?'Загружаем исполнение раунда…':'Обновляем сохранённые итоги…'}</p>}
  {remote.error&&<p role="alert">{remote.error}</p>}{failure?.scope===scope&&<p role="alert">{failure.text}</p>}
  {recording&&<RoundPlaybackControls recording={recording} playback={playback} onClose={()=>setStored(null)}/>}
  {recording&&!onReviewFrame&&playback.frame?.map&&<PerceivedScene map={playback.frame.map} effectTimeMs={playback.frame.elapsedMs}/>}
  {latestReport?<><Result report={latestReport} onPlay={()=>void open(latestReport)} disabled={busy||remote.loading||checkingAccess}/><p className="gb-game-help">Текущее состояние показано в ресурсах героя. Подробности воздействий мастер раскрывает в журнале и диалогах.</p>
   {value!.reports.length>1&&<details><summary>Предыдущие результаты ({value!.reports.length-1})</summary>{value!.reports.slice(1).map(report=><Result key={report.id} report={report} onPlay={()=>void open(report)} disabled={busy||remote.loading||checkingAccess}/>)}</details>}
  </>:value&&<p className="w6-copy">Здесь появятся результаты применённых раундов текущего продолжения игры.</p>}
  {value?.hasMore&&limit<20&&<button type="button" className="w6-button" disabled={remote.loading} onClick={()=>setLimit(n=>Math.min(20,n+5))}>Показать больше результатов</button>}
 </section>
}
