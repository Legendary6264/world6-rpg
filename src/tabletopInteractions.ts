import type {SceneObject} from './sceneTypes'
import {legacyObjectBehavior,objectLightSource} from './legacyObjectBehavior.ts'

export type ObjectOperation='open'|'close'|'lock'|'unlock'|'ignite'|'extinguish'|'activate'|'deactivate'
export const objectOperations:readonly ObjectOperation[]=['open','close','lock','unlock','ignite','extinguish','activate','deactivate']
export const operationLabels:Record<ObjectOperation,string>={open:'Открыть',close:'Закрыть',lock:'Запереть',unlock:'Отпереть',ignite:'Зажечь',extinguish:'Погасить',activate:'Активировать',deactivate:'Отключить'}
type InteractiveObject=Pick<SceneObject,'kind'|'asset'|'artwork'|'open'|'active'|'locked'>
function containerObject(o:InteractiveObject){
 const legacy=legacyObjectBehavior(o)
 if(legacy)return !!legacy.open
 if(!o.asset&&o.artwork?.startsWith('expanded-object-')){
  const slug=o.artwork.slice('expanded-object-'.length)
  return o.kind==='door'?slug!=='archway':o.kind==='crate'&&['crate','chest','locked-chest','cage'].includes(slug)
 }
 return o.kind==='door'||o.kind==='crate'&&(!o.asset||o.asset==='chest')
}
export function supportsObjectOperation(o:InteractiveObject,operation:string):operation is ObjectOperation{
 const legacy=legacyObjectBehavior(o)
 if(operation==='open'||operation==='close')return containerObject(o)
 if(operation==='lock'||operation==='unlock')return containerObject(o)&&(!legacy||!!legacy.lock||operation==='unlock'&&o.locked===true)
 if(operation==='ignite'||operation==='extinguish')return objectLightSource(o)&&!o.asset?.startsWith('trap-')
 return ['activate','deactivate'].includes(operation)&&!!o.asset?.startsWith('trap-')
}
export function objectActions(o:InteractiveObject):{operation:ObjectOperation;label:string;disabled?:boolean}[]{
 const legacy=legacyObjectBehavior(o),actions:{operation:ObjectOperation;label:string;disabled?:boolean}[]=[]
 if(containerObject(o)){
  actions.push({operation:o.open?'close':'open',label:o.open?legacy?.closeLabel??'Закрыть':legacy?.openLabel??'Открыть',disabled:!o.open&&o.locked})
  if(supportsObjectOperation(o,o.locked?'unlock':'lock'))actions.push({operation:o.locked?'unlock':'lock',label:o.locked?'Отпереть':'Запереть',disabled:o.open})
 }
 if(o.asset?.startsWith('trap-'))return [{operation:o.active===false?'activate':'deactivate',label:o.asset==='trap-pit'?(o.active===false?'Открыть люк':'Закрыть люк'):o.asset==='trap-spikes'?(o.active===false?'Выдвинуть шипы':'Убрать шипы'):(o.active===false?'Включить огонь':'Потушить огонь')}]
 if(objectLightSource(o))actions.push({operation:o.active===false?'ignite':'extinguish',label:o.active===false?'Зажечь':'Погасить'})
 return actions
}
export function operateSceneObject(o:SceneObject,operation:ObjectOperation):SceneObject{
 if(!supportsObjectOperation(o,operation))throw Error('Это действие недоступно для выбранного объекта.')
 if(operation==='open'&&o.locked)throw Error('Объект заперт. Сначала нужно отпереть замок.')
 if(operation==='lock'&&o.open)throw Error('Сначала закрой объект, затем запри замок.')
 if(operation==='open'||operation==='close')return {...o,open:operation==='open'}
 if(operation==='lock'||operation==='unlock')return {...o,locked:operation==='lock'}
 const active=operation==='activate'||operation==='ignite'
 return {...o,active,...(o.asset==='trap-spikes'?{blocksMovement:active}:{})}
}
