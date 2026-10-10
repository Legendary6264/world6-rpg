import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once,EventEmitter } from 'node:events'
import { io } from 'socket.io-client'
import { fixture,lobbyBody } from './fixtures.mjs'
import { installSocketRecovery } from '../generated/socketRecovery.mjs'

test('A6: recovery verifies authorization, restores subscriptions, and stops for revoked sessions',async t=>{
 const callbacks=[],nativeInterval=global.setInterval
 global.setInterval=(callback,ms,...args)=>{if(ms===60000&&String(callback).includes('subscriptions=0'))callbacks.push(callback);return nativeInterval(callback,ms,...args)}
 t.after(()=>{global.setInterval=nativeInterval})
 const {server,base,api,register}=await fixture(t)
 const owner=await register('owner'),lobby=await api('/lobbies',owner.token,'POST',lobbyBody,201)
 const socket=io(base,{auth:{token:owner.token},reconnection:true,reconnectionDelay:10,reconnectionDelayMax:20})
 let checks=0,subscriptions=0,lastError
 const notices=new EventEmitter()
 const stop=installSocketRecovery(socket,async()=>{
  checks++;const r=await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+owner.token}})
  if(!r.ok)throw Object.assign(Error('Session check failed'),{status:r.status})
  return !(await r.json()).mfaRequired
 },error=>{lastError=error;notices.emit('recovery-error',error)},10)
 t.after(()=>{stop();socket.disconnect()})
 const initialSubscription=once(notices,'subscribed',{signal:AbortSignal.timeout(3000)})
 socket.on('connect',()=>socket.emit('subscribeLobby',lobby.id,ack=>{if(ack.ok){subscriptions++;notices.emit('subscribed')}}))
 await once(socket,'connect',{signal:AbortSignal.timeout(3000)})
 await initialSubscription
 const get=server.db.get
 server.db.get=async(sql,args)=>{if(sql.includes('FROM sessions s'))throw Error('Temporary database outage');return get(sql,args)}
 const disconnected=once(socket,'disconnect',{signal:AbortSignal.timeout(3000)})
 const unavailable=once(notices,'recovery-error',{signal:AbortSignal.timeout(3000)})
 await callbacks.at(-1)();assert.equal((await disconnected)[0],'io server disconnect')
 // First HTTP recovery check also sees an outage, proving retry instead of only one probe.
 assert((await unavailable)[0].status>=500)
 const reconnected=once(socket,'connect',{signal:AbortSignal.timeout(3000)}),resubscribed=once(notices,'subscribed',{signal:AbortSignal.timeout(3000)})
 server.db.get=get
 await reconnected;await resubscribed
 assert(checks>=2);assert.equal(subscriptions,2)
 const event=once(socket,'lobbyChanged',{signal:AbortSignal.timeout(3000)})
 await api('/lobbies/'+lobby.id+'/messages',owner.token,'POST',{body:'После восстановления'},201)
 assert.equal((await event)[0].id,lobby.id)

 await api('/auth/logout',owner.token,'POST')
 const revoked=once(socket,'disconnect',{signal:AbortSignal.timeout(3000)})
 const invalid=once(notices,'recovery-error',{signal:AbortSignal.timeout(3000)})
 await callbacks.at(-1)();await revoked
 await invalid
 assert.equal(socket.connected,false);assert.equal(socket.active,false);assert.equal(lastError.status,401)
 const afterRevocation=checks;await new Promise(r=>setTimeout(r,50));assert.equal(checks,afterRevocation)
})

test('A6: cleanup ignores a late successful HTTP check after leaving the account',async()=>{
 const handlers=new Map();let resolve,attempts=0
 const socket={connected:false,on:(name,fn)=>handlers.set(name,fn),off:name=>handlers.delete(name),connect:()=>attempts++}
 const stop=installSocketRecovery(socket,()=>new Promise(r=>resolve=r),()=>{},1)
 handlers.get('disconnect')('io server disconnect')
 await new Promise(r=>setTimeout(r,10));assert(resolve);stop();resolve(true)
 await new Promise(r=>setTimeout(r,10));assert.equal(attempts,0);assert.equal(handlers.size,0)
})
