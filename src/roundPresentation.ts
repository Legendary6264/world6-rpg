import {perceivedMap,emptyPerception} from './scenePerception'
import type {PerceivedMap} from './scenePerception'
import type {World} from './rpgEngine'
import type {RoundExecutionSummary} from './roundExecution'
import type {PublicRoundFeedback,FeedbackAction} from './roundFeedback'
import type {ScenePosition} from './sceneTypes'
import type {SceneAbilityVisual} from './sceneAbilityVisuals'
import {sceneAbilityVisualId} from './sceneAbilityVisuals'
import {abilityVisualDurationMs} from './abilityVisualTimeline'
import {isExactAmount} from './exactWork'
import {isAbilityVisualSpec} from './abilityVisuals'
import {feedbackStatusLabels} from './roundFeedback'

export type RoundSceneEvent={id:string;atMs:number;kind:'prepare'|'ready'|'release'|'move'|'interact'|'speak'|'item'|'wait'|'status'|'effect';label:string;actionId?:string;status?:FeedbackAction['status'];object?:{id:string;open?:boolean;active?:boolean;locked?:boolean}}
export type RoundSceneMotion={startMs:number;endMs:number;from:ScenePosition;to:ScenePosition;arcM?:number}
export type TimedRoundVisual={atMs:number;untilMs:number;visual:SceneAbilityVisual}
export type RoundPresentation={version:1;id:string;generation:number;revision:number;appliedAt:string;coverage:'scene'|'events';fromSeconds:number;toSeconds:number;roundDurationMs:number;durationMs:number;before:PerceivedMap|null;after:PerceivedMap|null;events:RoundSceneEvent[];motions:RoundSceneMotion[];visuals:TimedRoundVisual[]}
const numeric=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
const point=(v:unknown):v is ScenePosition=>!!v&&typeof v==='object'&&['x','y','z'].every(k=>numeric((v as Record<string,unknown>)[k]))
const milliseconds=(v:unknown)=>isExactAmount(v)?Number(v.numerator)/Number(v.denominator):NaN
const clamp=(n:number,max:number)=>Math.max(0,Math.min(max,n))
const visual=(v:unknown):v is SceneAbilityVisual=>!!v&&typeof v==='object'&&typeof (v as SceneAbilityVisual).id==='string'&&isAbilityVisualSpec((v as SceneAbilityVisual).spec)&&point((v as SceneAbilityVisual).start)&&point((v as SceneAbilityVisual).end)&&['point','sphere','beam','cone'].includes((v as SceneAbilityVisual).shape)&&['preparation','release','travel','impact','residue','sequence'].includes((v as SceneAbilityVisual).phase)&&numeric((v as SceneAbilityVisual).radius)&&numeric((v as SceneAbilityVisual).coneAngleDeg)
const eventLabels:Record<string,string>={prepare:'Подготовка способности',ready:'Заряд готов',release:'Применение способности',move:'Перемещение',speak:'Реплика героя',item:'Использование предмета',wait:'Ожидание',inspect:'Осмотр',open:'Открытие',close:'Закрытие',lock:'Запирание',unlock:'Отпирание',ignite:'Зажигание',extinguish:'Тушение',activate:'Активация',deactivate:'Отключение',relocate:'Перемещение предмета'}

