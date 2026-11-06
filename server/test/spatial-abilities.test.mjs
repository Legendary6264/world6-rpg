import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
import {emptyAbility,emptyItem} from '../generated/rpgSchema.mjs'
import {createDetailedAnatomy} from '../generated/anatomyModel.mjs'
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

for (const dialect of ['sqlite','postgres']) test('Тепло в раунде: лёд размыкает цепь, дверь проветривает, повтор сохраняет результат · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('thermal-owner'),player=await f.register('thermal-player')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 await api(root+'/join',player.token,'POST')
 const character={...createDefaultCharacter(),id:'thermal-source',name:'Маг'}
 await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
 const {id:actorId}=await api(root+'/characters',player.token,'POST',{characterId:character.id},201)
 const route=root+'/characters/'+actorId,world=()=>api(root+'/world',gm.token)
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world(),actor=initial.characters[0]
 actor.rpg.formulas=[];actor.statistics.energyRegeneration='0';actor.resources.mana={maximum:'50',current:'50'}
 actor.rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'thermal-spell',name:'Физический выпуск',approved:true,
   spatial:{shape:'sphere',includeCaster:false,radiusM:.2},rangeM:10,mechanism:'effect',cost:{mana:7,shadow:0,stamina:0}}]
 initial.campaign.scenes=createScene(emptyScenes(),'thermal-scene','Дымный зал','top')
 const scene=initial.campaign.scenes.scenes[0]
 Object.assign(scene,{width:8,depth:6,minZ:0,maxZ:3})
 scene.physics={version:1,gravityMs2:9.81,ambientTemperatureK:273.15,atmosphere:{
   oxygenFraction:.18,smokeKg:.014,steamKg:.02,outsideTemperatureK:280,doorVentilation:true,
 }}
 scene.tokens=[{actorId,x:1,y:1,z:0,diameter:.5,support:{kind:'ground'}}]
 const gate={...sceneObject('door','gate',{x:.2,y:1.2,z:0}),width:.2,depth:2,height:2.5}
 const water={...sceneObject('water','pool',{x:3,y:2,z:0}),width:1,depth:.5,height:.002,
   water:{version:1,base:'pure',saltKg:.001,sedimentKg:0,enthalpyJKg:334000}}
 const fire={...sceneObject('lamp','fire',{x:2,y:4,z:0}),height:.3,active:true,physics:{
   version:1,material:physicsMaterialPreset('wood'),massKg:2,temperatureK:273.15,wetnessFraction:0,
   combustion:{fuelKg:.003,burnRateKgS:.006,ignitionTemperatureK:600},
 }}
 const distant=sceneObject('crate','distant',{x:4.65,y:1,z:0})
 scene.objects=[gate,water,fire,distant]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 await api(route+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{activeSceneId:scene.id,scenes:[{sceneId:scene.id,
   title:scene.name,description:'',areas:[{id:'hall',x:0,y:0,z:0,width:8,depth:6,height:3,visible:true}],
   objects:scene.objects.map(o=>({objectId:o.id,visible:true})),contacts:[]}]}})
 const playerMap=async()=>(await api(route+'/perception',player.token)).map
 const smoky=await playerMap();assert(!smoky.objects.some(o=>o.id==='distant'))
 await api(root+'/declarations',gm.token,'POST',{sceneId:scene.id,participantIds:[actorId],durationSeconds:12,allowReplace:true,revision:(await world()).revision},201)
 const view=await api(route+'/declarations',player.token),point={x:3,y:2,z:.001}
 const prepare=()=>({kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''})
 const release=()=>({kind:'ability',abilityId:'spell',stage:'release',target:{kind:'area',point},note:''})
 const actions=[prepare(),release(),prepare(),release(),{kind:'interact',operation:'open',target:{kind:'object',id:'gate'},note:''}]
 await api(route+'/declarations',player.token,'PUT',{collectionId:view.collection.id,epoch:view.collection.epoch,
   baseVersion:0,controlStamp:view.controlStamp,actions})
 await api(root+'/declarations',gm.token,'PATCH',{collectionId:view.collection.id,epoch:view.collection.epoch,operation:'close'})
 const before=await world(),collection=before.campaign.declarations.active,key=i=>'new:'+actorId+':'+i
 const request={revision:before.revision,collectionId:collection.id,epoch:collection.epoch,input:{
   timings:[{actorId,entryRevision:1,budgetMs:12000,costs:actions.map((_,index)=>({index,personalMs:1000}))}],
   continuations:[],missingDecisions:[],interactionsConfirmed:true,rules:[
     {key:key(0),kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields},
     {key:key(1),kind:'ability',confirmed:true,binding:'unbound',charge:'prepare:'+key(0),input:fields,spatialConfirmed:true,physics:{kind:'heat',energyKJ:-340}},
     {key:key(2),kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields},
     {key:key(3),kind:'ability',confirmed:true,binding:'unbound',charge:'prepare:'+key(2),input:fields,spatialConfirmed:true,
       physics:{kind:'discharge',returnContact:{x:3.4,y:2,z:.001},voltageV:24,limitA:.5,durationMs:100,thresholdA:.02}},
   ],
 }}
 const preview=await api(root+'/rounds/calculate',gm.token,'POST',request)
 assert.deepEqual(await world(),before)
 const releases=preview.summary.rules.filter(r=>r.kind==='release'),thermal=preview.summary.thermal
 assert.equal(releases[0].physics.iceFraction,1)
 assert.equal(releases[1].physics.circuit.status,'open')
 assert.equal(thermal.water[0].iceFraction,1);assert.equal(thermal.fires[0].lit,false)
 const opened=preview.summary.events.find(e=>e.kind==='open').atMs
 const ventSeconds=12-Number(opened.numerator)/Number(opened.denominator)/1000
 const smokeAfter=(.014+.003*.025)*Math.exp(-.3*5*ventSeconds/144)
 assert(Math.abs(thermal.smokeKg-smokeAfter)<1e-10)
 const command={previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()}
 const apply=body=>api(root+'/rounds/apply',gm.token,'POST',body)
 const {receipt}=await apply(command),after=await world(),result=after.campaign.scenes.scenes[0]
 assert(result.objects[0].open);assert.equal(result.objects[2].active,false)
 const viewAfter=await playerMap()
 assert(viewAfter.smokeVisibilityM>smoky.smokeVisibilityM)
 assert(viewAfter.objects.some(o=>o.id==='distant'))
 assert.equal(viewAfter.objects.find(o=>o.id==='pool').iceCover,'ice')
 assert(!JSON.stringify(viewAfter).includes('enthalpyJKg'));assert(!JSON.stringify(viewAfter).includes('oxygenFraction'))
 await f.restart()
 assert.equal((await apply(command)).duplicate,true);assert.deepEqual(await world(),after)
 const history=await api(root+'/rounds/history',gm.token)
 const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:history.revision,receiptId:receipt.id,reason:'Проверить расчёт тепла'})
 await api(root+'/rounds/change/apply',gm.token,'POST',{previewId:rollback.id,generation:rollback.generation,commandKey:crypto.randomUUID()})
 assert.deepEqual((await world()).campaign.scenes.scenes[0],before.campaign.scenes.scenes[0])
 const rolledBack=await api(root+'/rounds/history',gm.token)
 const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:rolledBack.revision,receiptId:receipt.id})
 await apply({previewId:replay.id,generation:replay.generation,commandKey:crypto.randomUUID()})
 assert.deepEqual((await world()).campaign.scenes.scenes[0],result)
})

