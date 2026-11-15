import {compareAmounts} from './exactWork'
import {physicsId,physicsKeys,physicsNumber,physicsRecord} from './physicsUnits'
import {isRoundApplyAck} from './commandAcknowledgements'
import type {DeclaredAction,DeclarationCollection} from './actionDeclarations'
import type {World} from './rpgEngine'
import type {CharacterDraft} from './characterModel'
import type {RoundExecutionSummary} from './roundExecution'
import type {RoundWorkEntry} from './roundWork'

export const feedbackResourceLabels={mana:'Мана',shadow:'Тень',stamina:'Выносливость'} as const
export const feedbackStatusLabels={completed:'Выполнено',continuing:'Продолжается',queued:'В очереди',waiting:'Ожидает продолжения',interrupted:'Прервано','not-executed':'Не исполнено в этом раунде',started:'Начато'} as const
type ResourceId=keyof typeof feedbackResourceLabels
export type FeedbackAction={id:string;label:string;status:keyof typeof feedbackStatusLabels;progress?:number}
export type FeedbackResource={id:ResourceId;before:string;after:string;beforeMaximum:string;afterMaximum:string}
export type PersonalRoundFeedback={actorId:string;coverage:'full'|'events';fromSeconds:number;toSeconds:number;note:string;actions:FeedbackAction[];resources:FeedbackResource[]}
export type RoundFeedback={version:1;actors:PersonalRoundFeedback[]}
export type PublicRoundFeedback=Omit<PersonalRoundFeedback,'actorId'>&{id:string;appliedAt:string;revision:number}
export type RoundFeedbackView={revision:number;generation?:number;closed:boolean;reports:PublicRoundFeedback[];hasMore:boolean}
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length<=max
export function isResultNotes(value:unknown):value is Record<string,string>{
  return physicsRecord(value)&&Object.keys(value).length<=200&&Object.entries(value).every(([id,note])=>physicsId(id)&&text(note,2000)&&Array.from(note).every(char=>char>=' '||'\t\n\r'.includes(char)))
}
export function resultNotes(value:unknown,allowed:string[]):Record<string,string>{
  if(value===undefined)return {}
  if(!isResultNotes(value)||Object.keys(value).some(id=>!allowed.includes(id)))throw Error('Проверь пояснения: до 2000 символов для участника раунда.')
  return Object.fromEntries(Object.entries(value).map(([id,note])=>[id,note.trim()]).filter(([,note])=>!!note))
}
export function isPersonalRoundFeedback(value:unknown):value is PersonalRoundFeedback{
  if(!physicsRecord(value)||!physicsKeys(value,['actorId','coverage','fromSeconds','toSeconds','note','actions','resources'])||!physicsId(value.actorId)||
    !['full','events'].includes(String(value.coverage))||!physicsNumber(value.fromSeconds)||!physicsNumber(value.toSeconds)||value.toSeconds<value.fromSeconds||!text(value.note,2000)||
    !Array.isArray(value.actions)||value.actions.length>220||!Array.isArray(value.resources)||value.resources.length>3)return false
  return value.actions.every(a=>physicsRecord(a)&&physicsKeys(a,['id','label','status',...(a.progress===undefined?[]:['progress'])])&&
    typeof a.id==='string'&&/^(carry|action|event):\d{1,3}$/.test(a.id)&&text(a.label,240)&&!!a.label.trim()&&
    typeof a.status==='string'&&Object.hasOwn(feedbackStatusLabels,a.status)&&(a.progress===undefined||physicsNumber(a.progress,0,100)))&&
    new Set(value.actions.map(a=>a.id)).size===value.actions.length&&value.resources.every(r=>physicsRecord(r)&&physicsKeys(r,['id','before','after','beforeMaximum','afterMaximum'])&&
      typeof r.id==='string'&&Object.hasOwn(feedbackResourceLabels,r.id)&&[r.before,r.after,r.beforeMaximum,r.afterMaximum].every(v=>text(v,80)))&&
    new Set(value.resources.map(r=>r.id)).size===value.resources.length
}
export function isRoundFeedback(value:unknown):value is RoundFeedback{
  return physicsRecord(value)&&physicsKeys(value,['version','actors'])&&value.version===1&&Array.isArray(value.actors)&&value.actors.length<=200&&
    value.actors.every(isPersonalRoundFeedback)&&new Set(value.actors.map(a=>a.actorId)).size===value.actors.length&&
    value.actors.reduce((count,a)=>count+a.actions.length,0)<=4200&&new TextEncoder().encode(JSON.stringify(value)).length<=8*1024*1024
}
export function isFeedbackApplyAck(value:unknown,command:{previewId:string;generation:number;resultNotes?:Record<string,string>}):boolean{
  if(!isRoundApplyAck(value,command))return false
  if(command.resultNotes===undefined)return true
  if(!isResultNotes(command.resultNotes))return false
  const personal=(value as {receipt:{summary:{personal?:unknown}}}).receipt.summary.personal
  return isRoundFeedback(personal)&&Object.keys(command.resultNotes).every(id=>personal.actors.some(actor=>actor.actorId===id))&&
    personal.actors.every(actor=>actor.note===(Object.hasOwn(command.resultNotes!,actor.actorId)?command.resultNotes![actor.actorId].trim():''))
}
const actionLabels:Record<string,string>={move:'Перемещение',wait:'Ожидание',speak:'Речь',interact:'Взаимодействие',item:'Предмет',ability:'Способность'}
const operationLabels:Record<string,string>={inspect:'Осмотр',open:'Открытие объекта',close:'Закрытие объекта',lock:'Запирание объекта',unlock:'Отпирание объекта',ignite:'Зажигание',extinguish:'Тушение',activate:'Активация',deactivate:'Отключение',relocate:'Перемещение объекта'}
function actionLabel(action:DeclaredAction,actor:CharacterDraft,after?:CharacterDraft,castId?:string):string{
  if(action.kind==='ability'){
    const cast=actor.rpg?.casts.find(c=>c.id===(action.castId??castId))??after?.rpg?.casts.find(c=>c.id===(action.castId??castId))
    const name=cast?.ability.name??actor.rpg?.abilities.find(a=>a.id===action.abilityId)?.name
    return ((action.stage==='prepare'?'Подготовка':'Применение')+(name?' «'+name+'»':' способности')).slice(0,240)
  }
  if(action.kind==='item')return ('Предмет'+(actor.rpg?.inventory.find(i=>i.id===action.itemId)?.name?' «'+actor.rpg.inventory.find(i=>i.id===action.itemId)!.name+'»':'')).slice(0,240)
  return action.kind==='interact'?operationLabels[action.operation]??'Взаимодействие с объектом':actionLabels[action.kind]??'Действие'
}
function resourceChanges(before:CharacterDraft,after:CharacterDraft):FeedbackResource[]{
  return (Object.keys(feedbackResourceLabels) as ResourceId[]).flatMap(id=>{
    const from=before.resources?.[id],to=after.resources?.[id]
    return from&&to&&(from.current!==to.current||from.maximum!==to.maximum)&&[from.current,to.current,from.maximum,to.maximum].every(v=>text(v,80))?
      [{id,before:from.current,after:to.current,beforeMaximum:from.maximum,afterMaximum:to.maximum}]:[]
  })
}
const progress=(work:RoundWorkEntry)=>{
  const total=Number(work.amount.total.numerator)/Number(work.amount.total.denominator),remaining=Number(work.amount.remaining.numerator)/Number(work.amount.remaining.denominator)
  return Number.isFinite(total)&&total>0&&Number.isFinite(remaining)?{progress:Math.round(Math.max(0,Math.min(100,100*(1-remaining/total)))*10)/10}:{}
}
export function buildRoundFeedback(before:World,after:World,collection:DeclarationCollection,summary:RoundExecutionSummary,notes:Record<string,string>={}):RoundFeedback{
  const oldWork=before.campaign.roundWork?.entries??[],newWork=after.campaign.roundWork?.entries??[],oldIds=new Set(oldWork.map(w=>w.id))
  const actors=before.characters.flatMap(actor=>{
    const next=after.characters.find(a=>a.id===actor.id);if(!next)return []
    const entry=collection.entries.find(e=>e.actorId===actor.id&&e.status==='submitted'),prior=oldWork.filter(w=>w.actorId===actor.id),resources=resourceChanges(actor,next),note=Object.hasOwn(notes,actor.id)?notes[actor.id]:''
    if(!collection.participantIds.includes(actor.id)&&!prior.length&&!resources.length&&!note)return []
    const events=summary.events.filter(e=>e.actorId===actor.id),removed=new Set(summary.charges?.filter(c=>c.actorId===actor.id&&c.mode==='interrupt').flatMap(c=>c.removedWorkIds)??[])
    const actions:FeedbackAction[]=prior.map((work,index)=>{
      const pending=newWork.find(w=>w.id===work.id),done=events.filter(e=>e.workId===work.id),castId=work.ability?.castId??(work.action.kind==='ability'?work.action.castId:undefined)
      const interrupted=removed.has(work.id)||next.rpg.casts.some(c=>c.id===castId&&c.status==='interrupted')||summary.speech?.some(s=>s.actorId===actor.id&&s.key===work.id&&s.interruption)
      const status=pending?(compareAmounts(pending.amount.remaining,work.amount.remaining)===0?'waiting':'continuing'):interrupted?'interrupted':done.some(e=>e.kind!=='prepare')?'completed':'not-executed'
      return {id:'carry:'+index,label:actionLabel(work.action,actor,next,castId),status,...(pending?progress(pending):{})}
    })
    for(const [index,action] of (entry?.actions??[]).entries()){
      const pending=newWork.find(w=>w.actorId===actor.id&&w.origin.collectionId===collection.id&&w.origin.entryRevision===entry!.revision&&w.origin.actionIndex===index)
      const done=events.filter(e=>e.actionIndex===index&&!oldIds.has(e.workId)),castId=done.find(e=>e.castId)?.castId
      const interrupted=done.some(e=>removed.has(e.workId))||action.kind==='ability'&&next.rpg.casts.some(c=>c.id===(action.castId??castId)&&c.status==='interrupted')||summary.speech?.some(s=>s.actorId===actor.id&&s.key==='new:'+actor.id+':'+index&&s.interruption)
      const status=pending?(compareAmounts(pending.amount.remaining,pending.amount.total)===0&&!done.length?'queued':'continuing'):interrupted?'interrupted':done.some(e=>e.kind!=='prepare')?'completed':done.length?'started':'not-executed'
      actions.push({id:'action:'+index,label:actionLabel(action,actor,next,castId),status,...(pending?progress(pending):{})})
    }
    return [{actorId:actor.id,coverage:'full' as const,fromSeconds:before.campaign.seconds,toSeconds:after.campaign.seconds,note,actions,resources}]
  })
  const result:RoundFeedback={version:1,actors}
  if(!isRoundFeedback(result))throw Error('Не удалось сохранить персональные итоги раунда.')
  return result
}

