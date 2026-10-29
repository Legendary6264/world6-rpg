import type {SceneAbilityVisual} from './sceneAbilityVisuals'
import type {AbilityVisualPhase} from './abilityVisuals'
export type AbilityVisualSample={phase:AbilityVisualPhase;progress:number;visible:boolean}
export function abilityVisualDurationMs(visual:SceneAbilityVisual){return Math.max(500,Math.min(10000,visual.spec.durationMs??1800))}
export function sampleAbilityVisual(visual:SceneAbilityVisual,elapsedMs:number,playing=true,reduced=false):AbilityVisualSample {
 if(visual.phase!=='sequence')return {phase:visual.phase,progress:.45,visible:true}
 if(!playing)return {phase:'impact',progress:.4,visible:false}
 if(reduced)return {phase:'impact',progress:.4,visible:true}
 const duration=abilityVisualDurationMs(visual),p=(Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):0)/duration
 if(p>=1)return {phase:'residue',progress:1,visible:false}
 const stages:[number,number,AbilityVisualPhase][]=[[0,.18,'preparation'],[.18,.30,'release'],[.30,.65,'travel'],[.65,.84,'impact'],[.84,1,'residue']]
 const [start,end,phase]=stages.find(([,end])=>p<end)!
 return {phase,progress:(p-start)/(end-start),visible:true}
}
