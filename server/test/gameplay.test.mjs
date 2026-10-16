import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'

for(const dialect of ['sqlite','postgres'])test('Игровая сцена: подготовка, личная карта, реальный ход и сохранение · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('play-gm'),player=await f.register('play-player'),stranger=await f.register('play-stranger')
 const {id}=await api('/lobbies/from-example',gm.token,'POST',{exampleId:'night-crossing',version:1,title:'Настоящая игровая сцена',slots:4,commandKey:'starter:'+crypto.randomUUID()},201),root='/lobbies/'+id
 const lobby=await api(root,gm.token);await api('/lobbies/join',player.token,'POST',{code:lobby.inviteCode})
 const source={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Игровой герой'}
 await api('/characters/'+source.id,player.token,'PUT',{character:source,revision:-1})
 const hero=(await api(root+'/characters',player.token,'POST',{characterId:source.id},201)).id
 await api(root+'/characters/'+hero,gm.token,'PATCH',{approved:true})
 const before=await api(root+'/world',gm.token),setupView=await api(root+'/play/setup',gm.token),scene=setupView.scenes.scenes[0],guide=scene.tokens[0].actorId,door=scene.objects.find(o=>o.kind==='door')
 const setup={sceneId:scene.id,actorIds:[hero],objectIds:[door.id],contactIds:[],title:'Открытый проход',description:'Описание для героев',anchor:{x:3,y:3,z:scene.groundZ},revealTerrain:true}
 const launch=(patch={},status=200,token=gm.token,rev)=>api(root+'/play/setup',token,'POST',{revision:rev??setupView.revision,setup:{...setup,...patch}},status)
 await t.test('Игрок и посторонний не получают редактор и не запускают сцену',async()=>{
  await api(root+'/play/setup',player.token,'GET',undefined,403);await api(root+'/play/setup',stranger.token,'GET',undefined,403)
  await launch({},403,player.token);await launch({},403,stranger.token)
 })
 await t.test('Требуются раскрытие, принятый герой и актуальная версия; отказ не меняет мир',async()=>{
  await launch({revealTerrain:false},400);await launch({actorIds:[guide]},400);await launch({contactIds:['unknown']},400);await launch({anchor:{x:-10,y:0,z:0}},400)
  await launch({},409,gm.token,setupView.revision-1)
  assert.deepEqual(await api(root+'/world',gm.token),before)
 })
 await t.test('Герой размещён и видит только выбранные объекты; NPC не раскрыты',async()=>{
  await launch();const after=await api(root+'/world',gm.token),view=await api(root+'/characters/'+hero+'/perception',player.token)
  assert.equal(after.campaign.seconds,before.campaign.seconds);assert.equal(view.seconds,before.campaign.seconds)
  assert.equal(after.campaign.scenes.scenes[0].tokens.filter(t=>t.actorId===hero).length,1)
  assert.equal(view.map.title,setup.title);assert.equal(view.map.description,setup.description)
  assert.deepEqual(view.map.objects.map(o=>o.id),[door.id]);assert.deepEqual(view.map.contacts.map(c=>c.kind),['self'])
  assert(!JSON.stringify(view).includes(guide));assert(!JSON.stringify(view).includes('Кладовщица'))
  const fresh=(await api(root,gm.token)).revision
  await launch({contactIds:[guide]},200,gm.token,fresh)
  assert((await api(root+'/characters/'+hero+'/perception',player.token)).map.contacts.some(c=>c.label==='Проводник'))
 })
 await t.test('На открытой сцене принимается настоящий маршрут; подготовка не сбрасывает активный раунд',async()=>{
  const revision=(await api(root,gm.token)).revision
  await api(root+'/declarations',gm.token,'POST',{revision,sceneId:scene.id,participantIds:[hero],durationSeconds:5,allowReplace:true},201)
  const d=await api(root+'/characters/'+hero+'/declarations',player.token),c=d.collection
  await api(root+'/characters/'+hero+'/declarations',player.token,'PUT',{collectionId:c.id,epoch:c.epoch,baseVersion:0,controlStamp:d.controlStamp,actions:[{kind:'move',route:[{x:5,y:3,z:0}],support:'ground',note:''}]})
  const sent=await api(root+'/world',gm.token)
  await launch({},400,gm.token,(await api(root,gm.token)).revision)
  assert.deepEqual(await api(root+'/world',gm.token),sent)
  await f.restart();assert.deepEqual(await api(root+'/world',gm.token),sent)
  assert.equal((await api(root+'/characters/'+hero+'/declarations',player.token)).entry.status,'submitted')
 })
 await t.test('Следующий раунд открывается атомарно после применения, без повторного хода и перевода часов',async()=>{
  let state=await api(root+'/world',gm.token),c=state.campaign.declarations.active
  const nextBody=()=>({revision:state.revision,collectionId:c.id,epoch:c.epoch})
  await api(root+'/declarations/next',player.token,'POST',nextBody(),403)
  await api(root+'/declarations/next',gm.token,'POST',nextBody(),409)
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
  state=await api(root+'/world',gm.token);c=state.campaign.declarations.active
  await api(root+'/declarations/next',gm.token,'POST',nextBody(),409)
  const preview=await api(root+'/rounds/calculate',gm.token,'POST',{...nextBody(),input:{timings:[{actorId:hero,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:true,movement:{confirmed:true,bodies:state.campaign.scenes.scenes[0].tokens.map(t=>({actorId:t.actorId,heightM:2}))}}})
  await api(root+'/rounds/apply',gm.token,'POST',{previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()})
  state=await api(root+'/world',gm.token);c=state.campaign.declarations.active
  const view=await api(root+'/characters/'+hero+'/declarations',player.token)
  assert.equal(view.executed,true);assert.deepEqual(view.readiness,[{userId:player.user.id,ready:true}])
  await api(root+'/declarations/next',gm.token,'POST',{...nextBody(),revision:state.revision-1},409)
  const replies=await Promise.all([f.request(root+'/declarations/next',gm.token,'POST',nextBody()),f.request(root+'/declarations/next',gm.token,'POST',nextBody())])
  assert.deepEqual(replies.map(r=>r.status).sort(),[201,409])
  const next=await api(root+'/world',gm.token)
  assert.equal(next.campaign.seconds,state.campaign.seconds);assert.equal(next.campaign.declarations.archive.length,1)
  assert.equal(next.campaign.declarations.archive[0].id,c.id);assert.notEqual(next.campaign.declarations.active.id,c.id)
  assert.deepEqual(next.campaign.declarations.active.participantIds,[hero]);assert.deepEqual(next.campaign.declarations.active.entries,[])
  assert.equal(next.campaign.declarations.active.durationSeconds,5)
  assert.equal((await api(root+'/characters/'+hero+'/declarations',player.token)).executed,false)
  await f.restart();assert.deepEqual(await api(root+'/world',gm.token),next)
 })
 await t.test('Долгий осмотр переносится, а подтверждённый результат получает только свой герой один раз',async()=>{
  await api('/lobbies/join',stranger.token,'POST',{code:lobby.inviteCode})
  let d=await api(root+'/characters/'+hero+'/declarations',player.token),c=d.collection
  await api(root+'/characters/'+hero+'/declarations',player.token,'PUT',{collectionId:c.id,epoch:c.epoch,baseVersion:0,controlStamp:d.controlStamp,actions:[{kind:'interact',target:{kind:'object',id:door.id},operation:'inspect',note:''}]})
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
  let state=await api(root+'/world',gm.token);c=state.campaign.declarations.active
  const secret='В щели виден знак, различимый только осматривающему.'
  const decision={key:'new:'+hero+':0',confirmed:true,text:secret,recordedAt:new Date().toISOString()}
  const base={revision:state.revision,collectionId:c.id,epoch:c.epoch,input:{timings:[{actorId:hero,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:8000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:true}}
  await api(root+'/rounds/calculate',gm.token,'POST',base,400)
  await api(root+'/rounds/calculate',gm.token,'POST',{...base,input:{...base.input,inspections:[{...decision,confirmed:false}]}},400)
  const preview=await api(root+'/rounds/calculate',gm.token,'POST',{...base,input:{...base.input,inspections:[decision]}})
  assert(!JSON.stringify(await api(root+'/characters/'+hero+'/perception',player.token)).includes(secret))
  await api(root+'/rounds/apply',gm.token,'POST',{previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()})
  const partial=await api(root+'/characters/'+hero+'/perception',player.token)
  assert(!JSON.stringify(partial).includes(secret));assert.equal(partial.work.length,1)
  state=await api(root+'/world',gm.token);c=state.campaign.declarations.active
  await api(root+'/declarations/next',gm.token,'POST',{revision:state.revision,collectionId:c.id,epoch:c.epoch},201)
  state=await api(root+'/world',gm.token);c=state.campaign.declarations.active
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
  state=await api(root+'/world',gm.token);c=state.campaign.declarations.active
  const finish=await api(root+'/rounds/calculate',gm.token,'POST',{revision:state.revision,collectionId:c.id,epoch:c.epoch,input:{timings:[],continuations:[{actorId:hero,mode:'continue',budgetMs:5000}],missingDecisions:[],interactionsConfirmed:true,inspections:[{...decision,key:state.campaign.roundWork.entries[0].id}]}})
  const command={previewId:finish.id,generation:finish.generation,commandKey:crypto.randomUUID()}
  await api(root+'/rounds/apply',gm.token,'POST',command);await api(root+'/rounds/apply',gm.token,'POST',command)
  const own=await api(root+'/characters/'+hero+'/perception',player.token)
  assert.equal(own.knowledge.journal.filter(e=>e.text===secret).length,1);assert.equal(own.work.length,0)
  assert(!JSON.stringify(await api(root+'/world?view=player',stranger.token)).includes(secret))
  await api(root+'/characters/'+hero+'/perception',stranger.token,'GET',undefined,403)
 })
})
