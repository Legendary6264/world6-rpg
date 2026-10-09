const modifier = (parameter, percent) => ({ parameter, flat: 0, percent });
export const functionalStates = [
    { id: 'channel-block', name: 'Блокировка каналов', group: 'Магический контроль', sensation: 'Энергия не проходит по привычным каналам.', modifiers: [modifier('controlPower', -100)], blocks: 'magic' },
    { id: 'unstable-flow', name: 'Нестабильный поток', group: 'Магический контроль', sensation: 'Поток дрожит; заклинание трудно удерживать.', modifiers: [modifier('controlPower', -35), modifier('spellAccuracy', -25)] },
    { id: 'energy-burn', name: 'Энергетический ожог', group: 'Магический контроль', sensation: 'Жжение при попытке направить энергию.', modifiers: [modifier('spellPower', -25), modifier('energyRegeneration', -40)] },
    { id: 'overload', name: 'Перегрузка', group: 'Магический контроль', sensation: 'Давление в теле, отдача от энергии.', modifiers: [modifier('controlPower', -40), modifier('concentrationPower', -25)] },
    { id: 'focus', name: 'Магическая собранность', group: 'Магический контроль', sensation: 'Поток ощущается яснее и послушнее.', modifiers: [modifier('controlPower', 20), modifier('spellAccuracy', 10)] },
    { id: 'exhaustion', name: 'Энергетическое истощение', group: 'Магический контроль', sensation: 'Пустота и тяжесть при обращении к энергии.', modifiers: [modifier('spellPower', -30), modifier('energyRegeneration', -20)] },
    { id: 'fear', name: 'Страх', group: 'Разум', sensation: 'Тревога мешает собраться.', modifiers: [modifier('concentrationPower', -25), modifier('physicalAccuracy', -10)] },
    { id: 'panic', name: 'Паника', group: 'Разум', sensation: 'Мысли разбегаются; трудно принять решение.', modifiers: [modifier('concentrationPower', -70), modifier('mentalResistance', -40)], blocks: 'mental' },
    { id: 'confusion', name: 'Спутанность сознания', group: 'Разум', sensation: 'Мысли путаются, внимание срывается.', modifiers: [modifier('memoryPower', -40), modifier('concentrationPower', -50)], blocks: 'mental' },
    { id: 'memory-fog', name: 'Помутнение памяти', group: 'Разум', sensation: 'Не удаётся уверенно вспомнить знакомое.', modifiers: [modifier('memoryPower', -60)] },
    { id: 'domination', name: 'Ментальное подчинение', group: 'Разум', sensation: 'Чужое побуждение давит на собственную волю.', modifiers: [modifier('mentalResistance', -50)], blocks: 'mental' },
    { id: 'mental-shield', name: 'Ментальный щит', group: 'Разум', sensation: 'Разум собран; чужое влияние слабее.', modifiers: [modifier('mentalResistance', 35)] },
    { id: 'illusion', name: 'Искажённое восприятие', group: 'Разум', sensation: 'Увиденное и услышанное противоречат друг другу.', modifiers: [modifier('perception', -35), modifier('physicalAccuracy', -20)] },
    { id: 'silence', name: 'Магическое безмолвие', group: 'Разум', sensation: 'Голос не звучит.', modifiers: [], blocks: 'speech' },
    { id: 'pain', name: 'Острая боль', group: 'Тело', sensation: 'Боль отвлекает и мешает двигаться.', modifiers: [modifier('concentrationPower', -25), modifier('movement', -15)] },
    { id: 'poison', name: 'Отравление', group: 'Тело', sensation: 'Тошнота, слабость и дрожь.', modifiers: [modifier('movement', -25), modifier('staminaPerTurn', -40)] },
    { id: 'paralysis', name: 'Паралич', group: 'Тело', sensation: 'Мышцы не отвечают на попытку движения.', modifiers: [modifier('movement', -100), modifier('sprint', -100)], blocks: 'movement' },
    { id: 'numbness', name: 'Онемение', group: 'Тело', sensation: 'Осязание притупилось, движения неточны.', modifiers: [modifier('physicalAccuracy', -20)] },
    { id: 'fatigue', name: 'Усталость', group: 'Тело', sensation: 'Движения тяжёлые; требуется отдых.', modifiers: [modifier('movement', -20), modifier('staminaPerTurn', -30)] },
    { id: 'blindness', name: 'Слепота', group: 'Восприятие', sensation: 'Зрительная картина исчезла.', modifiers: [modifier('perception', -70), modifier('physicalAccuracy', -60)] },
    { id: 'deafness', name: 'Глухота', group: 'Восприятие', sensation: 'Звуки не различимы.', modifiers: [modifier('perception', -35)] },
    { id: 'true-sight', name: 'Магическое зрение', group: 'Восприятие', sensation: 'Энергетические следы стали различимее.', modifiers: [modifier('perception', 25)] },
    { id: 'concealment', name: 'Магическая маскировка', group: 'Восприятие', sensation: 'Силуэт растворяется в окружении.', modifiers: [modifier('stealthBonus', 30)] },
    { id: 'regeneration', name: 'Ускоренное восстановление', group: 'Тело', sensation: 'Тепло в повреждённых тканях.', modifiers: [modifier('healingRate', 50)] },
];
export const stateById = (id) => functionalStates.find(s => s.id === id);
export function functionalModifiers(effect) { const explicit = new Set(effect.modifiers.map(m => m.parameter)); return [...effect.modifiers, ...(effect.statusEffects ?? []).flatMap(id => stateById(id)?.modifiers ?? []).filter(m => !explicit.has(m.parameter))]; }
export function selectActiveEffects(effects, seconds) {
    const result = [];
    for (const effect of effects.filter(e => e.expiresAt === null || e.expiresAt > seconds)) {
        const previous = effect.stacking === 'add' || !effect.stackKey ? -1 : result.findIndex(e => e.stackKey === effect.stackKey && e.stacking !== 'add');
        if (previous < 0)
            result.push(effect);
        else if (effect.strength > result[previous].strength)
            result[previous] = effect;
    }
    return result;
}
