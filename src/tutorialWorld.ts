import {createNightCrossing} from './starterCampaign'
import {sceneEditorId} from './sceneEditorId'
import {instantiateItem,worldFingerprint} from './rpgEngine'
import type {World} from './rpgEngine'
import {isCampaign} from './rpgSchema'
import {isCharacterDraft} from './characterModel'
import {placeSceneToken,isSceneState,sceneReferencesValid} from './scenes'
import type {Scene,ScenePosition,SceneSupport} from './sceneTypes'
import {supportAt} from './sceneMovement'
import {emptyPerception,preparePerception,perceptionDraft,perceivedMap} from './scenePerception'
import type {PerceivedMap} from './scenePerception'
import {isDeclaredAction,copyDeclaredAction} from './actionDeclarations'
import type {DeclaredAction,DeclarationCollection} from './actionDeclarations'
import {calculateRound} from './roundExecution'
import type {RoundExecutionInput,RoundExecutionSummary} from './roundExecution'
import type {RuleDecision} from './roundRules'
import {roundRuleRows} from './roundRules'
import type {TutorialPath} from './tutorialProgress'

export type TutorialStatement = {kind:'action';action:DeclaredAction}|{kind:'continue'}
type Snapshot = {world:World;round:number;journal:string[]}
type LastRound = Snapshot & {statement:TutorialStatement;afterFingerprint:string}
export type TutorialSession = {mode:'tutorial';id:string;path:TutorialPath;world:World;heroId:string;guideId:string;revision:number;round:number;
 paused:boolean;statement:TutorialStatement|null;journal:string[];checkpoint:Snapshot|null;lastRound:LastRound|null}
