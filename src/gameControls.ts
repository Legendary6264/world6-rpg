import { actionSummary } from './actionDeclarations'
import type { DeclaredAction, DeclarationOptions, DeclarationTarget, HeroDeclarations } from './actionDeclarations'
import type { ScenePosition } from './sceneTypes'
import type { AbilitySpatial } from './rpgTypes'

export type QuickActionDraft = { mode:'world'|'speak'|'item'|'ability'; movement:'ground'|'air'; text:string; volume:'whisper'|'normal'|'shout'; item:string; ability:string; aim:'self'|'point'|'selected' }
export const emptyQuickAction = ():QuickActionDraft => ({mode:'world',movement:'ground',text:'',volume:'normal',item:'',ability:'',aim:'self'})
export function isQuickActionDraft(v:unknown):v is QuickActionDraft {
  if(!v||typeof v!=='object'||Array.isArray(v))return false
  const q=v as QuickActionDraft
  return ['world','speak','item','ability'].includes(q.mode)&&['ground','air'].includes(q.movement)&&['whisper','normal','shout'].includes(q.volume)&&['self','point','selected'].includes(q.aim)&&
    typeof q.text==='string'&&q.text.length<=4000&&[q.item,q.ability].every(id=>typeof id==='string'&&id.length<=160)
}
export function quickAbilityTarget(spatial:AbilitySpatial|undefined,aim:QuickActionDraft['aim'],point:ScenePosition|null,selected:DeclarationTarget|null):DeclarationTarget|null {
  if(spatial)return aim==='point'&&point?{kind:spatial.shape==='point'?'point':spatial.shape==='sphere'?'area':'direction',point}:null
  return aim==='self'?{kind:'self'}:aim==='selected'&&selected?.kind==='contact'?selected:null
}
export function gameActionLabel(a:DeclaredAction,options:DeclarationOptions|null|undefined):string {
  const name=a.kind==='item'?options?.items.find(i=>i.id===a.itemId)?.name:a.kind==='ability'?options?.abilities.find(b=>b.id===a.abilityId)?.name:null
  return actionSummary(a)+(name?' · '+name:'')
}
export function gameTurnStatus(value:HeroDeclarations|null,hasDraft:boolean):{title:string;hint:string;tone:string} {
  if(!value)return {title:'Подключение к раунду',hint:'Получаем состояние кампании.',tone:'waiting'}
  if(value.paused)return {title:'Пауза',hint:'Ход сохранён. Продолжить игру может мастер.',tone:'waiting'}
  if(!value.collection)return {title:'Подготовка сцены',hint:'Можно составить черновик. Мастер откроет приём ходов.',tone:'waiting'}
  if(value.executed)return {title:'Раунд исполнен',hint:'Результат уже в мире. Ожидаем начало следующего раунда.',tone:'done'}
  if(value.collection.phase!=='open')return {title:value.collection.phase==='cancelled'?'Сбор остановлен':'Мастер исполняет раунд',hint:'Ходы закрыты. Твой черновик сохранён.',tone:'waiting'}
  if(!value.participating)return {title:'Герой вне этого раунда',hint:'Мастер ещё не включил героя в текущий сбор.',tone:'waiting'}
  if(value.entry?.status==='returned')return {title:'Нужно исправить ход',hint:value.entry.note||'Мастер вернул заявление. Проверь очередь и отправь её снова.',tone:'attention'}
  if(value.entry?.status==='submitted')return {title:hasDraft?'Подготовлена правка хода':'Ход отправлен',hint:hasDraft?'Мир изменится после исполнения. Для правки отправь замену заявления.':'Ожидаем остальных участников и решения мастера.',tone:'done'}
  if(!value.canSubmit)return {title:'Ход недоступен',hint:'Заявлять действия может действующий управляющий принятого героя.',tone:'attention'}
  return {title:hasDraft?'Твой ход готовится':'Твой ход',hint:'Составь очередь действий и отправь её мастеру.',tone:'active'}
}
