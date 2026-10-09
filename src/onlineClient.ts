export const apiBase=(import.meta.env.VITE_API_URL||'').replace(/\/+$/,'')
export class NetworkError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status}}
export async function fetchApi<T>(path:string,token='',options:RequestInit={}):Promise<T>{
 let response:Response
 try{response=await fetch(apiBase+'/api'+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...options.headers},signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(path==='/config'?60000:15000)]):AbortSignal.timeout(path==='/config'?60000:15000)})}catch(e){if((e as Error).name==='AbortError')throw e;throw new NetworkError(0,'Сервер недоступен. Проверь его запуск или адрес подключения.')}
 let data:unknown;try{data=await response.json()}catch{throw new NetworkError(response.status,'Ответ сервера не похож на API. Для GitHub Pages укажи адрес сервера при сборке сайта.')}
 if(!response.ok)throw new NetworkError(response.status,(data as {message?:string}).message||'Не удалось выполнить запрос.')
 return data as T
}
