import type { CampaignEconomy } from './campaignEconomy'
import type { CampaignTrade } from './campaignTrade'
import type { CampaignAtlas } from './campaignAtlas'
import type { HitLocation, DetailedAnatomy } from './anatomyModel'
import type { StatisticKey } from './characterStatistics'
import type { AttributeKey } from './characterModel'
import type { BodyPart } from './characterBody'
import type { SceneState } from './sceneTypes'
import type { ScenePerceptions } from './scenePerception'
import type { ActionDeclarations } from './actionDeclarations'
import type { RoundWork } from './roundWork'
import type { ScenePosition } from './sceneTypes'
export type ParameterKey = StatisticKey | 'maximumHealth' | 'maximumMana' | 'maximumShadow' | 'maximumStamina'
export type Cost = { mana: number; shadow: number; stamina: number }
export type ChargePolicy = { maxHoldSeconds: number | null; holdCost: Cost; requireConditions: boolean; refundPreparingPercent: number; refundReadyPercent: number }
export type Modifier = { parameter: ParameterKey; flat: number; percent: number }
export type Formula = { parameter: ParameterKey; mode: 'manual' | 'formula' | 'adjusted'; base: number; weights: Record<AttributeKey, number>; adjustment: number }
// One dose. Values and conditions belong to the item, not its name or artwork.
export type ConsumableEffect = {
  targets: 'self' | 'creature'; rangeM: number; requiresFreeHand: boolean; condition: string
  restore: Cost; healAmount: number; stopBleeding: boolean; cureLabels: string[]
  duration: number; modifiers: Modifier[]; strength: number; stackKey: string; stacking: 'strongest' | 'add' | 'refresh'
}
export type ItemDefinition = {
  consumable?: ConsumableEffect
  artifactCharge?: number; activationCost?: number; activationDuration?: number; activationModifiers?: Modifier[]; artifactLevel?: number; minimumLevel?: number; energyType?: 'mana'|'shadow'; energyReserve?: number; effectDescription?: string; category?: 'weapon'|'armor'|'focus'|'jewelry'|'tool'|'consumable'; shape?: 'sword'|'staff'|'ring'|'shield'|'orb'|'dagger'|'axe'|'bow'|'amulet'|'helmet'|'armor'|'potion'; color?: string; modelLength?:number; modelWidth?:number; modelDepth?:number
  artwork?: string
  name: string; description: string; massKg: number; material: string; thicknessMm: number
  tags: string[]; slot: 'none' | 'left' | 'right' | 'both' | 'body'; layer: number
  covers: string[]; conflictTags: string[]; compatibleTags: string[]
  maximumDurability: number; absorptionJ: number; transmission: number; joulesPerWear: number
  modifiers: Modifier[]; worksBroken: boolean
}
export type ItemTemplate = ItemDefinition & { id: string }
export type InventoryItem = ItemTemplate & { templateId: string; quantity: number; durability: number; equipped: boolean }
export type AbilitySpatial = { includeCaster: boolean } & ({ shape: 'point' } | { shape: 'sphere'; radiusM: number } |
  { shape: 'beam'; lengthM: number; radiusM: number } | { shape: 'cone'; lengthM: number; angleDeg: number })
export type SpatialRelease = { sceneId: string; kind: 'point' | 'area' | 'direction'; point: ScenePosition; actorIds: string[]; inputs: {actorId:string;input:ActionInput}[] }
export type AbilityDefinition = {
  chargePolicy?: ChargePolicy
  spatial?: AbilitySpatial
  minimumLevel?: number; attributeRequirements?: Partial<Record<AttributeKey,number>>; innate?: boolean; raceId?: string; mastery?: number; statusEffects?: string[]
  basisSchoolId?: string
  skillId?: string
  artwork?: string
  schoolId?: string
  damageType?: 'blunt' | 'pierce' | 'cut'
  requiredStructures?: string[]
  flight?: boolean
  strength: number; name: string; description: string; mechanism: 'stone' | 'impact' | 'manual' | 'heal' | 'blood' | 'substitute' | 'effect'
  cost: Cost; upkeep: Cost; preparation: number; duration: number; rangeM: number
  requiresAwake: boolean; hands: 'none' | 'any' | 'left' | 'right' | 'both'; freeHands: boolean
  movement: boolean; speech: boolean; requiredParts: string[]; requiredTags: string[]; condition: string
  massKg: number; speedMs: number; contactCm2: number
  healAmount: number; stopBleeding: boolean; cureLabels: string[]
  bloodMlPerSecond: number; substituteMl: number
  modifiers: Modifier[]; stackKey: string; stacking: 'strongest' | 'add' | 'refresh'
}
export type AbilityTemplate = AbilityDefinition & { id: string }
export type LearnedAbility = AbilityTemplate & { templateId: string; approved: boolean }
export type Physiology = {
  weakModifiers: Modifier[]; impairedModifiers: Modifier[]; criticalModifiers: Modifier[]
  race: string; mode: 'blood' | 'mana' | 'shadow' | 'none'; normalMl: number; currentMl: number
  totalLostMl: number; naturalMlPerSecond: number; weakFraction: number; impairedFraction: number; criticalFraction: number
}
export type ImpactProfile = { thresholdJ: number; joulesPerHp: number; referenceCm2: number }
export type MechanicalEffect = {
  statusEffects?: string[]; id: string; strength: number; name: string; stackKey: string; stacking: AbilityDefinition['stacking']; modifiers: Modifier[]
  expiresAt: number | null; bloodMlPerSecond: number; substituteMl: number
  ownerId: string; castId: string
}
export type ActionInput = {
  hit?: HitLocation
  skipAnatomy?: boolean
  structureId?: string
  region: string; distanceM: number; accessible: boolean; conditionsConfirmed: boolean; canSpeak: boolean
  armorPath: 'covered' | 'gap'; gapConfirmed: boolean
  criticalChance: number; dodgeChance: number; criticalContactFactor: number
  manualLocal: number; manualSystemic: number; bleedingMlPerSecond: number; injury: string; note: string
}
export type Cast = {
  interruption?: { reason: string; phase: 'preparing' | 'ready' | 'maintaining'; refunded: Cost }
  spatialRelease?: SpatialRelease
  id: string; ability: LearnedAbility; targetId: string; input: ActionInput
  roundPreparation?: { workId: string; binding: 'bound' | 'unbound'; paidCost?: Cost }
  status: 'preparing' | 'ready' | 'maintaining' | 'ended' | 'interrupted'
  readyAt: number; endsAt: number | null
}
export type ActionLog = { id: string; seconds: number; text: string; details: string }
export type RpgState = {
  inventory: InventoryItem[]; abilities: LearnedAbility[]; formulas: Formula[]; effects: MechanicalEffect[]
  physiology: Physiology; impact: Record<string, ImpactProfile>; casts: Cast[]; logs: ActionLog[]; dead: boolean
}
export type AnatomyTemplate = { id: string; name: string; parts: Record<string, BodyPart>; anatomy?: DetailedAnatomy; physiology?: Physiology }
export type Campaign = { economy?:CampaignEconomy; trade?:CampaignTrade; atlas?:CampaignAtlas; seconds: number; revision: number; items: ItemTemplate[]; abilities: AbilityTemplate[]; anatomies: AnatomyTemplate[]; logs: ActionLog[]; scenes?: SceneState; perceptions?: ScenePerceptions; declarations?: ActionDeclarations; roundWork?: RoundWork }
