import AnatomySilhouette from './AnatomySilhouette'
import type { BodyState } from './characterBody'
import { structurePoint } from './anatomyModel'
import type { AnatomyStructure } from './anatomyModel'
import { hasRealisticAnatomy, hasRealisticRegion } from './anatomyArtwork'
import AnatomyPlate from './AnatomyPlate'
import { StructureGlyph } from './AnatomyAtlas'

export default function StructureIllustration({body,structure:s}:{body:BodyState;structure:AnatomyStructure}){
 const form=body.anatomy?.form??'humanoid'
 if(!hasRealisticRegion(s.region)&&!['leftWing','rightWing','tail','leftHorn','rightHorn'].includes(s.region))return <svg viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true"><StructureGlyph s={s} fill="#c4ae92" stroke="#d7b77d"/></svg>
 const b=structurePoint(form,s,0,body.anatomy?.wingStyle??'membrane'),rx=Math.max(14,b.rx*1.65),ry=Math.max(14,b.ry*1.65),size=Math.max(rx,ry)*2
 return <svg viewBox={`${b.x-size/2} ${b.y-size/2} ${size} ${size}`} role="img" aria-label={'Анатомический фрагмент: '+s.name} className="w6-realistic-preview">
  {(form==='humanoid'||form==='winged')&&<AnatomySilhouette wingStyle={body.anatomy?.wingStyle} form={form} layer={s.kind} parts={Object.keys(body.parts).filter(r=>body.parts[r].present)} featuresOnly/>}
  {hasRealisticAnatomy(form)&&<AnatomyPlate form={form} kind={s.kind}/>}
  {(form==='quadruped'||form==='bird')&&s.kind!=='skin'&&<AnatomySilhouette form={form} layer={s.kind}/>}
  <path d={`M${b.x-2} ${b.y}h4m-2-2v4`} stroke="#ead3a0" strokeWidth={.7}/>
 </svg>
}
