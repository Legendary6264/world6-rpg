import {useEffect,useMemo,useRef,useState} from 'react'
import Scene3D from './Scene3D'
import AbilityVisualEffect from './AbilityVisualEffect'
import {abilityPreviewPhaseFractions,abilityVisualPreviewModel} from './abilityVisualPreview'
import {abilityVisualDurationMs,sampleAbilityVisual} from './abilityVisualTimeline'
import {abilityVisualPhases} from './abilityVisuals'
import type {AbilityVisualShape,AbilityVisualSpec} from './abilityVisuals'
import './sceneStyle.css'

export default function AbilityVisualStudio({spec,shape}:{spec:AbilityVisualSpec;shape:AbilityVisualShape}){
  const model=useMemo(()=>abilityVisualPreviewModel(spec,shape),[spec,shape])
  const [fraction,setFraction]=useState(.745),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(false),[unavailable,setUnavailable]=useState(false),clock=useRef(.745)
  const visual=model.visuals[0],duration=abilityVisualDurationMs(visual),time=fraction*duration,sample=sampleAbilityVisual(visual,time,true)
  const seek=(value:number)=>{const next=Math.max(0,Math.min(1,value));clock.current=next;setFraction(next)}
  useEffect(()=>{
    if(!playing||typeof window.requestAnimationFrame!=='function')return
    let handle=0,previous:number|undefined
    const schedule=()=>{if(!handle&&document.visibilityState!=='hidden')handle=window.requestAnimationFrame(tick)}
    const tick=(now:number)=>{handle=0;if(document.visibilityState==='hidden'){previous=undefined;return}const delta=previous===undefined?0:Math.max(0,Math.min(100,now-previous));previous=now;let next=clock.current+delta/duration
      if(next>=1-1e-9){if(loop)next=Math.max(0,next-1);else{clock.current=1;setFraction(1);setPlaying(false);return}}clock.current=next;setFraction(next);schedule()}
    const visibility=()=>{window.cancelAnimationFrame(handle);handle=0;previous=undefined;schedule()}
    document.addEventListener('visibilitychange',visibility);schedule();return()=>{window.cancelAnimationFrame(handle);document.removeEventListener('visibilitychange',visibility)}
  },[playing,duration,loop])
  return <div className="w6-vfx-studio" aria-label="Мастерская 3D-эффектов">
    <div className="w6-visual-phase-list" aria-label="Кадр стадии в 3D">{abilityVisualPhases.map(phase=><button key={phase.id} type="button" aria-pressed={sample.phase===phase.id} onClick={()=>{setPlaying(false);seek(abilityPreviewPhaseFractions[phase.id])}}>{phase.label}</button>)}</div>
    {unavailable?<><p role="status">3D недоступно в этом браузере. Кадр эффекта показан на схеме.</p><svg viewBox="0 0 300 200" role="img" aria-label="Резервный просмотр эффекта">{sample.visible&&<AbilityVisualEffect familyId={spec.familyId} start={{x:60,y:100}} end={{x:225,y:100}} shape={shape} radius={28} glyphRadius={26} scale={spec.scale} intensity={spec.intensity} phase={sample.phase} progress={sample.progress} paused={!playing}/>}</svg></>:<Scene3D viewSettingsScope="ability-studio" model={model} effectTimeMs={time} onUnavailable={()=>setUnavailable(true)}/>}
    <div className="w6-vfx-studio-timeline"><label>Кадр эффекта <output>{(time/1000).toFixed(2)} / {(duration/1000).toFixed(2)} с</output><input aria-label="Кадр 3D-эффекта" type="range" min="0" max="1000" step="1" value={Math.round(fraction*1000)} onChange={e=>{setPlaying(false);seek(Number(e.currentTarget.value)/1000)}}/></label></div>
    <div className="w6-visual-preview-controls"><button type="button" onClick={()=>{if(!playing&&clock.current>=1)seek(0);setPlaying(!playing)}}>{playing?'Пауза просмотра':'Воспроизвести эффект'}</button><button type="button" onClick={()=>{seek(0);setPlaying(true)}}>С начала</button><label className="w6-vfx-loop"><input type="checkbox" checked={loop} onChange={e=>setLoop(e.currentTarget.checked)}/>Повторять цикл</label></div>
    <p className="w6-vfx-studio-caption">Вращай камеру мышью. Фигуры показывают масштаб эффекта. Кадр и камера не изменяют способность и игровой мир.</p>
  </div>
}
