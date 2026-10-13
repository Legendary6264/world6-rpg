import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:10,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'NPC-PRIVATE-RULE'}
for(const dialect of ['sqlite','postgres'])test('NPC кампании · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('npc-owner'),player=await f.register('npc-player'),helper=await f.register('npc-helper')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id,world=()=>api(root+'/world',gm.token),revision=async()=>(await world()).revision
 for(const u of [player,helper])await api(root+'/join',u.token,'POST')
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const own={...createDefaultCharacter(),id:'npc-player-source',name:'PLAYER-HERO'};await api('/characters/'+own.id,player.token,'PUT',{character:own,revision:-1})
 const heroId=(await api(root+'/characters',player.token,'POST',{characterId:own.id},201)).id
 await api(root+'/characters/'+heroId+'/review',gm.token,'POST',{revision:await revision(),decision:'approve',note:''})
 const actor={...createDefaultCharacter(),id:'client-draft-id',name:'SECRET-NPC'};actor.profile.biography='NPC-SECRET-BIO';actor.rpg.formulas=[];actor.resources.mana={maximum:'50',current:'50'};actor.statistics.energyRegeneration='0';Object.assign(actor.body.parts.torso,{maximum:100,current:50})
 actor.rpg.abilities=[{...emptyAbility(),id:'npc-spell',templateId:'npc-template',name:'NPC-SPELL',approved:true,mechanism:'manual',rangeM:10,cost:{mana:10,shadow:0,stamina:0}}]
 const key=()=> 'npc:'+crypto.randomUUID(),grant=async permissions=>api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:await revision(),permissions})
 let npcId,creation,receipt,preview,input,backup
 const list=()=>api(root+'/npcs',gm.token),sheet=()=>api(root+'/npcs/'+npcId,gm.token)
 const editBody=async()=>({revision:await revision(),character:(await sheet()).actor,approved:true,reason:'Правка NPC мастером',commandKey:key()})
 const assign=async(userId,status=200,token=gm.token)=>api(root+'/npcs/'+npcId+'/assign',token,'POST',{revision:await revision(),userId,commandKey:key()},status)
 await t.test('NPC создаётся помощником в кампании; игрок и неполные права не получают секреты',async()=>{
  await api(root+'/npcs',player.token,'GET',undefined,403);await api(root+'/npcs',helper.token,'GET',undefined,403)
  await grant(['npcs']);await api(root+'/npcs',helper.token,'GET',undefined,403)
  await grant(['npcs','viewSecrets']);creation={revision:await revision(),character:actor,commandKey:key()}
  receipt=await api(root+'/npcs',helper.token,'POST',creation);npcId=receipt.id;assert.notEqual(npcId,actor.id)
  const n=(await list()).npcs[0];assert.equal(n.controllerId,gm.user.id);assert(n.approved)
  const b=await f.server.db.get('SELECT * FROM character_bindings WHERE lobby_id=? AND character_id=?',[id,npcId]);assert.equal(b.owner_id,gm.user.id)
  const publicWorld=await api(root+'/world',player.token);assert(!JSON.stringify(publicWorld).includes('SECRET-NPC'));assert(!JSON.stringify(publicWorld).includes('NPC-SECRET-BIO'))
  await api(root+'/npcs/'+npcId,player.token,'GET',undefined,403)
  const narrow=await api(root+'/npcs/'+npcId,helper.token);assert.equal(narrow.actor.id,npcId);assert.equal(narrow.characters,undefined);assert(!JSON.stringify(narrow).includes('PLAYER-HERO'))
 })
 await t.test('Повтор создания после перезапуска не создаёт двойника; ключ и актуальные права проверяются',async()=>{
  await f.restart();assert.equal((await api(root+'/npcs',helper.token,'POST',creation)).duplicate,true);assert.equal((await list()).npcs.length,1)
  await api(root+'/npcs',helper.token,'POST',{...creation,character:{...actor,name:'Другая команда'}},409)
  await api(root+'/npcs',gm.token,'POST',creation,409);await api(root+'/npcs',helper.token,'POST',{...creation,commandKey:crypto.randomUUID()},400)
  await grant(['viewSecrets']);await api(root+'/npcs',helper.token,'POST',creation,403);await grant(['npcs','viewSecrets'])
 })
 await t.test('Редактор меняет только NPC и допуск; игроки, часы и чужой лист остаются прежними',async()=>{
  const before=await world(),b=await editBody();b.character.name='SECRET-NPC-EDITED';b.approved=false
  const r=await api(root+'/npcs/'+npcId+'/edit',helper.token,'POST',b);assert.equal(r.reason,b.reason);assert.equal((await api(root+'/npcs/'+npcId+'/edit',helper.token,'POST',b)).duplicate,true)
  const after=await world();assert.deepEqual(after.characters.find(c=>c.id===heroId),before.characters.find(c=>c.id===heroId));assert.equal(after.campaign.seconds,before.campaign.seconds);assert.equal((await list()).npcs[0].approved,false)
  await api(root+'/npcs/'+heroId+'/edit',helper.token,'POST',{...b,revision:after.revision,character:after.characters.find(c=>c.id===heroId),commandKey:key()},404)
  await api(root+'/npcs/'+npcId+'/edit',helper.token,'POST',{...b,revision:after.revision,world:after,commandKey:key()},400)
  await api(root+'/npcs/'+npcId+'/edit',helper.token,'POST',{...b,revision:after.revision,character:{...b.character,id:heroId},commandKey:key()},400)
  await api(root+'/npcs/'+npcId+'/edit',helper.token,'POST',{...b,commandKey:key()},409)
  const restored=await editBody();await api(root+'/npcs/'+npcId+'/edit',helper.token,'POST',restored)
  await grant(['approveHeroes']);await api(root+'/characters/'+npcId+'/review',helper.token,'POST',{revision:await revision(),decision:'approve',note:''},409)
  const projection=await api(root+'/world',helper.token);assert(!JSON.stringify(projection).includes('SECRET-NPC'))
  await grant(['npcs','viewSecrets'])
 })
 await t.test('Отказ аудита и квота откатывают NPC, привязку, управление, команду и ревизию вместе',async()=>{
  const b={revision:await revision(),character:actor,commandKey:key()},before=await world(),db=f.server.db,original=db.transaction
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('create-npc'))throw Error('TEST-NPC-AUDIT');return tx.run(sql,args)}}))
  try{await api(root+'/npcs',gm.token,'POST',b,500)}finally{db.transaction=original}
  assert.deepEqual(await world(),before);assert.equal((await list()).npcs.length,1);assert.equal(await db.get('SELECT command_key FROM lobby_npc_commands WHERE lobby_id=? AND command_key=?',[id,b.commandKey]),undefined)
  const row=await db.get('SELECT payload_bytes FROM lobby_npc_commands WHERE lobby_id=? AND command_key=?',[id,creation.commandKey]);await db.run('UPDATE lobby_npc_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[4*1024*1024,id,creation.commandKey])
  try{await api(root+'/npcs',gm.token,'POST',b,409)}finally{await db.run('UPDATE lobby_npc_commands SET payload_bytes=? WHERE lobby_id=? AND command_key=?',[row.payload_bytes,id,creation.commandKey])}
  assert.deepEqual(await world(),before)
 })
 await t.test('Назначение и отзыв прав меняют управляющего; старые заявления получают конфликт управления',async()=>{
  const w=await world();Object.assign(w.characters.find(c=>c.id===heroId).body.parts.torso,{maximum:100,current:50})
  w.campaign.scenes=createScene(emptyScenes(),'npc-scene','NPC Scene','top');w.campaign.scenes.scenes[0].tokens=[{actorId:npcId,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}},{actorId:heroId,x:8,y:2,z:0,diameter:1,support:{kind:'ground'}}]
  await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w})
  await api(root+'/declarations',gm.token,'POST',{revision:await revision(),sceneId:'npc-scene',durationSeconds:5,participantIds:[npcId],allowReplace:true},201)
  const old=await api(root+'/characters/'+npcId+'/declarations',gm.token);assert(old.options.frame);assert(old.options.targets.some(t=>t.id===heroId))
  await assign(helper.user.id);await assign(player.user.id,403);await assign(gm.user.id,403,helper.token)
  await api(root+'/characters/'+npcId+'/declarations',gm.token,'PUT',{collectionId:old.collection.id,epoch:old.collection.epoch,baseVersion:0,controlStamp:old.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]},403)
  const assigned=await api(root+'/characters/'+npcId+'/declarations',helper.token);assert(assigned.canSubmit)
  await grant(['npcs']);assert.equal((await list()).npcs[0].controllerId,gm.user.id)
  await grant(['npcs','viewSecrets']);await assign(helper.user.id)
  await api(root+'/characters/'+npcId+'/declarations',helper.token,'PUT',{collectionId:assigned.collection.id,epoch:assigned.collection.epoch,baseVersion:0,controlStamp:assigned.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]},409)
 })
 await t.test('NPC заявляет движение, подготовку и выпуск без игрока; исполнитель сохраняет однократную оплату',async()=>{
  const d=await api(root+'/characters/'+npcId+'/declarations',helper.token),actions=[{kind:'move',route:[{x:3,y:2,z:0}],support:'ground',note:''},{kind:'ability',abilityId:'npc-spell',stage:'prepare',target:{kind:'none'},note:''},{kind:'ability',abilityId:'npc-spell',stage:'release',target:{kind:'contact',id:heroId},note:''}]
  await api(root+'/characters/'+npcId+'/declarations',helper.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:0,controlStamp:d.controlStamp,actions})
  await api(root+'/characters/'+npcId+'/declarations',player.token,'GET',undefined,403)
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:d.collection.id,epoch:d.collection.epoch,operation:'close'})
  const w=await world(),c=w.campaign.declarations.active
  input={timings:[{actorId:npcId,entryRevision:1,budgetMs:5000,costs:[0,1,2].map(index=>({index,personalMs:1000}))}],continuations:[],missingDecisions:[],interactionsConfirmed:false,movement:{confirmed:true,bodies:[{actorId:npcId,heightM:1.7},{actorId:heroId,heightM:1.7}]},rules:[{key:'new:'+npcId+':1',kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields},{key:'new:'+npcId+':2',kind:'ability',confirmed:true,binding:'unbound',charge:'prepare:new:'+npcId+':1',input:fields}]}
  preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input});assert.deepEqual(await world(),w)
  const b={previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()};await api(root+'/rounds/apply',gm.token,'POST',b);assert.equal((await api(root+'/rounds/apply',gm.token,'POST',b)).duplicate,true)
  const after=await world(),npc=after.characters.find(c=>c.id===npcId);assert.equal(npc.resources.mana.current,'40');assert.equal(after.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===npcId).x,3);assert(after.characters.find(c=>c.id===heroId).body.parts.torso.current<50)
  const edit=await editBody();edit.character.rpg.casts=[];await api(root+'/npcs/'+npcId+'/edit',gm.token,'POST',edit,409)
  backup=await api(root+'/backup',gm.token)
 })
 await t.test('Откат и полная копия не заменяют управляющего; старая игровая копия не снимает статус NPC',async()=>{
  const h=await api(root+'/rounds/history',gm.token),p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.latestId,reason:'Вернуть NPC до раунда'})
  await api(root+'/rounds/change/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()});assert.equal((await list()).npcs[0].controllerId,helper.user.id);assert.equal((await sheet()).actor.resources.mana.current,'50')
  await api(root+'/restore',gm.token,'POST',{revision:await revision(),world:backup.world,bindings:backup.bindings});assert.equal((await list()).npcs[0].controllerId,helper.user.id)
  const full=await api(root+'/archive',gm.token);assert(full.data)
  const response=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+await revision(),{method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:Buffer.from(full.data,'base64')}),restoration=await response.json();assert.equal(response.status,200,JSON.stringify(restoration))
  await api(root+'/archive/apply',gm.token,'POST',{previewId:restoration.id,generation:restoration.generation,commandKey:crypto.randomUUID(),reason:'Проверить NPC в полной копии'})
  assert.equal((await list()).npcs[0].controllerId,helper.user.id);assert.equal((await sheet()).actor.id,npcId)
  await f.restart();assert.equal((await list()).npcs[0].controllerId,helper.user.id)
 })
 await t.test('Передача главного ГМ и уход прежнего создателя сохраняют NPC в кампании',async()=>{
  await assign(gm.user.id);await api(root+'/transfer',gm.token,'POST',{userId:player.user.id})
  const newWorld=await api(root+'/world',player.token),n=(await api(root+'/npcs',player.token)).npcs[0];assert.equal(n.controllerId,player.user.id)
  const bindings=await f.server.db.all('SELECT * FROM character_bindings WHERE lobby_id=?',[id]);assert.equal(bindings.find(b=>b.character_id===npcId).owner_id,player.user.id);assert.equal(bindings.find(b=>b.character_id===heroId).owner_id,player.user.id)
  await api(root+'/restore',player.token,'POST',{revision:newWorld.revision,world:backup.world,bindings:backup.bindings},409)
  await api(root+'/members/'+helper.user.id,helper.token,'DELETE');assert((await api(root+'/npcs',player.token)).npcs.some(n=>n.id===npcId))
  await api(root+'/members/'+gm.user.id,gm.token,'DELETE');assert((await api(root+'/npcs',player.token)).npcs.some(n=>n.id===npcId))
  await api(root+'/npcs',gm.token,'GET',undefined,403)
 })
 if(dialect==='postgres')await t.test('Миграция повторяема; NPC и подтверждения команд закрыты для публичной роли',async()=>{
  const rows=await f.server.db.all("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='world6' AND c.relname IN ('lobby_npcs','lobby_npc_commands')");assert.equal(rows.length,2);assert(rows.every(r=>r.relrowsecurity))
  await f.server.db.run('CREATE ROLE npc_guest NOLOGIN');await f.server.db.run('GRANT USAGE ON SCHEMA world6 TO npc_guest')
  for(const table of ['lobby_npcs','lobby_npc_commands'])await assert.rejects(f.server.db.transaction(async tx=>{await tx.run('SET LOCAL ROLE npc_guest');await tx.get('SELECT * FROM world6.'+table)}),e=>e.code==='42501')
 })
})
