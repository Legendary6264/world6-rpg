import {createHash} from 'node:crypto'
import {fail,id,integer,now,text} from './validation.mjs'
import {controlledBindings,requireCharacterController} from './lobby-access.mjs'
import {requireLobbyPermission} from './permissions.mjs'
import {campaignSession,requireCampaignRunning} from './round-branch.mjs'
import {emptyStory,isStoryBeats,MAX_STORY_MESSAGES,publicStory} from './generated/campaignStory.mjs'
import {emptyPerception,perceivedMap} from './generated/scenePerception.mjs'

const exact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))
const master=member=>{requireLobbyPermission(member,'npcs');requireLobbyPermission(member,'viewSecrets')}
const alive=actor=>actor&&!actor.rpg.dead&&actor.body.consciousness==='awake'
const npcList=bindings=>bindings.filter(binding=>binding.npc)
const sceneFor=(state,sceneId)=>state.campaign.scenes?.scenes.find(scene=>scene.id===sceneId)
const bindingsFor=(tx,lobby)=>tx.all('SELECT * FROM character_bindings WHERE lobby_id=?',[lobby.id]).then(rows=>controlledBindings(tx,lobby,rows))

function audienceOptions(state,bindings,sceneId){
 const scene=sceneFor(state,sceneId)
 if(!scene)return []
 return bindings.filter(b=>!b.npc&&b.approved&&scene.tokens.some(t=>t.actorId===b.character_id)&&
  state.campaign.perceptions?.heroes.some(h=>h.actorId===b.character_id&&h.activeSceneId===sceneId&&h.scenes.some(s=>s.sceneId===sceneId&&s.areas.some(a=>a.visible))))
  .map(b=>({id:b.character_id,name:state.characters.find(a=>a.id===b.character_id)?.name??'Герой',sceneId}))
}
function actorContext(state,bindings,actorId){
 const actor=state.characters.find(a=>a.id===actorId),binding=bindings.find(b=>b.character_id===actorId)
 if(!actor||!binding||binding.npc)fail(404,'Герой недоступен.')
 const perception=state.campaign.perceptions?.heroes.find(h=>h.actorId===actorId)??emptyPerception(actorId)
 return {actor,binding,perception,map:perceivedMap(perception,state.campaign.scenes,state.characters,state.campaign.seconds)}
}

