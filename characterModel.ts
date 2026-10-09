import { applyRace } from './characterPresets'
import { defaultCreation, developmentError, copyCreation, isCreation, standardFormulas, type CreationState } from './creationRules'
import { evaluatedParameters } from './rpgParameters'
import { copyRpg, isRpg } from './rpgSchema'
import type { RpgState } from './rpgTypes'
import { cloneBody, isBodyState } from './characterBody'
import type { BodyState } from './characterBody'
import {
  createDefaultStatistics, isCharacterStatistics, normalizeStatistics,
} from './characterStatistics'
import type { CharacterStatistics } from './characterStatistics'
import { emptyProfile, isCharacterProfile, copyProfile } from './characterProfile'
import type { CharacterProfile } from './characterProfile'
import { isJournal, isKnownEffects } from './characterKnowledge'
import type { JournalEntry, KnownEffect } from './characterKnowledge'

import { attributeFields, legacyAttributeKeys, defaultAttributes } from './attributes'
export { attributeFields } from './attributes'
export const resourceFields = [
  { key: 'health', label: 'Здоровье' },
  { key: 'mana', label: 'Мана' },
  { key: 'shadow', label: 'Тень' },
  { key: 'stamina', label: 'Выносливость' },
] as const

export type AttributeKey = (typeof attributeFields)[number]['key']
export type ResourceKey = (typeof resourceFields)[number]['key']
export type ResourceValue = { current: string; maximum: string }
// В прежних сохранениях было три ресурса, поэтому четвёртый пока необязателен.
export type Resources = Record<Exclude<ResourceKey, 'stamina'>, ResourceValue> & {
  stamina?: ResourceValue
}
export type ReadyResources = Record<ResourceKey, ResourceValue>
export type ResourceDirection = 'decrease' | 'increase'

export type CharacterDraft = {
  name: string
  attributes: Record<AttributeKey, string>
  // Прежние сохранения без ресурсов остаются допустимыми.
  resources?: Resources
  statistics?: Partial<CharacterStatistics>
  profile?: CharacterProfile
  journal?: JournalEntry[]
  rpg?: RpgState
  body?: BodyState
  creation?: CreationState
  knownEffects?: KnownEffect[]
}

// В интерфейсе ресурсы всегда есть, даже если их не было в старом сохранении.
export type ReadyCharacterDraft = CharacterDraft & {
  resources: ReadyResources
  statistics: CharacterStatistics
  profile: CharacterProfile
  journal: JournalEntry[]
  rpg: RpgState
  body: BodyState
  creation: CreationState
  knownEffects: KnownEffect[]
}
export type SavedCharacter = CharacterDraft & { id: string }

export type ResourceActionResult =
  | { ok: true; resource: ResourceValue; changed: boolean; message: string }
  | { ok: false; message: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isValidAttribute(value: string): boolean {
  const number = Number(value)
  return value.trim() !== '' && Number.isSafeInteger(number) && number >= 0
}

export function isValidResource(resource: ResourceValue): boolean {
  const valid = (v: string) => v.trim() !== '' && /^\d+(?:\.\d+)?$/.test(v) && Number.isFinite(Number(v)) && Number(v) <= 1e12
  return valid(resource.current) &&
    valid(resource.maximum) &&
    Number(resource.current) <= Number(resource.maximum)
}

export function isValidAmount(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0 && Number(value) <= 1e12
}

function isResources(value: unknown, allowEffectiveMaximum = false): value is Resources {
  if (!isRecord(value)) return false

  return resourceFields.every(field => {
    const resource = value[field.key]
    if (field.key === 'stamina' && resource === undefined) return true
    return isRecord(resource) &&
      typeof resource.current === 'string' &&
      typeof resource.maximum === 'string' &&
      (allowEffectiveMaximum ? isValidResource({current:'0',maximum:resource.current}) && isValidResource({current:'0',maximum:resource.maximum}) : isValidResource({ current: resource.current, maximum: resource.maximum }))
  })
}

export function isCharacterDraft(value: unknown): value is CharacterDraft {
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string' || value.name.trim().length === 0 ||
      value.name.length > 40 || !isRecord(value.attributes)) return false

  const attributes = value.attributes
  const valid = attributeFields.every(field => {
    const attribute = attributes[field.key]
    return attribute === undefined && !legacyAttributeKeys.some(k=>k===field.key) || typeof attribute === 'string' && isValidAttribute(attribute)
  }) && (value.resources === undefined || isResources(value.resources, value.rpg !== undefined)) &&
    (value.statistics === undefined || isCharacterStatistics(value.statistics)) &&
    (value.profile === undefined || isCharacterProfile(value.profile)) &&
    (value.journal === undefined || isJournal(value.journal)) &&
    (value.knownEffects === undefined || isKnownEffects(value.knownEffects)) &&
    (value.creation === undefined || isCreation(value.creation)) &&
    (value.body === undefined || isBodyState(value.body)) &&
    (value.rpg === undefined || isRpg(value.rpg))
  if(!valid)return false
  if(value.creation!==undefined&&developmentError(normalizeCharacterDraft(value as CharacterDraft)))return false
  if(value.rpg===undefined)return true
  try{evaluatedParameters(normalizeCharacterDraft(value as CharacterDraft),0);return true}catch{return false}
}

