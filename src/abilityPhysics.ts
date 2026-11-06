import { calculateCircuit, pointInObject } from './electricalCircuit'
import type { CircuitResult, DischargeSettings } from './electricalCircuit'
import { physicsId, physicsKeys, physicsNumber, physicsRecord, cubicMetresToLitres, litresToCubicMetres } from './physicsUnits'
import { MAX_SCENE_OBJECTS, sceneObject } from './scenes'
import type { Scene, SceneObject, ScenePosition } from './sceneTypes'
import { applyHeat, MAX_ABILITY_HEAT_KJ, thermalTarget } from './thermalPhysics'
import type { HeatOutcome } from './thermalPhysics'
import { MAX_PUSH_IMPULSE_NS, MAX_STRUCTURAL_ENERGY_J } from './mechanicalProfiles'
import { strikeStructure } from './structuralPhysics'
import type { StructuralImpactOutcome } from './structuralPhysics'
import { pushObject } from './horizontalPhysics'
import type { PushOutcome } from './horizontalPhysics'
import { isVariableWater, isWaterComposition, liquidEnthalpy, liquidWaterHeight, MAX_WATER_ADDITIVE_KG, MIN_WATER_HEIGHT_M, pureWater, waterConductivitySM, waterEnthalpy, waterVolumeM3 } from './waterPhysics'
import type { WaterComposition } from './waterPhysics'

export type AbilityPhysicsEffect =
  | { kind: 'create-water'; widthM: number; depthM: number; heightM: number }
  | { kind: 'fill-water'; volumeL: number }
  | { kind: 'add-substance'; substance: 'salt' | 'sediment'; massKg: number }
  | ({ kind: 'discharge' } & DischargeSettings)
  | { kind: 'heat'; energyKJ: number }
  | { kind: 'structural-impact'; energyJ: number }
  | { kind: 'push-object'; impulseNs: number }
export type AbilityPhysicsOutcome =
  | { kind: 'water'; change: 'created' | 'filled' | 'salt' | 'sediment'; objectId: string; volumeL: number; composition: WaterComposition; conductivitySM: number | null }
  | { kind: 'discharge'; circuit: CircuitResult; thresholdA: number }
  | HeatOutcome
  | StructuralImpactOutcome
  | PushOutcome

const isPoint = (point: unknown): point is ScenePosition =>
  physicsRecord(point) && physicsKeys(point, ['x', 'y', 'z']) && Object.values(point).every(v => physicsNumber(v, -1e6, 1e6))
const inFrame = (p: ScenePosition, scene: Scene) =>
  p.x >= 0 && p.x <= scene.width && p.y >= 0 && p.y <= scene.depth && p.z >= scene.minZ && p.z <= scene.maxZ

export function isAbilityPhysicsEffect(value: unknown): value is AbilityPhysicsEffect {
  if (!physicsRecord(value)) return false
  switch (value.kind) {
    case 'create-water':
      return physicsKeys(value, ['kind', 'widthM', 'depthM', 'heightM']) &&
        physicsNumber(value.widthM, .1, 1e6) && physicsNumber(value.depthM, .1, 1e6) && physicsNumber(value.heightM, MIN_WATER_HEIGHT_M, 1e6)
    case 'fill-water':
      return physicsKeys(value, ['kind', 'volumeL']) && physicsNumber(value.volumeL, .001, 1e12)
    case 'add-substance':
      return physicsKeys(value, ['kind', 'substance', 'massKg']) &&
        (value.substance === 'salt' || value.substance === 'sediment') && physicsNumber(value.massKg, 1e-9, MAX_WATER_ADDITIVE_KG)
    case 'discharge':
      return physicsKeys(value, ['kind', 'returnContact', 'voltageV', 'limitA', 'durationMs', 'thresholdA']) && isPoint(value.returnContact) &&
        physicsNumber(value.voltageV, 1e-6, 1e6) && physicsNumber(value.limitA, 1e-9, 1e6) &&
        physicsNumber(value.durationMs, .001, 86400000) && physicsNumber(value.thresholdA, 1e-9, value.limitA)
    case 'heat':
      return physicsKeys(value, ['kind', 'energyKJ']) && physicsNumber(value.energyKJ, -MAX_ABILITY_HEAT_KJ, MAX_ABILITY_HEAT_KJ) &&
        Math.abs(value.energyKJ) >= .001
    case 'structural-impact':
      return physicsKeys(value, ['kind', 'energyJ']) && physicsNumber(value.energyJ, .001, MAX_STRUCTURAL_ENERGY_J)
    case 'push-object':
      return physicsKeys(value, ['kind', 'impulseNs']) && physicsNumber(value.impulseNs, .001, MAX_PUSH_IMPULSE_NS)
    default: return false
  }
}

