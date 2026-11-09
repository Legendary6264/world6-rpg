import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {lobbyPermissions} from '../generated/lobbyAccess.mjs'
import {physicsMaterialPreset} from '../generated/physicsMaterials.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
import {FUSION_J_KG} from '../generated/waterPhysics.mjs'
import {unpackArchive} from '../campaign-archive-format.mjs'

for(const dialect of ['sqlite','postgres'])test('Финал переносится с полной копией: 4000 символов, восстановление и явное продолжение · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('portable-gm'),{id}=await api('/lobbies',gm.token,'POST',{title:'Перенос финала',description:'Тестовая копия',genre:'Приключение',slots:4,energy:'any',rank:'mortal',visibility:'private'},201),root='/lobbies/'+id,path=root+'/play/session'
 const world=()=>api(root+'/world',gm.token),command={revision:(await world()).revision,title:'И'.repeat(80),summary:'я'.repeat(4000),keepPending:false,commandKey:crypto.randomUUID()}
 const result=await api(path+'/finish',gm.token,'POST',command),finished=await world(),s=finished.campaign.gameSession
 assert.equal(s.status,'finished');assert(s.summary.includes(command.title)&&s.summary.includes(command.summary));assert.equal(s.finishedAt,result.result.finishedAt)
 const exported=await api(root+'/archive',gm.token),data=Buffer.from(exported.data,'base64'),saved=await unpackArchive(data)
 assert.deepEqual(saved.world.campaign.gameSession,s)
 await f.restart();assert.deepEqual((await world()).campaign.gameSession,s);assert.equal((await api(path,gm.token)).result.summary,command.summary)
 await api(path,gm.token,'POST',{operation:'resume',revision:(await world()).revision,commandKey:'session:'+crypto.randomUUID()})
 const upload=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+(await world()).revision,{method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:data}),preview=await upload.json();assert.equal(upload.status,200,JSON.stringify(preview))
 await api(root+'/archive/apply',gm.token,'POST',{previewId:preview.id,generation:preview.generation,reason:'Возврат завершённой истории',commandKey:crypto.randomUUID()})
 const restored=await api(path+'/details',gm.token);assert.equal(restored.session.status,'finished');assert.equal(restored.session.summary,s.summary)
 await api(path+'/finish',gm.token,'POST',{...command,revision:(await world()).revision,commandKey:crypto.randomUUID()},409)
 await api(path,gm.token,'POST',{operation:'resume',revision:(await world()).revision,commandKey:'session:'+crypto.randomUUID()})
 assert.equal((await api(path+'/details',gm.token)).session.status,'playing');assert.equal((await world()).campaign.seconds,0)
})

