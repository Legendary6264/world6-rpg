import {fail} from './validation.mjs'
import {roundBranch} from './round-branch.mjs'
import {roundGeneration} from './rounds.mjs'
import {personalRoundId,personalRoundResults} from './round-feedback.mjs'
import {restoreRoundPresentation} from './round-presentation-storage.mjs'
import {buildRoundPresentation,isRoundPresentation} from './generated/roundPresentation.mjs'

export async function personalRoundPresentation(tx,lobby,actorId,reportId){
 if(typeof reportId!=='string'||!/^turn:[a-f0-9]{24}$/.test(reportId))fail(400,'Выбери сохранённый результат героя.')
 const generation=await roundGeneration(tx,lobby.id),branch=await roundBranch(tx,lobby.id,generation)
 const receiptId=branch.slice(-20).find(id=>personalRoundId(lobby.id,actorId,id)===reportId)
 if(!receiptId)fail(404,'Этот результат недоступен в текущем продолжении игры.')
 const {reports}=await personalRoundResults(tx,lobby,actorId,'20'),report=reports.find(r=>r.id===reportId)
 if(!report)fail(404,'У героя нет доступной записи этого раунда.')
 const row=await tx.get('SELECT before_json,receipt_json FROM round_receipts WHERE lobby_id=? AND id=?',[lobby.id,receiptId])
 const receipt=JSON.parse(row.receipt_json),before=JSON.parse(row.before_json)
 let after=null
 if(receipt.presentation){try{after=restoreRoundPresentation(row.before_json,receipt.presentation,receipt.revision)}catch{fail(409,'Запись сцены повреждена или несовместима. Текстовый результат раунда сохранён.')}}
 const result=buildRoundPresentation(before,after,receipt.summary,actorId,report,generation)
 if(!isRoundPresentation(result,reportId))fail(409,'Не удалось проверить запись просмотра. Текстовый результат раунда сохранён.')
 return result
}
