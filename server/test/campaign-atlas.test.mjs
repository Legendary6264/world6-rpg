import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {newAtlasEntry,publicAtlas} from '../generated/campaignAtlas.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
for(const dialect of ['sqlite','postgres'])test('Города и организации · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('atlas-owner'),player=await f.register('atlas-player'),helper=await f.register('atlas-helper'),outside=await f.register('atlas-outside')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 for(const u of [player,helper])await api(root+'/join',u.token,'POST')
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const world=()=>api(root+'/world',gm.token),revision=async()=>(await world()).revision,key=()=> 'atlas:'+crypto.randomUUID()
 const grant=async permissions=>api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:await revision(),permissions})
 const npc={...createDefaultCharacter(),id:'npc-draft',name:'REAL-SECRET-NPC'},created=await api(root+'/npcs',gm.token,'POST',{revision:await revision(),character:npc,commandKey:'npc:'+crypto.randomUUID()}),npcId=created.id
 const initial=await world();initial.campaign.scenes=createScene(emptyScenes(),'SECRET-SCENE-ID','SECRET-SCENE-NAME','top');await api(root+'/world',gm.token,'PUT',{revision:initial.revision,world:initial})
 const city={...newAtlasEntry('city','atlas-city'),name:'Город',summary:'Город у реки',description:'Открытое описание',secret:'PRIVATE-CITY-NOTE',population:'около 3000',sceneIds:['SECRET-SCENE-ID'],npcLinks:[{actorId:npcId,role:'начальник стражи',publicName:'Страж ворот',visible:false}]}
 const hidden={...newAtlasEntry('city','HIDDEN-CITY-ID'),name:'HIDDEN-CITY-NAME',secret:'HIDDEN-CITY-NOTE'}
 const org={...newAtlasEntry('organization','atlas-org'),name:'Гильдия',summary:'Публичная гильдия',secret:'PRIVATE-ORG-NOTE',cityIds:['atlas-city','HIDDEN-CITY-ID'],npcLinks:[{actorId:npcId,role:'представитель',publicName:'Посланник',visible:false}]}
 const master=()=>api(root+'/atlas?view=master',gm.token),publicView=(token=player.token)=>api(root+'/atlas?view=public',token)
 const write=async(kind,entry,mode='create',token=gm.token,status=200,b=null)=>api(root+'/atlas/'+(kind==='city'?'cities':'organizations')+(mode==='edit'?'/'+entry.id:''),token,'POST',b??{revision:await revision(),entry,reason:'Карточка мастера',commandKey:key()},status)
 let cityCommand,beforeCards,copy,roundReceipt
 await t.test('Старый мир читается; посторонний и неполные права не открывают редактор',async()=>{
  assert.deepEqual((await publicView()).atlas,{cities:[],organizations:[]})
  await api(root+'/atlas',outside.token,'GET',undefined,403);await api(root+'/atlas?view=master',player.token,'GET',undefined,403)
  for(const permissions of [['economy'],['viewSecrets']]){await grant(permissions);await api(root+'/atlas?view=master',helper.token,'GET',undefined,403);await write('city',city,'create',helper.token,403)}
  await grant(['economy','viewSecrets']);assert((await api(root+'/atlas?view=master',helper.token)).options.npcs.some(n=>n.id===npcId))
 })
 await t.test('Отдельная запись сохраняет NPC, часы и сцены; по умолчанию карточки скрыты',async()=>{
  beforeCards=await world();cityCommand={revision:beforeCards.revision,entry:city,reason:'Создать город',commandKey:key()}
  await write('city',city,'create',helper.token,200,cityCommand);await write('city',hidden);await write('organization',org)
  const after=await world();assert.deepEqual(after.characters,beforeCards.characters);assert.deepEqual(after.campaign.scenes,beforeCards.campaign.scenes);assert.equal(after.campaign.seconds,beforeCards.campaign.seconds)
  assert.equal((await master()).atlas.cities.length,2);assert.deepEqual((await publicView()).atlas,{cities:[],organizations:[]});assert(!JSON.stringify(await api(root+'/world',player.token)).includes('PRIVATE-CITY-NOTE'))
 })
 await t.test('Раскрытие whitelist: тайные заметки, сцены, NPC ID и скрытые города не попадают игроку',async()=>{
  await write('city',{...city,visible:true,npcLinks:[{...city.npcLinks[0],visible:true}]},'edit')
  await write('organization',{...org,visible:true},'edit')
  const view=await publicView(),text=JSON.stringify(view);assert.equal(view.atlas.cities[0].npcLinks[0].publicName,'Страж ворот');assert.deepEqual(view.atlas.organizations[0].cities,[{id:city.id,name:city.name}]);assert.equal(view.options,undefined)
  for(const secret of ['PRIVATE-CITY-NOTE','PRIVATE-ORG-NOTE','HIDDEN-CITY','SECRET-SCENE',npcId,'REAL-SECRET-NPC','actorId','sceneIds','secret'])assert(!text.includes(secret),secret)
  assert.deepEqual((await api(root+'/atlas',player.token)).atlas,view.atlas)
  await write('city',{...city,visible:true,archived:true},'edit');assert.equal((await publicView()).atlas.cities.length,0);assert.deepEqual((await publicView()).atlas.organizations[0].cities,[])
  const stored=(await master()).atlas.cities.find(c=>c.id===city.id);assert.equal(stored.secret,city.secret);assert.equal(stored.npcLinks[0].actorId,npcId)
  await write('city',{...city,visible:true},'edit');copy=await api(root+'/backup',gm.token)
 })
 await t.test('Чужие/недоступные связи, поддельные поля и старые версии отклоняются',async()=>{
  const b={revision:await revision(),entry:{...city,id:'new-card'},reason:'Проверка',commandKey:key()},before=await world()
  const create=body=>write('city',body.entry,'create',gm.token,400,body)
  await create({...b,world:before});await create({...b,entry:{...b.entry,secretExtra:'leak'}});await create({...b,entry:{...b.entry,npcLinks:[{...city.npcLinks[0],visible:true,publicName:''}]}})
  await write('city',{...b.entry,npcLinks:[{...city.npcLinks[0],actorId:'foreign-npc'}]},'create',gm.token,409)
  await write('city',{...b.entry,sceneIds:['missing-scene']},'create',gm.token,400)
  await write('organization',{...org,id:'new-org',cityIds:['missing-city']},'create',gm.token,400)
  await write('city',b.entry,'create',gm.token,409,{...b,revision:b.revision-1});await write('city',b.entry,'edit',gm.token,409,b)
  await create({...b,commandKey:crypto.randomUUID()});assert.deepEqual(await world(),before)
 })
 await t.test('Повтор после перезапуска не создаёт двойника и проверяет свежие права/автора',async()=>{
  await f.restart();assert.equal((await write('city',city,'create',helper.token,200,cityCommand)).duplicate,true)
  assert.equal((await master()).atlas.cities.length,2)
  await write('city',city,'create',gm.token,409,cityCommand);await write('city',city,'create',helper.token,409,{...cityCommand,reason:'Другой запрос'})
  await grant(['economy']);await write('city',city,'create',helper.token,403,cityCommand);await grant(['economy','viewSecrets'])
 })
 await t.test('Отказ аудита и квота откатывают запись, подтверждение и ревизию атомарно',async()=>{
  const before=await world(),entry={...newAtlasEntry('city','audit-city'),name:'Audit city'},b={revision:before.revision,entry,reason:'Проверить транзакцию',commandKey:key()},db=f.server.db,original=db.transaction
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('create-city'))throw Error('TEST-ATLAS-AUDIT');return tx.run(sql,args)}}))
  try{await write('city',entry,'create',gm.token,500,b)}finally{db.transaction=original}
  assert.deepEqual(await world(),before);assert.equal(await db.get('SELECT command_key FROM campaign_atlas_commands WHERE lobby_id=? AND command_key=?',[id,b.commandKey]),undefined)
  const row=await db.get('SELECT payload_bytes FROM campaign_atlas_commands WHERE lobby_id=? AND command_key=?',[id,cityCommand.commandKey]);await db.run('UPDATE campaign_atlas_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[4*1024*1024,id,cityCommand.commandKey])
  try{await write('city',entry,'create',gm.token,409,b)}finally{await db.run('UPDATE campaign_atlas_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[row.payload_bytes,id,cityCommand.commandKey])}
  assert.deepEqual(await world(),before)
 })
 await t.test('Старый редактор не стирает справочник; удаление сцены очищает только её ссылки',async()=>{
  const w=await world(),old=structuredClone(w);delete old.campaign.atlas;await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:old},409)
  await api(root+'/scenes',gm.token,'PUT',{revision:await revision(),scenes:emptyScenes()});const result=await master();assert.deepEqual(result.atlas.cities.find(c=>c.id===city.id).sceneIds,[]);assert.equal(result.atlas.cities.find(c=>c.id===city.id).secret,city.secret)
  await api(root+'/restore',gm.token,'POST',{revision:await revision(),world:copy.world,bindings:copy.bindings});assert.deepEqual((await master()).atlas,copy.world.campaign.atlas)
 })
 await t.test('Раунд, откат, точка и полная копия сохраняют карточки вместе с состоянием мира',async()=>{
  await f.restart();const saved=(await master()).atlas
  const point=(await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:await revision(),name:'Справочник перед раундом',commandKey:crypto.randomUUID()})).checkpoint
  await api(root+'/declarations',gm.token,'POST',{revision:await revision(),sceneId:'SECRET-SCENE-ID',participantIds:[npcId],durationSeconds:5,allowReplace:true},201)
  const d=await api(root+'/characters/'+npcId+'/declarations',gm.token);await api(root+'/characters/'+npcId+'/declarations',gm.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:0,controlStamp:d.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]})
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:d.collection.id,epoch:d.collection.epoch,operation:'close'})
  const w=await world(),c=w.campaign.declarations.active,p=await api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:[{actorId:npcId,entryRevision:1,budgetMs:5000,costs:[]}],continuations:[],missingDecisions:[],interactionsConfirmed:false}})
  roundReceipt=(await api(root+'/rounds/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})).receipt;assert.deepEqual((await master()).atlas,saved)
  await write('city',{...city,visible:true,summary:'ПОСЛЕ РАУНДА'},'edit');const back=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:await revision(),receiptId:roundReceipt.id,reason:'Вернуть связанный снимок'})
  await api(root+'/rounds/change/apply',gm.token,'POST',{previewId:back.id,generation:back.generation,commandKey:crypto.randomUUID()});assert.deepEqual((await master()).atlas,saved)
  const full=await api(root+'/archive',gm.token),beforeCopy=(await master()).atlas
  await write('organization',{...org,visible:true,secret:'NEW-ORG-SECRET'},'edit')
  const response=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+await revision(),{method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:Buffer.from(full.data,'base64')}),restore=await response.json();assert.equal(response.status,200,JSON.stringify(restore))
  await api(root+'/archive/apply',gm.token,'POST',{previewId:restore.id,generation:restore.generation,commandKey:crypto.randomUUID(),reason:'Восстановить города и организации'});assert.deepEqual((await master()).atlas,beforeCopy);assert.deepEqual((await publicView()).atlas,publicAtlas(beforeCopy))
  const checkpoints=await api(root+'/rounds/history',gm.token),mapped=checkpoints.checkpoints.find(p=>p.name===point.name),cp=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:await revision(),checkpointId:mapped.id,reason:'Вернуть именованную точку'})
  await api(root+'/rounds/change/apply',gm.token,'POST',{previewId:cp.id,generation:cp.generation,commandKey:crypto.randomUUID()});assert.deepEqual((await master()).atlas,saved)
 })
 if(dialect==='postgres')await t.test('Приватная таблица команд недоступна публичной роли и переживает повтор миграции',async()=>{
  await f.restart();const row=await f.server.db.get("SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='world6' AND c.relname='campaign_atlas_commands'");assert(row.relrowsecurity)
  await f.server.db.run('CREATE ROLE atlas_guest NOLOGIN');await f.server.db.run('GRANT USAGE ON SCHEMA world6 TO atlas_guest');await assert.rejects(f.server.db.transaction(async tx=>{await tx.run('SET LOCAL ROLE atlas_guest');await tx.get('SELECT * FROM world6.campaign_atlas_commands')}),e=>e.code==='42501')
 })
})
