import {useId,useState} from 'react'
import type {FormEvent} from 'react'
import {physicsMaterialPresets} from './physicsMaterials'
import {copyPhysicsMaterial} from './physicsMaterials'
import {DEFAULT_BACKGROUND_NOISE_DB,MAX_AEROSOL_KG,MAX_SOUND_LEVEL_DB,OUTSIDE_OXYGEN_FRACTION,isPhysicsBody,isPhysicsEnvironment} from './physicsState'
import type {PhysicsBody,PhysicsEnvironment} from './physicsState'
import {celsiusToKelvin,cubicMetresToLitres,kelvinToCelsius,physicsNumber} from './physicsUnits'
import {
  FUSION_J_KG, ICE_HEAT_J_KG_K, MAX_WATER_ADDITIVE_KG, isWaterComposition, isWaterReagent, liquidEnthalpy,
  validWaterHeight, waterConductivitySM, waterPhase, waterPH, waterReagents, waterVolumeM3,
} from './waterPhysics'
import type {Scene,SceneObject} from './sceneTypes'
import {airAxes,airRoomsFit,isAirRoomList,MAX_AIR_ROOMS} from './airProfiles'
import type {AirRoom} from './airProfiles'
import {airPortal,sceneAir} from './sceneAir'
import {bodyRegions} from './bodyRegions'
import {isLandingProfile,isSliding,MAX_SLIDE_FRICTION,MAX_STRUCTURAL_ENERGY_J} from './mechanicalProfiles'
import type {LandingProfile} from './mechanicalProfiles'
import {DEFAULT_LIGHT_CD,MAX_ILLUMINANCE_LUX,MAX_LIGHT_CD,MIN_SIGHT_LUX} from './opticalProfiles'

const number = (data: FormData, key: string): number => {
  const text = data.get(key)
  if (typeof text !== 'string' || !text.trim() || !Number.isFinite(Number(text))) throw Error('Заполни физические величины конечными числами.')
  return Number(text)
}
const display = (value: number | null, unit: string) => value === null ? 'Не задано' : value.toLocaleString('ru-RU',{maximumSignificantDigits:5}) + ' ' + unit
const optionalNumber = (data: FormData, key: string, previous: number | null | undefined) =>
  data.get(key) ? number(data, key) : previous === undefined ? undefined : null

