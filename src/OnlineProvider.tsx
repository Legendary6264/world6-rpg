import { useState,useEffect,useCallback } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { OnlineContext } from './onlineContext'
import type { OnlineUser,OnlineConfig } from './onlineTypes'
import { fetchApi,apiBase } from './onlineClient'
const sessionKey='world6.local-session.'+(apiBase||'same-origin')
export default function OnlineProvider({children}:{children:ReactNode}){
 const [config,setConfig]=useState<OnlineConfig|null>(null),[supabase,setSupabase]=useState<SupabaseClient|null>(null),[token,setToken]=useState(''),[user,setUser]=useState<OnlineUser|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[connected,setConnected]=useState(false),[events,setEvents]=useState(0),[socket,setSocket]=useState<Socket|null>(null),[recovering,setRecovering]=useState(false)
 const refresh=useCallback(()=>setEvents(n=>n+1),[])
 const request=useCallback(<T,>(path:string,options?:RequestInit)=>fetchApi<T>(path,token,options),[token])
 const reloadUser=useCallback(async()=>{let currentToken=token;if(supabase){const {data,error}=await supabase.auth.getSession();if(error)throw error;currentToken=data.session?.access_token||''}if(currentToken){setToken(currentToken);const u=await fetchApi<OnlineUser>('/me',currentToken);setUser(u);refresh()}},[token,supabase,refresh])
 useEffect(()=>{let stopped=false,retry:ReturnType<typeof setTimeout>|undefined,client:SupabaseClient|null=null,dispose:(()=>void)|null=null
  function connectConfig(){void fetchApi<OnlineConfig>('/config').then(value=>{if(stopped)return;setConfig(value);setError('');if(value.authMode==='supabase'){client=createClient(value.supabaseUrl,value.publishableKey);setSupabase(client);const {data}=client.auth.onAuthStateChange((event,session)=>{if(stopped)return;setToken(session?.access_token||'');if(event==='PASSWORD_RECOVERY')setRecovering(true)});dispose=()=>data.subscription.unsubscribe();void client.auth.getSession().then(({data})=>{if(!stopped)setToken(data.session?.access_token||'')})}else{try{setToken(sessionStorage.getItem(sessionKey)||'')}catch{/* Session lasts in memory when storage is unavailable. */}}}).catch(e=>{if(!stopped){setError((e as Error).message+' Повторяем подключение…');retry=setTimeout(connectConfig,5000)}}).finally(()=>{if(!stopped)setLoading(false)})}
  connectConfig()
  return ()=>{stopped=true;clearTimeout(retry);dispose?.();void client?.removeAllChannels()}
 },[])
 useEffect(()=>{let stopped=false;if(!token){setUser(null);return}void fetchApi<OnlineUser>('/me',token).then(u=>{if(!stopped){setUser(u);setError('')}}).catch(e=>{if(!stopped){setUser(null);setError((e as Error).message);if(config?.authMode==='local'){setToken('');try{sessionStorage.removeItem(sessionKey)}catch{/* Unavailable storage. */}}}});return()=>{stopped=true}},[token,config])
 useEffect(()=>{if(!config)return;const connection=io(apiBase||window.location.origin,{auth:{token},reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:10000});setSocket(connection);connection.on('connect',()=>{setConnected(true);refresh()});connection.on('disconnect',()=>setConnected(false));connection.on('communityChanged',refresh);connection.on('lobbyChanged',refresh);connection.on('membershipChanged',refresh);return()=>{connection.disconnect();setConnected(false);setSocket(null)}},[config,token,refresh])
 function localSession(value:{token:string}){setToken(value.token);try{sessionStorage.setItem(sessionKey,value.token)}catch{/* Session lasts in memory. */}}
 async function login(email:string,password:string){if(!config)throw new Error(error||'Сервер ещё не подключён.');if(supabase){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw new Error(error.message)}else{localSession(await fetchApi('/auth/login','',{method:'POST',body:JSON.stringify({email,password})}))}return 'Вход выполнен.'}
 async function register(email:string,password:string,displayName:string){if(!config)throw new Error(error||'Сервер ещё не подключён.');if(supabase){const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName},emailRedirectTo:new URL(import.meta.env.BASE_URL,window.location.href).href}});if(error)throw new Error(error.message);return data.session?'Аккаунт создан.':'Открой письмо и подтверди email, затем войди.'}localSession(await fetchApi('/auth/register','',{method:'POST',body:JSON.stringify({email,password,displayName})}));return 'Аккаунт создан для локальной проверки.'}
 async function logout(){try{if(supabase){const {error}=await supabase.auth.signOut();if(error)throw error}else if(token)await request('/auth/logout',{method:'POST'})}finally{setToken('');setUser(null);setRecovering(false);try{sessionStorage.removeItem(sessionKey)}catch{/* Unavailable storage. */}}}
 return <OnlineContext.Provider value={{user,config,error,loading,connected,events,refresh,request,socket,supabase,login,register,logout,reloadUser,recovering,clearRecovery:()=>setRecovering(false)}}>{children}</OnlineContext.Provider>
}
