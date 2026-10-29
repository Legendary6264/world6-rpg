import {networkInterfaces} from 'node:os'
import {devNetwork} from './dev-network.mjs'
import { spawn } from 'node:child_process'
const lan=process.argv.includes('--lan')
let interfaces={}
if(lan){try{interfaces=networkInterfaces()}catch{console.log('Автоопределение сетевого адреса недоступно. При необходимости задай LAN_HOST — свой частный IPv4 из ipconfig.')}}
const network=devNetwork(process.env,interfaces,lan)
if(lan){console.log('Совместная проверка в одной локальной сети. API остаётся на loopback.');for(const url of network.urls)console.log('Адрес для второго устройства: '+url);if(!network.urls.length)console.log('Не найден частный IPv4-адрес. Подключи устройства к одной сети.')}
const children=[]
const build=spawn(process.execPath,['scripts/build-server-rules.mjs'],{stdio:'inherit'})
await new Promise((resolve,reject)=>{build.on('exit',code=>code===0?resolve():reject(new Error('Не удалось собрать правила сервера.')))})
children.push(spawn(process.execPath,['server/index.mjs'],{stdio:'inherit',env:{...network.serverEnv,NODE_ENV:'development'}}))
children.push(spawn(process.execPath,['node_modules/vite/bin/vite.js',...network.viteArgs],{stdio:'inherit'}))
let closing=false
function close(){if(closing)return;closing=true;for(const child of children)child.kill('SIGTERM')}
for(const child of children)child.on('exit',code=>{close();process.exitCode=code||0})
process.on('SIGINT',close);process.on('SIGTERM',close)
