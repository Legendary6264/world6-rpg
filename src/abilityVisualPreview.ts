import {masterRenderModel} from './scene3dModel'
import type {AbilityVisualShape,AbilityVisualSpec} from './abilityVisuals'
import type {SceneAbilityVisual} from './sceneAbilityVisuals'
import type {Scene} from './sceneTypes'

export const abilityPreviewPhaseFractions={preparation:.09,release:.24,travel:.475,impact:.745,residue:.92} as const
// A disposable presentation stage. No campaign, game action or approved
// definition is created when inspecting an effect.
export function abilityVisualPreviewModel(spec:AbilityVisualSpec,shape:AbilityVisualShape){
  const scene:Scene={id:'ability-visual-studio',name:'Мастерская эффектов',description:'',view:'top',width:15,depth:11,groundZ:0,minZ:-2,maxZ:8,palette:'stone',environment:'surface',background:'pixel-ground-stone',backgroundTileSizeM:2,objects:[],
    tokens:[{actorId:'preview-source',x:3,y:5.5,z:0,diameter:.8,support:{kind:'ground'},characterModel:'arcanist',facing:90},{actorId:'preview-target',x:10,y:5.5,z:0,diameter:.8,support:{kind:'ground'},characterModel:'vanguard',facing:270}]}
  const visual:SceneAbilityVisual={id:'studio-'+spec.familyId+'-'+shape,spec:{...spec},phase:'sequence',start:{x:3,y:5.5,z:0},end:{x:10,y:5.5,z:0},shape,radius:1.6,coneAngleDeg:42}
  return masterRenderModel(scene,[{id:'preview-source',name:'Источник',profile:{}},{id:'preview-target',name:'Цель',profile:{}}],[visual])
}
