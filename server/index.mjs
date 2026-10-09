import { createApplication } from './app.mjs'
const server=await createApplication(),address=await server.listen()
console.log(`Мир 6 API: http://${address.address}:${address.port} · ${server.config.authMode==='local'?'локальная проверка аккаунтов':'Supabase Auth'}`)
let closing=false
async function close(){if(closing)return;closing=true;await server.close();process.exit(0)}
process.on('SIGTERM',close);process.on('SIGINT',close)
