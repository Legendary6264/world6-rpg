import {useState} from 'react'
import {useRemote} from './onlineHooks'
import RoundFeedbackDetails from './RoundFeedbackDetails'
import type {PublicRoundFeedback,RoundFeedbackView} from './roundFeedback'
import './roundResults.css'

const clock=(seconds:number)=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0')
function Result({report}:{report:PublicRoundFeedback}){
  return <article className="gb-round-result">
    <header><strong>Время мира {clock(report.fromSeconds)} → {clock(report.toSeconds)}</strong><time dateTime={report.appliedAt}>{new Date(report.appliedAt).toLocaleString('ru-RU')}</time></header>
    <RoundFeedbackDetails report={report}/>
  </article>
}
export default function LobbyRoundResults({lobbyId,characterId,checkingAccess,active=true}:{lobbyId:string;characterId:string;checkingAccess:boolean;active?:boolean}){
  const [limit,setLimit]=useState(5),path='/lobbies/'+lobbyId+'/characters/'+characterId+'/round-results'
  const remote=useRemote<RoundFeedbackView>(checkingAccess||!active?null:path+(limit===5?'':'?limit='+limit))
  const value=checkingAccess?null:remote.value,latest=value?.reports[0]
  return <section className="gb-round-results" aria-label="Итоги раундов героя">
    <h4>Итог моего раунда</h4>
    {remote.loading&&<p role="status">Обновляем сохранённые итоги…</p>}
    {remote.error&&<p role="alert">{remote.error}</p>}
    {latest?<><Result report={latest}/><p className="gb-game-help">Текущее состояние показано в ресурсах героя. Подробности воздействий мастер раскрывает в журнале и диалогах.</p>
      {value!.reports.length>1&&<details><summary>Предыдущие результаты ({value!.reports.length-1})</summary>{value!.reports.slice(1).map(report=><Result key={report.id} report={report}/>)}</details>}
    </>:value&&<p className="w6-copy">Здесь появятся результаты применённых раундов текущего продолжения игры.</p>}
    {value?.hasMore&&limit<20&&<button type="button" className="w6-button" disabled={remote.loading} onClick={()=>setLimit(n=>Math.min(20,n+5))}>Показать больше результатов</button>}
  </section>
}
