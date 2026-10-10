import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture,lobbyBody,gate } from './fixtures.mjs'
import { createDefaultCharacter } from '../generated/characterModel.mjs'
import { portableCharacter } from '../generated/characterTransfer.mjs'
import { MAX_CAMPAIGN_BYTES } from '../generated/campaignLimits.mjs'
import { serializeLobbyBackup } from '../generated/lobbyBackup.mjs'

for(const dialect of ['sqlite','postgres'])test('Регрессии архитектурного аудита: '+dialect,async t=>{
 const {server,api,request,register}=await fixture(t,dialect)
 const owner=await register('owner'),admin=await register('admin'),player=await register('player')
 await api('/admin/users/'+admin.user.id,owner.token,'PATCH',{role:'ADMIN'})

 await t.test('A2: too-large attachment is rejected atomically; accepted world still publishes and exports',async()=>{
  const lobby=await api('/lobbies',owner.token,'POST',lobbyBody,201)
  await api('/lobbies/'+lobby.id+'/join',player.token,'POST')
  const hero={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Large valid hero'},at=new Date().toISOString()
  hero.journal=Array.from({length:200},(_,i)=>({id:'entry-'+i,title:'Test',text:'x'.repeat(8000),category:'world',certainty:'observation',source:'',gameTime:'',origin:'manual',annotation:'',createdAt:at,updatedAt:at}))
  await api('/characters/'+hero.id,player.token,'PUT',{character:hero,revision:-1})
  for(let i=0;i<4;i++)await api('/lobbies/'+lobby.id+'/characters',player.token,'POST',{characterId:hero.id},201)
  const before=await api('/lobbies/'+lobby.id+'/world',owner.token)
  const refusal=await request('/lobbies/'+lobby.id+'/characters',player.token,'POST',{characterId:hero.id})
  assert.equal(refusal.status,413);assert.match(refusal.data.message,/8 МиБ/)
  const after=await api('/lobbies/'+lobby.id+'/world',owner.token)
  assert.equal(after.revision,before.revision);assert.equal(after.characters.length,4);assert.equal(after.bindings.length,4)
  await api('/lobbies/'+lobby.id+'/world',owner.token,'PUT',{world:after,revision:after.revision})
  const text=JSON.stringify({format:'world6-campaign-backup',version:1,exportedAt:at,characters:after.characters.map(c=>({...portableCharacter(c),id:c.id})),campaign:after.campaign})
  assert(Buffer.byteLength(text)<10*1024*1024)
  const full=serializeLobbyBackup(after,after.bindings.map(b=>({characterId:b.character_id,ownerId:b.owner_id,approved:!!b.approved})),[{id:player.user.id,displayName:'player'}])
  assert(Buffer.byteLength(full)<10*1024*1024)
  const excessive={...after,characters:[...after.characters,{...hero,id:crypto.randomUUID()}]}
  assert(Buffer.byteLength(JSON.stringify(excessive))>MAX_CAMPAIGN_BYTES)
  await api('/lobbies/'+lobby.id+'/world',owner.token,'PUT',{world:excessive,revision:after.revision+1},413)
  assert.equal((await api('/lobbies/'+lobby.id+'/world',owner.token)).characters.length,4)
 })

 await t.test('A4: a new lobby restores ownership and player projection from its backup',async()=>{
  const source=await api('/lobbies',owner.token,'POST',{...lobbyBody,title:'Источник копии'},201)
  await api('/lobbies/'+source.id+'/join',player.token,'POST')
  const hero={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Герой игрока'}
  await api('/characters/'+hero.id,player.token,'PUT',{character:hero,revision:-1})
  await api('/lobbies/'+source.id+'/characters',player.token,'POST',{characterId:hero.id},201)
  const backup=await api('/lobbies/'+source.id+'/backup',owner.token)
  assert.equal(backup.bindings[0].ownerId,player.user.id);assert.equal(backup.bindings[0].approved,false)
  await api('/lobbies/'+source.id+'/backup',player.token,'GET',undefined,403)
  const target=await api('/lobbies',owner.token,'POST',{...lobbyBody,title:'Цель восстановления'},201)
  const restore={world:backup.world,bindings:backup.bindings,revision:0}
  await api('/lobbies/'+target.id+'/restore',owner.token,'POST',restore,409)
  assert.equal((await api('/lobbies/'+target.id+'/world',owner.token)).revision,0)
  await api('/lobbies/'+target.id+'/join',player.token,'POST')
  await api('/lobbies/'+target.id+'/restore',player.token,'POST',restore,403)
  await api('/lobbies/'+target.id+'/restore',owner.token,'POST',restore)
  const view=await api('/lobbies/'+target.id+'/world?view=player',player.token)
  assert.equal(view.characters[0].ownerId,player.user.id);assert(view.characters[0].resources)
  assert.equal(view.characters[0].approved,false)
  await api('/lobbies/'+target.id+'/restore',owner.token,'POST',restore,409)
  const bad={...restore,revision:1,bindings:[{...backup.bindings[0],characterId:'foreign-character'}]}
  await api('/lobbies/'+target.id+'/restore',owner.token,'POST',bad,400)
  const unchanged=await api('/lobbies/'+target.id+'/world',owner.token)
  assert.equal(unchanged.revision,1);assert.equal(unchanged.bindings[0].owner_id,player.user.id)
 })

 async function pauseNextTransaction(){
  const original=server.db.transaction,g=gate();let intercepted=false
  server.db.transaction=async fn=>{if(!intercepted){intercepted=true;g.reached();await g.wait}return original(fn)}
  return { ...g,restore:()=>{server.db.transaction=original} }
 }
 await t.test('A3: promotion wins over a queued stale administrator block',async()=>{
  const pause=await pauseNextTransaction()
  try{
   const blocking=request('/admin/users/'+player.user.id,admin.token,'PATCH',{disabled:true})
   await pause.waiting
   await api('/admin/users/'+player.user.id,owner.token,'PATCH',{role:'ADMIN'})
   pause.release();assert.equal((await blocking).status,403)
   const row=await server.db.get('SELECT role,disabled FROM users WHERE id=?',[player.user.id])
   assert.equal(row.role,'ADMIN');assert.equal(Number(row.disabled),0)
  }finally{pause.release();pause.restore()}
 })
 await t.test('A3: a demoted actor cannot use permissions cached by the middleware',async()=>{
  await api('/admin/users/'+player.user.id,owner.token,'PATCH',{role:'PLAYER'})
  const pause=await pauseNextTransaction()
  try{
   const blocking=request('/admin/users/'+player.user.id,admin.token,'PATCH',{disabled:true})
   await pause.waiting
   await api('/admin/users/'+admin.user.id,owner.token,'PATCH',{role:'PLAYER'})
   pause.release();assert.equal((await blocking).status,403)
   assert.equal(Number((await server.db.get('SELECT disabled FROM users WHERE id=?',[player.user.id])).disabled),0)
  }finally{pause.release();pause.restore()}
 })
 await t.test('A3: independent fields do not overwrite each other',async()=>{
  const results=await Promise.all([
   request('/admin/users/'+player.user.id,owner.token,'PATCH',{role:'ADMIN'}),
   request('/admin/users/'+player.user.id,owner.token,'PATCH',{disabled:true})])
  assert.deepEqual(results.map(r=>r.status),[200,200])
  const row=await server.db.get('SELECT role,disabled FROM users WHERE id=?',[player.user.id])
  assert.equal(row.role,'ADMIN');assert.equal(Number(row.disabled),1)
  await api('/admin/users/'+player.user.id,owner.token,'PATCH',{role:'PLAYER',disabled:false})
 })
 await t.test('A3: audit failure rolls back the account update',async()=>{
  const original=server.db.transaction,logger=console.error
  server.db.transaction=fn=>original(tx=>fn({...tx,run:async(sql,args)=>{if(sql.startsWith('INSERT INTO audit'))throw Error('Injected audit storage failure');return tx.run(sql,args)}}))
  console.error=()=>{}
  try{
   await api('/admin/users/'+player.user.id,owner.token,'PATCH',{disabled:true},500)
   assert.equal(Number((await server.db.get('SELECT disabled FROM users WHERE id=?',[player.user.id])).disabled),0)
  }finally{server.db.transaction=original;console.error=logger}
 })
})
