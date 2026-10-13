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
  ['magnetism', 'Магнитные полюса', 'Магнетизм', '#94bdd4', '#edfaff', '#3e647d', 'shard', 'Парные полюса, силовые дуги и сходящиеся металлические частицы.'],
  ['sand', 'Песчаный гребень', 'Песок', '#d9b86d', '#fff1c4', '#8c6541', 'square', 'Сдвигающиеся дюны, зернистый поток и песчаная взвесь.'],
  ['poisons', 'Ядовитая взвесь', 'Яды', '#a8cf56', '#e9ffc3', '#4a613d', 'drop', 'Пузырьки вещества, тяжёлые капли и клубы взвеси.'],
  ['beast', 'Звериный след', 'Магия зверя', '#bfad73', '#f5e6b0', '#685345', 'claw', 'Отпечаток лапы, расходящиеся следы и резкие царапины.'],
  ['illusion', 'Двойной образ', 'Иллюзии', '#d49adc', '#f6dcff', '#77508c', 'wisp', 'Смещённые маски, дрожащая сетка и расхождение образов.'],
  ['copying', 'Повторённый узор', 'Копирование', '#b2a5db', '#f3eaff', '#63538a', 'square', 'Два слоя узора и движение отметок от образца к копии.'],
  ['dreams', 'Сновидный полумесяц', 'Сны', '#9daddf', '#e7edff', '#505e91', 'star', 'Полумесяц, облачная дуга и медленно плывущие звёзды.'],
  ['divination', 'Круг провидения', 'Провидение', '#d5c078', '#fff5c8', '#827352', 'star', 'Линза с глазом, круг направлений и проходящая линия обзора.'],
  ['word', 'Звучащее слово', 'Слово', '#d9b888', '#fff0d2', '#90664e', 'rune', 'Строки условных знаков, голосовые волны и проявление записи.'],
  ['trueNames', 'Знак имени', 'Истинные имена', '#d6bd7c', '#fff4c4', '#81684f', 'rune', 'Именная метка с узлом, четырьмя ключами и замкнутым ободом.'],
  ['contracts', 'Договорная печать', 'Сделки', '#cbb08c', '#f9e8c7', '#806b58', 'rune', 'Свёрнутый лист с печатью и две соединяющиеся подписи.'],
  ['bonds', 'Переплетение уз', 'Узы', '#c6ae89', '#fff0cf', '#796052', 'dash', 'Два сцепленных кольца, натянутые нити и светящиеся узлы.'],
  ['soul', 'Духовный огонёк', 'Магия души', '#9fc5e7', '#e9f6ff', '#527b9e', 'wisp', 'Мягкий огонёк внутри силуэта и восходящие духовные ленты.'],
  ['spirits', 'Духовное присутствие', 'Духи', '#8dcbbb', '#dcfff0', '#426e69', 'wisp', 'Полупрозрачный силуэт, плавный шлейф и парящие огни.'],
  ['necromancy', 'Костяной контур', 'Некромантия', '#b5c092', '#f1f4cf', '#667052', 'square', 'Костяная форма, сомкнутые швы и расходящиеся холодные дуги.'],
  ['curses', 'Колючая метка', 'Проклятия', '#c887b2', '#ffd4ee', '#734267', 'claw', 'Перевязанный знак, колючие ответвления и дрожащая печать.'],
  ['fading', 'Затухающие полосы', 'Угасание', '#a8afc8', '#e8edff', '#59647e', 'dash', 'Последовательно убывающие полосы и рассыпающийся светлый контур.'],
  ['resonance', 'Резонансные вилки', 'Резонанс', '#9ec9dd', '#e3fbff', '#4a788e', 'wave', 'Парные вилки, согласованные волны и синхронный пульс.'],
  ['echoes', 'Повторяющийся след', 'Отголоски', '#a8c3d2', '#edfbff', '#617887', 'dash', 'Повторённые дуги и три последовательных оттиска исходной отметки.'],
  ['absorption', 'Приёмный контур', 'Поглощение', '#b19ad5', '#eadcff', '#655080', 'shard', 'Входящие стрелки, сегментированный сосуд и собирающиеся частицы.'],
  ['limit', 'Граничная рамка', 'Предел', '#bfa2c9', '#f5ddff', '#72577d', 'dash', 'Замкнутая рамка, ограничительные скобы и остановленные у границы штрихи.'],
  ['embers', 'Разлетающиеся угли', 'Огонь · вариант', '#ef714a', '#ffde98', '#93432b', 'flame', 'Раскалённые угли разной формы и веер искр с дымным шлейфом.'],
  ['heatwave', 'Марево жара', 'Огонь · вариант', '#e8aa64', '#ffe9b5', '#a65f47', 'dash', 'Колеблющиеся слои воздуха над светящейся тепловой дугой.'],
  ['rain', 'Косой дождь', 'Вода · вариант', '#72b3e3', '#e2f7ff', '#456992', 'drop', 'Дождевые полосы из облака, раздельные капли и точки всплеска.'],
  ['tide', 'Приливная волна', 'Вода · вариант', '#54c4cc', '#d6ffff', '#326f8c', 'wave', 'Крупный заворачивающийся гребень и расходящиеся линии прибоя.'],
  ['mist', 'Туманная завеса', 'Вода · вариант', '#a4cbd6', '#eefcff', '#647d94', 'wisp', 'Перекрывающие друг друга слои тумана и плывущие лёгкие клочья.'],
  ['frost', 'Ледяной узор', 'Вода · вариант', '#99d7ee', '#f5feff', '#598ea9', 'shard', 'Шестилучевой кристаллический узор с растущими боковыми гранями.'],
  ['roots', 'Корневое сплетение', 'Растительность · вариант', '#9dad6b', '#e5edb4', '#5c6c43', 'leaf', 'Разветвлённые корни, расходящиеся по земле от узлового основания.'],
  ['thorns', 'Венец шипов', 'Растительность · вариант', '#87ae63', '#e1f2bb', '#4c6843', 'claw', 'Колючая лоза, замыкающаяся кольцом, и острые отростки.'],
  ['blossom', 'Раскрывающийся цветок', 'Растительность · вариант', '#d49aac', '#fff1c4', '#785776', 'petal', 'Пять раскрывающихся лепестков, пыльца и стебель.'],
  ['vines', 'Плетущиеся лозы', 'Растительность · вариант', '#78b876', '#dcf4ab', '#41634b', 'leaf', 'Две встречные лозы, цепляющиеся усики и распускающиеся листья.'],
  ['crystal', 'Кристаллический рост', 'Земля · вариант', '#b7a7e2', '#f3ebff', '#6b598c', 'shard', 'Три кристаллические призмы с отдельными внутренними гранями.'],
  ['dust', 'Пылевое облако', 'Земля · вариант', '#c4a17b', '#f5dfb7', '#816348', 'square', 'Вздымающаяся пыль, зернистый край и мелкая осыпь.'],
  ['rockfall', 'Каменная осыпь', 'Земля · вариант', '#bfa184', '#f4dfbf', '#6e584b', 'shard', 'Три летящих камня, разные траектории и трещина у основания.'],
  ['forging', 'Кузнечная искра', 'Металл · вариант', '#c2bdc5', '#fff1c8', '#79667b', 'spark', 'Удар молота о наковальню, светлый контакт и веер искр.'],
  ['shield', 'Пластинчатая преграда', 'Металл · вариант', '#91b3cf', '#e4f6ff', '#4c6688', 'shard', 'Изогнутый щит из пластин, заклёпки и расходящиеся защитные дуги.'],
  ['blades', 'Веер клинков', 'Металл · вариант', '#bfcbd8', '#ffffff', '#657592', 'shard', 'Три вытянутых лезвия и дуга их раздельных следов.'],
  ['gale', 'Порыв ветра', 'Ветер · вариант', '#a8d9c7', '#f0fff4', '#558f87', 'feather', 'Вытянутые струи воздуха, подхваченные перья и быстрые завитки.'],
  ['cyclone', 'Воздушная воронка', 'Ветер · вариант', '#95cbd4', '#e8ffff', '#507d94', 'dash', 'Сужающиеся спиральные витки, широкий верх и закрученный след.'],
  ['pulse', 'Сосудистый пульс', 'Кровь · вариант', '#d27789', '#ffd0d4', '#7b364d', 'drop', 'Сердечный контур, пульсовая линия и ответвляющиеся сосудистые нити.'],
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
  magnetism: 'magnetism', sand: 'sand', poisons: 'poisons', beast: 'beast', illusion: 'illusion', copying: 'copying',
  dreams: 'dreams', divination: 'divination', word: 'word', trueNames: 'trueNames', contracts: 'contracts', bonds: 'bonds',
  soul: 'soul', spirits: 'spirits', necromancy: 'necromancy', curses: 'curses', fading: 'fading', resonance: 'resonance', echoes: 'echoes',
  absorption: 'absorption', limit: 'limit',
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
