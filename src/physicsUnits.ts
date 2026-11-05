// SI quantities and serialization limits. These bounds are not rules of the world.
export const MAX_PHYSICS_QUANTITY = 1e24
export const MAX_TEMPERATURE_K = 1e6

export const physicsRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
export const physicsKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
export const physicsNumber = (value: unknown, minimum = 0, maximum = MAX_PHYSICS_QUANTITY): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
export const physicsId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(value)

function quantity(value: number, label: string, minimum = 0, maximum = MAX_PHYSICS_QUANTITY) {
  if (!physicsNumber(value, minimum, maximum)) throw Error('Недопустимая физическая величина: ' + label + '.')
  return value
}
export function celsiusToKelvin(celsius: number): number {
  quantity(celsius, 'температура, °C', -273.15, MAX_TEMPERATURE_K - 273.15)
  return celsius + 273.15
}
export const kelvinToCelsius = (kelvin: number) => quantity(kelvin, 'температура, K', 0, MAX_TEMPERATURE_K) - 273.15
export const litresToCubicMetres = (litres: number) => quantity(litres, 'объём, л') / 1000
export const cubicMetresToLitres = (volumeM3: number) => quantity(quantity(volumeM3, 'объём, м³') * 1000, 'объём, л')
export function massFromVolumeKg(densityKgM3: number, volumeM3: number): number {
  quantity(densityKgM3, 'плотность, кг/м³', Number.MIN_VALUE, 1e12)
  return quantity(densityKgM3 * quantity(volumeM3, 'объём, м³'), 'масса, кг')
}
export function kineticEnergyJ(massKg: number, speedMs: number): number {
  return quantity(.5 * quantity(massKg, 'масса, кг') * quantity(speedMs, 'скорость, м/с') ** 2, 'энергия, Дж')
}
export function momentumNs(massKg: number, speedMs: number): number {
  return quantity(quantity(massKg, 'масса, кг') * quantity(speedMs, 'скорость, м/с'), 'импульс, Н·с')
}
export function temperatureChangeEnergyJ(massKg: number, specificHeatJKgK: number, fromK: number, toK: number): number {
  quantity(fromK, 'начальная температура, K', 0, MAX_TEMPERATURE_K)
  quantity(toK, 'конечная температура, K', 0, MAX_TEMPERATURE_K)
  return quantity(quantity(massKg, 'масса, кг') * quantity(specificHeatJKgK, 'теплоёмкость, Дж/(кг·K)') * (toK - fromK), 'изменение энергии, Дж', -MAX_PHYSICS_QUANTITY)
}
