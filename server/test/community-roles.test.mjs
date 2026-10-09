import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApplication } from '../app.mjs'
import { readConfig } from '../config.mjs'

for(const dialect of ['sqlite','postgres'])test('Роли сайта, редактор и управление лобби: '+dialect,async t=>{
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
 async function start(){const address=await server.listen();base='http://127.0.0.1:'+address.port}
 await start()
 t.after(async()=>{await server.close();await rm(directory,{recursive:true,force:true})})
 async function api(path,{token,method='GET',body,status=200,headers={}}={}){
  const response=await fetch(base+'/api'+path,{method,headers:{...headers,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined})
  const data=await response.json();assert.equal(response.status,status,path+': '+JSON.stringify(data));return data
 }
 async function register(email,name){return api('/auth/register',{method:'POST',status:201,body:{email,displayName:name,password:'Strong-password-2026',role:'OWNER'}})}
 const a=await register('owner@example.test','Мастер'),b=await register('player@example.test','Игрок'),c=await register('other@example.test','Наблюдатель')
 const lobbyBody={title:'Поход игроков',description:'Исследование общего мира',genre:'Приключение',slots:2,energy:'any',rank:'mortal',visibility:'public'}
 await t.test('Главный ГМ, помощники, передача роли и независимость от роли сайта',async()=>{
  const special=await api('/lobbies',{token:b.token,method:'POST',body:{...lobbyBody,title:'Передача кампании'},status:201})
  await api('/lobbies/'+special.id+'/join',{token:a.token,method:'POST'})
  await api('/lobbies/'+special.id+'/join',{token:c.token,method:'POST'})
  await api('/lobbies/'+special.id+'/members/'+a.user.id,{token:a.token,method:'PATCH',body:{role:'ASSISTANT'},status:403})
  await api('/lobbies/'+special.id+'/transfer',{token:c.token,method:'POST',body:{userId:a.user.id},status:403})
  await api('/lobbies/'+special.id+'/members/'+c.user.id,{token:b.token,method:'PATCH',body:{role:'ASSISTANT'}})
  assert.equal((await api('/lobbies/'+special.id,{token:c.token})).myRole,'ASSISTANT')
  const world=await api('/lobbies/'+special.id+'/world',{token:c.token})
  assert.equal(world.revision>=0,true);assert.equal(world.characters.length,0)
  await api('/lobbies/'+special.id+'/world',{token:c.token,method:'PUT',body:{world,revision:world.revision}})
  await api('/lobbies/'+special.id+'/invite/rotate',{token:c.token,method:'POST',status:403})
  await api('/lobbies/'+special.id+'/members/'+a.user.id,{token:c.token,method:'DELETE',status:403})
  await api('/lobbies/'+special.id,{token:c.token,method:'PATCH',body:{status:'closed'},status:403})
  const oldCode=(await api('/lobbies/'+special.id,{token:b.token})).inviteCode
  await api('/lobbies/'+special.id+'/transfer',{token:b.token,method:'POST',body:{userId:c.user.id}})
  const transferred=await api('/lobbies/'+special.id,{token:c.token})
  assert.equal(transferred.owner_id,c.user.id);assert.equal(transferred.myRole,'GM')
  assert.notEqual(transferred.inviteCode,oldCode)
  assert.equal(transferred.members.filter(m=>m.lobbyRole==='GM').length,1)
  assert.equal((await api('/lobbies/'+special.id,{token:b.token})).myRole,'ASSISTANT')
  assert.equal((await api('/me',{token:c.token})).role,'PLAYER')
  await api('/lobbies/'+special.id,{token:b.token,method:'PATCH',body:{status:'closed'},status:403})
  await api('/lobbies/'+special.id+'/transfer',{token:c.token,method:'POST',body:{userId:c.user.id},status:409})
  await api('/lobbies/'+special.id+'/transfer',{token:c.token,method:'POST',body:{userId:crypto.randomUUID()},status:404})
  await api('/lobbies/'+special.id+'/members/'+c.user.id,{token:c.token,method:'DELETE',status:409})
  await api('/lobbies/'+special.id+'/members/'+b.user.id,{token:c.token,method:'PATCH',body:{role:'PLAYER'}})
  const reduced=await api('/lobbies/'+special.id+'/world',{token:b.token})
  assert.equal(reduced.campaign.logs,undefined)
  await api('/lobbies/'+special.id+'/world',{token:b.token,method:'PUT',body:{world,revision:world.revision},status:403})
  await api('/lobbies/'+special.id,{token:c.token,method:'PATCH',body:{title:'Обновлённое лобби',description:'Новое описание',genre:'Тайна',visibility:'private',slots:1},status:409})
  await api('/lobbies/'+special.id,{token:c.token,method:'PATCH',body:{title:'Обновлённое лобби',description:'Новое описание',genre:'Тайна',visibility:'private',slots:2}})
  assert.equal((await api('/lobbies/'+special.id,{token:c.token})).title,'Обновлённое лобби')
  // Two concurrent transfers cannot produce two chiefs or a stale-authority write.
  const requests=[a.user.id,b.user.id].map(async userId=>{
   const response=await fetch(base+'/api/lobbies/'+special.id+'/transfer',{method:'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify({userId})});return response.status
  })
  assert.deepEqual((await Promise.all(requests)).sort(),[200,403])
  const after=await api('/lobbies/'+special.id,{token:a.token})
  assert.equal(after.members.filter(m=>m.lobbyRole==='GM').length,1)
 })
 await t.test('Редактор мира: собственные черновики, проверка публикации и защита версий',async()=>{
  await api('/admin/users/'+c.user.id,{token:a.token,method:'PATCH',body:{role:'WORLD_EDITOR'}})
  await api('/admin/users/'+b.user.id,{token:a.token,method:'PATCH',body:{role:'GM'},status:400})
  await api('/admin/users',{token:c.token,status:403})
  await api('/world-entries/manage',{token:b.token,status:403})
  await api('/world-entries',{token:b.token,method:'POST',body:{title:'Нельзя',category:'История',body:'Текст'},status:403})
  const entry=await api('/world-entries',{token:c.token,method:'POST',body:{title:'Место мира',category:'Места',body:'Описание'},status:201})
  assert.equal((await api('/world-entries')).items.length,0)
  await api('/world-entries/'+entry.id,{token:c.token,method:'PATCH',body:{revision:0,status:'published'},status:403})
  await api('/world-entries/'+entry.id,{token:c.token,method:'PATCH',body:{revision:0,body:'Исправленное описание'}})
  await api('/world-entries/'+entry.id,{token:a.token,method:'PATCH',body:{revision:0,status:'published'},status:409})
  await api('/world-entries/'+entry.id,{token:a.token,method:'PATCH',body:{revision:1,status:'published'}})
  assert.equal((await api('/world-entries')).items[0].body,'Исправленное описание')
  await api('/world-entries/'+entry.id,{token:c.token,method:'PATCH',body:{revision:2,body:'Замена канона'},status:403})
  await api('/world-entries/'+entry.id+'?revision=2',{token:c.token,method:'DELETE',status:403})
  const adminDraft=await api('/world-entries',{token:a.token,method:'POST',body:{title:'Чужой черновик',category:'История',body:'Текст'},status:201})
  assert(!(await api('/world-entries/manage',{token:c.token})).some(e=>e.id===adminDraft.id))
  await api('/world-entries/'+adminDraft.id,{token:c.token,method:'PATCH',body:{revision:0,body:'Нельзя'},status:403})
  await api('/world-entries/'+entry.id,{token:a.token,method:'PATCH',body:{revision:2,status:'draft'}})
  assert.equal((await api('/world-entries')).items.length,0)
  await api('/world-entries/'+entry.id+'?revision=2',{token:c.token,method:'DELETE',status:409})
  await api('/world-entries/'+entry.id+'?revision=3',{token:c.token,method:'DELETE'})
  await api('/admin/users/'+c.user.id,{token:a.token,method:'PATCH',body:{role:'PLAYER'}})
 })
})
