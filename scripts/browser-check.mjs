import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {resolve,join,sep} from 'node:path'
import {spawn} from 'node:child_process'
import {createServer} from 'vite'

// Isolated local UI checks. Never uses the user's browser profile or accounts.
export async function browserCheck(outputPath,html,check,{webgl=false}={}){
 const output=resolve(outputPath),executable=[process.env.WORLD6_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&existsSync(p))
 if(!executable)throw Error('Укажи путь к Chrome/Chromium через WORLD6_BROWSER.')
 await mkdir(output,{recursive:true});const profile=await mkdtemp(join(output,'chrome-profile-'));assert(resolve(profile).startsWith(output+sep))
 const server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'browser-check-fixture',configureServer(vite){vite.middlewares.use('/__browser-check',async(_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__browser-check',html))})}}]})
 let browser,ws,id=0,diagnostics=''
 const pending=new Map(),exceptions=[],delay=ms=>new Promise(r=>setTimeout(r,ms))
 const call=(method,params={})=>new Promise((resolveCall,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timed out'))},20000);pending.set(n,{resolve:value=>{clearTimeout(timer);resolveCall(value)},reject:error=>{clearTimeout(timer);reject(error)}});ws.send(JSON.stringify({id:n,method,params}))})
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
 const until=async(fn,label)=>{const end=Date.now()+40000;while(Date.now()<end){if(await fn())return;await delay(100)}throw Error('Timeout: '+label)}
 async function capture(name,width,height){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await delay(300)
  const dimensions=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert(dimensions.scroll<=dimensions.width+1,'Page overflows: '+JSON.stringify(dimensions))
  const size=(await call('Page.getLayoutMetrics')).cssContentSize,image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.min(6000,size.height),scale:1}})
  const file=join(output,name+'.png');await writeFile(file,Buffer.from(image.data,'base64'));return {file,...dimensions}
 }
 try{
  await server.listen();const port=server.httpServer.address().port
  browser=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,...(webgl?['--enable-unsafe-swiftshader','--use-angle=swiftshader']:[]),'--window-size=1280,1000','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
  browser.stderr.on('data',data=>{diagnostics=(diagnostics+data).slice(-4000)});browser.on('error',e=>exceptions.push(e.message))
  let debug
  await until(async()=>{if(browser.exitCode!==null||exceptions.length)throw Error('Browser failed: '+diagnostics);try{debug=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];return !!debug}catch{return false}},'browser startup')
  const target=(await (await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(t=>t.type==='page');assert(target)
  ws=new WebSocket(target.webSocketDebuggerUrl);ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}})
  await new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});ws.addEventListener('error',no,{once:true})})
  await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false})
  await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/__browser-check'})
  const result=await check({evaluate,until,delay,capture,call})
  assert.deepEqual(exceptions,[]);const summary={...result,exceptions};await writeFile(join(output,'result.json'),JSON.stringify(summary,null,2)+'\n');return summary
 }finally{
  if(ws?.readyState===WebSocket.OPEN){try{await call('Browser.close')}catch{/* Browser may close before acknowledging. */}ws.close()}
  await server.close()
  if(browser&&browser.exitCode===null){await Promise.race([new Promise(r=>browser.once('exit',r)),delay(3000)]);if(browser.exitCode===null)browser.kill()}
  if(resolve(profile).startsWith(output+sep))await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200})
 }
}
