import { lazy, Suspense, useEffect, useState } from 'react'
import GuidePanel from './GuidePanel'
import ForumPanel from './ForumPanel'
import LobbiesPanel from './LobbiesPanel'
import AccountPanel from './AccountPanel'
import SupportPanel from './SupportPanel'
import PublicationsPanel from './PublicationsPanel'
import WorldEntriesPanel from './WorldEntriesPanel'
import AdminPanel from './AdminPanel'
import CloudLibraryPanel from './CloudLibraryPanel'
import { useOnline } from './onlineContext'
import { productBrand } from './productBrand'
import SiteNavigation from './SiteNavigation'
import useSiteNavigation from './useSiteNavigation'
import {sitePages,sitePageAllowed} from './siteRoutes'
import type {SitePage as Page} from './siteRoutes'
import TutorialWelcome from './TutorialWelcome'
import {tutorialScope} from './tutorialProgress'
import type {TutorialPath} from './tutorialProgress'
import './onlineStyle.css'
import './App.css'
import './world6.css'
import './brandStyle.css'
import HomePage from './HomePage'
import QuickNavigation from './QuickNavigation'
import InterfaceIcon from './InterfaceIcon'
const CharacterManager=lazy(()=>import('./CharacterManager'))
const TutorialPage=lazy(()=>import('./TutorialPage'))
export default function App(){
const online=useOnline()
const [quickOpen,setQuickOpen]=useState(false)
useEffect(()=>{const key=(e:KeyboardEvent)=>{if(!e.defaultPrevented&&!e.isComposing&&!e.repeat&&!e.altKey&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setQuickOpen(value=>!value)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[])
const scope=tutorialScope(online.user?.id)
const [tutorialVersion,setTutorialVersion]=useState(0),[tutorialChoice,setTutorialChoice]=useState<{scope:string;path:TutorialPath}|null>(null)
const {page:currentPage,openedCharacter,navigate:setPage}=useSiteNavigation()
const [editorVersion,setEditorVersion]=useState(0)
const page:Page=online.recovering||online.user?.mfaRequired||!sitePageAllowed(currentPage,online.user?.role)?'account':currentPage
function openTutorial(path?:TutorialPath){setTutorialChoice(path?{scope,path}:null);setTutorialVersion(n=>n+1);setPage('tutorial')}
return <div className="home ui-app-shell"><a className="ui-skip-link" href="#gb-main-content">Перейти к содержимому</a><SiteNavigation page={page} onNavigate={id=>id==='tutorial'?openTutorial():setPage(id)} user={online.user} connected={online.connected} loading={online.loading} onSearch={()=>setQuickOpen(true)}/><QuickNavigation open={quickOpen} onClose={()=>setQuickOpen(false)} onNavigate={id=>id==='tutorial'?openTutorial():setPage(id)} role={online.user?.role}/>
<main id="gb-main-content" className="ui-main-content" tabIndex={-1}>
{page!=='home'&&<nav className="ui-location" aria-label="Текущий раздел"><button type="button" onClick={()=>setPage('home')}>Главная</button><span aria-hidden="true">/</span><span>{sitePages[page]}</span></nav>}

{page==='home'&&<HomePage onNavigate={setPage} onTutorial={()=>openTutorial()} welcome={!new URLSearchParams(location.search).has('invite')&&!new URLSearchParams(location.search).has('code')&&new URLSearchParams(location.search).get('type')!=='recovery'&&!location.hash.includes('type=recovery')&&<TutorialWelcome key={scope} scope={scope} onChoose={openTutorial}/>}/>}
{(page==='account'||page==='character')&&(new URLSearchParams(location.search).has('lobby')||new URLSearchParams(location.search).has('invite'))&&<button className="w6-button gb-back-to-game" onClick={()=>setPage('lobbies')}>Вернуться в кампанию</button>}
{openedCharacter&&<div hidden={page!=='character'}><Suspense fallback={<section className="panel">Открывается редактор…</section>}><CloudLibraryPanel onImported={()=>{setEditorVersion(n=>n+1);setPage('character')}}/><CharacterManager key={editorVersion}/></Suspense></div>}
{page==='guide'&&<><section className="panel w6-portal-page"><GuidePanel/></section><WorldEntriesPanel/></>}{page==='worldEditor'&&<WorldEntriesPanel manage/>}
{page==='account'&&<AccountPanel key={online.user?.id||'guest'}/>}{page==='admin'&&<AdminPanel/>}{page==='forum'&&<ForumPanel onAccount={()=>setPage('account')}/>}
{page==='tutorial'&&<Suspense fallback={<section className="panel">Открывается учебная площадка…</section>}><TutorialPage key={JSON.stringify([scope,tutorialVersion])} scope={scope} initialPath={tutorialChoice?.scope===scope?tutorialChoice.path:undefined} onNavigate={setPage}/></Suspense>}
{page==='lobbies'&&<LobbiesPanel onAccount={()=>setPage('account')} onCreateCharacter={()=>setPage('character')}/>}
{page==='support'&&<SupportPanel onAccount={()=>setPage('account')}/>}
{(page==='news'||page==='stories')&&<PublicationsPanel key={page} kind={page}/>}
</main>
<footer className="w6-site-footer realm-footer"><div className="realm-footer-brand"><InterfaceIcon name="spark" size={28}/><div><strong>{productBrand.name}</strong><p>Твоя история на границе миров.</p></div></div><nav aria-label="Ссылки внизу страницы">{([{title:'За игровой стол',ids:['character','lobbies','tutorial']},{title:'Открыть мир',ids:['guide','stories','news']},{title:'Быть вместе',ids:['forum','support','account']}] as {title:string;ids:Page[]}[]).map(group=><div key={group.title}><strong>{group.title}</strong>{group.ids.map(id=><button type="button" key={id} onClick={()=>id==='tutorial'?openTutorial():setPage(id)}>{sitePages[id]}</button>)}</div>)}</nav><small className="realm-footer-note">Мир 6 · Создавайте истории вместе.</small></footer></div>
}
