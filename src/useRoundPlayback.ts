import {useEffect,useMemo,useState} from 'react'
import {roundPresentationFrame} from './roundPresentation'
import type {RoundPresentation} from './roundPresentation'
import {tablePlaybackPosition} from './tableRoundPlayback'
import type {TableClockSample} from './tableRoundPlayback'

type Clock={id:string;elapsedMs:number;playing:boolean;speed:number}
const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const initial=(id:string):Clock=>({id,elapsedMs:0,playing:!!id&&!reduced(),speed:1})
export function useTablePlaybackClock(sample:TableClockSample|null,active:boolean){
 const [now,setNow]=useState(0),session=sample?.view.session
 const positionMs=sample?tablePlaybackPosition(sample,Math.max(now,sample.receivedAt)):0,playing=!!session?.playing&&positionMs<session.durationMs
 useEffect(()=>{
  if(!playing||!active)return
  const tick=()=>{if(document.visibilityState!=='hidden')setNow(performance.now())}
  const timer=window.setInterval(tick,50)
  document.addEventListener('visibilitychange',tick)
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',tick)}
 },[session?.id,playing,active])
 return {positionMs,playing}
}
export default function useRoundPlayback(recording:RoundPresentation|null,active:boolean,shared:TableClockSample|null=null){
 const id=recording?recording.id+':'+recording.generation:'',durationMs=recording?.durationMs??0
 const [stored,setStored]=useState(()=>initial(id)),[motionReduced,setMotionReduced]=useState(reduced),clock=stored.id===id?stored:initial(id)
 const table=useTablePlaybackClock(shared,active),elapsedMs=shared?table.positionMs:clock.elapsedMs
 const frame=useMemo(()=>recording?roundPresentationFrame(recording,elapsedMs,motionReduced):null,[recording,elapsedMs,motionReduced])
 function change(fn:(value:Clock)=>Clock){setStored(value=>fn(value.id===id?value:initial(id)))}
 useEffect(()=>{
  if(!id||!active||!clock.playing||shared)return
  let last=performance.now()
  const reset=()=>{last=performance.now()}
  const timer=window.setInterval(()=>{
   const now=performance.now(),delta=Math.max(0,Math.min(100,now-last));last=now
   if(document.visibilityState==='hidden')return
   setStored(value=>{const current=value.id===id?value:initial(id);if(!current.playing)return value;const elapsedMs=Math.min(durationMs,current.elapsedMs+delta*current.speed);return {...current,elapsedMs,playing:elapsedMs<durationMs}})
  },50)
  document.addEventListener('visibilitychange',reset)
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',reset)}
 },[id,active,clock.playing,durationMs,shared])
 useEffect(()=>{const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(!media)return;const stop=()=>{setMotionReduced(media.matches);if(media.matches)setStored(value=>({...value,playing:false}))};media.addEventListener?.('change',stop);return()=>media.removeEventListener?.('change',stop)},[])
 const seek=(at:number)=>change(value=>({...value,elapsedMs:Math.max(0,Math.min(durationMs,Number.isFinite(at)?at:0)),playing:false}))
 return {frame,playing:active&&(shared?table.playing:clock.playing),speed:shared?.view.session?.speed??clock.speed,seek,toggle:()=>change(value=>({...value,elapsedMs:value.elapsedMs>=durationMs?0:value.elapsedMs,playing:!value.playing})),setSpeed:(speed:number)=>{if([.5,1,2,4].includes(speed))change(value=>({...value,speed}))}}
}
