import {lazy,Suspense,useState} from 'react'
import SceneViewport from './SceneViewport'
import type {SceneSelection} from './SceneViewport'
import type {SceneState,ScenePosition} from './sceneTypes'
import {create3DSandbox} from './sandboxCampaign'
import {createDetailScene,detailSceneId} from './scene3dShowcase'
import {isSceneState,sceneReferencesValid} from './scenes'
import './onlineStyle.css'
import './App.css'
import './world6.css'
import './brandStyle.css'
import './sceneStyle.css'
import './preview3d.css'

const SceneEditor=lazy(()=>import('./SceneEditor'))
const TutorialSandbox=lazy(()=>import('./TutorialSandbox'))
const storageKey='grani-bytiya:3d-preview:v1'
const example=create3DSandbox('browser-preview')
const players=Array.from({length:4},(_,i)=>({id:'preview-player-'+i,name:'Игрок '+(i+1),profile:{portrait:'portrait-traveler'}}))
const actors=[...example.world.characters,...players]
function initialScenes():SceneState {
 const state=structuredClone(example.world.campaign.scenes!)
 state.scenes[0].tokens.push(...players.map((a,i)=>({actorId:a.id,x:4+i*2,y:17,z:0,diameter:.8,support:{kind:'ground' as const}})))
 return state
}
function readCopy():{state:SceneState;notice:string} {
 try{
  const raw=localStorage.getItem(storageKey)
  if(raw){const state:unknown=JSON.parse(raw);if(isSceneState(state)&&sceneReferencesValid(state,actors.map(a=>a.id)))return {state,notice:'Открыта твоя сохранённая копия.'}}
 }catch{return {state:initialScenes(),notice:'Сохранение браузера недоступно. Изменения останутся до закрытия страницы.'}}
 return {state:initialScenes(),notice:'Открыта новая копия полигона.'}
}

