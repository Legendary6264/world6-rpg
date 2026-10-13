import {copyItem,isInventoryItem} from './rpgSchema'
import type {InventoryItem} from './rpgTypes'
import type {World} from './rpgEngine'
import type {CampaignAtlas} from './campaignAtlas'
export type Currency={id:string;name:string;symbol:string}
export type Balance={currencyId:string;amount:number}
export type Stock={item:InventoryItem;visible:boolean;prices:{currencyId:string;unitPrice:number}[]}
export type Merchant={id:string;name:string;description:string;secret:string;visible:boolean;archived:boolean;npcId:string|null;cityId:string|null;organizationId:string|null;balances:Balance[];stock:Stock[]}
export type CampaignTrade={version:1;currencies:Currency[];wallets:{actorId:string;balances:Balance[]}[];merchants:Merchant[]}
export type TradeInput={direction:'buy'|'sell';actorId:string;merchantId:string;itemId:string;quantity:number;currencyId:string;unitPrice:number}
export type TradeSummary={direction:TradeInput['direction'];actorId:string;actorName:string;merchantId:string;merchantName:string;itemName:string;quantity:number;sourceQuantityBefore:number;sourceQuantityAfter:number;destinationItemId:string;currency:Currency;unitPrice:number;total:number;actorMoneyBefore:number;actorMoneyAfter:number;merchantMoneyBefore:number;merchantMoneyAfter:number;massKg:number;durability:number;maximumDurability:number;artifactCharge:number|null}
export const MAX_MONEY=1e12,MAX_TRADE_BYTES=2*1024*1024
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const fields=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>k in v)
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(v)
const text=(v:unknown,max:number):v is string=>{if(typeof v!=='string'||v.length>max)return false;for(let i=0;i<v.length;i++){const n=v.charCodeAt(i);if(n<32&&![9,10,13].includes(n))return false}return true}
const amount=(v:unknown,max=MAX_MONEY):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max
const unique=(v:string[])=>new Set(v).size===v.length
export function isCurrency(v:unknown):v is Currency{return object(v)&&fields(v,['id','name','symbol'])&&id(v.id)&&text(v.name,120)&&!!v.name.trim()&&text(v.symbol,16)&&!!v.symbol.trim()}
export function isBalances(v:unknown):v is Balance[]{return Array.isArray(v)&&v.length<=20&&v.every(b=>object(b)&&fields(b,['currencyId','amount'])&&id(b.currencyId)&&amount(b.amount))&&unique(v.map(b=>b.currencyId))}
export function isStock(v:unknown):v is Stock{return object(v)&&fields(v,['item','visible','prices'])&&isInventoryItem(v.item)&&!v.item.equipped&&typeof v.visible==='boolean'&&Array.isArray(v.prices)&&v.prices.length<=20&&v.prices.every(p=>object(p)&&fields(p,['currencyId','unitPrice'])&&id(p.currencyId)&&amount(p.unitPrice,1e9))&&unique(v.prices.map(p=>p.currencyId))}
export function isMerchant(v:unknown):v is Merchant{return object(v)&&fields(v,['id','name','description','secret','visible','archived','npcId','cityId','organizationId','balances','stock'])&&id(v.id)&&text(v.name,120)&&!!v.name.trim()&&text(v.description,4000)&&text(v.secret,8000)&&typeof v.visible==='boolean'&&typeof v.archived==='boolean'&&['npcId','cityId','organizationId'].every(k=>v[k]===null||id(v[k]))&&isBalances(v.balances)&&Array.isArray(v.stock)&&v.stock.length<=100&&v.stock.every(isStock)&&unique(v.stock.map(s=>s.item.id))}
export function isCampaignTrade(v:unknown):v is CampaignTrade{
 if(!object(v)||!fields(v,['version','currencies','wallets','merchants'])||v.version!==1||!Array.isArray(v.currencies)||v.currencies.length>20||!v.currencies.every(isCurrency)||!unique(v.currencies.map(c=>c.id))||!Array.isArray(v.wallets)||v.wallets.length>200||!v.wallets.every(w=>object(w)&&fields(w,['actorId','balances'])&&id(w.actorId)&&isBalances(w.balances))||!unique(v.wallets.map(w=>w.actorId))||!Array.isArray(v.merchants)||v.merchants.length>50||!v.merchants.every(isMerchant)||!unique(v.merchants.map(m=>m.id)))return false
 const currencies=(v.currencies as Currency[]).map(c=>c.id),merchants=v.merchants as Merchant[]
 return (v.wallets as CampaignTrade['wallets']).every(w=>w.balances.every(b=>currencies.includes(b.currencyId)))&&merchants.every(m=>m.balances.every(b=>currencies.includes(b.currencyId))&&m.stock.every(s=>s.prices.every(p=>currencies.includes(p.currencyId))))&&new TextEncoder().encode(JSON.stringify(v)).length<=MAX_TRADE_BYTES
}
export const emptyTrade=():CampaignTrade=>({version:1,currencies:[],wallets:[],merchants:[]})
export const newMerchant=(id:string):Merchant=>({id,name:'',description:'',secret:'',visible:false,archived:false,npcId:null,cityId:null,organizationId:null,balances:[],stock:[]})
export const copyInventoryItem=(i:InventoryItem):InventoryItem=>({...copyItem(i),id:i.id,templateId:i.templateId,quantity:i.quantity,durability:i.durability,equipped:i.equipped})
export function copyTrade(t:CampaignTrade):CampaignTrade{return {version:1,currencies:t.currencies.map(c=>({id:c.id,name:c.name,symbol:c.symbol})),wallets:t.wallets.map(w=>({actorId:w.actorId,balances:w.balances.map(b=>({...b}))})),merchants:t.merchants.map(m=>({id:m.id,name:m.name,description:m.description,secret:m.secret,visible:m.visible,archived:m.archived,npcId:m.npcId,cityId:m.cityId,organizationId:m.organizationId,balances:m.balances.map(b=>({...b})),stock:m.stock.map(s=>({item:copyInventoryItem(s.item),visible:s.visible,prices:s.prices.map(p=>({...p}))}))}))}}
export function tradeReferencesValid(t:CampaignTrade|undefined,actorIds:string[],atlas:CampaignAtlas|undefined):boolean{return t===undefined||isCampaignTrade(t)&&t.wallets.every(w=>actorIds.includes(w.actorId))&&t.merchants.every(m=>(m.npcId===null||actorIds.includes(m.npcId))&&(m.cityId===null||!!atlas?.cities.some(c=>c.id===m.cityId))&&(m.organizationId===null||!!atlas?.organizations.some(o=>o.id===m.organizationId)))}
export function pruneTrade(t:CampaignTrade,actorIds:string[]):CampaignTrade{const next=copyTrade(t);next.wallets=next.wallets.filter(w=>actorIds.includes(w.actorId));for(const m of next.merchants)if(m.npcId&&!actorIds.includes(m.npcId))m.npcId=null;return next}
export function publicTrade(t:CampaignTrade|undefined,atlas:CampaignAtlas|undefined){return {currencies:(t?.currencies??[]).map(c=>({...c})),merchants:(t?.merchants??[]).filter(m=>m.visible&&!m.archived).map(m=>({id:m.id,name:m.name,description:m.description,
  city:atlas?.cities.filter(c=>c.id===m.cityId&&c.visible&&!c.archived).map(c=>({id:c.id,name:c.name}))[0]??null,organization:atlas?.organizations.filter(o=>o.id===m.organizationId&&o.visible&&!o.archived).map(o=>({id:o.id,name:o.name}))[0]??null,
  stock:m.stock.filter(s=>s.visible).map(s=>({id:s.item.id,name:s.item.name,description:s.item.description,quantity:s.item.quantity,massKg:s.item.massKg,durability:s.item.durability,maximumDurability:s.item.maximumDurability,prices:s.prices.map(p=>({...p}))}))}))}}
