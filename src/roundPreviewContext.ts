export const isRoundRulesStamp=(value:unknown):value is string=>typeof value==='string'&&/^r1:[a-f0-9]{64}$/.test(value)
export function sameRoundContext(reply:{revision:number;rulesStamp?:string},revision:number,rulesStamp?:string):boolean{
  if(!Number.isSafeInteger(reply.revision)||reply.revision<0)return false
  return rulesStamp===undefined?reply.revision===revision:
    isRoundRulesStamp(rulesStamp)&&reply.rulesStamp===rulesStamp&&reply.revision>=revision
}
