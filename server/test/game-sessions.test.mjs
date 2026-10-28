import test from 'node:test'
import assert from 'node:assert/strict'
import {io} from 'socket.io-client'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'

for(const dialect of ['sqlite','postgres'])test('Совместная игра от приглашения до финала · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('session-gm'),p1=await f.register('session-one'),p2=await f.register('session-two'),outsider=await f.register('session-outsider')
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Совместное приключение',slots:4,commandKey:'starter:'+crypto.randomUUID()},201),root='/lobbies/'+id,path=root+'/play/session'
 const lobby=await api(root,gm.token),heroes=[]
 for(const [i,p] of [p1,p2].entries()){
  await api('/lobbies/join',p.token,'POST',{code:lobby.inviteCode})
  const source={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Искатель '+(i+1)}
  await api('/characters/'+source.id,p.token,'PUT',{character:source,revision:-1})
  heroes.push((await api(root+'/characters',p.token,'POST',{characterId:source.id},201)).id)
 }
 const command=async(operation,extra={},status=200,token=gm.token,body)=>api(path,token,'POST',body??{operation,revision:(await api(path,gm.token)).revision,commandKey:'session:'+crypto.randomUUID(),...extra},status)
 await t.test('Участники видят готовность без NPC, секретных заметок и чужих листов; посторонний получает отказ',async()=>{
  await api(path,outsider.token,'GET',undefined,403);const view=await api(path,p1.token)
  assert.equal(view.chief,false);assert.equal(view.participants.length,2);assert.equal(view.canStart,false);assert(view.blockers.length)
  const serialized=JSON.stringify(view);for(const secret of ['Кладовщица','Наблюдатель','Заметка мастера','actorIds','readyUserIds'])assert(!serialized.includes(secret))
  await command('start',{},403,p1.token);await api(path+'/ready',gm.token,'PUT',{ready:true},403)
  await api(path+'/ready',p1.token,'PUT',{ready:true},409);await command('start',{},409)
 })
 await t.test('Принятые герои размещаются и получают отдельное раскрытие; каждый сам отмечает готовность',async()=>{
  for(const hero of heroes)await api(root+'/characters/'+hero,gm.token,'PATCH',{approved:true})
  const setup=await api(root+'/play/setup',gm.token),scene=setup.scenes.scenes[0],door=scene.objects.find(o=>o.kind==='door')
  await api(root+'/play/setup',gm.token,'POST',{revision:setup.revision,setup:{sceneId:scene.id,actorIds:heroes,objectIds:[door.id],contactIds:heroes,title:'Общий переход',description:'Путь через закрытый проход.',anchor:{x:3,y:3,z:0},revealTerrain:true}})
  await api(path+'/ready',p1.token,'PUT',{ready:true});await command('start',{},409)
  await api(path+'/ready',p2.token,'PUT',{ready:true});const ready=await api(path,gm.token);assert(ready.canStart);assert(ready.participants.every(p=>p.ready))
  const revision=ready.revision;await api(path+'/ready',p2.token,'PUT',{ready:true});assert.equal((await api(path,gm.token)).revision,revision)
 })
 let started
 await t.test('Старт атомарно открывает первый ход для двух героев; повтор не дублирует раунд',async()=>{
  const before=await api(path,gm.token),body={operation:'start',revision:before.revision,commandKey:'session:'+crypto.randomUUID()}
  const a=await command('start',{},200,gm.token,body),b=await command('start',{},200,gm.token,body);assert.equal(a.duplicate,false);assert.equal(b.duplicate,true);assert.deepEqual(a.receipt,b.receipt)
  started=await api(root+'/world',gm.token);assert.equal(started.revision,before.revision+1);assert.equal(started.campaign.gameSession.status,'playing');assert.equal(started.campaign.declarations.active.phase,'open');assert.deepEqual(new Set(started.campaign.declarations.active.participantIds),new Set(heroes))
  assert.equal((await api(root,gm.token)).status,'playing')
  await api(path+'/ready',p1.token,'PUT',{ready:false},409);await command('start',{},409)
  await api(path,gm.token,'POST',{...body,operation:'resume'},409)
 })
 await t.test('Два игрока отправляют настоящие ходы; мастер рассчитывает и применяет их один раз',async()=>{
  const scene=started.campaign.scenes.scenes[0]
  for(const [i,p] of [p1,p2].entries()){
   const d=await api(root+'/characters/'+heroes[i]+'/declarations',p.token),token=scene.tokens.find(t=>t.actorId===heroes[i])
   assert(d.canSubmit);await api(root+'/characters/'+heroes[i]+'/declarations',p.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:0,controlStamp:d.controlStamp,actions:[{kind:'move',route:[{x:token.x+1,y:token.y,z:0}],support:'ground',note:''}]})
  }
  let state=await api(root+'/world',gm.token),c=state.campaign.declarations.active
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'});state=await api(root+'/world',gm.token);c=state.campaign.declarations.active
  const preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:state.revision,collectionId:c.id,epoch:c.epoch,input:{timings:heroes.map(actorId=>({actorId,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]})),continuations:[],missingDecisions:[],interactionsConfirmed:true,movement:{confirmed:true,bodies:scene.tokens.map(t=>({actorId:t.actorId,heightM:2}))}}})
  const body={previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()};await api(root+'/rounds/apply',gm.token,'POST',body);await api(root+'/rounds/apply',gm.token,'POST',body)
  const after=await api(root+'/world',gm.token);assert.equal(after.campaign.seconds,5)
  for(const hero of heroes)assert.equal(after.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===hero).x,scene.tokens.find(t=>t.actorId===hero).x+1)
  await f.restart();assert.deepEqual(await api(root+'/world',gm.token),after)
 })
 let ending
 await t.test('Мастер завершает цели; оба игрока получают Socket.IO-обновление и одинаковый финал',async()=>{
  const view=await api(path,gm.token);await command('objective',{objectiveId:view.session.objectives[0].id,done:true},403,p1.token)
  await command('finish',{outcome:'success',summary:'Группа успешно прошла переход.'},409)
  for(const goal of view.session.objectives)await command('objective',{objectiveId:goal.id,done:true})
  const connections=await Promise.all([p1,p2].map(p=>new Promise((resolve,reject)=>{const s=io(f.base,{auth:{token:p.token},forceNew:true,transports:['websocket']}),timer=setTimeout(()=>reject(Error('Socket connection timed out')),5000);t.after(()=>s.close());s.on('connect_error',reject);s.on('connect',()=>s.emit('subscribeLobby',id,ack=>{clearTimeout(timer);if(!ack?.ok)reject(Error('Lobby subscription rejected'));else resolve(s)}))})))
  const broadcasts=connections.map(s=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Game completion event missing')),5000);s.once('lobbyChanged',data=>{clearTimeout(timer);resolve(data)})}))
  const revision=(await api(path,gm.token)).revision,body={operation:'finish',revision,commandKey:'session:'+crypto.randomUUID(),outcome:'success',summary:'Группа успешно прошла переход.'}
  const a=await command('finish',{},200,gm.token,body),b=await command('finish',{},200,gm.token,body);assert(b.duplicate);assert.equal(a.receipt.revision,b.receipt.revision)
  assert((await Promise.all(broadcasts)).every(e=>e.id===id));connections.forEach(s=>s.close())
  ending=await api(path,p1.token);assert.equal(ending.session.status,'finished');assert.equal(ending.session.outcome,'success');assert.equal(ending.session.summary,body.summary);assert.deepEqual((await api(path,p2.token)).session,ending.session);assert.equal((await api(root,gm.token)).status,'closed')
  const state=await api(root+'/world',gm.token);assert.equal(state.campaign.seconds,5);assert.equal(state.revision,revision+1)
 })
 await t.test('Перезапуск сохраняет финал и блокирует новые ходы; продолжить может только мастер',async()=>{
  await f.restart();assert.deepEqual((await api(path,p1.token)).session,ending.session)
  const d=await api(root+'/characters/'+heroes[0]+'/declarations',p1.token);assert.equal(d.canSubmit,false);assert.equal(d.paused,true)
  await api(root+'/characters/'+heroes[0]+'/declarations',p1.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:1,controlStamp:d.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]},409)
  await command('resume',{},403,p1.token);await command('resume');assert.equal((await api(path,gm.token)).session.status,'playing');assert.equal((await api(root,gm.token)).status,'playing')
  assert.equal((await api(root+'/world',gm.token)).campaign.seconds,5)
 })
 await t.test('Конфликт версии, неизвестная цель и ошибка аудита не оставляют частичных изменений',async()=>{
  const before=await api(root+'/world',gm.token),view=await api(path,gm.token)
  await api(path,gm.token,'POST',{operation:'objective',revision:view.revision-1,commandKey:'session:'+crypto.randomUUID(),objectiveId:view.session.objectives[0].id,done:false},409)
  await command('objective',{objectiveId:'missing',done:true},409)
  await command('goals',{objectives:[{id:'same',title:'A',done:false},{id:'same',title:'B',done:false}]},400)
  const body={operation:'finish',revision:view.revision,commandKey:'session:'+crypto.randomUUID(),outcome:'stopped',summary:'Прерванная проверка'},db=f.server.db,original=db.transaction
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('game-session-finish'))throw Error('TEST-SESSION-AUDIT');return tx.run(sql,args)}}))
  try{await api(path,gm.token,'POST',body,500)}finally{db.transaction=original}
  assert.equal(await db.get('SELECT command_key FROM campaign_trade_commands WHERE command_key=?',[body.commandKey]),undefined)
  assert.equal((await api(root,gm.token)).status,'playing');assert.equal((await api(path,p1.token)).session.status,'playing');assert.deepEqual(await api(root+'/world',gm.token),before)
 })
})
