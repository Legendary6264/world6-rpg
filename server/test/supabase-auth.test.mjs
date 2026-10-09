// Auth service double: verifies our API's Supabase identity/MFA rules without cloud secrets.
// Sending real confirmation emails and Supabase's own token checks require a deployed project.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApplication } from '../app.mjs'
import { readConfig } from '../config.mjs'

test('Supabase: доверенная личность, подтверждение email, UUID владельца и MFA',async t=>{
 const tokens=new Map(),ownerId=crypto.randomUUID(),playerId=crypto.randomUUID()
 const token=(user,aal='aal1')=>{const value=Buffer.from(JSON.stringify({alg:'test'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aal,role:'OWNER',nonce:crypto.randomUUID(),session_id:crypto.randomUUID()})).toString('base64url')+'.test';tokens.set(value,user);return value}
 const owner={id:ownerId,email:'owner@example.test',email_confirmed_at:new Date().toISOString(),user_metadata:{display_name:'Владелец',role:'PLAYER'}}
 const player={id:playerId,email:'player@example.test',email_confirmed_at:new Date().toISOString(),user_metadata:{display_name:'Игрок',role:'OWNER'}}
 const ownerAal1=token(owner),ownerAal2=token(owner,'aal2'),playerToken=token(player)
 const authServer=createServer((req,res)=>{res.setHeader('Content-Type','application/json');const user=tokens.get(req.headers.authorization?.slice(7));if(req.url!=='/auth/v1/user'||!user){res.statusCode=401;res.end(JSON.stringify({message:'invalid token',code:'bad_jwt'}))}else res.end(JSON.stringify(user))})
 const address=await new Promise(resolve=>authServer.listen(0,'127.0.0.1',()=>resolve(authServer.address())))
 const dir=await mkdtemp(join(tmpdir(),'world6-supabase-')),server=await createApplication(readConfig({AUTH_MODE:'supabase',SUPABASE_URL:'http://127.0.0.1:'+address.port,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',OWNER_USER_ID:ownerId,SQLITE_PATH:join(dir,'test.sqlite'),PORT:'0'}))
 const port=(await server.listen()).port
 t.after(async()=>{await server.close();await new Promise(resolve=>authServer.close(resolve));await rm(dir,{recursive:true,force:true})})
 async function api(path,auth,status=200,method='GET',body){const response=await fetch('http://127.0.0.1:'+port+'/api'+path,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,status,path+': '+JSON.stringify(data));return data}
 const a=await api('/me',ownerAal1);assert.equal(a.role,'OWNER');assert.equal(a.mfaRequired,true)
 assert.equal((await api('/me',playerToken)).role,'PLAYER')
 await api('/admin/users',ownerAal1,403);await api('/admin/users',ownerAal2)
 await api('/publications/news',ownerAal1,403,'POST',{title:'Новость',body:'Без MFA нельзя'})
 await api('/publications/news',ownerAal2,201,'POST',{title:'Новость',body:'После второго фактора'})
 assert.equal((await api('/me',ownerAal1,200,'PATCH',{displayName:'Новое имя'})).mfaRequired,true)
 await api('/me',playerToken.replace(/\.test$/,'.forged'),401)
 await api('/me',token({...player,id:crypto.randomUUID(),email:'unverified@example.test',email_confirmed_at:null}),401)
 await api('/admin/users/'+playerId,ownerAal2,200,'PATCH',{role:'WORLD_EDITOR'})
 assert.equal((await api('/me',playerToken)).mfaRequired,true)
 await api('/world-entries/manage',playerToken,403)
 await api('/world-entries/manage',token(player,'aal2'))
 await api('/admin/users',token(player,'aal2'),403)
 const protectedPlayer={...player,id:crypto.randomUUID(),email:'protected@example.test',factors:[{id:crypto.randomUUID(),factor_type:'totp',status:'verified'}]}
 const pendingToken=token(protectedPlayer)
 assert.equal((await api('/me',pendingToken)).mfaRequired,true)
 await api('/lobbies/mine',pendingToken,403)
 await api('/me',pendingToken,403,'PATCH',{displayName:'До MFA'})
 await api('/lobbies/mine',token(protectedPlayer,'aal2'))
 await api('/auth/logout',pendingToken,200,'POST')
 await api('/auth/register',undefined,400,'POST',{email:'fake@example.test',password:'Strong-password-2026',displayName:'Фальшивый'})
 await api('/auth/login',undefined,400,'POST',{email:'fake@example.test',password:'Strong-password-2026'})
 // Even a valid unexpired JWT must not outlive its revoked production session.
 const originalGet=server.db.get
 let activeSession=true
 server.db.get=async(sql,args)=>sql.includes('auth.sessions')?(activeSession?{active:1}:undefined):originalGet(sql,args)
 server.config.production=true
 await api('/me',ownerAal2)
 activeSession=false
 await api('/me',ownerAal2,401)
 server.config.production=false
 server.db.get=originalGet

})