// This projection consumes already committed worlds and events. It never runs
// combat rules, spends resources, makes a roll or grants additional disclosure.
export function buildRoundPresentation(before:World,after:World|null,summary:RoundExecutionSummary,actorId:string,report:PublicRoundFeedback,generation:number):RoundPresentation{
 const roundDurationMs=Math.max(0,(report.toSeconds-report.fromSeconds)*1000)
 const sourceEvents=Array.isArray(summary.events)?summary.events.filter(e=>!!e&&numeric(milliseconds(e.atMs))&&milliseconds(e.atMs)>=0&&milliseconds(e.atMs)<=roundDurationMs+.001):[]
 const releases=new Set(sourceEvents.filter(e=>e.kind==='release'&&e.castId).map(e=>JSON.stringify([e.actorId,e.castId])))
 const map=(world:World|null)=>world?perceivedMap(world.campaign.perceptions?.heroes.find(h=>h.actorId===actorId)??emptyPerception(actorId),world.campaign.scenes,world.characters,world.campaign.seconds,releases):null
 const beforeMap=map(before),afterMap=map(after)
 const carry=before.campaign.roundWork?.entries.filter(w=>w.actorId===actorId)??[]
 const events:RoundSceneEvent[]=sourceEvents.filter(e=>e.actorId===actorId&&Object.hasOwn(eventLabels,e.kind)).slice(0,500).map((e,index)=>{
  const prior=carry.findIndex(w=>w.id===e.workId),actionId=prior>=0?'carry:'+prior:'action:'+e.actionIndex,action=report.actions.find(a=>a.id===actionId)
  const operation=['open','close','lock','unlock','ignite','extinguish','activate','deactivate'].includes(e.kind)
  const objectId=operation&&e.objectId&&(beforeMap?.objects.some(o=>o.id===e.objectId&&o.visible)||afterMap?.objects.some(o=>o.id===e.objectId&&o.visible))?e.objectId:null
  const object=objectId?{id:objectId,...(['open','close'].includes(e.kind)?{open:e.kind==='open'}:['lock','unlock'].includes(e.kind)?{locked:e.kind==='lock'}:{active:['ignite','activate'].includes(e.kind)})}:undefined
  const kind:RoundSceneEvent['kind']=['prepare','ready','release','move','speak','item','wait'].includes(e.kind)?e.kind as RoundSceneEvent['kind']:'interact'
  return {id:'step:'+index,atMs:clamp(milliseconds(e.atMs),roundDurationMs),kind,label:(e.kind==='ready'?eventLabels.ready:action?.label??eventLabels[e.kind]).slice(0,240),...(action?{actionId}:{}),...(object?{object}:{})}
 })
 for(const action of report.actions){
  if(!events.some(e=>e.actionId===action.id)||['continuing','queued','waiting','interrupted','not-executed'].includes(action.status))events.push({id:'status:'+action.id,atMs:roundDurationMs,kind:'status',label:action.label,actionId:action.id,status:action.status})
 }
 const motions:RoundSceneMotion[]=afterMap?.frame.id===beforeMap?.frame.id&&beforeMap?.contacts.some(c=>c.kind==='self')?(Array.isArray(summary.presentationMotions)?summary.presentationMotions:[]).filter(m=>m.actorId===actorId&&numeric(m.startMs)&&numeric(m.endMs)&&m.startMs>=0&&m.endMs>m.startMs&&m.endMs<=roundDurationMs+.001&&point(m.from)&&point(m.to)&&(m.arcM===undefined||numeric(m.arcM))).slice(0,6000).map(m=>({startMs:m.startMs,endMs:m.endMs,from:{...m.from},to:{...m.to},...(m.arcM===undefined?{}:{arcM:m.arcM})})):[]
 const visuals:TimedRoundVisual[]=[]
 if(after&&afterMap){
  const allowed=new Map((afterMap.visuals??[]).map(v=>[v.id,v]))
  for(const actor of after.characters)for(const cast of actor.rpg.casts){
   const visual=allowed.get(sceneAbilityVisualId(actorId+':'+afterMap.frame.id,actor.id,cast))
   const release=visual&&sourceEvents.find(e=>e.actorId===actor.id&&e.castId===cast.id&&e.kind==='release')
   if(!visual||!release||visuals.length>=80)continue
   const atMs=clamp(milliseconds(release.atMs),roundDurationMs)
   visuals.push({atMs,untilMs:Math.max(visual.persistent?roundDurationMs:0,atMs+abilityVisualDurationMs(visual)),visual:{...visual,presentationOffsetMs:atMs}})
   if(actor.id!==actorId)events.push({id:'effect:'+visual.id,atMs,kind:'effect',label:'Видимый эффект способности'})
   const prepare=actor.id===actorId?sourceEvents.find(e=>e.castId===cast.id&&e.actorId===actorId&&e.kind==='prepare'):undefined
   if(prepare&&milliseconds(prepare.atMs)<atMs){const startMs=milliseconds(prepare.atMs),id='preparation:'+visual.id;visuals.push({atMs:startMs,untilMs:atMs,visual:{...visual,id,phase:'preparation',shape:'point',end:{...visual.start},presentationOffsetMs:startMs}})}
  }
 }
 const durationMs=Math.max(1,roundDurationMs,...visuals.map(v=>v.untilMs))
 return {version:1,id:report.id,generation,revision:report.revision,appliedAt:report.appliedAt,coverage:after?'scene':'events',fromSeconds:report.fromSeconds,toSeconds:report.toSeconds,roundDurationMs,durationMs,before:beforeMap,after:afterMap,events:events.sort((a,b)=>a.atMs-b.atMs),motions:motions.sort((a,b)=>a.startMs-b.startMs),visuals}
}

