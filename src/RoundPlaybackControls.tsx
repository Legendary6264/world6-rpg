import {feedbackStatusLabels} from './roundFeedback'
import type {RoundPresentation} from './roundPresentation'
import type useRoundPlayback from './useRoundPlayback'
import {useEffect,useRef} from 'react'

const seconds=(ms:number)=>(ms/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})
export default function RoundPlaybackControls({recording,playback,onClose}:{recording:RoundPresentation;playback:ReturnType<typeof useRoundPlayback>;onClose:()=>void}){
 const frame=playback.frame,timeline=useRef<HTMLOListElement>(null)
 useEffect(()=>{
  const list=timeline.current
  if(!list)return
  const reveal=()=>{
   const selected=list.querySelector<HTMLElement>('[data-current="true"]')
   if(!selected||!list.clientWidth)return
   const bounds=list.getBoundingClientRect(),item=selected.getBoundingClientRect(),left=item.left-bounds.left+list.scrollLeft
   if(left<list.scrollLeft)list.scrollLeft=left
   else if(left+item.width>list.scrollLeft+list.clientWidth)list.scrollLeft=left+item.width-list.clientWidth
  }
  reveal()
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(reveal)
  observer?.observe(list)
  return()=>observer?.disconnect()
 },[frame?.event?.id])
 if(!frame)return null
 const index=recording.events.findIndex(e=>e.id===frame.event?.id)
 return <section className="gb-round-playback" aria-label="Просмотр исполненного раунда">
  <header><div><strong>Просмотр исполненного раунда</strong><p>Мировое время: {frame.worldSeconds.toLocaleString('ru-RU',{maximumFractionDigits:1})} с</p></div><button type="button" className="w6-button" onClick={onClose}>Вернуться к текущей сцене</button></header>
  <p className="w6-copy">Карта показывает сохранённый раунд. Лист героя отражает текущее состояние. Просмотр не меняет ход и ресурсы.</p>
  {recording.coverage==='events'&&<p className="w6-notice">В этой записи сохранились только события. Итоговая расстановка доступна в текущей сцене.</p>}
  <div className="w6-buttons"><button type="button" className="w6-button w6-primary" onClick={playback.toggle}>{playback.playing?'Пауза просмотра':frame.complete?'Повторить раунд':'Продолжить просмотр'}</button>
   <button type="button" className="w6-button" disabled={index<0} onClick={()=>playback.seek(recording.events[Math.max(0,index-1)]?.atMs??0)}>Предыдущее событие</button>
   <button type="button" className="w6-button" disabled={index>=recording.events.length-1} onClick={()=>playback.seek(recording.events[index+1]?.atMs??recording.durationMs)}>Следующее событие</button>
   <button type="button" className="w6-button" onClick={()=>playback.seek(recording.durationMs)}>Итог раунда</button>
   <label>Скорость <select aria-label="Скорость просмотра раунда" value={playback.speed} onChange={e=>playback.setSpeed(Number(e.currentTarget.value))}>{[.5,1,2,4].map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></label>
  </div>
  <label className="gb-round-scrub"><span>Время просмотра: {seconds(frame.elapsedMs)} / {seconds(recording.durationMs)} с</span><input aria-label="Время просмотра раунда" type="range" min={0} max={recording.durationMs} step={10} value={frame.elapsedMs} onChange={e=>playback.seek(Number(e.currentTarget.value))}/></label>
  <p role="status" className="gb-round-now">{frame.event?.label??'Начало раунда'}{frame.event?.status?' · '+feedbackStatusLabels[frame.event.status]:''}</p>
  <ol ref={timeline} className="gb-round-timeline" aria-label="События исполненного раунда">{recording.events.map(event=><li key={event.id} data-kind={event.kind} data-current={frame.event?.id===event.id}><button type="button" className="w6-button" aria-current={frame.event?.id===event.id?'step':undefined} onClick={()=>playback.seek(event.atMs)}><time>{seconds(event.atMs)} с</time><span>{event.label}</span>{event.status&&<small>{feedbackStatusLabels[event.status]}</small>}</button></li>)}</ol>
 </section>
}
