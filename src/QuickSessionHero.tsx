import {useEffect,useRef,useState} from 'react'
import {createDefaultCharacter,isCharacterDraft} from './characterModel'
import type {SavedCharacter} from './characterModel'
import {useOnline} from './onlineContext'
import {NetworkError} from './onlineClient'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
type Draft={name:string;energy:'mana'|'shadow';character:SavedCharacter|null}
const valid=(v:unknown):v is Draft=>!!v&&typeof v==='object'&&typeof (v as Draft).name==='string'&&['mana','shadow'].includes((v as Draft).energy)&&((v as Draft).character===null||isCharacterDraft((v as Draft).character)&&typeof (v as Draft).character?.id==='string')
export default function QuickSessionHero({accountId,disabled,onCreated}:{accountId:string;disabled:boolean;onCreated:(id:string)=>void}){
 const {request}=useOnline(),key=lobbyFormKey('quick-game-hero',accountId,'account'),[draft,setDraft]=useState<Draft>(()=>readLobbyForm(key,valid)??{name:'Искатель',energy:'mana',character:null}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),pending=useRef<AbortController|null>(null),active=useRef(true)
 useEffect(()=>{active.current=true;return()=>{active.current=false;pending.current?.abort()}},[])
 useEffect(()=>()=>{pending.current?.abort();pending.current=null;if(active.current)setBusy(false)},[request])
 function remember(next:Draft){setDraft(next);return writeLobbyForm(key,next)}
 async function create(){
  if(disabled||pending.current||!draft.name.trim())return
  const character=draft.character??{...createDefaultCharacter(),id:crypto.randomUUID(),name:draft.name.trim()};if(!draft.character)character.profile!.energy=draft.energy
  if(!remember({...draft,character})){setMessage('Не удалось сохранить команду создания. Освободи место на устройстве.');return}
  const abort=new AbortController();pending.current=abort;setBusy(true)
  try{
   try{await request('/characters/'+character.id,{method:'PUT',body:JSON.stringify({character,revision:-1}),signal:abort.signal})}
   catch(e){if(!(e instanceof NetworkError&&e.status===409))throw e;const existing=await request<{character:SavedCharacter}>('/characters/'+character.id,{signal:abort.signal});if(JSON.stringify(existing.character)!==JSON.stringify(character))throw new Error('Лист уже изменён. Обнови список героев и выбери сохранённую копию.')}
   if(!active.current||abort.signal.aborted)return
   remember({...draft,character:null});setMessage('Базовый герой сохранён в аккаунте и выбран. Добавь его в кампанию для принятия мастером.');onCreated(character.id)
  }catch(e){if(active.current&&!abort.signal.aborted)setMessage((e as Error).message)}
  finally{if(active.current&&!abort.signal.aborted){pending.current=null;setBusy(false)}}
 }
 return <details className="w6-fieldset gb-quick-hero"><summary>Нет героя? Создать базового персонажа</summary><p>Начальный лист с обычными настройками редактора. Мастер проверит его перед игрой; способности и снаряжение настраиваются в кампании.</p><fieldset disabled={disabled||busy||!!draft.character}><label className="w6-field"><span>Имя героя</span><input aria-label="Имя базового героя" maxLength={80} value={draft.name} onChange={e=>remember({...draft,name:e.currentTarget.value})}/></label><label className="w6-field"><span>Энергия</span><select aria-label="Энергия базового героя" value={draft.energy} onChange={e=>remember({...draft,energy:e.currentTarget.value as Draft['energy']})}><option value="mana">Мана</option><option value="shadow">Тень</option></select></label></fieldset><button type="button" className="w6-button" disabled={disabled||busy||!draft.name.trim()} onClick={()=>void create()}>{draft.character?'Повторить создание героя':'Создать базового героя'}</button><p role="status">{message}</p></details>
}
