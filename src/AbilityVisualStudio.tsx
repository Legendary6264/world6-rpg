import {useEffect,useMemo,useRef,useState} from 'react'
import Scene3D from './Scene3D'
import AbilityVisualEffect from './AbilityVisualEffect'
import {abilityPreviewAim,abilityPreviewPhaseFractions,abilityVisualPreviewModel} from './abilityVisualPreview'
import {isAbilitySpatial} from './abilitySpatial'
import type {AbilitySpatial} from './rpgTypes'
import {renderAimTargets} from './sceneAimTargets'
import SceneAbilityAimSummary from './SceneAbilityAimSummary'
import SceneAbilityAimOverlay from './SceneAbilityAimOverlay'
import {abilityVisualDurationMs,sampleAbilityVisual} from './abilityVisualTimeline'
import {abilityVisualPhases} from './abilityVisuals'
import type {AbilityVisualShape,AbilityVisualSpec} from './abilityVisuals'
import './sceneStyle.css'

export default function AbilityVisualStudio({spec,shape,spatial,rangeM}:{spec:AbilityVisualSpec;shape:AbilityVisualShape;spatial?:AbilitySpatial;rangeM?:number}){
  const {model,aim,targets}=useMemo(()=>{
    const model=abilityVisualPreviewModel(spec,shape,spatial,rangeM),aim=abilityPreviewAim(model,spatial,rangeM)
    return {model,aim,targets:renderAimTargets(model,aim)}
  },[spec,shape,spatial,rangeM])
  const [showAim,setShowAim]=useState(false)
  const invalid=!!spatial&&(!isAbilitySpatial(spatial)||rangeM!==undefined&&(!Number.isFinite(rangeM)||rangeM<0||'lengthM' in spatial&&spatial.lengthM>rangeM))
  const [fraction,setFraction]=useState(.745),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(false),[unavailable,setUnavailable]=useState(false),clock=useRef(.745)
  const visual=model.visuals[0],duration=abilityVisualDurationMs(visual),time=fraction*duration,sample=sampleAbilityVisual(visual,time,true)
  const seek=(value:number)=>{const next=Math.max(0,Math.min(1,value));clock.current=next;setFraction(next)}
  useEffect(()=>{
    if(invalid||!playing||typeof window.requestAnimationFrame!=='function')return
    let handle=0,previous:number|undefined
    const schedule=()=>{if(!handle&&document.visibilityState!=='hidden')handle=window.requestAnimationFrame(tick)}
    const tick=(now:number)=>{handle=0;if(document.visibilityState==='hidden'){previous=undefined;return}const delta=previous===undefined?0:Math.max(0,Math.min(100,now-previous));previous=now;let next=clock.current+delta/duration
      if(next>=1-1e-9){if(loop)next=Math.max(0,next-1);else{clock.current=1;setFraction(1);setPlaying(false);return}}clock.current=next;setFraction(next);schedule()}
    const visibility=()=>{window.cancelAnimationFrame(handle);handle=0;previous=undefined;schedule()}
    document.addEventListener('visibilitychange',visibility);schedule();return()=>{window.cancelAnimationFrame(handle);document.removeEventListener('visibilitychange',visibility)}
  },[playing,duration,loop,invalid])
  if(invalid)return <p role="status" className="gb-aim-readout" data-valid="false">Укажи положительные размеры формы, угол конуса меньше 180° и длину не больше дальности, чтобы проверить область в 3D.</p>
  return <div className="w6-vfx-studio" aria-label="Мастерская 3D-эффектов">
    <div className="w6-vfx-aim-control"><button type="button" aria-pressed={showAim} onClick={()=>setShowAim(!showAim)}>Контур и отметки</button><span>Размеры в метрах · {spatial?'по параметрам способности':'демонстрационная форма'}</span></div>
    <div className="w6-visual-phase-list" aria-label="Кадр стадии в 3D">{abilityVisualPhases.map(phase=><button key={phase.id} type="button" aria-pressed={sample.phase===phase.id} onClick={()=>{setPlaying(false);seek(abilityPreviewPhaseFractions[phase.id])}}>{phase.label}</button>)}</div>
    {unavailable?<><p role="status">3D недоступно в этом браузере. Кадр эффекта показан на схеме.</p><svg viewBox={`0 0 ${model.frame.width} ${model.frame.depth}`} role="img" aria-label="Резервный просмотр эффекта">
      {model.entities.map(e=><circle key={e.id} cx={e.transform.position.x} cy={e.transform.position.y} r=".35" fill="#879fb8"><title>{e.identity.label}</title></circle>)}
      {sample.visible&&<AbilityVisualEffect familyId={spec.familyId} start={visual.start} end={visual.end} shape={visual.shape} radius={visual.radius} coneAngleDeg={visual.coneAngleDeg} glyphRadius={.7} scale={spec.scale} intensity={spec.intensity} phase={sample.phase} progress={sample.progress} paused={!playing}/>}
      {showAim&&<SceneAbilityAimOverlay aim={aim} frame={model.frame} targets={targets}/>}
    </svg></>:<Scene3D viewSettingsScope="ability-studio" model={model} abilityAim={showAim?aim:null} effectTimeMs={time} onUnavailable={()=>setUnavailable(true)}/>}
    {showAim&&<SceneAbilityAimSummary aim={aim} targets={targets}/>}
    <div className="w6-vfx-studio-timeline"><label>Кадр эффекта <output>{(time/1000).toFixed(2)} / {(duration/1000).toFixed(2)} с</output><input aria-label="Кадр 3D-эффекта" type="range" min="0" max="1000" step="1" value={Math.round(fraction*1000)} onChange={e=>{setPlaying(false);seek(Number(e.currentTarget.value)/1000)}}/></label></div>
    <div className="w6-visual-preview-controls"><button type="button" onClick={()=>{if(!playing&&clock.current>=1)seek(0);setPlaying(!playing)}}>{playing?'Пауза просмотра':'Воспроизвести эффект'}</button><button type="button" onClick={()=>{seek(0);setPlaying(true)}}>С начала</button><label className="w6-vfx-loop"><input type="checkbox" checked={loop} onChange={e=>setLoop(e.currentTarget.checked)}/>Повторять цикл</label></div>
    <p className="w6-vfx-studio-caption">Вращай камеру мышью. Фигуры показывают масштаб эффекта. Кадр и камера не изменяют способность и игровой мир.</p>
  </div>
}