export function campaignStoryRoutes(app,{db,auth,updated,lockedMembership,store,oldCommand}){
 app.get('/api/lobbies/:id/play/story',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);master(member)
   const state=JSON.parse(lobby.world_json),bindings=await bindingsFor(tx,lobby),story=state.campaign.story??emptyStory()
   const scenes=state.campaign.scenes?.scenes??[],collection=state.campaign.declarations?.active
   return {revision:lobby.revision,closed:lobby.status==='closed',paused:(await campaignSession(tx,lobby.id)).paused,planVersion:story.planVersion,beats:story.beats,
    messages:story.messages.slice(-100),pending:story.messages.filter(m=>m.kind==='request'&&!m.resolved),
    activeSceneId:state.campaign.scenes?.activeSceneId??'',scenes:scenes.map(s=>({id:s.id,name:s.name})),
    npcs:npcList(bindings).filter(b=>b.approved&&b.control.controllerId===req.user.id).flatMap(b=>{
     const actor=state.characters.find(a=>a.id===b.character_id)
     const scene=scenes.find(s=>s.tokens.some(t=>t.actorId===b.character_id))
     return actor&&alive(actor)?[{id:actor.id,name:actor.name,sceneId:scene?.id??''}]:[]
    }),
    heroes:scenes.flatMap(scene=>audienceOptions(state,bindings,scene.id)).map(hero=>({...hero,
     submitted:!!collection?.entries.some(entry=>entry.actorId===hero.id&&entry.status==='submitted'),
    })),
   }
  });res.json(result)
 })
 app.get('/api/lobbies/:id/characters/:characterId/story',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req),state=JSON.parse(lobby.world_json),bindings=await bindingsFor(tx,lobby)
   const c=actorContext(state,bindings,req.params.characterId)
   if(c.binding.owner_id!==req.user.id&&c.binding.control.controllerId!==req.user.id)master(member)
   const paused=(await campaignSession(tx,lobby.id)).paused
   return {closed:lobby.status==='closed',paused,sceneId:c.map?.frame.id??'',messages:publicStory(state.campaign.story??emptyStory(),c.actor.id),
    canAsk:lobby.status!=='closed'&&!paused&&!!c.binding.approved&&c.binding.control.controllerId===req.user.id&&!!c.map&&alive(c.actor),
    contacts:c.map?.contacts.filter(contact=>contact.kind==='identified').map(contact=>({id:contact.id,label:contact.label}))??[]}
  });res.json(result)
 })

 const write=(path,operation,fields)=>app.post(path,auth.middleware,async(req,res)=>{
  const b=req.body
  if(!exact(b,[...fields,'commandKey'])||typeof b.commandKey!=='string'||!/^story:[a-zA-Z0-9_-]{8,140}$/.test(b.commandKey))fail(400,'Проверь команду истории или разговора.')
  const hash=createHash('sha256').update(JSON.stringify([operation,req.params.characterId??'',b])).digest('hex')
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req),state=JSON.parse(lobby.world_json),bindings=await bindingsFor(tx,lobby)
   let actor
   if(operation==='story-question'){
    const c=actorContext(state,bindings,req.params.characterId)
    requireCharacterController(member,c.binding,req.user.id)
    if(!c.binding.approved)fail(409,'Дождись принятия героя мастером.')
    actor=c
   }else master(member)
   const previous=await oldCommand(tx,lobby,req.user,b.commandKey,hash)
   if(previous)return previous
   if(lobby.status==='closed')fail(409,'Игра завершена. Разговоры доступны для чтения.')
   const story=state.campaign.story??emptyStory(),at=now()
   state.campaign.story=story
   let messageId=''
   if(operation==='story-plan'){
    if(integer(b.baseVersion)!==story.planVersion||!isStoryBeats(b.beats))fail(409,'План изменился или содержит ошибки. Сверь его с текущей версией.')
    const npcs=npcList(bindings)
    if(b.beats.some(beat=>beat.sceneId&&!sceneFor(state,beat.sceneId)||beat.npcId&&!npcs.some(n=>n.character_id===beat.npcId)))fail(409,'Проверь выбранные сцены и НПС в плане.')
    story.beats=structuredClone(b.beats);story.planVersion++
   }else{
    await requireCampaignRunning(tx,lobby.id)
    if(story.messages.length>=MAX_STORY_MESSAGES)fail(409,'В истории уже 1000 реплик. Сохрани копию кампании перед продолжением.')
    const body=text(b.body,4000)
    let message
    if(operation==='story-question'){
     if(!alive(actor.actor)||!actor.map)fail(409,'Для разговора нужен герой в сознании на открытой сцене.')
     const contactId=text(b.contactId,160,0)
     const contact=contactId?actor.map.contacts.find(c=>c.id===contactId&&c.kind==='identified'):null
     const target=contactId?actor.perception.scenes.find(s=>s.sceneId===actor.map.frame.id)?.contacts.find(c=>c.id===contactId):null
     if(contactId&&(!contact||!target))fail(409,'Выбранный собеседник больше не виден. Выбери доступный контакт.')
     message={kind:'request',sceneId:actor.map.frame.id,actorId:actor.actor.id,speaker:actor.actor.name,
      targetId:target?.actorId??'',targetLabel:contact?.label??'Мастеру',audience:[actor.actor.id],replyTo:'',resolved:false}
    }else{
     if(!['npc','narration'].includes(b.kind)||typeof b.sceneId!=='string'||!sceneFor(state,b.sceneId))fail(400,'Выбери сцену и вид реплики.')
     const choices=audienceOptions(state,bindings,b.sceneId)
     if(!Array.isArray(b.audience)||!b.audience.length||new Set(b.audience).size!==b.audience.length||
      b.audience.some(id=>!choices.some(hero=>hero.id===id)))fail(409,'Выбери слушателей из героев на этой сцене.')
     const npc=b.kind==='npc'?bindings.find(binding=>binding.npc&&binding.character_id===b.npcId&&binding.approved):null
     if(b.kind==='npc'&&(!npc||npc.control.controllerId!==req.user.id||!alive(state.characters.find(a=>a.id===npc.character_id))||
      !sceneFor(state,b.sceneId).tokens.some(t=>t.actorId===npc.character_id)))fail(403,'Выбери своего НПС в сознании, размещённого на сцене.')
     if(b.kind==='narration'&&b.npcId!=='')fail(400,'Описание сцены публикуется от мастера.')
     const replyTo=text(b.replyTo,160,0),parent=replyTo?story.messages.find(m=>m.id===replyTo&&m.kind==='request'):null
     if(replyTo&&(!parent||parent.resolved||parent.sceneId!==b.sceneId||!b.audience.includes(parent.actorId)))fail(409,'Вопрос уже разобран или его герой отсутствует среди слушателей.')
     message={kind:b.kind,sceneId:b.sceneId,actorId:npc?.character_id??'',speaker:b.kind==='npc'?text(b.speaker,120):'Мастер',
      targetId:'',targetLabel:'',audience:[...b.audience],replyTo,resolved:true}
     if(parent)parent.resolved=true
    }
    messageId=id()
    story.messages.push({...message,id:messageId,body,seconds:state.campaign.seconds,createdAt:at})
   }
   return store(tx,lobby,req.user,b.commandKey,hash,state,{operation,commandKey:b.commandKey,id:messageId,revision:lobby.revision+1,planVersion:story.planVersion,appliedAt:at},req)
  });if(!result.duplicate)updated(req.params.id);res.json(result)
 })
 write('/api/lobbies/:id/play/story/plan','story-plan',['baseVersion','beats'])
 write('/api/lobbies/:id/play/story/publish','story-publish',['kind','sceneId','npcId','speaker','body','audience','replyTo'])
 write('/api/lobbies/:id/characters/:characterId/story','story-question',['body','contactId'])
}
