import {createHash} from 'node:crypto'
import {fail,integer,now} from './validation.mjs'
import {requireLobbyPermission} from './permissions.mjs'
import {controlledBindings} from './lobby-access.mjs'
import {roundGeneration,MAX_PREVIEW_BYTES} from './rounds.mjs'
import {rejectRetiredCommand} from './campaign-retention-state.mjs'
import {rebaseRoundStory} from './round-context.mjs'
import {emptyStory} from './generated/campaignStory.mjs'
import {emptyQuestLog,isQuestDraft,publicQuests,MAX_QUESTS} from './generated/questLog.mjs'

const master=m=>{requireLobbyPermission(m,'npcs');requireLobbyPermission(m,'viewSecrets')}
export function questRoutes(app,{db,auth,updated,lockedMembership,store,oldCommand}){
 app.get('/api/lobbies/:id/play/quests',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   const state=JSON.parse(lobby.world_json),story=state.campaign.story??emptyStory(),log=story.quests??emptyQuestLog()
   const bindings=await controlledBindings(tx,lobby,await tx.all('SELECT * FROM character_bindings WHERE lobby_id=?',[lobby.id]))
   return {generation:await roundGeneration(tx,lobby.id),version:log.version,closed:lobby.status==='closed',quests:log.entries,
    heroes:bindings.filter(b=>b.approved&&!b.npc).flatMap(b=>{const actor=state.characters.find(a=>a.id===b.character_id);return actor?[{id:actor.id,name:actor.name}]:[]}),
    sources:story.messages.filter(m=>m.kind!=='request').map(m=>({id:m.id,speaker:m.speaker,body:m.body.slice(0,240)}))}
  });res.json(result)
 })
 app.get('/api/lobbies/:id/characters/:characterId/quests',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req),state=JSON.parse(lobby.world_json)
   const [binding]=await controlledBindings(tx,lobby,await tx.all('SELECT * FROM character_bindings WHERE lobby_id=? AND character_id=?',[lobby.id,req.params.characterId]))
   if(!binding||binding.npc||!state.characters.some(a=>a.id===req.params.characterId))fail(404,'Герой не найден.')
   if(binding.owner_id!==req.user.id&&binding.control.controllerId!==req.user.id)master(member)
   return {closed:lobby.status==='closed',quests:binding.approved?publicQuests(state.campaign.story??emptyStory(),binding.character_id):[]}
  });res.json(result)
 })
 app.post('/api/lobbies/:id/play/quests',auth.middleware,async(req,res)=>{
  const b=req.body
  if(!b||Array.isArray(b)||Object.keys(b).length!==4||!['generation','baseVersion','quest','commandKey'].every(k=>Object.hasOwn(b,k))||typeof b.commandKey!=='string'||!/^quest:[a-zA-Z0-9_-]{8,140}$/.test(b.commandKey)||!isQuestDraft(b.quest))fail(400,'Проверь название задания, пункты, состояние и получателей.')
  const generation=integer(b.generation,1),version=integer(b.baseVersion),hash=createHash('sha256').update(JSON.stringify(b)).digest('hex')
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   if(generation!==await roundGeneration(tx,lobby.id))fail(409,'Кампания восстановлена. Сверь задание с текущим продолжением.')
   await rejectRetiredCommand(tx,lobby.id,b.commandKey)
   const previous=await oldCommand(tx,lobby,req.user,b.commandKey,hash);if(previous)return previous
   if(lobby.status==='closed')fail(409,'Игра завершена. Задания доступны для чтения.')
   const state=JSON.parse(lobby.world_json),story=state.campaign.story??emptyStory(),log=story.quests??emptyQuestLog()
   if(log.version!==version)fail(409,'Задания изменились. Черновик сохранён; сверь его с текущей версией.')
   const bindings=await controlledBindings(tx,lobby,await tx.all('SELECT * FROM character_bindings WHERE lobby_id=?',[lobby.id]))
   if(b.quest.audience.some(id=>!bindings.some(binding=>binding.character_id===id&&binding.approved&&!binding.npc)))fail(409,'Выбери принятых героев, которые ещё участвуют в кампании.')
   if(b.quest.sourceMessageId&&!story.messages.some(m=>m.id===b.quest.sourceMessageId&&m.kind!=='request'))fail(409,'Исходная реплика недоступна. Проверь связь задания с разговором.')
   const index=log.entries.findIndex(q=>q.id===b.quest.id)
   if(index<0&&log.entries.length>=MAX_QUESTS)fail(409,'В журнале уже 60 заданий. Сохрани копию кампании перед продолжением.')
   const at=now(),quest={...structuredClone(b.quest),title:b.quest.title.trim(),objectives:b.quest.objectives.map(o=>({...o,title:o.title.trim()})),updatedAt:at}
   if(index<0)log.entries.push(quest);else log.entries[index]=quest
   log.version++;story.quests=log;state.campaign.story=story
   const saved=await store(tx,lobby,req.user,b.commandKey,hash,state,{operation:'quest-save',commandKey:b.commandKey,id:quest.id,generation,version:log.version,revision:lobby.revision+1,appliedAt:at},req)
   await rebaseRoundStory(tx,lobby,MAX_PREVIEW_BYTES)
   return saved
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
}
