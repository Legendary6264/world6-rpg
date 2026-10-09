import type { ReactNode } from 'react'
export function RemoteStatus({error,loading}:{error:string;loading:boolean}){return <>{error&&<p className="w6-error" role="alert">{error}</p>}{loading&&<p className="w6-copy" role="status">Загружаем…</p>}</>}
export function CommunityShell({title,children}:{title:string;children:ReactNode}){return <section className="panel w6-portal-page w6-community"><p className="w6-eyebrow">Сообщество Мира 6</p><h1>{title}</h1>{children}</section>}
export const formatDate=(at:string)=>new Date(at).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'})
