import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'grani-economy-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src')){
 if(!file.endsWith('.ts'))continue
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const {emptyEconomy,newEconomyRule,isCampaignEconomy,isEconomyRule,isPeriodInput,calculateEconomy,copyEconomy,economyReferencesValid,pruneEconomy}=await module('campaignEconomy')
const {emptyTrade,newMerchant}=await module('campaignTrade'),{emptyCampaign,emptyItem,copyCampaign,isCampaign}=await module('rpgSchema'),{createDefaultCharacter}=await module('characterModel'),{instantiateItem,advanceWorld}=await module('rpgEngine')
const line=(id,resource,resourceId,amount,target='actor',targetId='hero')=>({id,resource,resourceId,amount,target,targetId})
const template={...emptyItem(),id:'product',name:'Product',maximumDurability:10,artifactCharge:4,energyReserve:6,modelLength:1,modelWidth:.5,modelDepth:.5,massKg:.2}
const rule=()=>({...newEconomyRule('rule'),name:'Manual rule',secret:'SECRET-RECIPE',enabled:true,inputs:[line('in-money','money','coin',4),line('ore','item','ore',2)],outputs:[line('out-money','money','coin',9),line('out-item','item','product',3,'merchant','shop')]})
const world=()=>({characters:[{...createDefaultCharacter(),id:'hero',name:'Hero',rpg:{...createDefaultCharacter().rpg,inventory:[{...instantiateItem({...template,id:'ore-template',name:'Ore'},'ore'),quantity:10,durability:7}]}}],campaign:{...emptyCampaign(),items:[template],economy:{...emptyEconomy(),periodName:'Учёт мастера',rules:[rule()]},trade:{...emptyTrade(),currencies:[{id:'coin',name:'Монета',symbol:'м.'}],wallets:[{actorId:'hero',balances:[{currencyId:'coin',amount:100}]}],merchants:[{...newMerchant('shop'),name:'Shop'}]}}})
const input=(patch={})=>({fromPeriod:1,count:2,ruleIds:['rule'],reason:'Approved conditions',conditionsConfirmed:true,...patch})
test('Период: старые кампании, закрытые правила и явное подтверждение',()=>{
 assert(isCampaign(emptyCampaign()));assert(isCampaignEconomy(emptyEconomy()));assert(isCampaign(world().campaign));assert.equal(newEconomyRule('new').enabled,false)
 assert(!isEconomyRule({...rule(),incomeFormula:'automatic'}));assert(!isEconomyRule({...rule(),inputs:[{...rule().inputs[0],amount:.5}]}));assert(!isPeriodInput(input({conditionsConfirmed:false})));assert(!isPeriodInput({...input(),world:world()}))
 const e=world().campaign.economy;assert(!isCampaignEconomy({...e,version:2}));assert(!isCampaignEconomy({...e,rules:[rule(),rule()]}));assert(!isCampaignEconomy({...e,secret:'outside'}))
})
test('Период: общий расчёт средств, сырья и выпуска не меняет исходник, тело и часы',()=>{
 const w=world(),before=structuredClone(w),r=calculateEconomy(w,input(),'run',['product-copy'])
 assert.deepEqual(w,before);assert.equal(r.summary.money[0].spent,8);assert.equal(r.summary.money[0].earned,18);assert.equal(r.summary.money[0].after,110);assert.equal(r.summary.consumed[0].quantity,4);assert.equal(r.world.characters[0].rpg.inventory[0].quantity,6)
 const p=r.world.campaign.trade.merchants[0].stock[0];assert.equal(p.item.quantity,6);assert.equal(p.visible,false);assert.deepEqual(p.prices,[])
 for(const field of ['artifactCharge','maximumDurability','modelLength','modelWidth','modelDepth'])assert.equal(p.item[field],template[field],field)
 assert.equal(p.item.durability,10);assert.equal(r.world.characters[0].rpg.inventory[0].durability,7);assert.deepEqual(r.world.characters[0].body,w.characters[0].body);assert.deepEqual(r.world.characters[0].resources,w.characters[0].resources);assert.equal(r.world.campaign.seconds,w.campaign.seconds)
 assert.equal(r.world.campaign.economy.completedPeriods,2);assert.deepEqual(r.world.campaign.economy.lastRun,{id:'run',summary:r.summary})
})
test('Период: выбранные правила суммируют расход одной стопки и не используют будущее сырьё',()=>{
 const w=world();w.campaign.economy.rules.push({...rule(),id:'second',name:'Second',inputs:[line('in','item','ore',4)],outputs:[]});const before=structuredClone(w)
 assert.throws(()=>calculateEconomy(w,input({ruleIds:['rule','second']}),'run',['copy']),/Сырья недостаточно/);assert.deepEqual(w,before)
 const only=calculateEconomy(w,input({ruleIds:['second'],count:1}),'run',[]);assert.equal(only.world.characters[0].rpg.inventory[0].quantity,6);assert.equal(only.summary.produced.length,0)
 w.campaign.economy.rules[1].inputs[0].resourceId='future-copy';assert.throws(()=>calculateEconomy(w,input({ruleIds:['rule','second']}),'run',['future-copy']),/недоступен/)
})
test('Период: итоговый денежный баланс считается атомарно, отрицательные суммы и переполнение запрещены',()=>{
 const w=world();w.campaign.trade.wallets[0].balances[0].amount=0;const r=calculateEconomy(w,input(),'run',['copy']);assert.equal(r.summary.money[0].after,10)
 w.campaign.economy.rules[0].outputs[0].amount=1;assert.throws(()=>calculateEconomy(w,input(),'run',['copy']),/средства/)
 w.campaign.economy.rules[0].outputs[0].amount=9;w.campaign.trade.wallets[0].balances[0].amount=1e12;assert.throws(()=>calculateEconomy(w,input(),'run',['copy']),/предел/)
})
test('Период: повтор номера, отключённое правило, неизвестные записи и конфликт ID отклоняются',()=>{
 const w=world(),r=calculateEconomy(w,input(),'run',['copy']);assert.throws(()=>calculateEconomy(r.world,input(),'again',['copy-2']),/Период/)
 for(const patch of [{ruleIds:['missing']},{ruleIds:['rule','rule']},{count:0},{count:366},{count:1.5},{fromPeriod:2}])assert.throws(()=>calculateEconomy(w,input(patch),'run',['copy']))
 assert.throws(()=>calculateEconomy(w,input(),'run',['ore']));w.campaign.economy.rules[0].enabled=false;assert.throws(()=>calculateEconomy(w,input(),'run',['copy']))
 w.campaign.economy.rules[0].enabled=true;w.campaign.items=[];assert.throws(()=>calculateEconomy(w,input(),'run',['copy']),/Шаблон/)
})
test('Период: снаряжённое сырьё и заполненный склад блокируют весь учёт; полное потребление освобождает место',()=>{
 const w=world();w.characters[0].rpg.inventory[0].equipped=true;assert.throws(()=>calculateEconomy(w,input(),'run',['copy']),/снаряжён/)
 w.characters[0].rpg.inventory[0].equipped=false;w.campaign.trade.merchants[0].stock=Array.from({length:100},(_,i)=>({item:instantiateItem(template,'stock-'+i),visible:false,prices:[]}));const before=structuredClone(w);assert.throws(()=>calculateEconomy(w,input(),'run',['copy']),/заполнены/);assert.deepEqual(w,before)
 w.campaign.economy.rules[0].inputs=[line('consume','item','stock-0',1,'merchant','shop')];const r=calculateEconomy(w,input({count:1}),'run',['copy']);assert.equal(r.world.campaign.trade.merchants[0].stock.length,100);assert(!r.world.campaign.trade.merchants[0].stock.some(s=>s.item.id==='stock-0'))
})
test('Период: копия, ход часов и удаление героя сохраняют счётчик и историческое описание',()=>{
 const w=calculateEconomy(world(),input(),'run',['copy']).world,e=w.campaign.economy;assert.deepEqual(copyCampaign(w.campaign).economy,e);const c=copyEconomy(e);c.lastRun.summary.money[0].after=5;assert.equal(e.lastRun.summary.money[0].after,110)
 assert.deepEqual(advanceWorld(w,5,'clock').campaign.economy,e);assert(economyReferencesValid(e,['hero'],w.campaign.trade));assert(!economyReferencesValid(e,[],w.campaign.trade));const p=pruneEconomy(e,[]);assert.equal(p.rules.length,0);assert.equal(p.completedPeriods,2);assert.deepEqual(p.lastRun,e.lastRun)
 assert(!isCampaignEconomy({...e,lastRun:{...e.lastRun,summary:{...e.lastRun.summary,toPeriod:3}}}))
})
test('Период: производство герою работает без валют и торговцев, лишний выпуск не создаётся',()=>{
 const w=world();delete w.campaign.trade;w.campaign.economy.rules[0].inputs=[];w.campaign.economy.rules[0].outputs=[line('product','item','product',1)]
 const r=calculateEconomy(w,input(),'run',['copy']);assert.equal(r.world.characters[0].rpg.inventory[1].quantity,2);assert.deepEqual(r.world.campaign.trade,emptyTrade());assert.throws(()=>calculateEconomy(w,input(),'run',['copy','extra']))
})
