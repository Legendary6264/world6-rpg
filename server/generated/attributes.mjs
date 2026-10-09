export const attributeFields = [
    { key: 'strength', label: 'Сила', group: 'Тело' },
    { key: 'agility', label: 'Гибкость и ловкость', group: 'Тело' },
    { key: 'constitution', label: 'Телосложение', group: 'Тело' },
    { key: 'coordination', label: 'Координация', group: 'Тело' },
    { key: 'fingerDexterity', label: 'Мелкая моторика', group: 'Тело' },
    { key: 'reactionSpeed', label: 'Реакция', group: 'Тело' },
    { key: 'vision', label: 'Зрение', group: 'Восприятие' },
    { key: 'hearing', label: 'Слух', group: 'Восприятие' },
    { key: 'smell', label: 'Обоняние', group: 'Восприятие' },
    { key: 'touch', label: 'Осязание', group: 'Восприятие' },
    { key: 'spatialAwareness', label: 'Пространственное чувство', group: 'Восприятие' },
    { key: 'observation', label: 'Наблюдательность', group: 'Восприятие' },
    { key: 'intelligence', label: 'Интеллект', group: 'Разум' },
    { key: 'courage', label: 'Воля', group: 'Разум' },
    { key: 'charisma', label: 'Социальная чуткость', group: 'Разум' },
    { key: 'memory', label: 'Память', group: 'Разум' },
    { key: 'concentration', label: 'Концентрация', group: 'Разум' },
    { key: 'selfControl', label: 'Самоконтроль', group: 'Разум' },
    { key: 'energyCapacity', label: 'Ёмкость энергии', group: 'Энергия' },
    { key: 'energyThroughput', label: 'Пропускная способность', group: 'Энергия' },
    { key: 'magicControl', label: 'Магический контроль', group: 'Энергия' },
    { key: 'energySensitivity', label: 'Чувствительность к энергии', group: 'Энергия' },
    { key: 'channelStability', label: 'Устойчивость каналов', group: 'Энергия' },
    { key: 'energyRecovery', label: 'Восстановление энергии', group: 'Энергия' },
];
export const legacyAttributeKeys = ['strength', 'agility', 'constitution', 'intelligence', 'courage', 'charisma'];
export const attrKeys = attributeFields.map(a => a.key);
export const defaultAttributes = () => Object.fromEntries(attrKeys.map(k => [k, '10']));