function waterOutcome(object: SceneObject, composition: WaterComposition, change: Extract<AbilityPhysicsOutcome, { kind: 'water' }>['change']): AbilityPhysicsOutcome {
  return {
    kind: 'water', change, objectId: object.id, volumeL: cubicMetresToLitres(waterVolumeM3(object)),
    composition: { ...composition }, conductivitySM: waterConductivitySM(composition, object),
  }
}

// Only called on the private candidate of a confirmed release, at its exact
// place in the round. Persisting the candidate is the round command's job.
export function applyAbilityPhysics(scene: Scene, aim: ScenePosition, waterId: string, effect: AbilityPhysicsEffect, origin?: ScenePosition): AbilityPhysicsOutcome {
  if (!isAbilityPhysicsEffect(effect) || !inFrame(aim, scene)) throw Error('Проверь параметры физического действия и точку выпуска.')
  switch (effect.kind) {
    case 'create-water': {
      const { widthM, depthM, heightM } = effect
      if (!inFrame({ x: aim.x - widthM / 2, y: aim.y - depthM / 2, z: aim.z }, scene) ||
          !inFrame({ x: aim.x + widthM / 2, y: aim.y + depthM / 2, z: aim.z + heightM }, scene)) throw Error('Объём воды выходит за пределы сцены.')
      if (scene.objects.length >= MAX_SCENE_OBJECTS || !physicsId(waterId) || scene.objects.some(o => o.id === waterId)) {
        throw Error('Для нового объёма воды нужно свободное место в списке объектов и уникальный ID.')
      }
      if (scene.objects.some(o => o.water && Math.abs(o.x - aim.x) < (o.width + widthM) / 2 - 1e-8 &&
          Math.abs(o.y - aim.y) < (o.depth + depthM) / 2 - 1e-8 &&
          ((o.water.flow || o.height === 0 && o.water.enthalpyJKg != null) && aim.z <= o.z && aim.z + heightM >= o.z ||
            Math.min(o.z + o.height, aim.z + heightM) - Math.max(o.z, aim.z) > 1e-8))) {
        throw Error('Выбери свободное место для отдельного объёма воды.')
      }
      const water = pureWater()
      const object = { ...sceneObject('water', waterId, aim), width: widthM, depth: depthM, height: heightM, water }
      scene.objects.push(object)
      return waterOutcome(object, water, 'created')
    }
    case 'fill-water': {
      const cells = scene.objects.filter(o => o.water && (isVariableWater(o.water) || scene.physics?.atmosphere) && pointInObject(o, aim)), cell = cells[0]
      if (cells.length !== 1 || !cell.water) throw Error('Выбери один участок растекания или водный слой в тепловой сцене.')
      const height = cell.height + litresToCubicMetres(effect.volumeL) / (cell.width * cell.depth)
      if (height === cell.height || cell.z + height > scene.maxZ) throw Error('Проверь объём и верхнюю границу сцены.')
      const current = cell.water, ambient = scene.physics?.ambientTemperatureK ?? 293.15
      if (current.enthalpyJKg != null || scene.physics?.atmosphere) {
        const oldFraction = cell.height / height
        const incoming = liquidEnthalpy(ambient)
        cell.water = { ...current, base:cell.height > 0 ? current.base : 'pure', enthalpyJKg:incoming + (waterEnthalpy(current, ambient) - incoming) * oldFraction }
      } else cell.water = cell.height > 0 ? { ...current } : { ...pureWater(), flow: true }
      cell.height = height
      return waterOutcome(cell, cell.water, 'filled')
    }
    case 'add-substance': {
      const volumes = scene.objects.filter(o => o.water && liquidWaterHeight(o.water, o.height) > 0 &&
        pointInObject({ ...o, height:liquidWaterHeight(o.water, o.height) }, aim)), volume = volumes[0]
      if (volumes.length !== 1 || !volume.water) throw Error('Выбери точку внутри одного жидкого объёма воды с заданным составом.')
      const field = effect.substance === 'salt' ? 'saltKg' : 'sedimentKg'
      const water = { ...volume.water, [field]: volume.water[field] + effect.massKg }
      if (!isWaterComposition(water) || water[field] === volume.water[field]) throw Error('Масса примеси выходит за пределы учёта.')
      volume.water = water
      return waterOutcome(volume, water, effect.substance)
    }
    case 'discharge':
      if (!inFrame(effect.returnContact, scene)) throw Error('Обратная клемма выходит за пределы сцены.')
      return { kind: 'discharge', circuit: calculateCircuit(scene, aim, effect), thresholdA: effect.thresholdA }
    case 'heat': {
      const targets = scene.objects.filter(o => thermalTarget(o) && pointInObject(o, aim))
      if (targets.length !== 1) throw Error('Выбери точку внутри одного объёма воды или одного объекта с теплоёмкостью.')
      return applyHeat(scene, targets[0], effect.energyKJ)
    }
    case 'structural-impact': {
      const targets = scene.objects.filter(o => o.kind !== 'water' && o.height > 0 && o.physics?.structure && pointInObject(o, aim))
      if (targets.length !== 1) throw Error('Укажи точку внутри одной конструкции с заданной прочностью.')
      return strikeStructure(scene, targets[0], effect.energyJ)
    }
    case 'push-object': {
      const targets = scene.objects.filter(o => o.physics?.sliding && pointInObject(o, aim))
      if (!origin || targets.length !== 1) throw Error('Укажи точку внутри одного предмета с настройками скольжения.')
      return pushObject(scene, targets[0], origin, aim, effect.impulseNs)
    }
  }
}

