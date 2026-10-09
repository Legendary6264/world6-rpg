import { copyProfile } from './characterProfile.mjs';
import { copyRpg, isCampaign, copyCampaign } from './rpgSchema.mjs';
import { cloneBody } from './characterBody.mjs';
import { attributeFields, isCharacterDraft, isRecord, isSavedCharacter, normalizeCharacterDraft, resourceFields, } from './characterModel.mjs';
import { statisticFields } from './characterStatistics.mjs';
import { isTimestamp } from './characterKnowledge.mjs';
export const ARCHIVE_FORMAT = 'world6-character-archive';
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_ARCHIVE_CHARACTERS = 200;
// Обмен переносит только поля формата игрока. Неизвестные свойства не копируются.
export function portableCharacter(character) {
    const draft = normalizeCharacterDraft(character);
    return {
        name: draft.name.trim(),
        attributes: Object.fromEntries(attributeFields.map(field => [field.key, draft.attributes[field.key]])),
        resources: Object.fromEntries(resourceFields.map(field => [field.key, {
                current: draft.resources[field.key].current,
                maximum: draft.resources[field.key].maximum,
            }])),
        statistics: Object.fromEntries(statisticFields.map(field => [field.key, draft.statistics[field.key]])),
        creation: structuredClone(draft.creation),
        profile: copyProfile(draft.profile),
        journal: draft.journal.map(entry => ({
            ...(entry.artwork !== undefined ? { artwork: entry.artwork } : {}),
            id: entry.id, title: entry.title, text: entry.text, category: entry.category,
            certainty: entry.certainty, source: entry.source, gameTime: entry.gameTime,
            origin: entry.origin, annotation: entry.annotation,
            ...(entry.origin === 'automatic' ? { eventKey: entry.eventKey } : {}),
            createdAt: entry.createdAt, updatedAt: entry.updatedAt,
        })),
        rpg: copyRpg(draft.rpg),
        body: cloneBody(draft.body),
        knownEffects: draft.knownEffects.map(effect => ({
            id: effect.id, title: effect.title, description: effect.description,
            perception: effect.perception, kind: effect.kind, source: effect.source,
            gameTime: effect.gameTime, duration: effect.duration, status: effect.status,
            createdAt: effect.createdAt, updatedAt: effect.updatedAt,
        })),
    };
}
export function parseCharacterArchive(text) {
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
        return { ok: false, message: 'Файл больше 10 МиБ. Экспортируй героев отдельными файлами.' };
    }
    let parsed;
    try {
        parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
    }
    catch {
        return { ok: false, message: 'Файл не содержит корректный JSON.' };
    }
    if (!isRecord(parsed))
        return { ok: false, message: 'Не удалось распознать архив персонажей.' };
    let candidates;
    let sourceLabel;
    let needsId = true;
    if (parsed.format !== undefined) {
        if (parsed.format !== ARCHIVE_FORMAT || parsed.version !== 1 ||
            !isTimestamp(parsed.exportedAt) || !Array.isArray(parsed.characters)) {
            return { ok: false, message: 'Неизвестный формат или версия архива. Нужен архив Мира 6, версия 1.' };
        }
        candidates = parsed.characters;
        sourceLabel = 'Архив персонажей Мира 6';
    }
    else if (parsed.version === 2 && Array.isArray(parsed.characters)) {
        candidates = parsed.characters;
        sourceLabel = 'Прежний список персонажей v2';
    }
    else if (parsed.version === 1 && isCharacterDraft(parsed)) {
        candidates = [parsed];
        sourceLabel = 'Прежний персонаж v1';
        needsId = false;
    }
    else {
        return { ok: false, message: 'Поддерживаются архив Мира 6 и прежние сохранения v1/v2.' };
    }
    if (candidates.length === 0 || candidates.length > MAX_ARCHIVE_CHARACTERS) {
        return { ok: false, message: 'В одном файле должно быть от 1 до 200 персонажей.' };
    }
    const characters = [];
    const ids = new Set();
    for (const [index, candidate] of candidates.entries()) {
        if (!isCharacterDraft(candidate) || (needsId && !isSavedCharacter(candidate))) {
            return { ok: false, message: 'Персонаж №' + (index + 1) +
                    ': некорректное имя, характеристики, профиль, записи или эффекты. Ничего не добавлено.' };
        }
        if (needsId && isSavedCharacter(candidate)) {
            if (ids.has(candidate.id))
                return { ok: false, message: 'В файле повторяются идентификаторы персонажей.' };
            ids.add(candidate.id);
        }
        characters.push(portableCharacter(candidate));
    }
    const campaignValue = parsed.campaign;
    if (campaignValue !== undefined && !isCampaign(campaignValue))
        return { ok: false, message: 'Некорректные часы или каталог кампании.' };
    return { ok: true, preview: { characters, sourceLabel, ...(campaignValue !== undefined ? { campaign: copyCampaign(campaignValue) } : {}) } };
}
export function createCharacterArchive(characters, at, campaign) {
    if (!isTimestamp(at) || characters.length === 0 || characters.length > MAX_ARCHIVE_CHARACTERS ||
        !characters.every(isSavedCharacter) ||
        new Set(characters.map(character => character.id)).size !== characters.length) {
        throw new Error('Проверь персонажей перед экспортом. В одном архиве — от 1 до 200 героев.');
    }
    if (campaign !== undefined && !isCampaign(campaign))
        throw new Error('Некорректная кампания.');
    const text = JSON.stringify({
        format: ARCHIVE_FORMAT, version: 1, exportedAt: at, ...(campaign ? { campaign: copyCampaign(campaign) } : {}),
        characters: characters.map(character => ({ ...portableCharacter(character), id: character.id })),
    }, null, 2);
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
        throw new Error('Архив больше 10 МиБ. Экспортируй героев отдельными файлами.');
    }
    return text;
}
// Импорт всегда создаёт независимые копии; исходные id из файла не заменяют героев.
export function addImportedCharacters(existing, imported, makeId) {
    if (!imported.length || imported.length > MAX_ARCHIVE_CHARACTERS ||
        !imported.every(isCharacterDraft))
        throw new Error('Неверный набор для импорта.');
    const usedIds = new Set(existing.map(character => character.id));
    const added = imported.map(draft => {
        const id = makeId();
        if (!id.trim() || usedIds.has(id))
            throw new Error('Не удалось создать новый идентификатор. Повтори импорт.');
        usedIds.add(id);
        return { ...portableCharacter(draft), id };
    });
    return [...existing, ...added];
}
export function downloadJson(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    try {
        link.click();
    }
    finally {
        link.remove();
        // Небольшая отсрочка позволяет браузеру начать чтение файла для скачивания.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
