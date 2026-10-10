import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { email, text, now, id, publicUser, fail } from './validation.mjs'
import { privilegedRoles, requireSecondFactor } from './permissions.mjs'
const derive=promisify(scrypt),digest=token=>createHash('sha256').update(token).digest('hex')
async function passwordHash(password,salt=randomBytes(16).toString('hex')){const hash=await derive(password,salt,64,{N:32768,maxmem:64*1024*1024});return salt+':'+hash.toString('hex')}
async function passwordMatches(password,saved){const [salt,hex]=saved.split(':'),computed=await passwordHash(password,salt),a=Buffer.from(computed.split(':')[1],'hex'),b=Buffer.from(hex,'hex');return a.length===b.length&&timingSafeEqual(a,b)}
export function createAuth(db,config){
 const supabase=config.authMode==='supabase'?createClient(config.supabaseUrl,config.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false}}):null
 const owner=(user)=>config.authMode==='supabase'?!!config.ownerId&&user.id===config.ownerId:!!config.ownerEmail&&user.email===config.ownerEmail
 async function session(user){const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+config.sessionHours*3600000).toISOString();await db.run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',[digest(token),user.id,expiresAt]);return {token,expiresAt,user:publicUser(user)}}
 async function authenticate(token){
  if(typeof token!=='string'||!token||token.length>8192)fail(401,'Войди в аккаунт.')
  let user,aal='aal1',mfaPending=false
  if(supabase){const {data,error}=await supabase.auth.getUser(token);if(error){if(error.name==='AuthRetryableFetchError'||!error.status||error.status>=500)fail(503,'Сервис проверки сессии временно недоступен. Повтори позже.');fail(401,'Сессия истекла или email не подтверждён.')}if(!data.user?.email||!data.user.email_confirmed_at)fail(401,'Сессия истекла или email не подтверждён.');const external=data.user,name=typeof external.user_metadata?.display_name==='string'?external.user_metadata.display_name.trim().slice(0,40):external.email.split('@')[0];await db.run('INSERT INTO users(id,email,display_name,role,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',[external.id,external.email.toLowerCase(),name||'Игрок',owner(external)?'OWNER':'PLAYER',now()]);user=await db.get('SELECT * FROM users WHERE id=?',[external.id]);let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString())}catch{fail(401,'Некорректная сессия.')};if(!claims||typeof claims!=='object')fail(401,'Некорректная сессия.');aal=claims.aal;if(config.production){if(typeof claims.session_id!=='string'||!/^[0-9a-f-]{36}$/i.test(claims.session_id))fail(401,'Некорректная сессия.');const active=await db.get('SELECT 1 AS active FROM auth.sessions WHERE id=?::uuid AND user_id=?::uuid',[claims.session_id,external.id]);if(!active)fail(401,'Сессия отозвана. Войди снова.')}
   mfaPending=external.factors?.some(f=>f.status==='verified')&&aal!=='aal2'
  }else{user=await db.get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',[digest(token),now()]);if(!user)fail(401,'Сессия истекла. Войди снова.')}
  if(user.disabled)fail(403,'Аккаунт заблокирован.')
  if(owner(user)&&user.role!=='OWNER'){await db.run('UPDATE users SET role=? WHERE id=?',['OWNER',user.id]);user.role='OWNER'}
  return {...user,aal,mfaPending:!!mfaPending}
 }
 const middleware=async(req,res,next)=>{try{req.token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';req.user=await authenticate(req.token);if(req.user.mfaPending&&!(req.method==='GET'&&req.path==='/api/me')&&req.path!=='/api/auth/logout')fail(403,'Подтверди второй фактор в разделе «Аккаунт».');next()}catch(e){next(e)}}
 function moderator(user){if(!['ADMIN','OWNER'].includes(user.role))fail(403,'Нужны права администратора.');requireSecondFactor(user,config)}
 function routes(app,limit){
  app.post('/api/auth/register',limit,async(req,res)=>{if(supabase)fail(400,'Для регистрации используется Supabase Auth.');const mail=email(req.body.email),name=text(req.body.displayName,40),password=text(req.body.password,128,12);if(await db.get('SELECT id FROM users WHERE email=?',[mail]))fail(409,'Аккаунт с таким email уже существует.');const user={id:id(),email:mail,display_name:name,role:owner({email:mail})?'OWNER':'PLAYER'};try{await db.run('INSERT INTO users(id,email,display_name,role,password_hash,created_at) VALUES(?,?,?,?,?,?)',[user.id,mail,name,user.role,await passwordHash(password),now()])}catch(e){if(String(e.code).includes('CONSTRAINT')||e.code==='23505')fail(409,'Аккаунт уже существует.');throw e}res.status(201).json(await session(user))})
  app.post('/api/auth/login',limit,async(req,res)=>{if(supabase)fail(400,'Для входа используется Supabase Auth.');const mail=email(req.body.email),password=text(req.body.password,128),user=await db.get('SELECT * FROM users WHERE email=?',[mail]);const saved=user?.password_hash||'0123456789abcdef0123456789abcdef:'+('00'.repeat(64));const match=await passwordMatches(password,saved);if(!user||!match||user.disabled)fail(401,'Не удалось войти. Проверь email и пароль.');res.json(await session(user))})
  app.post('/api/auth/logout',middleware,async(req,res)=>{if(!supabase)await db.run('DELETE FROM sessions WHERE token_hash=?',[digest(req.token)]);res.json({ok:true})})
  app.get('/api/me',middleware,(req,res)=>res.json({...publicUser(req.user),mfaRequired:config.authMode==='supabase'&&(privilegedRoles.includes(req.user.role)||req.user.mfaPending)&&req.user.aal!=='aal2'}))
  app.patch('/api/me',middleware,async(req,res)=>{const name=text(req.body.displayName,40);await db.run('UPDATE users SET display_name=? WHERE id=?',[name,req.user.id]);res.json({...publicUser({...req.user,display_name:name}),mfaRequired:config.authMode==='supabase'&&(privilegedRoles.includes(req.user.role)||req.user.mfaPending)&&req.user.aal!=='aal2'})})
 }
 return {authenticate,middleware,moderator,routes}
}
