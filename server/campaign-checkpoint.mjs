import {createHash} from 'node:crypto'
import {fail,id,now} from './validation.mjs'
import {roundGeneration} from './rounds.mjs'
import {roundBranch} from './round-branch.mjs'
import {lineageAnchors,setCheckpointAnchors} from './campaign-retention-state.mjs'
import {replayContext} from './edited-round-replay.mjs'
import {compatibleRoundExecutor} from './generated/roundExecution.mjs'

// Caller holds the lobby lock and checks permissions, revision and command reuse.
export async function createCampaignCheckpoint(tx,lobby,{name,commandKey,requestHash,authorId}){
 const generation=await roundGeneration(tx,lobby.id),branchJson=JSON.stringify(await roundBranch(tx,lobby.id,generation)),ctx=await replayContext(tx,lobby),anchors=await lineageAnchors(tx,lobby.id,generation)
 const replayData=ctx?await tx.get('SELECT input_json,execution_seed,executor_version FROM round_history_data WHERE receipt_id=? AND lobby_id=?',[ctx.receipt_id,lobby.id]):null
 const hash=createHash('sha256').update(lobby.world_json).digest('hex')
 const replayJson=ctx&&replayData?.input_json&&replayData.execution_seed&&compatibleRoundExecutor(replayData.executor_version)?JSON.stringify({receiptId:ctx.receipt_id,exact:ctx.world_hash===hash}):null,bytes=Buffer.byteLength(lobby.world_json+branchJson+(replayJson??'')+name+JSON.stringify(anchors))
 const size=await tx.get('SELECT COUNT(*) AS n,COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_checkpoints WHERE lobby_id=?',[lobby.id])
 if(Number(size.n)>=20||Number(size.bytes)+bytes>32*1024*1024)fail(409,'Достигнут предел контрольных точек: 20 точек или 32 МиБ. Существующие снимки сохранены. Освободи место в разделе «Копии и история» перед сохранением итога.')
 const p={id:id(),name,created_at:now(),author_id:authorId,source_revision:lobby.revision}
 await tx.run('INSERT INTO campaign_checkpoints(id,lobby_id,author_id,command_key,request_hash,name,created_at,source_generation,source_revision,world_json,branch_json,replay_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[p.id,lobby.id,authorId,commandKey,requestHash,name,p.created_at,generation,lobby.revision,lobby.world_json,branchJson,replayJson,bytes])
 await setCheckpointAnchors(tx,lobby.id,p.id,anchors)
 return p
}
