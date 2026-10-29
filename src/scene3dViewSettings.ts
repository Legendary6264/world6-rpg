export type LightTuning={azimuth:number;elevation:number;sun:number;ambient:number;lamps:number;softness:number;contact:number}
export type LightPreset='studio'|'day'|'night'|'tavern'
export type ViewLightSettings={version:1;mode:LightPreset;tuning:LightTuning;exposure:number}
const storageKey='grani-bytiya:3d-lighting:v1'
export function defaultLightTuning(mode:LightPreset):LightTuning{if(mode==='tavern')return {azimuth:330,elevation:55,sun:.8,ambient:1,lamps:.85,softness:1.6,contact:.38};return {azimuth:315,elevation:mode==='night'?42:50,sun:1,ambient:1,lamps:1,softness:1,contact:.55}}
export function normalizeLightTuning(value:unknown,mode:LightPreset):LightTuning{
 const source=value&&typeof value==='object'?value as Record<string,unknown>:{},defaults=defaultLightTuning(mode)
 const clamp=(key:keyof LightTuning,min:number,max:number)=>typeof source[key]==='number'&&Number.isFinite(source[key])?Math.max(min,Math.min(max,source[key] as number)):defaults[key]
 return {azimuth:clamp('azimuth',0,360),elevation:clamp('elevation',5,85),sun:clamp('sun',0,2),ambient:clamp('ambient',0,2),lamps:clamp('lamps',0,3),softness:clamp('softness',.25,3),contact:clamp('contact',0,1)}
}
export function lightDirection(tuning:LightTuning){const a=tuning.azimuth*Math.PI/180,e=tuning.elevation*Math.PI/180;return {x:Math.sin(a)*Math.cos(e),y:Math.sin(e),z:Math.cos(a)*Math.cos(e)}}
export function readViewLightSettings(preferred:LightPreset='day'):ViewLightSettings{
 const fallback:ViewLightSettings={version:1,mode:preferred,tuning:defaultLightTuning(preferred),exposure:1}
 try{
  if(typeof window==='undefined')return fallback
  const raw=window.localStorage.getItem(storageKey);if(!raw||raw.length>4096)return fallback
  const value=JSON.parse(raw),mode:LightPreset=['studio','day','night','tavern'].includes(value?.mode)?value.mode:'day'
  if(value?.version!==1)return fallback
  return {version:1,mode,tuning:normalizeLightTuning(value.tuning,mode),exposure:typeof value.exposure==='number'&&Number.isFinite(value.exposure)?Math.max(.5,Math.min(1.6,value.exposure)):1}
 }catch{return fallback}
}
export function saveViewLightSettings(settings:ViewLightSettings){try{if(typeof window!=='undefined')window.localStorage.setItem(storageKey,JSON.stringify(settings))}catch{/* Scene editing continues when browser storage is unavailable. */}}
