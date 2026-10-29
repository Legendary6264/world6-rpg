import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'grani-atlas-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src')){
 if(!file.endsWith('.ts'))continue
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a.replace(/\.ts$/,'')+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const {emptyAtlas,newAtlasEntry,isAtlasEntry,isCampaignAtlas,publicAtlas,copyAtlas,pruneAtlas,atlasReferencesValid}=await module('campaignAtlas')
const {emptyCampaign,isCampaign,copyCampaign}=await module('rpgSchema'),{createDefaultCharacter}=await module('characterModel'),{advanceWorld}=await module('rpgEngine')
const {createScene,emptyScenes}=await module('scenes')
const city=(id='city')=>({...newAtlasEntry('city',id),name:id,sceneIds:['scene'],npcLinks:[{actorId:'PRIVATE-NPC-ID',role:'староста',publicName:'Хозяин ратуши',visible:false}]})
const organization=(id='organization')=>({...newAtlasEntry('organization',id),name:id,cityIds:['city']})
test('Справочник: скрытые значения по умолчанию, закрытый формат и старые кампании',()=>{
 assert.equal(newAtlasEntry('city','new').visible,false);assert.equal(newAtlasEntry('organization','new-org').archived,false)
 const a={...emptyAtlas(),cities:[city()],organizations:[organization()]};assert(isCampaignAtlas(a));assert(isCampaign(emptyCampaign()));assert(isCampaign({...emptyCampaign(),atlas:a}))
 for(const bad of [{...city(),arbitrary:'secret'},{...city(),visible:'yes'},{...city(),secret:'bad\u0000'},{...city(),id:'with spaces'}])assert.equal(isAtlasEntry(bad,'city'),false)
 assert.equal(isCampaignAtlas({...a,version:2}),false)
})
test('Справочник: публичная выдача не раскрывает скрытые записи, NPC, сцены и тайные заметки',()=>{
 const c={...city(),visible:true,secret:'PRIVATE-CITY-NOTE'},hidden={...city('HIDDEN-CITY-ID'),secret:'HIDDEN-CITY'},o={...organization(),visible:true,cityIds:['city','HIDDEN-CITY-ID'],secret:'PRIVATE-ORG-NOTE'}
 c.npcLinks[0].visible=true
 const a={...emptyAtlas(),cities:[c,hidden],organizations:[o,{...organization('HIDDEN-ORG-ID'),name:'SECRET-ORG'}]},result=publicAtlas(a),json=JSON.stringify(result)
 assert.equal(result.cities.length,1);assert.equal(result.organizations.length,1);assert.deepEqual(result.organizations[0].cities,[{id:'city',name:'city'}]);assert.deepEqual(result.cities[0].npcLinks,[{publicName:'Хозяин ратуши',role:'староста'}])
 for(const secret of ['PRIVATE-NPC-ID','PRIVATE-CITY-NOTE','PRIVATE-ORG-NOTE','HIDDEN-CITY','HIDDEN-ORG-ID','SECRET-ORG','sceneIds','actorId','secret'])assert(!json.includes(secret),secret)
 assert.deepEqual(publicAtlas(undefined),{cities:[],organizations:[]})
})
test('Справочник: архив скрывает запись и её названия в связях, сохраняя исходные данные',()=>{
 const a={...emptyAtlas(),cities:[{...city(),visible:true,archived:true}],organizations:[{...organization(),visible:true}]},before=structuredClone(a),r=publicAtlas(a)
 assert.equal(r.cities.length,0);assert.deepEqual(r.organizations[0].cities,[]);assert.deepEqual(a,before)
 const bad=city();bad.npcLinks[0].visible=true;bad.npcLinks[0].publicName='';assert.equal(isAtlasEntry(bad,'city'),false)
})
test('Справочник: копирование и ход часов сохраняют все поля и не изменяют исходник',()=>{
 const a={...emptyAtlas(),cities:[city()],organizations:[organization()]},campaign={...emptyCampaign(),atlas:a,scenes:createScene(emptyScenes(),'scene','Scene','top')},copy=copyCampaign(campaign)
 assert.deepEqual(copy.atlas,a);copy.atlas.cities[0].npcLinks[0].role='changed';assert.equal(a.cities[0].npcLinks[0].role,'староста')
 const w={characters:[{...createDefaultCharacter(),id:'PRIVATE-NPC-ID',name:'NPC'}],campaign},before=structuredClone(w),result=advanceWorld(w,5,'atlas-clock')
 assert.deepEqual(result.campaign.atlas,a);assert.deepEqual(w,before);assert.equal(result.campaign.seconds,5)
})
test('Справочник: неизвестные ссылки, повторы и общий предел UTF-8 отклоняются',()=>{
 const a={...emptyAtlas(),cities:[city()],organizations:[organization()]}
 assert(atlasReferencesValid(a,['PRIVATE-NPC-ID'],['scene']));assert(!atlasReferencesValid(a,[],['scene']));assert(!atlasReferencesValid(a,['PRIVATE-NPC-ID'],[]))
 assert.equal(isCampaignAtlas({...a,organizations:[{...organization(),cityIds:['missing']}]}),false);assert.equal(isCampaignAtlas({...a,organizations:[organization('city')]}),false)
 const dup=city();dup.npcLinks.push({...dup.npcLinks[0]});assert.equal(isAtlasEntry(dup,'city'),false)
 const huge={...emptyAtlas(),cities:Array.from({length:100},(_,i)=>({...city('c'+i),secret:'я'.repeat(12000)}))};assert.equal(isCampaignAtlas(huge),false)
})
test('Справочник: удаление сцены или NPC очищает только связи, оставляя записи и заметки',()=>{
 const a={...emptyAtlas(),cities:[{...city(),secret:'KEEP'}],organizations:[organization()]},before=copyAtlas(a),r=pruneAtlas(a,[],[])
 assert.deepEqual(a,before);assert.deepEqual(r.cities[0].sceneIds,[]);assert.deepEqual(r.cities[0].npcLinks,[]);assert.equal(r.cities[0].secret,'KEEP');assert.deepEqual(r.organizations[0].cityIds,['city']);assert(isCampaignAtlas(r))
})
