import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {resolve,join,sep} from 'node:path'
import {spawn} from 'node:child_process'
import {createServer} from 'vite'

// Real WebGL/UI smoke check with synthetic, isolated presentation data. API and
// multiplayer rules are exercised separately by the server regression suite.
const output=resolve(process.argv[2]??'.tmp/round-browser')
await mkdir(output,{recursive:true})
const profile=await mkdtemp(join(output,'chrome-profile-'))
assert(resolve(profile).startsWith(output+sep))
const executable=[process.env.WORLD6_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&existsSync(p))
if(!executable)throw Error('Укажи путь к Chrome/Chromium через WORLD6_BROWSER.')
const html=`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Проверка просмотра раунда</title></head><body><main id="root" style="max-width:1100px;margin:auto;padding:12px"></main><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {OnlineContext} from '/src/onlineContext.ts';import Results from '/src/LobbyRoundResults.tsx';import '/src/index.css';import '/src/world6.css';import '/src/brandStyle.css';
const id='turn:'+ 'a'.repeat(24),appliedAt='2026-11-15T12:00:00.000Z';
const before={title:'У ворот · просмотр раунда',description:'Проверка карты и сохранённого исполнения',frame:{id:'browser-yard',width:16,depth:12,minZ:0,maxZ:6,groundZ:0,view:'top',palette:'stone'},areas:[{id:'known',x:0,y:0,z:0,width:16,depth:12,height:6,visible:true}],objects:[{id:'gate',name:'Ворота',kind:'door',x:10,y:5,z:0,width:2,depth:.3,height:2.5,open:false,visible:true},{id:'crate',name:'Ящик',kind:'crate',x:6,y:8,z:0,width:1,depth:1,height:1,open:false,visible:true}],contacts:[{id:'self',kind:'self',label:'Арканист',signs:'',x:3,y:4,z:0,characterModel:'arcanist',characterAnimation:'idle'},{id:'guard',kind:'identified',label:'Страж',signs:'',x:8,y:4,z:0,characterModel:'vanguard',characterAnimation:'idle'}]};
const after=structuredClone(before);after.contacts[0].x=6;after.objects[0].open=true;
const report={id,revision:8,appliedAt,coverage:'full',fromSeconds:0,toSeconds:5,note:'Сцена и результаты сохранены.',actions:[{id:'action:0',label:'Перемещение',status:'completed'},{id:'action:1',label:'Применение способности',status:'completed'}],resources:[{id:'mana',before:'20',after:'17',beforeMaximum:'20',afterMaximum:'20'}]};
const visual={id:'browser-light',spec:{familyId:'light',durationMs:1800},start:{x:6,y:4,z:1},end:{x:8,y:4,z:1},phase:'sequence',shape:'point',radius:1,coneAngleDeg:45};
const recording={version:1,id,generation:1,revision:8,appliedAt,coverage:'scene',fromSeconds:0,toSeconds:5,roundDurationMs:5000,durationMs:5000,before,after,events:[{id:'move',atMs:0,kind:'move',label:'Подход к воротам'},{id:'prepare',atMs:2000,kind:'prepare',label:'Подготовка заряда'},{id:'release',atMs:3000,kind:'release',label:'Выпуск способности'},{id:'gate',atMs:4000,kind:'interact',label:'Ворота открыты',object:{id:'gate',open:true}}],motions:[{startMs:0,endMs:2000,from:{x:3,y:4,z:0},to:{x:6,y:4,z:0}}],visuals:[{atMs:3000,untilMs:4800,visual}]};
const request=async url=>structuredClone(url.endsWith('/playback')?recording:{revision:9,generation:1,closed:false,reports:[report],hasMore:false});
createRoot(document.getElementById('root')).render(React.createElement(OnlineContext.Provider,{value:{request,events:0,user:{id:'browser-check'},refresh(){}}},React.createElement(Results,{lobbyId:'check',characterId:'hero',checkingAccess:false})));
</script></body></html>`
const server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'round-browser-fixture',configureServer(vite){vite.middlewares.use('/__round-presentation-check',async(req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__round-presentation-check',html))})}}]})
let browser,ws,nextId=0,browserErrors=''
const pending=new Map(),exceptions=[]
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await delay(100)}throw Error('Timeout: '+label)}
const call=(method,params={})=>new Promise((resolveCall,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'))},20000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolveCall(value)},reject:error=>{clearTimeout(timer);reject(error)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value}
try{
 await server.listen();const port=server.httpServer.address().port
 browser=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1280,1000','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
 browser.stderr.on('data',data=>{browserErrors=(browserErrors+data).slice(-4000)})
 browser.on('error',error=>exceptions.push(error.message))
 const debug=await until(async()=>{if(browser.exitCode!==null||exceptions.length)throw Error('Browser startup failed: '+(exceptions.join('; ')||browser.exitCode)+'\n'+browserErrors);try{return (await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]}catch{return null}},'browser startup')
 const target=(await (await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(t=>t.type==='page');assert(target)
 ws=new WebSocket(target.webSocketDebuggerUrl);ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description??message.params.exceptionDetails.text);if(message.id&&pending.has(message.id)){const task=pending.get(message.id);pending.delete(message.id);if(message.error)task.reject(Error(message.error.message));else task.resolve(message.result)}})
 await new Promise((resolveOpen,reject)=>{ws.addEventListener('open',resolveOpen,{once:true});ws.addEventListener('error',reject,{once:true})})
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false})
 await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/__round-presentation-check'})
 await until(()=>evaluate(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Посмотреть исполнение раунда'))`),'results UI')
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Посмотреть исполнение раунда')).click()`)
 await until(()=>evaluate(`!!document.querySelector('canvas')&&document.querySelector('canvas').width>0`),'WebGL canvas')
 assert(await evaluate(`!!document.querySelector('canvas').getContext('webgl2')`),'Real WebGL2 context required')
 await evaluate(`window.roundCanvas=document.querySelector('canvas');const field=document.querySelector('[aria-label="Время просмотра раунда"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'3500');field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));`)
 await until(()=>evaluate(`document.querySelector('[aria-label="Время просмотра раунда"]').value==='3500'`),'seek')
 await delay(400);assert.equal(await evaluate(`document.querySelector('[aria-label="Время просмотра раунда"]').value`),'3500')
 assert(await evaluate(`document.querySelector('canvas')===window.roundCanvas`),'Seeking must preserve WebGL canvas')
 assert((await evaluate(`document.querySelector('[aria-label="События исполненного раунда"] button[aria-current="step"]').textContent`)).includes('Выпуск способности'))
 const desktopSize=(await call('Page.getLayoutMetrics')).cssContentSize
 const desktop=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1280,height:Math.min(4000,desktopSize.height),scale:1}});await writeFile(join(output,'desktop.png'),Buffer.from(desktop.data,'base64'))
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(500)
 const dimensions=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth})`);assert(dimensions.scroll<=dimensions.width+1,'Mobile page must not overflow: '+JSON.stringify(dimensions))
 const eventVisible=await evaluate(`(()=>{const list=document.querySelector('[aria-label="События исполненного раунда"]'),item=list.querySelector('[data-current="true"]'),bounds=list.getBoundingClientRect(),selected=item.getBoundingClientRect();return selected.left>=bounds.left-1&&selected.right<=bounds.right+1})()`);assert(eventVisible,'Current event must remain visible after mobile resize')
 const mobileSize=(await call('Page.getLayoutMetrics')).cssContentSize
 const mobile=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:Math.min(4000,mobileSize.height),scale:1}});await writeFile(join(output,'mobile.png'),Buffer.from(mobile.data,'base64'))
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Вернуться к текущей сцене').click()`)
 await until(()=>evaluate(`!document.querySelector('[aria-label="Просмотр исполненного раунда"]')`),'close review')
 assert.deepEqual(exceptions,[])
 const result={webgl2:true,seek:true,pause:true,canvasPreserved:true,mobile:{...dimensions,eventVisible},closed:true,exceptions,desktop:join(output,'desktop.png'),mobileImage:join(output,'mobile.png')}
 await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2))
}finally{
 if(ws?.readyState===WebSocket.OPEN){try{await call('Browser.close')}catch{ /* Browser may close before acknowledging. */ }ws.close()}
 await server.close()
 if(browser&&browser.exitCode===null){await Promise.race([new Promise(r=>browser.once('exit',r)),delay(3000)]);if(browser.exitCode===null)browser.kill()}
 if(resolve(profile).startsWith(output+sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{})
}
