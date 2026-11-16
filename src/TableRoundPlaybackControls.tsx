import {useState} from 'react'
import {useTablePlaybackClock} from './useRoundPlayback'
import type {TableClockSample} from './tableRoundPlayback'

export default function TableRoundPlaybackControls({sample,active,busy,onChange,onStop}:{sample:TableClockSample;active:boolean;busy:boolean;onChange:(positionMs:number,speed:number,playing:boolean)=>void;onStop:()=>void}){
 const session=sample.view.session!,clock=useTablePlaybackClock(sample,active)
 const [scrub,setScrub]=useState<{version:number;position:number}|null>(null),position=scrub?.version===sample.view.version?scrub.position:clock.positionMs
 const commit=()=>{if(scrub?.version===sample.view.version){onChange(scrub.position,session.speed,false);setScrub(null)}}
 return <section className="gb-table-playback" aria-label="Пульт общего просмотра">
  <strong>Общий просмотр группы</strong><p className="w6-copy">Все участники следуют одному времени и видят только раскрытую им сцену.</p>
  <div className="w6-buttons"><button type="button" className="w6-button w6-primary" disabled={busy} onClick={()=>onChange(clock.positionMs>=session.durationMs?0:clock.positionMs,session.speed,!clock.playing)}>{clock.playing?'Пауза для группы':'Продолжить для группы'}</button><button type="button" className="w6-button" disabled={busy} onClick={()=>onChange(session.durationMs,session.speed,false)}>Итог для группы</button><button type="button" className="w6-button" disabled={busy} onClick={onStop}>Завершить общий просмотр</button>
   <label>Скорость <select aria-label="Скорость общего просмотра" disabled={busy} value={session.speed} onChange={e=>onChange(clock.positionMs,Number(e.currentTarget.value),clock.playing)}>{[.5,1,2,4].map(v=><option key={v} value={v}>{v}×</option>)}</select></label></div>
  <label className="gb-round-scrub"><span>Время группы: {(position/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} / {(session.durationMs/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} с</span><input type="range" aria-label="Время общего просмотра" min={0} max={session.durationMs} step={10} value={position} disabled={busy} onChange={e=>setScrub({version:sample.view.version,position:Number(e.currentTarget.value)})} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/></label>
 </section>
}
