export type SceneObjectKind = 'wall' | 'door' | 'tree' | 'rock' | 'crate' | 'platform' | 'lamp' | 'water'
export type ScenePosition = { x: number; y: number; z: number }
export type SceneObject = ScenePosition & {
  id: string; name: string; kind: SceneObjectKind
  width: number; depth: number; height: number
  blocksMovement: boolean; blocksSight: boolean; canSupport: boolean; open: boolean
}
export type SceneSupport = { kind: 'ground' } | { kind: 'air' } | { kind: 'object'; objectId: string }
export type SceneToken = ScenePosition & { actorId: string; diameter: number; support: SceneSupport }
export type Scene = {
  id: string; name: string; description: string; view: 'top' | 'side'
  width: number; depth: number; groundZ: number; minZ: number; maxZ: number
  palette: 'forest' | 'stone' | 'neon'; background?: string
  objects: SceneObject[]; tokens: SceneToken[]
}
export type SceneState = { version: 1; activeSceneId: string | null; scenes: Scene[] }
export type SceneActor = { id: string; name: string; profile: { portrait?: string } }
