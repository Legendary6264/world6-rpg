import {useId,useState} from 'react'
import DisclosureMenu from './DisclosureMenu'
import {sitePageAllowed,sitePages} from './siteRoutes'
import type {SitePage} from './siteRoutes'
import {productBrand} from './productBrand'

const brandMark=new URL('../favicon.svg',import.meta.url).href
export default function SiteNavigation({page,onNavigate,user,connected,loading}:{page:SitePage;onNavigate:(page:SitePage)=>void;user?:{displayName:string;role:string}|null;connected:boolean;loading:boolean}){
 const [open,setOpen]=useState(false),id=useId()
 const navigate=(next:SitePage)=>{setOpen(false);onNavigate(next)}
 return <header className="ui-site-header"><nav className="ui-site-nav" aria-label="Основная навигация">
  <button type="button" className="w6-brand ui-brand" aria-label={productBrand.name+' · главная'} onClick={()=>navigate('home')}><img src={brandMark} alt="" width="34" height="34"/><span><strong>{productBrand.name}</strong><small>Мир 6 · ролевая платформа</small></span></button>
  <button type="button" className="ui-mobile-nav-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>Разделы<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" strokeWidth="1.5"/></svg></button>
  <div className="ui-site-links" id={id} data-open={open}>
   {(['home','character','lobbies','guide','tutorial'] as const).map(key=><button type="button" key={key} aria-current={page===key?'page':undefined} onClick={()=>navigate(key)}>{sitePages[key]}</button>)}
   <DisclosureMenu label="Сообщество" returnFocus={false} className={["stories","news","forum","support"].includes(page)?"ui-current-group":""}>{(['stories','news','forum','support'] as const).map(key=><button type="button" key={key} aria-current={page===key?'page':undefined} onClick={()=>navigate(key)}>{sitePages[key]}</button>)}</DisclosureMenu>
  </div>
  <div className="ui-account-navigation"><span className="ui-connection" data-connected={connected} title={connected?'Связь с сервером установлена':loading?'Подключаемся к серверу':'Нет связи с сервером'}><i aria-hidden="true"/>{connected?'На связи':loading?'Подключение':'Нет связи'}</span>
   {user?<DisclosureMenu label={user.displayName} className={"ui-account-menu"+(["account","worldEditor","admin"].includes(page)?" ui-current-group":"")} returnFocus={false}><button type="button" onClick={()=>navigate('account')}>Твой аккаунт</button>{(['worldEditor','admin'] as const).filter(key=>sitePageAllowed(key,user.role)).map(key=><button type="button" key={key} onClick={()=>navigate(key)}>{sitePages[key]}</button>)}</DisclosureMenu>:<button type="button" className="w6-button ui-account-entry" aria-current={page==='account'?'page':undefined} onClick={()=>navigate('account')}>Войти / Регистрация</button>}
  </div>
 </nav></header>
}