for (const dialect of ['sqlite','postgres']) test('Разрушение опоры: падение продолжается после перезапуска и травма применяется один раз · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('structure-owner'),player=await f.register('structure-player')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 await api(root+'/join',player.token,'POST')
 const character={...createDefaultCharacter(),id:'structure-source',name:'Маг'}
 await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
 const {id:actorId}=await api(root+'/characters',player.token,'POST',{characterId:character.id},201)
 const route=root+'/characters/'+actorId,world=()=>api(root+'/world',gm.token)
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world(),actor=initial.characters[0]
 actor.rpg.formulas=[];actor.statistics.energyRegeneration='0';actor.resources.mana={maximum:'50',current:'50'}
 actor.rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'breach',name:'Ударная волна',approved:true,
   spatial:{shape:'point',includeCaster:false},rangeM:20,mechanism:'stone',cost:{mana:7,shadow:0,stamina:0}}]
 const rider={...createDefaultCharacter(),id:'structure-rider',name:'Дозорный'}
 Object.assign(rider.body.parts.torso,{present:true,maximum:100,current:100})
 rider.body.anatomy=createDetailedAnatomy('humanoid',Object.keys(rider.body.parts))
 rider.body.anatomy.automatic=false
 rider.rpg.impact.torso={thresholdJ:190,joulesPerHp:200,referenceCm2:100}
 rider.rpg.inventory=[{...emptyItem(),id:'armor',templateId:'armor',name:'Нагрудник',quantity:1,durability:100,equipped:true,
   slot:'body',covers:['torso'],maximumDurability:100,absorptionJ:200,transmission:.5,joulesPerWear:20}]
 initial.characters.push(rider)
 initial.campaign.scenes=createScene(emptyScenes(),'structural-scene','Верхняя галерея','top')
 const scene=initial.campaign.scenes.scenes[0],point={x:5,y:5,z:7.5}
 scene.physics={version:1,gravityMs2:10,ambientTemperatureK:293.15}
 scene.objects=[
   {...sceneObject('platform','upper',{...point,z:7}),width:2,depth:2,height:1,physics:{
     version:1,material:physicsMaterialPreset('wood'),massKg:20,temperatureK:293.15,wetnessFraction:0,
     structure:{failureJ:200,absorbedJ:0},
   }},
   {...sceneObject('platform','lower',{...point,z:1}),width:2,depth:2,height:1},
 ]
 scene.tokens=[{actorId,x:2,y:2,z:0,diameter:.6,support:{kind:'ground'}},
   {actorId:rider.id,...point,z:8,diameter:.6,support:{kind:'object',objectId:'upper'},landing:{massKg:60,region:'torso',contactCm2:100}}]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 await api(route+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:scene.name,description:'',
   areas:[{id:'hall',x:0,y:0,z:0,width:12,depth:12,height:12,visible:true}],objects:[{objectId:'upper',visible:true},{objectId:'lower',visible:true}],
   contacts:[{actorId:rider.id,kind:'identified',label:rider.name,signs:'',showHeight:true,point:{...point,z:8},radius:1}]}]}})
 const submit=async actions=>{
   await api(root+'/declarations',gm.token,'POST',{sceneId:scene.id,participantIds:[actorId],durationSeconds:3,allowReplace:true,revision:(await world()).revision},201)
   const view=await api(route+'/declarations',player.token)
   await api(route+'/declarations',player.token,'PUT',{collectionId:view.collection.id,epoch:view.collection.epoch,baseVersion:0,controlStamp:view.controlStamp,actions})
   await api(root+'/declarations',gm.token,'PATCH',{collectionId:view.collection.id,epoch:view.collection.epoch,operation:'close'})
   return world()
 }
 const prepare=()=>({kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''})
 const release=()=>({kind:'ability',abilityId:'spell',stage:'release',target:{kind:'point',point},note:''})
 const request=(snapshot,costs,rules)=>({revision:snapshot.revision,collectionId:snapshot.campaign.declarations.active.id,
   epoch:snapshot.campaign.declarations.active.epoch,input:{timings:[{actorId,entryRevision:1,budgetMs:3000,costs:costs.map((personalMs,index)=>({index,personalMs}))}],
     continuations:[],missingDecisions:[],interactionsConfirmed:false,rules}})
 const before=await submit([prepare(),release(),prepare(),release()]),key=i=>'new:'+actorId+':'+i
 const rules=[75,125].flatMap((energyJ,index)=>[
   {key:key(index*2),kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields},
   {key:key(index*2+1),kind:'ability',confirmed:true,binding:'unbound',charge:'prepare:'+key(index*2),input:fields,
     spatialConfirmed:true,physics:{kind:'structural-impact',energyJ}},
 ])
 const calculate=body=>api(root+'/rounds/calculate',gm.token,'POST',body)
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 const apply=body=>api(root+'/rounds/apply',gm.token,'POST',body)
 const preview=await calculate(request(before,[500,500,500,1000],rules))
 assert.deepEqual(await world(),before)
 const strikes=preview.summary.rules.filter(rule=>rule.kind==='release').map(rule=>rule.physics)
 assert.deepEqual(strikes.map(o=>[o.absorbedJ,o.collapsed]),[[75,false],[200,true]])
 assert.deepEqual(preview.summary.falls,{landings:[],falling:[{actorId:rider.id,fromZ:8,toZ:6.75,speedMs:5}]})
 await apply(command(preview))
 const airborne=await world()
 assert.equal(airborne.characters.find(c=>c.id===rider.id).body.parts.torso.current,100)
 await f.restart()
 assert.deepEqual(await world(),airborne)
 const map=(await api(route+'/perception',player.token)).map
 assert(!map.objects.some(o=>o.id==='upper'))
 const contact=map.contacts.find(c=>c.kind==='identified')
 assert.equal(contact.falling,true);assert.equal(contact.z,6.75)
 assert(!Object.hasOwn(contact,'landing'));assert(!Object.hasOwn(contact,'fall'))
 const disclosure=await api(route+'/disclosure',gm.token)
 assert(!disclosure.draft.scenes[0].objects.some(o=>o.objectId==='upper'))
 const first=airborne.campaign.declarations.active
 await api(root+'/declarations',gm.token,'PATCH',{collectionId:first.id,epoch:first.epoch,operation:'archive'})
 const next=await submit([{kind:'wait',seconds:1,note:''}])
 const landingPreview=await calculate(request(next,[],[]))
 const [landing]=landingPreview.summary.falls.landings
 assert.equal(landing.support.objectId,'lower');assert.equal(landing.toZ,2)
 assert(landing.atMs.numerator/landing.atMs.denominator<1000)
 assert.equal(landing.impact.status,'applied');assert.equal(landing.impact.damage,16)
 assert(Math.abs(landing.impact.energyJ-3600)<1e-8)
 assert(Math.abs(landing.impact.transmittedJ-3400)<1e-8)
 const appliedCommand=command(landingPreview),{receipt}=await apply(appliedCommand),after=await world()
 const landed=after.characters.find(c=>c.id===rider.id),token=after.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===rider.id)
 assert.equal(landed.body.parts.torso.current,84);assert.equal(landed.rpg.inventory[0].durability,90)
 assert.equal(landed.body.anatomy.harmRevision,rider.body.anatomy.harmRevision+1)
 assert.equal(landed.rpg.logs.filter(l=>l.text.includes('Удар при приземлении')).length,1)
 assert.equal(token.z,2);assert.equal(token.fall,undefined)
 await f.restart()
 assert.equal((await apply(appliedCommand)).duplicate,true);assert.deepEqual(await world(),after)
 const history=await api(root+'/rounds/history',gm.token)
 const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:history.revision,receiptId:receipt.id,reason:'Проверить приземление'})
 await api(root+'/rounds/change/apply',gm.token,'POST',command(rollback))
 const restored=await world()
 assert.equal(restored.campaign.scenes.scenes[0].tokens.find(t=>t.actorId===rider.id).fall.speedMs,5)
 assert.equal(restored.characters.find(c=>c.id===rider.id).rpg.inventory[0].durability,100)
 const rolledBack=await api(root+'/rounds/history',gm.token)
 const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:rolledBack.revision,receiptId:receipt.id})
 await apply(command(replay))
 const replayed=await world()
 assert.deepEqual(replayed.campaign.scenes.scenes[0],after.campaign.scenes.scenes[0])
 assert.deepEqual(replayed.characters.find(c=>c.id===rider.id).body,landed.body)
 assert.deepEqual(replayed.characters.find(c=>c.id===rider.id).rpg.inventory,landed.rpg.inventory)
})

