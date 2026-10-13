// Visual metadata only. These presets never change damage, targets or school rules.
export const abilityVisualPhases = [
  { id: 'preparation', label: 'Подготовка' },
  { id: 'release', label: 'Выпуск' },
  { id: 'travel', label: 'Распространение' },
  { id: 'impact', label: 'Воздействие' },
  { id: 'residue', label: 'Остаточный след' },
] as const
export type AbilityVisualPhase = typeof abilityVisualPhases[number]['id']
export type AbilityVisualShape = 'point' | 'sphere' | 'beam' | 'cone'

const families = [
  ['fire', 'Пламя и угли', 'Огонь', '#ff8a42', '#fff3ae', '#9e352b', 'flame', 'Языки пламени, искры и тлеющий след.'],
  ['water', 'Водяной поток', 'Вода', '#4dc5ea', '#d0fbff', '#2863a3', 'wave', 'Капли, расходящиеся волны и водяной всплеск.'],
  ['earth', 'Камень и трещины', 'Земля', '#c9a76b', '#f6dca4', '#635244', 'shard', 'Каменные осколки, трещины и взвесь пыли.'],
  ['metal', 'Стальные лезвия', 'Металл', '#aebdd4', '#f6f9ff', '#54627f', 'shard', 'Грани металла, вращающиеся пластины и ударные искры.'],
  ['vegetation', 'Корни и побеги', 'Растительность', '#78bd66', '#d5ef9c', '#315b48', 'leaf', 'Растущие побеги, листья и оплетающие корни.'],
  ['wind', 'Воздушный вихрь', 'Ветер', '#9ce1d5', '#edfff8', '#438e98', 'dash', 'Дуги потоков, завихрения и стремительные штрихи.'],
  ['blood', 'Кровавые нити', 'Кровь', '#d64867', '#ffa4aa', '#681f42', 'drop', 'Пульсирующие нити и тягучие капли.'],
  ['electricity', 'Разряд', 'Электричество', '#7fbfff', '#ecf7ff', '#6262dc', 'spark', 'Ломаные ветви разряда и мерцающие электрические искры.'],
  ['light', 'Световой всплеск', 'Свет', '#f5ce70', '#fffbe5', '#c58f42', 'star', 'Радиальные лучи, световые грани и расходящаяся вспышка.'],
  ['healing', 'Восстановление', 'Исцеление', '#8dd3a1', '#ecffd9', '#4a9a83', 'plus', 'Мягкие ленты, восходящие частицы и пульс восстановления.'],
  ['shadows', 'Теневые ленты', 'Тени', '#9e74d2', '#d6beff', '#30243f', 'wisp', 'Тёмный силуэт с движущимися теневыми лентами.'],
  ['fear', 'Присутствие страха', 'Страх', '#d278a8', '#ffc1d1', '#47233f', 'eye', 'Дрожащий контур, глаз и обострённые лучи.'],
  ['decay', 'Распад', 'Тлен', '#adc068', '#e6f0a0', '#59633a', 'square', 'Треснувшая структура и отделяющиеся фрагменты.'],
  ['silence', 'Безмолвная оболочка', 'Безмолвие', '#a49ebc', '#ded9ed', '#555168', 'dash', 'Тихая оболочка с перечёркнутыми звуковыми дугами.'],
  ['oblivion', 'Исчезающий след', 'Забвение', '#b8a1d9', '#ece1ff', '#554166', 'square', 'Прерванные контуры и распадающиеся отметки.'],
  ['hunger', 'Стягивающая спираль', 'Голод', '#d28d76', '#ffc6a5', '#653343', 'drop', 'Частицы и зубчатые дуги, направленные к центру.'],
  ['void', 'Контур Пустоты', 'Пустота', '#9687d4', '#e2d9ff', '#171424', 'star', 'Пустой центр, тонкий обод и разорванные орбиты.'],
  ['space', 'Пространственный разлом', 'Пространство', '#b192fa', '#e6dcff', '#6151a6', 'shard', 'Вертикальная щель, смещённые грани и узлы перехода.'],
  ['reflection', 'Зеркальные грани', 'Отражения', '#91cfdb', '#effaff', '#527bac', 'shard', 'Парные отражённые грани и зеркальные осколки.'],
  ['runes', 'Руническая печать', 'Руны', '#e1b96c', '#fff0bc', '#9a6950', 'spark', 'Геометрическая печать, кольцо знаков и активация узлов.'],
] as const
export type AbilityVisualFamilyId = typeof families[number][0] | 'none'
export type AbilityVisualParticle = typeof families[number][6]
export type AbilityVisualFamily = {
  id: AbilityVisualFamilyId; name: string; schoolLabel: string
  primary: string; highlight: string; shade: string
  particle: AbilityVisualParticle; description: string
}
export const abilityVisualFamilies: readonly AbilityVisualFamily[] = families.map(([id, name, schoolLabel, primary, highlight, shade, particle, description]) =>
  ({ id, name, schoolLabel, primary, highlight, shade, particle, description }))
