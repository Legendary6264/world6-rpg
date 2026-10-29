import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'grani-entities-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src')){
 if(!file.endsWith('.ts'))continue
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a.replace(/\.ts$/,'')+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const {projectWorldEntities,restoreWorldEntities,diffEntitySnapshots,entityId}=await module('worldEntities')
const {create3DSandbox}=await module('sandboxCampaign'),{emptyCampaign}=await module('rpgSchema')
const {sceneObject}=await module('scenes'),{placeSceneToken}=await module('scenes')
const world=()=>create3DSandbox('entity-world').world

test('Компоненты: точное восстановление мира, стабильные ID и отсутствие разделяемых изменяемых данных',()=>{
 const w=world(),before=structuredClone(w),snapshot=projectWorldEntities(w,17),restored=restoreWorldEntities(snapshot)
 assert.deepEqual(restored,w);assert.deepEqual(w,before);assert.equal(snapshot.revision,17)
 assert.deepEqual(projectWorldEntities(w,17),snapshot)
 snapshot.entities.find(e=>e.kind==='actor').components.resources.data.mana.current='0';assert.deepEqual(w,before)
 restored.characters[0].name='Другое имя';assert.deepEqual(w,before)
 assert(snapshot.entities.every(e=>Object.values(e.components).every(c=>c.version===1)))
})
test('Компоненты: нет сцен, нет размещения и пустой мир поддерживаются без выдуманных позиций',()=>{
 const w={characters:[],campaign:emptyCampaign()},snapshot=projectWorldEntities(w,0)
 assert.equal(snapshot.sceneState,null);assert.deepEqual(snapshot.entities,[]);assert.deepEqual(restoreWorldEntities(snapshot),w)
 const full=world();delete full.campaign.scenes
 assert(projectWorldEntities(full,0).entities.every(e=>!e.components.position));assert.deepEqual(restoreWorldEntities(projectWorldEntities(full,0)),full)
})
test('Компоненты: локальные ID объектов могут повторяться в разных сценах, составные ключи не сталкиваются',()=>{
 const w=world(),[a,b]=w.campaign.scenes.scenes
 a.objects.push(sceneObject('crate','shared',{x:2,y:2,z:0}));b.objects.push(sceneObject('rock','shared',{x:2,y:2,z:0}))
 const s=projectWorldEntities(w,0)
 assert.notEqual(entityId('object','shared',a.id),entityId('object','shared',b.id));assert.deepEqual(restoreWorldEntities(s),w)
 assert.notEqual(entityId('object','c:d','a:b'),entityId('object','b:c:d','a'))
})
test('Компоненты: перенос, опора и дробная высота восстанавливаются независимо от порядка массива сущностей',()=>{
 const w=world(),a=w.characters[0],scene=w.campaign.scenes.scenes[1]
 w.campaign.scenes=placeSceneToken(w.campaign.scenes,scene.id,{actorId:a.id,x:4.125,y:8.375,z:3.125,diameter:.8,support:{kind:'air'}})
 const s=projectWorldEntities(w,2);s.entities.reverse();const restored=restoreWorldEntities(s)
 assert.deepEqual(restored,w)
 const token=restored.campaign.scenes.scenes[1].tokens.find(t=>t.actorId===a.id);assert.equal(token.z,3.125);assert.equal(token.support.kind,'air')
})
test('Компоненты: неизвестные версии и поля, дубликаты и потерянные ссылки отклоняются',()=>{
 const good=projectWorldEntities(world(),3)
 const changes=[s=>s.version=2,s=>s.campaign.version=2,s=>s.sceneState.version=2,s=>s.revision=-1,
  s=>s.entities[0].components.resources.version=2,s=>s.entities[0].components.unknown={version:1,data:{}},
  s=>s.entities.push(structuredClone(s.entities[0])),s=>s.actorOrder.push('missing'),s=>s.entities=s.entities.filter(e=>e.kind!=='object'),
  s=>s.entities.find(e=>e.kind==='actor'&&e.components.position).components.position.data.token.actorId='different',
  s=>s.entities.find(e=>e.kind==='object').components.position.data.sceneId='different',s=>s.campaign.data.scenes={version:1,scenes:[]},
  s=>s.campaign.extra='future',s=>s.entities[0].extra='future',s=>s.entities[0].components.resources.extra='future']
 for(const change of changes){const s=structuredClone(good);change(s);assert.throws(()=>restoreWorldEntities(s))}
 assert.deepEqual(projectWorldEntities(world(),3),good)
})
test('Компоненты: дельта выделяет только изменённые компоненты, создание и удаление',()=>{
 const a=world(),before=projectWorldEntities(a,7),after=structuredClone(a)
 after.characters[0].resources.mana.current='9';after.campaign.scenes.scenes[0].objects[0].open=true
 after.campaign.scenes.scenes[1].objects.pop();after.campaign.scenes.scenes[0].objects.push(sceneObject('crate','new',{x:2,y:2,z:0}))
 const delta=diffEntitySnapshots(before,projectWorldEntities(after,8)),actor=delta.changes.find(e=>e.kind==='actor')
 assert.deepEqual(actor.components,['resources']);assert.equal(delta.fromRevision,7);assert.equal(delta.revision,8)
 assert(delta.changes.some(e=>e.operation==='created'));assert(delta.changes.some(e=>e.operation==='removed'))
 assert.deepEqual(delta.changes.find(e=>e.kind==='object'&&e.operation==='changed').components,['collision'])
 assert.deepEqual(diffEntitySnapshots(before,before).changes,[])
  const reordered=structuredClone(before),r=reordered.entities.find(e=>e.kind==='actor').components.resources.data.mana
  reordered.entities.find(e=>e.kind==='actor').components.resources.data.mana={maximum:r.maximum,current:r.current}
  assert.deepEqual(diffEntitySnapshots(before,reordered).changes,[])
})
test('Компоненты: дополнительные поля прежнего формата сохраняются в extensions без подмены типизированных данных',()=>{
 const w=world();w.characters[0].legacyNote={text:'Заметка прежнего формата'};w.campaign.scenes.scenes[0].objects[0].legacyMaterial={strength:7}
 const s=projectWorldEntities(w,0);assert.deepEqual(restoreWorldEntities(s),w)
 const e=s.entities.find(e=>e.kind==='object'&&e.components.extensions);e.components.extensions.data.x=999
 assert.throws(()=>restoreWorldEntities(s),/подменяют/)
})
