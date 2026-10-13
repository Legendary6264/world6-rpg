import {lazy,Suspense,useEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {useRemote} from './onlineHooks'
import {readLobbyDraft,writeLobbyDraft} from './lobbyDraftStorage'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import {createDefaultCharacter,isCharacterDraft,normalizeCharacterDraft} from './characterModel'
import {NetworkError} from './onlineClient'
import LobbyActionDeclarations from './LobbyActionDeclarations'
import type {Actor} from './rpgEngine'
import type {Campaign} from './rpgTypes'
import type {Lobby} from './onlineTypes'
const Workspace=lazy(()=>import('./CharacterWorkspace'))
type Npc={id:string;name:string;approved:boolean;controllerId:string}
type List={revision:number;closed:boolean;campaign:Campaign;npcs:Npc[]}
type Sheet={revision:number;actor:Actor;campaign:Campaign;approved:boolean;controllerId:string}
type Command={path:string;body:string}
const validCommand=(v:unknown):v is Command=>!!v&&typeof v==='object'&&typeof (v as Command).path==='string'&&typeof (v as Command).body==='string'&&(v as Command).body.length<3000000
function readCommand(key:string,path:string):Command|null{
 const command=readLobbyForm(key,validCommand)
 try{const body=command&&JSON.parse(command.body);return command?.path===path&&body&&Number.isSafeInteger(body.revision)&&typeof body.commandKey==='string'&&/^npc:[a-zA-Z0-9_-]{8,140}$/.test(body.commandKey)?command:null}catch{return null}
}
type Controls={approved:boolean;reason:string}
const validControls=(v:unknown):v is Controls=>!!v&&typeof v==='object'&&typeof (v as Controls).approved==='boolean'&&typeof (v as Controls).reason==='string'&&(v as Controls).reason.length<=2000
const freshActor=(energy:string):Actor=>{const a={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Новый NPC'};if(energy==='shadow')a.profile.energy='shadow';return a}
function NpcEditor({accountId,lobby,initial,creating,checkingAccess,onDone}:{accountId:string;lobby:Lobby;initial:Sheet;creating:boolean;checkingAccess:boolean;onDone:()=>void}){
 const {request,refresh}=useOnline(),namespace='npc:'+lobby.id+':'+(creating?'new':initial.actor.id),key=lobbyFormKey('npc-command',accountId,lobby.id,creating?'new':initial.actor.id)
 const path='/lobbies/'+lobby.id+'/npcs'+(creating?'':'/'+initial.actor.id+'/edit')
 const [draft,setDraft]=useState(()=>readLobbyDraft(accountId,namespace)??{accountId,lobbyId:namespace,revision:initial.revision,world:{characters:[initial.actor],campaign:initial.campaign}})
 const controlsKey=lobbyFormKey('npc-controls',accountId,lobby.id,creating?'new':initial.actor.id)
 const [controls,setControls]=useState(()=>readLobbyForm(controlsKey,validControls)??{approved:initial.approved,reason:''}),[command,setCommand]=useState(()=>readCommand(key,path))
 const {approved,reason}=controls
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[warning,setWarning]=useState(''),[comparison,setComparison]=useState<Sheet|null>(null)
 const active=useRef(false),pending=useRef<AbortController|null>(null),inFlight=useRef(false)
 useEffect(()=>{active.current=true;return()=>{active.current=false;pending.current?.abort()}},[])
 useEffect(()=>()=>pending.current?.abort(),[request])
 const actor=draft.world.characters[0],stale=draft.revision!==initial.revision,disabled=busy||checkingAccess||!!command
 function remember(next:typeof draft){setDraft(next);setWarning(writeLobbyDraft(next)?'':'Черновик не сохранён на устройстве. Не закрывай страницу.')}
 function change(next:Actor){remember({...draft,world:{characters:[next],campaign:draft.world.campaign}});setMessage('')}
 function changeControls(next:Controls){setControls(next);setWarning(writeLobbyForm(controlsKey,next)?'':'Решения NPC не сохранены на устройстве. Не закрывай страницу.')}
 async function compare(){
  if(disabled||creating)return
  const abort=new AbortController();pending.current=abort;setBusy(true)
  try{const current=await request<Sheet>('/lobbies/'+lobby.id+'/npcs/'+initial.actor.id,{signal:abort.signal});if(active.current&&!abort.signal.aborted)setComparison(current)}
  catch(e){if(active.current&&!abort.signal.aborted)setMessage((e as Error).message)}finally{if(active.current&&pending.current===abort)setBusy(false)}
 }
 async function save(){
  if(busy||checkingAccess||inFlight.current||(!command&&(stale||!isCharacterDraft(actor)||!creating&&!reason.trim())))return
  const attempt=command??{path,body:JSON.stringify({revision:draft.revision,character:actor,commandKey:'npc:'+crypto.randomUUID(),...(!creating?{approved,reason}: {})})}
  if(!writeLobbyForm(key,attempt)){setMessage('Не удалось сохранить команду. Освободи место на устройстве перед записью NPC.');return}
  setCommand(attempt);setBusy(true);inFlight.current=true;const abort=new AbortController();pending.current=abort
  try{
   const result=await request<{id:string;revision:number;duplicate:boolean}>(attempt.path,{method:'POST',signal:abort.signal,body:attempt.body})
   if(!active.current||abort.signal.aborted)return
   writeLobbyForm(key,null);setCommand(null)
   if(creating)writeLobbyDraft({accountId,lobbyId:namespace,revision:result.revision,world:{characters:[freshActor(lobby.energy)],campaign:initial.campaign}})
   else remember({...draft,revision:result.revision})
   writeLobbyForm(controlsKey,null)
   setMessage(result.duplicate?'Получено прежнее подтверждение без повторного изменения.':'NPC сохранён в кампании.');refresh();onDone()
  }catch(e){if(active.current&&!abort.signal.aborted){const rejected=e instanceof NetworkError&&[400,404,409,413].includes(e.status)
    if(rejected){writeLobbyForm(key,null);setCommand(null)}
    setMessage((e as Error).message+(rejected?' Черновик сохранён.':' Команда сохранена; повтор проверь тем же ключом.'))
  }}finally{if(active.current&&pending.current===abort){setBusy(false);inFlight.current=false}}
 }
 return <section aria-label="Редактор NPC"><p>Лист NPC меняется отдельно от других героев, сцен и игровых часов. Начатые применения и эффекты изменяй через раунд или отмену. Все изменения здесь — решения мастера.</p>
  <fieldset disabled={disabled}><legend>{creating?'Новый NPC':'Лист NPC'}</legend>
   <Suspense fallback={<p>Загружаем лист NPC…</p>}><Workspace remote characterId={actor.id} draft={actor} characters={[actor]} campaign={draft.world.campaign}
    onDraftChange={change} onSave={next=>change({...normalizeCharacterDraft(next),id:actor.id})}
    onCampaign={()=>({ok:false,message:'Шаблоны кампании редактируются в общем редакторе ГМ.'})}
    onWorld={()=>({ok:false,message:'Применяй игровые действия NPC через заявление и расчёт раунда.'})}
    onPlan={()=>setMessage('Для применения способности используй заявление NPC и серверный расчёт раунда.')}/></Suspense>
   {!creating&&<><label className="w6-check"><input aria-label="Допуск NPC к раундам" type="checkbox" checked={approved} onChange={e=>changeControls({...controls,approved:e.currentTarget.checked})}/>Допущен к участию в раундах</label>
    <label className="w6-field"><span>Причина изменения NPC</span><textarea aria-label="Причина изменения NPC" maxLength={2000} value={reason} onChange={e=>changeControls({...controls,reason:e.currentTarget.value})}/></label></>}
   {stale&&<><p role="alert">Кампания изменилась. Черновик сохранён: сравни его с текущим NPC перед записью.</p>
    {!creating&&<button className="w6-button" onClick={()=>void compare()}>Показать текущий NPC для сверки</button>}
    {comparison&&<aside aria-label="Текущий NPC для сверки"><p>{comparison.actor.name} · версия {comparison.revision} · время {comparison.campaign.seconds} с</p>
     {Object.entries(comparison.actor.resources).map(([key,r])=><p key={key}>{key==='mana'?'Мана':key==='shadow'?'Тень':key==='stamina'?'Выносливость':'Здоровье'}: {r.current} / {r.maximum}</p>)}
     <button className="w6-button" disabled={comparison.revision!==initial.revision} onClick={()=>{if(window.confirm('Заменить черновик текущим листом NPC? Несохранённые изменения будут заменены.')){remember({...draft,revision:comparison.revision,world:{characters:[comparison.actor],campaign:comparison.campaign}});changeControls({approved:comparison.approved,reason:''})}}}>Загрузить текущий NPC вместо черновика</button>
    </aside>}
    <button className="w6-button" disabled={!creating&&comparison?.revision!==initial.revision} onClick={()=>remember({...draft,revision:initial.revision,world:{...draft.world,campaign:comparison?.campaign??initial.campaign}})}>Черновик NPC сверен</button></>}
   <button className="w6-button" disabled={stale||!isCharacterDraft(actor)||!creating&&!reason.trim()} onClick={()=>void save()}>{creating?'Создать NPC в кампании':'Сохранить изменения NPC'}</button>
  </fieldset>
  {command&&!checkingAccess&&<><p role="alert">Результат команды не подтверждён. Повтор проверит прежний результат.</p><button className="w6-button" disabled={busy} onClick={()=>void save()}>Проверить результат команды NPC</button></>}
  {warning&&<p role="alert">{warning}</p>}<p role="status">{checkingAccess?'':message}</p>
 </section>
}
export default function LobbyNpcs({accountId,lobby,checkingAccess}:{accountId:string;lobby:Lobby;checkingAccess:boolean}){
 const {request,refresh}=useOnline(),[opened,setOpened]=useState(false),remote=useRemote<List>(opened?'/lobbies/'+lobby.id+'/npcs':null)
 const [editor,setEditor]=useState<{creating:boolean;sheet:Sheet}|null>(null),[planId,setPlanId]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const active=useRef(false),pending=useRef<AbortController|null>(null),sequence=useRef(0),inFlight=useRef(false)
 useEffect(()=>{active.current=true;return()=>{active.current=false;pending.current?.abort()}},[])
 useEffect(()=>()=>{++sequence.current;pending.current?.abort();inFlight.current=false},[request])
 const value=!checkingAccess&&!remote.loading&&!remote.error?remote.value:null,disabled=checkingAccess||remote.loading||busy||!!value?.closed
 async function load(id:string){
  if(disabled||inFlight.current)return
  const abort=new AbortController(),attempt=++sequence.current;pending.current?.abort();pending.current=abort;inFlight.current=true;setBusy(true);setMessage('')
  try{const sheet=await request<Sheet>('/lobbies/'+lobby.id+'/npcs/'+id,{signal:abort.signal})
   if(active.current&&!abort.signal.aborted&&attempt===sequence.current){setEditor({creating:false,sheet});setPlanId('')}
  }catch(e){if(active.current&&!abort.signal.aborted)setMessage((e as Error).message)}finally{if(active.current&&pending.current===abort){setBusy(false);inFlight.current=false}}
 }
 async function assign(npc:Npc,userId:string){
  if(disabled||inFlight.current||!value)return
  const key=lobbyFormKey('npc-assignment',accountId,lobby.id,npc.id),path='/lobbies/'+lobby.id+'/npcs/'+npc.id+'/assign',saved=readCommand(key,path),attempt=saved??{path,body:JSON.stringify({revision:value.revision,userId,commandKey:'npc:'+crypto.randomUUID()})}
  if(!writeLobbyForm(key,attempt)){setMessage('Не удалось сохранить команду управления NPC.');return}
  const abort=new AbortController();pending.current=abort;inFlight.current=true;setBusy(true)
  try{await request(attempt.path,{method:'POST',signal:abort.signal,body:attempt.body});if(active.current&&!abort.signal.aborted){writeLobbyForm(key,null);setMessage('Управляющий NPC обновлён.');refresh()}}
  catch(e){if(active.current&&!abort.signal.aborted){if(e instanceof NetworkError&&[400,404,409,413].includes(e.status))writeLobbyForm(key,null);setMessage((e as Error).message+' Проверь результат повтором назначения.')}}
  finally{if(active.current&&pending.current===abort){inFlight.current=false;setBusy(false)}}
 }
 return <section className="w6-fieldset"><h3>NPC кампании</h3><button className="w6-button" disabled={checkingAccess||busy} onClick={()=>setOpened(!opened)}>{opened?'Свернуть NPC':'Открыть инструменты NPC'}</button>
  {opened&&<><p role="status">{checkingAccess?'':remote.loading?'Проверяем NPC и права…':remote.error}</p>
   {value&&<><p>NPC принадлежат кампании. Главный ГМ назначает управляющего; при отзыве прав управление возвращается ему. Сведения NPC открываются игрокам через инструменты раскрытия.</p>
    <button className="w6-button" disabled={disabled} onClick={()=>{setEditor({creating:true,sheet:{revision:value.revision,actor:freshActor(lobby.energy),campaign:value.campaign,approved:true,controllerId:lobby.owner_id}});setPlanId('')}}>Подготовить нового NPC</button>
    {value.npcs.map(n=><article key={n.id}><h4>{n.name}</h4><p>{n.approved?'Допущен к раундам':'Допуск снят'} · управляет {lobby.members.find(m=>m.id===n.controllerId)?.displayName??'Главный ГМ'}</p>
     <button className="w6-button" disabled={disabled} onClick={()=>void load(n.id)}>Открыть лист NPC {n.name}</button>
     {n.controllerId===accountId&&<button className="w6-button" disabled={disabled} onClick={()=>{setPlanId(n.id);setEditor(null)}}>Заявление NPC {n.name}</button>}
     {lobby.myRole==='GM'&&<label className="w6-field"><span>Управляющий NPC {n.name}</span><select aria-label={'Управляющий NPC '+n.name} disabled={disabled||!!readCommand(lobbyFormKey('npc-assignment',accountId,lobby.id,n.id),'/lobbies/'+lobby.id+'/npcs/'+n.id+'/assign')} value={n.controllerId} onChange={e=>void assign(n,e.currentTarget.value)}>
      {lobby.members.filter(m=>!m.disabled&&(m.lobbyRole==='GM'||m.lobbyRole==='ASSISTANT'&&m.permissions.includes('npcs')&&m.permissions.includes('viewSecrets'))).map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}
     </select>{readCommand(lobbyFormKey('npc-assignment',accountId,lobby.id,n.id),'/lobbies/'+lobby.id+'/npcs/'+n.id+'/assign')&&<><p>Назначение ещё не подтверждено. Проверь прежнюю команду перед новым выбором.</p><button className="w6-button" disabled={disabled} onClick={()=>void assign(n,n.controllerId)}>Проверить назначение NPC {n.name}</button></>}</label>}
    </article>)}
    {editor&&<NpcEditor key={JSON.stringify([accountId,lobby.id,editor.creating?'new':editor.sheet.actor.id])} accountId={accountId} lobby={lobby} initial={{...editor.sheet,revision:value.revision}} creating={editor.creating} checkingAccess={disabled} onDone={()=>{setEditor(null);setMessage('NPC сохранён; обновляем список.')}}/>}
    {planId&&value.npcs.some(n=>n.id===planId&&n.controllerId===accountId)&&<><h4>Заявление NPC · {value.npcs.find(n=>n.id===planId)?.name}</h4><p>Мастер выбирает действия по сцене. Это не задаёт автоматическое восприятие или поведение NPC. Отсутствие заявления решает мастер.</p>
     <LobbyActionDeclarations key={JSON.stringify([accountId,lobby.id,planId])} accountId={accountId} lobbyId={lobby.id} characterId={planId} checkingAccess={disabled} selectedContact="" pickedPoint={null} members={lobby.members}/></>}
   </>}{!checkingAccess&&<p role="status">{message}</p>}</>}
 </section>
}
