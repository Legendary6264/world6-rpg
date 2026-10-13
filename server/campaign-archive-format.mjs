import {isRoundReplay} from './generated/roundReplay.mjs'
import {validateAnchors} from './campaign-retention-state.mjs'
import {createHash} from 'node:crypto'
import {gzip,gunzip} from 'node:zlib'
import {promisify} from 'node:util'
import {fail,validId,integer,text,world} from './validation.mjs'
import {previewRoundTimeline} from './generated/roundTimeline.mjs'
export const ARCHIVE_FILE_LIMIT=32*1024*1024,ARCHIVE_JSON_LIMIT=128*1024*1024
const zip=promisify(gzip),unzip=promisify(gunzip)
export const archiveHash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex')
export async function packArchive(value){
 const json=JSON.stringify(value);if(Buffer.byteLength(json)>ARCHIVE_JSON_LIMIT)fail(413,'Распакованная полная копия превышает 128 МиБ.')
 const data=await zip(json);if(data.length>ARCHIVE_FILE_LIMIT)fail(413,'Сжатая полная копия превышает 32 МиБ.');return data
}
export async function unpackArchive(data){
 if(!Buffer.isBuffer(data)||!data.length||data.length>ARCHIVE_FILE_LIMIT)fail(413,'Нужен файл полной копии до 32 МиБ.')
 let value;try{value=JSON.parse((await unzip(data,{maxOutputLength:ARCHIVE_JSON_LIMIT})).toString('utf8'))}catch{fail(400,'Файл повреждён, не является сжатой копией или превышает предел распаковки.')}
 return validateArchive(value)
}
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v)
function keys(v,allowed){if(!record(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail(400,'Неизвестные поля полной копии.')}
function rows(v,max){if(!Array.isArray(v)||v.length>max)fail(400,'Слишком много записей полной копии.');return v}
function timestamp(v){if(typeof v!=='string'||v.length>80||!Number.isFinite(Date.parse(v)))fail(400,'Некорректная дата копии.');return v}
function ids(v,rounds){rows(v,1000);if(new Set(v).size!==v.length||v.some(id=>!rounds.some(r=>r.id===id)))fail(400,'Ветка ссылается на отсутствующие или повторные раунды.');return [...v]}
function replay(v,rounds){if(v===null)return null;if(!rounds.some(r=>r.id===v&&r.input!==null&&r.seed!==null&&r.executorVersion!==null))fail(400,'Некорректная ссылка переигровки.');return v}
export function validateArchive(v){
 keys(v,['format','version','exportedAt','source','world','rounds','changes','checkpoints','branch','replayId','session','anchors','replayExact'])
 if(v.replayExact!==undefined&&typeof v.replayExact!=='boolean')fail(400,'Некорректный режим переигровки копии.')
 if(v.format!=='world6-complete-backup'||![1,2].includes(v.version))fail(400,'Нужна полная игровая копия «Граней Бытия» версии 1 или 2.')
 keys(v.source,['lobbyId','revision','generation']);const source={lobbyId:validId(v.source.lobbyId),revision:integer(v.source.revision),generation:integer(v.source.generation,1)}
 const rounds=rows(v.rounds,1000).map(r=>{
  keys(r,['id','authorLabel','collectionId','generation','revision','at','before','receipt','input','seed','executorVersion'])
  if(!record(r.receipt)||!record(r.receipt.summary)||r.receipt.id!==r.id||r.receipt.collectionId!==r.collectionId||r.receipt.revision!==r.revision||r.receipt.generation!==r.generation||r.receipt.appliedAt!==r.at)fail(400,'Несогласованная квитанция раунда.')
  if(!(r.input===null||record(r.input))||!(r.seed===null||typeof r.seed==='string'&&r.seed.length>0&&r.seed.length<=160)||!(r.executorVersion===null||typeof r.executorVersion==='string'&&r.executorVersion.length>0&&r.executorVersion.length<=160)||(r.input===null)!==(r.seed===null)||(r.seed===null)!==(r.executorVersion===null))fail(400,'Несогласованные данные переигровки.')
  const before=world(r.before),c=before.campaign.declarations?.active
  if(!c||c.id!==r.collectionId||c.phase!=='closed')fail(400,'Исходный снимок не соответствует сбору раунда.')
  if(r.input?.replay!==undefined&&!isRoundReplay(r.input.replay))fail(400,'Некорректные броски переигровки.')
  if(r.input!==null){try{previewRoundTimeline(c,r.input.timings)}catch{fail(400,'Некорректные бюджеты переигровки.')}if(!Array.isArray(r.input.continuations)||!Array.isArray(r.input.missingDecisions)||typeof r.input.interactionsConfirmed!=='boolean')fail(400,'Некорректные параметры переигровки.')}
  return {id:validId(r.id),authorLabel:text(r.authorLabel,160),collectionId:validId(r.collectionId),generation:integer(r.generation,1),revision:integer(r.revision),at:timestamp(r.at),before,receipt:structuredClone(r.receipt),input:r.input===null?null:structuredClone(r.input),seed:r.seed,executorVersion:r.executorVersion}
 })
 if(new Set(rounds.map(r=>r.generation+':'+r.collectionId)).size!==rounds.length||rounds.some(r=>r.generation>source.generation))fail(400,'Несогласованные поколения или повторный сбор.')
 const changes=rows(v.changes,1000).map(r=>{
  keys(r,['id','authorLabel','before','receipt'])
  if(!record(r.receipt)||r.receipt.id!==r.id||!record(r.receipt.summary)||!['cancel','rollback','pause'].includes(r.receipt.summary.operation))fail(400,'Некорректная квитанция изменения истории.')
  integer(r.receipt.revision);integer(r.receipt.generation,1);timestamp(r.receipt.appliedAt);text(r.receipt.summary.reason,1000)
  for(const key of ['removedRounds','restoredRoundIds','affectedChanges'])if(r.receipt.summary[key]!==undefined){const list=rows(r.receipt.summary[key],1000);for(const entry of list){if(key==='restoredRoundIds')validId(entry);else{if(!record(entry))fail(400,'Некорректные связи истории.');validId(entry.id)}}}
  return {id:validId(r.id),authorLabel:text(r.authorLabel,160),before:world(r.before),receipt:structuredClone(r.receipt)}
 })
 if(rounds.length+changes.length>1000)fail(400,'В копии больше 1000 квитанций.')
 const checkpoints=rows(v.checkpoints,20).map(p=>{
  keys(p,['id','name','authorLabel','at','revision','world','branch','replayId','anchors','replayExact'])
  if(p.replayExact!==undefined&&typeof p.replayExact!=='boolean')fail(400,'Некорректный режим переигровки точки.')
  return {replayExact:p.replayExact!==false,id:validId(p.id),name:text(p.name,80),authorLabel:text(p.authorLabel,160),at:timestamp(p.at),revision:integer(p.revision),world:world(p.world),anchors:validateAnchors(v.version===1?[]:p.anchors),branch:ids(p.branch,rounds),replayId:replay(p.replayId,rounds)}
 })
 const allIds=[...rounds,...changes,...checkpoints].map(r=>r.id);if(new Set(allIds).size!==allIds.length)fail(400,'Повторяются идентификаторы записей копии.')
 const revisions=[...rounds.map(r=>r.revision),...changes.map(r=>r.receipt.revision)];if(new Set(revisions).size!==revisions.length||revisions.some(r=>r>source.revision)||checkpoints.some(p=>p.revision>source.revision))fail(400,'Несогласованные версии истории копии.')
 const branch=ids(v.branch,rounds);for(const b of [branch,...checkpoints.map(p=>p.branch)])if(b.some((id,i)=>i>0&&rounds.find(r=>r.id===id).revision<=rounds.find(r=>r.id===b[i-1]).revision))fail(400,'Нарушен порядок ветки.')
 for(const b of [branch,...checkpoints.map(p=>p.branch)])if(new Set(b.map(id=>rounds.find(r=>r.id===id).collectionId)).size!==b.length)fail(400,'Сбор повторяется в одной ветке.')
 keys(v.session,['paused','reason']);if(typeof v.session.paused!=='boolean'||typeof v.session.reason!=='string'||v.session.reason.length>1000)fail(400,'Некорректная пауза копии.')
 const anchors=validateAnchors(v.version===1?[]:v.anchors)
 for(const [b,guard] of [[branch,anchors],...checkpoints.map(p=>[p.branch,p.anchors])])if(b.some(id=>guard.includes(rounds.find(r=>r.id===id).collectionId)))fail(400,'Сбор дублируется в полной и сокращённой истории.')
 const result={replayExact:v.replayExact!==false,format:v.format,version:2,anchors,exportedAt:timestamp(v.exportedAt),source,world:world(v.world),rounds,changes,checkpoints,branch,replayId:replay(v.replayId,rounds),session:{paused:v.session.paused,reason:v.session.reason}}
 const sizes=archiveSizes(result)
 if(sizes.history>64*1024*1024||sizes.checkpoints>32*1024*1024)fail(413,'История или точки превышают предел хранения лобби.')
 return result
}
export function archiveSizes(v){
 const bytes=o=>Buffer.byteLength(JSON.stringify(o))
 return {history:v.rounds.reduce((n,r)=>n+bytes(r.before)+bytes(r.receipt)+bytes(r.input)+(r.seed?.length??0),0)+v.changes.reduce((n,r)=>n+bytes(r.before)+bytes(r.receipt),0),checkpoints:v.checkpoints.reduce((n,p)=>n+bytes(p.world)+bytes(p.branch)+bytes(p.anchors??[])+(p.replayId?.length??0)+Buffer.byteLength(p.name),0)}
}