export function WaterVolumePanel({ object, thermal, disabled, onChange }: { object: SceneObject; thermal?: boolean; disabled: boolean; onChange: (next: SceneObject) => boolean }) {
  const [error, setError] = useState('')
  const value = object.water
  const phase = value?.enthalpyJKg != null && object.height > 0 ? waterPhase(value.enthalpyJKg) : undefined
  const canSetTemperature = thermal || value?.enthalpyJKg != null
  const balance = value?.reagentMol ?? 0
  const reagent = balance > 0 ? 'acid' : balance < 0 ? 'alkali' : 'none'
  const ph = value?.reagentMol !== undefined ? waterPH(value, object) : undefined
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
      const chosen = data.get('waterReagent')
      let reagentMol: number | undefined
      if (isWaterReagent(chosen)) {
        const massKg = number(data, 'waterReagentMassKg')
        if (!physicsNumber(massKg, 1e-9, MAX_WATER_ADDITIVE_KG)) throw Error('Укажи положительную массу кислоты или щёлочи.')
        reagentMol = (chosen === 'acid' ? massKg : -massKg) / waterReagents[chosen].molarMassKg
      } else if (value?.reagentMol !== undefined) reagentMol = 0
      const water = { version: 1, base: data.get('waterBase'), saltKg: number(data, 'waterSalt'), sedimentKg: number(data, 'waterSediment'),
        ...(flow || value?.flow !== undefined ? { flow } : {}), ...(enthalpyJKg !== undefined ? {enthalpyJKg} : {}),
        ...(reagentMol !== undefined ? {reagentMol} : {}) }
      if (!isWaterComposition(water) || !physicsNumber(height, 0, 1e6) || !validWaterHeight(water, height)) throw Error('Проверь глубину слоя и массы примесей.')
      if (!onChange({ ...object, height, water })) setError('Проверь границы сцены, стыки участков и опоры персонажей.')
    } catch (cause) {
      setError((cause as Error).message)
    }
  }
  return <details className="gb-scene-details"><summary>Объём и состав воды</summary>
    {value && <p className="w6-copy">{display(cubicMetresToLitres(waterVolumeM3(object)), 'л')} · проводимость {display(waterConductivitySM(value, object), 'См/м')}</p>}
    {ph !== undefined && <p className="w6-copy">pH при 25 °C · {ph === null ? 'нет оценки' : ph.toLocaleString('ru-RU',{maximumFractionDigits:3})}</p>}
    {phase && <p className="w6-copy">{display(kelvinToCelsius(phase.temperatureK), '°C')} · льда {display(phase.iceFraction * 100, '%')}</p>}
    {value?.enthalpyJKg != null && object.height === 0 && <p className="w6-copy">Сухой слой. Примеси останутся здесь при доливе.</p>}
    <p className="w6-copy">Объём определяется размерами слоя. Для соли оценка проводимости действует до 50 г/л. С кислотой или щёлочью оценка доступна для разбавленного раствора известного состава.</p>
    <form key={JSON.stringify([object.height, value])} onSubmit={submit} aria-label="Объём и состав воды"><fieldset className="gb-properties gb-physics-properties" disabled={disabled}>
      <label className="w6-field"><span>Глубина слоя, м</span><input name="waterHeight" type="number" step="any" min={0} defaultValue={value ? object.height : object.height || .05} required/></label>
      <label className="w6-field"><span>Исходная вода</span><select name="waterBase" defaultValue={value?.base ?? 'unknown'}>
        <option value="unknown">Неизвестный состав</option>
        <option value="pure">Чистая вода</option>
      </select></label>
      <label className="w6-field"><span>Растворённая соль (NaCl), кг</span><input name="waterSalt" type="number" step="any" min="0" max={MAX_WATER_ADDITIVE_KG} defaultValue={value?.saltKg ?? 0} required/></label>
      <label className="w6-field"><span>Песок, кг</span><input name="waterSediment" type="number" step="any" min="0" max={MAX_WATER_ADDITIVE_KG} defaultValue={value?.sedimentKg ?? 0} required/></label>
      <details className="gb-scene-details gb-wide" open={balance !== 0 ? true : undefined}>
        <summary>Кислота и щёлочь</summary>
        <label className="w6-field"><span>Что растворено в воде</span><select name="waterReagent" defaultValue={reagent}>
          <option value="none">Без кислоты и щёлочи</option>
          {Object.entries(waterReagents).map(([key, entry]) => <option key={key} value={key}>{entry.label}</option>)}
        </select></label>
        <label className="w6-field"><span>Масса выбранного вещества, кг</span><input name="waterReagentMassKg" type="number" step="any" min={1e-9} max={MAX_WATER_ADDITIVE_KG}
          defaultValue={reagent === 'none' ? '' : Math.abs(balance) * waterReagents[reagent].molarMassKg}/></label>
        <p className="w6-copy">Это исходный состав слоя. Реакция произойдёт в раунде, когда в воду попадёт второй реагент.</p>
      </details>
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

