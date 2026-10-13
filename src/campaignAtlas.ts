export type AtlasNpcLink = { actorId:string; role:string; publicName:string; visible:boolean }
type AtlasFields = { id:string; name:string; kind:string; summary:string; description:string; secret:string;
  visible:boolean; archived:boolean; sceneIds:string[]; npcLinks:AtlasNpcLink[] }
export type AtlasCity = AtlasFields & { population:string }
export type AtlasOrganization = AtlasFields & { cityIds:string[] }
export type CampaignAtlas = { version:1; cities:AtlasCity[]; organizations:AtlasOrganization[] }
export type PublicAtlasEntry = { id:string; name:string; kind:string; summary:string; description:string;
  npcLinks:{publicName:string;role:string}[]; population?:string; cities?:{id:string;name:string}[]; organizations?:{id:string;name:string}[] }
export type PublicAtlas = {cities:PublicAtlasEntry[];organizations:PublicAtlasEntry[]}
export const MAX_ATLAS_BYTES=2*1024*1024
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(v)
const text=(v:unknown,max:number)=>{
  if(typeof v!=='string'||v.length>max)return false
  for(let i=0;i<v.length;i++){const code=v.charCodeAt(i);if(code<32&&code!==9&&code!==10&&code!==13)return false}
  return true
}
const ids=(v:unknown,max:number):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(id)&&new Set(v).size===v.length
const fields=['id','name','kind','summary','description','secret','visible','archived','sceneIds','npcLinks']
export function isAtlasEntry(v:unknown,kind:'city'|'organization'):v is AtlasCity|AtlasOrganization{
  return record(v)&&Object.keys(v).every(k=>[...fields,kind==='city'?'population':'cityIds'].includes(k))&&id(v.id)&&text(v.name,120)&&!!String(v.name).trim()&&
    text(v.kind,120)&&!!String(v.kind).trim()&&text(v.summary,2000)&&text(v.description,8000)&&text(v.secret,12000)&&typeof v.visible==='boolean'&&typeof v.archived==='boolean'&&ids(v.sceneIds,50)&&
    Array.isArray(v.npcLinks)&&v.npcLinks.length<=50&&new Set(v.npcLinks.map(n=>record(n)?n.actorId:null)).size===v.npcLinks.length&&v.npcLinks.every(n=>record(n)&&Object.keys(n).every(k=>['actorId','role','publicName','visible'].includes(k))&&id(n.actorId)&&text(n.role,120)&&text(n.publicName,120)&&typeof n.visible==='boolean'&&(!n.visible||!!String(n.publicName).trim()))&&
    (kind==='city'?text(v.population,120):ids(v.cityIds,50))
}
export function isCampaignAtlas(v:unknown):v is CampaignAtlas{
  if(!record(v)||Object.keys(v).some(k=>!['version','cities','organizations'].includes(k))||v.version!==1||!Array.isArray(v.cities)||v.cities.length>100||!Array.isArray(v.organizations)||v.organizations.length>100||
    !v.cities.every(c=>isAtlasEntry(c,'city'))||!v.organizations.every(o=>isAtlasEntry(o,'organization')))return false
  const cities=v.cities as AtlasCity[],organizations=v.organizations as AtlasOrganization[]
  if(new Set([...cities,...organizations].map(c=>c.id)).size!==cities.length+organizations.length||organizations.some(o=>o.cityIds.some(cityId=>!cities.some(c=>c.id===cityId))))return false
  return new TextEncoder().encode(JSON.stringify(v)).length<=MAX_ATLAS_BYTES
}
export const emptyAtlas=():CampaignAtlas=>({version:1,cities:[],organizations:[]})
export function newAtlasEntry(kind:'city'|'organization',id:string):AtlasCity|AtlasOrganization{
  const common={id,name:'',kind:kind==='city'?'Город':'Организация',summary:'',description:'',secret:'',visible:false,archived:false,sceneIds:[],npcLinks:[]}
  return kind==='city'?{...common,population:''}:{...common,cityIds:[]}
}
export function copyAtlas(a:CampaignAtlas):CampaignAtlas{
  const common=(r:AtlasCity|AtlasOrganization)=>({id:r.id,name:r.name,kind:r.kind,summary:r.summary,description:r.description,secret:r.secret,visible:r.visible,archived:r.archived,sceneIds:[...r.sceneIds],npcLinks:r.npcLinks.map(n=>({actorId:n.actorId,role:n.role,publicName:n.publicName,visible:n.visible}))})
  return {version:1,cities:a.cities.map(r=>({...common(r),population:r.population})),organizations:a.organizations.map(r=>({...common(r),cityIds:[...r.cityIds]}))}
}
export function atlasReferencesValid(atlas:CampaignAtlas|undefined,actorIds:string[],sceneIds:string[]):boolean{
  return atlas===undefined||isCampaignAtlas(atlas)&&[...atlas.cities,...atlas.organizations].every(r=>r.npcLinks.every(n=>actorIds.includes(n.actorId))&&r.sceneIds.every(id=>sceneIds.includes(id)))
}
export function pruneAtlas(atlas:CampaignAtlas,actorIds:string[],sceneIds:string[]):CampaignAtlas{
  const next=copyAtlas(atlas)
  for(const r of [...next.cities,...next.organizations]){r.npcLinks=r.npcLinks.filter(n=>actorIds.includes(n.actorId));r.sceneIds=r.sceneIds.filter(id=>sceneIds.includes(id))}
  return next
}
export function publicAtlas(atlas:CampaignAtlas|undefined):PublicAtlas{
  const cities=(atlas?.cities??[]).filter(r=>r.visible&&!r.archived),organizations=(atlas?.organizations??[]).filter(r=>r.visible&&!r.archived)
  const common=(r:AtlasCity|AtlasOrganization)=>({id:r.id,name:r.name,kind:r.kind,summary:r.summary,description:r.description,npcLinks:r.npcLinks.filter(n=>n.visible).map(n=>({publicName:n.publicName,role:n.role}))})
  return {cities:cities.map(c=>({...common(c),population:c.population,organizations:organizations.filter(o=>o.cityIds.includes(c.id)).map(o=>({id:o.id,name:o.name}))})),
    organizations:organizations.map(o=>({...common(o),cities:cities.filter(c=>o.cityIds.includes(c.id)).map(c=>({id:c.id,name:c.name}))}))}
}
