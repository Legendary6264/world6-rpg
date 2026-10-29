import {suggestPlaytestReactions} from './scenePlayReactions'
import type {PlaytestReaction} from './scenePlayReactions'
import type {Scene,SceneActor} from './sceneTypes'
import {isDeclaredAction} from './actionDeclarations'
import type {DeclaredAction,DeclarationOptions} from './actionDeclarations'
import {operateSceneObject,operationLabels} from './tabletopInteractions'
import {copySceneState,moveSceneObject,replaceScene} from './scenes'
import {assertEditorObjectBounds} from './sceneEditorBounds'
import {objectRelocatable} from './legacyObjectBehavior'
import {buildSceneAbilityAim} from './sceneAbilityAim'
import type {PerceivedMap} from './scenePerception'
import {mapFrame,publicObject} from './scenePerception'
import type {SceneAbilityVisual} from './sceneAbilityVisuals'
import {resolvePlaytestTrajectory} from './scenePlayTrajectory'
import type {PlaytestTrajectoryOptions} from './scenePlayTrajectory'
import type {SceneTrajectoryHit} from './sceneTrajectory'

// Local visual exercises, never added to heroes' approved ability libraries.
export const playtestAbilities:DeclarationOptions['abilities']=[
 {id:'practice-fire',name:'Огненная сфера',rangeM:24,spatial:{shape:'sphere',radiusM:2.5,includeCaster:false},visualEffect:{familyId:'fire',durationMs:2800}},
 {id:'practice-water',name:'Водяной поток',rangeM:24,spatial:{shape:'beam',lengthM:12,radiusM:.65,includeCaster:false},visualEffect:{familyId:'water',durationMs:2500}},
 {id:'practice-electricity',name:'Конус разрядов',rangeM:24,spatial:{shape:'cone',lengthM:8,angleDeg:55,includeCaster:false},visualEffect:{familyId:'electricity',durationMs:2200}},
 {id:'practice-earth',name:'Каменная осыпь',rangeM:24,spatial:{shape:'sphere',radiusM:2,includeCaster:false},visualEffect:{familyId:'earth',durationMs:2800}},
 {id:'practice-heal',name:'Исцеляющий круг',rangeM:24,spatial:{shape:'sphere',radiusM:2,includeCaster:true},visualEffect:{familyId:'healing',durationMs:3200}},
 {id:'practice-shadow',name:'Теневой импульс',rangeM:24,spatial:{shape:'point',includeCaster:false},visualEffect:{familyId:'shadows',durationMs:2800}},
]
export function playtestMap(scene:Scene,actors:SceneActor[],actorId:string,visuals:SceneAbilityVisual[]=[]):PerceivedMap {
 return {frame:mapFrame(scene),title:scene.name,description:'Все предметы этой тестовой сцены раскрыты.',areas:[{id:'practice-visible',x:0,y:0,z:scene.minZ,width:scene.width,depth:scene.depth,height:scene.maxZ-scene.minZ,visible:true}],objects:scene.objects.map(o=>({...publicObject(o),visible:true})),contacts:scene.tokens.map(t=>({id:t.actorId,kind:t.actorId===actorId?'self':'identified',label:actors.find(a=>a.id===t.actorId)?.name??'Герой',signs:'',x:t.x,y:t.y,z:t.z})),visuals}
}
export function playtestOptions(map:PerceivedMap):DeclarationOptions {
 return {frame:map.frame,targets:[...map.objects.map(o=>({id:o.id,label:o.name,kind:'object' as const})),...map.contacts.filter(c=>c.kind!=='self').map(c=>({id:c.id,label:c.label,kind:'contact' as const}))],items:[],abilities:playtestAbilities}
}
export type PlaytestStep={actionIndex:number;action:DeclaredAction;before:Scene;after:Scene;visuals:SceneAbilityVisual[];log:string[];durationMs:number}
export type PlaytestRecording={scene:Scene;steps:PlaytestStep[]}
type PlaytestResult=PlaytestRecording&{visuals:SceneAbilityVisual[];log:string[];reactions:PlaytestReaction[];impacts:{actionIndex:number;abilityName:string;hit:SceneTrajectoryHit}[]}
function evaluatePlaytestActions(scene:Scene,actors:SceneActor[],actorId:string,actions:DeclaredAction[],releaseId:string,reactionKeys:readonly string[],strict:boolean,options:PlaytestTrajectoryOptions):PlaytestResult {
 if(!scene.tokens.some(t=>t.actorId===actorId)||!actions.length||actions.length>20||!actions.every(isDeclaredAction))throw Error('Выбери героя и проверь очередь действий.')
 let state=copySceneState({version:1,activeSceneId:scene.id,scenes:[scene]});const visuals:SceneAbilityVisual[]=[],log:string[]=[],reactions:PlaytestReaction[]=[],impacts:PlaytestResult['impacts']=[],steps:PlaytestStep[]=[],selected=new Set(reactionKeys),used=new Set<string>()
 if(selected.size!==reactionKeys.length)throw Error('Реакция выбрана повторно. Проверь решения мастера.')
 for(const [i,a] of actions.entries()){
  let current=state.scenes[0]
  const before=current,visualStart=visuals.length,logStart=log.length
  const record=()=>{const effects=visuals.slice(visualStart),durationMs=a.kind==='ability'?a.stage==='prepare'?900:Math.max(500,Math.min(10000,effects[0]?.spec.durationMs??1800)):650;steps.push({actionIndex:i,action:structuredClone(a),before,after:state.scenes[0],visuals:effects,log:log.slice(logStart),durationMs})}
  if(a.kind==='interact'){
   if(a.target.kind==='contact'&&a.operation==='inspect'){const id=a.target.id,token=current.tokens.find(t=>t.actorId===id);if(!token)throw Error('Отметка существа больше не доступна.');log.push('Осмотр: '+(actors.find(actor=>actor.id===id)?.name??'Существо')+'. Новые сведения задаёт мастер.');record();continue}
   if(a.target.kind!=='object')throw Error('Для взаимодействия выбери предмет на сцене.')
   const objectId=a.target.id,object=current.objects.find(o=>o.id===objectId);if(!object)throw Error('Предмет больше не существует.')
   if(a.operation==='inspect'){log.push('Осмотр: '+object.name+'. Новые сведения задаёт мастер.');record();continue}
   if(a.operation==='take')throw Error('Передачу предмета в инвентарь нужно оформить в кампании.')
   if(a.operation==='relocate'){
    if(!objectRelocatable(object)||!a.destination)throw Error('Этот предмет нельзя передвинуть.')
    const moved={...object,...a.destination};assertEditorObjectBounds(current,[moved]);state=moveSceneObject(state,current.id,moved)
   }else state=replaceScene(state,{...current,objects:current.objects.map(o=>o.id===object.id?operateSceneObject(o,a.operation as Parameters<typeof operateSceneObject>[1]):o)})
   log.push(object.name+': '+(a.operation==='relocate'?'перемещение':operationLabels[a.operation]))
  }else if(a.kind==='ability'){
   const ability=playtestAbilities.find(v=>v.id===a.abilityId);if(!ability)throw Error('Неизвестная проба способности.')
   const map=playtestMap(current,actors,actorId),self=map.contacts.find(c=>c.kind==='self')!
   const requestedAim=buildSceneAbilityAim(map,a.stage==='prepare'?{...ability,spatial:undefined,rangeM:0}:ability,a.stage==='prepare'?{kind:'self'}:a.target)
   if(!requestedAim||!requestedAim.valid)throw Error(requestedAim?.message??'Выбери точку для способности.')
   const aim=a.stage==='release'?resolvePlaytestTrajectory(current,requestedAim,ability.id,options):requestedAim
   visuals.push({...aim.visual,id:releaseId+'-'+i,start:{x:self.x,y:self.y,z:self.z!},phase:a.stage==='prepare'?'preparation':'sequence'})
   log.push(ability.name+': '+(a.stage==='prepare'?'подготовка':'визуальный выпуск'))
   if(aim.obstruction){impacts.push({actionIndex:i,abilityName:ability.name,hit:aim.obstruction});log.push('Столкновение: '+ability.name+' · '+aim.obstruction.name+' · '+aim.obstruction.distanceM.toFixed(2)+' м')}
   if(a.stage==='release'){
    const choices=suggestPlaytestReactions(current,aim,ability.id,i,options);reactions.push(...choices)
    for(const choice of choices)if(selected.has(choice.key)){
     used.add(choice.key);current=state.scenes[0];state=replaceScene(state,{...current,objects:current.objects.map(o=>o.id===choice.objectId?operateSceneObject(o,choice.operation):o)})
     log.push('Реакция окружения: '+choice.name+' · '+operationLabels[choice.operation])
    }
   }
  }else throw Error('В этой пробе используются способности и взаимодействия с предметами.')
  record()
 }
 if(strict&&reactionKeys.some(key=>!used.has(key)))throw Error('Реакция больше не соответствует плану. Проверь область, предмет и решение мастера.')
 return {scene:state.scenes[0],visuals,log,reactions,impacts,steps}
}

export function previewPlaytestActions(scene:Scene,actors:SceneActor[],actorId:string,actions:DeclaredAction[],reactionKeys:readonly string[]=[],options:PlaytestTrajectoryOptions={}):PlaytestResult {return evaluatePlaytestActions(scene,actors,actorId,actions,'preview',reactionKeys,false,options)}
export function applyPlaytestActions(scene:Scene,actors:SceneActor[],actorId:string,actions:DeclaredAction[],releaseId:string,reactionKeys:readonly string[]=[],options:PlaytestTrajectoryOptions={}):PlaytestResult {return evaluatePlaytestActions(scene,actors,actorId,actions,releaseId,reactionKeys,true,options)}
