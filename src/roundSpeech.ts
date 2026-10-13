import { isJournal, isJournalEntry, isTimestamp, MAX_JOURNAL_ENTRIES } from './characterKnowledge'
import { newRuleKey } from './roundRules'
import type { DeclarationCollection, DeclaredAction } from './actionDeclarations'
import type { World } from './rpgEngine'
import type { RoundWork, RoundWorkEntry } from './roundWork'
import type { JournalEntry } from './characterKnowledge'

export type SpeechRow = { key: string; actorId: string; action: Extract<DeclaredAction, {kind:'speak'}> }
export type SpeechHearer = { actorId: string; clarity: 'clear'|'fragment'|'sound'; speaker: string; fragment: string; signs: string }
export type SpeechDecision = { key: string; confirmed: boolean; reason: string; recordedAt: string; hearers: SpeechHearer[] }
export type SpeechOutcome = { key: string; actorId: string; volume: SpeechRow['action']['volume']; text: string;
  heard: {actorId:string;clarity:SpeechHearer['clarity'];speaker:string;text:string}[] }
export type SpeechLocation = { sceneId:string;actorId:string;x?:number;y?:number;z?:number }
export const speechVolume = {whisper:'Шёпот',normal:'Обычная речь',shout:'Крик'} as const
const record = (v:unknown):v is Record<string,unknown> => !!v&&typeof v==='object'&&!Array.isArray(v)
const text = (v:unknown,max:number):v is string => typeof v==='string'&&v.length<=max
const keys = (v:Record<string,unknown>,expected:string[]) => Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k))
export function isSpeechDecision(v:unknown):v is SpeechDecision {
  return record(v)&&keys(v,['key','confirmed','reason','recordedAt','hearers'])&&text(v.key,400)&&/^[a-zA-Z0-9:_-]+$/.test(v.key)&&
    typeof v.confirmed==='boolean'&&text(v.reason,2000)&&text(v.recordedAt,30)&&(v.recordedAt===''||isTimestamp(v.recordedAt))&&
    Array.isArray(v.hearers)&&v.hearers.length<=200&&v.hearers.every(h=>record(h)&&keys(h,['actorId','clarity','speaker','fragment','signs'])&&
      text(h.actorId,160)&&/^[a-zA-Z0-9:_-]+$/.test(h.actorId)&&['clear','fragment','sound'].includes(String(h.clarity))&&
      text(h.speaker,120)&&text(h.fragment,4000)&&text(h.signs,1000))&&new Set(v.hearers.map(h=>h.actorId)).size===v.hearers.length
}
export function speechRows(collection:DeclarationCollection,work:RoundWork,continued:string[]):SpeechRow[] {
  return [...work.entries.filter(e=>continued.includes(e.actorId)).map(e=>({key:e.id,actorId:e.actorId,action:e.action})),
    ...collection.entries.filter(e=>e.status==='submitted').flatMap(e=>e.actions.map((action,index)=>({key:newRuleKey(e.actorId,index),actorId:e.actorId,action})))]
    .filter((r):r is SpeechRow=>r.action.kind==='speak')
}
export const emptySpeechDecision = (key:string):SpeechDecision => ({key,confirmed:false,reason:'',recordedAt:'',hearers:[]})
export function speechDecisionReady(row:SpeechRow,d:SpeechDecision):boolean {
  return isSpeechDecision(d)&&d.key===row.key&&d.confirmed&&!!d.reason.trim()&&isTimestamp(d.recordedAt)&&d.hearers.every(h=>
    h.actorId!==row.actorId&&!!h.speaker.trim()&&(h.clarity==='fragment'?!!h.fragment.trim()&&row.action.text.includes(h.fragment):h.fragment===''))
}
export function speechDecisionsFor(rows:SpeechRow[],value:unknown):Map<string,SpeechDecision> {
  if(!rows.length&&value===undefined)return new Map()
  if(!Array.isArray(value)||value.length!==rows.length||value.length>200||!value.every(isSpeechDecision)||
    new Set(value.map(v=>v.key)).size!==value.length||!rows.every(r=>value.some(d=>speechDecisionReady(r,d)))) {
    throw Error('Для каждой реплики нужны явное решение о слышимости, допустимые фрагменты и подтверждение мастера.')
  }
  return new Map(value.map(d=>[d.key,d]))
}
export function speechDistance(locations:SpeechLocation[],sceneId:string,speakerId:string,hearerId:string):number|null {
  const a=locations.find(l=>l.sceneId===sceneId&&l.actorId===speakerId),b=locations.find(l=>l.sceneId===sceneId&&l.actorId===hearerId)
  return a&&b&&[a.x,a.y,a.z,b.x,b.y,b.z].every(v=>typeof v==='number'&&Number.isFinite(v))?
    Math.hypot(a.x!-b.x!,a.y!-b.y!,a.z!-b.z!):null
}
export const isSpeechJournalEntry = (e:Pick<JournalEntry,'id'>) => e.id.startsWith('event:speech:')

