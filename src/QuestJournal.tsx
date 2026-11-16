import {useState} from 'react'
import {useRemote} from './onlineHooks'
import {isQuestPlayerView,questStatusLabels} from './questLog'
import './quests.css'

export default function QuestJournal({lobbyId,characterId,checkingAccess,active=true,onDialogue}:{lobbyId:string;characterId:string;checkingAccess:boolean;active?:boolean;onDialogue?:()=>void}){
 const remote=useRemote<unknown>(checkingAccess||!active?null:'/lobbies/'+lobbyId+'/characters/'+characterId+'/quests')
 const value=!checkingAccess&&isQuestPlayerView(remote.value)?remote.value:null,[history,setHistory]=useState(false)
 const quests=value?.quests.filter(q=>history?q.status!=='active':q.status==='active').toSorted((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))??[]
 return <section className="gb-quests" aria-label="Задания героя"><h4>Задания героя</h4>
  <p className="w6-copy">Здесь собраны выданные тебе задания. Прогресс отмечает мастер по результатам игры.</p>
  {remote.loading&&<p role="status">Обновляем задания…</p>}{remote.error&&<p role="alert">{remote.error}</p>}
  {remote.value!==null&&!value&&!checkingAccess&&<p role="alert">Не удалось проверить журнал заданий. Обнови сведения.</p>}
  {value&&<><div className="w6-buttons"><button type="button" className="w6-button" aria-pressed={!history} onClick={()=>setHistory(false)}>В работе ({value.quests.filter(q=>q.status==='active').length})</button><button type="button" className="w6-button" aria-pressed={history} onClick={()=>setHistory(true)}>История заданий ({value.quests.filter(q=>q.status!=='active').length})</button></div>
   {quests.map(q=><article className="gb-quest-card" key={q.id} data-status={q.status}><header><h4>{q.title}</h4><strong>{questStatusLabels[q.status]}</strong></header><p className="w6-prose">{q.description}</p>
    {!!q.objectives.length&&<><p>Выполнено {q.objectives.filter(o=>o.done).length} из {q.objectives.length}</p><ul className="gb-quest-checklist">{q.objectives.map(o=><li key={o.id} data-done={o.done}><span aria-label={o.done?'Выполнено':'Ещё не выполнено'}>{o.done?'✓':'○'}</span> {o.title}</li>)}</ul></>}
    {q.source&&<blockquote><strong>{q.source.speaker}</strong><p className="w6-prose">{q.source.body}</p>{onDialogue&&<button type="button" className="w6-button" onClick={onDialogue}>Открыть разговоры</button>}</blockquote>}
   </article>)}{!quests.length&&<p className="w6-copy">{history?'Завершённых заданий пока нет.':'Сейчас у героя нет выданных заданий. Новые появятся после решения мастера.'}</p>}
  </>}
 </section>
}
