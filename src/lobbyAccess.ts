export const lobbyPermissions = ['scenes', 'npcs', 'approveHeroes', 'economy', 'rounds', 'controlDelegated', 'rollback', 'viewSecrets'] as const
export type LobbyPermission = typeof lobbyPermissions[number]
export const lobbyPermissionLabels: Record<LobbyPermission, string> = {
  scenes: 'Управлять сценами', npcs: 'Управлять NPC', approveHeroes: 'Утверждать героев',
  economy: 'Управлять экономикой', rounds: 'Вести раунды', controlDelegated: 'Управлять переданными героями',
  rollback: 'Откатывать и восстанавливать кампанию', viewSecrets: 'Видеть секретные материалы',
}
export function validLobbyPermissions(value: unknown): value is LobbyPermission[] {
  return Array.isArray(value) && value.length <= lobbyPermissions.length &&
    value.every(p => lobbyPermissions.includes(p)) && new Set(value).size === value.length
}
export function hasLobbyPermission(role: string, permissions: readonly string[] | undefined, permission: LobbyPermission): boolean {
  return role === 'GM' || role === 'ASSISTANT' && !!permissions?.includes(permission)
}
// The existing general editor can change every part of the world. Only a fully
// authorized assistant may use it; narrower grants use separate server routes.
export function canEditWholeCampaign(role: string, permissions?: readonly string[]): boolean {
  return lobbyPermissions.every(p => hasLobbyPermission(role, permissions, p))
}
export type CharacterControl = { delegated: boolean; controllerId: string; delegatedAt?: string }
export type ControlEvent = { id: string; action: 'delegate' | 'return' | 'assign' | 'fallback' | 'transfer-chief' | 'restore-reset';
  actorId: string; actor: string; controllerId: string; createdAt: string }
