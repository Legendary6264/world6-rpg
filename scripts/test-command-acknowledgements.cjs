const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const mod={exports:{}}
const code=ts.transpileModule(fs.readFileSync('src/commandAcknowledgements.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText
vm.runInThisContext('(function(module,exports){'+code+'\n})')(mod,mod.exports)
const {isRoundApplyAck,isRoundChangeAck,isArchiveRestoreAck,isCampaignCheckpointAck}=mod.exports
const at='2026-11-04T12:00:00.000Z',command={previewId:'preview-a',generation:2,reason:' Restore ',revision:7,name:' Camp '}
const base=()=>({id:'receipt-a',previewId:command.previewId,revision:8,generation:2,appliedAt:at,summary:{}})
const cases={
 round:{check:isRoundApplyAck,proof:()=>({receipt:{...base(),collectionId:'collection-a',summary:{durationSeconds:5,events:[],carried:[],missingDecisions:[],warnings:[]}},duplicate:false})},
 cancel:{check:isRoundChangeAck,proof:()=>({receipt:{...base(),sourceGeneration:2,summary:{operation:'cancel'}},duplicate:false})},
 rollback:{check:isRoundChangeAck,proof:()=>({receipt:{...base(),generation:3,sourceGeneration:2,summary:{operation:'rollback'}},duplicate:false})},
 archive:{check:isArchiveRestoreAck,proof:()=>({receipt:{...base(),generation:8,reason:'Restore',summary:{sha256:'a'.repeat(64)}},duplicate:false})},
 checkpoint:{check:isCampaignCheckpointAck,proof:()=>({checkpoint:{id:'point-a',name:'Camp',source_revision:7,created_at:at,author_id:'gm'},duplicate:false})},
}
for(const [kind,{check,proof}] of Object.entries(cases)){
 test('Ack: a fresh and repeated '+kind+' command accepts its original durable proof',()=>{
  const value=proof();assert(check(value,command));value.duplicate=true;assert(check(value,command))
 })
 for(const fault of ['empty','missing-proof','missing-duplicate','empty-id','bad-date','different-command'])test('Ack: '+kind+' retains its retry key for '+fault,()=>{
  const value=proof(),receipt=value.receipt??value.checkpoint
  if(fault==='empty')return assert(!check(null,command))
  if(fault==='missing-proof')return assert(!check({duplicate:true},command))
  if(fault==='missing-duplicate')delete value.duplicate
  if(fault==='empty-id')receipt.id=''
  if(fault==='bad-date')receipt[kind==='checkpoint'?'created_at':'appliedAt']='yesterday'
  if(fault==='different-command')receipt[kind==='checkpoint'?'source_revision':'previewId']=kind==='checkpoint'?6:'other-preview'
  assert(!check(value,command))
 })
 if(kind!=='checkpoint')test('Ack: '+kind+' rejects a receipt from another campaign branch',()=>{
  const value=proof();if(kind==='cancel'||kind==='rollback')value.receipt.sourceGeneration=1;else value.receipt.generation=1
  assert(!check(value,command))
 })
}
test('Ack: a rollback must advance the branch, while cancellation keeps it',()=>{
 const rollback=cases.rollback.proof();rollback.receipt.generation=2;assert(!isRoundChangeAck(rollback,command))
 const cancel=cases.cancel.proof();cancel.receipt.generation=3;assert(!isRoundChangeAck(cancel,command))
})
test('Ack: an archive proof needs the checksum and the requested restoration reason',()=>{
 const value=cases.archive.proof();value.receipt.reason='Another save';assert(!isArchiveRestoreAck(value,command))
 value.receipt.reason='Restore';value.receipt.summary.sha256='invalid';assert(!isArchiveRestoreAck(value,command))
})
test('Ack: a round proof contains its collection and an execution summary',()=>{
 const value=cases.round.proof();delete value.receipt.collectionId;assert(!isRoundApplyAck(value,command))
 value.receipt.collectionId='collection-a';value.receipt.summary={};assert(!isRoundApplyAck(value,command))
})
