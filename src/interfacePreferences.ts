import {useSyncExternalStore,useLayoutEffect} from 'react'
export type InterfacePreferences={accent:'gold'|'mana'|'shadow';density:'comfortable'|'compact';text:'standard'|'large';atmosphere:boolean}
export const INTERFACE_PREFERENCES_KEY='world6.interface.v2'
export const defaultInterfacePreferences:InterfacePreferences={accent:'gold',density:'comfortable',text:'standard',atmosphere:true}
export function isInterfacePreferences(v:unknown):v is InterfacePreferences{
 if(!v||typeof v!=='object'||Array.isArray(v))return false
 const p=v as InterfacePreferences
 return Object.keys(p).length===4&&['gold','mana','shadow'].includes(p.accent)&&['comfortable','compact'].includes(p.density)&&['standard','large'].includes(p.text)&&typeof p.atmosphere==='boolean'
}
let current:InterfacePreferences|undefined
const listeners=new Set<()=>void>()
function snapshot(){if(!current){try{const stored=JSON.parse(window.localStorage.getItem(INTERFACE_PREFERENCES_KEY)??'null');current=isInterfacePreferences(stored)?stored:{...defaultInterfacePreferences}}catch{current={...defaultInterfacePreferences}}}return current}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export function applyInterfacePreferences(p:InterfacePreferences){const root=document.documentElement;root.dataset.uiAccent=p.accent;root.dataset.uiDensity=p.density;root.dataset.uiText=p.text;root.dataset.uiAtmosphere=p.atmosphere?'on':'off'}
export function updateInterfacePreferences(patch:Partial<InterfacePreferences>){
 const next={...snapshot(),...patch};if(!isInterfacePreferences(next))return false
 current=next;applyInterfacePreferences(next);let saved=true
 try{window.localStorage.setItem(INTERFACE_PREFERENCES_KEY,JSON.stringify(next))}catch{saved=false}
 for(const listener of listeners)listener()
 return saved
}
export const useInterfacePreferences=()=>useSyncExternalStore(subscribe,snapshot,snapshot)
export default function InterfacePreferencesBridge(){
 useLayoutEffect(()=>{applyInterfacePreferences(snapshot());const changed=(e:StorageEvent)=>{if(e.key!==INTERFACE_PREFERENCES_KEY&&e.key!==null)return;try{const next=JSON.parse(e.newValue??'null');current=isInterfacePreferences(next)?next:{...defaultInterfacePreferences}}catch{current={...defaultInterfacePreferences}}applyInterfacePreferences(current);for(const listener of listeners)listener()};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)},[])
 return null
}
