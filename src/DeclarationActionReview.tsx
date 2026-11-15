import {actionTarget} from './actionDeclarations'
import {retargetDeclaration} from './declarationReview'
import type {DeclaredAction,DeclarationOptions} from './actionDeclarations'
import type {DeclarationIssue} from './declarationReview'

export default function DeclarationActionReview({action,index,options,issues,onChange}:{action:DeclaredAction;index:number;options:DeclarationOptions|null;issues:DeclarationIssue[];onChange:(action:DeclaredAction)=>void}){
 if(!issues.length)return null
 const focus=actionTarget(action),targetIssue=issues.some(issue=>issue.code==='target'),castIssue=issues.some(issue=>issue.code==='cast'||issue.code==='duplicate-cast')
 const targets=options?.targets.filter(target=>target.kind===focus?.kind)??[],charges=action.kind==='ability'?options?.casts?.filter(cast=>cast.abilityId===action.abilityId)??[]:[]
 return <section aria-label={'Проверка действия '+(index+1)}>
  {issues.map(issue=><p role="alert" key={issue.code}>Действие {index+1}: {issue.message}</p>)}
  {targetIssue&&focus&&(focus.kind==='contact'||focus.kind==='object')&&<label className="w6-field"><span>Новая цель действия {index+1}</span><select aria-label={'Новая цель действия '+(index+1)} value="" onChange={event=>{
   const target=targets.find(target=>target.id===event.currentTarget.value);if(!target)return
   const next=retargetDeclaration(action,{kind:target.kind,id:target.id});if(next)onChange(next)
  }}><option value="">Выбери доступную отметку</option>{targets.map(target=><option key={target.id} value={target.id}>{target.label}</option>)}</select>
  {!targets.length&&<small>Доступных отметок этого вида нет. Можно убрать действие или дождаться раскрытия сцены мастером.</small>}</label>}
  {castIssue&&action.kind==='ability'&&action.stage==='release'&&<label className="w6-field"><span>Заряд действия {index+1}</span><select aria-label={'Заряд действия '+(index+1)} value={action.castId??''} onChange={event=>{
   const castId=event.currentTarget.value
   if(castId===''){
    const {castId:previous,...next}=action;void previous;onChange(next)
   }else if(charges.some(cast=>cast.id===castId))onChange({...action,castId})
  }}>
   {!charges.some(cast=>cast.id===action.castId)&&<option value={action.castId??''} disabled>Прежний заряд недоступен</option>}
   {options?.abilities.some(ability=>ability.id===action.abilityId)&&<option value="">Выбор заряда поручить мастеру</option>}
   {charges.map(cast=><option key={cast.id} value={cast.id}>{cast.name} · {cast.status==='ready'?'готов':'подготовка продолжается'}</option>)}
  </select></label>}
 </section>
}
