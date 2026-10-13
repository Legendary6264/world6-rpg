import {useEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {NetworkError} from './onlineClient'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import {NIGHT_CROSSING} from './starterCampaignInfo'
import {STARTER_CREATE_PATH,isStarterDraft,starterReady} from './starterCampaignDraft'
import type {StarterDraft} from './starterCampaignDraft'
import {artworkLabels,visualArtwork} from './visualMedia'
import type {ArtworkKey} from './visualMedia'
const samples:ArtworkKey[]=['pixel-guide','pixel-keeper','pixel-watcher','pixel-staff','pixel-lantern','pixel-ration','pixel-focus']
export default function LobbyStarterCampaign({accountId,disabled,onCreated}:{accountId:string;disabled:boolean;onCreated:(id:string)=>void}){
 const {request,refresh}=useOnline(),key=lobbyFormKey('starter-create',accountId,'new')
 const [draft,setDraft]=useState<StarterDraft>(()=>readLobbyForm(key,isStarterDraft)??{title:NIGHT_CROSSING.title,slots:'4',accepted:false,command:null})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[warning,setWarning]=useState('')
 const active=useRef(false),sending=useRef(false),abortRef=useRef<AbortController|null>(null)
 useEffect(()=>{active.current=true;return()=>{active.current=false;abortRef.current?.abort()}},[])
 useEffect(()=>()=>abortRef.current?.abort(),[request])
 function remember(d:StarterDraft){setDraft(d);setWarning(writeLobbyForm(key,d)?'':'Черновик не сохранён на устройстве. Не закрывай страницу.')}
 function change(patch:Partial<StarterDraft>){remember({...draft,...patch});setMessage('')}
 async function create(){
  if(disabled||sending.current||!draft.command&&!starterReady(draft))return
  const command=draft.command??{path:STARTER_CREATE_PATH,body:JSON.stringify({exampleId:NIGHT_CROSSING.id,version:NIGHT_CROSSING.version,title:draft.title,slots:Number(draft.slots),commandKey:'starter:'+crypto.randomUUID()})}
  if(!writeLobbyForm(key,{...draft,command})){setWarning('Не удалось сохранить команду повтора. Освободи место перед созданием лобби.');return}
  setDraft({...draft,command});sending.current=true;setBusy(true);const abort=new AbortController();abortRef.current=abort
  try{
   const result=await request<{id:string;duplicate:boolean}>(command.path,{method:'POST',body:command.body,signal:abort.signal})
   if(!active.current||abort.signal.aborted)return
   remember({...draft,command:null,accepted:false});setMessage(result.duplicate?'Прежнее создание подтверждено. Открыто то же лобби.':'Отдельное закрытое лобби создано. Пригласи друзей и утверди их героев.');refresh();onCreated(result.id)
  }catch(e){if(active.current&&!abort.signal.aborted){const rejected=e instanceof NetworkError&&[400,403,404,409,413,429].includes(e.status);if(rejected)remember({...draft,command:null});setMessage((e as Error).message+(rejected?' Черновик сохранён.':' Команда сохранена: проверь создание повтором.'))}}
  finally{if(active.current&&abortRef.current===abort){sending.current=false;setBusy(false)}}
 }
 return <details className="w6-fieldset gb-starter"><summary>Начать с примера · {NIGHT_CROSSING.title}</summary>
  <p>{NIGHT_CROSSING.description}</p><ul>{NIGHT_CROSSING.contents.map(s=><li key={s}>{s}</li>)}</ul>
  <div className="gb-starter-assets">{samples.map(k=><figure key={k}><img src={visualArtwork[k]} alt="" loading="lazy"/><figcaption>{artworkLabels[k]}</figcaption></figure>)}</div>
  <p>Это новый редактируемый пример по доступным деталям обучения. Он не добавляет факты в канон. Мастер открывает сцены, раскрывает информацию каждому герою и подтверждает результаты. Правила учёта изначально отключены.</p>
  <p>Создаётся отдельное закрытое лобби: Мана, смертный ранг, раунд сцены 5 с. Подготовка «Сосредоточения» — 8 с, стоимость — 1 Мана. Это числа примера. Остальные параметры и историю можно изменить в редакторах. NPC управляет мастер; герои друзей добавляются и утверждаются обычным способом.</p>
  <fieldset disabled={disabled||busy||!!draft.command} className="w6-form">
   <label className="w6-field"><span>Название лобби из примера</span><input aria-label="Название лобби из примера" maxLength={120} value={draft.title} onChange={e=>change({title:e.currentTarget.value})}/></label>
   <label className="w6-field"><span>Мест для друзей в примере</span><input aria-label="Мест для друзей в примере" type="number" min={1} max={12} value={draft.slots} onChange={e=>change({slots:e.currentTarget.value})}/></label>
   <label><input type="checkbox" checked={draft.accepted} onChange={e=>change({accepted:e.currentTarget.checked})}/> Создать отдельную кампанию из этого редактируемого примера</label>
   <button className="w6-button w6-primary" disabled={!starterReady(draft)} onClick={()=>void create()}>Создать лобби из примера</button>
  </fieldset>
  {draft.command&&<><p role="alert">Результат создания ещё не подтверждён. Повтор откроет ту же копию.</p><button className="w6-button" disabled={disabled||busy} onClick={()=>void create()}>Проверить создание лобби</button></>}
  {warning&&<p role="alert">{warning}</p>}<p role="status">{message}</p>
 </details>
}
