import {MAX_TEMPERATURE_K, physicsId, physicsKeys, physicsNumber, physicsRecord} from './physicsUnits'

export const PURE_WATER_CONDUCTIVITY_SM = 5.5e-6

export type PhysicsMaterial = {
  id: string
  name: string
  phase: 'solid' | 'liquid' | 'gas'
  referenceTemperatureK: number
  densityKgM3: number
  specificHeatJKgK: number | null
  thermalConductivityWMK: number | null
  electricalConductivitySM: number | null
  basis: 'approximation' | 'custom'
  note: string
}
const keys = ['id', 'name', 'phase', 'referenceTemperatureK', 'densityKgM3', 'specificHeatJKgK', 'thermalConductivityWMK', 'electricalConductivitySM', 'basis', 'note'] as const
export function isPhysicsMaterial(value: unknown): value is PhysicsMaterial {
  if (!physicsRecord(value) || !physicsKeys(value, keys)) return false
  return physicsId(value.id) && typeof value.name === 'string' && !!value.name.trim() && value.name.length <= 120 &&
    typeof value.phase === 'string' && ['solid', 'liquid', 'gas'].includes(value.phase) &&
    typeof value.basis === 'string' && ['approximation', 'custom'].includes(value.basis) &&
    physicsNumber(value.referenceTemperatureK, 0, MAX_TEMPERATURE_K) && physicsNumber(value.densityKgM3, 1e-12, 1e12) &&
    ['specificHeatJKgK', 'thermalConductivityWMK', 'electricalConductivitySM'].every(key => value[key] === null || physicsNumber(value[key], 0, 1e12)) &&
    typeof value.note === 'string' && !!value.note.trim() && value.note.length <= 2000
}
export function copyPhysicsMaterial(value: PhysicsMaterial): PhysicsMaterial {
  if (!isPhysicsMaterial(value)) throw Error('Проверь физический материал, единицы и основание его параметров.')
  return {...value}
}

// Opt-in editor examples, not canonical materials or automatic spell rules.
// Null means unknown; it must never be interpreted as zero conductivity.
const approximation = 'Приближённый профиль для настройки мастером. Свойства зависят от состава и температуры; это не утверждённый канон.'
const presets: readonly Readonly<PhysicsMaterial>[] = [
  {id:'water-pure',name:'Чистая вода · пример',phase:'liquid',referenceTemperatureK:298.15,densityKgM3:997,specificHeatJKgK:4180,thermalConductivityWMK:.6,electricalConductivitySM:PURE_WATER_CONDUCTIVITY_SM,basis:'approximation',note:'Слабая собственная проводимость при 25 °C: NIST, https://nvlpubs.nist.gov/nistpubs/jres/100/5/j15wu.pdf . Остальные значения приближены. Проводимость не учитывает примеси, изменение температуры или пробой; это не защита от электрического воздействия.'},
  {id:'water-unspecified',name:'Вода с неизвестным составом',phase:'liquid',referenceTemperatureK:293.15,densityKgM3:1000,specificHeatJKgK:4180,thermalConductivityWMK:.6,electricalConductivitySM:null,basis:'approximation',note:approximation},
  {id:'wood',name:'Древесина · пример',phase:'solid',referenceTemperatureK:293.15,densityKgM3:650,specificHeatJKgK:1700,thermalConductivityWMK:.12,electricalConductivitySM:null,basis:'approximation',note:approximation},
  {id:'stone',name:'Камень · пример',phase:'solid',referenceTemperatureK:293.15,densityKgM3:2600,specificHeatJKgK:800,thermalConductivityWMK:2,electricalConductivitySM:null,basis:'approximation',note:approximation},
  {id:'steel',name:'Сталь · пример',phase:'solid',referenceTemperatureK:293.15,densityKgM3:7850,specificHeatJKgK:470,thermalConductivityWMK:45,electricalConductivitySM:1.4e6,basis:'approximation',note:approximation},
  {id:'copper',name:'Медь · пример',phase:'solid',referenceTemperatureK:293.15,densityKgM3:8960,specificHeatJKgK:385,thermalConductivityWMK:400,electricalConductivitySM:5.96e7,basis:'approximation',note:approximation},
  {id:'air',name:'Воздух · пример',phase:'gas',referenceTemperatureK:293.15,densityKgM3:1.2,specificHeatJKgK:1005,thermalConductivityWMK:.026,electricalConductivitySM:null,basis:'approximation',note:approximation},
].map(value => Object.freeze(value as PhysicsMaterial))
export const physicsMaterialPresets = (): PhysicsMaterial[] => presets.map(copyPhysicsMaterial)
export const physicsMaterialPreset = (id: string): PhysicsMaterial | undefined => {
  const value = presets.find(material => material.id === id)
  return value ? copyPhysicsMaterial(value) : undefined
}
