import {lineageAnchors} from './campaign-retention-state.mjs'
import {integer,fail} from './validation.mjs'

// Call under the lobby lock. Receipt snapshots are immutable; only membership
// of the current lineage changes on rollback or checkpoint restoration.
export async function hydrateRoundHistory(tx,lobbyId){
 const missing=await tx.all('SELECT r.id,r.generation,r.receipt_json FROM round_receipts r LEFT JOIN round_history_data h ON h.receipt_id=r.id WHERE r.lobby_id=? AND h.receipt_id IS NULL',[lobbyId])
 for(const r of missing){const receipt=JSON.parse(r.receipt_json);await tx.run('INSERT INTO round_history_data(receipt_id,lobby_id,generation,applied_revision,applied_at) VALUES(?,?,?,?,?)',[r.id,lobbyId,r.generation,integer(receipt.revision),receipt.appliedAt])}
}
export async function setRoundBranch(tx,lobbyId,generation,ids){
 await tx.run('INSERT INTO round_branch_states(lobby_id,generation,receipt_ids_json) VALUES(?,?,?) ON CONFLICT(lobby_id) DO UPDATE SET generation=excluded.generation,receipt_ids_json=excluded.receipt_ids_json',[lobbyId,generation,JSON.stringify(ids)])
}
export async function roundBranch(tx,lobbyId,generation){
 const state=await tx.get('SELECT * FROM round_branch_states WHERE lobby_id=?',[lobbyId])
 if(state?.generation===generation)return JSON.parse(state.receipt_ids_json)
 await hydrateRoundHistory(tx,lobbyId)
 let rows=await tx.all('SELECT receipt_id FROM round_history_data WHERE lobby_id=? AND generation=? ORDER BY applied_revision',[lobbyId,generation])
 // Upgrade an untouched R04-1 rollback using its explicit source receipt.
 // Generic imported worlds intentionally acquire no historical ancestry.
 if(!state){
  const context=await tx.get('SELECT receipt_id FROM round_replay_contexts WHERE lobby_id=? AND generation=?',[lobbyId,generation])
  if(context){const target=await tx.get('SELECT generation,applied_revision FROM round_history_data WHERE lobby_id=? AND receipt_id=?',[lobbyId,context.receipt_id]);if(target)rows=[...await tx.all('SELECT receipt_id FROM round_history_data WHERE lobby_id=? AND generation=? AND applied_revision<? ORDER BY applied_revision',[lobbyId,target.generation,target.applied_revision]),...rows]}
 }
 const ids=rows.map(r=>r.receipt_id);await setRoundBranch(tx,lobbyId,generation,ids);return ids
}
export async function activeRoundRows(tx,lobbyId,generation){
 const ids=await roundBranch(tx,lobbyId,generation);if(!ids.length)return []
 await hydrateRoundHistory(tx,lobbyId)
 return tx.all('SELECT r.id,r.author_id,r.collection_id,h.applied_revision,h.applied_at,h.input_json,h.execution_seed,h.executor_version,o.author_label AS imported_author FROM round_receipts r JOIN round_history_data h ON h.receipt_id=r.id LEFT JOIN campaign_archive_origins o ON o.lobby_id=r.lobby_id AND o.kind=\'round\' AND o.record_id=r.id WHERE r.lobby_id=? AND h.lobby_id=r.lobby_id AND r.id IN ('+ids.map(()=>'?').join(',')+') ORDER BY h.applied_revision',[lobbyId,...ids])
}
export async function collectionExecuted(tx,lobbyId,generation,collectionId){
 if((await lineageAnchors(tx,lobbyId,generation)).includes(collectionId))return true
 const ids=await roundBranch(tx,lobbyId,generation);if(!ids.length)return false
 return !!await tx.get('SELECT id FROM round_receipts WHERE lobby_id=? AND collection_id=? AND id IN ('+ids.map(()=>'?').join(',')+')',[lobbyId,collectionId,...ids])
}
export async function campaignSession(tx,lobbyId){
 const s=await tx.get('SELECT paused,changed_at,author_id,reason FROM campaign_sessions WHERE lobby_id=?',[lobbyId]);return s?{paused:!!s.paused,changedAt:s.changed_at,authorId:s.author_id,reason:s.reason}:{paused:false,changedAt:null,authorId:null,reason:''}
}
export async function requireCampaignRunning(tx,lobbyId){if((await campaignSession(tx,lobbyId)).paused)fail(409,'Кампания на паузе. Мастер должен продолжить её перед исполнением или изменением заявлений.')}
