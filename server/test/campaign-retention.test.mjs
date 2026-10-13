import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes,sceneObject,copySceneState,isSceneState} from '../generated/scenes.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
import {lobbyPermissions} from '../generated/lobbyAccess.mjs'
import {unpackArchive,validateArchive} from '../campaign-archive-format.mjs'
import {gunzipSync} from 'node:zlib'
for(const dialect of ['sqlite','postgres'])test('Очистка и продолжение кампании · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('retention-gm'),player=await f.register('retention-player'),helper=await f.register('retention-helper')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id;for(const u of [player,helper])await api(root+'/join',u.token,'POST')
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const source={...createDefaultCharacter(),id:'retention-source',name:'Герой сохранения'};await api('/characters/'+source.id,player.token,'PUT',{character:source,revision:-1})
 const heroId=(await api(root+'/characters',player.token,'POST',{characterId:source.id},201)).id,heroRoute=root+'/characters/'+heroId,world=()=>api(root+'/world',gm.token),history=()=>api(root+'/rounds/history',gm.token),storage=()=>api(root+'/storage',gm.token)
 await api(heroRoute+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world();initial.campaign.scenes=createScene(emptyScenes(),'retention-scene','Сцена над землёй','side');const scene=initial.campaign.scenes.scenes[0]
 scene.objects.push({...sceneObject('platform','support',{x:2,y:3,z:3}),height:1,width:4,depth:4,canSupport:true});scene.tokens=[{actorId:heroId,x:2,y:3,z:4,diameter:1,support:{kind:'object',objectId:'support'}}]
 await api(root+'/world',gm.token,'PUT',{revision:initial.revision,world:initial})
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),applyRound=(b,status=200)=>api(root+'/rounds/apply',gm.token,'POST',b,status),applyCleanup=(b,status=200,token=gm.token)=>api(root+'/storage/apply',token,'POST',b,status)
 const defaultSelection={keepActiveRounds:1,keepChanges:0,keepArchivedCollections:20,checkpointIds:[],recoveryIds:[],removeInactive:true}
 async function calculate(overrides={},token=gm.token){const s=await storage();return api(root+'/storage/calculate',token,'POST',{revision:s.revision,storageStamp:s.storageStamp,selection:{...defaultSelection,...overrides}})}
 const cleanupCommand=p=>({...command(p),reason:'Освободить место перед продолжением'})
 const grant=async permissions=>api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:(await world()).revision,permissions})
 async function save(name){return api(root+'/rounds/checkpoints',gm.token,'POST',{revision:(await world()).revision,name,commandKey:crypto.randomUUID()})}
 async function play(){
  let w=await world(),c=w.campaign.declarations?.active;if(c)await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'archive'})
  w=await world();await api(root+'/declarations',gm.token,'POST',{revision:w.revision,sceneId:'retention-scene',durationSeconds:5,participantIds:[heroId],allowReplace:true},201)
  const personal=await api(heroRoute+'/declarations',player.token);await api(heroRoute+'/declarations',player.token,'PUT',{collectionId:personal.collection.id,epoch:personal.collection.epoch,baseVersion:0,controlStamp:personal.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]})
  c=(await world()).campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
  w=await world();c=w.campaign.declarations.active;const before=w,p=await api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:[{actorId:heroId,entryRevision:1,budgetMs:5000,costs:[]}],continuations:[],missingDecisions:[],interactionsConfirmed:false}}),body=command(p);return {before,body,receipt:(await applyRound(body)).receipt}
 }
 async function full(){const v=await api(root+'/archive',gm.token);return {data:Buffer.from(v.data,'base64'),value:JSON.parse(gunzipSync(Buffer.from(v.data,'base64')))}}
 async function importFull(snapshot){const response=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+(await world()).revision,{method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:snapshot.data}),p=await response.json();assert.equal(response.status,200,JSON.stringify(p));return api(root+'/archive/apply',gm.token,'POST',{...command(p),reason:'Проверить перенос сокращённой истории'})}
 let rounds,pointId,recoveryId,pauseBody,cleanupBody,originalCollection,beforeCleanup,pointAfterCompact,initialCopy
 await t.test('Просмотр приватен, узкий помощник не очищает; неверные параметры не пишут данные',async()=>{
  await api(root+'/storage',player.token,'GET',undefined,403);await grant(['viewSecrets']);await api(root+'/storage',helper.token)
  const s=await storage();await api(root+'/storage/calculate',helper.token,'POST',{revision:s.revision,storageStamp:s.storageStamp,selection:defaultSelection},403)
  for(const selection of [{...defaultSelection,keepActiveRounds:0},{...defaultSelection,keepArchivedCollections:21},{...defaultSelection,checkpointIds:['bad','bad']},{...defaultSelection,removeInactive:'yes'}])await api(root+'/storage/calculate',gm.token,'POST',{revision:s.revision,storageStamp:s.storageStamp,selection},400)
 })
 await t.test('Три раунда, точка ранней ветки и настоящая защитная копия',async()=>{
  const first=await play();originalCollection=first.before.campaign.declarations.active;await save('Сохранённое начало');await play();await play()
  pauseBody={revision:(await world()).revision,paused:true,reason:'Остановились ночью',commandKey:crypto.randomUUID()};await api(root+'/rounds/pause',gm.token,'POST',pauseBody)
  initialCopy=await full();assert.equal(initialCopy.value.version,2);assert.deepEqual(initialCopy.value.anchors,[])
  recoveryId=(await importFull(initialCopy)).receipt.id;const h=await history();rounds=h.rounds.toReversed();pointId=h.checkpoints[0].id
  assert.equal((await storage()).activeRounds,3);assert.equal((await storage()).meters.find(m=>m.name==='Защитные копии').count,1);await f.restart()
 })
 await t.test('Оставшаяся точка блокирует сокращение ранних раундов, пауза сохраняется после удаления её истории',async()=>{
  const before=await world(),p=await calculate();assert.equal(p.summary.compactedRounds,0);assert(p.summary.blocked.some(r=>r.reasons.some(x=>x.includes('Сохранённое начало'))));assert.equal(p.summary.retainedActiveRounds,3)
  assert.deepEqual(await world(),before);await applyCleanup(cleanupCommand(p));const after=await world();assert.deepEqual(after.campaign,before.campaign);assert.deepEqual(after.characters,before.characters);assert((await history()).session.paused);assert.equal((await storage()).meters.find(m=>m.name==='История раундов и изменений').count,3)
 })
 await t.test('Точка без изменения мира инвалидирует предпросмотр; квота и отказ аудита атомарны',async()=>{
  const stale=await calculate({checkpointIds:[pointId],keepArchivedCollections:0});const extra=(await save('Новое ограничение')).checkpoint
  await applyCleanup(cleanupCommand(stale),409)
  const p=await calculate({checkpointIds:[pointId,extra.id],keepArchivedCollections:0});cleanupBody=cleanupCommand(p);beforeCleanup=await world();const db=f.server.db,original=db.transaction
  const row=await db.get('SELECT * FROM campaign_retired_commands WHERE lobby_id=? LIMIT 1',[id]);await db.run('UPDATE campaign_retired_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[16*1024*1024,id,row.command_key]);await applyCleanup(cleanupBody,409);await db.run('UPDATE campaign_retired_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[row.payload_bytes,id,row.command_key]);assert.deepEqual(await world(),beforeCleanup)
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('cleanup-campaign-history'))throw Error('TEST-RETENTION-AUDIT');return tx.run(sql,args)}}))
  try{await applyCleanup(cleanupBody,500)}finally{db.transaction=original}
  assert.deepEqual(await world(),beforeCleanup);assert.deepEqual((await history()).rounds.map(r=>r.id),rounds.toReversed().map(r=>r.id));assert.equal((await history()).checkpoints.length,2);assert.equal((await storage()).compactedCollections,0)
 })
 await t.test('Сокращение освобождает снимки и архивы, сохраняя героев, Z, фазу, очередь, права и паузу',async()=>{
  const db=f.server.db,bindings=await db.all('SELECT * FROM character_bindings WHERE lobby_id=?',[id]),members=await db.all('SELECT * FROM members WHERE lobby_id=?',[id]);await applyCleanup(cleanupBody)
  const w=await world(),h=await history();assert.deepEqual(w.characters,beforeCleanup.characters);assert.deepEqual(w.campaign.scenes,beforeCleanup.campaign.scenes);assert.equal(w.campaign.seconds,beforeCleanup.campaign.seconds);assert.deepEqual(w.campaign.roundWork,beforeCleanup.campaign.roundWork);assert.deepEqual(w.campaign.declarations.active,beforeCleanup.campaign.declarations.active);assert.equal(w.campaign.declarations.archive.length,0);assert(h.session.paused)
  assert.equal((await storage()).compactedCollections,2);assert.deepEqual(h.rounds.map(r=>r.id),[rounds[2].id]);assert.equal(h.checkpoints.length,0)
  assert.deepEqual(await db.all('SELECT * FROM character_bindings WHERE lobby_id=?',[id]),bindings);assert.deepEqual(await db.all('SELECT * FROM members WHERE lobby_id=?',[id]),members)
  await f.restart();assert.equal((await applyCleanup(cleanupBody)).duplicate,true);assert.deepEqual(await world(),w)
  // Retry and key reuse of deleted history cannot repeat an action.
  await api(root+'/rounds/pause',gm.token,'POST',pauseBody,409)
  const retired=await f.server.db.get("SELECT command_key FROM campaign_retired_commands WHERE lobby_id=? AND kind='round' LIMIT 1",[id]);await applyRound({previewId:'obsolete',generation:h.generation,commandKey:retired.command_key},409)
 })
 await t.test('Исполненный сокращённый сбор нельзя открыть или применить; фиксированный раунд переживает очистку',async()=>{
  const stored=await world(),changed=structuredClone(stored);changed.campaign.declarations.active=originalCollection;await api(root+'/world',gm.token,'PUT',{revision:changed.revision,world:changed})
  let w=await world(),c=w.campaign.declarations.active;assert.equal((await api(root+'/declarations',gm.token)).executed,true)
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'reopen'},409)
  await api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{}},409)
  stored.revision=w.revision;await api(root+'/world',gm.token,'PUT',{revision:stored.revision,world:stored})
  await api(root+'/rounds/pause',gm.token,'POST',{revision:(await world()).revision,paused:false,reason:'Продолжили',commandKey:crypto.randomUUID()})
  w=await world();c=w.campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'archive'})
  await api(root+'/declarations',gm.token,'POST',{revision:(await world()).revision,sceneId:'retention-scene',durationSeconds:7,participantIds:[heroId],allowReplace:true},409)
  // A full editor and an older scene client cannot erase the fixed duration.
  w=await world();w.campaign.scenes.scenes[0].roundDurationSeconds=7;await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w},409)
  const scenes=await api(root+'/scenes',gm.token);delete scenes.scenes.scenes[0].roundDurationSeconds;await api(root+'/scenes',gm.token,'PUT',{revision:scenes.revision,scenes:scenes.scenes});assert.equal((await world()).campaign.scenes.scenes[0].roundDurationSeconds,5)
  const result=await play();assert.equal((await world()).campaign.seconds,stored.campaign.seconds+5);assert.equal((await storage()).activeRounds,2);assert.equal(result.receipt.generation,(await history()).generation);await f.restart()
 })
 await t.test('Точки и полная копия переносят признаки сокращённых исполнений, версия 1 остаётся читаемой',async()=>{
  pointAfterCompact=(await save('После сокращения')).checkpoint.id;const snapshot=await full();assert.equal(snapshot.value.anchors.length,2);assert.equal(snapshot.value.checkpoints[0].anchors.length,2);await unpackArchive(snapshot.data)
  const legacy=structuredClone(initialCopy.value);legacy.version=1;delete legacy.anchors;legacy.checkpoints.forEach(p=>delete p.anchors);assert.deepEqual(validateArchive(legacy).anchors,[])
  await importFull(snapshot);assert.equal((await storage()).compactedCollections,2);assert.equal((await history()).compactedCollections,2);assert.equal((await api(root+'/declarations',gm.token)).executed,true);await applyCleanup(cleanupBody,409)
  const h=await history(),p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:h.revision,checkpointId:h.checkpoints[0].id,reason:'Вернуться к точке сокращённой ветки'});await api(root+'/rounds/change/apply',gm.token,'POST',command(p));assert.equal((await storage()).compactedCollections,2)
  pointAfterCompact=(await history()).checkpoints[0].id
 })
 await t.test('Текущая переигровка защищает неактивный раунд; выбранная защитная копия удаляется отдельно',async()=>{
  let h=await history();const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.latestId,reason:'Переиграть последний'});await api(root+'/rounds/change/apply',gm.token,'POST',command(rollback));h=await history();assert(h.replay)
  const p=await calculate({checkpointIds:[pointAfterCompact],recoveryIds:[recoveryId]});assert(p.summary.blocked.some(r=>r.reasons.includes('Текущая переигровка с прежними бросками')));assert(!p.summary.rounds.some(r=>r.id===h.replay.receiptId));await applyCleanup(cleanupCommand(p));await api(root+'/archive/recoveries/'+recoveryId,gm.token,'GET',undefined,404)
  const replay=(await history()).replay;const fresh=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:replay.receiptId});const replayBody=command(fresh);await applyRound(replayBody);await play()
  const status=await storage(),oldCount=status.meters.find(m=>m.name==='История раундов и изменений').count,unused=await calculate();assert(unused.summary.rounds.some(r=>r.id===replay.receiptId));await applyCleanup(cleanupCommand(unused));assert((await storage()).meters.find(m=>m.name==='История раундов и изменений').count<oldCount);await applyRound(replayBody,409)
 })
 await t.test('Новый расчёт и отзыв прав инвалидируют очистку; два мастера не удаляют дважды',async()=>{
  const point=(await save('Для гонки')).checkpoint;const old=await calculate({checkpointIds:[point.id]});const h=await history();await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.latestId,reason:'Другой расчёт'});await applyCleanup(cleanupCommand(old),409)
  await grant([...lobbyPermissions]);const privatePreview=await calculate({checkpointIds:[point.id]},helper.token);await grant(['viewSecrets']);await applyCleanup(cleanupCommand(privatePreview),403,helper.token)
  await grant([...lobbyPermissions]);const a=await calculate({checkpointIds:[point.id]}),b=await calculate({checkpointIds:[point.id]},helper.token),results=await Promise.all([f.request(root+'/storage/apply',gm.token,'POST',cleanupCommand(a)),f.request(root+'/storage/apply',helper.token,'POST',cleanupCommand(b))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409])
  const fullArchive=await world(),active=fullArchive.campaign.declarations.active;fullArchive.campaign.declarations.archive=Array.from({length:20},()=>({...structuredClone(active),id:crypto.randomUUID(),history:[]}));await api(root+'/world',gm.token,'PUT',{revision:fullArchive.revision,world:fullArchive})
  const archiveTrim=await calculate({keepArchivedCollections:0});assert.equal(archiveTrim.summary.removedCollections.length,20);await applyCleanup(cleanupCommand(archiveTrim));assert.equal((await world()).campaign.declarations.archive.length,0);assert.equal((await world()).campaign.scenes.scenes[0].roundDurationSeconds,5)
  await f.restart();if(dialect==='postgres'){const rows=await f.server.db.all("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='world6' AND c.relname IN ('round_lineage_anchors','checkpoint_lineage_anchors','campaign_retired_commands','campaign_cleanup_previews','campaign_cleanup_receipts')");assert.equal(rows.length,5);assert(rows.every(r=>r.relrowsecurity))}
 })
})