export function physicsOutcomeDetails(outcome: AbilityPhysicsOutcome): string {
  const number = (v: number) => v.toLocaleString('ru-RU', { maximumSignificantDigits: 4 })
  if (outcome.kind === 'water') {
    const change = { created: 'Создан объём чистой воды', filled: 'Долита чистая вода', salt: 'Добавлена растворённая соль', sediment: 'Добавлен песок' }[outcome.change]
    const { volumeL, composition, conductivitySM } = outcome
    return change + ' · ' + number(volumeL) + ' л · соль ' + number(composition.saltKg) + ' кг · песок ' + number(composition.sedimentKg) +
      ' кг · проводимость ' + (conductivitySM === null ? 'не определена' : number(conductivitySM) + ' См/м')
  }
  if (outcome.kind === 'heat') {
    return (outcome.energyKJ > 0 ? 'Нагрев' : 'Охлаждение') + ' · ' + number(Math.abs(outcome.energyKJ)) + ' кДж · ' +
      number(outcome.temperatureK - 273.15) + ' °C' +
      (outcome.iceFraction !== undefined ? ' · лёд ' + number(outcome.iceFraction * 100) + ' %' : '') +
      (outcome.evaporatedKg ? ' · в пар ' + number(outcome.evaporatedKg) + ' кг' : '') +
      (outcome.ignited ? ' · объект загорелся' : '')
  }
  if (outcome.kind === 'structural-impact') {
    return outcome.name + ' · ' + (outcome.collapsed ? 'конструкция разрушена' : 'конструкция выдержала') +
      ' · удар ' + number(outcome.energyJ) + ' Дж · накоплено ' + number(outcome.absorbedJ) + ' / ' + number(outcome.failureJ) + ' Дж'
  }
  if (outcome.kind === 'push-object') return outcome.name + ' · толчок ' + number(outcome.impulseNs) +
    ' Н·с · скорость после толчка ' + number(outcome.speedMs) + ' м/с'
  const { circuit, thresholdA } = outcome
  if (circuit.status === 'open') return 'Разряд · между клеммами нет непрерывного проводящего пути.'
  if (circuit.status === 'unknown') return 'Разряд · на пути есть участки с неизвестной проводимостью.'
  return 'Разряд · ' + circuit.path.map(p => p.name).join(' → ') + '\n' +
    number(circuit.ohms) + ' Ом · ' + number(circuit.currentA) + ' А · ' + number(circuit.energyJ) + ' Дж · порог операций ' + number(thresholdA) + ' А'
}
