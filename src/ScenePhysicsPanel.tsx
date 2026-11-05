import {useState} from 'react'
import type {FormEvent} from 'react'
import {physicsMaterialPresets} from './physicsMaterials'
import {copyPhysicsMaterial} from './physicsMaterials'
import {DEFAULT_BACKGROUND_NOISE_DB,MAX_AEROSOL_KG,MAX_SOUND_LEVEL_DB,OUTSIDE_OXYGEN_FRACTION,isPhysicsBody,isPhysicsEnvironment} from './physicsState'
import type {PhysicsBody,PhysicsEnvironment} from './physicsState'
import {celsiusToKelvin,cubicMetresToLitres,kelvinToCelsius,physicsNumber} from './physicsUnits'
import {FUSION_J_KG,ICE_HEAT_J_KG_K,isWaterComposition,liquidEnthalpy,MAX_WATER_ADDITIVE_KG,validWaterHeight,waterConductivitySM,waterPhase,waterVolumeM3} from './waterPhysics'
import type {SceneObject} from './sceneTypes'

const number = (data: FormData, key: string): number => {
  const text = data.get(key)
  if (typeof text !== 'string' || !text.trim() || !Number.isFinite(Number(text))) throw Error('Заполни физические величины конечными числами.')
  return Number(text)
}
const display = (value: number | null, unit: string) => value === null ? 'Не задано' : value.toLocaleString('ru-RU',{maximumSignificantDigits:5}) + ' ' + unit
const soundLevel = (data: FormData, key: string, previous: number | null | undefined) =>
  data.get(key) ? number(data, key) : previous === undefined ? undefined : null

