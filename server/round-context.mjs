import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {ApiError,fail,integer,worldSize} from './validation.mjs'

const fingerprint=value=>createHash('sha256').update(value).digest('hex')
const mechanicalWorld=state=>{const campaign={...state.campaign};delete campaign.story;return {...state,campaign}}
export async function roundRulesStamp(tx,lobby){
 const state=mechanicalWorld(JSON.parse(lobby.world_json))
 const generation=await tx.get('SELECT generation FROM round_generations WHERE lobby_id=?',[lobby.id])
 const controls=await tx.get('SELECT COUNT(*) AS n FROM character_control_events WHERE lobby_id=?',[lobby.id])
 const bindings=await tx.all('SELECT character_id,approved FROM character_bindings WHERE lobby_id=? ORDER BY character_id',[lobby.id])
 const session=await tx.get('SELECT paused,changed_at FROM campaign_sessions WHERE lobby_id=?',[lobby.id])
 return fingerprint(JSON.stringify([state,generation?.generation??1,String(controls.n),bindings.map(b=>[b.character_id,!!b.approved]),
  lobby.status,lobby.rank,lobby.energy,!!session?.paused,session?.changed_at??null]))
}
export async function requireRoundContext(tx,lobby,body,message){
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Передай параметры раунда.')
 const revision=integer(body.revision),stamp=body.rulesStamp
 if(stamp!==undefined&&(typeof stamp!=='string'||!/^r1:[a-f0-9]{64}$/.test(stamp)))fail(400,'Проверь подтверждение условий раунда.')
 const current=await roundRulesStamp(tx,lobby),token='r1:'+current
 if(stamp!==undefined?stamp!==token||revision>lobby.revision:revision!==lobby.revision)fail(409,message)
 return token
}
export const roundRulesToken=async(tx,lobby)=>'r1:'+await roundRulesStamp(tx,lobby)

// Only the story writer calls this, under the same lock and transaction as
// the accepted message. It may carry story forward, never other world changes.
export async function rebaseRoundStory(tx,before,maxPreviewBytes){
 const after=await tx.get('SELECT world_json,revision FROM lobbies WHERE id=?',[before.id])
 if(!after||after.revision!==before.revision+1)return
 const oldState=JSON.parse(before.world_json),state=JSON.parse(after.world_json)
 if(!isDeepStrictEqual(mechanicalWorld(oldState),mechanicalWorld(state)))return
 const rows=await tx.all('SELECT p.id,p.world_json,p.summary_json,p.payload_bytes,d.input_json,d.execution_seed FROM round_previews p JOIN round_calculation_data d ON d.preview_id=p.id WHERE p.lobby_id=? AND p.base_revision=?',[before.id,before.revision])
 const size=await tx.get('SELECT COALESCE(SUM(payload_bytes),0) AS n FROM (SELECT payload_bytes FROM round_previews WHERE lobby_id=? UNION ALL SELECT payload_bytes FROM round_change_previews WHERE lobby_id=?) AS previews',[before.id,before.id])
 let bytes=Number(size.n)
 for(const row of rows){
  const result=JSON.parse(row.world_json)
  if(state.campaign.story)result.campaign.story=structuredClone(state.campaign.story)
  else delete result.campaign.story
  const json=JSON.stringify(result),nextBytes=Buffer.byteLength(json+row.summary_json+row.input_json+row.execution_seed)
  let fits=true
  try{worldSize(result)}catch(error){if(!(error instanceof ApiError)||error.status!==413)throw error;fits=false}
  if(!fits||bytes-Number(row.payload_bytes)+nextBytes>maxPreviewBytes){
   await tx.run('DELETE FROM round_previews WHERE id=? AND lobby_id=?',[row.id,before.id]);bytes-=Number(row.payload_bytes)
  }else{
   await tx.run('UPDATE round_previews SET base_revision=?,world_json=?,payload_bytes=? WHERE id=? AND lobby_id=?',[after.revision,json,nextBytes,row.id,before.id])
   bytes+=nextBytes-Number(row.payload_bytes)
  }
 }
 await tx.run('UPDATE round_replay_contexts SET world_hash=? WHERE lobby_id=? AND world_hash=?',[fingerprint(after.world_json),before.id,fingerprint(before.world_json)])
}
