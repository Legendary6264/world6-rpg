// Значения из правил кампании. Численные зависимости от атрибутов пока не заданы.
export const statisticFields = [
    { key: 'physicalDamageBonus', label: 'Бонус урона (физ.)', unit: 'ед.', minimum: null, maximum: null },
    { key: 'physicalAccuracy', label: 'Точность (физ.)', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'criticalChance', label: 'Шанс крита', unit: '%', minimum: 0, maximum: 100 },
    { key: 'staminaPerTurn', label: 'Выносливость/ход', unit: 'ед./ход', minimum: 0, maximum: null },
    { key: 'defense', label: 'Защита', unit: '%', minimum: 0, maximum: 100 },
    { key: 'dodgeChance', label: 'Уворот', unit: '%', minimum: 0, maximum: 100 },
    { key: 'physicalResistance', label: 'Сопротивление физическое', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'magicalResistance', label: 'Сопротивление магическое', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'movement', label: 'Движение', unit: 'м/с', minimum: 0, maximum: null },
    { key: 'sprint', label: 'Спринт', unit: 'м/с', minimum: 0, maximum: null },
    { key: 'spellPower', label: 'Сила заклинаний', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'spellAccuracy', label: 'Магическая точность', unit: '%', minimum: 0, maximum: 100 },
    { key: 'controlPower', label: 'Магический контроль', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'mentalResistance', label: 'Ментальная защита', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'perception', label: 'Восприятие', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'memoryPower', label: 'Память', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'concentrationPower', label: 'Концентрация', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'energyRegeneration', label: 'Восстановление энергии', unit: 'ед./с', minimum: 0, maximum: null },
    { key: 'painTolerance', label: 'Переносимость боли', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'stealthBonus', label: 'Скрытность', unit: 'ед.', minimum: 0, maximum: null },
    { key: 'healingRate', label: 'Восстановление тканей', unit: 'ед./с', minimum: 0, maximum: null },
    { key: 'carryingCapacity', label: 'Переносимая масса', unit: 'кг', minimum: 0, maximum: null },
];
export function parseDecimalNumber(value) {
    const normalized = value.trim().replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized))
        return Number.NaN;
    return Number(normalized);
}
export function createDefaultStatistics() {
    // Пусто — не задано. Явный "0" остаётся настоящим нулём.
    return Object.fromEntries(statisticFields.map(f => [f.key, '']));
}
export function normalizeStatistics(values) {
    const normalized = createDefaultStatistics();
    for (const field of statisticFields)
        normalized[field.key] = values?.[field.key] ?? '';
    return { ...values, ...normalized };
}
export function isValidStatistic(key, value) {
    if (value.trim() === '')
        return true;
    const number = parseDecimalNumber(value);
    if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER)
        return false;
    const field = statisticFields.find(item => item.key === key);
    if (!field)
        return false;
    return (field.minimum === null || number >= field.minimum) &&
        (field.maximum === null || number <= field.maximum);
}
export function isCharacterStatistics(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const values = value;
    return statisticFields.every(field => {
        const item = values[field.key];
        return item === undefined || typeof item === 'string' && isValidStatistic(field.key, item);
    });
}
export function statisticError(key) {
    const field = statisticFields.find(item => item.key === key);
    if (field?.maximum === 100)
        return 'Введи число от 0 до 100 или оставь поле пустым.';
    if (field?.minimum === 0)
        return 'Введи неотрицательное число или оставь поле пустым.';
    return 'Введи допустимое число или оставь поле пустым.';
}
export function calculateDistance(key, speedValue, secondsValue) {
    if (speedValue.trim() === '')
        return { ok: false, message: 'Скорость не задана.' };
    if (!isValidStatistic(key, speedValue))
        return { ok: false, message: 'Проверь скорость в редакторе.' };
    const seconds = parseDecimalNumber(secondsValue);
    if (secondsValue.trim() === '' || !Number.isFinite(seconds) ||
        seconds < 0 || seconds > Number.MAX_SAFE_INTEGER) {
        return { ok: false, message: 'Введи неотрицательное время в секундах.' };
    }
    const metres = parseDecimalNumber(speedValue) * seconds;
    if (!Number.isFinite(metres))
        return { ok: false, message: 'Дистанция выходит за допустимый диапазон.' };
    return { ok: true, metres };
}
export function getStatisticDisplay(values, _maximumHealth, maximumStamina) {
    function manual(key) {
        const field = statisticFields.find(item => item.key === key);
        const value = values[key];
        const text = value.trim() === '' ? 'Не задано' :
            isValidStatistic(key, value) ? String(parseDecimalNumber(value)) + ' ' + field.unit : 'Проверь значение';
        return { key, label: field.label, text };
    }
    function resource(key, label, value) {
        const number = Number(value);
        const text = value.trim() !== '' && Number.isSafeInteger(number) && number >= 0
            ? String(number) + ' ед.' : 'Проверь значение';
        return { key, label, text };
    }
    // Два максимума берём прямо из ресурсов: второго хранилища для них нет.
    return [
        manual('physicalDamageBonus'), manual('physicalAccuracy'), manual('criticalChance'),
        resource('maximumStamina', 'Выносливость (максимум)', maximumStamina),
        manual('staminaPerTurn'), manual('defense'), manual('dodgeChance'),
        manual('physicalResistance'), manual('magicalResistance'),
        manual('movement'), manual('sprint'),
        manual('spellPower'),
        manual('spellAccuracy'),
        manual('controlPower'),
        manual('mentalResistance'),
        manual('perception'),
        manual('memoryPower'),
        manual('concentrationPower'),
        manual('energyRegeneration'),
        manual('painTolerance'),
        manual('stealthBonus'),
        manual('healingRate'),
        manual('carryingCapacity'),
    ];
}