export default function Preview3D(){
 const [loaded]=useState(readCopy),[state,setState]=useState(loaded.state),[notice,setNotice]=useState(loaded.notice)
 const [selection,setSelection]=useState<SceneSelection>(null),[point,setPoint]=useState<ScenePosition|undefined>()
 const [mode,setMode]=useState<'view'|'edit'|'round'>(()=>new URLSearchParams(location.search).get('mode')==='edit'?'edit':'view'),[epoch,setEpoch]=useState(0)
 const [editorOpened,setEditorOpened]=useState(mode==='edit')
 function chooseMode(next:typeof mode){setMode(next);if(next==='edit')setEditorOpened(true)}
 const scene=state.scenes.find(s=>s.id===state.activeSceneId)
 const selected=selection?.kind==='object'?scene?.objects.find(o=>o.id===selection.id):undefined
 const selectedActor=selection?.kind==='token'?actors.find(a=>a.id===selection.id):undefined
 function save(next:SceneState){
  if(!isSceneState(next)||!sceneReferencesValid(next,actors.map(a=>a.id)))return {ok:false,message:'Проверь размеры, высоты и связи сцены.'}
  setState(next)
  try{localStorage.setItem(storageKey,JSON.stringify(next));setNotice('Изменения сохранены в этом браузере.')}
  catch{setNotice('Изменения доступны до закрытия страницы: сохранить их в браузере не удалось.')}
  return {ok:true,message:'Тестовая копия обновлена.'}
 }
 function reset(){if(window.confirm('Сбросить твою тестовую копию и вернуть три исходные области?')){save(initialScenes());setSelection(null);setPoint(undefined);setEpoch(n=>n+1);setNotice('Исходный полигон восстановлен.')}}
 function openDetails(){
  const existing=state.scenes.some(s=>s.id===detailSceneId)
  if(!existing&&state.scenes.length>=20)return
  const result=save({...state,activeSceneId:detailSceneId,scenes:existing?state.scenes:[...state.scenes,createDetailScene()]})
  if(result.ok){setSelection(null);setPoint(undefined);chooseMode('view');setNotice('Мастерская геометрии и света. Выдели объект и нажми F; сравни день, ночь и режим без текстур.')}
 }
 return <main className="home gb-preview">
  <header className="gb-preview-header"><div><p className="w6-eyebrow">Грани Бытия / тестовая версия</p><h1>На границе трёх миров</h1><p>Поселение, лесная дорога и подземное сооружение. Исследуй площадку, меняй расстановку и попробуй учебный раунд.</p></div><span className="gb-preview-badge">3D-полигон · v0.7</span></header>
  <div className="gb-preview-bar"><nav className="w6-buttons" aria-label="Режим полигона">{([['view','Обзор'],['edit','Редактор'],['round','Учебный раунд']] as const).map(([id,label])=><button key={id} className={'w6-button'+(mode===id?' w6-active':'')} aria-pressed={mode===id} onClick={()=>chooseMode(id)}>{label}</button>)}</nav><button className="w6-button gb-detail-entry" onClick={openDetails} disabled={state.scenes.length>=20&&!state.scenes.some(s=>s.id===detailSceneId)}>Детальная сцена</button><button className="w6-button" onClick={reset}>Сбросить копию</button></div>
  <p className="gb-preview-notice" role="status">{notice} Это отдельная неканоническая копия; рабочие персонажи и лобби здесь не используются.</p>
  {mode!=='round'&&<nav className="gb-preview-areas" aria-label="Области полигона">{state.scenes.map((s,i)=><button key={s.id} aria-pressed={s.id===state.activeSceneId} onClick={()=>{save({...state,activeSceneId:s.id});setSelection(null);setPoint(undefined)}}><small>ОБЛАСТЬ {String(i+1).padStart(2,'0')}</small><strong>{s.name.replace('Полигон · ','')}</strong><span>{s.width} × {s.depth} м · {s.objects.length} объектов</span></button>)}</nav>}
  {mode==='view'&&(scene?<section className="gb-preview-stage" aria-label="Обзор тестового полигона"><div className="gb-preview-stage-heading"><div><h2>{scene.name.replace('Полигон · ','')}</h2><p>Левая кнопка — вращать · правая — сдвигать · колесо — приближать</p></div><span>{scene.tokens.length} меток на сцене</span></div><SceneViewport key={scene.id} scene={scene} actors={actors} selection={selection} selecting onSelect={setSelection} onPoint={setPoint} marker={point}/><div className="gb-preview-inspector"><div><small>ВЫБРАНО</small><strong>{selected?.name??selectedActor?.name??'Нажми на объект или метку'}</strong>{selected&&<span>{selected.width} × {selected.depth} × {selected.height} м · Z {selected.z} м</span>}</div>{selected?.kind==='door'&&<button className="w6-button" onClick={()=>save({...state,scenes:state.scenes.map(s=>s.id===scene.id?{...s,objects:s.objects.map(o=>o.id===selected.id?{...o,open:!o.open}:o)}:s)})}>{selected.open?'Закрыть дверь':'Открыть дверь'}</button>}<div><small>ТОЧКА НА ПЛОЩАДКЕ</small><strong>{point?`X ${point.x.toFixed(2)} / Y ${point.y.toFixed(2)} / Z ${point.z.toFixed(2)} м`:'Нажми на землю'}</strong></div><button className="w6-button" onClick={()=>chooseMode('edit')}>Изменить расстановку</button></div></section>:<section className="panel"><p>Открой область или создай новую в редакторе.</p><button className="w6-button" onClick={()=>chooseMode('edit')}>Открыть редактор</button></section>)}
  {editorOpened&&<div hidden={mode!=='edit'}><Suspense fallback={<p role="status">Открываем редактор…</p>}><SceneEditor key={epoch} value={state} actors={actors} onChange={save}/></Suspense></div>}
  {mode==='round'&&<section className="panel"><h2>Проба игрового раунда</h2><p>Отдельный учебный эпизод: заяви действие, рассчитай и примени результат. Здесь можно проверить движение, подготовку способности и откат.</p><Suspense fallback={<p role="status">Открываем учебную сцену…</p>}><TutorialSandbox key={epoch} path="master"/></Suspense></section>}
  <footer className="gb-preview-footer"><p>Четыре игровые метки в поселении предназначены для проверки расстановки. Сетевая игра на пятерых остаётся в обычных лобби.</p><p>Детальное окружение загружается в сбалансированном и высоком качестве. <a href="https://polyhaven.com" target="_blank" rel="noreferrer">Модели и материалы окружения: Poly Haven · CC0.</a> Если 3D не запускается, схема доступна рядом.</p></footer>
 </main>
}
