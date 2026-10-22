import {commitWorld} from './world-coordinator.mjs'
import {isSpeechDecision} from './generated/roundSpeech.mjs'
import {rejectRetiredCommand} from './campaign-retention-state.mjs'
import { collectionExecuted, roundBranch, setRoundBranch, requireCampaignRunning } from './round-branch.mjs'
import { createHash } from 'node:crypto'
import { fail, id, integer, now, world as validateWorld } from './validation.mjs'
import { requireLobbyPermission } from './permissions.mjs'
import { calculateRound, ROUND_EXECUTOR_VERSION } from './generated/roundExecution.mjs'
const requireMaster = member => { requireLobbyPermission(member, 'rounds'); requireLobbyPermission(member, 'viewSecrets') }
export const MAX_HISTORY_BYTES = 64 * 1024 * 1024, MAX_PREVIEW_BYTES = 32 * 1024 * 1024
export async function roundGeneration(tx, lobbyId) { return (await tx.get('SELECT generation FROM round_generations WHERE lobby_id=?', [lobbyId]))?.generation ?? 1 }
export async function invalidateRoundGeneration(tx, lobbyId) {
  await tx.run('INSERT INTO round_generations(lobby_id,generation) VALUES(?,2) ON CONFLICT(lobby_id) DO UPDATE SET generation=round_generations.generation+1', [lobbyId])
  await tx.run('DELETE FROM round_previews WHERE lobby_id=?', [lobbyId])
  await tx.run('DELETE FROM round_change_previews WHERE lobby_id=?', [lobbyId])
  await tx.run('DELETE FROM round_replay_contexts WHERE lobby_id=?', [lobbyId])
}
export const controlsStamp = async (tx, lobbyId) => String((await tx.get('SELECT COUNT(*) AS n FROM character_control_events WHERE lobby_id=?', [lobbyId])).n)
export function roundRoutes(app, { db, auth, updated, lockedMembership, record }) {
  app.post('/api/lobbies/:id/rounds/calculate', auth.middleware, async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) fail(400, 'Передай параметры расчёта.')
    const value = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireMaster(member)
      if (lobby.status === 'closed') fail(409, 'Лобби закрыто.')
      await requireCampaignRunning(tx,lobby.id)
      if (lobby.revision !== integer(req.body.revision)) fail(409, 'Кампания изменилась. Проверь расчёт с новой версией.')
      const state = JSON.parse(lobby.world_json), c = state.campaign.declarations?.active, generation = await roundGeneration(tx, lobby.id)
      if (!c || c.phase !== 'closed' || c.id !== req.body.collectionId || c.epoch !== integer(req.body.epoch)) fail(409, 'Сначала закрой текущий сбор и проверь его версию.')
      if (await collectionExecuted(tx,lobby.id,generation,c.id)) fail(409, 'Этот сбор уже исполнен. Сохрани его в истории и открой следующий.')
      if(req.body.input?.replay!==undefined)fail(400,'Для прежних бросков используй сопоставление переигровки.')
      return createRoundCalculation(tx,lobby,req.user.id,req.body.input)
    }); res.json(value)
  })
  app.post('/api/lobbies/:id/rounds/apply', auth.middleware, async (req, res) => {
    const body = req.body
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 3 || typeof body.previewId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(body.previewId) ||
        typeof body.commandKey !== 'string' || !/^[a-zA-Z0-9_-]{8,160}$/.test(body.commandKey)) fail(400, 'Проверь идентификаторы команды и расчёта.')
    const generation = integer(body.generation), hash = createHash('sha256').update(JSON.stringify([body.previewId, generation])).digest('hex')
    const result = await db.transaction(async tx => {
      const { lobby, member } = await lockedMembership(tx, req); requireMaster(member)
      await rejectRetiredCommand(tx,lobby.id,body.commandKey)
      if (generation !== await roundGeneration(tx, lobby.id)) fail(409, 'Кампания восстановлена. Эта команда относится к прежнему состоянию.')
      if(await tx.get('SELECT id FROM campaign_archive_receipts WHERE lobby_id=? AND command_key=?',[lobby.id,body.commandKey]))fail(409,'Ключ уже связан с восстановлением полной копии.')
      if(await tx.get('SELECT id FROM campaign_checkpoints WHERE lobby_id=? AND command_key=?',[lobby.id,body.commandKey]))fail(409,'Этот ключ уже связан с контрольной точкой.')
      if(await tx.get('SELECT id FROM round_change_receipts WHERE lobby_id=? AND command_key=?',[lobby.id,body.commandKey]))fail(409,'Этот ключ уже связан с изменением истории.')
      const previous = await tx.get('SELECT * FROM round_receipts WHERE lobby_id=? AND command_key=?', [lobby.id, body.commandKey])
      if (previous) {
        if (previous.author_id !== req.user.id || previous.request_hash !== hash) fail(409, 'Этот ключ команды уже связан с другим запросом.')
        return { receipt: JSON.parse(previous.receipt_json), duplicate: true }
      }
      if (lobby.status === 'closed') fail(409, 'Лобби закрыто.')
      await requireCampaignRunning(tx,lobby.id)
      const preview = await tx.get('SELECT * FROM round_previews WHERE lobby_id=? AND id=? AND author_id=?', [lobby.id, body.previewId, req.user.id])
      if (!preview || preview.generation !== generation) fail(409, 'Расчёт недоступен. Проверь текущую кампанию.')
      if (preview.executor_version !== ROUND_EXECUTOR_VERSION) fail(409, 'Исполнитель обновлён. Повтори расчёт по текущей версии.')
      if (preview.base_revision !== lobby.revision || preview.controls_stamp !== await controlsStamp(tx, lobby.id)) fail(409, 'Кампания или управление изменились. Повтори расчёт.')
      const c = JSON.parse(lobby.world_json).campaign.declarations?.active
      if (!c || c.phase !== 'closed' || c.id !== preview.collection_id || c.epoch !== preview.epoch) fail(409, 'Сбор заявлений изменился. Повтори расчёт.')
      if (await collectionExecuted(tx,lobby.id,generation,c.id)) fail(409, 'Этот сбор уже исполнен.')
      const branch=await roundBranch(tx,lobby.id,generation)
      const receipt = { id: id(), previewId: preview.id, collectionId: c.id, revision: lobby.revision + 1, generation, appliedAt: now(), summary: JSON.parse(preview.summary_json) }
      const data=await tx.get('SELECT * FROM round_calculation_data WHERE preview_id=?',[preview.id])
      if(!data)fail(409,'У расчёта нет данных переигровки. Рассчитай заново.')
      const receiptJson = JSON.stringify(receipt), bytes = Buffer.byteLength(lobby.world_json + receiptJson + data.input_json + data.execution_seed)
      await checkHistorySpace(tx,lobby.id,bytes)
      await tx.run('INSERT INTO round_receipts(id,lobby_id,author_id,command_key,request_hash,generation,collection_id,preview_id,before_json,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        [receipt.id, lobby.id, req.user.id, body.commandKey, hash, generation, c.id, preview.id, lobby.world_json, receiptJson, bytes])
      await tx.run('INSERT INTO round_history_data(receipt_id,lobby_id,generation,applied_revision,applied_at,input_json,execution_seed,executor_version) VALUES(?,?,?,?,?,?,?,?)',[receipt.id,lobby.id,generation,receipt.revision,receipt.appliedAt,data.input_json,data.execution_seed,ROUND_EXECUTOR_VERSION])
      await setRoundBranch(tx,lobby.id,generation,[...branch,receipt.id])
      await tx.run('DELETE FROM round_replay_contexts WHERE lobby_id=?',[lobby.id])
      await commitWorld(tx,lobby,preview.world_json,{at:receipt.appliedAt})
      await record(tx, req, 'apply-round')
      await tx.run('DELETE FROM round_previews WHERE lobby_id=?', [lobby.id])
      return { receipt, duplicate: false }
    })
    if (!result.duplicate) updated(req.params.id)
    res.json(result)
  })
}

