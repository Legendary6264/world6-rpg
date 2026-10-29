import {sceneAbilityAimLines} from './sceneAbilityAim'
import type {SceneAbilityAim as Aim} from './sceneAbilityAim'
import type {VisualFrame} from './sceneAbilityVisuals'
import {visualPoint} from './sceneAbilityVisuals'
export default function SceneAbilityAim({aim,frame}:{aim:Aim|null|undefined;frame:VisualFrame}){
 if(!aim||aim.sceneId!==frame.id)return null
 return <g aria-label="Область прицеливания" pointerEvents="none" className="gb-ability-aim" data-valid={aim.valid} data-obstructed={!!aim.obstruction}>{sceneAbilityAimLines(aim).map((points,i)=><polyline key={i} points={points.map(p=>{const v=visualPoint(p,frame);return v.x+','+v.y}).join(' ')} vectorEffect="non-scaling-stroke"/>)}</g>
}
