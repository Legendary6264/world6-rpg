import {useState} from 'react'
import type {FormEvent} from 'react'
import {physicsMaterialPresets} from './physicsMaterials'
import {copyPhysicsMaterial} from './physicsMaterials'
import {DEFAULT_BACKGROUND_NOISE_DB,MAX_SOUND_LEVEL_DB,isPhysicsBody,isPhysicsEnvironment} from './physicsState'
import type {PhysicsBody,PhysicsEnvironment} from './physicsState'
import {celsiusToKelvin,cubicMetresToLitres,kelvinToCelsius,physicsNumber} from './physicsUnits'
import {isWaterComposition,MAX_WATER_ADDITIVE_KG,MIN_WATER_HEIGHT_M,waterConductivitySM,waterVolumeM3} from './waterPhysics'
import type {SceneObject} from './sceneTypes'

const number = (data: FormData, key: string): number => {
  const text = data.get(key)
  if (typeof text !== 'string' || !text.trim() || !Number.isFinite(Number(text))) throw Error('Заполни физические величины конечными числами.')
  return Number(text)
}
const display = (value: number | null, unit: string) => value === null ? 'Не задано' : value.toLocaleString('ru-RU',{maximumSignificantDigits:5}) + ' ' + unit
const soundLevel = (data: FormData, key: string, previous: number | null | undefined) =>
  data.get(key) ? number(data, key) : previous === undefined ? undefined : null

export function WaterVolumePanel({ object, disabled, onChange }: { object: SceneObject; disabled: boolean; onChange: (next: SceneObject) => boolean }) {
  const [error, setError] = useState('')
  const value = object.water
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    setError('')
    try {
      const data = new FormData(event.currentTarget), height = number(data, 'waterHeight')
      const water = { version: 1, base: data.get('waterBase'), saltKg: number(data, 'waterSalt'), sedimentKg: number(data, 'waterSediment') }
      if (!isWaterComposition(water) || !physicsNumber(height, MIN_WATER_HEIGHT_M, 1e6)) throw Error('Проверь глубину слоя и массы примесей.')
      if (!onChange({ ...object, height, water })) setError('Проверь границы сцены и положение слоя.')
    } catch (cause) {
      setError((cause as Error).message)
    }
  }
  return <details className="gb-scene-details"><summary>Объём и состав воды</summary>
    {value && <p className="w6-copy">{display(cubicMetresToLitres(waterVolumeM3(object)), 'л')} · проводимость {display(waterConductivitySM(value, object), 'См/м')}</p>}
    <p className="w6-copy">Объём определяется размерами слоя. Проводимость рассчитана для чистой воды и раствора NaCl до 50 г/л при комнатной температуре.</p>
    <form key={JSON.stringify([object.height, value])} onSubmit={submit} aria-label="Объём и состав воды"><fieldset className="gb-properties gb-physics-properties" disabled={disabled}>
      <label className="w6-field"><span>Глубина слоя, м</span><input name="waterHeight" type="number" step="any" min={MIN_WATER_HEIGHT_M} defaultValue={object.height || .05} required/></label>
      <label className="w6-field"><span>Исходная вода</span><select name="waterBase" defaultValue={value?.base ?? 'unknown'}>
        <option value="unknown">Неизвестный состав</option>
        <option value="pure">Чистая вода</option>
      </select></label>
      <label className="w6-field"><span>Растворённая соль (NaCl), кг</span><input name="waterSalt" type="number" step="any" min="0" max={MAX_WATER_ADDITIVE_KG} defaultValue={value?.saltKg ?? 0} required/></label>
      <label className="w6-field"><span>Песок, кг</span><input name="waterSediment" type="number" step="any" min="0" max={MAX_WATER_ADDITIVE_KG} defaultValue={value?.sedimentKg ?? 0} required/></label>
      <div className="w6-buttons gb-wide">
        <button type="submit" className="w6-button w6-primary">Сохранить состав</button>
        <button type="button" className="w6-button" disabled={!value} onClick={() => { if (onChange({ ...object, water: null })) setError('') }}>Снять состав</button>
      </div>
    </fieldset></form>
    {error && <p role="alert" className="w6-error">{error}</p>}
  </details>
}

