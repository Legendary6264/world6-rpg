import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:10,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'HISTORY-SECRET-RULE'}
for(const dialect of ['sqlite','postgres'])test('Отмена, откат и прежние броски · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('history-owner'),player=await f.register('history-player'),helper=await f.register('history-helper')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id;for(const u of [player,helper])await api(root+'/join',u.token,'POST')
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const source={...createDefaultCharacter(),id:'history-source',name:'Hero'};await api('/characters/'+source.id,player.token,'PUT',{character:source,revision:-1})
 const heroId=(await api(root+'/characters',player.token,'POST',{characterId:source.id},201)).id,route=root+'/characters/'+heroId,world=()=>api(root+'/world',gm.token),hero=w=>w.characters.find(a=>a.id===heroId)
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world();initial.characters.push({...createDefaultCharacter(),id:'HISTORY-SECRET-NPC',name:'HISTORY-SECRET-NAME'})
 Object.assign(hero(initial).body.parts.torso,{maximum:100,current:50});hero(initial).rpg.formulas=[];hero(initial).statistics.energyRegeneration='0';hero(initial).resources.mana={maximum:'50',current:'50'}
 hero(initial).rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'template',name:'Удар',approved:true,mechanism:'manual',cost:{mana:10,shadow:0,stamina:0},rangeM:10,chargePolicy:{maxHoldSeconds:100,holdCost:{mana:0,shadow:0,stamina:0},requireConditions:false,refundPreparingPercent:50,refundReadyPercent:25}}]
 initial.campaign.scenes=createScene(emptyScenes(),'history-scene','Scene','top');initial.campaign.scenes.scenes[0].tokens=[{actorId:heroId,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}}]
 const actions=[{kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''},{kind:'ability',abilityId:'spell',stage:'release',target:{kind:'self'},note:''}]
 const collection=()=>({id:crypto.randomUUID(),sceneId:'history-scene',sceneName:'Scene',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:[heroId],entries:[{actorId:heroId,actorName:'Hero',revision:1,status:'submitted',actions,resolved:[],submittedBy:player.user.id,submittedAt:new Date().toISOString(),note:''}],history:[]})
 initial.campaign.declarations={version:1,active:collection(),archive:[]};await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 const input=cost=>({timings:[{actorId:heroId,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:cost},{index:1,personalMs:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[{key:'new:'+heroId+':0',kind:'ability',binding:'unbound',charge:'',confirmed:true,input:fields},{key:'new:'+heroId+':1',kind:'ability',binding:'unbound',charge:'prepare:new:'+heroId+':0',confirmed:true,input:fields}]})
 const calc=async(cost=1000)=>{const w=await world(),c=w.campaign.declarations.active;return api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:input(cost)})}
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=(b,status=200,token=gm.token)=>api(root+'/rounds/apply',token,'POST',b,status),change=(b,status=200,token=gm.token)=>api(root+'/rounds/change/apply',token,'POST',b,status)
 const rollback=async(token=gm.token)=>{const h=await api(root+'/rounds/history',gm.token);return api(root+'/rounds/rollback/calculate',token,'POST',{revision:h.revision,receiptId:h.latestId,reason:'Вернуть снимок до удара'})}
 const grant=async permissions=>api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:(await world()).revision,permissions})
 let beforeHit,originalPreview,originalCommand,originalReceipt,rollbackPreview,rollbackCommand,consentBefore,bindingsBefore
 await t.test('Отмена переносимой подготовки: обе проверки доступа, предпросмотр, атомарный возврат и повтор',async()=>{
  for(const token of [player.token,helper.token])await api(root+'/rounds/history',token,'GET',undefined,403)
  for(const operation of ['cancel','rollback','replay'])await api(root+'/rounds/'+operation+'/calculate',gm.token,'POST',[],400)
  await grant(['rounds']);await api(root+'/rounds/history',helper.token,'GET',undefined,403)
  const first=await calc(8000);await apply(command(first));const w=await world(),workId=w.campaign.roundWork.entries[0].id
  const b={revision:w.revision,workIds:[workId],actorIds:[],reason:'Остановить подготовку'},p=await api(root+'/rounds/cancel/calculate',gm.token,'POST',b);assert.deepEqual(await world(),w);assert.equal(p.summary.removedWork.length,2);assert.equal(p.summary.refunds[0].cost.mana,5)
  await api(root+'/rounds/cancel/calculate',player.token,'POST',b,403)
  const body=command(p),r=await change(body);assert.equal(r.duplicate,false);assert.equal(hero(await world()).resources.mana.current,'45');assert.equal((await world()).campaign.roundWork.entries.length,0);assert.equal((await change(body)).duplicate,true)
  await apply({...body,commandKey:body.commandKey},409)
 })
 await t.test('Данные исходного удара и броски сохраняются; последующие заметки входят в откат',async()=>{
  const w=await world();w.campaign.declarations.active=collection();await api(root+'/world',gm.token,'PUT',{world:w,revision:w.revision});beforeHit=await world();originalPreview=await calc();originalCommand=command(originalPreview);originalReceipt=(await apply(originalCommand)).receipt
  assert(hero(await world()).body.parts.torso.current<50);assert.equal(hero(await world()).resources.mana.current,'35')
  const data=await f.server.db.get('SELECT * FROM round_history_data WHERE receipt_id=?',[originalReceipt.id]);assert.deepEqual(JSON.parse(data.input_json),input(1000));assert(data.execution_seed);assert.equal(data.applied_revision,originalReceipt.revision)
  await api(route+'/knowledge',player.token,'POST',{revision:(await world()).revision,title:'После раунда',text:'HISTORY-LATE-PRIVATE-NOTE'},201)
  await api(route+'/control',player.token,'POST',{delegated:true,revision:(await world()).revision})
  bindingsBefore=await f.server.db.all('SELECT * FROM character_bindings WHERE lobby_id=? ORDER BY character_id',[id]);consentBefore=await f.server.db.all('SELECT * FROM character_delegations WHERE lobby_id=?',[id])
  assert(consentBefore.length>0);assert(!JSON.stringify(await api(root+'/world',player.token)).includes('HISTORY-SECRET-RULE'))
 })
 await t.test('Откат доступен отдельно: текущие полномочия и новый контроль отменяют старый предпросмотр',async()=>{
  await grant(['rounds','viewSecrets']);const w=await world();await api(root+'/rounds/rollback/calculate',helper.token,'POST',{revision:w.revision,receiptId:originalReceipt.id,reason:'X'},403)
  await grant(['rounds','viewSecrets','rollback']);const p=await rollback(helper.token),before=await world();assert.deepEqual(await world(),before);assert(p.summary.includesLaterChanges);assert(p.summary.characters.some(c=>c.fields.includes('заметки и знания')))
  await grant(['rounds','viewSecrets']);await change(command(p),403,helper.token)
  const stale=await rollback();await api(route+'/control',player.token,'POST',{delegated:false,revision:(await world()).revision});await change(command(stale),409)
  await api(route+'/control',player.token,'POST',{delegated:true,revision:(await world()).revision});consentBefore=await f.server.db.all('SELECT * FROM character_delegations WHERE lobby_id=?',[id])
 })
 await t.test('Изменённый состав листов не удаляется и не перепривязывается откатом',async()=>{
  const w=await world();w.characters.push({...createDefaultCharacter(),id:'new-npc',name:'New NPC'});await api(root+'/world',gm.token,'PUT',{world:w,revision:w.revision})
  const changed=await world(),h=await api(root+'/rounds/history',gm.token);await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.latestId,reason:'X'},409);assert.deepEqual(await world(),changed)
  changed.characters=changed.characters.filter(c=>c.id!=='new-npc');await api(root+'/world',gm.token,'PUT',{world:changed,revision:changed.revision});await api(route,gm.token,'PATCH',{approved:false,revision:(await world()).revision,note:'Проверить допуск'});bindingsBefore=await f.server.db.all('SELECT * FROM character_bindings WHERE lobby_id=? ORDER BY character_id',[id])
 })
 await t.test('Квота и отказ аудита откатывают также поколение, контекст переигровки и квитанцию',async()=>{
  rollbackPreview=await rollback();rollbackCommand=command(rollbackPreview);const before=await world(),db=f.server.db,original=db.transaction
  const size=await db.get('SELECT payload_bytes FROM round_receipts WHERE id=?',[originalReceipt.id]);await db.run('UPDATE round_receipts SET payload_bytes=? WHERE id=?',[64*1024*1024,originalReceipt.id]);await change(rollbackCommand,409);await db.run('UPDATE round_receipts SET payload_bytes=? WHERE id=?',[size.payload_bytes,originalReceipt.id]);assert.deepEqual(await world(),before)
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('rollback-round'))throw Error('TEST-HISTORY-AUDIT');return tx.run(sql,args)}}))
  try{await change(rollbackCommand,500)}finally{db.transaction=original}
  assert.deepEqual(await world(),before);assert.equal((await api(root+'/rounds/history',gm.token)).generation,1);assert(await db.get('SELECT id FROM round_change_previews WHERE id=?',[rollbackPreview.id]));assert.equal(await db.get('SELECT lobby_id FROM round_replay_contexts WHERE lobby_id=?',[id]),undefined)
 })
 await t.test('Откат и повтор после перезапуска сохраняют текущих владельцев, согласие и права',async()=>{
  const r=await change(rollbackCommand);assert.equal(r.receipt.generation,2);const restored=await world();assert.equal(restored.campaign.seconds,beforeHit.campaign.seconds);assert.equal(hero(restored).resources.mana.current,'45');assert.equal(hero(restored).body.parts.torso.current,50)
  assert.deepEqual(await f.server.db.all('SELECT * FROM character_bindings WHERE lobby_id=? ORDER BY character_id',[id]),bindingsBefore);assert.deepEqual(await f.server.db.all('SELECT * FROM character_delegations WHERE lobby_id=?',[id]),consentBefore)
  assert.notEqual(restored.campaign.declarations.active.id,beforeHit.campaign.declarations.active.id);assert(restored.campaign.declarations.active.epoch>beforeHit.campaign.declarations.active.epoch);assert(!JSON.stringify(restored).includes('HISTORY-LATE-PRIVATE-NOTE'))
  await apply(originalCommand,409);await f.restart();assert.equal((await change(rollbackCommand)).duplicate,true);assert.deepEqual(await world(),restored)
  await api(root+'/rounds/replay/calculate',player.token,'POST',{revision:restored.revision,receiptId:originalReceipt.id},403)
 })
 await t.test('Переигровка использует прежние решения и броски, новое применение не дублируется',async()=>{
  let h=await api(root+'/rounds/history',gm.token);assert.equal(h.replay.receiptId,originalReceipt.id);await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.replay.receiptId},409);await api(route,gm.token,'PATCH',{approved:true,revision:(await world()).revision});h=await api(root+'/rounds/history',gm.token)
  const before=await world(),p=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.replay.receiptId});assert.deepEqual(await world(),before)
  assert.deepEqual(p.summary.rules.find(r=>r.kind==='release').rolls,originalPreview.summary.rules.find(r=>r.kind==='release').rolls)
  const b=command(p);await apply(b);assert.equal((await apply(b)).duplicate,true);assert.equal(hero(await world()).resources.mana.current,'35');assert.equal((await api(root+'/rounds/history',gm.token)).replay,null)
 })
 await t.test('После правки восстановленного мира прежний контекст не переигрывает изменённые условия',async()=>{
  const p=await rollback();await change(command(p));await api(route+'/control',player.token,'POST',{delegated:false,revision:(await world()).revision})
  await api(route+'/knowledge',player.token,'POST',{revision:(await world()).revision,title:'Новое решение',text:'После отката'},201)
  const h=await api(root+'/rounds/history',gm.token);assert.equal(h.replay,null);await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:h.revision,receiptId:originalReceipt.id},409);await change(rollbackCommand,409)
 })
 await t.test('Старая квитанция без параметров откатывается без придуманных бросков; миграции приватны и повторяемы',async()=>{
  const p=await calc(),r=(await apply(command(p))).receipt;await f.server.db.run('DELETE FROM round_history_data WHERE receipt_id=?',[r.id]);await f.restart()
  const h=await api(root+'/rounds/history',gm.token);assert.equal(h.latestId,r.id);const preview=await rollback();assert.equal(preview.summary.canReplay,false);await change(command(preview));assert.equal((await api(root+'/rounds/history',gm.token)).replay,null)
  assert.equal((await f.server.db.all('SELECT * FROM character_delegations WHERE lobby_id=?',[id])).length,0)
  if(dialect==='postgres'){const rows=await f.server.db.all("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='world6' AND c.relname IN ('round_calculation_data','round_history_data','round_change_previews','round_change_receipts','round_replay_contexts')");assert.equal(rows.length,5);assert(rows.every(r=>r.relrowsecurity));assert(await f.server.db.get("SELECT indexname FROM pg_indexes WHERE schemaname='world6' AND indexname='round_history_order'"))}
 })
})
