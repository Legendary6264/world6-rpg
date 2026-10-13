import { interruptCast } from './rpgEngine'
import { isRoundWork } from './roundWork'
import type { World } from './rpgEngine'
import type { Cost } from './rpgTypes'
export type CancellationInput={workIds:string[];actorIds:string[];reason:string}
export type CancellationSummary={operation:'cancel';reason:string;removedWork:{id:string;actorId:string;kind:string}[];returnedActorIds:string[];refunds:{actorId:string;castId:string;cost:Cost}[];seconds:number}
export function cancelPendingActions(world:World,value:CancellationInput,eventId:string,authorId:string,at:string,collectionExecuted=false):{world:World;summary:CancellationSummary}{
  const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=200&&v.every(id=>typeof id==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(id))&&new Set(v).size===v.length
  if(!value||!ids(value.workIds)||!ids(value.actorIds)||!value.workIds.length&&!value.actorIds.length||typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>1000)throw Error('Выбери действия и укажи причину отмены.')
  const old=world.campaign.roundWork??{version:1,entries:[]},active=world.campaign.declarations?.active
  if(!isRoundWork(old)||value.workIds.some(id=>!old.entries.some(e=>e.id===id))||value.actorIds.some(id=>collectionExecuted||!active?.entries.some(e=>e.actorId===id&&e.status==='submitted')))throw Error('Отменяемая очередь или заявление изменились. Обнови кампанию.')
  const removed=new Set<string>(),affected=new Set<string>(value.actorIds),refunds:CancellationSummary['refunds']=[]
  for(const id of value.workIds){const start=old.entries.findIndex(e=>e.id===id),actor=old.entries[start].actorId;affected.add(actor);for(const e of old.entries.slice(start))if(e.actorId===actor)removed.add(e.id)}
  let candidate=structuredClone(world)
  for(const [index,e] of old.entries.filter(e=>removed.has(e.id)&&e.ability).entries()){
    const cast=candidate.characters.find(a=>a.id===e.actorId)?.rpg.casts.find(c=>c.id===e.ability!.castId)
    if(cast?.status==='preparing'){candidate=interruptCast(candidate,e.actorId,cast.id,(eventId+'-cast-'+index).slice(0,160),value.reason);refunds.push({actorId:e.actorId,castId:cast.id,cost:candidate.characters.find(a=>a.id===e.actorId)!.rpg.casts.find(c=>c.id===cast.id)!.interruption!.refunded})}
  }
  candidate.campaign.roundWork={version:1,entries:(candidate.campaign.roundWork?.entries??[]).filter(e=>!removed.has(e.id))}
  const c=candidate.campaign.declarations?.active,returnedActorIds:string[]=[]
  if(c){c.epoch++;if(c.epoch>1e9)throw Error('Исчерпана версия сбора. Создай новый сбор.')
    if(!collectionExecuted)for(const entry of c.entries)if(affected.has(entry.actorId)&&entry.status==='submitted'){
      entry.status='returned';entry.note=value.reason;entry.revision++;returnedActorIds.push(entry.actorId)
      c.history=[...c.history,{id:(eventId+'-'+returnedActorIds.length).slice(0,160),kind:'return' as const,actorId:entry.actorId,authorId,at,entry:structuredClone(entry)}].slice(-200)
    }
  }
  const summary:CancellationSummary={operation:'cancel',reason:value.reason,removedWork:old.entries.filter(e=>removed.has(e.id)).map(e=>({id:e.id,actorId:e.actorId,kind:e.action.kind})),returnedActorIds,refunds,seconds:world.campaign.seconds}
  candidate.campaign.logs=[...candidate.campaign.logs,{id:eventId,seconds:world.campaign.seconds,text:'Отмена неисполненных действий',details:(value.reason+'\nСнято действий: '+summary.removedWork.length+'; возвращено заявлений: '+returnedActorIds.length+'. Уже произошедшие эффекты и позиции сохранены.').slice(0,12000)}].slice(-200)
  candidate.campaign.revision=world.campaign.revision+1
  return {world:candidate,summary}
}
