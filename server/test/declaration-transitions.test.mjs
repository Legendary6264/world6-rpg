import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
import {isDeclarationTransitionAck,declarationTransitionRequest} from '../generated/declarationTransitions.mjs'

for(const dialect of ['sqlite','postgres'])test('Команды мастера и переходы раундов · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('flow-gm'),players=[await f.register('flow-one'),await f.register('flow-two')],helper=await f.register('flow-helper')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id,world=()=>api(root+'/world',gm.token),control=()=>api(root+'/declarations',gm.token),heroes=[]
 for(const user of [...players,helper])await api(root+'/join',user.token,'POST')
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 await api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:(await world()).revision,permissions:['rounds','viewSecrets']})
 for(const [index,player] of players.entries()){
  const character={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Игрок '+index};character.rpg.formulas=[];character.statistics.energyRegeneration='0';character.resources.mana={maximum:'20',current:'20'}
  await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1});const hero=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id;heroes.push(hero)
  await api(root+'/characters/'+hero+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 const initial=await world();initial.campaign.scenes=createScene(emptyScenes(),'flow-scene','MASTER-PRIVATE-SCENE','top');initial.campaign.scenes.scenes[0].tokens=heroes.map((actorId,index)=>({actorId,x:2+index,y:2,z:0,diameter:1,support:{kind:'ground'}}))
 await api(root+'/world',gm.token,'PUT',{revision:initial.revision,world:initial})
 async function command(operation,patch={}){
  const view=await control(),c=view.declarations.active,base={operation,generation:view.generation,commandKey:'roundflow:'+crypto.randomUUID()}
  if(operation==='open')return {...base,revision:view.revision,sceneId:'flow-scene',participantIds:heroes,durationSeconds:5,allowReplace:true,...patch}
  return {...base,collectionId:c.id,epoch:c.epoch,...(operation==='next'?{revision:view.revision}:operation==='return'?{actorId:heroes[0],baseVersion:c.entries.find(e=>e.actorId===heroes[0]).revision,note:'  Уточни маршрут.  '}:{}),...patch}
 }
 async function call(c,status=c.operation==='open'||c.operation==='next'?201:200,token=gm.token){const target=declarationTransitionRequest(root,c),result=await api(target.path,token,target.method,c,status);if(status===200||status===201)assert(isDeclarationTransitionAck(result,c));return result}
 async function submit(index=0,seconds=7){const path=root+'/characters/'+heroes[index]+'/declarations',v=await api(path,players[index].token);return api(path,players[index].token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry?.revision??0,controlStamp:v.controlStamp,commandKey:'declaration:'+crypto.randomUUID(),actions:[{kind:'wait',seconds,note:'План игрока'}]})}
 let opened,firstClose,returned,nextRound
 await t.test('Открытие, перестановка полей и ограничения прав: одно изменение вместо повторного сбора',async()=>{
  opened=await command('open');await call(opened,403,players[0].token)
  await call({...opened,generation:0},400);const missing={...opened};delete missing.generation;await call(missing,400)
  await api(root+'/declarations',gm.token,'PATCH',opened,400)
  const result=await call(opened),before=await world();assert.equal(result.duplicate,false)
  assert.equal((await call(Object.fromEntries(Object.entries(opened).reverse()))).duplicate,true);assert.deepEqual(await world(),before)
  await call(opened,409,helper.token);await call({...opened,allowReplace:false},409)
  await api(root+'/declarations',players[0].token,'GET',undefined,403)
  assert.equal((await control()).declarations.active.id,result.receipt.nextCollectionId)
  assert.equal((await f.server.db.get('SELECT COUNT(*) AS n FROM audit WHERE target_id=? AND action=?',[id,'open-declarations'])).n,1)
 })
 await t.test('Закрытие не зависит от чужой отправки; старое подтверждение не меняет повторно открытый приём',async()=>{
  firstClose=await command('close');await submit();await call(firstClose)
  const before=await world();await f.restart();assert.equal((await call(firstClose)).duplicate,true);assert.deepEqual(await world(),before)
  const reopen=await command('reopen'),results=await Promise.all([call(reopen),call(reopen)]);assert.equal(results.filter(r=>r.duplicate).length,1)
  const current=await world();assert.equal(current.campaign.declarations.active.phase,'open');await call(firstClose);assert.deepEqual(await world(),current)
 })
 await t.test('Возврат атомарен, адресован герою и не возвращает повторно уже исправленный ход',async()=>{
  returned=await command('return');await api(root+'/characters/'+heroes[1]+'/declarations/return',gm.token,'POST',returned,400)
  const before=await world(),db=f.server.db,transaction=db.transaction
  db.transaction=fn=>transaction(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('return-declaration'))throw Error('TEST-FLOW-AUDIT');return tx.run(sql,args)}}))
  try{await call(returned,500)}finally{db.transaction=transaction}
  assert.deepEqual(await world(),before);assert.equal(await db.get('SELECT command_key FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[id,returned.commandKey]),undefined)
  const result=await call(returned);assert.equal(result.receipt.entryVersion,2);assert.equal(result.receipt.note,'Уточни маршрут.')
  await submit();const revised=await world();assert.equal(revised.campaign.declarations.active.entries[0].revision,3)
  assert.equal((await call(returned)).duplicate,true);assert.deepEqual(await world(),revised);await call({...returned,note:'Иное замечание'},409)
 })
 await t.test('Следующий раунд переносит незавершённую работу и сохраняет только одну запись истории',async()=>{
  await call(await command('close'));const before=await world(),c=before.campaign.declarations.active
  const preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:before.revision,collectionId:c.id,epoch:c.epoch,input:{timings:[{actorId:heroes[0],entryRevision:3,budgetMs:5000,costs:[]}],continuations:[],missingDecisions:[{actorId:heroes[1],reason:'Остаётся без заявления по решению мастера'}],interactionsConfirmed:false}})
  await api(root+'/rounds/apply',gm.token,'POST',{previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()})
  const applied=await world();assert.equal(applied.campaign.roundWork.entries.length,1);nextRound=await command('next')
  await call(nextRound);const after=await world();assert.equal(after.campaign.declarations.archive.length,1);assert.equal(after.campaign.declarations.active.entries.length,0)
  assert.deepEqual(after.characters,applied.characters);assert.equal(after.campaign.seconds,applied.campaign.seconds);assert.deepEqual(after.campaign.roundWork,applied.campaign.roundWork)
  await f.restart();assert.equal((await call(nextRound)).duplicate,true);assert.deepEqual(await world(),after)
 })
 await t.test('Архивирование и подтверждение старого открытия не создают новый приём; пауза сохраняет проверку команд',async()=>{
  await call(await command('close'));const archive=await command('archive'),before=await world();await call(archive)
  const saved=await world();assert.equal(saved.campaign.declarations.active,null);assert.equal(saved.campaign.declarations.archive.length,2);assert.deepEqual(saved.campaign.roundWork,before.campaign.roundWork)
  assert.equal((await call(archive)).duplicate,true);assert.equal((await call(opened)).duplicate,true);assert.deepEqual(await world(),saved)
  await api(root+'/rounds/pause',gm.token,'POST',{revision:saved.revision,paused:true,reason:'Перерыв',commandKey:crypto.randomUUID()})
  const paused=await world();assert.equal((await call(nextRound)).duplicate,true);assert.deepEqual(await world(),paused);await call(await command('open'),409)
  await api(root+'/rounds/pause',gm.token,'POST',{revision:(await world()).revision,paused:false,reason:'Продолжение',commandKey:crypto.randomUUID()})
 })
 await t.test('Восстановление кампании запрещает команды старого поколения без изменения мира',async()=>{
  const backup=await api(root+'/backup',gm.token);await api(root+'/restore',gm.token,'POST',{revision:(await world()).revision,world:backup.world,bindings:backup.bindings})
  const before=await world();await call(opened,409);await call(firstClose,409);await call(nextRound,409);assert.deepEqual(await world(),before)
  assert((await control()).generation>opened.generation)
 })
})
