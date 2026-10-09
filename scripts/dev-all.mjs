import { spawn } from 'node:child_process'
const children=[]
const build=spawn(process.execPath,['scripts/build-server-rules.mjs'],{stdio:'inherit'})
await new Promise((resolve,reject)=>{build.on('exit',code=>code===0?resolve():reject(new Error('Не удалось собрать правила сервера.')))})
children.push(spawn(process.execPath,['server/index.mjs'],{stdio:'inherit',env:{...process.env,NODE_ENV:'development'}}))
children.push(spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'}))
let closing=false
function close(){if(closing)return;closing=true;for(const child of children)child.kill('SIGTERM')}
for(const child of children)child.on('exit',code=>{close();process.exitCode=code||0})
process.on('SIGINT',close);process.on('SIGTERM',close)
