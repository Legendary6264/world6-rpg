import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'

for(const dialect of ['sqlite','postgres'])test('Ветки, контрольные точки и пауза · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('continuation-gm'),player=await f.register('continuation-player'),helper=await f.register('continuation-helper')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 for(const user of [player,helper])await api(root+'/join',user.token,'POST')
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const source={...createDefaultCharacter(),id:'continuation-hero',name:'Герой продолжения'}
 await api('/characters/'+source.id,player.token,'PUT',{character:source,revision:-1})
 const heroId=(await api(root+'/characters',player.token,'POST',{characterId:source.id},201)).id,heroRoute=root+'/characters/'+heroId
 const world=()=>api(root+'/world',gm.token),history=()=>api(root+'/rounds/history',gm.token)
 await api(heroRoute+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world();initial.campaign.scenes=createScene(emptyScenes(),'continue-scene','Секретная сцена','side')
 initial.campaign.scenes.scenes[0].tokens=[{actorId:heroId,x:2,y:3,z:0,diameter:1,support:{kind:'ground'}}]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 const grant=async permissions=>api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:(await world()).revision,permissions})
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 const apply=(b,status=200,token=gm.token)=>api(root+'/rounds/apply',token,'POST',b,status)
 const change=(b,status=200,token=gm.token)=>api(root+'/rounds/change/apply',token,'POST',b,status)
 async function openCollection(){
  let w=await world(),c=w.campaign.declarations?.active
  if(c)await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'archive'})
  w=await world();await api(root+'/declarations',gm.token,'POST',{revision:w.revision,sceneId:'continue-scene',participantIds:[heroId],durationSeconds:5,allowReplace:true},201)
  const personal=await api(heroRoute+'/declarations',player.token)
  await api(heroRoute+'/declarations',player.token,'PUT',{collectionId:personal.collection.id,epoch:personal.collection.epoch,baseVersion:0,controlStamp:personal.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]})
  c=(await world()).campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
 }
 async function calculate(){const w=await world(),c=w.campaign.declarations.active;return api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:[{actorId:heroId,entryRevision:c.entries[0].revision,budgetMs:5000,costs:[]}],continuations:[],missingDecisions:[],interactionsConfirmed:false}})}
 async function play(){await openCollection();const before=await world(),preview=await calculate(),body=command(preview),r=await apply(body);return {before,receipt:r.receipt,body}}
 async function save(name,status=200,token=gm.token,body=null){return api(root+'/rounds/checkpoints',token,'POST',body??{revision:(await world()).revision,name,commandKey:crypto.randomUUID()},status)}
 async function rollback(receiptId,checkpointId,status=200,token=gm.token){return api(root+'/rounds/rollback/calculate',token,'POST',{revision:(await world()).revision,reason:'Проверка зависимого восстановления',...(checkpointId?{checkpointId}:{receiptId})},status)}
 async function pause(paused,status=200,body=null){return api(root+'/rounds/pause',gm.token,'POST',body??{revision:(await world()).revision,paused,reason:'Перерыв друзей',commandKey:crypto.randomUUID()},status)}
 let first,second,third,checkpoint,rollbackBody,checkpointBody

 await t.test('Точки и пауза приватны, команды и имена проверяются',async()=>{
  for(const token of [player.token,helper.token]){await save('Секрет',403,token);await api(root+'/rounds/pause',token,'POST',{revision:(await world()).revision,paused:true,reason:'X',commandKey:crypto.randomUUID()},403)}
  await grant(['rounds']);await save('Секрет',403,helper.token)
  for(const b of [[],{}, {revision:0,name:'',commandKey:'abcdefgh'}, {revision:0,name:'x'.repeat(81),commandKey:'abcdefgh'}])await save('',400,gm.token,b)
  await api(root+'/rounds/pause',gm.token,'POST',{revision:0,paused:'true',reason:'X',commandKey:'abcdefgh'},400)
 })
 await t.test('Три раунда одной ветки и именованный снимок после второго',async()=>{
  first=await play();second=await play();checkpointBody={revision:(await world()).revision,name:'После второго раунда',commandKey:crypto.randomUUID()};checkpoint=(await save('',200,gm.token,checkpointBody)).checkpoint
  const before=await world();assert.equal((await save('',200,gm.token,checkpointBody)).duplicate,true);assert.deepEqual(await world(),before)
  third=await play();await api(heroRoute+'/knowledge',player.token,'POST',{revision:(await world()).revision,title:'Позже',text:'PRIVATE-LATE-NOTE'},201)
  const h=await history();assert.deepEqual(h.rounds.map(r=>r.id),[third.receipt.id,second.receipt.id,first.receipt.id]);assert.equal(h.checkpoints[0].name,checkpoint.name)
 })
 await t.test('Выбранный откат снимает весь зависимый хвост, но сохраняет ранний раунд',async()=>{
  const before=await world(),bindings=await f.server.db.all('SELECT * FROM character_bindings WHERE lobby_id=?',[id]),p=await rollback(second.receipt.id)
  assert.deepEqual(p.summary.removedRounds.map(r=>r.id),[second.receipt.id,third.receipt.id]);assert(p.summary.includesLaterChanges);assert(p.summary.characters.some(c=>c.fields.includes('заметки и знания')));assert.deepEqual(await world(),before)
  rollbackBody=command(p);await change(rollbackBody);const restored=await world();assert.equal(restored.campaign.seconds,5);assert(!JSON.stringify(restored).includes('PRIVATE-LATE-NOTE'))
  assert.deepEqual((await history()).rounds.map(r=>r.id),[first.receipt.id]);assert.deepEqual(await f.server.db.all('SELECT * FROM character_bindings WHERE lobby_id=?',[id]),bindings)
  await apply(third.body,409);await rollback(third.receipt.id,undefined,409)
  await f.restart();assert.equal((await change(rollbackBody)).duplicate,true);assert.equal((await history()).replay.receiptId,second.receipt.id)
 })
 await t.test('Сохранённый ранний сбор нельзя открыть или исполнить второй раз в новом поколении',async()=>{
  const restored=await world();restored.campaign.declarations.active=structuredClone(first.before.campaign.declarations.active);restored.campaign.declarations.archive=restored.campaign.declarations.archive.filter(c=>c.id!==restored.campaign.declarations.active.id);await api(root+'/world',gm.token,'PUT',{world:restored,revision:restored.revision})
  const w=await world(),c=w.campaign.declarations.active;assert.equal((await api(root+'/declarations',gm.token)).executed,true)
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'reopen'},409)
  await api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{}},409)
 })
 await t.test('Восстановление точки возвращает её ветку и сохраняет текущую паузу',async()=>{
  await pause(true);const w=await world(),p=await rollback(undefined,checkpoint.id);assert.equal(p.summary.checkpointName,checkpoint.name);assert.deepEqual(p.summary.restoredRoundIds,[second.receipt.id]);assert.deepEqual(await world(),w)
  const r=await change(command(p));assert.equal(r.receipt.generation,3);const h=await history();assert(h.session.paused);assert.deepEqual(h.rounds.map(r=>r.id),[second.receipt.id,first.receipt.id]);assert.equal((await world()).campaign.seconds,10)
  const c=(await world()).campaign.declarations.active;assert.equal(c.id,second.receipt.collectionId);assert.equal((await api(root+'/declarations',gm.token)).executed,true)
  await change(rollbackBody,409);await f.restart();assert((await history()).session.paused);await pause(false)
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'reopen'},409)
 })
 await t.test('Пауза инвалидирует расчёт, переживает перезапуск и не меняет игровой снимок',async()=>{
  await openCollection();const preview=await calculate(),before=await world(),body={revision:before.revision,paused:true,reason:'Сохраняем фазу',commandKey:crypto.randomUUID()}
  const p=await pause(true,200,body);assert.equal(p.duplicate,false);const current=await world();assert.deepEqual(current.campaign,before.campaign);assert.deepEqual(current.characters,before.characters)
  await apply(command(preview),409);await calculatePaused(f,root,gm,world,409)
  const c=current.campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'reopen'},409)
  const personal=await api(heroRoute+'/declarations',player.token);assert(personal.paused);assert.equal(personal.canSubmit,false)
  await api(heroRoute+'/declarations',player.token,'PUT',{collectionId:c.id,epoch:c.epoch,baseVersion:1,controlStamp:personal.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]},409)
  await f.restart();assert.equal((await pause(true,200,body)).duplicate,true);assert.deepEqual(await world(),current)
  await save('Во время перерыва');await pause(false);const after=await world();assert.deepEqual(after.campaign,before.campaign);assert.deepEqual(after.characters,before.characters)
  await apply(command(preview),409);const fresh=await calculate();await apply(command(fresh));assert.equal((await world()).campaign.seconds,before.campaign.seconds+5)
  // A late retry of the old pause only acknowledges its receipt; it never pauses again.
  assert.equal((await pause(true,200,body)).duplicate,true);assert.equal((await history()).session.paused,false)
 })
 await t.test('Отзыв отката, чужая точка, смена состава и атомарный отказ аудита',async()=>{
  const {id:other}=await api('/lobbies',gm.token,'POST',lobbyBody,201);await api('/lobbies/'+other+'/rounds/rollback/calculate',gm.token,'POST',{revision:0,checkpointId:checkpoint.id,reason:'X'},404)
  await grant(['rounds','viewSecrets','rollback']);const p=await rollback(undefined,checkpoint.id,200,helper.token);await grant(['rounds','viewSecrets']);await change(command(p),403,helper.token)
  const before=await world(),fresh=await rollback(undefined,checkpoint.id),db=f.server.db,original=db.transaction
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('rollback-round'))throw Error('TEST-CHECKPOINT-AUDIT');return tx.run(sql,args)}}))
  try{await change(command(fresh),500)}finally{db.transaction=original}
  assert.deepEqual(await world(),before);assert.equal((await history()).generation,fresh.generation);assert(await db.get('SELECT id FROM round_change_previews WHERE id=?',[fresh.id]))
  const changed=await world();changed.characters.push({...createDefaultCharacter(),id:'new-hero',name:'Новый герой'});await api(root+'/world',gm.token,'PUT',{world:changed,revision:changed.revision});await rollback(undefined,checkpoint.id,409)
  changed.characters=changed.characters.filter(c=>c.id!=='new-hero');changed.revision=(await world()).revision;await api(root+'/world',gm.token,'PUT',{world:changed,revision:changed.revision})
 })
 await t.test('Лимит снимков, повтор команды и конфликт ключа не теряют данные',async()=>{
  const before=await world(),size=await f.server.db.get('SELECT payload_bytes FROM campaign_checkpoints WHERE id=?',[checkpoint.id])
  await f.server.db.run('UPDATE campaign_checkpoints SET payload_bytes=? WHERE id=?',[32*1024*1024,checkpoint.id]);await save('Сверх лимита',409);await f.server.db.run('UPDATE campaign_checkpoints SET payload_bytes=? WHERE id=?',[size.payload_bytes,checkpoint.id]);assert.deepEqual(await world(),before)
  const body={revision:before.revision,name:'Другой запрос',commandKey:checkpointBody.commandKey};await save('',409,gm.token,body)
  const p=await rollback(undefined,checkpoint.id);await change({...command(p),commandKey:checkpointBody.commandKey},409)
  await f.restart();assert.equal((await save('',200,gm.token,checkpointBody)).duplicate,true)
  if(dialect==='postgres'){const rows=await f.server.db.all("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='world6' AND c.relname IN ('round_branch_states','campaign_checkpoints','campaign_sessions')");assert.equal(rows.length,3);assert(rows.every(r=>r.relrowsecurity))}
 })
 await t.test('Ошибка аудита не оставляет точку или паузу; гонка двух команд имеет одну запись',async()=>{
  const before=await world(),h=await history(),db=f.server.db,original=db.transaction,count=await db.get('SELECT COUNT(*) AS n FROM campaign_checkpoints WHERE lobby_id=?',[id])
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&(args.includes('save-checkpoint')||args.includes('pause-campaign')))throw Error('TEST-SESSION-AUDIT');return tx.run(sql,args)}}))
  try{await save('Не должна остаться',500);await pause(true,500)}finally{db.transaction=original}
  assert.deepEqual(await world(),before);assert.deepEqual((await history()).session,h.session);assert.deepEqual(await db.get('SELECT COUNT(*) AS n FROM campaign_checkpoints WHERE lobby_id=?',[id]),count)
  const requests=[true,true].map(paused=>f.request(root+'/rounds/pause',gm.token,'POST',{revision:before.revision,paused,reason:'Одновременно',commandKey:crypto.randomUUID()})),results=await Promise.all(requests)
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);await pause(false)
 })
 await t.test('Откат самого раннего раунда очищает ветку; после него можно начать и снова восстановить точку',async()=>{
  const p=await rollback(first.receipt.id);assert(p.summary.removedRounds.length>=2);await change(command(p));assert.equal((await world()).campaign.seconds,0);assert.deepEqual((await history()).rounds,[])
  const replay=(await history()).replay,preview=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:replay.receiptId});const receipt=(await apply(command(preview))).receipt
  assert.deepEqual((await history()).rounds.map(r=>r.id),[receipt.id]);assert.equal((await world()).campaign.seconds,5)
  const restored=await rollback(undefined,checkpoint.id);assert.deepEqual(restored.summary.restoredRoundIds,[first.receipt.id,second.receipt.id]);await change(command(restored));assert.deepEqual((await history()).rounds.map(r=>r.id),[second.receipt.id,first.receipt.id])
 })
})
async function calculatePaused(f,root,gm,world,status){const w=await world(),c=w.campaign.declarations.active;await f.api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{}},status)}
