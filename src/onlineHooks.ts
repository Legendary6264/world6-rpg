import { useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react'
import { useOnline } from './onlineContext'
export function useRemote<T>(path:string|null){
 const {request,events,user}=useOnline(),accountId=user?.id??null
 const scope=useMemo(()=>({path,accountId,request}),[path,accountId,request])
 const [result,setResult]=useState<{scope:typeof scope;events:number;value:T|null;error:string;stale:boolean;receivedAt:number;latencyMs:number}|null>(null)
 const latestEvents=useRef(events),subscription=useRef<{scope:typeof scope;update:(events:number)=>void}|null>(null)
 useLayoutEffect(()=>{
  latestEvents.current=events
  if(subscription.current?.scope===scope)subscription.current.update(events)
 },[scope,events])
 useEffect(()=>{
  const {path,request}=scope
  if(!path)return
  let active=true,running=false,wanted=latestEvents.current,delay=1000,abort:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined
  function read(){
   if(!active||running)return
   running=true;clearTimeout(timer);timer=undefined
   const current=new AbortController();abort=current
   const started=wanted,sentAt=performance.now();let settled=started
   void Promise.resolve().then(()=>{if(!active||current.signal.aborted)throw new DOMException('Read cancelled','AbortError');return request<T>(path!,{signal:current.signal})}).then(value=>{
    if(!active||current.signal.aborted)return
    const receivedAt=performance.now()
    delay=1000;setResult({scope,events:started,value,error:'',stale:false,receivedAt,latencyMs:receivedAt-sentAt})
   }).catch((error:Error&{status?:number})=>{
    if(!active||current.signal.aborted)return
    const retrying=error.status===0||error.status===408||error.status===429||(error.status??0)>=500
    // Keep the visible scene during an outage, while loading keeps all writes
    // blocked. A definite refusal discards cached private data immediately.
    settled=wanted
    setResult(previous=>({scope,events:settled,value:retrying&&previous?.scope===scope?previous.value:null,error:error.message+(retrying?' Повторяем загрузку…':''),stale:retrying,receivedAt:previous?.scope===scope?previous.receivedAt:0,latencyMs:previous?.scope===scope?previous.latencyMs:0}))
    if(retrying){timer=setTimeout(()=>{timer=undefined;read()},delay);delay=Math.min(delay*2,30000)}
   }).finally(()=>{
    running=false
    // Party events never cancel useful progress. Coalesce them into one fresh
    // read, and keep writes blocked until the latest event has been checked.
    if(active&&wanted!==settled)read()
   })
  }
  const current={scope,update:(next:number)=>{if(wanted!==next){wanted=next;read()}}}
  subscription.current=current;read()
  return()=>{active=false;clearTimeout(timer);abort?.abort();if(subscription.current===current)subscription.current=null}
 },[scope])
 // Returning to a room creates a new scope even when its URL is the same.
 // An old response never briefly enables actions before the new check.
 const current=!!path&&result?.scope===scope
 return {value:current?result.value:null,error:current?result.error:'',loading:!!path&&(!current||result.stale||result.events!==events),receivedAt:current?result.receivedAt:0,latencyMs:current?result.latencyMs:0}
}
export function useDebounced(value:string){const [result,setResult]=useState(value);useEffect(()=>{const timer=setTimeout(()=>setResult(value),250);return()=>clearTimeout(timer)},[value]);return result}