for(const dialect of ['sqlite','postgres'])test('Совместная игра от приглашения до финального снимка · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('session-gm'),players=[await f.register('session-player-a'),await f.register('session-player-b')],outside=await f.register('session-outside')
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Игра друзей',slots:4,commandKey:'starter:'+crypto.randomUUID()},201),root='/lobbies/'+id,path=root+'/play/session'
 const world=()=>api(root+'/world',gm.token),view=(token=gm.token)=>api(path,token),revision=async()=>(await api(root,gm.token)).revision
 const finishBody=async patch=>({revision:await revision(),title:'Переход открыт',summary:'Друзья открыли ворота и добрались до следующей стоянки.',keepPending:false,commandKey:crypto.randomUUID(),...patch})
 const heroes=[],lobby=await api(root,gm.token),initial=await world(),scene=initial.campaign.scenes.scenes[0],door=scene.objects.find(o=>o.kind==='door')
 await t.test('Подготовка и права: приглашение, принятие героя и раскрытие требуются до старта',async()=>{
  assert.equal((await view()).canStart,false);await api(path,outside.token,'GET',undefined,403)
  await api(path+'/start',gm.token,'POST',{revision:await revision()},409)
  for(let i=0;i<players.length;i++){
   await api('/lobbies/join',players[i].token,'POST',{code:lobby.inviteCode})
   const source={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Герой '+i};await api('/characters/'+source.id,players[i].token,'PUT',{character:source,revision:-1})
   const hero=(await api(root+'/characters',players[i].token,'POST',{characterId:source.id},201)).id;heroes.push(hero)
   await api(root+'/characters/'+hero+'/review',gm.token,'POST',{revision:await revision(),decision:'approve',note:''})
  }
  assert.deepEqual((await view()).ready.map(r=>r.done),[true,true,false,false]);await api(path+'/start',gm.token,'POST',{revision:await revision()},409)
  await api(root+'/play/setup',gm.token,'POST',{revision:await revision(),setup:{sceneId:scene.id,actorIds:heroes,objectIds:[door.id],contactIds:heroes,title:'У ворот',description:'Открытая общая сцена',anchor:{x:3,y:3,z:0},revealTerrain:true}})
  assert.equal((await view()).canStart,false);await api(path+'/start',gm.token,'POST',{revision:await revision()},409)
  await api(path+'/ready',players[0].token,'PUT',{ready:true});assert.equal((await view()).canStart,false)
  await api(path+'/start',gm.token,'POST',{revision:await revision()},409)
  await api(path+'/ready',players[1].token,'PUT',{ready:true});assert.equal((await view()).canStart,true)
  const personal=await view(players[0].token);assert(!('ready' in personal));assert(!('pendingWork' in personal));assert(!JSON.stringify(personal).includes(initial.characters[0].id));assert(!JSON.stringify(personal).includes('Кладовщица'))
  await api(path+'/start',players[0].token,'POST',{revision:await revision()},403);await api(path+'/finish',players[0].token,'POST',await finishBody(),403)
  await api(root+'/members/'+players[1].user.id,gm.token,'PATCH',{role:'ASSISTANT'});await api(root+'/members/'+players[1].user.id+'/permissions',gm.token,'PATCH',{revision:await revision(),permissions:lobbyPermissions})
  await api(path+'/start',players[1].token,'POST',{revision:await revision()},403);await api(path+'/finish',players[1].token,'POST',await finishBody(),403)
 })
 await t.test('Начало идемпотентно и закрывает набор без изменения мира или часов',async()=>{
  const before=await world(),rev=await revision()
  await api(path+'/start',gm.token,'POST',{revision:rev-1},409)
  const replies=await Promise.all([f.request(path+'/start',gm.token,'POST',{revision:rev}),f.request(path+'/start',gm.token,'POST',{revision:rev})]);assert(replies.every(r=>r.status===200));assert.equal(replies.filter(r=>!r.data.duplicate).length,1)
  assert.equal((await api(root,gm.token)).status,'playing');const after=await world();assert.deepEqual(after.campaign,before.campaign);assert.deepEqual(after.characters,before.characters);assert.equal(after.revision,rev+1)
  await api('/lobbies/join',outside.token,'POST',{code:lobby.inviteCode},409)
 })
 async function submit(actorId,player,actions){const p=root+'/characters/'+actorId+'/declarations',v=await api(p,player.token);await api(p,player.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry?.revision??0,controlStamp:v.controlStamp,actions})}
 async function calculate(input){let w=await world(),c=w.campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'});w=await world();c=w.campaign.declarations.active;return api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input})}
 const apply=p=>api(root+'/rounds/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 await t.test('Два независимых игрока: планы, перерыв, дверь, движение и перенос незавершённой работы',async()=>{
  await api(root+'/declarations',gm.token,'POST',{revision:await revision(),sceneId:scene.id,participantIds:heroes,durationSeconds:5,allowReplace:true},201)
  await submit(heroes[0],players[0],[{kind:'interact',target:{kind:'object',id:door.id},operation:door.open?'close':'open',note:''},{kind:'move',route:[{x:5,y:3,z:0}],support:'ground',note:''}])
  await submit(heroes[1],players[1],[{kind:'wait',seconds:8,note:'PRIVATE-SESSION-PLAN'}])
  assert.equal((await view()).round.received,2);assert(!JSON.stringify(await view(players[0].token)).includes('PRIVATE-SESSION-PLAN'))
  await api(path+'/finish',gm.token,'POST',await finishBody(),409)
  const beforePause=await world();await api(root+'/rounds/pause',gm.token,'POST',{revision:await revision(),paused:true,reason:'Перерыв',commandKey:crypto.randomUUID()});assert.equal((await view(players[0].token)).phase,'paused')
  await submitPaused();await api(root+'/rounds/pause',gm.token,'POST',{revision:await revision(),paused:false,reason:'Продолжаем',commandKey:crypto.randomUUID()});assert.deepEqual((await world()).campaign,beforePause.campaign)
  const p=await calculate({timings:[{actorId:heroes[0],entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000},{index:1,personalMs:2000}]},{actorId:heroes[1],entryRevision:1,budgetMs:5000,costs:[]}],continuations:[],missingDecisions:[],interactionsConfirmed:true,movement:{confirmed:true,bodies:(await world()).campaign.scenes.scenes[0].tokens.map(t=>({actorId:t.actorId,heightM:2}))}})
  assert.equal((await world()).campaign.seconds,0);await apply(p)
  const played=await world();assert.equal(played.campaign.seconds,5);assert.equal(played.campaign.scenes.scenes[0].objects.find(o=>o.id===door.id).open,!door.open);assert.equal(played.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===heroes[0]).x,5)
  assert.equal((await view()).phase,'applied');assert((await view()).pendingWork>0);await api(path+'/finish',gm.token,'POST',await finishBody(),409)
 })
 async function submitPaused(){const p=root+'/characters/'+heroes[0]+'/declarations',v=await api(p,players[0].token);await api(p,players[0].token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry.revision,controlStamp:v.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]},409)}
 await t.test('Следующий раунд завершает остаток работы; перезапуск сохраняет обоих игроков',async()=>{
  let w=await world(),c=w.campaign.declarations.active;await api(root+'/declarations/next',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch},201)
  await submit(heroes[0],players[0],[{kind:'wait',seconds:1,note:''}])
  const p=await calculate({timings:[{actorId:heroes[0],entryRevision:1,budgetMs:5000,costs:[]}],continuations:[{actorId:heroes[1],mode:'continue',budgetMs:5000}],missingDecisions:[],interactionsConfirmed:true})
  await apply(p);w=await world();assert.equal(w.campaign.seconds,10);assert.equal((await view()).pendingWork,0);await f.restart();assert.deepEqual(await world(),w)
  for(let i=0;i<2;i++)assert((await api(root+'/characters/'+heroes[i]+'/perception',players[i].token)).map)
 })
 await t.test('Неудача снимка или аудита не закрывает игру и не оставляет сообщения/частичного итога',async()=>{
  const checkpoint=await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:await revision(),name:'До завершения',commandKey:crypto.randomUUID()}),before=await world(),db=f.server.db
  const size=await db.get('SELECT payload_bytes FROM campaign_checkpoints WHERE id=?',[checkpoint.checkpoint.id]);await db.run('UPDATE campaign_checkpoints SET payload_bytes=? WHERE id=?',[32*1024*1024,checkpoint.checkpoint.id]);await api(path+'/finish',gm.token,'POST',await finishBody(),409);await db.run('UPDATE campaign_checkpoints SET payload_bytes=? WHERE id=?',[size.payload_bytes,checkpoint.checkpoint.id])
  const count=await db.get('SELECT COUNT(*) AS n FROM campaign_checkpoints WHERE lobby_id=?',[id]),messages=await db.get('SELECT COUNT(*) AS n FROM messages WHERE lobby_id=?',[id]),transaction=db.transaction
  db.transaction=fn=>transaction(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('finish-game'))throw Error('TEST-FINISH-AUDIT');return tx.run(sql,args)}}))
  try{await api(path+'/finish',gm.token,'POST',await finishBody(),500)}finally{db.transaction=transaction}
  assert.deepEqual(await world(),before);assert.equal((await api(root,gm.token)).status,'playing');assert.deepEqual(await db.get('SELECT COUNT(*) AS n FROM campaign_checkpoints WHERE lobby_id=?',[id]),count);assert.deepEqual(await db.get('SELECT COUNT(*) AS n FROM messages WHERE lobby_id=?',[id]),messages);assert.equal((await view()).result,null)
 })
 let finish,reply,finalWorld
 await t.test('Финал атомарен: одна точка, один общий итог, закрытые ходы, повтор после потери ответа безопасен',async()=>{
  const before=await world();finish=await finishBody()
  await api(path+'/finish',gm.token,'POST',{...finish,revision:finish.revision-1},409)
  const replies=await Promise.all([f.request(path+'/finish',gm.token,'POST',finish),f.request(path+'/finish',gm.token,'POST',finish)]);assert(replies.every(r=>r.status===200));assert.equal(replies.filter(r=>!r.data.duplicate).length,1);reply=replies[0].data
  assert.equal((await api(root,gm.token)).status,'closed');finalWorld=await world();assert.deepEqual(finalWorld.campaign,{...before.campaign,gameSession:finalWorld.campaign.gameSession});assert.equal(finalWorld.campaign.gameSession.status,'finished');assert(finalWorld.campaign.gameSession.summary.includes(finish.summary));assert.deepEqual(finalWorld.characters,before.characters);assert.equal(finalWorld.revision,before.revision+1)
  const points=(await api(root+'/rounds/history',gm.token)).checkpoints;assert.equal(points.length,2);assert(points.some(p=>p.id===reply.result.id))
  const message=await f.server.db.get('SELECT body FROM messages WHERE id=?',['game-finish:'+reply.result.id]);assert(message.body.includes(finish.summary));const snapshot=await f.server.db.get('SELECT world_json FROM campaign_checkpoints WHERE id=?',[reply.result.id]);assert.deepEqual(JSON.parse(snapshot.world_json).campaign,finalWorld.campaign)
  await api(root+'/messages',players[0].token,'POST',{body:'Новый ход после финала'},409);await api(path+'/start',gm.token,'POST',{revision:await revision()},409);await api(path+'/finish',gm.token,'POST',{...finish,summary:'Другой итог'},409)
  await f.restart();const duplicate=await api(path+'/finish',gm.token,'POST',finish);assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.result,reply.result);assert.deepEqual(await world(),finalWorld)
 })
 await t.test('Оба игрока читают общий итог без снимка мира и секретов; прежний мастер теряет право повтора',async()=>{
  for(const player of players){const v=await view(player.token);assert.equal(v.phase,'finished');assert.deepEqual(v.result,reply.result);assert.equal(v.result.summary,finish.summary);assert(!JSON.stringify(v).includes('PRIVATE-SESSION-PLAN'));assert(!JSON.stringify(v).includes(initial.characters[0].id));assert(!('world_json' in v.result));await api(root+'/rounds/history',player.token,'GET',undefined,player===players[1]?200:403)}
  const own=await api(root+'/characters/'+heroes[0]+'/perception',players[0].token);assert.equal(own.closed,true);assert.equal(own.canWriteNotes,false)
  await api(root+'/characters/'+heroes[0]+'/knowledge',players[0].token,'POST',{revision:await revision(),title:'После финала',text:'Не должно изменить снимок'},409)
  assert.deepEqual(await world(),finalWorld)
  await api(path,outside.token,'GET',undefined,403)
  await api(root+'/transfer',gm.token,'POST',{userId:players[1].user.id});await api(path+'/finish',gm.token,'POST',finish,403);await api(path+'/finish',players[1].token,'POST',finish,409)
 })
})

