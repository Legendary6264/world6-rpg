import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {useRemote} from './onlineHooks'
import {NetworkError} from './onlineClient'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
type Summary={fromSeconds:number;toSeconds:number;characters:{id:string;name:string;fields?:string[]}[];resources?:{actorId:string;name:string;label:string;from:{current:string;maximum:string}|null;to:{current:string;maximum:string}}[];sections?:string[];rounds:number;changes:number;activeRounds:number;compactedCollections?:number;checkpoints:string[];paused:boolean;fromPaused:boolean;oldRounds:number;oldCheckpoints:number}
type Preview={id:string;revision:number;generation:number;summary:Summary}
type Command={previewId:string;generation:number;commandKey:string;reason:string}
type Draft={reason:string;command:Command|null}
type Recovery={id:string;at:string;revision:number;reason:string}
type Download={filename:string;data:string;bytes:number;sha256:string}
const valid=(v:unknown):v is Draft=>!!v&&typeof v==='object'&&(()=>{const d=v as Draft,c=d.command;return typeof d.reason==='string'&&d.reason.length<=1000&&(c===null||!!c&&typeof c.previewId==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(c.previewId)&&Number.isInteger(c.generation)&&c.generation>0&&typeof c.commandKey==='string'&&/^[a-zA-Z0-9_-]{8,160}$/.test(c.commandKey)&&typeof c.reason==='string'&&c.reason.length<=1000)})()
async function saveDownload(v:Download,signal:AbortSignal){
 const bytes=Uint8Array.from(atob(v.data),c=>c.charCodeAt(0));if(bytes.length!==v.bytes)throw Error('Файл загружен не полностью.')
 if(!crypto.subtle)throw Error('Для проверки файла открой сайт через HTTPS или localhost.')
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==v.sha256)throw Error('Контрольная сумма файла не совпала.')
 if(signal.aborted)return
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/gzip'})),link=document.createElement('a');link.href=url;link.download='grani-bytiya-complete.w6.gz';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export default function LobbyCompleteBackup({accountId,lobbyId,revision,checkingAccess,allowRestore}:{accountId:string;lobbyId:string;revision?:number;checkingAccess:boolean;allowRestore:boolean}){
 const {request,refresh}=useOnline(),path='/lobbies/'+lobbyId+'/archive',key=lobbyFormKey('complete-backup',accountId,lobbyId),source=JSON.stringify([revision,allowRestore,checkingAccess]),current=useRef(source)
 const [opened,setOpened]=useState(false),recoveries=useRemote<Recovery[]>(opened?path+'/recoveries':null),[draft,setDraft]=useState<Draft>(()=>readLobbyForm(key,valid)??{reason:'',command:null})
 const [preview,setPreview]=useState<{source:string;value:Preview}|null>(null),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState(''),[warning,setWarning]=useState(''),active=useRef(false),pending=useRef<AbortController|null>(null),sequence=useRef(0),inFlight=useRef(false)
 useLayoutEffect(()=>{current.current=source},[source]);useEffect(()=>{active.current=true;return()=>{active.current=false;pending.current?.abort()}},[])
 useEffect(()=>{++sequence.current;pending.current?.abort();inFlight.current=false},[source,request])
 const disabled=checkingAccess||busy===source,visible=!checkingAccess&&allowRestore&&preview?.source===source?preview.value:null
 function remember(next:Draft){setDraft(next);const saved=writeLobbyForm(key,next);setWarning(saved?'':'Команда не сохранена на устройстве. Не закрывай страницу.');return saved}
 async function act(fn:(signal:AbortSignal)=>Promise<void>){
  if(disabled||inFlight.current)return;inFlight.current=true;const origin=source,attempt=++sequence.current,abort=new AbortController();pending.current=abort;setBusy(origin);setMessage('')
  try{await fn(abort.signal)}catch(e){if(active.current&&!abort.signal.aborted&&attempt===sequence.current&&origin===current.current)setMessage((e as Error).message)}finally{if(active.current&&pending.current===abort){setBusy(null);inFlight.current=false}}
 }
 async function download(signal:AbortSignal,recoveryId?:string){const result=await request<Download>(path+(recoveryId?'/recoveries/'+recoveryId:''),{signal});if(!active.current||signal.aborted)return;await saveDownload(result,signal);if(active.current&&!signal.aborted)setMessage('Полная игровая копия скачана; контрольная сумма проверена.')}
 async function upload(file?:File){
  if(!file||disabled||draft.command||!allowRestore||revision===undefined)return
  setPreview(null);setReviewed(false);if(file.size>32*1024*1024){setMessage('Полная копия превышает 32 МиБ.');return}
  const origin=source;await act(async signal=>{const value=await request<Preview>(path+'/calculate?revision='+revision,{method:'POST',headers:{'Content-Type':'application/gzip'},body:file,signal});if(!active.current||signal.aborted||origin!==current.current)return;if(value.revision!==revision)throw Error('Версия предпросмотра не совпала.');setPreview({source:origin,value});setMessage('Копия проверена. Сверь мир, историю и паузу перед восстановлением.')})
 }
 async function apply(signal:AbortSignal){
  if(!allowRestore)return;let command=draft.command
  if(!command){if(!visible||!reviewed||!draft.reason.trim())return;command={previewId:visible.id,generation:visible.generation,commandKey:crypto.randomUUID(),reason:draft.reason};if(!remember({...draft,command}))return}
  try{const result=await request<{duplicate:boolean}>(path+'/apply',{method:'POST',signal,body:JSON.stringify(command)});if(!active.current||signal.aborted)return;remember({...draft,command:null});setPreview(null);setReviewed(false);setMessage(result.duplicate?'Получено подтверждение прежнего восстановления.':'Полная копия восстановлена. Владельцы и права сохранены; прежнее состояние доступно в защитной копии.');refresh()}
  catch(e){if(active.current&&!signal.aborted&&e instanceof NetworkError&&[400,409,413].includes(e.status)){remember({...draft,command:null});setPreview(null);setReviewed(false)}throw e}
 }
 return <section className="w6-fieldset" aria-label="Полная игровая копия"><h3>Полная игровая копия</h3>
  {!opened?<button className="w6-button" disabled={checkingAccess} onClick={()=>setOpened(true)}>Открыть полные копии</button>:checkingAccess?<p>Проверяем доступ к копиям…</p>:<>
   <p>Сжатый файл включает мир, исходные снимки, прежние броски, историю раундов, действующую ветку, контрольные точки и паузу.</p>
   <button className="w6-button" disabled={disabled} onClick={()=>void act(signal=>download(signal))}>Скачать полную игровую копию</button>
   {allowRestore&&<><p>Восстановление заменит мир и игровую историю. Состав героев должен совпадать. Владельцы, допуски, полномочия и согласия сохранятся текущими. Перед применением сервер сохранит защитную копию прежнего состояния.</p>
    <label className="w6-field"><span>Файл полной копии до 32 МиБ</span><input aria-label="Файл полной игровой копии" type="file" accept=".gz,application/gzip" disabled={disabled||!!draft.command} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(file)}}/></label>
    <label className="w6-field"><span>Причина восстановления</span><textarea aria-label="Причина восстановления полной копии" maxLength={1000} value={draft.reason} disabled={disabled||!!draft.command} onChange={e=>{remember({...draft,reason:e.currentTarget.value});setReviewed(false)}}/></label>
    {visible&&<div aria-label="Предпросмотр полной копии"><p>Игровое время: {visible.summary.fromSeconds} → {visible.summary.toSeconds} с. Героев: {visible.summary.characters.length}.</p>{visible.summary.characters.filter(c=>c.fields?.length).map(c=><p key={c.id}>{c.name}: {c.fields?.join(', ')}.</p>)}{visible.summary.resources?.map(r=><p key={r.actorId+':'+r.label}>{r.name} · {r.label}: {r.from?r.from.current+' / '+r.from.maximum:'нет'} → {r.to.current} / {r.to.maximum}.</p>)}{!!visible.summary.sections?.length&&<p>Разделы мира: {visible.summary.sections.join(', ')}.</p>}<p>Квитанций раундов: {visible.summary.oldRounds} → {visible.summary.rounds}; действующих раундов после восстановления: {visible.summary.activeRounds}; операций истории: {visible.summary.changes}.</p><p>Исполненных сборов без полных снимков: {visible.summary.compactedCollections??0}.</p><p>Контрольных точек: {visible.summary.oldCheckpoints} → {visible.summary.checkpoints.length}. {visible.summary.checkpoints.join(', ')}</p><p>Пауза после восстановления: {visible.summary.paused?'включена':'выключена'}.</p>
     <label className="w6-check"><input aria-label="Последствия полной копии проверены" type="checkbox" disabled={disabled||!!draft.command} checked={reviewed} onChange={e=>setReviewed(e.currentTarget.checked)}/>Проверил замену мира, истории, точек и паузы</label><button className="w6-button" disabled={disabled||!!draft.command||!reviewed||!draft.reason.trim()} onClick={()=>void act(apply)}>Восстановить полную игровую копию</button>
    </div>}
    {preview&&!visible&&<p>Мир или доступ изменились. Загрузить и проверить файл нужно заново.</p>}
    {draft.command&&<><p role="status">Результат восстановления неизвестен. Команда сохранена.</p><button className="w6-button" disabled={disabled} onClick={()=>void act(apply)}>Проверить восстановление полной копии</button></>}
   </>}
   {recoveries.error&&<p role="alert">{recoveries.error}</p>}{recoveries.value?.length? <details><summary>Состояния перед восстановлением</summary>{recoveries.value.map(r=><p key={r.id}>{new Date(r.at).toLocaleString('ru-RU')} · {r.reason} <button className="w6-button" disabled={disabled} onClick={()=>void act(signal=>download(signal,r.id))}>Скачать состояние перед восстановлением {r.revision}</button></p>)}</details>:null}
  </>}{warning&&<p role="alert">{warning}</p>}<p role="status">{message}</p>
 </section>
}
