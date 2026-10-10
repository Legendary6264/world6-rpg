import { isRecord, isSavedCharacter } from './characterModel'
import { portableCharacter, MAX_IMPORT_BYTES } from './characterTransfer'
import { isCampaign, copyCampaign } from './rpgSchema'
import { assertCampaignSize, jsonBytes } from './campaignLimits'
import type { World } from './rpgEngine'
import { sceneReferencesValid } from './scenes'

export type OwnerBinding = { characterId: string; ownerId: string; approved: boolean }
export type BackupOwner = { id: string; displayName: string }
export type LobbyBackupPreview = { world: World; bindings?: OwnerBinding[]; owners: BackupOwner[] }

export function validOwnerBindings(value: unknown, ids: string[]): value is OwnerBinding[] {
  return Array.isArray(value) && value.length === ids.length && value.every(b =>
    isRecord(b) && typeof b.characterId === 'string' && ids.includes(b.characterId) &&
    typeof b.ownerId === 'string' && b.ownerId.length > 0 && b.ownerId.length <= 160 && typeof b.approved === 'boolean') &&
    new Set(value.map(b => b.characterId)).size === ids.length
}

export function parseLobbyBackup(text: string): LobbyBackupPreview {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error('Копия больше 10 МиБ.')
  const value = JSON.parse(text.replace(/^\uFEFF/, ''))
  const legacy = value?.format === 'world6-campaign-backup' && value.version === 1
  if (!legacy && !(value?.format === 'world6-lobby-backup' && value.version === 1)) throw new Error('Нужна копия кампании или лобби Мира 6.')
  const world = legacy ? value : value.world
  if (!Array.isArray(world?.characters) || world.characters.length > 200 ||
      !world.characters.every(isSavedCharacter) || !isCampaign(world.campaign)) throw new Error('Некорректная кампания в копии.')
  const ids = world.characters.map((c: { id: string }) => c.id)
  if (new Set(ids).size !== ids.length) throw new Error('В копии повторяются герои.')
  if (!sceneReferencesValid(world.campaign.scenes,ids)) throw new Error('В копии сцены с неизвестными героями.')
  if (world.characters.some((c: World['characters'][number]) => c.rpg.casts.some(k => ['preparing','ready','maintaining'].includes(k.status) && !ids.includes(k.targetId)))) throw new Error('В копии не хватает целей действующих применений.')
  if (world.characters.some((c: World['characters'][number]) => c.rpg.effects.some(e => e.ownerId && (!ids.includes(e.ownerId) || !world.characters.find((x: World['characters'][number]) => x.id === e.ownerId)?.rpg.casts.some((k: { id: string }) => k.id === e.castId))))) throw new Error('В копии не хватает источников поддерживаемых эффектов.')
  if (!legacy && !validOwnerBindings(value.bindings, ids)) throw new Error('Некорректные владельцы героев в копии.')
  const candidate = { characters: world.characters.map((c: World['characters'][number]) => ({ ...portableCharacter(c), id: c.id })), campaign: copyCampaign(world.campaign) }
  assertCampaignSize(candidate)
  const owners = Array.isArray(value.owners) ? value.owners.filter((o: BackupOwner) => o && typeof o.id === 'string' && typeof o.displayName === 'string').map((o: BackupOwner) => ({ id: o.id, displayName: o.displayName })) : []
  return { world: candidate, ...(legacy ? {} : { bindings: value.bindings.map((b: OwnerBinding) => ({ characterId: b.characterId, ownerId: b.ownerId, approved: b.approved })) }), owners }
}

export function serializeLobbyBackup(world: World, bindings: OwnerBinding[], owners: BackupOwner[]): string {
  if (!isCampaign(world.campaign) || !sceneReferencesValid(world.campaign.scenes,world.characters.map(c=>c.id))) throw new Error('Проверь сцены и персонажей перед экспортом.')
  assertCampaignSize(world)
  if (!validOwnerBindings(bindings, world.characters.map(c => c.id))) throw new Error('Для каждого героя нужен владелец.')
  const value = { format: 'world6-lobby-backup', version: 1, exportedAt: new Date().toISOString(),
    world: { characters: world.characters.map(c => ({ ...portableCharacter(c), id: c.id })), campaign: copyCampaign(world.campaign) },
    bindings: bindings.map(b => ({ characterId: b.characterId, ownerId: b.ownerId, approved: b.approved })),
    owners: owners.filter(o => bindings.some(b => b.ownerId === o.id)).map(o => ({ id: o.id, displayName: o.displayName })) }
  if (jsonBytes(value) > MAX_IMPORT_BYTES) throw new Error('Копия больше 10 МиБ.')
  return JSON.stringify(value)
}
