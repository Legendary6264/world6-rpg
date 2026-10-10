import { isCharacterDraft, normalizeCharacterDraft } from './generated/characterModel.mjs'
import { emptyCampaign, isCampaign } from './generated/rpgSchema.mjs'
import { effectiveActor } from './generated/rpgEngine.mjs'
import { perceivedBody, perceivedCapabilities } from './generated/bodyPerception.mjs'
import { assertCampaignSize } from './generated/campaignLimits.mjs'
export class ApiError extends Error{constructor(status,message){super(message);this.status=status}}
export const fail=(status,message)=>{throw new ApiError(status,message)}
export const id=()=>crypto.randomUUID()
export const now=()=>new Date().toISOString()
export function text(value,max=8000,min=1){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail(400,'Проверь текст: от '+min+' до '+max+' символов.');return value.trim()}
export function integer(value,min=0,max=1e9){if(!Number.isInteger(value)||value<min||value>max)fail(400,'Недопустимое число.');return value}
export function choice(value,options){if(!options.includes(value))fail(400,'Недопустимое значение настройки.');return value}
export function validId(value){return text(value,160).match(/^[a-zA-Z0-9:_-]+$/)?value:fail(400,'Некорректный идентификатор.')}
export function email(value){const v=text(value,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail(400,'Проверь email.');return v}
export const publicUser=u=>({id:u.id,displayName:u.display_name,role:u.role,disabled:!!u.disabled})
export function character(value){if(!value||!isCharacterDraft(value))fail(400,'Некорректный лист персонажа.');validId(value.id);const v={...normalizeCharacterDraft(value),id:value.id};if(Buffer.byteLength(JSON.stringify(v))>2*1024*1024)fail(413,'Персонаж превышает 2 МиБ.');return v}
export const emptyWorld=()=>({characters:[],campaign:emptyCampaign()})
export function worldSize(value){try{assertCampaignSize(value)}catch(error){fail(413,error.message)}}
export function world(value){if(!value||!Array.isArray(value.characters)||value.characters.length>200||!isCampaign(value.campaign))fail(400,'Некорректная кампания.');const characters=value.characters.map(character);if(new Set(characters.map(c=>c.id)).size!==characters.length)fail(400,'Повторяются ID персонажей.');const candidate={characters,campaign:structuredClone(value.campaign)};worldSize(candidate);return candidate}
export function playerWorld(value,userId,bindings){
 return {revision:value.revision,campaign:{seconds:value.campaign.seconds},characters:value.characters.map(c=>{const binding=bindings.find(b=>b.character_id===c.id),owned=binding?.owner_id===userId;const basic={id:c.id,name:c.name,ownerId:binding?.owner_id,approved:!!binding?.approved,profile:{energy:c.profile.energy,rank:c.profile.rank,rankStep:c.profile.rankStep}};if(!owned)return basic;const effective=effectiveActor(c,value.campaign.seconds);return {...basic,resources:Object.fromEntries(['mana','shadow','stamina'].map(k=>[k,effective.resources[k]])),sensations:perceivedBody(c.body),capabilities:perceivedCapabilities(c.body),abilities:c.rpg.abilities.filter(a=>a.approved).map(a=>({id:a.id,name:a.name,description:a.description}))}})}
}