test('Длительность сцены сохраняется при копировании; неверные значения не проходят импорт',()=>{
 const state=createScene(emptyScenes(),'clock-scene','Сцена','top');state.scenes[0].roundDurationSeconds=0.0001;assert.equal(copySceneState(state).scenes[0].roundDurationSeconds,0.0001)
 for(const value of [0,-1,Infinity,86401,'5']){const candidate=copySceneState(state);candidate.scenes[0].roundDurationSeconds=value;assert.equal(isSceneState(candidate),false)}
 delete state.scenes[0].roundDurationSeconds;assert(isSceneState(state));assert.equal(copySceneState(state).scenes[0].roundDurationSeconds,undefined)
})

for(const dialect of ['sqlite','postgres'])test('Долгая подготовка продолжается после удаления её раннего снимка · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('carry-retention'),{id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id,actorId='carry-hero',world=()=>api(root+'/world',gm.token)
 const w=await world(),actor={...createDefaultCharacter(),id:actorId,name:'Долгая подготовка'};actor.rpg.formulas=[];actor.statistics.energyRegeneration='0';actor.resources.mana={maximum:'50',current:'50'}
 actor.rpg.abilities=[{...emptyAbility(),id:'long-spell',templateId:'long-template',name:'Долгий заряд',approved:true,cost:{mana:10,shadow:0,stamina:0}}];w.characters=[actor];w.campaign.scenes=createScene(emptyScenes(),'carry-scene','Сцена','top')
 const collection=(entry=false)=>({id:crypto.randomUUID(),sceneId:'carry-scene',sceneName:'Сцена',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:[actorId],entries:entry?[{actorId,actorName:actor.name,revision:1,status:'submitted',actions:[{kind:'ability',abilityId:'long-spell',stage:'prepare',target:{kind:'none'},note:''}],resolved:[],submittedBy:gm.user.id,submittedAt:new Date().toISOString(),note:''}]:[],history:[]})
 w.campaign.declarations={version:1,active:collection(true),archive:[]};await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w})
 const input={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
 const cmd=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 async function execute(first=false){const state=await world(),c=state.campaign.declarations.active,work=state.campaign.roundWork?.entries??[],rules=(first?[{id:'new:'+actorId+':0'}]:work).map(e=>({key:e.id,kind:'ability',confirmed:true,binding:'unbound',charge:'',input}))
  const p=await api(root+'/rounds/calculate',gm.token,'POST',{revision:state.revision,collectionId:c.id,epoch:c.epoch,input:{timings:first?[{actorId,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:16000}]}]:[],continuations:first?[]:[{actorId,mode:'continue',budgetMs:5000}],missingDecisions:[],interactionsConfirmed:false,rules}});await api(root+'/rounds/apply',gm.token,'POST',cmd(p))}
 async function next(){const state=await world();state.campaign.declarations.archive.push(state.campaign.declarations.active);state.campaign.declarations.active=collection();await api(root+'/world',gm.token,'PUT',{revision:state.revision,world:state})}
 await execute(true);const original=(await api(root+'/rounds/history',gm.token)).latestId;await next();await execute();const before=await world();assert.equal(before.characters[0].rpg.casts[0].status,'preparing');assert.equal(before.characters[0].resources.mana.current,'40')
 const s=await api(root+'/storage',gm.token),p=await api(root+'/storage/calculate',gm.token,'POST',{revision:s.revision,storageStamp:s.storageStamp,selection:{keepActiveRounds:1,keepChanges:0,keepArchivedCollections:0,checkpointIds:[],recoveryIds:[],removeInactive:true}});assert(p.summary.rounds.some(r=>r.id===original));await api(root+'/storage/apply',gm.token,'POST',{...cmd(p),reason:'Сохранить текущую работу и удалить старый снимок'})
 const cleaned=await world();assert.deepEqual(cleaned.characters,before.characters);assert.deepEqual(cleaned.campaign.roundWork,before.campaign.roundWork);await f.restart();await next();await execute();await next();await execute()
 const after=await world();assert.equal(after.characters[0].resources.mana.current,'40');assert.equal(after.characters[0].rpg.casts[0].status,'ready');assert.equal(after.campaign.roundWork.entries.length,0)
})
