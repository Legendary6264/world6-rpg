import {useEffect,useRef,useState} from 'react'
import {lobbyInviteUrl} from './lobbyNavigation'
import InterfaceIcon from './InterfaceIcon'

export default function PartyInvitation({code}:{code:string}){
 const url=lobbyInviteUrl(code),field=useRef<HTMLInputElement>(null),active=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 async function copy(){
  if(busy)return
  field.current?.focus({preventScroll:true});field.current?.select();setBusy(true)
  try{if(!window.navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await window.navigator.clipboard.writeText(url);if(active.current)setMessage('Приглашение скопировано. Передай ссылку участникам.')}
  catch{if(active.current)setMessage('Ссылка выделена. Скопируй её вручную и передай участникам.')}
  finally{if(active.current)setBusy(false)}
 }
 return <section className="realm-party-invite" aria-label="Приглашение в партию"><header><InterfaceIcon name="lobbies" size={22}/><div><h4>Друзьям — за один стол</h4><p>Ссылка откроет эту кампанию. Для вступления нужен вход в аккаунт.</p></div></header><div className="realm-invite-controls"><label className="w6-field"><span>Ссылка приглашения в партию</span><input ref={field} aria-label="Ссылка приглашения в партию" readOnly value={url} onFocus={e=>e.currentTarget.select()}/></label><button type="button" className="w6-button" disabled={busy} onClick={()=>void copy()}>{busy?'Копируем…':'Копировать ссылку партии'}</button></div><p role="status">{message}</p></section>
}
