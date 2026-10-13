import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
const body=(patch={})=>({exampleId:'night-crossing',version:1,title:'Ночная история друзей',slots:4,commandKey:'starter:'+crypto.randomUUID(),...patch})
for(const dialect of ['sqlite','postgres'])test('Стартовое лобби · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('starter-gm'),player=await f.register('starter-player'),other=await f.register('starter-other')
 const blank=await api('/lobbies',gm.token,'POST',lobbyBody,201),blankBefore=await api('/lobbies/'+blank.id+'/world',gm.token)
 let initial=body(),receipt,root
 await t.test('Закрытые поля, известная версия и авторизация; отказ не создаёт мир',async()=>{
  await api('/lobbies/from-example','', 'POST',body(),401)
  for(const b of [body({version:2}),body({exampleId:'unknown'}),body({slots:0}),body({slots:4.5}),body({title:''}),body({commandKey:'wrong'}),{...body(),world:{characters:[]}},null])await api('/lobbies/from-example',gm.token,'POST',b,400)
  assert.equal((await api('/lobbies/mine',gm.token)).length,1)
 })
 await t.test('Одновременные повторы создают одно закрытое лобби и собственных NPC',async()=>{
  const results=await Promise.all([f.request('/lobbies/from-example',gm.token,'POST',initial),f.request('/lobbies/from-example',gm.token,'POST',initial)])
  assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(results[0].data.id,results[1].data.id);receipt=results[0].data;root='/lobbies/'+receipt.id
  const lobby=await api(root,gm.token),w=await api(root+'/world',gm.token),n=await api(root+'/npcs',gm.token)
  assert.equal(lobby.myRole,'GM');assert.equal(lobby.visibility,'private');assert.equal(lobby.energy,'mana');assert.equal(lobby.rank,'mortal');assert.equal(lobby.members.length,1)
  assert.equal(w.characters.length,3);assert.equal(w.campaign.scenes.scenes.length,3);assert.equal(w.campaign.seconds,0);assert.equal(n.npcs.length,3);assert(n.npcs.every(a=>a.approved&&a.controllerId===gm.user.id))
  assert.deepEqual(await api('/lobbies/'+blank.id+'/world',gm.token),blankBefore)
  assert(!(await api('/lobbies')).items.some(l=>l.id===receipt.id));await api(root+'/join',player.token,'POST',undefined,403)
  const rows=await f.server.db.all('SELECT * FROM character_bindings WHERE lobby_id=?',[receipt.id]);assert(rows.every(r=>r.owner_id===gm.user.id&&r.approved===1))
  const side=w.campaign.scenes.scenes.find(s=>s.view==='side');assert.equal(side.tokens[0].z,3);assert.equal(side.tokens[0].support.kind,'object')
 })
 await t.test('Потеря ответа и перезапуск: повтор не сбрасывает редактирование; другая команда конфликтует',async()=>{
  const w=await api(root+'/world',gm.token);w.campaign.scenes.scenes[0].name='Сцена мастера';w.campaign.logs[0].details+='\nLIVE-SECRET'
  await api(root+'/world',gm.token,'PUT',{revision:w.revision,world:w});const before=await api(root+'/world',gm.token)
  await f.restart();const r=await api('/lobbies/from-example',gm.token,'POST',initial);assert.equal(r.id,receipt.id);assert(r.duplicate);assert.deepEqual(await api(root+'/world',gm.token),before)
  await api('/lobbies/from-example',gm.token,'POST',{...initial,title:'Другой запрос'},409);assert.deepEqual(await api(root+'/world',gm.token),before)
  const another=await api('/lobbies/from-example',other.token,'POST',initial,201);assert.notEqual(another.id,receipt.id);const different=await api('/lobbies/'+another.id+'/world',other.token);assert(different.characters.every(a=>!before.characters.some(b=>a.id===b.id)));assert(!JSON.stringify(different).includes('LIVE-SECRET'))
 })
 await t.test('Приглашённый игрок получает открытый справочник и свой лист, без секретов и NPC',async()=>{
  await api('/lobbies/join',player.token,'POST',{code:(await api(root,gm.token)).inviteCode})
  const source={...createDefaultCharacter(),id:'starter-player-hero',name:'Герой игрока'};source.profile.rank='mortal'
  await api('/characters/'+source.id,player.token,'PUT',{character:source,revision:-1});const attached=await api(root+'/characters',player.token,'POST',{characterId:source.id},201)
  await api(root+'/characters/'+attached.id+'/review',gm.token,'POST',{revision:(await api(root+'/world',gm.token)).revision,decision:'approve',note:''})
  const projected=await api(root+'/world',player.token),json=JSON.stringify([projected,await api(root+'/atlas',player.token),await api(root+'/trade',player.token)])
  assert.equal(projected.characters.length,1);assert.equal(projected.characters[0].id,attached.id)
  for(const text of ['LIVE-SECRET','Заметка мастера','guide-notes','supply-rule','Стартовые цены'])assert(!json.includes(text))
  await api(root+'/npcs',player.token,'GET',undefined,403);await api(root+'/backup',player.token,'GET',undefined,403);await api(root+'/trade?view=master',player.token,'GET',undefined,403)
  const perception=await api(root+'/characters/'+attached.id+'/perception',player.token);assert.equal(perception.map,null)
  const backup=await api(root+'/backup',gm.token);assert.equal(backup.bindings.length,4);assert.equal(backup.world.campaign.items[0].modelLength,1.6)
  await api(root+'/restore',gm.token,'POST',{revision:(await api(root+'/world',gm.token)).revision,world:backup.world,bindings:backup.bindings});assert.equal((await api(root+'/npcs',gm.token)).npcs.length,3)
 })
 await t.test('Сбой аудита откатывает лобби, NPC, членство, управление и подтверждение',async()=>{
  const before=await api('/lobbies/mine',gm.token),b=body(),db=f.server.db,original=db.transaction
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('create-starter-lobby'))throw Error('TEST-STARTER-AUDIT');return tx.run(sql,args)}}))
  try{await api('/lobbies/from-example',gm.token,'POST',b,500)}finally{db.transaction=original}
  assert.deepEqual(await api('/lobbies/mine',gm.token),before);assert.equal(await db.get('SELECT command_key FROM campaign_trade_commands WHERE command_key=?',[b.commandKey]),undefined)
  const created=await api('/lobbies/from-example',gm.token,'POST',b,201);assert.equal((await api('/lobbies/'+created.id+'/npcs',gm.token)).npcs.length,3)
 })
 await t.test('Лимит активных лобби проверяется; старое подтверждение доступно при лимите',async()=>{
  const db=f.server.db,template=await db.get('SELECT * FROM lobbies WHERE id=?',[blank.id]),ids=[]
  const current=await db.get("SELECT COUNT(*) AS n FROM lobbies WHERE owner_id=? AND status<>'closed'",[gm.user.id])
  for(let i=Number(current.n);i<20;i++){const extra=crypto.randomUUID();ids.push(extra);await db.run('INSERT INTO lobbies(id,owner_id,title,description,genre,slots,energy,rank,visibility,invite_code,world_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[extra,gm.user.id,'Quota','Quota','Приключение',4,'any','mortal','private',crypto.randomUUID(),template.world_json,template.created_at,template.updated_at])}
  try{await api('/lobbies/from-example',gm.token,'POST',body(),409);assert((await api('/lobbies/from-example',gm.token,'POST',initial)).duplicate)}finally{for(const extra of ids)await db.run('DELETE FROM lobbies WHERE id=?',[extra])}
 })
 await t.test('Передача главного ГМ сохраняет пример; прежний создатель не может подтвердить или пересоздать его',async()=>{
  await api(root+'/transfer',gm.token,'POST',{userId:player.user.id});const before=await api(root+'/world',player.token)
  assert((await api(root+'/npcs',player.token)).npcs.every(n=>n.controllerId===player.user.id))
  await api('/lobbies/from-example',gm.token,'POST',initial,403);assert.deepEqual(await api(root+'/world',player.token),before)
  assert.equal((await api('/lobbies/mine',gm.token)).filter(l=>l.id===receipt.id).length,1)
 })
})
