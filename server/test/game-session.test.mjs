import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {lobbyPermissions} from '../generated/lobbyAccess.mjs'

for(const dialect of ['sqlite','postgres'])test('Совместная игра от приглашения до финального снимка · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('session-gm'),players=[await f.register('session-player-a'),await f.register('session-player-b')],outside=await f.register('session-outside')
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Игра друзей',slots:4,commandKey:'starter:'+crypto.randomUUID()},201),root='/lobbies/'+id,path=root+'/play/session'
 const world=()=>api(root+'/world',gm.token),view=(token=gm.token)=>api(path,token),revision=async()=>(await api(root,gm.token)).revision
 const finishBody=async patch=>({revision:await revision(),title:'Переход открыт',summary:'Друзья открыли ворота и добрались до следующей стоянки.',keepPending:false,commandKey:crypto.randomUUID(),...patch})
 const heroes=[],lobby=await api(root,gm.token),initial=await world(),scene=initial.campaign.scenes.scenes[0],door=scene.objects.find(o=>o.kind==='door')
 await t.test('Подготовка и права: приглашение, принятие героя и раскрытие требуются до старта',async()=>{
  assert.equal((await view()).canStart,false);await api(path,outside.token,'GET',undefined,403)
  await api(path+'/start',gm.token,'POST',{revision:await revision()},409)
  for(let i=0;i<players.length;i++){
   await api('/lobbies/join',players[i].token,'POST',{code:lobby.inviteCode})
   const source={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Герой '+i};await api('/characters/'+source.id,players[i].token,'PUT',{character:source,revision:-1})
   const hero=(await api(root+'/characters',players[i].token,'POST',{characterId:source.id},201)).id;heroes.push(hero)
   await api(root+'/characters/'+hero+'/review',gm.token,'POST',{revision:await revision(),decision:'approve',note:''})
  }
  assert.deepEqual((await view()).ready.map(r=>r.done),[true,true,false]);await api(path+'/start',gm.token,'POST',{revision:await revision()},409)
  await api(root+'/play/setup',gm.token,'POST',{revision:await revision(),setup:{sceneId:scene.id,actorIds:heroes,objectIds:[door.id],contactIds:heroes,title:'У ворот',description:'Открытая общая сцена',anchor:{x:3,y:3,z:0},revealTerrain:true}})
  assert.equal((await view()).canStart,true)
  const personal=await view(players[0].token);assert(!('ready' in personal));assert(!('pendingWork' in personal));assert(!JSON.stringify(personal).includes(initial.characters[0].id));assert(!JSON.stringify(personal).includes('Кладовщица'))
  await api(path+'/start',players[0].token,'POST',{revision:await revision()},403);await api(path+'/finish',players[0].token,'POST',await finishBody(),403)
  await api(root+'/members/'+players[1].user.id,gm.token,'PATCH',{role:'ASSISTANT'});await api(root+'/members/'+players[1].user.id+'/permissions',gm.token,'PATCH',{revision:await revision(),permissions:lobbyPermissions})
  await api(path+'/start',players[1].token,'POST',{revision:await revision()},403);await api(path+'/finish',players[1].token,'POST',await finishBody(),403)
 })
 await t.test('Начало идемпотентно и закрывает набор без изменения мира или часов',async()=>{
  const before=await world(),rev=await revision()
  await api(path+'/start',gm.token,'POST',{revision:rev-1},409)
  const replies=await Promise.all([f.request(path+'/start',gm.token,'POST',{revision:rev}),f.request(path+'/start',gm.token,'POST',{revision:rev})]);assert(replies.every(r=>r.status===200));assert.equal(replies.filter(r=>!r.data.duplicate).length,1)
  assert.equal((await api(root,gm.token)).status,'playing');const after=await world();assert.deepEqual(after.campaign,before.campaign);assert.deepEqual(after.characters,before.characters);assert.equal(after.revision,rev+1)
  await api('/lobbies/join',outside.token,'POST',{code:lobby.inviteCode},409)
 })
 async function submit(actorId,player,actions){const p=root+'/characters/'+actorId+'/declarations',v=await api(p,player.token);await api(p,player.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry?.revision??0,controlStamp:v.controlStamp,actions})}
 async function calculate(input){let w=await world(),c=w.campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'});w=await world();c=w.campaign.declarations.active;return api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input})}
 const apply=p=>api(root+'/rounds/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 await t.test('Два независимых игрока: планы, перерыв, дверь, движение и перенос незавершённой работы',async()=>{
  await api(root+'/declarations',gm.token,'POST',{revision:await revision(),sceneId:scene.id,participantIds:heroes,durationSeconds:5,allowReplace:true},201)
  await submit(heroes[0],players[0],[{kind:'interact',target:{kind:'object',id:door.id},operation:door.open?'close':'open',note:''},{kind:'move',route:[{x:5,y:3,z:0}],support:'ground',note:''}])
  await submit(heroes[1],players[1],[{kind:'wait',seconds:8,note:'PRIVATE-SESSION-PLAN'}])
  assert.equal((await view()).round.received,2);assert(!JSON.stringify(await view(players[0].token)).includes('PRIVATE-SESSION-PLAN'))
  await api(path+'/finish',gm.token,'POST',await finishBody(),409)
  const beforePause=await world();await api(root+'/rounds/pause',gm.token,'POST',{revision:await revision(),paused:true,reason:'Перерыв',commandKey:crypto.randomUUID()});assert.equal((await view(players[0].token)).phase,'paused')
  await submitPaused();await api(root+'/rounds/pause',gm.token,'POST',{revision:await revision(),paused:false,reason:'Продолжаем',commandKey:crypto.randomUUID()});assert.deepEqual((await world()).campaign,beforePause.campaign)
  const p=await calculate({timings:[{actorId:heroes[0],entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000},{index:1,personalMs:2000}]},{actorId:heroes[1],entryRevision:1,budgetMs:5000,costs:[]}],continuations:[],missingDecisions:[],interactionsConfirmed:true,movement:{confirmed:true,bodies:(await world()).campaign.scenes.scenes[0].tokens.map(t=>({actorId:t.actorId,heightM:2}))}})
  assert.equal((await world()).campaign.seconds,0);await apply(p)
  const played=await world();assert.equal(played.campaign.seconds,5);assert.equal(played.campaign.scenes.scenes[0].objects.find(o=>o.id===door.id).open,!door.open);assert.equal(played.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===heroes[0]).x,5)
  assert.equal((await view()).phase,'applied');assert((await view()).pendingWork>0);await api(path+'/finish',gm.token,'POST',await finishBody(),409)
 })
 async function submitPaused(){const p=root+'/characters/'+heroes[0]+'/declarations',v=await api(p,players[0].token);await api(p,players[0].token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry.revision,controlStamp:v.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]},409)}
 await t.test('Следующий раунд завершает остаток работы; перезапуск сохраняет обоих игроков',async()=>{
  let w=await world(),c=w.campaign.declarations.active;await api(root+'/declarations/next',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch},201)
  await submit(heroes[0],players[0],[{kind:'wait',seconds:1,note:''}])
  const p=await calculate({timings:[{actorId:heroes[0],entryRevision:1,budgetMs:5000,costs:[]}],continuations:[{actorId:heroes[1],mode:'continue',budgetMs:5000}],missingDecisions:[],interactionsConfirmed:true})
  await apply(p);w=await world();assert.equal(w.campaign.seconds,10);assert.equal((await view()).pendingWork,0);await f.restart();assert.deepEqual(await world(),w)
  for(let i=0;i<2;i++)assert((await api(root+'/characters/'+heroes[i]+'/perception',players[i].token)).map)
 })
 await t.test('Неудача снимка или аудита не закрывает игру и не оставляет сообщения/частичного итога',async()=>{
  const checkpoint=await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:await revision(),name:'До завершения',commandKey:crypto.randomUUID()}),before=await world(),db=f.server.db
  const size=await db.get('SELECT payload_bytes FROM campaign_checkpoints WHERE id=?',[checkpoint.checkpoint.id]);await db.run('UPDATE campaign_checkpoints SET payload_bytes=? WHERE id=?',[32*1024*1024,checkpoint.checkpoint.id]);await api(path+'/finish',gm.token,'POST',await finishBody(),409);await db.run('UPDATE campaign_checkpoints SET payload_bytes=? WHERE id=?',[size.payload_bytes,checkpoint.checkpoint.id])
  const count=await db.get('SELECT COUNT(*) AS n FROM campaign_checkpoints WHERE lobby_id=?',[id]),messages=await db.get('SELECT COUNT(*) AS n FROM messages WHERE lobby_id=?',[id]),transaction=db.transaction
  db.transaction=fn=>transaction(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('finish-game'))throw Error('TEST-FINISH-AUDIT');return tx.run(sql,args)}}))
  try{await api(path+'/finish',gm.token,'POST',await finishBody(),500)}finally{db.transaction=transaction}
  assert.deepEqual(await world(),before);assert.equal((await api(root,gm.token)).status,'playing');assert.deepEqual(await db.get('SELECT COUNT(*) AS n FROM campaign_checkpoints WHERE lobby_id=?',[id]),count);assert.deepEqual(await db.get('SELECT COUNT(*) AS n FROM messages WHERE lobby_id=?',[id]),messages);assert.equal((await view()).result,null)
 })
 let finish,reply,finalWorld
 await t.test('Финал атомарен: одна точка, один общий итог, закрытые ходы, повтор после потери ответа безопасен',async()=>{
  const before=await world();finish=await finishBody()
  await api(path+'/finish',gm.token,'POST',{...finish,revision:finish.revision-1},409)
  const replies=await Promise.all([f.request(path+'/finish',gm.token,'POST',finish),f.request(path+'/finish',gm.token,'POST',finish)]);assert(replies.every(r=>r.status===200));assert.equal(replies.filter(r=>!r.data.duplicate).length,1);reply=replies[0].data
  assert.equal((await api(root,gm.token)).status,'closed');finalWorld=await world();assert.deepEqual(finalWorld.campaign,before.campaign);assert.deepEqual(finalWorld.characters,before.characters);assert.equal(finalWorld.revision,before.revision+1)
  const points=(await api(root+'/rounds/history',gm.token)).checkpoints;assert.equal(points.length,2);assert(points.some(p=>p.id===reply.result.id))
  const message=await f.server.db.get('SELECT body FROM messages WHERE id=?',['game-finish:'+reply.result.id]);assert(message.body.includes(finish.summary));const snapshot=await f.server.db.get('SELECT world_json FROM campaign_checkpoints WHERE id=?',[reply.result.id]);assert.deepEqual(JSON.parse(snapshot.world_json).campaign,before.campaign)
  await api(root+'/messages',players[0].token,'POST',{body:'Новый ход после финала'},409);await api(path+'/start',gm.token,'POST',{revision:await revision()},409);await api(path+'/finish',gm.token,'POST',{...finish,summary:'Другой итог'},409)
  await f.restart();const duplicate=await api(path+'/finish',gm.token,'POST',finish);assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.result,reply.result);assert.deepEqual(await world(),finalWorld)
 })
 await t.test('Оба игрока читают общий итог без снимка мира и секретов; прежний мастер теряет право повтора',async()=>{
  for(const player of players){const v=await view(player.token);assert.equal(v.phase,'finished');assert.deepEqual(v.result,reply.result);assert.equal(v.result.summary,finish.summary);assert(!JSON.stringify(v).includes('PRIVATE-SESSION-PLAN'));assert(!JSON.stringify(v).includes(initial.characters[0].id));assert(!('world_json' in v.result));await api(root+'/rounds/history',player.token,'GET',undefined,player===players[1]?200:403)}
  const own=await api(root+'/characters/'+heroes[0]+'/perception',players[0].token);assert.equal(own.closed,true);assert.equal(own.canWriteNotes,false)
  await api(root+'/characters/'+heroes[0]+'/knowledge',players[0].token,'POST',{revision:await revision(),title:'После финала',text:'Не должно изменить снимок'},409)
  assert.deepEqual(await world(),finalWorld)
  await api(path,outside.token,'GET',undefined,403)
  await api(root+'/transfer',gm.token,'POST',{userId:players[1].user.id});await api(path+'/finish',gm.token,'POST',finish,403);await api(path+'/finish',players[1].token,'POST',finish,409)
 })
})
