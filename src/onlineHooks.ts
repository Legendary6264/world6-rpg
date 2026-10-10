import { useEffect,useState } from 'react'
import { useOnline } from './onlineContext'
export function useRemote<T>(path:string|null){
 const {request,events,user}=useOnline(),accountId=user?.id??null
 const [result,setResult]=useState<{path:string;accountId:string|null;request:typeof request;events:number;value:T|null;error:string}|null>(null)
 useEffect(()=>{if(!path)return;const abort=new AbortController();void request<T>(path,{signal:abort.signal}).then(value=>{if(!abort.signal.aborted)setResult({path,accountId,request,events,value,error:''})}).catch(e=>{if(!abort.signal.aborted)setResult({path,accountId,request,events,value:null,error:(e as Error).message})});return()=>abort.abort()},[path,accountId,request,events])
 // A different room or account never briefly renders the previous response.
 const current=!!path&&result?.path===path&&result?.accountId===accountId&&result?.request===request
 return {value:current?result.value:null,error:current?result.error:'',loading:!!path&&(!current||result.events!==events)}
}
export function useDebounced(value:string){const [result,setResult]=useState(value);useEffect(()=>{const timer=setTimeout(()=>setResult(value),250);return()=>clearTimeout(timer)},[value]);return result}