export function ObjectPhysicsPanel({value,ambientTemperatureK=293.15,canBurn,canEmitLight,canBreak,canSlide,disabled,onChange}:{value?:PhysicsBody|null;ambientTemperatureK?:number;canBurn?:boolean;canEmitLight?:boolean;canBreak?:boolean;canSlide?:boolean;disabled:boolean;onChange:(value:PhysicsBody|null)=>boolean}) {
  const [materialId,setMaterialId]=useState(value?.material.id??''),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),presets=physicsMaterialPresets()
  // A saved snapshot wins over a later catalogue default, including custom values.
  const materials=value?[...presets.filter(material=>material.id!==value.material.id),value.material]:presets
  const material=materials.find(material=>material.id===materialId)
  const [burning, setBurning] = useState(!!value?.combustion)
  const [breakable, setBreakable] = useState(!!value?.structure)
  const [sliding, setSliding] = useState(!!value?.sliding)
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(disabled)return
    setMessage('');setFailed(false)
    try {
      if (!material) throw Error('Выбери физический материал.')
      const data=new FormData(event.currentTarget),next:PhysicsBody={version:1,material:copyPhysicsMaterial(material),massKg:number(data,'physicsMassKg'),temperatureK:celsiusToKelvin(number(data,'physicsTemperatureC')),wetnessFraction:number(data,'physicsWetnessPercent')/100}
      const noise = optionalNumber(data, 'noiseLevelDbAt1m', value?.noiseLevelDbAt1m)
      if (noise !== undefined) next.noiseLevelDbAt1m = noise
      const light = optionalNumber(data, 'lightIntensityCd', value?.lightIntensityCd)
      if (light !== undefined) next.lightIntensityCd = light
      if (canBurn || value?.combustion) {
        if (data.has('simulateCombustion')) next.combustion = {fuelKg:number(data,'fuelKg'),burnRateKgS:number(data,'burnRateKgS'),ignitionTemperatureK:celsiusToKelvin(number(data,'ignitionTemperatureC'))}
        else if (value?.combustion !== undefined) next.combustion = null
      } else if (value?.combustion === null) next.combustion = null
      if (data.has('simulateStructure')) next.structure = {failureJ:number(data,'structureFailureJ'),absorbedJ:number(data,'structureAbsorbedJ')}
      else if (value?.structure !== undefined) next.structure = null
      if (data.has('simulateSliding')) {
        if (material.phase !== 'solid') throw Error('Для скольжения выбери твёрдый материал.')
        next.sliding = {dryFriction:number(data,'dryFriction'), wetFriction:data.get('wetFriction') === '' ? null : number(data,'wetFriction'),
          impactTransfer:number(data,'impactTransfer') / 100, vxMs:value?.sliding?.vxMs ?? 0, vyMs:value?.sliding?.vyMs ?? 0}
      } else if (value?.sliding !== undefined) next.sliding = null
      if (!isPhysicsBody(next)) throw Error('Проверь физические параметры объекта.')
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
      {(canEmitLight || value?.lightIntensityCd !== undefined) && <details className="gb-scene-details gb-wide"><summary>Источник света</summary>
        <label className="w6-field"><span>Сила света, кд</span><input name="lightIntensityCd" type="number" step="any" min="0" max={MAX_LIGHT_CD} defaultValue={value?.lightIntensityCd??''} placeholder={String(DEFAULT_LIGHT_CD)}/>
          <small>Учитывается, когда включён расчёт видимости. Пустое поле — {DEFAULT_LIGHT_CD} кд, ноль — источник не освещает сцену.</small></label>
      </details>}
      {(canBurn || !!value?.combustion) && <details className="gb-scene-details gb-wide"><summary>Топливо и горение</summary>
        <label className="w6-check"><input name="simulateCombustion" type="checkbox" checked={burning} onChange={event=>setBurning(event.currentTarget.checked)}/>Учитывать горение в тепловой сцене</label>
        {burning && <>
          <label className="w6-field"><span>Запас топлива, кг</span><input name="fuelKg" type="number" min="0" max="1e12" step="any" defaultValue={value?.combustion?.fuelKg ?? 1} required/></label>
          <label className="w6-field"><span>Расход сухого топлива, кг/с</span><input name="burnRateKgS" type="number" min="1e-12" max="1e6" step="any" defaultValue={value?.combustion?.burnRateKgS ?? .00005} required/></label>
          <label className="w6-field"><span>Воспламенение от нагрева, °C</span><input name="ignitionTemperatureC" type="number" min="-272.15" max="999726.85" step="any" defaultValue={value?.combustion ? kelvinToCelsius(value.combustion.ignitionTemperatureK) : 300} required/></label>
        </>}
      </details>}
      {(canBreak || !!value?.structure) && <details className="gb-scene-details gb-wide"><summary>Прочность{value?.structure ? ' · ' + display(value.structure.absorbedJ, 'Дж') + ' из ' + display(value.structure.failureJ, 'Дж') : ''}</summary>
        <label className="w6-check"><input name="simulateStructure" type="checkbox" checked={breakable} onChange={event=>setBreakable(event.currentTarget.checked)}/>Разрешить разрушение ударами</label>
        {breakable && <>
          <label className="w6-field"><span>Порог разрушения, Дж</span><input name="structureFailureJ" type="number" step="any" min=".001" max={MAX_STRUCTURAL_ENERGY_J} defaultValue={value?.structure?.failureJ ?? ''} required/></label>
          <label className="w6-field"><span>Уже накоплено от ударов, Дж</span><input name="structureAbsorbedJ" type="number" step="any" min="0" max={MAX_STRUCTURAL_ENERGY_J} defaultValue={value?.structure?.absorbedJ ?? 0} required/></label>
          <p className="w6-copy">Удары складываются. При достижении порога объект перестаёт быть опорой и преградой.</p>
        </>}
      </details>}
      {(canSlide || !!value?.sliding) && <details className="gb-scene-details gb-wide">
        <summary>Скольжение по полу{isSliding(value?.sliding) ? ' · предмет движется' : ''}</summary>
        <label className="w6-check"><input name="simulateSliding" type="checkbox" checked={sliding} onChange={event=>setSliding(event.currentTarget.checked)}/>Разрешить толчки</label>
        {sliding && <>
          <label className="w6-field"><span>Коэффициент трения насухо</span><input name="dryFriction" type="number" step="any" min="0" max={MAX_SLIDE_FRICTION} defaultValue={value?.sliding?.dryFriction ?? .35} required/></label>
          <label className="w6-field"><span>Коэффициент трения при полном смачивании</span><input name="wetFriction" type="number" step="any" min="0" max={MAX_SLIDE_FRICTION} defaultValue={value?.sliding?.wetFriction ?? ''} placeholder="Как у сухого предмета"/></label>
          <label className="w6-field"><span>Энергия, передаваемая преграде, %</span><input name="impactTransfer" type="number" step="any" min="0" max="100" defaultValue={(value?.sliding?.impactTransfer ?? 0)*100} required/></label>
          <p className="w6-copy">Трение задаётся для пары предмета и пола. Энергия столкновения учитывается у преграды с заданной прочностью.</p>
        </>}
      </details>}
      <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" type="submit">Сохранить физический профиль</button><button className="w6-button" type="button" disabled={!value} onClick={()=>{if(onChange(null)){setFailed(false);setMessage('Физический профиль объекта снят.')}}}>Снять физический профиль</button></div>
    </fieldset></form>
    {material&&<details><summary>Свойства материала и основание</summary><dl className="w6-copy"><dt>Плотность</dt><dd>{display(material.densityKgM3,'кг/м³')}</dd><dt>Удельная теплоёмкость</dt><dd>{display(material.specificHeatJKgK,'Дж/(кг·K)')}</dd><dt>Теплопроводность</dt><dd>{display(material.thermalConductivityWMK,'Вт/(м·K)')}</dd><dt>Электропроводность</dt><dd>{display(material.electricalConductivitySM,'См/м')}</dd><dt>Температура профиля</dt><dd>{display(kelvinToCelsius(material.referenceTemperatureK),'°C')}</dd></dl><p className="w6-copy">{material.note}</p><p className="w6-copy">Неизвестная проводимость не означает изоляцию. Перенос свойств на другие температуры и составы требует отдельного расчёта.</p></details>}
    <p role={failed?'alert':'status'} className={failed?'w6-error':'w6-notice'}>{message}</p>
  </details>
}

