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
})
