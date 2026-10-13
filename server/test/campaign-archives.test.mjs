import test from 'node:test'
import assert from 'node:assert/strict'
import {gzipSync,gunzipSync} from 'node:zlib'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
import {lobbyPermissions} from '../generated/lobbyAccess.mjs'
import {archiveHash,validateArchive,unpackArchive} from '../campaign-archive-format.mjs'
const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:10,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'ARCHIVE-SECRET-RULE'}
for(const dialect of ['sqlite','postgres'])test('Полная игровая копия · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('archive-gm'),player=await f.register('archive-player'),helper=await f.register('archive-helper')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 for(const u of [player,helper])await api(root+'/join',u.token,'POST')
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const source={...createDefaultCharacter(),id:'archive-source',name:'Герой копии'};await api('/characters/'+source.id,player.token,'PUT',{character:source,revision:-1})
 const heroId=(await api(root+'/characters',player.token,'POST',{characterId:source.id},201)).id,route=root+'/characters/'+heroId,world=()=>api(root+'/world',gm.token),history=()=>api(root+'/rounds/history',gm.token),hero=w=>w.characters.find(a=>a.id===heroId)
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world();initial.characters.push({...createDefaultCharacter(),id:'ARCHIVE-NPC',name:'ARCHIVE-SECRET-NPC'})
 Object.assign(hero(initial).body.parts.torso,{maximum:100,current:50});hero(initial).rpg.formulas=[];hero(initial).statistics.energyRegeneration='0';hero(initial).resources.mana={maximum:'50',current:'50'}
 hero(initial).rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'template',name:'Удар',approved:true,mechanism:'manual',cost:{mana:10,shadow:0,stamina:0},rangeM:10}]
 initial.campaign.scenes=createScene(emptyScenes(),'archive-scene','Сцена копии','side');initial.campaign.scenes.scenes[0].tokens=[{actorId:heroId,x:2,y:3,z:0,diameter:1,support:{kind:'ground'}}]
 const collection=()=>({id:crypto.randomUUID(),sceneId:'archive-scene',sceneName:'Сцена копии',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:[heroId],entries:[{actorId:heroId,actorName:'Герой копии',revision:1,status:'submitted',actions:[{kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''},{kind:'ability',abilityId:'spell',stage:'release',target:{kind:'self'},note:''}],resolved:[],submittedBy:player.user.id,submittedAt:new Date().toISOString(),note:''}],history:[]})
 initial.campaign.declarations={version:1,active:collection(),archive:[]};await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 const input=cost=>({timings:[{actorId:heroId,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:cost},{index:1,personalMs:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[{key:'new:'+heroId+':0',kind:'ability',binding:'unbound',charge:'',confirmed:true,input:fields},{key:'new:'+heroId+':1',kind:'ability',binding:'unbound',charge:'prepare:new:'+heroId+':0',confirmed:true,input:fields}]})
 const calc=async(cost=1000)=>{const w=await world(),c=w.campaign.declarations.active;return api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:input(cost)})}
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=(b,status=200)=>api(root+'/rounds/apply',gm.token,'POST',b,status)
 const grant=async permissions=>api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:(await world()).revision,permissions})
 async function upload(data,status=200,token=gm.token,revision=null){const r=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+(revision??(await world()).revision),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/gzip'},body:data});const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value}
 const restore=(b,status=200,token=gm.token)=>api(root+'/archive/apply',token,'POST',b,status)
 const restoreCommand=p=>({...command(p),reason:'Восстановить игровой сеанс'})
 const full=async()=>{const response=await api(root+'/archive',gm.token),data=Buffer.from(response.data,'base64');assert.equal(data.length,response.bytes);assert.equal(archiveHash(data),response.sha256);return {data,value:JSON.parse(gunzipSync(data))}}
 let saved,originalCommand,restoreBody,bindings,delegations,permissions,preview
 await t.test('Подготовка, очередь, раунд, точка и пауза входят в файл; права и секреты закрыты',async()=>{
  const p=await calc(8000);originalCommand=command(p);await apply(originalCommand)
  await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:(await world()).revision,name:'В процессе подготовки',commandKey:crypto.randomUUID()})
  await api(root+'/rounds/pause',gm.token,'POST',{revision:(await world()).revision,paused:true,reason:'Ночь друзей',commandKey:crypto.randomUUID()})
  saved=await full();assert.equal(saved.value.world.campaign.roundWork.entries.length,2);assert.equal(saved.value.rounds.length,1);assert.equal(saved.value.branch[0],saved.value.rounds[0].id);assert.equal(saved.value.checkpoints[0].name,'В процессе подготовки');assert(saved.value.session.paused)
  validateArchive(saved.value);assert(!JSON.stringify(saved.value).includes('password_hash'));assert.equal(saved.value.bindings,undefined);assert.equal(saved.value.permissions,undefined)
  await api(root+'/archive',player.token,'GET',undefined,403);await api(root+'/archive/recoveries',player.token,'GET',undefined,403);await upload(saved.data,403,player.token)
  await grant(['viewSecrets','rounds','rollback']);await api(root+'/archive',helper.token);await upload(saved.data,403,helper.token)
 })
 await t.test('Повреждённые, чужие по составу и несогласованные файлы отвергаются без записи',async()=>{
  const before=await world();await upload(Buffer.from('not gzip'),400)
  for(const mutate of [v=>{v.permissions=['OWNER']},v=>{v.branch=['missing']},v=>{v.rounds.push(v.rounds[0])},v=>{v.rounds[0].receipt.collectionId='other'},v=>{v.rounds[0].input.timings={}},v=>{v.checkpoints[0].replayId='missing'},v=>{v.world.characters=[]}]){
   const v=structuredClone(saved.value);mutate(v);await upload(gzipSync(JSON.stringify(v)),400)
  }
  const changed=structuredClone(saved.value);changed.world.characters.push({...createDefaultCharacter(),id:'new',name:'Новый'});await upload(gzipSync(JSON.stringify(changed)),409);assert.deepEqual(await world(),before)
 })
 await t.test('Предпросмотр не пишет мир; точка без новой ревизии и смена контроля инвалидируют его',async()=>{
  preview=await upload(saved.data);const before=await world();assert.deepEqual(await world(),before);assert.equal(preview.summary.checkpoints[0],'В процессе подготовки')
  await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:before.revision,name:'Добавлена после просмотра',commandKey:crypto.randomUUID()});await restore(restoreCommand(preview),409)
  preview=await upload(saved.data);await api(route+'/control',player.token,'POST',{delegated:true,revision:(await world()).revision});await restore(restoreCommand(preview),409)
  await api(route+'/knowledge',gm.token,'POST',{revision:(await world()).revision,title:'Поздняя заметка',text:'AFTER-ARCHIVE-NOTE'},201)
  preview=await upload(saved.data);assert(preview.summary.characters.find(c=>c.id===heroId).fields.includes('заметки и знания'));bindings=await f.server.db.all('SELECT * FROM character_bindings WHERE lobby_id=? ORDER BY character_id',[id]);delegations=await f.server.db.all('SELECT * FROM character_delegations WHERE lobby_id=?',[id]);permissions=await f.server.db.all('SELECT * FROM lobby_permissions WHERE lobby_id=?',[id])
 })
 await t.test('Квота защитных копий и отказ аудита откатывают весь импорт',async()=>{
  restoreBody=restoreCommand(preview);const before=await world(),db=f.server.db,original=db.transaction
  await db.run('UPDATE campaign_archive_previews SET before_base64=? WHERE id=?',['A'.repeat(64*1024*1024+1),preview.id]);await restore(restoreBody,409);await db.run('UPDATE campaign_archive_previews SET before_base64=? WHERE id=?',[ (await (async()=>{const current=await full();return current.data.toString('base64')})()),preview.id])
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('restore-complete-archive'))throw Error('TEST-ARCHIVE-AUDIT');return tx.run(sql,args)}}))
  try{await restore(restoreBody,500)}finally{db.transaction=original}
  assert.deepEqual(await world(),before);assert.equal((await history()).generation,preview.generation);assert.equal((await api(root+'/archive/recoveries',gm.token)).length,0);assert(await db.get('SELECT id FROM campaign_archive_previews WHERE id=?',[preview.id]))
 })
 await t.test('Восстановление и повтор после перезапуска сохраняют текущие права и раннюю ветку',async()=>{
  const before=await world(),result=await restore(restoreBody);assert.equal(result.duplicate,false);assert(result.receipt.revision>before.revision);assert(result.receipt.generation>preview.generation)
  const w=await world(),h=await history();assert.equal(w.campaign.seconds,5);assert.equal(hero(w).resources.mana.current,'40');assert.deepEqual(w.campaign.roundWork,saved.value.world.campaign.roundWork);assert.deepEqual(hero(w).rpg.casts,hero(saved.value.world).rpg.casts);assert(!JSON.stringify(w).includes('AFTER-ARCHIVE-NOTE'));assert.deepEqual(w.campaign.scenes,saved.value.world.campaign.scenes);assert(h.session.paused)
  assert.deepEqual(await f.server.db.all('SELECT * FROM character_bindings WHERE lobby_id=? ORDER BY character_id',[id]),bindings);assert.deepEqual(await f.server.db.all('SELECT * FROM character_delegations WHERE lobby_id=?',[id]),delegations);assert.deepEqual(await f.server.db.all('SELECT * FROM lobby_permissions WHERE lobby_id=?',[id]),permissions)
  assert.equal(h.rounds.length,1);assert.notEqual(h.rounds[0].id,saved.value.rounds[0].id);assert.equal(h.rounds[0].imported_author,'archive-gm');assert.equal(h.checkpoints.length,1);assert.equal((await api(root+'/declarations',gm.token)).executed,true)
  await apply(originalCommand,409);await f.restart();assert.equal((await restore(restoreBody)).duplicate,true);assert.deepEqual(await world(),w)
  const recovered=await api(root+'/archive/recoveries/'+result.receipt.id,gm.token),archive=await unpackArchive(Buffer.from(recovered.data,'base64'));assert.equal(archive.checkpoints.length,2);assert.deepEqual(archive.world.campaign,before.campaign)
  await api(root+'/rounds/pause',gm.token,'POST',{revision:w.revision,paused:false,reason:'Продолжаем',commandKey:crypto.randomUUID()});const c=(await world()).campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'reopen'},409)
 })
 await t.test('Прежние броски переживают экспорт, импорт и повторную переигровку',async()=>{
  let h=await history(),p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.latestId,reason:'Переигровка исходного раунда'});await api(root+'/rounds/change/apply',gm.token,'POST',command(p))
  const hit=await calc(1000);await apply(command(hit));h=await history();p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.latestId,reason:'Повторить попадание'});await api(root+'/rounds/change/apply',gm.token,'POST',command(p))
  h=await history();const oldPreview=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.replay.receiptId}),snapshot=await full();assert(snapshot.value.replayId);assert(oldPreview.summary.rules.find(r=>r.kind==='release').rolls.length>0)
  const imported=await upload(snapshot.data),body=restoreCommand(imported);await restore(body);h=await history();assert(h.replay);assert.notEqual(h.replay.receiptId,snapshot.value.replayId)
  const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.replay.receiptId});assert.deepEqual(replay.summary,oldPreview.summary)
  const b=command(replay);await apply(b);assert.equal((await apply(b)).duplicate,true);assert.equal(hero(await world()).resources.mana.current,'40')
  await restore(restoreBody,409);const current=await full();validateArchive(current.value);assert(current.value.rounds.every(r=>r.authorLabel==='archive-gm'))
 })
 await t.test('Свежие права, чужая комната и общие ключи команд проверяются также для импорта',async()=>{
  await grant([...lobbyPermissions]);const p=await upload(saved.data,200,helper.token);await grant(['viewSecrets']);await restore(restoreCommand(p),403,helper.token)
  const {id:other}=await api('/lobbies',gm.token,'POST',lobbyBody,201);await api('/lobbies/'+other+'/archive/apply',gm.token,'POST',restoreBody,409)
  const fresh=await upload(saved.data),body=restoreCommand(fresh);await restore(body)
  await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:(await world()).revision,name:'Конфликт',commandKey:body.commandKey},409)
  await f.restart();if(dialect==='postgres'){const rows=await f.server.db.all("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='world6' AND c.relname IN ('campaign_archive_previews','campaign_archive_receipts','campaign_archive_origins')");assert.equal(rows.length,3);assert(rows.every(r=>r.relrowsecurity))}
 })
})

test('Предел распаковки защищает от сжатого файла с чрезмерным содержимым',async()=>{
 const bomb=gzipSync(Buffer.alloc(128*1024*1024+1,32));await assert.rejects(unpackArchive(bomb),e=>e.status===400)
})