export function LandingPhysicsPanel({value,falling,disabled,onChange}:{value?:LandingProfile|null;falling:boolean;disabled:boolean;onChange:(value:LandingProfile|null)=>boolean}) {
  const [enabled, setEnabled] = useState(!!value), [message, setMessage] = useState('')
  const regions = useId()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    try {
      const data = new FormData(event.currentTarget)
      const next = data.has('landingEnabled') ? {
        massKg:number(data,'landingMassKg'), region:String(data.get('landingRegion') ?? '').trim(), contactCm2:number(data,'landingContactCm2'),
      } : null
      if (next && !isLandingProfile(next)) throw Error('Проверь массу, площадь и область контакта.')
      setMessage(onChange(next) ? '' : 'Не удалось сохранить параметры приземления.')
    } catch (error) { setMessage((error as Error).message) }
  }
  return <details className="gb-scene-details"><summary>Удар при приземлении{falling ? ' · герой падает' : ''}</summary>
    <form onSubmit={submit} aria-label="Параметры приземления"><fieldset className="gb-properties gb-physics-properties" disabled={disabled}>
      <label className="w6-check gb-wide"><input name="landingEnabled" type="checkbox" checked={enabled} onChange={event=>setEnabled(event.currentTarget.checked)}/>Рассчитывать травму при падении</label>
      {enabled && <>
        <label className="w6-field"><span>Масса с экипировкой, кг</span><input name="landingMassKg" type="number" min=".001" max="100000" step="any" defaultValue={value?.massKg ?? ''} required/></label>
        <label className="w6-field"><span>Площадь контакта, см²</span><input name="landingContactCm2" type="number" min=".01" max="1000000" step="any" defaultValue={value?.contactCm2 ?? ''} required/></label>
        <label className="w6-field gb-wide"><span>Область контакта</span><input name="landingRegion" list={regions} defaultValue={value?.region ?? ''} maxLength={160} required/>
          <datalist id={regions}>{bodyRegions.map(region=><option key={region.key} value={region.key} label={region.label}/>)}</datalist>
        </label>
        <p className="w6-copy gb-wide">В листе героя для этой области нужна калибровка тупого удара. При приземлении учитываются покрывающие область доспехи.</p>
      </>}
      <div className="w6-buttons gb-wide"><button type="submit" className="w6-button w6-primary">Сохранить параметры приземления</button></div>
    </fieldset></form>
    {message && <p role="alert" className="w6-error">{message}</p>}
  </details>
}

