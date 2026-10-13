import type { ChargeForm } from './roundCharges'
import type { RuleActor } from './roundRuleForms'
export default function LobbyRoundCharges({actors,form,onChange}:{actors:RuleActor[];form:(a:string,c:string)=>ChargeForm;onChange:(v:ChargeForm)=>void}){
  return <>{actors.flatMap(a=>(a.casts??[]).filter(c=>c.roundPreparation).map(c=>{
    const f=form(a.id,c.id),p=c.chargePolicy,label=a.name+' · '+c.name
    const update=(patch:Partial<ChargeForm>)=>onChange({...f,...patch,confirmed:patch.confirmed??false})
    return <fieldset key={a.id+':'+c.id}><legend>Прежний заряд · {label}</legend>
      <p>{c.status==='preparing'?'Подготовка':'Готовый заряд'}. {p?'Срок после готовности: '+(p.maxHoldSeconds===null?'без ограничения':p.maxHoldSeconds+' с')+'. Удержание за секунду: Мана '+p.holdCost.mana+', Тень '+p.holdCost.shadow+', Выносливость '+p.holdCost.stamina+'.':'Прежние правила: без расхода удержания, без возврата начального платежа.'}</p>
      <label className="w6-field"><span>Решение по заряду</span><select aria-label={'Решение по заряду '+label} value={f.mode} onChange={e=>update({mode:e.currentTarget.value as ChargeForm['mode']})}><option value="">Выбери решение</option><option value="keep">Сохранить / продолжить по правилам</option><option value="interrupt">Прервать перед раундом</option></select></label>
      {f.mode==='interrupt'?<><label className="w6-field"><span>Причина прерывания</span><textarea aria-label={'Причина прерывания '+label} maxLength={1000} value={f.reason} onChange={e=>update({reason:e.currentTarget.value})}/></label><p>Возврат начального платежа: {p?(c.status==='preparing'?p.refundPreparingPercent:p.refundReadyPercent):0}%. Очередь этой подготовки и следующие действия героя будут сняты. Для готового заряда проверь, что новое заявление не пытается его выпустить.</p></>:p?.requireConditions&&<>{(['conditionsConfirmed','canSpeak'] as const).map(k=><label className="w6-check" key={k}><input type="checkbox" aria-label={k+' заряда '+label} checked={f[k]} onChange={e=>update({[k]:e.currentTarget.checked})}/>{k==='conditionsConfirmed'?'Особое условие удержания выполнено':'Возможность говорить проверена'}</label>)}</>}
      {(p||f.mode==='interrupt')&&<label className="w6-check"><input type="checkbox" aria-label={'Заряд подтверждён '+label} checked={f.confirmed} onChange={e=>update({confirmed:e.currentTarget.checked})}/>Проверил решение по заряду и его последствия</label>}
    </fieldset>
  }))}</>
}
