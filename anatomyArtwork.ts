import type { AnatomyForm, StructureKind } from './anatomyModel'

export const anatomyArtwork:Record<StructureKind,string>={
 skin:new URL('./assets/anatomy/skin-realistic-v2.png',import.meta.url).href,
 muscle:new URL('./assets/anatomy/tissues-realistic.webp',import.meta.url).href,
 joint:new URL('./assets/anatomy/skeleton-realistic.webp',import.meta.url).href,
 bone:new URL('./assets/anatomy/skeleton-realistic.webp',import.meta.url).href,
 tissue:new URL('./assets/anatomy/tissues-realistic.webp',import.meta.url).href,
 organ:new URL('./assets/anatomy/organs-realistic.webp',import.meta.url).href,
 vessel:new URL('./assets/anatomy/vessels-realistic.webp',import.meta.url).href,
}
export const hasRealisticAnatomy=(form:AnatomyForm)=>['humanoid','winged','quadruped','bird'].includes(form)
export const exteriorArtwork={quadruped:new URL('./assets/anatomy/quadruped-realistic-v2.png',import.meta.url).href,bird:new URL('./assets/anatomy/bird-realistic-v2.png',import.meta.url).href}
export const hasRealisticRegion=(region:string)=>['head','torso','leftArm','rightArm','leftHand','rightHand','leftLeg','rightLeg','leftFoot','rightFoot'].includes(region)
// Both views share one plate. Registration affects artwork only, never game geometry.
export const platePlacement=(back=false)=>({x:back?16:-12,y:20,width:300,height:560})