const roomField = (room:AirRoom, key:string) => 'room-'+room.id+'-'+key

function readRoom(data:FormData,room:AirRoom):AirRoom {
  const field = (key:string) => number(data,roomField(room,key))
  const point = (end:'min'|'max') => ({x:field(end+'-x'),y:field(end+'-y'),z:field(end+'-z')})
  return {id:room.id,name:String(data.get(roomField(room,'name')) ?? '').trim(),min:point('min'),max:point('max'),
    ambientTemperatureK:celsiusToKelvin(field('celsius')),
    air:{oxygenFraction:field('oxygen')/100,smokeKg:field('smoke'),steamKg:field('steam'),fogKg:field('fog')}}
}

function AirRoomFields({room,added,onRemove}:{room:AirRoom;added:boolean;onRemove:()=>void}) {
  const values = [
    ['celsius','Температура, °C',kelvinToCelsius(room.ambientTemperatureK),-273.15,999726.85],
    ['oxygen','Кислород, %',room.air.oxygenFraction*100,0,100],
    ['smoke','Дым, кг',room.air.smokeKg,0,MAX_AEROSOL_KG],
    ['steam','Пар, кг',room.air.steamKg,0,MAX_AEROSOL_KG],
    ['fog','Туман, кг',room.air.fogKg,0,MAX_AEROSOL_KG],
  ] as const
  return <details className="gb-scene-details" data-air-room open={added || undefined}>
    <summary>{room.name}</summary>
    <div className="gb-properties">
      <label className="w6-field gb-wide"><span>Название комнаты</span><input name={roomField(room,'name')} defaultValue={room.name} maxLength={80} required/></label>
      {airAxes.map(axis=>(['min','max'] as const).map(end=><label className="w6-field" key={axis+end}>
        <span>{axis.toUpperCase()} {end==='min'?'от':'до'}, м</span><input name={roomField(room,end+'-'+axis)} type="number" step="any" defaultValue={room[end][axis]} required/>
      </label>))}
      {values.map(([key,label,value,min,max])=><label className="w6-field" key={key}><span>{label}</span><input name={roomField(room,key)} type="number" step="any" min={min} max={max} defaultValue={value} required/></label>)}
      <button className="w6-button gb-wide" type="button" onClick={onRemove}>Убрать комнату</button>
    </div>
  </details>
}

function SavedAirDoors({scene}:{scene:Scene}) {
  const layout = sceneAir(scene)
  if (!layout || layout.regions.length < 2) return null
  const label = (index:number) => index < 0 ? 'Снаружи' : layout.regions[index].room?.name ?? 'Пространство вне комнат'
  const links = scene.objects.flatMap(door => {
    const link = airPortal(scene,layout,door)
    return link ? [{door,link}] : []
  })
  return <details className="gb-scene-details"><summary>Связи сохранённых дверей · {links.length}</summary>
    {links.length ? <ul>{links.map(({door,link})=><li key={door.id}>{door.name} · {label(link.a)} ↔ {label(link.b)} · {door.open?'открыта':'закрыта'}</li>)}</ul> :
      <p className="w6-copy">Дверь должна разделять две зоны воздуха. Проверь, где проходят границы помещений.</p>}
  </details>
}

