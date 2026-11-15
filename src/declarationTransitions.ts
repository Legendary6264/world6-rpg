export type DeclarationTransitionIntent=
 |{operation:'open';revision:number;sceneId:string;participantIds:string[];durationSeconds:number;allowReplace:boolean}
 |{operation:'next';revision:number;collectionId:string;epoch:number}
 |{operation:'close'|'reopen'|'archive';collectionId:string;epoch:number}
 |{operation:'return';collectionId:string;epoch:number;actorId:string;baseVersion:number;note:string}
export type DeclarationTransitionCommand=DeclarationTransitionIntent&{generation:number;commandKey:string}
export type DeclarationTransitionReceipt={id:string;operation:string;generation:number;revision:number;appliedAt:string;collectionId:string|null;epoch:number|null;nextCollectionId:string|null;nextEpoch:number|null;phase:'open'|'closed'|'cancelled'|null;actorId?:string;entryVersion?:number;note?:string}
export const declarationTransitionOperations={open:'open-declarations',next:'next-declaration-round',close:'declarations-close',reopen:'declarations-reopen',archive:'declarations-archive',return:'return-declaration'} as const
export const declarationTransitionLabels={open:'открытие приёма',next:'следующий раунд',close:'закрытие приёма',reopen:'повторное открытие приёма',archive:'сохранение сбора в истории',return:'возврат заявления'} as const
export const declarationTransitionSuccess={open:'Приём открыт. Игроки готовят планы одновременно.',next:'Следующий раунд открыт. Игроки могут отправлять новые ходы.',close:'Приём закрыт. Ничьи действия ещё не исполнены.',reopen:'Приём открыт повторно.',archive:'Сбор сохранён в истории; игровые часы не изменились.',return:'Заявление возвращено для исправления.'} as const
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(value)
const integer=(value:unknown,min=0):value is number=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=1e9
export function isDeclarationTransitionCommand(value:unknown):value is DeclarationTransitionCommand{
 if(!record(value)||typeof value.operation!=='string'||!Object.hasOwn(declarationTransitionOperations,value.operation)||!integer(value.generation,1)||typeof value.commandKey!=='string'||!/^roundflow:[a-zA-Z0-9_-]{8,140}$/.test(value.commandKey))return false
 const shared=['operation','generation','commandKey'],kind=value.operation
 const fields=kind==='open'?['revision','sceneId','participantIds','durationSeconds','allowReplace']:kind==='next'?['revision','collectionId','epoch']:kind==='return'?['collectionId','epoch','actorId','baseVersion','note']:['collectionId','epoch']
 if(Object.keys(value).length!==shared.length+fields.length||![...shared,...fields].every(key=>Object.hasOwn(value,key)))return false
 if(kind==='open')return integer(value.revision)&&id(value.sceneId)&&Array.isArray(value.participantIds)&&value.participantIds.length>0&&value.participantIds.length<=200&&value.participantIds.every(id)&&new Set(value.participantIds).size===value.participantIds.length&&typeof value.durationSeconds==='number'&&Number.isFinite(value.durationSeconds)&&value.durationSeconds>0&&value.durationSeconds<=86400&&typeof value.allowReplace==='boolean'
 if(!id(value.collectionId)||!integer(value.epoch,1))return false
 if(kind==='next')return integer(value.revision)
 return kind!=='return'||id(value.actorId)&&integer(value.baseVersion)&&typeof value.note==='string'&&value.note.length<=2000&&!!value.note.trim()
}
// Fixed field order makes a retry independent of JSON property order.
export function declarationTransitionPayload(command:DeclarationTransitionCommand):unknown[]{
 const shared=['declaration-transition-v1',command.operation,command.generation]
 if(command.operation==='open')return [...shared,command.revision,command.sceneId,command.participantIds,command.durationSeconds,command.allowReplace]
 if(command.operation==='next')return [...shared,command.revision,command.collectionId,command.epoch]
 if(command.operation==='return')return [...shared,command.collectionId,command.epoch,command.actorId,command.baseVersion,command.note]
 return [...shared,command.collectionId,command.epoch]
}
export function isDeclarationTransitionAck(value:unknown,command:DeclarationTransitionCommand):value is {receipt:DeclarationTransitionReceipt;duplicate:boolean}{
 if(!isDeclarationTransitionCommand(command)||!record(value)||typeof value.duplicate!=='boolean'||!record(value.receipt))return false
 const receipt=value.receipt
 if(receipt.id!==command.commandKey||receipt.operation!==declarationTransitionOperations[command.operation]||receipt.generation!==command.generation||!integer(receipt.revision,1)||typeof receipt.appliedAt!=='string'||receipt.appliedAt.length>40||!Number.isFinite(Date.parse(receipt.appliedAt)))return false
 if(receipt.collectionId!==('collectionId' in command?command.collectionId:null)||receipt.epoch!==('epoch' in command?command.epoch:null))return false
 if(command.operation==='open'||command.operation==='next')return receipt.revision===command.revision+1&&id(receipt.nextCollectionId)&&receipt.nextEpoch===1&&receipt.phase==='open'&&(command.operation==='open'||receipt.nextCollectionId!==command.collectionId)
 if(command.operation==='archive')return receipt.nextCollectionId===null&&receipt.nextEpoch===null&&receipt.phase===null
 if(receipt.nextCollectionId!==command.collectionId)return false
 if(command.operation==='return')return receipt.nextEpoch===command.epoch&&receipt.phase==='open'&&receipt.actorId===command.actorId&&receipt.entryVersion===command.baseVersion+1&&receipt.note===command.note.trim()
 return receipt.nextEpoch===command.epoch+1&&receipt.phase===(command.operation==='close'?'closed':'open')
}
export function declarationTransitionRequest(lobbyPath:string,command:DeclarationTransitionCommand):{path:string;method:'POST'|'PATCH'}{
 if(command.operation==='return')return {path:lobbyPath+'/characters/'+command.actorId+'/declarations/return',method:'POST'}
 return {path:lobbyPath+'/declarations'+(command.operation==='next'?'/next':''),method:command.operation==='open'||command.operation==='next'?'POST':'PATCH'}
}
