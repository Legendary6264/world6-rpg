import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
for(const dialect of ['sqlite','postgres'])test('R08 намерение слушать: цели, приватность и продолжение · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('owner'),listener=await f.register('listen-player'),speaker=await f.register('listen-speaker')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id,ids={}
 const world=()=>api(root+'/world',gm.token),route=name=>root+'/characters/'+ids[name]
 for(const [name,u] of [['listener',listener],['speaker',speaker]]){
  await api(root+'/join',u.token,'POST');const character={...createDefaultCharacter(),id:'source-'+name,name:name}
  await api('/characters/'+character.id,u.token,'PUT',{character,revision:-1});ids[name]=(await api(root+'/characters',u.token,'POST',{characterId:character.id},201)).id
  await api(route(name)+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 const initial=await world();initial.campaign.scenes=createScene(emptyScenes(),'listen-hall','PRIVATE-HALL','top')
 initial.campaign.scenes.scenes[0].tokens=Object.values(ids).map((actorId,index)=>({id:'listen-token-'+index,actorId,x:5+index,y:5,z:0,diameter:1,support:{kind:'ground'}}))
 initial.campaign.scenes.scenes[0].objects=[sceneObject('door','known-door',{x:10,y:5,z:0}),sceneObject('door','hidden-door',{x:24,y:5,z:0})]
 await api(root+'/world',gm.token,'PUT',{revision:initial.revision,world:initial})
 await api(root+'/declarations',gm.token,'POST',{revision:(await world()).revision,sceneId:'listen-hall',durationSeconds:5,participantIds:Object.values(ids),allowReplace:true},201)
 const send=async(action,status=200)=>{const v=await api(route('listener')+'/declarations',listener.token);return api(route('listener')+'/declarations',listener.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry?.revision??0,controlStamp:v.controlStamp,actions:[action]},status)}
 const attention=target=>({kind:'wait',seconds:7,note:'LISTENING-SECRET',listening:{mode:'eavesdrop',target}})
 await t.test('Прислушивание без конкретной цели допустимо; координаты требуют индивидуальной схемы',async()=>{
  await send(attention({kind:'none'}));await send(attention({kind:'point',point:{x:10,y:5,z:3}}),409)
  const v=await api(route('listener')+'/declarations',listener.token);assert.equal(v.entry.actions[0].listening.mode,'eavesdrop');assert.equal(v.entry.actions[0].listening.target.kind,'none')
 })
 const disclosure=await api(route('listener')+'/disclosure',gm.token)
 await api(route('listener')+'/disclosure',gm.token,'PUT',{revision:disclosure.revision,draft:{activeSceneId:'listen-hall',scenes:[{sceneId:'listen-hall',title:'Зал',description:'',areas:[{id:'known-floor',x:0,y:0,z:0,width:15,depth:10,height:5,visible:true}],objects:[{objectId:'known-door',visible:true}],contacts:[{actorId:ids.speaker,kind:'silhouette',label:'Фигура',signs:'',showHeight:false,point:{x:6,y:5,z:0},radius:1}]}]}})
 let chosen,preview,receipt,command,after
 await t.test('Фокус проверяется по раскрытию: XYZ, известный объект и контакт допустимы, чужие ID отвергаются',async()=>{
  await send(attention({kind:'point',point:{x:10.25,y:5.5,z:3}}));await send(attention({kind:'point',point:{x:100,y:5,z:0}}),400)
  await send(attention({kind:'object',id:'known-door'}));await send(attention({kind:'object',id:'hidden-door'}),409)
  const options=(await api(route('listener')+'/declarations',listener.token)).options;chosen=options.targets.find(t=>t.kind==='contact').id
  await send(attention({kind:'contact',id:ids.speaker}),409);await send(attention({kind:'contact',id:chosen}))
  const view=await api(route('listener')+'/declarations',listener.token);assert.equal(view.entry.actions[0].listening.target.id,chosen);assert(!JSON.stringify(view.entry).includes(ids.speaker))
 })
 await t.test('Намерение и заметка не попадают в планы и мир другого игрока; скрытность клиентом не назначается',async()=>{
  const other=await api(route('speaker')+'/declarations',speaker.token);assert.equal(other.entry,null);assert(!JSON.stringify(other).includes('eavesdrop'));assert(!JSON.stringify(other).includes('LISTENING-SECRET'))
  const projection=JSON.stringify(await api(root+'/world',speaker.token));assert(!projection.includes('eavesdrop'));assert(!projection.includes('LISTENING-SECRET'));assert(!projection.includes(chosen))
  for(const bad of [{...attention({kind:'none'}),listening:{mode:'eavesdrop',target:{kind:'none'},success:true}},attention({kind:'area',point:{x:1,y:1,z:0}})])await send(bad,400)
  assert.equal((await api(route('listener')+'/declarations',listener.token)).entry.actions[0].listening.target.id,chosen)
 })
 const speakerView=await api(route('speaker')+'/declarations',speaker.token)
 await api(route('speaker')+'/declarations',speaker.token,'PUT',{collectionId:speakerView.collection.id,epoch:speakerView.collection.epoch,baseVersion:0,controlStamp:speakerView.controlStamp,actions:[{kind:'speak',target:{kind:'none'},volume:'whisper',text:'У ворот. ПАРОЛЬ ЛУНА.',note:''}]})
 const beforeClose=await world(),c=beforeClose.campaign.declarations.active
 await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
 const calc=async()=>{const w=await world(),c=w.campaign.declarations.active;return api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:c.entries.map(e=>({actorId:e.actorId,entryRevision:e.revision,budgetMs:5000,costs:e.actions[0].kind==='wait'?[]:[{index:0,personalMs:1000}]})),continuations:[],missingDecisions:[],interactionsConfirmed:false,speech:[{key:'new:'+ids.speaker+':0',confirmed:true,reason:'Мастер раскрыл только начало шёпота',recordedAt:'2026-10-12T11:45:00.000Z',hearers:[{actorId:ids.listener,clarity:'fragment',speaker:'Голос',fragment:'У ворот',signs:''}]}]}})}
 const cmd=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=b=>api(root+'/rounds/apply',gm.token,'POST',b)
 await t.test('Предпросмотр внимания не меняет знания; применение слышимости создаёт только фрагмент',async()=>{
  const before=await world();preview=await calc();assert.deepEqual(await world(),before);assert.equal(preview.summary.listeningWindows[0].mode,'eavesdrop');assert.equal(preview.summary.listeningWindows[0].completes,false);assert.equal(preview.summary.listeningWindows[0].toMs.numerator,'5000')
  command=cmd(preview);receipt=(await apply(command)).receipt;after=await world();assert.equal(after.campaign.seconds,5)
  const work=after.campaign.roundWork.entries[0];assert.equal(work.action.listening.target.id,chosen);assert.equal(work.amount.remaining.numerator,'2000')
  const heard=(await api(route('listener')+'/perception',listener.token)).knowledge.journal;assert.equal(heard.length,1);assert(heard[0].text.includes('У ворот'));assert(!heard[0].text.includes('ЛУНА'))
  const said=(await api(route('speaker')+'/perception',speaker.token)).knowledge.journal;assert(!JSON.stringify(said).includes('eavesdrop'));assert(!JSON.stringify(said).includes(chosen));assert(!JSON.stringify(await api(root+'/world',speaker.token)).includes('LISTENING-SECRET'))
 })
 await f.restart()
 await t.test('Повтор после перезапуска сохраняет остаток и журнал без второго применения',async()=>{
  const repeated=await apply(command);assert(repeated.duplicate);assert.deepEqual(repeated.receipt,receipt);assert.deepEqual(await world(),after)
 })
 let continuation,completed
 await t.test('Следующий сбор завершает только оставшееся время слушания без автоматических новых слов',async()=>{
  const old=(await world()).campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:old.id,epoch:old.epoch,operation:'archive'})
  await api(root+'/declarations',gm.token,'POST',{revision:(await world()).revision,sceneId:'listen-hall',durationSeconds:5,participantIds:[ids.listener],allowReplace:true},201)
  const open=(await world()).campaign.declarations.active;await api(root+'/declarations',gm.token,'PATCH',{collectionId:open.id,epoch:open.epoch,operation:'close'})
  const before=await world(),active=before.campaign.declarations.active,p=await api(root+'/rounds/calculate',gm.token,'POST',{revision:before.revision,collectionId:active.id,epoch:active.epoch,input:{timings:[],continuations:[{actorId:ids.listener,mode:'continue',budgetMs:9000}],missingDecisions:[],interactionsConfirmed:false}})
  assert.equal(p.summary.listeningWindows[0].toMs.numerator,'2000');assert(p.summary.listeningWindows[0].completes);assert.equal(p.summary.speech,undefined)
  continuation=(await apply(cmd(p))).receipt;completed=await world();assert.equal(completed.campaign.seconds,10);assert.equal(completed.campaign.roundWork.entries.length,0)
  assert.deepEqual(completed.characters.find(a=>a.id===ids.listener).journal,after.characters.find(a=>a.id===ids.listener).journal)
 })
 await t.test('Откат продолжения восстанавливает намерение, а точная переигровка сохраняет прежнюю слышимость',async()=>{
  const h=await api(root+'/rounds/history',gm.token),p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:h.revision,receiptId:continuation.id,reason:'Повторить слушание'})
  await api(root+'/rounds/change/apply',gm.token,'POST',cmd(p));const restored=await world();assert.equal(restored.campaign.seconds,5);assert.equal(restored.campaign.roundWork.entries[0].action.listening.mode,'eavesdrop');assert.equal(restored.campaign.roundWork.entries[0].action.listening.target.id,chosen)
  const history=await api(root+'/rounds/history',gm.token),replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:history.revision,receiptId:continuation.id});await apply(cmd(replay));const again=await world();assert.equal(again.campaign.seconds,10);assert.deepEqual(again.characters.find(a=>a.id===ids.listener).journal,completed.characters.find(a=>a.id===ids.listener).journal)
 })
})
