import { magicArtwork } from './magicArtwork.mjs';
import { schoolById } from './magicCatalog.mjs';
export const visualArtwork = {
    stone: new URL('./assets/atlas/stone.webp', import.meta.url).href,
    'portrait-traveler': new URL('./assets/atlas/portrait-traveler.webp', import.meta.url).href,
    'portrait-mage': new URL('./assets/atlas/portrait-mage.webp', import.meta.url).href,
    'portrait-elf': new URL('./assets/atlas/portrait-elf.webp', import.meta.url).href,
    weapons: new URL('./assets/atlas/weapons.webp', import.meta.url).href,
    armor: new URL('./assets/atlas/armor.webp', import.meta.url).href,
    artifact: new URL('./assets/atlas/artifact.webp', import.meta.url).href,
    supplies: new URL('./assets/atlas/supplies.webp', import.meta.url).href,
    banner: new URL('./assets/atlas/atlas-banner.webp', import.meta.url).href,
    'body-front': new URL('./assets/atlas/body-front.webp', import.meta.url).href,
    'body-back': new URL('./assets/atlas/body-back.webp', import.meta.url).href,
};
export const artworkLabels = { stone: 'Камень', 'portrait-traveler': 'Путник', 'portrait-mage': 'Учёная маг', 'portrait-elf': 'Эльфийский следопыт', weapons: 'Оружие', armor: 'Броня', artifact: 'Артефакт', supplies: 'Расходники', banner: 'Мир 6', 'body-front': 'Фигура спереди', 'body-back': 'Фигура сзади' };
export const portraitPresets = ['portrait-traveler', 'portrait-mage', 'portrait-elf'];
export const itemPresets = ['weapons', 'armor', 'artifact', 'supplies'];
export const MAX_ARTWORK_LENGTH = 120000;
export function isArtwork(v) { return typeof v === 'string' && (v === 'auto' || Object.hasOwn(visualArtwork, v) || v.length <= MAX_ARTWORK_LENGTH && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)); }
export function artworkSource(value, fallback = 'artifact') {
    return value && value !== 'auto' && isArtwork(value) ? (Object.hasOwn(visualArtwork, value) ? visualArtwork[value] : value) : visualArtwork[fallback];
}
export function itemArtworkKind(i) {
    if (i.slot === 'body')
        return 'armor';
    const tags = i.tags.join(' ') + ' ' + i.name;
    if (/зелье|бинт|трав|расход|potion|consumable/i.test(tags))
        return 'supplies';
    if (/артефакт|магич|посох|artifact|magic/i.test(tags))
        return 'artifact';
    return ['left', 'right', 'both'].includes(i.slot) ? 'weapons' : 'supplies';
}
export function abilityArtwork(a) {
    const school = schoolById(a.schoolId ?? '');
    if (a.mechanism === 'stone')
        return visualArtwork.stone;
    if (school)
        return magicArtwork[school.group];
    if (['heal', 'blood', 'substitute'].includes(a.mechanism))
        return visualArtwork.supplies;
    if (['stone', 'impact', 'manual'].includes(a.mechanism))
        return visualArtwork.weapons;
    return visualArtwork.artifact;
}
