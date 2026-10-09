import { isCampaign, emptyCampaign } from './rpgSchema.mjs';
import { isCharacterDraft, isRecord, isSavedCharacter, normalizeCharacterDraft, } from './characterModel.mjs';
export const STORAGE_KEY = 'world6.characters.v2';
export const LEGACY_KEY = 'world6.character.v1';
function hasUniqueIds(characters) {
    return new Set(characters.map(character => character.id)).size === characters.length;
}
export function blockedLoad() {
    return {
        characters: [],
        message: 'Не удалось прочитать сохранение. Запись заблокирована, ' +
            'чтобы не перезаписать исходные данные.',
        blocked: true,
    };
}
export function readCharacters(storage) {
    try {
        const saved = storage.getItem(STORAGE_KEY);
        if (saved !== null) {
            const parsed = JSON.parse(saved);
            if (!isRecord(parsed) || parsed.version !== 2 ||
                !Array.isArray(parsed.characters))
                throw new Error('Неверный формат.');
            const characters = parsed.characters;
            if (!characters.every(isSavedCharacter) || !hasUniqueIds(characters)) {
                throw new Error('Неверные персонажи.');
            }
            if (parsed.campaign !== undefined && !isCampaign(parsed.campaign))
                throw new Error('Некорректная кампания.');
            return { characters, campaign: parsed.campaign === undefined ? emptyCampaign() : structuredClone(parsed.campaign), message: 'Список персонажей загружен.', blocked: false };
        }
        const legacy = storage.getItem(LEGACY_KEY);
        if (legacy === null)
            return { characters: [], message: '', blocked: false };
        const parsed = JSON.parse(legacy);
        if (!isRecord(parsed) || parsed.version !== 1 || !isCharacterDraft(parsed)) {
            throw new Error('Неверный формат прежнего сохранения.');
        }
        const draft = {
            name: parsed.name.trim(),
            attributes: { ...parsed.attributes },
            ...(parsed.resources !== undefined ? { resources: parsed.resources } : {}),
            ...(parsed.statistics !== undefined ? { statistics: { ...parsed.statistics } } : {}),
            ...(parsed.profile !== undefined ? { profile: { ...parsed.profile } } : {}),
            ...(parsed.journal !== undefined ? { journal: parsed.journal } : {}),
            ...(parsed.rpg !== undefined ? { rpg: parsed.rpg } : {}),
            ...(parsed.body !== undefined ? { body: parsed.body } : {}),
            ...(parsed.knownEffects !== undefined ? { knownEffects: parsed.knownEffects } : {}),
        };
        return {
            characters: [{ ...normalizeCharacterDraft(draft), id: 'legacy-character' }],
            message: 'Прежний персонаж загружен. Сохрани его для записи нового формата.',
            blocked: false,
        };
    }
    catch {
        return blockedLoad();
    }
}
export function writeCharacters(storage, characters, campaign) {
    if (!characters.every(isSavedCharacter) || !hasUniqueIds(characters)) {
        throw new Error('Неверный список персонажей.');
    }
    if (campaign !== undefined && !isCampaign(campaign))
        throw new Error('Некорректная кампания.');
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, characters, ...(campaign ? { campaign } : {}) }));
}
