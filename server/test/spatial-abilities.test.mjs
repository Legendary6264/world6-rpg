import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
import {physicsMaterialPreset} from '../generated/physicsMaterials.mjs'
const fields={region:'torso',distanceM:999,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'SPATIAL-SECRET-NOTE'}
for(const dialect of ['sqlite','postgres'])test('Пространственный выпуск: API, снимок и повтор · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('space-owner'),player=await f.register('space-player')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id;await api(root+'/join',player.token,'POST')
 const character={...createDefaultCharacter(),id:'space-source',name:'Маг'};await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
 const heroId=(await api(root+'/characters',player.token,'POST',{characterId:character.id},201)).id,route=root+'/characters/'+heroId,world=()=>api(root+'/world',gm.token),hero=w=>w.characters.find(c=>c.id===heroId)
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world(),owner=hero(initial);owner.rpg.formulas=[];owner.statistics.energyRegeneration='0';owner.resources.mana={maximum:'50',current:'50'}
 owner.rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'spell-template',name:'Область',approved:true,spatial:{shape:'sphere',includeCaster:false,radiusM:1},rangeM:10,mechanism:'effect',duration:30,cost:{mana:7,shadow:0,stamina:0},modifiers:[{parameter:'movement',flat:3,percent:0}]}]
 const npcs=['SPACE-SECRET-B','SPACE-SECRET-C','SPACE-SECRET-D'].map(id=>({...createDefaultCharacter(),id,name:id+'-NAME'}));for(const a of npcs){a.rpg.formulas=[];a.statistics.energyRegeneration='0'}initial.characters.push(...npcs)
 initial.campaign.scenes=createScene(emptyScenes(),'space-scene','Сцена','top');initial.campaign.scenes.scenes[0].tokens=[{actorId:heroId,x:2,y:2,z:0},{actorId:npcs[0].id,x:8,y:2,z:0},{actorId:npcs[1].id,x:9,y:2,z:0},{actorId:npcs[2].id,x:8,y:2,z:3}].map(p=>({...p,diameter:1,support:{kind:p.z?'air':'ground'}}))
 initial.campaign.scenes.scenes[0].objects=[{...sceneObject('lamp','torch',{x:8,y:2,z:0}),height:1,name:'Фонарь',active:true},{...sceneObject('lamp','outside-torch',{x:18,y:2,z:0}),height:1,name:'Дальний фонарь',active:true}]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 const disclose=async shown=>api(route+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{activeSceneId:shown?'space-scene':null,scenes:shown?[{sceneId:'space-scene',title:'Площадка',description:'',areas:[{id:'area',x:0,y:0,z:-5,width:20,depth:20,height:25,visible:true}],objects:[],contacts:[]}]:[]}})
 const start=async()=>api(root+'/declarations',gm.token,'POST',{sceneId:'space-scene',participantIds:[heroId],durationSeconds:5,allowReplace:true,revision:(await world()).revision},201),phase=async operation=>{const c=(await world()).campaign.declarations.active;return api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation})}
 const view=()=>api(route+'/declarations',player.token),send=async(stage,target,status=200,selectedCast)=>{const v=await view();return api(route+'/declarations',player.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry?.revision??0,controlStamp:v.controlStamp,actions:[{kind:'ability',abilityId:'spell',stage,target,note:'',...(selectedCast?{castId:selectedCast}:{})}]},status)}
 const decision=(key,charge='')=>({key,kind:'ability',confirmed:true,binding:'unbound',charge,input:fields,spatialConfirmed:!!charge})
 const body=async(cost=8000,charge='')=>{const w=await world(),c=w.campaign.declarations.active,work=w.campaign.roundWork?.entries[0];return {revision:w.revision,collectionId:c.id,epoch:c.epoch,input:{timings:c.entries.map(e=>({actorId:heroId,entryRevision:e.revision,budgetMs:5000,costs:[{index:0,personalMs:cost}]})),continuations:work?[{actorId:heroId,mode:'continue',budgetMs:3000}]:[],missingDecisions:[],interactionsConfirmed:false,rules:[decision(work?.id??'new:'+heroId+':0',charge)]}}}
 const calc=async(cost,charge)=>api(root+'/rounds/calculate',gm.token,'POST',await body(cost,charge)),command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=(b,status=200)=>api(root+'/rounds/apply',gm.token,'POST',b,status)
 let castId,releaseCommand
 await t.test('Координатам нужна открытая схема; новые виды цели проверяют границы и не раскрывают NPC',async()=>{
  await start();await send('release',{kind:'area',point:{x:8,y:2,z:0}},409);await send('release',{kind:'direction',point:{x:8,y:2,z:0}},409)
  await disclose(true);await send('release',{kind:'area',point:{x:1e6,y:2,z:0}},400);await send('release',{kind:'direction',point:{x:8,y:2,z:1e6}},400)
  assert.deepEqual((await view()).options.abilities[0].spatial,owner.rpg.abilities[0].spatial);assert(!JSON.stringify(await view()).includes('SPACE-SECRET'))
  await send('prepare',{kind:'none'});await phase('close');const before=await world(),p=await calc();assert.deepEqual(await world(),before);await apply(command(p));const after=await world();castId=hero(after).rpg.casts[0].id
  assert.equal(hero(after).resources.mana.current,'43');assert.equal(hero(after).rpg.casts[0].status,'preparing')
 })
 await f.restart()
 await t.test('Перезапуск и перенос сохраняют снимок формы, готовность и один расход',async()=>{
  const before=await world(),backup=await api(root+'/backup',gm.token);assert.deepEqual(hero(backup.world).rpg.casts,hero(before).rpg.casts)
  await phase('archive');await start();await phase('close');await apply(command(await calc()));const ready=await world();assert.equal(hero(ready).resources.mana.current,'43');assert.equal(hero(ready).rpg.casts[0].status,'ready')
  assert.deepEqual((await api(root+'/declarations',gm.token)).actors.find(a=>a.id===heroId).casts[0].spatial,owner.rpg.abilities[0].spatial)
 })
 await t.test('Игрок получает текущий шаблон и отдельный снимок оплаченного заряда; чужое управление запрещено',async()=>{
  const w=await world();hero(w).rpg.abilities[0].spatial.radiusM=4;hero(w).rpg.abilities[0].visualEffect={familyId:'water'}
  await api(root+'/world',gm.token,'PUT',{world:w,revision:w.revision})
  const v=await view();assert.equal(v.options.abilities[0].spatial.radiusM,4);assert.equal(v.options.casts[0].spatial.radiusM,1);assert.equal(v.options.casts[0].id,castId);assert.equal(v.options.casts[0].status,'ready')
  for(const secret of ['SPATIAL-SECRET-NOTE','SPACE-SECRET','targetId','roundPreparation'])assert(!JSON.stringify(v.options).includes(secret))
  const stranger=await f.register('space-stranger');await api(root+'/join',stranger.token,'POST');await api(route+'/declarations',stranger.token,'GET',undefined,403)
  const master=await api(root+'/declarations',gm.token);assert.deepEqual(master.scenes[0].objects[0].operations,['ignite','extinguish'])
 })
 await t.test('Явный заряд проходит через заявление; посторонний ID и заряд при подготовке отвергаются',async()=>{
  await phase('archive');await start();const target={kind:'area',point:{x:8,y:2,z:0}}
  await send('release',target,409,'someone-else-cast');await send('prepare',{kind:'none'},400,castId);await send('release',target,200,castId)
  const v=await view();assert.equal(v.entry.actions[0].castId,castId)
  const selected={kind:'ability',abilityId:'spell',stage:'release',target,note:'',castId};await api(route+'/declarations',player.token,'PUT',{collectionId:v.collection.id,epoch:v.collection.epoch,baseVersion:v.entry.revision,controlStamp:v.controlStamp,actions:[selected,selected]},400)
  await phase('close');const before=await world(),request=await body(1000,'cast:not-the-chosen-cast');await api(root+'/rounds/calculate',gm.token,'POST',request,400);assert.deepEqual(await world(),before)
 })
 await t.test('Подтверждение геометрии и доступность каждой цели обязательны; расчёт ничего не меняет',async()=>{
  const before=await world(),request=await body(1000,'cast:'+castId)
  await api(root+'/rounds/calculate',player.token,'POST',request,403);request.input.rules[0].spatialConfirmed=false;await api(root+'/rounds/calculate',gm.token,'POST',request,400)
  request.input.rules[0].spatialConfirmed=true;request.input.rules[0].targetInputs=[{actorId:npcs[0].id,input:{...fields,accessible:false}}];await api(root+'/rounds/calculate',gm.token,'POST',request,400);assert.deepEqual(await world(),before)
  const effect={objectId:'torch',operation:'extinguish',reason:'Подтверждено правилом способности и условиями сцены'}
  const envRequest=await body(1000,'cast:'+castId);envRequest.input.rules[0].environment=[effect,{...effect,objectId:'outside-torch'}]
  await api(root+'/rounds/calculate',gm.token,'POST',envRequest,400);assert.deepEqual(await world(),before)
  envRequest.input.rules[0].environment=[effect];const p=await api(root+'/rounds/calculate',gm.token,'POST',envRequest);assert.deepEqual(p.summary.rules[0].targets.map(t=>t.actorId),[npcs[0].id,npcs[1].id]);assert.equal(p.summary.rules[0].environment[0].objectId,'torch');assert.deepEqual(await world(),before);releaseCommand=command(p)
 })
 await t.test('Применение атомарно: две цели, один снимок, повтор без новых эффектов',async()=>{
  const result=await apply(releaseCommand),after=await world();assert.equal(after.campaign.scenes.scenes[0].objects[0].active,false);assert.equal(after.campaign.scenes.scenes[0].objects[1].active,true);assert.equal(result.receipt.summary.rules[0].environment[0].objectId,'torch');assert.equal(hero(after).resources.mana.current,'43');assert.equal(hero(after).rpg.casts[0].status,'ended');assert.deepEqual(hero(after).rpg.casts[0].spatialRelease.actorIds,[npcs[0].id,npcs[1].id])
  assert.equal(after.characters.find(c=>c.id===npcs[0].id).rpg.effects.length,1);assert.equal(after.characters.find(c=>c.id===npcs[1].id).rpg.effects.length,1);assert.equal(after.characters.find(c=>c.id===npcs[2].id).rpg.effects.length,0)
  const snapshot=JSON.parse((await f.server.db.get('SELECT before_json FROM round_receipts WHERE id=?',[result.receipt.id])).before_json);assert.equal(hero(snapshot).rpg.casts[0].status,'ready');assert.equal(snapshot.campaign.scenes.scenes[0].objects[0].active,true)
  await apply(releaseCommand);assert.deepEqual(await world(),after)
  const stale=structuredClone(after);delete hero(stale).rpg.casts[0].spatialRelease;await api(root+'/world',gm.token,'PUT',{world:stale,revision:after.revision},409)
  const personal=JSON.stringify(await api(root+'/world',player.token));for(const secret of ['SPACE-SECRET','SPATIAL-SECRET-NOTE','spatialRelease','actorIds','Подтверждено правилом способности и условиями сцены','outside-torch'])assert(!personal.includes(secret),secret)
 })
 await f.restart()
 await t.test('Копия/восстановление сохраняют все цели и параметры; старое поколение не повторяет выпуск',async()=>{
  assert.equal((await apply(releaseCommand)).duplicate,true);const before=await world(),backup=await api(root+'/backup',gm.token);assert.deepEqual(hero(backup.world).rpg.casts,hero(before).rpg.casts)
  await api(root+'/restore',gm.token,'POST',{world:backup.world,bindings:backup.bindings,revision:before.revision});assert.deepEqual(hero(await world()).rpg.casts,hero(before).rpg.casts);await apply(releaseCommand,409)
 })
})

