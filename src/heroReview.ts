import { rankOptions, progressionSteps } from './characterProfile'
import { canonicalRaceId, raceTemplates } from './raceCatalog'
import type { Actor } from './rpgEngine'
export type CreationConditions = { version: 1; instructions: string; requireStartingRank: boolean; rankStep: number; allowedRaceIds: string[] }
export const defaultCreationConditions = (): CreationConditions => ({ version: 1, instructions: '', requireStartingRank: false, rankStep: 1, allowedRaceIds: [] })
export function isCreationConditions(v: unknown): v is CreationConditions {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const c = v as CreationConditions
  return c.version === 1 && typeof c.instructions === 'string' && c.instructions.length <= 4000 &&
    // eslint-disable-next-line no-control-regex -- Reject non-printable input while allowing line breaks.
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(c.instructions) && typeof c.requireStartingRank === 'boolean' &&
    Number.isSafeInteger(c.rankStep) && c.rankStep >= 1 && c.rankStep <= 10 && Array.isArray(c.allowedRaceIds) &&
    c.allowedRaceIds.length <= raceTemplates.length && c.allowedRaceIds.every(id => raceTemplates.some(r => r.id === id)) && new Set(c.allowedRaceIds).size === c.allowedRaceIds.length
}
export function creationConditionErrors(actor: Actor, c: CreationConditions, lobby: { rank: string; energy: string }): string[] {
  const errors: string[] = []
  if (lobby.energy !== 'any' && actor.profile.energy !== lobby.energy) errors.push('Тип энергии героя не подходит этому лобби.')
  if (c.requireStartingRank && (actor.profile.rank !== lobby.rank || (actor.profile.rankStep ?? 1) !== c.rankStep))
    errors.push('Для создания нужен ранг «' + (rankOptions.find(r => r.key === lobby.rank)?.label ?? lobby.rank) + '», ступень ' + c.rankStep + '.')
  if (c.allowedRaceIds.length && !c.allowedRaceIds.includes(canonicalRaceId(actor.creation.raceId))) errors.push('Раса героя не входит в выбранный мастером список.')
  return errors
}
export const validStartingStep = (c: CreationConditions, rank: string) => rankOptions.some(r => r.key === rank && c.rankStep <= progressionSteps(r.key))
export type HeroReviewStatus = 'pending' | 'returned' | 'approved'
export const heroReviewLabels: Record<HeroReviewStatus, string> = { pending: 'На рассмотрении', returned: 'Возвращён с замечаниями', approved: 'Принят в кампанию' }
export type HeroReviewSummary = { status: HeroReviewStatus; locked: boolean; note?: string; submittedAt?: string; reviewedAt?: string }
export type HeroSubmission = { revision: number; sourceId?: string; review: HeroReviewSummary; sheet: Actor | null; currentSheet?: Actor;
  changedSinceSubmission: boolean; conditionErrors: string[]; canResubmit: boolean }
