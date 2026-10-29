export type GameSessionResult={id:string;title:string;summary:string;finishedAt:string;sourceRevision:number}
export type GameSessionView={revision:number;status:'open'|'playing'|'closed';paused:boolean;seconds:number;
 phase:'preparing'|'ready'|'planning'|'resolving'|'applied'|'paused'|'finished';
 round:{phase:string;received:number;total:number}|null;result:GameSessionResult|null;
 ready?:{id:string;label:string;done:boolean;section:string}[];canStart?:boolean;pendingWork?:number;finishBlockers?:string[]}
export const gameSessionLabels:Record<GameSessionView['phase'],string>={preparing:'Подготовка к совместной игре',ready:'Игра идёт · можно открыть раунд',planning:'Игроки составляют ходы',resolving:'Мастер разрешает раунд',applied:'Раунд применён',paused:'Игра на паузе',finished:'Игра завершена'}
export type FinishGameCommand={revision:number;title:string;summary:string;keepPending:boolean;commandKey:string}

// A stale API deployment or proxy can return a different successful response.
// Keep the game screen usable and offer a retry instead of trusting a TS cast.
export function isGameSessionView(v:unknown):v is GameSessionView{
 if(!v||typeof v!=='object')return false
 const s=v as GameSessionView,integer=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0
 if(!integer(s.revision)||!['open','playing','closed'].includes(s.status)||typeof s.paused!=='boolean'||!Number.isFinite(s.seconds)||s.seconds<0||!Object.hasOwn(gameSessionLabels,s.phase))return false
 if(s.round!==null&&(!s.round||typeof s.round.phase!=='string'||!integer(s.round.received)||!integer(s.round.total)))return false
 if(s.result!==null){const r=s.result;if(!r||typeof r.id!=='string'||typeof r.title!=='string'||r.title.length>80||typeof r.summary!=='string'||r.summary.length>4000||!integer(r.sourceRevision)||typeof r.finishedAt!=='string'||!Number.isFinite(Date.parse(r.finishedAt)))return false}
 return (s.ready===undefined||Array.isArray(s.ready)&&s.ready.every(r=>!!r&&typeof r.id==='string'&&typeof r.label==='string'&&typeof r.done==='boolean'&&typeof r.section==='string'))&&
  (s.canStart===undefined||typeof s.canStart==='boolean')&&(s.pendingWork===undefined||integer(s.pendingWork))&&(s.finishBlockers===undefined||Array.isArray(s.finishBlockers)&&s.finishBlockers.every(b=>typeof b==='string'))
}

// Persisted sessions from the public release remain readable in worlds and backups.
export type GameObjective={id:string;title:string;done:boolean}
export type GameOutcome='success'|'failure'|'stopped'
export type GameSession={version:1;status:'setup'|'playing'|'finished';objectives:GameObjective[];ready:{userId:string;actorIds:string[]}[];startedAt:string|null;finishedAt:string|null;outcome:GameOutcome|null;summary:string}
export type LegacyGameSessionView={revision:number;session:Omit<GameSession,'ready'>;chief:boolean;myReady:boolean;participants:{userId:string;name:string;heroCount:number;placed:boolean;ready:boolean;mine:boolean}[];blockers:string[];sceneName?:string;durationSeconds:number;roundPhase:string|null;canStart:boolean}
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

export function isLegacyGameSessionView(v:unknown):v is LegacyGameSessionView{
 if(!obj(v)||!obj(v.session)||!isGameSession({...v.session,ready:[]})||!Number.isSafeInteger(v.revision)||Number(v.revision)<0||typeof v.chief!=='boolean'||typeof v.myReady!=='boolean'||typeof v.canStart!=='boolean'||!Number.isFinite(v.durationSeconds)||!Array.isArray(v.blockers)||!v.blockers.every(b=>typeof b==='string')||!Array.isArray(v.participants))return false
 return v.participants.every(p=>obj(p)&&typeof p.userId==='string'&&typeof p.name==='string'&&Number.isSafeInteger(p.heroCount)&&Number(p.heroCount)>=0&&['placed','ready','mine'].every(k=>typeof p[k]==='boolean'))
}
