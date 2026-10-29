import { useEffect, useRef, useState } from 'react'
import AbilityVisualEffect from './AbilityVisualEffect'
import {abilityVisualDurationMs,sampleAbilityVisual} from './abilityVisualTimeline'
import type { SceneAbilityVisual, VisualFrame } from './sceneAbilityVisuals'
import { visualPoint } from './sceneAbilityVisuals'

export function useVisualReplay(canReplay=true) {
  const [replay,setReplay]=useState(0),[paused,setPaused]=useState(false),[enabled,setEnabled]=useState(true)
  return {replay,paused,enabled,controls:<div className="gb-art-pagination" aria-label="Визуальные эффекты сцены"><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.currentTarget.checked)}/>Эффекты</label><button className="w6-button" type="button" disabled={!enabled} onClick={()=>setPaused(!paused)}>{paused?'Продолжить анимацию':'Пауза анимации'}</button><button className="w6-button" type="button" disabled={!enabled||!canReplay} onClick={()=>{setPaused(false);setReplay(replay+1)}}>Показать последнее применение</button></div>}
}
export default function SceneAbilityOverlay({visuals,frame,replay=0,paused=false,enabled=true,effectTimeMs}:{visuals:SceneAbilityVisual[];frame:VisualFrame;replay?:number;paused?:boolean;enabled?:boolean;effectTimeMs?:number}) {
  const [elapsed,setElapsed]=useState(0),[running,setRunning]=useState(false),clock=useRef(0)
  const [reduced,setReduced]=useState(()=>typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(()=>{if(typeof window.matchMedia!=='function')return;const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(media.matches);media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update)},[])
  const signature=visuals.filter(v=>v.phase==='sequence').map(v=>v.id).join('|'),previous=useRef({frame:frame.id,signature})
  const controlled=effectTimeMs!==undefined&&Number.isFinite(effectTimeMs),durationMs=Math.max(0,...visuals.filter(v=>v.phase==='sequence').map(abilityVisualDurationMs))
  useEffect(()=>{
    const before=previous.current;previous.current={frame:frame.id,signature}
    if(before.frame===frame.id&&signature.split('|').some(id=>id&&!before.signature.split('|').includes(id))){clock.current=0;setElapsed(0);setRunning(true)}
  },[signature,frame.id])
  useEffect(()=>{clock.current=0;setElapsed(0);setRunning(replay>0)},[replay,frame.id])
  useEffect(()=>{
    if(controlled||!running||paused||!enabled||reduced||typeof window.requestAnimationFrame!=='function')return
    let handle=0,previous:number|undefined,accumulated=clock.current
    const tick=(now:number)=>{if(previous!==undefined)accumulated+=Math.min(now-previous,100);previous=now;clock.current=accumulated;setElapsed(accumulated);if(accumulated<durationMs)handle=window.requestAnimationFrame(tick);else setRunning(false)}
    handle=window.requestAnimationFrame(tick);return()=>window.cancelAnimationFrame(handle)
  // Playback time is presentation state; pausing never advances the campaign.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[running,paused,enabled,reduced,replay,frame.id,signature,controlled,durationMs])
  if(!enabled)return null
  return <g aria-label="Эффекты способностей" pointerEvents="none">{visuals.map(v=>{
    const duration=abilityVisualDurationMs(v),sample=sampleAbilityVisual(v,controlled?effectTimeMs:elapsed,controlled||running,reduced)
    if(!sample.visible)return null
    const radius=v.phase==='preparation'?.7:v.radius
    return <AbilityVisualEffect key={v.id+':'+replay} familyId={v.spec.familyId} start={visualPoint(v.start,frame)} end={visualPoint(v.end,frame)} phase={sample.phase} shape={v.shape} radius={radius} coneAngleDeg={v.coneAngleDeg} scale={v.spec.scale} intensity={v.spec.intensity} durationMs={duration} paused={paused||controlled} reducedMotion={reduced} progress={v.phase==='sequence'?sample.progress:undefined}/>
  })}</g>
}
