import {useState} from 'react'
import {actionKinds} from './actionDeclarations'
import type {DeclaredAction,DeclarationTarget} from './actionDeclarations'
import type {ScenePosition} from './sceneTypes'
import {createTutorialSession,tutorialHero,tutorialScene,tutorialMap,tutorialHasWork,openTutorialScene,placeTutorialHero,placeTutorialGuide,discloseTutorialGuide,
 pauseTutorial,clearTutorialStatement,declareTutorial,calculateTutorial,applyTutorial,checkpointTutorial,restoreTutorial,undoTutorial,tutorialStatementLabel} from './tutorialWorld'
import type {TutorialSession,TutorialPreview} from './tutorialWorld'
import type {TutorialPath} from './tutorialProgress'
import PerceivedScene from './PerceivedScene'
import SceneViewport from './SceneViewport'
import {artworkSource} from './visualMedia'
const labels={speak:'Реплика',wait:'Ожидание',open:'Открытие',close:'Закрытие',move:'Движение',item:'Снаряжение',prepare:'Подготовка',ready:'Готовность',release:'Выпуск'}
export default function TutorialSandbox({path}:{path:TutorialPath}){
 const [session,setSession]=useState(()=>createTutorialSession(path)),[preview,setPreview]=useState<TutorialPreview|null>(null),[message,setMessage]=useState('')
 const [kind,setKind]=useState<DeclaredAction['kind']>('move'),[point,setPoint]=useState({x:'7',y:'6',z:'0'}),[target,setTarget]=useState('self')
 const [operation,setOperation]=useState<'inspect'|'open'|'close'>('inspect'),[stage,setStage]=useState<'prepare'|'release'>('prepare'),[wait,setWait]=useState('2'),[speech,setSpeech]=useState('Я готов к переходу.'),[volume,setVolume]=useState<'whisper'|'normal'|'shout'>('normal')
 const hero=tutorialHero(session),scene=tutorialScene(session),map=tutorialMap(session),work=session.world.campaign.roundWork?.entries.find(w=>w.actorId===hero.id),cast=hero.rpg.casts.find(c=>['preparing','ready'].includes(c.status))
 const targets=[{id:'self',label:'Я сам',kind:'self' as const},...(map?.objects.filter(o=>o.visible).map(o=>({id:o.id,label:o.name,kind:'object' as const}))??[]),...(map?.contacts.filter(c=>c.kind==='identified').map(c=>({id:c.id,label:c.label,kind:'contact' as const}))??[])]
 const remaining=work?Number(work.amount.remaining.numerator)/Number(work.amount.remaining.denominator)/1000:0,total=work?Number(work.amount.total.numerator)/Number(work.amount.total.denominator)/1000:0
 function perform(operation:(s:TutorialSession)=>TutorialSession,success='Учебная копия изменена.'){
  try{setSession(operation(session));setPreview(null);setMessage(success)}catch(e){setMessage((e as Error).message)}
 }
 function edited(){setPreview(null);setSession(clearTutorialStatement(session));setMessage('Черновик изменён: заяви его перед расчётом.')}
 function choosePoint(p:ScenePosition){edited();setPoint({x:String(Number(p.x.toFixed(3))),y:String(Number(p.y.toFixed(3))),z:String(Number(p.z.toFixed(3)))})}
 function pointValue():ScenePosition {if(Object.values(point).some(v=>!v.trim()||!Number.isFinite(Number(v))))throw Error('Задай конечные X/Y/Z.');return {x:Number(point.x),y:Number(point.y),z:Number(point.z)}}
 function statement():DeclaredAction {
  const choice=targets.find(t=>t.id===target);if(!choice&&kind==='interact')throw Error('Сначала выбери раскрытую цель.')
  const selected:DeclarationTarget=choice?.kind==='self'?{kind:'self'}:choice?{kind:choice.kind,id:choice.id}:{kind:'self'}
  if(kind==='move')return {kind,note:'',route:[pointValue()],support:'ground'}
  if(kind==='wait')return {kind,note:'',seconds:wait.trim()?Number(wait):NaN}
  if(kind==='interact')return {kind,note:'',target:selected,operation}
  if(kind==='speak')return {kind,note:'',target:{kind:'none'},volume,text:speech}
  if(kind==='item')return {kind,note:'',itemId:hero.rpg.inventory[0].id,target:{kind:'self'},quantity:1,operation:'equip'}
  return {kind,note:'',abilityId:hero.rpg.abilities[0].id,stage,target:{kind:stage==='prepare'?'none':'self'}}
 }
 function calculate(){try{setPreview(calculateTutorial(session));setMessage('Последствия рассчитаны. Мир пока прежний; применение — отдельным нажатием.')}catch(e){setPreview(null);setMessage((e as Error).message)}}
 function restart(){
  setSession(createTutorialSession(path));setPreview(null);setKind('move');setPoint({x:'7',y:'6',z:'0'});setTarget('self');setOperation('inspect');setStage('prepare');setWait('2');setSpeech('Я готов к переходу.');setVolume('normal')
  setMessage('Создана свежая учебная копия. Отметки шагов сохранены.')
 }
 const guideHere=scene.tokens.some(t=>t.actorId===session.guideId),revealed=!!map?.contacts.some(c=>c.kind==='identified'&&c.label==='Учебный проводник')
 return <section className="gb-tutorial-sandbox" aria-labelledby="sandbox-title">
  <header className="w6-section-heading"><div><h2 id="sandbox-title">Учебная площадка · «Ночной переход»</h2><p>Мир только в памяти этой страницы. Здесь нет команд настоящего лобби, экспорта или сохранения героя.</p></div><button className="w6-button" onClick={restart}>Перезапустить площадку</button></header>
  <div className="gb-tutorial-status"><img src={artworkSource(hero.profile.portrait)} width={64} height={64} alt="Учебный герой"/><div><strong>{hero.name}</strong><p data-tutorial-time>Время учебного мира: {session.world.campaign.seconds} с · раунд {session.round}</p><p>Мана: {hero.resources.mana.current} / {hero.resources.mana.maximum} · Посох: {hero.rpg.inventory[0].equipped?'снаряжён':'в инвентаре'}</p></div></div>
  {work&&<p role="status">Переносимая работа: {(total-remaining).toFixed(3).replace(/\.000$/,'')} / {total} с, осталось {remaining} с.</p>}
  {cast&&<p>«Сосредоточение»: {cast.status==='ready'?'заряд готов к отдельному выпуску':'подготовка продолжается'}.</p>}{hero.rpg.effects.length>0&&<p>Активных учебных эффектов: {hero.rpg.effects.length}.</p>}
  <div className="w6-buttons"><button className="w6-button" onClick={()=>perform(s=>pauseTutorial(s,!s.paused),safelyPaused(session))}>{session.paused?'Возобновить площадку':'Поставить площадку на паузу'}</button><button className="w6-button" onClick={()=>perform(checkpointTutorial,'Учебная точка сохранена только в памяти.')}>Сохранить учебную точку</button><button className="w6-button" disabled={!session.checkpoint} onClick={()=>perform(restoreTutorial,'Учебная точка возвращена; прежний расчёт сброшен.')}>Вернуть учебную точку</button><button className="w6-button" disabled={!session.lastRound} onClick={()=>perform(undoTutorial,'Раунд возвращён до исполнения. Можно заново рассчитать прежнее заявление.')}>Вернуть последний учебный раунд</button></div>
  {session.paused&&<p role="status">Пауза: часы и подготовка не продвигаются. Применение недоступно.</p>}
  {path==='master'&&<section className="gb-tutorial-master"><h3>Учебный стол мастера</h3><div className="w6-buttons">{session.world.campaign.scenes!.scenes.map(s=><button key={s.id} className={'w6-button'+(scene.id===s.id?' w6-active':'')} onClick={()=>perform(current=>openTutorialScene(current,s.id),'Открыта отдельная учебная сцена. Раскрытие проводника нужно задать заново.')}>Открыть учебную сцену: {s.name}</button>)}</div>
   <div className="w6-buttons"><button className="w6-button" onClick={()=>perform(s=>placeTutorialGuide(s,pointValue()),'Проводник размещён. Герою он ещё не раскрыт.')}>Разместить проводника в выбранной точке</button><button className="w6-button" disabled={!guideHere} onClick={()=>perform(s=>discloseTutorialGuide(s,!revealed),revealed?'Проводник скрыт от учебного героя.':'Проводник раскрыт только учебному герою.')}>{revealed?'Скрыть проводника от героя':'Раскрыть проводника герою'}</button>
    {scene.view==='side'&&<button className="w6-button" onClick={()=>perform(s=>{const support=tutorialScene(s).objects.find(o=>o.canSupport&&o.height===3)!;return placeTutorialHero(s,{x:15,y:2,z:3},{kind:'object',objectId:support.id})},'Герой на верхней опоре: Z=3 м. Это размещение мастером, а не полученная способность полёта.')}>Герой на верхнюю опору Z=3</button>}
    <button className="w6-button" onClick={()=>perform(s=>placeTutorialHero(s,{x:5,y:scene.view==='side'?2:6,z:scene.groundZ},{kind:'ground'}),'Герой возвращён на землю.')}>Герой на землю</button></div>
   <p className="w6-copy">Размещение мастером не тратит ход. X/Y/Z задают положение; вне земли или опоры отметка считается находящейся в воздухе. Это не выдаёт персонажу способность полёта.</p>
  </section>}
  <div className={'gb-tutorial-maps'+(path==='master'?' gb-tutorial-compare':'')}>
   {path==='master'&&<section aria-label="Учебная сцена мастера"><h3>Полная сцена мастера</h3><SceneViewport scene={scene} actors={session.world.characters} selection={null} selecting={false} onPoint={choosePoint} onSelect={()=>{}}/></section>}
   {map&&<section aria-label="Учебный вид героя"><PerceivedScene map={map} selected={target} onPoint={choosePoint} onSelect={id=>{edited();setTarget(id)}}/></section>}
  </div>
  <div className="gb-tutorial-coordinates">{(['x','y','z'] as const).map(axis=><label className="w6-field" key={axis}><span>Учебная точка {axis.toUpperCase()}, м</span><input aria-label={'Учебная точка '+axis.toUpperCase()} type="number" step="any" value={point[axis]} onChange={e=>{edited();setPoint({...point,[axis]:e.currentTarget.value})}}/></label>)}<button className="w6-button" onClick={()=>choosePoint({x:7,y:6,z:0})}>Выбрать пример точки 7 / 6 / 0</button></div>
  <fieldset className="w6-form" disabled={session.paused}><legend>Заявление учебного героя</legend>
   <label className="w6-field"><span>Универсальное действие</span><select aria-label="Учебное действие" value={kind} onChange={e=>{edited();setKind(e.currentTarget.value as DeclaredAction['kind']);if(e.currentTarget.value==='interact')setTarget(map?.objects.find(o=>o.kind==='door'||o.kind==='crate')?.id??'self')}}>{actionKinds.map(a=><option value={a.key} key={a.key}>{a.label}</option>)}</select></label>
   {kind==='wait'&&<label className="w6-field"><span>Ожидание, с</span><input aria-label="Учебное ожидание" type="number" min={0.001} step="any" value={wait} onChange={e=>{edited();setWait(e.currentTarget.value)}}/></label>}
   {kind==='interact'&&<><label className="w6-field"><span>Раскрытая цель</span><select aria-label="Учебная цель" value={target} onChange={e=>{edited();setTarget(e.currentTarget.value)}}>{targets.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label><label className="w6-field"><span>Способ взаимодействия</span><select aria-label="Учебное взаимодействие" value={operation} onChange={e=>{edited();setOperation(e.currentTarget.value as typeof operation)}}><option value="inspect">Осмотреть</option><option value="open">Открыть</option><option value="close">Закрыть</option></select></label></>}
   {kind==='speak'&&<><label className="w6-field"><span>Своя реплика, без слушателей</span><textarea aria-label="Учебная реплика" maxLength={4000} rows={2} value={speech} onChange={e=>{edited();setSpeech(e.currentTarget.value)}}/></label><label className="w6-field"><span>Громкость</span><select aria-label="Громкость учебной реплики" value={volume} onChange={e=>{edited();setVolume(e.currentTarget.value as typeof volume)}}><option value="whisper">Шёпот</option><option value="normal">Обычный голос</option><option value="shout">Крик</option></select></label></>}
   {kind==='item'&&<p>Снарядить собственный дорожный посох в правой руке; размеры 3D и свойства экземпляра сохраняются.</p>}
   {kind==='ability'&&<><label className="w6-field"><span>Этап «Сосредоточения»</span><select aria-label="Учебный этап способности" value={stage} onChange={e=>{edited();setStage(e.currentTarget.value as typeof stage)}}><option value="prepare">Подготовить без цели</option><option value="release">Отдельно выпустить на себя</option></select></label><p>Подготовка 8 с · стоимость 1 Мана · эффект 30 с без изменения характеристик. Параметры этого примера заданы учебным мастером.</p></>}
   <button className="w6-button w6-primary" disabled={tutorialHasWork(session)} onClick={()=>perform(s=>declareTutorial(s,{kind:'action',action:statement()}),'Заявление принято только в учебной копии. Мир ещё прежний.')}>Заявить учебное действие</button>
   {work&&<button className="w6-button" onClick={()=>perform(s=>declareTutorial(s,{kind:'continue'}),'Продолжение заявлено; часы пока прежние.')}>Заявить продолжение работы</button>}
  </fieldset>
  <p data-tutorial-statement><strong>Заявлено:</strong> {tutorialStatementLabel(session.statement)}</p>
  <p className="w6-copy">Условия примера: раунд 5 с, личный бюджет 5000 мс; стоимость движения, взаимодействия, снаряжения и выпуска задана мастером как 1000 мс, подготовки — 8000 мс. Это учебные решения, не общий баланс. Осмотр не добавляет скрытых находок; реплика попадает только в учебный журнал, без автоматического слуха.</p>
  <div className="w6-buttons"><button className="w6-button" disabled={session.paused||!session.statement} onClick={calculate}>Рассчитать учебный раунд</button><button className="w6-button w6-primary" disabled={session.paused||!preview} onClick={()=>{if(preview)perform(s=>applyTutorial(s,preview),'Учебный раунд применён. Настоящая кампания не менялась.')}}>Применить учебный расчёт</button></div>
  {preview&&<section className="gb-tutorial-preview" aria-label="Учебные последствия"><h3>Предпросмотр · {preview.summary.durationSeconds} с</h3><p>{tutorialStatementLabel(session.statement)}</p>
   {preview.summary.events.map((e,i)=><p key={i}>{labels[e.kind]} · на {Number(e.atMs.numerator)/Number(e.atMs.denominator)/1000} с раунда.</p>)}
   {preview.summary.carried.map(w=><p key={w.id}>Перенос: осталось {Number(w.remaining.numerator)/Number(w.remaining.denominator)/1000} с по учётной единице работы.</p>)}
   {preview.summary.rules?.map((r,i)=><p key={i}>{r.text}</p>)}{preview.manualResult&&<p>{preview.manualResult}</p>}
   <p>После применения: время {preview.world.campaign.seconds} с; Мана {preview.world.characters.find(a=>a.id===hero.id)!.resources.mana.current}. Пока действующий мир прежний.</p>
  </section>}
  {session.journal.length>0&&<details><summary>Учебный журнал</summary>{session.journal.map((text,i)=><p key={i}>{text}</p>)}</details>}
  <p role="status">{message}</p>
 </section>
}
function safelyPaused(s:TutorialSession){return s.paused?'Учебная площадка возобновлена. Рассчитай заявление заново.':'Учебная площадка на паузе; часы и подготовка сохранены.'}
