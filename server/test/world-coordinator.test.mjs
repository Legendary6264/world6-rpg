import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {commitWorld} from '../world-coordinator.mjs'
import {restoreWorldEntities} from '../generated/worldEntities.mjs'

for(const dialect of ['sqlite','postgres'])test('Координатор мира: версии, компоненты, откат и восстановление · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('entity-gm'),player=await f.register('entity-player'),stranger=await f.register('entity-stranger')
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'world6-3d-sandbox',version:1,title:'Проверка компонентов',slots:4,commandKey:'starter:'+crypto.randomUUID()},201),root='/lobbies/'+id
 await api('/lobbies/join',player.token,'POST',{code:(await api(root,gm.token)).inviteCode})
 await t.test('Полный снимок доступен мастеру; игрок, посторонний и аноним не получают компоненты',async()=>{
  const w=await api(root+'/world',gm.token),s=await api(root+'/entities',gm.token)
  assert.equal(s.version,1);assert.equal(s.revision,w.revision);const source=structuredClone(w);delete source.revision;delete source.bindings
  assert.deepEqual(restoreWorldEntities(s),source)
  await api(root+'/entities',player.token,'GET',undefined,403);await api(root+'/entities',stranger.token,'GET',undefined,403);await api(root+'/entities','','GET',undefined,401)
  const publicWorld=JSON.stringify(await api(root+'/world',player.token));assert(!publicWorld.includes('entity-gm'));assert(!publicWorld.includes('components'))
 })
 await t.test('Два изменения сцены на одной версии: только одно применяется, компоненты отражают победившее',async()=>{
  const w=await api(root+'/world',gm.token),a=structuredClone(w.campaign.scenes),b=structuredClone(a)
  a.scenes[0].objects[0].name='Первый вариант';b.scenes[0].objects[0].name='Второй вариант'
  const r=await Promise.all([f.request(root+'/scenes',gm.token,'PUT',{revision:w.revision,scenes:a}),f.request(root+'/scenes',gm.token,'PUT',{revision:w.revision,scenes:b})])
  assert.deepEqual(r.map(v=>v.status).sort(),[200,409]);const current=await api(root+'/world',gm.token),snapshot=await api(root+'/entities',gm.token)
  assert.equal(current.revision,w.revision+1);assert.equal(snapshot.revision,current.revision)
  assert.equal(restoreWorldEntities(snapshot).campaign.scenes.scenes[0].objects[0].name,current.campaign.scenes.scenes[0].objects[0].name)
 })
 await t.test('Координатор возвращает дельту; stale CAS и неверные версии не меняют БД',async()=>{
  const db=f.server.db,lobby=await db.get('SELECT * FROM lobbies WHERE id=?',[id]),next=JSON.parse(lobby.world_json)
  next.characters[0].resources.mana.current='9'
  const result=await db.transaction(tx=>commitWorld(tx,lobby,next));assert.equal(result.revision,lobby.revision+1)
  assert(result.delta.changes.some(e=>e.kind==='actor'&&e.components.includes('resources')))
  const committed=await api(root+'/world',gm.token)
  await assert.rejects(db.transaction(tx=>commitWorld(tx,lobby,next)),e=>e.status===409)
  await assert.rejects(db.transaction(async tx=>commitWorld(tx,await tx.get('SELECT * FROM lobbies WHERE id=?',[id]),next,{revision:committed.revision+2})),e=>e.status===409)
  assert.deepEqual(await api(root+'/world',gm.token),committed)
 })
 await t.test('Сбой после записи откатывает мир и компоненты',async()=>{
  const before=await api(root+'/world',gm.token),components=await api(root+'/entities',gm.token),db=f.server.db,original=db.transaction
  const next=structuredClone(before.campaign.scenes);next.scenes[0].name='Не должен сохраниться'
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('publish-scenes'))throw Error('TEST-ENTITY-AUDIT');return tx.run(sql,args)}}))
  try{await api(root+'/scenes',gm.token,'PUT',{revision:before.revision,scenes:next},500)}finally{db.transaction=original}
  assert.deepEqual(await api(root+'/world',gm.token),before);assert.deepEqual(await api(root+'/entities',gm.token),components)
 })
 await t.test('Переход к компонентам сохраняет точные байты записи и не переписывает историю',async()=>{
  const db=f.server.db,lobby=await db.get('SELECT * FROM lobbies WHERE id=?',[id]),candidate=JSON.parse(lobby.world_json)
  candidate.campaign.scenes.scenes[0].description='Проверка сохранения исходного формата'
  const json=JSON.stringify(candidate,null,2),input=structuredClone(candidate)
  await db.transaction(tx=>commitWorld(tx,lobby,json))
  assert.equal((await db.get('SELECT world_json FROM lobbies WHERE id=?',[id])).world_json,json)
  assert.deepEqual(candidate,input)
  const s=await api(root+'/entities',gm.token);assert.equal(s.revision,lobby.revision+1);assert.deepEqual(restoreWorldEntities(s),candidate)
 })
 await t.test('Перезапуск восстанавливает компоненты из актуального мира без изменения старых снимков',async()=>{
  const before=await api(root+'/entities',gm.token),raw=await f.server.db.get('SELECT world_json FROM lobbies WHERE id=?',[id])
  await f.restart();assert.deepEqual(await api(root+'/entities',gm.token),before)
  assert.equal((await f.server.db.get('SELECT world_json FROM lobbies WHERE id=?',[id])).world_json,raw.world_json)
 })
})
