import {actionTarget} from './actionDeclarations'
import {itemPlanIssues} from './plannedInteractions'
import type {DeclaredAction,DeclarationOptions,DeclarationTarget} from './actionDeclarations'
import type {ScenePosition} from './sceneTypes'

export type DeclarationIssue={index:number;code:'inventory'|'scene'|'coordinates'|'target'|'item'|'ability'|'cast'|'duplicate-cast';status:400|409;message:string}
export function pointInDeclarationFrame(point:ScenePosition|undefined,frame:DeclarationOptions['frame']):boolean{
 return !!frame&&!!point&&[point.x,point.y,point.z].every(Number.isFinite)&&point.x>=0&&point.x<=frame.width&&point.y>=0&&point.y<=frame.depth&&point.z>=frame.minZ&&point.z<=frame.maxZ
}
// Only the information already available to the declaring hero is checked here.
// Reach, hidden obstacles, effects and personal time remain decisions of the executor.
export function reviewDeclaration(actions:DeclaredAction[],options:DeclarationOptions):DeclarationIssue[]{
 const issues:DeclarationIssue[]=itemPlanIssues(options.items,actions).map(issue=>({...issue,code:'inventory',status:409})),casts=new Set<string>()
 actions.forEach((action,index)=>{
  const add=(code:DeclarationIssue['code'],message:string,status:400|409=409)=>issues.push({index,code,message,status}),focus=actionTarget(action)
  const needsFrame=action.kind==='move'||focus&&'point' in focus
  if(needsFrame&&!options.frame)add('scene','Мастер должен открыть герою схему сцены для выбора координат.')
  else if(action.kind==='move'&&!action.route.every(point=>pointInDeclarationFrame(point,options.frame))||focus&&'point' in focus&&options.frame&&!pointInDeclarationFrame(focus.point,options.frame))add('coordinates','Проверь координаты в доступной схеме сцены.',400)
  if(action.kind==='interact'&&action.operation==='relocate'&&!pointInDeclarationFrame(action.destination,options.frame))add('coordinates','Укажи новое положение объекта в доступной схеме сцены.',400)
  if(focus&&(focus.kind==='contact'||focus.kind==='object')&&!options.targets.some(target=>target.kind===focus.kind&&target.id===focus.id))add('target','Выбранная отметка больше не доступна герою. Проверь цель.')
  if(action.kind==='item'&&!issues.some(issue=>issue.index===index&&issue.code==='inventory')&&!options.items.some(item=>item.id===action.itemId&&item.quantity>=action.quantity))add('item','Проверь предмет и количество в инвентаре героя.')
  if(action.kind==='ability'){
   const ability=options.abilities.find(ability=>ability.id===action.abilityId)
   if(!ability||action.stage==='prepare'&&ability.canPrepare===false)add('ability','Выбери утверждённую способность героя или существующий заряд для выпуска.')
   if(action.castId){
    if(!options.casts?.some(cast=>cast.id===action.castId&&cast.abilityId===action.abilityId))add('cast','Выбранный собственный заряд больше не доступен. Проверь заряд и отправь исправленное заявление.')
    if(casts.has(action.castId))add('duplicate-cast','Один заряд нельзя выпустить дважды в одной очереди.',400)
    casts.add(action.castId)
   }
  }
 })
 return issues.sort((a,b)=>a.index-b.index)
}
export function retargetDeclaration(action:DeclaredAction,target:DeclarationTarget):DeclaredAction|null{
 const focus=actionTarget(action)
 if(!focus||focus.kind!==target.kind||!['contact','object'].includes(target.kind))return null
 if(action.kind==='wait'&&action.listening)return {...action,listening:{...action.listening,target:{...target}}}
 return 'target' in action?{...action,target:{...target}}:null
}
