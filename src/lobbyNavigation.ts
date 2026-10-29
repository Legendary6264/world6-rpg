const key=(accountId:string)=>'world6.open-lobby.v1.'+accountId
const valid=(v:string|null)=>!!v&&/^[a-zA-Z0-9:_-]{1,160}$/.test(v)
export function readOpenLobby(accountId?:string):string{
 if(!accountId)return ''
 const explicit=new URLSearchParams(location.search).get('lobby')
 if(valid(explicit))return explicit!
 if(new URLSearchParams(location.search).has('invite'))return ''
 try{const id=window.sessionStorage.getItem(key(accountId));return valid(id)?id!:''}catch{return ''}
}
export function rememberOpenLobby(accountId:string|undefined,id:string){
 if(!accountId||id&&!valid(id))return
 try{if(id)window.sessionStorage.setItem(key(accountId),id);else window.sessionStorage.removeItem(key(accountId))}catch{/* The current room still works in memory. */}
 const url=new URL(location.href);url.searchParams.delete('invite')
 if(id)url.searchParams.set('lobby',id);else url.searchParams.delete('lobby')
 window.history.replaceState(null,'',url.href)
}
export function lobbyInviteUrl(code:string){const url=new URL(location.pathname,location.origin);url.searchParams.set('invite',code);return url.href}
