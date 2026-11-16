import {physicsId,physicsKeys,physicsRecord} from './physicsUnits'
import {isTimestamp} from './characterKnowledge'
import type {CampaignStory} from './campaignStory'

export const MAX_QUESTS=60,MAX_QUEST_OBJECTIVES=12
export const questStatusLabels={active:'В работе',completed:'Выполнено',failed:'Не выполнено'} as const
export type QuestObjective={id:string;title:string;done:boolean}
export type QuestDraft={id:string;title:string;description:string;notes:string;status:keyof typeof questStatusLabels;published:boolean;audience:string[];objectives:QuestObjective[];sourceMessageId:string}
export type Quest=QuestDraft&{updatedAt:string}
export type QuestLog={version:number;entries:Quest[]}
export type PublicQuest=Pick<Quest,'id'|'title'|'description'|'status'|'objectives'|'updatedAt'>&{source?:{id:string;speaker:string;body:string}}
export type QuestMasterView={generation:number;version:number;closed:boolean;quests:Quest[];heroes:{id:string;name:string}[];sources:{id:string;speaker:string;body:string}[]}
export type QuestPlayerView={closed:boolean;quests:PublicQuest[]}
export type QuestCommand={generation:number;baseVersion:number;quest:QuestDraft;commandKey:string}
const fields=['id','title','description','notes','status','published','audience','objectives','sourceMessageId']
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&Array.from(v).every(c=>c>=' '||'\t\n\r'.includes(c))
const version=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0
const objectives=(v:unknown):v is QuestObjective[]=>Array.isArray(v)&&v.length<=MAX_QUEST_OBJECTIVES&&v.every(o=>physicsRecord(o)&&physicsKeys(o,['id','title','done'])&&physicsId(o.id)&&text(o.title,160)&&!!o.title.trim()&&typeof o.done==='boolean')&&new Set(v.map(o=>o.id)).size===v.length
function draftFields(v:Record<string,unknown>){
 return physicsId(v.id)&&text(v.title,160)&&!!v.title.trim()&&text(v.description,4000)&&text(v.notes,8000)&&typeof v.status==='string'&&Object.hasOwn(questStatusLabels,v.status)&&typeof v.published==='boolean'&&Array.isArray(v.audience)&&v.audience.length<=200&&v.audience.every(physicsId)&&new Set(v.audience).size===v.audience.length&&(!v.published||v.audience.length>0)&&objectives(v.objectives)&&(v.sourceMessageId===''||physicsId(v.sourceMessageId))&&(v.status!=='completed'||v.objectives.every(o=>o.done))
}
export function isQuestDraft(v:unknown):v is QuestDraft{return physicsRecord(v)&&physicsKeys(v,fields)&&draftFields(v)}
export function isQuest(v:unknown):v is Quest{return physicsRecord(v)&&physicsKeys(v,[...fields,'updatedAt'])&&draftFields(v)&&isTimestamp(v.updatedAt)}
export function isQuestLog(v:unknown):v is QuestLog{return physicsRecord(v)&&physicsKeys(v,['version','entries'])&&version(v.version)&&Array.isArray(v.entries)&&v.entries.length<=MAX_QUESTS&&v.entries.every(isQuest)&&new Set(v.entries.map(q=>q.id)).size===v.entries.length}
export const emptyQuestLog=():QuestLog=>({version:0,entries:[]})
export const newQuest=(id:string):QuestDraft=>({id,title:'',description:'',notes:'',status:'active',published:false,audience:[],objectives:[],sourceMessageId:''})
export function publicQuests(story:CampaignStory,actorId:string):PublicQuest[]{
 return (story.quests?.entries??[]).filter(q=>q.published&&q.audience.includes(actorId)).map(q=>{
  const source=story.messages.find(m=>m.id===q.sourceMessageId&&m.kind!=='request'&&m.audience.includes(actorId))
  return {id:q.id,title:q.title,description:q.description,status:q.status,objectives:q.objectives.map(o=>({...o})),updatedAt:q.updatedAt,...(source?{source:{id:source.id,speaker:source.speaker,body:source.body.slice(0,240)}}:{})}
 })
}
export function isQuestPlayerView(v:unknown):v is QuestPlayerView{
 return physicsRecord(v)&&physicsKeys(v,['closed','quests'])&&typeof v.closed==='boolean'&&Array.isArray(v.quests)&&v.quests.length<=MAX_QUESTS&&v.quests.every(q=>physicsRecord(q)&&physicsKeys(q,['id','title','description','status','objectives','updatedAt',...(q.source===undefined?[]:['source'])])&&physicsId(q.id)&&text(q.title,160)&&!!q.title.trim()&&text(q.description,4000)&&typeof q.status==='string'&&Object.hasOwn(questStatusLabels,q.status)&&objectives(q.objectives)&&(q.status!=='completed'||q.objectives.every(o=>o.done))&&isTimestamp(q.updatedAt)&&(q.source===undefined||physicsRecord(q.source)&&physicsKeys(q.source,['id','speaker','body'])&&physicsId(q.source.id)&&text(q.source.speaker,120)&&text(q.source.body,240)))&&new Set(v.quests.map(q=>(q as PublicQuest).id)).size===v.quests.length
}
export function isQuestMasterView(v:unknown):v is QuestMasterView{
 return physicsRecord(v)&&version(v.generation)&&v.generation>0&&version(v.version)&&typeof v.closed==='boolean'&&Array.isArray(v.quests)&&v.quests.length<=MAX_QUESTS&&v.quests.every(isQuest)&&new Set(v.quests.map(q=>q.id)).size===v.quests.length&&Array.isArray(v.heroes)&&v.heroes.length<=200&&v.heroes.every(h=>physicsRecord(h)&&physicsId(h.id)&&text(h.name,120))&&Array.isArray(v.sources)&&v.sources.length<=1000&&v.sources.every(s=>physicsRecord(s)&&physicsId(s.id)&&text(s.speaker,120)&&text(s.body,240))
}
export function isQuestAck(v:unknown,c:QuestCommand):boolean{
 return physicsRecord(v)&&typeof v.duplicate==='boolean'&&physicsRecord(v.receipt)&&v.receipt.operation==='quest-save'&&v.receipt.commandKey===c.commandKey&&v.receipt.id===c.quest.id&&v.receipt.generation===c.generation&&v.receipt.version===c.baseVersion+1&&isTimestamp(v.receipt.appliedAt)
}
