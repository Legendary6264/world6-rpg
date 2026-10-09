import { isArtwork } from './visualMedia'
import { copyMagicStudies, isMagicStudyList } from './magicCatalog'
import type { MagicStudy } from './magicCatalog'
export const rankOptions = [
  { key: 'mortal', label: 'Смертный' },
  { key: 'spellcaster', label: 'Заклинатель' },
  { key: 'elementalist', label: 'Элементалист' },
  { key: 'heavenlyLord', label: 'Небесный лорд' },
  { key: 'heavenlyMonarch', label: 'Небесный монарх' },
] as const

export const energyOptions = [
  { key: 'mana', label: 'Мана' },
  { key: 'shadow', label: 'Тень' },
] as const

export const advancementOptions = [
  { key: 'ascension', label: 'Вознесение' },
  { key: 'rupture', label: 'Разрывник' },
] as const

export function progressionSteps(rank: RankKey): number {
  if (rank === 'mortal') return 3
  if (rank === 'elementalist' || rank === 'spellcaster') return 3
  return 10
}

export const elementOptions = [
  { key: 'vegetation', label: 'Растительность' },
  { key: 'fire', label: 'Огонь' },
  { key: 'earth', label: 'Земля' },
  { key: 'metal', label: 'Металл' },
  { key: 'water', label: 'Вода' },
  { key: 'blood', label: 'Кровь' },
  { key: 'wind', label: 'Ветер' },
] as const

export type RankKey = (typeof rankOptions)[number]['key']
export type ElementKey = (typeof elementOptions)[number]['key']
export type EnergyKey = (typeof energyOptions)[number]['key']
export type AdvancementKey = (typeof advancementOptions)[number]['key']
export type CharacterProfile = {
  portrait?: string
  rank: RankKey | ''
  rankStep?: number
  energy?: EnergyKey
  advancement?: AdvancementKey | ''
  emperor?: boolean
  concept?: string
  element: ElementKey | ''
  origin: string
  biography: string
  magic?: MagicStudy[]
}

export function emptyProfile(): CharacterProfile {
  return { rank: '', rankStep: 1, energy: 'mana', advancement: '', emperor: false, concept: '', element: '', origin: '', biography: '', magic: [] }
}

const legacyRankMap: Record<string, RankKey> = {
  magister: 'heavenlyLord', archmage: 'heavenlyMonarch', ascended: 'heavenlyMonarch', conceptBearer: 'heavenlyMonarch',
}

export function normalizeRank(value: unknown): RankKey | '' {
  if (typeof value !== 'string') return ''
  if (rankOptions.some(option => option.key === value)) return value as RankKey
  return legacyRankMap[value] ?? ''
}

export function isCharacterProfile(value: unknown): value is CharacterProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const profile = value as Record<string, unknown>
  const rank = normalizeRank(profile.rank)
  const step = profile.rankStep
  return (profile.portrait===undefined||isArtwork(profile.portrait)) && (profile.rank === '' || rank !== '') &&
    (step === undefined || typeof step === 'number' && Number.isSafeInteger(step) && step >= 1 && step <= (rank ? progressionSteps(rank) : 10)) &&
    (profile.energy === undefined || energyOptions.some(option => option.key === profile.energy)) &&
    (profile.advancement === undefined || profile.advancement === '' || advancementOptions.some(option => option.key === profile.advancement)) &&
    (profile.emperor === undefined || typeof profile.emperor === 'boolean') &&
    (profile.concept === undefined || typeof profile.concept === 'string' && profile.concept.length <= 160) &&
    (profile.element === '' || elementOptions.some(option => option.key === profile.element)) &&
    typeof profile.origin === 'string' && profile.origin.length <= 200 &&
    typeof profile.biography === 'string' && profile.biography.length <= 4000 &&
    (profile.magic === undefined || isMagicStudyList(profile.magic))
}

export function profileSummary(profile: CharacterProfile): string {
  const rank = rankOptions.find(option => option.key === profile.rank)?.label ?? 'Ступень не задана'
  const step = profile.rankStep ? ' · ступень ' + profile.rankStep : ''
  const energy = energyOptions.find(option => option.key === (profile.energy ?? 'mana'))?.label ?? 'Мана'
  const path = advancementOptions.find(option => option.key === profile.advancement)?.label
  return rank + step + ' · ' + energy + (path ? ' · ' + path : '') + (profile.emperor ? ' · Император' : '')
}

export function copyProfile(profile: CharacterProfile = emptyProfile()): CharacterProfile {
  const rank = normalizeRank(profile.rank)
  const legacyPath = (profile.rank as string) === 'ascended' ? 'ascension' : ''
  const defaultStep = rank ? 1 : undefined
  return {
    ...(profile.portrait!==undefined?{portrait:profile.portrait}:{}), rank,
    rankStep: profile.rankStep ?? defaultStep,
    energy: profile.energy ?? 'mana',
    advancement: profile.advancement ?? legacyPath,
    emperor: profile.emperor ?? false,
    concept: profile.concept ?? '',
    element: profile.element, origin: profile.origin, biography: profile.biography,
    magic: copyMagicStudies(profile.magic),
  }
}
