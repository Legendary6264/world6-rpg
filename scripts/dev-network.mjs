// Frontend proxies /api and /socket.io to the loopback API. LAN mode exposes
// only Vite and adds the machine's private IPv4 origins to the API allowlist.
export function devNetwork(env,interfaces,lan=false){
 if(!lan)return {viteArgs:[],serverEnv:{...env},urls:[]}
 const privateIp=ip=>/^10\./.test(ip)||/^192\.168\./.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip)
 const explicit=env.LAN_HOST??''
 if(explicit&&(!/^\d{1,3}(\.\d{1,3}){3}$/.test(explicit)||explicit.split('.').some(part=>Number(part)>255)||!privateIp(explicit)))throw Error('LAN_HOST должен быть частным IPv4-адресом этого компьютера.')
 const addresses=[...new Set([...(explicit?[explicit]:[]),...Object.values(interfaces).flatMap(rows=>rows??[]).filter(a=>!a.internal&&a.family==='IPv4'&&privateIp(a.address)).map(a=>a.address)])]
 const urls=addresses.map(ip=>'http://'+ip+':5173'),origins=[...new Set([...(env.CLIENT_ORIGINS||'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s=>s.trim()).filter(Boolean),...urls])]
 return {viteArgs:['--host','0.0.0.0','--port','5173','--strictPort'],serverEnv:{...env,CLIENT_ORIGINS:origins.join(',')},urls}
}
