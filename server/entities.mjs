import {requireChief,requireLobbyPermission} from './permissions.mjs'
import {fail,integer,id,now} from './validation.mjs'
import {checkedProjection,readComponents,migrateComponents,exportComponentArchive,COMPONENT_JOURNAL_LIMIT} from './component-storage.mjs'

// Complete component snapshots contain private character/anatomy/knowledge
// data. Player rendering continues to use only PerceivedMap, never this API.
export function entityRoutes(app,{db,auth,lockedMembership}) {
 app.get('/api/lobbies/:id/entities',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireLobbyPermission(member,'viewSecrets')
   return (await readComponents(tx,lobby))?.snapshot??checkedProjection(lobby)
  });res.json(result)
 })
 app.get('/api/lobbies/:id/entities/storage',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireLobbyPermission(member,'viewSecrets')
   const stored=await readComponents(tx,lobby),snapshot=stored?.snapshot??checkedProjection(lobby)
   return {mode:stored?'dual-write':'legacy',schemaVersion:1,revision:lobby.revision,persistedRevision:stored?.head.revision??null,entityCount:snapshot.entities.length,journalBytes:stored?.head.journal_bytes??0,journalLimit:COMPONENT_JOURNAL_LIMIT}
  });res.json(result)
 })
 // Explicit, idempotent migration of one locked campaign. No gameplay revision
 // or time advances, and historical world/round/checkpoint rows stay untouched.
 app.post('/api/lobbies/:id/entities/migrate',auth.middleware,async(req,res)=>{
  const revision=integer(req.body.revision)
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireChief(lobby,member,req.user)
   if(revision!==lobby.revision)fail(409,'Кампания изменилась. Повтори проверку миграции.')
   const migrated=await migrateComponents(tx,lobby)
   if(migrated.migrated)await tx.run('INSERT INTO audit(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)',[id(),req.user.id,'migrate-world-components',lobby.id,now()])
   return {migrated:migrated.migrated,schemaVersion:1,revision:lobby.revision}
  });res.json(result)
 })
 app.get('/api/lobbies/:id/entities/archive',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireLobbyPermission(member,'viewSecrets')
   return exportComponentArchive(tx,lobby)
  })
  res.set('Content-Disposition','attachment; filename="world-components.json"').json(result)
 })
}
