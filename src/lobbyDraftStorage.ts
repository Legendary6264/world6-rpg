import { normalizeCharacterDraft } from './characterModel'
import { isCampaign } from './rpgSchema'
import type { Actor, World } from './rpgEngine'

export type LobbyDraft = {
  accountId: string
  lobbyId: string
  revision: number
  world: World
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>
const memory = new Map<string, LobbyDraft>()
const keyFor = (accountId: string, lobbyId: string) =>
  'world6.lobby-draft.v1.' + JSON.stringify([accountId, lobbyId])

function browserStorage(): DraftStorage {
  return window.localStorage
}

function decode(text: string, accountId: string, lobbyId: string): LobbyDraft | null {
  const value = JSON.parse(text)
  if (value?.version !== 1 || value.accountId !== accountId || value.lobbyId !== lobbyId ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !Array.isArray(value.world?.characters) || value.world.characters.length > 200 ||
      !isCampaign(value.world?.campaign)) return null

  // A draft may contain an empty name or an unfinished formula. Publication validation
  // must not discard such edits when restoring the local editor.
  const characters = value.world.characters.map((actor: Actor) => {
    if (!actor || typeof actor.id !== 'string' || !actor.id || typeof actor.name !== 'string' ||
        !actor.attributes || Object.values(actor.attributes).some(v => typeof v !== 'string')) {
      throw new Error('Некорректный черновик.')
    }
    return { ...normalizeCharacterDraft(actor), id: actor.id }
  })
  if (new Set(characters.map((actor: Actor) => actor.id)).size !== characters.length) return null
  return { accountId, lobbyId, revision: value.revision,
    world: { characters, campaign: value.world.campaign } }
}

export function readLobbyDraft(accountId: string, lobbyId: string,
  storage: () => DraftStorage = browserStorage): LobbyDraft | null {
  const key = keyFor(accountId, lobbyId)
  const cached = memory.get(key)
  if (cached) return structuredClone(cached)
  try {
    const text = storage().getItem(key)
    return text === null ? null : decode(text, accountId, lobbyId)
  } catch {
    return null
  }
}

/** Keeps a memory fallback when browser storage is unavailable or full. */
export function writeLobbyDraft(draft: LobbyDraft,
  storage: () => DraftStorage = browserStorage): boolean {
  const key = keyFor(draft.accountId, draft.lobbyId)
  memory.set(key, structuredClone(draft))
  try {
    storage().setItem(key, JSON.stringify({ version: 1, ...draft }))
    return true
  } catch {
    return false
  }
}
