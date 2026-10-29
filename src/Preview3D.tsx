import {lazy,Suspense,useState} from 'react'
import type {SceneState} from './sceneTypes'
import {create3DSandbox} from './sandboxCampaign'
import {upgradeOriginalScenes} from './originalSceneEnvironment'
import {createDetailScene,detailSceneId,createOrganicScene,organicSceneId,createBasicModelsScene,basicModelsSceneId} from './scene3dShowcase'
import {isSceneState,sceneReferencesValid} from './scenes'
import {createReferenceTavernScene,referenceSceneId} from './tabletopShowcase'
import {createVideoTavernScene,videoTavernSceneId} from './tavernReference'
import EditorIcon from './EditorIcon'
import './onlineStyle.css'
import './App.css'
import './world6.css'
import './brandStyle.css'
import './sceneStyle.css'
import './preview3d.css'

const SceneEditor=lazy(()=>import('./SceneEditor'))
const ScenePlaytest=lazy(()=>import('./ScenePlaytest'))
const TutorialSandbox=lazy(()=>import('./TutorialSandbox'))
const storageKey='grani-bytiya:3d-preview:v1'
const example=create3DSandbox('browser-preview')
const originalExample=create3DSandbox('browser-preview',{environment:'legacy'})
const players=Array.from({length:4},(_,i)=>({id:'preview-player-'+i,name:'Игрок '+(i+1),profile:{portrait:'portrait-traveler'}}))
const figures=Array.from({length:4},(_,i)=>({id:'preview-figure-'+i,name:'Фигурка '+(i+1),profile:{portrait:'portrait-traveler'}}))
const oldTavernPlayers=['Эрин','Мира','Торен','Лис'].map((name,i)=>({id:'preview-tavern-'+i,name:name+' · игрок '+(i+1),profile:{portrait:'portrait-traveler'}}))
const tavernPlayers=oldTavernPlayers.map((a,i)=>({...a,id:'preview-reference-'+i}))
const oldVideoTavernPlayers=tavernPlayers.map((a,i)=>({...a,id:'preview-reference-video-'+i}))
const videoTavernPlayers=tavernPlayers.map((a,i)=>({...a,id:'preview-reference-video2-'+i}))
const actors=[...example.world.characters,...players,...figures,...oldTavernPlayers,...tavernPlayers,...oldVideoTavernPlayers,...videoTavernPlayers]
function initialScenes():SceneState {
 const state=structuredClone(example.world.campaign.scenes!)
 state.scenes[0].tokens.push(...players.map((a,i)=>({actorId:a.id,x:4+i*2,y:17,z:0,diameter:.8,support:{kind:'ground' as const}})))
 state.scenes.push(createVideoTavernScene(videoTavernPlayers.map(a=>a.id)))
 return state
}
function readCopy():{state:SceneState;notice:string;storageWarning:string} {
 let raw:string|null
 try{
  raw=localStorage.getItem(storageKey)
 }catch{return {state:initialScenes(),notice:'Открыт исходный полигон.',storageWarning:'Сохранение браузера недоступно. Изменения останутся до закрытия страницы.'}}
 if(raw){try{const state:unknown=JSON.parse(raw);if(isSceneState(state)&&sceneReferencesValid(state,actors.map(a=>a.id))){const updated=upgradeOriginalScenes(state,originalExample.world.campaign.scenes!,example.world.campaign.scenes!);return {state:updated,notice:updated===state?'Открыта твоя сохранённая копия.':'Обновлено оформление исходных сцен. Твоя расстановка и правки сохранены.',storageWarning:''}}}catch{/* Report corrupt data separately from an unavailable storage API. */}
  return {state:initialScenes(),notice:'Открыт исходный полигон.',storageWarning:'Не удалось прочитать сохранённую копию. Исходные данные остаются в браузере до следующего сохранения.'}
 }
 return {state:initialScenes(),notice:'Готово к работе. Изменения сохраняются автоматически.',storageWarning:''}
}
export default function Preview3D(){
 const [loaded]=useState(readCopy),[state,setState]=useState(loaded.state),[notice,setNotice]=useState(loaded.notice)
 const [storageWarning,setStorageWarning]=useState(loaded.storageWarning)
 const [mode,setMode]=useState<'view'|'edit'|'round'|'playtest'>(()=>new URLSearchParams(location.search).get('mode')==='edit'?'edit':'view'),[epoch,setEpoch]=useState(0)
 function save(next:SceneState){
  if(!isSceneState(next)||!sceneReferencesValid(next,actors.map(a=>a.id)))return {ok:false,message:'Проверь размеры, высоты и связи сцены.'}
  setState(next)
  try{localStorage.setItem(storageKey,JSON.stringify(next));setStorageWarning('');setNotice('Изменения сохранены в этом браузере.');return {ok:true,message:'Сохранено'}}
  catch{const warning='Сохранение браузера недоступно. Экспортируй сцену, чтобы сохранить изменения.';setStorageWarning(warning);return {ok:true,message:'Изменения только в памяти. '+warning}}
 }
 function reset(){if(window.confirm('Сбросить твою тестовую копию и вернуть исходные области и таверну?')){save(initialScenes());setEpoch(n=>n+1);setNotice('Исходный полигон восстановлен.')}}
 function openOriginal(index=0){
  const source=initialScenes().scenes[index],existing=state.scenes.some(s=>s.id===source.id)
  if(!existing&&state.scenes.length>=20){setNotice('На полигоне уже 20 сцен. Освободи место, чтобы открыть исходную область.');return}
  const actorIds=new Set(state.scenes.flatMap(s=>s.tokens.map(t=>t.actorId)))
  if(!existing)source.tokens=source.tokens.filter(t=>!actorIds.has(t.actorId))
  if(save({...state,activeSceneId:source.id,scenes:existing?state.scenes:[...state.scenes,source]}).ok){setMode('view');setNotice('Открыта исходная область. Природа и базовые объекты доступны в библиотеке редактора.')}
 }
 function openTavern(){
  const existing=state.scenes.some(s=>s.id===referenceSceneId)
  if(!existing&&state.scenes.length>=20){setNotice('На полигоне уже 20 сцен. Освободи место, чтобы добавить таверну.');return}
  if(save({...state,activeSceneId:referenceSceneId,scenes:existing?state.scenes:[...state.scenes,createReferenceTavernScene(tavernPlayers.map(a=>a.id))]}).ok){setMode('view');setNotice('Таверна открыта. ЛКМ — перетаскивать, E — действие с выбранным объектом.')}
 }
 function openVideoTavern(){
  const existing=state.scenes.some(s=>s.id===videoTavernSceneId)
  if(!existing&&state.scenes.length>=20){setNotice('На полигоне уже 20 сцен. Освободи место, чтобы добавить таверну.');return}
  if(save({...state,activeSceneId:videoTavernSceneId,scenes:existing?state.scenes:[...state.scenes,createVideoTavernScene(videoTavernPlayers.map(a=>a.id))]}).ok){setMode('view');setNotice('Открыта таверна по ролику. Камера → «Ракурс из ролика» — исходный вид; «Снимок сцены» — сохранить изображение.')}
 }
 function openDetails(organic=false){
  const id=organic?organicSceneId:detailSceneId,existing=state.scenes.some(s=>s.id===id)
  if(!existing&&state.scenes.length>=20)return
  if(save({...state,activeSceneId:id,scenes:existing?state.scenes:[...state.scenes,organic?createOrganicScene(figures.map(p=>p.id)):createDetailScene()]}).ok){setMode('view');setNotice(organic?'Вода и четыре объёмные фигурки. F — приблизить выбранную.':'Мастерская геометрии. Сравни освещение и режим без текстур.')}
 }
 function openBasicModels(){
  const existing=state.scenes.some(s=>s.id===basicModelsSceneId)
  if(!existing&&state.scenes.length>=20)return
  if(save({...state,activeSceneId:basicModelsSceneId,scenes:existing?state.scenes:[...state.scenes,createBasicModelsScene()]}).ok){setMode('view');setNotice('Базовые модели: выбери объект и нажми F. E — открыть, закрыть, зажечь или погасить.')}
 }
 return <main className="gb-preview gb-preview-workspace">
  <header className="gb-preview-header"><a className="gb-preview-brand" href="?" aria-label="Грани Бытия"><span className="gb-preview-monogram">ГБ</span><span><strong>Грани Бытия</strong><small>ИГРОВОЙ СТОЛ</small></span></a>
   <nav className="gb-preview-mode" aria-label="Режим полигона">{([['view','play','Игровой стол'],['edit','cube','Редактор'],['playtest','person','Игрок и эффекты'],['round','person','Учебный раунд']] as const).map(([id,icon,label])=><button key={id} aria-pressed={mode===id} onClick={()=>setMode(id)}><EditorIcon name={icon}/>{label}</button>)}</nav>
   <div className="gb-preview-header-end"><span className="gb-preview-party"><i/>4 игрока + мастер</span><button className="gb-preview-reference" onClick={()=>openOriginal()}><EditorIcon name="layers"/>Исходные сцены</button><details className="gb-preview-project-menu"><summary aria-label="Примеры и проект"><EditorIcon name="folder"/>Проект<EditorIcon name="chevron" size={12}/></summary><div onClick={e=>e.currentTarget.parentElement?.removeAttribute('open')}>{['Поселение','Лес и дорога','Подземелье'].map((name,i)=><button key={name} onClick={()=>openOriginal(i)} disabled={state.scenes.length>=20&&!state.scenes.some(s=>s.id===example.world.campaign.scenes!.scenes[i].id)}>{name}</button>)}<button onClick={openVideoTavern}>Таверна из ролика</button><button onClick={openTavern}>Таверна</button><button onClick={()=>openDetails()} disabled={state.scenes.length>=20&&!state.scenes.some(s=>s.id===detailSceneId)}>Детальная сцена</button><button onClick={()=>openDetails(true)} disabled={state.scenes.length>=20&&!state.scenes.some(s=>s.id===organicSceneId)}>Вода и фигурки</button><button onClick={openBasicModels} disabled={state.scenes.length>=20&&!state.scenes.some(s=>s.id===basicModelsSceneId)}>Базовые модели</button><button onClick={reset}>Сбросить копию</button></div></details><span className="gb-preview-version">v0.35</span></div>
  </header>
  <div className="gb-preview-editor" hidden={mode==='round'||mode==='playtest'}><Suspense fallback={<p role="status">Открываем игровой стол…</p>}><SceneEditor libraryScope="3d-preview" key={epoch} value={state} actors={actors} onChange={save} mode={mode==='edit'?'build':'play'} workspace/></Suspense></div>
  {mode==='playtest'&&<Suspense fallback={<p role="status">Открываем пробу игрока…</p>}><ScenePlaytest value={state} actors={actors} onChange={save}/></Suspense>}
  {mode==='round'&&<section className="gb-preview-round"><h2>Проба игрового раунда</h2><p>Заяви действие, рассчитай и примени результат. Движение, способности и откат проверяются в отдельном учебном эпизоде.</p><Suspense fallback={<p role="status">Открываем учебную сцену…</p>}><TutorialSandbox key={epoch} path="master"/></Suspense></section>}
  <footer className="gb-preview-footer"><span role="status"><i/>{notice}</span>{storageWarning&&<strong className="gb-preview-storage-warning" role="alert">{storageWarning}</strong>}<span>Тестовая копия · <a href="https://polyhaven.com" target="_blank" rel="noreferrer">Окружение: Poly Haven · CC0</a></span></footer>
 </main>
}