export function EnvironmentPhysicsPanel({value,scene,disabled,onChange}:{value?:PhysicsEnvironment|null;scene?:Scene;disabled:boolean;onChange:(value:PhysicsEnvironment|null)=>boolean}) {
  const [message,setMessage]=useState(''),[failed,setFailed]=useState(false)
  const [simulate, setSimulate] = useState(!!value?.atmosphere)
  const [simulateVision, setSimulateVision] = useState(!!value?.vision)
  const air = value?.atmosphere
  const [simulateFog, setSimulateFog] = useState(air?.fogKg != null)
  const [rooms,setRooms] = useState<AirRoom[]>(value?.airRooms ?? [])
  const useFog = simulateFog || rooms.length > 0
  function addRoom(form:HTMLFormElement|null) {
    if (!scene || !form || rooms.length >= MAX_AIR_ROOMS) return
    const data = new FormData(form)
    const edge = Math.max(0,...rooms.map(room => Number(data.get(roomField(room,'max-x'))) || room.max.x))
    const x = edge < scene.width ? edge : 0
    setRooms([...rooms,{id:crypto.randomUUID(),name:'Комната '+(rooms.length+1),
      min:{x,y:0,z:scene.groundZ},max:{x:rooms.length?scene.width:scene.width/2,y:scene.depth,z:Math.min(scene.maxZ,scene.groundZ+3)},
      ambientTemperatureK:value?.ambientTemperatureK??293.15,air:{oxygenFraction:OUTSIDE_OXYGEN_FRACTION,smokeKg:0,steamKg:0,fogKg:0}}])
  }
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(disabled)return
    setMessage('');setFailed(false)
    try {
      const data=new FormData(event.currentTarget),next:PhysicsEnvironment={version:1,gravityMs2:number(data,'physicsGravityMs2'),ambientTemperatureK:celsiusToKelvin(number(data,'physicsAmbientC'))}
      const noise = optionalNumber(data, 'backgroundNoiseDb', value?.backgroundNoiseDb)
      if (noise !== undefined) next.backgroundNoiseDb = noise
      if (data.has('simulateThermal')) {
        const reactionHeat = data.has('reactionHeat')
        const fogKg = useFog ? number(data, 'fogKg') : air?.fogKg === undefined ? undefined : null
        next.atmosphere = {
          oxygenFraction:number(data,'oxygenPercent')/100, smokeKg:number(data,'smokeKg'),
          steamKg:number(data,'steamKg') + (fogKg === null ? air?.fogKg ?? 0 : 0),
          outsideTemperatureK:celsiusToKelvin(number(data,'outsideC')), doorVentilation:data.has('doorVentilation'),
          ...(reactionHeat || air?.reactionHeat !== undefined ? {reactionHeat} : {}),
          ...(fogKg !== undefined ? {fogKg} : {}),
        }
        if (scene && rooms.length) {
          const configured = rooms.map(room => readRoom(data,room))
          if (!isAirRoomList(configured) || !airRoomsFit(configured,scene)) {
            throw Error('Проверь названия, параметры воздуха и границы комнат. Объёмы должны помещаться в сцене и не пересекаться.')
          }
          next.airRooms = configured
        } else if (value?.airRooms !== undefined) next.airRooms = scene ? null : value.airRooms
      }
      else if (air !== undefined) {
        next.atmosphere = null
        if (value?.airRooms !== undefined) next.airRooms = null
      }
      if (data.has('simulateVision')) next.vision = {ambientLux:number(data,'ambientLux'),detectionLux:number(data,'detectionLux')}
      else if (value?.vision !== undefined) next.vision = null
      if (!isPhysicsEnvironment(next)) throw Error('Проверь значения среды, в том числе освещённость и порог видимости.')
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
          <p className="w6-copy">{rooms.length ? 'Общие параметры ниже действуют вне комнат. Внутренние открытые двери смешивают воздух соседних зон.' :
            'Без комнат воздух перемешивается по всей сцене. Открытые двери можно использовать для проветривания.'}</p>
          <label className="w6-check"><input name="doorVentilation" type="checkbox" defaultChecked={air?.doorVentilation}/>Проветривать через двери наружу</label>
          <label className="w6-check"><input name="reactionHeat" type="checkbox" defaultChecked={air?.reactionHeat}/>Учитывать нагрев при нейтрализации</label>
          <p className="w6-copy">Кислота и щёлочь выделяют тепло и при выпуске, и при смешивании потоков. Тепло сначала плавит лёд или нагревает воду, а при кипении образуется пар.</p>
          <label className="w6-field"><span>Температура снаружи, °C</span><input name="outsideC" type="number" step="any" min="-273.15" max="999726.85" defaultValue={air ? kelvinToCelsius(air.outsideTemperatureK) : 20} required/></label>
          <label className="w6-field"><span>Доля кислорода, %</span><input name="oxygenPercent" type="number" step="any" min="0" max="100" defaultValue={(air?.oxygenFraction ?? OUTSIDE_OXYGEN_FRACTION)*100} required/></label>
          <label className="w6-field"><span>Дым, кг</span><input name="smokeKg" type="number" step="any" min="0" max={MAX_AEROSOL_KG} defaultValue={air?.smokeKg ?? 0} required/></label>
          <label className="w6-field"><span>Водяной пар, кг</span><input name="steamKg" type="number" step="any" min="0" max={MAX_AEROSOL_KG} defaultValue={air?.steamKg ?? 0} required/></label>
          <details className="gb-scene-details gb-wide"><summary>Влажность и туман{air?.fogKg != null ? ' · включено' : ''}</summary>
            <label className="w6-check"><input name="simulateFog" type="checkbox" checked={useFog} disabled={rooms.length>0} onChange={event=>setSimulateFog(event.currentTarget.checked)}/>Рассчитывать конденсацию пара</label>
            {useFog && <>
              <label className="w6-field"><span>Капли тумана в воздухе, кг</span><input name="fogKg" type="number" step="any" min="0" max={MAX_AEROSOL_KG} defaultValue={air?.fogKg ?? 0} required/></label>
              <p className="w6-copy">Избыток пара конденсируется в капли. Туман мешает обзору, а проветривание выводит пар и капли.</p>
            </>}
            {rooms.length ? <p className="w6-copy">Конденсация включена для обмена влагой между комнатами.</p> :
              air?.fogKg ? <p className="w6-copy">При отключении расчёта масса капель прибавится к массе пара.</p> : null}
          </details>
          {scene && <details className="gb-scene-details gb-wide">
            <summary>Помещения{rooms.length ? ' · '+rooms.length : ''}</summary>
            <p className="w6-copy">Задай границы комнат в метрах. Поставь дверь между зонами. Для выхода наружу поставь дверь вплотную к краю сцены.</p>
            {rooms.map(room=><AirRoomFields key={room.id} room={room} added={!value?.airRooms?.some(saved=>saved.id===room.id)} onRemove={()=>setRooms(rooms.filter(item=>item.id!==room.id))}/>)}
            <button className="w6-button" type="button" disabled={rooms.length>=MAX_AIR_ROOMS} onClick={event=>addRoom(event.currentTarget.form)}>Добавить комнату</button>
            {rooms.length>0 && <p className="w6-copy">Удаление комнаты снимает её параметры. Освобождённое пространство использует общие условия.</p>}
            <SavedAirDoors scene={scene}/>
          </details>}
        </>}
      </details>
      <details className="gb-scene-details gb-wide"><summary>Свет и видимость{value?.vision ? ' · включено' : ''}</summary>
        <label className="w6-check"><input name="simulateVision" type="checkbox" checked={simulateVision} onChange={event=>setSimulateVision(event.currentTarget.checked)}/>Учитывать освещение, преграды, дым и туман</label>
        {simulateVision && <>
          <label className="w6-field"><span>Фоновый свет, лк</span><input name="ambientLux" type="number" min="0" max={MAX_ILLUMINANCE_LUX} step="any" defaultValue={value?.vision?.ambientLux??.2} required/><small>Общий свет сцены без фонарей.</small></label>
          <label className="w6-field"><span>Порог видимости, лк</span><input name="detectionLux" type="number" min={MIN_SIGHT_LUX} max={MAX_ILLUMINANCE_LUX} step="any" defaultValue={value?.vision?.detectionLux??1} required/><small>Ниже этого порога цель теряется из виду.</small></label>
          <p className="w6-copy">Герой видит только раскрытые цели, если хватает света и ничто не закрывает обзор. Схема местности и отметки звука остаются доступны.</p>
        </>}
      </details>
      <div className="w6-buttons gb-wide"><button className="w6-button w6-primary" type="submit">Сохранить условия среды</button><button className="w6-button" type="button" disabled={!value} onClick={()=>{if(onChange(null)){setFailed(false);setMessage('Условия среды сняты; профили объектов сохранены.')}}}>Снять условия среды</button></div>
    </fieldset></form><p role={failed?'alert':'status'} className={failed?'w6-error':'w6-notice'}>{message}</p>
  </details>
}
