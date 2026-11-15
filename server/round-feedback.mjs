import {createHash} from 'node:crypto'
import {integer,world as validateWorld} from './validation.mjs'
import {roundBranch} from './round-branch.mjs'
import {roundGeneration} from './rounds.mjs'
import {isRoundFeedback,legacyRoundFeedback,publicFeedback} from './generated/roundFeedback.mjs'

const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value)
export const personalRoundId=(lobbyId,actorId,receiptId)=>'turn:'+createHash('sha256').update(JSON.stringify([lobbyId,actorId,receiptId])).digest('hex').slice(0,24)
export async function personalRoundResults(tx,lobby,actorId,requestedLimit){
 const limit=requestedLimit===undefined?5:typeof requestedLimit==='string'&&/^\d{1,2}$/.test(requestedLimit)?integer(Number(requestedLimit),1,20):integer(NaN)
 const branch=await roundBranch(tx,lobby.id,await roundGeneration(tx,lobby.id)),ids=branch.slice(-20).toReversed()
 if(!ids.length)return {reports:[],hasMore:false}
 const rows=await tx.all('SELECT id,receipt_json FROM round_receipts WHERE lobby_id=? AND id IN ('+ids.map(()=>'?').join(',')+')',[lobby.id,...ids]),byId=new Map(rows.map(row=>[row.id,row]))
 const reports=[]
 for(const id of ids){
  const row=byId.get(id);if(!row)continue
  let receipt;try{receipt=JSON.parse(row.receipt_json)}catch{continue}
  if(!record(receipt)||!record(receipt.summary)||typeof receipt.appliedAt!=='string'||receipt.appliedAt.length>80||!Number.isFinite(Date.parse(receipt.appliedAt))||!Number.isSafeInteger(receipt.revision)||receipt.revision<0)continue
  const summary=receipt.summary
  let report=isRoundFeedback(summary.personal)?summary.personal.actors.find(actor=>actor.actorId===actorId):null
  if(!report){
   const involved=['events','carried','missingDecisions'].some(key=>Array.isArray(summary[key])&&summary[key].some(entry=>record(entry)&&entry.actorId===actorId))
   if(!involved)continue
   const saved=await tx.get('SELECT before_json FROM round_receipts WHERE lobby_id=? AND id=?',[lobby.id,id])
   try{report=legacyRoundFeedback(validateWorld(JSON.parse(saved.before_json)),summary,actorId)}catch{continue}
  }
  if(!report)continue
  const publicId=personalRoundId(lobby.id,actorId,id)
  reports.push({...publicFeedback(report),id:publicId,appliedAt:receipt.appliedAt,revision:receipt.revision})
  if(reports.length>limit)break
 }
 return {reports:reports.slice(0,limit),hasMore:reports.length>limit}
}
