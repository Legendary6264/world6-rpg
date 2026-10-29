import type {PlaytestRecording} from './scenePlaytest'
import type {SceneAbilityVisual} from './sceneAbilityVisuals'
const noVisuals:SceneAbilityVisual[]=[]
export function playtestReplayDuration(recording:PlaytestRecording){return recording.steps.reduce((sum,step)=>sum+step.durationMs,0)}
// Presentation milliseconds only. Sampling never applies operations or saves.
export function playtestReplayFrame(recording:PlaytestRecording,timeMs:number){
 const durationMs=playtestReplayDuration(recording),elapsedMs=Math.max(0,Math.min(durationMs,Number.isFinite(timeMs)?timeMs:0))
 let startMs=0
 for(const [index,step] of recording.steps.entries()){
  if(elapsedMs<startMs+step.durationMs){
   const localMs=elapsedMs-startMs,release=step.action.kind==='ability'&&step.action.stage==='release'
   return {scene:release&&localMs<step.durationMs*.65?step.before:step.after,visuals:step.visuals,effectTimeMs:localMs,stepIndex:index,startMs,elapsedMs,durationMs,complete:false}
  }
  startMs+=step.durationMs
 }
 return {scene:recording.scene,visuals:noVisuals,effectTimeMs:0,stepIndex:Math.max(0,recording.steps.length-1),startMs:durationMs,elapsedMs,durationMs,complete:true}
}
