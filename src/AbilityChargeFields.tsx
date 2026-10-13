import { Check, Field, NumberField } from './RpgControls'
import type { AbilityDefinition } from './rpgTypes'
export default function AbilityChargeFields({value,onChange}:{value:AbilityDefinition;onChange:(v:AbilityDefinition)=>void}){
  const p=value.chargePolicy
  return <fieldset><legend>Удержание и прерывание раундового заряда</legend>
    <Check label="Задать условия заряда" value={!!p} onChange={yes=>{const next={...value};if(yes)next.chargePolicy={maxHoldSeconds:null,holdCost:{mana:0,shadow:0,stamina:0},requireConditions:false,refundPreparingPercent:0,refundReadyPercent:0};else delete next.chargePolicy;onChange(next)}}/>
    {p&&<>
      <Field label="Срок готового заряда"><select aria-label="Срок готового заряда" value={p.maxHoldSeconds===null?'unlimited':'limited'} onChange={e=>onChange({...value,chargePolicy:{...p,maxHoldSeconds:e.currentTarget.value==='unlimited'?null:0}})}><option value="unlimited">Без численного срока</option><option value="limited">Задать срок в мировых секундах</option></select></Field>
      {p.maxHoldSeconds!==null&&<NumberField label="Срок удержания готового заряда (с)" value={p.maxHoldSeconds} max={31536000} onChange={maxHoldSeconds=>onChange({...value,chargePolicy:{...p,maxHoldSeconds}})}/>}
      {(['mana','shadow','stamina'] as const).map(k=><NumberField key={k} label={'Удержание: '+{mana:'Мана',shadow:'Тень',stamina:'Выносливость'}[k]+' за мировую секунду'} value={p.holdCost[k]} max={1e12} onChange={n=>onChange({...value,chargePolicy:{...p,holdCost:{...p.holdCost,[k]:n}}})}/>)}
      <Check label="Проверять условия применяющего при удержании" value={p.requireConditions} onChange={requireConditions=>onChange({...value,chargePolicy:{...p,requireConditions}})}/>
      <NumberField label="Возврат начального расхода при прерывании подготовки (%)" value={p.refundPreparingPercent} max={100} onChange={refundPreparingPercent=>onChange({...value,chargePolicy:{...p,refundPreparingPercent}})}/>
      <NumberField label="Возврат начального расхода при прерывании готового заряда (%)" value={p.refundReadyPercent} max={100} onChange={refundReadyPercent=>onChange({...value,chargePolicy:{...p,refundReadyPercent}})}/>
      <p>Начальный расход оплачивается при начале подготовки. Удержание оплачивается с готовности до завершения выпуска по мировому времени; срок отсчитывается от готовности. Возврат касается только записанного начального платежа и ограничен максимумом ресурса.</p>
    </>}
    <p>Мастер подтверждает продолжение или прерывание перед раундом. Пауза подготовки сохраняет прогресс. Прерывание снимает подготовку и следующие действия её очереди; произошедшие разовые эффекты сохраняются. Урон не отменяет заряд автоматически. Без этих настроек сохраняется прежнее поведение.</p>
  </fieldset>
}
