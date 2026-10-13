import {useEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {useRemote} from './onlineHooks'
import {hasLobbyPermission} from './lobbyAccess'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import {newAtlasEntry,isAtlasEntry} from './campaignAtlas'
import {NetworkError} from './onlineClient'
import type {AtlasCity,AtlasOrganization,CampaignAtlas,PublicAtlas,PublicAtlasEntry} from './campaignAtlas'
import type {Lobby} from './onlineTypes'
type Kind='city'|'organization'
type Entry=AtlasCity|AtlasOrganization
type MasterView={revision:number;closed:boolean;atlas:CampaignAtlas;options:{npcs:{id:string;name:string}[];scenes:{id:string;name:string}[]}}
type Draft={entry:Entry;revision:number;reason:string;command:{path:string;body:string}|null}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
function validDraft(v:unknown,kind:Kind):v is Draft{
 if(!object(v)||!object(v.entry)||!Number.isSafeInteger(v.revision)||typeof v.reason!=='string'||v.reason.length>2000||typeof v.entry.name!=='string'||typeof v.entry.kind!=='string'||!Array.isArray(v.entry.npcLinks)||
  !v.entry.npcLinks.every(n=>object(n)&&typeof n.actorId==='string'&&/^[a-zA-Z0-9:_-]{0,160}$/.test(n.actorId)&&typeof n.publicName==='string'))return false
 // Drafts keep empty names, duplicate/unselected NPCs and unfinished public aliases.
 const shaped={...v.entry,name:v.entry.name.trim()?v.entry.name:'Черновик',kind:v.entry.kind.trim()?v.entry.kind:'Тип',npcLinks:v.entry.npcLinks.map((n,i)=>({...n,actorId:'draft-npc-'+i,publicName:n.publicName.trim()?n.publicName:'Черновик'}))}
 return isAtlasEntry(shaped,kind)&&(v.command===null||object(v.command)&&typeof v.command.path==='string'&&typeof v.command.body==='string'&&v.command.body.length<3000000)
}
function AtlasCard({entry}:{entry:PublicAtlasEntry}){
 return <article className="gb-journal-entry"><h4>{entry.name}</h4><p>{entry.kind}</p>{entry.summary&&<p>{entry.summary}</p>}{entry.description&&<p className="w6-copy">{entry.description}</p>}
  {entry.population&&<p>Население: {entry.population}</p>}{entry.cities?.map(c=><p key={c.id}>Город: {c.name}</p>)}{entry.organizations?.map(o=><p key={o.id}>Организация: {o.name}</p>)}
  {entry.npcLinks.map((n,i)=><p key={i}>{n.publicName}{n.role?' · '+n.role:''}</p>)}
 </article>
}
function AtlasEditor({accountId,lobbyId,kind,initial,creating,view,checkingAccess,onDone}:{accountId:string;lobbyId:string;kind:Kind;initial:Entry;creating:boolean;view:MasterView;checkingAccess:boolean;onDone:(message:string)=>void}){
 const {request,refresh}=useOnline(),plural=kind==='city'?'cities':'organizations',key=lobbyFormKey('atlas-entry',accountId,lobbyId,plural+':'+(creating?'new':initial.id))
 const [draft,setDraft]=useState<Draft>(()=>{
  const saved=readLobbyForm(key,(v):v is Draft=>validDraft(v,kind)),next=saved??{entry:initial,revision:view.revision,reason:'',command:null}
  if(!creating&&next.entry.id!==initial.id)return {entry:initial,revision:view.revision,reason:'',command:null}
  const expected='/lobbies/'+lobbyId+'/atlas/'+plural+(creating?'':'/'+initial.id)
  try{const body=next.command&&JSON.parse(next.command.body);if(next.command&&(next.command.path!==expected||body?.entry?.id!==next.entry.id||typeof body?.commandKey!=='string'||!/^atlas:[a-zA-Z0-9_-]{8,140}$/.test(body.commandKey)))return {...next,command:null}}catch{return {...next,command:null}}
  return next
 })
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[warning,setWarning]=useState(''),active=useRef(false),pending=useRef<AbortController|null>(null),inFlight=useRef(false)
 useEffect(()=>{active.current=true;return()=>{active.current=false;pending.current?.abort()}},[])
 useEffect(()=>()=>pending.current?.abort(),[request])
 const entry=draft.entry,current=(kind==='city'?view.atlas.cities:view.atlas.organizations).find(r=>r.id===initial.id),stale=draft.revision!==view.revision,disabled=busy||checkingAccess||!!draft.command
 const references=entry.npcLinks.every(n=>view.options.npcs.some(a=>a.id===n.actorId))&&entry.sceneIds.every(id=>view.options.scenes.some(s=>s.id===id))&&(!('cityIds' in entry)||entry.cityIds.every(id=>view.atlas.cities.some(c=>c.id===id)))
 function remember(next:Draft){setDraft(next);setWarning(writeLobbyForm(key,next)?'':'Черновик не сохранён на устройстве. Не закрывай страницу.')}
 function change(next:Entry){remember({...draft,entry:next});setMessage('')}
 async function save(){
  if(checkingAccess||busy||inFlight.current||(!draft.command&&(stale||!references||!isAtlasEntry(entry,kind)||!draft.reason.trim()||!creating&&!current)))return
  const command=draft.command??{path:'/lobbies/'+lobbyId+'/atlas/'+plural+(creating?'':'/'+initial.id),body:JSON.stringify({revision:draft.revision,entry,reason:draft.reason,commandKey:'atlas:'+crypto.randomUUID()})}
  if(!writeLobbyForm(key,{...draft,command})){setMessage('Не удалось сохранить команду повтора. Освободи место на устройстве перед записью.');return}
  setDraft({...draft,command});setBusy(true);inFlight.current=true;const abort=new AbortController();pending.current=abort
  try{const result=await request<{receipt:{id:string;revision:number};duplicate:boolean}>(command.path,{method:'POST',signal:abort.signal,body:command.body})
   if(!active.current||abort.signal.aborted)return
   writeLobbyForm(key,null);refresh();onDone(result.duplicate?'Получено подтверждение прежней команды без повторной записи. Кампания могла измениться позже; проверь текущий справочник.':'Карточка сохранена. Обновляем справочник.')
  }catch(e){if(active.current&&!abort.signal.aborted){const rejected=e instanceof NetworkError&&[400,404,409,413].includes(e.status)
   if(rejected)remember({...draft,command:null});setMessage((e as Error).message+(rejected?' Черновик сохранён.':' Команда сохранена для проверки повтором.'))
  }}finally{if(active.current&&pending.current===abort){setBusy(false);inFlight.current=false}}
 }
 const title=kind==='city'?'города':'организации'
 const setNpc=(index:number,patch:Partial<Entry['npcLinks'][number]>)=>change({...entry,npcLinks:entry.npcLinks.map((n,i)=>i===index?{...n,...patch}:n)})
 return <section aria-label="Редактор города или организации"><fieldset disabled={disabled}><legend>{creating?'Новая карточка':'Карточка'} {title}</legend>
  {(['name','kind','summary','description','secret'] as const).map(field=><label className="w6-field" key={field}><span>{{name:'Название',kind:'Тип',summary:'Краткое описание',description:'Описание для участников',secret:'Секретные заметки мастера'}[field]}</span>
   {field==='name'||field==='kind'?<input aria-label={'Карточка '+field} maxLength={120} value={entry[field]} onChange={e=>change({...entry,[field]:e.currentTarget.value})}/>:<textarea aria-label={'Карточка '+field} maxLength={field==='summary'?2000:field==='description'?8000:12000} value={entry[field]} onChange={e=>change({...entry,[field]:e.currentTarget.value})}/>}</label>)}
  {'population' in entry&&<label className="w6-field"><span>Население (сведения мастера)</span><input aria-label="Население города" maxLength={120} value={entry.population} onChange={e=>change({...entry,population:e.currentTarget.value})}/></label>}
  <label className="w6-check"><input aria-label="Открыть карточку участникам" type="checkbox" checked={entry.visible} onChange={e=>change({...entry,visible:e.currentTarget.checked})}/>Открыть карточку всем участникам этого лобби</label>
  <label className="w6-check"><input aria-label="Архив карточки" type="checkbox" checked={entry.archived} onChange={e=>change({...entry,archived:e.currentTarget.checked})}/>В архиве: скрыть из общего справочника, сохранив заметки и связи</label>
  <p>Секретные заметки всегда доступны только уполномоченным мастерам. Карточка не открывает карту, листы NPC или знания героя. Население задаётся вручную и ничего не рассчитывает.</p>
  {'cityIds' in entry&&<fieldset><legend>Города организации · до 50</legend>{view.atlas.cities.map(c=><label className="w6-check" key={c.id}><input aria-label={'Город организации '+c.name} type="checkbox" checked={entry.cityIds.includes(c.id)} onChange={e=>change({...entry,cityIds:e.currentTarget.checked?[...entry.cityIds,c.id]:entry.cityIds.filter(id=>id!==c.id)})}/>{c.name}{c.archived?' · архив':''}</label>)}</fieldset>}
  <fieldset><legend>Связанные сцены · только мастеру, до 50</legend>{view.options.scenes.map(s=><label className="w6-check" key={s.id}><input aria-label={'Сцена карточки '+s.name} type="checkbox" checked={entry.sceneIds.includes(s.id)} onChange={e=>change({...entry,sceneIds:e.currentTarget.checked?[...entry.sceneIds,s.id]:entry.sceneIds.filter(id=>id!==s.id)})}/>{s.name}</label>)}
   {entry.sceneIds.filter(id=>!view.options.scenes.some(s=>s.id===id)).map(id=><p key={id}>Прежняя сцена недоступна. <button className="w6-button" onClick={()=>change({...entry,sceneIds:entry.sceneIds.filter(s=>s!==id)})}>Убрать недоступную сцену</button></p>)}
  </fieldset>
  <fieldset><legend>Связи с NPC · до 50</legend>{entry.npcLinks.map((n,index)=><div className="gb-journal-entry" key={index}>
   <label className="w6-field"><span>NPC</span><select aria-label={'NPC связи '+(index+1)} value={n.actorId} onChange={e=>setNpc(index,{actorId:e.currentTarget.value})}><option value="">Выбери NPC</option>{view.options.npcs.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label className="w6-field"><span>Роль или должность</span><input aria-label={'Роль NPC '+(index+1)} maxLength={120} value={n.role} onChange={e=>setNpc(index,{role:e.currentTarget.value})}/></label>
   <label className="w6-check"><input aria-label={'Открыть связь NPC '+(index+1)} type="checkbox" checked={n.visible} onChange={e=>setNpc(index,{visible:e.currentTarget.checked})}/>Показывать связь в открытой карточке</label>
   <label className="w6-field"><span>Имя или обозначение для участников</span><input aria-label={'Публичное имя NPC '+(index+1)} maxLength={120} value={n.publicName} onChange={e=>setNpc(index,{publicName:e.currentTarget.value})}/></label>
   <button className="w6-button" onClick={()=>change({...entry,npcLinks:entry.npcLinks.filter((_,i)=>i!==index)})}>Убрать связь NPC {index+1}</button>
  </div>)}<button className="w6-button" disabled={entry.npcLinks.length>=50} onClick={()=>change({...entry,npcLinks:[...entry.npcLinks,{actorId:'',role:'',publicName:'',visible:false}]})}>Добавить связь с NPC</button>
   <p>Имя NPC и связь не раскрываются автоматически. Для открытой связи укажи обозначение для участников. Настоящий лист и позиция NPC остаются закрытыми.</p>
  </fieldset>
  <label className="w6-field"><span>Причина записи</span><textarea aria-label="Причина записи карточки" maxLength={2000} value={draft.reason} onChange={e=>remember({...draft,reason:e.currentTarget.value})}/></label>
  {!references&&<p role="alert">Есть недоступные связи. Выбери существующие записи или явно убери прежнюю связь.</p>}
  {stale&&<><p role="alert">Кампания изменилась. Сверь карточку и связи; черновик сохранён.</p>
   {current&&<details><summary>Текущая карточка для сверки</summary><p>{current.name} · {current.kind}</p><p>{current.summary}</p><p>{current.description}</p><p>Секретные заметки: {current.secret}</p><p>{current.archived?'В архиве':current.visible?'Открыта участникам':'Скрыта'} · связей NPC: {current.npcLinks.length} · сцен: {current.sceneIds.length}</p></details>}
   <button className="w6-button" disabled={!creating&&!current} onClick={()=>remember({...draft,revision:view.revision})}>Карточка и связи сверены</button>
  </>}
  <button className="w6-button" disabled={stale||!references||!isAtlasEntry(entry,kind)||!draft.reason.trim()||!creating&&!current} onClick={()=>void save()}>Сохранить карточку {title}</button>
 </fieldset>{draft.command&&!checkingAccess&&<><p role="alert">Результат ещё не подтверждён. Повтор проверит прежнюю команду.</p><button className="w6-button" disabled={busy} onClick={()=>void save()}>Проверить результат команды справочника</button></>}
 {warning&&<p role="alert">{warning}</p>}<p role="status">{checkingAccess?'':message}</p></section>
}
function MasterAtlas({accountId,lobbyId,checkingAccess}:{accountId:string;lobbyId:string;checkingAccess:boolean}){
 const [opened,setOpened]=useState(false),remote=useRemote<MasterView>(opened?'/lobbies/'+lobbyId+'/atlas?view=master':null),[selected,setSelected]=useState<{kind:Kind;entry:Entry;creating:boolean}|null>(null),[message,setMessage]=useState('')
 const view=!checkingAccess&&!remote.loading&&!remote.error?remote.value:null
 return <section><button className="w6-button" disabled={checkingAccess} onClick={()=>setOpened(!opened)}>{opened?'Свернуть редактор справочника':'Редактировать города и организации'}</button>
  {opened&&<><p role="status">{checkingAccess?'':remote.loading?'Проверяем справочник и права…':remote.error}</p>{view&&<>
   <div className="w6-buttons">{(['city','organization'] as const).map(kind=><button className="w6-button" key={kind} disabled={view.closed} onClick={()=>setSelected({kind,creating:true,entry:newAtlasEntry(kind,crypto.randomUUID())})}>{kind==='city'?'Подготовить город':'Подготовить организацию'}</button>)}</div>
   {([...view.atlas.cities.map(entry=>({kind:'city' as const,entry})),...view.atlas.organizations.map(entry=>({kind:'organization' as const,entry}))]).map(({kind,entry})=><article className="gb-journal-entry" key={entry.id}><h4>{entry.name}</h4><p>{entry.kind} · {entry.archived?'архив':entry.visible?'открыта участникам':'скрыта'}</p><button className="w6-button" disabled={view.closed} onClick={()=>setSelected({kind,entry,creating:false})}>Редактировать карточку {entry.name}</button></article>)}
   {selected&&<AtlasEditor key={JSON.stringify([accountId,lobbyId,selected.kind,selected.creating?'new':selected.entry.id])} accountId={accountId} lobbyId={lobbyId} kind={selected.kind} initial={selected.entry} creating={selected.creating} view={view} checkingAccess={checkingAccess||view.closed} onDone={message=>{setSelected(null);setMessage(message)}}/>}
  </>}{!checkingAccess&&<p role="status">{message}</p>}</>}
 </section>
}
export default function LobbyAtlas({accountId,lobby,checkingAccess}:{accountId:string;lobby:Lobby;checkingAccess:boolean}){
 const [opened,setOpened]=useState(false),remote=useRemote<{revision:number;atlas:PublicAtlas}>(opened?'/lobbies/'+lobby.id+'/atlas?view=public':null),canManage=hasLobbyPermission(lobby.myRole,lobby.myPermissions,'economy')&&hasLobbyPermission(lobby.myRole,lobby.myPermissions,'viewSecrets')
 const atlas=!checkingAccess&&!remote.loading&&!remote.error?remote.value?.atlas:null
 return <section className="w6-fieldset"><h3>Города и организации</h3><button className="w6-button" disabled={checkingAccess} onClick={()=>setOpened(!opened)}>{opened?'Свернуть города и организации':'Открыть города и организации'}</button>
  {opened&&<><p role="status">{checkingAccess?'':remote.loading?'Загружаем открытые сведения…':remote.error}</p>{atlas&&<>
   {!atlas.cities.length&&!atlas.organizations.length&&<p>Мастер пока не открыл карточки городов или организаций.</p>}
   {!!atlas.cities.length&&<><h4>Города</h4>{atlas.cities.map(entry=><AtlasCard key={entry.id} entry={entry}/>)}</>}
   {!!atlas.organizations.length&&<><h4>Организации</h4>{atlas.organizations.map(entry=><AtlasCard key={entry.id} entry={entry}/>)}</>}
  </>}{canManage&&<MasterAtlas key={JSON.stringify([accountId,lobby.id])} accountId={accountId} lobbyId={lobby.id} checkingAccess={checkingAccess}/>}</>}
 </section>
}
