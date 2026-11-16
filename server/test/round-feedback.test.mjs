import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
import {unpackArchive,validateArchive} from '../campaign-archive-format.mjs'
import {io} from 'socket.io-client'

const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'PRIVATE-RULE'}
for(const dialect of ['sqlite','postgres'])test('Личные итоги раундов · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('feedback-gm'),players=[await f.register('feedback-one'),await f.register('feedback-two')],outsider=await f.register('feedback-outside')
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Итоги партии',slots:4,commandKey:'starter:'+crypto.randomUUID()},201)
 const root='/lobbies/'+id,world=()=>api(root+'/world',gm.token),heroes=[],lobby=await api(root,gm.token)
 for(const [index,player] of players.entries()){
  await api('/lobbies/join',player.token,'POST',{code:lobby.inviteCode})
  const character={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Герой '+index}
  character.rpg.formulas=[];character.statistics.energyRegeneration='0';character.resources.mana={maximum:'20',current:'20'}
  if(!index)character.rpg.abilities=[{...emptyAbility(),id:'ward',templateId:'ward-template',approved:true,name:'Щит',mechanism:'effect',rangeM:100,duration:30,cost:{mana:3,shadow:0,stamina:0},modifiers:[{parameter:'physicalResistance',flat:2,percent:0}]}]
  if(!index)character.rpg.abilities[0].visualEffect={familyId:'light',durationMs:1200}
  await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
  const hero=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id;heroes.push(hero)
  await api(root+'/characters/'+hero+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 const helper=await f.register('feedback-helper');await api('/lobbies/join',helper.token,'POST',{code:lobby.inviteCode})
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const initial=await world(),scene=initial.campaign.scenes.scenes[0],npc=(await api(root+'/npcs',gm.token)).npcs[0]
 initial.characters.find(a=>a.id===heroes[0]).rpg.abilities[0].approved=true
 initial.characters.find(a=>a.id===npc.id).name='PRIVATE-NPC-NAME';scene.name='PRIVATE-SCENE'
 await api(root+'/world',gm.token,'PUT',{revision:initial.revision,world:initial})
 await api(root+'/play/setup',gm.token,'POST',{revision:(await world()).revision,setup:{sceneId:scene.id,actorIds:heroes,objectIds:[],contactIds:[npc.id,...heroes],title:'Начало',description:'Дорога',anchor:{x:3,y:3,z:0},revealTerrain:true}})
 for(const player of players)await api(root+'/play/session/ready',player.token,'PUT',{ready:true})
 await api(root+'/play/session/start',gm.token,'POST',{revision:(await world()).revision})
 const collection=()=>({id:crypto.randomUUID(),sceneId:scene.id,sceneName:'PRIVATE-SCENE',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:heroes,history:[],entries:heroes.map((actorId,index)=>({actorId,actorName:'Герой '+index,revision:1,status:'submitted',submittedBy:players[index].user.id,submittedAt:new Date().toISOString(),note:'PRIVATE-ENTRY',actions:index?[{kind:'wait',seconds:1,note:''}]:['prepare','release'].map(stage=>({kind:'ability',abilityId:'ward',stage,target:{kind:'contact',id:'known-npc'},note:'PRIVATE-ACTION'})),resolved:index?[]:[{index:0,actorId:npc.id},{index:1,actorId:npc.id}]}))})
 const install=async()=>{const w=await world();w.campaign.declarations={version:1,active:collection(),archive:[]};await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w})}
 const input=notes=>({timings:heroes.map((actorId,index)=>({actorId,entryRevision:1,budgetMs:5000,costs:index?[]:[{index:0,personalMs:1000},{index:1,personalMs:1000}]})),continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[{key:'new:'+heroes[0]+':0',kind:'ability',binding:'unbound',charge:'',confirmed:true,input:fields},{key:'new:'+heroes[0]+':1',kind:'ability',binding:'unbound',charge:'prepare:new:'+heroes[0]+':0',confirmed:true,input:fields}],...(notes===undefined?{}:{resultNotes:notes})})
 const calc=async(notes,status=200)=>{const w=await world(),c=w.campaign.declarations.active;return api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:input(notes)},status)}
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=(body,status=200)=>api(root+'/rounds/apply',gm.token,'POST',body,status)
 const results=(index=0,query='',token=players[index].token)=>api(root+'/characters/'+heroes[index]+'/round-results'+query,token)
 const tableCommand=async(operation,fields={})=>{const t=(await results()).tablePlayback;return {operation,generation:t.generation,version:t.version,commandKey:'table:'+crypto.randomUUID(),...fields}}
 const tableApply=(command,status=200,token=gm.token)=>api(root+'/round-playback',token,'POST',command,status)
 await install();await f.restart()
 let preview,receipt,body
 await t.test('Предпросмотр приватен; некорректные адресаты и текст отвергаются',async()=>{
  assert.deepEqual((await results()).reports,[])
  for(const notes of [{unknown:'Секрет'},{[heroes[0]]:3},{[heroes[0]]:'x'.repeat(2001)}])await calc(notes,400)
  preview=await calc({[heroes[0]]:'Первоначальный итог',[heroes[1]]:'Итог второго героя'})
  assert.deepEqual((await results()).reports,[]);assert.equal(preview.summary.personal.actors.find(a=>a.actorId===heroes[0]).note,'Первоначальный итог')
  await api(root+'/characters/'+heroes[1]+'/round-results',players[0].token,'GET',undefined,403)
  await api(root+'/characters/'+heroes[0]+'/round-results',outsider.token,'GET',undefined,403)
  for(const query of ['?limit=0','?limit=21','?limit=NaN','?limit=1&limit=2'])await api(root+'/characters/'+heroes[0]+'/round-results'+query,players[0].token,'GET',undefined,400)
 })
 await t.test('Пояснения меняются без переброса; повтор команды не тратит ресурсы дважды',async()=>{
  await apply({...command(preview),resultNotes:{unknown:'Секрет'}},400)
  body={...command(preview),resultNotes:{[heroes[0]]:'  Вы видите свет щита.  ',[heroes[1]]:'PRIVATE-SECOND-NOTE'}}
  receipt=(await apply(body)).receipt;assert.deepEqual(receipt.summary.rules,preview.summary.rules)
  assert.equal((await apply(body)).duplicate,true);await apply({...body,resultNotes:{[heroes[0]]:'Изменено'}},409)
  assert.equal((await world()).characters.find(a=>a.id===heroes[0]).resources.mana.current,'17')
  const saved=await f.server.db.get('SELECT input_json FROM round_history_data WHERE receipt_id=?',[receipt.id]);assert.equal(JSON.parse(saved.input_json).resultNotes[heroes[0]],'Вы видите свет щита.')
  const own=await results(),second=await results(1),serialized=JSON.stringify(own)
  assert.equal(own.reports.length,1);assert.equal(own.reports[0].note,'Вы видите свет щита.');assert.equal(second.reports[0].note,'PRIVATE-SECOND-NOTE')
  assert.equal(own.reports[0].resources[0].after,'17');assert(own.reports[0].actions.every(a=>a.status==='completed'))
  for(const secret of [npc.id,'PRIVATE-NPC-NAME','PRIVATE-SCENE','PRIVATE-RULE','PRIVATE-ACTION','PRIVATE-SECOND-NOTE',heroes[1],preview.id,receipt.id,'rollGroups','targets','health'])assert(!serialized.includes(secret),secret)
  assert.notEqual(own.reports[0].id,second.reports[0].id)
 })
 await t.test('Просмотр содержит только известную герою сцену и события, не меняет мир и переживает перезапуск',async()=>{
  const own=(await results()).reports[0],second=(await results(1)).reports[0],url=root+'/characters/'+heroes[0]+'/round-results/'+own.id+'/playback',before=await world()
  const playback=await api(url,players[0].token),serialized=JSON.stringify(playback)
  assert.deepEqual(await api(url,gm.token),playback)
  assert.equal(playback.id,own.id);assert.equal(playback.coverage,'scene');assert.equal(playback.roundDurationMs,5000)
  assert(playback.before&&playback.after);assert(playback.events.some(e=>e.kind==='prepare'));assert(playback.events.some(e=>e.kind==='release'))
  assert(playback.visuals.some(v=>v.visual.spec.familyId==='light'));assert(playback.visuals.some(v=>v.visual.phase==='preparation'))
  for(const secret of [npc.id,heroes[1],preview.id,receipt.id,'PRIVATE-RULE','PRIVATE-ACTION','PRIVATE-SECOND-NOTE','PRIVATE-ENTRY','rollGroups','health'])assert(!serialized.includes(secret),secret)
  await api(url,players[1].token,'GET',undefined,403);await api(url,outsider.token,'GET',undefined,403)
  await api(root+'/characters/'+heroes[1]+'/round-results/'+own.id+'/playback',players[1].token,'GET',undefined,404)
  await api(root+'/characters/'+heroes[0]+'/round-results/'+second.id+'/playback',players[0].token,'GET',undefined,404)
  await api(root+'/characters/'+heroes[0]+'/round-results/'+receipt.id+'/playback',players[0].token,'GET',undefined,400)
  assert.deepEqual(await world(),before);await f.restart();assert.deepEqual(await api(url,players[0].token),playback)
 })
 await t.test('Общий просмотр: мастер запускает две личные сцены, Socket.IO не выдаёт закрытые данные',async()=>{
  const before=await world(),first=(await results()).reports[0],body=await tableCommand('start',{characterId:heroes[0],reportId:first.id})
  await tableApply(body,403,players[0].token);await tableApply(body,403,outsider.token)
  const sockets=players.map(player=>io(f.base,{auth:{token:player.token},transports:['websocket'],reconnection:false,forceNew:true}))
  try{
   await Promise.all(sockets.map(socket=>new Promise((resolve,reject)=>{socket.once('connect',()=>socket.emit('subscribeLobby',id,answer=>answer.ok?resolve():reject(Error(answer.message))));socket.once('connect_error',reject)})))
   const notifications=Promise.all(sockets.map(socket=>new Promise(resolve=>socket.once('lobbyChanged',resolve))))
   const ack=await tableApply(body);assert.equal(ack.version,body.version+1);assert.equal((await tableApply(body)).duplicate,true)
   const events=await notifications;for(const event of events)assert.deepEqual(event,{id})
   await tableApply({...body,reportId:'turn:'+'f'.repeat(24)},409)
   const a=(await results()).tablePlayback,b=(await results(1)).tablePlayback
   assert.equal(a.canControl,false);assert.equal((await results(0,'',gm.token)).tablePlayback.canControl,true)
   assert.deepEqual(a.session,b.session);assert.notEqual(a.report.id,b.report.id);assert.equal(a.report.id,first.id)
   for(const secret of [receipt.id,preview.id,heroes[1],npc.id,'PRIVATE-RULE','PRIVATE-ACTION','PRIVATE-SECOND-NOTE'])assert(!JSON.stringify(a).includes(secret),secret)
   assert.deepEqual(await world(),before)
  }finally{sockets.forEach(socket=>socket.disconnect())}
 })
 await t.test('Общий просмотр: пауза, перемотка, повтор, конфликт ведущих и перезапуск',async()=>{
  const before=await world(),pause=await tableCommand('change',{positionMs:2100,speed:2,playing:false})
  for(const patch of [{positionMs:-1},{positionMs:99999},{speed:3},{playing:'yes'},{extra:true}])await tableApply({...pause,...patch,commandKey:'table:'+crypto.randomUUID()},400)
  const ack=await tableApply(pause),saved=(await results()).tablePlayback.session
  assert.equal(saved.positionMs,2100);assert.equal(saved.playing,false);assert.equal(saved.speed,2)
  assert.equal((await tableApply(pause)).duplicate,true);await tableApply({...pause,speed:4},409)
  assert.deepEqual((await results(1)).tablePlayback.session,saved)
  await f.restart();assert.deepEqual((await results()).tablePlayback.session,saved)
  const a=await tableCommand('change',{positionMs:1000,speed:1,playing:false}),b={...a,commandKey:'table:'+crypto.randomUUID(),positionMs:3000}
  const race=await Promise.all([f.request(root+'/round-playback',gm.token,'POST',a),f.request(root+'/round-playback',gm.token,'POST',b)])
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await results()).tablePlayback.version,ack.version+1)
  await tableApply(pause,409)
  const stop=await tableCommand('stop');await tableApply(stop);assert.equal((await results()).tablePlayback.session,null);assert.equal((await tableApply(stop)).duplicate,true)
  assert.deepEqual(await world(),before)
 })
 await t.test('Общий просмотр: отзыв прав помощника закрывает его управление и прежний показ',async()=>{
  await api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:(await world()).revision,permissions:['rounds','scenes','viewSecrets']})
  const own=(await results()).reports[0],start=await tableCommand('start',{characterId:heroes[0],reportId:own.id})
  await tableApply(start,200,helper.token);assert((await results()).tablePlayback.session)
  await api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:(await world()).revision,permissions:['scenes','viewSecrets']})
  assert.equal((await results()).tablePlayback.session,null)
  await tableApply(await tableCommand('stop'),403,helper.token)
 })
 await t.test('Старая запись доступна как события; повреждение записи не подменяет текстовый итог',async()=>{
  const own=(await results()).reports[0],url=root+'/characters/'+heroes[0]+'/round-results/'+own.id+'/playback',row=await f.server.db.get('SELECT receipt_json FROM round_receipts WHERE id=?',[receipt.id]),saved=JSON.parse(row.receipt_json),legacy=structuredClone(saved)
  delete legacy.presentation
  try{
   const sparse=structuredClone(saved);sparse.summary.events=[null,...sparse.summary.events]
   await f.server.db.run('UPDATE round_receipts SET receipt_json=? WHERE id=?',[JSON.stringify(sparse),receipt.id])
   assert.equal((await api(url,players[0].token)).coverage,'scene')
   await f.server.db.run('UPDATE round_receipts SET receipt_json=? WHERE id=?',[JSON.stringify(legacy),receipt.id])
   const view=await api(url,players[0].token);assert.equal(view.coverage,'events');assert.equal(view.after,null);assert(view.events.length)
   saved.presentation.data='AAAA';await f.server.db.run('UPDATE round_receipts SET receipt_json=? WHERE id=?',[JSON.stringify(saved),receipt.id])
   await api(url,players[0].token,'GET',undefined,409);assert.equal((await results()).reports[0].note,own.note)
  }finally{await f.server.db.run('UPDATE round_receipts SET receipt_json=? WHERE id=?',[row.receipt_json,receipt.id])}
 })
 await f.restart()
 await t.test('Перезапуск и старые квитанции; без выдуманных изменений ресурсов',async()=>{
  assert.equal((await results()).reports[0].note,'Вы видите свет щита.')
  const row=await f.server.db.get('SELECT receipt_json FROM round_receipts WHERE id=?',[receipt.id]),legacy=JSON.parse(row.receipt_json);delete legacy.summary.personal
  await f.server.db.run('UPDATE round_receipts SET receipt_json=? WHERE id=?',[JSON.stringify(legacy),receipt.id])
  try{const own=(await results()).reports[0];assert.equal(own.coverage,'events');assert.deepEqual(own.resources,[]);assert.equal(own.note,'');assert.equal(own.actions.length,2)}
  finally{await f.server.db.run('UPDATE round_receipts SET receipt_json=? WHERE id=?',[row.receipt_json,receipt.id])}
 })
 await t.test('Пагинация, откат и точная переигровка сохраняют личные пояснения',async()=>{
  await tableApply(await tableCommand('start',{characterId:heroes[0],reportId:(await results()).reports[0].id}))
  await install();const second=await calc({[heroes[0]]:'Второй раунд'}),applied=(await apply(command(second))).receipt
  assert.equal((await results()).tablePlayback.session,null)
  await tableApply(await tableCommand('start',{characterId:heroes[0],reportId:(await results()).reports[0].id}))
  assert.equal((await results(0,'?limit=1')).hasMore,true);assert.equal((await results()).reports.length,2)
  const p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:applied.id,reason:'Проверка итогов'})
  const previousPublicId=(await results()).reports[0].id
  await api(root+'/rounds/change/apply',gm.token,'POST',command(p))
  assert.equal((await results()).tablePlayback.session,null)
  await api(root+'/characters/'+heroes[0]+'/round-results/'+previousPublicId+'/playback',players[0].token,'GET',undefined,404)
  assert.equal((await results()).reports.length,1);assert.equal((await results()).reports[0].note,'Вы видите свет щита.')
  const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:applied.id})
  assert.equal(replay.summary.personal.actors.find(a=>a.actorId===heroes[0]).note,'Второй раунд');await apply(command(replay))
  assert.equal((await results()).reports[0].note,'Второй раунд')
  const imported=(await results()).reports[0],recording=await api(root+'/characters/'+heroes[0]+'/round-results/'+imported.id+'/playback',players[0].token)
  assert.equal(recording.coverage,'scene');assert(recording.before&&recording.after)
 })
 await f.restart()
 await t.test('Полная копия переносит итоги; завершённая сессия оставляет их доступными',async()=>{
  const archive=await api(root+'/archive',gm.token),data=Buffer.from(archive.data,'base64'),unpacked=await unpackArchive(data)
  assert(unpacked.rounds.some(r=>r.receipt.summary.personal));validateArchive(unpacked)
  const bad=structuredClone(unpacked);bad.rounds[0].receipt.summary.personal.actors[0].actions[0].targetId='PRIVATE';assert.throws(()=>validateArchive(bad))
  const response=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+(await world()).revision,{method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:data}),p=await response.json()
  assert.equal(response.status,200,JSON.stringify(p));await api(root+'/archive/apply',gm.token,'POST',{...command(p),reason:'Восстановить личные итоги'})
  assert.equal((await results()).reports[0].note,'Второй раунд')
  const restored=(await results()).reports[0],restoredView=await api(root+'/characters/'+heroes[0]+'/round-results/'+restored.id+'/playback',players[0].token)
  assert.equal(restoredView.coverage,'scene');assert(restoredView.before&&restoredView.after)
  await api(root+'/play/session/finish',gm.token,'POST',{revision:(await world()).revision,title:'Проверка завершена',summary:'Герои увидели результаты.',keepPending:false,commandKey:crypto.randomUUID()})
  const own=await results();assert.equal(own.closed,true);assert.equal(own.reports[0].note,'Второй раунд')
 })
})
