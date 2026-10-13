import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'world6-assets-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src')){
 if(!file.endsWith('.ts'))continue
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const {expandedAssets}=await module('expandedArtwork'),media=await module('visualMedia'),scenes=await module('scenes'),perception=await module('scenePerception')
const schema=await module('rpgSchema'),visual=await module('abilityVisuals'),projection=await module('sceneAbilityVisuals'),starter=await module('starterCampaign'),engine=await module('rpgEngine')
test('Большой набор: файлы доступны, ключи уникальны, нет внешних ссылок и точных дублей',async()=>{
 assert(expandedAssets.length>=250)
 assert.equal(new Set(expandedAssets.map(a=>a.id)).size,expandedAssets.length)
 const hashes=new Set()
 for(const entry of expandedAssets){
  assert(media.isArtwork(entry.id));assert(media.artworkLabels[entry.id]);assert(media.artworkSource(entry.id))
  const svg=await readFile('src/assets/expanded/'+entry.file,'utf8')
  assert.match(svg,/<svg\b/);assert.match(svg,/shape-rendering="crispEdges"/)
  assert(!/<script|<foreignObject|\bon\w+=|href=|url\(\s*https?:/i.test(svg),entry.id)
  hashes.add(createHash('sha256').update(svg).digest('hex'))
 }
 assert.equal(hashes.size,expandedAssets.length)
 for(const bad of ['unknown-asset','https://example.test/portrait.svg','data:image/svg+xml;base64,abc','../expanded/oak.svg'])assert(!media.isArtwork(bad))
 assert(media.portraitPresets.length>=30);assert(media.objectPresets.length>=80);assert(media.itemPresets.length>=60);assert(media.sceneBackgroundPresets.length>=30)
})
test('Объект: изображение проходит сохранение, копию и индивидуальную память без скрытого обновления',()=>{
 const first=media.objectPresets[0],second=media.objectPresets[1]
 const state=scenes.createScene(scenes.emptyScenes(),'scene','Двор','top'),s=state.scenes[0]
 s.objects=[{...scenes.sceneObject('crate','box',{x:2,y:2,z:0}),artwork:first}]
 assert(scenes.isSceneState(state));assert.equal(scenes.copySceneState(state).scenes[0].objects[0].artwork,first)
 const draft={activeSceneId:'scene',scenes:[{sceneId:'scene',title:'Двор',description:'',areas:[{id:'area',x:0,y:0,z:-5,width:30,depth:20,height:25,visible:true}],objects:[{objectId:'box',visible:false}],contacts:[]}]}
 const observed=perception.preparePerception(draft,perception.emptyPerception('hero'),state,['hero'])
 s.objects[0].artwork=second
 const next=perception.preparePerception(draft,observed,state,['hero'])
 assert.equal(perception.perceivedMap(next,state,[]).objects[0].artwork,first)
 assert.equal(perception.copyPerceptions({version:1,heroes:[next]}).heroes[0].scenes[0].objects[0].snapshot.artwork,first)
 s.objects[0].artwork='https://example.test/unsafe.svg';assert(!scenes.isSceneState(state))
})
test('Оформление: проходит копирование, отключается, не принимает скрытых полей и бесконечных параметров',()=>{
 const ability={...schema.emptyAbility(),name:'Пламя',schoolId:'fire',visualEffect:{familyId:'fire',scale:1.2,intensity:.5,durationMs:2000}}
 assert(schema.isAbility(ability));assert.deepEqual(schema.copyAbility(ability).visualEffect,ability.visualEffect)
 assert.equal(visual.resolveAbilityVisual({schoolId:'fire'}).familyId,'fire')
 assert.equal(visual.resolveAbilityVisual({schoolId:'fire',visualEffect:{familyId:'none'}}).familyId,'none')
 for(const spec of [{familyId:'unknown'},{familyId:'fire',scale:Infinity},{familyId:'fire',durationMs:600000},{familyId:'fire',url:'https://example.test/'},{familyId:'fire',damage:999}])assert(!schema.isAbility({...ability,visualEffect:spec}))
 assert.equal(visual.abilityVisualFamilies.length,20)
})
const fixture=()=>{
 const w=starter.createNightCrossing('visual').world,s=w.campaign.scenes.scenes[0],a=w.characters[0],b=w.characters[1]
 w.campaign.scenes.scenes.forEach(scene=>{scene.tokens=[]})
 s.tokens=[{actorId:a.id,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}},{actorId:b.id,x:5,y:2,z:0,diameter:1,support:{kind:'ground'}}]
 const ability={...schema.emptyAbility(),id:'fire',templateId:'fire',approved:true,name:'PRIVATE SPELL NAME',schoolId:'fire',visualEffect:{familyId:'fire'},mechanism:'effect'}
 const cast=(id,targetId)=>({id,ability:structuredClone(ability),targetId,status:'preparing',readyAt:0,endsAt:null,input:({region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''})})
 a.rpg.casts=[cast('PRIVATE_OWN_CAST',a.id)];b.rpg.casts=[cast('PRIVATE_OTHER_CAST',b.id)]
 const draft={activeSceneId:s.id,scenes:[{sceneId:s.id,title:'Двор',description:'',areas:[{id:'area',x:0,y:0,z:s.minZ,width:10,depth:10,height:s.maxZ-s.minZ,visible:true}],objects:[],contacts:[{actorId:b.id,kind:'identified',label:'Сосед',signs:'',showHeight:true,point:{x:5,y:2,z:0},radius:0}]}]}
 return {w,s,a,b,draft}
}
test('Эффекты чужого героя появляются только после явного раскрытия мастером; имена, ID и параметры скрыты',()=>{
 const {w,s,a,b,draft}=fixture(),ids=w.characters.map(a=>a.id)
 let knowledge=perception.preparePerception(draft,perception.emptyPerception(a.id),w.campaign.scenes,ids)
 const before=perception.perceivedMap(knowledge,w.campaign.scenes,w.characters)
 assert.equal(before.visuals.length,1)
 draft.scenes[0].contacts[0].showVisuals=true
 knowledge=perception.preparePerception(draft,knowledge,w.campaign.scenes,ids)
 assert.equal(knowledge.scenes[0].contacts[0].showVisuals,true)
 assert.equal(perception.perceptionDraft(knowledge).scenes[0].contacts[0].showVisuals,true)
 const after=perception.perceivedMap(knowledge,w.campaign.scenes,w.characters)
 assert.equal(after.visuals.length,2)
 for(const value of ['PRIVATE SPELL NAME','PRIVATE_OTHER_CAST',b.id])assert(!JSON.stringify(after.visuals).includes(value))
 s.tokens[1].x=12;assert.equal(perception.perceivedMap(knowledge,w.campaign.scenes,w.characters).visuals.length,1)
 draft.scenes[0].contacts[0].showHeight=false;assert(!perception.isPerceptionDraft(draft))
})
test('Скрытая цель и точка вне видимой области не попадают в данные эффектов',()=>{
 const {w,s,a,b,draft}=fixture(),cast=a.rpg.casts[0]
 cast.status='maintaining';cast.targetId=b.id;draft.scenes[0].contacts=[]
 const knowledge=perception.preparePerception(draft,perception.emptyPerception(a.id),w.campaign.scenes,w.characters.map(a=>a.id))
 assert.equal(perception.perceivedMap(knowledge,w.campaign.scenes,w.characters).visuals,undefined)
 cast.status='ended';cast.visualRelease={sceneId:s.id,start:{x:2,y:2,z:0},end:{x:12,y:12,z:0},releasedAt:5};cast.spatialRelease={sceneId:s.id,kind:'point',point:{x:12,y:12,z:0},actorIds:[],inputs:[]}
 assert.equal(perception.perceivedMap(knowledge,w.campaign.scenes,w.characters).visuals,undefined)
})
test('Повтор сохраняет координаты выпуска при последующем перемещении; боковой вид использует X/Z',()=>{
 const {w,s,a}=fixture(),cast=a.rpg.casts[0]
 cast.id='cast';cast.status='ended';cast.targetId=a.id;cast.visualRelease={sceneId:s.id,start:{x:2,y:2,z:0},end:{x:6,y:2,z:3},releasedAt:5}
 assert.equal(schema.copyRpg(a.rpg).casts[0].visualRelease.end.z,3)
 s.tokens[0].x=9
 const effects=projection.sceneAbilityVisuals(s,w.characters,10)
 assert.equal(effects.find(e=>e.phase==='sequence').start.x,2)
 assert.equal(effects.find(e=>e.phase==='sequence').end.x,6)
 assert.deepEqual(projection.visualPoint({x:6,y:2,z:3},{...s,view:'side'}),{x:6,y:s.maxZ-3})
})
test('Оформление не меняет ресурсы и последствия настоящего применения; снимок позиции записывается движком',()=>{
 const {w,s,a}=fixture();a.rpg.casts=[];a.rpg.abilities=[{...schema.emptyAbility(),id:'spell',templateId:'spell',approved:true,name:'Тест',mechanism:'effect',schoolId:'',visualEffect:{familyId:'fire'},cost:{mana:1,shadow:0,stamina:0}}]
 const control=structuredClone(w);control.characters[0].rpg.abilities[0].visualEffect={familyId:'none'}
 const input={...({region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}),accessible:true,conditionsConfirmed:true,canSpeak:true}
 const first=engine.makeActionPlan(w,a.id,'spell',a.id,input,'visual-action',()=>0),second=engine.makeActionPlan(control,a.id,'spell',a.id,input,'visual-action',()=>0)
 assert(first.ok,first.message);assert(second.ok,second.message)
 assert.deepEqual(first.plan.world.characters.map(c=>c.resources),second.plan.world.characters.map(c=>c.resources))
 assert.deepEqual(first.plan.world.characters.map(c=>c.body),second.plan.world.characters.map(c=>c.body))
 assert.equal(first.plan.world.characters[0].rpg.casts[0].visualRelease.sceneId,s.id)
 assert.deepEqual(first.plan.world.characters[0].rpg.casts[0].visualRelease.start,{x:2,y:2,z:0})
})

test('Повторяемая поверхность раскрывается внутри известных областей; полный фон сцены не передается',()=>{
 const {w,s,a,draft}=fixture(),tile=media.sceneBackgroundPresets.find(media.isTiledArtwork)
 assert(tile);s.background=tile;s.backgroundTileSizeM=3
 const knowledge=perception.preparePerception(draft,perception.emptyPerception(a.id),w.campaign.scenes,w.characters.map(c=>c.id))
 const map=perception.perceivedMap(knowledge,w.campaign.scenes,w.characters)
 assert.equal(map.frame.background,tile);assert.equal(map.frame.backgroundTileSizeM,3)
 assert.equal(scenes.copySceneState(w.campaign.scenes).scenes[0].backgroundTileSizeM,3)
 s.background='data:image/png;base64,U0VDUkVU'
 const hidden=perception.preparePerception(draft,knowledge,w.campaign.scenes,w.characters.map(c=>c.id))
 const result=perception.perceivedMap(hidden,w.campaign.scenes,w.characters)
 assert.equal(result.frame.background,undefined);assert(!JSON.stringify(result).includes('U0VDUkVU'))
})
