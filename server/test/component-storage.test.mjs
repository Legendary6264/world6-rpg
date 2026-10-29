import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {commitWorld} from '../world-coordinator.mjs'
import {replayComponentEvents,COMPONENT_JOURNAL_LIMIT} from '../component-storage.mjs'
import {restoreWorldEntities} from '../generated/worldEntities.mjs'

for(const dialect of ['sqlite','postgres'])test('Постоянные компоненты и миграция · '+dialect,async t=>{
 const f=await fixture(t,dialect),gm=await f.register('storage-gm'),player=await f.register('storage-player'),outsider=await f.register('storage-outsider')
 const {api}=f
 async function create(){return api('/lobbies/from-example',gm.token,'POST',{exampleId:'world6-3d-sandbox',version:1,title:'Перенос на копии',slots:4,commandKey:'starter:'+crypto.randomUUID()},201)}
 const {id}=await create(),root='/lobbies/'+id
 const lobby=()=>f.server.db.get('SELECT * FROM lobbies WHERE id=?',[id])
 const events=()=>f.server.db.all('SELECT * FROM world_component_events WHERE lobby_id=? ORDER BY revision',[id])
 const rows=()=>f.server.db.all('SELECT * FROM world_components WHERE lobby_id=? ORDER BY entity_id,component_name',[id])
 async function change(edit){const current=await lobby(),world=JSON.parse(current.world_json);edit(world);return f.server.db.transaction(tx=>commitWorld(tx,current,world))}
 await api('/lobbies/join',player.token,'POST',{code:(await api(root,gm.token)).inviteCode})

 await t.test('GET проверяет старое сохранение без переноса и записи',async()=>{
  const before=await lobby(),snapshot=await api(root+'/entities',gm.token),status=await api(root+'/entities/storage',gm.token)
  assert.equal(status.mode,'legacy');assert.equal(status.entityCount,snapshot.entities.length)
  assert.equal((await events()).length,0);assert.deepEqual(await lobby(),before)
 })
 await t.test('Перенос: только главный ГМ, с актуальной ревизией',async()=>{
  const before=await lobby()
  for(const token of [player.token,outsider.token]){
   await api(root+'/entities/storage',token,'GET',undefined,403)
   await api(root+'/entities/migrate',token,'POST',{revision:before.revision},403)
  }
  await api(root+'/entities/migrate','','POST',{revision:before.revision},401)
  await api(root+'/entities/migrate',gm.token,'POST',{revision:before.revision+1},409)
  assert.equal((await events()).length,0)
 })
 await t.test('Исходные байты и старые исторические таблицы остаются прежними; повтор идемпотентен',async()=>{
  // A real legacy save with its own whitespace and an extension component.
  const old=await lobby(),world=JSON.parse(old.world_json);world.characters[0].legacyNote={text:'данные старого редактора'}
  const original=JSON.stringify(world,null,2)
  await f.server.db.run('UPDATE lobbies SET world_json=? WHERE id=?',[original,id])
  const history=await f.server.db.all('SELECT * FROM round_history_data WHERE lobby_id=?',[id]),before=await lobby()
  const db=f.server.db,originalTransaction=db.transaction
  db.transaction=fn=>originalTransaction(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('migrate-world-components'))throw Error('TEST-MIGRATION-AUDIT');return tx.run(sql,args)}}))
  try{await api(root+'/entities/migrate',gm.token,'POST',{revision:before.revision},500)}finally{db.transaction=originalTransaction}
  assert.equal((await events()).length,0);assert.equal((await rows()).length,0)
  assert.equal((await db.get('SELECT * FROM world_component_heads WHERE lobby_id=?',[id])),undefined)
  assert.equal((await api(root+'/entities/migrate',gm.token,'POST',{revision:before.revision})).migrated,true)
  const baseline=await events(),saved=await rows()
  assert.equal(baseline.length,1);assert.equal(baseline[0].kind,'baseline')
  const p=typeof baseline[0].payload_json==='string'?JSON.parse(baseline[0].payload_json):baseline[0].payload_json
  assert.equal(p.sourceJson,original);assert(saved.some(r=>r.component_name==='extensions'))
  assert.deepEqual(await lobby(),before);assert.deepEqual(await f.server.db.all('SELECT * FROM round_history_data WHERE lobby_id=?',[id]),history)
  assert.equal((await api(root+'/entities/migrate',gm.token,'POST',{revision:before.revision})).migrated,false)
  assert.deepEqual(await events(),baseline);assert.deepEqual(await rows(),saved)
  assert.equal((await api(root+'/entities/storage',gm.token)).mode,'dual-write')
 })
 await t.test('Изменяется только нужный компонент; журнал восстанавливает прежнее и текущее состояние',async()=>{
  const previous=await api(root+'/entities',gm.token),before=await rows()
  await change(w=>{w.characters[0].resources.mana.current='9'})
  const after=await rows(),current=await api(root+'/entities',gm.token),journal=await events()
  const changed=after.filter((r,i)=>!assertSame(r,before[i]));assert.equal(changed.length,1);assert.equal(changed[0].component_name,'resources')
  assert.deepEqual(replayComponentEvents(journal.slice(0,1)),previous)
  assert.deepEqual(replayComponentEvents(journal),current)
  const p=decode(journal[1].payload_json);assert.equal(p.changes.length,1);assert.deepEqual(Object.keys(p.changes[0].components),['resources'])
 })
 await t.test('Создание, удаление, порядок и необязательные компоненты воспроизводятся без исполнения правил',async()=>{
  await change(w=>{
   const scene=w.campaign.scenes.scenes[0],object=structuredClone(scene.objects[0]);object.id='storage-new-object';scene.objects.unshift(object)
   w.characters[0].temporaryExtension='сохранить'
  })
  assert.deepEqual(replayComponentEvents(await events()),await api(root+'/entities',gm.token))
  await change(w=>{const s=w.campaign.scenes.scenes[0];s.objects=s.objects.filter(o=>o.id!=='storage-new-object');s.objects.reverse();delete w.characters[0].temporaryExtension;delete w.characters[0].legacyNote})
  assert.deepEqual(replayComponentEvents(await events()),await api(root+'/entities',gm.token))
  assert(!(await rows()).some(r=>r.component_name==='extensions'))
 })
 await t.test('Изменение только ревизии не ломает хранение; события допускают пропуск таких ревизий',async()=>{
  const headBefore=(await api(root+'/entities/storage',gm.token)).persistedRevision
  await f.server.db.run('UPDATE lobbies SET revision=revision+1 WHERE id=?',[id])
  const status=await api(root+'/entities/storage',gm.token)
  assert.equal(status.persistedRevision,headBefore);assert.equal(status.revision,headBefore+1)
  await change(w=>{w.campaign.scenes.scenes[0].name='После изменения управления'})
  const journal=await events(),p=decode(journal.at(-1).payload_json)
  assert.equal(p.fromRevision,headBefore);assert.equal(p.revision,headBefore+2)
  assert.deepEqual(replayComponentEvents(journal),await api(root+'/entities',gm.token))
 })
 await t.test('Ошибка после записи откатывает компоненты и журнал вместе с миром',async()=>{
  const db=f.server.db,before=await lobby(),saved=await rows(),journal=await events(),original=db.transaction
  const scenes=structuredClone(JSON.parse(before.world_json).campaign.scenes);scenes.scenes[0].name='Откатить всё'
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('publish-scenes'))throw Error('TEST-STORAGE-ROLLBACK');return tx.run(sql,args)}}))
  try{await api(root+'/scenes',gm.token,'PUT',{revision:before.revision,scenes},500)}finally{db.transaction=original}
  assert.deepEqual(await lobby(),before);assert.deepEqual(await rows(),saved);assert.deepEqual(await events(),journal)
 })
 await t.test('Сбой записи самого компонента откатывает уже записанные мир и событие',async()=>{
  const db=f.server.db,original=db.transaction,before=await lobby(),saved=await rows(),journal=await events()
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO world_components'))throw Error('TEST-COMPONENT-WRITE');return tx.run(sql,args)}}))
  try{await assert.rejects(change(w=>{w.characters[0].resources.mana.current='8'}),/TEST-COMPONENT-WRITE/)}finally{db.transaction=original}
  assert.deepEqual(await lobby(),before);assert.deepEqual(await rows(),saved);assert.deepEqual(await events(),journal)
 })
 await t.test('Записи журнала нельзя обновить или удалить, включая базовый снимок',async()=>{
  const before=await events()
  await assert.rejects(f.server.db.transaction(tx=>tx.run('UPDATE world_component_events SET created_at=? WHERE lobby_id=?',['changed',id])),/append-only/)
  await assert.rejects(f.server.db.transaction(tx=>tx.run('DELETE FROM world_component_events WHERE lobby_id=?',[id])),/append-only/)
  assert.deepEqual(await events(),before)
 })
 await t.test('Лимит журнала отклоняет всю команду, сохраняя историю',async()=>{
  const db=f.server.db,head=await db.get('SELECT * FROM world_component_heads WHERE lobby_id=?',[id]),before=await lobby(),journal=await events()
  await db.run('UPDATE world_component_heads SET journal_bytes=? WHERE lobby_id=?',[COMPONENT_JOURNAL_LIMIT,id])
  await assert.rejects(change(w=>{w.campaign.scenes.scenes[0].name='Переполнение'}),e=>e.status===409)
  assert.deepEqual(await lobby(),before);assert.deepEqual(await events(),journal)
  await db.run('UPDATE world_component_heads SET journal_bytes=? WHERE lobby_id=?',[head.journal_bytes,id])
 })
 await t.test('Несовпадение с legacy или повреждение компонентов блокирует запись без потери данных',async()=>{
  const db=f.server.db,before=await lobby(),journal=await events(),altered=JSON.parse(before.world_json);altered.campaign.scenes.scenes[0].name='Обход координатора'
  await db.run('UPDATE lobbies SET world_json=? WHERE id=?',[JSON.stringify(altered),id])
  await api(root+'/entities',gm.token,'GET',undefined,409)
  await assert.rejects(change(w=>{w.characters[0].resources.mana.current='7'}),e=>e.status===409)
  assert.equal((await lobby()).world_json,JSON.stringify(altered));assert.deepEqual(await events(),journal)
  await db.run('UPDATE lobbies SET world_json=? WHERE id=?',[before.world_json,id])
  const component=(await rows()).find(r=>r.component_name==='identity'),data=component.data_json
  await db.run('UPDATE world_components SET data_json=? WHERE lobby_id=? AND entity_id=? AND component_name=?',[JSON.stringify({id:'broken',name:'broken'}),id,component.entity_id,component.component_name])
  await api(root+'/entities',gm.token,'GET',undefined,409)
  await db.run('UPDATE world_components SET data_json=? WHERE lobby_id=? AND entity_id=? AND component_name=?',[typeof data==='string'?data:JSON.stringify(data),id,component.entity_id,component.component_name])
  const invalid=structuredClone(journal);invalid.at(-1).payload_json={...decode(invalid.at(-1).payload_json),version:99}
  assert.throws(()=>replayComponentEvents(invalid),e=>e.status===409)
  assert.throws(()=>replayComponentEvents(journal.slice(1)),e=>e.status===409)
 })
 await t.test('Новая кампания переносится лениво при первой команде; кампании изолированы',async()=>{
  const other=await create(),db=f.server.db,before=await events(),otherLobby=await db.get('SELECT * FROM lobbies WHERE id=?',[other.id]),w=JSON.parse(otherLobby.world_json)
  w.campaign.scenes.scenes[0].name='Независимая кампания'
  await db.transaction(tx=>commitWorld(tx,otherLobby,w))
  const journal=await db.all('SELECT * FROM world_component_events WHERE lobby_id=? ORDER BY revision',[other.id])
  assert.deepEqual(journal.map(e=>e.kind),['baseline','change']);assert.deepEqual(await events(),before)
  assert.equal(restoreWorldEntities(replayComponentEvents(journal)).campaign.scenes.scenes[0].name,'Независимая кампания')
  await db.run('DELETE FROM lobbies WHERE id=?',[other.id])
  assert.equal((await db.all('SELECT * FROM world_component_events WHERE lobby_id=?',[other.id])).length,0)
  assert.deepEqual(await events(),before)
 })
 await t.test('Защищённый архив сохраняет исходник, компоненты и журнал для восстановления на копии',async()=>{
  const before=await lobby(),journal=await events(),archive=await api(root+'/entities/archive',gm.token)
  assert.equal(archive.sourceJson,before.world_json);assert.equal(archive.lobbyId,id)
  assert.deepEqual({...replayComponentEvents(archive.journal),revision:archive.revision},archive.snapshot)
  assert.deepEqual(restoreWorldEntities(archive.snapshot),JSON.parse(before.world_json))
  for(const token of [player.token,outsider.token])await api(root+'/entities/archive',token,'GET',undefined,403)
  await api(root+'/entities/archive','','GET',undefined,401)
  assert.deepEqual(await events(),journal);assert.deepEqual(await lobby(),before)
 })
 await t.test('Перезапуск идемпотентен: снимок, исходный JSON и весь журнал остаются точными',async()=>{
  const saved=await rows(),journal=await events(),before=await lobby(),snapshot=await api(root+'/entities',gm.token)
  await f.restart()
  assert.deepEqual(await lobby(),before);assert.deepEqual(await events(),journal);assert.deepEqual(await rows(),saved)
  assert.deepEqual(await api(root+'/entities',gm.token),snapshot)
 })
 if(dialect==='postgres')await t.test('PostgreSQL хранит JSONB, таблицы закрыты RLS и составные FK индексированы',async()=>{
  const db=f.server.db,tables=['world_component_heads','world_entities','world_components','world_component_events']
  const info=await db.all("SELECT table_name,data_type FROM information_schema.columns WHERE table_schema='world6' AND column_name IN ('data_json','metadata_json','payload_json')")
  for(const table of ['world_component_heads','world_components','world_component_events'])assert(info.some(r=>r.table_name===table&&r.data_type==='jsonb'))
  const security=await db.all("SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='world6'")
  for(const table of tables)assert(security.some(r=>r.relname===table&&r.relrowsecurity))
  const grants=await db.all("SELECT table_name FROM information_schema.table_privileges WHERE table_schema='world6' AND grantee='PUBLIC'")
  assert(!grants.some(g=>tables.includes(g.table_name)))
  const indexes=await db.all("SELECT tablename,indexdef FROM pg_indexes WHERE schemaname='world6'")
  for(const table of tables)assert(indexes.some(r=>r.tablename===table&&r.indexdef.includes('(lobby_id')))
 })
})
function decode(v){return typeof v==='string'?JSON.parse(v):v}
function assertSame(a,b){try{assert.deepEqual(a,b);return true}catch{return false}}
