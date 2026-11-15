import {useEffect,useMemo,useState} from 'react'
import {roundPresentationFrame} from './roundPresentation'
import type {RoundPresentation} from './roundPresentation'

type Clock={id:string;elapsedMs:number;playing:boolean;speed:number}
const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const initial=(id:string):Clock=>({id,elapsedMs:0,playing:!!id&&!reduced(),speed:1})
export default function useRoundPlayback(recording:RoundPresentation|null,active:boolean){
 const id=recording?recording.id+':'+recording.generation:'',durationMs=recording?.durationMs??0
 const [stored,setStored]=useState(()=>initial(id)),[motionReduced,setMotionReduced]=useState(reduced),clock=stored.id===id?stored:initial(id)
 const frame=useMemo(()=>recording?roundPresentationFrame(recording,clock.elapsedMs,motionReduced):null,[recording,clock.elapsedMs,motionReduced])
 function change(fn:(value:Clock)=>Clock){setStored(value=>fn(value.id===id?value:initial(id)))}
 useEffect(()=>{
  if(!id||!active||!clock.playing)return
  let last=performance.now()
  const reset=()=>{last=performance.now()}
  const timer=window.setInterval(()=>{
   const now=performance.now(),delta=Math.max(0,Math.min(100,now-last));last=now
   if(document.visibilityState==='hidden')return
   setStored(value=>{const current=value.id===id?value:initial(id);if(!current.playing)return value;const elapsedMs=Math.min(durationMs,current.elapsedMs+delta*current.speed);return {...current,elapsedMs,playing:elapsedMs<durationMs}})
  },50)
  document.addEventListener('visibilitychange',reset)
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',reset)}
 },[id,active,clock.playing,durationMs])
 useEffect(()=>{const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(!media)return;const stop=()=>{setMotionReduced(media.matches);if(media.matches)setStored(value=>({...value,playing:false}))};media.addEventListener?.('change',stop);return()=>media.removeEventListener?.('change',stop)},[])
 const seek=(at:number)=>change(value=>({...value,elapsedMs:Math.max(0,Math.min(durationMs,Number.isFinite(at)?at:0)),playing:false}))
 return {frame,playing:active&&clock.playing,speed:clock.speed,seek,toggle:()=>change(value=>({...value,elapsedMs:value.elapsedMs>=durationMs?0:value.elapsedMs,playing:!value.playing})),setSpeed:(speed:number)=>{if([.5,1,2,4].includes(speed))change(value=>({...value,speed}))}}
}
