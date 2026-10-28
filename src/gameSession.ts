export type GameObjective={id:string;title:string;done:boolean}
export type GameOutcome='success'|'failure'|'stopped'
export type GameSession={version:1;status:'setup'|'playing'|'finished';objectives:GameObjective[];ready:{userId:string;actorIds:string[]}[];startedAt:string|null;finishedAt:string|null;outcome:GameOutcome|null;summary:string}
export type GameSessionView={revision:number;session:Omit<GameSession,'ready'>;chief:boolean;myReady:boolean;participants:{userId:string;name:string;heroCount:number;placed:boolean;ready:boolean;mine:boolean}[];blockers:string[];sceneName?:string;durationSeconds:number;roundPhase:string|null;canStart:boolean}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const id=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=160
const stamp=(v:unknown)=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v))
export function isGameObjectives(v:unknown):v is GameObjective[]{return Array.isArray(v)&&v.length<=12&&v.every(o=>obj(o)&&exact(o,['id','title','done'])&&id(o.id)&&typeof o.title==='string'&&!!o.title.trim()&&o.title.length<=160&&typeof o.done==='boolean')&&new Set(v.map(o=>o.id)).size===v.length}
export function isGameSession(v:unknown):v is GameSession{
 if(!obj(v)||!exact(v,['version','status','objectives','ready','startedAt','finishedAt','outcome','summary'])||v.version!==1||!['setup','playing','finished'].includes(v.status as string)||!isGameObjectives(v.objectives)||!Array.isArray(v.ready)||v.ready.length>20||!v.ready.every(r=>obj(r)&&exact(r,['userId','actorIds'])&&id(r.userId)&&Array.isArray(r.actorIds)&&r.actorIds.length<=200&&r.actorIds.every(id)&&new Set(r.actorIds).size===r.actorIds.length)||new Set(v.ready.map(r=>r.userId)).size!==v.ready.length||typeof v.summary!=='string'||v.summary.length>2000)return false
 if(v.status==='finished')return stamp(v.startedAt)&&stamp(v.finishedAt)&&['success','failure','stopped'].includes(v.outcome as string)&&!!v.summary.trim()
 return (v.status==='setup'?v.startedAt===null:stamp(v.startedAt))&&v.finishedAt===null&&v.outcome===null&&v.summary===''
}
export function emptyGameSession(titles:string[]=[]):GameSession{return {version:1,status:'setup',objectives:titles.map((title,i)=>({id:'goal-'+(i+1),title,done:false})),ready:[],startedAt:null,finishedAt:null,outcome:null,summary:''}}
export const sessionStatusLabels={setup:'Подготовка к игре',playing:'Приключение идёт',finished:'Игра завершена'}
export const sessionOutcomeLabels={success:'Победа',failure:'Неудача',stopped:'Игра остановлена'}