export type TutorialPreview = {sessionId:string;revision:number;fingerprint:string;statement:string;world:World;summary:RoundExecutionSummary;manualResult:string|null}
const copyStatement = (s:TutorialStatement):TutorialStatement => s.kind==='continue'?{kind:'continue'}:{kind:'action',action:copyDeclaredAction(s.action)}
export const tutorialHero = (s:TutorialSession) => s.world.characters.find(a=>a.id===s.heroId)!
export const tutorialScene = (s:TutorialSession):Scene => s.world.campaign.scenes!.scenes.find(scene=>scene.id===s.world.campaign.scenes!.activeSceneId)!
export const tutorialHasWork = (s:TutorialSession) => !!s.world.campaign.roundWork?.entries.some(w=>w.actorId===s.heroId)
export function tutorialMap(s:TutorialSession):PerceivedMap|null {
 const p=s.world.campaign.perceptions?.heroes.find(h=>h.actorId===s.heroId)
 return p?perceivedMap(p,s.world.campaign.scenes,s.world.characters):null
}
function mutate(s:TutorialSession,world:World):TutorialSession {
 if(s.mode!=='tutorial'||!isCampaign(world.campaign)||!world.characters.every(isCharacterDraft)||!isSceneState(world.campaign.scenes)||!sceneReferencesValid(world.campaign.scenes,world.characters.map(a=>a.id)))throw Error('Учебная копия повреждена. Перезапусти площадку.')
 return {...s,world,revision:s.revision+1,statement:null}
}
function disclosure(s:TutorialSession,world:World,guideVisible:boolean):World {
 const scenes=world.campaign.scenes!,scene=scenes.scenes.find(scene=>scene.id===scenes.activeSceneId)!,previous=world.campaign.perceptions?.heroes.find(h=>h.actorId===s.heroId)??emptyPerception(s.heroId)
 const before=perceptionDraft(previous),guide=scene.tokens.find(t=>t.actorId===s.guideId)
 const value={sceneId:scene.id,title:scene.name,description:scene.description,
  areas:[{id:s.id+':visible',x:0,y:0,z:scene.minZ,width:scene.width,depth:scene.depth,height:scene.maxZ-scene.minZ,visible:true}],
  objects:scene.objects.map(o=>({objectId:o.id,visible:true})),
  contacts:guideVisible&&guide?[{actorId:s.guideId,kind:'identified' as const,label:'Учебный проводник',signs:'Раскрыт по решению учебного мастера',showHeight:true,point:{x:guide.x,y:guide.y,z:guide.z},radius:0}]:[]}
 const p=preparePerception({activeSceneId:scene.id,scenes:[...before.scenes.filter(k=>k.sceneId!==scene.id),value]},previous,scenes,world.characters.map(a=>a.id))
 world.campaign.perceptions={version:1,heroes:[p]};return world
}
export function createTutorialSession(path:TutorialPath,namespace='tutorial_'+sceneEditorId()):TutorialSession {
 if(!['player','master'].includes(path))throw Error('Выбери учебный путь.')
 const {world}=createNightCrossing(namespace),guide=world.characters[0],hero={...structuredClone(guide),id:namespace+':hero',name:'Учебный герой'}
 hero.profile.biography='Герой только для учебной копии; в аккаунт и лобби не переносится.';hero.profile.portrait='pixel-watcher'
 hero.rpg.inventory=[instantiateItem(world.campaign.items[0],namespace+':hero-staff')]
 hero.rpg.abilities=[{...structuredClone(world.campaign.abilities[0]),id:namespace+':hero-focus',templateId:world.campaign.abilities[0].id,approved:true}]
 world.characters.push(hero);world.campaign.logs=[]
 // Example notes/atlas/economy are unnecessary here. Never accept a real world as input.
 delete world.campaign.atlas;delete world.campaign.trade;delete world.campaign.economy
 if(path==='master')for(const scene of world.campaign.scenes!.scenes)scene.tokens=scene.tokens.filter(t=>t.actorId!==guide.id)
 world.campaign.scenes=placeSceneToken(world.campaign.scenes!,world.campaign.scenes!.activeSceneId!,{actorId:hero.id,x:5,y:6,z:0,diameter:0.8,support:{kind:'ground'}})
 const session:TutorialSession={mode:'tutorial',id:namespace,path,world,heroId:hero.id,guideId:guide.id,revision:0,round:0,paused:false,statement:null,journal:[],checkpoint:null,lastRound:null}
 disclosure(session,world,path==='player');return session
}
export function discloseTutorialGuide(s:TutorialSession,visible:boolean):TutorialSession {
 if(visible&&!tutorialScene(s).tokens.some(t=>t.actorId===s.guideId))throw Error('Сначала размести проводника в этой сцене.')
 return mutate(s,disclosure(s,structuredClone(s.world),visible))
}
export function placeTutorialGuide(s:TutorialSession,point:ScenePosition):TutorialSession {
 const world=structuredClone(s.world),scene=tutorialScene(s)
 let support:SceneSupport
 try{support=supportAt(scene,point)}catch{support={kind:'air'}}
 world.campaign.scenes=placeSceneToken(world.campaign.scenes!,scene.id,{actorId:s.guideId,...point,diameter:0.8,support})
 return mutate(s,disclosure(s,world,false))
}
export function placeTutorialHero(s:TutorialSession,point:ScenePosition,support:SceneSupport):TutorialSession {
 if(tutorialHasWork(s))throw Error('Сначала закончи переносимую работу или перезапусти учебную копию.')
 const world=structuredClone(s.world),scene=tutorialScene(s)
 world.campaign.scenes=placeSceneToken(world.campaign.scenes!,scene.id,{actorId:s.heroId,...point,diameter:0.8,support})
 return mutate(s,world)
}
export function openTutorialScene(s:TutorialSession,sceneId:string):TutorialSession {
 if(tutorialHasWork(s))throw Error('Сначала закончи переносимую работу в прежней сцене.')
 const world=structuredClone(s.world),scene=world.campaign.scenes!.scenes.find(v=>v.id===sceneId)
 if(!scene)throw Error('Учебная сцена не найдена.')
 world.campaign.scenes!.activeSceneId=sceneId
 world.campaign.scenes=placeSceneToken(world.campaign.scenes!,sceneId,{actorId:s.heroId,x:5,y:scene.view==='side'?2:6,z:scene.groundZ,diameter:0.8,support:{kind:'ground'}})
 return mutate(s,disclosure(s,world,false))
}
export function pauseTutorial(s:TutorialSession,paused:boolean):TutorialSession {return {...s,paused,revision:s.revision+1}}
export function clearTutorialStatement(s:TutorialSession):TutorialSession {return {...s,statement:null,revision:s.revision+1}}
function visibleTarget(s:TutorialSession,a:DeclaredAction):boolean {
 if(!('target' in a))return true
 if(a.target.kind==='self'||a.target.kind==='none')return true
 const map=tutorialMap(s)
 if(a.target.kind==='object'){const targetId=a.target.id;return !!map?.objects.some(o=>o.id===targetId&&o.visible)}
 if(a.target.kind==='contact'){const contactId=a.target.id;return !!map?.contacts.some(c=>c.id===contactId&&c.kind==='identified')}
 return false
}
export function declareTutorial(s:TutorialSession,statement:TutorialStatement):TutorialSession {
 if(s.paused)throw Error('Площадка на паузе. Возобнови её перед заявлением.')
 if(statement.kind==='continue'){if(!tutorialHasWork(s))throw Error('Переносимой работы пока нет.')}
 else{
  const a=statement.action,hero=tutorialHero(s)
  if(tutorialHasWork(s))throw Error('Заяви продолжение прежней работы перед новым действием.')
  if(!isDeclaredAction(a)||!visibleTarget(s,a))throw Error('Выбери допустимое действие и раскрытую цель.')
  if(a.kind==='speak'&&a.target.kind!=='none')throw Error('Учебная реплика записывается без слушателей.')
  if(a.kind==='item'&&(a.target.kind!=='self'||a.operation!=='equip'||!hero.rpg.inventory.some(i=>i.id===a.itemId)||a.quantity!==1))throw Error('В примере можно снарядить собственный посох.')
  if(a.kind==='ability'&&(a.stage==='prepare'?a.target.kind!=='none':a.target.kind!=='self')||a.kind==='ability'&&!hero.rpg.abilities.some(b=>b.id===a.abilityId))throw Error('Подготовь учебную способность без цели либо выпусти на себя.')
  if(a.kind==='interact'&&!['inspect','open','close'].includes(a.operation))throw Error('Выбери осмотр, открытие или закрытие.')
 }
 return {...s,statement:copyStatement(statement),revision:s.revision+1}
}
const ruleInput={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered' as const,gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:'Заранее подтверждённые условия учебного примера'}
export function calculateTutorial(s:TutorialSession):TutorialPreview {
 if(s.paused)throw Error('Пауза сохраняет часы и подготовку. Расчёт пока недоступен.')
 if(!s.statement)throw Error('Сначала заяви действие или продолжение.')
 const world=s.world,hero=tutorialHero(s),scene=tutorialScene(s),seed='tut-'+s.id.slice(-24)+'-r'+s.round+'-v'+s.revision,original=s.statement.kind==='action'?s.statement.action:null
 let action=original?copyDeclaredAction(original):null,manualResult:string|null=null
 // These two categories have a deliberately manual teaching result. Their
 // explicitly chosen one-second reservation uses native wait; no global executor changes.
 if(action?.kind==='speak'){manualResult='Учебная реплика (без слушателей): «'+action.text+'». Никому автоматически не передана.';action={kind:'wait',seconds:1,note:'Учебное ручное решение: реплика без слушателей'}}
 if(action?.kind==='interact'&&action.operation==='inspect'){manualResult='Учебный осмотр: скрытых находок и новых фактов мастер не задавал.';action={kind:'wait',seconds:1,note:'Учебное ручное решение: осмотр'}}
 const collection:DeclarationCollection={id:seed+':collection',sceneId:scene.id,sceneName:scene.name,durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,participantIds:[s.heroId],entries:action?[{actorId:s.heroId,actorName:hero.name,revision:1,status:'submitted',actions:[action],resolved:action.kind==='interact'&&action.target.kind==='object'?[{index:0,objectId:action.target.id}]:[],submittedBy:'tutorial-master',submittedAt:'2026-10-12T00:00:00Z',note:''}]:[],history:[]}
 const work=world.campaign.roundWork??{version:1 as const,entries:[]},continued=s.statement.kind==='continue'?[s.heroId]:[]
 const rules:RuleDecision[]=roundRuleRows(collection,work,continued).map(r=>r.action.kind==='item'?{key:r.key,kind:'item',confirmed:true,operation:'equip'}:{key:r.key,kind:'ability',confirmed:true,binding:'unbound',charge:r.action.kind==='ability'&&r.action.stage==='release'?'cast:'+(hero.rpg.casts.find(c=>c.status==='ready')?.id??'missing'):'',input:{...ruleInput}})
 const input:RoundExecutionInput={timings:action?[{actorId:s.heroId,entryRevision:1,budgetMs:5000,costs:action.kind==='wait'?[]:[{index:0,personalMs:action.kind==='ability'&&action.stage==='prepare'?8000:1000}]}]:[],continuations:continued.map(actorId=>({actorId,mode:'continue',budgetMs:5000})),missingDecisions:[],interactionsConfirmed:true,rules,
  movement:{confirmed:true,bodies:scene.tokens.map(t=>({actorId:t.actorId,heightM:1.7}))}}
 const result=calculateRound(world,collection,input,seed)
 return {sessionId:s.id,revision:s.revision,fingerprint:worldFingerprint(world),statement:JSON.stringify(s.statement),...result,manualResult}
}
export function applyTutorial(s:TutorialSession,p:TutorialPreview):TutorialSession {
 if(s.paused||p.sessionId!==s.id||p.revision!==s.revision||p.fingerprint!==worldFingerprint(s.world)||p.statement!==JSON.stringify(s.statement))throw Error('Учебный расчёт устарел. Рассчитай текущее заявление заново.')
 const fresh=calculateTutorial(s)
 if(worldFingerprint(p.world)!==worldFingerprint(fresh.world)||JSON.stringify(p.summary)!==JSON.stringify(fresh.summary)||p.manualResult!==fresh.manualResult)throw Error('Учебные последствия изменились. Рассчитай заново.')
 const before:LastRound={world:structuredClone(s.world),round:s.round,journal:[...s.journal],statement:copyStatement(s.statement!),afterFingerprint:worldFingerprint(fresh.world)}
 return {...mutate(s,structuredClone(fresh.world)),round:s.round+1,lastRound:before,journal:[...s.journal,'Раунд '+(s.round+1)+': '+(fresh.manualResult??'Применён подтверждённый учебный результат.')].slice(-20)}
}
export function checkpointTutorial(s:TutorialSession):TutorialSession {return {...s,revision:s.revision+1,checkpoint:{world:structuredClone(s.world),round:s.round,journal:[...s.journal]}}}
export function restoreTutorial(s:TutorialSession):TutorialSession {
 if(!s.checkpoint)throw Error('Сначала сохрани учебную точку в памяти.')
 return {...mutate(s,structuredClone(s.checkpoint.world)),round:s.checkpoint.round,journal:[...s.checkpoint.journal],lastRound:null}
}
export function undoTutorial(s:TutorialSession):TutorialSession {
 if(!s.lastRound||s.lastRound.afterFingerprint!==worldFingerprint(s.world))throw Error('После раунда мир изменился. Используй учебную точку или перезапусти площадку.')
 const before=s.lastRound
 return {...mutate(s,structuredClone(before.world)),round:before.round,journal:[...before.journal],lastRound:null,statement:copyStatement(before.statement)}
}
export function tutorialStatementLabel(statement:TutorialStatement|null):string {
 if(!statement)return 'Пока ничего не заявлено.'
 if(statement.kind==='continue')return 'Продолжить переносимую подготовку.'
 const a=statement.action
 if(a.kind==='move'){const p=a.route.at(-1)!;return 'Идти к X='+p.x+', Y='+p.y+', Z='+p.z+' м.'}
 if(a.kind==='wait')return 'Ждать '+a.seconds+' с.'
 if(a.kind==='speak')return 'Своя реплика без слушателей: «'+a.text+'».'
 if(a.kind==='interact')return {inspect:'Осмотреть раскрытую цель.',open:'Открыть раскрытый объект.',close:'Закрыть раскрытый объект.',take:'Взять предмет.',activate:'Активировать объект.',deactivate:'Отключить объект.',ignite:'Зажечь источник света.',extinguish:'Погасить источник света.',lock:'Запереть замок.',unlock:'Отпереть замок.',relocate:'Передвинуть предмет в отмеченную точку.'}[a.operation]
 if(a.kind==='item')return 'Снарядить собственный посох.'
 return a.stage==='prepare'?'Подготовить «Сосредоточение» без цели.':'Отдельно выпустить «Сосредоточение» на себя.'
}
