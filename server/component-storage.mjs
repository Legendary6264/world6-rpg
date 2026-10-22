import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {fail,now,world as validateWorld} from './validation.mjs'
import {projectWorldEntities,restoreWorldEntities,diffEntitySnapshots} from './generated/worldEntities.mjs'
import {ROUND_EXECUTOR_VERSION} from './generated/roundExecution.mjs'

// Compatibility rollout: world_json stays authoritative. All helpers run in
// the caller's transaction while its lobby row is locked. No startup backfill.
export const COMPONENT_SCHEMA_VERSION=1
export const COMPONENT_JOURNAL_LIMIT=64*1024*1024
const hash=json=>createHash('sha256').update(json).digest('hex')
const decode=value=>typeof value==='string'?JSON.parse(value):value
const metadata=snapshot=>{const {entities,...root}=snapshot;return {...root,entityOrder:entities.map(e=>e.id)}}
const conflict=()=>fail(409,'Компоненты не совпадают с сохранением или имеют неподдерживаемую версию. Нужна проверка миграции на копии.')

export function checkedProjection(lobby) {
 const canonical=validateWorld(JSON.parse(lobby.world_json)),snapshot=projectWorldEntities(canonical,lobby.revision)
 if(!isDeepStrictEqual(restoreWorldEntities(snapshot),canonical))conflict()
 return snapshot
}

export async function readComponents(tx,lobby) {
 const head=await tx.get('SELECT * FROM world_component_heads WHERE lobby_id=?',[lobby.id])
 if(!head)return null
 if(head.schema_version!==COMPONENT_SCHEMA_VERSION||head.source_hash!==hash(lobby.world_json)||head.revision>lobby.revision)conflict()
 const root=decode(head.metadata_json),entities=await tx.all('SELECT entity_id,kind FROM world_entities WHERE lobby_id=? ORDER BY ordinal',[lobby.id])
 const rows=await tx.all('SELECT entity_id,component_name,version,data_json FROM world_components WHERE lobby_id=?',[lobby.id])
 const mapped=new Map(entities.map(e=>[e.entity_id,{id:e.entity_id,kind:e.kind,components:{}}]))
 for(const r of rows){const entity=mapped.get(r.entity_id);if(!entity)conflict();Object.defineProperty(entity.components,r.component_name,{value:{version:r.version,data:decode(r.data_json)},enumerable:true,configurable:true,writable:true})}
 const {entityOrder,...meta}=root,snapshot={...meta,entities:[...mapped.values()]}
 try{if(snapshot.revision!==head.revision||!isDeepStrictEqual(entityOrder,snapshot.entities.map(e=>e.id))||!isDeepStrictEqual(restoreWorldEntities(snapshot),restoreWorldEntities(checkedProjection(lobby))))conflict()}catch{conflict()}
 // Permission/metadata commands can advance the lobby revision without changing
 // its world. Keep the persisted world head; report the current concurrency token.
 return {head,snapshot:{...snapshot,revision:lobby.revision}}
}

async function appendEvent(tx,lobbyId,revision,kind,payload,usedBytes,at) {
 const json=JSON.stringify(payload),bytes=Buffer.byteLength(json)
 if(bytes+usedBytes>COMPONENT_JOURNAL_LIMIT)fail(409,'Журнал компонентов достиг 64 МиБ. Требуется архивирование с сохранением истории; команда не применена.')
 await tx.run('INSERT INTO world_component_events(lobby_id,revision,kind,payload_json,payload_bytes,created_at) VALUES(?,?,?,?,?,?)',[lobbyId,revision,kind,json,bytes,at])
 return bytes+usedBytes
}

async function insertRows(tx,table,columns,rows,suffix='') {
 // Keep well below PostgreSQL's parameter limit and avoid a network round trip
 // per component when migrating a large scene. Table/column names are constants.
 for(let start=0;start<rows.length;start+=100){
  const batch=rows.slice(start,start+100),placeholders=batch.map(row=>'('+row.map(()=>'?').join(',')+')').join(',')
  await tx.run('INSERT INTO '+table+'('+columns+') VALUES'+placeholders+suffix,batch.flat())
 }
}
async function insertEntities(tx,lobbyId,entities) {
 await insertRows(tx,'world_entities','lobby_id,entity_id,kind,ordinal',entities.map((e,i)=>[lobbyId,e.id,e.kind,i]))
 await insertRows(tx,'world_components','lobby_id,entity_id,component_name,version,data_json',entities.flatMap(e=>Object.entries(e.components).map(([name,c])=>[lobbyId,e.id,name,c.version,JSON.stringify(c.data)])))
}

export async function migrateComponents(tx,lobby,{at=now()}={}) {
 const existing=await readComponents(tx,lobby)
 if(existing)return {snapshot:existing.snapshot,migrated:false}
 const snapshot=checkedProjection(lobby),sourceHash=hash(lobby.world_json)
 const bytes=await appendEvent(tx,lobby.id,lobby.revision,'baseline',{version:1,schemaVersion:COMPONENT_SCHEMA_VERSION,rulesVersion:ROUND_EXECUTOR_VERSION,sourceHash,sourceJson:lobby.world_json,snapshot},0,at)
 await tx.run('INSERT INTO world_component_heads(lobby_id,schema_version,revision,source_hash,rules_version,metadata_json,journal_bytes) VALUES(?,?,?,?,?,?,?)',[lobby.id,COMPONENT_SCHEMA_VERSION,lobby.revision,sourceHash,ROUND_EXECUTOR_VERSION,JSON.stringify(metadata(snapshot)),bytes])
 await insertEntities(tx,lobby.id,snapshot.entities)
 return {snapshot,migrated:true}
}

