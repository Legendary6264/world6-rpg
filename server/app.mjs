import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import { readConfig } from './config.mjs'
import { openDatabase } from './database.mjs'
import { createAuth } from './auth.mjs'
import { forumRoutes } from './forum.mjs'
import { lobbyRoutes,membership } from './lobbies.mjs'
import { communityRoutes } from './community.mjs'
import { ApiError } from './validation.mjs'
export async function createApplication(config=readConfig(),{Pool}={}){
 const db=await openDatabase(config,Pool),auth=createAuth(db,config),app=express(),http=createServer(app)
 if(config.production)app.set('trust proxy',1)
 app.disable('x-powered-by')
 app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}))
 app.use(cors({origin(origin,callback){callback(origin&&!config.origins.includes(origin)?new ApiError(403,'Этот адрес сайта не разрешён сервером.'):null,true)},methods:['GET','POST','PUT','PATCH','DELETE'],allowedHeaders:['Content-Type','Authorization']}))
 app.use(express.json({limit:'10mb',strict:true}))
 app.use('/api',rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Слишком много запросов. Повтори через минуту.'}}))
 const writeLimit=rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Слишком много изменений. Повтори через минуту.'}})
 app.use('/api',(req,res,next)=>req.method==='GET'||req.method==='OPTIONS'?next():writeLimit(req,res,next))
 const io=new Server(http,{cors:{origin:config.origins},maxHttpBufferSize:16384,allowRequest:(req,done)=>done(null,!req.headers.origin||config.origins.includes(req.headers.origin))})
 io.use(async(socket,next)=>{try{const token=socket.handshake.auth?.token;socket.data.user=token?await auth.authenticate(token):null;next()}catch(e){next(new Error(e.message))}})
 io.on('connection',socket=>{
  socket.join('public');if(socket.data.user)socket.join('user:'+socket.data.user.id)
  let subscriptions=0
  socket.on('subscribeLobby',async(lobbyId,ack)=>{try{if(typeof ack!=='function')return;if(typeof lobbyId!=='string'||lobbyId.length>160||++subscriptions>50)throw new Error('Слишком много подписок.');const user=await auth.authenticate(socket.handshake.auth.token);await membership(db,lobbyId,user);await socket.join('lobby:'+lobbyId);ack({ok:true})}catch(e){ack?.({ok:false,message:e.message})}})
  socket.on('unsubscribeLobby',lobbyId=>{if(typeof lobbyId==='string')socket.leave('lobby:'+lobbyId)})
  const interval=setInterval(async()=>{subscriptions=0;if(!socket.data.user)return;try{socket.data.user=await auth.authenticate(socket.handshake.auth.token)}catch{socket.disconnect(true)}},60000);interval.unref();socket.on('disconnect',()=>clearInterval(interval))
 })
 const context={db,auth,io,config}
 app.get('/api/health',async(req,res)=>{await db.get('SELECT 1 AS n');res.json({ok:true})})
 app.get('/api/config',(req,res)=>res.json({authMode:config.authMode,supabaseUrl:config.supabaseUrl,publishableKey:config.supabaseKey,registration:true}))
 auth.routes(app,rateLimit({windowMs:15*60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Слишком много попыток входа. Повтори позже.'}}))
 forumRoutes(app,context);lobbyRoutes(app,context);communityRoutes(app,context)
 app.use('/api',(req,res)=>res.status(404).json({message:'Метод API не найден.'}))
 app.use((error,req,res,next)=>{if(res.headersSent)return next(error);const status=error.status||500;if(status>=500)console.error('API error:',error.code||error.name,error.message);res.status(status).json({message:status>=500?'Сервер не смог выполнить запрос. Повтори позже.':status===413?'Загрузка превышает 10 МиБ.':error.message})})
 return {app,http,io,db,config,listen:()=>new Promise(resolve=>http.listen(config.port,config.host,()=>resolve(http.address()))),close:async()=>{await new Promise(resolve=>io.close(resolve));await db.close()}}
}
