import { isArtwork } from './visualMedia.mjs';
import { copyMagicStudies, isMagicStudyList } from './magicCatalog.mjs';
export const rankOptions = [
    { key: 'mortal', label: 'Смертный' },
    { key: 'spellcaster', label: 'Заклинатель' },
    { key: 'elementalist', label: 'Элементалист' },
    { key: 'heavenlyLord', label: 'Небесный лорд' },
    { key: 'heavenlyMonarch', label: 'Небесный монарх' },
];
export const energyOptions = [
    { key: 'mana', label: 'Мана' },
    { key: 'shadow', label: 'Тень' },
];
export const advancementOptions = [
    { key: 'ascension', label: 'Вознесение' },
    { key: 'rupture', label: 'Разрывник' },
];
export function progressionSteps(rank) {
    if (rank === 'mortal')
        return 3;
    if (rank === 'elementalist' || rank === 'spellcaster')
        return 3;
    return 10;
}
export const elementOptions = [
    { key: 'vegetation', label: 'Растительность' },
    { key: 'fire', label: 'Огонь' },
    { key: 'earth', label: 'Земля' },
    { key: 'metal', label: 'Металл' },
    { key: 'water', label: 'Вода' },
    { key: 'blood', label: 'Кровь' },
    { key: 'wind', label: 'Ветер' },
];
export function emptyProfile() {
    return { rank: '', rankStep: 1, energy: 'mana', advancement: '', emperor: false, concept: '', element: '', origin: '', biography: '', magic: [] };
}
const legacyRankMap = {
    magister: 'heavenlyLord', archmage: 'heavenlyMonarch', ascended: 'heavenlyMonarch', conceptBearer: 'heavenlyMonarch',
};
export function normalizeRank(value) {
    if (typeof value !== 'string')
        return '';
    if (rankOptions.some(option => option.key === value))
        return value;
    return legacyRankMap[value] ?? '';
}
export function isCharacterProfile(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const profile = value;
    const rank = normalizeRank(profile.rank);
    const step = profile.rankStep;
    return (profile.portrait === undefined || isArtwork(profile.portrait)) && (profile.rank === '' || rank !== '') &&
        (step === undefined || typeof step === 'number' && Number.isSafeInteger(step) && step >= 1 && step <= (rank ? progressionSteps(rank) : 10)) &&
        (profile.energy === undefined || energyOptions.some(option => option.key === profile.energy)) &&
        (profile.advancement === undefined || profile.advancement === '' || advancementOptions.some(option => option.key === profile.advancement)) &&
        (profile.emperor === undefined || typeof profile.emperor === 'boolean') &&
        (profile.concept === undefined || typeof profile.concept === 'string' && profile.concept.length <= 160) &&
        (profile.element === '' || elementOptions.some(option => option.key === profile.element)) &&
        typeof profile.origin === 'string' && profile.origin.length <= 200 &&
        typeof profile.biography === 'string' && profile.biography.length <= 4000 &&
        (profile.magic === undefined || isMagicStudyList(profile.magic));
}
export function profileSummary(profile) {
    const rank = rankOptions.find(option => option.key === profile.rank)?.label ?? 'Ступень не задана';
    const step = profile.rankStep ? ' · ступень ' + profile.rankStep : '';
    const energy = energyOptions.find(option => option.key === (profile.energy ?? 'mana'))?.label ?? 'Мана';
    const path = advancementOptions.find(option => option.key === profile.advancement)?.label;
    return rank + step + ' · ' + energy + (path ? ' · ' + path : '') + (profile.emperor ? ' · Император' : '');
}
export function copyProfile(profile = emptyProfile()) {
    const rank = normalizeRank(profile.rank);
    const legacyPath = profile.rank === 'ascended' ? 'ascension' : '';
    const defaultStep = rank ? 1 : undefined;
    return {
        ...(profile.portrait !== undefined ? { portrait: profile.portrait } : {}), rank,
        rankStep: profile.rankStep ?? defaultStep,
        energy: profile.energy ?? 'mana',
        advancement: profile.advancement ?? legacyPath,
        emperor: profile.emperor ?? false,
        concept: profile.concept ?? '',
        element: profile.element, origin: profile.origin, biography: profile.biography,
        magic: copyMagicStudies(profile.magic),
    };
}
