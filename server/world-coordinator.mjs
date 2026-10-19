import {fail,integer,now,world as validateWorld} from './validation.mjs'
import {projectWorldEntities,restoreWorldEntities,diffEntitySnapshots} from './generated/worldEntities.mjs'
import {isDeepStrictEqual} from 'node:util'

// One persistence boundary for authoritative world changes. The caller keeps
// permission checks, receipts, history and audit in the same DB transaction;
// socket notifications remain after the transaction commits successfully.
export async function commitWorld(tx,lobby,candidate,{at=now(),revision=lobby.revision+1}={}) {
 integer(lobby.revision);integer(revision)
 if(revision!==lobby.revision+1)fail(409,'Версия мира должна увеличиваться ровно на один шаг.')
 const json=typeof candidate==='string'?candidate:JSON.stringify(candidate),raw=typeof candidate==='string'?JSON.parse(candidate):candidate
 const canonical=validateWorld(raw),before=projectWorldEntities(validateWorld(JSON.parse(lobby.world_json)),lobby.revision)
 const snapshot=projectWorldEntities(canonical,revision)
 // Exercise the bidirectional adapter before accepting a new current state.
 // History and current legacy bytes are not rewritten by this transition.
 if(!isDeepStrictEqual(restoreWorldEntities(snapshot),canonical))fail(409,'Компонентный адаптер не сохраняет все поля мира. Требуется поддерживаемая миграция.')
 const delta=diffEntitySnapshots(before,snapshot)
 const result=await tx.run('UPDATE lobbies SET world_json=?,revision=?,updated_at=? WHERE id=? AND revision=?',[json,revision,at,lobby.id,lobby.revision])
 if(Number(result.changes)!==1)fail(409,'Конфликт версии кампании. Загрузи актуальное состояние.')
 return {revision,snapshot,delta}
}
