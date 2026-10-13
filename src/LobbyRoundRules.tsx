import SpatialRuleFields from './SpatialRuleFields'
import { ruleNumbers } from './roundRuleForms'
import type { RuleActor, RuleForm } from './roundRuleForms'
import type { RuleRow } from './roundRules'
export default function LobbyRoundRules({rows,actors,actorIds,form,onChange}:{rows:RuleRow[];actors:RuleActor[];actorIds?:string[];form:(row:RuleRow)=>RuleForm;onChange:(f:RuleForm)=>void}) {
  const name=(id:string)=>actors.find(a=>a.id===id)?.name??'Герой'
  return rows.length?<fieldset><legend>Предметы и способности</legend><p>Личную стоимость задаёт мастер в шкале времени. Подготовка списывает начальный ресурс один раз, выпуск выбирается отдельно. Проверь привязку, условия удержания и параметры эффекта. Дальность сайт определяет по текущим XYZ.</p>
    {rows.map((row,index)=>{const f=form(row),title=name(row.actorId)+' · '+(index+1),a=row.action
      const owner=actors.find(x=>x.id===row.actorId),label=a.kind==='item'?owner?.items?.find(i=>i.id===a.itemId)?.name??'Прежний предмет':owner?.abilities?.find(b=>b.id===a.abilityId)?.name??owner?.casts?.find(c=>c.abilityId===a.abilityId)?.name??'Прежняя способность'
      const update=(patch:Partial<RuleForm>)=>onChange({...f,spatialConfirmed:false,...patch,confirmed:false})
      const field=(key:string,value:string)=>update({fields:{...f.fields,[key]:value}})
      return <fieldset key={row.key}><legend>{title} · {label} · {a.kind==='item'?'предмет':a.stage==='prepare'?'подготовка':'выпуск'}</legend>
        {a.kind==='item'?<><label className="w6-field"><span>Операция с предметом</span><select aria-label={'Предмет '+title} value={f.operation} disabled={!!a.operation} onChange={e=>update({operation:e.currentTarget.value})}><option value="">Уточнить заявленную операцию</option><option value="equip">Экипировать</option><option value="unequip">Снять</option><option value="activate">Активировать артефакт</option><option value="consume">Использовать расходник · одна доза</option></select></label>
          {f.operation==='consume'&&<>
            <p>Одна доза. Эффект берётся из текущего экземпляра; цель и дальность проверяются при завершении действия.</p>
            {(()=>{const item=owner?.items?.find(i=>i.id===a.itemId),effect=item?.consumable;return effect?<div aria-label={'Эффект расходника '+title}>
              <p>В стопке: {item.quantity} · {effect.targets==='self'?'Только на себя':'На себя или раскрытое существо'} · дальность {effect.rangeM} м.</p>
              <p>Мана +{effect.restore.mana} · Тень +{effect.restore.shadow} · Выносливость +{effect.restore.stamina} · локальное лечение {effect.healAmount} HP.</p>
              <p>{effect.stopBleeding?'Остановить кровотечение области. ':''}{effect.cureLabels.length?'Снять травмы: '+effect.cureLabels.join(', ')+'. ':''}{effect.requiresFreeHand?'Нужна свободная рабочая рука. ':''}{effect.modifiers.length?'Временные модификаторы: '+effect.duration+' с. ':''}</p>
              {effect.condition&&<p>Особое условие: {effect.condition}</p>}
            </div>:<p>Явный эффект расходника не задан. Настрой экземпляр до исполнения.</p>})()}

            <label className="w6-field"><span>Область тела для локального лечения</span><input aria-label={'Область '+title} maxLength={160} value={f.fields.region} onChange={e=>field('region',e.currentTarget.value)}/></label>
            <label className="w6-field"><span>Внутренняя структура для лечения, если нужна</span><input aria-label={'Структура '+title} maxLength={160} value={f.fields.structureId} onChange={e=>field('structureId',e.currentTarget.value)}/></label>
            {([['accessible','Цель доступна'],['conditionsConfirmed','Особое условие выполнено']] as const).map(([key,label])=><label className="w6-check" key={key}><input aria-label={label+' '+title} type="checkbox" checked={f[key]} onChange={e=>update({[key]:e.currentTarget.checked})}/>{label}</label>)}
            <label className="w6-field"><span>Основание применения расходника</span><textarea aria-label={'Условия '+title} maxLength={1000} value={f.fields.note} onChange={e=>field('note',e.currentTarget.value)}/></label>
          </>}
        </>:<>
          {a.stage==='prepare'?<label className="w6-field"><span>Привязка заряда по правилу способности</span><select aria-label={'Привязка '+title} value={f.binding} onChange={e=>update({binding:e.currentTarget.value})}><option value="">Выбери после проверки способности</option><option value="unbound">Без привязки к существу</option><option value="bound">К заявленной цели</option></select></label>:<label className="w6-field"><span>Выпускаемый заряд</span><select aria-label={'Заряд '+title} value={f.charge} onChange={e=>update({charge:e.currentTarget.value})}><option value="">Выбери заряд или подготовку раньше в очереди</option>{(actors.find(x=>x.id===row.actorId)?.casts??[]).filter(c=>c.abilityId===a.abilityId).map((c,index)=><option key={c.id} value={'cast:'+c.id}>{c.name} · {c.status==='ready'?'готов':'подготовка'} · {c.binding==='bound'?'привязан':'свободен'} · №{index+1}</option>)}{rows.filter(p=>p.actorId===row.actorId&&p.action.kind==='ability'&&p.action.stage==='prepare'&&p.action.abilityId===a.abilityId).map(p=><option key={p.key} value={'prepare:'+p.key}>Подготовка в этой очереди · действие {rows.indexOf(p)+1}</option>)}</select></label>}
          <label className="w6-field"><span>Область тела цели</span><input aria-label={'Область '+title} maxLength={160} list={'regions-'+index} value={f.fields.region} onChange={e=>field('region',e.currentTarget.value)}/><datalist id={'regions-'+index}>{[...new Map(actors.flatMap(x=>x.regions??[]).map(r=>[r.key,r])).values()].map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</datalist></label>
          <label className="w6-field"><span>Внутренняя структура для лечения, если нужна</span><input aria-label={'Структура '+title} maxLength={160} value={f.fields.structureId} onChange={e=>field('structureId',e.currentTarget.value)}/></label>
          {a.stage==='release'&&<>{ruleNumbers.filter(([k])=>k!=='manualSystemic').map(([key,label])=><label className="w6-field" key={key}><span>{label}</span><input aria-label={label+' '+title} inputMode="decimal" maxLength={40} value={f.fields[key]} onChange={e=>field(key,e.currentTarget.value)}/></label>)}
            <label className="w6-field"><span>Травма по решению мастера</span><input aria-label={'Травма '+title} maxLength={120} value={f.fields.injury} onChange={e=>field('injury',e.currentTarget.value)}/></label>
            <label className="w6-field"><span>Путь через броню</span><select value={f.armorPath} onChange={e=>update({armorPath:e.currentTarget.value as RuleForm['armorPath']})}><option value="covered">Через покрывающую броню</option><option value="gap">Через подтверждённый зазор</option></select></label>
            <label className="w6-check"><input type="checkbox" checked={f.gapConfirmed} onChange={e=>update({gapConfirmed:e.currentTarget.checked})}/>Подтверждаю попадание в зазор</label></>}
          {([['accessible','Цель доступна'],['conditionsConfirmed','Особое условие выполнено'],['canSpeak','Может говорить']] as const).map(([key,label])=><label className="w6-check" key={key}><input aria-label={label+' '+title} type="checkbox" checked={f[key]} onChange={e=>update({[key]:e.currentTarget.checked})}/>{label}</label>)}
          <label className="w6-field"><span>Основание и условия удержания</span><textarea aria-label={'Условия '+title} maxLength={1000} value={f.fields.note} onChange={e=>field('note',e.currentTarget.value)}/></label>
          {a.stage==='release'&&'point' in a.target&&<SpatialRuleFields title={title} spatial={f.charge.startsWith('cast:')?owner?.casts?.find(c=>'cast:'+c.id===f.charge)?.spatial:owner?.abilities?.find(b=>b.id===a.abilityId)?.spatial} actors={actors.filter(x=>!actorIds||actorIds.includes(x.id))} value={f} onChange={update}/>}
        </>}
        <label className="w6-check"><input aria-label={'Правила подтверждены '+title} type="checkbox" checked={f.confirmed} onChange={e=>onChange({...f,confirmed:e.currentTarget.checked})}/>Проверил время, условия, расходы и последствия этого этапа</label>
      </fieldset>})}
    <p>Здесь поддержаны снаряжение, активация собственного артефакта и способности на себя/существо. Расходники применяются на себя или раскрытое существо по правилу предмета. Пространственные способности используют форму своего заряда; поддержание областей и повреждение окружения ещё впереди.</p>
  </fieldset>:null
}