export function ObjectPhysicsPanel({value,ambientTemperatureK=293.15,disabled,onChange}:{value?:PhysicsBody|null;ambientTemperatureK?:number;disabled:boolean;onChange:(value:PhysicsBody|null)=>boolean}) {
  const [materialId,setMaterialId]=useState(value?.material.id??''),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),presets=physicsMaterialPresets()
  // A saved snapshot wins over a later catalogue default, including custom values.
  const materials=value?[...presets.filter(material=>material.id!==value.material.id),value.material]:presets
  const material=materials.find(material=>material.id===materialId)
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(disabled)return
    setMessage('');setFailed(false)
    try {
      if (!material) throw Error('Выбери физический материал.')
      const data=new FormData(event.currentTarget),next:PhysicsBody={version:1,material:copyPhysicsMaterial(material),massKg:number(data,'physicsMassKg'),temperatureK:celsiusToKelvin(number(data,'physicsTemperatureC')),wetnessFraction:number(data,'physicsWetnessPercent')/100}
      const noise = soundLevel(data, 'noiseLevelDbAt1m', value?.noiseLevelDbAt1m)
      if (noise !== undefined) next.noiseLevelDbAt1m = noise
      if (!isPhysicsBody(next)) throw Error('Проверь массу, температуру, влажность и уровень шума.')
      if (onChange(next)) setMessage('Физический профиль объекта сохранён.');else {setFailed(true);setMessage('Профиль не сохранён. Проверь сообщение редактора.')}
    } catch(error) {setFailed(true);setMessage((error as Error).message)}
  }
  return <details className="gb-scene-details"><summary>Физические свойства</summary>
    <p className="w6-copy">Материал, масса и температура задаются отдельно от внешнего вида. На этом этапе последствия для боя подтверждает мастер.</p>
    <form onSubmit={submit} aria-label="Физический профиль объекта"><fieldset className="gb-properties gb-physics-properties" disabled={disabled}>
      <label className="w6-field gb-wide"><span>Материал</span><select aria-label="Физический материал объекта" value={materialId} onChange={event=>setMaterialId(event.currentTarget.value)} required><option value="">Выбери материал</option>{materials.map(material=><option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
      <label className="w6-field"><span>Масса, кг</span><input aria-label="Физическая масса объекта (кг)" name="physicsMassKg" type="number" step="any" min="0.000000000001" max="1000000000000" defaultValue={value?.massKg??''} required/></label>
      <label className="w6-field"><span>Температура, °C</span><input aria-label="Температура объекта (°C)" name="physicsTemperatureC" type="number" step="any" min="-273.15" max="999726.85" defaultValue={kelvinToCelsius(value?.temperatureK??ambientTemperatureK)} required/></label>
      <label className="w6-field gb-wide"><span>Влажность поверхности, %</span><input aria-label="Влажность поверхности (%)" name="physicsWetnessPercent" type="number" step="any" min="0" max="100" defaultValue={(value?.wetnessFraction??0)*100} required/></label>
      <label className="w6-field gb-wide"><span>Постоянный шум на расстоянии 1 м, дБ</span><input name="noiseLevelDbAt1m" type="number" step="any" min="0" max={MAX_SOUND_LEVEL_DB} defaultValue={value?.noiseLevelDbAt1m??''} placeholder="Без источника шума"/><small>Например, шум водопада. Оставь поле пустым для тихого объекта.</small></label>
      <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" type="submit">Сохранить физический профиль</button><button className="w6-button" type="button" disabled={!value} onClick={()=>{if(onChange(null)){setFailed(false);setMessage('Физический профиль объекта снят.')}}}>Снять физический профиль</button></div>
    </fieldset></form>
    {material&&<details><summary>Свойства материала и основание</summary><dl className="w6-copy"><dt>Плотность</dt><dd>{display(material.densityKgM3,'кг/м³')}</dd><dt>Удельная теплоёмкость</dt><dd>{display(material.specificHeatJKgK,'Дж/(кг·K)')}</dd><dt>Теплопроводность</dt><dd>{display(material.thermalConductivityWMK,'Вт/(м·K)')}</dd><dt>Электропроводность</dt><dd>{display(material.electricalConductivitySM,'См/м')}</dd><dt>Температура профиля</dt><dd>{display(kelvinToCelsius(material.referenceTemperatureK),'°C')}</dd></dl><p className="w6-copy">{material.note}</p><p className="w6-copy">Неизвестная проводимость не означает изоляцию. Перенос свойств на другие температуры и составы требует отдельного расчёта.</p></details>}
    <p role={failed?'alert':'status'} className={failed?'w6-error':'w6-notice'}>{message}</p>
  </details>
}

export function EnvironmentPhysicsPanel({value,disabled,onChange}:{value?:PhysicsEnvironment|null;disabled:boolean;onChange:(value:PhysicsEnvironment|null)=>boolean}) {
  const [message,setMessage]=useState(''),[failed,setFailed]=useState(false)
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(disabled)return
    setMessage('');setFailed(false)
    try {
      const data=new FormData(event.currentTarget),next:PhysicsEnvironment={version:1,gravityMs2:number(data,'physicsGravityMs2'),ambientTemperatureK:celsiusToKelvin(number(data,'physicsAmbientC'))}
      const noise = soundLevel(data, 'backgroundNoiseDb', value?.backgroundNoiseDb)
      if (noise !== undefined) next.backgroundNoiseDb = noise
      if (!isPhysicsEnvironment(next)) throw Error('Проверь гравитацию, температуру и фоновый шум.')
      if (onChange(next)) setMessage('Физические условия сцены сохранены.');else {setFailed(true);setMessage('Условия не сохранены. Проверь сообщение редактора.')}
    } catch(error) {setFailed(true);setMessage((error as Error).message)}
  }
  return <details className="gb-scene-details"><summary>Физические условия среды</summary><p className="w6-copy">Земные значения — пример для настройки мастером. Автоматические падения, нагрев и электрические цепи на этом этапе не применяются.</p>
    <form onSubmit={submit} aria-label="Физические условия сцены"><fieldset className="gb-properties gb-physics-properties" disabled={disabled}>
      <label className="w6-field gb-wide"><span>Гравитация вниз по Z, м/с²</span><input aria-label="Гравитация сцены (м/с²)" name="physicsGravityMs2" type="number" min="0" max="1000000" step="any" defaultValue={value?.gravityMs2??9.81} required/></label>
      <label className="w6-field gb-wide"><span>Температура среды, °C</span><input aria-label="Температура среды (°C)" name="physicsAmbientC" type="number" min="-273.15" max="999726.85" step="any" defaultValue={kelvinToCelsius(value?.ambientTemperatureK??293.15)} required/></label>
      <label className="w6-field gb-wide"><span>Фоновый шум, дБ</span><input name="backgroundNoiseDb" type="number" min="0" max={MAX_SOUND_LEVEL_DB} step="any" defaultValue={value?.backgroundNoiseDb??''} placeholder={String(DEFAULT_BACKGROUND_NOISE_DB)}/><small>Общий фон сцены. Пустое поле использует {DEFAULT_BACKGROUND_NOISE_DB} дБ для прогноза.</small></label>
      <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" type="submit">Сохранить условия среды</button><button className="w6-button" type="button" disabled={!value} onClick={()=>{if(onChange(null)){setFailed(false);setMessage('Условия среды сняты; профили объектов сохранены.')}}}>Снять условия среды</button></div>
    </fieldset></form><p role={failed?'alert':'status'} className={failed?'w6-error':'w6-notice'}>{message}</p>
  </details>
}