// Store changed components only. Entity order has its own typed ordinal; roots
// preserve campaign/order information. Full source bytes exist once at baseline.
export async function persistComponentChange(tx,lobby,snapshot,json,{at=now()}={}) {
 let stored=await readComponents(tx,lobby)
 if(!stored){await migrateComponents(tx,lobby,{at});stored=await readComponents(tx,lobby)}
 const {head,snapshot:previous}=stored,before={...previous,revision:head.revision}
 const delta=diffEntitySnapshots(before,snapshot),next=new Map(snapshot.entities.map(e=>[e.id,e])),changes=[]
 for(const change of delta.changes){
  const entity=next.get(change.entityId)
  changes.push(entity?{id:entity.id,kind:entity.kind,components:Object.fromEntries(change.components.map(name=>[name,entity.components[name]??null]))}:{id:change.entityId,removed:true})
 }
 const payload={version:1,fromRevision:head.revision,revision:snapshot.revision,sourceHash:hash(json),rulesVersion:ROUND_EXECUTOR_VERSION,metadata:metadata(snapshot),changes}
 const bytes=await appendEvent(tx,lobby.id,snapshot.revision,'change',payload,head.journal_bytes,at)
 // Rebuild entity rows only when membership/order changes. For ordinary commands
 // unchanged anatomy, knowledge, geometry etc. do not receive database writes.
 const currentIds=before.entities.map(e=>e.id),nextIds=snapshot.entities.map(e=>e.id)
 if(!isDeepStrictEqual(currentIds,nextIds)){
  await tx.run('DELETE FROM world_entities WHERE lobby_id=?',[lobby.id])
  await insertEntities(tx,lobby.id,snapshot.entities)
 }else{
  const updates=[]
  for(const change of changes)for(const [name,c] of Object.entries(change.components)){
   if(c===null)await tx.run('DELETE FROM world_components WHERE lobby_id=? AND entity_id=? AND component_name=?',[lobby.id,change.id,name])
   else updates.push([lobby.id,change.id,name,c.version,JSON.stringify(c.data)])
  }
  await insertRows(tx,'world_components','lobby_id,entity_id,component_name,version,data_json',updates,' ON CONFLICT(lobby_id,entity_id,component_name) DO UPDATE SET version=excluded.version,data_json=excluded.data_json')
 }
 await tx.run('UPDATE world_component_heads SET revision=?,source_hash=?,rules_version=?,metadata_json=?,journal_bytes=? WHERE lobby_id=?',[snapshot.revision,hash(json),ROUND_EXECUTOR_VERSION,JSON.stringify(metadata(snapshot)),bytes,lobby.id])
}

// Reconstruct historical state as data only: never re-execute game rules or
// write the result back into a live campaign. Gaps in lobby revisions are legal.
export function replayComponentEvents(events) {
 let snapshot=null
 for(const event of events){
  const p=decode(event.payload_json)
  if(p.version!==1)conflict()
  if(event.kind==='baseline'){
   if(snapshot||p.schemaVersion!==1||p.sourceHash!==hash(p.sourceJson)||p.snapshot.revision!==event.revision)conflict()
   snapshot=structuredClone(p.snapshot)
   if(!isDeepStrictEqual(restoreWorldEntities(snapshot),validateWorld(JSON.parse(p.sourceJson))))conflict()
  }else{
   if(event.kind!=='change'||!snapshot||p.fromRevision!==snapshot.revision||p.revision!==event.revision||p.revision<=snapshot.revision||p.metadata.revision!==p.revision)conflict()
   const entities=new Map(snapshot.entities.map(e=>[e.id,e]))
   for(const change of p.changes){
    if(change.removed)entities.delete(change.id)
    else{
     const e=entities.get(change.id)??{id:change.id,kind:change.kind,components:{}}
     if(e.kind!==change.kind)conflict()
     for(const [name,c] of Object.entries(change.components))if(c===null)delete e.components[name];else Object.defineProperty(e.components,name,{value:structuredClone(c),enumerable:true,configurable:true,writable:true})
     entities.set(e.id,e)
    }
   }
   const {entityOrder,...root}=p.metadata
   if(new Set(entityOrder).size!==entities.size||entityOrder.length!==entities.size||entityOrder.some(id=>!entities.has(id)))conflict()
   snapshot={...structuredClone(root),entities:entityOrder.map(id=>entities.get(id))}
  }
  restoreWorldEntities(snapshot)
 }
 if(!snapshot)conflict()
 return snapshot
}

export async function exportComponentArchive(tx,lobby) {
 const stored=await readComponents(tx,lobby),snapshot=stored?.snapshot??checkedProjection(lobby)
 const journal=await tx.all('SELECT revision,kind,payload_json,payload_bytes,created_at FROM world_component_events WHERE lobby_id=? ORDER BY revision',[lobby.id])
 if(stored){
  const replayed=replayComponentEvents(journal)
  if(!isDeepStrictEqual({...replayed,revision:lobby.revision},snapshot))conflict()
 }else if(journal.length)conflict()
 return {version:1,schemaVersion:COMPONENT_SCHEMA_VERSION,lobbyId:lobby.id,revision:lobby.revision,sourceJson:lobby.world_json,snapshot,journal}
}