export function isSavedCharacter(value: unknown): value is SavedCharacter {
  return isRecord(value) && typeof value.id === 'string' &&
    value.id.trim().length > 0 && isCharacterDraft(value)
}

export function createDefaultResources(): ReadyResources {
  // Это незаполненный лист, а не утверждённые стартовые значения по лору.
  return {
    health: { current: '0', maximum: '0' },
    mana: { current: '0', maximum: '0' },
    shadow: { current: '0', maximum: '0' },
    stamina: { current: '0', maximum: '0' },
  }
}

export function createDefaultCharacter(): ReadyCharacterDraft {
  const character = applyRace({
    name: '',
    attributes: defaultAttributes(),
    resources: createDefaultResources(),
    statistics: createDefaultStatistics(),
    profile: { ...emptyProfile(), rank: 'spellcaster' },
    journal: [],
    creation: defaultCreation(),
    rpg: { ...copyRpg(), formulas: standardFormulas() },
    body: cloneBody(),
    knownEffects: [],
  }, 'human', 'base', true)
  const parameters=evaluatedParameters(character,0)
  for(const [key,max] of [['mana',parameters.maximumMana],['shadow',parameters.maximumShadow],['stamina',parameters.maximumStamina]] as const)character.resources[key]={current:max,maximum:max}
  return character
}

export function normalizeCharacterDraft(draft: CharacterDraft): ReadyCharacterDraft {
  const resources = draft.resources ?? createDefaultResources()
  const profile=copyProfile({...emptyProfile(),...draft.profile,energy:draft.profile?.energy??(Number(resources.shadow.maximum)>0&&Number(resources.mana.maximum)===0?'shadow':'mana')})
  const rpg=copyRpg(draft.rpg)
  if(rpg.physiology.mode==='mana'||rpg.physiology.mode==='shadow')rpg.physiology.mode=profile.energy??'mana'
  // Каждый лист получает собственные вложенные объекты.
  return {
    ...draft,
    creation: copyCreation(draft.creation),
    attributes: { ...defaultAttributes(), ...draft.attributes },
    resources: {
      ...resources,
      health: { current: '0', maximum: '0' },
      mana: (profile.energy)==='mana' ? { ...resources.mana } : {current:'0',maximum:'0'},
      shadow: (profile.energy)==='shadow' ? { ...resources.shadow } : {current:'0',maximum:'0'},
      stamina: { ...(resources.stamina ?? { current: '0', maximum: '0' }) },
    },
    statistics: normalizeStatistics(draft.statistics),
    // Старому герою ступень и стихия автоматически не назначаются.
    profile,
    journal: (draft.journal ?? []).map(entry => ({ ...entry })),
    rpg,
    body: cloneBody(draft.body),
    knownEffects: (draft.knownEffects ?? []).map(effect => ({ ...effect })),
  }
}

export function calculateResourceAction(
  key: ResourceKey,
  resource: ResourceValue,
  amountValue: string,
  direction: ResourceDirection,
): ResourceActionResult {
  if (!isValidResource(resource)) {
    return { ok: false, message: 'Проверь текущее значение и максимум ресурса.' }
  }
  if (!isValidAmount(amountValue)) {
    return { ok: false, message: 'Введи положительное количество.' }
  }

  const current = Number(resource.current)
  const maximum = Number(resource.maximum)
  const amount = Number(amountValue)
  let next: number
  let message: string

  if (direction === 'decrease') {
    if (key !== 'health' && amount > current) {
      return {
        ok: false,
        message: 'Не хватает ' +
          (key === 'mana' ? 'Маны' : key === 'shadow' ? 'Тени' : 'Выносливости') +
          ': доступно ' + current + ', требуется ' + amount + '.',
      }
    }
    next = Math.max(0, current - amount)
    const spent = current - next
    message = spent === 0 ? 'Здоровье уже на нуле.' :
      (key === 'health' ? 'Здоровье уменьшено на ' : 'Потрачено: ') + spent + '.'
  } else {
    // Сначала ограничиваем прибавку: сумма не выйдет за безопасный максимум.
    const restored = Math.min(amount, maximum - current)
    next = current + restored
    message = restored === 0 ? 'Уже достигнут максимум.' :
      'Восстановлено: ' + restored + '.'
  }

  return {
    ok: true,
    resource: { ...resource, current: String(Math.round(next * 1e6) / 1e6) },
    changed: next !== current,
    message,
  }
}
