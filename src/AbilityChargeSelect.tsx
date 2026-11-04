import type {DeclarationOptions} from './actionDeclarations'

export default function AbilityChargeSelect({options,abilityId,value,onChange,label='Собственный заряд'}:{options:DeclarationOptions|null|undefined;abilityId:string;value:string;onChange:(id:string)=>void;label?:string}) {
  if(!options?.casts)return null
  const casts=options.casts.filter(c=>c.abilityId===abilityId),selected=casts.find(c=>c.id===value)
  return <><label className="w6-field"><span>{label}</span><select aria-label={label} value={value} onChange={e=>onChange(e.currentTarget.value)}>
    <option value="">Новая подготовка / заряд из очереди этого хода</option>
    {value&&!selected&&<option value={value}>Прежний заряд недоступен — выбери заново</option>}
    {casts.map((c,index)=><option key={c.id} value={c.id}>{c.name} · {c.status==='ready'?'готов':'подготовка'} · {c.binding==='bound'?'привязан':'свободен'} · №{index+1}</option>)}
  </select></label>
    {selected&&<p className="gb-game-help">Начальный расход уже оплачен. {selected.status==='preparing'?'Сначала нужно завершить подготовку. ':''}{selected.binding==='bound'?'Цель связана с подготовкой; смену согласуй с мастером. ':''}{selected.holdUntil!==null?'Предел удержания: '+selected.holdUntil+' с времени кампании. ':''}{Object.values(selected.holdCost).some(n=>n>0)?'Удержание в секунду: мана '+selected.holdCost.mana+', Тень '+selected.holdCost.shadow+', выносливость '+selected.holdCost.stamina+'.':''}</p>}
  </>
}