export function WaterVolumePanel({ object, thermal, disabled, onChange }: { object: SceneObject; thermal?: boolean; disabled: boolean; onChange: (next: SceneObject) => boolean }) {
  const [error, setError] = useState('')
  const value = object.water
  const phase = value?.enthalpyJKg != null && object.height > 0 ? waterPhase(value.enthalpyJKg) : undefined
  const canSetTemperature = thermal || value?.enthalpyJKg != null
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    setError('')
    try {
      const data = new FormData(event.currentTarget), height = number(data, 'waterHeight')
      const flow = data.has('waterFlow')
      let enthalpyJKg = value?.enthalpyJKg
      if (canSetTemperature) {
        if (height === 0) enthalpyJKg = 0
        else if (data.get('waterTemperatureC')) {
          const c = number(data, 'waterTemperatureC'), ice = data.get('waterIcePercent') ? number(data, 'waterIcePercent') : 0
          if (!physicsNumber(c, -273.15, 100) || !physicsNumber(ice, 0, 100) || ice > 0 && c !== 0) {
            throw Error('Укажи температуру от −273,15 до 100 °C. Смесь воды и льда возможна при 0 °C.')
          }
          enthalpyJKg = c < 0 ? c * ICE_HEAT_J_KG_K : c === 0 ? (1 - ice / 100) * FUSION_J_KG : liquidEnthalpy(celsiusToKelvin(c))
        } else enthalpyJKg = value?.enthalpyJKg === undefined ? undefined : null
      }
      const water = { version: 1, base: data.get('waterBase'), saltKg: number(data, 'waterSalt'), sedimentKg: number(data, 'waterSediment'),
        ...(flow || value?.flow !== undefined ? { flow } : {}), ...(enthalpyJKg !== undefined ? {enthalpyJKg} : {}) }
      if (!isWaterComposition(water) || !physicsNumber(height, 0, 1e6) || !validWaterHeight(water, height)) throw Error('Проверь глубину слоя и массы примесей.')
      if (!onChange({ ...object, height, water })) setError('Проверь границы сцены, стыки участков и опоры персонажей.')
    } catch (cause) {
      setError((cause as Error).message)
    }
  }
  return <details className="gb-scene-details"><summary>Объём и состав воды</summary>
    {value && <p className="w6-copy">{display(cubicMetresToLitres(waterVolumeM3(object)), 'л')} · проводимость {display(waterConductivitySM(value, object), 'См/м')}</p>}
    {phase && <p className="w6-copy">{display(kelvinToCelsius(phase.temperatureK), '°C')} · льда {display(phase.iceFraction * 100, '%')}</p>}
    {value?.enthalpyJKg != null && object.height === 0 && <p className="w6-copy">Сухой слой. Соль и осадок останутся здесь при доливе.</p>}
    <p className="w6-copy">Объём определяется размерами слоя. Проводимость рассчитана для чистой воды и раствора NaCl до 50 г/л при комнатной температуре.</p>
    <form key={JSON.stringify([object.height, value])} onSubmit={submit} aria-label="Объём и состав воды"><fieldset className="gb-properties gb-physics-properties" disabled={disabled}>
      <label className="w6-field"><span>Глубина слоя, м</span><input name="waterHeight" type="number" step="any" min={0} defaultValue={value ? object.height : object.height || .05} required/></label>
      <label className="w6-field"><span>Исходная вода</span><select name="waterBase" defaultValue={value?.base ?? 'unknown'}>
        <option value="unknown">Неизвестный состав</option>
        <option value="pure">Чистая вода</option>
      </select></label>
      <label className="w6-field"><span>Растворённая соль (NaCl), кг</span><input name="waterSalt" type="number" step="any" min="0" max={MAX_WATER_ADDITIVE_KG} defaultValue={value?.saltKg ?? 0} required/></label>
      <label className="w6-field"><span>Песок, кг</span><input name="waterSediment" type="number" step="any" min="0" max={MAX_WATER_ADDITIVE_KG} defaultValue={value?.sedimentKg ?? 0} required/></label>
      <label className="w6-check gb-wide"><input name="waterFlow" type="checkbox" defaultChecked={value?.flow}/>Участок растекания</label>
      <p className="w6-copy gb-wide">Соединяй участки общей стороной. Для сухого участка задай глубину 0 м. Уровни пересчитываются в раунде.</p>
      {canSetTemperature && <details className="gb-scene-details gb-wide">
        <summary>Температура и лёд</summary>
        <label className="w6-field"><span>Температура воды или льда, °C</span><input name="waterTemperatureC" type="number" step="any" min="-273.15" max="100" defaultValue={phase ? Number((phase.temperatureK - 273.15).toPrecision(12)) : ''} placeholder="Температура сцены"/></label>
        <label className="w6-field"><span>Доля льда при 0 °C, %</span><input name="waterIcePercent" type="number" step="any" min="0" max="100" defaultValue={phase?.temperatureK === 273.15 ? phase.iceFraction * 100 : 0}/></label>
      </details>}
      <div className="w6-buttons gb-wide">
        <button type="submit" className="w6-button w6-primary">Сохранить состав</button>
        <button type="button" className="w6-button" disabled={!value} onClick={() => { if (onChange({ ...object, water: null })) setError('') }}>Снять состав</button>
      </div>
    </fieldset></form>
    {error && <p role="alert" className="w6-error">{error}</p>}
  </details>
}

