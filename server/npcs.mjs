import {commitWorld} from './world-coordinator.mjs'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {character,world as validateWorld,fail,integer,id,now,text} from './validation.mjs'
import {requireLobbyPermission,requireChief} from './permissions.mjs'
import {hasLobbyPermission} from './generated/lobbyAccess.mjs'
import {emptyCampaign} from './generated/rpgSchema.mjs'
import {controlledBindings,controlEvent} from './lobby-access.mjs'
const master=m=>{requireLobbyPermission(m,'npcs');requireLobbyPermission(m,'viewSecrets')}
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function npcRoutes(app,{db,auth,updated,lockedMembership,record:recordAudit}){
 app.get('/api/lobbies/:id/npcs',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   const state=JSON.parse(lobby.world_json),bindings=await controlledBindings(tx,lobby,await tx.all('SELECT * FROM character_bindings WHERE lobby_id=?',[lobby.id]))
   return {revision:lobby.revision,closed:lobby.status==='closed',campaign:{...emptyCampaign(),seconds:state.campaign.seconds,abilities:state.campaign.abilities,items:state.campaign.items,anatomies:state.campaign.anatomies},npcs:bindings.filter(b=>b.npc).map(b=>({id:b.character_id,name:state.characters.find(c=>c.id===b.character_id)?.name??'NPC',approved:!!b.approved,controllerId:b.control.controllerId}))}
  });res.json(result)
 })
 app.get('/api/lobbies/:id/npcs/:characterId',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   const [binding]=await controlledBindings(tx,lobby,await tx.all('SELECT * FROM character_bindings WHERE lobby_id=? AND character_id=?',[lobby.id,req.params.characterId]))
   const state=JSON.parse(lobby.world_json),actor=state.characters.find(c=>c.id===req.params.characterId)
   if(!binding?.npc||!actor)fail(404,'NPC не найден.')
   // The NPC editor receives its sheet and template context, never another hero's sheet.
   return {revision:lobby.revision,actor,approved:!!binding.approved,controllerId:binding.control.controllerId,campaign:{...emptyCampaign(),seconds:state.campaign.seconds,abilities:state.campaign.abilities,items:state.campaign.items,anatomies:state.campaign.anatomies}}
  });res.json(result)
 })
 const write=(path,operation)=>app.post(path,auth.middleware,async(req,res)=>{
  const b=req.body,allowed=operation==='create'?['revision','character','commandKey']:operation==='edit'?['revision','character','approved','reason','commandKey']:['revision','userId','commandKey']
  if(!record(b)||Object.keys(b).length!==allowed.length||Object.keys(b).some(k=>!allowed.includes(k))||typeof b.commandKey!=='string'||!/^npc:[a-zA-Z0-9_-]{8,140}$/.test(b.commandKey))fail(400,'Проверь поля команды NPC.')
  const revision=integer(b.revision),hash=createHash('sha256').update(JSON.stringify([operation,req.params.characterId??null,b])).digest('hex')
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   if(operation==='assign')requireChief(lobby,member,req.user)
   const previous=await tx.get('SELECT * FROM lobby_npc_commands WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey])
   if(previous){if(previous.author_id!==req.user.id||previous.request_hash!==hash)fail(409,'Ключ NPC уже относится к другой команде.');return {...JSON.parse(previous.result_json),duplicate:true}}
   if(lobby.status==='closed')fail(409,'Лобби закрыто.')
   if(lobby.revision!==revision)fail(409,'Кампания или управление изменились. Сверь черновик NPC.')
   const size=await tx.get('SELECT COUNT(*) AS n,COALESCE(SUM(payload_bytes),0) AS bytes FROM lobby_npc_commands WHERE lobby_id=?',[lobby.id])
   if(Number(size.n)>=10000||Number(size.bytes)>4*1024*1024-1024)fail(409,'Достигнут предел сохранённых команд NPC. Прежние подтверждения не удалены.')
   const state=JSON.parse(lobby.world_json);let actorId=req.params.characterId
   if(operation==='create'){
    if(state.characters.length>=200)fail(409,'В кампании уже 200 персонажей.')
    const actor=character(b.character);actorId=id();actor.id=actorId
    if(lobby.energy!=='any'&&actor.profile.energy!==lobby.energy)fail(409,'Энергия NPC не подходит этому лобби.')
    if(actor.rpg.casts.length||actor.rpg.effects.some(e=>e.ownerId||e.castId)||actor.rpg.logs.length)fail(400,'Новый NPC не импортирует начатые действия, связанные эффекты или игровой журнал.')
    state.characters.push(actor);validateWorld(state)
    await tx.run('INSERT INTO character_bindings(lobby_id,character_id,owner_id,approved) VALUES(?,?,?,1)',[lobby.id,actorId,lobby.owner_id])
    await tx.run('INSERT INTO lobby_npcs(lobby_id,character_id,created_by,created_at) VALUES(?,?,?,?)',[lobby.id,actorId,req.user.id,now()])
    await controlEvent(tx,lobby.id,actorId,req.user.id,lobby.owner_id,'assign')
   }else{
    const npc=await tx.get('SELECT * FROM lobby_npcs WHERE lobby_id=? AND character_id=?',[lobby.id,actorId]),before=state.characters.find(c=>c.id===actorId)
    if(!npc||!before)fail(404,'NPC не найден.')
    if(operation==='edit'){
     const actor=character(b.character);if(actor.id!==actorId||typeof b.approved!=='boolean')fail(400,'Проверь лист и допуск NPC.')
     text(b.reason,2000)
     if(lobby.energy!=='any'&&actor.profile.energy!==lobby.energy)fail(409,'Энергия NPC не подходит этому лобби.')
     if(['casts','effects','logs'].some(k=>!isDeepStrictEqual(actor.rpg[k],before.rpg[k])))fail(409,'Начатые применения, эффекты и игровой журнал меняются через раунд или явную отмену, а не заменой листа NPC.')
     state.characters=state.characters.map(c=>c.id===actorId?actor:c);validateWorld(state)
     await tx.run('UPDATE character_bindings SET approved=? WHERE lobby_id=? AND character_id=?',[b.approved?1:0,lobby.id,actorId])
    }else{
     const userId=text(b.userId,160)
     if(userId!==lobby.owner_id){
      const target=await tx.get('SELECT m.role,u.disabled,p.permissions_json FROM members m JOIN users u ON u.id=m.user_id LEFT JOIN lobby_permissions p ON p.lobby_id=m.lobby_id AND p.user_id=m.user_id WHERE m.lobby_id=? AND m.user_id=?',[lobby.id,userId]),permissions=JSON.parse(target?.permissions_json??'[]')
      if(!target||target.disabled||!hasLobbyPermission(target.role,permissions,'npcs')||!hasLobbyPermission(target.role,permissions,'viewSecrets'))fail(403,'Выбери главного ГМ или помощника с управлением NPC и доступом к секретам.')
     }
     await tx.run('UPDATE lobby_npcs SET assistant_id=? WHERE lobby_id=? AND character_id=?',[userId===lobby.owner_id?null:userId,lobby.id,actorId])
     await controlEvent(tx,lobby.id,actorId,req.user.id,userId,'assign')
    }
   }
   const receipt={id:actorId,revision:revision+1,operation,...(operation==='edit'?{reason:text(b.reason,2000)}:{})},json=JSON.stringify(receipt)
   const receiptBytes=Buffer.byteLength(json)+Buffer.byteLength(hash+b.commandKey)
   if(Number(size.bytes)+receiptBytes>4*1024*1024)fail(409,'Достигнут предел подтверждений команд NPC.')
   await commitWorld(tx,lobby,state,{at:now()})
   await recordAudit(tx,req,operation+'-npc')
   await tx.run('INSERT INTO lobby_npc_commands(lobby_id,command_key,author_id,request_hash,result_json,payload_bytes) VALUES(?,?,?,?,?,?)',[lobby.id,b.commandKey,req.user.id,hash,json,receiptBytes])
   return {...receipt,duplicate:false}
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
 write('/api/lobbies/:id/npcs','create')
 write('/api/lobbies/:id/npcs/:characterId/edit','edit')
 write('/api/lobbies/:id/npcs/:characterId/assign','assign')
}
