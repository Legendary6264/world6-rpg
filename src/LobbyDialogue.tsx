import {useEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {useRemote} from './onlineHooks'
import {NetworkError} from './onlineClient'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import type {StoryPlayerView} from './campaignStory'
import {isStoryAck} from './campaignStory'
import './storyStyle.css'

type Question={body:string;contactId:string;commandKey:string}
type Draft={body:string;contactId:string;command?:Question}
const valid=(value:unknown):value is Draft=>{
  if(!value||typeof value!=='object')return false
  const d=value as Draft
  return typeof d.body==='string'&&d.body.length<=4000&&typeof d.contactId==='string'&&d.contactId.length<=160&&
    (!d.command||typeof d.command.body==='string'&&d.command.body.length<=4000&&typeof d.command.contactId==='string'&&
      typeof d.command.commandKey==='string'&&/^story:[a-zA-Z0-9_-]{8,140}$/.test(d.command.commandKey))
}
export default function LobbyDialogue({accountId,lobbyId,characterId,checkingAccess,contactId='',onSent}:{
  accountId:string;lobbyId:string;characterId:string;checkingAccess:boolean;contactId?:string;onSent?:()=>void
}){
  const {request,refresh}=useOnline(),path='/lobbies/'+lobbyId+'/characters/'+characterId+'/story'
  const remote=useRemote<StoryPlayerView>(checkingAccess?null:path),key=lobbyFormKey('story-question',accountId,lobbyId,characterId)
  const [draft,setDraft]=useState<Draft>(()=>{
    const saved=readLobbyForm(key,valid)??{body:'',contactId:''}
    return saved.command?saved:{...saved,contactId:contactId||saved.contactId}
  })
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[warning,setWarning]=useState('')
  const pending=useRef<AbortController|null>(null),mounted=useRef(false)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort()}},[])
  useEffect(()=>()=>{pending.current?.abort()},[request,key])
  const value=checkingAccess?null:remote.value,locked=checkingAccess||remote.loading||busy||!!draft.command||!!value?.closed
  function remember(next:Draft){setDraft(next);const ok=writeLobbyForm(key,next);setWarning(ok?'':'Черновик доступен до закрытия страницы.');return ok}
  async function send(){
    if(checkingAccess||remote.loading||pending.current||!value||!draft.command&&(value.closed||!value.canAsk||!draft.body.trim()))return
    const command=draft.command??{body:draft.body,contactId:draft.contactId,commandKey:'story:'+crypto.randomUUID()}
    if(!remember({...draft,command})){setMessage('Освободи место на устройстве перед отправкой вопроса.');return}
    const abort=new AbortController();pending.current=abort;setBusy(true)
    try{
      const reply=await request<{receipt:{operation:string;id:string};duplicate:boolean}>(path,{method:'POST',body:JSON.stringify(command),signal:abort.signal})
      if(!mounted.current||abort.signal.aborted)return
      if(!isStoryAck(reply,'story-question',command.commandKey))throw Error('Не получено подтверждение вопроса. Проверь результат повтором.')
      remember({body:'',contactId:draft.contactId});setMessage(reply.duplicate?'Прежний вопрос подтверждён.':'Вопрос передан мастеру. Ответ появится здесь.');refresh();onSent?.()
    }catch(error){if(mounted.current&&!abort.signal.aborted){if(error instanceof NetworkError&&[400,403,404,409,413].includes(error.status))remember({...draft,command:undefined});setMessage((error as Error).message);refresh()}}
    finally{if(mounted.current&&pending.current===abort){pending.current=null;setBusy(false)}}
  }
  return <section className="gb-story-panel" aria-label="Диалог на сцене">
    <h4>Диалог на сцене</h4>
    <p className="w6-copy">Вопрос получает мастер. Он выбирает ответ и тех, кто его услышит.</p>
    {remote.error&&<p role="alert">{remote.error}</p>}
    {value?.paused&&<p role="status">Игра на паузе. История доступна для чтения; новые вопросы можно отправить после продолжения сессии.</p>}
    <div className="gb-story-feed" role="log" aria-label="История диалога героя" aria-live="polite">
      {value?.messages.map(entry=><article key={entry.id} data-kind={entry.kind}>
        <header><strong>{entry.speaker}{entry.kind==='request'&&' → '+entry.targetLabel}</strong><small>{entry.seconds} с</small></header>
        <p className="w6-prose">{entry.body}</p>
        {entry.kind==='request'&&<small>{entry.resolved?'Мастер ответил':'Ожидает ответа мастера'}</small>}
      </article>)}
      {value&&!value.messages.length&&<p className="w6-copy">Здесь появятся описания сцены и ответы НПС, доступные твоему герою.</p>}
    </div>
    <form onSubmit={event=>{event.preventDefault();void send()}}><fieldset disabled={locked||!value?.canAsk}>
      <label className="w6-field"><span>Собеседник</span><select aria-label="Собеседник на сцене" value={draft.contactId} onChange={event=>remember({...draft,contactId:event.currentTarget.value})}>
        <option value="">Мастеру</option>{value?.contacts.map(contact=><option key={contact.id} value={contact.id}>{contact.label}</option>)}
        {!!draft.contactId&&!value?.contacts.some(contact=>contact.id===draft.contactId)&&<option value={draft.contactId} disabled>Прежний собеседник</option>}
      </select></label>
      {!!contactId&&value?.contacts.some(contact=>contact.id===contactId)&&draft.contactId!==contactId&&<button className="w6-button" type="button" onClick={()=>remember({...draft,contactId})}>Обратиться к выбранному</button>}
      <label className="w6-field"><span>Что говорит или спрашивает герой</span><textarea aria-label="Вопрос на сцене" maxLength={4000} rows={3} required value={draft.body} onChange={event=>remember({...draft,body:event.currentTarget.value})}/></label>
      <button className="w6-button w6-primary" disabled={!draft.body.trim()}>Передать вопрос мастеру</button>
    </fieldset></form>
    {draft.command&&<button className="w6-button" disabled={checkingAccess||busy||remote.loading} onClick={()=>void send()}>Проверить отправку вопроса</button>}
    <p role="status">{message}</p>{warning&&<p role="alert">{warning}</p>}
  </section>
}
