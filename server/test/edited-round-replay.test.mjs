import test from 'node:test'
import assert from 'node:assert/strict'
import {gunzipSync} from 'node:zlib'
import {fixture,lobbyBody} from './fixtures.mjs'
import {createDefaultCharacter} from '../generated/characterModel.mjs'
import {createScene,emptyScenes} from '../generated/scenes.mjs'
import {emptyAbility} from '../generated/rpgSchema.mjs'
const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:10,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'EDITED-REPLAY-SECRET'}
for(const dialect of ['sqlite','postgres'])test('Изменённая переигровка · '+dialect,async t=>{
 const f=await fixture(t,dialect),{api}=f,gm=await f.register('edited-owner'),player=await f.register('edited-player'),helper=await f.register('edited-helper')
 const {id}=await api('/lobbies',gm.token,'POST',lobbyBody,201),root='/lobbies/'+id
 for(const u of [player,helper])await api(root+'/join',u.token,'POST')
 await api(root+'/members/'+helper.user.id,gm.token,'PATCH',{role:'ASSISTANT'})
 const source={...createDefaultCharacter(),id:'edited-source',name:'Hero'}
 await api('/characters/'+source.id,player.token,'PUT',{character:source,revision:-1})
 const heroId=(await api(root+'/characters',player.token,'POST',{characterId:source.id},201)).id,route=root+'/characters/'+heroId,world=()=>api(root+'/world',gm.token),hero=w=>w.characters.find(a=>a.id===heroId)
 await api(route+'/review',gm.token,'POST',{revision:(await world()).revision,decision:'approve',note:''})
 const w=await world();Object.assign(hero(w).body.parts.torso,{maximum:100,current:50});hero(w).rpg.formulas=[];hero(w).statistics.energyRegeneration='0';hero(w).resources.mana={maximum:'50',current:'50'}
 hero(w).rpg.abilities=[{...emptyAbility(),id:'spell',templateId:'template',name:'Удар',approved:true,mechanism:'manual',cost:{mana:10,shadow:0,stamina:0},rangeM:10}]
 w.campaign.scenes=createScene(emptyScenes(),'edited-scene','Scene','top');w.campaign.scenes.scenes[0].tokens=[{actorId:heroId,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}}]
 const action=stage=>({kind:'ability',abilityId:'spell',stage,target:{kind:stage==='prepare'?'none':'self'},note:''}),oldKey='new:'+heroId+':1',newKey='new:'+heroId+':2'
 w.campaign.declarations={version:1,active:{id:crypto.randomUUID(),sceneId:'edited-scene',sceneName:'Scene',durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:[heroId],entries:[{actorId:heroId,actorName:'Hero',revision:1,status:'submitted',actions:[action('prepare'),action('release')],resolved:[],submittedBy:player.user.id,submittedAt:new Date().toISOString(),note:''}],history:[]},archive:[]}
 await api(root+'/world',gm.token,'PUT',{world:w,revision:w.revision})
 const input=(w,damage=10)=>{const e=w.campaign.declarations.active.entries[0],prep=e.actions.findIndex(a=>a.kind==='ability'&&a.stage==='prepare');return {timings:[{actorId:heroId,entryRevision:e.revision,budgetMs:5000,costs:e.actions.flatMap((a,index)=>a.kind==='wait'?[]:[{index,personalMs:1000}])}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:e.actions.flatMap((a,index)=>a.kind!=='ability'?[]:[{key:'new:'+heroId+':'+index,kind:'ability',confirmed:true,binding:'unbound',charge:a.stage==='release'?'prepare:new:'+heroId+':'+prep:'',input:{...fields,manualLocal:damage}}])}}
 const normal=async()=>{const w=await world(),c=w.campaign.declarations.active;return api(root+'/rounds/calculate',gm.token,'POST',{revision:w.revision,collectionId:c.id,epoch:c.epoch,input:input(w)})}
 const command=p=>({previewId:p.id,generation:p.generation,commandKey:crypto.randomUUID()}),apply=(b,status=200,token=gm.token)=>api(root+'/rounds/apply',token,'POST',b,status)
 const original=await normal(),originalReceipt=(await apply(command(original))).receipt,oldRolls=original.summary.rules.find(r=>r.kind==='release').rolls
 const back=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:originalReceipt.id,reason:'Изменить заявление'})
 await api(root+'/rounds/change/apply',gm.token,'POST',command(back))
 let edited,options,savedPreview
 const optionsGet=()=>api(root+'/rounds/replay/options',gm.token)
 const body=async(choices=[{key:newKey,mode:'preserve',sourceKey:oldKey}],damage=20)=>{const w=await world(),c=w.campaign.declarations.active,o=await optionsGet();return {revision:w.revision,collectionId:c.id,epoch:c.epoch,receiptId:o.receiptId,input:input(w,damage),choices}}
 const edit=(b,status=200,token=gm.token)=>api(root+'/rounds/replay/edited/calculate',token,'POST',b,status)
 await t.test('Игрок меняет очередь через повторное заявление; источник не теряется, точный повтор закрыт',async()=>{
  let w=await world(),c=w.campaign.declarations.active
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'reopen'})
  const own=await api(route+'/declarations',player.token);c=own.collection
  await api(route+'/declarations',player.token,'PUT',{collectionId:c.id,epoch:c.epoch,baseVersion:own.entry.revision,controlStamp:own.controlStamp,actions:[{kind:'wait',seconds:.5,note:''},action('prepare'),action('release')]})
  await api(root+'/declarations',gm.token,'PATCH',{collectionId:c.id,epoch:c.epoch,operation:'close'})
  edited=await world();options=await optionsGet();assert.equal(options.receiptId,originalReceipt.id);assert.equal(options.actions[0].key,oldKey);assert(options.actions[0].canPreserve)
  await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:edited.revision,receiptId:originalReceipt.id},409)
  await api(root+'/rounds/replay/options',player.token,'GET',undefined,403)
 })
 await t.test('Перестановка сохраняет выбранные броски и пересчитывает силу без изменения мира до применения',async()=>{
  savedPreview=await edit(await body());assert.deepEqual(await world(),edited)
  const out=savedPreview.summary.rules.find(r=>r.kind==='release');assert.equal(out.key,newKey);assert.deepEqual(out.rolls,oldRolls);assert.equal(out.rollGroups[0].targetId,heroId)
  assert.notEqual(out.details,original.summary.rules.find(r=>r.kind==='release').details);assert.equal(savedPreview.summary.replay.selections[0].sourceKey,oldKey)
  const fresh=await edit(await body([{key:newKey,mode:'new'}]));assert.notDeepEqual(fresh.summary.rules.find(r=>r.kind==='release').rolls,oldRolls)
  savedPreview=await edit(await body())
 })
 await t.test('Неявные, повторные, чужие, поддельные и устаревшие сопоставления отвергаются',async()=>{
  const b=await body();await edit({...b,choices:[]},400);await edit({...b,choices:[...b.choices,...b.choices]},400)
  await edit({...b,choices:[{key:newKey,mode:'preserve',sourceKey:'foreign'}]},400);await edit({...b,receiptId:'foreign'},409)
  await edit({...b,input:{...b.input,replay:{sourceReceiptId:'forged',selections:[]}}},400)
  await api(root+'/rounds/calculate',gm.token,'POST',{revision:b.revision,collectionId:b.collectionId,epoch:b.epoch,input:{...b.input,replay:{sourceReceiptId:'forged',selections:[]}}},400)
  await edit({...b,revision:b.revision-1},409);await edit({...b,epoch:b.epoch-1},409);await edit(b,403,player.token);await edit(b,403,helper.token)
  assert.deepEqual(await world(),edited)
 })
 await t.test('История v7 без групп целей сохраняет старые броски после повторяемой миграции',async()=>{
  const receipt=await f.server.db.get('SELECT receipt_json FROM round_receipts WHERE id=?',[originalReceipt.id]),legacy=JSON.parse(receipt.receipt_json)
  for(const r of legacy.summary.rules)delete r.rollGroups
  await f.server.db.run('UPDATE round_receipts SET receipt_json=? WHERE id=?',[JSON.stringify(legacy),originalReceipt.id]);await f.server.db.run('UPDATE round_history_data SET executor_version=? WHERE receipt_id=?',['r04-round-history-v7',originalReceipt.id])
  await f.restart();savedPreview=await edit(await body());assert.deepEqual(savedPreview.summary.rules.find(r=>r.kind==='release').rolls,oldRolls)
 })
 await t.test('Один источник не служит двум выпускам или другой способности; новый сбор не наследует контекст',async()=>{
  const before=await world(),changed=structuredClone(before);changed.campaign.declarations.active.entries[0].actions.push(action('release'))
  await api(root+'/world',gm.token,'PUT',{revision:before.revision,world:changed})
  await edit(await body([{key:newKey,mode:'preserve',sourceKey:oldKey},{key:'new:'+heroId+':3',mode:'preserve',sourceKey:oldKey}]),400)
  changed.campaign.declarations.active.entries[0].actions[2].abilityId='different-spell';changed.campaign.declarations.active.entries[0].actions.pop()
  await api(root+'/world',gm.token,'PUT',{revision:(await world()).revision,world:changed});await edit(await body(),400)
  changed.campaign.declarations.active.id=crypto.randomUUID();await api(root+'/world',gm.token,'PUT',{revision:(await world()).revision,world:changed});assert.equal(await optionsGet(),null)
  await api(root+'/world',gm.token,'PUT',{revision:(await world()).revision,world:before});assert(await optionsGet())
 })
 await t.test('Пауза, отзыв секретного доступа и допуска героя блокируют текущий расчёт или применение',async()=>{
  const grant=async permissions=>api(root+'/members/'+helper.user.id+'/permissions',gm.token,'PATCH',{revision:(await world()).revision,permissions})
  await api(root+'/rounds/pause',gm.token,'POST',{revision:(await world()).revision,paused:true,reason:'Проверить паузу',commandKey:crypto.randomUUID()});await edit(await body(),409)
  await api(root+'/rounds/pause',gm.token,'POST',{revision:(await world()).revision,paused:false,reason:'Продолжить',commandKey:crypto.randomUUID()})
  await grant(['rounds','viewSecrets']);const p=await edit(await body(),200,helper.token)
  await grant(['rounds']);await apply(command(p),403,helper.token);await api(root+'/rounds/replay/options',helper.token,'GET',undefined,403)
  await api(route,gm.token,'PATCH',{approved:false,revision:(await world()).revision,note:'Повторная проверка допуска'});await edit(await body(),409)
  await api(route,gm.token,'PATCH',{approved:true,revision:(await world()).revision,note:''});await f.restart();savedPreview=await edit(await body())
 })
 await t.test('Контрольная точка и полная копия сохраняют изменённый контекст без разрешения точного повтора',async()=>{
  const point=(await api(root+'/rounds/checkpoints',gm.token,'POST',{revision:(await world()).revision,name:'Исправленное заявление',commandKey:crypto.randomUUID()})).checkpoint
  const p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:(await world()).revision,checkpointId:point.id,reason:'Восстановить изменённую переигровку'})
  await api(root+'/rounds/change/apply',gm.token,'POST',command(p));assert((await optionsGet()).actions.length)
  let w=await world();await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:w.revision,receiptId:originalReceipt.id},409)
  const backup=await api(root+'/archive',gm.token),data=Buffer.from(backup.data,'base64'),archive=JSON.parse(gunzipSync(data));assert.equal(archive.replayExact,false);assert.equal(archive.checkpoints[0].replayExact,false);assert.equal(archive.replayId,originalReceipt.id)
  const response=await fetch(f.base+'/api'+root+'/archive/calculate?revision='+w.revision,{method:'POST',headers:{Authorization:'Bearer '+gm.token,'Content-Type':'application/gzip'},body:data}),restorePreview=await response.json();assert.equal(response.status,200,JSON.stringify(restorePreview))
  await api(root+'/archive/apply',gm.token,'POST',{...command(restorePreview),reason:'Вернуть полную копию'})
  options=await optionsGet();assert.notEqual(options.receiptId,originalReceipt.id);assert.equal(options.actions[0].key,oldKey)
  w=await world();await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:w.revision,receiptId:options.receiptId},409)
  savedPreview=await edit(await body());assert.deepEqual(savedPreview.summary.rules.find(r=>r.kind==='release').rolls,oldRolls)
 })
 await t.test('Отказ аудита атомарен; после перезапуска повтор команды не расходует ресурс второй раз',async()=>{
  const b=command(savedPreview),before=await world(),db=f.server.db,original=db.transaction
  db.transaction=fn=>original(tx=>fn({...tx,run:(sql,args)=>{if(sql.startsWith('INSERT INTO audit')&&args.includes('apply-round'))throw Error('TEST-EDITED-AUDIT');return tx.run(sql,args)}}))
  try{await apply(b,500)}finally{db.transaction=original}
  assert.deepEqual(await world(),before);assert(await optionsGet());assert(await db.get('SELECT id FROM round_previews WHERE id=?',[savedPreview.id]))
  await f.restart();await apply(b);const applied=await world();assert.equal(hero(applied).resources.mana.current,'40');assert.equal((await apply(b)).duplicate,true);assert.deepEqual(await world(),applied);assert.equal(await optionsGet(),null)
  const data=await f.server.db.get('SELECT input_json FROM round_history_data WHERE receipt_id=?',[(await apply(b)).receipt.id]);assert.equal(JSON.parse(data.input_json).replay.selections[0].mode,'preserve')
 })
 await t.test('Применённые решения и группы бросков экспортируются и точно переигрываются после нового отката',async()=>{
  const full=await api(root+'/archive',gm.token),archive=JSON.parse(gunzipSync(Buffer.from(full.data,'base64'))),active=archive.rounds.find(r=>archive.branch.includes(r.id))
  assert.equal(active.input.replay.selections[0].mode,'preserve');assert.deepEqual(active.input.replay.selections[0].groups[0].values,oldRolls)
  const p=await api(root+'/rounds/rollback/calculate',gm.token,'POST',{revision:(await world()).revision,receiptId:active.id,reason:'Точно повторить исправленный удар'})
  await api(root+'/rounds/change/apply',gm.token,'POST',command(p));const h=await api(root+'/rounds/history',gm.token)
  const exact=await api(root+'/rounds/replay/calculate',gm.token,'POST',{revision:h.revision,receiptId:h.replay.receiptId});assert.deepEqual(exact.summary.rules.find(r=>r.kind==='release').rolls,oldRolls)
 })
})
