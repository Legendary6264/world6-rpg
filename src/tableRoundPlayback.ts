import {isPersonalRoundFeedback} from './roundFeedback'
import type {PublicRoundFeedback} from './roundFeedback'

export type TableRoundSession={id:string;durationMs:number;positionMs:number;speed:number;playing:boolean;changedAt:string}
export type TableRoundPlayback={generation:number;version:number;canControl:boolean;serverNow:number;session:TableRoundSession|null;report:PublicRoundFeedback|null}
export type TableClockSample={view:TableRoundPlayback;receivedAt:number;latencyMs:number}
export type TablePlaybackCommand={operation:'start'|'change'|'stop';generation:number;version:number;commandKey:string;characterId?:string;reportId?:string;positionMs?:number;speed?:number;playing?:boolean}
const number=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)
function report(value:unknown):value is PublicRoundFeedback{
 if(!value||typeof value!=='object')return false
 const {id,revision,appliedAt,...data}=value as PublicRoundFeedback
 return typeof id==='string'&&/^turn:[a-f0-9]{24}$/.test(id)&&Number.isSafeInteger(revision)&&revision>=0&&typeof appliedAt==='string'&&Number.isFinite(Date.parse(appliedAt))&&isPersonalRoundFeedback({...data,actorId:'self'})
}
export function isTableRoundPlayback(value:unknown):value is TableRoundPlayback{
 if(!value||typeof value!=='object')return false
 const v=value as TableRoundPlayback,s=v.session
 return Number.isSafeInteger(v.generation)&&v.generation>0&&Number.isSafeInteger(v.version)&&v.version>=0&&typeof v.canControl==='boolean'&&number(v.serverNow)&&v.serverNow>0&&(v.report===null||report(v.report))&&(s===null||!!s&&typeof s.id==='string'&&/^screen:[a-f0-9]{24}$/.test(s.id)&&number(s.durationMs)&&s.durationMs>0&&s.durationMs<=1e12+10000&&number(s.positionMs)&&s.positionMs>=0&&s.positionMs<=s.durationMs&&[.5,1,2,4].includes(s.speed)&&typeof s.playing==='boolean'&&typeof s.changedAt==='string'&&Number.isFinite(Date.parse(s.changedAt)))
}
// Server timestamps are paired with a monotonic response timestamp. A wrong
// device wall clock cannot shift the table's playhead; half the RTT estimates
// travel time without letting a long stalled request jump beyond its bounds.
export function tablePlaybackPosition(sample:TableClockSample,clientNow:number){
 const {view,receivedAt,latencyMs}=sample,s=view.session
 if(!s)return 0
 const elapsed=Math.max(0,view.serverNow-Date.parse(s.changedAt))+Math.max(0,clientNow-receivedAt)+Math.min(1000,Math.max(0,latencyMs/2))
 return Math.max(0,Math.min(s.durationMs,s.positionMs+(s.playing?elapsed*s.speed:0)))
}
export function isTablePlaybackAck(value:unknown,command:TablePlaybackCommand):boolean{
 if(!value||typeof value!=='object')return false
 const v=value as Record<string,unknown>
 return v.commandKey===command.commandKey&&v.generation===command.generation&&v.version===command.version+1&&v.operation===command.operation&&typeof v.duplicate==='boolean'
}
