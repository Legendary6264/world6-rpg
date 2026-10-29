export type SceneObjectKind = 'wall' | 'door' | 'tree' | 'rock' | 'crate' | 'platform' | 'lamp' | 'water'
export type ScenePosition = { x: number; y: number; z: number }
export type SceneObject = ScenePosition & {
  id: string; name: string; kind: SceneObjectKind
  width: number; depth: number; height: number
  blocksMovement: boolean; blocksSight: boolean; canSupport: boolean; open: boolean
  artwork?: string
  asset?: string; facing?: number; active?: boolean; locked?: boolean
}
export type SceneSupport = { kind: 'ground' } | { kind: 'air' } | { kind: 'object'; objectId: string }
export type SceneToken = ScenePosition & { actorId: string; diameter: number; support: SceneSupport }
export type Scene = {
  id: string; name: string; description: string; view: 'top' | 'side'
  roundDurationSeconds?: number
  width: number; depth: number; groundZ: number; minZ: number; maxZ: number
  palette: 'forest' | 'stone' | 'neon'; background?: string; backgroundTileSizeM?: number
  environment?: 'surface' | 'underground'
  objects: SceneObject[]; tokens: SceneToken[]
}
export type SceneState = { version: 1; activeSceneId: string | null; scenes: Scene[] }
export type SceneActor = { id: string; name: string; profile: { portrait?: string }; rpg?: { casts: import('./rpgTypes').Cast[] } }
