import { emptyAbilityPhysicsForm, physicsFields } from './roundRuleForms'
import {waterReagents} from './waterPhysics'
import type { AbilityPhysicsForm, RuleActor, RuleSceneObject } from './roundRuleForms'
import { MAX_SHOCK_GRIPS } from './electricalCircuit'
import type { ShockGrip } from './electricalCircuit'

const modeLabels = {
  'create-water': 'Создать чистую воду',
  'fill-water': 'Долить чистую воду',
  'add-substance': 'Добавить примесь',
  discharge: 'Подать разряд на контакты',
  heat: 'Нагреть или охладить',
  'structural-impact': 'Ударить по конструкции',
  'push-object': 'Толкнуть предмет',
  sound: 'Создать короткий звук',
} satisfies Record<AbilityPhysicsForm['kind'], string>
const hints = {
  'create-water': 'Точка выпуска станет центром основания нового объёма. Укажи его размеры.',
  'fill-water': 'Выбери участок растекания, раствор или водный слой в тепловой сцене. Для сухого слоя укажи высоту его основания.',
  'add-substance': 'Направь выпуск в жидкую воду. При встрече кислоты и щёлочи образуются вода и соль.',
  discharge: 'Точка выпуска задаёт первый контакт. Укажи положение обратной клеммы. Импульс должен помещаться во время выпуска, порог операций — в предел тока источника.',
  heat: 'Выбери точку внутри воды или объекта с теплоёмкостью. Плюс добавляет тепло, минус отнимает. Для этого действия включи тепло и воздух в настройках сцены.',
  'structural-impact': 'Выбери точку внутри объекта с заданной прочностью. Укажи энергию, которую удар передаёт конструкции. При разрушении опоры герои на ней начнут падать.',
  'push-object': 'Выбери точку внутри предмета с настройками скольжения. Толчок направлен от героя к точке по полу. Скорость зависит от импульса и массы предмета.',
  sound: 'Точка выпуска станет источником короткого звука. Укажи уровень на расстоянии 1 м и включи звуки событий в акустике сцены.',
} satisfies Record<AbilityPhysicsForm['kind'], string>

export default function AbilityPhysicsFields({ title, value, actors, objects, onChange }: {
  title: string; value?: AbilityPhysicsForm; actors:RuleActor[]; objects:RuleSceneObject[]; onChange: (value?: AbilityPhysicsForm) => void
}) {
  const grips = value?.grips ?? []
  const replaceGrip = (index:number,patch:Partial<ShockGrip>)=>{
    if (value) onChange({...value,grips:grips.map((grip,i)=>i===index?{...grip,...patch}:grip)})
  }
  return <details className="gb-scene-details">
    <summary>Физическое действие{value ? ' · ' + modeLabels[value.kind] : ''}</summary>
    <label className="w6-field"><span>Действие со средой</span>
      <select aria-label={'Действие со средой ' + title} value={value?.kind ?? ''} onChange={event => {
        const kind = event.currentTarget.value
        onChange(kind ? emptyAbilityPhysicsForm(kind as AbilityPhysicsForm['kind']) : undefined)
      }}>
        <option value="">Без физического действия</option>
        {Object.entries(modeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {value && <>
      <p className="w6-copy">{hints[value.kind]}</p>
      {value.kind === 'add-substance' && <label className="w6-field"><span>Примесь</span>
        <select aria-label={'Примесь ' + title} value={value.substance} onChange={event => onChange({ ...value, substance: event.currentTarget.value as AbilityPhysicsForm['substance'] })}>
          <option value="salt">Растворённая соль (NaCl)</option><option value="sediment">Песок</option>
          {Object.entries(waterReagents).map(([key, reagent]) => <option key={key} value={key}>{reagent.label}</option>)}
        </select>
      </label>}
      <div className="gb-properties">
        {Object.entries(physicsFields[value.kind]).map(([key, label]) => <label key={key} className="w6-field"><span>{label}</span>
          <input aria-label={label + ' ' + title} inputMode="decimal" maxLength={40} value={value.fields[key]}
            onChange={event => onChange({ ...value, fields: { ...value.fields, [key]: event.currentTarget.value } })}/>
        </label>)}
      </div>
      {value.kind === 'add-substance' && (value.substance === 'acid' || value.substance === 'alkali') &&
        <p className="w6-copy">Укажи массу самого вещества в растворе. Соль, которая образуется при реакции, тоже проводит ток.</p>}
      {value.kind === 'discharge' && <details className="gb-scene-details">
        <summary>Хваты героев{grips.length ? ' · '+grips.length : ''}</summary>
        <p className="w6-copy">Укажи, кто держится за проводник. При выпуске проверяются расстояние, опора и проводимость. Ноги должны касаться отдельного проводника. Для этого расчёта включи контактные повреждения сцены.</p>
        {grips.map((grip,index)=>{
          const areas = actors.find(actor=>actor.id===grip.actorId)?.regions ?? []
          return <fieldset key={index}><legend>Хват {index+1}</legend><div className="gb-properties">
            <label className="w6-field"><span>Герой</span><select aria-label={'Герой в цепи '+(index+1)+' '+title} value={grip.actorId}
              onChange={e=>replaceGrip(index,{actorId:e.currentTarget.value,handRegion:'',footRegion:''})}><option value="">Выбери героя</option>
              {actors.filter(actor=>actor.id===grip.actorId || !grips.some(other=>other.actorId===actor.id)).map(actor=><option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
            <label className="w6-field"><span>Предмет в хвате</span><select aria-label={'Предмет в хвате '+(index+1)+' '+title} value={grip.objectId}
              onChange={e=>replaceGrip(index,{objectId:e.currentTarget.value})}><option value="">Выбери проводник</option>
              {objects.map(object=><option key={object.id} value={object.id}>{object.name}</option>)}</select></label>
            {([['handRegion','Область хвата'],['footRegion','Область опоры']] as const).map(([key,label])=><label key={key} className="w6-field"><span>{label}</span>
              <select aria-label={label+' '+(index+1)+' '+title} value={grip[key]} onChange={e=>replaceGrip(index,{[key]:e.currentTarget.value})}>
                <option value="">Выбери область</option>{areas.map(area=><option key={area.key} value={area.key}>{area.label}</option>)}
              </select>
            </label>)}
          </div><button type="button" className="w6-button" onClick={()=>onChange({...value,grips:grips.filter((_,i)=>i!==index)})}>Убрать хват {index+1}</button></fieldset>
        })}
        <button type="button" className="w6-button" disabled={grips.length>=Math.min(MAX_SHOCK_GRIPS,actors.length) || !objects.length}
          onClick={()=>onChange({...value,grips:[...grips,{actorId:'',objectId:'',handRegion:'',footRegion:''}]})}>Добавить хват</button>
      </details>}
    </>}
  </details>
}
