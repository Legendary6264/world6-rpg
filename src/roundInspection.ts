import type { DeclarationCollection, DeclaredAction } from './actionDeclarations'
import type { RoundWork, RoundWorkEntry } from './roundWork'
import type { World } from './rpgEngine'
import { isJournal, isJournalEntry, isTimestamp, MAX_JOURNAL_ENTRIES } from './characterKnowledge'
import type { JournalEntry } from './characterKnowledge'
export type InspectionDecision={key:string;confirmed:boolean;text:string;recordedAt:string}
export type InspectionRow={key:string;actorId:string;action:Extract<DeclaredAction,{kind:'interact'}>}
export function inspectionRows(c:DeclarationCollection,work:RoundWork,continued:string[]):InspectionRow[]{
 return [...work.entries.filter(w=>continued.includes(w.actorId)).map(w=>({key:w.id,actorId:w.actorId,action:w.action})),...c.entries.filter(e=>e.status==='submitted').flatMap(e=>e.actions.map((action,i)=>({key:'new:'+e.actorId+':'+i,actorId:e.actorId,action})))].filter((r):r is InspectionRow=>r.action.kind==='interact'&&r.action.operation==='inspect')
}
export function isInspectionDecision(v:unknown):v is InspectionDecision{
 if(!v||typeof v!=='object'||Array.isArray(v))return false
 const d=v as InspectionDecision
 return typeof d.key==='string'&&/^[a-zA-Z0-9:_-]{1,400}$/.test(d.key)&&typeof d.confirmed==='boolean'&&typeof d.text==='string'&&d.text.length<=4000&&isTimestamp(d.recordedAt)
}
export function inspectionDecisions(rows:InspectionRow[],v:unknown):Map<string,InspectionDecision>{
 if(!rows.length&&v===undefined)return new Map()
 if(!Array.isArray(v)||v.length!==rows.length||v.length>200||!v.every(isInspectionDecision)||new Set(v.map(d=>d.key)).size!==v.length||!v.every(d=>d.confirmed&&!!d.text.trim()&&rows.some(r=>r.key===d.key)))throw Error('Для каждого осмотра укажи и подтверди сведения, которые получит герой.')
 return new Map(v.map(d=>[d.key,d]))
}
export function finishInspection(world:World,work:RoundWorkEntry,decision:InspectionDecision):World{
 const next=structuredClone(world),hero=next.characters.find(a=>a.id===work.actorId)
 if(!hero||hero.rpg.dead||hero.body.consciousness!=='awake')throw Error('Герой не может завершить осмотр. Пересмотри результат раунда.')
 const eventKey='inspection:'+work.id
 const entry:JournalEntry={id:'event:'+eventKey,eventKey,origin:'automatic',title:'Результат осмотра',text:decision.text.trim(),category:'other',certainty:'observation',source:'Осмотр · решение мастера',gameTime:String(world.campaign.seconds)+' с',annotation:'',createdAt:decision.recordedAt,updatedAt:decision.recordedAt}
 if(!isJournal(hero.journal)||!isJournalEntry(entry)||hero.journal.length>=MAX_JOURNAL_ENTRIES||hero.journal.some(e=>e.eventKey===eventKey||e.id===entry.id))throw Error('Не удалось записать осмотр. Проверь журнал героя; раунд не применён.')
 hero.journal.push(entry);return next
}
