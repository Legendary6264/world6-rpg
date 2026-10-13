import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
for(const dialect of ['sqlite','postgres'])test('R08 речь: адресные знания, история и повтор · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('owner'),users={}
 for(const name of ['speaker','clear','part','sound','silent'])users[name]=await f.register('speech-'+name)
 const outsider=await f.register('speech-outsider'),{id}=await api('/lobbies',gm.token,'POST',{...lobbyBody,slots:6},201),root='/lobbies/'+id,ids={}
 const world=()=>api(root+'/world',gm.token)
 for(const [name,u] of Object.entries(users)){
  await api(root+'/join',u.token,'POST')
  const character={...createDefaultCharacter(),id:'source-'+name,name:'PRIVATE-NAME-'+name}
  await api('/characters/'+character.id,u.token,'PUT',{character,revision:-1})
  ids[name]=(await api(root+'/characters',u.token,'POST',{characterId:character.id},201)).id
  await api(root+'/characters/'+ids[name]+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 }
 const state=await world();state.campaign.scenes=createScene(emptyScenes(),'speech-hall','PRIVATE-SCENE','top')
 state.campaign.scenes.scenes[0].tokens=Object.values(ids).map((actorId,index)=>({id:'speech-token-'+index,actorId,x:2+index,y:5,z:0,diameter:1,support:{kind:'ground'}}))
 await api(root+'/world',gm.token,'PUT',{revision:state.revision,world:state})
 await api(root+'/declarations',gm.token,'POST',{revision:(await world()).revision,sceneId:'speech-hall',durationSeconds:5,participantIds:[ids.speaker],allowReplace:true},201)
 const route=name=>root+'/characters/'+ids[name],v=await api(route('speaker')+'/declarations',users.speaker.token)
 await api(route('speaker')+'/declarations',users.speaker.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:0,controlStamp:v.controlStamp,actions:[{kind:'speak',target:{kind:'none'},volume:'whisper',text:'У северных ворот. Пароль: ЛУНА.',note:'PRIVATE-PLAN-NOTE'}]})
 const open=await world(),c=open.campaign.declarations.active
 await api(root+'/declarations',gm.token,'PATCH',{revision:open.revision,collectionId:c.id,epoch:c.epoch,operation:'close'})
 const input={timings:[{actorId:ids.speaker,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,
  speech:[{key:'new:'+ids.speaker+':0',confirmed:true,reason:'PRIVATE-GM-REASON: слух и преграды согласованы',recordedAt:'2099-01-01T00:00:00.000Z',hearers:[
   {actorId:ids.clear,clarity:'clear',speaker:'Незнакомый голос',fragment:'',signs:''},
   {actorId:ids.part,clarity:'fragment',speaker:'Незнакомый голос',fragment:'У северных ворот',signs:''},
   {actorId:ids.sound,clarity:'sound',speaker:'Шёпот за стеной',fragment:'',signs:'Не удалось разобрать слова'}]}]}
 const body=async(next=input)=>{const w=await world(),c=w.campaign.declarations.active;return {revision:w.revision,collectionId:c.id,epoch:c.epoch,input:next}}
 const calc=async(next=input,status=200,token=gm.token)=>api(root+'/rounds/calculate',token,'POST',await body(next),status)
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=(b,status=200,token=gm.token)=>api(root+'/rounds/apply',token,'POST',b,status)
 let preview,receipt,savedCommand,after,spoken
 await t.test('Игрок не получает расчёт/историю или чужой журнал; неверное раскрытие не создаёт знаний',async()=>{
  for(const token of [users.speaker.token,users.clear.token]){await calc(input,403,token);await api(root+'/rounds/history',token,'GET',undefined,403)}
  await api(route('clear')+'/perception',users.silent.token,'GET',undefined,403)
  await api(route('clear')+'/perception',outsider.token,'GET',undefined,403)
  for(const bad of [{...input,speech:undefined},{...input,speech:[{...input.speech[0],confirmed:false}]},{...input,speech:[{...input.speech[0],hearers:[{...input.speech[0].hearers[1],fragment:'ВЫДУМАННЫЕ СЛОВА'}]}]}])await calc(bad,400)
  assert((await world()).characters.every(a=>a.journal.length===0))
 })
 await t.test('Серверный предпросмотр содержит решение ГМ, но не меняет мир или журнал слушателей',async()=>{
  const before=await world();preview=await calc();assert.equal(preview.summary.speech[0].heard.length,3);assert.deepEqual(await world(),before)
  for(const [name,u] of Object.entries(users)){const view=await api(route(name)+'/perception',u.token);assert.equal(view.knowledge.journal.length,0);if(name!=='speaker')assert(!JSON.stringify(await api(root+'/world',u.token)).includes('ЛУНА'))}
 })
 await t.test('Ошибка аудита откатывает записи говорящего и всех слушателей вместе с раундом',async()=>{
  const before=await world(),db=f.server.db,original=db.transaction
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('apply-round'))throw Error('SPEECH-TEST-AUDIT');return tx.run(sql,args)}}))
  try{await apply(command(preview),500)}finally{db.transaction=original}
  assert.deepEqual(await world(),before);assert.equal((await db.get('SELECT COUNT(*) AS n FROM round_receipts WHERE lobby_id=?',[id])).n,0)
 })
 await t.test('Применение записывает только услышанное и не раскрывает подслушивающих или личность',async()=>{
  savedCommand=command(preview);receipt=(await apply(savedCommand)).receipt;after=await world();spoken=structuredClone(after);assert.equal(after.campaign.seconds,5)
  for(const [name,u] of Object.entries(users)){
   const view=await api(route(name)+'/perception',u.token),words=JSON.stringify(view.knowledge.journal)
   assert.equal(view.knowledge.journal.length,name==='silent'?0:1)
   if(['speaker','clear'].includes(name))assert(words.includes('ЛУНА'));else assert(!words.includes('ЛУНА'))
   if(name==='part')assert(words.includes('северных ворот'));if(name==='sound')assert(!words.includes('северных'))
   for(const secret of ['PRIVATE-GM-REASON','PRIVATE-PLAN-NOTE','PRIVATE-SCENE',ids.clear,ids.part,ids.sound])assert(!words.includes(secret),secret)
   if(name!=='speaker')assert(!words.includes('PRIVATE-NAME-speaker'))
   const projection=JSON.stringify(await api(root+'/world',u.token));if(!['speaker','clear'].includes(name))assert(!projection.includes('ЛУНА'))
  }
  await api(route('clear')+'/knowledge/'+after.characters.find(a=>a.id===ids.clear).journal[0].id,users.clear.token,'PATCH',{revision:after.revision,annotation:'Моё сомнение',text:'Подмена слов'})
  after=await world();const note=after.characters.find(a=>a.id===ids.clear).journal[0];assert(note.text.includes('ЛУНА'));assert(!note.text.includes('Подмена'));assert.equal(note.annotation,'Моё сомнение');assert(note.createdAt<'2099');assert.equal(after.characters.find(a=>a.id===ids.speaker).journal[0].createdAt,note.createdAt)
 })
 await f.restart()
 await t.test('Повтор после перезапуска не создаёт второй разговор и не продвигает часы',async()=>{
  const repeat=await apply(savedCommand);assert(repeat.duplicate);assert.deepEqual(repeat.receipt,receipt);assert.deepEqual(await world(),after)
  await apply(savedCommand,403,users.speaker.token);await apply({...savedCommand,world:after},400)
 })
 await t.test('Откат убирает записи этой ветки; точная переигровка возвращает только прежние слова',async()=>{
  const h=await api(root+'/rounds/history',gm.token),p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:h.revision,receiptId:receipt.id,reason:'Переиграть разговор'})
  const rollback=await api(root+'/rounds/change/apply',gm.token,'POST',command(p));assert.equal(rollback.receipt.summary.operation,'rollback')
  const restored=await world();assert.equal(restored.campaign.seconds,0);assert(restored.characters.every(a=>a.journal.length===0));await apply(savedCommand,409)
  const history=await api(root+'/rounds/history',gm.token),replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:history.revision,receiptId:receipt.id});await apply(command(replay))
  const replayed=await world();assert.equal(replayed.campaign.seconds,5)
  for(const name of Object.keys(ids))assert.deepEqual(replayed.characters.find(a=>a.id===ids[name]).journal,spoken.characters.find(a=>a.id===ids[name]).journal)
 })
 await t.test('Выход из лобби отзывает чтение прежнего журнала через API',async()=>{
  await api(root+'/members/'+users.clear.user.id,users.clear.token,'DELETE')
  await api(route('clear')+'/perception',users.clear.token,'GET',undefined,403)
  await api(root+'/world',users.clear.token,'GET',undefined,403)
 })
})