for (const dialect of ['sqlite', 'postgres']) test('Вода и разряд меняют один раунд и сохраняются при повторе · ' + dialect, async t => {
 const f = await fixture(t, dialect), {api} = f, gm = await f.register('water-owner'), player = await f.register('water-player')
 const {id} = await api('/lobbies', gm.token, 'POST', lobbyBody, 201), root = '/lobbies/' + id
 await api(root + '/join', player.token, 'POST')
 const hero = {...createDefaultCharacter(), id:'water-source', name:'Герой'}
 await api('/characters/' + hero.id, player.token, 'PUT', {character:hero, revision:-1})
 const {id:actorId} = await api(root + '/characters', player.token, 'POST', {characterId:hero.id}, 201)
 const actorRoute = root + '/characters/' + actorId
 const world = () => api(root + '/world', gm.token)
 await api(actorRoute + '/review', gm.token, 'POST', {revision:(await world()).revision, decision:'approve', note:''})
 const initial = await world(), actor = initial.characters[0]
 actor.rpg.formulas = []; actor.statistics.energyRegeneration = '0'; actor.resources.mana = {maximum:'50',current:'50'}
 actor.rpg.abilities = [{...emptyAbility(), id:'spell', templateId:'spell-template', name:'Опыт с водой', approved:true,
   spatial:{shape:'sphere', includeCaster:false, radiusM:1}, rangeM:10, mechanism:'effect', cost:{mana:7,shadow:0,stamina:0}}]
 initial.campaign.scenes = createScene(emptyScenes(), 'water-scene', 'Площадка', 'top')
 const scene = initial.campaign.scenes.scenes[0]
 scene.tokens = [{actorId, x:2, y:2, z:0, diameter:1, support:{kind:'ground'}}]
 scene.objects = [{...sceneObject('lamp','electrode',{x:5,y:6,z:0}), width:1,depth:1,height:.2,
   name:'PRIVATE-WATER-ELECTRODE', active:false, physics:{version:1, material:physicsMaterialPreset('copper'), massKg:1, temperatureK:298.15, wetnessFraction:0}}]
 await api(root + '/world', gm.token, 'PUT', {world:initial, revision:initial.revision})
 await api(actorRoute + '/disclosure', gm.token, 'PUT', {revision:(await world()).revision,draft:{activeSceneId:scene.id,scenes:[{
   sceneId:scene.id,title:'Площадка',description:'',areas:[{id:'area',x:0,y:0,z:-5,width:20,depth:20,height:25,visible:true}],objects:[],contacts:[]
 }]}})
 await api(root + '/declarations', gm.token, 'POST', {sceneId:scene.id,participantIds:[actorId],durationSeconds:5,allowReplace:true,revision:(await world()).revision},201)
 const view = await api(actorRoute + '/declarations', player.token)
 const waterPoint = {x:6.5,y:6,z:0}, electrode = {x:5,y:6,z:.05}
 const discharge = {kind:'discharge',returnContact:{x:7.25,y:6,z:.05},voltageV:24,limitA:.5,durationMs:100,thresholdA:.02}
 const operations = [
   {point:waterPoint,physics:{kind:'create-water',widthM:2,depthM:1,heightM:.1}},
   {point:electrode,physics:discharge},
   {point:waterPoint,physics:{kind:'add-substance',substance:'salt',massKg:.2}},
   {point:electrode,physics:discharge},
 ]
 const actions = operations.flatMap(({point})=>[
   {kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''},
   {kind:'ability',abilityId:'spell',stage:'release',target:{kind:'area',point},note:''},
 ])
 await api(actorRoute + '/declarations', player.token, 'PUT', {
   collectionId:view.collection.id,epoch:view.collection.epoch,baseVersion:0,controlStamp:view.controlStamp,actions,
 })
 await api(root + '/declarations', gm.token, 'PATCH', {collectionId:view.collection.id,epoch:view.collection.epoch,operation:'close'})
 const before = await world(), collection = before.campaign.declarations.active
 const key = index => 'new:' + actorId + ':' + index
 const rules = operations.flatMap(({physics}, index) => [
   {key:key(index*2),kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields},
   {key:key(index*2+1),kind:'ability',confirmed:true,binding:'unbound',charge:'prepare:'+key(index*2),input:fields,spatialConfirmed:true,physics,
     ...(physics.kind==='discharge'?{environment:[{objectId:'electrode',operation:'ignite',reason:'PRIVATE-WATER-RULE'}]}:{})},
 ])
 const request = {revision:before.revision,collectionId:collection.id,epoch:collection.epoch,input:{
   timings:[{actorId,entryRevision:1,budgetMs:5000,costs:actions.map((_,index)=>({index,personalMs:500}))}],
   continuations:[],missingDecisions:[],interactionsConfirmed:false,rules,
 }}
 const calculate = (body, token=gm.token, status=200) => api(root + '/rounds/calculate', token, 'POST', body, status)
 await calculate(request, player.token, 403)
 const long = structuredClone(request); long.input.rules[3].physics.durationMs=501
 await calculate(long, gm.token, 400)
 const outOfBounds = structuredClone(request); outOfBounds.input.rules[1].physics.widthM=20
 await calculate(outOfBounds, gm.token, 400)
 const preview = await calculate(request), releases = preview.summary.rules.filter(rule=>rule.kind==='release')
 assert.equal(releases[0].physics.volumeL,200)
 assert.equal(releases[1].physics.circuit.status,'closed')
 assert(releases[1].physics.circuit.currentA<discharge.thresholdA)
 assert.equal(releases[1].environment,undefined)
 assert.equal(releases[2].physics.composition.saltKg,.2)
 assert(releases[3].physics.circuit.currentA>discharge.thresholdA)
 assert.deepEqual(releases[3].physics.circuit.path.map(part=>part.id),['electrode',releases[0].physics.objectId])
 assert.equal(releases[3].environment[0].operation,'ignite')
 assert.deepEqual(await world(),before)

 const command = {previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()}
 const apply = (body=command,path='/rounds/apply') => api(root+path,gm.token,'POST',body)
 const result = await apply(), after = await world(), objects = after.campaign.scenes.scenes[0].objects
 assert.equal(objects.length,2);assert.equal(objects[0].active,true);assert.equal(objects[1].water.saltKg,.2)
 assert.equal(after.characters[0].resources.mana.current,'22')
 await f.restart()
 assert.equal((await apply()).duplicate,true);assert.deepEqual(await world(),after)
 const personal = JSON.stringify(await api(root+'/world',player.token))
 for (const secret of ['PRIVATE-WATER-ELECTRODE','PRIVATE-WATER-RULE','saltKg','currentA']) assert(!personal.includes(secret),secret)

 const history = await api(root+'/rounds/history',gm.token)
 const rollback = await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:history.revision,receiptId:result.receipt.id,reason:'Повторить опыт'})
 await apply({previewId:rollback.id,generation:rollback.generation,commandKey:crypto.randomUUID()},'/rounds/change/apply')
 assert.deepEqual((await world()).campaign.scenes.scenes[0].objects,before.campaign.scenes.scenes[0].objects)
 const rolledBack = await api(root+'/rounds/history',gm.token)
 const replay = await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:rolledBack.revision,receiptId:result.receipt.id})
 await apply({previewId:replay.id,generation:replay.generation,commandKey:crypto.randomUUID()})
 assert.deepEqual((await world()).campaign.scenes.scenes[0].objects,objects)
})

