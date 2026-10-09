import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { io } from 'socket.io-client'
import { createApplication } from '../app.mjs'
import { readConfig } from '../config.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'

for(const dialect of ['sqlite','postgres'])test('Общая база, доступ и работа нескольких игроков: '+dialect,async t=>{
 const directory=await mkdtemp(join(tmpdir(),'world6-server-'))
 const config=readConfig({AUTH_MODE:'local',SQLITE_PATH:join(directory,'test.sqlite'),PORT:'0',OWNER_EMAIL:'owner@example.test'})
 // Actual PostgreSQL SQL engine; the adapter replaces only the network pool.
 const Pool=dialect==='postgres'?class{
  constructor(){this.database=new PGlite(join(directory,'postgres'));this.query=this.query.bind(this)}
  async query(sql,args=[]){if(sql.includes(';')){const results=await this.database.exec(sql);return results.map(r=>({...r,rowCount:r.affectedRows??0}))}const result=await this.database.query(sql,args);return {...result,rowCount:result.affectedRows??0}}
  async connect(){return {query:this.query,release(){}}}
  on(){}
  async end(){await this.database.close()}
 }:undefined
 if(Pool)config.databaseUrl='postgres-test'
 let server=await createApplication(config,{Pool}),base=''
 const sockets=[]
 async function start(){const address=await server.listen();base='http://127.0.0.1:'+address.port}
 await start()
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await server.close();await rm(directory,{recursive:true,force:true})})
 async function api(path,{token,method='GET',body,status=200,headers={}}={}){
  const response=await fetch(base+'/api'+path,{method,headers:{...headers,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined})
  const data=await response.json();assert.equal(response.status,status,path+': '+JSON.stringify(data));return data
 }
 async function register(email,name){return api('/auth/register',{method:'POST',status:201,body:{email,displayName:name,password:'Strong-password-2026',role:'OWNER'}})}
 const a=await register('owner@example.test','Мастер'),b=await register('player@example.test','Игрок'),c=await register('other@example.test','Наблюдатель')
 const lobbyBody={title:'Поход игроков',description:'Исследование общего мира',genre:'Приключение',slots:2,energy:'any',rank:'mortal',visibility:'public'}
 let topic,lobby,privateLobby,heroId,attachedId,ticket

 await t.test('Регистрация, пароли, запрет самоназначения роли и CORS',async()=>{
  assert.equal(a.user.role,'OWNER');assert.equal(b.user.role,'PLAYER')
  await api('/auth/login',{method:'POST',body:{email:'player@example.test',password:'incorrect'},status:401})
  await api('/auth/register',{method:'POST',body:{email:'player@example.test',displayName:'Повтор',password:'Strong-password-2026'},status:409})
  await api('/me',{status:401});await api('/me',{token:'invalid',status:401})
  await api('/health',{headers:{Origin:'https://untrusted.invalid'},status:403})
  assert.equal((await api('/me',{token:b.token})).displayName,'Игрок')
  assert.equal((await api('/config')).publishableKey,'')
 })
 await t.test('Тема и ответы общие; модерация проверяется сервером',async()=>{
  topic=await api('/forum/topics',{method:'POST',token:b.token,status:201,body:{title:'Обсуждение лора',body:'<script>window.bad=1</script>',category:'lore'}})
  await api('/forum/topics/'+topic.id+'/replies',{method:'POST',token:c.token,status:201,body:{body:'Ответ другого игрока'}})
  const visible=await api('/forum/topics/'+topic.id);assert.equal(visible.replies[0].author,'Наблюдатель');assert.equal(visible.topic.body,'<script>window.bad=1</script>')
  assert.equal((await api('/forum/topics?category=lore&q='+encodeURIComponent('Обсуждение'))).items[0].replies,1)
  await api('/forum/topics/'+topic.id,{method:'PATCH',token:b.token,body:{locked:true},status:403})
  await api('/forum/topics/'+topic.id,{method:'DELETE',token:c.token,status:403})
  await api('/forum/topics/'+topic.id,{method:'PATCH',token:a.token,body:{locked:true,pinned:true}})
  await api('/forum/topics/'+topic.id+'/replies',{method:'POST',token:c.token,status:409,body:{body:'Не разрешено'}})
 })
 await t.test('Поиск, приглашения и атомарный лимит мест',async()=>{
  lobby=await api('/lobbies',{method:'POST',token:a.token,body:lobbyBody,status:201})
  privateLobby=await api('/lobbies',{method:'POST',token:a.token,body:{...lobbyBody,title:'Закрытая кампания',visibility:'private',slots:1},status:201})
  assert.equal((await api('/lobbies')).items.length,1)
  assert.equal((await api('/lobbies?energy=shadow')).items.length,0)
  await api('/lobbies/'+privateLobby.id,{token:b.token,status:403})
  await api('/lobbies/'+privateLobby.id+'/join',{token:b.token,method:'POST',status:403})
  const invitation=(await api('/lobbies/'+privateLobby.id,{token:a.token})).inviteCode
  const rotated=await api('/lobbies/'+privateLobby.id+'/invite/rotate',{token:a.token,method:'POST'})
  await api('/lobbies/join',{token:b.token,method:'POST',body:{code:invitation},status:404})
  const results=await Promise.all([b,c].map(async u=>{const r=await fetch(base+'/api/lobbies/join',{method:'POST',headers:{Authorization:'Bearer '+u.token,'Content-Type':'application/json'},body:JSON.stringify({code:rotated.inviteCode})});return r.status}))
  assert.deepEqual(results.sort(),[200,409])
  await api('/lobbies/'+lobby.id+'/join',{method:'POST',token:b.token});await api('/lobbies/'+lobby.id+'/join',{method:'POST',token:b.token})
  assert.equal((await api('/lobbies/'+lobby.id,{token:b.token})).members.length,2)
  assert.equal((await api('/lobbies/'+lobby.id,{token:b.token})).inviteCode,undefined)
  await api('/lobbies/'+lobby.id,{method:'PATCH',token:b.token,body:{status:'closed'},status:403})
 })
 await t.test('Socket.IO сообщает игрокам об изменениях и защищает комнаты',async()=>{
  async function connect(token){const socket=io(base,{auth:{token},transports:['websocket'],forceNew:true,reconnection:false});sockets.push(socket);await once(socket,'connect');return socket}
  const player=await connect(b.token),outsider=await connect(c.token)
  assert.deepEqual(await player.emitWithAck('subscribeLobby',lobby.id),{ok:true})
  assert.equal((await outsider.emitWithAck('subscribeLobby',lobby.id)).ok,false)
  const event=once(player,'lobbyChanged')
  await api('/lobbies/'+lobby.id+'/messages',{method:'POST',token:a.token,status:201,body:{body:'Сообщение мастера'}})
  assert.equal((await event)[0].id,lobby.id)
  assert.equal((await api('/lobbies/'+lobby.id+'/messages',{token:b.token})).items[0].body,'Сообщение мастера')
  await api('/lobbies/'+lobby.id+'/messages',{token:c.token,status:403})
 })
 await t.test('Личные герои, проверка схемы и защита от перезаписи',async()=>{
  heroId=crypto.randomUUID();const hero={...createDefaultCharacter(),id:heroId,name:'Личный герой'}
  await api('/characters/'+heroId,{token:b.token,method:'PUT',body:{character:hero,revision:-1}})
  await api('/characters/'+heroId,{token:c.token,status:404})
  await api('/characters/'+heroId,{token:c.token,method:'PUT',body:{character:hero,revision:0},status:403})
  await api('/characters/'+heroId,{token:b.token,method:'PUT',body:{character:{...hero,name:'Обновлённый герой'},revision:0}})
  await api('/characters/'+heroId,{token:b.token,method:'PUT',body:{character:hero,revision:0},status:409})
  assert.equal((await api('/characters/'+heroId,{token:b.token})).character.name,'Обновлённый герой')
  await api('/characters/'+heroId,{token:b.token,method:'PUT',body:{character:{...hero,attributes:{strength:'bad'}},revision:1},status:400})
 })
 await t.test('Кампания хранит отдельную копию; игрок не получает внутреннюю анатомию',async()=>{
  attachedId=(await api('/lobbies/'+lobby.id+'/characters',{token:b.token,method:'POST',body:{characterId:heroId},status:201})).id
  assert.notEqual(attachedId,heroId)
  const full=await api('/lobbies/'+lobby.id+'/world',{token:a.token});assert.equal(full.characters[0].rpg.casts.length,0);assert(full.characters[0].body.anatomy)
  const player=await api('/lobbies/'+lobby.id+'/world',{token:b.token});assert.equal(player.characters[0].ownerId,b.user.id);assert.equal(player.characters[0].approved,false)
  for(const key of ['body','rpg','attributes','creation','statistics','journal'])assert.equal(player.characters[0][key],undefined)
  assert.equal(player.characters[0].resources.health,undefined)
  await api('/lobbies/'+lobby.id+'/world',{token:b.token,method:'PUT',body:{world:full,revision:full.revision},status:403})
  await api('/lobbies/'+lobby.id+'/characters/'+attachedId,{token:b.token,method:'PATCH',body:{approved:true},status:403})
  await api('/lobbies/'+lobby.id+'/characters/'+attachedId,{token:a.token,method:'PATCH',body:{approved:true}})
  full.revision=(await api('/lobbies/'+lobby.id+'/world',{token:a.token})).revision
  full.characters[0].name='Герой кампании'
  await api('/lobbies/'+lobby.id+'/world',{token:a.token,method:'PUT',body:{world:full,revision:full.revision}})
  await api('/lobbies/'+lobby.id+'/world',{token:a.token,method:'PUT',body:{world:full,revision:full.revision},status:409})
  assert.equal((await api('/lobbies/'+lobby.id+'/world',{token:b.token})).characters[0].name,'Герой кампании')
  assert.equal((await api('/characters/'+heroId,{token:b.token})).character.name,'Обновлённый герой')
 })
 await t.test('Поддержка приватна; новости публикует администратор',async()=>{
  ticket=await api('/support',{token:b.token,method:'POST',body:{title:'Личный вопрос',body:'Приватный текст'},status:201})
  await api('/support/'+ticket.id,{token:c.token,status:403});assert.equal((await api('/support',{token:c.token})).length,0)
  await api('/support/'+ticket.id+'/replies',{token:a.token,method:'POST',body:{body:'Ответ поддержки'},status:201})
  assert.equal((await api('/support/'+ticket.id,{token:b.token})).replies.length,1)
  await api('/publications/news',{token:b.token,method:'POST',body:{title:'Фальшивая новость',body:'Текст'},status:403})
  await api('/publications/news',{token:a.token,method:'POST',body:{title:'Новость мира',body:'Обновление'},status:201})
  assert.equal((await api('/publications/news')).items[0].title,'Новость мира')
  await api('/publications/stories',{token:c.token,method:'POST',body:{title:'Сюжет игрока',body:'Общая история'},status:201})
 })
 await t.test('Пагинация чата сохраняет сообщения с одинаковым временем',async()=>{
  const at=new Date().toISOString()
  await server.db.transaction(async tx=>{for(let n=0;n<55;n++)await tx.run('INSERT INTO messages(id,lobby_id,author_id,body,created_at) VALUES(?,?,?,?,?)',['same-'+String(n).padStart(3,'0'),lobby.id,a.user.id,'Реплика '+n,at])})
  const first=await api('/lobbies/'+lobby.id+'/messages',{token:b.token});assert.equal(first.hasMore,true);assert.equal(first.items.length,50)
  const cursor=first.items[0],second=await api('/lobbies/'+lobby.id+'/messages?before='+encodeURIComponent(cursor.created_at+'|'+cursor.id),{token:b.token})
  const unique=new Set([...first.items,...second.items].map(m=>m.id));assert.equal(unique.size,56)
 })
 await t.test('Исключённый игрок теряет API и подписку кампании',async()=>{
  const member=sockets[0];assert(member.rooms===undefined)
  const kicked=once(member,'membershipChanged')
  await api('/lobbies/'+lobby.id+'/members/'+b.user.id,{token:a.token,method:'DELETE'})
  await kicked;assert.equal((await member.emitWithAck('subscribeLobby',lobby.id)).ok,false)
  await api('/lobbies/'+lobby.id+'/world',{token:b.token,status:403})
  assert.equal((await api('/lobbies/'+lobby.id+'/world',{token:a.token})).characters.length,0)
  const peers=await server.io.in('lobby:'+lobby.id).fetchSockets();assert(!peers.some(s=>s.data.user.id===b.user.id))
 })
 await t.test('Владелец, роли, блокировка и отзыв сессии',async()=>{
  await api('/admin/users',{token:b.token,status:403})
  const roleEvent=once(sockets[0],'accountChanged')
  await api('/admin/users/'+b.user.id,{token:a.token,method:'PATCH',body:{role:'ADMIN'}})
  assert.equal((await roleEvent)[0].id,b.user.id);assert.equal(sockets[0].connected,true)
  await api('/admin/users/'+c.user.id,{token:b.token,method:'PATCH',body:{role:'OWNER'},status:403})
  await api('/admin/users/'+a.user.id,{token:b.token,method:'PATCH',body:{disabled:true},status:403})
  await api('/admin/users/'+c.user.id,{token:b.token,method:'PATCH',body:{disabled:true}})
  await api('/me',{token:c.token,status:403})
  const second=await api('/auth/login',{method:'POST',body:{email:'player@example.test',password:'Strong-password-2026'}})
  await api('/auth/logout',{token:second.token,method:'POST'});await api('/me',{token:second.token,status:401})
  assert((await api('/admin/audit',{token:a.token})).length>=3)
 })
 if(dialect==='postgres')await t.test('Приватная схема PostgreSQL не доступна публичной роли',async()=>{
  const row=await server.db.get("SELECT COUNT(*) AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='world6' AND c.relkind='r' AND c.relrowsecurity")
  assert.equal(Number(row.n),14)
  await server.db.run('CREATE ROLE world6_guest NOLOGIN')
  await assert.rejects(server.db.transaction(async tx=>{await tx.run('SET LOCAL ROLE world6_guest');await tx.get('SELECT * FROM world6.users')}),e=>e.code==='42501')
 })
 await t.test('Перезапуск сохраняет аккаунты, форум, лобби и поддержку',async()=>{
  sockets.forEach(s=>s.disconnect());await server.close();server=await createApplication(config,{Pool});await start()
  assert.equal((await api('/forum/topics/'+topic.id)).replies.length,1)
  assert.equal((await api('/lobbies/'+lobby.id,{token:a.token})).title,lobbyBody.title)
  assert.equal((await api('/support/'+ticket.id,{token:a.token})).ticket.body,'Приватный текст')
  assert.equal((await api('/me',{token:b.token})).role,'ADMIN')
 })
})

test('Production требует облачную авторизацию, PostgreSQL и точные origins',()=>{
 assert.throws(()=>readConfig({NODE_ENV:'production',AUTH_MODE:'local'}),/запрещена/)
 assert.throws(()=>readConfig({NODE_ENV:'production'}),/PostgreSQL/)
 assert.throws(()=>readConfig({CLIENT_ORIGINS:'*'}),/origins/)
 assert.throws(()=>readConfig({CLIENT_ORIGINS:'https://site.test/project'}),/origins/)
})