for(const dialect of ['sqlite','postgres'])test('Ледяная переправа: способности, два игрока, НПС и сохранение · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('ice-gm')
 const mage=await f.register('ice-mage'),scout=await f.register('ice-scout')
 const {id}=await api('/lobbies',gm.token,'POST',{...lobbyBody,title:'Ледяная переправа',visibility:'private'},201)
 const root='/lobbies/'+id,session=root+'/play/session',declarations=root+'/declarations'
 const world=()=>api(root+'/world',gm.token),route=actorId=>root+'/characters/'+actorId
 const view=(actorId,user)=>api(route(actorId)+'/perception',user.token)
 const {inviteCode}=await api(root,gm.token)
 async function join(player,sourceId,name){
  await api('/lobbies/join',player.token,'POST',{code:inviteCode})
  const character={...createDefaultCharacter(),id:sourceId,name}
  await api('/characters/'+sourceId,player.token,'PUT',{character,revision:-1})
  const hero=await api(root+'/characters',player.token,'POST',{characterId:sourceId},201)
  await api(route(hero.id)+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
  return hero.id
 }
 const mageId=await join(mage,'ice-mage-source','Маг'),scoutId=await join(scout,'ice-scout-source','Следопыт')
 const keeper={...createDefaultCharacter(),id:'ice-keeper-source',name:'Сторож'}
 Object.assign(keeper.body.parts.torso,{current:10,maximum:10})
 const {id:keeperId}=await api(root+'/npcs',gm.token,'POST',{
  revision:(await world()).revision,character:keeper,commandKey:'npc:'+crypto.randomUUID(),
 })
 const initial=await world(),actor=(snapshot,actorId)=>snapshot.characters.find(a=>a.id===actorId)
 const m=actor(initial,mageId),s=actor(initial,scoutId)
 m.rpg.formulas=[];m.statistics.energyRegeneration='0';m.resources.mana={maximum:'50',current:'50'}
 m.rpg.abilities=[{...emptyAbility(),id:'phase',templateId:'phase-template',name:'Стихийный выпуск',approved:true,
  spatial:{shape:'sphere',includeCaster:false,radiusM:.2},rangeM:12,mechanism:'effect',cost:{mana:1,shadow:0,stamina:0}}]
 s.rpg.formulas=[];s.statistics.movement='2'
 s.rpg.abilities=[{...emptyAbility(),id:'strike',templateId:'strike-template',name:'Удар',approved:true,rangeM:5}]

 initial.campaign.scenes=createScene(emptyScenes(),'ice-crossing','Ледяная переправа','top')
 const room=snapshot=>snapshot.campaign.scenes.scenes[0],scene=room(initial)
 Object.assign(scene,{width:12,depth:8,minZ:0,maxZ:3})
 scene.physics={version:1,gravityMs2:10,ambientTemperatureK:273.15,
  atmosphere:{oxygenFraction:.2095,smokeKg:0,steamKg:0,outsideTemperatureK:273.15,doorVentilation:false},
  traction:{version:1,waterFactor:.81,iceFactor:.25}}
 const point=(x,y,z=0)=>({x,y,z}),magePoint=point(1,3.45),scoutPoint=point(2,3),keeperPoint=point(4,5)
 const token=(actorId,p)=>({actorId,...p,diameter:.6,support:{kind:'ground'}})
 scene.tokens=[token(mageId,magePoint),token(scoutId,scoutPoint),token(keeperId,keeperPoint)]
 const pool={...sceneObject('water','pool',point(5,3)),name:'Лужа',width:4,depth:1,height:.002,
  water:{version:1,base:'pure',saltKg:0,sedimentKg:0,enthalpyJKg:FUSION_J_KG}}
 const crate={...sceneObject('crate','sled',point(2.2,3.45)),name:'Ящик',width:.4,depth:.18,height:.4,
  physics:{version:1,material:physicsMaterialPreset('wood'),massKg:10,temperatureK:273.15,wetnessFraction:0,
   sliding:{dryFriction:.5,wetFriction:null,impactTransfer:.5,vxMs:0,vyMs:0}}}
 scene.objects=[pool,crate]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 const contact=(actorId,label,p)=>({actorId,kind:'identified',label,signs:'',showHeight:true,point:p,radius:0})
 for(const [id,user,contacts] of [
  [mageId,mage,[contact(scoutId,'Следопыт',scoutPoint)]],
  [scoutId,scout,[contact(keeperId,'Сторож',keeperPoint)]],
 ]){
  await api(route(id)+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{
   activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:scene.name,description:'',
    areas:[{id:'crossing',x:0,y:0,z:0,width:12,depth:8,height:3,visible:true}],
    objects:user===scout?[{objectId:pool.id,visible:true}]:[],contacts}],
  }})
  await api(session+'/ready',user.token,'PUT',{ready:true})
 }
 assert.equal((await api(session,gm.token)).canStart,true)
 await api(session+'/start',gm.token,'POST',{revision:(await world()).revision})
 const target=async(id,user,label)=>{
  const visible=(await view(id,user)).map.contacts.find(c=>c.label===label)
  assert(visible,'Нет раскрытого контакта «'+label+'»')
  return {kind:'contact',id:visible.id}
 }
 const scoutTarget=await target(mageId,mage,'Следопыт'),keeperTarget=await target(scoutId,scout,'Сторож')
 const input={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',
  gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,
  bleedingMlPerSecond:0,injury:'',note:''}
 const key=(id,index)=>'new:'+id+':'+index
 const action=(abilityId,stage,target)=>({kind:'ability',abilityId,stage,target,note:''})
 const wait=seconds=>({kind:'wait',seconds,note:''})
 const move=p=>({kind:'move',route:[p],support:'ground',note:''})
 const speak=(target,text)=>({kind:'speak',target,volume:'normal',text,note:''})
 const decision=(id,index,binding,charge='',fields=input)=>({
  key:key(id,index),kind:'ability',confirmed:true,binding,charge,input:fields,
 })
 const aim={kind:'area',point:point(5,3,.001)},energyKJ=8*FUSION_J_KG/1000
 const pushAim={kind:'area',point:point(crate.x,crate.y,.1)},push={kind:'push-object',impulseNs:60}
 const discharge={kind:'discharge',returnContact:point(5.5,3,.001),voltageV:24,limitA:.2,durationMs:100,thresholdA:.01}
 const spellActions=effects=>effects.flatMap(({kind})=>[
  action('phase','prepare',{kind:'none'}),action('phase','release',kind==='push-object'?pushAim:aim),
 ])
 const spellRules=(effects,offset=0)=>effects.flatMap((physics,index)=>{
  const prepare=offset+index*2
  return [decision(mageId,prepare,'unbound'),
   {...decision(mageId,prepare+1,'unbound','prepare:'+key(mageId,prepare)),spatialConfirmed:true,physics}]
 })
 const speech=(id,index,listener,speaker)=>({
  key:key(id,index),confirmed:true,reason:'Слышно в открытом проходе',recordedAt:'2099-01-01T00:00:00.000Z',
  hearers:[{actorId:listener,clarity:'clear',speaker,fragment:'',signs:''}],
 })
 const apply=p=>api(root+'/rounds/apply',gm.token,'POST',{previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 async function prepareRound(plans){
  await api(declarations,gm.token,'POST',{sceneId:scene.id,participantIds:plans.map(([id])=>id),
   durationSeconds:20,allowReplace:true,revision:(await world()).revision},201)
  for(const [id,user,actions] of plans){
   const path=route(id)+'/declarations',v=await api(path,user.token)
   await api(path,user.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,
    baseVersion:0,controlStamp:v.controlStamp,actions})
  }
  const open=await world(),c=open.campaign.declarations.active
  await api(declarations,gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
  const before=await world(),closed=before.campaign.declarations.active
  return {before,request:(walkMs,rules,speech=[])=>({
   revision:before.revision,collectionId:closed.id,epoch:closed.epoch,input:{
    timings:plans.map(([actorId,,actions])=>({actorId,entryRevision:1,budgetMs:20000,
     costs:actions.flatMap(({kind},index)=>kind==='wait'?[]:[{index,personalMs:kind==='move'?walkMs:500}]),
    })),continuations:[],missingDecisions:[],interactionsConfirmed:true,rules,speech,
    movement:{confirmed:true,bodies:scene.tokens.map(({actorId})=>({actorId,heightM:1.8}))},
   },
  })}
 }
 async function archiveRound(){
  const {id,epoch}=(await world()).campaign.declarations.active
  await api(declarations,gm.token,'PATCH',{collectionId:id,epoch,operation:'archive'})
 }
 const calculate=request=>api(root+'/rounds/calculate',gm.token,'POST',request)
 const releases=preview=>preview.summary.rules.filter(r=>r.actorId===mageId&&r.kind==='release').map(r=>r.physics)
 const position=(snapshot,id)=>room(snapshot).tokens.find(t=>t.actorId===id)
 const freezeEffects=[{kind:'heat',energyKJ:-energyKJ},discharge]
 const first=await prepareRound([
  [mageId,mage,[...spellActions(freezeEffects),wait(12),...spellActions([push])]],
  [scoutId,scout,[move(point(8,3))]],
 ])
 const firstRules=[...spellRules(freezeEffects),...spellRules([push],5)]
 // At 1.5 m/s the scout enters the wet patch before it freezes at 1 s.
 const tooFast=await api(root+'/rounds/calculate',gm.token,'POST',first.request(4000,firstRules),400)
 assert.match(tooFast.message,/Сцепление.*Лужа.*лёд/u)
 assert.deepEqual(await world(),first.before)
 const frozen=await calculate(first.request(8000,firstRules)),[freeze,open,pushed]=releases(frozen)
 assert.equal(freeze.iceFraction,1)
 assert.deepEqual(freeze.waterTransition,{fromIceFraction:0,conductivitySM:0})
 assert.deepEqual(open.circuit,{status:'open',frozenContacts:['source','return']})
 const [iceWalk]=frozen.summary.traction.walks
 assert.equal(iceWalk.actorId,scoutId);assert.equal(iceWalk.kind,'ice')
 assert(Math.abs(iceWalk.distanceM-4)<1e-9);assert.equal(iceWalk.safeSpeedMs,1)
 const [iceSlide]=frozen.summary.traction.slides
 assert.equal(pushed.speedMs,6);assert.equal(iceSlide.moverId,crate.id);assert.equal(iceSlide.kind,'ice')
 assert(Math.abs(iceSlide.distanceM-4)<1e-9)
 await apply(frozen)
 const afterIce=await world()
 assert.equal(position(afterIce,scoutId).x,8)
 assert(Math.abs(room(afterIce).objects.find(o=>o.id===crate.id).x-8.8)<1e-9)
 assert.equal((await view(scoutId,scout)).map.slipperyIce,true)
 assert.equal((await view(mageId,mage)).map.slipperyIce,undefined)
 await archiveRound()

 const thawEffects=[{kind:'heat',energyKJ},discharge,{kind:'add-substance',substance:'salt',massKg:.008},discharge]
 const warning='Иди по мокрой дорожке.',challenge='Сторож, кто закрыл переход?',answer='Теперь переход открыт.'
 const second=await prepareRound([
  [mageId,mage,[...spellActions(thawEffects),speak(scoutTarget,warning)]],
  [scoutId,scout,[wait(5),move(scoutPoint),action('strike','prepare',keeperTarget),action('strike','release',keeperTarget),speak(keeperTarget,challenge)]],
  [keeperId,gm,[wait(12),speak({kind:'contact',id:scoutId},answer)]],
 ])
 const wet=await calculate(second.request(4000,[
  ...spellRules(thawEffects),decision(scoutId,2,'bound'),
  decision(scoutId,3,'bound','prepare:'+key(scoutId,2),{...input,manualLocal:4}),
 ],[
  speech(mageId,8,scoutId,'Маг'),speech(scoutId,4,keeperId,'Следопыт'),speech(keeperId,1,scoutId,'Сторож'),
 ]))
 const [thaw,pure,salt,saline]=releases(wet)
 assert.equal(thaw.iceFraction,0);assert.equal(thaw.waterTransition.fromIceFraction,1)
 assert(thaw.waterTransition.conductivitySM>0);assert.equal(salt.composition.saltKg,.008)
 assert.equal(pure.circuit.status,'closed');assert(pure.circuit.currentA>0&&pure.circuit.currentA<1e-5)
 assert.equal(saline.circuit.status,'closed');assert(saline.circuit.currentA>.01&&saline.circuit.currentA>pure.circuit.currentA*1000)
 const [wetWalk]=wet.summary.traction.walks
 assert.equal(wetWalk.kind,'wet');assert.equal(wetWalk.speedMs,1.5)
 assert.equal(wet.summary.speech.length,3)
 await apply(wet);await archiveRound()
 const saved=await world(),scoutView=await view(scoutId,scout)
 assert.equal(saved.campaign.seconds,40);assert.equal(position(saved,scoutId).x,2)
 assert.equal(actor(saved,keeperId).body.parts.torso.current,7)
 assert(JSON.stringify(actor(saved,keeperId).journal).includes(challenge))
 assert(JSON.stringify(scoutView.knowledge.journal).includes(warning))
 assert(JSON.stringify(scoutView.knowledge.journal).includes(answer))
 assert.equal(scoutView.map.slipperyIce,undefined)
 assert.doesNotMatch(JSON.stringify(scoutView.map),/saltKg|iceFactor|enthalpyJKg/)

 const exported=await api(root+'/archive',gm.token),data=Buffer.from(exported.data,'base64')
 assert.deepEqual(room((await unpackArchive(data)).world),room(saved))
 const edit=await api(root+'/scenes',gm.token)
 edit.scenes.scenes[0].objects[0].water.saltKg=0
 delete edit.scenes.scenes[0].physics.traction
 await api(root+'/scenes',gm.token,'PUT',{scenes:edit.scenes,revision:edit.revision})
 await f.restart()
 const olderClientEdit=room(await world())
 assert.equal(olderClientEdit.objects[0].water.saltKg,0)
 assert.deepEqual(olderClientEdit.physics.traction,scene.physics.traction)
 const response=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+(await world()).revision,{
  method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:data,
 })
 const restore=await response.json();assert.equal(response.status,200,JSON.stringify(restore))
 await api(root+'/archive/apply',gm.token,'POST',{previewId:restore.id,generation:restore.generation,
  reason:'Вернуть состояние переправы',commandKey:crypto.randomUUID()})
 const restored=await world()
 assert.deepEqual(room(restored),room(saved));assert.deepEqual(restored.characters,saved.characters)
 assert.equal(restored.campaign.seconds,40)
 const finish={revision:restored.revision,title:'Переправа открыта',summary:'Оба игрока завершили переход.',
  keepPending:false,commandKey:crypto.randomUUID()}
 const ended=await api(session+'/finish',gm.token,'POST',finish),final=await world()
 await f.restart()
 assert.deepEqual(await world(),final)
 const repeat=await api(session+'/finish',gm.token,'POST',finish)
 assert.equal(repeat.duplicate,true);assert.deepEqual(repeat.result,ended.result)
 for(const [id,user] of [[mageId,mage],[scoutId,scout]]){
  const player=await api(session,user.token)
  assert.equal(player.phase,'finished');assert.equal(player.result.summary,finish.summary)
  assert.equal((await view(id,user)).closed,true)
 }
})
