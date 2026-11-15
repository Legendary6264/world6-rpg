import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {emptyStory,isStoryAck} from '../generated/campaignStory.mjs'
import {unpackArchive} from '../campaign-archive-format.mjs'
import {commitWorld} from '../world-coordinator.mjs'

const commandKey=()=> 'story:'+crypto.randomUUID()
async function party(t,dialect){
 const f=await fixture(t,dialect),gm=await f.register('story-master'),players=[await f.register('story-one'),await f.register('story-two')],{api}=f
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Работа с вопросами',slots:2,commandKey:'starter:'+crypto.randomUUID()},201)
 const root='/lobbies/'+id,world=()=>api(root+'/world',gm.token),story=root+'/play/story',route=hero=>root+'/characters/'+hero+'/story',heroes=[]
 const lobby=await api(root,gm.token)
 for(const [i,player] of players.entries()){
  await api('/lobbies/join',player.token,'POST',{code:lobby.inviteCode})
  const character={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Герой '+i}
  await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
  const actorId=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id;heroes.push(actorId)
  await api(root+'/characters/'+actorId+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 const current=await world(),scene=current.campaign.scenes.scenes[0],npc=(await api(root+'/npcs',gm.token)).npcs[0]
 await api(root+'/play/setup',gm.token,'POST',{revision:current.revision,setup:{sceneId:scene.id,actorIds:heroes,objectIds:[],contactIds:[npc.id,...heroes],title:'Разговор',description:'Герои у ворот',anchor:{x:3,y:3,z:0},revealTerrain:true}})
 for(const player of players)await api(root+'/play/session/ready',player.token,'PUT',{ready:true})
 await api(root+'/play/session/start',gm.token,'POST',{revision:(await world()).revision})
 return {...f,gm,players,heroes,root,world,story,route,scene,npc}
}
function narration(id,sceneId,audience,body){return {id,kind:'narration',sceneId,actorId:'',speaker:'Мастер',targetId:'',targetLabel:'',body,audience,replyTo:'',resolved:true,seconds:0,createdAt:'2000-01-01T12:00:00.000Z'}}
for(const dialect of ['sqlite','postgres'])test('Диалоги: ранняя история, снятие, закрытие и гонка ответа · '+dialect,async t=>{
 const f=await party(t,dialect),{api,gm,players,heroes,root,world,story,route,scene,npc}=f
 const current=await world();current.campaign.story=emptyStory()
 current.campaign.story.messages=Array.from({length:125},(_,i)=>narration('history-'+i,scene.id,[heroes[i<110?0:1]],i<110?'Реплика '+i:'PRIVATE-OTHER-HERO'))
 await api(root+'/world',gm.token,'PUT',{revision:current.revision,world:current})
 await t.test('Ранняя история фильтруется до ограничения; число реплик не раскрывает чужие',async()=>{
  const personal=await api(route(heroes[0]),players[0].token)
  assert.equal(personal.messages.length,100);assert.equal(personal.totalMessages,110);assert.equal(personal.messages[0].body,'Реплика 10')
  const full=await api(route(heroes[0])+'?limit=200',players[0].token)
  assert.equal(full.messages.length,110);assert.equal(full.messages[0].body,'Реплика 0');assert(!JSON.stringify(full).includes('PRIVATE-OTHER-HERO'))
  assert.equal((await api(story+'?limit=200',gm.token)).messages.length,125)
  for(const query of ['99','1001','-100','1e3','100&limit=200'])await api(route(heroes[0])+'?limit='+query,players[0].token,'GET',undefined,400)
  await api(route(heroes[0])+'?limit=1000',players[1].token,'GET',undefined,403)
 })
 const ask=async i=>(await api(route(heroes[i]),players[i].token,'POST',{body:'Вопрос героя '+i,contactId:'',commandKey:commandKey()})).receipt.id
 const questions=[await ask(0),await ask(1)]
 const withdraw={messageId:questions[0],commandKey:commandKey()},resolve={messageId:questions[1],note:'PRIVATE-CLOSE: вернёмся к этому у ворот.',commandKey:commandKey()}
 await t.test('Снятие и закрытие доступны на паузе; чужое управление и пустое пояснение отвергаются',async()=>{
  await api(root+'/rounds/pause',gm.token,'POST',{revision:(await world()).revision,paused:true,reason:'Обсуждение',commandKey:crypto.randomUUID()})
  await api(route(heroes[0])+'/withdraw',players[1].token,'POST',withdraw,403)
  await api(route(heroes[0])+'/withdraw',players[0].token,'POST',{messageId:questions[1],commandKey:commandKey()},403)
  await api(story+'/resolve',players[0].token,'POST',resolve,403)
  await api(story+'/resolve',gm.token,'POST',{...resolve,note:'  ',commandKey:commandKey()},400)
  const before=await world()
  const results=await Promise.all([api(route(heroes[0])+'/withdraw',players[0].token,'POST',withdraw),api(route(heroes[0])+'/withdraw',players[0].token,'POST',withdraw)])
  assert.equal(results.filter(r=>r.duplicate).length,1);assert(isStoryAck(results[0],'story-withdraw',withdraw.commandKey))
  const after=await world();assert.equal(after.revision,before.revision+1);assert.equal(after.campaign.story.messages.length,before.campaign.story.messages.length)
  assert.equal(after.campaign.seconds,before.campaign.seconds);assert.deepEqual(after.characters,before.characters)
  await api(story+'/resolve',gm.token,'POST',resolve)
  assert.equal((await api(story+'/resolve',gm.token,'POST',resolve)).duplicate,true)
  assert.equal((await api(story,gm.token)).pending.length,0)
  assert(!JSON.stringify(await api(route(heroes[0]),players[0].token)).includes('PRIVATE-CLOSE'))
  assert.equal((await api(route(heroes[1]),players[1].token)).messages.at(-1).resolution.kind,'dismissed')
  await api(route(heroes[0])+'/withdraw',players[0].token,'POST',{...withdraw,commandKey:commandKey()},409)
  await api(root+'/rounds/pause',gm.token,'POST',{revision:(await world()).revision,paused:false,reason:'Продолжаем',commandKey:crypto.randomUUID()})
 })
 await t.test('Одновременные ответ и закрытие имеют одного победителя и одну ревизию',async()=>{
  const messageId=await ask(0),before=await world()
  const answer={kind:'npc',sceneId:scene.id,npcId:npc.id,speaker:'Страж',body:'Можно пройти.',audience:[heroes[0]],replyTo:messageId,commandKey:commandKey()}
  const result=await Promise.all([f.request(story+'/publish',gm.token,'POST',answer),f.request(story+'/resolve',gm.token,'POST',{messageId,note:'Обсудили голосом.',commandKey:commandKey()})])
  assert.deepEqual(result.map(r=>r.status).sort(),[200,409])
  const after=await world();assert.equal(after.revision,before.revision+1)
  assert.equal(after.campaign.story.messages.find(m=>m.id===messageId).resolved,true)
  assert.equal((await api(story,gm.token)).pending.length,0)
 })
 await t.test('Связанный ответ цитирует доступный вопрос и не раскрывает его другим слушателям',async()=>{
  const secret='PRIVATE-QUESTION: где скрыт проход?',question=await api(route(heroes[0]),players[0].token,'POST',{body:secret,contactId:'',commandKey:commandKey()})
  const answer=await api(story+'/publish',gm.token,'POST',{kind:'npc',sceneId:scene.id,npcId:npc.id,speaker:'Страж',body:'Пройдите к воротам.',audience:heroes,replyTo:question.receipt.id,commandKey:commandKey()})
  const mine=await api(route(heroes[0]),players[0].token),heard=await api(route(heroes[1]),players[1].token)
  const ownAnswer=mine.messages.find(m=>m.id===answer.receipt.id),otherAnswer=heard.messages.find(m=>m.id===answer.receipt.id)
  assert.deepEqual(ownAnswer.reply,{id:question.receipt.id,speaker:'Герой 0',body:secret,targetLabel:'Мастеру'})
  assert.equal(mine.messages.find(m=>m.id===question.receipt.id).answerId,answer.receipt.id)
  assert(otherAnswer);assert(!Object.hasOwn(otherAnswer,'reply'));assert(!Object.hasOwn(otherAnswer,'replyTo'))
  assert(!JSON.stringify(heard).includes(secret));assert(!JSON.stringify(heard).includes(question.receipt.id))
  assert(!JSON.stringify(ownAnswer.reply).includes(npc.id));assert(!Object.hasOwn(ownAnswer.reply,'audience'))
  const w=await world(),parent=w.campaign.story.messages.find(m=>m.id===question.receipt.id)
  // Paging can hide the parent while retaining the later answer. A safe quote
  // still comes from the full set of messages this hero is allowed to read.
  parent.createdAt='1999-01-01T00:00:00.000Z';delete parent.resolution
  const later=w.campaign.story.messages.find(m=>m.id===answer.receipt.id);later.createdAt='2099-01-01T00:00:00.000Z'
  w.campaign.story.messages.push(...Array.from({length:110},(_,i)=>narration('between-'+i,scene.id,heroes,'Промежуточная реплика '+i)))
  // Published dialogue is deliberately protected from editor world uploads.
  // Seed a paged historical fixture through the same canonical storage boundary.
  await f.server.db.transaction(async tx=>{
   const lobby=await tx.get('SELECT * FROM lobbies WHERE id=?',[root.split('/').at(-1)])
   await commitWorld(tx,lobby,{characters:w.characters,campaign:w.campaign})
  });await f.restart()
  const page=await api(route(heroes[0]),players[0].token)
  assert.equal(page.messages.length,100);assert(!page.messages.some(m=>m.id===question.receipt.id));assert.deepEqual(page.messages.at(-1).reply,ownAnswer.reply)
  const otherPage=await api(route(heroes[1]),players[1].token);assert(!JSON.stringify(otherPage).includes(secret));assert(!Object.hasOwn(otherPage.messages.at(-1),'reply'))
  const saved=await world(),archive=await api(root+'/archive',gm.token)
  assert.deepEqual((await unpackArchive(Buffer.from(archive.data,'base64'))).world.campaign.story,saved.campaign.story)
  assert(!Object.hasOwn(saved.campaign.story.messages.find(m=>m.id===answer.receipt.id),'reply'))
 })
 await t.test('Прежнее раскрытие сцены не позволяет спрашивать удалённым с неё героем',async()=>{
  const w=await world(),s=w.campaign.scenes.scenes.find(s=>s.id===scene.id);s.tokens=s.tokens.filter(token=>token.actorId!==heroes[0])
  await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w})
  const view=await api(route(heroes[0]),players[0].token);assert.equal(view.canAsk,false);assert.equal(view.canWithdraw,true);assert.deepEqual(view.contacts,[])
  await api(route(heroes[0]),players[0].token,'POST',{body:'Вопрос из прежней сцены',contactId:'',commandKey:commandKey()},409)
 })
 await t.test('Статусы и права переживают перезапуск и входят в архив',async()=>{
  const before=await world(),archive=await api(root+'/archive',gm.token)
  assert.deepEqual((await unpackArchive(Buffer.from(archive.data,'base64'))).world.campaign.story,before.campaign.story)
  await f.restart();assert.equal((await api(route(heroes[0])+'/withdraw',players[0].token,'POST',withdraw)).duplicate,true)
  assert.equal((await api(story+'/resolve',gm.token,'POST',resolve)).duplicate,true)
  assert.deepEqual((await world()).campaign.story,before.campaign.story)
 })
})
for(const dialect of ['sqlite','postgres'])test('Диалоги: заполненная история допускает разбор очереди · '+dialect,async t=>{
 const {api,gm,players,heroes,root,world,story,route,scene}=await party(t,dialect)
 const w=await world();w.campaign.story=emptyStory()
 w.campaign.story.messages=Array.from({length:1000},(_,i)=>narration('full-'+i,scene.id,[heroes[0]],'Запись '+i))
 for(const i of [0,1,2])w.campaign.story.messages[i]={...w.campaign.story.messages[i],kind:'request',actorId:heroes[i%2],speaker:'Герой',audience:[heroes[i%2]],resolved:false}
 await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w})
 await api(route(heroes[0]),players[0].token,'POST',{body:'Лимит',contactId:'',commandKey:commandKey()},409)
 await api(route(heroes[0])+'/withdraw',players[0].token,'POST',{messageId:'full-0',commandKey:commandKey()})
 await api(story+'/resolve',gm.token,'POST',{messageId:'full-1',note:'Разобрано.',commandKey:commandKey()})
 await api(story+'/resolve',gm.token,'POST',{messageId:'full-2',note:'PRIVATE-OLD-CLOSE: вопрос у прежних ворот закрыт.',commandKey:commandKey()})
 assert.equal((await api(story,gm.token)).pending.length,0)
 assert.equal((await world()).campaign.story.messages.length,1000)
 const recent=await api(route(heroes[0]),players[0].token)
 assert.equal(recent.messages.at(-1).id,'full-2');assert.equal(recent.messages.at(-1).resolution.kind,'dismissed')
 assert(!JSON.stringify(await api(route(heroes[1]),players[1].token)).includes('PRIVATE-OLD-CLOSE'))
})
