import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
import {createTabletopObject} from '../generated/tabletopCatalog.mjs'
import {rotateTabletopObject} from '../generated/tabletopCommands.mjs'

for(const dialect of ['sqlite','postgres'])test('Модульный стол: серверное сохранение, компоненты и раскрытие · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('owner'),player=await f.register('tabletop-player')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 await api(root+'/join',player.token,'POST')
 const hero={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Исследователь таверны'}
 await api('/characters/'+hero.id,player.token,'PUT',{character:hero,revision:-1})
 const placed=await api(root+'/characters',player.token,'POST',{characterId:hero.id},201),heroId=placed.id
 const state=createScene(emptyScenes(),'tavern','Служебное имя таверны','top'),scene=state.scenes[0]
 scene.objects=[createTabletopObject('candle','lamp',{x:3,y:3,z:0}),createTabletopObject('timber-door','door',{x:7,y:3,z:0}),createTabletopObject('table','table',{x:5,y:3,z:0}),createTabletopObject('trap-spikes','secret-trap',{x:25,y:15,z:0})]
 scene.objects[3].name='СЕКРЕТНАЯ ЛОВУШКА';scene.tokens=[{actorId:heroId,x:1,y:1,z:0,diameter:.8,support:{kind:'ground'}}]
 const original=await api(root+'/world',gm.token)
 await api(root+'/scenes',gm.token,'PUT',{revision:original.revision,scenes:state})
 const world=await api(root+'/world',gm.token);assert.deepEqual(world.characters,original.characters);assert.equal(world.campaign.seconds,original.campaign.seconds)
 await api(root+'/entities/migrate',gm.token,'POST',{revision:world.revision})
 const draft={activeSceneId:'tavern',scenes:[{sceneId:'tavern',title:'Таверна',description:'',areas:[{id:'hall',x:0,y:0,z:0,width:12,depth:10,height:10,visible:true}],objects:[{objectId:'lamp',visible:false},{objectId:'door',visible:true},{objectId:'table',visible:true}],contacts:[]}]}
 const rev=async()=> (await api(root,gm.token)).revision
 await api(root+'/characters/'+heroId+'/disclosure',gm.token,'PUT',{draft,revision:await rev()})
 const fresh=await api(root+'/scenes',gm.token),changed=rotateTabletopObject(fresh.scenes,'table')
 Object.assign(changed.scenes[0].objects.find(o=>o.id==='lamp'),{active:false,facing:90});changed.scenes[0].objects.find(o=>o.id==='door').open=true
 await api(root+'/scenes',gm.token,'PUT',{revision:fresh.revision,scenes:changed})
 assert.deepEqual((await api(root+'/scenes',gm.token)).scenes,changed)
 const view=await api(root+'/characters/'+heroId+'/perception',player.token),objects=view.map.objects
 assert.equal(objects.find(o=>o.id==='lamp').active,true);assert.equal(objects.find(o=>o.id==='lamp').facing,0)
 assert.equal(objects.find(o=>o.id==='door').open,true);assert.equal(objects.find(o=>o.id==='table').facing,90)
 assert(!JSON.stringify(view).includes('СЕКРЕТНАЯ ЛОВУШКА'));assert(!JSON.stringify(view).includes('secret-trap'))
 const components=await api(root+'/entities',gm.token),lamp=components.entities.find(e=>e.kind==='object'&&e.components.identity.data.id==='lamp')
 assert.equal(lamp.components.geometry.data.active,false);assert.equal(lamp.components.geometry.data.asset,'candle')
 await api(root+'/scenes',player.token,'PUT',{revision:await rev(),scenes:changed},403)
 await api(root+'/scenes',gm.token,'PUT',{revision:fresh.revision,scenes:changed},409)
 const malformed=structuredClone(changed);malformed.scenes[0].objects[0].asset='remote-untrusted-model'
 await api(root+'/scenes',gm.token,'PUT',{revision:await rev(),scenes:malformed},400)
 await f.restart();assert.deepEqual((await api(root+'/scenes',gm.token)).scenes,changed)
 assert.equal((await api(root+'/world',gm.token)).campaign.seconds,original.campaign.seconds)
 await api(root+'/characters/'+heroId+'/review',gm.token,'POST',{revision:await rev(),decision:'approve',note:''})
 await api(root+'/declarations',gm.token,'POST',{revision:await rev(),sceneId:'tavern',participantIds:[heroId],durationSeconds:10,allowReplace:true},201)
 let d=await api(root+'/characters/'+heroId+'/declarations',player.token)
 const move={kind:'interact',target:{kind:'object',id:'table'},operation:'relocate',destination:{x:8,y:6,z:0},note:''}
 const submit=actions=>api(root+'/characters/'+heroId+'/declarations',player.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:0,controlStamp:d.controlStamp,actions})
 await api(root+'/characters/'+heroId+'/declarations',player.token,'PUT',{collectionId:d.collection.id,epoch:d.collection.epoch,baseVersion:0,controlStamp:d.controlStamp,actions:[{...move,destination:{x:9999,y:0,z:0}}]},400)
 const actions=[...['close','lock','unlock','open'].map(operation=>({kind:'interact',target:{kind:'object',id:'door'},operation,note:''})),{kind:'interact',target:{kind:'object',id:'lamp'},operation:'ignite',note:''},move]
 await submit(actions);d=await api(root+'/characters/'+heroId+'/declarations',player.token)
 await api(root+'/declarations',gm.token,'PATCH',{collectionId:d.collection.id,epoch:d.collection.epoch,operation:'close'})
 const beforeRound=await api(root+'/world',gm.token),c=beforeRound.campaign.declarations.active
 const preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:beforeRound.revision,collectionId:c.id,epoch:c.epoch,input:{timings:[{actorId:heroId,entryRevision:d.entry.revision,budgetMs:10000,costs:actions.map((_,index)=>({index,personalMs:1000}))}],continuations:[],missingDecisions:[],interactionsConfirmed:true}})
 assert.deepEqual(await api(root+'/world',gm.token),beforeRound,'Calculation leaves the authoritative table unchanged')
 const command={previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()}
 await api(root+'/rounds/apply',gm.token,'POST',command);await api(root+'/rounds/apply',gm.token,'POST',command)
 const afterRound=await api(root+'/world',gm.token),table=afterRound.campaign.scenes.scenes[0].objects.find(o=>o.id==='table')
 assert.equal(table.x,8);assert.equal(table.y,6);assert.equal(afterRound.campaign.scenes.scenes[0].objects.find(o=>o.id==='door').locked,false)
 assert.equal(afterRound.campaign.seconds,original.campaign.seconds+10)
 const own=await api(root+'/characters/'+heroId+'/perception',player.token)
 assert.equal(own.map.objects.find(o=>o.id==='door').locked,false);assert(!JSON.stringify(own).includes('secret-trap'))
 await f.restart();assert.deepEqual(await api(root+'/world',gm.token),afterRound)
})
