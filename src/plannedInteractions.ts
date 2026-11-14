import {objectOperations,operateSceneObject} from './tabletopInteractions'
import type {ObjectOperation} from './tabletopInteractions'
import type {DeclaredAction,DeclarationItem,DeclarationTarget} from './actionDeclarations'
import type {InventoryItem} from './rpgTypes'
import type {ObservedObject} from './scenePerception'

type ItemOperation=NonNullable<Extract<DeclaredAction,{kind:'item'}>['operation']>
export const itemOperationLabels:Record<ItemOperation,string>={equip:'Снарядить',unequip:'Снять',activate:'Активировать',consume:'Использовать одну дозу'}
// Presentation of the owner's inventory. No effects, formulas or target data.
export function declarationItems(inventory:InventoryItem[]):DeclarationItem[]{
  return inventory.filter(item=>item.quantity>0).map(item=>({id:item.id,name:item.name,quantity:item.quantity,use:{
    slot:item.slot,equipped:item.equipped,working:item.maximumDurability<=0||item.durability>0||item.worksBroken,
    ...(item.category==='consumable'&&item.consumable?{consumable:{targets:item.consumable.targets,rangeM:item.consumable.rangeM,configured:
      (item.consumable.healAmount>0||item.consumable.stopBleeding||item.consumable.cureLabels.length>0||Object.values(item.consumable.restore).some(n=>n>0)||!!item.consumable.modifiers.length)&&(!item.consumable.modifiers.length||item.consumable.duration>0)}}:{}),
    ...(item.artifactLevel?{artifact:{charge:item.artifactCharge??item.energyReserve??0,cost:item.activationCost??1,configured:!!item.activationModifiers?.length}}:{})
  }}))
}
const round=(value:number)=>Math.abs(value)>1e9?value:Math.round(value*1e6)/1e6
export function itemPlanIssues(items:DeclarationItem[],actions:DeclaredAction[]):{index:number;message:string}[]{
  const used=new Map<string,number>()
  return actions.flatMap((action,index)=>{
    if(action.kind!=='item'||action.operation!=='consume')return []
    const item=items.find(item=>item.id===action.itemId),count=(used.get(action.itemId)??0)+action.quantity;used.set(action.itemId,count)
    return !item?[{index,message:'Расходник больше не доступен в инвентаре.'}]:count>item.quantity?[{index,message:'В плане использовано больше доз «'+item.name+'», чем есть в инвентаре.'}]:[]
  })
}
export function plannedItem(item:DeclarationItem,actions:DeclaredAction[]):DeclarationItem{
  const next:DeclarationItem={...item,...(item.use?{use:{...item.use,...(item.use.artifact?{artifact:{...item.use.artifact}}:{})}}:{})}
  for(const action of actions){
    if(action.kind!=='item'||action.itemId!==item.id)continue
    if(action.operation==='consume')next.quantity-=action.quantity
    if(!next.use)continue
    if(action.operation==='equip')next.use.equipped=true
    if(action.operation==='unequip')next.use.equipped=false
    if(action.operation==='activate'&&next.use.artifact)next.use.artifact.charge=round(next.use.artifact.charge-next.use.artifact.cost)
  }
  return next
}
export function itemChoices(item:DeclarationItem):{operation:ItemOperation;label:string;reason:string}[]{
  const use=item.use
  if(!use)return (Object.keys(itemOperationLabels) as ItemOperation[]).map(operation=>({operation,label:itemOperationLabels[operation],reason:item.quantity<=0?'Вся стопка уже использована в плане.':''}))
  const stock=item.quantity<=0?'Вся стопка уже использована в плане.':''
  const operations:ItemOperation[]=[...(use.equipped?['unequip' as const]:use.slot!=='none'&&item.quantity===1?['equip' as const]:[]),...(use.artifact?['activate' as const]:[]),...(use.consumable?['consume' as const]:[])]
  return operations.map(operation=>({operation,label:itemOperationLabels[operation],reason:stock||
    ((operation==='consume'||operation==='activate')&&!use.working?'Предмет повреждён и не работает.':
      operation==='consume'&&use.equipped?'Сначала сними предмет.':
      operation==='consume'&&use.consumable?.configured===false?'Эффект расходника не настроен.':
      operation==='activate'&&!use.equipped?'Сначала снаряди артефакт.':
      operation==='activate'&&!use.artifact?.configured?'Эффект активации не настроен.':
      operation==='activate'&&use.artifact!.charge<use.artifact!.cost?'Недостаточно собственной энергии артефакта.':'')}))
}
export function itemTarget(aim:'self'|'selected',item:DeclarationItem,selected:DeclarationTarget|null):DeclarationTarget|null{
  if(aim==='self')return {kind:'self'}
  return item.use?.consumable?.targets==='creature'&&(selected?.kind==='contact'||selected?.kind==='self')?selected:null
}
// Apply only known object flags to a copy, never to the perceived map or world.
export function plannedObject<T extends ObservedObject>(object:T,actions:DeclaredAction[]):{object:T;changes:number;issues:{index:number;message:string}[]}{
  let next={...object};const issues:{index:number;message:string}[]=[];let changes=0
  for(const [index,action] of actions.entries()){
    if(action.kind!=='interact'||action.target.kind!=='object'||action.target.id!==object.id||!objectOperations.includes(action.operation as ObjectOperation))continue
    try{next=operateSceneObject(next,action.operation as ObjectOperation);changes++}catch(error){issues.push({index,message:(error as Error).message})}
  }
  return {object:next,changes,issues}
}
