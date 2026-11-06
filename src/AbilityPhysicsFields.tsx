import { emptyAbilityPhysicsForm, physicsFields } from './roundRuleForms'
import {waterReagents} from './waterPhysics'
import type { AbilityPhysicsForm } from './roundRuleForms'

const modeLabels = {
  'create-water': 'Создать чистую воду',
  'fill-water': 'Долить чистую воду',
  'add-substance': 'Добавить примесь',
  discharge: 'Подать разряд на контакты',
  heat: 'Нагреть или охладить',
  'structural-impact': 'Ударить по конструкции',
  'push-object': 'Толкнуть предмет',
} satisfies Record<AbilityPhysicsForm['kind'], string>
const hints = {
  'create-water': 'Точка выпуска станет центром основания нового объёма. Укажи его размеры.',
  'fill-water': 'Выбери участок растекания, раствор или водный слой в тепловой сцене. Для сухого слоя укажи высоту его основания.',
  'add-substance': 'Направь выпуск в жидкую воду. При встрече кислоты и щёлочи образуются вода и соль.',
  discharge: 'Точка выпуска задаёт первый контакт. Укажи положение обратной клеммы. Импульс должен помещаться во время выпуска, порог операций — в предел тока источника.',
  heat: 'Выбери точку внутри воды или объекта с теплоёмкостью. Плюс добавляет тепло, минус отнимает. Для этого действия включи тепло и воздух в настройках сцены.',
  'structural-impact': 'Выбери точку внутри объекта с заданной прочностью. Укажи энергию, которую удар передаёт конструкции. При разрушении опоры герои на ней начнут падать.',
  'push-object': 'Выбери точку внутри предмета с настройками скольжения. Толчок направлен от героя к точке по полу. Скорость зависит от импульса и массы предмета.',
} satisfies Record<AbilityPhysicsForm['kind'], string>

export default function AbilityPhysicsFields({ title, value, onChange }: {
  title: string; value?: AbilityPhysicsForm; onChange: (value?: AbilityPhysicsForm) => void
}) {
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
      {value.kind === 'discharge' && <p className="w6-copy">Операции с объектами сработают на найденном пути при достижении заданного тока. Последствия для существ задаются в параметрах выпуска.</p>}
    </>}
  </details>
}
