import {useEffect,useState} from 'react'
import {characterAnimations,characterAnimationDuration,isCharacterAnimation} from './characterAppearance'
import type {CharacterAnimation} from './characterAppearance'
import './characterPreview.css'

export type CharacterPreviewFrame={frameId:string;target:string;animation:CharacterAnimation;seconds:number}
type Props={frameId:string;target:string;label:string;animation:CharacterAnimation;onFrame:(frame:CharacterPreviewFrame|null)=>void}

/** A local inspection clock. It never sends a scene or campaign command. */
export default function SceneCharacterPreview({frameId,target,label,animation:initial,onFrame}:Props){
  const [animation,setAnimation]=useState(initial),[seconds,setSeconds]=useState(0)
  const [playing,setPlaying]=useState(false),[active,setActive]=useState(false)
  const [expanded,setExpanded]=useState(true)
  const duration=characterAnimationDuration(animation)
  useEffect(()=>{
    onFrame(active?{frameId,target,animation,seconds}:null)
  },[active,frameId,target,animation,seconds,onFrame])
  useEffect(()=>()=>onFrame(null),[onFrame])
  useEffect(()=>{
    if(!playing||!duration)return
    let timer:ReturnType<typeof setTimeout>|undefined,last:number|undefined
    const tick=()=>{
      if(document.visibilityState!=='visible'){last=undefined;return}
      const now=performance.now()
      if(last!==undefined){const elapsed=Math.min(.25,Math.max(0,(now-last)/1000));setSeconds(value=>(value+elapsed)%duration)}
      last=now;timer=setTimeout(tick,50)
    }
    const sync=()=>{clearTimeout(timer);last=undefined;if(document.visibilityState==='visible')tick()}
    document.addEventListener('visibilitychange',sync);sync()
    return ()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',sync)}
  },[playing,duration])
  return <details className="gb-character-preview" open={expanded} onToggle={event=>{const open=event.currentTarget.open;setExpanded(open);if(!open)setPlaying(false)}}>
    <summary>Движение · {label}</summary>
    <div role="group" aria-label="Предпросмотр персонажа">
      <label><span>Анимация</span><select aria-label="Анимация предпросмотра" value={animation} onChange={event=>{
        const value=event.currentTarget.value;if(!isCharacterAnimation(value))return
        setAnimation(value);setSeconds(0);setPlaying(false);setActive(true)
      }}>{characterAnimations.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <div className="gb-character-playback">
        <button type="button" disabled={!duration} aria-label={playing?'Приостановить анимацию персонажа':'Воспроизвести анимацию персонажа'} onClick={()=>{setActive(true);setPlaying(value=>!value)}}>{playing?'Пауза':'Пуск'}</button>
        <button type="button" disabled={!active} aria-label="Сбросить предпросмотр персонажа" onClick={()=>{setPlaying(false);setSeconds(0);setActive(false)}}>Сброс</button>
        <output aria-label="Время анимации персонажа">{seconds.toFixed(2)} / {duration.toFixed(2)} с</output>
      </div>
      <input aria-label="Кадр анимации персонажа" type="range" min="0" max="100" step="0.1" disabled={!duration} value={duration?seconds/duration*100:0} onChange={event=>{
        setPlaying(false);setActive(true);setSeconds(Number(event.currentTarget.value)/100*duration)
      }}/>
      <small>Предпросмотр не меняет кампанию.</small>
    </div>
  </details>
}
