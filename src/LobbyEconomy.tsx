import {useEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import {NetworkError} from './onlineClient'
import {emptyEconomy,newEconomyRule,isEconomyRules} from './campaignEconomy'
import type {CampaignEconomy,EconomyRule,EconomyLine,PeriodSummary} from './campaignEconomy'
import type {CampaignTrade} from './campaignTrade'
import type {InventoryItem,ItemTemplate} from './rpgTypes'
type View={revision:number;closed:boolean;economy?:CampaignEconomy;trade:CampaignTrade;options:{actors:{id:string;name:string;approved:boolean;blocked:boolean;inventory:InventoryItem[]}[];templates:ItemTemplate[]}}
type Command={path:string;body:string}
type SettingsDraft={revision:number;periodName:string;rules:EconomyRule[];raw:Record<string,string>;reason:string;command:Command|null}
type PeriodDraft={revision:number;fromPeriod:number;count:string;ruleIds:string[];reason:string;conditionsConfirmed:boolean;command:Command|null}
type Preview={id:string;revision:number;generation:number;expiresAt:string;summary:PeriodSummary}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const commandValid=(v:unknown)=>v===null||object(v)&&typeof v.path==='string'&&typeof v.body==='string'&&v.body.length<3000000
function commandFor(c:Command|null,path:string){try{const b=c&&JSON.parse(c.body);return c?.path===path&&typeof b?.commandKey==='string'&&/^economy:[a-zA-Z0-9_-]{8,140}$/.test(b.commandKey)?c:null}catch{return null}}
function settingsValid(v:unknown):v is SettingsDraft{
 if(!object(v)||!Number.isSafeInteger(v.revision)||typeof v.periodName!=='string'||v.periodName.length>120||typeof v.reason!=='string'||v.reason.length>2000||!object(v.raw)||!Object.values(v.raw).every(x=>typeof x==='string'&&x.length<=32)||!commandValid(v.command)||!Array.isArray(v.rules))return false
 const rules=[]
 for(const r of v.rules){
  if(!object(r)||typeof r.name!=='string'||!Array.isArray(r.inputs)||!Array.isArray(r.outputs))return false
  const shape=(rows:unknown[])=>rows.map(l=>object(l)&&typeof l.targetId==='string'&&typeof l.resourceId==='string'&&typeof l.amount==='number'?{...l,targetId:l.targetId||'draft-target',resourceId:l.resourceId||'draft-resource',amount:1}:null)
  rules.push({...r,name:r.name.trim()?r.name:'Черновик',enabled:false,inputs:shape(r.inputs),outputs:shape(r.outputs)})
 }
 return isEconomyRules(rules)
}
function periodValid(v:unknown):v is PeriodDraft{return object(v)&&Number.isSafeInteger(v.revision)&&Number.isSafeInteger(v.fromPeriod)&&typeof v.count==='string'&&v.count.length<=32&&Array.isArray(v.ruleIds)&&v.ruleIds.length<=50&&v.ruleIds.every(x=>typeof x==='string')&&typeof v.reason==='string'&&v.reason.length<=2000&&typeof v.conditionsConfirmed==='boolean'&&commandValid(v.command)}
const rejected=(e:unknown)=>e instanceof NetworkError&&[400,404,409,413].includes(e.status)
function summaryRows(s:PeriodSummary){return <>
 <p>{s.periodName}: {s.fromPeriod}–{s.toPeriod} · {s.count} периодов. Правила: {s.ruleNames.join(', ')}.</p>
 {s.money.map(m=><p key={JSON.stringify([m.target,m.targetId,m.currencyId])}>{m.targetName} · {m.currencyName}: {m.before} − расход {m.spent} + поступление {m.earned} = {m.after} {m.symbol}.</p>)}
 {s.consumed.map(c=><p key={JSON.stringify([c.target,c.targetId,c.itemId])}>{c.targetName} · сырьё {c.name}: {c.before} − {c.quantity} = {c.after} шт.</p>)}
 {s.produced.map(p=><p key={p.destinationId}>{p.targetName} · выпуск {p.name}: {p.quantity} шт., прочность {p.durability}/{p.maximumDurability}{p.artifactCharge!==null?' · заряд '+p.artifactCharge:''}, масса {p.massKg} кг. Отдельная запись; товар торговца скрыт.</p>)}
 <p>Основание: {s.reason}</p><p>Игровые часы остаются на {s.gameSeconds} с.</p>
 </>}
function flowOptions(view:View,l:EconomyLine,output:boolean){
 if(l.resource==='money')return view.trade.currencies.map(c=>({id:c.id,name:c.name+' · '+c.symbol}))
 if(output)return view.options.templates.map(t=>({id:t.id,name:t.name}))
 const items=l.target==='actor'?view.options.actors.find(a=>a.id===l.targetId)?.inventory??[]:view.trade.merchants.find(m=>m.id===l.targetId)?.stock.map(s=>s.item)??[]
 return items.map(i=>({id:i.id,name:i.name+' · '+i.quantity+(i.equipped?' · снаряжён':'')}))
}
function rulesReferences(view:View,rules:EconomyRule[]){return rules.every(r=>[...r.inputs.map(l=>({l,output:false})),...r.outputs.map(l=>({l,output:true}))].every(({l,output})=>(l.target==='actor'?view.options.actors.some(a=>a.id===l.targetId):view.trade.merchants.some(m=>m.id===l.targetId))&&(l.resource==='money'||r.enabled?flowOptions(view,l,output).some(o=>o.id===l.resourceId):true)))}
function EconomySettings({accountId,lobbyId,view}:{accountId:string;lobbyId:string;view:View}){
 const {request,refresh}=useOnline(),economy=view.economy??emptyEconomy(),key=lobbyFormKey('economy-settings',accountId,lobbyId),path='/lobbies/'+lobbyId+'/economy/settings'
 const [draft,setDraft]=useState<SettingsDraft>(()=>{const d=readLobbyForm(key,settingsValid);return d?{...d,command:commandFor(d.command,path)}:{revision:view.revision,periodName:economy.periodName,rules:economy.rules,raw:{},reason:'',command:null}})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[warning,setWarning]=useState(''),active=useRef(false),sending=useRef(false),abortRef=useRef<AbortController|null>(null)
 useEffect(()=>{active.current=true;return()=>{active.current=false;abortRef.current?.abort()}},[])
 useEffect(()=>()=>abortRef.current?.abort(),[request])
 function remember(d:SettingsDraft){setDraft(d);setWarning(writeLobbyForm(key,d)?'':'Черновик правил не сохранён на устройстве. Не закрывай страницу.')}
 function change(rules:EconomyRule[]){const keys=new Set(rules.flatMap(r=>[...r.inputs,...r.outputs].map(l=>r.id+':'+l.id)));remember({...draft,rules,raw:Object.fromEntries(Object.entries(draft.raw).filter(([key])=>keys.has(key)))});setMessage('')}
 const stale=draft.revision!==view.revision,numbers=draft.rules.every(r=>[...r.inputs,...r.outputs].every(l=>{const value=draft.raw[r.id+':'+l.id]??String(l.amount);return /^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0&&Number(value)<=(l.resource==='money'?1e9:1e6)})),ready=!stale&&numbers&&isEconomyRules(draft.rules)&&rulesReferences(view,draft.rules)&&!!draft.periodName.trim()&&!!draft.reason.trim(),disabled=busy||!!draft.command||view.closed
 const replace=(ruleId:string,patch:Partial<EconomyRule>)=>change(draft.rules.map(r=>r.id===ruleId?{...r,...patch}:r))
 async function save(){
  if(sending.current||!draft.command&&(!ready||view.closed))return
  const command=draft.command??{path,body:JSON.stringify({revision:draft.revision,periodName:draft.periodName,rules:draft.rules,reason:draft.reason,commandKey:'economy:'+crypto.randomUUID()})}
  if(!writeLobbyForm(key,{...draft,command})){setMessage('Команду повтора сохранить не удалось. Освободи место перед записью.');return}
  setDraft({...draft,command});setBusy(true);sending.current=true;const abort=new AbortController();abortRef.current=abort
  try{const result=await request<{duplicate:boolean}>(command.path,{method:'POST',body:command.body,signal:abort.signal});if(!active.current||abort.signal.aborted)return;remember({...draft,revision:view.revision+1,command:null});refresh();setMessage(result.duplicate?'Прежняя запись правил подтверждена без повторного применения. Проверь текущие правила после восстановления.':'Правила сохранены; счётчик учёта сохранён.')}
  catch(e){if(active.current&&!abort.signal.aborted){if(rejected(e))remember({...draft,command:null});setMessage((e as Error).message+(rejected(e)?' Черновик сохранён.':' Команда сохранена для проверки повтором.'))}}
  finally{if(active.current&&abortRef.current===abort){setBusy(false);sending.current=false}}
 }
 function flows(r:EconomyRule,index:number,side:'inputs'|'outputs'){
  const output=side==='outputs',label=output?'Выпуск':'Расход'
  return <fieldset><legend>{output?'Поступления и продукция':'Деньги и сырьё к расходу'} · за один период</legend>{r[side].map((l,j)=>{
   const prefix=label+' '+(index+1)+'.'+(j+1),owners=l.target==='actor'?view.options.actors:view.trade.merchants,options=flowOptions(view,l,output),set=(patch:Partial<EconomyLine>)=>replace(r.id,{[side]:r[side].map(x=>x.id===l.id?{...x,...patch}:x)})
   return <article className="gb-journal-entry" key={l.id}>
    <label className="w6-field"><span>{prefix} · владелец имущества</span><select aria-label={prefix+' Владелец'} value={l.target} onChange={e=>set({target:e.currentTarget.value as EconomyLine['target'],targetId:'',resourceId:''})}><option value="actor">Герой или NPC</option><option value="merchant">Торговец</option></select></label>
    <label className="w6-field"><span>Получатель или источник</span><select aria-label={prefix+' Получатель'} value={l.targetId} onChange={e=>set({targetId:e.currentTarget.value,resourceId:l.resource==='money'?l.resourceId:''})}><option value="">Выбери запись</option>{l.targetId&&!owners.some(o=>o.id===l.targetId)&&<option value={l.targetId}>Прежняя запись недоступна</option>}{owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <label className="w6-field"><span>Что учитывается</span><select aria-label={prefix+' Вид'} value={l.resource} onChange={e=>set({resource:e.currentTarget.value as EconomyLine['resource'],resourceId:''})}><option value="money">Средства</option><option value="item">{output?'Продукция по шаблону':'Конкретный экземпляр сырья'}</option></select></label>
    <label className="w6-field"><span>{l.resource==='money'?'Валюта':output?'Шаблон продукции':'Экземпляр сырья'}</span><select aria-label={prefix+' Ресурс'} value={l.resourceId} onChange={e=>set({resourceId:e.currentTarget.value})}><option value="">Выбери ресурс</option>{l.resourceId&&!options.some(o=>o.id===l.resourceId)&&<option value={l.resourceId}>Прежний ресурс недоступен</option>}{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <label className="w6-field"><span>Целое количество за один период</span><input aria-label={prefix+' Количество'} inputMode="numeric" maxLength={32} value={draft.raw[r.id+':'+l.id]??String(l.amount)} onChange={e=>{const value=e.currentTarget.value,raw={...draft.raw,[r.id+':'+l.id]:value},valid=/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0&&Number(value)<=(l.resource==='money'?1e9:1e6);remember({...draft,raw,rules:valid?draft.rules.map(rule=>rule.id===r.id?{...rule,[side]:rule[side].map(line=>line.id===l.id?{...line,amount:Number(value)}:line)}:rule):draft.rules})}}/></label>
    <button className="w6-button" onClick={()=>replace(r.id,{[side]:r[side].filter(x=>x.id!==l.id)})}>Убрать {prefix}</button>
   </article>
  })}<button className="w6-button" disabled={r[side].length>=20} onClick={()=>replace(r.id,{[side]:[...r[side],{id:crypto.randomUUID(),target:'actor',targetId:'',resource:'money',resourceId:'',amount:1}]})}>Добавить {label.toLowerCase()} в правило {index+1}</button></fieldset>
 }
 return <section aria-label="Правила производства и расходов"><fieldset disabled={disabled}><legend>Правила мастера</legend>
  <label className="w6-field"><span>Название периода учёта</span><input aria-label="Название периода учёта" maxLength={120} value={draft.periodName} onChange={e=>remember({...draft,periodName:e.currentTarget.value})}/></label>
  <p>Период — единица вашего учёта. Длительность и сюжетные условия определяет мастер. Правила не запускаются автоматически и не двигают игровые часы.</p>
  {draft.rules.map((r,index)=><article className="gb-journal-entry" key={r.id}><label className="w6-field"><span>Название правила {index+1}</span><input aria-label={'Название правила '+(index+1)} maxLength={120} value={r.name} onChange={e=>replace(r.id,{name:e.currentTarget.value})}/></label><label className="w6-field"><span>Описание и условия</span><textarea aria-label={'Описание правила '+(index+1)} maxLength={2000} value={r.description} onChange={e=>replace(r.id,{description:e.currentTarget.value})}/></label><label className="w6-field"><span>Секретные заметки</span><textarea aria-label={'Секрет правила '+(index+1)} maxLength={8000} value={r.secret} onChange={e=>replace(r.id,{secret:e.currentTarget.value})}/></label><label className="w6-check"><input aria-label={'Включить правило '+(index+1)} type="checkbox" checked={r.enabled} onChange={e=>replace(r.id,{enabled:e.currentTarget.checked})}/>Разрешить выбор правила для периода</label>{flows(r,index,'inputs')}{flows(r,index,'outputs')}<button className="w6-button" onClick={()=>change(draft.rules.filter(x=>x.id!==r.id))}>Убрать правило {index+1}</button></article>)}
  <button className="w6-button" disabled={draft.rules.length>=50} onClick={()=>change([...draft.rules,newEconomyRule(crypto.randomUUID())])}>Добавить правило учёта</button>
  <label className="w6-field"><span>Основание записи правил</span><textarea aria-label="Причина записи правил" maxLength={2000} value={draft.reason} onChange={e=>remember({...draft,reason:e.currentTarget.value})}/></label>
  {!numbers&&<p role="alert">Количество должно быть целым и положительным. Незавершённый ввод сохранён.</p>}
  {!rulesReferences(view,draft.rules)&&<p role="alert">Есть недоступные ссылки. Замени их или отключи правило с исчерпанным сырьём.</p>}
  {stale&&<><p role="alert">Кампания изменилась. Сверь правила перед записью; черновик сохранён.</p><details><summary>Текущие правила для сверки</summary><p>{economy.periodName} · учтено {economy.completedPeriods}</p>{economy.rules.map(r=><article key={r.id}><h5>{r.name} · {r.enabled?'включено':'отключено'}</h5><p>{r.description}</p><p>Секретные заметки: {r.secret}</p>{[...r.inputs.map(l=>({l,output:false})),...r.outputs.map(l=>({l,output:true}))].map(({l,output})=><p key={l.id}>{output?'Выпуск':'Расход'}: {l.target==='actor'?view.options.actors.find(a=>a.id===l.targetId)?.name:view.trade.merchants.find(m=>m.id===l.targetId)?.name} · {flowOptions(view,l,output).find(o=>o.id===l.resourceId)?.name??'прежний ресурс недоступен'} · {l.amount} за период.</p>)}</article>)}</details><button className="w6-button" onClick={()=>remember({...draft,revision:view.revision})}>Правила учёта сверены</button></>}
  <button className="w6-button" disabled={!ready} onClick={()=>void save()}>Сохранить правила учёта</button>
 </fieldset>{draft.command&&<button className="w6-button" disabled={busy} onClick={()=>void save()}>Проверить запись правил учёта</button>}{warning&&<p role="alert">{warning}</p>}<p role="status">{message}</p></section>
}
function EconomyPeriod({accountId,lobbyId,view}:{accountId:string;lobbyId:string;view:View}){
 const {request,refresh}=useOnline(),economy=view.economy??emptyEconomy(),key=lobbyFormKey('economy-period',accountId,lobbyId),path='/lobbies/'+lobbyId+'/economy/apply'
 const [draft,setDraft]=useState<PeriodDraft>(()=>{const d=readLobbyForm(key,periodValid);return d?{...d,command:commandFor(d.command,path)}:{revision:view.revision,fromPeriod:economy.completedPeriods+1,count:'1',ruleIds:[],reason:'',conditionsConfirmed:false,command:null}})
 const [preview,setPreview]=useState<{stamp:string;value:Preview}|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[warning,setWarning]=useState(''),active=useRef(false),sending=useRef(false),abortRef=useRef<AbortController|null>(null)
 useEffect(()=>{active.current=true;return()=>{active.current=false;abortRef.current?.abort()}},[])
 useEffect(()=>()=>abortRef.current?.abort(),[request])
 function remember(d:PeriodDraft){setDraft(d);setWarning(writeLobbyForm(key,d)?'':'Черновик периода не сохранён. Не закрывай страницу.')}
 function change(patch:Partial<PeriodDraft>){abortRef.current?.abort();sending.current=false;setBusy(false);setPreview(null);setConfirmed(false);remember({...draft,conditionsConfirmed:false,...patch});setMessage('')}
 const stale=draft.revision!==view.revision||draft.fromPeriod!==economy.completedPeriods+1,stamp=JSON.stringify([draft.revision,draft.fromPeriod,draft.count,draft.ruleIds,draft.reason,draft.conditionsConfirmed]),rules=draft.ruleIds.map(id=>economy.rules.find(r=>r.id===id)),result=preview?.stamp===stamp&&preview.value.revision===view.revision&&!stale?preview.value:null
 const ready=!stale&&!!economy.periodName.trim()&&/^\d+$/.test(draft.count)&&Number(draft.count)>0&&Number(draft.count)<=365&&!!draft.reason.trim()&&draft.conditionsConfirmed&&rules.length>0&&rules.every(r=>r?.enabled)&&rulesReferences(view,rules.filter((r):r is EconomyRule=>!!r))
 async function calculate(){
  if(!ready||draft.command||view.closed||sending.current)return;setBusy(true);sending.current=true;setPreview(null);setConfirmed(false);const abort=new AbortController();abortRef.current=abort
  try{const input={fromPeriod:draft.fromPeriod,count:Number(draft.count),ruleIds:draft.ruleIds,reason:draft.reason,conditionsConfirmed:true},value=await request<Preview>('/lobbies/'+lobbyId+'/economy/calculate',{method:'POST',body:JSON.stringify({revision:draft.revision,input}),signal:abort.signal});if(active.current&&!abort.signal.aborted)setPreview({stamp,value})}
  catch(e){if(active.current&&!abort.signal.aborted)setMessage((e as Error).message)}finally{if(active.current&&abortRef.current===abort){setBusy(false);sending.current=false}}
 }
 async function apply(){
  if(sending.current||!draft.command&&(view.closed||!result||!confirmed))return
  const command=draft.command??{path,body:JSON.stringify({previewId:result!.id,generation:result!.generation,commandKey:'economy:'+crypto.randomUUID()})}
  if(!writeLobbyForm(key,{...draft,command})){setMessage('Команду повтора сохранить не удалось. Освободи место перед применением.');return}
  setDraft({...draft,command});setBusy(true);sending.current=true;const abort=new AbortController();abortRef.current=abort
  try{const response=await request<{duplicate:boolean;receipt:{summary:PeriodSummary}}>(command.path,{method:'POST',body:command.body,signal:abort.signal});if(!active.current||abort.signal.aborted)return;remember({...draft,revision:view.revision+1,fromPeriod:response.receipt.summary.toPeriod+1,conditionsConfirmed:false,command:null});setPreview(null);setConfirmed(false);refresh();setMessage(response.duplicate?'Прежний учёт подтверждён без повторного выпуска и расхода. Проверь текущий мир после возможного восстановления.':'Период учтён. Обновляем имущество и счётчик.')}
  catch(e){if(active.current&&!abort.signal.aborted){if(rejected(e)){remember({...draft,command:null});setPreview(null);setConfirmed(false)}setMessage((e as Error).message+(rejected(e)?' Пересчитай период; черновик сохранён.':' Команда сохранена для проверки повтором.'))}}
  finally{if(active.current&&abortRef.current===abort){setBusy(false);sending.current=false}}
 }
 return <section aria-label="Учёт периода"><h4>Учёт периода</h4><p>Уже учтено: {economy.completedPeriods}. Следующий номер: {economy.completedPeriods+1}.</p><fieldset disabled={busy||!!draft.command||view.closed}>
  <label className="w6-field"><span>Число следующих периодов · до 365</span><input aria-label="Число периодов учёта" inputMode="numeric" maxLength={32} value={draft.count} onChange={e=>change({count:e.currentTarget.value})}/></label>
  {economy.rules.filter(r=>r.enabled).map(r=><label className="w6-check" key={r.id}><input aria-label={'Учесть правило '+r.name} type="checkbox" checked={draft.ruleIds.includes(r.id)} onChange={e=>change({ruleIds:e.currentTarget.checked?[...draft.ruleIds,r.id]:draft.ruleIds.filter(id=>id!==r.id)})}/>{r.name}{r.description?' · '+r.description:''}</label>)}
  {draft.ruleIds.filter(id=>!economy.rules.some(r=>r.id===id&&r.enabled)).map(id=><p key={id}>Прежнее правило недоступно. <button className="w6-button" onClick={()=>change({ruleIds:draft.ruleIds.filter(rid=>rid!==id)})}>Убрать недоступное правило</button></p>)}
  <p>Выполняются только выбранные правила. Остальные за этот учёт ничего не начисляют. Денежные расходы и поступления считаются вместе; сырьё берётся только из исходных экземпляров.</p>
  <label className="w6-field"><span>Основание и условия мастера</span><textarea aria-label="Причина учёта периода" maxLength={2000} value={draft.reason} onChange={e=>change({reason:e.currentTarget.value})}/></label>
  <label className="w6-check"><input aria-label="Условия периода подтверждены" type="checkbox" checked={draft.conditionsConfirmed} onChange={e=>change({conditionsConfirmed:e.currentTarget.checked})}/>Мастер подтвердил период, доступность производства и сюжетные условия выбранных правил</label>
  {stale&&<><p role="alert">Мир, правила или счётчик изменились. Сверь текущие данные; черновик сохранён.</p><button className="w6-button" onClick={()=>change({revision:view.revision,fromPeriod:economy.completedPeriods+1})}>Период и имущество сверены</button></>}
  <button className="w6-button" disabled={!ready} onClick={()=>void calculate()}>Рассчитать период учёта</button>
 </fieldset>{result&&!draft.command&&<section aria-label="Последствия периода"><h4>Последствия · ещё не применены</h4>{summaryRows(result.summary)}<label className="w6-check"><input aria-label="Подтверждаю последствия периода" type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.currentTarget.checked)}/>Подтверждаю общий расход, выпуск и итоговые средства</label><button className="w6-button" disabled={busy||!confirmed} onClick={()=>void apply()}>Применить период учёта</button></section>}
 {draft.command&&<><p role="alert">Результат пока не подтверждён. Проверка повторит сохранённую команду.</p><button className="w6-button" disabled={busy} onClick={()=>void apply()}>Проверить результат периода</button></>}{warning&&<p role="alert">{warning}</p>}<p role="status">{message}</p></section>
}
export default function LobbyEconomy({accountId,lobbyId,view}:{accountId:string;lobbyId:string;view:View}){
 const [opened,setOpened]=useState(false),economy=view.economy??emptyEconomy()
 return <section><button className="w6-button" onClick={()=>setOpened(!opened)}>{opened?'Свернуть периоды учёта':'Открыть периоды учёта'}</button>{opened&&<>
  <EconomySettings accountId={accountId} lobbyId={lobbyId} view={view}/><EconomyPeriod accountId={accountId} lobbyId={lobbyId} view={view}/>
  {economy.lastRun&&<details aria-label="Последний применённый учёт"><summary>Последний применённый учёт</summary>{summaryRows(economy.lastRun.summary)}</details>}
 </>}</section>
}
