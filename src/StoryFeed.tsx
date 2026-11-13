import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react'
import type {PublicStoryMessage} from './campaignStory'
import {incomingStoryMessages,markStoryRead,storyReadSnapshot,subscribeStoryRead,unreadStoryCount} from './storyReadState'

const subscribeVisibility=(listener:()=>void)=>{document.addEventListener('visibilitychange',listener);return()=>document.removeEventListener('visibilitychange',listener)}
const visible=()=>document.visibilityState!=='hidden'
export default function StoryFeed({messages,active,readKey,total,loading,onOlder,onUnreadChange,onWithdraw,locked}:{
  messages:PublicStoryMessage[];active:boolean;readKey:string;total:number;loading:boolean;onOlder:()=>void;
  onUnreadChange?:(count:number)=>void;onWithdraw?:(id:string)=>void;locked:boolean
}){
  const feed=useRef<HTMLDivElement>(null),[following,setFollowing]=useState(true)
  const snapshot=useSyncExternalStore(useCallback(listener=>subscribeStoryRead(readKey,listener),[readKey]),useCallback(()=>storyReadSnapshot(readKey),[readKey]))
  const shown=useSyncExternalStore(subscribeVisibility,visible,()=>false)
  const incoming=useMemo(()=>incomingStoryMessages(messages),[messages]),unread=unreadStoryCount(snapshot,incoming)
  useEffect(()=>{onUnreadChange?.(unread)},[unread,onUnreadChange])
  useEffect(()=>{
    if(!active||!shown||!following||loading)return
    if(feed.current)feed.current.scrollTop=feed.current.scrollHeight
    markStoryRead(readKey,incoming)
  },[active,shown,following,loading,messages,readKey,incoming])
  const latest=()=>{if(feed.current)feed.current.scrollTop=feed.current.scrollHeight;setFollowing(true);if(active&&shown&&!loading)markStoryRead(readKey,incoming)}
  return <>
    {total>messages.length&&<button type="button" className="w6-button" disabled={loading} onClick={()=>{setFollowing(false);onOlder()}}>Показать ранние реплики ({messages.length} из {total})</button>}
    <div ref={feed} className="gb-story-feed" role="log" aria-label="История диалога героя" aria-live={active&&shown?'polite':'off'}
      onScroll={event=>{const element=event.currentTarget;setFollowing(element.scrollHeight-element.scrollTop-element.clientHeight<40)}}>
      {messages.map(entry=><article key={entry.id} data-kind={entry.kind} data-message={entry.id}>
        <header><strong>{entry.speaker}{entry.kind==='request'&&' → '+entry.targetLabel}</strong><small>{entry.seconds} с</small></header>
        <p className="w6-prose">{entry.body}</p>
        {entry.kind==='request'&&<small>{entry.resolution?.kind==='dismissed'?'Мастер закрыл вопрос: '+entry.resolution.note:
          entry.resolution?.kind==='withdrawn'?'Вопрос снят игроком':entry.resolved?'Мастер ответил':'Ожидает ответа мастера'}</small>}
        {entry.kind==='request'&&!entry.resolved&&onWithdraw&&<button type="button" className="w6-button" disabled={locked} onClick={()=>onWithdraw(entry.id)}>Снять вопрос</button>}
      </article>)}
      {!messages.length&&!loading&&<p className="w6-copy">Здесь появятся описания сцены и ответы НПС, доступные твоему герою.</p>}
    </div>
    {(!following||unread>0)&&<button className="w6-button gb-story-latest" type="button" onClick={latest}>{unread?'Новые реплики: '+unread+' · ':''}К последним репликам</button>}
  </>
}
