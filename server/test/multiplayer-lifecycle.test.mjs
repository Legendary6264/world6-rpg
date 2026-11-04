import test from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import {io} from 'socket.io-client'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
import {unpackArchive} from '../campaign-archive-format.mjs'
import {isGameReadyAck,isGameStartAck,isGamePauseAck,isGameFinishAck,isGameSessionChangeAck} from '../generated/gameSession.mjs'
import {isRoundApplyAck,isCampaignCheckpointAck} from '../generated/commandAcknowledgements.mjs'
import {isKnowledgeAck,knowledgeEntryId} from '../generated/knowledgeCommands.mjs'

const wait=()=>({kind:'wait',seconds:5,note:''})
const speak=(text,target={kind:'none'})=>({kind:'speak',text,target,volume:'normal',note:''})
const ability=(id,stage,target={kind:'none'})=>({kind:'ability',abilityId:id,stage,target,note:''})
const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:10,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'PRIVATE-GM-RULE'}
const decision=(actorId,index,charge='')=>({key:`new:${actorId}:${index}`,kind:'ability',confirmed:true,binding:'unbound',charge,input:fields})

for(const dialect of ['sqlite','postgres'])test('Полный игровой цикл: мастер, четыре игрока, NPC, бой и финал · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('party-gm'),players=[]
 for(let i=0;i<4;i++)players.push(await f.register('party-player-'+i))
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id,session=root+'/play/session',heroes=[],sockets=[]
 const world=()=>api(root+'/world',gm.token),revision=async()=>(await world()).revision
 let noteCommand
 const positions=[[3,3],[6,6],[3,5],[5,3]]
 for(const [i,p] of players.entries()){
  await api(root+'/join',p.token,'POST')
  const character={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Игрок '+(i+1)}
  character.rpg.formulas=[];character.statistics.energyRegeneration='0';character.resources.mana={maximum:'50',current:'50'}
  character.rpg.abilities=[{...emptyAbility(),id:'party-ability',templateId:'party-template',name:i===2?'Помощь товарищу':'Согласованный удар',approved:true,mechanism:i===2?'heal':'manual',healAmount:10,rangeM:15,cost:{mana:i===2?5:7,shadow:0,stamina:0}}]
  Object.assign(character.body.parts.torso,{maximum:100,current:i===3?60:100})
  await api('/characters/'+character.id,p.token,'PUT',{character,revision:-1})
  const hero=(await api(root+'/characters',p.token,'POST',{characterId:character.id},201)).id;heroes.push(hero)
  await api(root+'/characters/'+hero+'/review',gm.token,'POST',{revision:await revision(),decision:'approve',note:''})
 }
 const npc={...createDefaultCharacter(),id:'npc-source',name:'Смотритель переправы'};npc.profile.biography='PRIVATE-NPC-BIO';npc.rpg.formulas=[];npc.statistics.energyRegeneration='0';Object.assign(npc.body.parts.torso,{maximum:100,current:100})
 const created=await api(root+'/npcs',gm.token,'POST',{revision:await revision(),character:npc,commandKey:'npc:'+crypto.randomUUID()}),npcId=created.id
 assert(npcId)
 const initial=await world();initial.campaign.scenes=createScene(emptyScenes(),'party-scene','Переправа','top')
 for(const a of initial.characters.filter(a=>heroes.includes(a.id)))a.rpg.abilities[0].approved=true
 const scene=initial.campaign.scenes.scenes[0],door={...sceneObject('door','party-door',{x:6,y:7,z:0}),name:'Ворота',open:false}
 scene.objects=[door];scene.tokens=[...heroes.map((actorId,i)=>({actorId,x:positions[i][0],y:positions[i][1],z:0})),{actorId:npcId,x:8,y:3,z:0}].map(p=>({...p,diameter:.8,support:{kind:'ground'}}))
 await api(root+'/world',gm.token,'PUT',{revision:initial.revision,world:initial})
 await api(root+'/play/setup',gm.token,'POST',{revision:await revision(),setup:{sceneId:scene.id,actorIds:heroes,contactIds:[...heroes,npcId],objectIds:[door.id],title:'У переправы',description:'Группа у ворот. Смотритель отвечает героям.',anchor:{x:3,y:3,z:0},revealTerrain:true}})
 const goals={operation:'goals',revision:await revision(),commandKey:'session:'+crypto.randomUUID(),objectives:[{id:'party-goal',title:'Поговорить со смотрителем и пройти ворота',done:false}]}
 assert(isGameSessionChangeAck(await api(session,gm.token,'POST',goals),goals))
 const connect=async player=>{
  const s=io(f.base,{auth:{token:player.token},forceNew:true,reconnection:false,transports:['websocket']});sockets.push(s);t.after(()=>s.close())
  await once(s,'connect',{signal:AbortSignal.timeout(5000)})
  const ack=await new Promise(resolve=>s.emit('subscribeLobby',id,resolve));assert(ack.ok);return s
 }
 const open=async next=>{
  const w=await world(),c=w.campaign.declarations?.active
  return next?api(root+'/declarations/next',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch},201):api(root+'/declarations',gm.token,'POST',{revision:w.revision,sceneId:scene.id,participantIds:[...heroes,npcId],durationSeconds:5,allowReplace:true},201)
 }
 const send=async(actorId,user,actions)=>{
  const path=root+'/characters/'+actorId+'/declarations',v=await api(path,user.token),command={collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry?.revision??0,controlStamp:v.controlStamp,actions,commandKey:'declaration:'+crypto.randomUUID()}
  await api(path,user.token,'PUT',command);return {path,command}
 }
 const contact=async(i,name)=>(await api(root+'/characters/'+heroes[i]+'/perception',players[i].token)).map.contacts.find(c=>c.label===name).id
 const calculate=async extra=>{
  let w=await world(),c=w.campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'});w=await world();c=w.campaign.declarations.active
  const preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:c.entries.map(e=>({actorId:e.actorId,entryRevision:e.revision,budgetMs:5000,costs:e.actions.flatMap((a,index)=>a.kind==='wait'?[]:[{index,personalMs:1000}])})),continuations:[],missingDecisions:[],interactionsConfirmed:true,...extra}})
  assert.deepEqual(await world(),w,'Calculation never applies consequences');return preview
 }
 const applyBody=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 await t.test('Все четыре подтверждают готовность; каждый получает только свою проекцию и собственный канал обновлений',async()=>{
  assert.equal((await api(session,gm.token)).canStart,false)
  for(const [i,p] of players.entries()){
   const personal=await api(root+'/world',p.token);assert(!JSON.stringify(personal).includes('PRIVATE-NPC-BIO'));assert(!JSON.stringify(personal).includes('PRIVATE-GM-RULE'))
   const beforeReady=await revision()
   assert(isGameReadyAck(await api(session+'/ready',p.token,'PUT',{ready:true}),beforeReady))
   if(i<3)assert.equal((await api(session,gm.token)).canStart,false)
  }
  const beforeStart=await revision()
  assert(isGameStartAck(await api(session+'/start',gm.token,'POST',{revision:beforeStart}),beforeStart));assert.equal((await api(root,gm.token)).status,'playing')
  await Promise.all(players.map(connect))
 })
 await t.test('Параллельные ходы: диалог с NPC, слушание, открытие ворот и движение не исполняются при отправке',async()=>{
  await open(false)
  const npcContact=await contact(0,npc.name),before=await world()
  const submissions=await Promise.all([
   send(heroes[0],players[0],[speak('Можно пройти через переправу?',{kind:'contact',id:npcContact})]),
   send(heroes[1],players[1],[{kind:'interact',target:{kind:'object',id:door.id},operation:'open',note:''}]),
   send(heroes[2],players[2],[{...wait(),listening:{mode:'listen',target:{kind:'none'}}}]),
   send(heroes[3],players[3],[{kind:'move',route:[{x:5,y:4,z:0}],support:'ground',note:''}]),
   send(npcId,gm,[{kind:'wait',seconds:1,note:''},speak('Северный проход открыт. Идите по тропе.')]),
  ])
  const submitted=await world();assert.equal(submitted.campaign.seconds,0);assert.deepEqual(submitted.characters,before.characters);assert.deepEqual(submitted.campaign.scenes,before.campaign.scenes);assert.equal((await api(session,gm.token)).round.received,4)
  assert.equal((await api(submissions[0].path,players[0].token,'PUT',submissions[0].command)).duplicate,true)
  const hears=(actorId,speaker,clarity='clear',fragment='')=>({actorId,speaker,clarity,fragment,signs:''})
  const p=await calculate({movement:{confirmed:true,bodies:[...heroes,npcId].map(actorId=>({actorId,heightM:1.7}))},speech:[
   {key:'new:'+heroes[0]+':0',confirmed:true,reason:'Видимый собеседник рядом',recordedAt:'',hearers:[hears(npcId,'Путник')]},
   {key:'new:'+npcId+':1',confirmed:true,reason:'Ответ слышат выбранные участники',recordedAt:'',hearers:[hears(heroes[0],'Смотритель'),hears(heroes[2],'Смотритель','fragment','Северный проход')]},
  ]})
  assert.equal((await world()).campaign.seconds,0)
  const notices=sockets.map(s=>once(s,'lobbyChanged',{signal:AbortSignal.timeout(5000)})),command=applyBody(p)
  assert(isRoundApplyAck(await api(root+'/rounds/apply',gm.token,'POST',command),command));assert(isRoundApplyAck(await api(root+'/rounds/apply',gm.token,'POST',command),command))
  assert((await Promise.all(notices)).every(([e])=>e.id===id))
  const after=await world();assert.equal(after.campaign.seconds,5);assert(after.campaign.scenes.scenes[0].objects[0].open);assert.equal(after.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===heroes[3]).y,4)
  const journals=await Promise.all(heroes.map((hero,i)=>api(root+'/characters/'+hero+'/perception',players[i].token)))
  assert(JSON.stringify(journals[0].knowledge.journal).includes('Идите по тропе.'));assert(JSON.stringify(journals[2].knowledge.journal).includes('Северный проход'));assert(!JSON.stringify(journals[2].knowledge.journal).includes('Идите по тропе.'))
  for(const i of [1,3])assert(!JSON.stringify(journals[i].knowledge.journal).includes('Северный проход'))
  await api(root+'/characters/'+heroes[1]+'/perception',players[0].token,'GET',undefined,403)
  noteCommand={revision:await revision(),title:'Личная запись после разговора',text:'PRIVATE-PARTY-NOTE: спросить о северном проходе.',commandKey:'knowledge:'+crypto.randomUUID()}
  assert(isKnowledgeAck(await api(root+'/characters/'+heroes[0]+'/knowledge',players[0].token,'POST',noteCommand,201),noteCommand,heroes[0]))
  for(const i of [1,2,3])assert(!JSON.stringify(await api(root+'/characters/'+heroes[i]+'/perception',players[i].token)).includes('PRIVATE-PARTY-NOTE'))
 })
 await t.test('Перерыв и контрольная точка сохраняют позиции; способности наносят урон и лечат товарища один раз',async()=>{
  const beforePause=await world()
  const pause={revision:await revision(),paused:true,reason:'Перерыв всей группы',commandKey:crypto.randomUUID()}
  assert(isGamePauseAck(await api(root+'/rounds/pause',gm.token,'POST',pause),pause))
  assert((await api(session,players[3].token)).paused)
  const resume={revision:await revision(),paused:false,reason:'Группа вернулась',commandKey:crypto.randomUUID()}
  assert(isGamePauseAck(await api(root+'/rounds/pause',gm.token,'POST',resume),resume))
  assert.deepEqual((await world()).campaign,beforePause.campaign)
  const objective={operation:'objective',revision:await revision(),commandKey:'session:'+crypto.randomUUID(),objectiveId:'party-goal',done:true}
  assert(isGameSessionChangeAck(await api(session,gm.token,'POST',objective),objective))
  assert((await world()).campaign.gameSession.objectives[0].done)
  const checkpoint={revision:await revision(),name:'После разговора',commandKey:crypto.randomUUID()}
  assert(isCampaignCheckpointAck(await api(root+'/rounds/checkpoints',gm.token,'POST',checkpoint),checkpoint))
  sockets.pop().close();await connect(players[3])
  await open(true);const target=await contact(0,npc.name),friend=await contact(2,'Игрок 4')
  await Promise.all([
   send(heroes[0],players[0],[ability('party-ability','prepare'),ability('party-ability','release',{kind:'contact',id:target})]),
   send(heroes[1],players[1],[wait()]),
   send(heroes[2],players[2],[ability('party-ability','prepare'),ability('party-ability','release',{kind:'contact',id:friend})]),
   send(heroes[3],players[3],[wait()]),send(npcId,gm,[wait()]),
  ])
  const before=await world(),p=await calculate({rules:[decision(heroes[0],0),decision(heroes[0],1,'prepare:new:'+heroes[0]+':0'),decision(heroes[2],0),decision(heroes[2],1,'prepare:new:'+heroes[2]+':0')]}),command=applyBody(p)
  assert.equal((await world()).characters.find(a=>a.id===heroes[0]).resources.mana.current,'50')
  assert(isRoundApplyAck(await api(root+'/rounds/apply',gm.token,'POST',command),command))
  const after=await world();assert.equal(after.campaign.seconds,10);assert.equal(after.characters.find(a=>a.id===heroes[0]).resources.mana.current,'43');assert.equal(after.characters.find(a=>a.id===heroes[2]).resources.mana.current,'45')
  assert(after.characters.find(a=>a.id===npcId).body.parts.torso.current<before.characters.find(a=>a.id===npcId).body.parts.torso.current)
  assert(after.characters.find(a=>a.id===heroes[3]).body.parts.torso.current>before.characters.find(a=>a.id===heroes[3]).body.parts.torso.current)
  sockets.forEach(s=>s.close());await f.restart();assert.deepEqual(await world(),after)
  assert.equal((await api(root+'/rounds/apply',gm.token,'POST',command)).duplicate,true);assert.deepEqual(await world(),after)
  const note=await api(root+'/characters/'+heroes[0]+'/knowledge',players[0].token,'POST',noteCommand,200)
  assert(isKnowledgeAck(note,noteCommand,heroes[0]));assert(note.duplicate);assert.deepEqual(await world(),after)
  sockets.length=0;await Promise.all(players.map(connect))
 })
 await t.test('Общий финал атомарен и переживает перезапуск; все четыре читают итог, новые действия запрещены',async()=>{
  const before=await world(),command={revision:before.revision,title:'Переправа пройдена',summary:'Группа поговорила со смотрителем, открыла ворота и помогла товарищу.',keepPending:false,commandKey:crypto.randomUUID()}
  await api(session+'/finish',players[0].token,'POST',command,403)
  const notices=sockets.map(s=>once(s,'lobbyChanged',{signal:AbortSignal.timeout(5000)})),results=await Promise.all([f.request(session+'/finish',gm.token,'POST',command),f.request(session+'/finish',gm.token,'POST',command)])
  assert(results.every(r=>r.status===200&&isGameFinishAck(r.data,command)));assert.equal(results.filter(r=>r.data.duplicate).length,1);assert((await Promise.all(notices)).every(([e])=>e.id===id))
  const result=results[0].data.result,closed=await world();assert.equal(closed.campaign.seconds,10);assert.deepEqual(closed.characters,before.characters)
  const exported=await api(root+'/archive',gm.token),portable=await unpackArchive(Buffer.from(exported.data,'base64'))
  assert.equal(portable.world.campaign.gameSession.status,'finished');assert(portable.world.campaign.gameSession.summary.includes(command.title));assert(portable.world.campaign.gameSession.summary.includes(command.summary))
  assert.deepEqual(portable.checkpoints.find(p=>p.name===command.title).world.campaign.gameSession,closed.campaign.gameSession)
  sockets.forEach(s=>s.close());await f.restart()
  assert.equal((await api(session+'/finish',gm.token,'POST',command)).duplicate,true)
  for(const [i,p] of players.entries()){
   const v=await api(session,p.token);assert.equal(v.phase,'finished');assert.deepEqual(v.result,result);assert(!JSON.stringify(v).includes('PRIVATE-NPC-BIO'))
   const d=await api(root+'/characters/'+heroes[i]+'/declarations',p.token);assert.equal(d.canSubmit,false)
   await api(root+'/characters/'+heroes[i]+'/declarations',p.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:d.entry.revision,controlStamp:d.controlStamp,actions:[wait()],commandKey:'declaration:'+crypto.randomUUID()},409)
  }
  assert.deepEqual(await world(),closed)
  assert(isKnowledgeAck(await api(root+'/characters/'+heroes[0]+'/knowledge',players[0].token,'POST',noteCommand,200),noteCommand,heroes[0]))
  const knowledge=(await api(root+'/characters/'+heroes[0]+'/perception',players[0].token)).knowledge
  assert.equal(knowledge.journal.filter(e=>e.id===knowledgeEntryId(noteCommand.commandKey)).length,1)
  const count=await f.server.db.get("SELECT COUNT(*) AS n FROM campaign_checkpoints WHERE lobby_id=? AND name='Переправа пройдена'",[id]);assert.equal(Number(count.n),1)
 })
})