function validMap(value:unknown):value is PerceivedMap|null{
 if(value===null)return true
 if(!value||typeof value!=='object')return false
 const map=value as PerceivedMap,f=map.frame
 return typeof map.title==='string'&&typeof map.description==='string'&&!!f&&typeof f.id==='string'&&['top','side'].includes(f.view)&&[f.width,f.depth,f.minZ,f.maxZ,f.groundZ].every(numeric)&&f.width>0&&f.depth>0&&f.minZ<f.maxZ&&Array.isArray(map.areas)&&map.areas.length<=40&&map.areas.every(a=>point(a)&&typeof a.id==='string'&&[a.width,a.depth,a.height].every(numeric))&&Array.isArray(map.objects)&&map.objects.length<=250&&map.objects.every(o=>point(o)&&typeof o.id==='string'&&typeof o.name==='string'&&typeof o.visible==='boolean'&&[o.width,o.depth,o.height].every(numeric))&&Array.isArray(map.contacts)&&map.contacts.length<=201&&map.contacts.every(c=>!!c&&typeof c.id==='string'&&typeof c.label==='string'&&['self','identified','silhouette','sound'].includes(c.kind)&&numeric(c.x)&&numeric(c.y)&&(c.z===undefined||numeric(c.z)))&&(map.visuals===undefined||Array.isArray(map.visuals)&&map.visuals.every(visual))
}
export function isRoundPresentation(value:unknown,id:string):value is RoundPresentation{
 if(!value||typeof value!=='object')return false
 const r=value as RoundPresentation
 if(r.version!==1||r.id!==id||!/^turn:[a-f0-9]{24}$/.test(r.id)||!Number.isSafeInteger(r.generation)||r.generation<1||!Number.isSafeInteger(r.revision)||r.revision<0||typeof r.appliedAt!=='string'||!Number.isFinite(Date.parse(r.appliedAt))||!['scene','events'].includes(r.coverage))return false
 if(![r.fromSeconds,r.toSeconds,r.roundDurationMs,r.durationMs].every(numeric)||r.fromSeconds<0||r.toSeconds<r.fromSeconds||r.roundDurationMs!==(r.toSeconds-r.fromSeconds)*1000||r.durationMs<r.roundDurationMs||r.durationMs<=0||r.durationMs>r.roundDurationMs+10000||!validMap(r.before)||!validMap(r.after))return false
 if(!Array.isArray(r.events)||r.events.length>800||!r.events.every(e=>!!e&&typeof e.id==='string'&&numeric(e.atMs)&&e.atMs>=0&&e.atMs<=r.roundDurationMs&&typeof e.label==='string'&&e.label.length<=240&&['prepare','ready','release','move','interact','speak','item','wait','status','effect'].includes(e.kind)&&(e.status===undefined||Object.hasOwn(feedbackStatusLabels,e.status))&&(e.object===undefined||!!e.object&&typeof e.object.id==='string'&&['open','active','locked'].every(key=>(e.object as Record<string,unknown>)[key]===undefined||typeof (e.object as Record<string,unknown>)[key]==='boolean'))))return false
 if(!Array.isArray(r.motions)||r.motions.length>6000||!r.motions.every(m=>!!m&&numeric(m.startMs)&&numeric(m.endMs)&&m.startMs>=0&&m.endMs>m.startMs&&m.endMs<=r.roundDurationMs+.001&&point(m.from)&&point(m.to)&&(m.arcM===undefined||numeric(m.arcM))))return false
 return Array.isArray(r.visuals)&&r.visuals.length<=80&&r.visuals.every(v=>!!v&&numeric(v.atMs)&&numeric(v.untilMs)&&v.atMs>=0&&v.untilMs>v.atMs&&v.untilMs<=r.durationMs&&visual(v.visual))
}

export function roundPresentationFrame(recording:RoundPresentation,timeMs:number,reduced=false){
 const elapsedMs=clamp(Number.isFinite(timeMs)?timeMs:0,recording.durationMs),finished=elapsedMs>=recording.roundDurationMs
 const source=finished&&recording.after?recording.after:recording.before,map=source?structuredClone(source):null
 const motion=recording.motions.findLast(m=>m.startMs<=elapsedMs),self=map?.contacts.find(c=>c.kind==='self')
 if(self&&motion&&!finished){const u=clamp((elapsedMs-motion.startMs)/(motion.endMs-motion.startMs),1);Object.assign(self,{x:motion.from.x+(motion.to.x-motion.from.x)*u,y:motion.from.y+(motion.to.y-motion.from.y)*u,z:motion.from.z+(motion.to.z-motion.from.z)*u+4*(motion.arcM??0)*u*(1-u),characterAnimation:!reduced&&u<1?'walk':'idle'})}
 if(map){
  for(const event of recording.events){if(event.atMs>elapsedMs)break;if(event.object){const object=map.objects.find(o=>o.id===event.object!.id&&o.visible);if(object)Object.assign(object,event.object)}}
  const active=recording.visuals.filter(v=>v.atMs<=elapsedMs&&elapsedMs<v.untilMs),activeIds=new Set(active.map(v=>v.visual.id)),scheduled=new Set(recording.visuals.map(v=>v.visual.id))
  const ambient=(map.visuals??[]).filter(v=>!activeIds.has(v.id)&&(v.persistent||v.phase==='preparation'&&!scheduled.has(v.id)))
  map.visuals=[...ambient,...active.map(v=>({...v.visual,presentationOffsetMs:v.atMs}))]
 }
 return {map,elapsedMs,worldSeconds:recording.fromSeconds+Math.min(elapsedMs,recording.roundDurationMs)/1000,complete:elapsedMs>=recording.durationMs,event:recording.events.findLast(e=>e.atMs<=elapsedMs)??null}
}
