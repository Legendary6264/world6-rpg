import {createHash} from 'node:crypto'
import {fail,now,worldSize} from './validation.mjs'
import {roundGeneration} from './rounds.mjs'
import {rejectRetiredCommand} from './campaign-retention-state.mjs'
import {isActionDeclarations} from './generated/actionDeclarations.mjs'
import {isDeclarationTransitionCommand,isDeclarationTransitionAck,declarationTransitionPayload,declarationTransitionOperations} from './generated/declarationTransitions.mjs'

export function declarationTransitions({store,oldCommand}){
 function request(req,operation){
  const body=req.body
  if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Передай параметры управления раундом.')
  if(body.commandKey===undefined)return null
  if(!isDeclarationTransitionCommand(body)||!(Array.isArray(operation)?operation.includes(body.operation):body.operation===operation)||body.operation==='return'&&body.actorId!==req.params.characterId)fail(400,'Проверь сохранённую команду управления раундом.')
  return {command:body,hash:createHash('sha256').update(JSON.stringify(declarationTransitionPayload(body))).digest('hex')}
 }
 async function previous(tx,req,lobby,transition){
  if(!transition)return null
  const {command,hash}=transition
  if(command.generation!==await roundGeneration(tx,lobby.id))fail(409,'Кампания восстановлена. Проверь текущий раунд вместо повтора прежней команды.')
  await rejectRetiredCommand(tx,lobby.id,command.commandKey)
  const old=await oldCommand(tx,lobby,req.user,command.commandKey,hash)
  if(old&&!isDeclarationTransitionAck(old,command))fail(409,'Сохранённое подтверждение не соответствует этой команде раунда.')
  return old
 }
 async function finish(tx,req,lobby,state,declarations,transition,legacySave){
  if(!transition){await legacySave();return null}
  const {command,hash}=transition,c=declarations.active
  if(!isActionDeclarations(declarations))fail(400,'Не удалось проверить заявления.')
  state.campaign.declarations=declarations;worldSize(state)
  const entry=command.operation==='return'?c?.entries.find(entry=>entry.actorId===command.actorId):null
  const receipt={id:command.commandKey,operation:declarationTransitionOperations[command.operation],generation:command.generation,revision:lobby.revision+1,appliedAt:now(),
   collectionId:'collectionId' in command?command.collectionId:null,epoch:'epoch' in command?command.epoch:null,nextCollectionId:c?.id??null,nextEpoch:c?.epoch??null,phase:c?.phase??null,
   ...(entry?{actorId:entry.actorId,entryVersion:entry.revision,note:entry.note}:{})}
  if(!isDeclarationTransitionAck({receipt,duplicate:false},command))throw Error('Не удалось подтвердить переход раунда.')
  return store(tx,lobby,req.user,command.commandKey,hash,state,receipt,req)
 }
 return {request,previous,finish}
}
