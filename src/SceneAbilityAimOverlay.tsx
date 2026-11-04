import {sceneAbilityAimLines} from './sceneAbilityAim'
import type {SceneAbilityAim as Aim} from './sceneAbilityAim'
import type {VisualFrame} from './sceneAbilityVisuals'
import {visualPoint} from './sceneAbilityVisuals'
import {abilityAimTargetColor,aimTargetLines,projectedAimSurface} from './sceneAbilityAimPresentation'
import type {AimTarget} from './sceneAimTargets'
export default function SceneAbilityAim({aim,frame,targets=[]}:{aim:Aim|null|undefined;frame:VisualFrame;targets?:AimTarget[]}){
 if(!aim||aim.sceneId!==frame.id)return null
 const surface=projectedAimSurface(aim,frame)
 return <g aria-label="Область прицеливания" pointerEvents="none" className="gb-ability-aim" data-valid={aim.valid} data-obstructed={!!aim.obstruction}>
  {!!surface.length&&<polygon className="gb-aim-surface" points={surface.map(p=>p.x+','+p.y).join(' ')}/>}
  {sceneAbilityAimLines(aim).map((points,i)=><polyline key={i} points={points.map(p=>{const v=visualPoint(p,frame);return v.x+','+v.y}).join(' ')} vectorEffect="non-scaling-stroke"/>)}
  {aim.valid&&targets.map(t=><g key={t.kind+':'+t.id} className="gb-aim-target" data-kind={t.kind} data-aim-target={t.kind+':'+t.id} style={{stroke:abilityAimTargetColor(t)}}><title>{t.label+' · отметка внутри области'}</title>{aimTargetLines(t).map((line,i)=><polyline key={i} points={line.map(p=>{const v=visualPoint(p,frame);return v.x+','+v.y}).join(' ')} vectorEffect="non-scaling-stroke"/>)}</g>)}
 </g>
}
