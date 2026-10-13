import {fail,now,validId} from './validation.mjs'
export const MAX_ANCHORS=20000,MAX_RETENTION_BYTES=16*1024*1024
export async function lineageAnchors(tx,lobbyId,generation){
 const row=await tx.get('SELECT * FROM round_lineage_anchors WHERE lobby_id=?',[lobbyId]);return row?.generation===generation?JSON.parse(row.collections_json):[]
}
export async function setLineageAnchors(tx,lobbyId,generation,ids){
 validateAnchors(ids)
 await tx.run('INSERT INTO round_lineage_anchors(lobby_id,generation,collections_json) VALUES(?,?,?) ON CONFLICT(lobby_id) DO UPDATE SET generation=excluded.generation,collections_json=excluded.collections_json',[lobbyId,generation,JSON.stringify(ids)])
}
export async function checkpointAnchors(tx,lobbyId,pointId){const r=await tx.get('SELECT collections_json FROM checkpoint_lineage_anchors WHERE lobby_id=? AND checkpoint_id=?',[lobbyId,pointId]);return r?JSON.parse(r.collections_json):[]}
export async function setCheckpointAnchors(tx,lobbyId,pointId,ids){validateAnchors(ids);await tx.run('INSERT INTO checkpoint_lineage_anchors(checkpoint_id,lobby_id,collections_json) VALUES(?,?,?) ON CONFLICT(checkpoint_id) DO UPDATE SET collections_json=excluded.collections_json',[pointId,lobbyId,JSON.stringify(ids)])}
export function validateAnchors(ids){if(!Array.isArray(ids)||ids.length>MAX_ANCHORS||new Set(ids).size!==ids.length)fail(400,'Некорректная сокращённая история сборов.');ids.forEach(validId);return [...ids]}
export async function rejectRetiredCommand(tx,lobbyId,key){
 if(await tx.get('SELECT command_key FROM campaign_retired_commands WHERE lobby_id=? AND command_key=?',[lobbyId,key]))fail(409,'Эта команда уже выполнялась; её подробная история очищена. Повторных изменений нет.')
 if(await tx.get('SELECT id FROM campaign_cleanup_receipts WHERE lobby_id=? AND command_key=?',[lobbyId,key]))fail(409,'Ключ уже связан с очисткой истории.')
}
export async function retentionBytes(tx,lobbyId){const row=await tx.get('SELECT COALESCE(SUM(payload_bytes),0) AS bytes FROM (SELECT payload_bytes FROM campaign_retired_commands WHERE lobby_id=? UNION ALL SELECT payload_bytes FROM campaign_cleanup_receipts WHERE lobby_id=?) AS ledger',[lobbyId,lobbyId]);return Number(row.bytes)}
export async function retireCommands(tx,lobbyId,rows){
 for(const r of rows){const bytes=Buffer.byteLength(r.command_key+r.kind+now())+64;await tx.run('INSERT INTO campaign_retired_commands(lobby_id,command_key,kind,retired_at,payload_bytes) VALUES(?,?,?,?,?) ON CONFLICT(lobby_id,command_key) DO NOTHING',[lobbyId,r.command_key,r.kind,now(),bytes])}
 if(await retentionBytes(tx,lobbyId)>MAX_RETENTION_BYTES)fail(409,'Реестр выполненных команд достиг предела 16 МиБ. История не очищена.')
}
