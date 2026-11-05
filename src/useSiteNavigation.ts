import {useCallback,useEffect,useState} from 'react'
import {readSitePage,sitePageUrl} from './siteRoutes'
import type {SitePage} from './siteRoutes'

export default function useSiteNavigation(){
 const [state,setState]=useState(()=>{const page=readSitePage(window.location.href);return {page,openedCharacter:page==='character'}})
 const select=useCallback((page:SitePage)=>{
  setState(previous=>({page,openedCharacter:previous.openedCharacter||page==='character'}))
 },[])
 const navigate=useCallback((page:SitePage)=>{
  const href=sitePageUrl(window.location.href,page)
  if(window.location.href!==href)window.history.pushState(window.history.state,'',href)
  select(page)
  queueMicrotask(()=>{document.getElementById('gb-main-content')?.focus({preventScroll:true});window.scrollTo({top:0,left:0,behavior:'instant'})})
 },[select])
 useEffect(()=>{const restore=()=>select(readSitePage(window.location.href));window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore)},[select])
 return {...state,navigate}
}
