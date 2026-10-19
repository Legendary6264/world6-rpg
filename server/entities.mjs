import {requireLobbyPermission} from './permissions.mjs'
import {world as validateWorld} from './validation.mjs'
import {projectWorldEntities} from './generated/worldEntities.mjs'

// Complete component snapshots contain private character/anatomy/knowledge
// data. Player rendering continues to use only PerceivedMap, never this API.
export function entityRoutes(app,{db,auth,lockedMembership}) {
 app.get('/api/lobbies/:id/entities',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireLobbyPermission(member,'viewSecrets')
   return projectWorldEntities(validateWorld(JSON.parse(lobby.world_json)),lobby.revision)
  });res.json(result)
 })
}
