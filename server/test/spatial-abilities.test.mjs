import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes,sceneObject} from '../generated/scenes.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
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
