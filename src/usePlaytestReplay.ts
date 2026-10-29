import {useEffect,useMemo,useState} from 'react'
import type {PlaytestRecording} from './scenePlaytest'
import {playtestReplayDuration,playtestReplayFrame} from './scenePlayReplay'
export type ReplaySession=PlaytestRecording&{id:string;kind:'plan'|'confirmation';expectedScene:string;autoplay:boolean}
type Clock={id:string;elapsedMs:number;playing:boolean;speed:number}
const initial=(id:string,autoplay=false):Clock=>({id,elapsedMs:0,playing:!!id&&autoplay&&typeof window!=='undefined'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,speed:1})
export default function usePlaytestReplay(session:ReplaySession|null){
 const id=session?.id??'',autoplay=session?.autoplay??false,durationMs=session?playtestReplayDuration(session):0,[stored,setStored]=useState(()=>initial(id,autoplay)),clock=stored.id===id?stored:initial(id,autoplay)
 const frame=useMemo(()=>session?playtestReplayFrame(session,clock.elapsedMs):null,[session,clock.elapsedMs])
 function change(update:(clock:Clock)=>Clock){setStored(value=>update(value.id===id?value:initial(id,autoplay)))}
 useEffect(()=>{
  if(!id||!clock.playing)return
  let last=performance.now()
  const reset=()=>{last=performance.now()}
  const tick=()=>{const now=performance.now(),delta=Math.max(0,Math.min(100,now-last));last=now;if(document.visibilityState==='hidden')return;setStored(value=>{const current=value.id===id?value:initial(id,autoplay);if(!current.playing)return value;const elapsedMs=Math.min(durationMs,current.elapsedMs+delta*current.speed);return {...current,elapsedMs,playing:elapsedMs<durationMs}})}
  const timer=window.setInterval(tick,50);document.addEventListener('visibilitychange',reset)
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',reset)}
 },[id,clock.playing,durationMs,autoplay])
 useEffect(()=>{const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(!media)return;const stop=()=>{if(media.matches)setStored(value=>({...value,playing:false}))};media.addEventListener?.('change',stop);return()=>media.removeEventListener?.('change',stop)},[])
 const seek=(timeMs:number)=>change(value=>({...value,elapsedMs:Math.max(0,Math.min(durationMs,Number.isFinite(timeMs)?timeMs:0)),playing:false}))
 const step=(index:number)=>{if(session)seek(session.steps.slice(0,Math.max(0,Math.min(session.steps.length-1,index))).reduce((sum,s)=>sum+s.durationMs,0))}
 return {frame,playing:clock.playing,speed:clock.speed,seek,step,toggle:()=>change(value=>({...value,elapsedMs:value.elapsedMs>=durationMs?0:value.elapsedMs,playing:!value.playing})),restart:()=>change(value=>({...value,elapsedMs:0,playing:true})),setSpeed:(speed:number)=>{if([.5,1,2,4].includes(speed))change(value=>({...value,speed}))}}
}
