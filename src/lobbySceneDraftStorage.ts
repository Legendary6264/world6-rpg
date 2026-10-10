import { isSceneState } from './scenes'
import type { SceneActor, SceneState } from './sceneTypes'
import { assertCampaignSize } from './campaignLimits'
export type SceneDraft = { accountId: string; lobbyId: string; revision: number; scenes: SceneState; actors: SceneActor[] }
const memory = new Map<string, SceneDraft>()
const key = (accountId: string, lobbyId: string) => 'world6.scene-draft.v1.' + JSON.stringify([accountId, lobbyId])
export function readSceneDraft(accountId: string, lobbyId: string): SceneDraft | null {
  try {
    const cached = memory.get(key(accountId, lobbyId)); if (cached) return structuredClone(cached)
    const value = JSON.parse(window.localStorage.getItem(key(accountId, lobbyId)) ?? 'null')
    if (!value || value.accountId !== accountId || value.lobbyId !== lobbyId || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !isSceneState(value.scenes) || !Array.isArray(value.actors) || value.actors.length > 200 || !value.actors.every((a: SceneActor) =>
        a && typeof a.id === 'string' && typeof a.name === 'string' && a.profile && (a.profile.portrait === undefined || typeof a.profile.portrait === 'string'))) return null
    assertCampaignSize(value); return value
  } catch { return null }
}
export function writeSceneDraft(draft: SceneDraft): boolean {
  memory.set(key(draft.accountId, draft.lobbyId), structuredClone(draft))
  try { window.localStorage.setItem(key(draft.accountId, draft.lobbyId), JSON.stringify(draft)); return true } catch { return false }
}
