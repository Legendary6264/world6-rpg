import {balance,copyTrade,emptyTrade,MAX_MONEY} from './campaignTrade'
import {copyItem} from './rpgSchema'
import type {CampaignTrade} from './campaignTrade'
import type {InventoryItem} from './rpgTypes'
import type {World} from './rpgEngine'
export type EconomyLine={id:string;target:'actor'|'merchant';targetId:string;resource:'money'|'item';resourceId:string;amount:number}
export type EconomyRule={id:string;name:string;description:string;secret:string;enabled:boolean;inputs:EconomyLine[];outputs:EconomyLine[]}
type TargetSummary={target:EconomyLine['target'];targetId:string;targetName:string}
export type PeriodMoney=TargetSummary&{currencyId:string;currencyName:string;symbol:string;before:number;spent:number;earned:number;after:number}
export type PeriodConsumed=TargetSummary&{itemId:string;name:string;before:number;quantity:number;after:number}
export type PeriodProduced=TargetSummary&{templateId:string;name:string;quantity:number;destinationId:string;durability:number;maximumDurability:number;artifactCharge:number|null;massKg:number}
export type PeriodSummary={periodName:string;fromPeriod:number;toPeriod:number;count:number;ruleIds:string[];ruleNames:string[];reason:string;gameSeconds:number;money:PeriodMoney[];consumed:PeriodConsumed[];produced:PeriodProduced[]}
export type CampaignEconomy={version:1;periodName:string;completedPeriods:number;rules:EconomyRule[];lastRun:{id:string;summary:PeriodSummary}|null}
export type PeriodInput={fromPeriod:number;count:number;ruleIds:string[];reason:string;conditionsConfirmed:boolean}
export const MAX_ECONOMY_BYTES=2*1024*1024
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const fields=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(v)
const text=(v:unknown,max:number):v is string=>{if(typeof v!=='string'||v.length>max)return false;for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c<32&&![9,10,13].includes(c))return false}return true}
const integer=(v:unknown,max=MAX_MONEY,min=0):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max
const unique=(a:string[])=>new Set(a).size===a.length
const ids=(v:unknown,max:number):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(id)&&unique(v)
export function isEconomyLine(v:unknown):v is EconomyLine{return object(v)&&fields(v,['id','target','targetId','resource','resourceId','amount'])&&id(v.id)&&['actor','merchant'].includes(String(v.target))&&id(v.targetId)&&['money','item'].includes(String(v.resource))&&id(v.resourceId)&&integer(v.amount,v.resource==='money'?1e9:1e6,1)}
export function isEconomyRule(v:unknown):v is EconomyRule{return object(v)&&fields(v,['id','name','description','secret','enabled','inputs','outputs'])&&id(v.id)&&text(v.name,120)&&!!v.name.trim()&&text(v.description,2000)&&text(v.secret,8000)&&typeof v.enabled==='boolean'&&Array.isArray(v.inputs)&&v.inputs.length<=20&&v.inputs.every(isEconomyLine)&&Array.isArray(v.outputs)&&v.outputs.length<=20&&v.outputs.every(isEconomyLine)&&(!v.enabled||v.inputs.length+v.outputs.length>0)&&unique([...v.inputs,...v.outputs].map(l=>l.id))}
export function isEconomyRules(v:unknown):v is EconomyRule[]{return Array.isArray(v)&&v.length<=50&&v.every(isEconomyRule)&&unique(v.map(r=>r.id))}
const target=(v:Record<string,unknown>)=>['actor','merchant'].includes(String(v.target))&&id(v.targetId)&&text(v.targetName,120)
export function isPeriodSummary(v:unknown):v is PeriodSummary{
 if(!object(v)||!fields(v,['periodName','fromPeriod','toPeriod','count','ruleIds','ruleNames','reason','gameSeconds','money','consumed','produced'])||!text(v.periodName,120)||!v.periodName.trim()||!integer(v.fromPeriod,1e9,1)||!integer(v.toPeriod,1e9,1)||!integer(v.count,365,1)||v.toPeriod-v.fromPeriod+1!==v.count||!ids(v.ruleIds,50)||!Array.isArray(v.ruleNames)||v.ruleNames.length!==v.ruleIds.length||!v.ruleNames.every(n=>text(n,120))||!text(v.reason,2000)||!v.reason.trim()||typeof v.gameSeconds!=='number'||!Number.isFinite(v.gameSeconds)||v.gameSeconds<0||!Array.isArray(v.money)||v.money.length>2000||!Array.isArray(v.consumed)||v.consumed.length>1000||!Array.isArray(v.produced)||v.produced.length>1000)return false
 return v.money.every(m=>object(m)&&fields(m,['target','targetId','targetName','currencyId','currencyName','symbol','before','spent','earned','after'])&&target(m)&&id(m.currencyId)&&text(m.currencyName,120)&&text(m.symbol,16)&&[m.before,m.spent,m.earned,m.after].every(x=>integer(x))&&Number(m.before)-Number(m.spent)+Number(m.earned)===m.after)&&
  v.consumed.every(c=>object(c)&&fields(c,['target','targetId','targetName','itemId','name','before','quantity','after'])&&target(c)&&id(c.itemId)&&text(c.name,120)&&integer(c.before)&&integer(c.quantity,MAX_MONEY,1)&&integer(c.after)&&c.before-c.quantity===c.after)&&
  v.produced.every(p=>object(p)&&fields(p,['target','targetId','targetName','templateId','name','quantity','destinationId','durability','maximumDurability','artifactCharge','massKg'])&&target(p)&&id(p.templateId)&&id(p.destinationId)&&text(p.name,120)&&integer(p.quantity,MAX_MONEY,1)&&[p.durability,p.maximumDurability,p.massKg].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)&&Number(p.durability)<=Number(p.maximumDurability)&&(p.artifactCharge===null||typeof p.artifactCharge==='number'&&Number.isFinite(p.artifactCharge)&&p.artifactCharge>=0))&&unique(v.produced.map(p=>p.destinationId))
}
export function isCampaignEconomy(v:unknown):v is CampaignEconomy{
 return object(v)&&fields(v,['version','periodName','completedPeriods','rules','lastRun'])&&v.version===1&&text(v.periodName,120)&&integer(v.completedPeriods,1e9)&&isEconomyRules(v.rules)&&(v.lastRun===null||object(v.lastRun)&&fields(v.lastRun,['id','summary'])&&id(v.lastRun.id)&&isPeriodSummary(v.lastRun.summary)&&v.lastRun.summary.toPeriod===v.completedPeriods)&&new TextEncoder().encode(JSON.stringify(v)).length<=MAX_ECONOMY_BYTES
}
export const emptyEconomy=():CampaignEconomy=>({version:1,periodName:'',completedPeriods:0,rules:[],lastRun:null})
export const newEconomyRule=(id:string):EconomyRule=>({id,name:'',description:'',secret:'',enabled:false,inputs:[],outputs:[]})
export function copyEconomy(e:CampaignEconomy):CampaignEconomy{return {version:1,periodName:e.periodName,completedPeriods:e.completedPeriods,rules:e.rules.map(r=>({id:r.id,name:r.name,description:r.description,secret:r.secret,enabled:r.enabled,inputs:r.inputs.map(l=>({...l})),outputs:r.outputs.map(l=>({...l}))})),lastRun:e.lastRun?{id:e.lastRun.id,summary:structuredClone(e.lastRun.summary)}:null}}
export function economyReferencesValid(e:CampaignEconomy|undefined,actorIds:string[],trade:CampaignTrade|undefined):boolean{
 return e===undefined||isCampaignEconomy(e)&&e.rules.every(r=>[...r.inputs,...r.outputs].every(l=>(l.target==='actor'?actorIds.includes(l.targetId):!!trade?.merchants.some(m=>m.id===l.targetId))&&(l.resource!=='money'||!!trade?.currencies.some(c=>c.id===l.resourceId))))
}
export function pruneEconomy(e:CampaignEconomy,actorIds:string[]):CampaignEconomy{const next=copyEconomy(e);next.rules=next.rules.filter(r=>[...r.inputs,...r.outputs].every(l=>l.target!=='actor'||actorIds.includes(l.targetId)));return next}
export function isPeriodInput(v:unknown):v is PeriodInput{return object(v)&&fields(v,['fromPeriod','count','ruleIds','reason','conditionsConfirmed'])&&integer(v.fromPeriod,1e9,1)&&integer(v.count,365,1)&&ids(v.ruleIds,50)&&v.ruleIds.length>0&&text(v.reason,2000)&&!!v.reason.trim()&&v.conditionsConfirmed===true}
// All selected rules are accounted together. Money uses their net result;
// materials come from existing instances, and outputs are separate new records.
export function calculateEconomy(world:World,input:PeriodInput,runId:string,destinationIds:string[]):{world:World;summary:PeriodSummary}{
 if(!isPeriodInput(input)||!id(runId))throw Error('Проверь период, выбранные правила и явное подтверждение условий.')
 const economy=world.campaign.economy,trade=world.campaign.trade??emptyTrade()
 if(!economy||!economy.periodName.trim()||input.fromPeriod!==economy.completedPeriods+1||!integer(economy.completedPeriods+input.count,1e9))throw Error('Период или настройки изменились. Начни со следующего неучтённого периода.')
 const rules=input.ruleIds.map(id=>economy.rules.find(r=>r.id===id));if(rules.some(r=>!r?.enabled||r.inputs.length+r.outputs.length===0))throw Error('Выбери действующие непустые правила.')
 const selected=rules as EconomyRule[],outputs=selected.flatMap(r=>r.outputs).filter(l=>l.resource==='item')
 if(destinationIds.length!==outputs.length||!destinationIds.every(id)||!unique(destinationIds)||destinationIds.some(id=>world.characters.some(a=>a.rpg.inventory.some(i=>i.id===id))||trade.merchants.some(m=>m.stock.some(s=>s.item.id===id))))throw Error('Проверь отдельные идентификаторы создаваемых экземпляров.')
 const next=structuredClone(world);next.campaign.trade=copyTrade(trade)
 const owner=(line:EconomyLine)=>{
  const actor=line.target==='actor'?next.characters.find(a=>a.id===line.targetId):null,merchant=line.target==='merchant'?next.campaign.trade!.merchants.find(m=>m.id===line.targetId):null
  if(!actor&&!merchant||merchant?.archived)throw Error('Участник или торговец недоступен.')
  return {actor,merchant,label:{target:line.target,targetId:line.targetId,targetName:(actor?.name??merchant?.name)!}}
 }
 const money=new Map<string,PeriodMoney>(),consumed=new Map<string,PeriodConsumed>(),produced:PeriodProduced[]=[]
 for(const rule of selected)for(const [direction,lines] of [['input',rule.inputs],['output',rule.outputs]] as const)for(const line of lines){
  const o=owner(line),total=line.amount*input.count;if(!integer(total))throw Error('Сумма периода превышает предел. Ничего не округлено.')
  if(line.resource==='money'){
   const currency=trade.currencies.find(c=>c.id===line.resourceId);if(!currency)throw Error('Валюта больше недоступна.')
   const key=JSON.stringify([line.target,line.targetId,currency.id]),row=money.get(key)??{...o.label,currencyId:currency.id,currencyName:currency.name,symbol:currency.symbol,before:balance(o.merchant?.balances??trade.wallets.find(w=>w.actorId===line.targetId)?.balances??[],currency.id),spent:0,earned:0,after:0}
   row[direction==='input'?'spent':'earned']+=total;if(!integer(row.spent)||!integer(row.earned))throw Error('Общий денежный оборот периода превышает предел.');money.set(key,row)
  }else if(direction==='input'){
   const item=o.actor?.rpg.inventory.find(i=>i.id===line.resourceId)??o.merchant?.stock.find(s=>s.item.id===line.resourceId)?.item
   if(!item||item.equipped)throw Error('Исходный предмет недоступен или снаряжён. Выбери конкретный экземпляр сырья.')
   const key=JSON.stringify([line.target,line.targetId,item.id]),row=consumed.get(key)??{...o.label,itemId:item.id,name:item.name,before:item.quantity,quantity:0,after:0};row.quantity+=total
   if(!integer(row.quantity)||row.quantity>row.before)throw Error('Сырья недостаточно для всех выбранных правил вместе.');consumed.set(key,row)
  }else if(!world.campaign.items.some(t=>t.id===line.resourceId))throw Error('Шаблон продукции недоступен. Выбери актуальный шаблон в правиле.')
 }
 for(const row of money.values()){
  row.after=row.before-row.spent+row.earned;if(!integer(row.after))throw Error('Итоговые средства недостаточны или превышают предел.')
  const t=next.campaign.trade!,merchant=row.target==='merchant'?t.merchants.find(m=>m.id===row.targetId):null
  if(merchant)merchant.balances=[...merchant.balances.filter(b=>b.currencyId!==row.currencyId),{currencyId:row.currencyId,amount:row.after}]
  else {let wallet=t.wallets.find(w=>w.actorId===row.targetId);if(!wallet){wallet={actorId:row.targetId,balances:[]};t.wallets.push(wallet)}wallet.balances=[...wallet.balances.filter(b=>b.currencyId!==row.currencyId),{currencyId:row.currencyId,amount:row.after}]}
 }
 for(const row of consumed.values()){
  row.after=row.before-row.quantity
  if(row.target==='actor'){const a=next.characters.find(a=>a.id===row.targetId)!;a.rpg.inventory=row.after?a.rpg.inventory.map(i=>i.id===row.itemId?{...i,quantity:row.after}:i):a.rpg.inventory.filter(i=>i.id!==row.itemId)}
  else {const m=next.campaign.trade!.merchants.find(m=>m.id===row.targetId)!;m.stock=row.after?m.stock.map(s=>s.item.id===row.itemId?{...s,item:{...s.item,quantity:row.after}}:s):m.stock.filter(s=>s.item.id!==row.itemId)}
 }
 for(const [index,line] of outputs.entries()){
  const o=owner(line),template=world.campaign.items.find(t=>t.id===line.resourceId)!,quantity=line.amount*input.count,item:InventoryItem={...copyItem(template),id:destinationIds[index],templateId:template.id,quantity,durability:template.maximumDurability,equipped:false}
  if(o.actor){if(o.actor.rpg.inventory.length>=200)throw Error('Инвентарь получателя заполнен.');o.actor.rpg.inventory.push(item)}else{if(o.merchant!.stock.length>=100)throw Error('Запасы торговца заполнены.');o.merchant!.stock.push({item,visible:false,prices:[]})}
  produced.push({...o.label,templateId:template.id,name:template.name,quantity,destinationId:item.id,durability:item.durability,maximumDurability:item.maximumDurability,artifactCharge:item.artifactCharge??null,massKg:item.massKg*quantity})
 }
 const summary:PeriodSummary={periodName:economy.periodName,fromPeriod:input.fromPeriod,toPeriod:economy.completedPeriods+input.count,count:input.count,ruleIds:[...input.ruleIds],ruleNames:selected.map(r=>r.name),reason:input.reason,gameSeconds:world.campaign.seconds,money:[...money.values()],consumed:[...consumed.values()],produced}
 next.campaign.economy={...copyEconomy(economy),completedPeriods:summary.toPeriod,lastRun:{id:runId,summary}}
 if(!isPeriodSummary(summary)||!isCampaignEconomy(next.campaign.economy))throw Error('Предел или формат учёта превышен. Раздели период и сохрани прежний учёт.')
 return {world:next,summary}
}
