import type {RenderEntity} from './scene3dModel'
import type {ModelMesh} from './scene3dMeshes'
import {populateBasicProps} from './scene3dBasicProps.ts'
import {populateBasicStructure} from './scene3dBasicStructure.ts'

// Base objects share the same states and pivots in both quality settings.
// Catalog assets keep their dedicated models in populateTabletopEntity.
export function populateCraftedEntity(e:RenderEntity,mesh:ModelMesh,low=false):boolean {
 if(e.geometry.asset)return false
 return populateBasicProps(e,mesh,low)||populateBasicStructure(e,mesh,low)
}
