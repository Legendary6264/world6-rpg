import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
import {createTabletopObject} from '../generated/tabletopCatalog.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
import {physicsMaterialPreset} from '../generated/physicsMaterials.mjs'
import {unpackArchive} from '../campaign-archive-format.mjs'
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

for(const dialect of ['sqlite','postgres'])test('Звуки событий: дверь, маршрут, фокус, маскировка и приватный журнал · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('sound-gm')
 const caster=await f.register('sound-caster'),listener=await f.register('sound-listener')
 const {id}=await api('/lobbies',gm.token,'POST',{...lobbyBody,visibility:'private'},201)
 const root='/lobbies/'+id,decl=root+'/declarations',session=root+'/play/session'
 const world=()=>api(root+'/world',gm.token),route=actorId=>root+'/characters/'+actorId
 const {inviteCode}=await api(root,gm.token)
 async function join(player,id,name){
  await api('/lobbies/join',player.token,'POST',{code:inviteCode})
  await api('/characters/'+id,player.token,'PUT',{character:{...createDefaultCharacter(),id,name},revision:-1})
  const hero=await api(root+'/characters',player.token,'POST',{characterId:id},201)
  await api(route(hero.id)+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
  return hero.id
 }
 const casterId=await join(caster,'sound-source-a','Маг'),listenerId=await join(listener,'sound-source-b','Дозорный')
 const initial=await world(),mage=initial.characters.find(a=>a.id===casterId)
 mage.rpg.formulas=[];mage.resources.mana={maximum:'20',current:'20'};mage.statistics.energyRegeneration='0'
 mage.rpg.abilities=[{...emptyAbility(),id:'sound-spell',templateId:'sound-template',name:'Хлопок',approved:true,
  rangeM:12,mechanism:'effect',spatial:{shape:'point',includeCaster:false},cost:{mana:1,shadow:0,stamina:0}}]
 initial.campaign.scenes=createScene(emptyScenes(),'sound-hall','Коридор','top')
 const room=snapshot=>snapshot.campaign.scenes.scenes[0],scene=room(initial),point=(x,y,z=0)=>({x,y,z})
 Object.assign(scene,{width:16,depth:12,minZ:0,maxZ:4})
 scene.physics={version:1,gravityMs2:9.81,ambientTemperatureK:293.15,backgroundNoiseDb:43,eventSounds:true}
 const door={...createTabletopObject('timber-door','private-passage',point(8,5),90),
  name:'PRIVATE-PASSAGE',width:.2,depth:1.2,height:3}
 const walls=[[0,4.4],[5.6,12]].map(([min,max],i)=>({
  ...createTabletopObject('stone-wall','wall-'+i,point(8,(min+max)/2),90),width:.2,depth:max-min,height:3,
 }))
 const fan={...sceneObject('lamp','private-fan',point(11,4)),name:'PRIVATE-FAN',active:true,blocksMovement:false,height:1.5,
  physics:{version:1,material:physicsMaterialPreset('steel'),massKg:3,temperatureK:293.15,wetnessFraction:0,noiseLevelDbAt1m:46}}
 scene.objects=[door,...walls,fan]
 const token=(actorId,p)=>({actorId,...p,diameter:.6,support:{kind:'ground'}})
 scene.tokens=[token(casterId,point(6.5,5)),token(listenerId,point(11,7))]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 for(const [id,user,objects] of [[casterId,caster,[{objectId:door.id,visible:true}]],[listenerId,listener,[]]]){
  await api(route(id)+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{
   activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Коридор',description:'',objects,contacts:[],
    areas:[{id:'known',x:0,y:0,z:0,width:16,depth:12,height:4,visible:true}]}],
  }})
  await api(session+'/ready',user.token,'PUT',{ready:true})
 }
 await api(session+'/start',gm.token,'POST',{revision:(await world()).revision})
 await api(decl,gm.token,'POST',{revision:(await world()).revision,sceneId:scene.id,
  participantIds:[casterId,listenerId],durationSeconds:12,allowReplace:true},201)
 const wait=(seconds,listening)=>({kind:'wait',seconds,note:'',...(listening?{listening}:{})})
 const operate=operation=>({kind:'interact',target:{kind:'object',id:door.id},operation,note:''})
 const prepare={kind:'ability',stage:'prepare',abilityId:'sound-spell',target:{kind:'none'},note:''}
 const release={...prepare,stage:'release',target:{kind:'point',point:point(5,3,1.5)}}
 const plans=[
  [casterId,caster,[prepare,release,operate('open'),wait(3),prepare,release,wait(2),prepare,release,operate('open'),operate('close')]],
  [listenerId,listener,[wait(2.75),{kind:'move',route:[point(11,3)],support:'ground',note:''},
   wait(2.25,{mode:'listen',target:{kind:'point',point:point(8,5)}}),wait(3.5)]],
 ]
 for(const [id,user,actions] of plans){
  const path=route(id)+'/declarations',v=await api(path,user.token)
  await api(path,user.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:0,controlStamp:v.controlStamp,actions})
 }
 const {id:collectionId,epoch}=(await world()).campaign.declarations.active
 const changeCollection=(epoch,operation)=>api(decl,gm.token,'PATCH',{collectionId,epoch,operation})
 await changeCollection(epoch,'close')
 const before=await world()
 const hit={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',
  gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,
  bleedingMlPerSecond:0,injury:'',note:''}
 const key=i=>'new:'+casterId+':'+i
 const rule=(i,charge='')=>({key:key(i),kind:'ability',confirmed:true,binding:'unbound',charge,input:hit})
 const rules=[0,4,7].flatMap(i=>[rule(i),{...rule(i+1,'prepare:'+key(i)),spatialConfirmed:true,physics:{kind:'sound',levelDbAt1m:60}}])
 const request={revision:before.revision,collectionId,epoch:before.campaign.declarations.active.epoch,input:{
  timings:plans.map(([actorId,,actions])=>({actorId,entryRevision:1,budgetMs:12000,
   costs:actions.flatMap(({kind},index)=>kind==='wait'?[]:[{index,personalMs:{move:2000,ability:500,interact:1000}[kind]}]),
  })),continuations:[],missingDecisions:[],interactionsConfirmed:true,rules,
  soundRecordedAt:'2099-01-01T00:00:00.000Z',
  movement:{confirmed:true,bodies:scene.tokens.map(({actorId})=>({actorId,heightM:1.8}))},
 }}
 const calculation=root+'/rounds/calculate',apply=body=>api(root+'/rounds/apply',gm.token,'POST',body)
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 await api(calculation,listener.token,'POST',request,403)
 const preview=await api(calculation,gm.token,'POST',request)
 assert.deepEqual(await world(),before)
 assert.deepEqual(preview.summary.sounds.map(s=>[s.kind,s.atMs.numerator]),[
  ['ability','1000'],['door','2000'],['ability','6000'],['ability','9000'],['door','11000'],
 ])
 const [first,opened,focused,masked,closed]=preview.summary.sounds
 const heard=s=>s.heard.find(h=>h.actorId===listenerId)
 assert.equal(heard(first),undefined);assert(heard(opened));assert.equal(heard(masked),undefined);assert(heard(closed))
 const cue=heard(focused)
 assert.equal(cue.focused,true);assert.equal(cue.viaDoor,door.name);assert.equal(cue.direction,'с юго-запада')
 assert(cue.arrivalMs>20&&cue.noiseDb-cue.signalDb>6&&cue.noiseDb-cue.signalDb<12)
 const applyBody=command(preview),{receipt}=await apply(applyBody)
 const saved=await world(),journal=(snapshot,id)=>snapshot.characters.find(a=>a.id===id).journal
 const personal=()=>api(route(listenerId)+'/perception',listener.token)
 const view=await personal()
 assert.deepEqual(view.knowledge.journal.map(n=>n.gameTime),['2 с','6 с','11 с'])
 assert.match(view.knowledge.journal[1].text,/с юго-запада/)
 assert(view.knowledge.journal[1].createdAt<'2099')
 assert.doesNotMatch(JSON.stringify(view),/PRIVATE-PASSAGE|PRIVATE-FAN|private-passage|private-fan|viaDoor|signalDb|noiseDb|Хлопок/)
 assert.equal(room(saved).tokens.find(t=>t.actorId===listenerId).y,3)
 await f.restart()
 assert.equal((await apply(applyBody)).duplicate,true);assert.deepEqual(await world(),saved)
 const exported=await api(root+'/archive',gm.token)
 assert.deepEqual(journal((await unpackArchive(Buffer.from(exported.data,'base64'))).world,listenerId),journal(saved,listenerId))
 const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:saved.revision,receiptId:receipt.id,reason:'Проверка звуков в истории'})
 await api(root+'/rounds/change/apply',gm.token,'POST',command(rollback))
 assert.equal((await personal()).knowledge.journal.length,0)
 const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:receipt.id})
 assert.deepEqual(replay.summary.sounds,preview.summary.sounds)
 await apply(command(replay));const replayed=await world()
 assert.deepEqual(replayed.characters,saved.characters)
 const replayedCollection=replayed.campaign.declarations.active
 await api(decl,gm.token,'PATCH',{collectionId:replayedCollection.id,epoch:replayedCollection.epoch,operation:'archive'})
 const edit=await api(root+'/scenes',gm.token)
 delete edit.scenes.scenes[0].physics.eventSounds
 edit.scenes.scenes[0].physics.backgroundNoiseDb=42
 await api(root+'/scenes',gm.token,'PUT',{scenes:edit.scenes,revision:edit.revision})
 assert.equal(room(await world()).physics.eventSounds,true)
 await t.test('Волна переживает границу раунда, запись старым редактором и перезапуск',async()=>{
  const settings=await api(root+'/scenes',gm.token)
  settings.scenes.scenes[0].physics.soundTravel=true
  await api(root+'/scenes',gm.token,'PUT',{scenes:settings.scenes,revision:settings.revision})
  async function declare(actorId,user,actions) {
   await api(decl,gm.token,'POST',{revision:(await world()).revision,sceneId:scene.id,participantIds:[actorId],durationSeconds:12,allowReplace:true},201)
   const path=route(actorId)+'/declarations', current=await api(path,user.token)
   await api(path,user.token,'PUT',{collectionId:current.collection.id,epoch:current.collection.epoch,baseVersion:0,controlStamp:current.controlStamp,actions})
   assert.deepEqual((await api(path,user.token)).entry.actions,actions)
   await api(decl,gm.token,'PATCH',{collectionId:current.collection.id,epoch:current.collection.epoch,operation:'close'})
   return (await world()).campaign.declarations.active
  }
  const late=await declare(casterId,caster,[operate('open')])
  const atEnd=await api(calculation,gm.token,'POST',{revision:(await world()).revision,collectionId:late.id,epoch:late.epoch,input:{
   timings:[{actorId:casterId,entryRevision:1,budgetMs:12000,costs:[{index:0,personalMs:12000}]}],
   continuations:[],missingDecisions:[],interactionsConfirmed:true,
  }})
  assert.equal(atEnd.summary.sounds[0].kind,'door');assert.equal(atEnd.summary.sounds[0].pending,2)
  assert.deepEqual(atEnd.summary.sounds[0].heard,[])
  await apply(command(atEnd))
  const pending=room(await world()).soundWaves
  assert.equal(pending.length,1)
  assert.deepEqual((await personal()).knowledge.journal,view.knowledge.journal)
  const stale=await api(root+'/scenes',gm.token)
  assert.equal(stale.scenes.scenes[0].soundWaves,undefined)
  delete stale.scenes.scenes[0].physics.soundTravel
  await api(root+'/scenes',gm.token,'PUT',{scenes:stale.scenes,revision:stale.revision})
  assert.deepEqual(room(await world()).soundWaves,pending)
  assert.equal(room(await world()).physics.soundTravel,true)
  const snapshot=await api(root+'/archive',gm.token)
  assert.deepEqual(room((await unpackArchive(Buffer.from(snapshot.data,'base64'))).world).soundWaves,pending)
  await f.restart()
  const playerPending=await personal()
  assert.equal(playerPending.map.soundTravel,true)
  assert.doesNotMatch(JSON.stringify(playerPending),/soundWaves|emittedSeconds|PRIVATE-PASSAGE|PRIVATE-FAN/)
  await api(decl,gm.token,'PATCH',{collectionId:late.id,epoch:late.epoch,operation:'archive'})
  const next=await declare(listenerId,listener,[wait(1,{mode:'listen',target:{kind:'none'}}),{
   kind:'move',route:[point(10.4,3)],support:'sneak',note:'',
  }])
  const beforeArrival=await world()
  const received=await api(calculation,gm.token,'POST',{revision:beforeArrival.revision,collectionId:next.id,epoch:next.epoch,input:{
   timings:[{actorId:listenerId,entryRevision:1,budgetMs:12000,costs:[{index:1,personalMs:1000}]}],
   continuations:[],missingDecisions:[],interactionsConfirmed:false,movement:{confirmed:true,bodies:scene.tokens.map(({actorId})=>({actorId,heightM:1.8}))},
  }})
  assert.deepEqual(await world(),beforeArrival)
  const arrival=received.summary.earlierSoundArrivals.find(h=>h.actorId===listenerId)
  assert(arrival.receivedAtMs>0&&arrival.receivedAtMs<100);assert.equal(arrival.focused,true)
  assert.equal(received.summary.sounds[0].kind,'footstep')
  const applied=await apply(command(received)), after=await world()
  assert.equal(room(after).soundWaves,undefined)
  const heard=(await personal()).knowledge.journal
  assert.equal(heard.length,view.knowledge.journal.length+1)
  assert(Number.parseFloat(heard.at(-1).gameTime)>beforeArrival.campaign.seconds)
  assert.doesNotMatch(heard.at(-1).text,/PRIVATE-PASSAGE|PRIVATE-FAN/)
  const change=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:after.revision,receiptId:applied.receipt.id,reason:'Восстановить волну в пути'})
  await api(root+'/rounds/change/apply',gm.token,'POST',command(change))
  assert.deepEqual(room(await world()).soundWaves,pending)
  assert.equal((await personal()).knowledge.journal.length,view.knowledge.journal.length)
  const again=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:applied.receipt.id})
  assert.deepEqual(again.summary.earlierSoundArrivals,received.summary.earlierSoundArrivals)
  await apply(command(again));assert.deepEqual((await personal()).knowledge.journal,heard)
  const active=(await world()).campaign.declarations.active
  await api(decl,gm.token,'PATCH',{collectionId:active.id,epoch:active.epoch,operation:'archive'})
 })
 const final=await world(), finalJournal=(await personal()).knowledge.journal
 await api(session+'/finish',gm.token,'POST',{revision:final.revision,title:'Дозор окончен',summary:'Сигналы записаны.',
  keepPending:false,commandKey:crypto.randomUUID()})
 for(const player of [caster,listener])assert.equal((await api(session,player.token)).phase,'finished')
 assert.deepEqual((await personal()).knowledge.journal,finalJournal)
})
