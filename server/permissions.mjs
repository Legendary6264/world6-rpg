import { fail } from './validation.mjs'

export const siteRoles = ['PLAYER', 'WORLD_EDITOR', 'ADMIN', 'OWNER']
export const privilegedRoles = ['WORLD_EDITOR', 'ADMIN', 'OWNER']
export function requireSecondFactor(user, config) {
  if (config.authMode === 'supabase' && user.aal !== 'aal2') {
    fail(403, 'Подтверди второй фактор в разделе «Аккаунт».')
  }
}
export function requireWorldEditor(user, config) {
  if (!privilegedRoles.includes(user.role)) fail(403, 'Нужны права редактора мира.')
  requireSecondFactor(user, config)
}
export function requireChief(lobby, member, user) {
  if (lobby.owner_id !== user.id || member.role !== 'GM') {
    fail(403, 'Это действие доступно главному ГМ лобби.')
  }
}
export function requireCampaignEditor(member) {
  if (!['GM', 'ASSISTANT'].includes(member.role)) fail(403, 'Нужны права ГМ или помощника этого лобби.')
}