for (const dialect of ['sqlite','postgres']) test('Толчок в раунде: открытая вовремя дверь меняет удар, повтор сохраняет путь · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('slide-owner'),player=await f.register('slide-player')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 await api(root+'/join',player.token,'POST')
 const character={...createDefaultCharacter(),id:'slide-source',name:'Маг'}
 await api('/characters/'+character.id,player.token,'PUT',{character,revision:-1})
 const {id:actorId}=await api(root+'/characters',player.token,'POST',{characterId:character.id},201)
 const route=root+'/characters/'+actorId,world=()=>api(root+'/world',gm.token)
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const initial=await world(),actor=initial.characters[0]
 actor.rpg.formulas=[];actor.statistics.energyRegeneration='0';actor.resources.mana={maximum:'50',current:'50'}
 actor.rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'push',name:'Толчок',approved:true,
   spatial:{shape:'point',includeCaster:false},rangeM:20,mechanism:'effect',cost:{mana:7,shadow:0,stamina:0}}]
 const guard={...createDefaultCharacter(),id:'slide-guard',name:'Дозорный'}
 initial.characters.push(guard)
 initial.campaign.scenes=createScene(emptyScenes(),'slide-scene','Шлюз','top')
 const scene=initial.campaign.scenes.scenes[0],point={x:4,y:5,z:.5}
 scene.physics={version:1,gravityMs2:10,ambientTemperatureK:293.15}
 const profile={version:1,material:physicsMaterialPreset('wood'),massKg:10,temperatureK:293.15,wetnessFraction:0}
 scene.objects=[
   {...sceneObject('crate','crate',{...point,z:0}),name:'Ящик',width:1,depth:1,height:1,
     physics:{...profile,sliding:{dryFriction:.2,wetFriction:null,impactTransfer:.5,vxMs:0,vyMs:0}}},
   {...sceneObject('door','gate',{x:8,y:5,z:0}),width:.2,depth:1.5,height:2},
   {...sceneObject('wall','wall',{x:12,y:5,z:0}),width:1,depth:1.5,height:2,canSupport:true,
     physics:{...profile,structure:{failureJ:19,absorbedJ:0}}},
 ]
 scene.tokens=[{actorId,x:2,y:5,z:0,diameter:.6,support:{kind:'ground'}},
   {actorId:guard.id,x:12.3,y:5,z:2,diameter:.5,support:{kind:'object',objectId:'wall'}}]
 await api(root+'/world',gm.token,'PUT',{world:initial,revision:initial.revision})
 await api(route+'/disclosure',gm.token,'PUT',{revision:(await world()).revision,draft:{activeSceneId:scene.id,scenes:[{sceneId:scene.id,
   title:scene.name,description:'',areas:[{id:'hall',x:0,y:0,z:0,width:15,depth:10,height:6,visible:true}],
   objects:scene.objects.map(o=>({objectId:o.id,visible:true})),contacts:[]}]}})
 const phase=(collection,operation)=>api(root+'/declarations',gm.token,'PATCH',{collectionId:collection.id,epoch:collection.epoch,operation})
 const submit=async actions=>{
   await api(root+'/declarations',gm.token,'POST',{sceneId:scene.id,participantIds:[actorId],durationSeconds:3,allowReplace:true,revision:(await world()).revision},201)
   const view=await api(route+'/declarations',player.token)
   await api(route+'/declarations',player.token,'PUT',{collectionId:view.collection.id,epoch:view.collection.epoch,baseVersion:0,controlStamp:view.controlStamp,actions})
   await phase(view.collection,'close')
   return world()
 }
 const request=(snapshot,costs,rules)=>({revision:snapshot.revision,collectionId:snapshot.campaign.declarations.active.id,
   epoch:snapshot.campaign.declarations.active.epoch,input:{timings:[{actorId,entryRevision:1,budgetMs:3000,costs:costs.map((personalMs,index)=>({index,personalMs}))}],
     continuations:[],missingDecisions:[],interactionsConfirmed:true,rules}})
 const calculate=body=>api(root+'/rounds/calculate',gm.token,'POST',body)
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()})
 const apply=body=>api(root+'/rounds/apply',gm.token,'POST',body)
 const before=await submit([
   {kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''},
   {kind:'ability',abilityId:'spell',stage:'release',target:{kind:'point',point},note:''},
 ]),key=i=>'new:'+actorId+':'+i
 const first=await calculate(request(before,[500,2000],[
   {key:key(0),kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields},
   {key:key(1),kind:'ability',confirmed:true,binding:'unbound',charge:'prepare:'+key(0),input:fields,
     spatialConfirmed:true,physics:{kind:'push-object',impulseNs:60}},
 ]))
 assert.deepEqual(await world(),before)
 assert.deepEqual(first.summary.slides.moving,[{objectId:'crate',name:'Ящик',point:{x:6.75,y:5,z:0},speedMs:5}])
 await apply(command(first))
 const sliding=await world()
 await f.restart()
 assert.deepEqual(await world(),sliding)
 const map=(await api(route+'/perception',player.token)).map
 const observed=map.objects.find(o=>o.id==='crate')
 assert.equal(observed.x,6.75);assert.equal(observed.sliding,true);assert(!Object.hasOwn(observed,'physics'))
 await phase(sliding.campaign.declarations.active,'archive')
 const next=await submit([{kind:'interact',operation:'open',target:{kind:'object',id:'gate'},note:''}])
 const blocked=await calculate(request(next,[500],[]))
 assert.equal(blocked.summary.slides.stops[0].collision.contact.objectId,'gate')
 const open=await calculate(request(next,[100],[]))
 const [stop]=open.summary.slides.stops
 assert.equal(stop.collision.contact.objectId,'wall')
 assert(Math.abs(stop.point.x-11)<1e-10);assert(Math.abs(stop.collision.energyJ-40)<1e-8)
 assert.equal(stop.impact.collapsed,true)
 assert(Math.abs(stop.impact.energyJ-20)<1e-8)
 assert.equal(open.summary.falls.landings[0].actorId,guard.id)
 assert.equal(open.summary.falls.landings[0].toZ,0)
 assert.deepEqual(await world(),next)
 const appliedCommand=command(open),{receipt}=await apply(appliedCommand),after=await world()
 assert.equal(after.campaign.scenes.scenes[0].objects.some(o=>o.id==='wall'),false)
 await f.restart()
 assert.equal((await apply(appliedCommand)).duplicate,true);assert.deepEqual(await world(),after)
 const history=await api(root+'/rounds/history',gm.token)
 const rollback=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:history.revision,receiptId:receipt.id,reason:'Проверить скольжение'})
 await api(root+'/rounds/change/apply',gm.token,'POST',command(rollback))
 assert.deepEqual((await world()).campaign.scenes.scenes[0],next.campaign.scenes.scenes[0])
 const undone=await api(root+'/rounds/history',gm.token)
 const replay=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:undone.revision,receiptId:receipt.id})
 await apply(command(replay))
 assert.deepEqual((await world()).campaign.scenes.scenes[0],after.campaign.scenes.scenes[0])
})
