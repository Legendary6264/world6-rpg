import {useEffect,useRef,useState} from 'react'
import {useOnline} from './onlineContext'
import {useRemote} from './onlineHooks'
import {NetworkError} from './onlineClient'
import {lobbyFormKey,readLobbyForm,writeLobbyForm} from './lobbyFormDrafts'
import {isStoryAck,isStoryBeats,newStoryBeat,storyBeatLabels,MAX_STORY_BEATS} from './campaignStory'
import type {StoryBeat,StoryMasterView,StoryMessage} from './campaignStory'
import LobbyWorkbench from './LobbyWorkbench'
import './storyStyle.css'

type Composer={kind:'narration'|'npc';sceneId:string;npcId:string;speaker:string;body:string;audience:string[];replyTo:string}
type Draft={plan:StoryBeat[]|null;version?:number;selected:string;composer:Composer;command?:{operation:'plan'|'publish';body:string}}
const blankComposer=():Composer=>({kind:'narration',sceneId:'',npcId:'',speaker:'',body:'',audience:[],replyTo:''})
function valid(value:unknown):value is Draft{
  if(!value||typeof value!=='object')return false
  const d=value as Draft,c=d.composer
  return (d.plan===null||Array.isArray(d.plan)&&isStoryBeats(d.plan.map(beat=>({...beat,title:beat.title||'Черновик'}))))&&
    typeof d.selected==='string'&&(d.version===undefined||Number.isSafeInteger(d.version))&&!!c&&['narration','npc'].includes(c.kind)&&
    [c.sceneId,c.npcId,c.speaker,c.replyTo].every(field=>typeof field==='string'&&field.length<=160)&&typeof c.body==='string'&&c.body.length<=4000&&
    Array.isArray(c.audience)&&c.audience.length<=200&&c.audience.every(id=>typeof id==='string')&&
    (!d.command||['plan','publish'].includes(d.command.operation)&&typeof d.command.body==='string'&&d.command.body.length<=1200000)
}
export default function LobbyStory({accountId,lobbyId,checkingAccess,onNpcs,onRound}:{
  accountId:string;lobbyId:string;checkingAccess:boolean;onNpcs?:()=>void;onRound:()=>void
}){
  const {request,refresh}=useOnline(),path='/lobbies/'+lobbyId+'/play/story'
  const remote=useRemote<StoryMasterView>(checkingAccess?null:path),key=lobbyFormKey('story-master',accountId,lobbyId)
  const [draft,setDraft]=useState<Draft>(()=>readLobbyForm(key,valid)??{plan:null,selected:'',composer:blankComposer()})
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[warning,setWarning]=useState('')
  const [section,setSection]=useState('conversation')
  const pending=useRef<AbortController|null>(null),mounted=useRef(false)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort()}},[])
  useEffect(()=>()=>{pending.current?.abort()},[request,key])
  const value=checkingAccess?null:remote.value,locked=checkingAccess||remote.loading||busy||!!draft.command||!!value?.closed
  const plan=draft.plan??value?.beats??[],selected=plan.find(beat=>beat.id===draft.selected)??plan[0]
  const composer=draft.composer,sceneId=composer.sceneId||value?.activeSceneId||''
  const heroes=value?.heroes.filter(hero=>hero.sceneId===sceneId)??[]
  const npcs=value?.npcs.filter(npc=>npc.sceneId===sceneId)??[]
  const stale=draft.version!==undefined&&value?.planVersion!==draft.version
  function remember(next:Draft){setDraft(next);const saved=writeLobbyForm(key,next);setWarning(saved?'':'Черновик доступен до закрытия страницы.');return saved}
  function compose(patch:Partial<Composer>){remember({...draft,composer:{...composer,...patch}});setMessage('')}
  function editBeat(patch:Partial<StoryBeat>){
    if(!selected)return
    const next=plan.map(beat=>beat.id===selected.id?{...beat,...patch}:patch.status==='active'&&beat.status==='active'?{...beat,status:'planned' as const}:beat)
    remember({...draft,plan:next,version:draft.version??value?.planVersion})
  }
  function prepareBeat(kind:'narration'|'npc'){
    if(!selected)return
    compose({kind,sceneId:selected.sceneId||value?.activeSceneId||'',npcId:kind==='npc'?selected.npcId:'',
      speaker:selected.alias,body:kind==='npc'?selected.reply:selected.opening,audience:[],replyTo:''})
    setSection('conversation')
    setMessage('Текст перенесён в поле публикации. Выбери получателей и проверь реплику.')
  }
  function answer(entry:StoryMessage){
    const npc=value?.npcs.find(n=>n.id===entry.targetId&&n.sceneId===entry.sceneId)
    compose({kind:npc?'npc':'narration',sceneId:entry.sceneId,npcId:npc?.id??'',speaker:entry.targetLabel,
      body:'',audience:[entry.actorId],replyTo:entry.id})
  }
  async function send(operation:'plan'|'publish'){
    if(checkingAccess||pending.current||remote.loading||!value||!draft.command&&(value.closed||operation==='publish'&&value.paused))return
    if(!draft.command&&operation==='plan'&&(stale||!isStoryBeats(plan))){setMessage('Заполни названия эпизодов и сверь версию плана.');return}
    const command=draft.command??{operation,body:JSON.stringify(operation==='plan'?
      {baseVersion:draft.version??value.planVersion,beats:plan,commandKey:'story:'+crypto.randomUUID()}:
      {...composer,sceneId,commandKey:'story:'+crypto.randomUUID()})}
    if(!remember({...draft,command})){setMessage('Освободи место на устройстве перед отправкой.');return}
    const abort=new AbortController();pending.current=abort;setBusy(true)
    try{
      const reply=await request<{receipt:{operation:string};duplicate:boolean}>(path+'/'+command.operation,{method:'POST',body:command.body,signal:abort.signal})
      if(!mounted.current||abort.signal.aborted)return
      const expected=command.operation==='plan'?'story-plan':'story-publish'
      if(!isStoryAck(reply,expected,JSON.parse(command.body).commandKey))throw Error('Сервер не подтвердил сохранение. Повтори ту же команду.')
      remember({...draft,command:undefined,...(command.operation==='plan'?{plan:null,version:undefined}:{composer:{...composer,body:'',replyTo:''}})})
      setMessage(command.operation==='plan'?'План сохранён.':'Реплика опубликована выбранным героям.');refresh()
    }catch(error){if(mounted.current&&!abort.signal.aborted){if(error instanceof NetworkError&&[400,403,404,409,413].includes(error.status))remember({...draft,command:undefined});setMessage((error as Error).message);refresh()}}
    finally{if(mounted.current&&pending.current===abort){pending.current=null;setBusy(false)}}
  }
  return <section className="gb-story-panel" aria-label="Ведение приключения">
    <header className="gb-story-heading"><div><small>Стол мастера</small><h4>Ведение приключения</h4></div><div className="w6-buttons">
      {onNpcs&&<button className="w6-button" onClick={onNpcs}>Персонажи и мир</button>}
      <button className="w6-button" onClick={onRound}>Ходы и способности</button>
    </div></header>
    {remote.error&&<p role="alert">{remote.error}</p>}
    {value?.paused&&<p role="status">Игра на паузе. Можно подготовить план и реплики; публикация доступна после продолжения сессии.</p>}
    {value&&<><div className="gb-story-party" aria-label="Герои на сцене">{heroes.map(hero=><span key={hero.id}>{hero.name} · {hero.submitted?'ход получен':'ожидаем ход'}</span>)}</div>
    <LobbyWorkbench label="Ведение сцены" selectedId={section} onSelectSection={setSection} sections={[
      {id:'conversation',label:'Реплики и вопросы',content:<>
        {!!value.pending.length&&<section aria-label="Вопросы игроков"><h4>Вопросы игроков</h4>{value.pending.map(entry=><article className="gb-story-question" key={entry.id}>
          <strong>{entry.speaker} → {entry.targetLabel}</strong><p className="w6-prose">{entry.body}</p>
          <button className="w6-button" disabled={locked} onClick={()=>answer(entry)}>Ответить {entry.speaker}</button>
        </article>)}</section>}
        <form aria-label="Реплика мастера" onSubmit={event=>{event.preventDefault();void send('publish')}}><fieldset disabled={locked}>
          <div className="gb-story-fields">
            <label className="w6-field"><span>Сцена разговора</span><select aria-label="Сцена разговора" value={sceneId} onChange={e=>compose({sceneId:e.currentTarget.value,audience:[],replyTo:'',npcId:''})}>
              <option value="">Выбери сцену</option>{value.scenes.map(scene=><option key={scene.id} value={scene.id}>{scene.name}</option>)}
            </select></label>
            <label className="w6-field"><span>От кого реплика</span><select aria-label="Вид реплики мастера" value={composer.kind} onChange={e=>compose({kind:e.currentTarget.value as Composer['kind'],npcId:'',speaker:''})}>
              <option value="narration">Описание мастера</option><option value="npc">Персонаж мастера</option>
            </select></label>
          </div>
          {composer.kind==='npc'&&<div className="gb-story-fields">
            <label className="w6-field"><span>НПС на сцене</span><select aria-label="Говорящий НПС" value={composer.npcId} required onChange={e=>compose({npcId:e.currentTarget.value})}>
              <option value="">Выбери НПС</option>{npcs.map(npc=><option key={npc.id} value={npc.id}>{npc.name}</option>)}
            </select></label>
            <label className="w6-field"><span>Как назвать его игрокам</span><input aria-label="Имя говорящего для игроков" maxLength={120} required value={composer.speaker} placeholder="Например, Страж у ворот" onChange={e=>compose({speaker:e.currentTarget.value})}/></label>
          </div>}
          {!!composer.replyTo&&<p>Ответ на выбранный вопрос. <button type="button" className="w6-button" onClick={()=>compose({replyTo:''})}>Отдельная реплика</button></p>}
          <label className="w6-field"><span>{composer.kind==='npc'?'Слова персонажа':'Что видят и узнают герои'}</span><textarea aria-label="Текст реплики мастера" required rows={4} maxLength={4000} value={composer.body} onChange={e=>compose({body:e.currentTarget.value})}/></label>
          <fieldset><legend>Кто получит текст</legend><div className="gb-story-audience">{heroes.map(hero=><label key={hero.id}><input type="checkbox" checked={composer.audience.includes(hero.id)}
            onChange={e=>compose({audience:e.currentTarget.checked?[...composer.audience,hero.id]:composer.audience.filter(id=>id!==hero.id)})}/>{hero.name}</label>)}</div>
            {!heroes.length&&<p>Размести принятых героев на сцене и открой им обстановку.</p>}
            {!!heroes.length&&<button type="button" className="w6-button" onClick={()=>compose({audience:heroes.map(hero=>hero.id)})}>Всем героям этой сцены</button>}
          </fieldset>
          <p className="gb-game-help">Выбранные герои получат текст после публикации. Перемещение, бой и расходы способности оформляются ходом.</p>
          <button className="w6-button w6-primary" disabled={value.paused||!composer.body.trim()||!composer.audience.length||composer.kind==='npc'&&(!composer.npcId||!composer.speaker.trim())}>Опубликовать выбранным героям</button>
        </fieldset></form>
        {!!value.messages.length&&<details className="gb-story-history"><summary>История сцены</summary><div className="gb-story-feed" role="log" aria-label="История мастера">
          {value.messages.filter(entry=>entry.sceneId===sceneId).slice(-30).map(entry=><article key={entry.id}><strong>{entry.speaker}</strong><small> · {entry.seconds} с · получателей {entry.audience.length}</small><p className="w6-prose">{entry.body}</p></article>)}
        </div></details>}
      </>},
      {id:'plan',label:'План и заготовки',content:<>
        <p className="w6-copy">План и заметки видны ведущим. Вступление и подготовленная реплика попадут к героям после публикации.</p>
        <div className="gb-story-layout"><nav className="gb-story-beats" aria-label="Эпизоды приключения">
          {plan.map(beat=><button className="w6-button" aria-pressed={selected?.id===beat.id} key={beat.id} onClick={()=>remember({...draft,selected:beat.id})}>{beat.title||'Новый эпизод'}<small>{storyBeatLabels[beat.status]}</small></button>)}
          <button className="w6-button" disabled={locked||plan.length>=MAX_STORY_BEATS} onClick={()=>{const beat=newStoryBeat(crypto.randomUUID());remember({...draft,plan:[...plan,beat],selected:beat.id,version:draft.version??value.planVersion})}}>Добавить эпизод</button>
        </nav>{selected?<fieldset className="gb-story-editor" disabled={locked}>
          <label className="w6-field"><span>Название эпизода</span><input aria-label="Название эпизода" maxLength={120} value={selected.title} onChange={e=>editBeat({title:e.currentTarget.value})}/></label>
          <div className="gb-story-fields"><label className="w6-field"><span>Состояние эпизода</span><select aria-label="Состояние эпизода" value={selected.status} onChange={e=>editBeat({status:e.currentTarget.value as StoryBeat['status']})}>
            {Object.entries(storyBeatLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
            <label className="w6-field"><span>Игровая сцена</span><select aria-label="Сцена эпизода" value={selected.sceneId} onChange={e=>editBeat({sceneId:e.currentTarget.value})}>
              <option value="">Выбрать позже</option>{value.scenes.map(scene=><option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label></div>
          <label className="w6-field"><span>Вступление для игроков</span><textarea aria-label="Вступление эпизода" rows={3} maxLength={4000} value={selected.opening} onChange={e=>editBeat({opening:e.currentTarget.value})}/></label>
          <label className="w6-field"><span>Заметки мастера</span><textarea aria-label="Заметки эпизода" rows={4} maxLength={8000} placeholder="Цель сцены, мотив НПС, улики, варианты решения и последствия" value={selected.notes} onChange={e=>editBeat({notes:e.currentTarget.value})}/></label>
          <details><summary>Подготовленная реплика НПС</summary>
            <label className="w6-field"><span>НПС эпизода</span><select aria-label="НПС эпизода" value={selected.npcId} onChange={e=>editBeat({npcId:e.currentTarget.value})}>
              <option value="">Выбрать позже</option>{value.npcs.map(npc=><option key={npc.id} value={npc.id}>{npc.name}</option>)}</select></label>
            <label className="w6-field"><span>Имя для игроков</span><input aria-label="Имя НПС эпизода" maxLength={120} value={selected.alias} onChange={e=>editBeat({alias:e.currentTarget.value})}/></label>
            <label className="w6-field"><span>Заготовка ответа</span><textarea aria-label="Заготовка ответа НПС" maxLength={4000} rows={3} value={selected.reply} onChange={e=>editBeat({reply:e.currentTarget.value})}/></label>
          </details>
          <div className="w6-buttons"><button className="w6-button" disabled={!selected.opening.trim()} onClick={()=>prepareBeat('narration')}>Подготовить вступление</button>
            <button className="w6-button" disabled={!selected.reply.trim()||!selected.npcId} onClick={()=>prepareBeat('npc')}>Подготовить ответ НПС</button>
            <button className="w6-button" onClick={()=>remember({...draft,plan:plan.filter(beat=>beat.id!==selected.id),selected:'',version:draft.version??value.planVersion})}>Убрать эпизод</button></div>
        </fieldset>:<p>Создай первый эпизод и запиши завязку, цель и возможные решения.</p>}</div>
        {stale&&<p role="alert">План изменился у другого ведущего. Черновик сохранён. <button className="w6-button" disabled={locked} onClick={()=>remember({...draft,plan:null,version:undefined})}>Загрузить текущий план</button></p>}
        <button className="w6-button w6-primary" disabled={locked||stale||!draft.plan||!isStoryBeats(plan)} onClick={()=>void send('plan')}>Сохранить план приключения</button>
      </>},
    ]}/></>}
    {draft.command&&<button className="w6-button" disabled={checkingAccess||busy||remote.loading} onClick={()=>void send(draft.command!.operation)}>Проверить сохранение истории</button>}
    <p role="status">{message}</p>{warning&&<p role="alert">{warning}</p>}
  </section>
}
