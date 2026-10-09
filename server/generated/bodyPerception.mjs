import { bodyRegionDefs, bodyConsequences } from './characterBody.mjs';
export function perceivedBody(body) {
    return bodyRegionDefs(body).flatMap(region => {
        const part = body.parts[region.key];
        if (!part.present)
            return [];
        const structures = (body.anatomy?.structures ?? []).filter(s => s.region === region.key);
        const injured = structures.filter(s => s.current < s.maximum || s.injuries.length || s.activeBleeding);
        const hasSymptoms = part.current < part.maximum || part.wound || part.bleeding || part.bleedingMlPerSecond || part.injuries?.length || injured.length;
        if (!hasSymptoms)
            return [];
        const severity = Math.max(part.maximum ? 1 - part.current / part.maximum : 0, ...injured.map(s => 1 - s.current / s.maximum));
        const externallyBleeding = !part.internalBleeding && !!(part.bleedingMlPerSecond || part.bleeding) || structures.some(s => s.kind === 'skin' && (s.activeBleeding ?? 0) > 0);
        const symptoms = [];
        if (part.current === 0 && part.maximum > 0)
            symptoms.push('Не удаётся пользоваться этой частью тела.');
        else
            symptoms.push(severity >= .5 ? 'Сильная боль; движение этой области затруднено.' : 'Болезненность при движении или прикосновении.');
        if (injured.some(s => s.id.endsWith('-wing-nerve') || s.functionGroup === 'speech'))
            symptoms.push('Движения или чувствительность этой области нарушены.');
        if (externallyBleeding)
            symptoms.push('Ощущается влажность, видна кровь.');
        const diagnoses = structures.flatMap(s => s.injuries.filter(i => i.diagnosed).map(i => s.name + ': ' + i.label));
        return [{ region: region.key, label: region.label, symptoms, diagnoses }];
    });
}
export function injuryModifiers(body) {
    const loss = Math.max(0, ...Object.values(body.parts).filter(p => p.present && p.maximum > 0).map(p => 1 - p.current / p.maximum), ...(body.anatomy?.structures ?? []).filter(s => body.parts[s.region]?.present).map(s => 1 - s.current / s.maximum));
    if (!loss)
        return [];
    const pain = Math.round(loss * 25 * 100) / 100;
    return [{ parameter: 'concentrationPower', flat: 0, percent: -pain }, { parameter: 'physicalAccuracy', flat: 0, percent: -pain * .6 }, { parameter: 'spellAccuracy', flat: 0, percent: -pain * .6 }];
}
export function perceivedCapabilities(body) {
    const c = bodyConsequences(body), notices = [];
    if (!c.leftHand)
        notices.push('Левой рукой сейчас нельзя пользоваться.');
    if (!c.rightHand)
        notices.push('Правой рукой сейчас нельзя пользоваться.');
    if (c.movementFactor < 1)
        notices.push('Передвижение затруднено.');
    if (c.hasWings)
        notices.push(c.canFly ? (c.flightFactor < 1 ? 'Взмахи слабее, полёт затруднён.' : 'Крылья работают; полёт доступен.') : 'Не удаётся выполнить взлёт или удержать полёт.');
    return notices;
}
