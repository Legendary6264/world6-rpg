import {useCallback,useEffect,useMemo,useState} from 'react'
import type {Scene,SceneActor,ScenePosition,SceneState} from './sceneTypes'
import type {DeclaredAction} from './actionDeclarations'
import type {SceneAbilityAim} from './sceneAbilityAim'
import {playtestMap,playtestOptions,applyPlaytestActions,previewPlaytestActions} from './scenePlaytest'
import type {PlaytestRecording} from './scenePlaytest'
import {emptyQuickAction,gameActionLabel} from './gameControls'
import {operationLabels} from './tabletopInteractions'
import {sceneEditorId} from './sceneEditorId'
import SceneAimCoordinates from './SceneAimCoordinates'
import GameActionBar from './GameActionBar'
import PerceivedScene from './PerceivedScene'
import {resolvePlaytestTrajectory,physicalPlaytestAbility} from './scenePlayTrajectory'
import usePlaytestReplay from './usePlaytestReplay'
import type {ReplaySession} from './usePlaytestReplay'
import ScenePlayReplay from './ScenePlayReplay'

type SaveResult={ok:boolean;message:string}
type Confirmation={before:Scene;after:Scene;recording:PlaytestRecording;beforeLog:string[];afterLog:string[]}
export default function ScenePlaytest({value,actors,onChange}:{value:SceneState;actors:SceneActor[];onChange:(value:SceneState)=>SaveResult}){
 const scene=value.scenes.find(s=>s.id===value.activeSceneId)??value.scenes[0]
 if(!scene)return <p>Сначала создай сцену в редакторе.</p>
 return <PlayScene key={scene.id} scene={scene} actors={actors} onChange={next=>onChange({...value,scenes:value.scenes.map(s=>s.id===next.id?next:s)})} scenePicker={disabled=><label className="w6-field"><span>Сцена для пробы</span><select aria-label="Сцена для пробы" disabled={disabled} value={scene.id} onChange={e=>onChange({...value,activeSceneId:e.currentTarget.value})}>{value.scenes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}/>
}
function PlayScene({scene,actors,onChange,scenePicker}:{scene:Scene;actors:SceneActor[];onChange:(scene:Scene)=>SaveResult;scenePicker:(disabled:boolean)=>React.ReactNode}){
 const [heroChoice,setHeroChoice]=useState(scene.tokens.find(t=>t.actorId.startsWith('preview-player-'))?.actorId??scene.tokens[0]?.actorId??'')
 const actorId=scene.tokens.some(t=>t.actorId===heroChoice)?heroChoice:scene.tokens[0]?.actorId??''
 const [draft,setDraft]=useState(emptyQuickAction),[queue,setQueue]=useState<DeclaredAction[]>([]),[source,setSource]=useState(''),[objectId,setObjectId]=useState(''),[contactId,setContactId]=useState('')
 const [point,setPoint]=useState<ScenePosition|null>(null),[abilityAim,setAbilityAim]=useState<SceneAbilityAim|null>(null),[message,setMessage]=useState('Выбери предмет или способность. Действия сначала попадут в план.')
 const [past,setPast]=useState<Confirmation[]>([]),[future,setFuture]=useState<Confirmation[]>([]),[log,setLog]=useState<string[]>([]),[reactionKeys,setReactionKeys]=useState<string[]>([])
 const [obstacles,setObstacles]=useState(true)
 const [recording,setRecording]=useState<ReplaySession|null>(null),sceneJSON=useMemo(()=>JSON.stringify(scene),[scene])
 const session=recording?.expectedScene===sceneJSON?recording:null,playback=usePlaytestReplay(session),reviewing=!!session,frame=playback.frame
 const map=useMemo(()=>playtestMap(scene,actors,actorId),[scene,actors,actorId]),options=useMemo(()=>playtestOptions(map),[map])
 const viewMap=useMemo(()=>frame?{...playtestMap(frame.scene,actors,actorId,frame.visuals),description:session?.kind==='plan'?'Предпросмотр плана. Изменения ещё не подтверждены мастером.':'Повтор подтверждения. Показано состояние сцены в момент действия.'}:map,[frame?.scene,frame?.visuals,map,actors,actorId,session?.kind])
 useEffect(()=>{if(recording&&recording.expectedScene!==sceneJSON){setRecording(null);setMessage('Сцена изменилась. Просмотр остановлен.')}},[sceneJSON,recording])
 const stale=queue.length>0&&source!==JSON.stringify(scene)
 const plan=useMemo(()=>{if(!queue.length||stale)return {value:null,error:''};try{return {value:previewPlaytestActions(scene,actors,actorId,queue,reactionKeys,{obstacles}),error:''}}catch(e){return {value:null,error:(e as Error).message}}},[scene,actors,actorId,queue,reactionKeys,stale,obstacles])
 const resolveAim=useCallback((aim:SceneAbilityAim)=>resolvePlaytestTrajectory(scene,aim,draft.ability,{obstacles}),[scene,draft.ability,obstacles])
 const reactions=plan.value?.reactions??[],reactionStamp=reactions.map(r=>r.key).join('|')
 useEffect(()=>{const available=new Set(reactions.map(r=>r.key));setReactionKeys(keys=>{const next=keys.filter(key=>available.has(key));return next.length===keys.length?keys:next})},[reactionStamp])
 const undo=past.at(-1),redo=future.at(-1)
 function closeReview(){setRecording(null)}
 function review(value:PlaytestRecording,kind:ReplaySession['kind'],expectedScene=sceneJSON){setRecording({...value,id:sceneEditorId(),kind,expectedScene,autoplay:kind==='confirmation'})}
 function clearPlan(){setQueue([]);setReactionKeys([]);setSource('')}
 function add(action:DeclaredAction){
  if(reviewing||!actorId||stale||queue.length>=20){setMessage('Проверь героя и очередь. Если сцена изменилась, составь план заново.');return false}
  if(!queue.length)setSource(JSON.stringify(scene));setReactionKeys([]);setQueue(q=>[...q,action]);setMessage('Действие в плане. Сцена изменится после подтверждения мастером.');return true
 }
 function confirm(){
  if(reviewing||stale||plan.error)return
  try{
   const result=applyPlaytestActions(scene,actors,actorId,queue,sceneEditorId(),reactionKeys,{obstacles}),saved=onChange(result.scene)
   if(!saved.ok){setMessage(saved.message);return}
   const nextLog=[...result.log,...log].slice(0,30)
   setPast(items=>[...items.slice(-11),{before:scene,after:result.scene,recording:result,beforeLog:log,afterLog:nextLog}]);setFuture([])
   setLog(nextLog);clearPlan();review(result,'confirmation',JSON.stringify(result.scene));setMessage('Действия подтверждены. Открыт последовательный повтор; результат сохранён.')
  }catch(e){setMessage((e as Error).message)}
 }
 function restore(direction:'undo'|'redo'){
  const entry=direction==='undo'?undo:redo;if(reviewing||!entry)return
  const expected=direction==='undo'?entry.after:entry.before;if(sceneJSON!==JSON.stringify(expected))return
  const target=direction==='undo'?entry.before:entry.after,saved=onChange(target)
  if(!saved.ok){setMessage(saved.message);return}
  if(direction==='undo'){setPast(items=>items.slice(0,-1));setFuture(items=>[...items,entry]);setLog(entry.beforeLog)}
  else{setFuture(items=>items.slice(0,-1));setPast(items=>[...items,entry]);setLog(entry.afterLog);review(entry.recording,'confirmation',JSON.stringify(target))}
  clearPlan();setMessage(direction==='undo'?'Последнее подтверждение отменено.':'Подтверждение восстановлено.')
 }
 return <section className="gb-playtest" aria-label="Проба игрока и способностей">
  <header><div><small>ИГРОК И МАСТЕР</small><h2>Способности и окружение</h2><p>Визуальная проба способностей без урона и затрат ресурсов. Действия с предметами и реакции окружения подтверждает мастер.</p></div>{scenePicker(!!queue.length||reviewing)}</header>
  <div className="gb-playtest-layout"><div className="gb-playtest-view"><PerceivedScene map={viewMap} abilityAim={reviewing?null:abilityAim} effectTimeMs={frame?.effectTimeMs} pickedPoint={reviewing?null:point} selected={reviewing?'':contactId} selectedObject={reviewing?'':objectId} onPoint={reviewing?undefined:setPoint} onObject={reviewing?undefined:id=>{setObjectId(id);setContactId('')}} onSelect={reviewing?undefined:id=>{setContactId(id);setObjectId('')}} onObjectMove={reviewing?undefined:(id,p)=>add({kind:'interact',target:{kind:'object',id},operation:'relocate',destination:p,note:''})}/>{session&&<ScenePlayReplay session={session} playback={playback} options={options} onClose={closeReview}/>}</div>
   <aside className="gb-playtest-panel"><fieldset className="gb-playtest-edit" disabled={reviewing}>
    <label className="w6-field"><span>Управляемый герой</span><select aria-label="Управляемый герой" value={actorId} disabled={!!queue.length} onChange={e=>{setHeroChoice(e.currentTarget.value);setPoint(null);setObjectId('');setContactId('')}}>{scene.tokens.map(t=><option key={t.actorId} value={t.actorId}>{actors.find(a=>a.id===t.actorId)?.name??'Герой'}</option>)}</select></label>
    {!actorId&&<p>На этой сцене нет героев. Добавь героя в редакторе для пробы.</p>}
    <label className="w6-field"><span>Предмет в окружении</span><select aria-label="Предмет в окружении" value={objectId} onChange={e=>{setObjectId(e.currentTarget.value);setContactId('')}}><option value="">Выбери на сцене или в списке</option>{scene.objects.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <SceneAimCoordinates point={point} groundZ={scene.groundZ} onChange={p=>{setPoint(p);if(draft.mode==='ability')setDraft(d=>({...d,aim:'point'}))}}/>
    <section className="gb-playtest-trajectory" aria-label="Траектория способности"><label><input type="checkbox" checked={obstacles} disabled={!!queue.length} onChange={e=>{setObstacles(e.currentTarget.checked);setReactionKeys([])}}/>Преграды для огня и воды</label><p>{obstacles?'Центральная траектория останавливается у габаритов твёрдых предметов и земли. Открытая дверь пропускает эффект.':'Свободный просмотр: огонь и вода проходят сквозь окружение.'} Мелкие проёмы и обход преград оценивает мастер.</p>{draft.mode==='ability'&&physicalPlaytestAbility(draft.ability)&&abilityAim?.obstruction&&<strong>Первое пересечение: {abilityAim.obstruction.name} · {abilityAim.obstruction.distanceM.toFixed(2)} м <small>X {abilityAim.obstruction.point.x.toFixed(2)} · Y {abilityAim.obstruction.point.y.toFixed(2)} · Z {abilityAim.obstruction.point.z.toFixed(2)}</small></strong>}{!!queue.length&&<small>Прицел показывает текущую сцену. Пересечения действий в плане рассчитаны по порядку.</small>}</section>
    <GameActionBar environmentOnly map={map} point={point} contactId={contactId} objectId={objectId} options={options} disabled={!actorId||stale||queue.length>=20} draft={draft} onChange={setDraft} onAdd={add} onAimChange={setAbilityAim} resolveAim={resolveAim}/>
    <section className="gb-playtest-queue" aria-label="План игрока"><h3>План игрока <span>{queue.length}/20</span></h3>{!queue.length?<p>Выбери действие — оно появится здесь.</p>:<ol>{queue.map((a,i)=>{const impact=plan.value?.impacts.find(v=>v.actionIndex===i);return <li key={i}><span>{gameActionLabel(a,options)}{a.kind==='interact'&&a.target.kind==='object'?' · '+scene.objects.find(o=>o.id===('id' in a.target?a.target.id:''))?.name:''}{impact&&<small className="gb-playtest-impact">Столкновение: {impact.hit.name} · {impact.hit.distanceM.toFixed(2)} м</small>}</span><button type="button" aria-label={'Убрать действие '+(i+1)} onClick={()=>{setReactionKeys([]);setQueue(q=>q.filter((_,n)=>n!==i))}}>×</button></li>})}</ol>}</section>
    {stale&&<p role="alert">Сцена изменилась. Очисти план и проверь цели заново.</p>}{plan.error&&<p role="alert">{plan.error}</p>}
    {!!reactions.length&&<section className="gb-playtest-reactions" aria-label="Реакции окружения"><h3>Реакции окружения</h3><p>В этой пробе огонь может зажечь источник света, а вода — погасить.{obstacles?' Преграды учтены по габаритам.':' Проверка преград отключена.'} Мастер выбирает изменения.</p>{reactions.map(r=><label key={r.key}><input type="checkbox" checked={reactionKeys.includes(r.key)} onChange={e=>{const checked=e.currentTarget.checked;setReactionKeys(keys=>checked?[...keys,r.key]:keys.filter(k=>k!==r.key))}}/><span>{operationLabels[r.operation]} «{r.name}»<small>{r.abilityName} · действие {r.actionIndex+1}</small></span></label>)}<small>Выбрано: {reactionKeys.length}. Без отметки состояние предмета сохранится.</small></section>}
    <div className="gb-playtest-master" aria-label="Подтверждение мастера"><h3>Решение мастера</h3><button className="w6-button" type="button" disabled={!plan.value||stale||!!plan.error} onClick={()=>{if(plan.value)review(plan.value,'plan')}}>Посмотреть план</button><button className="w6-button w6-primary" type="button" disabled={!queue.length||stale||!!plan.error} onClick={confirm}>Подтвердить действия</button><button className="w6-button" type="button" disabled={!queue.length} onClick={()=>{clearPlan();setMessage('План очищен.')}}>Очистить план</button><button className="w6-button" type="button" disabled={!undo||sceneJSON!==JSON.stringify(undo.after)} onClick={()=>restore('undo')}>Отменить подтверждение</button><button className="w6-button" type="button" disabled={!redo||sceneJSON!==JSON.stringify(redo.before)} onClick={()=>restore('redo')}>Повторить подтверждение</button><button className="w6-button" type="button" disabled={!undo||sceneJSON!==JSON.stringify(undo.after)} onClick={()=>{if(undo)review(undo.recording,'confirmation')}}>Просмотреть последнее подтверждение</button><small>История: {past.length} / 12 · вернуть: {future.length}</small></div>
    <p className="gb-playtest-message" role="status">{message}</p>
    {!!log.length&&<details><summary>Журнал пробы</summary>{log.map((text,i)=><p key={i}>{text}</p>)}</details>}
   </fieldset></aside>
  </div>
 </section>
}
