import { useEffect, useId, useState } from 'react'
import AbilityVisualEffect from './AbilityVisualEffect'
import { abilityVisualDefaults, abilityVisualFamilies, abilityVisualFamilyById, abilityVisualPhases, resolveAbilityVisual } from './abilityVisuals'
import type { AbilityVisualPhase, AbilityVisualShape, AbilityVisualSource, AbilityVisualSpec } from './abilityVisuals'
import { magicGroups, magicSchools } from './magicCatalog'
import './abilityVisuals.css'

const visualFamilyGroups = magicGroups.map(group => ({ ...group, families: abilityVisualFamilies.filter(family =>
  magicSchools.some(school => school.group === group.id && school.name === family.schoolLabel.split(' · ')[0])) }))

export type AbilityVisualPickerProps = {
  value?: AbilityVisualSpec
  onChange: (value: AbilityVisualSpec | undefined) => void
  schoolId?: string
  basisSchoolId?: string
  mechanism?: string
  shape?: AbilityVisualShape
}
export default function AbilityVisualPicker({ value, onChange, schoolId, basisSchoolId, mechanism, shape = 'point' }: AbilityVisualPickerProps) {
  const fieldId = 'visual-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [phase, setPhase] = useState<AbilityVisualPhase>('impact')
  const [paused, setPaused] = useState(false)
  const [autoPlay, setAutoPlay] = useState(false)
  const [replay, setReplay] = useState(0)
  const source: AbilityVisualSource = { schoolId, basisSchoolId, mechanism }
  const inferred = resolveAbilityVisual(source)
  const selected = value ?? inferred
  const family = abilityVisualFamilyById(selected.familyId)
  const scale = selected.scale ?? abilityVisualDefaults.scale
  const intensity = selected.intensity ?? abilityVisualDefaults.intensity
  const durationMs = selected.durationMs ?? abilityVisualDefaults.durationMs
  useEffect(() => {
    if (!autoPlay || paused || !family) return
    const timer = setTimeout(() => setPhase(current => {
      const index = abilityVisualPhases.findIndex(item => item.id === current)
      return abilityVisualPhases[(index + 1) % abilityVisualPhases.length].id
    }), durationMs)
    return () => clearTimeout(timer)
  }, [autoPlay, paused, family, phase, durationMs, replay])
  function configure(patch: Partial<AbilityVisualSpec>) { onChange({ ...selected, ...patch }) }
  function replayPreview() {
    setPaused(false)
    setReplay(current => current + 1)
    if (autoPlay) setPhase('preparation')
  }
  return <fieldset className="w6-visual-picker"><legend>Визуальный эффект способности</legend>
    <div className="w6-visual-picker-layout">
      <div className="w6-visual-picker-settings">
        <label htmlFor={fieldId + '-family'}>Оформление эффекта
          <select id={fieldId + '-family'} value={value?.familyId ?? 'auto'} onChange={event => {
            const id = event.currentTarget.value
            onChange(id === 'auto' ? undefined : { ...selected, familyId: id as AbilityVisualSpec['familyId'] })
          }}>
            <option value="auto">По школе: {abilityVisualFamilyById(inferred.familyId)?.name ?? 'без анимации'}</option>
            <option value="none">Без анимации</option>
            {visualFamilyGroups.map(group => <optgroup key={group.id} label={group.label}>
              {group.families.map(item => <option key={item.id} value={item.id}>{item.schoolLabel} · {item.name}</option>)}
            </optgroup>)}
          </select>
        </label>
        <p className="w6-visual-picker-description">{family?.description ?? 'Эта способность показывается без анимированного эффекта.'} Оформление не меняет действие способности.</p>
        {family && <>
          <label htmlFor={fieldId + '-scale'}>Масштаб изображения <output>{Number(scale.toFixed(2))}×</output>
            <input id={fieldId + '-scale'} type="range" min=".25" max="4" step=".05" value={scale} onChange={event => configure({ scale: Number(event.currentTarget.value) })}/>
          </label>
          <label htmlFor={fieldId + '-intensity'}>Количество частиц <output>{Number(intensity.toFixed(2))}×</output>
            <input id={fieldId + '-intensity'} type="range" min=".25" max="2" step=".05" value={intensity} onChange={event => configure({ intensity: Number(event.currentTarget.value) })}/>
          </label>
          <label htmlFor={fieldId + '-duration'}>Темп анимации <output>{(durationMs / 1000).toFixed(1)} с</output>
            <input id={fieldId + '-duration'} type="range" min="500" max="10000" step="100" value={durationMs} onChange={event => configure({ durationMs: Number(event.currentTarget.value) })}/>
          </label>
        </>}
      </div>
      <figure className="w6-visual-preview">
        {family && <div className="w6-visual-phase-list" aria-label="Стадии эффекта">{abilityVisualPhases.map(item =>
          <button key={item.id} type="button" aria-pressed={phase === item.id} onClick={() => { setAutoPlay(false); setPhase(item.id); setReplay(current => current + 1) }}>{item.label}</button>)}</div>}
        <svg viewBox="0 0 300 200" role="img" aria-label={family ? `Предпросмотр: ${family.name}, ${abilityVisualPhases.find(item => item.id === phase)?.label}` : 'Предпросмотр: без анимации'}>
          <defs><pattern id={fieldId + '-grid'} width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#292532" strokeWidth=".6"/></pattern></defs>
          <rect width="300" height="200" fill={`url(#${fieldId}-grid)`}/>
          <path d="M80 100H220" stroke="#55475c" strokeDasharray="3 5"/>
          {[80, 220].map((x, index) => <g key={x} transform={`translate(${x} 100)`}>
            <circle r="10" fill="#2e293b" stroke={index ? '#9d8399' : '#b59d79'} strokeWidth="1.5"/>
            <circle cy="-2.5" r="3" fill={index ? '#ba9db3' : '#d7bf99'}/>
            <path d="M-5 5Q0-2 5 5" fill={index ? '#ba9db3' : '#d7bf99'}/>
          </g>)}
          {family && <AbilityVisualEffect key={replay + '-' + selected.familyId + '-' + phase} familyId={selected.familyId}
            start={{ x: 80, y: 100 }} end={{ x: 220, y: 100 }} phase={phase} shape={shape} radius={13}
            coneAngleDeg={50} scale={scale} intensity={intensity} durationMs={durationMs} paused={paused}/>}
          <text x="80" y="180" textAnchor="middle" fill="#b7a992" fontSize="10">Источник</text>
          <text x="220" y="180" textAnchor="middle" fill="#b7a0b4" fontSize="10">Цель</text>
        </svg>
        {family && <div className="w6-visual-preview-controls">
          <button type="button" onClick={() => setPaused(current => !current)}>{paused ? 'Продолжить' : 'Пауза'}</button>
          <button type="button" onClick={replayPreview}>Повторить</button>
          <button type="button" aria-pressed={autoPlay} onClick={() => { setAutoPlay(current => !current); setPaused(false); setPhase('preparation') }}>{autoPlay ? 'Остановить смену стадий' : 'Показать все стадии'}</button>
        </div>}
        <figcaption>Предпросмотр оформления. Радиус, дальность и момент применения задаются параметрами способности и событиями сцены.</figcaption>
      </figure>
    </div>
  </fieldset>
}
