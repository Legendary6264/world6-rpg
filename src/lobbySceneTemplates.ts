import type { SceneState } from './sceneTypes'
import { isSceneState } from './scenes'
import { createReferenceTavernScene } from './tabletopShowcase'

// Templates contain scenery only. Real campaign heroes are placed by the
// existing, permission-checked game setup; preview actors never enter a lobby.
export function addLobbyTavern(state: SceneState, id: string): SceneState {
  if (state.scenes.length >= 20) throw new Error('В кампании уже 20 сцен. Освободи место перед добавлением таверны.')
  if (!id || state.scenes.some(scene => scene.id === id)) throw new Error('Идентификатор новой сцены уже занят.')
  const scene = createReferenceTavernScene()
  scene.id = id
  scene.objects = scene.objects.map((object, index) => ({ ...object, id: id + ':object-' + index }))
  const result = { ...state, activeSceneId: id, scenes: [...state.scenes, scene] }
  if (!isSceneState(result)) throw new Error('Таверну не удалось добавить: проверь лимиты и параметры сцен.')
  return result
}
