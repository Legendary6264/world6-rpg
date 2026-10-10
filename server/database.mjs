import { readFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'
export async function openDatabase(config,Pool=pg.Pool){
 let sqlite,pool
 if(config.databaseUrl){
  pool=new Pool({connectionString:config.databaseUrl,max:8,connectionTimeoutMillis:10000})
  await pool.query(await readFile(new URL('./migrations/001-postgres.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('./migrations/002-community.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('./migrations/003-lobby-access.sql',import.meta.url),'utf8'))
  await pool.query('ALTER TABLE world6.lobby_permissions ENABLE ROW LEVEL SECURITY; ALTER TABLE world6.character_delegations ENABLE ROW LEVEL SECURITY; ALTER TABLE world6.character_control_events ENABLE ROW LEVEL SECURITY; REVOKE ALL ON world6.lobby_permissions, world6.character_delegations, world6.character_control_events FROM PUBLIC;')
  await pool.query('ALTER TABLE world6.world_entries ENABLE ROW LEVEL SECURITY; REVOKE ALL ON world6.world_entries FROM PUBLIC;')
 }else{await mkdir(dirname(config.sqlitePath),{recursive:true});sqlite=new DatabaseSync(config.sqlitePath);sqlite.function('lower',{deterministic:true},value=>typeof value==='string'?value.toLowerCase():value);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');sqlite.exec(await readFile(new URL('./migrations/001-sqlite.sql',import.meta.url),'utf8'));sqlite.exec(await readFile(new URL('./migrations/002-community.sql',import.meta.url),'utf8'));sqlite.exec(await readFile(new URL('./migrations/003-lobby-access.sql',import.meta.url),'utf8'))}
 let tail=Promise.resolve()
 const serial=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result}
 function facade(client){
  const query=async(sql,args=[])=>{
   if(sqlite){const statement=sqlite.prepare(sql);return {rows:statement.all(...args)}}
   let n=0;return client.query(sql.replace(/\?/g,()=>'$'+(++n)),args)
  }
  return {all:async(sql,args)=> (await query(sql,args)).rows,get:async(sql,args)=>(await query(sql,args)).rows[0],run:async(sql,args=[])=>{if(sqlite)return sqlite.prepare(sql).run(...args);let n=0;const r=await client.query(sql.replace(/\?/g,()=>'$'+(++n)),args);return {changes:r.rowCount}},lock:sqlite?'':' FOR UPDATE'}
 }
 const direct=facade(pool)
 const db={all:(s,a)=>serial(()=>direct.all(s,a)),get:(s,a)=>serial(()=>direct.get(s,a)),run:(s,a)=>serial(()=>direct.run(s,a)),transaction:fn=>serial(async()=>{const client=pool?await pool.connect():null,tx=facade(client);try{if(sqlite)sqlite.exec('BEGIN IMMEDIATE');else{await client.query('BEGIN');await client.query('SET LOCAL search_path=world6,pg_catalog')};const result=await fn(tx);if(sqlite)sqlite.exec('COMMIT');else await client.query('COMMIT');return result}catch(e){if(sqlite)sqlite.exec('ROLLBACK');else await client.query('ROLLBACK');throw e}finally{client?.release()}}),close:async()=>{await tail;if(pool)await pool.end();sqlite?.close()}}
 if(pool)pool.on('connect',client=>{void client.query('SET search_path=world6,pg_catalog')})
 // First pooled connection may already exist before the connect listener.
 if(pool)await pool.query('SET search_path=world6,pg_catalog')
 return db
}
