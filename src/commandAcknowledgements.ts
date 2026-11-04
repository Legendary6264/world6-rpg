const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const id=(v:unknown)=>typeof v==='string'&&!!v.trim()&&v.length<=160
const positive=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0
const stamp=(v:unknown)=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v))
type Command={previewId:string;generation:number}
type Proof={duplicate:boolean;receipt:{id:string;previewId:string;revision:number;generation:number;appliedAt:string;summary:Record<string,unknown>;collectionId?:string;sourceGeneration?:number;reason?:string}}
function previewAck(v:unknown,command:Command):v is Proof{
 if(!object(v)||typeof v.duplicate!=='boolean'||!object(v.receipt))return false
 const r=v.receipt
 return id(r.id)&&r.previewId===command.previewId&&positive(r.revision)&&positive(r.generation)&&stamp(r.appliedAt)&&object(r.summary)
}
// An HTTP success alone does not acknowledge a durable command. Bind the
// receipt to its preview and branch before discarding the persisted retry key.
export function isRoundApplyAck(v:unknown,command:Command):boolean{
 if(!previewAck(v,command)||v.receipt.generation!==command.generation||!id(v.receipt.collectionId))return false
 const s=v.receipt.summary
 return typeof s.durationSeconds==='number'&&Number.isFinite(s.durationSeconds)&&s.durationSeconds>=0&&Array.isArray(s.events)&&Array.isArray(s.carried)&&Array.isArray(s.missingDecisions)&&Array.isArray(s.warnings)&&s.warnings.every(w=>typeof w==='string')
}
export function isRoundChangeAck(v:unknown,command:Command):boolean{
 if(!previewAck(v,command)||v.receipt.sourceGeneration!==command.generation)return false
 const operation=v.receipt.summary.operation
 return (operation==='cancel'||operation==='rollback')&&v.receipt.generation===command.generation+(operation==='rollback'?1:0)
}
export function isArchiveRestoreAck(v:unknown,command:Command&{reason:string}):boolean{
 return previewAck(v,command)&&v.receipt.generation>command.generation&&v.receipt.reason===command.reason.trim()&&typeof v.receipt.summary.sha256==='string'&&/^[a-f0-9]{64}$/.test(v.receipt.summary.sha256)
}
export function isCampaignCheckpointAck(v:unknown,command:{revision:number;name:string}):boolean{
 if(!object(v)||typeof v.duplicate!=='boolean'||!object(v.checkpoint))return false
 const p=v.checkpoint
 return id(p.id)&&id(p.author_id)&&p.name===command.name.trim()&&p.source_revision===command.revision&&stamp(p.created_at)
}
