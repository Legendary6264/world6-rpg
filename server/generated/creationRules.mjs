import { canonicalRaceId, isRaceTemplate, raceById, raceTemplates } from './raceCatalog.mjs';
export { raceById, raceTemplates } from './raceCatalog.mjs';
import { functionalModifiers, selectActiveEffects } from './functionalStates.mjs';
import { injuryModifiers } from './bodyPerception.mjs';
import { isBodyState } from './characterBody.mjs';
import { attributeFields, attrKeys } from './attributes.mjs';
import { rankOptions, progressionSteps } from './characterProfile.mjs';
import { magicStudyStates, schoolById } from './magicCatalog.mjs';
// Числа — открытая настройка игрового баланса, а не новые утверждения о лоре.
export const balance = { rankGrowth: 5, stageGrowth: 1, specializationPerRank: 12, schoolPenalty: .25, attributeCapPerLevel: 20 };
export const progressionLevel = (p) => Math.max(0, rankOptions.findIndex(r => r.key === p.rank)) * 10 + (p.rankStep ?? 1) - 1;
export const attributeCap = (p) => 30 + progressionLevel(p) * balance.attributeCapPerLevel;
export const rankIndex = (p) => Math.max(0, rankOptions.findIndex(r => r.key === p.rank));
export const skillCatalog = [
    { id: 'stealth', name: 'Скрытность', group: 'Тень и ремесло', weights: { agility: .3, coordination: .3, observation: .2, selfControl: .2 } },
    { id: 'pickpocket', name: 'Карманное воровство', group: 'Тень и ремесло', weights: { fingerDexterity: .4, coordination: .25, reactionSpeed: .2, charisma: .15 } },
    { id: 'lockpicking', name: 'Вскрытие замков', group: 'Тень и ремесло', weights: { fingerDexterity: .4, touch: .25, intelligence: .2, concentration: .15 } },
    { id: 'disarm', name: 'Обезвреживание ловушек', group: 'Тень и ремесло', weights: { observation: .3, fingerDexterity: .3, intelligence: .25, selfControl: .15 } },
    { id: 'forging', name: 'Кузнечное дело', group: 'Тень и ремесло', weights: { strength: .25, fingerDexterity: .25, intelligence: .25, magicControl: .25 } },
    { id: 'crafting', name: 'Работа с материалами', group: 'Тень и ремесло', weights: { fingerDexterity: .35, touch: .25, memory: .2, intelligence: .2 } },
    { id: 'melee', name: 'Ближний бой', group: 'Действие', weights: { strength: .3, coordination: .3, reactionSpeed: .25, spatialAwareness: .15 } },
    { id: 'ranged', name: 'Стрельба', group: 'Действие', weights: { vision: .35, coordination: .3, concentration: .2, spatialAwareness: .15 } },
    { id: 'athletics', name: 'Атлетика', group: 'Действие', weights: { strength: .35, constitution: .3, agility: .2, coordination: .15 } },
    { id: 'tracking', name: 'Выслеживание', group: 'Действие', weights: { observation: .35, smell: .25, hearing: .2, memory: .2 } },
    { id: 'medicine', name: 'Диагностика и лечение', group: 'Знание', weights: { intelligence: .3, observation: .25, memory: .25, fingerDexterity: .2 } },
    { id: 'persuasion', name: 'Убеждение', group: 'Знание', weights: { charisma: .4, intelligence: .2, selfControl: .2, observation: .2 } },
    { id: 'mental', name: 'Ментальная защита', group: 'Знание', weights: { courage: .35, selfControl: .3, concentration: .2, energySensitivity: .15 } },
    { id: 'spellcraft', name: 'Плетение заклинаний', group: 'Магия', weights: { magicControl: .35, concentration: .25, energyThroughput: .2, channelStability: .2 } },
    { id: 'channeling', name: 'Управление потоком', group: 'Магия', weights: { energyThroughput: .35, magicControl: .25, channelStability: .25, energyCapacity: .15 } },
    { id: 'sensing', name: 'Чувство магии', group: 'Магия', weights: { energySensitivity: .4, observation: .25, concentration: .2, spatialAwareness: .15 } },
];
export const defaultAppearance = () => ({ height: 1.75, build: 1, head: 1, shoulders: 1, waist: 1, hips: 1, musculature: .5, legRatio: 1, jaw: 1, nose: 1, wingSpan: 1, tailLength: 1, skin: '#b98a72', hair: '#29232d', eyes: '#91bdbe', outfit: '#2e4651', hairStyle: 'short' });
export const defaultCreation = () => ({ raceId: 'human', form: 'base', skills: Object.fromEntries(skillCatalog.map(s => [s.id, 0])), training: Object.fromEntries(attrKeys.map(k => [k, 0])), specialization: Object.fromEntries(attrKeys.map(k => [k, 0])), affinities: {}, appearance: defaultAppearance(), forgeAccess: false });
export function copyCreation(c = defaultCreation()) {
    const attributes = (v) => Object.fromEntries(attrKeys.map(k => [k, v[k]]));
    return { customRaces: structuredClone(c.customRaces ?? []), raceId: canonicalRaceId(c.raceId), form: c.form, skills: Object.fromEntries(skillCatalog.map(s => [s.id, c.skills[s.id]])), training: attributes(c.training), specialization: attributes(c.specialization), affinities: { ...c.affinities }, forgeAccess: c.forgeAccess, appearance: { ...defaultAppearance(), ...c.appearance }, ...(c.formMemory ? { formMemory: structuredClone(c.formMemory) } : {}) };
}
export function isCreation(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return false;
    const c = v, a = c.appearance;
    const number = (n, max = 1e6) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
    const map = (m, keys, max = 1e6) => !!m && typeof m === 'object' && !Array.isArray(m) && keys.every(k => number(m[k], max) && Number.isInteger(m[k]));
    return (c.formMemory === undefined || typeof c.formMemory === 'object' && c.formMemory !== null && !Array.isArray(c.formMemory) && Object.entries(c.formMemory).every(([key, body]) => ['base', 'partial', 'full'].includes(key) && isBodyState(body))) && (c.customRaces === undefined || Array.isArray(c.customRaces) && c.customRaces.length <= 100 && c.customRaces.every(isRaceTemplate) && new Set(c.customRaces.map(r => r.id)).size === c.customRaces.length) && (raceTemplates.some(r => r.id === canonicalRaceId(c.raceId)) || !!c.customRaces?.some(r => r.id === c.raceId)) && ['base', 'partial', 'full'].includes(c.form) && map(c.skills, skillCatalog.map(s => s.id), 100) && map(c.training, attrKeys) && map(c.specialization, attrKeys) && !!c.affinities && typeof c.affinities === 'object' && !Array.isArray(c.affinities) && Object.keys(c.affinities).length <= 50 && Object.entries(c.affinities).every(([k, n]) => !!schoolById(k) && number(n, 50)) && typeof c.forgeAccess === 'boolean' && !!a && number(a.height, 3) && a.height >= .6 && number(a.build, 1.6) && a.build >= .6 && number(a.head, 1.4) && a.head >= .7 && ['skin', 'hair', 'eyes', 'outfit'].every(k => /^#[\da-f]{6}$/i.test(a[k])) && ['shoulders', 'waist', 'hips', 'legRatio', 'jaw', 'nose', 'wingSpan', 'tailLength'].every(k => a[k] === undefined || number(a[k], 1.6) && Number(a[k]) >= .6) && (a.musculature === undefined || number(a.musculature, 1)) && ['short', 'long', 'none'].includes(a.hairStyle);
}
export function effectiveAttribute(actor, k) {
    const c = actor.creation ?? defaultCreation(), p = actor.profile;
    const previousStages = rankOptions.slice(0, rankIndex(p)).reduce((sum, r) => sum + progressionSteps(r.key) - 1, 0);
    return Number(actor.attributes[k] ?? 10) + rankIndex(p) * balance.rankGrowth + previousStages * balance.stageGrowth + ((p.rankStep ?? 1) - 1) * balance.stageGrowth + (c.training[k] ?? 0) + (c.specialization[k] ?? 0) + (raceById(c.raceId, c.customRaces).bonuses[k] ?? 0);
}
export function skillBreakdown(actor, id, seconds = 0) {
    const s = skillCatalog.find(s => s.id === id), level = (actor.creation ?? defaultCreation()).skills[id];
    const terms = Object.entries(s.weights).map(([k, weight]) => ({ label: attributeFields.find(a => a.key === k).label, value: effectiveAttribute(actor, k), weight }));
    const aptitude = terms.reduce((sum, t) => sum + t.value * t.weight, 0);
    const parameter = { stealth: 'stealthBonus', mental: 'mentalResistance', spellcraft: 'controlPower', sensing: 'perception' }[id];
    const painParameter = s.group === 'Магия' || s.group === 'Знание' ? 'concentrationPower' : 'physicalAccuracy';
    const mods = [...selectActiveEffects(actor.rpg.effects, seconds).flatMap(functionalModifiers).filter(m => m.parameter === parameter), ...injuryModifiers(actor.body).filter(m => m.parameter === painParameter)];
    const flat = mods.reduce((s, m) => s + m.flat, 0), percent = mods.reduce((s, m) => s + m.percent, 0);
    const learning = raceById(actor.creation.raceId, actor.creation.customRaces).learning, masteryFactor = 1 + Math.min(100, level) / 200;
    const value = Math.round(Math.max(0, ((aptitude * .6 + level * 1.4 * learning) * masteryFactor + flat) * (1 + percent / 100)) * 100) / 100;
    return { terms, aptitude, level, learning, masteryFactor, flat, percent, value };
}
export function skillValue(actor, id, seconds = 0) { return skillBreakdown(actor, id, seconds).value; }
export function skillChance(score, difficulty) { return Math.round(Math.min(95, Math.max(5, 50 + 50 * (score - difficulty) / (score + difficulty + 20))) * 10) / 10; }
export const branchParents = { magnetism: 'metal', sand: 'earth', poisons: 'vegetation', echoes: 'soul' };
export function castingSchool(schoolId, basisSchoolId) {
    const school = schoolById(schoolId);
    if (school?.group !== 'extended')
        return schoolId;
    return branchParents[schoolId] ?? basisSchoolId ?? schoolId;
}
export function magicSpecialization(actor, schoolId, basisSchoolId) {
    const baseSchool = castingSchool(schoolId, basisSchoolId), c = actor.creation ?? defaultCreation(), race = raceById(c.raceId, c.customRaces);
    const count = Math.max(1, new Set((actor.profile.magic ?? []).filter(s => s.state === 'mastered' && s.schoolId !== 'limit' && schoolById(s.schoolId)?.group !== 'extended').map(s => s.schoolId)).size);
    const racial = race.affinities[schoolId] ?? race.affinities[baseSchool] ?? 0, individual = c.affinities[schoolId] ?? c.affinities[baseSchool] ?? 0, divisor = 1 + balance.schoolPenalty * (count - 1);
    return { baseSchool, count, racial, individual, divisor, efficiency: Math.round((1 + (racial + individual) / 100) / divisor * 1000) / 1000 };
}
export function magicEfficiency(actor, schoolId, basisSchoolId) { return magicSpecialization(actor, schoolId, basisSchoolId).efficiency; }
export const developmentStages = rankOptions.flatMap(rank => Array.from({ length: progressionSteps(rank.key) }, (_, i) => ({ value: rankOptions.findIndex(r => r.key === rank.key) * 10 + i, label: rank.label + ' · ' + (rank.key === 'mortal' ? 'стадия закалки ' : 'ступень ') + (i + 1) })));
export const developmentLabel = (level) => developmentStages.find(s => s.value >= level)?.label ?? 'За пределами обычного развития';
export function nextProgression(p) {
    const rank = p.rank || 'mortal', i = rankOptions.findIndex(r => r.key === rank), step = p.rankStep ?? 1;
    return step < progressionSteps(rank) ? { ...p, rank, rankStep: step + 1 } : i < rankOptions.length - 1 ? { ...p, rank: rankOptions[i + 1].key, rankStep: 1 } : null;
}
export const standardFormulas = () => {
    const rows = [
        ['maximumMana', 0, { energyCapacity: 8, channelStability: 2 }], ['maximumShadow', 0, { energyCapacity: 5, channelStability: 2 }], ['maximumStamina', 0, { constitution: 6, strength: 2 }],
        ['physicalDamageBonus', 0, { strength: 1, coordination: .4 }], ['physicalAccuracy', 40, { coordination: 1.5, vision: 1, reactionSpeed: .5 }], ['criticalChance', 0, { observation: .3, coordination: .2 }],
        ['staminaPerTurn', 0, { constitution: .25, selfControl: .15 }], ['defense', 0, { constitution: .8, reactionSpeed: .4 }], ['dodgeChance', 0, { agility: .8, reactionSpeed: .5 }],
        ['physicalResistance', 0, { constitution: .7, strength: .2 }], ['magicalResistance', 0, { channelStability: .7, courage: .3 }], ['movement', 1, { agility: .08, constitution: .05 }], ['sprint', 1, { strength: .18, agility: .15 }],
        ['spellPower', 0, { energyThroughput: 1.2, magicControl: .8 }], ['spellAccuracy', 30, { magicControl: 1.5, concentration: 1 }], ['controlPower', 0, { magicControl: 1, channelStability: .5 }], ['mentalResistance', 0, { courage: 1, selfControl: .8 }], ['perception', 0, { observation: .5, vision: .25, hearing: .25 }], ['memoryPower', 0, { memory: 1, intelligence: .3 }], ['concentrationPower', 0, { concentration: 1, selfControl: .4 }], ['energyRegeneration', 0, { energyRecovery: .08, channelStability: .02 }], ['painTolerance', 0, { constitution: .5, courage: .5 }], ['stealthBonus', 0, { agility: .4, coordination: .4, selfControl: .2 }], ['healingRate', 0, { constitution: .02, energyRecovery: .01 }], ['carryingCapacity', 0, { strength: 3, constitution: 2 }],
    ];
    return rows.map(([parameter, base, weights]) => ({ parameter, base, weights: Object.fromEntries(attrKeys.map(k => [k, weights[k] ?? 0])), adjustment: 0, mode: 'formula' }));
};
export function developmentError(actor) {
    const cap = attributeCap(actor.profile);
    if (attrKeys.some(k => effectiveAttribute(actor, k) > cap))
        return 'Превышен предел атрибутов выбранного ранга и ступени.';
    const points = Object.values(actor.creation.specialization).reduce((sum, n) => sum + n, 0);
    if (points > rankIndex(actor.profile) * balance.specializationPerRank)
        return 'Превышен бюджет специализации.';
    return '';
}
export function abilityLimits(profile) { const level = progressionLevel(profile); return { power: 20 + level * 8, range: 20 + level * 4, duration: 60 + level * 30 }; }
export function abilityDiagnostics(actor, a) {
    const reasons = [], energy = actor.profile.energy ?? 'mana', other = energy === 'mana' ? 'shadow' : 'mana';
    if (a.cost[other] > 0 || a.upkeep[other] > 0)
        reasons.push('Нужен другой тип энергии: ' + (other === 'mana' ? 'Мана' : 'Тень') + '.');
    if (progressionLevel(actor.profile) < (a.minimumLevel ?? 0))
        reasons.push('Не достигнуто развитие: ' + developmentLabel(a.minimumLevel ?? 0) + '.');
    if (a.schoolId && !a.innate) {
        const limits = abilityLimits(actor.profile), school = schoolById(a.schoolId), base = castingSchool(a.schoolId, a.basisSchoolId), baseSchool = schoolById(base);
        if (a.strength > limits.power)
            reasons.push('Сила ' + a.strength + ' превышает предел ' + limits.power + '.');
        if (a.rangeM > limits.range)
            reasons.push('Дальность ' + a.rangeM + ' м превышает предел ' + limits.range + ' м.');
        if (a.duration > limits.duration)
            reasons.push('Длительность ' + a.duration + ' с превышает предел ' + limits.duration + ' с.');
        if (baseSchool?.group === 'shadow' && energy !== 'shadow')
            reasons.push('Теневая школа требует Тень.');
        if (baseSchool?.group !== 'shadow' && energy === 'shadow')
            reasons.push('Эта школа требует Ману.');
        if (school?.group === 'extended' && !branchParents[a.schoolId] && !a.basisSchoolId && !actor.profile.magic?.some(s => s.schoolId === base && s.state === 'mastered'))
            reasons.push('Выбери освоенную школу-основу техники.');
        const study = actor.profile.magic?.find(s => s.schoolId === base);
        if (study?.state !== 'mastered')
            reasons.push('Школа ' + (baseSchool?.name ?? base) + ' ещё не освоена' + (study ? ' (сейчас: ' + magicStudyStates.find(s => s.id === study.state)?.label + ')' : '') + '.');
    }
    if (a.innate && a.raceId && canonicalRaceId(a.raceId) !== canonicalRaceId(actor.creation.raceId))
        reasons.push('Врождённая способность другой расы.');
    for (const [key, needed] of Object.entries(a.attributeRequirements ?? {})) {
        const current = effectiveAttribute(actor, key);
        if (current < needed)
            reasons.push('Атрибут ' + (attributeFields.find(f => f.key === key)?.label ?? key) + ': ' + current + ' / требуется ' + needed + '.');
    }
    return reasons;
}
export function abilityLimit(actor, a) { return abilityDiagnostics(actor, a)[0] ?? ''; }
export const artifactQualities = Array.from({ length: 12 }, (_, i) => ({ level: i + 1, label: 'Уровень ' + (i + 1), mastery: 5 + i * 8, minimumLevel: i * 4 }));
export function artifactCompatibility(actor, item) {
    if (!item.artifactLevel)
        return { ok: true, risk: 'Обычное снаряжение' };
    const gap = Math.max(item.minimumLevel ?? 0, (artifactQualities[item.artifactLevel - 1]?.minimumLevel ?? 49)) - progressionLevel(actor.profile);
    if (gap <= 0)
        return { ok: true, risk: 'Совместим' };
    return { ok: false, risk: gap <= 3 ? 'Перегрузка: возможны ожоги. Использование запрещено.' : 'Критическая несовместимость: риск аннигиляции. Использование запрещено.' };
}
