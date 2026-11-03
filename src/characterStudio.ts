import type {Scene} from './sceneTypes'
import {characterModels} from './characterAppearance'
import {sceneObject} from './scenes'

export const characterStudioId='browser-preview:character-studio-v037'
export const characterStudioActors=characterModels.map(m=>({id:'preview-character-'+m.id,name:m.name,profile:{portrait:'portrait-traveler'}}))
export function createCharacterStudio():Scene {
 const plinths=characterModels.map((m,i)=>({...sceneObject('platform','character-plinth-'+m.id,{x:2+i*2.2,y:3.5,z:0}),name:'Подиум · '+m.name,width:1.35,depth:1.35,height:.14,canSupport:true}))
 return {id:characterStudioId,name:'Мастерская · детальные персонажи',description:'Четыре облика: страж, следопыт, арканист и странник. Выдели героя и нажми F, затем вращай камеру с Alt + ЛКМ. В инспекторе можно поменять облик и направление взгляда. Режим «Без текстур» показывает объёмные детали. Облики не меняют способности или инвентарь.',view:'top',width:11,depth:7,groundZ:0,minZ:-2,maxZ:10,palette:'stone',background:'auto',objects:plinths,
 tokens:characterStudioActors.map((a,i)=>({actorId:a.id,x:plinths[i].x,y:plinths[i].y,z:.14,diameter:.8,support:{kind:'object',objectId:plinths[i].id},characterModel:characterModels[i].id,facing:0}))}
}
