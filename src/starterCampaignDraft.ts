import {NIGHT_CROSSING} from './starterCampaignInfo'
export const STARTER_CREATE_PATH='/lobbies/from-example'
export type StarterDraft={title:string;slots:string;accepted:boolean;command:{path:string;body:string}|null}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function starterReady(d:StarterDraft){return !!d.title.trim()&&d.title.length<=120&&/^\d+$/.test(d.slots)&&Number(d.slots)>=1&&Number(d.slots)<=12&&d.accepted}
export function isStarterDraft(v:unknown):v is StarterDraft {
 if(!record(v)||Object.keys(v).length!==4||typeof v.title!=='string'||v.title.length>120||typeof v.slots!=='string'||v.slots.length>3||typeof v.accepted!=='boolean')return false
 if(v.command===null)return true
 if(!record(v.command)||Object.keys(v.command).length!==2||v.command.path!==STARTER_CREATE_PATH||typeof v.command.body!=='string'||v.command.body.length>1000)return false
 try{
  const b=JSON.parse(v.command.body)
  return record(b)&&Object.keys(b).length===5&&b.exampleId===NIGHT_CROSSING.id&&b.version===NIGHT_CROSSING.version&&b.title===v.title&&b.slots===Number(v.slots)&&
    typeof b.commandKey==='string'&&/^starter:[a-zA-Z0-9_-]{8,140}$/.test(b.commandKey)&&starterReady(v as StarterDraft)
 }catch{return false}
}
