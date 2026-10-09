import { randomBytes } from 'node:crypto'
import { fail,text,choice,integer,id,now,character,emptyWorld,world,playerWorld,publicUser } from './validation.mjs'
import { requireChief, requireCampaignEditor } from './permissions.mjs'
const parseLobby=row=>({...row,world_json:undefined,invite_code:undefined})
export async function membership(db,lobbyId,user){const lobby=await db.get('SELECT * FROM lobbies WHERE id=?',[lobbyId]);if(!lobby)fail(404,'Лобби не найдено.');const member=await db.get('SELECT * FROM members WHERE lobby_id=? AND user_id=?',[lobbyId,user.id]);if(!member)fail(403,'Ты не участник этого лобби.');return {lobby,member}}
export function lobbyRoutes(app,{db,auth,io}){
 const updated=lobbyId=>io.to('lobby:'+lobbyId).emit('lobbyChanged',{id:lobbyId})
 const publicUpdated=()=>io.to('public').emit('communityChanged',{area:'lobbies'})
 app.get('/api/lobbies',async(req,res)=>{const q=String(req.query.q||'').slice(0,120).toLowerCase(),args=['%'+q+'%','%'+q+'%'];let where="l.visibility='public' AND l.status<>'closed' AND (LOWER(l.title) LIKE ? OR LOWER(l.description) LIKE ?)";for(const key of ['genre','energy','rank','status'])if(req.query[key]){where+=' AND l.'+key+'=?';args.push(String(req.query[key]).slice(0,60))}const offset=Math.max(0,Math.min(10000,Number(req.query.offset)||0)),rows=await db.all(`SELECT l.id,l.owner_id,l.title,l.description,l.genre,l.slots,l.energy,l.rank,l.visibility,l.status,l.created_at,l.updated_at,u.display_name AS owner,(SELECT COUNT(*) FROM members m WHERE m.lobby_id=l.id AND m.role='PLAYER') AS players FROM lobbies l JOIN users u ON u.id=l.owner_id WHERE ${where} ORDER BY l.updated_at DESC,l.id LIMIT 21 OFFSET ?`,[...args,offset]);res.json({items:rows.slice(0,20),hasMore:rows.length>20})})
 app.get('/api/lobbies/mine',auth.middleware,async(req,res)=>res.json(await db.all('SELECT l.id,l.title,l.status,l.visibility,m.role,l.revision FROM lobbies l JOIN members m ON m.lobby_id=l.id WHERE m.user_id=? ORDER BY l.updated_at DESC',[req.user.id])))
 app.post('/api/lobbies',auth.middleware,async(req,res)=>{const data={title:text(req.body.title,120),description:text(req.body.description,4000),genre:choice(req.body.genre,['Приключение','Исследование','Тайна','Свободная игра']),slots:integer(req.body.slots,1,12),energy:choice(req.body.energy,['any','mana','shadow']),rank:choice(req.body.rank,['mortal','spellcaster','elementalist','heavenlyLord','heavenlyMonarch']),visibility:choice(req.body.visibility,['public','private'])};const lobbyId=id(),at=now();await db.transaction(async tx=>{const count=await tx.get('SELECT COUNT(*) AS n FROM lobbies WHERE owner_id=? AND status<>?',[req.user.id,'closed']);if(Number(count.n)>=20)fail(409,'Сначала закрой старое лобби: максимум 20 активных.');await tx.run('INSERT INTO lobbies(id,owner_id,title,description,genre,slots,energy,rank,visibility,invite_code,world_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[lobbyId,req.user.id,data.title,data.description,data.genre,data.slots,data.energy,data.rank,data.visibility,randomBytes(18).toString('base64url'),JSON.stringify(emptyWorld()),at,at]);await tx.run('INSERT INTO members(lobby_id,user_id,role,joined_at) VALUES(?,?,?,?)',[lobbyId,req.user.id,'GM',at])});publicUpdated();res.status(201).json({id:lobbyId})})
 app.post('/api/lobbies/join',auth.middleware,async(req,res)=>{const code=text(req.body.code,64),lobby=await db.get('SELECT id FROM lobbies WHERE invite_code=?',[code]);if(!lobby)fail(404,'Приглашение не найдено.');req.params.id=lobby.id;await join(req,res,code)})
 async function join(req,res,code=''){
  await db.transaction(async tx=>{const lobby=await tx.get('SELECT * FROM lobbies WHERE id=?'+tx.lock,[req.params.id]);if(!lobby)fail(404,'Лобби не найдено.');if(await tx.get('SELECT 1 AS n FROM members WHERE lobby_id=? AND user_id=?',[lobby.id,req.user.id]))return;if(lobby.visibility==='private'&&lobby.invite_code!==code)fail(403,'Нужно приглашение в закрытое лобби.');if(lobby.status!=='open')fail(409,'Набор в лобби закрыт.');const count=await tx.get("SELECT COUNT(*) AS n FROM members WHERE lobby_id=? AND role='PLAYER'",[lobby.id]);if(Number(count.n)>=lobby.slots)fail(409,'Свободных мест нет.');await tx.run('INSERT INTO members(lobby_id,user_id,role,joined_at) VALUES(?,?,?,?)',[lobby.id,req.user.id,'PLAYER',now()]);await tx.run('UPDATE lobbies SET updated_at=? WHERE id=?',[now(),lobby.id])});updated(req.params.id);publicUpdated();res.json({id:req.params.id})
 }
 app.post('/api/lobbies/:id/join',auth.middleware,(req,res)=>join(req,res))
 app.get('/api/lobbies/:id',auth.middleware,async(req,res)=>{const {lobby,member}=await membership(db,req.params.id,req.user);const members=await db.all('SELECT u.id,u.display_name,u.role,u.disabled,m.role AS lobby_role FROM members m JOIN users u ON u.id=m.user_id WHERE m.lobby_id=? ORDER BY m.joined_at',[lobby.id]);res.json({...parseLobby(lobby),myRole:member.role,...(member.role==='GM'?{inviteCode:lobby.invite_code}:{}),members:members.map(u=>({...publicUser(u),lobbyRole:u.lobby_role}))})})
 // All administrative writes lock the lobby before checking membership. A transfer
 // cannot leave an old GM authorized by a role read before the transaction.
 async function lockedMembership(tx, req) {
  await tx.get('SELECT id FROM lobbies WHERE id=?'+tx.lock,[req.params.id])
  return membership(tx, req.params.id, req.user)
 }
 async function record(tx, req, action) {
  await tx.run('INSERT INTO audit(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)',[id(),req.user.id,action,req.params.id,now()])
 }
 app.patch('/api/lobbies/:id',auth.middleware,async(req,res)=>{
  await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireChief(lobby,member,req.user)
   const value={...lobby}
   for(const key of ['title','description'])if(req.body[key]!==undefined)value[key]=text(req.body[key],key==='title'?120:4000)
   if(req.body.genre!==undefined)value.genre=choice(req.body.genre,['Приключение','Исследование','Тайна','Свободная игра'])
   if(req.body.visibility!==undefined)value.visibility=choice(req.body.visibility,['public','private'])
   if(req.body.status!==undefined)value.status=choice(req.body.status,['open','playing','closed'])
   if(req.body.slots!==undefined)value.slots=integer(req.body.slots,1,12)
   const count=await tx.get("SELECT COUNT(*) AS n FROM members WHERE lobby_id=? AND role='PLAYER'",[lobby.id])
   if(Number(count.n)>value.slots)fail(409,'Мест не может быть меньше числа игроков в лобби.')
   await tx.run('UPDATE lobbies SET title=?,description=?,genre=?,slots=?,visibility=?,status=?,updated_at=? WHERE id=?',[value.title,value.description,value.genre,value.slots,value.visibility,value.status,now(),lobby.id])
   await record(tx,req,'lobby-settings')
  });updated(req.params.id);publicUpdated();res.json({ok:true})
 })
 app.post('/api/lobbies/:id/invite/rotate',auth.middleware,async(req,res)=>{
  const code=randomBytes(18).toString('base64url')
  await db.transaction(async tx=>{const {lobby,member}=await lockedMembership(tx,req);requireChief(lobby,member,req.user);await tx.run('UPDATE lobbies SET invite_code=?,updated_at=? WHERE id=?',[code,now(),lobby.id]);await record(tx,req,'rotate-invite')})
  updated(req.params.id);res.json({inviteCode:code})
 })
 app.patch('/api/lobbies/:id/members/:userId',auth.middleware,async(req,res)=>{
  const role=choice(req.body.role,['PLAYER','ASSISTANT'])
  await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireChief(lobby,member,req.user)
   const target=await tx.get('SELECT m.*,u.disabled FROM members m JOIN users u ON u.id=m.user_id WHERE m.lobby_id=? AND m.user_id=?',[lobby.id,req.params.userId])
   if(!target)fail(404,'Участник не найден.')
   if(target.user_id===lobby.owner_id)fail(409,'Для смены главного ГМ используй передачу роли.')
   if(target.disabled)fail(409,'Аккаунт участника заблокирован.')
   if(role==='PLAYER'&&target.role!=='PLAYER'){
    const count=await tx.get("SELECT COUNT(*) AS n FROM members WHERE lobby_id=? AND role='PLAYER'",[lobby.id])
    if(Number(count.n)>=lobby.slots)fail(409,'Для возвращения помощника в игроки увеличь число мест.')
   }
   await tx.run('UPDATE members SET role=? WHERE lobby_id=? AND user_id=?',[role,lobby.id,target.user_id])
   await tx.run('UPDATE lobbies SET revision=revision+1,updated_at=? WHERE id=?',[now(),lobby.id]);await record(tx,req,'lobby-member-role')
  });updated(req.params.id);publicUpdated();res.json({ok:true})
 })
 app.post('/api/lobbies/:id/transfer',auth.middleware,async(req,res)=>{
  const targetId=text(req.body.userId,160)
  await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req);requireChief(lobby,member,req.user)
   if(targetId===req.user.id)fail(409,'Ты уже главный ГМ.')
   const target=await tx.get('SELECT m.*,u.disabled FROM members m JOIN users u ON u.id=m.user_id WHERE m.lobby_id=? AND m.user_id=?',[lobby.id,targetId])
   if(!target)fail(404,'Передать роль можно только участнику этого лобби.')
   if(target.disabled)fail(409,'Аккаунт участника заблокирован.')
   const count=await tx.get("SELECT COUNT(*) AS n FROM lobbies WHERE owner_id=? AND status<>'closed'",[targetId])
   if(lobby.status!=='closed'&&Number(count.n)>=20)fail(409,'У участника уже 20 активных лобби.')
   // The old chief becomes an assistant. Characters, chat and saves remain intact.
   await tx.run("UPDATE members SET role='ASSISTANT' WHERE lobby_id=? AND user_id=?",[lobby.id,req.user.id])
   await tx.run("UPDATE members SET role='GM' WHERE lobby_id=? AND user_id=?",[lobby.id,targetId])
   await tx.run('UPDATE lobbies SET owner_id=?,invite_code=?,revision=revision+1,updated_at=? WHERE id=?',[targetId,randomBytes(18).toString('base64url'),now(),lobby.id]);await record(tx,req,'transfer-chief')
  });updated(req.params.id);publicUpdated();res.json({ok:true})
 })
 app.delete('/api/lobbies/:id/members/:userId',auth.middleware,async(req,res)=>{
  await db.transaction(async tx=>{
   const {lobby,member}=await lockedMembership(tx,req)
   if(req.params.userId!==req.user.id)requireChief(lobby,member,req.user)
   if(req.params.userId===lobby.owner_id)fail(409,'Сначала передай роль главного ГМ другому участнику.')
   if(!await tx.get('SELECT user_id FROM members WHERE lobby_id=? AND user_id=?',[lobby.id,req.params.userId]))fail(404,'Участник не найден.')
   const state=JSON.parse(lobby.world_json),bindings=await tx.all('SELECT character_id FROM character_bindings WHERE lobby_id=? AND owner_id=?',[lobby.id,req.params.userId]),removed=new Set(bindings.map(b=>b.character_id))
   state.characters=state.characters.filter(c=>!removed.has(c.id))
   for(const c of state.characters){c.rpg.casts=c.rpg.casts.map(cast=>removed.has(cast.targetId)&&['preparing','ready','maintaining'].includes(cast.status)?{...cast,status:'interrupted'}:cast);c.rpg.effects=c.rpg.effects.filter(e=>!removed.has(e.ownerId))}
   await tx.run('DELETE FROM members WHERE lobby_id=? AND user_id=?',[lobby.id,req.params.userId]);await tx.run('DELETE FROM character_bindings WHERE lobby_id=? AND owner_id=?',[lobby.id,req.params.userId])
   await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=?',[JSON.stringify(state),now(),lobby.id]);await record(tx,req,'remove-lobby-member')
  })
  io.in('user:'+req.params.userId).socketsLeave('lobby:'+req.params.id);io.to('user:'+req.params.userId).emit('membershipChanged',{id:req.params.id});updated(req.params.id);publicUpdated();res.json({ok:true})
 })
 app.get('/api/lobbies/:id/messages',auth.middleware,async(req,res)=>{await membership(db,req.params.id,req.user);let filter='',args=[req.params.id];if(req.query.before){const cursor=String(req.query.before).split('|');if(cursor.length!==2)fail(400,'Некорректная страница чата.');filter=' AND (m.created_at<? OR (m.created_at=? AND m.id<?))';args.push(cursor[0],cursor[0],cursor[1])}const rows=await db.all('SELECT m.*,u.display_name AS author FROM messages m JOIN users u ON u.id=m.author_id WHERE m.lobby_id=?'+filter+' ORDER BY m.created_at DESC,m.id DESC LIMIT 51',args);res.json({items:rows.slice(0,50).reverse(),hasMore:rows.length>50})})
 app.post('/api/lobbies/:id/messages',auth.middleware,async(req,res)=>{const message={id:id(),body:text(req.body.body,4000),created_at:now()};await db.transaction(async tx=>{await tx.get('SELECT id FROM lobbies WHERE id=?'+tx.lock,[req.params.id]);const {lobby}=await lockedMembership(tx,req);if(lobby.status==='closed')fail(409,'Лобби закрыто.');await tx.run('INSERT INTO messages(id,lobby_id,author_id,body,created_at) VALUES(?,?,?,?,?)',[message.id,lobby.id,req.user.id,message.body,message.created_at])});updated(req.params.id);res.status(201).json(message)})
 app.get('/api/lobbies/:id/world',auth.middleware,async(req,res)=>{const {lobby,member}=await membership(db,req.params.id,req.user),state=JSON.parse(lobby.world_json),bindings=await db.all('SELECT * FROM character_bindings WHERE lobby_id=?',[lobby.id]);res.json(['GM','ASSISTANT'].includes(member.role)&&req.query.view!=='player'?{...state,revision:lobby.revision,bindings}:playerWorld({...state,revision:lobby.revision},req.user.id,bindings))})
 app.post('/api/lobbies/:id/characters',auth.middleware,async(req,res)=>{const source=await db.get('SELECT * FROM characters WHERE id=? AND owner_id=?',[text(req.body.characterId,160),req.user.id]);if(!source)fail(404,'Сначала сохрани своего героя в аккаунт.');const actor=character(JSON.parse(source.data_json)),newId=id();actor.id=newId;actor.rpg.casts=[];actor.rpg.effects=actor.rpg.effects.filter(e=>!e.ownerId&&!e.castId);actor.rpg.logs=[];actor.rpg.abilities=actor.rpg.abilities.map(a=>({...a,approved:false}));await db.transaction(async tx=>{const {lobby}=await lockedMembership(tx,req);if(lobby.status==='closed')fail(409,'Лобби закрыто.');if(lobby.energy!=='any'&&actor.profile.energy!==lobby.energy)fail(409,'Тип энергии героя не подходит этому лобби.');const rows=await tx.all('SELECT * FROM character_bindings WHERE lobby_id=? AND owner_id=?',[lobby.id,req.user.id]);if(rows.length>=5)fail(409,'Максимум пять героев одного игрока в лобби.');const locked=await tx.get('SELECT * FROM lobbies WHERE id=?'+tx.lock,[lobby.id]),state=JSON.parse(locked.world_json);if(state.characters.length>=200)fail(409,'В кампании уже 200 героев.');state.characters.push(actor);await tx.run('INSERT INTO character_bindings(lobby_id,character_id,owner_id) VALUES(?,?,?)',[lobby.id,newId,req.user.id]);await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=?',[JSON.stringify(state),now(),lobby.id])});updated(req.params.id);res.status(201).json({id:newId})})
 app.put('/api/lobbies/:id/world',auth.middleware,async(req,res)=>{const candidate=world(req.body.world),revision=integer(req.body.revision);await db.transaction(async tx=>{const {lobby,member}=await lockedMembership(tx,req);requireCampaignEditor(member);if(lobby.energy!=='any'&&candidate.characters.some(c=>c.profile.energy!==lobby.energy))fail(409,'Тип энергии одного из героев не подходит этому лобби.');const locked=await tx.get('SELECT * FROM lobbies WHERE id=?'+tx.lock,[lobby.id]);if(locked.revision!==revision)fail(409,'Кампания изменилась у другого участника. Загрузи свежую версию перед публикацией.');const existing=await tx.all('SELECT * FROM character_bindings WHERE lobby_id=?',[lobby.id]);for(const c of candidate.characters)if(!existing.some(b=>b.character_id===c.id))await tx.run('INSERT INTO character_bindings(lobby_id,character_id,owner_id,approved) VALUES(?,?,?,1)',[lobby.id,c.id,req.user.id]);for(const b of existing)if(!candidate.characters.some(c=>c.id===b.character_id))await tx.run('DELETE FROM character_bindings WHERE lobby_id=? AND character_id=?',[lobby.id,b.character_id]);const r=await tx.run('UPDATE lobbies SET world_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',[JSON.stringify(candidate),now(),lobby.id,revision]);if(Number(r.changes)!==1)fail(409,'Конфликт версии кампании.');await tx.run('INSERT INTO audit(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)',[id(),req.user.id,'publish-world',lobby.id,now()])});updated(req.params.id);res.json({revision:revision+1})})
 app.patch('/api/lobbies/:id/characters/:characterId',auth.middleware,async(req,res)=>{
  if(typeof req.body.approved!=='boolean')fail(400,'Проверь утверждение героя.')
  await db.transaction(async tx=>{
   const {member}=await lockedMembership(tx,req);requireCampaignEditor(member)
   const r=await tx.run('UPDATE character_bindings SET approved=? WHERE lobby_id=? AND character_id=?',[req.body.approved?1:0,req.params.id,req.params.characterId])
   if(!Number(r.changes))fail(404,'Герой не найден.')
   await tx.run('UPDATE lobbies SET revision=revision+1,updated_at=? WHERE id=?',[now(),req.params.id]);await record(tx,req,'approve-character')
  });updated(req.params.id);res.json({ok:true})
 })
}