for (const dialect of ['sqlite','postgres']) test('Растекание в раунде: дверь открывает путь воде и разряду · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('flow-owner'),player=await f.register('flow-player')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 await api(root+'/join',player.token,'POST')
 const character={...createDefaultCharacter(),id:'flow-source',name:'Герой'}
 await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
 const {id:actorId}=await api(root+'/characters',player.token,'POST',{characterId:character.id},201)
 const route=root+'/characters/'+actorId,world=()=>api(root+'/world',gm.token)
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world(),actor=initial.characters[0]
 actor.rpg.formulas=[];actor.statistics.energyRegeneration='0';actor.resources.mana={maximum:'50',current:'50'}
 actor.rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'flow-spell',name:'Разряд',approved:true,spatial:{shape:'sphere',includeCaster:false,radiusM:.5},
  rangeM:10,mechanism:'effect',cost:{mana:7,shadow:0,stamina:0}}]
 initial.campaign.scenes=createScene(emptyScenes(),'flow-scene','Шлюз','top')
 const scene=initial.campaign.scenes.scenes[0]
 const rider={...createDefaultCharacter(),id:'flow-rider',name:'Наблюдатель'}
 initial.characters.push(rider)
 scene.tokens=[{actorId,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}},
  {actorId:rider.id,x:4.2,y:5,z:.2,diameter:.5,support:{kind:'object',objectId:'cell-0'}}]
 const cells=[4,6].map((x,index)=>({...sceneObject('water','cell-'+index,{x,y:5,z:0}),width:2,depth:1,height:index?0:.2,
  canSupport:index===0,
  water:{version:1,base:'pure',saltKg:index?0:.4,sedimentKg:index?0:.1,flow:true}}))
 const gate={...sceneObject('door','gate',{x:5,y:5,z:0}),width:.2,depth:1,height:2}
 const prop={...sceneObject('crate','damp-prop',{x:6.75,y:5,z:0}),width:.3,depth:.3,height:.1,
  physics:{version:1,material:physicsMaterialPreset('wood'),massKg:2,temperatureK:293.15,wetnessFraction:0}}
 scene.objects=[...cells,gate,prop]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 await api(route+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{activeSceneId:scene.id,scenes:[{sceneId:scene.id,
  title:'Шлюз',description:'',areas:[{id:'area',x:0,y:0,z:0,width:20,depth:20,height:4,visible:true}],
  objects:[{objectId:'gate',visible:true},{objectId:'cell-1',visible:true}],contacts:[]}]}})
 assert(!(await api(route+'/perception',player.token)).map.objects.some(o=>o.id==='cell-1'))
 await api(root+'/declarations',gm.token,'POST',{sceneId:scene.id,participantIds:[actorId],durationSeconds:5,allowReplace:true,revision:(await world()).revision},201)
 const view=await api(route+'/declarations',player.token)
 const actions=[
  {kind:'interact',operation:'open',target:{kind:'object',id:'gate'},note:''},
  {kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''},
  {kind:'ability',abilityId:'spell',stage:'release',target:{kind:'area',point:{x:3.5,y:5,z:.02}},note:''},
 ]
 await api(route+'/declarations',player.token,'PUT',{collectionId:view.collection.id,epoch:view.collection.epoch,baseVersion:0,controlStamp:view.controlStamp,actions})
 await api(root+'/declarations',gm.token,'PATCH',{collectionId:view.collection.id,epoch:view.collection.epoch,operation:'close'})
 const before=await world(),collection=before.campaign.declarations.active,key=i=>'new:'+actorId+':'+i
 const request={revision:before.revision,collectionId:collection.id,epoch:collection.epoch,input:{
  timings:[{actorId,entryRevision:1,budgetMs:5000,costs:actions.map((_,index)=>({index,personalMs:1000}))}],
  continuations:[],missingDecisions:[],interactionsConfirmed:true,rules:[
   {key:key(1),kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields},
   {key:key(2),kind:'ability',confirmed:true,binding:'unbound',charge:'prepare:'+key(1),input:fields,spatialConfirmed:true,
    physics:{kind:'discharge',returnContact:{x:6.25,y:5,z:.02},voltageV:24,limitA:.5,durationMs:100,thresholdA:.02}},
  ],
 }}
 await api(root+'/rounds/calculate',player.token,'POST',request,403)
 const preview=await api(root+'/rounds/calculate',gm.token,'POST',request)
 assert.deepEqual(await world(),before)
 assert.equal(preview.summary.water.layers.find(o=>o.id==='cell-1').fromL,0)
 assert(preview.summary.water.layers.find(o=>o.id==='cell-1').toL>0)
 assert(preview.summary.water.wetted.find(o=>o.id==='damp-prop').fraction>0)
 const support=preview.summary.water.supports.find(change=>change.actorId===rider.id)
 assert(support.toZ<.2);assert.equal(support.lostSupport,false)
 assert.deepEqual(preview.summary.rules.find(r=>r.kind==='release').physics.circuit.path.map(o=>o.id),['cell-0','cell-1'])
 const command={previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()}
 const apply=()=>api(root+'/rounds/apply',gm.token,'POST',command)
 const applied=await apply(),after=await world(),objects=after.campaign.scenes.scenes[0].objects
 assert.equal(objects[2].open,true);assert(objects[3].physics.wetnessFraction>0)
 assert.equal(after.campaign.scenes.scenes[0].tokens.find(token=>token.actorId===rider.id).z,objects[0].height)
 for(const [actual,expected] of [
  [objects[0].height*2+objects[1].height*2,.4],
  [objects[0].water.saltKg+objects[1].water.saltKg,.4],
  [objects[0].water.sedimentKg+objects[1].water.sedimentKg,.1],
 ])assert(Math.abs(actual-expected)<1e-10)
 const visible=(await api(route+'/perception',player.token)).map.objects.find(o=>o.id==='cell-1')
 assert(visible.height>0);assert(!Object.hasOwn(visible,'water'))
 await f.restart()
 assert.equal((await apply()).duplicate,true);assert.deepEqual(await world(),after)
 const history=await api(root+'/rounds/history',gm.token)
 const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:history.revision,receiptId:applied.receipt.id,reason:'Повторить поток'})
 await api(root+'/rounds/change/apply',gm.token,'POST',{previewId:rollback.id,generation:rollback.generation,commandKey:crypto.randomUUID()})
 assert.deepEqual((await world()).campaign.scenes.scenes[0].objects,before.campaign.scenes.scenes[0].objects)
 const rolledBack=await api(root+'/rounds/history',gm.token)
 const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:rolledBack.revision,receiptId:applied.receipt.id})
 await api(root+'/rounds/apply',gm.token,'POST',{previewId:replay.id,generation:replay.generation,commandKey:crypto.randomUUID()})
 assert.deepEqual((await world()).campaign.scenes.scenes[0].objects,objects)
 assert.deepEqual((await world()).campaign.scenes.scenes[0].tokens,after.campaign.scenes.scenes[0].tokens)
})
