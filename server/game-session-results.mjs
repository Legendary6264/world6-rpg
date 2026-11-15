import {createHash} from 'node:crypto'

export const finalBody=(name,summary)=>'Итог игры «'+name+'»\n\n'+summary
export const finishHash=(revision,name,summary,keepPending,generation)=>createHash('sha256').update(JSON.stringify(generation===undefined?['finish-game',revision,name,summary,keepPending]:['finish-game-v2',generation,revision,name,summary,keepPending])).digest('hex')
export const publicResult=(point,summary)=>({id:point.id,title:point.name,summary,finishedAt:point.created_at,sourceRevision:point.source_revision})
export const finishReceipt=(point,keepPending)=>({commandKey:point.command_key,generation:point.source_generation,resultId:point.id,sourceRevision:point.source_revision,keepPending})

// Read at most 20 small metadata rows. The portable ending supplies the text;
// editable chat messages are not authoritative records of the final snapshot.
export async function latestGameResult(tx,lobby,session){
 if(session.status!=='finished')return {result:null}
 const points=await tx.all('SELECT id,name,created_at,source_revision,source_generation,command_key,request_hash FROM campaign_checkpoints WHERE lobby_id=? ORDER BY created_at DESC,id DESC',[lobby.id])
 let fallback=null
 for(const p of points){
  const prefix=finalBody(p.name,'')
  if(p.created_at!==session.finishedAt||!session.summary.startsWith(prefix))continue
  const summary=session.summary.slice(prefix.length),result=publicResult(p,summary)
  if(!summary.trim())continue
  fallback??={result}
  for(const generation of [p.source_generation,undefined])for(const keepPending of [false,true]){
   if(finishHash(p.source_revision,p.name,summary,keepPending,generation)===p.request_hash)return {result,receipt:finishReceipt(p,keepPending)}
  }
 }
 // Imported archives retain their ending even if original command proofs were
 // retired. Display it without acknowledging a pending command on this branch.
 return fallback??{result:{id:'legacy:'+lobby.id,title:{success:'Победа',failure:'Неудача',stopped:'Игра остановлена'}[session.outcome],summary:session.summary,finishedAt:session.finishedAt,sourceRevision:lobby.revision}}
}