export const abilityVisualFamilyById = (id: string) => abilityVisualFamilies.find(family => family.id === id)

export type AbilityVisualSpec = { familyId: AbilityVisualFamilyId; scale?: number; intensity?: number; durationMs?: number }
const bounded = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high
export function isAbilityVisualSpec(value: unknown): value is AbilityVisualSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return Object.hasOwn(v, 'familyId') && Object.keys(v).every(key => ['familyId', 'scale', 'intensity', 'durationMs'].includes(key)) &&
    typeof v.familyId === 'string' && (v.familyId === 'none' || !!abilityVisualFamilyById(v.familyId)) &&
    (!Object.hasOwn(v, 'scale') || bounded(v.scale, .25, 4)) &&
    (!Object.hasOwn(v, 'intensity') || bounded(v.intensity, .25, 2)) &&
    (!Object.hasOwn(v, 'durationMs') || bounded(v.durationMs, 500, 10000))
}
export function copyAbilityVisualSpec(value: AbilityVisualSpec): AbilityVisualSpec {
  return { familyId: value.familyId, ...(value.scale === undefined ? {} : { scale: value.scale }),
    ...(value.intensity === undefined ? {} : { intensity: value.intensity }), ...(value.durationMs === undefined ? {} : { durationMs: value.durationMs }) }
}
export type AbilityVisualSource = { schoolId?: string; basisSchoolId?: string; mechanism?: string; visualEffect?: AbilityVisualSpec }
const schoolFamilies: Readonly<Record<string, AbilityVisualFamilyId>> = {
  vegetation: 'vegetation', fire: 'fire', earth: 'earth', metal: 'metal', water: 'water', blood: 'blood', wind: 'wind',
  electricity: 'electricity', light: 'light', healing: 'healing', shadows: 'shadows', fear: 'fear', decay: 'decay',
  silence: 'silence', oblivion: 'oblivion', hunger: 'hunger', void: 'void', space: 'space', reflection: 'reflection', runes: 'runes',
  magnetism: 'metal', sand: 'earth', poisons: 'decay', beast: 'vegetation', illusion: 'reflection', copying: 'reflection',
  dreams: 'oblivion', divination: 'runes', word: 'runes', trueNames: 'runes', contracts: 'runes', bonds: 'runes',
  soul: 'light', spirits: 'shadows', necromancy: 'decay', curses: 'fear', fading: 'oblivion', resonance: 'wind', echoes: 'wind',
  absorption: 'hunger', limit: 'void',
}
/** Inference chooses an editable visual motif, not a magical mechanism. */
export function resolveAbilityVisual(value: AbilityVisualSource): AbilityVisualSpec {
  if (value.visualEffect && isAbilityVisualSpec(value.visualEffect)) return copyAbilityVisualSpec(value.visualEffect)
  const fromSchool = (id = '') => Object.hasOwn(schoolFamilies, id) ? schoolFamilies[id] : undefined
  const familyId = fromSchool(value.schoolId) ?? fromSchool(value.basisSchoolId) ??
    (value.mechanism === 'stone' || value.mechanism === 'impact' ? 'earth' : value.mechanism === 'heal' ? 'healing' :
      value.mechanism === 'blood' || value.mechanism === 'substitute' ? 'blood' : 'none')
  return { familyId }
}
export const abilityVisualDefaults = { scale: 1, intensity: 1, durationMs: 1800 } as const

export type AbilityVisualPoint = { x: number; y: number }
/** SVG coordinates; no scene distance, visibility or targeting decisions happen here. */
export function abilityVisualAnchor(start: AbilityVisualPoint, end: AbilityVisualPoint, phase: AbilityVisualPhase, progress = .5): AbilityVisualPoint {
  const t = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : .5
  return phase === 'preparation' || phase === 'release' ? { ...start } : phase === 'travel' ?
    { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t } : { ...end }
}
