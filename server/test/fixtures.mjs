import { PGlite } from '@electric-sql/pglite'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createApplication } from '../app.mjs'
import { readConfig } from '../config.mjs'

export async function fixture(t,dialect='sqlite') {
 const directory=await mkdtemp(join(tmpdir(),'world6-regression-'))
 const config=readConfig({AUTH_MODE:'local',SQLITE_PATH:join(directory,'test.sqlite'),PORT:'0',OWNER_EMAIL:'owner@example.test'})
 const Pool=dialect==='postgres'?class{
  constructor(){this.database=new PGlite(join(directory,'postgres'));this.query=this.query.bind(this)}
  async query(sql,args=[]){if(sql.includes(';')){const results=await this.database.exec(sql);return results.map(r=>({...r,rowCount:r.affectedRows??0}))}const result=await this.database.query(sql,args);return {...result,rowCount:result.affectedRows??0}}
  async connect(){return {query:this.query,release(){}}}
  on(){}
  async end(){await this.database.close()}
 }:undefined
 if(Pool)config.databaseUrl='postgres-test'
 const server=await createApplication(config,{Pool}),base='http://127.0.0.1:'+(await server.listen()).port
 t.after(async()=>{await server.close();await rm(directory,{recursive:true,force:true})})
 async function request(path,token,method='GET',body){const r=await fetch(base+'/api'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
 async function api(path,token,method='GET',body,status=200){const r=await request(path,token,method,body);assert.equal(r.status,status,path+': '+JSON.stringify(r.data));return r.data}
 async function register(name){return api('/auth/register','', 'POST',{email:name+'@example.test',displayName:name,password:'Audit-regression-password-2026'},201)}
 return {server,base,request,api,register}
}
export const lobbyBody={title:'Проверка кампании',description:'Отдельная тестовая база',genre:'Приключение',slots:4,energy:'any',rank:'mortal',visibility:'public'}
export function gate(){let release,reached;return {waiting:new Promise(r=>reached=r),wait:new Promise(r=>release=r),release:()=>release(),reached:()=>reached()}}
