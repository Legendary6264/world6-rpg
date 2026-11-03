import { useState,useEffect,useCallback,useRef } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { OnlineContext } from './onlineContext'
import type { OnlineUser,OnlineConfig } from './onlineTypes'
import { fetchApi,apiBase } from './onlineClient'
import { installSocketRecovery } from './socketRecovery'
import { createSessionRecovery,sessionAccessDenied } from './sessionRecovery'
import type { SessionRecovery } from './sessionRecovery'

const sessionKey='world6.local-session.'+(apiBase||'same-origin')
export default function OnlineProvider({children}:{children:ReactNode}){
 const [config,setConfig]=useState<OnlineConfig|null>(null),[supabase,setSupabase]=useState<SupabaseClient|null>(null),[token,setToken]=useState(''),[user,setUser]=useState<OnlineUser|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[sessionLoading,setSessionLoading]=useState(false),[connected,setConnected]=useState(false),[events,setEvents]=useState(0),[socket,setSocket]=useState<Socket|null>(null),[recovering,setRecovering]=useState(false)
 const credential=useRef(''),session=useRef<(SessionRecovery<OnlineUser>&{token:string})|null>(null)
 const refresh=useCallback(()=>setEvents(n=>n+1),[])
 const request=useCallback(<T,>(path:string,options?:RequestInit)=>fetchApi<T>(path,token,options),[token])
 const changeToken=useCallback((next:string,subject?:string)=>{
  if(credential.current===next)return
  credential.current=next;session.current?.stop();session.current=null
  setToken(next);setSessionLoading(!!next);setError('')
  // A refreshed token for the same Supabase user keeps the party mounted.
  // Another identity never sees the previous player's profile or drafts.
  setUser(previous=>subject&&previous?.id===subject?previous:null)
 },[])
 const reloadUser=useCallback(async()=>{await session.current?.reload(true)},[])

 useEffect(()=>{
  let stopped=false,retry:ReturnType<typeof setTimeout>|undefined,client:SupabaseClient|null=null,dispose:(()=>void)|null=null
  function connectConfig(){
   void fetchApi<OnlineConfig>('/config').then(value=>{
    if(stopped)return
    setConfig(value);setError('')
    if(value.authMode==='supabase'){
     client=createClient(value.supabaseUrl,value.publishableKey);setSupabase(client)
     // INITIAL_SESSION and later auth events share one source of credentials.
     const {data}=client.auth.onAuthStateChange((event,current)=>{
      if(stopped)return
      changeToken(current?.access_token||'',current?.user.id)
      if(event==='PASSWORD_RECOVERY')setRecovering(true)
      else if(event==='SIGNED_OUT')setRecovering(false)
     })
     dispose=()=>data.subscription.unsubscribe()
    }else{
     try{changeToken(sessionStorage.getItem(sessionKey)||'')}catch{/* Session lasts in memory when storage is unavailable. */}
    }
   }).catch(e=>{
    if(!stopped){setError((e as Error).message+' Повторяем подключение…');retry=setTimeout(connectConfig,5000)}
   }).finally(()=>{if(!stopped)setLoading(false)})
  }
  connectConfig()
  return()=>{stopped=true;clearTimeout(retry);dispose?.();void client?.removeAllChannels()}
 },[changeToken])

 useEffect(()=>{
  if(!token||!config)return
  const recovery=createSessionRecovery(signal=>fetchApi<OnlineUser>('/me',token,{signal}),current=>{
   setUser(current);setSessionLoading(false)
   setError(current.mfaRequired?'Подтверди второй фактор в разделе «Аккаунт».':'');refresh()
  },(failure,retrying)=>{
   if(sessionAccessDenied(failure)){
    setUser(null)
    if(config.authMode==='local'){
     changeToken('')
     try{sessionStorage.removeItem(sessionKey)}catch{/* Unavailable storage. */}
    }
   }
   setSessionLoading(false);setError(failure.message+(retrying?' Восстанавливаем вход…':''))
  })
  session.current={...recovery,token}
  void recovery.reload().catch(()=>{})
  return()=>{recovery.stop();if(session.current?.token===token)session.current=null}
 },[token,config,changeToken,refresh])

 useEffect(()=>{
  if(!config)return
  const connection=io(apiBase||window.location.origin,{auth:{token},reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:10000})
  setSocket(connection);let stopped=false
  const stopRecovery=token?installSocketRecovery(connection,async()=>{
   const currentSession=session.current
   if(!currentSession||currentSession.token!==token)return false
   const current=await currentSession.reload()
   return !stopped&&credential.current===token&&!current.mfaRequired
  },e=>{if(!stopped)setError(e.message)}):()=>{}
  connection.on('connect',()=>{setConnected(true);refresh()})
  connection.on('disconnect',()=>setConnected(false))
  connection.on('communityChanged',refresh);connection.on('lobbyChanged',refresh);connection.on('membershipChanged',refresh)
  connection.on('accountChanged',()=>{void reloadUser().catch(()=>{})})
  return()=>{stopped=true;stopRecovery();connection.disconnect();setConnected(false);setSocket(null)}
 },[config,token,refresh,reloadUser])

 function localSession(value:{token:string}){changeToken(value.token);try{sessionStorage.setItem(sessionKey,value.token)}catch{/* Session lasts in memory. */}}
 async function login(email:string,password:string){if(!config)throw new Error(error||'Сервер ещё не подключён.');if(supabase){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw new Error(error.message)}else{localSession(await fetchApi('/auth/login','',{method:'POST',body:JSON.stringify({email,password})}))}return 'Вход выполнен.'}
 async function register(email:string,password:string,displayName:string){if(!config)throw new Error(error||'Сервер ещё не подключён.');if(supabase){const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName},emailRedirectTo:new URL(import.meta.env.BASE_URL,window.location.href).href}});if(error)throw new Error(error.message);return data.session?'Аккаунт создан.':'Открой письмо и подтверди email, затем войди.'}localSession(await fetchApi('/auth/register','',{method:'POST',body:JSON.stringify({email,password,displayName})}));return 'Аккаунт создан для локальной проверки.'}
 async function logout(){
  const previous=credential.current
  changeToken('');setUser(null);setRecovering(false)
  try{sessionStorage.removeItem(sessionKey)}catch{/* Unavailable storage. */}
  if(supabase){const {error}=await supabase.auth.signOut();if(error)throw error}
  else if(previous)await fetchApi('/auth/logout',previous,{method:'POST'})
 }
 return <OnlineContext.Provider value={{user,config,error,loading:loading||sessionLoading,connected,events,refresh,request,socket,supabase,login,register,logout,reloadUser,recovering,clearRecovery:()=>setRecovering(false)}}>{children}</OnlineContext.Provider>
}
