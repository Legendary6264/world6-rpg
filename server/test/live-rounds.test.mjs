import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
import {newStoryBeat} from '../generated/campaignStory.mjs'
import {MAX_PREVIEW_BYTES} from '../rounds.mjs'
import {unpackArchive} from '../campaign-archive-format.mjs'

const storyKey=()=> 'story:'+crypto.randomUUID()
const stamp=/^r1:[a-f0-9]{64}$/
for(const dialect of ['sqlite','postgres'])test('Живой раунд: диалоги, способности и неизменность условий · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('live-master'),helper=await f.register('live-helper'),players=[await f.register('live-one'),await f.register('live-two')]
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Диалоги во время раунда',slots:2,commandKey:'starter:'+crypto.randomUUID()},201)
 const root='/lobbies/'+id,world=()=>api(root+'/world',gm.token),master=()=>api(root+'/declarations',gm.token),story=root+'/play/story',actorPath=actor=>root+'/characters/'+actor,heroes=[]
 const invite=(await api(root,gm.token)).inviteCode
 await api('/lobbies/join',helper.token,'POST',{code:invite})
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 await api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:(await world()).revision,permissions:['rounds','viewSecrets']})
 for(const [i,player] of players.entries()){
  await api('/lobbies/join',player.token,'POST',{code:invite})
  const character={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Участник '+i}
  character.rpg.formulas=[];character.resources.mana={maximum:'20',current:'20'};character.statistics.energyRegeneration='0'
  if(!i)character.rpg.abilities=[{...emptyAbility(),id:'ward',templateId:'ward-template',approved:true,name:'Щит',mechanism:'effect',duration:30,modifiers:[{parameter:'physicalResistance',flat:2,percent:0}],cost:{mana:3,shadow:0,stamina:0}}]
  await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
  const actor=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id;heroes.push(actor)
  await api(actorPath(actor)+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 const first=await world(),scene=first.campaign.scenes.scenes[0],caster=first.characters.find(a=>a.id===heroes[0]),abilityId=caster.rpg.abilities[0].id
 caster.rpg.abilities[0].approved=true;scene.roundDurationSeconds=5
 await api(root+'/world',gm.token,'PUT',{revision:first.revision,world:first})
 const npc=(await api(root+'/npcs',gm.token)).npcs[0]
 await api(root+'/play/setup',gm.token,'POST',{revision:(await world()).revision,setup:{sceneId:scene.id,actorIds:heroes,objectIds:[],contactIds:[npc.id,...heroes],title:'У ворот',description:'Герои беседуют со стражем.',anchor:{x:3,y:3,z:0},revealTerrain:true}})
 for(const player of players)await api(root+'/play/session/ready',player.token,'PUT',{ready:true})
 await api(root+'/play/session/start',gm.token,'POST',{revision:(await world()).revision})
 await api(root+'/declarations',gm.token,'POST',{revision:(await world()).revision,sceneId:scene.id,participantIds:heroes,durationSeconds:5,allowReplace:true},201)
 const ability=stage=>({kind:'ability',abilityId,stage,target:{kind:stage==='prepare'?'none':'self'},note:''})
 const actions=[[ability('prepare'),ability('release')],[{kind:'wait',seconds:1,note:''}]]
 for(const [i,player] of players.entries()){
  const path=actorPath(heroes[i])+'/declarations',value=await api(path,player.token)
  await api(path,player.token,'PUT',{collectionId:value.collection.id,epoch:value.collection.epoch,baseVersion:0,controlStamp:value.controlStamp,actions:actions[i]})
 }
 let c=(await master()).declarations.active
 await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
 c=(await master()).declarations.active
 const timings=heroes.map((actorId,i)=>({actorId,entryRevision:1,budgetMs:5000,costs:actions[i].flatMap((a,index)=>a.kind==='wait'?[]:[{index,personalMs:500}])}))
 const hit={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
 const input={timings,continuations:[],missingDecisions:[],interactionsConfirmed:true,rules:[{key:'new:'+heroes[0]+':0',kind:'ability',confirmed:true,binding:'unbound',charge:'',input:hit},{key:'new:'+heroes[0]+':1',kind:'ability',confirmed:true,binding:'bound',charge:'prepare:new:'+heroes[0]+':0',input:hit}]}
 const body=view=>({revision:view.revision,rulesStamp:view.rulesStamp,collectionId:view.declarations.active.id,epoch:view.declarations.active.epoch,input})
 const calc=async(token=gm.token)=>api(root+'/rounds/calculate',token,'POST',body(await master()))
 const apply=(p,key=crypto.randomUUID(),token=gm.token,status=200)=>api(root+'/rounds/apply',token,'POST',{previewId:p.id,generation:p.generation,commandKey:key},status)
 const publication=text=>({kind:'narration',sceneId:scene.id,npcId:'',speaker:'',body:text,audience:heroes,replyTo:'',commandKey:storyKey()})
 let preview,receipt,original,initial,metadata
 await t.test('Предпросмотр и личные длительности сохраняются через все операции диалога',async()=>{
  initial=await master();assert.match(initial.rulesStamp,stamp)
  preview=await calc();original=await world();metadata=await f.server.db.get('SELECT * FROM round_calculation_data WHERE preview_id=?',[preview.id])
  const beforePreview=await f.server.db.get('SELECT * FROM round_previews WHERE id=?',[preview.id])
  const question=await api(actorPath(heroes[0])+'/story',players[0].token,'POST',{body:'Куда идти?',contactId:'',commandKey:storyKey()})
  await api(story+'/plan',gm.token,'POST',{baseVersion:0,beats:[{...newStoryBeat('live-plan'),title:'У ворот',sceneId:scene.id,notes:'PRIVATE-LIVE-PLAN'}],commandKey:storyKey()})
  await api(story+'/publish',gm.token,'POST',{kind:'npc',sceneId:scene.id,npcId:npc.id,speaker:'Страж',body:'PRIVATE-LIVE-REPLY',audience:[heroes[0]],replyTo:question.receipt.id,commandKey:storyKey()})
  const second=await api(actorPath(heroes[1])+'/story',players[1].token,'POST',{body:'Уточнение',contactId:'',commandKey:storyKey()})
  await api(story+'/resolve',gm.token,'POST',{messageId:second.receipt.id,note:'Разобрали у ворот.',commandKey:storyKey()})
  const last=await api(actorPath(heroes[0])+'/story',players[0].token,'POST',{body:'Передумал',contactId:'',commandKey:storyKey()})
  await api(actorPath(heroes[0])+'/story/withdraw',players[0].token,'POST',{messageId:last.receipt.id,commandKey:storyKey()})
  const after=await world(),view=await master(),cached=await f.server.db.get('SELECT * FROM round_previews WHERE id=?',[preview.id])
  assert.equal(view.rulesStamp,initial.rulesStamp);assert.equal(cached.base_revision,after.revision)
  assert.equal(cached.summary_json,beforePreview.summary_json);assert.deepEqual(await f.server.db.get('SELECT * FROM round_calculation_data WHERE preview_id=?',[preview.id]),metadata)
  assert.deepEqual(JSON.parse(cached.world_json).campaign.story,after.campaign.story)
  assert.equal(cached.payload_bytes,Buffer.byteLength(cached.world_json+cached.summary_json+metadata.input_json+metadata.execution_seed))
  assert.equal(after.campaign.seconds,original.campaign.seconds);assert.deepEqual(after.characters,original.characters)
  const timeline=await api(root+'/declarations/preview',gm.token,'POST',{...body(initial),timings})
  assert.equal(timeline.revision,after.revision);assert.equal(timeline.rulesStamp,initial.rulesStamp)
  const foreign=await api(root+'/rounds/calculate',helper.token,'POST',body(initial))
  assert.equal(foreign.revision,after.revision);assert.equal(foreign.rulesStamp,initial.rulesStamp)
  await apply(foreign,crypto.randomUUID(),gm.token,409)
  await apply(preview,crypto.randomUUID(),players[0].token,403)
  assert(!JSON.stringify(await api(actorPath(heroes[1])+'/story',players[1].token)).includes('PRIVATE-LIVE-REPLY'))
  assert(!JSON.stringify(await api(actorPath(heroes[1])+'/declarations',players[1].token)).includes('rulesStamp'))
 })
 await t.test('Прежние клиенты и поддельное подтверждение не обходят проверку текущих условий',async()=>{
  const b=body(initial);delete b.rulesStamp
  await api(root+'/rounds/calculate',gm.token,'POST',b,409)
  await api(root+'/rounds/calculate',gm.token,'POST',{...body(initial),rulesStamp:'r1:'+ 'f'.repeat(64)},409)
  await api(root+'/rounds/calculate',gm.token,'POST',{...body(initial),rulesStamp:'invalid'},400)
  await api(root+'/rounds/calculate',gm.token,'POST',{...body(initial),revision:(await world()).revision+1},409)
 })
 await t.test('Повтор применения не тратит ману второй раз; история разговора остаётся в мире и архиве',async()=>{
  const before=await world(),key=crypto.randomUUID(),b=publication('Реплика одновременно с применением')
  const [applied,published]=await Promise.all([apply(preview,key),api(story+'/publish',gm.token,'POST',b)]);receipt=applied.receipt
  assert.equal((await apply(preview,key)).duplicate,true)
  const after=await world();assert.equal(after.characters.find(a=>a.id===heroes[0]).resources.mana.current,'17')
  assert(after.characters.find(a=>a.id===heroes[0]).rpg.effects.length)
  const originalStory=structuredClone(after.campaign.story);originalStory.messages=originalStory.messages.filter(message=>message.id!==published.receipt.id)
  assert.deepEqual(originalStory,before.campaign.story);assert.equal(after.campaign.story.messages.filter(message=>message.id===published.receipt.id).length,1)
  const stored=await f.server.db.get('SELECT before_json FROM round_receipts WHERE id=?',[receipt.id]),recorded=JSON.parse(stored.before_json).campaign.story
  assert(recorded.messages.length===before.campaign.story.messages.length||recorded.messages.length===after.campaign.story.messages.length)
  const archive=await api(root+'/archive',gm.token);assert.deepEqual((await unpackArchive(Buffer.from(archive.data,'base64'))).world.campaign.story,after.campaign.story)
 })
 await f.restart()
 await t.test('Откат и точная переигровка допускают новые реплики с сохранением прежних бросков',async()=>{
  const p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:receipt.id,reason:'Проверка боя'})
  await api(root+'/rounds/change/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
  await api(story+'/publish',gm.token,'POST',publication('Новая реплика после отката'))
  assert((await api(root+'/rounds/history',gm.token)).replay)
  const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:receipt.id})
  await api(story+'/publish',gm.token,'POST',publication('Ещё одна реплика после расчёта'))
  const before=await world(),replayed=(await apply(replay)).receipt
  const after=await world();assert.equal(after.characters.find(a=>a.id===heroes[0]).resources.mana.current,'17');assert.deepEqual(after.campaign.story,before.campaign.story)
  const replayedData=await f.server.db.get('SELECT input_json,execution_seed FROM round_history_data WHERE receipt_id=?',[replayed.id])
  assert.equal(replayedData.execution_seed,metadata.execution_seed)
  assert.deepEqual(JSON.parse(replayedData.input_json),JSON.parse(metadata.input_json))
 })
 const fresh=async()=>{const w=await world();w.campaign.declarations.active={...w.campaign.declarations.active,id:crypto.randomUUID(),epoch:2,history:[]};await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w})}
 await t.test('Ресурсы, управление и пауза требуют новой проверки; сам текст этой защиты не ослабляет',async()=>{
  await fresh();let context=await master(),p=await calc(),w=await world()
  w.characters.find(a=>a.id===heroes[0]).resources.mana.current='16';await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w})
  await apply(p,crypto.randomUUID(),gm.token,409)
  await api(root+'/rounds/calculate',gm.token,'POST',{...body(context),revision:(await world()).revision},409)
  context=await master();p=await calc()
  await api(actorPath(heroes[0])+'/control',players[0].token,'POST',{delegated:true,revision:(await world()).revision})
  assert.notEqual((await master()).rulesStamp,context.rulesStamp);await apply(p,crypto.randomUUID(),gm.token,409)
  context=await master();p=await calc()
  const pause=async paused=>api(root+'/rounds/pause',gm.token,'POST',{revision:(await world()).revision,paused,reason:'Проверка паузы',commandKey:crypto.randomUUID()})
  await pause(true);await apply(p,crypto.randomUUID(),gm.token,409);await pause(false)
  assert.notEqual((await master()).rulesStamp,context.rulesStamp)
  await api(root+'/rounds/calculate',gm.token,'POST',{...body(context),revision:(await world()).revision},409)
 })
 await t.test('Ошибка обновления кэша откатывает сообщение, квитанцию и мир целиком',async()=>{
  await fresh();const p=await calc(),before=await world(),cached=await f.server.db.get('SELECT * FROM round_previews WHERE id=?',[p.id]),b=publication('После временной ошибки')
  const db=f.server.db,transaction=db.transaction.bind(db)
  db.transaction=callback=>transaction(tx=>callback(new Proxy(tx,{get(target,key){if(key==='run')return(sql,args)=>{if(sql.startsWith('UPDATE round_previews SET base_revision'))throw Error('TEST-STORY-CACHE');return target.run(sql,args)};const value=target[key];return typeof value==='function'?value.bind(target):value}})))
  try{await api(story+'/publish',gm.token,'POST',b,500)}finally{db.transaction=transaction}
  assert.deepEqual(await world(),before);assert.deepEqual(await db.get('SELECT * FROM round_previews WHERE id=?',[p.id]),cached)
  assert.equal(await db.get('SELECT * FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[id,b.commandKey]),undefined)
  await api(story+'/publish',gm.token,'POST',b)
  assert.equal((await db.get('SELECT base_revision FROM round_previews WHERE id=?',[p.id])).base_revision,(await world()).revision)
 })
 await t.test('Переполнение бюджета предпросмотров не блокирует диалог и не применяет бой',async()=>{
  const db=f.server.db,p=await db.get('SELECT * FROM round_previews WHERE lobby_id=?',[id]),junk=crypto.randomUUID()
  await db.run('INSERT INTO round_previews(id,lobby_id,author_id,generation,base_revision,collection_id,epoch,controls_stamp,executor_version,world_json,summary_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[junk,id,helper.user.id,p.generation,p.base_revision-1,p.collection_id,p.epoch,p.controls_stamp,p.executor_version,p.world_json,p.summary_json,MAX_PREVIEW_BYTES-p.payload_bytes])
  const before=await world();await api(story+'/publish',gm.token,'POST',publication('Диалог продолжается при заполненном кэше'))
  assert.equal(await db.get('SELECT id FROM round_previews WHERE id=?',[p.id]),undefined)
  assert.equal(await db.get('SELECT preview_id FROM round_calculation_data WHERE preview_id=?',[p.id]),undefined)
  assert.deepEqual((await world()).characters,before.characters)
  await apply({id:p.id,generation:p.generation},crypto.randomUUID(),gm.token,409)
 })
})
