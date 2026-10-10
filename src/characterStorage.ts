import { isCampaign, emptyCampaign } from './rpgSchema'
import type { Campaign } from './rpgTypes'
import { sceneReferencesValid } from './scenes'
import { perceptionReferencesValid } from './scenePerception'
import {
  isCharacterDraft, isRecord, isSavedCharacter, normalizeCharacterDraft,
} from './characterModel'
import type { CharacterDraft, SavedCharacter } from './characterModel'

export const STORAGE_KEY = 'world6.characters.v2'
export const LEGACY_KEY = 'world6.character.v1'

export type LoadResult = {
  characters: SavedCharacter[]
  campaign?: Campaign
  message: string
  blocked: boolean
}

type StorageReader = { getItem: (key: string) => string | null }
type StorageWriter = { setItem: (key: string, value: string) => void }

function hasUniqueIds(characters: SavedCharacter[]): boolean {
  return new Set(characters.map(character => character.id)).size === characters.length
}

export function blockedLoad(): LoadResult {
  return {
    characters: [],
    message: 'Не удалось прочитать сохранение. Запись заблокирована, ' +
      'чтобы не перезаписать исходные данные.',
    blocked: true,
  }
}

export function readCharacters(storage: StorageReader): LoadResult {
  try {
    const saved = storage.getItem(STORAGE_KEY)
    if (saved !== null) {
      const parsed: unknown = JSON.parse(saved)
      if (!isRecord(parsed) || parsed.version !== 2 ||
          !Array.isArray(parsed.characters)) throw new Error('Неверный формат.')

      const characters: unknown[] = parsed.characters
      if (!characters.every(isSavedCharacter) || !hasUniqueIds(characters)) {
        throw new Error('Неверные персонажи.')
      }
      if (parsed.campaign !== undefined && !isCampaign(parsed.campaign)) throw new Error('Некорректная кампания.')
      if (parsed.campaign !== undefined && !perceptionReferencesValid((parsed.campaign as Campaign).perceptions,(parsed.campaign as Campaign).scenes,(characters as SavedCharacter[]).map(c=>c.id))) throw new Error('В раскрытии сохранения неизвестные персонажи или сцены.');
      if (parsed.campaign !== undefined && !sceneReferencesValid((parsed.campaign as Campaign).scenes,(characters as SavedCharacter[]).map(c=>c.id))) throw new Error('В сохранении сцены с неизвестными персонажами.')
      return { characters, campaign: parsed.campaign === undefined ? emptyCampaign() : structuredClone(parsed.campaign as Campaign), message: 'Список персонажей загружен.', blocked: false }
    }

    const legacy = storage.getItem(LEGACY_KEY)
    if (legacy === null) return { characters: [], message: '', blocked: false }

    const parsed: unknown = JSON.parse(legacy)
    if (!isRecord(parsed) || parsed.version !== 1 || !isCharacterDraft(parsed)) {
      throw new Error('Неверный формат прежнего сохранения.')
    }
    const draft: CharacterDraft = {
      name: parsed.name.trim(),
      attributes: { ...parsed.attributes },
      ...(parsed.resources !== undefined ? { resources: parsed.resources } : {}),
      ...(parsed.statistics !== undefined ? { statistics: { ...parsed.statistics } } : {}),
      ...(parsed.profile !== undefined ? { profile: { ...parsed.profile } } : {}),
      ...(parsed.journal !== undefined ? { journal: parsed.journal } : {}),
      ...(parsed.rpg !== undefined ? {rpg:parsed.rpg}:{}),
      ...(parsed.body !== undefined ? { body: parsed.body } : {}),
      ...(parsed.knownEffects !== undefined ? { knownEffects: parsed.knownEffects } : {}),
    }
    return {
      characters: [{ ...normalizeCharacterDraft(draft), id: 'legacy-character' }],
      message: 'Прежний персонаж загружен. Сохрани его для записи нового формата.',
      blocked: false,
    }
  } catch {
    return blockedLoad()
  }
}

export function writeCharacters(storage: StorageWriter, characters: SavedCharacter[], campaign?: Campaign): void {
  if (!characters.every(isSavedCharacter) || !hasUniqueIds(characters)) {
    throw new Error('Неверный список персонажей.')
  }
  if (campaign !== undefined && !isCampaign(campaign)) throw new Error('Некорректная кампания.')
  if (campaign !== undefined && !perceptionReferencesValid(campaign.perceptions,campaign.scenes,characters.map(c=>c.id))) throw new Error('Проверь индивидуальное раскрытие.');
  if (campaign !== undefined && !sceneReferencesValid(campaign.scenes,characters.map(c=>c.id))) throw new Error('Проверь персонажей на сценах.')
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, characters, ...(campaign ? {campaign}: {}) }))
}
