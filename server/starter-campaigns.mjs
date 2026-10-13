import {createHash,randomBytes} from 'node:crypto'
import {fail,integer,text,now,id,world} from './validation.mjs'
import {requireChief} from './permissions.mjs'
import {controlEvent} from './lobby-access.mjs'
import {createNightCrossing} from './generated/starterCampaign.mjs'
import {NIGHT_CROSSING} from './generated/starterCampaignInfo.mjs'

const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function starterCampaignRoutes(app,{db,auth,publicUpdated}) {
 app.post('/api/lobbies/from-example',auth.middleware,async(req,res)=>{
  const b=req.body,fields=['exampleId','version','title','slots','commandKey']
  if(!object(b)||Object.keys(b).length!==fields.length||Object.keys(b).some(k=>!fields.includes(k))||
    b.exampleId!==NIGHT_CROSSING.id||b.version!==NIGHT_CROSSING.version||typeof b.commandKey!=='string'||!/^starter:[a-zA-Z0-9_-]{8,140}$/.test(b.commandKey))fail(400,'Проверь версию примера и поля создания лобби.')
  const title=text(b.title,120),slots=integer(b.slots,1,12),requestHash=hash([b.exampleId,b.version,b.title,b.slots,b.commandKey])
  // Stable identity + a locked account serialize concurrent retries and the per-owner quota.
  // Receipts reuse the private command ledger and survive restores in the same lobby.
  const hex=hash([req.user.id,b.commandKey]).slice(0,32),lobbyId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')
  const result=await db.transaction(async tx=>{
   const account=await tx.get('SELECT id,disabled FROM users WHERE id=?'+tx.lock,[req.user.id])
   if(!account||account.disabled)fail(403,'Аккаунт недоступен.')
   const existing=await tx.get('SELECT * FROM lobbies WHERE id=?'+tx.lock,[lobbyId])
   if(existing){
    const member=await tx.get('SELECT role FROM members WHERE lobby_id=? AND user_id=?',[lobbyId,req.user.id]);requireChief(existing,member??{},req.user)
    const previous=await tx.get('SELECT * FROM campaign_trade_commands WHERE lobby_id=? AND command_key=?',[lobbyId,b.commandKey])
    if(!previous||previous.author_id!==req.user.id||previous.request_hash!==requestHash)fail(409,'Ключ создания уже относится к другому лобби или набору настроек.')
    return {...JSON.parse(previous.receipt_json),duplicate:true}
   }
   const count=await tx.get("SELECT COUNT(*) AS n FROM lobbies WHERE owner_id=? AND status<>'closed'",[req.user.id])
   if(Number(count.n)>=20)fail(409,'Сначала закрой старое лобби: максимум 20 активных.')
   const example=createNightCrossing(lobbyId),state=world(example.world),at=now()
   await tx.run('INSERT INTO lobbies(id,owner_id,title,description,genre,slots,energy,rank,visibility,invite_code,world_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [lobbyId,req.user.id,title,NIGHT_CROSSING.description,'Приключение',slots,'mana','mortal','private',randomBytes(18).toString('base64url'),JSON.stringify(state),at,at])
   await tx.run('INSERT INTO members(lobby_id,user_id,role,joined_at) VALUES(?,?,?,?)',[lobbyId,req.user.id,'GM',at])
   for(const actorId of example.npcIds){
    await tx.run('INSERT INTO character_bindings(lobby_id,character_id,owner_id,approved) VALUES(?,?,?,1)',[lobbyId,actorId,req.user.id])
    await tx.run('INSERT INTO lobby_npcs(lobby_id,character_id,created_by,created_at) VALUES(?,?,?,?)',[lobbyId,actorId,req.user.id,at])
    await controlEvent(tx,lobbyId,actorId,req.user.id,req.user.id,'assign')
   }
   await tx.run('INSERT INTO audit(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)',[id(),req.user.id,'create-starter-lobby',lobbyId,at])
   const receipt={id:lobbyId,exampleId:b.exampleId,version:b.version,createdAt:at},json=JSON.stringify(receipt)
   await tx.run('INSERT INTO campaign_trade_commands(lobby_id,command_key,author_id,request_hash,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?)',
    [lobbyId,b.commandKey,req.user.id,requestHash,json,Buffer.byteLength(json+requestHash+b.commandKey)])
   return {...receipt,duplicate:false}
  })
  if(!result.duplicate)publicUpdated()
  res.status(result.duplicate?200:201).json(result)
 })
}
