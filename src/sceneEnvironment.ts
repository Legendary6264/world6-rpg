import type {Scene} from './sceneTypes'

export type SceneEnvironment = 'surface' | 'underground'
type EnvironmentFrame = Pick<Scene, 'id' | 'environment' | 'background'>
export const validSceneEnvironment = (value:unknown):value is SceneEnvironment => value === 'surface' || value === 'underground'

// Legacy examples already have stable scene ids. Palette is deliberately not
// used: a stone village square can still be outside. No hidden objects or
// description text are consulted when displaying a player's disclosed frame.
export function sceneEnvironment(frame:EnvironmentFrame):SceneEnvironment {
 if(validSceneEnvironment(frame.environment))return frame.environment
 return frame.background === 'pixel-gallery' || /(?:^|:)(?:gallery|underground|dungeon)$/.test(frame.id) ? 'underground' : 'surface'
}
export const sceneEnvironmentLabels:Record<SceneEnvironment,string> = {surface:'Поверхность',underground:'Под землёй'}
