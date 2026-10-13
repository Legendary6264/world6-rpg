import {useState} from 'react'
import {readTutorialProgress,writeTutorialProgress} from './tutorialProgress'
import type {TutorialPath} from './tutorialProgress'
import {visualArtwork} from './visualMedia'
import './tutorialStyle.css'
export default function TutorialWelcome({scope,onChoose}:{scope:string;onChoose:(path:TutorialPath)=>void}){
 const [progress,setProgress]=useState(()=>readTutorialProgress(scope).progress)
 if(progress.introSeen)return null
 function choose(path:TutorialPath|null){const next={...progress,introSeen:true,preferred:path};writeTutorialProgress(scope,next);setProgress(next);if(path)onChoose(path)}
 return <section className="panel gb-welcome" aria-labelledby="tutorial-welcome-title">
  <img src={visualArtwork['pixel-guide']} width={112} height={112} alt="Пиксельный портрет проводника"/>
  <div><p className="w6-eyebrow">Первый шаг</p><h2 id="tutorial-welcome-title">У порога новой истории</h2>
   <p>Попробуй действия героя или стол мастера в отдельной учебной копии «Ночного перехода». Можно пропустить и вернуться через меню «Обучение».</p>
   <p className="w6-copy">Выбор меняет подсказки. Роль аккаунта, права лобби и реальные герои остаются прежними.</p>
   <div className="w6-buttons"><button className="w6-button w6-primary" onClick={()=>choose('player')}>Я игрок</button><button className="w6-button" onClick={()=>choose('master')}>Я мастер</button><button className="w6-button" onClick={()=>choose(null)}>Пропустить вступление</button></div>
  </div>
 </section>
}
