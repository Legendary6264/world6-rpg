import type {RenderEntity} from './scene3dModel'
import type {ModelMesh} from './scene3dMeshes'
import {legacyAsset} from './legacyAssets.ts'
import {populateTabletopEntity} from './scene3dTabletop'
import {populateLegacyFlora} from './scene3dLegacyFlora.ts'
import {populateLegacyMinerals} from './scene3dLegacyMinerals.ts'
import {populateLegacyFurniture} from './scene3dLegacyFurniture.ts'
import {populateLegacyStructure} from './scene3dLegacyStructure.ts'

export function populateLegacyEntity(e:RenderEntity,mesh:ModelMesh,low=false):boolean{
 const a=legacyAsset(e.geometry);if(!a)return false
 // Presentation alias only: the original saved kind/artwork, dimensions,
 // state and identity are never migrated into a different object type.
 if(a.native)return populateTabletopEntity({...e,geometry:{...e.geometry,asset:a.native}},mesh,low)
 return populateLegacyFlora(e,mesh,low)||populateLegacyMinerals(e,mesh,low)||populateLegacyFurniture(e,mesh,low)||populateLegacyStructure(e,mesh,low)
}
