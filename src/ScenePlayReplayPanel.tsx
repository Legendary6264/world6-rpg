import type {DeclarationOptions} from './actionDeclarations'
import {gameActionLabel} from './gameControls'
import type {ReplaySession} from './usePlaytestReplay'
import type usePlaytestReplay from './usePlaytestReplay'
type Playback=ReturnType<typeof usePlaytestReplay>
export default function ScenePlayReplay({session,playback,options,onClose}:{session:ReplaySession;playback:Playback;options:DeclarationOptions;onClose:()=>void}){
 const frame=playback.frame;if(!frame)return null
 const step=session.steps[frame.stepIndex],seconds=(ms:number)=>(ms/1000).toFixed(2)
 return <section className="gb-playtest-replay" aria-label="Просмотр действий">
  <header><div><small>{session.kind==='plan'?'ПРЕДПРОСМОТР ПЛАНА':'ПОВТОР ПОДТВЕРЖДЕНИЯ'}</small><h3>{frame.complete?'Просмотр завершён':`Действие ${frame.stepIndex+1} из ${session.steps.length}`}</h3></div><button className="w6-button" type="button" onClick={onClose}>Вернуться к сцене</button></header>
  <p>{session.kind==='plan'?'Изменения ещё не подтверждены мастером.':'Сохранённый результат уже применён.'} Перемотка меняет только просмотр. Время на шкале — длительность визуализации.</p>
  <div className="gb-playtest-replay-buttons"><button className="w6-button" type="button" onClick={playback.toggle}>{playback.playing?'Пауза просмотра':'Продолжить просмотр'}</button><button className="w6-button" type="button" onClick={playback.restart}>Повторить просмотр</button><button className="w6-button" type="button" disabled={frame.stepIndex===0&&!frame.complete} onClick={()=>playback.step(frame.complete?frame.stepIndex:frame.stepIndex-1)}>Предыдущее действие</button><button className="w6-button" type="button" disabled={frame.complete||frame.stepIndex>=session.steps.length-1} onClick={()=>playback.step(frame.stepIndex+1)}>Следующее действие</button><button className="w6-button" type="button" disabled={frame.complete} onClick={()=>playback.seek(frame.durationMs)}>К результату</button><label>Скорость <select aria-label="Скорость просмотра" value={playback.speed} onChange={e=>playback.setSpeed(Number(e.currentTarget.value))}>{[.5,1,2,4].map(speed=><option value={speed} key={speed}>{speed}×</option>)}</select></label></div>
  <label className="gb-playtest-replay-scrub"><span>Время просмотра <output aria-live="off">{seconds(frame.elapsedMs)} / {seconds(frame.durationMs)} с</output></span><input aria-label="Время просмотра" type="range" min="0" max={frame.durationMs} step="10" value={frame.elapsedMs} onChange={e=>playback.seek(Number(e.currentTarget.value))}/></label>
  <div className="gb-playtest-replay-footer"><p className="gb-playtest-replay-current" role="status">{step?gameActionLabel(step.action,options):'Результат'}{frame.complete?' · итоговое состояние':''}</p>
  <nav aria-label="Действия просмотра">{session.steps.map((_,i)=><button className={'w6-button'+(!frame.complete&&i===frame.stepIndex?' w6-active':'')} type="button" aria-label={'Показать действие '+(i+1)} aria-current={!frame.complete&&i===frame.stepIndex?'step':undefined} key={i} onClick={()=>playback.step(i)}>{i+1}</button>)}</nav></div>
 </section>
}
