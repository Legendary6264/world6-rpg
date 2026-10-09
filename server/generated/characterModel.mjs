import { applyRace } from './characterPresets.mjs';
import { defaultCreation, developmentError, copyCreation, isCreation, standardFormulas } from './creationRules.mjs';
import { evaluatedParameters } from './rpgParameters.mjs';
import { copyRpg, isRpg } from './rpgSchema.mjs';
import { cloneBody, isBodyState } from './characterBody.mjs';
import { createDefaultStatistics, isCharacterStatistics, normalizeStatistics, } from './characterStatistics.mjs';
import { emptyProfile, isCharacterProfile, copyProfile } from './characterProfile.mjs';
import { isJournal, isKnownEffects } from './characterKnowledge.mjs';
import { attributeFields, legacyAttributeKeys, defaultAttributes } from './attributes.mjs';
export { attributeFields } from './attributes.mjs';
export const resourceFields = [
    { key: 'health', label: 'Здоровье' },
    { key: 'mana', label: 'Мана' },
    { key: 'shadow', label: 'Тень' },
    { key: 'stamina', label: 'Выносливость' },
];
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isValidAttribute(value) {
    const number = Number(value);
    return value.trim() !== '' && Number.isSafeInteger(number) && number >= 0;
}
export function isValidResource(resource) {
    const valid = (v) => v.trim() !== '' && /^\d+(?:\.\d+)?$/.test(v) && Number.isFinite(Number(v)) && Number(v) <= 1e12;
    return valid(resource.current) &&
        valid(resource.maximum) &&
        Number(resource.current) <= Number(resource.maximum);
}
export function isValidAmount(value) {
    return /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0 && Number(value) <= 1e12;
}
function isResources(value, allowEffectiveMaximum = false) {
    if (!isRecord(value))
        return false;
    return resourceFields.every(field => {
        const resource = value[field.key];
        if (field.key === 'stamina' && resource === undefined)
            return true;
        return isRecord(resource) &&
            typeof resource.current === 'string' &&
            typeof resource.maximum === 'string' &&
            (allowEffectiveMaximum ? isValidResource({ current: '0', maximum: resource.current }) && isValidResource({ current: '0', maximum: resource.maximum }) : isValidResource({ current: resource.current, maximum: resource.maximum }));
    });
}
export function isCharacterDraft(value) {
    if (!isRecord(value))
        return false;
    if (typeof value.name !== 'string' || value.name.trim().length === 0 ||
        value.name.length > 40 || !isRecord(value.attributes))
        return false;
    const attributes = value.attributes;
    const valid = attributeFields.every(field => {
        const attribute = attributes[field.key];
        return attribute === undefined && !legacyAttributeKeys.some(k => k === field.key) || typeof attribute === 'string' && isValidAttribute(attribute);
    }) && (value.resources === undefined || isResources(value.resources, value.rpg !== undefined)) &&
        (value.statistics === undefined || isCharacterStatistics(value.statistics)) &&
        (value.profile === undefined || isCharacterProfile(value.profile)) &&
        (value.journal === undefined || isJournal(value.journal)) &&
        (value.knownEffects === undefined || isKnownEffects(value.knownEffects)) &&
        (value.creation === undefined || isCreation(value.creation)) &&
        (value.body === undefined || isBodyState(value.body)) &&
        (value.rpg === undefined || isRpg(value.rpg));
    if (!valid)
        return false;
    if (value.creation !== undefined && developmentError(normalizeCharacterDraft(value)))
        return false;
    if (value.rpg === undefined)
        return true;
    try {
        evaluatedParameters(normalizeCharacterDraft(value), 0);
        return true;
    }
    catch {
        return false;
    }
}
export function isSavedCharacter(value) {
    return isRecord(value) && typeof value.id === 'string' &&
        value.id.trim().length > 0 && isCharacterDraft(value);
}
export function createDefaultResources() {
    // Это незаполненный лист, а не утверждённые стартовые значения по лору.
    return {
        health: { current: '0', maximum: '0' },
        mana: { current: '0', maximum: '0' },
        shadow: { current: '0', maximum: '0' },
        stamina: { current: '0', maximum: '0' },
    };
}
export function createDefaultCharacter() {
    const character = applyRace({
        name: '',
        attributes: defaultAttributes(),
        resources: createDefaultResources(),
        statistics: createDefaultStatistics(),
        profile: { ...emptyProfile(), rank: 'spellcaster' },
        journal: [],
        creation: defaultCreation(),
        rpg: { ...copyRpg(), formulas: standardFormulas() },
        body: cloneBody(),
        knownEffects: [],
    }, 'human', 'base', true);
    const parameters = evaluatedParameters(character, 0);
    for (const [key, max] of [['mana', parameters.maximumMana], ['shadow', parameters.maximumShadow], ['stamina', parameters.maximumStamina]])
        character.resources[key] = { current: max, maximum: max };
    return character;
}
export function normalizeCharacterDraft(draft) {
    const resources = draft.resources ?? createDefaultResources();
    const profile = copyProfile({ ...emptyProfile(), ...draft.profile, energy: draft.profile?.energy ?? (Number(resources.shadow.maximum) > 0 && Number(resources.mana.maximum) === 0 ? 'shadow' : 'mana') });
    const rpg = copyRpg(draft.rpg);
    if (rpg.physiology.mode === 'mana' || rpg.physiology.mode === 'shadow')
        rpg.physiology.mode = profile.energy ?? 'mana';
    // Каждый лист получает собственные вложенные объекты.
    return {
        ...draft,
        creation: copyCreation(draft.creation),
        attributes: { ...defaultAttributes(), ...draft.attributes },
        resources: {
            ...resources,
            health: { current: '0', maximum: '0' },
            mana: (profile.energy) === 'mana' ? { ...resources.mana } : { current: '0', maximum: '0' },
            shadow: (profile.energy) === 'shadow' ? { ...resources.shadow } : { current: '0', maximum: '0' },
            stamina: { ...(resources.stamina ?? { current: '0', maximum: '0' }) },
        },
        statistics: normalizeStatistics(draft.statistics),
        // Старому герою ступень и стихия автоматически не назначаются.
        profile,
        journal: (draft.journal ?? []).map(entry => ({ ...entry })),
        rpg,
        body: cloneBody(draft.body),
        knownEffects: (draft.knownEffects ?? []).map(effect => ({ ...effect })),
    };
}
export function calculateResourceAction(key, resource, amountValue, direction) {
    if (!isValidResource(resource)) {
        return { ok: false, message: 'Проверь текущее значение и максимум ресурса.' };
    }
    if (!isValidAmount(amountValue)) {
        return { ok: false, message: 'Введи положительное количество.' };
    }
    const current = Number(resource.current);
    const maximum = Number(resource.maximum);
    const amount = Number(amountValue);
    let next;
    let message;
    if (direction === 'decrease') {
        if (key !== 'health' && amount > current) {
            return {
                ok: false,
                message: 'Не хватает ' +
                    (key === 'mana' ? 'Маны' : key === 'shadow' ? 'Тени' : 'Выносливости') +
                    ': доступно ' + current + ', требуется ' + amount + '.',
            };
        }
        next = Math.max(0, current - amount);
        const spent = current - next;
        message = spent === 0 ? 'Здоровье уже на нуле.' :
            (key === 'health' ? 'Здоровье уменьшено на ' : 'Потрачено: ') + spent + '.';
    }
    else {
        // Сначала ограничиваем прибавку: сумма не выйдет за безопасный максимум.
        const restored = Math.min(amount, maximum - current);
        next = current + restored;
        message = restored === 0 ? 'Уже достигнут максимум.' :
            'Восстановлено: ' + restored + '.';
    }
    return {
        ok: true,
        resource: { ...resource, current: String(Math.round(next * 1e6) / 1e6) },
        changed: next !== current,
        message,
    };
}
