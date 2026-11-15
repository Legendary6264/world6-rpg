import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'

for(const dialect of ['sqlite','postgres'])test('Сохранённые команды запуска, паузы и финала · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('controls-gm'),players=[await f.register('controls-one'),await f.register('controls-two')]
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Совместная сессия',slots:4,commandKey:'starter:'+crypto.randomUUID()},201)
 const root='/lobbies/'+id,path=root+'/play/session',world=()=>api(root+'/world',gm.token),view=(user=gm)=>api(path,user.token),heroes=[]
 const initial=await world(),scene=initial.campaign.scenes.scenes[0],lobby=await api(root,gm.token)
 for(const [index,player] of players.entries()){
  await api('/lobbies/join',player.token,'POST',{code:lobby.inviteCode})
  const character={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Участник '+index}
  await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
  const hero=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id;heroes.push(hero)
  await api(root+'/characters/'+hero+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 await api(root+'/play/setup',gm.token,'POST',{revision:(await world()).revision,setup:{sceneId:scene.id,actorIds:heroes,objectIds:[],contactIds:heroes,title:'Общая сцена',description:'Игроки у ворот',anchor:{x:3,y:3,z:0},revealTerrain:true}})
 for(const p of players)await api(path+'/ready',p.token,'PUT',{ready:true})
 async function command(extra={}){const v=await view();return {revision:v.revision,generation:v.generation,commandKey:crypto.randomUUID(),...extra}}
 async function post(suffix,body,status=200,user=gm){return api(suffix==='pause'?root+'/rounds/pause':path+'/'+suffix,user.token,'POST',body,status)}
 async function failAudit(operation,run){
  const db=f.server.db,transaction=db.transaction
  db.transaction=fn=>transaction(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes(operation))throw Error('TEST-SESSION-AUDIT');return tx.run(sql,args)}}))
  try{await run()}finally{db.transaction=transaction}
 }
 let start,pause,finish,final
 const checkpoint=await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:(await world()).revision,name:'До запуска',commandKey:crypto.randomUUID()})

 await t.test('Старт атомарен и сохраняет одно подтверждение при одновременном повторе',async()=>{
  start=await command();const before=await world()
  await post('start',start,403,players[0]);await post('start',{...start,generation:0},400);await post('start',{...start,revision:start.revision-1},409)
  await post('start',{...start,commandKey:(await f.server.db.get('SELECT command_key FROM campaign_checkpoints WHERE id=?',[checkpoint.checkpoint.id])).command_key},409)
  await failAudit('start-game',()=>post('start',start,500))
  assert.deepEqual(await world(),before);assert.equal((await api(root,gm.token)).status,'open')
  assert.equal(await f.server.db.get('SELECT command_key FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[id,start.commandKey]),undefined)
  const replies=await Promise.all([f.request(path+'/start',gm.token,'POST',start),f.request(path+'/start',gm.token,'POST',start)])
  assert(replies.every(r=>r.status===200));assert.equal(replies.filter(r=>!r.data.duplicate).length,1)
  const r=replies[0].data.receipt;assert.equal(r.id,start.commandKey);assert.equal(r.generation,start.generation);assert.equal(r.sourceRevision,start.revision)
  const after=await world();assert.equal(after.revision,before.revision+1);assert.equal(after.campaign.gameSession.status,'playing');assert(after.campaign.gameSession.startedAt)
  assert.deepEqual(after.characters,before.characters);assert.equal(after.campaign.seconds,before.campaign.seconds)
  await f.restart();assert.equal((await post('start',Object.fromEntries(Object.entries(start).reverse()))).duplicate,true);assert.deepEqual(await world(),after)
  await post('start',await command(),409)
  assert.equal((await f.server.db.get('SELECT COUNT(*) AS n FROM audit WHERE target_id=? AND action=?',[id,'start-game'])).n,1)
 })

 await t.test('Повтор прежней паузы не останавливает уже продолженную игру и не меняет часы',async()=>{
  pause=await command({paused:true,reason:'  Перерыв  '});const before=await world()
  await post('pause',{...pause,commandKey:start.commandKey},409)
  await failAudit('pause-campaign',()=>post('pause',pause,500));assert.deepEqual(await world(),before);assert.equal((await view()).paused,false)
  const replies=await Promise.all([post('pause',pause),post('pause',pause)])
  assert.equal(replies.filter(r=>!r.duplicate).length,1);assert.equal(replies[0].receipt.commandKey,pause.commandKey);assert.equal(replies[0].receipt.summary.reason,'Перерыв')
  assert.equal((await view()).paused,true);assert.equal((await world()).revision,before.revision+1)
  const resume=await command({paused:false,reason:'Продолжаем'});await post('pause',resume)
  const running=await world();await f.restart();assert.equal((await post('pause',pause)).duplicate,true)
  assert.equal((await view()).paused,false);assert.deepEqual(await world(),running);assert.equal(running.campaign.seconds,before.campaign.seconds)
  await post('pause',{...pause,reason:'Другой перерыв'},409);await post('pause',{...pause,generation:pause.generation+1},409)
  assert.equal((await post('start',start)).duplicate,true);assert.deepEqual(await world(),running)
 })

 await t.test('Финал сохраняет переносимую работу и замороженный итог независимо от чата',async()=>{
  const v=await world();await api(root+'/declarations',gm.token,'POST',{revision:v.revision,sceneId:scene.id,participantIds:heroes,durationSeconds:5,allowReplace:true},201)
  for(const [index,player] of players.entries()){
   const route=root+'/characters/'+heroes[index]+'/declarations',d=await api(route,player.token)
   await api(route,player.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:d.entry?.revision??0,controlStamp:d.controlStamp,actions:[{kind:'wait',seconds:index?1:8,note:'Продолжим в следующий раз'}]})
  }
  const opened=(await world()).campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:opened.id,epoch:opened.epoch,operation:'close'})
  const c=(await world()).campaign.declarations.active
  const calculate=await api(root+'/rounds/calculate',gm.token,'POST',{revision:(await world()).revision,collectionId:c.id,epoch:c.epoch,input:{timings:heroes.map(actorId=>({actorId,entryRevision:1,budgetMs:5000,costs:[]})),continuations:[],missingDecisions:[],interactionsConfirmed:true}})
  await api(root+'/rounds/apply',gm.token,'POST',{previewId:calculate.id,generation:calculate.generation,commandKey:crypto.randomUUID()})
  assert.equal((await view()).pendingWork,1)
  finish=await command({title:'Первая стоянка',summary:'Оставили дозор и сохранили незавершённое действие.',keepPending:false})
  await post('finish',finish,409);finish.keepPending=true
  const before=await world();await failAudit('finish-game',()=>post('finish',finish,500));assert.deepEqual(await world(),before)
  final=await post('finish',finish);assert.equal(final.duplicate,false);assert.equal(final.receipt.commandKey,finish.commandKey);assert.equal(final.receipt.keepPending,true)
  const after=await world();assert.equal(after.revision,before.revision+1);assert.deepEqual(after.campaign.roundWork,before.campaign.roundWork);assert.deepEqual(after.characters,before.characters);assert.equal(after.campaign.seconds,before.campaign.seconds)
  const snapshot=JSON.parse((await f.server.db.get('SELECT world_json FROM campaign_checkpoints WHERE id=?',[final.result.id])).world_json)
  assert.deepEqual(snapshot.campaign.roundWork,after.campaign.roundWork);assert.deepEqual(snapshot.campaign.gameSession,after.campaign.gameSession)
  const messageId='game-finish:'+final.result.id
  await f.server.db.run('UPDATE messages SET body=? WHERE id=?',['Подменённое сообщение',messageId])
  assert.deepEqual((await view()).result,final.result);await f.server.db.run('DELETE FROM messages WHERE id=?',[messageId]);await f.restart()
  assert.deepEqual((await view()).result,final.result);assert.deepEqual((await view()).finishReceipt,final.receipt)
  for(const player of players){const personal=await view(player);assert.deepEqual(personal.result,final.result);assert(!('finishReceipt' in personal));assert(!('generation' in personal));assert(!('pendingWork' in personal))}
  const duplicate=await post('finish',finish);assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.receipt,final.receipt);assert.deepEqual(duplicate.result,final.result)
  assert.deepEqual(await world(),after)
 })

 await t.test('Позднее подтверждение не завершает продолженную сессию; восстановление отвергает прежние команды',async()=>{
  const closed=await world();await api(path,gm.token,'POST',{operation:'resume',revision:closed.revision,commandKey:'session:'+crypto.randomUUID()})
  const resumed=await world();assert.equal((await post('finish',finish)).duplicate,true);assert.equal((await api(root,gm.token)).status,'playing');assert.deepEqual(await world(),resumed)
  const p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:resumed.revision,checkpointId:checkpoint.checkpoint.id,reason:'Новый вариант приключения'})
  await api(root+'/rounds/change/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
  const restored=await world();assert.notEqual((await view()).generation,start.generation)
  await post('start',start,409);await post('pause',pause,409);await post('finish',finish,409)
  assert.deepEqual(await world(),restored)
 })
})
