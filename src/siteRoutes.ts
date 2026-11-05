export const sitePages={
 home:'Главная',character:'Персонажи',lobbies:'Лобби',guide:'Путеводитель',tutorial:'Обучение',
 stories:'Сюжеты',news:'Новости',forum:'Форум',support:'Поддержка',account:'Аккаунт',admin:'Управление',worldEditor:'Редактор мира',
} as const
export type SitePage=keyof typeof sitePages
export function readSitePage(href:string):SitePage{
 const params=new URL(href).searchParams,page=params.get('page')
 if(page&&Object.hasOwn(sitePages,page))return page as SitePage
 return params.has('invite')||params.has('lobby')?'lobbies':'home'
}
export function sitePageUrl(href:string,page:SitePage){
 const url=new URL(href);url.searchParams.set('page',page);return url.href
}
export function sitePageAllowed(page:SitePage,role?:string){
 return page==='admin'?role==='ADMIN'||role==='OWNER':page==='worldEditor'?['WORLD_EDITOR','ADMIN','OWNER'].includes(role??''):true
}
