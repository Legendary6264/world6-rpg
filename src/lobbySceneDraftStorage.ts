import { isSceneState, sceneReferencesValid } from './scenes'
import type { SceneActor, SceneState } from './sceneTypes'
import { assertCampaignSize, MAX_CAMPAIGN_BYTES } from './campaignLimits'
export type SceneDraft = { accountId: string; lobbyId: string; revision: number; scenes: SceneState; baseScenes?: SceneState; actors: SceneActor[]; visuals?:Record<string,import('./sceneAbilityVisuals').SceneAbilityVisual[]> }
export type SceneSnapshot = Omit<SceneDraft, 'accountId' | 'lobbyId' | 'baseScenes'>
// The ancestor is local reconciliation metadata, not part of the outbound
// campaign budget. Each snapshot is bounded independently.
export function assertSceneDraftSize(draft: SceneDraft): void {
  const { baseScenes, ...content } = draft
  assertCampaignSize(content)
  if (baseScenes) assertCampaignSize(baseScenes)
}
export function isSceneSnapshot(value: unknown): value is SceneSnapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as SceneSnapshot
  return Number.isSafeInteger(v.revision) && v.revision >= 0 && isSceneState(v.scenes) && Array.isArray(v.actors) && v.actors.length <= 200 &&
    v.actors.every(a => a && typeof a.id === 'string' && typeof a.name === 'string' && a.profile && (a.profile.portrait === undefined || typeof a.profile.portrait === 'string')) &&
    sceneReferencesValid(v.scenes, v.actors.map(a => a.id))
}
const memory = new Map<string, SceneDraft>()
const key = (accountId: string, lobbyId: string) => 'world6.scene-draft.v1.' + JSON.stringify([accountId, lobbyId])
export function readSceneDraft(accountId: string, lobbyId: string): SceneDraft | null {
  try {
    const cached = memory.get(key(accountId, lobbyId)); if (cached) return structuredClone(cached)
    const raw = window.localStorage.getItem(key(accountId, lobbyId)) ?? 'null'
    if (raw.length > 2 * MAX_CAMPAIGN_BYTES) return null
    const value = JSON.parse(raw)
    if (!isSceneSnapshot(value)) return null
    const restored = value as SceneDraft
    if (restored.accountId !== accountId || restored.lobbyId !== lobbyId ||
      (restored.baseScenes !== undefined && !isSceneState(restored.baseScenes))) return null
    assertSceneDraftSize(restored); return restored
  } catch { return null }
}
export function writeSceneDraft(draft: SceneDraft): boolean {
  try { assertSceneDraftSize(draft) } catch { return false }
  memory.set(key(draft.accountId, draft.lobbyId), structuredClone(draft))
  try { window.localStorage.setItem(key(draft.accountId, draft.lobbyId), JSON.stringify(draft)); return true } catch { return false }
}
