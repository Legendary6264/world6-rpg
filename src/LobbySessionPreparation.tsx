import {useEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {useRemote} from './onlineHooks'
import {NetworkError} from './onlineClient'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import {isLegacyGameSessionView} from './gameSession'
import type {LegacyGameSessionView} from './gameSession'
type Command={path:string;method:'POST'|'PUT';body:string}
type Draft={goals:string;summary:string;outcome:'success'|'failure'|'stopped';revision?:number;command:Command|null}
const valid=(v:unknown):v is Draft=>!!v&&typeof v==='object'&&typeof (v as Draft).goals==='string'&&typeof (v as Draft).summary==='string'&&['success','failure','stopped'].includes((v as Draft).outcome)&&((v as Draft).command===null||!!(v as Draft).command&&typeof (v as Draft).command!.path==='string'&&typeof (v as Draft).command!.body==='string'&&['POST','PUT'].includes((v as Draft).command!.method))
export default function LobbySessionPreparation({accountId,lobbyId,disabled,onHeroes,onScene}:{accountId:string;lobbyId:string;disabled:boolean;onHeroes:()=>void;onScene:()=>void}){
 const {request,refresh}=useOnline(),path='/lobbies/'+lobbyId+'/play/session',remote=useRemote<LegacyGameSessionView>(path+'/details'),key=lobbyFormKey('game-session',accountId,lobbyId)
 const [draft,setDraft]=useState<Draft>(()=>readLobbyForm(key,valid)??{goals:'',summary:'',outcome:'success',command:null}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[warning,setWarning]=useState('')
 const pending=useRef<AbortController|null>(null),active=useRef(true),v=isLegacyGameSessionView(remote.value)?remote.value:null,s=v?.session
 useEffect(()=>{active.current=true;return()=>{active.current=false;pending.current?.abort()}},[])
 useEffect(()=>()=>{pending.current?.abort();pending.current=null;if(active.current)setBusy(false)},[request])
 const locked=disabled||remote.loading||busy||!!draft.command,stale=draft.revision!==undefined&&v?.revision!==draft.revision
 function remember(next:Draft){setDraft(next);const ok=writeLobbyForm(key,next);setWarning(ok?'':'Черновик не сохранён на устройстве. Не закрывай страницу.');return ok}
 function edit(patch:Partial<Draft>){remember({...draft,goals:draft.revision===undefined?s?.objectives.map(o=>o.title).join('\n')??'':draft.goals,revision:draft.revision??v?.revision,...patch});setMessage('')}
 async function send(operation:string,extra:Record<string,unknown>={},ready?:boolean){
  if(disabled||busy||pending.current||!v||remote.loading)return
  if(!draft.command&&['goals','finish'].includes(operation)&&stale){setMessage('Кампания изменилась. Проверь текущую версию перед сохранением решения.');return}
  const command=draft.command??{path:ready===undefined?path:path+'/ready',method:ready===undefined?'POST' as const:'PUT' as const,body:JSON.stringify(ready===undefined?{operation,revision:v.revision,commandKey:'session:'+crypto.randomUUID(),...extra}:{ready})}
  if(![path,path+'/ready'].includes(command.path)||!remember({...draft,command}))return
  const abort=new AbortController();pending.current=abort;setBusy(true)
  try{
   await request(command.path,{method:command.method,body:command.body,signal:abort.signal});if(!active.current||abort.signal.aborted)return
   remember({...draft,revision:undefined,command:null});setMessage('Изменение сессии сохранено. Все участники получат обновление.');refresh()
  }catch(e){if(active.current&&!abort.signal.aborted){if(e instanceof NetworkError&&e.status>=400&&e.status<500)remember({...draft,command:null});setMessage((e as Error).message)}}
  finally{if(active.current&&!abort.signal.aborted){pending.current=null;setBusy(false)}}
 }
 function saveGoals(){if(!v||stale)return;const titles=draft.goals.split('\n').map(t=>t.trim()).filter(Boolean);if(titles.length>12||titles.some(t=>t.length>160)){setMessage('Не больше 12 целей, каждая до 160 символов.');return}const used=new Set<string>(),objectives=titles.map(title=>{const old=v.session.objectives.find(o=>o.title===title&&!used.has(o.id)),id=old?.id??crypto.randomUUID();used.add(id);return {id,title,done:old?.done??false}});void send('goals',{objectives})}
 return <section className={'gb-session-panel'+(s?.status==='finished'?' gb-session-finished':'')} aria-label="Готовность и цели приключения">
  {remote.error&&<p role="alert">{remote.error}</p>}{!v&&remote.loading&&<p role="status">Получаем состояние игры с сервера…</p>}
  {v&&s&&<>
   {s.status==='setup'&&<><p>Выберите героев и дождитесь подготовки сцены. Игроки могут отметить готовность; мастер запускает игру на общем игровом столе.</p><ol className="gb-session-party" aria-label="Готовность участников">{v.participants.map(p=><li key={p.userId}><strong>{p.name}{p.mine?' · ты':''}</strong><span>{!p.heroCount?'Нужен принятый герой':!p.placed?'Ожидает входа на сцену':p.ready?'Готов к игре':'Ожидаем готовность'}</span></li>)}</ol>{!v.participants.length&&<p>Отправь другу код приглашения из вкладки «Лобби».</p>}<div className="w6-buttons"><button className="w6-button" type="button" disabled={locked} onClick={onHeroes}>Выбрать или принять героев</button>{v.chief?<button className="w6-button" type="button" disabled={locked} onClick={onScene}>Подготовить сцену</button>:v.participants.some(p=>p.mine)&&<button className="w6-button w6-primary" type="button" disabled={locked||!v.participants.find(p=>p.mine)?.placed} onClick={()=>void send('ready',{},!v.myReady)}>{v.myReady?'Снять готовность':'Я готов играть'}</button>}</div></>}
   {!!s.objectives.length&&<section aria-label="Общие цели приключения"><h4>Общие цели</h4><ul>{s.objectives.map(o=><li key={o.id}>{v.chief&&s.status==='playing'?<label><input type="checkbox" checked={o.done} disabled={locked} onChange={e=>void send('objective',{objectiveId:o.id,done:e.currentTarget.checked})}/>{o.title}</label>:<span>{o.done?'✓ ': '○ '}{o.title}</span>}</li>)}</ul></section>}
   {s.status==='finished'&&v.chief&&<button className="w6-button" type="button" disabled={locked} onClick={()=>void send('resume')}>Продолжить завершённую игру</button>}
   {v.chief&&s.status!=='finished'&&<details className="gb-session-goals"><summary>Настроить общие цели</summary><label className="w6-field"><span>Одна цель на строку · до 12 целей</span><textarea aria-label="Цели приключения" rows={3} maxLength={2000} value={draft.revision===undefined?s.objectives.map(o=>o.title).join('\n'):draft.goals} disabled={locked} onChange={e=>edit({goals:e.currentTarget.value})}/></label>{stale&&<><p role="alert">Состояние изменилось. Проверь цели перед сохранением.</p><button className="w6-button" type="button" disabled={locked} onClick={()=>edit({revision:v.revision})}>Цели проверены</button></>}<button className="w6-button" type="button" disabled={locked||stale||draft.revision===undefined} onClick={saveGoals}>Сохранить общие цели</button></details>}
  </>}
  {draft.command&&<div role="status"><p>Ожидается подтверждение ранее отправленной команды. Повтор использует тот же запрос.</p><button className="w6-button" type="button" disabled={disabled||busy||remote.loading} onClick={()=>void send('retry')}>Повторить отправку сессии</button></div>}
  {warning&&<p role="alert">{warning}</p>}<p role="status">{message}</p>
 </section>
}
