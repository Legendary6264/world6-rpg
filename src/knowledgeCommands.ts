import {journalCategories,certaintyOptions,isTimestamp} from './characterKnowledge'
import type {JournalEntry,JournalCategory,KnowledgeCertainty} from './characterKnowledge'

export type KnowledgeCommand={revision:number;title:string;text:string;commandKey:string;disclosure?:boolean;category?:JournalCategory;certainty?:KnowledgeCertainty}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export const isKnowledgeCommandKey=(v:unknown):v is string=>typeof v==='string'&&/^knowledge:[a-zA-Z0-9_-]{8,140}$/.test(v)
export const knowledgeEntryId=(key:string)=>key.slice('knowledge:'.length)
export function isKnowledgeCommand(v:unknown):v is KnowledgeCommand{
 return object(v)&&Number.isSafeInteger(v.revision)&&Number(v.revision)>=0&&isKnowledgeCommandKey(v.commandKey)&&typeof v.title==='string'&&!!v.title.trim()&&v.title.length<=120&&typeof v.text==='string'&&!!v.text.trim()&&v.text.length<=8000&&(v.disclosure===undefined||typeof v.disclosure==='boolean')&&(v.category===undefined||journalCategories.some(c=>c.key===v.category))&&(v.certainty===undefined||certaintyOptions.some(c=>c.key===v.certainty))
}
export function isKnowledgeAck(v:unknown,command:KnowledgeCommand,actorId:string):boolean{
 if(!object(v)||typeof v.duplicate!=='boolean'||!object(v.receipt))return false
 const r=v.receipt,entryId=knowledgeEntryId(command.commandKey)
 return r.operation===(command.disclosure?'disclose-knowledge':'hero-note')&&r.actorId===actorId&&r.entryId===entryId&&v.entryId===entryId&&r.revision===command.revision+1&&v.revision===r.revision&&Number.isSafeInteger(r.generation)&&Number(r.generation)>0&&isTimestamp(r.appliedAt)
}
// Only a uniquely identified, addressed journal entry can acknowledge a lost
// response. Equal text from an earlier note is not a confirmation.
export function hasKnowledgeEntry(journal:Pick<JournalEntry,'id'|'title'|'text'|'category'|'certainty'|'source'|'origin'>[],command:KnowledgeCommand):boolean{
 return journal.some(e=>e.id===knowledgeEntryId(command.commandKey)&&e.title===command.title.trim()&&e.text===command.text.trim()&&e.category===(command.category??'other')&&e.certainty===(command.disclosure?command.certainty??'reported':'hypothesis')&&e.source===(command.disclosure?'Сведения мастера':'Личная заметка')&&e.origin===(command.disclosure?'automatic':'manual'))
}
