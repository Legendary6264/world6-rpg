import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'grani-trade-'))
test.after(()=>rm(directory,{recursive:true,force:true}))
for(const file of await readdir('src')){
 if(!file.endsWith('.ts'))continue
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a.replace(/\.ts$/,'')+'.mjs'+b)
 await writeFile(join(directory,file.replace(/\.ts$/,'.mjs')),js)
}
const module=name=>import(pathToFileURL(join(directory,name+'.mjs')))
const {emptyTrade,newMerchant,isCampaignTrade,isCurrency,isMerchant,copyTrade,publicTrade,tradeReferencesValid,pruneTrade,calculateTrade}=await module('campaignTrade')
const {emptyCampaign,emptyItem,emptyConsumableEffect,isCampaign,copyCampaign}=await module('rpgSchema'),{createDefaultCharacter}=await module('characterModel'),{instantiateItem,advanceWorld}=await module('rpgEngine')
const currency={id:'coin',name:'Учебная монета',symbol:'м.'}
const item=()=>({...instantiateItem({...emptyItem(),id:'template',name:'Заряженный флакон',massKg:.3,modelLength:1,modelWidth:.5,modelDepth:.5,maximumDurability:10,artifactCharge:5,energyReserve:8,category:'consumable',consumable:emptyConsumableEffect()},'stock-item'),quantity:4,durability:7})
const world=()=>({characters:[{...createDefaultCharacter(),id:'hero',name:'Hero'}],campaign:{...emptyCampaign(),trade:{...emptyTrade(),currencies:[currency],wallets:[{actorId:'hero',balances:[{currencyId:'coin',amount:100}]}],merchants:[{...newMerchant('shop'),name:'Shop',secret:'SECRET-MERCHANT',balances:[{currencyId:'coin',amount:100}],stock:[{item:item(),visible:false,prices:[{currencyId:'coin',unitPrice:7}]}]}]}}})
const input=(patch={})=>({direction:'buy',actorId:'hero',merchantId:'shop',itemId:'stock-item',quantity:2,currencyId:'coin',unitPrice:7,...patch})
test('Торговля: старые кампании, закрытый формат и целые средства',()=>{
 assert(isCampaign(emptyCampaign()));assert(isCampaign(world().campaign));assert(isCampaignTrade(world().campaign.trade));assert.equal(newMerchant('new').visible,false)
 for(const value of [{...currency,symbol:''},{...currency,name:' '},{...currency,rate:1}])assert(!isCurrency(value))
 for(const value of [{...world().campaign.trade,version:2},{...world().campaign.trade,wallets:[{actorId:'hero',balances:[{currencyId:'coin',amount:.1}]}]},{...world().campaign.trade,currencies:[currency,currency]}])assert(!isCampaignTrade(value))
 assert(!isMerchant({...world().campaign.trade.merchants[0],controllerId:'bypass'}));assert(!isCampaignTrade({...world().campaign.trade,wallets:[{actorId:'hero',balances:[{currencyId:'missing',amount:0}]}]}))
})
test('Торговля: покупка переносит конкретные свойства, сохраняет обе суммы и исходник',()=>{
 const w=world(),before=structuredClone(w),r=calculateTrade(w,input(),'received-item'),a=r.world.characters[0],m=r.world.campaign.trade.merchants[0]
 assert.deepEqual(w,before);assert.equal(m.stock[0].item.quantity,2);assert.equal(a.rpg.inventory[0].quantity,2);assert.equal(a.rpg.inventory[0].id,'received-item')
 for(const field of ['durability','artifactCharge','energyReserve','consumable','templateId','massKg','modelLength','modelWidth','modelDepth'])assert.deepEqual(a.rpg.inventory[0][field],item()[field],field)
 assert.equal(a.rpg.inventory[0].equipped,false);assert.equal(r.summary.total,14);assert.equal(r.summary.actorMoneyAfter,86);assert.equal(r.summary.merchantMoneyAfter,114)
 assert.deepEqual(a.body,w.characters[0].body);assert.deepEqual(a.resources,w.characters[0].resources);assert.equal(r.world.campaign.seconds,0)
})
test('Торговля: продажа отделяет часть стопки без слияния и автоматического раскрытия',()=>{
 const bought=calculateTrade(world(),input(),'bought').world,r=calculateTrade(bought,input({direction:'sell',itemId:'bought',quantity:1,unitPrice:3}),'sold'),m=r.world.campaign.trade.merchants[0],a=r.world.characters[0]
 assert.equal(a.rpg.inventory[0].quantity,1);assert.equal(m.stock.length,2);assert.equal(m.stock[1].item.quantity,1);assert.equal(m.stock[1].item.durability,7);assert.equal(m.stock[1].visible,false);assert.deepEqual(m.stock[1].prices,[])
 assert.equal(r.summary.actorMoneyAfter,89);assert.equal(r.summary.merchantMoneyAfter,111);assert.equal(r.summary.actorMoneyAfter+r.summary.merchantMoneyAfter,200)
 const all=calculateTrade(r.world,input({direction:'sell',itemId:'bought',quantity:1,unitPrice:0}),'sold-last').world;assert.equal(all.characters[0].rpg.inventory.length,0)
})
test('Торговля: подмена цены, нехватка средств, дроби, переполнение и занятый ID запрещены',()=>{
 const w=world()
 for(const patch of [{unitPrice:8},{quantity:5},{quantity:.5},{unitPrice:-1},{merchantId:'unknown'},{actorId:'foreign'},{currencyId:'foreign'},{quantity:0}])assert.throws(()=>calculateTrade(w,input(patch),'new'),undefined,JSON.stringify(patch))
 assert.throws(()=>calculateTrade(w,input(),'stock-item'));const poor=world();poor.campaign.trade.wallets[0].balances[0].amount=1;assert.throws(()=>calculateTrade(poor,input(),'new'),/средств/)
 const rich=world();rich.campaign.trade.merchants[0].balances[0].amount=1e12;assert.throws(()=>calculateTrade(rich,input(),'new'),/предел/)
 const sold=calculateTrade(w,input(),'buy').world;sold.campaign.trade.merchants[0].balances[0].amount=0;assert.throws(()=>calculateTrade(sold,input({direction:'sell',itemId:'buy',unitPrice:1}),'sell'),/средств/)
})
test('Торговля: снаряжённая вещь, архив и заполненный инвентарь не передаются',()=>{
 const w=world();w.campaign.trade.merchants[0].archived=true;assert.throws(()=>calculateTrade(w,input(),'new'))
 const b=calculateTrade(world(),input(),'bought').world;b.characters[0].rpg.inventory[0].equipped=true;assert.throws(()=>calculateTrade(b,input({direction:'sell',itemId:'bought'}),'sold'),/снаряжён/)
 const full=world();full.characters[0].rpg.inventory=Array.from({length:200},(_,i)=>({...item(),id:'full-'+i}));assert.throws(()=>calculateTrade(full,input(),'new'),/места/)
})
test('Торговля: публичная выдача не раскрывает кошельки, связи NPC и скрытые товары',()=>{
 const w=world(),m=w.campaign.trade.merchants[0];m.visible=true;m.npcId='SECRET-NPC';m.cityId='SECRET-CITY';m.organizationId='SECRET-ORG';m.stock.push({item:{...item(),id:'HIDDEN-STOCK',name:'HIDDEN-NAME'},visible:false,prices:[]});m.stock[0].visible=true
 const r=publicTrade(w.campaign.trade,{version:1,cities:[],organizations:[]}),json=JSON.stringify(r)
 for(const secret of ['SECRET','HIDDEN','wallets','balances','artifactCharge','templateId','npcId','secret'])assert(!json.includes(secret),secret)
 assert.equal(r.merchants[0].stock.length,1);assert.equal(r.merchants[0].stock[0].prices[0].unitPrice,7);m.archived=true;assert.equal(publicTrade(w.campaign.trade,undefined).merchants.length,0)
})
test('Торговля: копии и ход часов сохраняют имущество; удаление героя убирает только его кошелёк и связь',()=>{
 const w=world(),t=w.campaign.trade;assert(tradeReferencesValid(t,['hero'],undefined));assert(!tradeReferencesValid(t,[],undefined))
 assert.deepEqual(copyCampaign(w.campaign).trade,t);const c=copyTrade(t);c.merchants[0].stock[0].item.consumable.restore.mana=10;assert.equal(t.merchants[0].stock[0].item.consumable.restore.mana,0)
 assert.deepEqual(advanceWorld(w,3,'clock').campaign.trade,t);t.merchants[0].npcId='hero';const p=pruneTrade(t,[]);assert.equal(p.wallets.length,0);assert.equal(p.merchants[0].npcId,null);assert.equal(p.merchants[0].stock.length,1);assert.equal(p.merchants[0].secret,'SECRET-MERCHANT')
})
