import {readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import type {PublicStoryMessage} from './campaignStory'

type Marker={at:number;keys:string[]}
type Incoming={at:number;key:string}
const cache=new Map<string,string>(),listeners=new Map<string,Set<()=>void>>()
const empty=JSON.stringify({at:0,keys:[]})
const valid=(value:unknown):value is Marker=>{
  if(!value||typeof value!=='object')return false
  const marker=value as Marker
  return Number.isSafeInteger(marker.at)&&marker.at>=0&&Array.isArray(marker.keys)&&marker.keys.length<=1000&&
    marker.keys.every(key=>typeof key==='string'&&key.length<=220)
}
const merge=(left:Marker,right:Marker):Marker=>left.at!==right.at?(left.at>right.at?left:right):
  {at:left.at,keys:[...new Set([...left.keys,...right.keys])].slice(-1000)}
function persisted(key:string):Marker{
  try{const value=JSON.parse(window.localStorage.getItem(key)??empty);if(valid(value))return value}catch{ /* Reading stays available when storage is blocked. */ }
  return JSON.parse(empty) as Marker
}
export function incomingStoryMessages(messages:PublicStoryMessage[]):Incoming[]{
  return messages.flatMap(message=>{
    const closed=message.kind==='request'&&message.resolution?.kind==='dismissed'
    if(message.kind==='request'&&!closed)return []
    const at=Date.parse(closed?message.resolution!.at:message.createdAt)
    return Number.isFinite(at)?[{at,key:message.id+(closed?':closed':'')}]:[]
  })
}
export function storyReadSnapshot(key:string):string{
  const previous=cache.has(key)?JSON.parse(cache.get(key)!):readLobbyForm(key,valid)??JSON.parse(empty)
  const snapshot=JSON.stringify(merge(previous,persisted(key)));cache.set(key,snapshot)
  return snapshot
}
const notify=(key:string)=>listeners.get(key)?.forEach(listener=>listener())
export function subscribeStoryRead(key:string,listener:()=>void){
  const set=listeners.get(key)??new Set<()=>void>();listeners.set(key,set);set.add(listener)
  const storage=(event:StorageEvent)=>{
    if(event.key!==key)return
    try{const value=JSON.parse(event.newValue??empty);if(valid(value)){cache.set(key,JSON.stringify(merge(JSON.parse(storyReadSnapshot(key)),value)));notify(key)}}catch{ /* A damaged external marker never acknowledges messages. */ }
  }
  window.addEventListener('storage',storage)
  return()=>{set.delete(listener);if(!set.size)listeners.delete(key);window.removeEventListener('storage',storage)}
}
export function unreadStoryCount(snapshot:string,incoming:Incoming[]):number{
  const marker=JSON.parse(snapshot) as Marker,keys=new Set(marker.keys)
  // Older pages can contain unseen ids with the same millisecond timestamp.
  const boundary=incoming.findLastIndex(message=>message.at===marker.at&&keys.has(message.key))
  return incoming.filter((message,index)=>message.at>marker.at||message.at===marker.at&&!keys.has(message.key)&&
    (index>boundary||message.key.endsWith(':closed'))).length
}
export function markStoryRead(key:string,incoming:Incoming[]){
  if(!incoming.length)return
  const previous=JSON.parse(storyReadSnapshot(key)) as Marker,at=Math.max(previous.at,...incoming.map(message=>message.at))
  const keys=[...new Set([...(at===previous.at?previous.keys:[]),...incoming.filter(message=>message.at===at).map(message=>message.key)])].slice(-1000)
  const next=JSON.stringify({at,keys})
  if(next===storyReadSnapshot(key))return
  cache.set(key,next);writeLobbyForm(key,{at,keys});notify(key)
}
