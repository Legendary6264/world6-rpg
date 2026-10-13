import {useState} from 'react'
import {readTutorialProgress,writeTutorialProgress,markTutorialStep} from './tutorialProgress'
import type {TutorialPath,TutorialProgress} from './tutorialProgress'
import {tutorialSteps,tutorialPathLabels} from './tutorialContent'
import TutorialSandbox from './TutorialSandbox'
import './tutorialStyle.css'
export type TutorialDestination='home'|'character'|'lobbies'|'guide'
export default function TutorialPage({scope,initialPath,onNavigate}:{scope:string;initialPath?:TutorialPath;onNavigate:(page:TutorialDestination)=>void}){
 const [stored]=useState(()=>readTutorialProgress(scope)),[progress,setProgress]=useState(stored.progress),[path,setPath]=useState<TutorialPath>(initialPath??stored.progress.preferred??'player')
 const [step,setStep]=useState(0),[version,setVersion]=useState(0),[memoryOnly,setMemoryOnly]=useState(stored.memoryOnly)
 const selected=tutorialSteps[path][step],marks=path==='player'?progress.playerSteps:progress.masterSteps,done=path==='player'?progress.playerDone:progress.masterDone
 function remember(next:TutorialProgress){setProgress(next);setMemoryOnly(!writeTutorialProgress(scope,next))}
 function choose(value:TutorialPath){remember({...progress,introSeen:true,preferred:value});setPath(value);setStep(0);setVersion(n=>n+1)}
 function finish(){remember({...progress,introSeen:true,preferred:path,[path==='player'?'playerDone':'masterDone']:true})}
 return <section className="panel gb-tutorial" aria-labelledby="tutorial-title">
  <header className="w6-section-heading"><div><p className="w6-eyebrow">Учебный режим</p><h1 id="tutorial-title">Первые шаги в «Гранях Бытия»</h1><p>Пять подсказок и живая учебная копия. Можно выбрать любой шаг, пропустить или повторить.</p></div><button className="w6-button" onClick={()=>onNavigate('home')}>Выйти из обучения</button></header>
  <div className="w6-buttons">{(['player','master'] as const).map(p=><button key={p} className={'w6-button'+(path===p?' w6-active':'')} aria-pressed={path===p} onClick={()=>choose(p)}>{tutorialPathLabels[p]}</button>)}</div>
  <p className="w6-copy">Выбор мастера не даёт полномочий. Ни герои, ни лобби не создаются автоматически. Отметки — для тебя, без проверки навыков и блокировки игры.</p>
  {memoryOnly&&<p role="status">Отметки доступны только в памяти этого сеанса: сохранение в браузере недоступно.</p>}
  <nav className="gb-tutorial-steps" aria-label="Учебные шаги">{tutorialSteps[path].map((s,i)=><button className={'w6-button'+(step===i?' w6-active':'')} key={s.title} aria-current={step===i?'step':undefined} onClick={()=>setStep(i)}>{marks.includes(i)?'✓ ':''}Шаг {i+1}: {s.title}</button>)}</nav>
  <article className="gb-tutorial-lesson"><p className="w6-eyebrow">{tutorialPathLabels[path]} · {step+1} / 5</p><h2>{selected.title}</h2><p>{selected.text}</p><p><strong>Попробуй:</strong> {selected.task}</p>
   <div className="w6-buttons"><button className="w6-button" onClick={()=>remember(markTutorialStep(progress,path,step))}>{marks.includes(step)?'Шаг уже отмечен':'Отметить прочитанное'}</button>{step>0&&<button className="w6-button" onClick={()=>setStep(step-1)}>Предыдущий шаг</button>}{step<4&&<button className="w6-button" onClick={()=>setStep(step+1)}>Следующий шаг</button>}<button className="w6-button" onClick={finish}>Завершить маршрут</button></div>
   {done&&<p role="status">Маршрут отмечен завершённым. Его можно повторить; доступ к игре не меняется.</p>}
  </article>
  <TutorialSandbox key={JSON.stringify([scope,path,version])} path={path}/>
  <div className="w6-buttons gb-tutorial-return"><button className="w6-button" onClick={()=>{setStep(0);setVersion(n=>n+1)}}>Повторить маршрут</button><button className="w6-button" onClick={()=>onNavigate('character')}>Открыть обычные персонажи</button><button className="w6-button" onClick={()=>onNavigate('lobbies')}>Открыть обычные лобби</button><button className="w6-button" onClick={()=>onNavigate('guide')}>Открыть обычный путеводитель</button></div>
 </section>
}
