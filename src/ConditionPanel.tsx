import { useState } from 'react'
import type { Actor } from './rpgEngine'
import { activeEffects, physiologyStatus } from './rpgEngine'
import { perceivedBody, perceivedCapabilities } from './bodyPerception'
import { functionalStates, stateById } from './functionalStates'
import type { MechanicalEffect } from './rpgTypes'

export default function ConditionPanel({actor,seconds,onChange,master=false}:{actor:Actor;seconds:number;onChange:(a:Actor)=>void;master?:boolean}){
 const [duration,setDuration]=useState(60),[query,setQuery]=useState('')
 const active=activeEffects(actor.rpg,seconds),status=physiologyStatus(actor,seconds)
 function add(id:string){const state=stateById(id);if(!state||actor.rpg.effects.length>=200)return;const effect:MechanicalEffect={id:crypto.randomUUID(),name:state.name,strength:1,stackKey:'state-'+id,stacking:'refresh',modifiers:structuredClone(state.modifiers),statusEffects:[id],expiresAt:duration?seconds+duration:null,bloodMlPerSecond:0,substituteMl:0,ownerId:'',castId:''};onChange({...actor,rpg:{...actor.rpg,effects:[...actor.rpg.effects.filter(e=>e.stackKey!==effect.stackKey),effect]}})}
 const wounded=perceivedBody(actor.body)

 return <section><p className="w6-eyebrow">{master?'Решения мастера':'Доступные ощущения'}</p><h3>Функциональное состояние</h3><div className="w6-summary-bar"><span>{actor.rpg.dead?'Жизненные функции прекратились':actor.body.consciousness==='unconscious'?'Без сознания':'В сознании'}</span><span>{status.label}</span></div>
 <div className="w6-sensation-grid">{wounded.map(r=><article className="w6-sensation" key={r.region}><h4>{r.label}</h4>{r.symptoms.map(t=><p key={t}>{t}</p>)}{r.diagnoses.map(t=><p key={t}>{t}</p>)}</article>)}{!wounded.length&&<article className="w6-sensation"><h4>Самочувствие</h4><p>Заметных болезненных ощущений нет.</p></article>}{status.deficit>0&&<article className="w6-sensation"><h4>Общее ощущение</h4><p>{status.deficit>=.3?'Сильная слабость, дурнота и трудность концентрации.':'Слабость и головокружение.'}</p></article>}</div>
 <div className="w6-fieldset">{perceivedCapabilities(actor.body).map(t=><p key={t}>{t}</p>)}</div><div className="w6-sensation-grid">{active.map(e=><article className="w6-sensation" key={e.id}><h4>{master?e.name:'Ощущение'}</h4><p>{(e.statusEffects??[]).map(id=>stateById(id)?.sensation).filter(Boolean).join(' ')||'Ощущения этого эффекта описывает мастер.'}</p>{master&&<><small>{e.expiresAt===null?'До снятия':Math.max(0,e.expiresAt-seconds)+' с осталось'}</small><button className="w6-button w6-danger" onClick={()=>onChange({...actor,rpg:{...actor.rpg,effects:actor.rpg.effects.filter(x=>x.id!==e.id)}})}>Снять эффект</button></>}</article>)}</div>
 {master&&<details className="w6-fieldset" open><summary>Назначить эффект</summary><div className="w6-attribute-grid"><label className="w6-field"><span>Поиск</span><input maxLength={120} value={query} onChange={e=>setQuery(e.currentTarget.value)}/></label><label className="w6-field"><span>Длительность (с; 0 — до снятия)</span><input type="number" min={0} max={86400} value={duration} onChange={e=>setDuration(Math.min(86400,Math.max(0,Number(e.currentTarget.value))))}/></label></div><div className="w6-race-cards">{functionalStates.filter(s=>(s.name+' '+s.group).toLowerCase().includes(query.toLowerCase())).map(s=><button className="w6-race-card" key={s.id} onClick={()=>add(s.id)}><small>{s.group}</small><h4>{s.name}</h4><p>{s.sensation}</p></button>)}</div></details>}
 </section>
}
