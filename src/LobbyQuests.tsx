import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {useRemote} from './onlineHooks'
import {NetworkError} from './onlineClient'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import {isQuestDraft,isQuestMasterView,isQuestAck,newQuest,questStatusLabels,MAX_QUESTS,MAX_QUEST_OBJECTIVES} from './questLog'
import type {Quest,QuestDraft,QuestCommand} from './questLog'
import './quests.css'

type Edited={quest:QuestDraft;version:number;generation:number}
type Draft={selected:string;drafts:Edited[];command?:QuestCommand}
const integer=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0
function editable(v:unknown):v is QuestDraft{
 if(!v||typeof v!=='object')return false
 const q=v as QuestDraft
 return typeof q.title==='string'&&typeof q.published==='boolean'&&Object.hasOwn(questStatusLabels,q.status)&&Array.isArray(q.objectives)&&q.objectives.every(o=>!!o&&typeof o.title==='string')&&isQuestDraft({...q,title:q.title.trim()||'Черновик',published:false,status:'active',objectives:q.objectives.map(o=>({...o,title:o.title.trim()||'Пункт'}))})
}
function valid(v:unknown):v is Draft{
 if(!v||typeof v!=='object')return false
 const d=v as Draft,c=d.command
 return typeof d.selected==='string'&&Array.isArray(d.drafts)&&d.drafts.length<=MAX_QUESTS&&d.drafts.every(e=>!!e&&integer(e.version)&&integer(e.generation)&&e.generation>0&&editable(e.quest))&&new Set(d.drafts.map(e=>e.quest.id)).size===d.drafts.length&&(!c||integer(c.generation)&&c.generation>0&&integer(c.baseVersion)&&isQuestDraft(c.quest)&&typeof c.commandKey==='string'&&/^quest:[a-zA-Z0-9_-]{8,140}$/.test(c.commandKey))
}
const fromSaved=(q:Quest):QuestDraft=>({id:q.id,title:q.title,description:q.description,notes:q.notes,status:q.status,published:q.published,audience:[...q.audience],objectives:q.objectives.map(o=>({...o})),sourceMessageId:q.sourceMessageId})
type Props={accountId:string;lobbyId:string;checkingAccess:boolean;active?:boolean}
export default function LobbyQuests(props:Props){return <QuestEditor key={JSON.stringify([props.accountId,props.lobbyId])} {...props}/>}
function QuestEditor({accountId,lobbyId,checkingAccess,active=true}:Props){
 const {request,refresh}=useOnline(),path='/lobbies/'+lobbyId+'/play/quests',key=lobbyFormKey('quest-master',accountId,lobbyId)
 const remote=useRemote<unknown>(checkingAccess||!active?null:path),value=!checkingAccess&&isQuestMasterView(remote.value)?remote.value:null
 const [draft,setDraft]=useState<Draft>(()=>readLobbyForm(key,valid)??{selected:'',drafts:[]}),[notice,setNotice]=useState(''),[warning,setWarning]=useState(''),[busySource,setBusySource]=useState<{request:typeof request}|null>(null)
 const pending=useRef<AbortController|null>(null),mounted=useRef(false),latest=useRef({request,key,draft,checkingAccess,loading:remote.loading,value,active})
 useLayoutEffect(()=>{latest.current={request,key,draft,checkingAccess,loading:remote.loading,value,active}})
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort()}},[])
 useEffect(()=>()=>{pending.current?.abort();pending.current=null},[request,key])
 const busy=busySource?.request===request,locked=checkingAccess||remote.loading||busy||!!draft.command||!!value?.closed||!active
 const ids=[...new Set([...(value?.quests.map(q=>q.id)??[]),...draft.drafts.map(e=>e.quest.id)])],selectedId=ids.includes(draft.selected)?draft.selected:ids[0]
 const local=draft.drafts.find(e=>e.quest.id===selectedId),saved=value?.quests.find(q=>q.id===selectedId),quest=local?.quest??(saved?fromSaved(saved):null)
 const stale=!!local&&!!value&&(local.version!==value.version||local.generation!==value.generation)
 function remember(next:Draft){setDraft(next);const ok=writeLobbyForm(key,next);setWarning(ok?'':'Черновик доступен только в памяти. Не закрывай страницу.');return ok}
 function edit(patch:Partial<QuestDraft>){if(!quest||!value||locked)return;const changed={quest:{...quest,...patch},version:local?.version??value.version,generation:local?.generation??value.generation};remember({...draft,drafts:[...draft.drafts.filter(e=>e.quest.id!==quest.id),changed]});setNotice('')}
 function create(){if(!value||locked||ids.length>=MAX_QUESTS)return;const q=newQuest(crypto.randomUUID());remember({...draft,selected:q.id,drafts:[...draft.drafts,{quest:q,version:value.version,generation:value.generation}]})}
 async function save(){
  const l=latest.current
  if(!mounted.current||pending.current||l.request!==request||l.key!==key||l.draft!==draft||l.checkingAccess||l.loading||l.value!==value||!l.active||!value)return
  if(!draft.command&&(locked||stale||!quest||!isQuestDraft(quest)))return
  const command=draft.command??{generation:value.generation,baseVersion:value.version,quest:quest!,commandKey:'quest:'+crypto.randomUUID()}
  if(!remember({...draft,command})){writeLobbyForm(key,draft);setDraft(draft);setNotice('Сохранение не отправлено: освободи место на устройстве для безопасного повтора.');return}
  const abort=new AbortController();pending.current=abort;setBusySource({request});setNotice('')
  try{
   const reply=await request<unknown>(path,{method:'POST',body:JSON.stringify(command),signal:abort.signal})
   if(!mounted.current||abort.signal.aborted||pending.current!==abort||latest.current.request!==request)return
   if(!isQuestAck(reply,command))throw Error('Сервер не подтвердил задание. Повтори ту же команду.')
   remember({...draft,command:undefined,drafts:draft.drafts.filter(e=>e.quest.id!==command.quest.id)});setNotice(command.quest.published?'Задание сохранено у выбранных героев.':'Закрытый черновик сохранён.');refresh()
  }catch(error){if(mounted.current&&!abort.signal.aborted&&latest.current.request===request){if(error instanceof NetworkError&&[400,409,413].includes(error.status))remember({...draft,command:undefined});setNotice((error as Error).message);refresh()}}
  finally{if(pending.current===abort){pending.current=null;if(mounted.current)setBusySource(null)}}
 }
 return <section className="gb-quests" aria-label="Задания приключения"><h4>Задания приключения</h4><p className="w6-copy">Сначала подготовь задание, затем выбери героев и сохрани с включённой видимостью. Секретные заметки остаются у ведущих; награды и последствия оформляются обычными действиями мастера.</p>
  {remote.loading&&<p role="status">Обновляем задания…</p>}{remote.error&&<p role="alert">{remote.error}</p>}{remote.value!==null&&!value&&!checkingAccess&&<p role="alert">Не удалось проверить журнал заданий.</p>}
  {value&&<><div className="gb-quest-layout"><nav className="gb-quest-list" aria-label="Список заданий мастера">{ids.map(id=>{const q=draft.drafts.find(e=>e.quest.id===id)?.quest??value.quests.find(q=>q.id===id);return <button type="button" className="w6-button" key={id} disabled={busy||!!draft.command} aria-pressed={id===selectedId} onClick={()=>remember({...draft,selected:id})}>{q?.title||'Новое задание'}<small>{q?.published?questStatusLabels[q.status]:'Закрытый черновик'}{draft.drafts.some(e=>e.quest.id===id)?' · изменено':''}</small></button>})}<button type="button" className="w6-button" disabled={locked||ids.length>=MAX_QUESTS} onClick={create}>Новое задание</button></nav>
   {quest?<div><form onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={locked} className="gb-quest-fields"><legend>{quest.title||'Новое задание'}</legend>
    <label className="w6-field"><span>Название</span><input aria-label="Название задания" value={quest.title} maxLength={160} onChange={e=>edit({title:e.currentTarget.value})}/></label>
    <label className="w6-field"><span>Что узнают герои</span><textarea aria-label="Описание задания" rows={3} maxLength={4000} value={quest.description} onChange={e=>edit({description:e.currentTarget.value})}/></label>
    <label className="w6-field"><span>Связанный разговор</span><select aria-label="Источник задания" value={quest.sourceMessageId} onChange={e=>edit({sourceMessageId:e.currentTarget.value})}><option value="">Без связанной реплики</option>{quest.sourceMessageId&&!value.sources.some(s=>s.id===quest.sourceMessageId)&&<option value={quest.sourceMessageId}>Связанная реплика недоступна</option>}{value.sources.map(s=><option key={s.id} value={s.id}>{s.speaker}: {s.body.slice(0,70)}</option>)}</select></label>
    <label className="w6-field"><span>Состояние</span><select aria-label="Состояние задания" value={quest.status} onChange={e=>edit({status:e.currentTarget.value as QuestDraft['status']})}>{Object.entries(questStatusLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <fieldset><legend>Пункты задания</legend>{quest.objectives.map((o,index)=><div className="gb-quest-objective" key={o.id}><label><input aria-label={'Выполнен пункт '+(index+1)} type="checkbox" checked={o.done} onChange={e=>edit({objectives:quest.objectives.map(item=>item.id===o.id?{...item,done:e.currentTarget.checked}:item)})}/> Выполнен</label><input aria-label={'Пункт задания '+(index+1)} maxLength={160} value={o.title} onChange={e=>edit({objectives:quest.objectives.map(item=>item.id===o.id?{...item,title:e.currentTarget.value}:item)})}/><button type="button" className="w6-button" onClick={()=>edit({objectives:quest.objectives.filter(item=>item.id!==o.id)})}>Убрать пункт {index+1}</button></div>)}<button type="button" className="w6-button" disabled={quest.objectives.length>=MAX_QUEST_OBJECTIVES} onClick={()=>edit({objectives:[...quest.objectives,{id:crypto.randomUUID(),title:'',done:false}]})}>Добавить пункт</button></fieldset>
    {quest.status==='completed'&&quest.objectives.some(o=>!o.done)&&<p role="status">Для завершения отметь выполненные пункты или уточни их список.</p>}
    <fieldset><legend>Кому выдать</legend><div className="gb-quest-audience">{value.heroes.map(h=><label key={h.id}><input type="checkbox" checked={quest.audience.includes(h.id)} onChange={e=>edit({audience:e.currentTarget.checked?[...quest.audience,h.id]:quest.audience.filter(id=>id!==h.id)})}/>{h.name}</label>)}</div>{quest.audience.some(id=>!value.heroes.some(h=>h.id===id))&&<><p role="alert">Среди получателей есть недоступные герои.</p><button type="button" className="w6-button" onClick={()=>edit({audience:quest.audience.filter(id=>value.heroes.some(h=>h.id===id))})}>Убрать недоступных получателей</button></>}<label><input aria-label="Выдать задание героям" type="checkbox" checked={quest.published} onChange={e=>edit({published:e.currentTarget.checked})}/> Видно выбранным героям после сохранения</label></fieldset>
    <details><summary>Секретные заметки мастера</summary><textarea aria-label="Секретные заметки задания" rows={4} maxLength={8000} value={quest.notes} onChange={e=>edit({notes:e.currentTarget.value})}/></details>
    <div className="w6-buttons"><button className="w6-button w6-primary" disabled={stale||!isQuestDraft(quest)}>{quest.published?'Выдать или обновить задание':'Сохранить закрытый черновик'}</button>{local&&<button type="button" className="w6-button" onClick={()=>remember({...draft,drafts:draft.drafts.filter(e=>e.quest.id!==quest.id)})}>{saved?'Отменить местные правки':'Убрать новый черновик'}</button>}</div>
   </fieldset></form>{stale&&<div className="gb-quest-conflict" role="alert"><p>Журнал изменился. Твой черновик сохранён.</p>{saved&&<details><summary>Сохранённое задание для сверки</summary><strong>{saved.title} · {questStatusLabels[saved.status]}</strong><p className="w6-prose">{saved.description}</p><p>{saved.published?'Выдано героям: '+saved.audience.map(id=>value.heroes.find(h=>h.id===id)?.name??'Недоступный герой').join(', '):'Закрытый черновик'}</p><p>Источник: {value.sources.find(s=>s.id===saved.sourceMessageId)?.speaker??'Не выбран или недоступен'}</p><p className="w6-prose">Заметки мастера: {saved.notes||'Нет заметок'}</p><ul>{saved.objectives.map(o=><li key={o.id}>{o.done?'✓':'○'} {o.title}</li>)}</ul></details>}<button type="button" className="w6-button" disabled={locked} onClick={()=>remember({...draft,drafts:draft.drafts.map(e=>e.quest.id===quest.id?{...e,version:value.version,generation:value.generation}:e)})}>Черновик сверен с текущим журналом</button></div>}</div>:<p>Создай задание и запиши, чего героям нужно добиться.</p>}
  </div>{value.closed&&<p>Игра завершена. Задания доступны для чтения.</p>}</>}
  {draft.command&&<button type="button" className="w6-button" disabled={busy||remote.loading||checkingAccess||!active} onClick={()=>void save()}>Проверить сохранение задания</button>}
  <p role="status">{notice}</p>{warning&&<p role="alert">{warning}</p>}
 </section>
}
