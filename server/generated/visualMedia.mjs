import { expandedAssets, expandedArtwork } from './expandedArtwork.mjs';
import { magicArtwork } from './magicArtwork.mjs';
import { schoolById } from './magicCatalog.mjs';
export const visualArtwork = {
    ...expandedArtwork,
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
    'pixel-guide': new URL('./assets/starter/portrait-guide.svg', import.meta.url).href,
    'pixel-keeper': new URL('./assets/starter/portrait-keeper.svg', import.meta.url).href,
    'pixel-watcher': new URL('./assets/starter/portrait-watcher.svg', import.meta.url).href,
    'pixel-staff': new URL('./assets/starter/item-staff.svg', import.meta.url).href,
    'pixel-lantern': new URL('./assets/starter/item-lantern.svg', import.meta.url).href,
    'pixel-ration': new URL('./assets/starter/item-ration.svg', import.meta.url).href,
    'pixel-focus': new URL('./assets/starter/effect-focus.svg', import.meta.url).href,
    'pixel-ground-stone': new URL('./assets/starter/ground-stone.svg', import.meta.url).href,
    'pixel-ground-yard': new URL('./assets/starter/ground-yard.svg', import.meta.url).href,
    'pixel-gallery': new URL('./assets/starter/gallery.svg', import.meta.url).href,
};
export const artworkLabels = { ...Object.fromEntries(expandedAssets.map(a => [a.id, a.label])), stone: 'Камень', 'portrait-traveler': 'Путник', 'portrait-mage': 'Учёная маг', 'portrait-elf': 'Эльфийский следопыт', weapons: 'Оружие', armor: 'Броня', artifact: 'Артефакт', supplies: 'Расходники', banner: 'Грани Бытия', 'body-front': 'Фигура спереди', 'body-back': 'Фигура сзади',
    'pixel-guide': 'Проводник · пиксели', 'pixel-keeper': 'Кладовщица · пиксели', 'pixel-watcher': 'Наблюдатель · пиксели',
    'pixel-staff': 'Посох · пиксели', 'pixel-lantern': 'Фонарь · пиксели', 'pixel-ration': 'Припас · пиксели', 'pixel-focus': 'Сосредоточение · пиксели',
    'pixel-ground-stone': 'Тёмный камень', 'pixel-ground-yard': 'Неоновый двор', 'pixel-gallery': 'Боковая галерея' };
export const portraitPresets = ['pixel-guide', 'pixel-keeper', 'pixel-watcher', 'portrait-traveler', 'portrait-mage', 'portrait-elf', ...expandedAssets.filter(a => a.category === 'portrait' || a.category === 'creature').map(a => a.id)];
export const itemPresets = ['pixel-staff', 'pixel-lantern', 'pixel-ration', 'weapons', 'armor', 'artifact', 'supplies', ...expandedAssets.filter(a => a.category === 'item').map(a => a.id)];
export const sceneBackgroundPresets = ['pixel-ground-stone', 'pixel-ground-yard', 'pixel-gallery', ...expandedAssets.filter(a => a.category === 'background').map(a => a.id)];
export const effectPresets = ['pixel-focus', 'stone', 'artifact', 'supplies'];
export const objectPresets = expandedAssets.filter(a => a.category === 'object').map(a => a.id);
export const artworkCategoryLabels = { portrait: 'Персонажи', creature: 'Существа', item: 'Предметы', object: 'Окружение', background: 'Поверхности и фоны', effect: 'Эффекты', legacy: 'Стартовый набор' };
export const artworkMetadata = Object.fromEntries(expandedAssets.map(a => [a.id, a]));
export function isTiledArtwork(value) { return typeof value === 'string' && artworkMetadata[value]?.category === 'background' && artworkMetadata[value].tags.some(tag => tag === 'повторяемая' || tag === 'тайл'); }
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
