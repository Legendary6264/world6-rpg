import { useId } from 'react'
import type { StructureKind, AnatomyForm } from './anatomyModel'
import { anatomyArtwork, exteriorArtwork, platePlacement } from './anatomyArtwork'
export default function AnatomyPlate({kind,back=false,form='humanoid'}:{kind:StructureKind;back?:boolean;form?:AnatomyForm}){
 const id=useId().replace(/:/g,''),p=platePlacement(back)
 if(form==='quadruped'||form==='bird')return <g pointerEvents="none" aria-hidden="true" transform={back?'translate(300 0) scale(-1 1)':undefined}><image href={exteriorArtwork[form]} width="300" height="600" opacity={kind==='skin'?1:.12}/></g>
 return <g className="w6-anatomy-plate" pointerEvents="none" aria-hidden="true"><defs><clipPath id={id+'-plate'}><rect x={p.x} y={p.y} width={p.width} height={p.height}/></clipPath></defs><image href={anatomyArtwork[kind]} x={p.x-(back?p.width:0)} y={p.y} width={p.width*2} height={p.height} preserveAspectRatio="none" clipPath={'url(#'+id+'-plate)'}/></g>
}
