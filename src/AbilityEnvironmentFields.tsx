import {MAX_ABILITY_OBJECT_EFFECTS} from './abilityEnvironment'
import {operationLabels} from './tabletopInteractions'
import type {RuleForm,RuleSceneObject} from './roundRuleForms'

export default function AbilityEnvironmentFields({title,objects,value,onChange}:{title:string;objects:RuleSceneObject[];value:RuleForm;onChange:(patch:Partial<RuleForm>)=>void}) {
  const effects=value.environment??[]
  const update=(index:number,patch:Partial<typeof effects[number]>)=>onChange({environment:effects.map((e,i)=>i===index?{...e,...patch}:e)})
  return <fieldset><legend>Последствия для окружения</legend>
    <p>Укажи изменения, разрешённые правилом способности. Центр каждого объекта должен находиться внутри формы в момент выпуска. Визуальный огонь сам по себе ничего не поджигает; преграды и основание проверяет мастер.</p>
    {effects.map((effect,index)=>{const object=objects.find(o=>o.id===effect.objectId),label=title+' · '+(index+1);return <fieldset key={index}><legend>Объект {index+1}</legend>
      <label className="w6-field"><span>Объект в сцене</span><select aria-label={'Объект эффекта '+label} value={effect.objectId} onChange={e=>update(index,{objectId:e.currentTarget.value,operation:''})}><option value="">Выбери объект</option>{effect.objectId&&!object&&<option value={effect.objectId}>Прежний объект недоступен</option>}{objects.filter(o=>o.operations?.length||o.id===effect.objectId).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label className="w6-field"><span>Подтверждённое изменение</span><select aria-label={'Изменение объекта '+label} value={effect.operation} onChange={e=>update(index,{operation:e.currentTarget.value})}><option value="">Выбери изменение</option>{effect.operation&&!object?.operations?.includes(effect.operation as keyof typeof operationLabels)&&<option value={effect.operation}>Прежняя операция недоступна</option>}{object?.operations?.map(operation=><option key={operation} value={operation}>{operationLabels[operation]}</option>)}</select></label>
      <label className="w6-field"><span>Основание по правилу способности и условиям сцены</span><textarea aria-label={'Основание объекта '+label} maxLength={500} value={effect.reason} onChange={e=>update(index,{reason:e.currentTarget.value})}/></label>
      <button type="button" className="w6-button" onClick={()=>onChange({environment:effects.filter((_,i)=>i!==index)})}>Убрать последствие {index+1}</button>
    </fieldset>})}
    <button type="button" className="w6-button" disabled={effects.length>=MAX_ABILITY_OBJECT_EFFECTS||!objects.some(o=>o.operations?.length)} onClick={()=>onChange({environment:[...effects,{objectId:'',operation:'',reason:''}]})}>Добавить последствие для окружения</button>
  </fieldset>
}
