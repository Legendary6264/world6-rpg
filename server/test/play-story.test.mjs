import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
import {newStoryBeat} from '../generated/campaignStory.mjs'
import {unpackArchive} from '../campaign-archive-format.mjs'

for(const dialect of ['sqlite','postgres'])test('Четыре игрока, сюжет, НПС, способности и финальный снимок · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('director'),outside=await f.register('outside')
 const players=[]
 for(let i=0;i<4;i++)players.push(await f.register('party-'+i))
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Партия из четырёх',slots:4,commandKey:'starter:'+crypto.randomUUID()},201)
 const root='/lobbies/'+id,world=()=>api(root+'/world',gm.token),story=root+'/play/story',route=actorId=>root+'/characters/'+actorId
 const lobby=await api(root,gm.token),heroes=[]
 for(const [i,player] of players.entries()){
  await api('/lobbies/join',player.token,'POST',{code:lobby.inviteCode})
  const source={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Участник '+i}
  source.rpg.formulas=[];source.resources.mana={maximum:'20',current:'20'};source.statistics.energyRegeneration='0'
  if(!i)source.rpg.abilities=[{...emptyAbility(),id:'ward',templateId:'ward-template',name:'Щит',approved:true,mechanism:'effect',
   duration:30,modifiers:[{parameter:'physicalResistance',flat:2,percent:0}],cost:{mana:3,shadow:0,stamina:0}}]
  await api('/characters/'+source.id,player.token,'PUT',{character:source,revision:-1})
  const hero=(await api(root+'/characters',player.token,'POST',{characterId:source.id},201)).id
  heroes.push(hero)
  await api(route(hero)+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 const initial=await world(),scene=initial.campaign.scenes.scenes[0],npcs=await api(root+'/npcs',gm.token),npc=npcs.npcs[0]
 const caster=initial.characters.find(a=>a.id===heroes[0]),abilityId=caster.rpg.abilities[0].id
 caster.rpg.abilities[0].approved=true
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 const door=scene.objects.find(o=>o.kind==='door')
 await api(root+'/play/setup',gm.token,'POST',{revision:(await world()).revision,setup:{sceneId:scene.id,actorIds:heroes,objectIds:[door.id],
  contactIds:[npc.id,...heroes],title:'Встреча у ворот',description:'Путь перед воротами.',anchor:{x:3,y:3,z:0},revealTerrain:true}})
 for(const player of players)await api(root+'/play/session/ready',player.token,'PUT',{ready:true})
 assert.equal((await api(root+'/play/session',gm.token)).canStart,true)
 await api(root+'/play/session/start',gm.token,'POST',{revision:(await world()).revision})
 const key=()=> 'story:'+crypto.randomUUID()
 const plan={...newStoryBeat('gate-episode'),title:'Встреча',sceneId:scene.id,npcId:npc.id,alias:'Страж',opening:'У ворот стоит дозорный.',
  notes:'PRIVATE-PLOT: мотив и запасной путь.',reply:'Выберите дорогу.'}
 const savePlan={baseVersion:0,beats:[plan],commandKey:key()}
 await api(story+'/plan',players[0].token,'POST',savePlan,403)
 await api(story,players[0].token,'GET',undefined,403)
 await api(story,outside.token,'GET',undefined,403)
 const planned=await api(story+'/plan',gm.token,'POST',savePlan)
 assert.equal(planned.receipt.planVersion,1)
 const questions=await Promise.all(players.map(async(player,i)=>{
  const perceived=await api(route(heroes[i])+'/perception',player.token)
  const target=perceived.map.contacts.find(c=>c.label===npc.name)
  assert(target,'Раскрытый НПС должен быть доступен собеседником')
  const body={body:'Вопрос '+i+' у ворот.',contactId:target.id,commandKey:key()}
  const reply=await api(route(heroes[i])+'/story',player.token,'POST',body)
  return {body,reply}
 }))
 assert.equal((await api(story,gm.token)).pending.length,4)
 assert.doesNotMatch(JSON.stringify(await api(root+'/world',players[0].token)),/PRIVATE-PLOT|planVersion|gate-episode/)
 for(const [i,player] of players.entries()){
  const personal=await api(route(heroes[i])+'/story',player.token)
  assert.equal(personal.messages.length,1);assert.equal(personal.messages[0].body,questions[i].body.body)
  assert.doesNotMatch(JSON.stringify(personal),/PRIVATE-PLOT|targetId|actorId|audience|planVersion/)
 }
 await api(route(heroes[0])+'/story',players[1].token,'POST',questions[0].body,403)
 await api(route(heroes[0])+'/story',players[1].token,'GET',undefined,403)
 await api(route(heroes[0])+'/story',players[0].token,'POST',{...questions[0].body,body:'Другой вопрос тем же ключом'},409)
 await api(route(heroes[0])+'/story',players[0].token,'POST',{body:'Скрытому НПС',contactId:'unknown-contact',commandKey:key()},409)
 assert.equal((await api(route(heroes[0])+'/story',players[0].token,'POST',questions[0].body)).duplicate,true)
 const updatedPlan=await api(story+'/plan',gm.token,'POST',{baseVersion:1,beats:[{...plan,status:'active'}],commandKey:key()})
 assert.equal(updatedPlan.receipt.planVersion,2)
 await api(story+'/plan',gm.token,'POST',{baseVersion:1,beats:[plan],commandKey:key()},409)
 const requestId=questions[0].reply.receipt.id
 const answer={kind:'npc',sceneId:scene.id,npcId:npc.id,speaker:'Страж',body:'PRIVATE-REPLY: ищи знак на камне.',audience:[heroes[0]],replyTo:requestId,commandKey:key()}
 const before=await world(),replied=await api(story+'/publish',gm.token,'POST',answer)
 await api(story+'/publish',gm.token,'POST',{...answer,commandKey:key()},409)
 await api(story+'/publish',gm.token,'POST',{...answer,audience:[],replyTo:'',commandKey:key()},409)
 assert.equal((await api(story+'/publish',gm.token,'POST',answer)).duplicate,true)
 const privateView=await api(route(heroes[0])+'/story',players[0].token)
 assert.equal(privateView.messages.at(-1).speaker,'Страж');assert.equal(privateView.messages[0].resolved,true)
 for(const i of [1,2,3])assert(!JSON.stringify(await api(route(heroes[i])+'/story',players[i].token)).includes('PRIVATE-REPLY'))
 assert.equal((await world()).campaign.seconds,before.campaign.seconds)
 assert.deepEqual((await world()).characters,before.characters)
 const publication={kind:'narration',sceneId:scene.id,npcId:'',speaker:'',body:'Ворота можно открыть.',audience:heroes,replyTo:'',commandKey:key()}
 await api(story+'/publish',gm.token,'POST',publication)
 const saved=await world(),oldClient=structuredClone(saved)
 delete oldClient.campaign.story
 await api(root+'/world',gm.token,'PUT',{world:oldClient,revision:oldClient.revision})
 assert.deepEqual((await world()).campaign.story,saved.campaign.story)
 await f.restart()
 assert.equal((await api(story+'/publish',gm.token,'POST',answer)).duplicate,true)
 assert.equal((await api(story,gm.token)).pending.length,3)
 await api(story+'/publish',gm.token,'POST',{...publication,npcId:npc.id,commandKey:key()},400)
 await api(story+'/publish',gm.token,'POST',{...answer,npcId:heroes[0],replyTo:'',commandKey:key()},403)
 const pause=async paused=>api(root+'/rounds/pause',gm.token,'POST',{revision:(await world()).revision,paused,reason:'Пауза группы',commandKey:crypto.randomUUID()})
 await pause(true)
 assert.equal((await api(route(heroes[0])+'/story',players[0].token)).canAsk,false)
 assert.equal((await api(story,gm.token)).paused,true)
 await api(story+'/publish',gm.token,'POST',{...publication,commandKey:key()},409)
 await api(route(heroes[0])+'/story',players[0].token,'POST',{body:'Во время паузы',contactId:'',commandKey:key()},409)
 await pause(false)
 const declarations=root+'/declarations'
 const duration=scene.roundDurationSeconds??5
 await api(declarations,gm.token,'POST',{revision:(await world()).revision,sceneId:scene.id,participantIds:heroes,durationSeconds:duration,allowReplace:true},201)
 const ability=stage=>({kind:'ability',abilityId,stage,target:{kind:stage==='prepare'?'none':'self'},note:''})
 const actions=[
  [ability('prepare'),ability('release')],
  [{kind:'interact',target:{kind:'object',id:door.id},operation:door.open?'close':'open',note:''}],
  [{kind:'wait',seconds:1,note:''}],
  [{kind:'wait',seconds:1,listening:{mode:'listen',target:{kind:'none'}},note:''}],
 ]
 await Promise.all(players.map(async(player,i)=>{
  const path=route(heroes[i])+'/declarations',v=await api(path,player.token)
  await api(path,player.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,controlStamp:v.controlStamp,baseVersion:0,actions:actions[i]})
 }))
 const openCollection=(await world()).campaign.declarations.active
 await api(declarations,gm.token,'PATCH',{collectionId:openCollection.id,epoch:openCollection.epoch,operation:'close'})
 const collected=(await world()).campaign.declarations.active
 const hit={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,
  criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
 const rules=[{key:'new:'+heroes[0]+':0',kind:'ability',confirmed:true,binding:'unbound',charge:'',input:hit},
  {key:'new:'+heroes[0]+':1',kind:'ability',confirmed:true,binding:'bound',charge:'prepare:new:'+heroes[0]+':0',input:hit}]
 const beforeRound=await world(),preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:beforeRound.revision,collectionId:collected.id,epoch:collected.epoch,input:{
  timings:heroes.map((actorId,i)=>({actorId,entryRevision:1,budgetMs:duration*1000,costs:actions[i].flatMap((a,index)=>a.kind==='wait'?[]:[{index,personalMs:500}])})),
  continuations:[],missingDecisions:[],interactionsConfirmed:true,rules}})
 assert.deepEqual(await world(),beforeRound)
 const receipt=await api(root+'/rounds/apply',gm.token,'POST',{previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()})
 const afterRound=await world()
 assert.equal(afterRound.characters.find(a=>a.id===heroes[0]).resources.mana.current,'17')
 assert(afterRound.characters.find(a=>a.id===heroes[0]).rpg.effects.length)
 assert.deepEqual(afterRound.campaign.story,beforeRound.campaign.story)
 const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:afterRound.revision,receiptId:receipt.receipt.id,reason:'Проверка партии'})
 const applyChange=p=>api(root+'/rounds/change/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 await applyChange(rollback)
 assert.deepEqual((await world()).campaign.story,beforeRound.campaign.story)
 const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:receipt.receipt.id})
 await api(root+'/rounds/apply',gm.token,'POST',{previewId:replay.id,generation:replay.generation,commandKey:crypto.randomUUID()})
 const archive=await api(root+'/archive',gm.token)
 assert.deepEqual((await unpackArchive(Buffer.from(archive.data,'base64'))).world.campaign.story,(await world()).campaign.story)
 await api(root+'/play/session/finish',gm.token,'POST',{revision:(await world()).revision,title:'Первая сцена пройдена',summary:'Герои поговорили со стражем и открыли путь.',keepPending:false,commandKey:crypto.randomUUID()})
 await api(story+'/publish',gm.token,'POST',{...publication,commandKey:key()},409)
 for(const [i,player] of players.entries()){
  assert.equal((await api(root+'/play/session',player.token)).phase,'finished')
  const transcript=await api(route(heroes[i])+'/story',player.token)
  assert.equal(transcript.closed,true)
  assert(transcript.messages.some(m=>m.body===publication.body))
 }
 assert.equal(replied.duplicate,false)
})
