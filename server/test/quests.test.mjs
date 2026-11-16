import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {newQuest,isQuestLog} from '../generated/questLog.mjs'
import {unpackArchive,validateArchive} from '../campaign-archive-format.mjs'

for(const dialect of ['sqlite','postgres'])test('Задания героев · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('quest-gm'),players=[await f.register('quest-one'),await f.register('quest-two')],outsider=await f.register('quest-outside')
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Задания партии',slots:2,commandKey:'starter:'+crypto.randomUUID()},201)
 const root='/lobbies/'+id,world=()=>api(root+'/world',gm.token),master=()=>api(root+'/play/quests',gm.token),heroes=[],lobby=await api(root,gm.token)
 for(const [i,player] of players.entries()){
  await api('/lobbies/join',player.token,'POST',{code:lobby.inviteCode})
  const actor={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Герой '+i}
  await api('/characters/'+actor.id,player.token,'PUT',{character:actor,revision:-1})
  const hero=(await api(root+'/characters',player.token,'POST',{characterId:actor.id},201)).id;heroes.push(hero)
  await api(root+'/characters/'+hero+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 const initial=await world(),scene=initial.campaign.scenes.scenes[0],npc=(await api(root+'/npcs',gm.token)).npcs[0]
 await api(root+'/play/setup',gm.token,'POST',{revision:initial.revision,setup:{sceneId:scene.id,actorIds:heroes,objectIds:[],contactIds:[npc.id,...heroes],title:'У ворот',description:'Дорога',anchor:{x:3,y:3,z:0},revealTerrain:true}})
 for(const player of players)await api(root+'/play/session/ready',player.token,'PUT',{ready:true})
 await api(root+'/play/session/start',gm.token,'POST',{revision:(await world()).revision})
 const read=(i=0,token=players[i].token)=>api(root+'/characters/'+heroes[i]+'/quests',token)
 const command=async quest=>{const m=await master();return {generation:m.generation,baseVersion:m.version,quest,commandKey:'quest:'+crypto.randomUUID()}}
 const apply=(body,status=200,token=gm.token)=>api(root+'/play/quests',token,'POST',body,status)
 let q={...newQuest(crypto.randomUUID()),title:'Договориться со стражем',description:'Узнать условия прохода.',notes:'PRIVATE-NOTES',objectives:[{id:'talk',title:'Узнать условия',done:false}]},firstCommand,sourceId
 await t.test('Старый мир читается; закрытый черновик не виден игрокам; повтор команды не пишет мир',async()=>{
  assert.deepEqual((await read()).quests,[]);assert.equal((await master()).version,0)
  firstCommand=await command(q);await apply(firstCommand)
  assert.deepEqual((await read()).quests,[]);assert.deepEqual((await read(1)).quests,[])
  const before=await world();assert.equal((await apply(firstCommand)).duplicate,true);assert.deepEqual(await world(),before)
  await apply({...firstCommand,quest:{...q,title:'Другая команда'}},409)
  assert(isQuestLog(before.campaign.story.quests))
 })
 await t.test('Личный источник разговора не раскрывается второму адресату задания',async()=>{
  const published=await api(root+'/play/story/publish',gm.token,'POST',{kind:'npc',sceneId:scene.id,npcId:npc.id,speaker:'PRIVATE-SOURCE-SPEAKER',body:'PRIVATE-SOURCE-BODY',audience:[heroes[0]],replyTo:'',commandKey:'story:'+crypto.randomUUID()})
  sourceId=published.receipt.id;q={...q,published:true,audience:heroes,sourceMessageId:sourceId};await apply(await command(q))
  const a=await read(),b=await read(1)
  assert.equal(a.quests[0].source.body,'PRIVATE-SOURCE-BODY');assert.equal(b.quests[0].source,undefined)
  assert(!JSON.stringify(b).includes(sourceId));assert(!JSON.stringify(b).includes('PRIVATE-SOURCE'))
  for(const view of [a,b])for(const secret of ['PRIVATE-NOTES',heroes[0],heroes[1],npc.id,'audience','published','sourceMessageId'])assert(!JSON.stringify(view).includes(secret),secret)
  const privateDraft={...newQuest(crypto.randomUUID()),title:'PRIVATE-UNPUBLISHED'};await apply(await command(privateDraft))
  assert(!JSON.stringify(await read()).includes('PRIVATE-UNPUBLISHED'))
 })
 await t.test('Права, получатели, исходная реплика и валидация состояния проверяются на сервере',async()=>{
  await api(root+'/play/quests',players[0].token,'GET',undefined,403)
  await api(root+'/characters/'+heroes[0]+'/quests',players[1].token,'GET',undefined,403)
  await api(root+'/characters/'+heroes[0]+'/quests',outsider.token,'GET',undefined,403)
  const c=await command(q);await apply(c,403,players[0].token);await apply(c,403,outsider.token)
  await apply({...c,quest:{...q,audience:[npc.id]}},409)
  await apply({...c,quest:{...q,sourceMessageId:'missing-source'}},409)
  for(const patch of [{title:''},{notes:3},{status:'unknown'},{status:'completed'},{audience:[]},{objectives:[...q.objectives,...q.objectives]}])await apply({...c,quest:{...q,...patch}},400)
 })
 await t.test('Старая версия и одновременные ведущие не затирают новый прогресс',async()=>{
  const a=await command({...q,description:'Новые условия'}),b={...a,commandKey:'quest:'+crypto.randomUUID(),quest:{...q,description:'Другие условия'}}
  const race=await Promise.all([f.request(root+'/play/quests',gm.token,'POST',a),f.request(root+'/play/quests',gm.token,'POST',b)])
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409])
  q=(await master()).quests.find(entry=>entry.id===q.id);const {updatedAt:_at,...draft}=q;q=draft
  await apply({...a,commandKey:'quest:'+crypto.randomUUID()},409)
 })
 await t.test('Прогресс задания переносится в готовый расчёт без нового броска и применяется вместе с раундом',async()=>{
  await api(root+'/declarations',gm.token,'POST',{revision:(await world()).revision,sceneId:scene.id,participantIds:heroes,durationSeconds:5,allowReplace:true},201)
  for(const [i,player] of players.entries()){
   const path=root+'/characters/'+heroes[i]+'/declarations',view=await api(path,player.token)
   await api(path,player.token,'PUT',{collectionId:view.collection.id,epoch:view.collection.epoch,baseVersion:0,controlStamp:view.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]})
  }
  let c=(await api(root+'/declarations',gm.token)).declarations.active
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
  const context=await api(root+'/declarations',gm.token);c=context.declarations.active
  const preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:context.revision,rulesStamp:context.rulesStamp,collectionId:c.id,epoch:c.epoch,input:{timings:heroes.map(actorId=>({actorId,entryRevision:1,budgetMs:5000,costs:[]})),continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[]}})
  const before=await world();q={...q,status:'completed',objectives:q.objectives.map(o=>({...o,done:true}))}
  await apply(await command(q))
  const after=await world();assert.equal(after.campaign.seconds,before.campaign.seconds);assert.deepEqual(after.characters,before.characters)
  const cached=await f.server.db.get('SELECT summary_json,world_json FROM round_previews WHERE id=?',[preview.id])
  assert.deepEqual(JSON.parse(cached.summary_json),preview.summary);assert.equal(JSON.parse(cached.world_json).campaign.story.quests.entries.find(e=>e.id===q.id).status,'completed')
  await api(root+'/rounds/apply',gm.token,'POST',{previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()})
  assert.equal((await read()).quests[0].status,'completed')
 })
 await t.test('Перезапуск, полная копия и новое продолжение сохраняют задания и отвергают старую команду',async()=>{
  const snapshot=await read();await f.restart();assert.deepEqual(await read(),snapshot)
  const archive=await api(root+'/archive',gm.token),bytes=Buffer.from(archive.data,'base64'),unpacked=await unpackArchive(bytes)
  validateArchive(unpacked);assert.deepEqual(unpacked.world.campaign.story.quests,(await world()).campaign.story.quests)
  const response=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+(await world()).revision,{method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:bytes}),preview=await response.json()
  assert.equal(response.status,200,JSON.stringify(preview));await api(root+'/archive/apply',gm.token,'POST',{previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID(),reason:'Восстановить задания'})
  assert.deepEqual((await read()).quests,snapshot.quests);await apply(firstCommand,409)
 })
 await t.test('Закрытая сессия сохраняет доступ к личному журналу и блокирует новые записи',async()=>{
  await api(root+'/play/session/finish',gm.token,'POST',{revision:(await world()).revision,title:'Итог',summary:'Герои выполнили поручение.',keepPending:false,commandKey:crypto.randomUUID()})
  assert.equal((await read()).closed,true);assert.equal((await read()).quests[0].status,'completed')
  await apply(await command({...q,description:'Поздняя правка'}),409)
 })
})