export async function checkHistorySpace(tx,lobbyId,bytes){
  const size=await tx.get('SELECT COALESCE(SUM(payload_bytes),0) AS bytes,COUNT(*) AS n FROM (SELECT payload_bytes FROM round_receipts WHERE lobby_id=? UNION ALL SELECT payload_bytes FROM round_change_receipts WHERE lobby_id=?) AS history',[lobbyId,lobbyId])
  if(Number(size.bytes)+bytes>MAX_HISTORY_BYTES||Number(size.n)>=1000)fail(409,'История достигла технического предела. Экспортируй данные; снимки не удалены.')
}
export async function checkPreviewSpace(tx,lobby,authorId,bytes){
  for(const table of ['round_previews','round_change_previews'])await tx.run('DELETE FROM '+table+' WHERE lobby_id=? AND (author_id=? OR base_revision<>?)',[lobby.id,authorId,lobby.revision])
  const size=await tx.get('SELECT COALESCE(SUM(payload_bytes),0) AS n FROM (SELECT payload_bytes FROM round_previews WHERE lobby_id=? UNION ALL SELECT payload_bytes FROM round_change_previews WHERE lobby_id=?) AS previews',[lobby.id,lobby.id])
  if(Number(size.n)+bytes>MAX_PREVIEW_BYTES)fail(409,'Достигнут технический объём ожидающих расчётов. Заверши текущий расчёт.')
}
export async function createRoundCalculation(tx,lobby,authorId,input,executionSeed){
  await requireCampaignRunning(tx,lobby.id)
  const state=JSON.parse(lobby.world_json),c=state.campaign.declarations?.active,generation=await roundGeneration(tx,lobby.id)
  if(!c||c.phase!=='closed')fail(409,'Сначала закрой текущий сбор.')
  if(await collectionExecuted(tx,lobby.id,generation,c.id))fail(409,'Этот сбор уже исполнен.')
  const bindings=await tx.all('SELECT character_id,approved FROM character_bindings WHERE lobby_id=?',[lobby.id])
  if(!c.participantIds.every(actorId=>bindings.some(b=>b.character_id===actorId&&b.approved)))fail(409,'Допуск или состав героев изменился. Проверь сбор.')
  // Recording metadata comes from this server, so an incorrect device clock
  // cannot make later journal annotations invalid. Exact replay keeps its saved stamp.
  if(executionSeed===undefined&&input?.speech!==undefined){
    if(!Array.isArray(input.speech)||!input.speech.every(isSpeechDecision))fail(400,'Проверь решения о слышимости.')
    const recordedAt=now();input={...input,speech:input.speech.map(d=>({...d,recordedAt}))}
  }
  const previewId=id(),seed=executionSeed??previewId;let result
  try{result=calculateRound(state,c,input,seed);validateWorld(result.world)}catch(error){fail(400,error.message)}
  const worldJson=JSON.stringify(result.world),summaryJson=JSON.stringify(result.summary),inputJson=JSON.stringify(input),bytes=Buffer.byteLength(worldJson+summaryJson+inputJson+seed)
  await checkPreviewSpace(tx,lobby,authorId,bytes)
  await tx.run('INSERT INTO round_previews(id,lobby_id,author_id,generation,base_revision,collection_id,epoch,controls_stamp,executor_version,world_json,summary_json,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[previewId,lobby.id,authorId,generation,lobby.revision,c.id,c.epoch,await controlsStamp(tx,lobby.id),ROUND_EXECUTOR_VERSION,worldJson,summaryJson,bytes])
  await tx.run('INSERT INTO round_calculation_data(preview_id,input_json,execution_seed) VALUES(?,?,?)',[previewId,inputJson,seed])
  return {id:previewId,revision:lobby.revision,generation,collectionId:c.id,epoch:c.epoch,summary:result.summary}
}