export function ObjectPhysicsPanel({value,ambientTemperatureK=293.15,canBurn,disabled,onChange}:{value?:PhysicsBody|null;ambientTemperatureK?:number;canBurn?:boolean;disabled:boolean;onChange:(value:PhysicsBody|null)=>boolean}) {
  const [materialId,setMaterialId]=useState(value?.material.id??''),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),presets=physicsMaterialPresets()
  // A saved snapshot wins over a later catalogue default, including custom values.
  const materials=value?[...presets.filter(material=>material.id!==value.material.id),value.material]:presets
  const material=materials.find(material=>material.id===materialId)
  const [burning, setBurning] = useState(!!value?.combustion)
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(disabled)return
    setMessage('');setFailed(false)
    try {
      if (!material) throw Error('Выбери физический материал.')
      const data=new FormData(event.currentTarget),next:PhysicsBody={version:1,material:copyPhysicsMaterial(material),massKg:number(data,'physicsMassKg'),temperatureK:celsiusToKelvin(number(data,'physicsTemperatureC')),wetnessFraction:number(data,'physicsWetnessPercent')/100}
      const noise = soundLevel(data, 'noiseLevelDbAt1m', value?.noiseLevelDbAt1m)
      if (noise !== undefined) next.noiseLevelDbAt1m = noise
      if (canBurn || value?.combustion) {
        if (data.has('simulateCombustion')) next.combustion = {fuelKg:number(data,'fuelKg'),burnRateKgS:number(data,'burnRateKgS'),ignitionTemperatureK:celsiusToKelvin(number(data,'ignitionTemperatureC'))}
        else if (value?.combustion !== undefined) next.combustion = null
      } else if (value?.combustion === null) next.combustion = null
      if (!isPhysicsBody(next)) throw Error('Проверь массу, температуру, влажность, шум и параметры горения.')
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
      {(canBurn || !!value?.combustion) && <details className="gb-scene-details gb-wide"><summary>Топливо и горение</summary>
        <label className="w6-check"><input name="simulateCombustion" type="checkbox" checked={burning} onChange={event=>setBurning(event.currentTarget.checked)}/>Учитывать горение в тепловой сцене</label>
        {burning && <>
          <label className="w6-field"><span>Запас топлива, кг</span><input name="fuelKg" type="number" min="0" max="1e12" step="any" defaultValue={value?.combustion?.fuelKg ?? 1} required/></label>
          <label className="w6-field"><span>Расход сухого топлива, кг/с</span><input name="burnRateKgS" type="number" min="1e-12" max="1e6" step="any" defaultValue={value?.combustion?.burnRateKgS ?? .00005} required/></label>
          <label className="w6-field"><span>Воспламенение от нагрева, °C</span><input name="ignitionTemperatureC" type="number" min="-272.15" max="999726.85" step="any" defaultValue={value?.combustion ? kelvinToCelsius(value.combustion.ignitionTemperatureK) : 300} required/></label>
        </>}
      </details>}
      <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" type="submit">Сохранить физический профиль</button><button className="w6-button" type="button" disabled={!value} onClick={()=>{if(onChange(null)){setFailed(false);setMessage('Физический профиль объекта снят.')}}}>Снять физический профиль</button></div>
    </fieldset></form>
    {material&&<details><summary>Свойства материала и основание</summary><dl className="w6-copy"><dt>Плотность</dt><dd>{display(material.densityKgM3,'кг/м³')}</dd><dt>Удельная теплоёмкость</dt><dd>{display(material.specificHeatJKgK,'Дж/(кг·K)')}</dd><dt>Теплопроводность</dt><dd>{display(material.thermalConductivityWMK,'Вт/(м·K)')}</dd><dt>Электропроводность</dt><dd>{display(material.electricalConductivitySM,'См/м')}</dd><dt>Температура профиля</dt><dd>{display(kelvinToCelsius(material.referenceTemperatureK),'°C')}</dd></dl><p className="w6-copy">{material.note}</p><p className="w6-copy">Неизвестная проводимость не означает изоляцию. Перенос свойств на другие температуры и составы требует отдельного расчёта.</p></details>}
    <p role={failed?'alert':'status'} className={failed?'w6-error':'w6-notice'}>{message}</p>
  </details>
}

