import { spatialLabel } from './abilitySpatial'
import { ruleNumbers } from './roundRuleForms'
import type { RuleActor, RuleForm, TargetRuleForm } from './roundRuleForms'
import type { AbilitySpatial } from './rpgTypes'
export default function SpatialRuleFields({title,spatial,actors,value,onChange}:{title:string;spatial?:AbilitySpatial;actors:RuleActor[];value:RuleForm;onChange:(patch:Partial<RuleForm>)=>void}) {
  const override=(actorId:string,form:TargetRuleForm|null)=>onChange({overrides:[...(value.overrides??[]).filter(o=>o.actorId!==actorId),...(form?[{actorId,form}]:[])]})
  const initial=():TargetRuleForm=>({fields:{...value.fields},accessible:value.accessible,conditionsConfirmed:value.conditionsConfirmed,canSpeak:value.canSpeak,armorPath:value.armorPath,gapConfirmed:value.gapConfirmed})
  return <fieldset><legend>Пространственный выпуск</legend>
    <p>{spatial?spatialLabel(spatial)+' · '+(spatial.includeCaster?'Применяющий может попасть в эффект.':'Применяющий исключён правилом способности.'):'У выбранного заряда нет пространственной формы. Уточни заряд или цель.'}</p>
    <p>XYZ берутся в момент выпуска. Общие параметры выше применяются ко всем попавшим в форму существам. Отдельные параметры ниже заменяют их для выбранного существа. Итоговый список появится в предпросмотре.</p>
    <details><summary>Индивидуальные параметры существ сцены</summary>{actors.map(actor=>{
      const form=value.overrides?.find(o=>o.actorId===actor.id)?.form,label=actor.name+' · '+title
      const update=(patch:Partial<TargetRuleForm>)=>{if(form)override(actor.id,{...form,...patch})}
      const field=(key:string,text:string)=>{if(form)update({fields:{...form.fields,[key]:text}})}
      return <fieldset key={actor.id}><legend>{actor.name}</legend>
        <label className="w6-check"><input aria-label={'Отдельные параметры '+label} type="checkbox" checked={!!form} onChange={e=>override(actor.id,e.currentTarget.checked?initial():null)}/>Задать отдельные параметры</label>
        {form&&<>
          {([['region','Область'],['structureId','Структура'],['injury','Травма'],['note','Основание']] as const).map(([key,text])=><label className="w6-field" key={key}><span>{text}</span><input aria-label={text+' цели '+label} maxLength={key==='note'?1000:key==='injury'?120:160} value={form.fields[key]} onChange={e=>field(key,e.currentTarget.value)}/></label>)}
          {ruleNumbers.filter(([key])=>key!=='manualSystemic').map(([key,text])=><label className="w6-field" key={key}><span>{text}</span><input aria-label={text+' цели '+label} maxLength={40} value={form.fields[key]} onChange={e=>field(key,e.currentTarget.value)} inputMode="decimal"/></label>)}
          {([['accessible','Цель доступна'],['conditionsConfirmed','Особое условие выполнено'],['canSpeak','Может говорить'],['gapConfirmed','Зазор подтверждён']] as const).map(([key,text])=><label className="w6-check" key={key}><input aria-label={text+' цели '+label} type="checkbox" checked={form[key]} onChange={e=>update({[key]:e.currentTarget.checked})}/>{text}</label>)}
          <label className="w6-field"><span>Броня цели</span><select value={form.armorPath} onChange={e=>update({armorPath:e.currentTarget.value as TargetRuleForm['armorPath']})}><option value="covered">Через броню</option><option value="gap">Через зазор</option></select></label>
        </>}
      </fieldset>
    })}</details>
    <label className="w6-check"><input aria-label={'Пространство подтверждено '+title} type="checkbox" checked={value.spatialConfirmed??false} onChange={e=>onChange({spatialConfirmed:e.currentTarget.checked})}/>Проверил форму, препятствия, возможных получателей и параметры каждого</label>
  </fieldset>
}
