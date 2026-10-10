const memory = new Map<string, unknown>()
export const lobbyFormKey = (kind: string, accountId: string, lobbyId: string, characterId = '') => 'world6.lobby-form.v1.' + JSON.stringify([kind, accountId, lobbyId, characterId])
export function readLobbyForm<T>(key: string, valid: (value: unknown) => value is T): T | null {
  try { const value = memory.has(key) ? memory.get(key) : JSON.parse(window.localStorage.getItem(key) ?? 'null'); return valid(value) ? structuredClone(value) : null } catch { return null }
}
export function writeLobbyForm(key: string, value: unknown): boolean {
  memory.set(key, structuredClone(value))
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}
