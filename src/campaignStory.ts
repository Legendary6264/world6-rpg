import { isTimestamp } from './characterKnowledge'
import { physicsId, physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'

export type StoryBeat = {
  id:string; title:string; sceneId:string; status:'planned'|'active'|'done'
  opening:string; notes:string; npcId:string; alias:string; reply:string
}
export type StoryMessage = {
  id:string; kind:'request'|'narration'|'npc'; sceneId:string; actorId:string; speaker:string
  targetId:string; targetLabel:string; body:string; audience:string[]; replyTo:string
  resolved:boolean; seconds:number; createdAt:string
  resolution?:{kind:'answered'|'dismissed'|'withdrawn';note:string;at:string}
}
export type CampaignStory = {version:1; planVersion:number; beats:StoryBeat[]; messages:StoryMessage[]}
export type PublicStoryMessage = Pick<StoryMessage,'id'|'kind'|'speaker'|'body'|'seconds'|'createdAt'|'resolved'|'targetLabel'|'resolution'>
export type StoryPlayerView = {closed:boolean; paused:boolean; sceneId:string; canAsk:boolean; canWithdraw:boolean; totalMessages:number; contacts:{id:string;label:string}[]; messages:PublicStoryMessage[]}
export type StoryMasterView = {
  revision:number;closed:boolean;paused:boolean;planVersion:number;totalMessages:number;beats:StoryBeat[];messages:StoryMessage[];pending:StoryMessage[]
  activeSceneId:string;scenes:{id:string;name:string}[];npcs:{id:string;name:string;sceneId:string}[]
  heroes:{id:string;name:string;sceneId:string;submitted:boolean}[]
}
export const MAX_STORY_MESSAGES = 1000
export const MAX_STORY_BEATS = 60
export const storyBeatLabels = {planned:'Запланировано',active:'Сейчас',done:'Завершено'} as const
const text=(value:unknown,max:number):value is string => typeof value==='string' && value.length<=max
const reference=(value:unknown) => value==='' || physicsId(value)
export const emptyStory = ():CampaignStory => ({version:1,planVersion:0,beats:[],messages:[]})
export const newStoryBeat = (id:string):StoryBeat => ({id,title:'',sceneId:'',status:'planned',opening:'',notes:'',npcId:'',alias:'',reply:''})

export function isStoryBeat(value:unknown):value is StoryBeat {
  return physicsRecord(value) && physicsKeys(value,['id','title','sceneId','status','opening','notes','npcId','alias','reply']) &&
    physicsId(value.id) && text(value.title,120) && !!value.title.trim() && reference(value.sceneId) &&
    typeof value.status==='string' && Object.hasOwn(storyBeatLabels,value.status) &&
    text(value.opening,4000) && text(value.notes,8000) && reference(value.npcId) && text(value.alias,120) && text(value.reply,4000)
}
export function isStoryBeats(value:unknown):value is StoryBeat[] {
  return Array.isArray(value) && value.length<=MAX_STORY_BEATS && value.every(isStoryBeat) &&
    new Set(value.map(beat=>beat.id)).size===value.length && value.filter(beat=>beat.status==='active').length<=1
}
function isStoryMessage(value:unknown):value is StoryMessage {
  return physicsRecord(value) && physicsKeys(value,['id','kind','sceneId','actorId','speaker','targetId','targetLabel','body',
    'audience','replyTo','resolved','seconds','createdAt',...(Object.hasOwn(value,'resolution')?['resolution']:[])]) && physicsId(value.id) &&
    ['request','narration','npc'].includes(String(value.kind)) && reference(value.sceneId) && reference(value.actorId) &&
    reference(value.targetId) && reference(value.replyTo) && text(value.speaker,120) && !!value.speaker.trim() &&
    text(value.targetLabel,120) && text(value.body,4000) && !!value.body.trim() &&
    Array.isArray(value.audience) && value.audience.length>0 && value.audience.length<=200 && value.audience.every(physicsId) &&
    new Set(value.audience).size===value.audience.length && typeof value.resolved==='boolean' &&
    physicsNumber(value.seconds,0,1e12) && isTimestamp(value.createdAt) &&
    (!Object.hasOwn(value,'resolution') || value.kind==='request' && value.resolved===true && physicsRecord(value.resolution) &&
      physicsKeys(value.resolution,['kind','note','at']) && ['answered','dismissed','withdrawn'].includes(String(value.resolution.kind)) &&
      text(value.resolution.note,1000) && isTimestamp(value.resolution.at))
}
export function isCampaignStory(value:unknown):value is CampaignStory {
  if (!physicsRecord(value) || !physicsKeys(value,['version','planVersion','beats','messages']) || value.version!==1 ||
    !Number.isSafeInteger(value.planVersion) || Number(value.planVersion)<0 || !isStoryBeats(value.beats) ||
    !Array.isArray(value.messages) || value.messages.length>MAX_STORY_MESSAGES || !value.messages.every(isStoryMessage)) return false
  const ids=new Set(value.messages.map(message=>message.id))
  return ids.size===value.messages.length && value.messages.every(message=>!message.replyTo || ids.has(message.replyTo)) &&
    new TextEncoder().encode(JSON.stringify(value)).length<=3*1024*1024
}
export const copyStory = (story:CampaignStory):CampaignStory => structuredClone(story)
export function isStoryAck(value:unknown,operation:string,commandKey:string):boolean {
  if (!physicsRecord(value) || typeof value.duplicate!=='boolean' || !physicsRecord(value.receipt)) return false
  const receipt=value.receipt
  return receipt.operation===operation && receipt.commandKey===commandKey &&
    Number.isSafeInteger(receipt.revision) && Number(receipt.revision)>=0 &&
    Number.isSafeInteger(receipt.planVersion) && Number(receipt.planVersion)>=0 && isTimestamp(receipt.appliedAt) &&
    (operation==='story-plan' ? receipt.id==='' && Number(receipt.planVersion)>0 : physicsId(receipt.id))
}
export function publicStory(story:CampaignStory,actorId:string,limit=100):PublicStoryMessage[] {
  return recentStoryMessages(story.messages.filter(message=>message.audience.includes(actorId)),limit).map(message=>({
    id:message.id,kind:message.kind,speaker:message.speaker,body:message.body,seconds:message.seconds,
    createdAt:message.createdAt,resolved:message.resolved,targetLabel:message.kind==='request' ? message.targetLabel : '',
    ...(message.resolution?{resolution:{...message.resolution}}:{}),
  }))
}
export function recentStoryMessages(messages:StoryMessage[],limit=100):StoryMessage[]{
  const activity=(message:StoryMessage)=>Date.parse(message.resolution?.at??message.createdAt)
  return messages.toSorted((left,right)=>activity(left)-activity(right)).slice(-limit)
}