// Old receipts preserve events but cannot prove historical resource deltas.
export function legacyRoundFeedback(before:World,summary:RoundExecutionSummary,actorId:string):PersonalRoundFeedback|null{
  const actor=before.characters.find(a=>a.id===actorId),collection=before.campaign.declarations?.active
  if(!actor||!collection||!Array.isArray(summary.events)||!Array.isArray(summary.carried)||!physicsNumber(summary.durationSeconds,0,1e9))return null
  const entry=collection.entries.find(e=>e.actorId===actorId&&e.status==='submitted'),prior=before.campaign.roundWork?.entries??[]
  const own=summary.events.slice(-8400).filter(e=>physicsRecord(e)&&e.actorId===actorId&&physicsId(e.workId)&&Number.isInteger(e.actionIndex)&&e.actionIndex>=0&&e.actionIndex<20&&typeof e.kind==='string')
  const pending=summary.carried.slice(-200).filter(w=>physicsRecord(w)&&w.actorId===actorId&&physicsId(w.id)&&typeof w.actionKind==='string')
  if(!own.length&&!pending.length&&!collection.participantIds.includes(actorId))return null
  const latest=new Map(own.map(e=>[e.workId,e])),actions:FeedbackAction[]=[]
  for(const event of latest.values()){
    const action=prior.find(w=>w.actorId===actorId&&w.id===event.workId)?.action??entry?.actions[event.actionIndex]
    if(!action||!['inspect','speak','wait','relocate','move','item','prepare','ready','release',...Object.keys(operationLabels)].includes(event.kind))continue
    actions.push({id:'event:'+actions.length,label:actionLabel(action,actor,undefined,event.castId),status:pending.some(w=>w.id===event.workId)?'waiting':event.kind==='prepare'?'started':'completed'})
  }
  for(const work of pending.filter(w=>!latest.has(w.id)))actions.push({id:'event:'+actions.length,label:actionLabels[work.actionKind as keyof typeof actionLabels]??'Действие',status:'waiting'})
  const report:PersonalRoundFeedback={actorId,coverage:'events',fromSeconds:before.campaign.seconds,toSeconds:before.campaign.seconds+summary.durationSeconds,note:'',actions:actions.slice(-220),resources:[]}
  return isPersonalRoundFeedback(report)?report:null
}
export function publicFeedback(report:PersonalRoundFeedback):Omit<PersonalRoundFeedback,'actorId'>{
  return {coverage:report.coverage,fromSeconds:report.fromSeconds,toSeconds:report.toSeconds,note:report.note,
    actions:report.actions.map(action=>({...action})),resources:report.resources.map(resource=>({...resource}))}
}