export function isTradeInput(v:unknown):v is TradeInput{return object(v)&&fields(v,['direction','actorId','merchantId','itemId','quantity','currencyId','unitPrice'])&&['buy','sell'].includes(String(v.direction))&&['actorId','merchantId','itemId','currencyId'].every(k=>id(v[k]))&&amount(v.quantity,1e6)&&v.quantity>0&&amount(v.unitPrice,1e9)}
export const balance=(rows:Balance[],currencyId:string)=>rows.find(b=>b.currencyId===currencyId)?.amount??0
const setBalance=(rows:Balance[],currencyId:string,value:number)=>[...rows.filter(b=>b.currencyId!==currencyId),{currencyId,amount:value}]
export function calculateTrade(world:World,input:TradeInput,destinationId:string):{world:World;summary:TradeSummary}{
 if(!isTradeInput(input)||!id(destinationId))throw Error('Проверь предмет, количество, валюту и целую цену.')
 const t=world.campaign.trade,actor=world.characters.find(a=>a.id===input.actorId),merchant=t?.merchants.find(m=>m.id===input.merchantId),currency=t?.currencies.find(c=>c.id===input.currencyId)
 if(!t||!actor||!merchant||!currency||merchant.archived)throw Error('Герой, торговец или валюта недоступны.')
 if(world.characters.some(a=>a.rpg.inventory.some(i=>i.id===destinationId))||t.merchants.some(m=>m.stock.some(s=>s.item.id===destinationId)))throw Error('Идентификатор нового экземпляра уже используется.')
 const source=input.direction==='buy'?merchant.stock.find(s=>s.item.id===input.itemId)?.item:actor.rpg.inventory.find(i=>i.id===input.itemId)
 if(!source||source.equipped||source.quantity<input.quantity)throw Error('Предмет недоступен, снаряжён или его количества недостаточно. Сначала явно сними снаряжение.')
 if(input.direction==='buy'&&merchant.stock.find(s=>s.item.id===input.itemId)?.prices.find(p=>p.currencyId===currency.id)?.unitPrice!==input.unitPrice)throw Error('Цена покупки изменилась или не задана мастером.')
 if(input.direction==='buy'&&actor.rpg.inventory.length>=200||input.direction==='sell'&&merchant.stock.length>=100)throw Error('Нет места для отдельной записи экземпляра. Автоматическое слияние стопок не выполняется.')
 const total=input.quantity*input.unitPrice,actorBefore=balance(t.wallets.find(w=>w.actorId===actor.id)?.balances??[],currency.id),merchantBefore=balance(merchant.balances,currency.id),actorAfter=actorBefore+(input.direction==='buy'?-total:total),merchantAfter=merchantBefore+(input.direction==='buy'?total:-total)
 if(!amount(total)||!amount(actorAfter)||!amount(merchantAfter))throw Error('Недостаточно средств или превышен предел целой суммы.')
 const next=structuredClone(world),trade=copyTrade(t),a=next.characters.find(a=>a.id===actor.id)!,m=trade.merchants.find(m=>m.id===merchant.id)!,item={...copyInventoryItem(source),id:destinationId,quantity:input.quantity,equipped:false},remaining=source.quantity-input.quantity
 if(input.direction==='buy'){m.stock=remaining?m.stock.map(s=>s.item.id===source.id?{...s,item:{...s.item,quantity:remaining}}:s):m.stock.filter(s=>s.item.id!==source.id);a.rpg.inventory.push(item)}
 else {a.rpg.inventory=remaining?a.rpg.inventory.map(i=>i.id===source.id?{...i,quantity:remaining}:i):a.rpg.inventory.filter(i=>i.id!==source.id);m.stock.push({item,visible:false,prices:[]})}
 const wallet=trade.wallets.find(w=>w.actorId===a.id);if(wallet)wallet.balances=setBalance(wallet.balances,currency.id,actorAfter);else trade.wallets.push({actorId:a.id,balances:[{currencyId:currency.id,amount:actorAfter}]})
 m.balances=setBalance(m.balances,currency.id,merchantAfter);next.campaign.trade=trade
 return {world:next,summary:{direction:input.direction,actorId:actor.id,actorName:actor.name,merchantId:m.id,merchantName:m.name,itemName:item.name,quantity:input.quantity,sourceQuantityBefore:source.quantity,sourceQuantityAfter:remaining,destinationItemId:destinationId,currency:{...currency},unitPrice:input.unitPrice,total,actorMoneyBefore:actorBefore,actorMoneyAfter:actorAfter,merchantMoneyBefore:merchantBefore,merchantMoneyAfter:merchantAfter,massKg:source.massKg*input.quantity,durability:source.durability,maximumDurability:source.maximumDurability,artifactCharge:source.artifactCharge??null}}
}