export function EnvironmentPhysicsPanel({value,disabled,onChange}:{value?:PhysicsEnvironment|null;disabled:boolean;onChange:(value:PhysicsEnvironment|null)=>boolean}) {
  const [message,setMessage]=useState(''),[failed,setFailed]=useState(false)
  const [simulate, setSimulate] = useState(!!value?.atmosphere)
  const air = value?.atmosphere
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(disabled)return
    setMessage('');setFailed(false)
    try {
      const data=new FormData(event.currentTarget),next:PhysicsEnvironment={version:1,gravityMs2:number(data,'physicsGravityMs2'),ambientTemperatureK:celsiusToKelvin(number(data,'physicsAmbientC'))}
      const noise = soundLevel(data, 'backgroundNoiseDb', value?.backgroundNoiseDb)
      if (noise !== undefined) next.backgroundNoiseDb = noise
      if (data.has('simulateThermal')) next.atmosphere = {oxygenFraction:number(data,'oxygenPercent')/100, smokeKg:number(data,'smokeKg'), steamKg:number(data,'steamKg'),
        outsideTemperatureK:celsiusToKelvin(number(data,'outsideC')), doorVentilation:data.has('doorVentilation')}
      else if (air !== undefined) next.atmosphere = null
      if (!isPhysicsEnvironment(next)) throw Error('Проверь гравитацию, температуру, шум и параметры воздуха.')
      if (onChange(next)) setMessage('Физические условия сцены сохранены.');else {setFailed(true);setMessage('Условия не сохранены. Проверь сообщение редактора.')}
    } catch(error) {setFailed(true);setMessage((error as Error).message)}
  }
  return <details className="gb-scene-details"><summary>Физические условия среды</summary><p className="w6-copy">Задай условия сцены. Тепло и состав воздуха пересчитываются по времени раунда, если включить этот режим.</p>
    <form onSubmit={submit} aria-label="Физические условия сцены"><fieldset className="gb-properties gb-physics-properties" disabled={disabled}>
      <label className="w6-field gb-wide"><span>Гравитация вниз по Z, м/с²</span><input aria-label="Гравитация сцены (м/с²)" name="physicsGravityMs2" type="number" min="0" max="1000000" step="any" defaultValue={value?.gravityMs2??9.81} required/></label>
      <label className="w6-field gb-wide"><span>Температура среды, °C</span><input aria-label="Температура среды (°C)" name="physicsAmbientC" type="number" min="-273.15" max="999726.85" step="any" defaultValue={kelvinToCelsius(value?.ambientTemperatureK??293.15)} required/></label>
      <label className="w6-field gb-wide"><span>Фоновый шум, дБ</span><input name="backgroundNoiseDb" type="number" min="0" max={MAX_SOUND_LEVEL_DB} step="any" defaultValue={value?.backgroundNoiseDb??''} placeholder={String(DEFAULT_BACKGROUND_NOISE_DB)}/><small>Общий фон сцены. Пустое поле использует {DEFAULT_BACKGROUND_NOISE_DB} дБ для прогноза.</small></label>
      <details className="gb-scene-details gb-wide"><summary>Тепло и воздух{air ? ' · включено' : ''}</summary>
        <label className="w6-check"><input name="simulateThermal" type="checkbox" checked={simulate} onChange={event=>setSimulate(event.currentTarget.checked)}/>Рассчитывать тепло, горение и дым</label>
        {simulate && <>
          <p className="w6-copy">Воздух перемешивается по всей сцене. Вентиляция подходит для сцены, где открываемые двери ведут наружу.</p>
          <label className="w6-check"><input name="doorVentilation" type="checkbox" defaultChecked={air?.doorVentilation}/>Проветривать через открытые двери</label>
          <label className="w6-field"><span>Температура снаружи, °C</span><input name="outsideC" type="number" step="any" min="-273.15" max="999726.85" defaultValue={air ? kelvinToCelsius(air.outsideTemperatureK) : 20} required/></label>
          <label className="w6-field"><span>Доля кислорода, %</span><input name="oxygenPercent" type="number" step="any" min="0" max="100" defaultValue={(air?.oxygenFraction ?? OUTSIDE_OXYGEN_FRACTION)*100} required/></label>
          <label className="w6-field"><span>Дым, кг</span><input name="smokeKg" type="number" step="any" min="0" max={MAX_AEROSOL_KG} defaultValue={air?.smokeKg ?? 0} required/></label>
          <label className="w6-field"><span>Водяной пар, кг</span><input name="steamKg" type="number" step="any" min="0" max={MAX_AEROSOL_KG} defaultValue={air?.steamKg ?? 0} required/></label>
        </>}
      </details>
      <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" type="submit">Сохранить условия среды</button><button className="w6-button" type="button" disabled={!value} onClick={()=>{if(onChange(null)){setFailed(false);setMessage('Условия среды сняты; профили объектов сохранены.')}}}>Снять условия среды</button></div>
    </fieldset></form><p role={failed?'alert':'status'} className={failed?'w6-error':'w6-notice'}>{message}</p>
  </details>
}
