import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'

for(const dialect of ['sqlite','postgres'])test('3D-полигон: мастер, четыре игрока, три области, раунд и перезапуск · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('sandbox-gm'),players=[]
 for(let i=0;i<4;i++)players.push(await f.register('sandbox-player-'+i))
 const body={exampleId:'world6-3d-sandbox',version:1,title:'Полигон друзей',slots:4,commandKey:'starter:'+crypto.randomUUID()}
 const receipt=await api('/lobbies/from-example',gm.token,'POST',body,201),root='/lobbies/'+receipt.id
 assert.equal((await api(root,gm.token)).energy,'any');assert.equal((await api(root,gm.token)).slots,4)
 const code=(await api(root,gm.token)).inviteCode,heroes=[]
 for(let i=0;i<4;i++){
  const p=players[i];await api('/lobbies/join',p.token,'POST',{code})
  const source={...createDefaultCharacter(),id:crypto.randomUUID(),name:'Герой '+i}
  if(i===3)source.profile.energy='shadow'
  await api('/characters/'+source.id,p.token,'PUT',{character:source,revision:-1})
  const hero=(await api(root+'/characters',p.token,'POST',{characterId:source.id},201)).id;heroes.push(hero)
  await api(root+'/characters/'+hero,gm.token,'PATCH',{approved:true})
 }
 assert.equal((await api(root,gm.token)).members.length,5)
 const fifth=await f.register('sandbox-fifth');await api('/lobbies/join',fifth.token,'POST',{code},409)
 const initial=await api(root+'/world',gm.token),sceneIds=initial.campaign.scenes.scenes.map(s=>s.id)
 const beforeCharacters=structuredClone(initial.characters)
 for(const sceneId of sceneIds){
  const state=await api(root+'/world',gm.token),scene=state.campaign.scenes.scenes.find(s=>s.id===sceneId)
  const setup={sceneId,actorIds:heroes,objectIds:scene.objects.map(o=>o.id),contactIds:heroes,title:scene.name,description:'Описание для игроков',anchor:{x:3,y:8,z:0},revealTerrain:true}
  await api(root+'/play/setup',players[0].token,'POST',{revision:state.revision,setup},403)
  await api(root+'/play/setup',gm.token,'POST',{revision:state.revision,setup})
  const after=await api(root+'/world',gm.token);assert.equal(after.campaign.seconds,0);assert.deepEqual(after.characters,beforeCharacters)
  for(let i=0;i<4;i++){
   const view=await api(root+'/characters/'+heroes[i]+'/perception',players[i].token)
   assert.equal(view.map.frame.id,sceneId);assert.equal(view.map.contacts.length,4)
   for(const npc of initial.characters.filter(a=>!heroes.includes(a.id)))assert(!JSON.stringify(view).includes(npc.id))
   assert.equal(after.campaign.scenes.scenes.flatMap(s=>s.tokens).filter(t=>t.actorId===heroes[i]).length,1)
  }
 }
 // All four players submit to the same authoritative round. Applying a retry
 // must not move characters or advance time twice, including after restart.
 let state=await api(root+'/world',gm.token)
 await api(root+'/declarations',gm.token,'POST',{revision:state.revision,sceneId:sceneIds[2],participantIds:heroes,durationSeconds:5,allowReplace:true},201)
 const timings=[]
 for(let i=0;i<4;i++){
  const d=await api(root+'/characters/'+heroes[i]+'/declarations',players[i].token),c=d.collection
  await api(root+'/characters/'+heroes[i]+'/declarations',players[i].token,'PUT',{collectionId:c.id,epoch:c.epoch,baseVersion:0,controlStamp:d.controlStamp,actions:[{kind:'wait',seconds:1,note:''}]})
  timings.push({actorId:heroes[i],entryRevision:1,budgetMs:5000,costs:[]})
 }
 state=await api(root+'/world',gm.token);let c=state.campaign.declarations.active
 await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
 state=await api(root+'/world',gm.token);c=state.campaign.declarations.active
 const preview=await api(root+'/rounds/calculate',gm.token,'POST',{revision:state.revision,collectionId:c.id,epoch:c.epoch,input:{timings,continuations:[],missingDecisions:[],interactionsConfirmed:true}})
 const command={previewId:preview.id,generation:preview.generation,commandKey:crypto.randomUUID()}
 await api(root+'/rounds/apply',gm.token,'POST',command);const played=await api(root+'/world',gm.token)
 assert.equal(played.campaign.seconds,5)
 await api(root+'/rounds/apply',gm.token,'POST',command);assert.deepEqual(await api(root+'/world',gm.token),played)
 await f.restart();assert.deepEqual(await api(root+'/world',gm.token),played)
 for(let i=0;i<4;i++)assert.equal((await api(root+'/characters/'+heroes[i]+'/perception',players[i].token)).map.frame.id,sceneIds[2])
 const retry=await api('/lobbies/from-example',gm.token,'POST',body);assert.equal(retry.id,receipt.id);assert(retry.duplicate)
 assert.deepEqual(await api(root+'/world',gm.token),played)
})
