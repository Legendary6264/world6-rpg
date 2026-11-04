import { useEffect, useRef, useState } from 'react'
import AbilityVisualEffect from './AbilityVisualEffect'
import {abilityVisualDurationMs} from './abilityVisualTimeline'
import {SceneAbilityPlayback} from './sceneAbilityPlayback'
import type { SceneAbilityVisual, VisualFrame } from './sceneAbilityVisuals'
import { visualPoint } from './sceneAbilityVisuals'

export function useVisualReplay(canReplay=true) {
  const [replay,setReplay]=useState(0),[paused,setPaused]=useState(false),[enabled,setEnabled]=useState(true)
  return {replay,paused,enabled,controls:<div className="gb-art-pagination" aria-label="Визуальные эффекты сцены"><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.currentTarget.checked)}/>Эффекты</label><button className="w6-button" type="button" disabled={!enabled} onClick={()=>setPaused(!paused)}>{paused?'Продолжить анимацию':'Пауза анимации'}</button><button className="w6-button" type="button" disabled={!enabled||!canReplay} onClick={()=>{setPaused(false);setReplay(replay+1)}}>Показать последнее применение</button></div>}
}
export default function SceneAbilityOverlay({visuals,frame,replay=0,paused=false,enabled=true,effectTimeMs}:{visuals:SceneAbilityVisual[];frame:VisualFrame;replay?:number;paused?:boolean;enabled?:boolean;effectTimeMs?:number}) {
  const [playback]=useState(()=>new SceneAbilityPlayback(frame.id,visuals)),[,redraw]=useState(0),lastReplay=useRef(replay)
  const [reduced,setReduced]=useState(()=>typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(()=>{if(typeof window.matchMedia!=='function')return;const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(media.matches);media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update)},[])
  const controlled=effectTimeMs!==undefined&&Number.isFinite(effectTimeMs),running=playback.active
  useEffect(()=>{
    playback.sync(frame.id,visuals,replay!==lastReplay.current);lastReplay.current=replay
    let cancelled=false
    // Publish the external presentation clock after effect synchronization.
    queueMicrotask(()=>{if(!cancelled)redraw(n=>n+1)})
    return()=>{cancelled=true}
  },[playback,visuals,replay,frame.id])
  useEffect(()=>{
    if(controlled||!running||paused||!enabled||typeof window.requestAnimationFrame!=='function')return
    let handle=0,previous:number|undefined
    const schedule=()=>{if(!handle&&playback.active&&document.visibilityState!=='hidden')handle=window.requestAnimationFrame(tick)}
    const tick=(now:number)=>{handle=0;if(document.visibilityState==='hidden'){previous=undefined;return}if(previous!==undefined)playback.advance(Math.min(100,Math.max(0,now-previous)));previous=now;redraw(n=>n+1);schedule()}
    const visibility=()=>{window.cancelAnimationFrame(handle);handle=0;previous=undefined;schedule()}
    document.addEventListener('visibilitychange',visibility);schedule()
    return()=>{window.cancelAnimationFrame(handle);document.removeEventListener('visibilitychange',visibility)}
  },[playback,running,paused,enabled,replay,frame.id,visuals,controlled])
  if(!enabled)return null
  return <g aria-label="Эффекты способностей" pointerEvents="none">{visuals.map(v=>{
    const duration=abilityVisualDurationMs(v),sample=playback.sample(v,reduced,controlled?effectTimeMs:undefined)
    if(!sample.visible)return null
    const radius=v.phase==='preparation'?.7:v.radius
    return <AbilityVisualEffect key={v.id+':'+replay} familyId={v.spec.familyId} start={visualPoint(v.start,frame)} end={visualPoint(v.end,frame)} phase={sample.phase} shape={v.shape} radius={radius} coneAngleDeg={v.coneAngleDeg} scale={v.spec.scale} intensity={v.spec.intensity} durationMs={duration} paused={paused||controlled||reduced} reducedMotion={reduced} progress={v.phase==='sequence'?sample.progress:undefined}/>
  })}</g>
}
