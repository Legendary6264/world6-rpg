import {createHash} from 'node:crypto'
import {fail,integer,now,text,world as validateWorld} from './validation.mjs'
import {requireLobbyPermission} from './permissions.mjs'
import {emptyAtlas,copyAtlas,isAtlasEntry,publicAtlas} from './generated/campaignAtlas.mjs'
const master=m=>{requireLobbyPermission(m,'economy');requireLobbyPermission(m,'viewSecrets')}
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function campaignAtlasRoutes(app,{db,auth,updated,lockedMembership,record}){
 app.get('/api/lobbies/:id/atlas',auth.middleware,async(req,res)=>{
  const result=await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req),state=JSON.parse(lobby.world_json),atlas=state.campaign.atlas??emptyAtlas()
   if(req.query.view!=='master')return {revision:lobby.revision,atlas:publicAtlas(atlas)}
   master(member)
   const npcs=await tx.all('SELECT character_id FROM lobby_npcs WHERE lobby_id=?',[lobby.id])
   return {revision:lobby.revision,closed:lobby.status==='closed',atlas:copyAtlas(atlas),options:{npcs:npcs.flatMap(n=>{const a=state.characters.find(c=>c.id===n.character_id);return a?[{id:a.id,name:a.name}]:[]}),scenes:(state.campaign.scenes?.scenes??[]).map(s=>({id:s.id,name:s.name}))}}
  });res.json(result)
 })
 const write=(kind,plural)=>{
  const route=(mode,path)=>app.post(path,auth.middleware,async(req,res)=>{
   const b=req.body
   if(!object(b)||Object.keys(b).length!==4||Object.keys(b).some(k=>!['revision','entry','reason','commandKey'].includes(k))||typeof b.commandKey!=='string'||!/^atlas:[a-zA-Z0-9_-]{8,140}$/.test(b.commandKey)||!isAtlasEntry(b.entry,kind))fail(400,'Проверь поля города или организации и явное раскрытие связей.')
   const revision=integer(b.revision),reason=text(b.reason,2000),hash=createHash('sha256').update(JSON.stringify([kind,mode,req.params.entryId??null,b])).digest('hex')
   const result=await db.transaction(async tx=>{
    const {lobby,member}=await lockedMembership(tx,req);master(member)
    const oldCommand=await tx.get('SELECT * FROM campaign_atlas_commands WHERE lobby_id=? AND command_key=?',[lobby.id,b.commandKey])
    if(oldCommand){if(oldCommand.author_id!==req.user.id||oldCommand.request_hash!==hash)fail(409,'Ключ уже связан с другой командой справочника.');return {receipt:JSON.parse(oldCommand.receipt_json),duplicate:true}}
    if(lobby.status==='closed')fail(409,'Лобби закрыто.')
    if(lobby.revision!==revision)fail(409,'Кампания изменилась. Сверь текущую карточку перед записью.')
    const state=JSON.parse(lobby.world_json),atlas=copyAtlas(state.campaign.atlas??emptyAtlas()),rows=atlas[plural],before=rows.find(r=>r.id===b.entry.id)
    if(mode==='create'){if(before||[...atlas.cities,...atlas.organizations].some(r=>r.id===b.entry.id))fail(409,'Этот идентификатор карточки уже используется.');if(rows.length>=100)fail(409,'Достигнут предел: 100 городов и 100 организаций.')}
    else if(!before||req.params.entryId!==b.entry.id)fail(409,'Исходная карточка больше не доступна. Проверь её версию.')
    const npcs=await tx.all('SELECT character_id FROM lobby_npcs WHERE lobby_id=?',[lobby.id])
    if(b.entry.npcLinks.some(n=>!npcs.some(a=>a.character_id===n.actorId)))fail(409,'Выбери существующих NPC этого лобби. Связи с чужими героями не создаются.')
    const entry=structuredClone(b.entry);entry.name=entry.name.trim();entry.kind=entry.kind.trim()
    if(mode==='create')rows.push(entry);else atlas[plural]=rows.map(r=>r.id===entry.id?entry:r)
    state.campaign.atlas=atlas;validateWorld(state)
    const receipt={id:entry.id,kind,mode,revision:revision+1,reason,visible:entry.visible&&!entry.archived,appliedAt:now()},json=JSON.stringify(receipt),bytes=Buffer.byteLength(json+hash+b.commandKey)
    const size=await tx.get('SELECT COUNT(*) AS n,COALESCE(SUM(payload_bytes),0) AS bytes FROM campaign_atlas_commands WHERE lobby_id=?',[lobby.id])
    if(Number(size.n)>=10000||Number(size.bytes)+bytes>4*1024*1024)fail(409,'Достигнут предел подтверждений справочника. Прежние команды не удалены.')
    await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=?',[JSON.stringify(state),receipt.appliedAt,lobby.id])
    await record(tx,req,mode+'-'+kind)
    await tx.run('INSERT INTO campaign_atlas_commands(lobby_id,command_key,author_id,request_hash,receipt_json,payload_bytes) VALUES(?,?,?,?,?,?)',[lobby.id,b.commandKey,req.user.id,hash,json,bytes])
    return {receipt,duplicate:false}
   });if(!result.duplicate)updated(req.params.id);res.json(result)
  })
  route('create','/api/lobbies/:id/atlas/'+plural)
  route('edit','/api/lobbies/:id/atlas/'+plural+'/:entryId')
 }
 write('city','cities');write('organization','organizations')
}
