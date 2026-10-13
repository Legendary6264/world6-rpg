import {economyReferencesValid} from './generated/campaignEconomy.mjs'
import {tradeReferencesValid} from './generated/campaignTrade.mjs'
import {atlasReferencesValid} from './generated/campaignAtlas.mjs'
import { declarationReferencesValid } from './generated/actionDeclarations.mjs'
import { roundWorkReferencesValid, personalRoundWork } from './generated/roundWork.mjs'
import { isCharacterDraft, normalizeCharacterDraft } from './generated/characterModel.mjs'
import { emptyCampaign, isCampaign } from './generated/rpgSchema.mjs'
import { effectiveActor } from './generated/rpgEngine.mjs'
import { perceivedBody, perceivedCapabilities } from './generated/bodyPerception.mjs'
import { assertCampaignSize } from './generated/campaignLimits.mjs'
import { sceneReferencesValid } from './generated/scenes.mjs'
import { perceptionReferencesValid } from './generated/scenePerception.mjs'
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
export function preserveSceneRoundDurations(current,next){
 for(const scene of next?.scenes??[]){const old=current?.scenes.find(s=>s.id===scene.id)
  if(old?.roundDurationSeconds!==undefined){if(scene.roundDurationSeconds!==undefined&&scene.roundDurationSeconds!==old.roundDurationSeconds)fail(409,'Длительность раунда этой сцены уже задана.');scene.roundDurationSeconds=old.roundDurationSeconds}
 }
}
export function worldSize(value){try{assertCampaignSize(value)}catch(error){fail(413,error.message)}}
export function world(value){if(!value||!Array.isArray(value.characters)||value.characters.length>200||!isCampaign(value.campaign))fail(400,'Некорректная кампания.');const characters=value.characters.map(character);if(new Set(characters.map(c=>c.id)).size!==characters.length)fail(400,'Повторяются ID персонажей.');if(!sceneReferencesValid(value.campaign.scenes,characters.map(c=>c.id)))fail(400,'В сценах есть неизвестные персонажи.');if(!declarationReferencesValid(value.campaign.declarations,value.campaign.scenes,characters.map(c=>c.id)))fail(400,'В заявлениях есть неизвестные герои или сцены.');if(!perceptionReferencesValid(value.campaign.perceptions,value.campaign.scenes,characters.map(c=>c.id)))fail(400,'В раскрытии есть неизвестные персонажи или сцены.');if(!roundWorkReferencesValid(value.campaign.roundWork,value.campaign.scenes,characters.map(c=>c.id)))fail(400,'В переносимой работе есть неизвестные герои или сцены.');if(!atlasReferencesValid(value.campaign.atlas,characters.map(c=>c.id),value.campaign.scenes?.scenes.map(s=>s.id)??[]))fail(400,'В справочнике есть неизвестные NPC или сцены.');if(!tradeReferencesValid(value.campaign.trade,characters.map(c=>c.id),value.campaign.atlas))fail(400,'В имуществе есть недоступные герои, города или организации.');if(!economyReferencesValid(value.campaign.economy,characters.map(c=>c.id),value.campaign.trade))fail(400,'В правилах учёта есть недоступные получатели или валюты.');const candidate={characters,campaign:structuredClone(value.campaign)};worldSize(candidate);return candidate}
export function playerWorld(value,userId,bindings,canReview=false,canSeeAll=false,reviewIds=[]){
 return {revision:value.revision,campaign:{seconds:value.campaign.seconds,...(value.campaign.roundWork?{roundWork:personalRoundWork(value.campaign.roundWork,bindings.filter(b=>b.owner_id===userId||b.control?.controllerId===userId).map(b=>b.character_id))}:{})},characters:value.characters.filter(c=>canSeeAll||canReview&&reviewIds.includes(c.id)||bindings.some(b=>b.character_id===c.id&&(b.owner_id===userId||b.control?.controllerId===userId))).map(c=>{const binding=bindings.find(b=>b.character_id===c.id),owned=binding?.owner_id===userId||binding?.control?.controllerId===userId;const basic={...(binding?.npc?{npc:true}:{}),id:c.id,name:c.name,ownerId:binding?.owner_id,approved:!!binding?.approved,...(binding?.control?{control:binding.control}:{}),...(binding?.review?{review:binding.owner_id===userId||canReview?binding.review:{status:binding.review.status,locked:binding.review.locked}}:{}),profile:{energy:c.profile.energy,rank:c.profile.rank,rankStep:c.profile.rankStep}};if(!owned)return basic;const effective=effectiveActor(c,value.campaign.seconds);return {...basic,resources:Object.fromEntries(['mana','shadow','stamina'].map(k=>[k,effective.resources[k]])),sensations:perceivedBody(c.body),capabilities:perceivedCapabilities(c.body),charges:c.rpg.casts.filter(c=>['preparing','ready'].includes(c.status)).map(c=>({id:c.id,abilityId:c.ability.id,name:c.ability.name,status:c.status,...(c.ability.chargePolicy&&c.roundPreparation?{holding:{remainingSeconds:c.status==='ready'&&c.ability.chargePolicy.maxHoldSeconds!==null?Math.max(0,c.readyAt+c.ability.chargePolicy.maxHoldSeconds-value.campaign.seconds):null,holdCost:{...c.ability.chargePolicy.holdCost}}}:{})})),abilities:c.rpg.abilities.filter(a=>a.approved).map(a=>({id:a.id,name:a.name,description:a.description}))}})}
}
