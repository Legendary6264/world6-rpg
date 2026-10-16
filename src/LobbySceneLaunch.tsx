import { useEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { useRemote } from './onlineHooks'
import type { SceneState } from './sceneTypes'
import type { GameSceneSetup } from './gameScene'
import { isGameSceneSetup } from './gameScene'
import SceneViewport from './SceneViewport'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
type SetupView={revision:number;scenes:SceneState;actors:{id:string;name:string;approved:boolean;npc:boolean}[]}
type Draft={setup:GameSceneSetup;revision?:number}
const valid=(v:unknown):v is Draft=>!!v&&typeof v==='object'&&!!(v as Draft).setup&&typeof (v as Draft).setup.sceneId==='string'&&Array.isArray((v as Draft).setup.actorIds)&&Array.isArray((v as Draft).setup.objectIds)&&Array.isArray((v as Draft).setup.contactIds)&&typeof (v as Draft).setup.title==='string'&&typeof (v as Draft).setup.description==='string'&&!!(v as Draft).setup.anchor&&typeof (v as Draft).setup.revealTerrain==='boolean'&&isGameSceneSetup({...((v as Draft).setup),actorIds:(v as Draft).setup.actorIds.length?(v as Draft).setup.actorIds:['draft'],title:(v as Draft).setup.title||'Черновик',revealTerrain:true})&&((v as Draft).revision===undefined||Number.isSafeInteger((v as Draft).revision))
export default function LobbySceneLaunch({accountId,lobbyId,disabled}:{accountId:string;lobbyId:string;disabled:boolean}){
 const {request,refresh}=useOnline(),path='/lobbies/'+lobbyId+'/play/setup',remote=useRemote<SetupView>(path),key=lobbyFormKey('game-scene',accountId,lobbyId)
 const [draft,setDraft]=useState<Draft>(()=>readLobbyForm(key,valid)??{setup:{sceneId:'',actorIds:[],objectIds:[],contactIds:[],title:'',description:'',anchor:{x:3,y:3,z:0},revealTerrain:false}})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),pending=useRef<AbortController|null>(null)
 useEffect(()=>()=>pending.current?.abort(),[])
 const value=remote.value,s=draft.setup,scene=value?.scenes.scenes.find(c=>c.id===s.sceneId),stale=draft.revision!==undefined&&value?.revision!==draft.revision
 function remember(setup:GameSceneSetup){const next={setup,revision:draft.revision??value?.revision};setDraft(next);if(!writeLobbyForm(key,next))setMessage('Черновик подготовки не удалось сохранить на устройстве.')}
 function toggle(field:'actorIds'|'objectIds'|'contactIds',id:string,checked:boolean){remember({...s,[field]:checked?[...s[field],id]:s[field].filter(v=>v!==id),...(field==='actorIds'&&!checked?{contactIds:s.contactIds.filter(v=>v!==id)}:{})})}
 async function launch(){
  if(disabled||busy||remote.loading||stale||!isGameSceneSetup(s)||pending.current)return
  const abort=new AbortController();pending.current=abort;setBusy(true)
  try{const r=await request<{revision:number}>(path,{method:'POST',signal:abort.signal,body:JSON.stringify({revision:draft.revision??value?.revision,setup:s})});if(abort.signal.aborted)return
   const next={setup:{...s,revealTerrain:false},revision:r.revision};setDraft(next);writeLobbyForm(key,next);setMessage('Герои размещены, выбранная обстановка открыта. Во вкладке «Раунд» начни приём заявлений для этой сцены.');refresh()
  }catch(e){if(!abort.signal.aborted)setMessage((e as Error).message)}finally{if(!abort.signal.aborted){pending.current=null;setBusy(false)}}
 }
 return <section className="gb-game-launch"><h3>Подготовить сцену к игре</h3><p>Выбери принятых героев, точку входа и видимые детали. Уже стоящие здесь герои сохранят положение. Время мира не меняется.</p><p role="status">{remote.loading?'Загружаем сцены…':remote.error}</p>
  <fieldset disabled={disabled||busy||remote.loading||!value}><label className="w6-field"><span>Игровая сцена</span><select aria-label="Игровая сцена" value={s.sceneId} onChange={e=>{const selected=value?.scenes.scenes.find(c=>c.id===e.currentTarget.value);if(selected)remember({...s,sceneId:selected.id,title:selected.name,description:'',objectIds:[],contactIds:[],anchor:{x:Math.min(3,selected.width/2),y:Math.min(3,selected.depth/2),z:selected.groundZ},revealTerrain:false})}}><option value="">Выбери сцену</option>{value?.scenes.scenes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  {value&&!value.scenes.scenes.length&&<p>Сначала создай сцену в редакторе или используй кампанию «Ночной переход».</p>}
  {scene&&<><SceneViewport scene={scene} actors={value!.actors.map(a=>({...a,profile:{}}))} selection={null} selecting onPoint={p=>remember({...s,anchor:{x:p.x,y:p.y,z:scene.groundZ}})} onSelect={()=>{}}/>
   <p>Точка входа: {s.anchor.x}; {s.anchor.y}; {s.anchor.z} м. Нажми на свободное место карты, чтобы изменить её.</p>
   <label className="w6-field"><span>Название для игроков</span><input aria-label="Название игровой сцены" value={s.title} maxLength={120} onChange={e=>remember({...s,title:e.currentTarget.value})}/></label>
   <label className="w6-field"><span>Что видят герои</span><textarea aria-label="Описание игровой обстановки" value={s.description} maxLength={4000} rows={3} onChange={e=>remember({...s,description:e.currentTarget.value})}/></label>
   <div className="gb-launch-options"><fieldset><legend>Герои на старте</legend>{value?.actors.filter(a=>a.approved&&!a.npc).map(a=><label key={a.id} className="gb-disclosure-row"><input type="checkbox" aria-label={'Ввести в игру '+a.name} checked={s.actorIds.includes(a.id)} onChange={e=>toggle('actorIds',a.id,e.currentTarget.checked)}/>{a.name}</label>)}</fieldset>
    <fieldset><legend>Объекты, видимые игрокам</legend>{scene.objects.map(o=><label key={o.id} className="gb-disclosure-row"><input type="checkbox" aria-label={'Показать объект '+o.name} checked={s.objectIds.includes(o.id)} onChange={e=>toggle('objectIds',o.id,e.currentTarget.checked)}/>{o.name}</label>)}</fieldset>
    <fieldset><legend>Узнанные существа</legend>{value?.actors.filter(a=>scene.tokens.some(t=>t.actorId===a.id)||s.actorIds.includes(a.id)).map(a=><label key={a.id} className="gb-disclosure-row"><input type="checkbox" aria-label={'Показать существо '+a.name} checked={s.contactIds.includes(a.id)} onChange={e=>toggle('contactIds',a.id,e.currentTarget.checked)}/>{a.name}</label>)}</fieldset></div>
   <label><input type="checkbox" aria-label="Раскрыть местность выбранным героям" checked={s.revealTerrain} onChange={e=>remember({...s,revealTerrain:e.currentTarget.checked})}/> Показать выбранным героям всю местность этой сцены, её фон и отмеченные выше объекты и существа</label>
   <p className="w6-copy">Для тумана войны и частичного раскрытия используй индивидуальные инструменты героя. Здесь мастер явно открывает общую площадку.</p>
  </>}
  {stale&&<><p role="alert">Кампания изменилась. Проверь выбор и точку входа.</p><button type="button" className="w6-button" onClick={()=>{const next={...draft,revision:value?.revision};setDraft(next);writeLobbyForm(key,next)}}>Подготовка проверена с текущей версией</button></>}
  <button type="button" className="w6-button w6-primary" disabled={!scene||!isGameSceneSetup(s)||!!stale} onClick={()=>void launch()}>Разместить героев и открыть сцену</button>
  </fieldset><p role="status">{message}</p>
 </section>
}
