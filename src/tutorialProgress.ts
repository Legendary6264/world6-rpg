export const TUTORIAL_VERSION = 1
export type TutorialPath = 'player' | 'master'
export type TutorialProgress = {version:1;introSeen:boolean;preferred:TutorialPath|null;playerSteps:number[];masterSteps:number[];playerDone:boolean;masterDone:boolean}
type StoragePort = Pick<Storage,'getItem'|'setItem'>
type Stored = {progress:TutorialProgress;memoryOnly:boolean}
const memory = new Map<string,Stored>()
export const tutorialScope = (accountId?:string) => accountId ? 'account:'+accountId : 'guest'
export const tutorialProgressKey = (scope:string) => 'grani-bytiya.tutorial.v1.'+scope
export const emptyTutorialProgress = ():TutorialProgress => ({version:1,introSeen:false,preferred:null,playerSteps:[],masterSteps:[],playerDone:false,masterDone:false})
const record = (v:unknown):v is Record<string,unknown> => !!v&&typeof v==='object'&&!Array.isArray(v)
const steps = (v:unknown):v is number[] => Array.isArray(v)&&v.length<=5&&v.every(n=>Number.isInteger(n)&&n>=0&&n<5)&&new Set(v).size===v.length
export function isTutorialProgress(v:unknown):v is TutorialProgress {
 return record(v)&&Object.keys(v).length===7&&v.version===TUTORIAL_VERSION&&typeof v.introSeen==='boolean'&&
  (v.preferred===null||v.preferred==='player'||v.preferred==='master')&&steps(v.playerSteps)&&steps(v.masterSteps)&&typeof v.playerDone==='boolean'&&typeof v.masterDone==='boolean'
}
export const copyTutorialProgress = (p:TutorialProgress):TutorialProgress => ({version:1,introSeen:p.introSeen,preferred:p.preferred,playerSteps:[...p.playerSteps],masterSteps:[...p.masterSteps],playerDone:p.playerDone,masterDone:p.masterDone})
function browserStorage():StoragePort|null {try{return window.localStorage}catch{return null}}
export function readTutorialProgress(scope:string,storage:StoragePort|null=browserStorage()):Stored {
 const key=tutorialProgressKey(scope),saved=memory.get(key)
 if(saved)return {progress:copyTutorialProgress(saved.progress),memoryOnly:saved.memoryOnly}
 let progress=emptyTutorialProgress(),memoryOnly=!storage
 let raw:string|null=null
 if(storage){try{raw=storage.getItem(key)}catch{memoryOnly=true}}
 if(raw&&raw.length<=2000){try{const value:unknown=JSON.parse(raw);if(isTutorialProgress(value))progress=copyTutorialProgress(value)}catch{/* A damaged record resets marks, not storage availability. */}}
 return {progress,memoryOnly}
}
export function writeTutorialProgress(scope:string,progress:TutorialProgress,storage:StoragePort|null=browserStorage()):boolean {
 if(!isTutorialProgress(progress))return false
 const key=tutorialProgressKey(scope),copy=copyTutorialProgress(progress);let saved=false
 if(storage){try{storage.setItem(key,JSON.stringify(copy));saved=true}catch{/* Marks remain in memory; the tutorial world is never stored here. */}}
 memory.set(key,{progress:copy,memoryOnly:!saved});return saved
}
export function markTutorialStep(progress:TutorialProgress,path:TutorialPath,step:number):TutorialProgress {
 if(!isTutorialProgress(progress)||!['player','master'].includes(path)||!Number.isInteger(step)||step<0||step>4)throw Error('Неизвестный учебный шаг.')
 const next=copyTutorialProgress(progress),key=path==='player'?'playerSteps':'masterSteps';next[key]=[...new Set([...next[key],step])].sort();return next
}
