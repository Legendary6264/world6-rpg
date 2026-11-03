import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'grani-3d-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src')){
 if(!file.endsWith('.ts'))continue
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a.replace(/\.ts$/,'')+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const {create3DSandbox}=await module('sandboxCampaign'),{isCampaign,copyCampaign}=await module('rpgSchema'),{isCharacterDraft}=await module('characterModel')
const {isSceneState}=await module('scenes'),{masterRenderModel,perceivedRenderModel,snapScenePoint,entityAreas}=await module('scene3dModel')
const {prepareGameScene}=await module('gameScene'),{perceivedMap}=await module('scenePerception'),{isStarterDraft}=await module('starterCampaignDraft')

test('3D-облики: совместимость старых сцен, копирование кампании и приватная проекция игрока',async()=>{
 const {world}=create3DSandbox('costume'),scene=world.campaign.scenes.scenes[0],token=scene.tokens[0]
 assert(isSceneState(world.campaign.scenes),'Old version-1 saves remain valid without appearance fields')
 token.characterModel='ranger';token.facing=135;token.characterAnimation='walk'
 assert(isSceneState(world.campaign.scenes));assert.deepEqual(copyCampaign(world.campaign),world.campaign)
 const own=perceivedMap({actorId:token.actorId,activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Область',description:'',frame:scene,areas:[{id:'known',x:0,y:0,z:-2,width:30,depth:20,height:20,visible:true}],objects:[],contacts:[]}]},world.campaign.scenes,world.characters)
 assert.equal(own.contacts.find(c=>c.kind==='self').characterModel,'ranger')
 assert.equal(own.contacts.find(c=>c.kind==='self').characterAnimation,'walk')
 assert.equal(copyCampaign(world.campaign).scenes.scenes[0].tokens[0].characterAnimation,'walk')
 const contact={id:'public-contact',actorId:token.actorId,kind:'silhouette',label:'Силуэт',signs:'',point:token,radius:0,showHeight:true}
 const knowledge={actorId:'other-player',activeSceneId:scene.id,scenes:[{sceneId:scene.id,title:'Область',description:'',frame:scene,areas:[{id:'known',x:0,y:0,z:-2,width:30,depth:20,height:20,visible:true}],objects:[],contacts:[contact]}]}
 const silhouette=perceivedMap(knowledge,world.campaign.scenes,world.characters).contacts[0]
 assert.equal(silhouette.characterModel,undefined);assert.equal(silhouette.facing,undefined);assert.equal(silhouette.characterAnimation,undefined)
 contact.kind='identified'
 const identified=perceivedMap(knowledge,world.campaign.scenes,world.characters).contacts[0]
 assert.equal(identified.characterModel,'ranger');assert.equal(identified.facing,135);assert.equal(identified.characterAnimation,'walk')
 assert(!JSON.stringify(identified).includes(token.actorId),'Appearance does not expose the internal actor identifier')
 contact.showHeight=false
 assert.equal(perceivedMap(knowledge,world.campaign.scenes,world.characters).contacts[0].characterModel,undefined)
 token.characterModel='untrusted-model';assert(!isSceneState(world.campaign.scenes));token.characterModel='ranger'
 token.facing=Infinity;assert(!isSceneState(world.campaign.scenes));token.facing=135
 token.characterAnimation='untrusted-motion';assert(!isSceneState(world.campaign.scenes));token.characterAnimation='walk'
 const {createCharacterStudio,characterStudioActors}=await module('characterStudio'),{sceneReferencesValid}=await module('scenes')
 const studio=createCharacterStudio(),state={version:1,activeSceneId:studio.id,scenes:[studio]}
 assert(isSceneState(state));assert(sceneReferencesValid(state,characterStudioActors.map(a=>a.id)))
 assert.equal(new Set(studio.tokens.map(t=>t.characterModel)).size,4)
})

test('Полигон: отдельные валидные миры, три области, опора Z=3 и сохранение прежнего формата',()=>{
 const a=create3DSandbox('copy-a'),b=create3DSandbox('copy-b'),before=structuredClone(b)
 assert(isCampaign(a.world.campaign));assert(a.world.characters.every(isCharacterDraft));assert(isSceneState(a.world.campaign.scenes))
 assert.deepEqual(a.world.campaign.scenes.scenes.map(s=>s.name),['Полигон · поселение','Полигон · лес и дорога','Полигон · подземное сооружение'])
 assert.equal(a.world.campaign.seconds,0);assert.equal(a.world.campaign.scenes.scenes[2].tokens[0].z,3)
 assert.equal(a.world.campaign.scenes.scenes[2].tokens[0].support.kind,'object')
 assert.deepEqual(copyCampaign(a.world.campaign),a.world.campaign)
 a.world.campaign.scenes.scenes[0].objects[0].name='Правка';a.world.characters[0].resources.mana.current='0';assert.deepEqual(b,before)
 assert.throws(()=>create3DSandbox('../invalid'));assert(!a.npcIds.some(id=>b.npcIds.includes(id)))
})
test('3D: адаптер мастера сохраняет координаты, опоры, открытую дверь и не меняет исходник',()=>{
 const {world}=create3DSandbox('render'),before=structuredClone(world),s=world.campaign.scenes.scenes[2]
 const model=masterRenderModel(s,world.characters)
 assert.equal(model.restricted,false);assert.equal(model.entities.find(e=>e.interaction.kind==='token').transform.position.z,3)
 assert.deepEqual(world,before)
 const door=s.objects.find(o=>o.kind==='door');door.open=true
 assert.equal(masterRenderModel(s,world.characters).entities.find(e=>e.id===door.id).geometry.open,true)
})
test('3D: игрок использует только раскрытую проекцию, секретные NPC и объекты не попадают в компоненты',()=>{
 const {world}=create3DSandbox('privacy'),hero=structuredClone(world.characters[0]);hero.id='privacy-hero';hero.name='Мой герой';world.characters.push(hero)
 const s=world.campaign.scenes.scenes[0],door=s.objects.find(o=>o.kind==='door')
 const prepared=prepareGameScene(world,{sceneId:s.id,actorIds:[hero.id],objectIds:[door.id],contactIds:[],title:'Область игрока',description:'Открытое описание',anchor:{x:3,y:3,z:0},revealTerrain:true})
 const map=perceivedMap(prepared.campaign.perceptions.heroes[0],prepared.campaign.scenes,prepared.characters)
 const model=perceivedRenderModel(map),json=JSON.stringify(model)
 assert(model.restricted);assert.deepEqual(model.entities.filter(e=>e.interaction.kind==='object').map(e=>e.id),[door.id])
 for(const hidden of ['privacy:guide','privacy:keeper','privacy:watcher','Заметка мастера','privacy:gate-rock'])assert(!json.includes(hidden),hidden)
 assert(model.entities.some(e=>e.identity.label===hero.name))
 map.contacts.push({id:'unknown-height',kind:'silhouette',label:'Силуэт',signs:'',x:2,y:2})
 const silhouette=perceivedRenderModel(map).entities.find(e=>e.id==='unknown-height')
 assert(!silhouette.appearance.heightKnown);assert.equal(silhouette.geometry.height,.12);assert.match(silhouette.identity.label,/высота не раскрыта/)
})
test('3D: области обрезки не расширяются до всей сцены; пустое раскрытие не создаёт землю',()=>{
 const map={frame:{id:'s',view:'top',width:30,depth:20,groundZ:0,minZ:-2,maxZ:10,palette:'stone'},title:'Карта',description:'',areas:[],objects:[],contacts:[]}
 assert.deepEqual(perceivedRenderModel(map).areas,[])
 map.areas=[{id:'known',x:1,y:1,z:-1,width:2,depth:2,height:5,visible:false}]
 map.objects=[{id:'o',name:'Старый объект',kind:'crate',x:2,y:2,z:0,width:2,depth:2,height:2,open:false,visible:false}]
 const model=perceivedRenderModel(map),e=model.entities[0]
 assert(e.appearance.remembered);assert.equal(entityAreas(e,model).length,1)
 e.transform.position.x=20;assert.deepEqual(entityAreas(e,model),[])
})
test('Сетка: свободные координаты, включаемая дробная привязка, края и высота',()=>{
 const p={x:2.137,y:4.818,z:3.125},before={...p},f={width:30,depth:20}
 assert.deepEqual(snapScenePoint(p,false,1,f),p);assert.deepEqual(snapScenePoint(p,true,.25,f),{x:2.25,y:4.75,z:3.125})
 assert.deepEqual(snapScenePoint({x:30.1,y:-1,z:9},true,2,f),{x:30,y:0,z:9});assert.deepEqual(p,before)
 assert.deepEqual(snapScenePoint(p,true,NaN,f),p)
})
test('Сохранённая команда создания принимает полигон и прежний пример, неизвестный шаблон отклоняется',()=>{
 const draft=id=>({title:'Копия',slots:'4',accepted:true,command:{path:'/lobbies/from-example',body:JSON.stringify({exampleId:id,version:1,title:'Копия',slots:4,commandKey:'starter:abcdefgh'})}})
 assert(isStarterDraft(draft('world6-3d-sandbox')));assert(isStarterDraft(draft('night-crossing')));assert(!isStarterDraft(draft('unknown')))
})