export function finishRoundSpeech(world:World,work:RoundWorkEntry,key:string,decision:SpeechDecision):{world:World;outcome:SpeechOutcome} {
  const a=work.action
  if(a.kind!=='speak'||!speechDecisionReady({key,actorId:work.actorId,action:a},decision))throw Error('Проверь решение о слышимости реплики.')
  const scene=world.campaign.scenes?.scenes.find(s=>s.id===work.sceneId),actor=world.characters.find(c=>c.id===work.actorId)
  if(!actor||actor.rpg.dead||actor.body.consciousness!=='awake'||!scene?.tokens.some(t=>t.actorId===actor.id)) {
    throw Error('Для речи говорящий должен быть жив, в сознании и размещён в сцене действия. Пересмотри раунд.')
  }
  if(decision.hearers.some(h=>!scene.tokens.some(t=>t.actorId===h.actorId)||!world.characters.some(c=>c.id===h.actorId&&!c.rpg.dead&&c.body.consciousness==='awake'))) {
    throw Error('Каждый слушатель должен быть жив, в сознании и размещён в сцене реплики. Проверь адресное раскрытие.')
  }
  const candidate=structuredClone(world),eventKey='speech:'+work.id
  const heard=decision.hearers.map(h=>({actorId:h.actorId,clarity:h.clarity,speaker:h.speaker.trim(),text:
    (h.clarity==='clear'?speechVolume[a.volume]+'.\n«'+a.text+'»':h.clarity==='fragment'?'Разобран фрагмент · '+speechVolume[a.volume].toLowerCase()+'.\n«'+h.fragment+'»':
      'Неразборчивый голос · '+speechVolume[a.volume].toLowerCase()+'.')+(h.signs.trim()?'\n'+h.signs.trim():'')}))
  // Each journal receives only its own words. No listener list, private speaker ID,
  // target ID, GM reason or complete text for an indistinct voice is disclosed.
  const notes=[{actorId:actor.id,title:'Произнесена реплика',source:'Своя речь',text:speechVolume[a.volume]+'.\n«'+a.text+'»'},
    ...heard.map(h=>({actorId:h.actorId,title:h.clarity==='sound'?'Услышан голос':'Услышана реплика',source:h.speaker,text:h.text}))]
  for(const note of notes) {
    const hero=candidate.characters.find(c=>c.id===note.actorId)!
    const entry:JournalEntry={id:'event:'+eventKey,eventKey,origin:'automatic',title:note.title,text:note.text,source:note.source,
      category:'people',certainty:'observation',gameTime:String(world.campaign.seconds)+' с',annotation:'',createdAt:decision.recordedAt,updatedAt:decision.recordedAt}
    if(!isJournal(hero.journal)||!isJournalEntry(entry)||hero.journal.length>=MAX_JOURNAL_ENTRIES)throw Error('Не удалось записать разговор: проверь журнал и его технический предел. Раунд не применён.')
    if(hero.journal.some(e=>e.eventKey===eventKey||e.id===entry.id))throw Error('Эта реплика уже есть в журнале. Проверь работу и историю раунда.')
    hero.journal.push(entry)
  }
  return {world:candidate,outcome:{key,actorId:work.actorId,volume:a.volume,text:a.text,heard}}
}
