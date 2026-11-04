import {masterRenderModel} from './scene3dModel'
import type {AbilityVisualShape,AbilityVisualSpec} from './abilityVisuals'
import type {SceneAbilityVisual} from './sceneAbilityVisuals'
import type {Scene} from './sceneTypes'
import type {AbilitySpatial} from './rpgTypes'
import {isAbilitySpatial} from './abilitySpatial'
import type {SceneRenderModel} from './scene3dModel'
import type {SceneAbilityAim} from './sceneAbilityAim'

export const abilityPreviewPhaseFractions={preparation:.09,release:.24,travel:.475,impact:.745,residue:.92} as const
// A disposable presentation stage. No campaign, game action or approved
// definition is created when inspecting an effect.
export function abilityVisualPreviewModel(spec:AbilityVisualSpec,shape:AbilityVisualShape,spatial?:AbilitySpatial,rangeM?:number){
  const scene:Scene={id:'ability-visual-studio',name:'Мастерская эффектов',description:'',view:'top',width:15,depth:11,groundZ:0,minZ:-2,maxZ:8,palette:'stone',environment:'surface',background:'pixel-ground-stone',backgroundTileSizeM:2,objects:[],
    tokens:[{actorId:'preview-source',x:3,y:5.5,z:0,diameter:.8,support:{kind:'ground'},characterModel:'arcanist',facing:90},{actorId:'preview-target',x:10,y:5.5,z:0,diameter:.8,support:{kind:'ground'},characterModel:'vanguard',facing:270}]}
  const visual:SceneAbilityVisual={id:'studio-'+spec.familyId+'-'+shape,spec:{...spec},phase:'sequence',start:{x:3,y:5.5,z:0},end:{x:10,y:5.5,z:0},shape,radius:1.6,coneAngleDeg:42}
  if(spatial&&isAbilitySpatial(spatial)){
    visual.shape=spatial.shape
    visual.radius='radiusM' in spatial?spatial.radiusM:.25;visual.coneAngleDeg=spatial.shape==='cone'?spatial.angleDeg:45
    const distance='lengthM' in spatial?spatial.lengthM:Number.isFinite(rangeM)?Math.max(0,Math.min(7,rangeM!)):7
    visual.end.x=visual.start.x+distance
    const radius=spatial.shape==='cone'?distance*Math.tan(spatial.angleDeg*Math.PI/360):spatial.shape==='point'?.6:visual.radius
    const left=spatial.shape==='sphere'?visual.end.x-radius:spatial.shape==='beam'?visual.start.x-radius:visual.start.x
    const dx=Math.max(0,1-left),dy=Math.max(0,1+radius-visual.start.y)
    for(const p of [visual.start,visual.end]){p.x+=dx;p.y+=dy}
    Object.assign(scene,{width:Math.max(15,visual.end.x+radius+2),depth:Math.max(11,visual.end.y+radius+2),minZ:-Math.max(2,radius),maxZ:Math.max(8,radius+2)})
    for(const [i,t] of scene.tokens.entries())Object.assign(t,i?visual.end:visual.start)
  }
  return masterRenderModel(scene,[{id:'preview-source',name:'Источник',profile:{}},{id:'preview-target',name:'Цель',profile:{}}],[visual])
}

export function abilityPreviewAim(model:SceneRenderModel,spatial?:AbilitySpatial,rangeM?:number):SceneAbilityAim {
  const visual=model.visuals[0],distanceM=Math.hypot(visual.end.x-visual.start.x,visual.end.y-visual.start.y,visual.end.z-visual.start.z)
  return {sceneId:model.frame.id,casterId:'preview-source',includeCaster:spatial?.includeCaster??false,name:'Проба области',valid:true,distanceM,...(rangeM===undefined?{}:{rangeM}),message:'Подсвечены демонстрационные отметки внутри формы.',visual}
}

export function abilityPreviewFraming(model:SceneRenderModel){
  const v=model.visuals[0]
  if(!v)return {x:model.frame.width/2,y:model.frame.depth/2,z:model.frame.groundZ+.7,scale:1}
  const length=Math.hypot(v.end.x-v.start.x,v.end.y-v.start.y,v.end.z-v.start.z)
  const r=v.shape==='cone'?length*Math.tan(v.coneAngleDeg*Math.PI/360):v.shape==='point'?.6:v.radius
  const minX=Math.min(v.start.x-.6,v.end.x-(v.shape==='sphere'?r:.6)),maxX=Math.max(v.start.x+.6,v.end.x+(v.shape==='sphere'?r:.6))
  return {x:(minX+maxX)/2,y:(v.start.y+v.end.y)/2,z:model.frame.groundZ+.7,scale:Math.max(1,(maxX-minX)/10,r/3)}
}
