import { lazy, Suspense, useState } from 'react'
import GuidePanel from './GuidePanel'
import ForumPanel from './ForumPanel'
import LobbiesPanel from './LobbiesPanel'
import AccountPanel from './AccountPanel'
import SupportPanel from './SupportPanel'
import PublicationsPanel from './PublicationsPanel'
import AdminPanel from './AdminPanel'
import CloudLibraryPanel from './CloudLibraryPanel'
import { useOnline } from './onlineContext'
import './onlineStyle.css'
import './App.css'
import './world6.css'
const CharacterManager=lazy(()=>import('./CharacterManager'))
type Page='home'|'character'|'news'|'forum'|'support'|'stories'|'lobbies'|'guide'|'account'|'admin'
const pages:{id:Page;label:string;number:string;description:string}[]=[
{id:'character',label:'Персонажи',number:'01',description:'Тело, характер и мастерство'},
{id:'lobbies',label:'Поиск лобби',number:'02',description:'Начало твоей истории'},
{id:'stories',label:'Сюжеты',number:'03',description:'Зацепки для приключений'},
{id:'news',label:'Новости',number:'04',description:'Что меняется в Мире 6'},
{id:'forum',label:'Форум',number:'05',description:'Идеи, обсуждения и вопросы'},
{id:'support',label:'Поддержка',number:'06',description:'Ошибки и предложения'},
]
export default function App(){
const online=useOnline()
const [page,setCurrentPage]=useState<Page>(()=>new URLSearchParams(location.search).has('invite')?'lobbies':'home'),[openedCharacter,setOpenedCharacter]=useState(false),[editorVersion,setEditorVersion]=useState(0)
function setPage(value:Page){setCurrentPage(value);if(value==='character')setOpenedCharacter(true)}
return <main className="home"><nav className="navigation w6-site-nav" aria-label="Основная навигация"><button className="w6-brand" onClick={()=>setPage('home')} aria-label="Мир 6 · главная"><span>VI</span><strong>МИР 6</strong></button><div>{([['home','Главная'],['character','Персонажи'],['lobbies','Лобби'],['guide','Путеводитель']] as const).map(([id,label])=><button key={id} className={'navigation-button'+(page===id?' active':'')} onClick={()=>setPage(id)}>{label}</button>)}</div><div className="w6-account-nav"><span className="w6-site-status">● {online.connected?'На связи':online.loading?'Подключаемся':'Нет связи с сервером'}</span><button className="w6-button" onClick={()=>setPage('account')}>{online.user?online.user.displayName:'Войти / Регистрация'}</button>{online.user&&['ADMIN','OWNER'].includes(online.user.role)&&<button className="w6-button" onClick={()=>setPage('admin')}>Управление</button>}</div></nav>
{page==='home'&&<><header className="w6-home-hero"><div className="w6-home-hero-copy"><p className="w6-eyebrow">Истории на границе миров</p><h1>Сила меняет тело.<br/><em>Выбор меняет мир.</em></h1><p>Создай героя Мира 6. Выбери свой путь, научись управлять энергией и оставь след в истории.</p><div className="w6-buttons"><button className="w6-button w6-primary" onClick={()=>setPage('character')}>Создать персонажа ↗</button><button className="w6-button" onClick={()=>setPage('guide')}>Изучить правила</button></div></div><div className="w6-hero-seal" aria-hidden="true"><span>VI</span><small>Мир без границ</small></div><div className="w6-hero-footer"><span>Мана или Тень</span><span>24 атрибута</span><span>Тело вместо общего HP</span></div></header><section className="w6-home-section"><header><div><p className="w6-eyebrow">Выбери направление</p><h2>Твоя следующая глава</h2></div><p>От первого героя<br/>до собственной кампании</p></header><div className="w6-portal-grid">{pages.map(p=><button className={'w6-portal-card w6-portal-'+p.id} key={p.id} onClick={()=>setPage(p.id)}><span className="w6-card-number">{p.number}</span><span className="w6-portal-arrow">↗</span><h3>{p.label}</h3><p>{p.description}</p></button>)}</div></section><section className="w6-home-bottom"><div><p className="w6-eyebrow">Устройство героя</p><h2>Каждое действие<br/>начинается с характера.</h2><p>Раса задаёт физиологию. Атрибуты определяют способности, обучение раскрывает потенциал. Магическая специализация требует выбора.</p><button className="w6-button" onClick={()=>setPage('guide')}>Открыть путеводитель</button></div><div className="w6-home-feature"><span>01 / ТЕЛО</span><h3>Боль, органы, движение</h3><p>Повреждения имеют место и последствия. Игрок узнаёт то, что может почувствовать или диагностировать.</p><span>02 / МАСТЕРСТВО</span><h3>Умение имеет значение</h3><p>Каждый навык связан с несколькими атрибутами и собственным обучением.</p></div></section></>}
{openedCharacter&&<div hidden={page!=='character'}><Suspense fallback={<section className="panel">Открывается редактор…</section>}><CloudLibraryPanel onImported={()=>{setEditorVersion(n=>n+1);setPage('character')}}/><CharacterManager key={editorVersion}/></Suspense></div>}
{page==='guide'&&<section className="panel w6-portal-page"><GuidePanel/></section>}
{page==='account'&&<AccountPanel/>}{page==='admin'&&<AdminPanel/>}{page==='forum'&&<ForumPanel onAccount={()=>setPage('account')}/>}
{page==='lobbies'&&<LobbiesPanel onAccount={()=>setPage('account')}/>}
{page==='support'&&<SupportPanel onAccount={()=>setPage('account')}/>}
{(page==='news'||page==='stories')&&<PublicationsPanel key={page} kind={page}/>}
<footer className="w6-site-footer"><span>МИР 6 <small> / Истории на границе миров</small></span><div>{(['news','forum','support'] as const).map(id=><button key={id} onClick={()=>setPage(id)}>{pages.find(p=>p.id===id)?.label}</button>)}</div></footer></main>
}
