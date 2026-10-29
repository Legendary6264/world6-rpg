import {commitWorld} from './world-coordinator.mjs'
import { fail, integer, now, world as validateWorld } from './validation.mjs'
import { requireLobbyPermission } from './permissions.mjs'
import { isGameSceneSetup, prepareGameScene } from './generated/gameScene.mjs'
import { requireCampaignRunning } from './round-branch.mjs'

const requireSetup = member => { requireLobbyPermission(member, 'scenes'); requireLobbyPermission(member, 'viewSecrets') }
export function gameplayRoutes(app, {db,auth,updated,lockedMembership,record}) {
  app.get('/api/lobbies/:id/play/setup', auth.middleware, async (req,res) => {
    const value = await db.transaction(async tx => {
      const {lobby,member} = await lockedMembership(tx,req); requireSetup(member)
      const state = JSON.parse(lobby.world_json)
      const rows = await tx.all('SELECT b.character_id,b.approved,n.character_id AS npc FROM character_bindings b LEFT JOIN lobby_npcs n ON n.lobby_id=b.lobby_id AND n.character_id=b.character_id WHERE b.lobby_id=?',[lobby.id])
      return {revision:lobby.revision,scenes:state.campaign.scenes??{version:1,activeSceneId:null,scenes:[]},
        actors:state.characters.map(a=>({id:a.id,name:a.name,approved:!!rows.find(b=>b.character_id===a.id)?.approved,npc:!!rows.find(b=>b.character_id===a.id)?.npc}))}
    }); res.json(value)
  })
  app.post('/api/lobbies/:id/play/setup', auth.middleware, async (req,res) => {
    const revision=integer(req.body.revision),setup=req.body.setup
    if(!isGameSceneSetup(setup))fail(400,'Проверь подготовку игровой сцены.')
    await db.transaction(async tx=>{
      const {lobby,member}=await lockedMembership(tx,req);requireSetup(member)
      if(lobby.status==='closed')fail(409,'Лобби закрыто.')
      await requireCampaignRunning(tx,lobby.id)
      if(lobby.revision!==revision)fail(409,'Кампания изменилась. Проверь сцену и раскрытие перед запуском.')
      const rows=await tx.all('SELECT b.character_id,b.approved,n.character_id AS npc FROM character_bindings b LEFT JOIN lobby_npcs n ON n.lobby_id=b.lobby_id AND n.character_id=b.character_id WHERE b.lobby_id=?',[lobby.id])
      if(!setup.actorIds.every(id=>rows.some(b=>b.character_id===id&&b.approved&&!b.npc)))fail(400,'Размещать можно только принятых игровых героев.')
      let candidate
      try{candidate=validateWorld(prepareGameScene(JSON.parse(lobby.world_json),setup))}catch(e){fail(400,e.message)}
      await commitWorld(tx,lobby,candidate,{at:now()});await record(tx,req,'prepare-game-scene')
    });updated(req.params.id);res.json({revision:revision+1})
  })
}
